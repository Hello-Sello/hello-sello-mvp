/**
 * Deal card - FRONT (3a, Phase 3): the deal facts.
 *
 * 4.5.3: the card is PURE DISPLAY. The two-sided Seal gate moved to the Sella
 * strip (DealPin State C); the Edit control moved to the card's top-right corner
 * (DealCard). This face now only shows terms, parties, values, products, and the
 * golden Confirmed state - it takes no handlers and triggers no action.
 *
 * Ported from prototypes/dealcard-prototype (locked 2026-06-06) into the real
 * design system (brand / brand-soft / ink, lucide). Layout kept: HS-number band
 * → doc-term line → two logo boxes → value rows → my private field → products.
 *
 * Everything here is DERIVED or stored truth:
 *   - doc term (PO/SO) from deal_type (who issued it) - same for both viewers
 *   - gross computed from net + VAT (not stored)
 *   - the private field is whatever RLS returned for MY side (seller Margin /
 *     buyer placeholder) - the other side's value never arrives.
 */
import { Building2, Lock, BadgeCheck } from "lucide-react";
import { docTerm, computeGross, formatMoney, sumLineValue, averageMarginOf } from "../lib/derive";
import { paymentTermLabel } from "../lib/paymentTerms";
import { ProductList } from "./ProductList";
import type { DealCardView } from "../types";

/** A margin % for the card, or "—" when not computable yet (D-01/D-04). */
function marginLabel(pct: number | null): string {
  return pct == null ? "—" : `${(pct * 100).toFixed(1)}%`;
}

/** The shared "only you" lock span used by every owner-only margin row (D-05). */
function OnlyYou() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-normal text-ink/45">
      <Lock className="h-3 w-3" /> only you
    </span>
  );
}

function dateLabel(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

/** A label-chip + value-box row, the prototype's field shape. */
function Field({
  label,
  children,
  highlight = false,
}: {
  label: string;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-stretch gap-2">
      <div className="flex w-28 items-center rounded-lg bg-brand px-3 py-2 text-xs font-bold text-white">
        {label}
      </div>
      <div
        className={`flex flex-1 items-center rounded-lg px-3 py-2 text-sm font-medium text-ink ${
          highlight ? "bg-brand/10" : "bg-white"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function LogoBox({ role, name, isYou }: { role: string; name: string; isYou: boolean }) {
  return (
    <div className="flex flex-1 flex-col rounded-xl bg-white p-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-ink/40">
        <Building2 className="h-3 w-3" />
        {role}
        {isYou && <span className="text-brand">· you</span>}
      </div>
      <div className="flex flex-1 items-center justify-center py-1.5 text-center text-sm font-black leading-tight text-ink">
        {name}
      </div>
    </div>
  );
}

export function CardFront({ data }: { data: DealCardView }) {
  const { card, sellerName, buyerName, lineItems, lineMargins, viewerSide, confirmations, myNote, theirNote } = data;
  const term = docTerm(card.deal_type);
  // CARD-01 (OBS-1): the value is SUMMED live from the priced lines, never the
  // stale stored `value_net` (which can be a leftover 0). null = no priced line.
  const net = sumLineValue(lineItems);
  // CARD-03: two already-stored terms the card never showed. Both arrive on
  // `card` (no new plumbing): payment_terms_code is a column, free_delivery is a
  // metadata boolean - same read pattern as EditDealForm.
  const meta = (card.metadata ?? {}) as Record<string, unknown>;
  const freeDelivery = meta.free_delivery === true;
  const paymentLabel = paymentTermLabel(card.payment_terms_code);
  const hsNumber = card.hs_deal_number ?? `${term} · draft`;
  // NOTE-01: myNote/theirNote resolve by structural company identity (D-06), but
  // the viewer-relative name lines up exactly with viewerSide's seller/buyer split.
  const myCompanyName = viewerSide === "seller" ? sellerName : buyerName;
  const theirCompanyName = viewerSide === "seller" ? buyerName : sellerName;

  // MRGN-01: per-line margin label needs the product name; map line id -> name.
  // The deal AVERAGE is computed HERE from lineMargins (WARNING 4 - the read does
  // not supply it), so a later quantity-weighted rollup is a one-file change.
  const productNameById = new Map(lineItems.map((l) => [l.id, l.productName] as const));
  const avgMargin = averageMarginOf(lineMargins.map((m) => m.marginPercent));

  // golden when both sides are in (status is the source of truth, seats confirm it)
  const confirmed =
    card.status === "confirmed" ||
    (confirmations.length === 2 && confirmations.every((s) => s.status === "confirmed"));

  return (
    <div
      className={`w-[340px] rounded-3xl border p-3 shadow-xl ring-1 ${
        confirmed
          ? "border-amber-300 bg-amber-50 ring-amber-200"
          : "border-brand/15 bg-[#ffe2ee] ring-black/5"
      }`}
    >
      {/* HS number band - turns gold + gains a verified tick when confirmed */}
      <div
        className={`flex items-center justify-center gap-1.5 rounded-xl py-1.5 text-center text-sm font-bold tracking-wide text-white ${
          confirmed ? "bg-amber-500" : "bg-brand"
        }`}
      >
        {confirmed && <BadgeCheck size={15} strokeWidth={2.5} />}
        {hsNumber}
      </div>

      {/* document term + date */}
      <div className="mt-1.5 rounded-xl bg-white py-1.5 text-center text-xs text-ink/70">
        {term} from {dateLabel(card.created_at)}
      </div>
      {/* the two parties */}
      <div className="mt-1.5 flex gap-2">
        <LogoBox role="Seller" name={sellerName} isYou={viewerSide === "seller"} />
        <LogoBox role="Buyer" name={buyerName} isYou={viewerSide === "buyer"} />
      </div>
      {/* facts */}
      <div className="mt-1.5 space-y-1.5">
        <Field label="Value net">
          {net == null ? "—" : formatMoney(net, card.currency)}
        </Field>
        <Field label="Value gross">
          {net == null ? "—" : formatMoney(computeGross(net), card.currency)}
        </Field>
        {/* MRGN-01: an owner-only margin % per priced line + one deal average,
            all reusing the lock-icon "only you" idiom (D-01/D-04/D-05). */}
        {lineMargins.map((m) => {
          const name = productNameById.get(m.lineItemId);
          if (name == null) return null; // defensive: line not found
          return (
            <Field key={m.lineItemId} label={`${name} margin`} highlight>
              <span className="flex items-center gap-1.5">
                {marginLabel(m.marginPercent)}
                <OnlyYou />
              </span>
            </Field>
          );
        })}
        <Field label="Avg. margin" highlight>
          <span className="flex items-center gap-1.5">
            {marginLabel(avgMargin)}
            <OnlyYou />
          </span>
        </Field>
        <Field label="Delivery">{dateLabel(card.delivery_date_target)}</Field>
        <Field label="Payment terms">{paymentLabel}</Field>
        <Field label="Free delivery">{freeDelivery ? "Yes" : "No"}</Field>
        <Field label="Products">{String(lineItems.length)}</Field>
        {/* NOTE-01: both sides' card notes, from birth. Plain text children only
            (React escapes by default) - never raw-HTML injection (Security §V5). */}
        <Field label={`${myCompanyName} notes`}>{myNote ?? "—"}</Field>
        <Field label={`${theirCompanyName} notes`}>{theirNote ?? "—"}</Field>
      </div>
      {/* products */}
      <div className="mt-1.5">
        <ProductList items={lineItems} />
      </div>
    </div>
  );
}
