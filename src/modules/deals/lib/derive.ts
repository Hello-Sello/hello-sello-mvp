/**
 * Deals - pure derivation helpers (no Supabase, no React → unit-testable).
 *
 * These encode the "derive, don't store" decisions from the 3a plan (§1, §6):
 *   - PO/SO label is derived from who issued the deal (deal_type), never stored.
 *   - gross is derived from net + VAT, never stored.
 *   - which company is the seller is derived from deal_type + the initiator.
 *
 * Keeping these here (pure) means the card components stay thin and the rules
 * are testable in isolation. The prototype's PO/SO + money math ports straight in.
 */
import type { DealType, PartySide } from "../types";

/**
 * German standard VAT. A demo simplification: gross = net × (1 + rate).
 * The stored truth is `value_net`; gross is always computed from it so the two
 * can never drift. Real per-line/per-jurisdiction tax is a post-demo concern.
 */
export const DEMO_VAT_RATE = 0.19;

/** The minimum a deal card needs for who-issued-it derivations. */
type IssuerFacts = {
  deal_type: DealType;
  initiating_company_id: string;
};

/**
 * The document term, derived from who issued the deal.
 * `offer` = seller-initiated → the seller issued it → it is a **Sales Order**.
 * `order` = buyer-initiated  → the buyer issued it  → it is a **Purchase Order**.
 * Both parties see the SAME label - a PO is a PO to whoever holds it.
 */
export function docTerm(dealType: DealType): "Purchase Order" | "Sales Order" {
  return dealType === "offer" ? "Sales Order" : "Purchase Order";
}

/** Short form of {@link docTerm} ("SO" / "PO"), for the HS-number chip etc. */
export function docAbbr(dealType: DealType): "PO" | "SO" {
  return dealType === "offer" ? "SO" : "PO";
}

/**
 * The company that is the **seller** in this deal, derived.
 * `offer` (seller-initiated) → the initiator is the seller.
 * `order` (buyer-initiated)  → the seller is the OTHER company in the relationship.
 * Needs the relationship's two company ids to name "the other one".
 */
export function sellerCompanyId(
  card: IssuerFacts,
  companyAId: string,
  companyBId: string,
): string {
  if (card.deal_type === "offer") return card.initiating_company_id;
  return card.initiating_company_id === companyAId ? companyBId : companyAId;
}

/** The company that is the **buyer** in this deal - the side that is not the seller. */
export function buyerCompanyId(
  card: IssuerFacts,
  companyAId: string,
  companyBId: string,
): string {
  const seller = sellerCompanyId(card, companyAId, companyBId);
  return seller === companyAId ? companyBId : companyAId;
}

/**
 * Which side the viewer is on. Decides which private field the viewer sees
 * (seller → Margin; buyer → placeholder) and which seeded signals to show.
 * NOTE: this does NOT change the {@link docTerm} label.
 */
export function viewerSide(
  viewerCompanyId: string,
  card: IssuerFacts,
  companyAId: string,
  companyBId: string,
): PartySide {
  return viewerCompanyId === sellerCompanyId(card, companyAId, companyBId)
    ? "seller"
    : "buyer";
}

/**
 * Gross value from net + VAT. The card stores only `value_net`; the front
 * shows gross by computing it here, so there is one source of truth (the net).
 */
export function computeGross(net: number, vatRate: number = DEMO_VAT_RATE): number {
  return net * (1 + vatRate);
}

/**
 * Money for display, German locale ("23.000 €", "25.390,50 €").
 * Drops the decimals when the amount is whole; keeps up to 2 otherwise.
 */
export function formatMoney(amount: number, currency: string = "EUR"): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * The line total for a product row: the stored `line_total` when present,
 * else quantity × unit_price (so the card never shows a blank total).
 */
export function lineTotalOf(
  quantity: number,
  unitPrice: number,
  storedTotal: number | null,
): number {
  return storedTotal ?? quantity * unitPrice;
}
