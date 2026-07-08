/**
 * Deal Calendar — REAL Supabase reads, both sides (deal-calendar.md §5).
 *
 * `getSellerCalendarDeals()` returns one `CalendarDeal` per seller-side
 * `deal_card` — the pill on the counterparty's calendar row. `getBuyerCalendarDeals()`
 * (18-03) is its buyer-side twin. Both mirror `getSellerOrders()`'s discipline
 * exactly (same narrowing-after-RLS, same flat-fetch-then-stitch); the only
 * differences from an orders row are the projected shape (a calendar pill) and
 * that a pill is positioned by `calendarDay` (delivery ?? created) and carries
 * the reused `statusOf` display stage as its colour key + summed grams for the
 * KPI €/g blend.
 */
import { createClient } from "@/shared/db/server";
import { getCurrentCompanyId } from "@/shared/auth";
import { sellerCompanyId, buyerCompanyId, type DealType, type DealCardStatus } from "@/modules/deals";
import { statusOf, type OrderStatusCode, type TicketStatus } from "./status";
import { calendarDay, lineGrams } from "./calendar";

/** One pill on the deal calendar (deal-calendar.md §5). */
export interface CalendarDeal {
  dealCardId: string;
  counterparty: { id: string; name: string; code: string };
  /** ISO date the pill sits on: delivery_date_target ?? created_at. */
  date: string;
  /** deal_card.value_net (the deal total); null when not yet priced. */
  amount: number | null;
  /** Σ line grams (g/kg converted; countable units = 0) — feeds the €/g KPI. */
  grams: number;
  /** The display stage that drives the pill colour (reused statusOf → code). */
  displayStage: OrderStatusCode;
  /** The RAW deal_card.status — distinct from displayStage's ticket-override
   *  display logic. Added for 18-03's KPI strip (isOpenDeal reads this). */
  status: DealCardStatus;
}

/** The minimum a deal_card row needs for role derivation (mirrors IssuerFacts
 *  in @/modules/deals/lib/derive.ts — kept local so this file's pure helper
 *  below has no Supabase-typed dependency). `deal_type` is the raw string
 *  here (matching Supabase's untyped select shape); narrowByRole casts it to
 *  `DealType` before calling `sellerCompanyId`/`buyerCompanyId`, exactly like
 *  the inline casts already used elsewhere in this file. */
export interface CardRoleFacts {
  relationship_id: string;
  deal_type: string;
  initiating_company_id: string;
}

type RelationshipLookup = Map<string, { company_a_id: string; company_b_id: string }>;

/**
 * The shared "is this deal_card row's derived role === callerCompanyId"
 * filter — the exact narrowing logic both `getSellerCalendarDeals()` and
 * `getBuyerCalendarDeals()` need after RLS returns both sides of a
 * relationship (mirrors `orders.ts`'s T-260707-04 mitigation, generalized to
 * either `sellerCompanyId` or `buyerCompanyId` as the role function). Pure —
 * no Supabase — so it's unit-testable with hand-built fixtures.
 */
export function narrowByRole<T extends CardRoleFacts>(
  cards: T[],
  relById: RelationshipLookup,
  callerCompanyId: string,
  roleOf: (
    card: { deal_type: DealType; initiating_company_id: string },
    companyAId: string,
    companyBId: string,
  ) => string,
): T[] {
  return cards.filter((c) => {
    const rel = relById.get(c.relationship_id);
    if (!rel) return false;
    const facts = { deal_type: c.deal_type as DealType, initiating_company_id: c.initiating_company_id };
    return roleOf(facts, rel.company_a_id, rel.company_b_id) === callerCompanyId;
  });
}

/** A short avatar code for the row: initials of the first two significant
 *  words, else the first two letters — uppercased. */
function counterpartyCode(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] ?? "??").slice(0, 2).toUpperCase();
}

export async function getSellerCalendarDeals(): Promise<CalendarDeal[]> {
  const callerCompanyId = await getCurrentCompanyId();
  if (!callerCompanyId) return [];

  const supabase = await createClient();

  const { data: cards, error: cardsErr } = await supabase
    .from("deal_card")
    .select(
      "id, relationship_id, version, status, deal_type, initiating_company_id, value_net, delivery_date_target, ticket_status, created_at",
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

  // Seller-only narrowing (matches getSellerOrders / SELL.md "no buyer analytics").
  const sellerCards = narrowByRole(cardRows, relById, callerCompanyId, sellerCompanyId);
  if (sellerCards.length === 0) return [];

  const buyerIds = Array.from(
    new Set(
      sellerCards.map((c) => {
        const rel = relById.get(c.relationship_id)!;
        return rel.company_a_id === callerCompanyId ? rel.company_b_id : rel.company_a_id;
      }),
    ),
  );
  const { data: companies, error: coErr } = await supabase
    .from("company")
    .select("id, name")
    .in("id", buyerIds);
  if (coErr) throw coErr;
  const nameById = new Map((companies ?? []).map((c) => [c.id, c.name] as const));

  // Current-version line grams + line-total money per card (mirrors the version
  // filter in getSellerOrders). Money comes from Σ line_total, not deal_card.value_net
  // — the latter is frequently null, the former is always the real deal value.
  const cardIds = sellerCards.map((c) => c.id);
  const { data: lineRows, error: lineErr } = await supabase
    .from("deal_line_item")
    .select("deal_card_id, version, quantity, unit, line_total")
    .in("deal_card_id", cardIds);
  if (lineErr) throw lineErr;
  const versionByCard = new Map(sellerCards.map((c) => [c.id, c.version] as const));
  const gramsByCard = new Map<string, number>();
  const totalByCard = new Map<string, number>();
  for (const l of lineRows ?? []) {
    if (l.version !== versionByCard.get(l.deal_card_id)) continue;
    const g = lineGrams(Number(l.quantity), l.unit as string);
    gramsByCard.set(l.deal_card_id, (gramsByCard.get(l.deal_card_id) ?? 0) + g);
    totalByCard.set(l.deal_card_id, (totalByCard.get(l.deal_card_id) ?? 0) + Number(l.line_total ?? 0));
  }

  return sellerCards.map((c) => {
    const rel = relById.get(c.relationship_id)!;
    const buyerId = rel.company_a_id === callerCompanyId ? rel.company_b_id : rel.company_a_id;
    const buyerName = nameById.get(buyerId) ?? "Unknown company";

    return {
      dealCardId: c.id,
      counterparty: { id: buyerId, name: buyerName, code: counterpartyCode(buyerName) },
      date: calendarDay(c.delivery_date_target, c.created_at),
      amount: totalByCard.get(c.id) ?? c.value_net,
      grams: gramsByCard.get(c.id) ?? 0,
      displayStage: statusOf({
        status: c.status as DealCardStatus,
        dealType: c.deal_type as DealType,
        ticketStatus: (c.ticket_status ?? null) as TicketStatus,
      }).code,
      status: c.status as DealCardStatus,
    };
  });
}

/**
 * The buyer-side twin of `getSellerCalendarDeals()` — same structural
 * pattern, ported verbatim except: (a) the narrowing predicate swaps to
 * `buyerCompanyId` (18-03/T-18-04 mitigation, keeps ONLY rows where the
 * caller is the derived buyer, never one where the caller is the seller —
 * the "Allocate/Sell mirror-image bug"), (b) `counterparty` names the
 * SELLER (the other side of the relationship from the buyer's own company).
 */
export async function getBuyerCalendarDeals(): Promise<CalendarDeal[]> {
  const callerCompanyId = await getCurrentCompanyId();
  if (!callerCompanyId) return [];

  const supabase = await createClient();

  const { data: cards, error: cardsErr } = await supabase
    .from("deal_card")
    .select(
      "id, relationship_id, version, status, deal_type, initiating_company_id, value_net, delivery_date_target, ticket_status, created_at",
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

  // Buyer-only narrowing (T-18-04 mitigation): keep ONLY rows where the
  // caller is the derived buyer — never a row where the caller is the
  // seller, even though RLS already returns both sides of the relationship.
  const buyerCards = narrowByRole(cardRows, relById, callerCompanyId, buyerCompanyId);
  if (buyerCards.length === 0) return [];

  const sellerIds = Array.from(
    new Set(
      buyerCards.map((c) => {
        const rel = relById.get(c.relationship_id)!;
        return rel.company_a_id === callerCompanyId ? rel.company_b_id : rel.company_a_id;
      }),
    ),
  );
  const { data: companies, error: coErr } = await supabase
    .from("company")
    .select("id, name")
    .in("id", sellerIds);
  if (coErr) throw coErr;
  const nameById = new Map((companies ?? []).map((c) => [c.id, c.name] as const));

  // Current-version line grams + line-total money per card (mirrors the version
  // filter in getSellerOrders). Money comes from Σ line_total, not deal_card.value_net
  // — the latter is frequently null, the former is always the real deal value.
  const cardIds = buyerCards.map((c) => c.id);
  const { data: lineRows, error: lineErr } = await supabase
    .from("deal_line_item")
    .select("deal_card_id, version, quantity, unit, line_total")
    .in("deal_card_id", cardIds);
  if (lineErr) throw lineErr;
  const versionByCard = new Map(buyerCards.map((c) => [c.id, c.version] as const));
  const gramsByCard = new Map<string, number>();
  const totalByCard = new Map<string, number>();
  for (const l of lineRows ?? []) {
    if (l.version !== versionByCard.get(l.deal_card_id)) continue;
    const g = lineGrams(Number(l.quantity), l.unit as string);
    gramsByCard.set(l.deal_card_id, (gramsByCard.get(l.deal_card_id) ?? 0) + g);
    totalByCard.set(l.deal_card_id, (totalByCard.get(l.deal_card_id) ?? 0) + Number(l.line_total ?? 0));
  }

  return buyerCards.map((c) => {
    const rel = relById.get(c.relationship_id)!;
    const sellerId = rel.company_a_id === callerCompanyId ? rel.company_b_id : rel.company_a_id;
    const sellerName = nameById.get(sellerId) ?? "Unknown company";

    return {
      dealCardId: c.id,
      counterparty: { id: sellerId, name: sellerName, code: counterpartyCode(sellerName) },
      date: calendarDay(c.delivery_date_target, c.created_at),
      amount: totalByCard.get(c.id) ?? c.value_net,
      grams: gramsByCard.get(c.id) ?? 0,
      displayStage: statusOf({
        status: c.status as DealCardStatus,
        dealType: c.deal_type as DealType,
        ticketStatus: (c.ticket_status ?? null) as TicketStatus,
      }).code,
      status: c.status as DealCardStatus,
    };
  });
}
