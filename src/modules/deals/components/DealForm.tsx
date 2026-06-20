"use client";

/**
 * DealForm (3.5b -> 3e -> S3/V2) - the shared create/edit form, a.k.a. the Deal
 * Basket. ONE form, fed two ways: `CreateDealForm` feeds it empty + a resolved
 * recipient; `EditDealForm` feeds it the current card. It is "dumb + fed" - it
 * knows nothing about create vs edit (or about Sella/shop, who will feed it the
 * same way later); it just collects fields and calls `onSubmit`.
 *
 * Phase 04 S3 (D-06): the LOOK is the confirmed V2 "shopping-bag tiles"
 * prototype - this is a VISUAL reshape, not a rewrite. Every piece of logic
 * (catalogue search, mandatory batch picker, +/- pack stepper, per-line private
 * cost gated by `showPrivate`+side, free-delivery, payment terms, note,
 * canSubmit guards) is unchanged; only the markup is restyled to:
 *   - a THREE-BAND modal: a pinned TOP band (title + bag count + recipient +
 *     product search), a SCROLLING middle band (the line tiles, terms, note),
 *     and a pinned BOTTOM footer (deal total + the avg-margin pill + Proceed).
 *   - line items as shopping-bag TILES: 64px cultivar-gradient thumb, name +
 *     subtitle, line total + trash top-right, batch select with THC/CBD chips +
 *     a potency split-bar, pack stepper with grams, a prominent Sell input, and
 *     a quiet dashed "only you" cost capsule.
 *   - a single deal-level "Avg. margin - only you" pill in the footer.
 *   - the maroon (`brand-deep` #76002d) accent + dark Proceed pill.
 *
 * Phase 3e (FORM-01/FORM-02): the product browser is a single search-or-type
 * control. Re-adding a catalogue product INCREMENTS its line (no duplicate row,
 * FORM-01); typing a name filters the catalogue (add-by-name auto-fill) and, when
 * nothing matches, offers to add it as a CUSTOM product (FORM-02). The add-line
 * rule lives in the pure `lib/lineEditing` helper so the grid and the typed pick
 * share one path.
 *
 * The recipient ("To") is shown as a locked row - in a p2p chat it is auto-set
 * from the conversation and cannot be changed here. The SAME field becomes a
 * people dropdown when a Basket is opened from Sella or the shop (future); the
 * structure is universal, only the lock differs by source.
 *
 * DEFERRED (D-13, no backend yet): the V2 "Things-to-do" task list (no task
 * table/type exists) and the delivery-fee AMOUNT input (only a `freeDelivery`
 * boolean exists, no fee column). The batch-option stock label is also omitted
 * (`ProductBatchView` has no stock field). Keep these OUT so `types.ts` stays
 * untouched (collision rule with S2/B2).
 */
import { useEffect, useMemo, useState } from "react";
import {
  X,
  Trash2,
  Loader2,
  Lock,
  Search,
  Plus,
  Minus,
  ArrowRight,
  Leaf,
} from "lucide-react";
import { getOwnCatalog, getProductBatches } from "../supabase/reads";
import { formatMoney } from "../lib/derive";
import { addOrIncrement, emptyCustomLine, packStepGrams, packsOf } from "../lib/lineEditing";
import { PAYMENT_TERMS } from "../lib/paymentTerms";
import type {
  CatalogProduct,
  DraftLineInput,
  DealBasketContent,
  PartySide,
  ProductBatchView,
} from "../types";

/** "1 kg pack" / "10 g pack" - how a catalogue product is sold (null if unknown). */
function packLabel(g: number | null | undefined): string | null {
  if (!g || g <= 0) return null;
  return g >= 1000 && g % 1000 === 0 ? `${g / 1000} kg pack` : `${g} g pack`;
}

/** "1 pack" / "2 packs" / "1.5 packs". */
function packCount(n: number): string {
  const v = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `${v} ${n === 1 ? "pack" : "packs"}`;
}

/** "2 kg" / "1.5 kg" - the gram quantity rendered in kilograms for the stepper hint. */
function kgLabel(grams: number): string {
  const kg = grams / 1000;
  return `${Number.isInteger(kg) ? String(kg) : kg.toFixed(1)} kg`;
}

/**
 * V2 cultivar -> thumbnail gradient. Mirrors the prototype's
 * `grad-indica/sativa/hybrid/custom` mapping (and the Deal Card thumb), so a
 * line's tile is colour-keyed to its cultivar. Falls through to the neutral
 * "custom" gradient for an unknown / off-catalogue line.
 */
function cultivarGradient(cultivar: string | null | undefined): string {
  switch ((cultivar ?? "").toLowerCase()) {
    case "indica":
      return "from-[#8b5cf6] to-[#6d28d9]";
    case "sativa":
      return "from-[#f59e0b] to-[#d97706]";
    case "hybrid":
      return "from-[#10b981] to-[#047857]";
    default:
      return "from-[#cbb8c6] to-[#9a8a96]";
  }
}

const labelCls = "text-[11px] font-semibold uppercase tracking-wide text-ink/45";
const inputCls =
  "rounded-lg bg-white px-3 py-2 text-sm text-ink ring-1 ring-black/5 placeholder:text-ink/35 focus:outline-none focus:ring-2 focus:ring-brand/30";

/** Who the Basket is addressed to, for the locked "To" row (display only). */
export interface RecipientLabel {
  personName: string | null;
  companyName: string;
  /** small chip text next to the lock (e.g. "From chat" on create, "Assigned" on edit). */
  hint?: string;
}

/**
 * Seed a line from a catalogue product + its chosen batch - one pack (the
 * product's pack size).
 *
 * BTCH-01 (D-06): product + batch is ONE entity, so a catalogue line is always
 * born with a batch. The chosen batch's id + number are stamped onto the line,
 * and the line's `thcPercent`/`cbdPercent` are OVERWRITTEN with the batch's
 * MEASURED values (D-03/D-05) - never the product LABEL value. The batch flows
 * into `addOrIncrement`, whose merge key is productId + batchId (D-05): same
 * product + same batch increments; same product + different batch is a new line.
 */
function lineFromProduct(p: CatalogProduct, batch: ProductBatchView): DraftLineInput {
  return {
    productId: p.id,
    productName: p.name,
    quantity: packStepGrams(p.packSizeGrams),
    packSizeGrams: p.packSizeGrams,
    unit: "g",
    unitPrice: p.unitPrice,
    currency: p.currency,
    cultivar: p.cultivar,
    pzn: p.pzn,
    // measured snapshot, not the product label (D-03)
    thcPercent: batch.thcPercent,
    cbdPercent: batch.cbdPercent,
    batchId: batch.id,
    batchNumber: batch.batchNumber,
  };
}

export function DealForm({
  title,
  subtitle,
  recipient,
  initialLines = [],
  initialFreeDelivery = false,
  initialDueDate = "",
  initialPaymentTermsCode = "",
  initialNote = "",
  showPrivate = true,
  side,
  noteRequired,
  submitLabel,
  onClose,
  onSubmit,
}: {
  title: string;
  subtitle: React.ReactNode;
  /**
   * The locked "To" row (3e). Present on create (resolved from the p2p chat);
   * omitted on edit (an edit is attached to an existing card, not re-addressed).
   * When a Basket is later opened from Sella/shop this same row becomes an
   * editable dropdown - the field is universal, only the lock differs.
   */
  recipient?: RecipientLabel | null;
  initialLines?: DraftLineInput[];
  initialFreeDelivery?: boolean;
  initialDueDate?: string;
  initialPaymentTermsCode?: string;
  /** seeds the note box - e.g. the editor's own existing card note (NOTE-01), so re-sending does not blank it */
  initialNote?: string;
  /**
   * Show the per-line own-side private input (default true for create/edit). A
   * PROPOSAL (4.5.2) hides it: a proposal is a shared chat message both sides
   * read, so the per-line cost/resale is added only AFTER birth via edit -
   * showing it here would silently swallow what the user types. The deal-level
   * avg-margin pill is gated by the SAME flag, so a proposal never leaks margin.
   */
  showPrivate?: boolean;
  /**
   * The viewer's side (MRGN-01) - drives the per-line private input's label:
   * seller types a cost, buyer types a resale price. Undefined = default to the
   * seller wording (e.g. the create path before the side is known).
   */
  side?: PartySide;
  /** edits require a note (D2); create makes it optional at draft. */
  noteRequired: boolean;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (payload: DealBasketContent) => Promise<void>;
}) {
  const [catalog, setCatalog] = useState<CatalogProduct[] | null>(null);
  const [query, setQuery] = useState("");
  // BTCH-01 (D-06): product + batch is ONE entity. Clicking a catalogue product
  // does NOT add a line - it becomes the "pending" product and loads its batches;
  // the line is created only when a batch is then chosen. Custom products skip
  // this (the separate custom button adds a line directly).
  const [pendingProduct, setPendingProduct] = useState<CatalogProduct | null>(null);
  const [pendingBatches, setPendingBatches] = useState<ProductBatchView[] | null>(null);
  const [lines, setLines] = useState<DraftLineInput[]>(initialLines);
  const [freeDelivery, setFreeDelivery] = useState(initialFreeDelivery);
  const [dueDate, setDueDate] = useState(initialDueDate);
  const [paymentTermsCode, setPaymentTermsCode] = useState(initialPaymentTermsCode);
  const [note, setNote] = useState(initialNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void getOwnCatalog()
      .then((c) => alive && setCatalog(c))
      .catch(() => alive && setCatalog([]));
    return () => {
      alive = false;
    };
  }, []);

  const total = useMemo(
    () =>
      lines.reduce((sum, l) => (l.unitPrice != null ? sum + l.quantity * l.unitPrice : sum), 0),
    [lines],
  );
  const anyPriced = lines.some((l) => l.unitPrice != null);

  // FORM-02 add-by-name: filter the catalogue already in memory (no server
  // search). The grid below shows matches; clicking one routes through the SAME
  // addProduct path as a quick-pick, so increment + auto-fill come for free.
  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    const all = catalog ?? [];
    if (!q) return all;
    return all.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.cultivar?.toLowerCase().includes(q) ?? false),
    );
  }, [catalog, q]);
  const hasExactName = (catalog ?? []).some((p) => p.name.toLowerCase() === q);

  // How much of each catalogue product is already in the basket - drives the
  // "selected" badge on the grid so a click gives instant visible feedback.
  const qtyByProduct = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lines) {
      if (l.productId) m.set(l.productId, (m.get(l.productId) ?? 0) + l.quantity);
    }
    return m;
  }, [lines]);

  const noteOk = !noteRequired || note.trim().length > 0;
  // FORM-02: a custom line starts blank - require a name before it can be sent.
  const allNamed = lines.every((l) => l.productName.trim().length > 0);
  // BTCH-01 (D-06) backstop: every catalogue line (productId not null) must carry
  // a batch; custom lines (productId null) are batch-exempt. Born-with-a-batch is
  // the primary enforcement (the picker); this guard is the safety net.
  const allBatched = lines.every((l) => l.productId == null || l.batchId != null);
  const canSubmit = !busy && lines.length > 0 && noteOk && allNamed && allBatched;

  // bag count = priced (batched + present) lines, mirroring the V2 header chip.
  const bagCount = lines.length;

  // Clicking a catalogue product opens its MANDATORY batch dropdown (D-06) -
  // it does NOT add a line yet. Load the product's batches; the line is created
  // only when a batch is chosen (addBatch below).
  function pickProduct(p: CatalogProduct) {
    setPendingProduct(p);
    setPendingBatches(null);
    void getProductBatches(p.id)
      .then((bs) => setPendingBatches(bs))
      .catch(() => setPendingBatches([]));
  }
  // The batch is chosen - now create (or increment) the line through the SAME
  // single add path the grid/typeahead use. The chosen batch is closed over in
  // the seed so addOrIncrement's productId+batchId merge key works (D-05).
  function addBatch(p: CatalogProduct, batch: ProductBatchView) {
    // FORM-01 + D-05: increment a same-product/same-batch line, never duplicate.
    setLines((ls) => addOrIncrement(ls, p, (cp) => lineFromProduct(cp, batch)));
    setPendingProduct(null);
    setPendingBatches(null);
    setQuery("");
  }
  function cancelPick() {
    setPendingProduct(null);
    setPendingBatches(null);
  }
  function addCustom(name: string) {
    setLines((ls) => [...ls, emptyCustomLine(name.trim())]);
    setQuery("");
  }
  function updateLine(i: number, patch: Partial<DraftLineInput>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }
  // +/- one pack (basket feel). Steps by the line's pack size; floors at one pack.
  function stepLine(i: number, dir: 1 | -1) {
    setLines((ls) =>
      ls.map((l, j) => {
        if (j !== i) return l;
        const step = packStepGrams(l.packSizeGrams);
        return { ...l, quantity: Math.max(step, l.quantity + dir * step) };
      }),
    );
  }
  function removeLine(i: number) {
    setLines((ls) => ls.filter((_, j) => j !== i));
  }

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        lines,
        freeDelivery,
        dueDate: dueDate || null,
        paymentTermsCode: paymentTermsCode || null,
        note: note.trim() || null,
      });
      // the wrapper closes / reloads on success
    } catch (e) {
      console.error("deal form submit failed", e);
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
      />

      {/* THREE-BAND modal (V2): pinned TOP + scrolling MIDDLE + pinned FOOTER.
          Widened toward the V2 target (~920px) but still responsive: at small
          widths the footer stacks figures over actions so Proceed stays in view. */}
      <div className="glass-strong relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl">
        {/* ===================== TOP band (pinned) ===================== */}
        <div className="flex-none">
          {/* header */}
          <div className="flex items-start justify-between gap-3 border-b border-black/5 px-5 py-4">
            <div className="flex flex-col">
              <h2 className="text-base font-bold text-ink">{title}</h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-ink/55">
                <span>{subtitle}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-deep/10 px-2 py-0.5 text-[11px] font-semibold text-brand-deep">
                  {bagCount} {bagCount === 1 ? "item" : "items"}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink/45 ring-1 ring-black/5 transition hover:bg-ink/5 hover:text-ink"
            >
              <X size={16} />
            </button>
          </div>

          <div className="space-y-3 px-5 py-4">
            {/* recipient ("To") - locked in p2p, auto-set from the chat (3e) */}
            {recipient && (
              <div className="flex items-center gap-2.5 rounded-xl bg-brand-deep/5 px-3 py-2.5 ring-1 ring-brand-deep/10">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
                  {(recipient.personName ?? recipient.companyName)
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">
                    {recipient.personName ?? recipient.companyName}
                  </p>
                  {recipient.personName && (
                    <p className="truncate text-[11px] text-ink/50">{recipient.companyName}</p>
                  )}
                </div>
                <span
                  title="Set automatically - locked in a p2p chat"
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2 py-1 text-[10px] font-medium text-ink/45 ring-1 ring-black/5"
                >
                  <Lock size={9} /> {recipient.hint ?? "From chat"}
                </span>
              </div>
            )}

            {/* add products - search the catalogue or type a custom name (3e) */}
            <div className="space-y-2">
              <div className="relative">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Add a product - search your catalogue, or type a new name…"
                  className={`${inputCls} w-full pl-9`}
                />
              </div>

              {catalog === null ? (
                <p className="text-[12px] text-ink/45">Loading your catalogue…</p>
              ) : (
                (q !== "" || pendingProduct) && (
                  <div className="space-y-2">
                    {matches.length > 0 && q !== "" && (
                      <div className="grid grid-cols-2 gap-2">
                        {matches.map((p) => {
                          const inBasket = qtyByProduct.get(p.id) ?? 0;
                          const packs = packsOf(inBasket, p.packSizeGrams);
                          const selected = inBasket > 0;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => pickProduct(p)}
                              className={`relative flex flex-col rounded-xl px-3 py-2 text-left ring-1 transition ${
                                selected
                                  ? "bg-brand/5 ring-brand/40"
                                  : "bg-white ring-black/5 hover:ring-brand/30"
                              }`}
                            >
                              {selected && (
                                <span className="absolute right-1.5 top-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">
                                  {packs != null
                                    ? `${packCount(packs).replace(/ packs?$/, "")}×`
                                    : `${inBasket}g`}
                                </span>
                              )}
                              <span className="truncate pr-6 text-sm font-semibold text-ink">
                                {p.name}
                              </span>
                              <span className="text-[11px] text-ink/50">
                                {p.cultivar ? `${p.cultivar} · ` : ""}
                                {p.unitPrice != null
                                  ? `${formatMoney(p.unitPrice, p.currency)}/g`
                                  : "no price"}
                                {packLabel(p.packSizeGrams)
                                  ? ` · ${packLabel(p.packSizeGrams)}`
                                  : ""}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* BTCH-01 (D-06): a chosen product opens its MANDATORY batch
                        dropdown. The line is created only when a batch is picked,
                        so a catalogue line is born with a batch. Stock label is
                        OMITTED (D-13: ProductBatchView has no stock field). */}
                    {pendingProduct && (
                      <div className="space-y-2 rounded-xl bg-brand/5 p-3 ring-1 ring-brand/30">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[12px] font-semibold text-ink">
                            Pick a batch for{" "}
                            <span className="text-brand">{pendingProduct.name}</span>
                          </p>
                          <button
                            type="button"
                            onClick={cancelPick}
                            className="shrink-0 rounded-full p-1 text-ink/40 transition hover:bg-ink/5 hover:text-ink"
                            aria-label="Cancel batch pick"
                          >
                            <X size={14} />
                          </button>
                        </div>
                        {pendingBatches === null ? (
                          <p className="text-[12px] text-ink/45">Loading batches…</p>
                        ) : pendingBatches.length === 0 ? (
                          <p className="text-[12px] text-ink/45">
                            No batches on record for this product yet.
                          </p>
                        ) : (
                          <div className="space-y-1.5">
                            {pendingBatches.map((b) => (
                              <button
                                key={b.id}
                                type="button"
                                onClick={() => addBatch(pendingProduct, b)}
                                className="flex w-full items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-left text-sm ring-1 ring-black/5 transition hover:ring-brand/40"
                              >
                                <span className="truncate font-medium text-ink">
                                  Batch {b.batchNumber}
                                </span>
                                <span className="shrink-0 text-[11px] text-ink/55">
                                  {b.thcPercent != null ? `THC ${b.thcPercent}%` : ""}
                                  {b.thcPercent != null && b.cbdPercent != null ? " · " : ""}
                                  {b.cbdPercent != null ? `CBD ${b.cbdPercent}%` : ""}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* FORM-02 custom path: offer the typed name as a custom line */}
                    {q && !hasExactName && (
                      <button
                        type="button"
                        onClick={() => addCustom(query)}
                        className="flex w-full items-center gap-2 rounded-xl border border-dashed border-brand/40 px-3 py-2.5 text-left text-sm font-medium text-brand transition hover:bg-brand/5"
                      >
                        <Plus size={15} />
                        <span className="truncate">Add “{query.trim()}” as a custom product</span>
                      </button>
                    )}

                    {q && matches.length === 0 && (
                      <p className="text-[12px] text-ink/45">
                        No catalogue match for “{query.trim()}”.
                      </p>
                    )}
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        {/* ===================== MIDDLE band (scrolls) ===================== */}
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto border-t border-black/5 px-5 py-4">
          {/* line items as shopping-bag TILES */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <p className={labelCls}>Items</p>
              {lines.length > 0 && (
                <span className="text-[11px] text-ink/40">{lines.length} on this deal</span>
              )}
            </div>

            {lines.length === 0 ? (
              <p className="text-[12px] text-ink/45">Add a product above to start the basket.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {lines.map((l, i) => {
                  const batched = l.productId == null || l.batchId != null;
                  const packs = packsOf(l.quantity, l.packSizeGrams);
                  const atFloor = packs != null ? packs <= 1 : l.quantity <= packStepGrams(l.packSizeGrams);
                  // potency split widths (only meaningful when both are present)
                  const thc = l.thcPercent ?? 0;
                  const cbd = l.cbdPercent ?? 0;
                  const potTotal = thc + cbd;
                  const thcW = potTotal > 0 ? Math.round((thc / potTotal) * 100) : 50;
                  const cbdW = 100 - thcW;
                  const lineTotal = l.unitPrice != null ? l.quantity * l.unitPrice : null;
                  return (
                    <div
                      key={i}
                      className={`flex gap-3.5 rounded-2xl bg-white p-3.5 ring-1 ring-black/5 sm:gap-4 ${
                        batched ? "" : "ring-brand-soft/60"
                      }`}
                    >
                      {/* 64px cultivar-gradient thumbnail */}
                      <span
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white sm:h-16 sm:w-16 ${cultivarGradient(
                          l.cultivar,
                        )}`}
                      >
                        <Leaf size={20} />
                      </span>

                      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                        {/* top: name + subtitle ··· line total + trash */}
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="min-w-0 flex-1">
                            {l.productId == null ? (
                              <input
                                value={l.productName}
                                onChange={(e) => updateLine(i, { productName: e.target.value })}
                                placeholder="Product name"
                                className="w-full bg-transparent text-[15px] font-semibold text-ink placeholder:font-normal placeholder:text-ink/30 focus:outline-none"
                              />
                            ) : (
                              <p className="truncate text-[15px] font-semibold text-ink">
                                {l.productName}
                              </p>
                            )}
                            <p className="truncate text-[11.5px] text-ink/50">
                              {l.cultivar ? `${l.cultivar} · ` : ""}
                              {packLabel(l.packSizeGrams) ?? "custom"}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span
                              className={`text-base font-semibold text-ink tabular-nums ${
                                batched ? "" : "opacity-40"
                              }`}
                            >
                              {lineTotal != null ? formatMoney(lineTotal, l.currency) : "—"}
                            </span>
                            {l.productId == null && (
                              <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-medium text-ink/45">
                                Custom
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => removeLine(i)}
                              aria-label="Remove line"
                              className="rounded-full p-1 text-ink/35 transition hover:bg-ink/5 hover:text-danger"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>

                        {/* chosen batch (catalogue lines) + chips + potency bar.
                            Batch is picked at ADD time (D-05 merge identity is
                            productId + batchId, so re-pick is intentionally NOT
                            offered here - to change a batch, remove the line and
                            re-add it). The chosen batch shows as a read-only mono
                            chip; an unbatched line shows the pink "pick a batch"
                            hint (the add-time picker is the only batch control). */}
                        {l.productId != null && (
                          <div className="space-y-1.5">
                            {l.batchId != null && (
                              <span className="inline-flex w-max max-w-full items-center rounded-lg bg-brand-deep/5 px-2.5 py-1.5 font-mono text-[12px] text-brand-deep ring-1 ring-brand-deep/10">
                                Batch {l.batchNumber}
                              </span>
                            )}

                            {batched ? (
                              <>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {l.thcPercent != null && (
                                    <span className="inline-flex items-center rounded-md bg-[#b5179e]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#b5179e] tabular-nums">
                                      THC {l.thcPercent}
                                    </span>
                                  )}
                                  {l.cbdPercent != null && (
                                    <span className="inline-flex items-center rounded-md bg-[#1b998b]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#1b998b] tabular-nums">
                                      CBD {l.cbdPercent}
                                    </span>
                                  )}
                                </div>
                                {(l.thcPercent != null || l.cbdPercent != null) && (
                                  <div className="mt-0.5 flex h-1.5 overflow-hidden rounded-full bg-ink/5">
                                    <div className="bg-[#b5179e]" style={{ width: `${thcW}%` }} />
                                    <div className="bg-[#1b998b]" style={{ width: `${cbdW}%` }} />
                                  </div>
                                )}
                              </>
                            ) : (
                              <p className="text-[11px] italic text-brand">
                                pick a batch to price this line
                              </p>
                            )}
                          </div>
                        )}

                        {/* controls: pack stepper (with grams) + prominent Sell price */}
                        <div
                          className={`flex flex-wrap items-center gap-3 ${
                            batched ? "" : "pointer-events-none opacity-40"
                          }`}
                        >
                          <div className="flex items-center overflow-hidden rounded-lg ring-1 ring-black/5">
                            <button
                              type="button"
                              onClick={() => stepLine(i, -1)}
                              disabled={atFloor}
                              aria-label="One pack fewer"
                              className="flex h-8 w-8 items-center justify-center text-ink/55 transition hover:bg-brand-deep/5 hover:text-ink disabled:cursor-not-allowed disabled:text-ink/20 disabled:hover:bg-transparent"
                            >
                              <Minus size={14} />
                            </button>
                            <span className="min-w-[2rem] border-x border-black/5 px-1 py-1.5 text-center text-sm font-semibold text-ink tabular-nums">
                              {packs != null ? (Number.isInteger(packs) ? packs : packs.toFixed(1)) : "—"}
                            </span>
                            <button
                              type="button"
                              onClick={() => stepLine(i, 1)}
                              aria-label="One pack more"
                              className="flex h-8 w-8 items-center justify-center text-ink/55 transition hover:bg-brand-deep/5 hover:text-ink"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                          <span className="font-mono text-[11.5px] text-ink/45">
                            {packs != null
                              ? `${packCount(packs)} · ${kgLabel(l.quantity)}`
                              : `${l.quantity} g`}
                          </span>

                          {/* prominent Sell price (buyer-visible unit_price) */}
                          <span className="ml-auto inline-flex items-center gap-1 rounded-lg bg-brand-deep/10 px-3 py-1.5 text-brand-deep">
                            <span className="text-[11px] font-medium opacity-85">Sell</span>
                            <span className="text-[13px] font-semibold">€</span>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={l.unitPrice ?? ""}
                              onChange={(e) =>
                                updateLine(i, {
                                  unitPrice: e.target.value === "" ? null : Number(e.target.value),
                                })
                              }
                              aria-label="Sell price per gram"
                              placeholder="0.00"
                              className="w-16 bg-transparent text-right font-mono text-sm font-bold text-brand-deep placeholder:font-normal placeholder:text-brand-deep/40 focus:outline-none tabular-nums"
                            />
                            <span className="text-[10px] opacity-80">/g</span>
                          </span>
                        </div>

                        {/* MRGN-01: the quiet dashed "only you" cost capsule, gated
                            by showPrivate. De-emphasised; never the prominent number.
                            A PROPOSAL (showPrivate=false) hides it so the cost is
                            never typed into a shared message. */}
                        {showPrivate && (
                          <div
                            className={`flex w-max max-w-full flex-wrap items-center gap-2 rounded-xl border border-dashed border-black/10 bg-ink/[0.02] px-2.5 py-1.5 text-[11px] text-ink/55 ${
                              batched ? "" : "pointer-events-none opacity-40"
                            }`}
                          >
                            <span className="inline-flex items-center gap-1 text-[10px] text-ink/45">
                              <Lock size={10} /> only you
                            </span>
                            <span>{side === "buyer" ? "your resale" : "your cost"}</span>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={l.ownInput ?? ""}
                              onChange={(e) =>
                                updateLine(i, {
                                  ownInput: e.target.value === "" ? null : Number(e.target.value),
                                })
                              }
                              aria-label={side === "buyer" ? "Your resale per gram" : "Your cost per gram"}
                              placeholder="0.00"
                              className="w-14 rounded-md bg-white px-1.5 py-1 text-right font-mono text-[12px] text-ink ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand/30 tabular-nums"
                            />
                            <span className="text-[10px] text-ink/45">€/g</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* terms (free delivery + due date + payment terms) - D-13: no
              delivery-fee AMOUNT input, the freeDelivery boolean only */}
          <section className="space-y-2.5 rounded-2xl border border-black/5 p-4">
            <p className={labelCls}>Deal terms</p>
            <label className="flex w-max items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={freeDelivery}
                onChange={(e) => setFreeDelivery(e.target.checked)}
                className="h-4 w-4 accent-[var(--color-brand)]"
              />
              Free delivery
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-ink/55">Due date</span>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-ink/55">Payment terms</span>
                <select
                  value={paymentTermsCode}
                  onChange={(e) => setPaymentTermsCode(e.target.value)}
                  className={inputCls}
                >
                  {PAYMENT_TERMS.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          {/* note - D-13: no Things-to-do task list, the note textarea only */}
          <section className="space-y-2">
            <p className={labelCls}>
              Note{noteRequired && <span className="ml-1 text-brand">· required</span>}
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className={`${inputCls} w-full resize-none`}
              placeholder={
                noteRequired
                  ? "Say what changed and why (everyone sees this on the deal's history)…"
                  : "Add a note for your contact…"
              }
            />
          </section>

          {error && <p className="text-[12px] text-danger">{error}</p>}
        </div>

        {/* ===================== BOTTOM band (pinned footer) ===================== */}
        <div className="flex flex-none flex-col gap-3 border-t border-black/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-[10.5px] uppercase tracking-wide text-ink/45">
                Deal total
              </span>
              <span className="text-xl font-bold text-ink tabular-nums">
                {anyPriced ? formatMoney(total) : "—"}
              </span>
            </div>
            {/* avg-margin pill is added in Task 2 */}
          </div>

          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink/55 ring-1 ring-ink/15 transition hover:bg-ink/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSubmit}
              className="flex items-center gap-1.5 rounded-xl bg-brand-deep px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#8c0036] disabled:opacity-50"
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {submitLabel}
              {!busy && <ArrowRight size={15} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
