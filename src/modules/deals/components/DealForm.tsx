"use client";

/**
 * DealForm (3.5b -> 3e) - the shared create/edit form, a.k.a. the Deal Basket.
 * ONE form, fed two ways: `CreateDealForm` feeds it empty + a resolved recipient;
 * `EditDealForm` feeds it the current card. It is "dumb + fed" - it knows nothing
 * about create vs edit (or about Sella/shop, who will feed it the same way
 * later); it just collects fields and calls `onSubmit`. Light / glass / raspberry
 * to match the app.
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
 */
import { useEffect, useMemo, useState } from "react";
import { X, Trash2, Loader2, Lock, Search, Plus, Minus, User } from "lucide-react";
import { getOwnCatalog } from "../supabase/reads";
import { formatMoney } from "../lib/derive";
import { addOrIncrement, emptyCustomLine, packStepGrams, packsOf } from "../lib/lineEditing";
import { PAYMENT_TERMS } from "../lib/paymentTerms";
import type { CatalogProduct, DraftLineInput, DealBasketContent, PartySide } from "../types";

const UNITS = ["g", "kg", "unit"];

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

/** Seed a line from a catalogue product - one pack (the product's pack size). */
function lineFromProduct(p: CatalogProduct): DraftLineInput {
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
    thcPercent: p.thcPercent,
    cbdPercent: p.cbdPercent,
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
   * showing it here would silently swallow what the user types.
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
  const canSubmit = !busy && lines.length > 0 && noteOk && allNamed;

  function addProduct(p: CatalogProduct) {
    // FORM-01: increment an existing line, never duplicate (pure rule in lib).
    setLines((ls) => addOrIncrement(ls, p, lineFromProduct));
    setQuery("");
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

      <div className="glass-strong relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl">
        {/* header */}
        <div className="flex items-center justify-between gap-3 border-b border-black/5 px-5 py-4">
          <div className="flex flex-col">
            <h2 className="text-base font-bold text-ink">{title}</h2>
            <p className="text-[12px] text-ink/55">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink/45 ring-1 ring-black/5 transition hover:bg-ink/5 hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        {/* body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* recipient ("To") - locked in p2p, auto-set from the chat (3e) */}
          {recipient && (
            <section className="space-y-1.5">
              <p className={labelCls}>To</p>
              <div className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-2.5 ring-1 ring-black/5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                  <User size={15} />
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
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ink/5 px-2 py-1 text-[10px] font-medium text-ink/45"
                >
                  <Lock size={9} /> {recipient.hint ?? "From chat"}
                </span>
              </div>
            </section>
          )}

          {/* add products - search the catalogue or type a custom name (3e) */}
          <section className="space-y-2">
            <p className={labelCls}>Add products</p>
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your catalogue, or type a new product name…"
                className={`${inputCls} w-full pl-9`}
              />
            </div>

            {catalog === null ? (
              <p className="text-[12px] text-ink/45">Loading your catalogue…</p>
            ) : (
              <div className="space-y-2">
                {matches.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {matches.map((p) => {
                      const inBasket = qtyByProduct.get(p.id) ?? 0;
                      const packs = packsOf(inBasket, p.packSizeGrams);
                      const selected = inBasket > 0;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => addProduct(p)}
                          className={`relative flex flex-col rounded-xl px-3 py-2 text-left ring-1 transition ${
                            selected
                              ? "bg-brand/5 ring-brand/40"
                              : "bg-white ring-black/5 hover:ring-brand/30"
                          }`}
                        >
                          {selected && (
                            <span className="absolute right-1.5 top-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">
                              {packs != null ? `${packCount(packs).replace(/ packs?$/, "")}×` : `${inBasket}g`}
                            </span>
                          )}
                          <span className="truncate pr-6 text-sm font-semibold text-ink">{p.name}</span>
                          <span className="text-[11px] text-ink/50">
                            {p.cultivar ? `${p.cultivar} · ` : ""}
                            {p.unitPrice != null
                              ? `${formatMoney(p.unitPrice, p.currency)}/g`
                              : "no price"}
                            {packLabel(p.packSizeGrams) ? ` · ${packLabel(p.packSizeGrams)}` : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* FORM-02 custom path: offer the typed name, or a blank custom line */}
                {q && !hasExactName ? (
                  <button
                    type="button"
                    onClick={() => addCustom(query)}
                    className="flex w-full items-center gap-2 rounded-xl border border-dashed border-brand/40 px-3 py-2.5 text-left text-sm font-medium text-brand transition hover:bg-brand/5"
                  >
                    <Plus size={15} />
                    <span className="truncate">
                      Add “{query.trim()}” as a custom product
                    </span>
                  </button>
                ) : (
                  !q && (
                    <button
                      type="button"
                      onClick={() => addCustom("")}
                      className="flex w-full items-center gap-2 rounded-xl border border-dashed border-black/10 px-3 py-2.5 text-left text-sm font-medium text-ink/55 transition hover:border-brand/40 hover:text-brand"
                    >
                      <Plus size={15} />
                      Add a custom product
                    </button>
                  )
                )}

                {catalog.length === 0 && !q && (
                  <p className="text-[12px] text-ink/45">
                    No products in your catalogue yet - add a custom one above.
                  </p>
                )}
                {q && matches.length === 0 && (
                  <p className="text-[12px] text-ink/45">
                    No catalogue match for “{query.trim()}”.
                  </p>
                )}
              </div>
            )}
          </section>

          {/* items */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <p className={labelCls}>Items</p>
              {lines.length > 0 && (
                <span className="text-[11px] text-ink/40">{lines.length} on this deal</span>
              )}
            </div>
            {lines.length === 0 ? (
              <p className="text-[12px] text-ink/45">
                Add a product above to start the basket.
              </p>
            ) : (
              <div className="space-y-2">
                {lines.map((l, i) => (
                  <div key={i} className="rounded-xl bg-white p-3 ring-1 ring-black/5">
                    <div className="flex items-center justify-between gap-2">
                      <input
                        value={l.productName}
                        onChange={(e) => updateLine(i, { productName: e.target.value })}
                        placeholder="Product name"
                        className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-ink placeholder:font-normal placeholder:text-ink/30 focus:outline-none"
                      />
                      {l.productId == null && (
                        <span className="shrink-0 rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-medium text-ink/45">
                          Custom
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeLine(i)}
                        className="shrink-0 rounded-full p-1 text-ink/35 transition hover:bg-ink/5 hover:text-danger"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {/* quantity = packs: +/- steps by one pack (basket feel) */}
                      <div className="flex items-center overflow-hidden rounded-lg ring-1 ring-black/5">
                        <button
                          type="button"
                          onClick={() => stepLine(i, -1)}
                          aria-label="One pack fewer"
                          className="flex h-9 w-9 items-center justify-center text-ink/55 transition hover:bg-ink/5 hover:text-ink"
                        >
                          <Minus size={14} />
                        </button>
                        <input
                          type="number"
                          min={0}
                          value={l.quantity}
                          onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                          aria-label="Quantity in grams"
                          placeholder="Qty"
                          className="w-16 border-x border-black/5 bg-white px-2 py-2 text-center text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
                        />
                        <button
                          type="button"
                          onClick={() => stepLine(i, 1)}
                          aria-label="One pack more"
                          className="flex h-9 w-9 items-center justify-center text-ink/55 transition hover:bg-ink/5 hover:text-ink"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <select
                        value={l.unit}
                        onChange={(e) => updateLine(i, { unit: e.target.value })}
                        className={inputCls}
                      >
                        {UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
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
                        className={`${inputCls} min-w-0 flex-1`}
                        placeholder="€ / g (optional)"
                      />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-ink/55">
                      <span>
                        {(() => {
                          const packs = packsOf(l.quantity, l.packSizeGrams);
                          return packs != null ? packCount(packs) : `${l.quantity} g`;
                        })()}
                      </span>
                      <span>
                        {l.unitPrice != null
                          ? formatMoney(l.quantity * l.unitPrice, l.currency)
                          : "Price TBD"}
                      </span>
                    </div>
                    {/* MRGN-01: the per-line own-side private input (seller cost /
                        buyer resale), shown only when showPrivate. This row mixes
                        a SHARED input (qty/unit/price above) with a PRIVATE input
                        (ownInput); the private/shared split is enforced
                        server-side in proposeDealChange - ownInput is written to
                        deal_line_item_private and stripped from the shared draft. */}
                    {showPrivate && (
                      <label className="mt-2 flex flex-col gap-1">
                        <span className="inline-flex items-center gap-1 text-[11px] text-ink/55">
                          <Lock size={10} />
                          {side === "buyer"
                            ? "Your resale price (only you)"
                            : "Your cost (only you)"}
                        </span>
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
                          className={inputCls}
                          placeholder={
                            side === "buyer" ? "€ / g (your resale)" : "€ / g (your cost)"
                          }
                        />
                      </label>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* terms */}
          <section className="space-y-2">
            <p className={labelCls}>Terms</p>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={freeDelivery}
                onChange={(e) => setFreeDelivery(e.target.checked)}
                className="h-4 w-4 accent-[var(--color-brand)]"
              />
              Free delivery
            </label>
            <div className="grid grid-cols-2 gap-2">
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

          {/* note */}
          <section className="space-y-2">
            <p className={labelCls}>
              Note{noteRequired && <span className="ml-1 text-brand">· required</span>}
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className={`${inputCls} resize-none`}
              placeholder={
                noteRequired
                  ? "Say what changed and why (everyone sees this on the deal's history)…"
                  : "Add a note for your contact…"
              }
            />
          </section>

          {error && <p className="text-[12px] text-danger">{error}</p>}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between gap-3 border-t border-black/5 px-5 py-4">
          <span className="text-[12px] text-ink/55">
            {anyPriced ? (
              <>
                Total <span className="font-semibold text-ink">{formatMoney(total)}</span>
              </>
            ) : (
              "Price TBD"
            )}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-ink/55 ring-1 ring-ink/15 transition hover:bg-ink/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSubmit}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {submitLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
