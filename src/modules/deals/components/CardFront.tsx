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
  History,
  Lock,
  MessageSquarePlus,
  Plus,
  RefreshCcw,
  RotateCcw,
  Trash2,
  X,
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
  MemberView,
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

/** One conditional note row (prototype `.note`). Renders nothing when the text is
 *  empty/blank (D-14) - a blank note is never shown to the other side. */
function Note({ company, text }: { company: string; text: string | null }) {
  if (!text || !text.trim()) return null;
  return (
    <div
      className="mt-2 rounded-[8px_14px_14px_8px] border border-[color:var(--dc-hairline)] px-4 py-2.5 first:mt-0"
      style={{ borderLeft: "3px solid var(--dc-pink)", background: "rgba(122,18,48,0.035)" }}
    >
      <div className="mb-1 flex items-center gap-1.5">
        <span className="grid h-[16px] w-[16px] shrink-0 place-items-center rounded-full bg-[color:var(--dc-pink)] text-[8px] font-bold text-white">
          {initialsOf(company)}
        </span>
        <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--dc-ink-38)]">
          Note - {company}
        </span>
      </div>
      <div className="text-[13px] leading-relaxed text-[color:var(--dc-ink-70)]">{text}</div>
    </div>
  );
}

/** A hairline-divided section on the paper slip: one top divider + vertical rhythm. */
function Sec({ children }: { children: React.ReactNode }) {
  return <div className="border-t border-[color:var(--dc-hairline)] py-3">{children}</div>;
}

/** The torn top edge of the paper slip (prototype `.tear`). */
function TearTop() {
  return (
    <svg className="dc-tear" viewBox="0 0 160 10" preserveAspectRatio="none" aria-hidden="true">
      <path
        fill="#FFFFFF"
        d="M0 10 L5 3 L10 10 L15 1.5 L20 10 L25 4 L30 10 L35 2 L40 10 L45 5 L50 10 L55 2.5 L60 10 L65 1 L70 10 L75 3.5 L80 10 L85 2 L90 10 L95 4.5 L100 10 L105 1.5 L110 10 L115 3 L120 10 L125 5 L130 10 L135 2 L140 10 L145 3.5 L150 10 L155 1 L160 10 Z"
      />
    </svg>
  );
}

/** The torn bottom edge of the paper slip (prototype `.tear`, bottom fill). */
function TearBottom() {
  return (
    <svg className="dc-tear" viewBox="0 0 160 10" preserveAspectRatio="none" aria-hidden="true">
      <path
        fill="#FFF9FA"
        d="M0 0 L5 7 L10 0 L15 8.5 L20 0 L25 6 L30 0 L35 8 L40 0 L45 5 L50 0 L55 7.5 L60 0 L65 9 L70 0 L75 6.5 L80 0 L85 8 L90 0 L95 5.5 L100 0 L105 8.5 L110 0 L115 7 L120 0 L125 5 L130 0 L135 8 L140 0 L145 6.5 L150 0 L155 9 L160 0 Z"
      />
    </svg>
  );
}

export function CardFront({
  data,
  things = [],
  workspaceId,
  editMode = false,
  onExitEdit,
  onActivity,
  onClose,
  people = [],
  viewerPersonId,
  viewerCompanyId,
}: {
  data: DealCardView;
  /** the flat Open Items list (D-15); wired from the panel host / 07-08. */
  things?: ThingView[];
  /** the deal_workspace_id - lets Open Items inline-add (createThing). */
  workspaceId?: string | null;
  /** both companies' deal members - Open Items' assignable people (@mention/assign). */
  people?: MemberView[];
  /** the viewer's person id - marks "You" + enables assigning in Open Items. */
  viewerPersonId?: string | null;
  /** the viewer's company id - Open Items' private ownership + filter. */
  viewerCompanyId?: string | null;
  /** whether the whole card is in inline row-edit mode (D-16); owned by DealCard. */
  editMode?: boolean;
  /** leave edit mode after a successful "Send change". */
  onExitEdit?: () => void;
  /** flip to the Signals & Logs back face - the title-bar "Activity" control.
   *  Owned by DealCard (which holds the flip state); the pill hides when absent. */
  onActivity?: () => void;
  /** close the whole card panel - the title-bar X (from the panel host). Absent =
   *  no X (e.g. the workspace/inline mounts that have no panel to close). */
  onClose?: () => void;
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
    <div className="dealcard w-full max-w-full">
      {/* ---- 1 · TITLE BAR — frosted control strip. The flip + edit/lock circles
             (DealCard) float into the pl-12 / pr-12 gutters, so they read as the
             left-most and right-most controls of this bar. (fixed) ---- */}
      <div className="dc-titlebar flex items-center gap-2 py-2.5 pl-12 pr-12">
        {/* close the panel - lives ON the title bar now (no separate strip above),
            so the X shares this line instead of costing its own row. */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close deal card"
            title="Close"
            className="dc-tb-btn grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={onTalkAboutDeal}
          className="dc-tb-pill inline-flex min-w-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold"
        >
          <MessageSquarePlus className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Talk about this deal</span>
        </button>
        {onActivity && (
          <button
            type="button"
            onClick={onActivity}
            title="Activity — signals & logs"
            aria-label="Activity"
            className="dc-tb-btn grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full"
          >
            <History className="h-3.5 w-3.5" />
          </button>
        )}
        <div className="flex-1" />
        {isClosed && (
          <button
            type="button"
            disabled={reopenBusy}
            onClick={() => void onReopen()}
            className="dc-tb-pill inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" /> {reopenBusy ? "Opening…" : "Reopen"}
          </button>
        )}
      </div>

      {/* ---- The torn white paper slip: it holds parts 2–7 (the deal facts). ---- */}
      <div className="dc-paper-wrap mx-3.5 mb-4 mt-3">
        <TearTop />
        <div className="dc-paper px-5 pb-4">
          {/* ---- 2 · MASTHEAD (fixed; finished-deal skin removed, D-17) ---- */}
          <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 pb-2 pt-3.5">
            <div className="dc-wordmark text-[16px] leading-tight">He//oSe//o</div>
            <div className="text-right">
              <div className="truncate font-mono text-[10.5px] tracking-wide text-[color:var(--dc-ink-70)]">
                {hsNumber}
              </div>
              <div className="mt-0.5 flex items-center justify-end gap-1.5 text-[10px] text-[color:var(--dc-ink-55)]">
                <span>{dateLabel(card.created_at)}</span>
              </div>
            </div>
          </header>
          <div className="dc-double-rule" />

          {/* ---- 3 · PARTIES (fixed) - seller pinned to the LEFT end, buyer to the
                 RIGHT end of the paper, arrow between, so the two sides read as
                 clearly opposite ends (feedback: two different ends). ---- */}
          <div className="flex items-baseline justify-between gap-3 py-3">
            <div className="flex min-w-0 items-baseline gap-1.5">
              <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.16em] text-[color:var(--dc-ink-38)]">
                Seller
              </span>
              <span className="truncate text-[13.5px] font-bold text-[color:var(--dc-ink)]">
                {sellerName}
              </span>
              {isSeller && (
                <span className="shrink-0 text-[11px] font-semibold text-[color:var(--dc-pink)]">
                  · You
                </span>
              )}
            </div>
            <ArrowRight
              className="h-3.5 w-3.5 shrink-0 self-center text-[color:var(--dc-pink)]"
              strokeWidth={2.2}
            />
            <div className="flex min-w-0 items-baseline justify-end gap-1.5 text-right">
              <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.16em] text-[color:var(--dc-ink-38)]">
                Buyer
              </span>
              <span className="truncate text-[13.5px] font-bold text-[color:var(--dc-ink)]">
                {buyerName}
              </span>
              {viewerSide === "buyer" && (
                <span className="shrink-0 text-[11px] font-semibold text-[color:var(--dc-pink)]">
                  · You
                </span>
              )}
            </div>
          </div>

          {/* ---- 4 · PRODUCTS ---- */}
          <section className="border-t border-[color:var(--dc-hairline)] pb-1 pt-2">
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

            {/* red/green diff for a HELD change (D-18) - only outside edit mode.
                Money is via sumLineValue in NegotiationDiff (never size×units×price). */}
            {!editMode && data.pendingChange && (
              <div className="mt-3">
                <NegotiationDiff
                  current={lineItems}
                  proposed={data.pendingChange.lines}
                  currency={data.pendingChange.currency}
                />
              </div>
            )}

            {/* the yellow promotion track (D-21..D-26) - never gates Sign */}
            {!editMode && promotion && (
              <div className="mt-3">
                <PromotionTrack promotion={promotion} dealCardId={cardId} />
              </div>
            )}

            {/* total net - hidden while a diff shows its own new-total, so the
                card never shows two competing totals (CARD-01 live sum). */}
            {!editMode && !data.pendingChange && (
              <div className="mt-3 flex items-baseline gap-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--dc-ink-38)]">
                  Total net
                </span>
                <span className="ml-auto text-[22px] font-extrabold leading-none tabular-nums tracking-tight text-[color:var(--dc-ink)]">
                  {valueNet}
                </span>
              </div>
            )}
          </section>

      {/* ---- 5 · EXTRA CONDITIONS (seller-only, Discounts its OWN section, D-13) ---- */}
      <Sec>
        <div className="mb-2 flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--dc-ink-38)]">
            Extra conditions
          </span>
          {!canEditConditions && <Lock className="h-3 w-3 text-[color:var(--dc-ink-38)]" />}
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
            <div className="dc-term rounded-2xl px-3 py-2.5">
              <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-[color:var(--dc-ink-38)]">
                Delivery
              </div>
              <div className="mt-0.5 text-[12.5px] font-semibold tabular-nums text-[color:var(--dc-ink)]">
                {dateLabel(card.delivery_date_target)}
              </div>
            </div>
            <div className="dc-term rounded-2xl px-3 py-2.5">
              <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-[color:var(--dc-ink-38)]">
                Payment
              </div>
              <div className="mt-0.5 text-[12.5px] font-semibold text-[color:var(--dc-ink)]">
                {paymentLabel}
              </div>
            </div>
            <div className="dc-term rounded-2xl px-3 py-2.5">
              <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-[color:var(--dc-ink-38)]">
                Free delivery
              </div>
              <div className="mt-0.5 text-[12.5px] font-semibold text-[color:var(--dc-ink)]">
                {freeDeliveryStored ? "Yes" : "No"}
              </div>
            </div>
          </div>
        )}

        {/* Discounts - its OWN labeled section (D-13); promotion non-product rewards
            render here, not in the product table (D-22). */}
        <div className="mt-3 border-t border-[color:var(--dc-hairline)] pt-2.5">
          <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[color:var(--dc-ink-38)]">
            Discounts
          </div>
          {conditionRewards.length > 0 ? (
            <ul className="flex flex-col gap-0.5">
              {conditionRewards.map((c, i) => (
                <li key={i} className="text-[12px] font-semibold text-[color:var(--dc-promo)]">
                  {c.label}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-[12px] text-[color:var(--dc-ink-38)]">None</div>
          )}
        </div>
      </Sec>

      {/* ---- owner margin (private, "only you" - prototype .private-box) ---- */}
      <Sec>
        <div className="dc-private flex items-center gap-2 rounded-2xl px-3 py-2.5 text-[12px]">
          <Lock className="h-[13px] w-[13px] text-[color:var(--dc-pink-deep)]" />
          <span className="text-[color:var(--dc-ink-55)]">Your avg. margin</span>
          <span className="ml-auto font-bold tabular-nums text-[color:var(--dc-pink-deep)]">
            {marginLabel(avgMargin)}
          </span>
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[color:var(--dc-maroon)]">
            Only you
          </span>
        </div>
      </Sec>

      {/* ---- 6 · OPEN ITEMS (flat, D-15) ---- */}
      <Sec>
        <OpenItems
          things={things}
          workspaceId={workspaceId}
          people={people}
          viewerPersonId={viewerPersonId}
          viewerCompanyId={viewerCompanyId ?? (isSeller ? data.sellerCompanyId : null)}
        />
      </Sec>

      {/* ---- 7 · NOTES (per-party, D-14) ---- */}
      {editMode ? (
        <Sec>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--dc-ink-38)]">
            Your note
          </div>
          <textarea
            value={editNote}
            onChange={(e) => setEditNote(e.target.value)}
            rows={2}
            placeholder="A note the other side will see on your behalf…"
            className="w-full resize-none rounded-lg bg-white px-3 py-2 text-[12px] text-[color:var(--dc-ink)] ring-1 ring-black/5 placeholder:text-[color:var(--dc-ink-38)] focus:outline-none focus:ring-2 focus:ring-brand/30"
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

        </div>
        <TearBottom />
      </div>
      {/* ---- /paper slip ---- */}

      {/* ---- 8 · DECISION - the footer sitting on the glass, below the paper.
             It only appears when there is something to act on: a proposed change
             to send (edit mode) or a held change to Negotiate / Sign. ---- */}
      {editMode ? (
        <div className="dc-decision px-4 pb-3.5 pt-3">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--dc-ink-38)]">
            Send this change
          </div>
          <p className="mb-2 text-[11px] text-[color:var(--dc-ink-55)]">
            The other side reviews it before it takes effect. Say what changed and why.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="e.g. Bumped the price to match the new supplier cost…"
            className="w-full resize-none rounded-lg bg-white px-3 py-2 text-[12px] text-[color:var(--dc-ink)] ring-1 ring-black/5 placeholder:text-[color:var(--dc-ink-38)] focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          {sendError && <p className="mt-1 text-[11px] text-danger">{sendError}</p>}
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => onExitEdit?.()}
              className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-[color:var(--dc-ink-55)] ring-1 ring-black/10 transition hover:bg-black/5"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={sendBusy || !reason.trim()}
              onClick={() => void onSendChange()}
              className="rounded-full bg-[color:var(--dc-pink)] px-4 py-1.5 text-[12px] font-bold text-white transition hover:bg-[color:var(--dc-pink-deep)] disabled:opacity-50"
            >
              {sendBusy ? "Sending…" : "Send change"}
            </button>
          </div>
          {/* a subtle "editing" affordance echo so the mode is unmistakable */}
          <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--dc-pink-deep)]">
            <RefreshCcw className="h-3 w-3" /> Editing - changes are proposed, not saved directly
          </div>
        </div>
      ) : (
        data.pendingChange && (
          <div className="dc-decision px-4 pb-3.5 pt-3.5">
            <DecisionBar data={data} />
          </div>
        )
      )}
    </div>
  );
}
