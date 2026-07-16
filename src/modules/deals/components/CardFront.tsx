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
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  History,
  Lock,
  MessageSquarePlus,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { averageMarginOf, formatMoney, lineValueOf } from "../lib/derive";
import { paymentTermLabel } from "../lib/paymentTerms";
import { getOwnCatalog, getPromotion } from "../supabase/reads";
import { proposeDealChange } from "../actions";
import { NegotiationDiff } from "./NegotiationDiff";
import { DecisionBar } from "./DecisionBar";
import { PromotionTrack } from "./PromotionTrack";
import { OpenItems } from "./OpenItems";
import type {
  CardCreateInput,
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
  /**
   * How many packs of this line (chj/07-08, FRONTEND-ONLY mock). Our backend has
   * no units count - the canonical value is per-gram (quantity x price, CARD-02).
   * `units` is a visual multiplier on that per-gram value; it starts at 1 so the
   * total matches real data on load, and the stepper just multiplies it in the UI.
   * It is NOT persisted (today's demo is frontend-only).
   */
  units: number;
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
    units: 1,
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

/** One line's total: the canonical per-gram value x the (mock) pack count. */
function lineTotalOf(l: EditLine): number | null {
  if (l.unitPrice == null) return null;
  return lineValueOf(l.quantity, l.unit, l.unitPrice) * Math.max(1, l.units);
}

/* FRONTEND-ONLY mock option lists (chj/07-08) - the edit dropdowns for batch +
   unit size. No backend yet; the current value is always merged in so it stays
   selectable. Ported from the chat-flipdoc prototype. */
const MOCK_BATCHES = ["24-098", "24-117", "24-201", "25-034", "25-112"];
const MOCK_SIZES = [100, 250, 500, 1000];
/** the current value merged into the option list, sorted, de-duped. */
function withCurrent(options: number[], current: number): number[] {
  return Array.from(new Set([...options, current])).sort((a, b) => a - b);
}

/** The edit-preview total: sum of the per-line totals (unpriced lines excluded). */
function editTotalOf(lines: EditLine[]): number | null {
  const priced = lines.filter((l) => l.unitPrice != null);
  if (priced.length === 0) return null;
  return priced.reduce((sum, l) => sum + (lineTotalOf(l) ?? 0), 0);
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
  onActivity,
  onClose,
  people = [],
  viewerPersonId,
  viewerCompanyId,
  createMode = false,
  onCreate,
  onExitEdit,
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
  /** flip to the Signals & Logs back face - the title-bar "Activity" control.
   *  Owned by DealCard (which holds the flip state); the pill hides when absent. */
  onActivity?: () => void;
  /** close the whole card panel - the title-bar X (from the panel host). Absent =
   *  no X (e.g. the workspace/inline mounts that have no panel to close). */
  onClose?: () => void;
  /**
   * CREATE MODE (chj/07-08): the card is a NOT-yet-born draft. Edit mode is forced
   * on, the id-bound sections (promotion / Open Items / margin) are hidden, and the
   * footer becomes "Send deal" instead of "Send change". Pressing it hands the
   * assembled draft up via `onCreate`; the strip runs `createDeal` + opens the born
   * card. This replaced the old CreateDealForm.
   */
  createMode?: boolean;
  onCreate?: (input: CardCreateInput) => Promise<void>;
  /** leave edit mode - called after a successful "Send changes" so the diff shows.
   *  Owned by DealCard (which holds editMode). */
  onExitEdit?: () => void;
}) {
  const { card, sellerName, buyerName, lineItems, lineMargins, viewerSide, myNote, theirNote } = data;
  const cardId = card.id;
  const isSeller = viewerSide === "seller";

  const meta = (card.metadata ?? {}) as Record<string, unknown>;
  const freeDeliveryStored = meta.free_delivery === true;
  const hsNumber =
    card.hs_deal_number ?? `HS-${card.id.replace(/-/g, "").slice(-4).toUpperCase()}`;

  const myCompanyName = isSeller ? sellerName : buyerName;
  const theirCompanyName = isSeller ? buyerName : sellerName;
  const avgMargin = averageMarginOf(lineMargins.map((m) => m.marginPercent));

  /* ---- promotion (independent yellow track, D-21/D-26) ---- */
  const [promotion, setPromotion] = useState<PromotionView | null>(null);
  useEffect(() => {
    if (createMode) return; // no born card yet - nothing to load / listen for
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
  }, [cardId, createMode]);

  /* ---- inline edit state (D-16), seeded the moment edit mode turns on ---- */
  const [lines, setLines] = useState<EditLine[]>([]);
  // which product row is expanded for editing (per-row edit, chj/07-08); null = none.
  const [editRowKey, setEditRowKey] = useState<string | null>(null);
  const [editFreeDelivery, setEditFreeDelivery] = useState(false);
  const [editDueDate, setEditDueDate] = useState("");
  // deal expiry (chj/07-08, FRONTEND-ONLY mock - no backend field yet).
  const [editExpiry, setEditExpiry] = useState("");
  const [editPaymentCode, setEditPaymentCode] = useState("");
  const [editNote, setEditNote] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Seed the working copy from the SERVER card (chj/07-08) - the "adjust state when
  // a prop changes" render pattern (no effect, no ref). The card renders from this
  // local copy in both read and edit; the read view mirrors the server, and edits
  // are staged here until the ✓ commits them via proposeDealChange.
  //
  // Reseed key = a signature of the SERVER data (status + held-change id + line
  // shape), NOT just the card id, so the read view follows the server after a
  // change commits or is declined. Gated on `!editMode` so a live edit (or a
  // realtime change mid-edit) never clobbers what the user is typing; create mode
  // seeds once (its empty draft never changes server-side).
  const changeSig = data.pendingChange
    ? `${data.pendingChange.baseVersion}:${data.pendingChange.summary}`
    : "";
  const dataSig = createMode
    ? "new"
    : `${cardId}|${card.status}|${changeSig}|` +
      lineItems
        .map((li) => `${li.productId ?? li.productName}:${li.quantity}:${li.unit}:${li.unitPrice}`)
        .join(",");
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (seededFor !== dataSig && (createMode || !editMode)) {
    setSeededFor(dataSig);
    setLines(seedLines(data));
    setEditRowKey(null);
    setEditFreeDelivery(freeDeliveryStored);
    setEditDueDate(card.delivery_date_target ? card.delivery_date_target.slice(0, 10) : "");
    setEditExpiry(typeof meta.deal_expiry === "string" ? meta.deal_expiry : "");
    setEditPaymentCode(card.payment_terms_code ?? "");
    setEditNote(myNote ?? "");
    setSendError(null);
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
  // step the (mock) pack count, floored at 1.
  function bumpUnits(key: string, delta: number) {
    setLines((cur) =>
      cur.map((l) => (l.key === key ? { ...l, units: Math.max(1, l.units + delta) } : l)),
    );
  }
  function removeLine(key: string) {
    setLines((cur) => cur.filter((l) => l.key !== key));
    setEditRowKey((k) => (k === key ? null : k));
  }
  function lineFromCatalog(p: CatalogProduct): EditLine {
    return {
      key: crypto.randomUUID(),
      lineItemId: null,
      productId: p.id,
      productName: p.name,
      quantity: p.packSizeGrams ?? 1,
      unit: p.unit,
      units: 1,
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
    if (p) {
      const line = lineFromCatalog(p);
      setLines((cur) => [...cur, line]);
      setEditRowKey(line.key); // a fresh product lands straight in row-edit
    }
  }
  // D-12: swapping a product resets the line's other values (remove-old + add-new
  // fresh) - a NEW line with no carried lineItemId / private input.
  function swapProduct(key: string, productId: string) {
    const p = catalog.find((c) => c.id === productId);
    if (!p) return;
    setLines((cur) => cur.map((l) => (l.key === key ? { ...lineFromCatalog(p), key } : l)));
  }

  // CREATE MODE (chj/07-08): "Send deal" on a not-yet-born draft. Same line
  // mapping as onSendChange, but it hands the draft UP via onCreate (the strip
  // runs createDeal + opens the born card) instead of proposeDealChange. No
  // change reason - a first draft is not a negotiation.
  async function onSendCreate() {
    if (sendBusy || !onCreate || lines.length === 0) return;
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
      await onCreate({
        lines: payloadLines,
        freeDelivery: editFreeDelivery,
        dueDate: editDueDate || null,
        paymentTermsCode: editPaymentCode || null,
        note: editNote || null,
      });
      // the strip dispatches hs:open-deal-card + closes this create panel on success.
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Could not create the deal.");
    } finally {
      setSendBusy(false);
    }
  }

  // COMMIT AN EDIT (chj/07-08): pressing the header ✓ leaves edit mode; if the
  // SHARED payload actually changed vs the server, stage it as a negotiation change
  // via proposeDealChange (auto reason - no permission modal, matching the direct-
  // edit intent). The OTHER side then sees the red/green diff + DecisionBar. A no-op
  // ✓ (nothing changed) does NOT propose, so it never creates an empty held change.
  async function doSendChange() {
    if (createMode || cardId === "new" || sendBusy || lines.length === 0) return;

    // change detection vs the server card. `units` is a frontend-only mock and never
    // enters the payload, so a units-only bump correctly does NOT propose.
    const norm = (s: string | null) => (s && s.trim() ? s.trim() : null);
    const shape = (key: string, q: number, u: string, p: number | null) =>
      `${key}|${q}|${u}|${p ?? ""}`;
    const workingLines = lines
      .map((l) => shape(l.productId ?? l.productName.toLowerCase().trim(), l.quantity, l.unit, l.unitPrice))
      .sort()
      .join(",");
    const serverLines = lineItems
      .map((li) => shape(li.productId ?? li.productName.toLowerCase().trim(), li.quantity, li.unit, li.unitPrice))
      .sort()
      .join(",");
    const workingTerms = [editFreeDelivery, norm(editDueDate), norm(editPaymentCode), norm(editNote)].join("|");
    const serverTerms = [
      freeDeliveryStored,
      card.delivery_date_target ? card.delivery_date_target.slice(0, 10) : null,
      norm(card.payment_terms_code ?? null),
      norm(myNote ?? null),
    ].join("|");
    if (workingLines === serverLines && workingTerms === serverTerms) {
      // nothing SHARED changed - the most common cause is a units-only bump (a local
      // preview). Tell the user rather than failing silently.
      setSendError(
        "Nothing to send yet - the pack count is a local preview. Change the unit size, price or a condition first.",
      );
      return;
    }

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
        reason: "Updated the deal on the card",
      });
      window.dispatchEvent(
        new CustomEvent("hs:deal-updated", { detail: { dealCardId: cardId } }),
      );
      // leave edit mode so the read view + red/green diff show (the send succeeded).
      onExitEdit?.();
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Could not send the change.");
    } finally {
      setSendBusy(false);
    }
  }

  // When edit mode turns OFF, drop any UNSENT local edits so the read view always
  // matches the server (= exactly what the other side sees). Sending is an explicit
  // "Send changes" button (below); resetting seededFor re-runs the render-time reseed
  // from the server card. This runs whether the user sent (already reseeds from the
  // fresh data) or abandoned the edit.
  const prevEditRef = useRef(editMode);
  useEffect(() => {
    const was = prevEditRef.current;
    prevEditRef.current = editMode;
    if (was && !editMode) setSeededFor(null);
  }, [editMode]);

  /* ---- toolbar actions ---- */
  function onTalkAboutDeal() {
    // opens the messaging GroupPicker in deal mode (07-05) - window-event contract
    // keeps deals <-> messaging acyclic.
    window.dispatchEvent(new CustomEvent("hs:new-group", { detail: { dealCardId: cardId } }));
  }

  // CARD-01: the deal value is SUMMED live from the (working-copy) priced lines x
  // the mock pack count - reflects edits directly. null = no priced line -> "—".
  const editTotal = editTotalOf(lines);
  const valueNet = editTotal == null ? "—" : formatMoney(editTotal, card.currency);
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
        {/* reopen moved to the single bottom decision bar ("Open a ticket", chj/07-08) */}
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
            <div className="flex flex-col gap-2">
                {/* ONE table for read + edit (chj/07-08). In edit mode every row gets
                    an Edit + Delete button and the open row (editRowKey) turns editable
                    with a checkmark; edits apply DIRECTLY (no send, no permission).
                    Role-gated: the buyer edits unit size + units only; batch + price
                    stay locked. */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[11px]">
                    <thead>
                      <tr className="text-[8.5px] font-bold uppercase tracking-[0.08em] text-[color:var(--dc-ink-38)]">
                        <th className="py-1 pr-1 text-left font-bold">Product</th>
                        <th className="py-1 pr-1 text-left font-bold">Batch</th>
                        <th className="py-1 pr-1 text-right font-bold">Unit size</th>
                        <th className="py-1 pr-1 text-right font-bold">Units</th>
                        <th className="py-1 pr-1 text-right font-bold">Price</th>
                        <th className="py-1 pr-1 text-right font-bold">Total</th>
                        {editMode && <th className="py-1" />}
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => {
                        const total = lineTotalOf(l);
                        const totalLabel = total == null ? "—" : formatMoney(total, l.currency);
                        const priceLabel =
                          l.unitPrice != null
                            ? `${formatMoney(l.unitPrice, l.currency)}/${l.unit}`
                            : "—";
                        if (editMode && editRowKey === l.key) {
                          /* ---- the OPEN, editable row ---- */
                          return (
                            <tr key={l.key} className="border-t border-ink/10 align-middle">
                              <td className="py-1.5 pr-1 font-semibold text-ink">
                                {isSeller && catalog.length > 0 ? (
                                  <select
                                    value={l.productId ?? ""}
                                    onChange={(e) => swapProduct(l.key, e.target.value)}
                                    className="min-w-0 max-w-[92px] rounded-md bg-white px-1 py-1 text-[11px] font-semibold text-ink ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-brand/30"
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
                                  <span className="block max-w-[92px] truncate">{l.productName}</span>
                                )}
                              </td>
                              {/* batch: SELLER picks from the shop's lots (mock); BUYER locked */}
                              <td className="py-1.5 pr-1">
                                {isSeller ? (
                                  <select
                                    value={l.batchNumber ?? ""}
                                    onChange={(e) =>
                                      updateLine(l.key, { batchNumber: e.target.value || null })
                                    }
                                    className="rounded-md bg-white px-1 py-1 tabular-nums ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-brand/30"
                                  >
                                    <option value="">—</option>
                                    {Array.from(
                                      new Set([
                                        ...(l.batchNumber ? [l.batchNumber] : []),
                                        ...MOCK_BATCHES,
                                      ]),
                                    ).map((b) => (
                                      <option key={b} value={b}>
                                        {b}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="inline-flex items-center gap-1 tabular-nums text-ink/55">
                                    {l.batchNumber ?? "—"}
                                    <Lock className="h-3 w-3" />
                                  </span>
                                )}
                              </td>
                              {/* unit size: ONE dropdown of pack sizes (both sides edit) */}
                              <td className="py-1.5 pr-1 text-right">
                                <select
                                  value={l.quantity}
                                  onChange={(e) =>
                                    updateLine(l.key, { quantity: Number(e.target.value) })
                                  }
                                  className="rounded-md bg-white px-1 py-1 text-right tabular-nums ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-brand/30"
                                >
                                  {withCurrent(MOCK_SIZES, l.quantity).map((s) => (
                                    <option key={s} value={s}>
                                      {s} g
                                    </option>
                                  ))}
                                </select>
                              </td>
                              {/* units: stepper (both sides edit) */}
                              <td className="py-1.5 pr-1 text-right">
                                <span className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => bumpUnits(l.key, -1)}
                                    aria-label="Fewer units"
                                    className="grid h-4 w-4 place-items-center rounded-full bg-brand-soft/40 text-[11px] font-bold text-brand-deep transition hover:bg-brand-soft"
                                  >
                                    −
                                  </button>
                                  <b className="w-4 text-center tabular-nums">{l.units}</b>
                                  <button
                                    type="button"
                                    onClick={() => bumpUnits(l.key, 1)}
                                    aria-label="More units"
                                    className="grid h-4 w-4 place-items-center rounded-full bg-brand-soft/40 text-[11px] font-bold text-brand-deep transition hover:bg-brand-soft"
                                  >
                                    +
                                  </button>
                                </span>
                              </td>
                              {/* price: SELLER edits; BUYER locked */}
                              <td className="py-1.5 pr-1 text-right">
                                {isSeller ? (
                                  <span className="inline-flex items-center gap-0.5">
                                    <input
                                      type="number"
                                      min={0}
                                      step="0.01"
                                      value={l.unitPrice ?? ""}
                                      placeholder="0"
                                      onChange={(e) =>
                                        updateLine(l.key, {
                                          unitPrice:
                                            e.target.value === "" ? null : Number(e.target.value),
                                        })
                                      }
                                      className="w-12 rounded-md bg-white px-1 py-1 text-right tabular-nums ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-brand/30"
                                    />
                                    <span className="text-ink/45">€/{l.unit}</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 tabular-nums text-ink/55">
                                    <Lock className="h-3 w-3" />
                                    {priceLabel}
                                  </span>
                                )}
                              </td>
                              <td className="py-1.5 pr-1 text-right font-mono tabular-nums">
                                {totalLabel}
                              </td>
                              <td className="py-1.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => setEditRowKey(null)}
                                  title="Done with this row"
                                  aria-label="Done editing this line"
                                  className="grid h-6 w-6 place-items-center rounded-md text-brand-deep ring-1 ring-black/10 transition hover:bg-brand-soft/40"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        }
                        /* ---- a READ row: values (+ Edit / Delete only in edit mode) ---- */
                        return (
                          <tr key={l.key} className="border-t border-ink/10 align-middle">
                            <td className="py-1.5 pr-1 font-semibold text-ink">{l.productName}</td>
                            <td className="py-1.5 pr-1 tabular-nums text-ink/70">
                              {l.batchNumber ?? "—"}
                            </td>
                            <td className="py-1.5 pr-1 text-right tabular-nums text-ink/80">
                              {l.quantity} {l.unit}
                            </td>
                            <td className="py-1.5 pr-1 text-right tabular-nums text-ink/80">
                              {l.units}
                            </td>
                            <td className="py-1.5 pr-1 text-right tabular-nums text-ink/80">
                              {priceLabel}
                            </td>
                            <td className="py-1.5 pr-1 text-right font-mono tabular-nums">
                              {totalLabel}
                            </td>
                            {editMode && (
                              <td className="py-1.5 pl-1">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setEditRowKey(l.key)}
                                    title="Edit this line"
                                    aria-label="Edit this line"
                                    className="grid h-6 w-6 place-items-center rounded-md text-ink/45 ring-1 ring-black/10 transition hover:bg-black/5 hover:text-ink"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeLine(l.key)}
                                    title="Remove this product"
                                    aria-label="Remove this product"
                                    className="grid h-6 w-6 place-items-center rounded-md text-ink/45 ring-1 ring-black/10 transition hover:bg-black/5 hover:text-danger"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* add product - role-labeled (chj/07-08). Seller pulls from their own
                    shop (real catalogue); the buyer sees the seller's shared shop, a
                    frontend-only placeholder for today. */}
                {editMode &&
                  (isSeller ? (
                    catalog.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Plus className="h-3.5 w-3.5 text-brand-deep" />
                        <select
                          value=""
                          onChange={(e) => e.target.value && addFromCatalog(e.target.value)}
                          className="flex-1 rounded-md bg-white px-2 py-1 text-[12px] text-ink/70 ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-brand/30"
                        >
                          <option value="">+ Add product from your shop…</option>
                          {catalog.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )
                  ) : (
                    <button
                      type="button"
                      disabled
                      title="Coming soon"
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-brand/40 px-3 py-2 text-[12px] font-semibold text-brand-deep opacity-60"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add product from the seller&apos;s shop (shared with you)
                    </button>
                  ))}
              </div>

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
          <>
            <div className="grid grid-cols-3 gap-2 text-[12px]">
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
              {/* deal expiry - FRONTEND-ONLY mock for today (chj/07-08) */}
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-ink/45">Deal expiry</span>
                <input
                  type="date"
                  value={editExpiry}
                  onChange={(e) => setEditExpiry(e.target.value)}
                  className="rounded-md bg-white px-2 py-1 ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </label>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-ink/45">Delivery</span>
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={editFreeDelivery}
                    onChange={(e) => setEditFreeDelivery(e.target.checked)}
                    className="h-4 w-4 accent-brand"
                  />
                  <span className="text-[12px]">Free delivery</span>
                </label>
                {!editFreeDelivery && (
                  <input
                    type="date"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    className="rounded-md bg-white px-2 py-1 ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-brand/30"
                  />
                )}
              </div>
            </div>
            {/* discount + bundle: grayed for now (chj/07-08); wired in a later step */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled
                title="Coming soon"
                className="cursor-not-allowed rounded-full border border-dashed border-ink/25 px-3 py-1.5 text-[11px] font-semibold text-ink/40"
              >
                + Discount
              </button>
              <button
                type="button"
                disabled
                title="Coming soon"
                className="cursor-not-allowed rounded-full border border-dashed border-ink/25 px-3 py-1.5 text-[11px] font-semibold text-ink/40"
              >
                + Bundle deal
              </button>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {/* read view from the working copy (chj/07-08) so seller edits stick */}
            <div className="dc-term rounded-2xl px-3 py-2.5">
              <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-[color:var(--dc-ink-38)]">
                Payment
              </div>
              <div className="mt-0.5 text-[12.5px] font-semibold text-[color:var(--dc-ink)]">
                {editPaymentCode ? paymentTermLabel(editPaymentCode) : "—"}
              </div>
            </div>
            <div className="dc-term rounded-2xl px-3 py-2.5">
              <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-[color:var(--dc-ink-38)]">
                Deal expiry
              </div>
              <div className="mt-0.5 text-[12.5px] font-semibold tabular-nums text-[color:var(--dc-ink)]">
                {editExpiry ? dateLabel(editExpiry) : "—"}
              </div>
            </div>
            <div className="dc-term rounded-2xl px-3 py-2.5">
              <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-[color:var(--dc-ink-38)]">
                Delivery
              </div>
              <div className="mt-0.5 text-[12.5px] font-semibold tabular-nums text-[color:var(--dc-ink)]">
                {editFreeDelivery
                  ? "Free delivery"
                  : editDueDate
                    ? dateLabel(editDueDate)
                    : "—"}
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

      {/* ---- owner margin (private, "only you" - prototype .private-box) ----
             hidden in create mode: the margin rolls up from born line-private rows
             that do not exist yet. */}
      {!createMode && (
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
      )}

      {/* ---- 6 · OPEN ITEMS (flat, D-15) ---- hidden in create mode: Open Items
             live on the deal_workspace that is born with the card. */}
      {!createMode && (
        <Sec>
          <OpenItems
            things={things}
            workspaceId={workspaceId}
            people={people}
            viewerPersonId={viewerPersonId}
            viewerCompanyId={viewerCompanyId ?? (isSeller ? data.sellerCompanyId : null)}
          />
        </Sec>
      )}

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
        ((theirNote && theirNote.trim()) || (editNote && editNote.trim())) && (
          <Sec>
            <Note company={theirCompanyName} text={theirNote} />
            {/* own note from the working copy (chj/07-08) so the edit sticks */}
            <Note company={myCompanyName} text={editNote} />
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
        createMode ? (
          /* CREATE MODE footer (chj/07-08): a brand-new draft is not a
             negotiation, so there is no change-reason box. "Send deal" hands the
             draft up + the strip births it via createDeal. */
          <div className="dc-decision px-4 pb-3.5 pt-3">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--dc-ink-38)]">
              Send this deal
            </div>
            <p className="mb-2 text-[11px] text-[color:var(--dc-ink-55)]">
              Add your products, conditions and a note, then send it straight into the chat.
            </p>
            {sendError && <p className="mt-1 text-[11px] text-danger">{sendError}</p>}
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => onClose?.()}
                className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-[color:var(--dc-ink-55)] ring-1 ring-black/10 transition hover:bg-black/5"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={sendBusy || lines.length === 0}
                onClick={() => void onSendCreate()}
                className="rounded-full bg-[color:var(--dc-pink)] px-4 py-1.5 text-[12px] font-bold text-white transition hover:bg-[color:var(--dc-pink-deep)] disabled:opacity-50"
              >
                {sendBusy ? "Sending…" : "Send deal"}
              </button>
            </div>
          </div>
        ) : (
          /* EDIT MODE, existing deal (chj/07-08): ONE explicit "Send changes" button.
             No reason box, no permission step - a single click stages the edits as a
             negotiation change; the other side then sees a red/green diff to sign. */
          <div className="dc-decision px-4 pb-3.5 pt-3">
            {sendError && <p className="mb-2 text-[11px] font-medium text-danger">{sendError}</p>}
            <button
              type="button"
              disabled={sendBusy}
              onClick={() => void doSendChange()}
              className="w-full rounded-full bg-[color:var(--dc-pink)] px-4 py-2.5 text-[13px] font-bold text-white transition hover:bg-[color:var(--dc-pink-deep)] disabled:opacity-50"
            >
              {sendBusy ? "Sending…" : `Send changes to ${theirCompanyName}`}
            </button>
            <p className="mt-1.5 text-center text-[10.5px] text-[color:var(--dc-ink-38)]">
              The other side sees a red/green diff and signs. Pack count is a preview only.
            </p>
          </div>
        )
      ) : (
        /* READ MODE (chj/07-08): the single bottom decision bar owns the whole
           lifecycle - Sign / Negotiate / Decline (draft), Upload invoice (seller,
           signed), Open a ticket (done). It decides what to show from the status. */
        <DecisionBar data={data} workspaceId={workspaceId} />
      )}
    </div>
  );
}
