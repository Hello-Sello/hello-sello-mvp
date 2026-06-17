"use client";

/**
 * DealForm (3.5b) - the shared create/edit deal form. ONE form, fed two ways:
 * `CreateDealForm` feeds it empty + an optional note; `EditDealForm` feeds it
 * the current card + a REQUIRED note. It is "dumb + fed" - it knows nothing
 * about create vs edit (or about Sella, who will feed it the same way later); it
 * just collects fields and calls `onSubmit`. Light / glass / raspberry to match
 * the app.
 *
 * Scope (3.5a/b): products come from the creator's OWN catalogue; prices are
 * OPTIONAL; discount + CC are parked.
 */
import { useEffect, useMemo, useState } from "react";
import { X, Trash2, Loader2, Lock } from "lucide-react";
import { getOwnCatalog } from "../supabase/reads";
import { formatMoney } from "../lib/derive";
import { PAYMENT_TERMS } from "../lib/paymentTerms";
import type { CatalogProduct, DraftLineInput } from "../types";

const UNITS = ["g", "kg", "unit"];

const labelCls = "text-[11px] font-semibold uppercase tracking-wide text-ink/45";
const inputCls =
  "rounded-lg bg-white px-3 py-2 text-sm text-ink ring-1 ring-black/5 placeholder:text-ink/35 focus:outline-none focus:ring-2 focus:ring-brand/30";

/** Seed a line from a catalogue product (default 1000 g - a typical wholesale qty). */
function lineFromProduct(p: CatalogProduct): DraftLineInput {
  return {
    productId: p.id,
    productName: p.name,
    quantity: 1000,
    unit: "g",
    unitPrice: p.unitPrice,
    currency: p.currency,
    cultivar: p.cultivar,
    pzn: p.pzn,
    thcPercent: p.thcPercent,
    cbdPercent: p.cbdPercent,
  };
}

/** What the form hands back on submit; the wrapper maps it to create/edit. */
export interface DealFormPayload {
  lines: DraftLineInput[];
  freeDelivery: boolean;
  dueDate: string | null;
  paymentTermsCode: string | null;
  privateValue: string | null;
  note: string | null;
}

export function DealForm({
  title,
  subtitle,
  initialLines = [],
  initialFreeDelivery = false,
  initialDueDate = "",
  initialPaymentTermsCode = "",
  initialPrivateValue = "",
  showPrivate = true,
  noteRequired,
  submitLabel,
  onClose,
  onSubmit,
}: {
  title: string;
  subtitle: React.ReactNode;
  initialLines?: DraftLineInput[];
  initialFreeDelivery?: boolean;
  initialDueDate?: string;
  initialPaymentTermsCode?: string;
  initialPrivateValue?: string;
  /**
   * Show the seller's own-side private box (default true for create/edit). A
   * PROPOSAL (4.5.2) hides it: a proposal is a shared chat message both sides
   * read, so the private box is added only AFTER birth via edit - showing it
   * here would silently swallow what the seller types (proposeDeal drops it).
   */
  showPrivate?: boolean;
  /** edits require a note (D2); create makes it optional at draft. */
  noteRequired: boolean;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (payload: DealFormPayload) => Promise<void>;
}) {
  const [catalog, setCatalog] = useState<CatalogProduct[] | null>(null);
  const [lines, setLines] = useState<DraftLineInput[]>(initialLines);
  const [freeDelivery, setFreeDelivery] = useState(initialFreeDelivery);
  const [dueDate, setDueDate] = useState(initialDueDate);
  const [paymentTermsCode, setPaymentTermsCode] = useState(initialPaymentTermsCode);
  const [privateValue, setPrivateValue] = useState(initialPrivateValue);
  const [note, setNote] = useState("");
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
  const noteOk = !noteRequired || note.trim().length > 0;
  const canSubmit = !busy && lines.length > 0 && noteOk;

  function addProduct(p: CatalogProduct) {
    setLines((ls) => [...ls, lineFromProduct(p)]);
  }
  function updateLine(i: number, patch: Partial<DraftLineInput>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
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
        privateValue: privateValue || null,
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
          {/* quick products */}
          <section className="space-y-2">
            <p className={labelCls}>Top products</p>
            {catalog === null ? (
              <p className="text-[12px] text-ink/45">Loading your catalogue…</p>
            ) : catalog.length === 0 ? (
              <p className="text-[12px] text-ink/45">No products in your catalogue yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {catalog.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p)}
                    className="flex flex-col rounded-xl bg-white px-3 py-2 text-left ring-1 ring-black/5 transition hover:ring-brand/30"
                  >
                    <span className="truncate text-sm font-semibold text-ink">{p.name}</span>
                    <span className="text-[11px] text-ink/50">
                      {p.cultivar ? `${p.cultivar} · ` : ""}
                      {p.unitPrice != null ? `${formatMoney(p.unitPrice, p.currency)}/g` : "no price"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* items */}
          <section className="space-y-2">
            <p className={labelCls}>Items</p>
            {lines.length === 0 ? (
              <p className="text-[12px] text-ink/45">Pick a product above to add it to the deal.</p>
            ) : (
              <div className="space-y-2">
                {lines.map((l, i) => (
                  <div key={i} className="rounded-xl bg-white p-3 ring-1 ring-black/5">
                    <div className="flex items-center justify-between gap-2">
                      <input
                        value={l.productName}
                        onChange={(e) => updateLine(i, { productName: e.target.value })}
                        className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-ink focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => removeLine(i)}
                        className="shrink-0 rounded-full p-1 text-ink/35 transition hover:bg-ink/5 hover:text-danger"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        value={l.quantity}
                        onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                        className={inputCls}
                        placeholder="Qty"
                      />
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
                        className={inputCls}
                        placeholder="€ / g (optional)"
                      />
                    </div>
                    <p className="mt-1.5 text-right text-[11px] text-ink/55">
                      {l.unitPrice != null
                        ? formatMoney(l.quantity * l.unitPrice, l.currency)
                        : "Price TBD"}
                    </p>
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

          {/* private box (creator/seller side only) - hidden on a proposal (4.5.2),
              where it would be saved nowhere; it is added after birth via edit */}
          {showPrivate && (
            <section className="space-y-2">
              <p className={labelCls}>
                <span className="inline-flex items-center gap-1">
                  <Lock size={11} /> Only you can see this
                </span>
              </p>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-ink/55">Buying price (from your supplier)</span>
                <input
                  value={privateValue}
                  onChange={(e) => setPrivateValue(e.target.value)}
                  className={inputCls}
                  placeholder="e.g. 3.50 € / g"
                />
              </label>
            </section>
          )}

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
