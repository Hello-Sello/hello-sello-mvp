"use client";

/**
 * The Batches allocator (Sell surface, DEV-76/DEV-157) - the seller's
 * permanent work surface for deciding Decline/Substitute/Supply on every
 * open order line.
 *
 * This file lands in two passes: Task 2 (this pass) is the static shell -
 * Excel-style sort/filter, FIFO-default batch display, inert action buttons.
 * Task 3 wires Decline/Substitute/Supply, batch splitting, live stock bars,
 * and partial confirm on top of this same shell.
 */
import { useMemo, useState, type ReactNode } from "react";
import { ArrowUpDown, Filter } from "lucide-react";
import { isKeyAccount } from "@/modules/allocate/status";
import type { AllocationRow } from "@/modules/allocate/batches";

type AllocSort = "voltotal" | "margin" | "first" | "custAZ" | "custZA" | "key";
type FilterKey = "type" | "product" | "uvol" | "units";
type OpenMenu = FilterKey | "cust" | null;

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
  const [allocSort, setAllocSort] = useState<AllocSort>("voltotal");
  const [filters, setFilters] = useState<Record<FilterKey, Set<string>>>({
    type: new Set(),
    product: new Set(),
    uvol: new Set(),
    units: new Set(),
  });
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);

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

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
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
            {rows.map((r) => (
              <tr key={r.lineItemId} className="border-b border-ink/5">
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
                <td className="px-2 py-2">{r.productName}</td>
                <td className="px-2 py-2 tabular-nums">{r.unitsOrdered}</td>
                <td className="px-2 py-2 tabular-nums">{r.unitVolGrams}g</td>
                <td className="px-2 py-2 font-bold tabular-nums">{fmtVol(r.volTotalGrams)}</td>
                <td className="px-2 py-2 tabular-nums">{r.pricePerGram.toFixed(2)}€/g</td>
                <td className="px-2 py-2 font-bold tabular-nums">{fmtEur(r.priceTotal)}</td>
                <td className="px-2 py-2">
                  <select
                    disabled
                    defaultValue={r.batchId ?? r.availableBatches[0]?.id ?? ""}
                    className="rounded-lg border border-ink/15 bg-white px-1.5 py-1 text-xs disabled:opacity-60"
                  >
                    {r.availableBatches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.batchNumber} · {fmtVol(b.quantityGrams)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-2 text-xs font-semibold">
                  {r.locked ? (
                    <span className="text-success">✓ SENT</span>
                  ) : r.allocationStatus === "supply" ? (
                    <span className="text-success">Supply</span>
                  ) : r.allocationStatus === "decline" ? (
                    <span className="text-danger">Declined</span>
                  ) : (
                    <span className="text-ink/40">pending</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  <div className="flex gap-1.5">
                    <button
                      disabled
                      type="button"
                      className="rounded-full bg-danger/10 px-2.5 py-1 text-[11px] font-bold text-danger disabled:opacity-50"
                    >
                      Decline
                    </button>
                    <button
                      disabled
                      type="button"
                      className="rounded-full bg-ink/5 px-2.5 py-1 text-[11px] font-bold text-ink-muted disabled:opacity-50"
                    >
                      Substitute
                    </button>
                    <button
                      disabled
                      type="button"
                      className="rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-bold text-success disabled:opacity-50"
                    >
                      Supply
                    </button>
                  </div>
                </td>
              </tr>
            ))}
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
