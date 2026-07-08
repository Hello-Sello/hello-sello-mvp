/**
 * Buy — Partner assembly, REAL Supabase read (18-CONTEXT.md "Partner (who shows up as a row)").
 *
 * `getBuyPartners()` is the ONE canonical list of "every supplier this buyer has purchase
 * history with" — real deal-card history (connected, links to the Relationship page) merged
 * with CSV-imported supplier names that have no deal history at all (unconnected, no link).
 * Buy's Analytics table (supplier rows) and any future partner-facing UI reads from here,
 * so the connected/relationshipId resolution logic exists in exactly one place.
 *
 * Buyer-narrowing mirrors `getSellerOrders()`/`getSellerCalendarDeals()` (src/modules/allocate)
 * exactly, inverted: those keep only cards where the caller is the derived SELLER; this keeps
 * only cards where the caller is the derived BUYER (`buyerCompanyId`, `@/modules/deals`). No
 * shared buyer-narrowing helper exists yet elsewhere in the codebase to reuse, so this
 * duplicates the inline filter, consistent in style with those two reads (flat-fetch-then-stitch,
 * relationship/company lookups batched via `.in()`).
 *
 * The buyer-narrowing (`dealHistoryPartners`) and the merge/dedup (`mergePartners`) steps are
 * both pure, fixture-driven functions — isolated from the async Supabase calls so the actual
 * assembly logic is unit-testable without a live DB (see partners.test.ts).
 */
import { createClient } from "@/shared/db/server";
import { getCurrentCompanyId } from "@/shared/auth";
import { buyerCompanyId, type DealType } from "@/modules/deals";

/** One row of Buy's canonical Partner list (18-CONTEXT.md's locked definition). */
export interface BuyPartner {
  /** Dedup/display key — the supplier's real company name if connected, else its CSV supplier_name. */
  key: string;
  name: string;
  connected: boolean;
  /** Populated only when `connected` — the real relationship id for a Relationship-page link. */
  relationshipId: string | null;
  companyId: string | null;
}

/** A supplier resolved from real deal-card history — always connected. */
export interface DealHistoryPartner {
  relationshipId: string;
  companyId: string;
  name: string;
}

/** Minimal shape of a `deal_card` row needed for buyer-narrowing. */
export interface DealCardRow {
  relationship_id: string;
  deal_type: DealType;
  initiating_company_id: string;
}

/** Minimal shape of a `relationship` row needed for buyer-narrowing. */
export interface RelationshipRow {
  id: string;
  company_a_id: string;
  company_b_id: string;
}

/** Minimal shape of a `company` row needed for name resolution. */
export interface CompanyRow {
  id: string;
  name: string;
}

/**
 * Narrows `cards` to the ones where `callerCompanyId` is the derived BUYER
 * (`buyerCompanyId`, mirrors — inverted — `getSellerOrders`'s seller-only
 * narrowing), resolves each kept card's relationship to its OTHER company (the
 * seller), and names it. One relationship yields at most one partner row,
 * regardless of how many deal_cards it has (a relationship existing IS the
 * "connected" definition — no separate connection-status check needed).
 *
 * Pure and fixture-driven: takes already-fetched rows, does no I/O — this is
 * what makes the buyer-narrowing rule (T-18-09) directly unit-testable.
 */
export function dealHistoryPartners(
  cards: DealCardRow[],
  relationships: RelationshipRow[],
  companies: CompanyRow[],
  callerCompanyId: string,
): DealHistoryPartner[] {
  const relById = new Map(relationships.map((r) => [r.id, r] as const));
  const nameById = new Map(companies.map((c) => [c.id, c.name] as const));

  // relationshipId -> the OTHER company (the seller), deduped per relationship.
  const sellerByRelationship = new Map<string, string>();
  for (const c of cards) {
    const rel = relById.get(c.relationship_id);
    if (!rel) continue;
    const buyer = buyerCompanyId(
      { deal_type: c.deal_type, initiating_company_id: c.initiating_company_id },
      rel.company_a_id,
      rel.company_b_id,
    );
    // T-18-09 mitigation: a relationship where the caller is the SELLER (not
    // the buyer) must never surface as a Buy partner (RESEARCH.md Pitfall 5).
    if (buyer !== callerCompanyId) continue;
    const sellerId = rel.company_a_id === callerCompanyId ? rel.company_b_id : rel.company_a_id;
    sellerByRelationship.set(rel.id, sellerId);
  }

  return Array.from(sellerByRelationship.entries()).map(([relationshipId, companyId]) => ({
    relationshipId,
    companyId,
    name: nameById.get(companyId) ?? "Unknown company",
  }));
}

/**
 * Merges real deal-history partners with CSV-only supplier names into the
 * canonical, deduped `BuyPartner[]`.
 *
 * De-dup rule (18-CONTEXT.md, locked "no fuzzy matching in v0"): a CSV
 * `supplier_name` is dropped ONLY when it is an EXACT string match to a
 * connected partner's real company name — connected always wins over the
 * CSV-only entry for that name. Anything that doesn't match exactly (even a
 * near-miss like "Cantouring GmbH" vs "Cantouring") stays its own separate
 * unconnected row — this is the documented v0 limitation, not a bug.
 *
 * Pure: no I/O, so the full merge/dedup contract is directly unit-testable.
 */
export function mergePartners(
  dealPartners: DealHistoryPartner[],
  csvSupplierNames: string[],
): BuyPartner[] {
  const connectedByName = new Map<string, BuyPartner>();
  for (const p of dealPartners) {
    if (connectedByName.has(p.name)) continue;
    connectedByName.set(p.name, {
      key: p.name,
      name: p.name,
      connected: true,
      relationshipId: p.relationshipId,
      companyId: p.companyId,
    });
  }

  const csvOnly: BuyPartner[] = Array.from(new Set(csvSupplierNames))
    .filter((name) => !connectedByName.has(name))
    .map((name) => ({
      key: name,
      name,
      connected: false,
      relationshipId: null,
      companyId: null,
    }));

  return [...connectedByName.values(), ...csvOnly];
}

export async function getBuyPartners(): Promise<BuyPartner[]> {
  const callerCompanyId = await getCurrentCompanyId();
  if (!callerCompanyId) return [];

  const supabase = await createClient();

  const { data: cards, error: cardsErr } = await supabase
    .from("deal_card")
    .select("relationship_id, deal_type, initiating_company_id")
    .is("deleted_at", null);
  if (cardsErr) throw cardsErr;
  const cardRows = (cards ?? []) as DealCardRow[];

  let dealPartners: DealHistoryPartner[] = [];
  if (cardRows.length > 0) {
    const relationshipIds = Array.from(new Set(cardRows.map((c) => c.relationship_id)));
    const { data: relationships, error: relErr } = await supabase
      .from("relationship")
      .select("id, company_a_id, company_b_id")
      .in("id", relationshipIds);
    if (relErr) throw relErr;

    // Resolve names only for companies that survive the buyer-only narrowing
    // (avoids fetching/leaking seller-side counterparty names unnecessarily).
    const narrowed = dealHistoryPartners(cardRows, relationships ?? [], [], callerCompanyId);
    const sellerCompanyIds = Array.from(new Set(narrowed.map((p) => p.companyId)));

    if (sellerCompanyIds.length > 0) {
      const { data: companies, error: coErr } = await supabase
        .from("company")
        .select("id, name")
        .in("id", sellerCompanyIds);
      if (coErr) throw coErr;
      dealPartners = dealHistoryPartners(cardRows, relationships ?? [], companies ?? [], callerCompanyId);
    }
  }

  // CSV-only partners. T-18-10: RLS (`current_company_id()`) already scopes
  // `purchase_history_import` to the buyer's own company — the explicit
  // `.eq` below is defense-in-depth, not the sole boundary.
  const { data: csvRows, error: csvErr } = await supabase
    .from("purchase_history_import")
    .select("supplier_name")
    .eq("buyer_company_id", callerCompanyId);
  if (csvErr) throw csvErr;
  const csvSupplierNames = (csvRows ?? []).map((r) => r.supplier_name);

  return mergePartners(dealPartners, csvSupplierNames);
}
