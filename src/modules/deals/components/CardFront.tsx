"use client";

/**
 * Deal card - FRONT, rebuilt as the 8-part living document (07-07, D-11..D-26).
 *
 * The card is no longer pure display: it is the visible centerpiece that consumes
 * everything the earlier waves built. The 8 parts (D-11), top -> bottom:
 *   1. TOOLBAR      - "Talk about this deal" (opens the group picker, D-05/D-29) +
 *                     a post-close reopen-ticket button (D-29). Fixed.
 *   2. LETTERHEAD   - deal number + date + a neutral status pill. Fixed. The
 *                     finished-deal skin is removed (D-17: the only closed cue is
 *                     the pencil -> lock in DealCard).
 *   3. PARTIES      - seller -> buyer. Fixed.
 *   4. PRODUCTS     - the product table; read-only rows (ProductList) or inline
 *                     row-edit when the card is in edit mode (D-16). A held change
 *                     renders as the on-card red/green diff (NegotiationDiff, D-18);
 *                     a promotion's reward lines render in the yellow track.
 *   5. EXTRA CONDS  - delivery / payment / free delivery + a Discounts section of
 *                     its OWN (D-13); fully SELLER-ONLY to edit. Non-product
 *                     promotion rewards render here (D-22).
 *   6. OPEN ITEMS   - the flat Things list (OpenItems, D-15). No stages.
 *   7. NOTES        - one per party; each edits only its own; blank never shown (D-14).
 *   8. DECISION     - Negotiate / Sign on a held change (DecisionBar, D-19/D-20), or
 *                     the "Send change" bar while editing.
 *
 * Per-part edit ownership (D-12/D-13/D-14): products jointly edit quantity/unit +
 * add-from-shop / swap / remove, but price + batch are SELLER-ONLY (buyer locked);
 * extra conditions are seller-only; notes are per-party. Money is ALWAYS the
 * canonical per-gram value (sumLineValue / lineValueOf) - never size x units x price.
 *
 * A completed inline edit reuses the existing engine VERBATIM (D-20): it calls
 * proposeDealChange with the required change reason (REAS-01); the OTHER side then
 * sees the diff + DecisionBar. No new RPC.
 */
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Lock,
  MessageSquarePlus,
  Plus,
  RefreshCcw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { averageMarginOf, formatMoney, lineValueOf, sumLineValue } from "../lib/derive";
import { paymentTermLabel } from "../lib/paymentTerms";
import { getOwnCatalog, getPromotion } from "../supabase/reads";
import { proposeDealChange, reopenTicket } from "../actions";
import { ProductList } from "./ProductList";
import { NegotiationDiff } from "./NegotiationDiff";
import { DecisionBar } from "./DecisionBar";
import { PromotionTrack } from "./PromotionTrack";
import { OpenItems } from "./OpenItems";
import type {
  CatalogProduct,
  DealCardView,
  DraftLineInput,
  PromotionView,
  ThingView,
} from "../types";

/** One editable product line while the card is in inline edit mode. */
interface EditLine {
  key: string;
  lineItemId: string | null;
  productId: string | null;
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number | null;
  currency: string;
  cultivar: string | null;
  pzn: string | null;
  batchId: string | null;
  batchNumber: string | null;
  thcPercent: number | null;
  cbdPercent: number | null;
  ownInput: number | null;
}

/** A margin % for the card, or "—" when not computable yet. */
function marginLabel(pct: number | null): string {
  return pct == null ? "—" : `${(pct * 100).toFixed(1)}%`;
}

function dateLabel(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  withdrawn: "Withdrawn",
  confirmed: "Confirmed",
  amended: "Open",
  done: "Deal executed",
  cancelled: "Cancelled",
  ticket_created: "Ticket opened",
  ticket_closed: "Ticket closed",
};
function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? "Open";
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Seed the editable line set from the card's current lines + my per-line inputs. */
function seedLines(data: DealCardView): EditLine[] {
  const marginByLineId = new Map(data.lineMargins.map((m) => [m.lineItemId, m.ownInput]));
  return data.lineItems.map((li) => ({
    key: li.id,
    lineItemId: li.id,
    productId: li.productId,
    productName: li.productName,
    quantity: li.quantity,
    unit: li.unit,
    unitPrice: li.unitPrice,
    currency: li.currency,
    cultivar: li.cultivar,
    pzn: li.pzn,
    batchId: li.batchId,
    batchNumber: li.batchNumber,
    thcPercent: li.thcPercent,
    cbdPercent: li.cbdPercent,
    ownInput: marginByLineId.get(li.id) ?? null,
  }));
}

/** The edit-preview total on the canonical per-gram basis (unpriced lines excluded). */
function editTotalOf(lines: EditLine[]): number | null {
  const priced = lines.filter((l) => l.unitPrice != null);
  if (priced.length === 0) return null;
  return priced.reduce((sum, l) => sum + lineValueOf(l.quantity, l.unit, l.unitPrice as number), 0);
}

/** One conditional note row. Renders nothing when the text is empty/blank (D-14). */
function Note({ company, text }: { company: string; text: string | null }) {
  if (!text || !text.trim()) return null;
  return (
    <div className="border-t border-ink/10 py-2 first:border-t-0">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-brand text-[9px] font-bold text-white">
          {initialsOf(company)}
        </span>
        <span className="text-[11px] font-semibold text-ink">{company}</span>
      </div>
      <div className="pl-6 text-[12px] text-ink/55">{text}</div>
    </div>
  );
}

/** A hairline-divided section (the V3 `.sec` primitive): one top divider, one inset. */
function Sec({ children }: { children: React.ReactNode }) {
  return <div className="mx-4 border-t border-ink/10 py-3">{children}</div>;
}

export function CardFront({
  data,
  things = [],
  workspaceId,
  editMode = false,
  onExitEdit,
}: {
  data: DealCardView;
  /** the flat Open Items list (D-15); wired from the panel host / 07-08. */
  things?: ThingView[];
  /** the deal_workspace_id - lets Open Items inline-add (createThing). */
  workspaceId?: string | null;
  /** whether the whole card is in inline row-edit mode (D-16); owned by DealCard. */
  editMode?: boolean;
  /** leave edit mode after a successful "Send change". */
  onExitEdit?: () => void;
}) {
  const { card, sellerName, buyerName, lineItems, lineMargins, viewerSide, myNote, theirNote } = data;
  const cardId = card.id;
  const isSeller = viewerSide === "seller";
  const isClosed = card.status === "done";

  // CARD-01: the value is SUMMED live from the priced lines (canonical per-gram),
  // never the stale stored value_net. null = no priced line -> "—".
  const net = sumLineValue(lineItems);
  const valueNet = net == null ? "—" : formatMoney(net, card.currency);

  const meta = (card.metadata ?? {}) as Record<string, unknown>;
  const freeDeliveryStored = meta.free_delivery === true;
  const paymentLabel = paymentTermLabel(card.payment_terms_code);
  const hsNumber =
    card.hs_deal_number ?? `HS-${card.id.replace(/-/g, "").slice(-4).toUpperCase()}`;

  const myCompanyName = isSeller ? sellerName : buyerName;
  const theirCompanyName = isSeller ? buyerName : sellerName;
  const avgMargin = averageMarginOf(lineMargins.map((m) => m.marginPercent));

  /* ---- promotion (independent yellow track, D-21/D-26) ---- */
  const [promotion, setPromotion] = useState<PromotionView | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => {
      void getPromotion(cardId)
        .then((p) => {
          if (alive) setPromotion(p);
        })
        .catch(() => {});
    };
    load();
    const onUpdated = (e: Event) => {
      const id = (e as CustomEvent<{ dealCardId?: string }>).detail?.dealCardId;
      if (!id || id === cardId) load();
    };
    window.addEventListener("hs:deal-updated", onUpdated);
    return () => {
      alive = false;
      window.removeEventListener("hs:deal-updated", onUpdated);
    };
  }, [cardId]);

  /* ---- inline edit state (D-16), seeded the moment edit mode turns on ---- */
  const [lines, setLines] = useState<EditLine[]>([]);
  const [editFreeDelivery, setEditFreeDelivery] = useState(false);
  const [editDueDate, setEditDueDate] = useState("");
  const [editPaymentCode, setEditPaymentCode] = useState("");
  const [editNote, setEditNote] = useState("");
  const [reason, setReason] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Seed the editable fields from the current card ONLY on the edit-mode
  // transition - React's documented "adjust state when a prop changes" render
  // pattern (no effect, no ref). A later re-read while editing does NOT reseed, so
  // in-flight edits are preserved; toggling edit off then on reseeds fresh.
  const [editSeeded, setEditSeeded] = useState(false);
  if (editMode && !editSeeded) {
    setEditSeeded(true);
    setLines(seedLines(data));
    setEditFreeDelivery(freeDeliveryStored);
    setEditDueDate(card.delivery_date_target ? card.delivery_date_target.slice(0, 10) : "");
    setEditPaymentCode(card.payment_terms_code ?? "");
    setEditNote(myNote ?? "");
    setReason("");
    setSendError(null);
  } else if (!editMode && editSeeded) {
    setEditSeeded(false);
  }

  /* ---- catalogue for add-from-shop / swap (seller-only, D-12) ---- */
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  useEffect(() => {
    if (!editMode || !isSeller) return;
    let alive = true;
    void getOwnCatalog()
      .then((c) => {
        if (alive) setCatalog(c);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [editMode, isSeller]);

  function updateLine(key: string, patch: Partial<EditLine>) {
    setLines((cur) => cur.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function removeLine(key: string) {
    setLines((cur) => cur.filter((l) => l.key !== key));
  }
  function lineFromCatalog(p: CatalogProduct): EditLine {
    return {
      key: crypto.randomUUID(),
      lineItemId: null,
      productId: p.id,
      productName: p.name,
      quantity: p.packSizeGrams ?? 1,
      unit: p.unit,
      unitPrice: p.unitPrice,
      currency: p.currency,
      cultivar: p.cultivar,
      pzn: p.pzn,
      batchId: null,
      batchNumber: null,
      thcPercent: p.thcPercent,
      cbdPercent: p.cbdPercent,
      ownInput: null,
    };
  }
  function addFromCatalog(productId: string) {
    const p = catalog.find((c) => c.id === productId);
    if (p) setLines((cur) => [...cur, lineFromCatalog(p)]);
  }
  // D-12: swapping a product resets the line's other values (remove-old + add-new
  // fresh) - a NEW line with no carried lineItemId / private input.
  function swapProduct(key: string, productId: string) {
    const p = catalog.find((c) => c.id === productId);
    if (!p) return;
    setLines((cur) => cur.map((l) => (l.key === key ? { ...lineFromCatalog(p), key } : l)));
  }

  async function onSendChange() {
    if (sendBusy || !reason.trim()) return;
    setSendBusy(true);
    setSendError(null);
    try {
      const payloadLines: DraftLineInput[] = lines.map((l) => ({
        productId: l.productId,
        lineItemId: l.lineItemId ?? undefined,
        productName: l.productName,
        quantity: l.quantity,
        unit: l.unit,
        unitPrice: l.unitPrice,
        currency: l.currency,
        cultivar: l.cultivar,
        pzn: l.pzn,
        thcPercent: l.thcPercent,
        cbdPercent: l.cbdPercent,
        batchId: l.batchId,
        batchNumber: l.batchNumber,
        ownInput: l.ownInput,
      }));
      await proposeDealChange({
        dealCardId: cardId,
        lines: payloadLines,
        freeDelivery: editFreeDelivery,
        dueDate: editDueDate || null,
        paymentTermsCode: editPaymentCode || null,
        note: editNote || null,
        reason: reason.trim(),
      });
      window.dispatchEvent(new CustomEvent("hs:deal-updated", { detail: { dealCardId: cardId } }));
      onExitEdit?.();
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Could not send the change.");
    } finally {
      setSendBusy(false);
    }
  }

  /* ---- toolbar actions ---- */
  const [reopenBusy, setReopenBusy] = useState(false);
  function onTalkAboutDeal() {
    // opens the messaging GroupPicker in deal mode (07-05) - window-event contract
    // keeps deals <-> messaging acyclic.
    window.dispatchEvent(new CustomEvent("hs:new-group", { detail: { dealCardId: cardId } }));
  }
  async function onReopen() {
    if (reopenBusy) return;
    setReopenBusy(true);
    try {
      await reopenTicket({ dealCardId: cardId });
      window.dispatchEvent(new CustomEvent("hs:deal-updated", { detail: { dealCardId: cardId } }));
    } catch {
      // surfaced by the host re-read; keep the card usable
    } finally {
      setReopenBusy(false);
    }
  }

  const editTotal = editTotalOf(lines);
  const canEditConditions = isSeller; // D-13: extra conditions are seller-only
  const conditionRewards = promotion?.conditionDeltas ?? [];

  return (
    <div className="w-full max-w-full overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-black/5">
      {/* ---- 1 · TOOLBAR (fixed) ---- */}
      <div className="flex items-center gap-2 px-4 pl-12 pt-3">
        <button
          type="button"
          onClick={onTalkAboutDeal}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft/40 px-3 py-1 text-[11px] font-semibold text-brand-deep transition hover:bg-brand-soft/70"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" /> Talk about this deal
        </button>
        {isClosed && (
          <button
            type="button"
            disabled={reopenBusy}
            onClick={() => void onReopen()}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold text-ink/60 ring-1 ring-ink/15 transition hover:bg-ink/5 disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" /> {reopenBusy ? "Opening…" : "Reopen ticket"}
          </button>
        )}
      </div>

      {/* ---- 2 · LETTERHEAD (fixed; finished-deal skin removed, D-17) ---- */}
      <div className="px-4 pb-2 pt-2">
        <div className="flex items-center gap-2 font-mono">
          <span className="text-[9px] font-bold tracking-[0.18em] text-brand-deep">DEAL</span>
          <span className="truncate text-[10px] tracking-wide tabular-nums text-ink/55">
            {hsNumber}
          </span>
        </div>
        <div className="relative mt-1 inline-block pb-1.5">
          <span className="text-[26px] font-semibold leading-none tracking-tight tabular-nums text-ink">
            {valueNet}
          </span>
          <span className="absolute bottom-0 left-0 h-[2px] w-9 rounded bg-brand-deep" />
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[10px] text-ink/55">
            {lineItems.length} {lineItems.length === 1 ? "product" : "products"} ·{" "}
            {dateLabel(card.created_at)}
          </span>
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold text-brand-deep"
            style={{ background: "color-mix(in srgb, var(--color-brand-deep) 10%, transparent)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            {statusLabel(card.status)} · v{card.version}
          </span>
        </div>
      </div>

      {/* ---- 3 · PARTIES (fixed) ---- */}
      <div className="flex items-center justify-center gap-2.5 border-y border-ink/10 px-4 py-3">
        <div className="text-center">
          <div className="text-[9.5px] uppercase tracking-wider text-ink/45">Seller</div>
          <div className="text-[13px] font-bold text-ink">
            {sellerName}
            {isSeller && <span className="ml-1 text-[10px] font-bold text-brand">· you</span>}
          </div>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-brand" strokeWidth={2.2} />
        <div className="text-center">
          <div className="text-[9.5px] uppercase tracking-wider text-ink/45">Buyer</div>
          <div className="text-[13px] font-bold text-ink">
            {buyerName}
            {viewerSide === "buyer" && (
              <span className="ml-1 text-[10px] font-bold text-brand">· you</span>
            )}
          </div>
        </div>
      </div>

      {/* ---- 4 · PRODUCTS ---- */}
      <div className="px-4 pt-2">
        {editMode ? (
          <div className="flex flex-col gap-2">
            {lines.map((l) => (
              <div key={l.key} className="rounded-xl border border-ink/10 bg-white/60 p-2">
                <div className="mb-1.5 flex items-center gap-2">
                  {isSeller && catalog.length > 0 ? (
                    <select
                      value={l.productId ?? ""}
                      onChange={(e) => swapProduct(l.key, e.target.value)}
                      className="min-w-0 flex-1 rounded-md bg-white px-2 py-1 text-[12px] font-semibold text-ink ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-brand/30"
                    >
                      <option value={l.productId ?? ""}>{l.productName}</option>
                      {catalog
                        .filter((c) => c.id !== l.productId)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-ink">
                      {l.productName}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeLine(l.key)}
                    title="Remove line"
                    aria-label="Remove line"
                    className="shrink-0 text-ink/35 transition hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[12px]">
                  {/* quantity + unit: JOINTLY editable (D-12) */}
                  <input
                    type="number"
                    min={0}
                    value={l.quantity}
                    onChange={(e) => updateLine(l.key, { quantity: Number(e.target.value) })}
                    className="w-20 rounded-md bg-white px-2 py-1 tabular-nums ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-brand/30"
                  />
                  <select
                    value={l.unit}
                    onChange={(e) => updateLine(l.key, { unit: e.target.value })}
                    className="rounded-md bg-white px-2 py-1 ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-brand/30"
                  >
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                    <option value="unit">unit</option>
                  </select>
                  {/* price: SELLER-ONLY (buyer locked, D-12) */}
                  {isSeller ? (
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={l.unitPrice ?? ""}
                      placeholder="price"
                      onChange={(e) =>
                        updateLine(l.key, {
                          unitPrice: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      className="w-24 rounded-md bg-white px-2 py-1 tabular-nums ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-brand/30"
                    />
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-ink/5 px-2 py-1 tabular-nums text-ink/55">
                      <Lock className="h-3 w-3" />
                      {l.unitPrice != null ? `${formatMoney(l.unitPrice, l.currency)}/${l.unit}` : "—"}
                    </span>
                  )}
                  {/* batch: SELLER-owned; buyer sees it locked (D-12) */}
                  {l.batchNumber && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-ink/5 px-2 py-1 text-[11px] text-ink/55">
                      {!isSeller && <Lock className="h-3 w-3" />}
                      Batch {l.batchNumber}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {/* add-from-shop: SELLER-ONLY (own catalogue, D-12) */}
            {isSeller && catalog.length > 0 && (
              <div className="flex items-center gap-2">
                <Plus className="h-3.5 w-3.5 text-brand-deep" />
                <select
                  value=""
                  onChange={(e) => e.target.value && addFromCatalog(e.target.value)}
                  className="flex-1 rounded-md bg-white px-2 py-1 text-[12px] text-ink/70 ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-brand/30"
                >
                  <option value="">Add from shop…</option>
                  {catalog.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-baseline justify-between border-t border-ink/10 px-1 pt-2 text-[12px]">
              <span className="text-ink/50">Total (preview)</span>
              <span className="font-mono font-semibold text-ink">
                {editTotal == null ? "—" : formatMoney(editTotal, card.currency)}
              </span>
            </div>
          </div>
        ) : (
          <ProductList items={lineItems} />
        )}
      </div>

      {/* red/green diff for a HELD change (D-18) - only outside edit mode */}
      {!editMode && data.pendingChange && (
        <div className="px-4 pt-2">
          <NegotiationDiff
            current={lineItems}
            proposed={data.pendingChange.lines}
            currency={data.pendingChange.currency}
          />
        </div>
      )}

      {/* the yellow promotion track (D-21..D-26) - never gates Sign */}
      {!editMode && promotion && (
        <div className="px-4 pt-2">
          <PromotionTrack promotion={promotion} dealCardId={cardId} />
        </div>
      )}

      {/* ---- 5 · EXTRA CONDITIONS (seller-only, Discounts its OWN section, D-13) ---- */}
      <Sec>
        <div className="mb-2 flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wide text-ink/45">
            Extra conditions
          </span>
          {!canEditConditions && <Lock className="h-3 w-3 text-ink/35" />}
        </div>
        {editMode && canEditConditions ? (
          <div className="grid grid-cols-3 gap-2 text-[12px]">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-ink/45">Delivery</span>
              <input
                type="date"
                value={editDueDate}
                onChange={(e) => setEditDueDate(e.target.value)}
                className="rounded-md bg-white px-2 py-1 ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-ink/45">Payment</span>
              <input
                type="text"
                value={editPaymentCode}
                placeholder="e.g. net30"
                onChange={(e) => setEditPaymentCode(e.target.value)}
                className="rounded-md bg-white px-2 py-1 ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-ink/45">Free delivery</span>
              <input
                type="checkbox"
                checked={editFreeDelivery}
                onChange={(e) => setEditFreeDelivery(e.target.checked)}
                className="mt-1 h-4 w-4 accent-brand"
              />
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-ink/45">Delivery</div>
              <div className="text-[13px] font-semibold tabular-nums text-ink">
                {dateLabel(card.delivery_date_target)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-ink/45">Payment</div>
              <div className="text-[13px] font-semibold text-ink">{paymentLabel}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-ink/45">Free delivery</div>
              <div className="text-[13px] font-semibold text-ink">
                {freeDeliveryStored ? "Yes" : "No"}
              </div>
            </div>
          </div>
        )}

        {/* Discounts - its OWN labeled section (D-13); promotion non-product rewards
            render here, not in the product table (D-22). */}
        <div className="mt-3 border-t border-ink/10 pt-2">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-ink/45">
            Discounts
          </div>
          {conditionRewards.length > 0 ? (
            <ul className="flex flex-col gap-0.5">
              {conditionRewards.map((c, i) => (
                <li key={i} className="text-[12px] font-medium text-amber-700">
                  {c.label}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-[12px] text-ink/40">None</div>
          )}
        </div>
      </Sec>

      {/* ---- owner margin (private, "only you" lock) ---- */}
      <Sec>
        <div
          className="flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-[12px]"
          style={{
            borderColor: "color-mix(in srgb, var(--color-brand-deep) 32%, transparent)",
            background: "color-mix(in srgb, var(--color-brand-deep) 5%, transparent)",
          }}
        >
          <Lock className="h-[12px] w-[12px] text-brand-deep" />
          <span className="text-ink/55">Your avg. margin</span>
          <span className="ml-auto font-bold tabular-nums text-brand-deep">
            {marginLabel(avgMargin)}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-deep/70">
            only you
          </span>
        </div>
      </Sec>

      {/* ---- 6 · OPEN ITEMS (flat, D-15) ---- */}
      <Sec>
        <OpenItems
          things={things}
          workspaceId={workspaceId}
          viewerCompanyId={isSeller ? data.sellerCompanyId : null}
        />
      </Sec>

      {/* ---- 7 · NOTES (per-party, D-14) ---- */}
      {editMode ? (
        <Sec>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-ink/45">
            Your note
          </div>
          <textarea
            value={editNote}
            onChange={(e) => setEditNote(e.target.value)}
            rows={2}
            placeholder="A note the other side will see on your behalf…"
            className="w-full resize-none rounded-lg bg-white px-3 py-2 text-[12px] text-ink ring-1 ring-black/5 placeholder:text-ink/35 focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          {/* the other side's note stays read-only; blank never shown (D-14) */}
          <Note company={theirCompanyName} text={theirNote} />
        </Sec>
      ) : (
        ((theirNote && theirNote.trim()) || (myNote && myNote.trim())) && (
          <Sec>
            <Note company={theirCompanyName} text={theirNote} />
            <Note company={myCompanyName} text={myNote} />
          </Sec>
        )
      )}

      {/* ---- 8 · DECISION ---- */}
      {editMode ? (
        <Sec>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-ink/45">
            Send this change
          </div>
          <p className="mb-2 text-[11px] text-ink/55">
            The other side reviews it before it takes effect. Say what changed and why.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="e.g. Bumped the price to match the new supplier cost…"
            className="w-full resize-none rounded-lg bg-white px-3 py-2 text-[12px] text-ink ring-1 ring-black/5 placeholder:text-ink/35 focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          {sendError && <p className="mt-1 text-[11px] text-danger">{sendError}</p>}
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => onExitEdit?.()}
              className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-ink/55 ring-1 ring-ink/15 transition hover:bg-ink/5"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={sendBusy || !reason.trim()}
              onClick={() => void onSendChange()}
              className="rounded-lg bg-brand px-4 py-1.5 text-[12px] font-semibold text-white transition hover:bg-brand-deep disabled:opacity-50"
            >
              {sendBusy ? "Sending…" : "Send change"}
            </button>
          </div>
        </Sec>
      ) : (
        data.pendingChange && (
          <Sec>
            <DecisionBar data={data} />
          </Sec>
        )
      )}

      {/* a subtle "editing" affordance echo so the mode is unmistakable */}
      {editMode && (
        <div className="flex items-center justify-center gap-1.5 pb-3 text-[10px] font-semibold uppercase tracking-wide text-brand-deep/70">
          <RefreshCcw className="h-3 w-3" /> Editing - changes are proposed, not saved directly
        </div>
      )}

      <div className="h-2" />
    </div>
  );
}
