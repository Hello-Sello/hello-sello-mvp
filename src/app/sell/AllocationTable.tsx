"use client";

/**
 * The Batches allocator (Sell surface, DEV-76/DEV-157) - the seller's
 * permanent work surface for deciding Decline/Substitute/Supply on every
 * open order line, with FIFO batch defaults, batch splitting, live stock
 * bars, and partial confirm/send.
 *
 * Every write goes through Plan 1's seller-gated RPCs (`@/modules/allocate/
 * batchActions`), never a client-side-only "decided" flag: after every
 * action this component calls `router.refresh()` so the row's rendered
 * state (status text, SENT tag, stock bars) always reflects what the DB
 * actually persisted. Local component state ONLY ever holds an
 * IN-PROGRESS, not-yet-submitted edit (a batch pick, a split-in-progress, an
 * open substitute picker) - it is cleared the moment its action commits.
 *
 * The substitute picker's "every OTHER product" is every distinct product
 * already referenced somewhere in this component's own `worklist` prop -
 * this component has no separate full-catalogue prop (by design; see
 * PLAN-3/PLAN-4), and `substitute_line_product` re-verifies server-side that
 * the chosen product belongs to the caller's own catalogue regardless of
 * what this picker lists (T-260707-02), so this is a UX-completeness choice,
 * not a security one.
 */
import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { isKeyAccount } from "@/modules/allocate/status";
import { computeBatchStock, type AllocationRow } from "@/modules/allocate/batches";
import {
  setLineAllocation,
  substituteLine,
  cancelSubstitution,
  confirmAllocations,
} from "@/modules/allocate/batchActions";
import { ArrowUpDown, Filter } from "lucide-react";

type AllocSort = "voltotal" | "margin" | "first" | "custAZ" | "custZA" | "key";
type FilterKey = "type" | "product" | "uvol" | "units";
type OpenMenu = FilterKey | "cust" | null;
type BatchSplit = { batchId: string; grams: number };

const SORT_CHIPS: { key: AllocSort; label: string }[] = [
  { key: "voltotal", label: "Highest Volume" },
  { key: "margin", label: "Highest Margin" },
  { key: "first", label: "First Order" },
  { key: "key", label: "Key Accounts" },
];

const fmtVol = (g: number) => `${g.toLocaleString("de-DE")} g`;
const fmtEur = (n: number) =>
  `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€`;

/** "Key Account" / "Standard Account" per row - a pure derivation from the
 *  worklist's own buyer totals, never a stored tier (matches isKeyAccount's
 *  own derive-don't-store convention). */
function typeLabelOf(
  row: AllocationRow,
  totalsByBuyer: Record<string, number>,
): "Key Account" | "Standard Account" {
  return isKeyAccount(row.buyerCompanyId, totalsByBuyer) ? "Key Account" : "Standard Account";
}

export function AllocationTable({
  worklist,
  selectedProductId,
}: {
  worklist: AllocationRow[];
  selectedProductId: string | null;
}) {
  const router = useRouter();

  const [allocSort, setAllocSort] = useState<AllocSort>("voltotal");
  const [filters, setFilters] = useState<Record<FilterKey, Set<string>>>({
    type: new Set(),
    product: new Set(),
    uvol: new Set(),
    units: new Set(),
  });
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);

  // In-progress, not-yet-submitted edits, keyed by lineItemId. `undefined` =
  // no local override yet (render the server's own row.batchId/batchSplits).
  const [batchOverride, setBatchOverride] = useState<Record<string, string>>({});
  const [splitOverride, setSplitOverride] = useState<Record<string, BatchSplit[] | null | undefined>>({});
  const [subPicking, setSubPicking] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string | undefined>>({});
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const toggleMenu = (key: OpenMenu) => setOpenMenu((cur) => (cur === key ? null : key));

  const toggleFilter = (key: FilterKey, val: string) => {
    setFilters((cur) => {
      const next = new Set(cur[key]);
      if (next.has(val)) next.delete(val);
      else next.add(val);
      return { ...cur, [key]: next };
    });
  };
  const clearFilter = (key: FilterKey) => {
    setFilters((cur) => ({ ...cur, [key]: new Set() }));
    setOpenMenu(null);
  };

  // The buyer's summed value across the WHOLE worklist (not the filtered
  // subset) - a stable ranking signal regardless of which product tile is
  // selected or which filters are active.
  const totalsByBuyer = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const r of worklist) totals[r.buyerCompanyId] = (totals[r.buyerCompanyId] ?? 0) + r.priceTotal;
    return totals;
  }, [worklist]);

  const productOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of worklist) map.set(r.productId, r.productName);
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [worklist]);
  const uvolOptions = useMemo(
    () => Array.from(new Set(worklist.map((r) => r.unitVolGrams))).sort((a, b) => a - b),
    [worklist],
  );
  const unitsOptions = useMemo(
    () => Array.from(new Set(worklist.map((r) => r.unitsOrdered))).sort((a, b) => a - b),
    [worklist],
  );

  const rows = useMemo(() => {
    const filtered = worklist.filter((r) => {
      if (selectedProductId && r.productId !== selectedProductId) return false;
      if (filters.type.size && !filters.type.has(typeLabelOf(r, totalsByBuyer))) return false;
      if (filters.product.size && !filters.product.has(r.productId)) return false;
      if (filters.uvol.size && !filters.uvol.has(String(r.unitVolGrams))) return false;
      if (filters.units.size && !filters.units.has(String(r.unitsOrdered))) return false;
      return true;
    });

    const sorted = [...filtered];
    switch (allocSort) {
      case "voltotal":
        // Default (DEV-157 #8): highest volume total first, tiebreak highest unit vol.
        sorted.sort((a, b) => b.volTotalGrams - a.volTotalGrams || b.unitVolGrams - a.unitVolGrams);
        break;
      case "margin":
        sorted.sort((a, b) => b.pricePerGram - a.pricePerGram);
        break;
      case "first":
        sorted.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
        break;
      case "key":
        sorted.sort(
          (a, b) =>
            Number(typeLabelOf(b, totalsByBuyer) === "Key Account") -
            Number(typeLabelOf(a, totalsByBuyer) === "Key Account"),
        );
        break;
      case "custAZ":
        sorted.sort((a, b) => a.customerName.localeCompare(b.customerName));
        break;
      case "custZA":
        sorted.sort((a, b) => b.customerName.localeCompare(a.customerName));
        break;
    }
    return sorted;
  }, [worklist, selectedProductId, filters, allocSort, totalsByBuyer]);

  // ---- live per-batch stock bars (server truth only — never local overrides) ----
  const stock = useMemo(() => computeBatchStock(worklist), [worklist]);
  const stockBars = useMemo(() => {
    if (selectedProductId) {
      const anyRow = worklist.find((r) => r.productId === selectedProductId);
      return (anyRow?.availableBatches ?? []).map((b) => ({
        id: b.id,
        batchNumber: b.batchNumber,
        allocatedGrams: stock.get(b.id)?.allocatedGrams ?? 0,
        totalGrams: b.quantityGrams,
      }));
    }
    const batchNumberById = new Map(worklist.flatMap((r) => r.availableBatches).map((b) => [b.id, b.batchNumber]));
    return Array.from(stock.entries())
      .filter(([, v]) => v.allocatedGrams > 0)
      .map(([id, v]) => ({
        id,
        batchNumber: batchNumberById.get(id) ?? id,
        allocatedGrams: v.allocatedGrams,
        totalGrams: v.totalGrams,
      }));
  }, [stock, worklist, selectedProductId]);

  // ---- local-edit accessors (server truth, overridden by an in-progress edit) ----
  const currentBatchIdFor = (r: AllocationRow): string | null =>
    batchOverride[r.lineItemId] ?? r.batchId ?? r.availableBatches[0]?.id ?? null;
  const currentSplitsFor = (r: AllocationRow): BatchSplit[] | null => {
    const override = splitOverride[r.lineItemId];
    return override !== undefined ? override : r.batchSplits;
  };

  // ---- committing an action: run it, clear this row's local overrides on
  // success (the refreshed worklist prop becomes the new truth), surface an
  // inline error on failure (Rule 2 — errors must be visible, never silent). ----
  async function runAction(id: string, fn: () => Promise<void>) {
    setBusy(id);
    setRowError((cur) => ({ ...cur, [id]: undefined }));
    try {
      await fn();
      setBatchOverride((cur) => {
        const next = { ...cur };
        delete next[id];
        return next;
      });
      setSplitOverride((cur) => {
        const next = { ...cur };
        delete next[id];
        return next;
      });
      setSubPicking((cur) => {
        const next = { ...cur };
        delete next[id];
        return next;
      });
      router.refresh();
    } catch (err) {
      setRowError((cur) => ({ ...cur, [id]: err instanceof Error ? err.message : "Something went wrong." }));
    } finally {
      setBusy(null);
    }
  }

  const handleDecline = (r: AllocationRow) =>
    runAction(r.lineItemId, () => setLineAllocation(r.lineItemId, "decline"));

  const handleSupply = (r: AllocationRow) => {
    const splits = currentSplitsFor(r);
    const isSplitting = !!splits && splits.length > 0;
    return runAction(r.lineItemId, () =>
      setLineAllocation(
        r.lineItemId,
        "supply",
        isSplitting ? undefined : currentBatchIdFor(r) ?? undefined,
        // Explicit [] when NOT splitting clears any stale server-side splits
        // left over from a previous "undo split" — the RPC treats an empty
        // array as "clear metadata.batchSplits", per Plan 1's migration.
        isSplitting ? splits : [],
      ),
    );
  };

  const toggleSubPick = (r: AllocationRow) => {
    if (r.locked || r.substitutedFromProductId) return;
    setSubPicking((cur) => ({ ...cur, [r.lineItemId]: !cur[r.lineItemId] }));
  };
  const handleSubstitutePick = (r: AllocationRow, newProductId: string) =>
    runAction(r.lineItemId, () => substituteLine(r.lineItemId, newProductId));
  const handleCancelSub = (r: AllocationRow) =>
    runAction(r.lineItemId, () => cancelSubstitution(r.lineItemId));

  const toggleSplit = (r: AllocationRow) => {
    const current = currentSplitsFor(r);
    if (current && current.length > 0) {
      setSplitOverride((cur) => ({ ...cur, [r.lineItemId]: null }));
      return;
    }
    const [first, second] = r.availableBatches;
    if (!first) return;
    setSplitOverride((cur) => ({
      ...cur,
      [r.lineItemId]: [
        { batchId: first.id, grams: r.volTotalGrams },
        { batchId: (second ?? first).id, grams: 0 },
      ],
    }));
  };
  const addSplit = (r: AllocationRow) => {
    const current = currentSplitsFor(r) ?? [];
    const used = new Set(current.map((s) => s.batchId));
    const next = r.availableBatches.find((b) => !used.has(b.id)) ?? r.availableBatches[0];
    if (!next) return;
    setSplitOverride((cur) => ({ ...cur, [r.lineItemId]: [...current, { batchId: next.id, grams: 0 }] }));
  };
  const removeSplit = (r: AllocationRow, index: number) => {
    const current = currentSplitsFor(r) ?? [];
    setSplitOverride((cur) => ({ ...cur, [r.lineItemId]: current.filter((_, i) => i !== index) }));
  };
  const setSplitBatch = (r: AllocationRow, index: number, batchId: string) => {
    const current = currentSplitsFor(r) ?? [];
    setSplitOverride((cur) => ({
      ...cur,
      [r.lineItemId]: current.map((s, i) => (i === index ? { ...s, batchId } : s)),
    }));
  };
  const setSplitGrams = (r: AllocationRow, index: number, grams: number) => {
    const current = currentSplitsFor(r) ?? [];
    const clamped = Math.max(0, Math.round(grams) || 0);
    setSplitOverride((cur) => ({
      ...cur,
      [r.lineItemId]: current.map((s, i) => (i === index ? { ...s, grams: clamped } : s)),
    }));
  };

  // ---- partial CONFIRM & SEND — page-wide (the WHOLE worklist, not the
  // currently filtered/sorted view) per the prototype's own confirmSupply. ----
  const decidedUnlocked = worklist.filter((r) => r.allocationStatus !== "pending" && !r.locked);
  const handleConfirm = async () => {
    if (decidedUnlocked.length === 0) return;
    setBusy("confirm");
    setConfirmError(null);
    try {
      await confirmAllocations(decidedUnlocked.map((r) => r.lineItemId));
      router.refresh();
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="glass rounded-3xl p-5" onClick={() => setOpenMenu(null)}>
      <h2 className="text-[22px] font-extrabold text-ink">Batches</h2>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Sort by</span>
        {SORT_CHIPS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setAllocSort(c.key)}
            className={`rounded-full px-3 py-1 text-[11.5px] font-bold transition-colors ${
              allocSort === c.key ? "bg-brand text-white" : "bg-ink/5 text-ink-muted hover:bg-ink/10"
            }`}
          >
            {c.label}
          </button>
        ))}
        <span className="flex-1" />
        <span className="text-[11px] font-semibold text-ink/40">
          {selectedProductId
            ? `${productOptions.find((p) => p.id === selectedProductId)?.name ?? ""} only`
            : "all products"}
        </span>
      </div>

      {/* live per-batch stock bars — server truth only, fills as rows are marked Supply */}
      <div className="mt-3 flex flex-wrap gap-2">
        {stockBars.length === 0 ? (
          <span className="text-[11px] text-ink/40">
            select a product to see its batch stock — bars fill as you allocate
          </span>
        ) : (
          stockBars.map((b) => {
            const over = b.allocatedGrams > b.totalGrams;
            const pct = b.totalGrams > 0 ? Math.min(100, (b.allocatedGrams / b.totalGrams) * 100) : 0;
            return (
              <div key={b.id} className="min-w-[170px] flex-1 rounded-xl border border-ink/10 bg-white p-2">
                <div className="flex items-center justify-between gap-2 text-[10.5px] font-bold text-ink">
                  <b>{b.batchNumber}</b>
                  <span className="font-mono tabular-nums text-ink-muted">
                    {fmtVol(b.allocatedGrams)} / {fmtVol(b.totalGrams)}
                  </span>
                </div>
                <div className="mt-1 h-[7px] overflow-hidden rounded-full bg-ink/10">
                  <div
                    className={`h-full rounded-full ${over ? "bg-danger" : "bg-brand"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[1200px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink/10">
              <HeaderCell
                label="Customer"
                active={["custAZ", "custZA", "key"].includes(allocSort)}
                open={openMenu === "cust"}
                onToggle={() => toggleMenu("cust")}
                icon={<ArrowUpDown size={11} />}
              >
                <MenuButton
                  onClick={() => {
                    setAllocSort("custAZ");
                    setOpenMenu(null);
                  }}
                >
                  Sort A → Z
                </MenuButton>
                <MenuButton
                  onClick={() => {
                    setAllocSort("custZA");
                    setOpenMenu(null);
                  }}
                >
                  Sort Z → A
                </MenuButton>
                <MenuButton
                  onClick={() => {
                    setAllocSort("key");
                    setOpenMenu(null);
                  }}
                >
                  Top accounts first
                </MenuButton>
                {["custAZ", "custZA", "key"].includes(allocSort) && (
                  <MenuButton
                    onClick={() => {
                      setAllocSort("voltotal");
                      setOpenMenu(null);
                    }}
                  >
                    Clear sort
                  </MenuButton>
                )}
              </HeaderCell>
              <FilterHeaderCell
                label="Type"
                colKey="type"
                options={["Key Account", "Standard Account"]}
                display={(v) => v}
                filters={filters.type}
                openMenu={openMenu}
                onToggleMenu={toggleMenu}
                onToggleFilter={toggleFilter}
                onClearFilter={clearFilter}
              />
              <FilterHeaderCell
                label="Product"
                colKey="product"
                options={productOptions.map((p) => p.id)}
                display={(v) => productOptions.find((p) => p.id === v)?.name ?? v}
                filters={filters.product}
                openMenu={openMenu}
                onToggleMenu={toggleMenu}
                onToggleFilter={toggleFilter}
                onClearFilter={clearFilter}
              />
              <FilterHeaderCell
                label="Units ordered"
                colKey="units"
                options={unitsOptions.map(String)}
                display={(v) => v}
                filters={filters.units}
                openMenu={openMenu}
                onToggleMenu={toggleMenu}
                onToggleFilter={toggleFilter}
                onClearFilter={clearFilter}
              />
              <FilterHeaderCell
                label="Unit vol"
                colKey="uvol"
                options={uvolOptions.map(String)}
                display={(v) => `${v}g`}
                filters={filters.uvol}
                openMenu={openMenu}
                onToggleMenu={toggleMenu}
                onToggleFilter={toggleFilter}
                onClearFilter={clearFilter}
              />
              <Th>Vol total</Th>
              <Th>Price / g</Th>
              <Th>Price total</Th>
              <Th>Batch</Th>
              <Th>Status</Th>
              <Th>Decline / Substitute / Supply</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isBusy = busy === r.lineItemId;
              const isPicking = subPicking[r.lineItemId] ?? false;
              const splits = currentSplitsFor(r);
              const isSplitting = !!splits && splits.length > 0;
              const canSplit = !r.locked && r.availableBatches.length > 1;
              const others = productOptions.filter((p) => p.id !== r.productId);
              const splitSum = splits?.reduce((a, s) => a + s.grams, 0) ?? 0;
              const splitDiff = r.volTotalGrams - splitSum;

              return (
                <tr key={r.lineItemId} className={`border-b border-ink/5 ${r.locked ? "opacity-60" : ""}`}>
                  <td className="px-2 py-2 font-bold text-ink">{r.customerName}</td>
                  <td className="px-2 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                        typeLabelOf(r, totalsByBuyer) === "Key Account"
                          ? "bg-brand/10 text-brand-deep"
                          : "bg-ink/5 text-ink-muted"
                      }`}
                    >
                      {typeLabelOf(r, totalsByBuyer)}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    {isPicking ? (
                      <select
                        autoFocus
                        disabled={isBusy}
                        defaultValue=""
                        onChange={(e) => e.target.value && handleSubstitutePick(r, e.target.value)}
                        className="rounded-lg border border-brand/40 bg-white px-1.5 py-1 text-xs"
                      >
                        <option value="" disabled>
                          → pick a replacement
                        </option>
                        {others.map((p) => (
                          <option key={p.id} value={p.id}>
                            → {p.name}
                          </option>
                        ))}
                      </select>
                    ) : r.substitutedFromProductId ? (
                      <span>
                        <s className="text-ink/40">{r.substitutedFromProductName ?? "previous product"}</s>
                        <br />
                        <span className="font-bold text-success">
                          → {r.productName}
                          <button
                            type="button"
                            title="stop replacing"
                            disabled={isBusy || r.locked}
                            onClick={() => handleCancelSub(r)}
                            className="ml-1 rounded-full px-1 text-[10px] text-ink/50 hover:bg-ink/10 disabled:opacity-40"
                          >
                            ✕
                          </button>
                        </span>
                      </span>
                    ) : (
                      r.productName
                    )}
                  </td>
                  <td className="px-2 py-2 tabular-nums">{r.unitsOrdered}</td>
                  <td className="px-2 py-2 tabular-nums">{r.unitVolGrams}g</td>
                  <td className="px-2 py-2 font-bold tabular-nums">{fmtVol(r.volTotalGrams)}</td>
                  <td className="px-2 py-2 tabular-nums">{r.pricePerGram.toFixed(2)}€/g</td>
                  <td className="px-2 py-2 font-bold tabular-nums">{fmtEur(r.priceTotal)}</td>
                  <td className="px-2 py-2">
                    {!isSplitting ? (
                      <>
                        <select
                          disabled={r.locked || isBusy}
                          value={currentBatchIdFor(r) ?? ""}
                          onChange={(e) =>
                            setBatchOverride((cur) => ({ ...cur, [r.lineItemId]: e.target.value }))
                          }
                          className="rounded-lg border border-ink/15 bg-white px-1.5 py-1 text-xs disabled:opacity-60"
                        >
                          {r.availableBatches.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.batchNumber} · {fmtVol(b.quantityGrams)}
                            </option>
                          ))}
                        </select>
                        {canSplit && (
                          <button
                            type="button"
                            onClick={() => toggleSplit(r)}
                            className="mt-1 block text-[10.5px] font-semibold text-brand-deep hover:underline"
                          >
                            ⑂ split batches
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {(splits ?? []).map((s, i) => (
                          <div key={i} className="flex items-center gap-1">
                            <select
                              disabled={r.locked || isBusy}
                              value={s.batchId}
                              onChange={(e) => setSplitBatch(r, i, e.target.value)}
                              className="max-w-[110px] rounded-lg border border-ink/15 bg-white px-1 py-0.5 text-[11px] disabled:opacity-60"
                            >
                              {r.availableBatches.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.batchNumber}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              disabled={r.locked || isBusy}
                              value={s.grams}
                              onChange={(e) => setSplitGrams(r, i, Number(e.target.value))}
                              className="w-16 rounded-lg border border-ink/15 bg-white px-1 py-0.5 text-[11px] tabular-nums disabled:opacity-60"
                            />
                            g
                            {!r.locked && (splits?.length ?? 0) > 2 && (
                              <button
                                type="button"
                                onClick={() => removeSplit(r, i)}
                                className="text-ink/40 hover:text-danger"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        ))}
                        {!r.locked && (
                          <div className="flex items-center gap-2">
                            {(splits?.length ?? 0) < r.availableBatches.length && (
                              <button
                                type="button"
                                onClick={() => addSplit(r)}
                                className="text-[10.5px] font-semibold text-brand-deep hover:underline"
                              >
                                ＋ batch
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => toggleSplit(r)}
                              className="text-[10.5px] font-semibold text-ink-muted hover:underline"
                            >
                              undo split
                            </button>
                          </div>
                        )}
                        <span
                          className={`text-[10.5px] font-bold ${splitDiff === 0 ? "text-success" : "text-danger"}`}
                        >
                          {splitDiff === 0
                            ? "✓ fully allocated"
                            : splitDiff > 0
                              ? `${fmtVol(splitDiff)} unallocated`
                              : `${fmtVol(-splitDiff)} over`}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2 text-xs font-semibold">
                    {r.locked ? (
                      <>
                        <span className={r.allocationStatus === "decline" ? "text-danger" : "text-success"}>
                          {r.allocationStatus === "decline" ? "Declined" : "Supply"}
                        </span>
                        <br />
                        <span className="text-[10px] font-bold text-brand-deep">✓ SENT</span>
                      </>
                    ) : r.allocationStatus === "supply" ? (
                      <span className="text-success">
                        Supply
                        {r.substitutedFromProductId && (
                          <>
                            <br />
                            <span className="text-[10px] font-semibold text-brand-deep">with substitute</span>
                          </>
                        )}
                      </span>
                    ) : r.allocationStatus === "decline" ? (
                      <span className="text-danger">Declined</span>
                    ) : isPicking ? (
                      <span className="text-brand-deep">picking replacement…</span>
                    ) : (
                      <span className="text-ink/40">pending</span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        disabled={r.locked || isBusy || isPicking}
                        onClick={() => handleDecline(r)}
                        className="rounded-full bg-danger/10 px-2.5 py-1 text-[11px] font-bold text-danger disabled:opacity-50"
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        disabled={r.locked || isBusy || !!r.substitutedFromProductId}
                        onClick={() => toggleSubPick(r)}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold disabled:opacity-50 ${
                          isPicking ? "bg-brand text-white" : "bg-ink/5 text-ink-muted"
                        }`}
                      >
                        {isPicking ? "Cancel" : r.substitutedFromProductId ? "Substituted ✓" : "Substitute"}
                      </button>
                      <button
                        type="button"
                        disabled={r.locked || isBusy || isPicking}
                        onClick={() => handleSupply(r)}
                        className="rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-bold text-success disabled:opacity-50"
                      >
                        Supply
                      </button>
                    </div>
                    {rowError[r.lineItemId] && (
                      <p className="mt-1 text-[10px] font-semibold text-danger">{rowError[r.lineItemId]}</p>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-2 py-8 text-center text-sm text-ink-muted">
                  No lines to allocate.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-end gap-3">
        {confirmError && <span className="text-xs font-semibold text-danger">{confirmError}</span>}
        <button
          type="button"
          disabled={decidedUnlocked.length === 0 || busy === "confirm"}
          onClick={handleConfirm}
          className="rounded-full bg-brand px-4 py-2 text-[12.5px] font-bold text-white hover:bg-brand-deep disabled:opacity-40"
        >
          CONFIRM &amp; SEND{decidedUnlocked.length ? ` (${decidedUnlocked.length})` : ""}
        </button>
      </div>
    </section>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="whitespace-nowrap px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-ink-muted">
      {children}
    </th>
  );
}

function MenuButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-md px-2 py-1.5 text-left text-xs font-semibold text-ink hover:bg-brand/10"
    >
      {children}
    </button>
  );
}

/** The shared Excel-style header dot-menu building block - a small toggle
 *  button that opens an absolute-positioned dropdown; used for BOTH the
 *  Customer sort menu and every filter-column menu below. */
function HeaderCell({
  label,
  active,
  open,
  onToggle,
  icon,
  children,
}: {
  label: string;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <th className="whitespace-nowrap px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-ink-muted">
      <span className="relative inline-flex items-center gap-1">
        {label}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className={`grid h-5 w-5 place-items-center rounded-full ${
            active ? "bg-brand text-white" : "bg-ink/5 text-ink/50 hover:bg-ink/10"
          }`}
        >
          {icon}
        </button>
        {open && (
          <span
            onClick={(e) => e.stopPropagation()}
            className="absolute left-0 top-6 z-50 min-w-[170px] rounded-xl border border-ink/10 bg-white p-1.5 shadow-lg"
          >
            {children}
          </span>
        )}
      </span>
    </th>
  );
}

function FilterHeaderCell({
  label,
  colKey,
  options,
  display,
  filters,
  openMenu,
  onToggleMenu,
  onToggleFilter,
  onClearFilter,
}: {
  label: string;
  colKey: FilterKey;
  options: string[];
  display: (v: string) => string;
  filters: Set<string>;
  openMenu: OpenMenu;
  onToggleMenu: (key: OpenMenu) => void;
  onToggleFilter: (key: FilterKey, val: string) => void;
  onClearFilter: (key: FilterKey) => void;
}) {
  return (
    <HeaderCell
      label={label}
      active={filters.size > 0}
      open={openMenu === colKey}
      onToggle={() => onToggleMenu(colKey)}
      icon={<Filter size={11} />}
    >
      {options.map((v) => (
        <label
          key={v}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold text-ink hover:bg-brand/10"
        >
          <input type="checkbox" checked={filters.has(v)} onChange={() => onToggleFilter(colKey, v)} />
          {display(v)}
        </label>
      ))}
      <MenuButton onClick={() => onClearFilter(colKey)}>Clear filter</MenuButton>
    </HeaderCell>
  );
}
