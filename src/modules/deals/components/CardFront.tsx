/**
 * Deal card - FRONT (3a, Phase 3): the deal facts.
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
import { Building2, Lock } from "lucide-react";
import { docTerm, computeGross, formatMoney } from "../lib/derive";
import { ProductList } from "./ProductList";
import type { DealCardView, PartyFieldView } from "../types";

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
  const { card, sellerName, buyerName, lineItems, partyFields, viewerSide } = data;
  const term = docTerm(card.deal_type);
  const net = card.value_net ?? 0;
  const hsNumber = card.hs_deal_number ?? `${term} · draft`;

  return (
    <div className="w-[340px] rounded-3xl border border-brand/15 bg-[#ffe2ee] p-3 shadow-xl ring-1 ring-black/5">
      {/* HS number band */}
      <div className="rounded-xl bg-brand py-1.5 text-center text-sm font-bold tracking-wide text-white">
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
        <Field label="Value net">{formatMoney(net, card.currency)}</Field>
        <Field label="Value gross">{formatMoney(computeGross(net), card.currency)}</Field>
        {partyFields.map((f: PartyFieldView) => (
          <Field key={f.id} label={f.label} highlight>
            <span className="flex items-center gap-1.5">
              {f.value ?? "—"}
              <span className="inline-flex items-center gap-0.5 text-[10px] font-normal text-ink/45">
                <Lock className="h-3 w-3" /> only you
              </span>
            </span>
          </Field>
        ))}
        <Field label="Delivery">{dateLabel(card.delivery_date_target)}</Field>
        <Field label="Products">{String(lineItems.length)}</Field>
      </div>
      {/* products */}
      <div className="mt-1.5">
        <ProductList items={lineItems} />
      </div>
    </div>
  );
}
