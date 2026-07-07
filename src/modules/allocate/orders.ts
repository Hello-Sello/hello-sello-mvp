/**
 * Allocate — Orders & offers, REAL Supabase read (Task 1, 260707-0ob plan 2).
 *
 * Seller-scoped: `getSellerOrders()` returns every `deal_card` where the
 * CALLER's own company is the derived seller (`sellerCompanyId`, the single
 * owner of that rule in `@/modules/deals`) — never a row where the caller is
 * the buyer. RLS (`deal_card`/`relationship` membership on either side)
 * already scopes the base read to relationship members; this narrows further
 * to seller-only, matching Allocate's "no buyer analytics" lock (SELL.md) and
 * mitigating T-260707-04.
 *
 * Async, cookie-scoped `createClient` from `@/shared/db/server` — this is
 * called from an async Server Component page (Plan 4), not a client
 * component, mirroring `src/modules/catalog/shop.ts`'s `getMyShop()` pattern.
 *
 * Flat fetches stitched in JS (deal_card → relationship → company →
 * deal_line_item), the same discipline as `src/modules/deals/supabase/reads.ts`.
 */
import { createClient } from "@/shared/db/server";
import { getCurrentCompanyId } from "@/shared/auth";
import { sellerCompanyId, type DealType, type DealCardStatus } from "@/modules/deals";
import { statusOf, orderNumberOf, formatOrderDate, type OrderStatus, type TicketStatus } from "./status";

/** One row of the seller's Orders & offers table (Task 1 artifact contract). */
export interface SellerOrderRow {
  id: string;
  orderNumber: string;
  customerName: string;
  /** DD-Mon-YY, already formatted (formatOrderDate) — the received date is
   *  deal_card.created_at. */
  receivedAt: string;
  /** DD-Mon-YY, already formatted; null when no delivery_date_target is set. */
  deliveryAt: string | null;
  skuCount: number;
  orderedVia: "hello_sello" | "email" | "fax";
  status: OrderStatus;
  valueNet: number | null;
  currency: string;
  buyerCompanyId: string;
}

/**
 * Groups the caller's seller-side deal_cards by calendar day (UTC, from
 * `created_at`) and assigns each a 1-based per-day sequence number, oldest
 * first — the `<seq3>` piece of the HS order number. No sequence column
 * exists (Plan 1 added none); this derives it live, the same "derive, don't
 * store" discipline as `sellerCompanyId`/`docTerm`.
 */
function sequenceByCardId(cards: { id: string; created_at: string }[]): Map<string, number> {
  const dayKey = (iso: string) => {
    const d = new Date(iso);
    return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
  };
  const sorted = [...cards].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const dayCounters = new Map<string, number>();
  const seqByCard = new Map<string, number>();
  for (const c of sorted) {
    const key = dayKey(c.created_at);
    const next = (dayCounters.get(key) ?? 0) + 1;
    dayCounters.set(key, next);
    seqByCard.set(c.id, next);
  }
  return seqByCard;
}

export async function getSellerOrders(): Promise<SellerOrderRow[]> {
  const callerCompanyId = await getCurrentCompanyId();
  if (!callerCompanyId) return [];

  const supabase = await createClient();

  const { data: cards, error: cardsErr } = await supabase
    .from("deal_card")
    .select(
      "id, relationship_id, version, status, deal_type, initiating_company_id, value_net, currency, delivery_date_target, ordered_via, ticket_status, created_at",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (cardsErr) throw cardsErr;
  const cardRows = cards ?? [];
  if (cardRows.length === 0) return [];

  const relationshipIds = Array.from(new Set(cardRows.map((c) => c.relationship_id)));
  const { data: relationships, error: relErr } = await supabase
    .from("relationship")
    .select("id, company_a_id, company_b_id")
    .in("id", relationshipIds);
  if (relErr) throw relErr;
  const relById = new Map((relationships ?? []).map((r) => [r.id, r] as const));

  // T-260707-04 mitigation: keep ONLY rows where the caller is the derived
  // seller — never a row where the caller is the buyer, even though RLS
  // already returns both sides of the relationship.
  const sellerCards = cardRows.filter((c) => {
    const rel = relById.get(c.relationship_id);
    if (!rel) return false;
    const seller = sellerCompanyId(
      { deal_type: c.deal_type as DealType, initiating_company_id: c.initiating_company_id },
      rel.company_a_id,
      rel.company_b_id,
    );
    return seller === callerCompanyId;
  });
  if (sellerCards.length === 0) return [];

  const companyIds = Array.from(
    new Set(
      sellerCards.flatMap((c) => {
        const rel = relById.get(c.relationship_id)!;
        return [rel.company_a_id, rel.company_b_id];
      }),
    ),
  );
  const { data: companies, error: coErr } = await supabase
    .from("company")
    .select("id, name")
    .in("id", companyIds);
  if (coErr) throw coErr;
  const nameById = new Map((companies ?? []).map((c) => [c.id, c.name] as const));

  // current-version-only SKU count per card (mirrors getDealCard's
  // `.eq("version", card.version)` line-item filter, batched across cards).
  const cardIds = sellerCards.map((c) => c.id);
  const { data: lineRows, error: lineErr } = await supabase
    .from("deal_line_item")
    .select("deal_card_id, version")
    .in("deal_card_id", cardIds);
  if (lineErr) throw lineErr;
  const versionByCard = new Map(sellerCards.map((c) => [c.id, c.version] as const));
  const skuCountByCard = new Map<string, number>();
  for (const l of lineRows ?? []) {
    if (l.version !== versionByCard.get(l.deal_card_id)) continue;
    skuCountByCard.set(l.deal_card_id, (skuCountByCard.get(l.deal_card_id) ?? 0) + 1);
  }

  const seqByCard = sequenceByCardId(sellerCards);
  const sellerName = nameById.get(callerCompanyId) ?? "Unknown company";

  return sellerCards.map((c) => {
    const rel = relById.get(c.relationship_id)!;
    const buyerCompanyId = rel.company_a_id === callerCompanyId ? rel.company_b_id : rel.company_a_id;
    const buyerName = nameById.get(buyerCompanyId) ?? "Unknown company";

    return {
      id: c.id,
      orderNumber: orderNumberOf(sellerName, buyerName, c.created_at, seqByCard.get(c.id) ?? 1),
      customerName: buyerName,
      receivedAt: formatOrderDate(c.created_at),
      deliveryAt: c.delivery_date_target ? formatOrderDate(c.delivery_date_target) : null,
      skuCount: skuCountByCard.get(c.id) ?? 0,
      orderedVia: c.ordered_via as SellerOrderRow["orderedVia"],
      status: statusOf({
        status: c.status as DealCardStatus,
        dealType: c.deal_type as DealType,
        ticketStatus: (c.ticket_status ?? null) as TicketStatus,
      }),
      valueNet: c.value_net,
      currency: c.currency,
      buyerCompanyId,
    };
  });
}
