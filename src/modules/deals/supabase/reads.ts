/**
 * Deal card - REAL Supabase reads (3a, Phase 2).
 *
 * Same shape as relationship/messaging reads: flat, RLS-scoped fetches stitched
 * in JS, viewer from the session. RLS does the side-aware projection for us:
 *   - deal_card / deal_line_item / deal_card_log → both relationship members
 *   - deal_party_field → ONLY the viewer's own company's rows (the Margin never
 *     reaches the other side - enforced in the DB, see migration 20260610130000)
 * So whatever `deal_party_field` returns is already "my side" - no filtering here.
 *
 * Line items are immutable snapshots: descriptive fields with no column
 * (cultivar, pzn, image) are read from each line's `metadata`, not the live
 * product. We fetch only the CURRENT version's lines (deal_card.version).
 */
import { createClient } from "@/shared/db/client";
import { sellerCompanyId, viewerSide, lineTotalOf } from "../lib/derive";
import { seededSignals } from "../lib/signals";
import type {
  DealCard,
  DealCardView,
  DealType,
  DealCardStatus,
  LineItemView,
  LogAuthor,
  ChangeOrigin,
  LogEntry,
  PartyFieldView,
  PartySide,
} from "../types";

type Meta = Record<string, unknown>;

const str = (m: Meta, k: string): string | null => {
  const v = m[k];
  return typeof v === "string" && v.trim() ? v : null;
};

/** Statuses that are still "live" (not a terminal end state) - preferred as the current deal. */
const LIVE_STATUSES = new Set<DealCardStatus>(["draft", "confirmed", "amended"]);

/**
 * The current deal card id for a relationship - the one the chat's "Talking
 * about" pin points at. Single deal per thread for the demo (multi-deal selector
 * is deferred, DEV-37): prefer the most recent LIVE deal, else the most recent
 * of any status. Returns null if the relationship has no deals.
 */
export async function getCurrentDealCardId(relationshipId: string): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("deal_card")
    .select("id, status, created_at")
    .eq("relationship_id", relationshipId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return null;
  const live = rows.find((r) => LIVE_STATUSES.has(r.status as DealCardStatus));
  return (live ?? rows[0]).id;
}

/**
 * Load one deal card for the deal-card screen: the card (narrowed), the
 * current-version line items, my-side private fields, and the full version log.
 * Throws if the card is not visible to the viewer (RLS returns no row).
 */
export async function getDealCard(cardId: string): Promise<DealCardView> {
  const supabase = createClient();

  // viewer's company - to know which side of the deal is "me"
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("deal: no authenticated user");
  const { data: viewerPerson, error: vpErr } = await supabase
    .from("person")
    .select("company_id")
    .eq("id", user.id)
    .single();
  if (vpErr) throw vpErr;
  const viewerCompanyId: string | null = viewerPerson?.company_id ?? null;

  // the card row (RLS: viewer must be a relationship member)
  const { data: cardRow, error: cardErr } = await supabase
    .from("deal_card")
    .select(
      "id, relationship_id, thread_id, version, status, deal_type, initiating_company_id, value_net, currency, delivery_date_target, buyer_po_number, seller_so_number, hs_deal_number, metadata, created_at, updated_at, deleted_at, created_by, updated_by, incoterms_code, offer_expires_at, payment_terms_code",
    )
    .eq("id", cardId)
    .single();
  if (cardErr) throw cardErr;

  const card: DealCard = {
    ...cardRow,
    deal_type: cardRow.deal_type as DealType,
    status: cardRow.status as DealCardStatus,
  };

  // the relationship pair (for seller/buyer names) + the rest, in parallel
  const { data: rel, error: relErr } = await supabase
    .from("relationship")
    .select("company_a_id, company_b_id")
    .eq("id", card.relationship_id)
    .single();
  if (relErr) throw relErr;

  const [cosRes, linesRes, fieldsRes, logRes] = await Promise.all([
    supabase.from("company").select("id, name").in("id", [rel.company_a_id, rel.company_b_id]),
    supabase
      .from("deal_line_item")
      .select("id, product_name, quantity, unit, unit_price, currency, line_total, metadata, sort_order")
      .eq("deal_card_id", card.id)
      .eq("version", card.version)
      .order("sort_order", { ascending: true }),
    // RLS already limits this to MY company's rows
    supabase
      .from("deal_party_field")
      .select("id, party_side, field_key, field_label, value_text, sort_order")
      .eq("deal_card_id", card.id)
      .eq("version", card.version)
      .order("sort_order", { ascending: true }),
    supabase
      .from("deal_card_log")
      .select("id, version, change_summary, origin, changed_by, changed_by_person_id, created_at")
      .eq("deal_card_id", card.id)
      .order("version", { ascending: false }),
  ]);
  for (const r of [cosRes, linesRes, fieldsRes, logRes]) {
    if (r.error) throw r.error;
  }

  // seller / buyer names, derived from who issued the deal
  const coById = new Map((cosRes.data ?? []).map((c) => [c.id, c.name] as const));
  const sellerId = sellerCompanyId(card, rel.company_a_id, rel.company_b_id);
  const buyerId = sellerId === rel.company_a_id ? rel.company_b_id : rel.company_a_id;
  const sellerName = coById.get(sellerId) ?? "Unknown company";
  const buyerName = coById.get(buyerId) ?? "Unknown company";

  // line items - read descriptive extras from each line's own snapshot (metadata)
  const lineItems: LineItemView[] = (linesRes.data ?? []).map((r) => {
    const m = (r.metadata ?? {}) as Meta;
    return {
      id: r.id,
      productName: r.product_name,
      thumbnailTint: str(m, "dominance") ?? str(m, "cultivar"),
      cultivar: str(m, "cultivar"),
      quantity: Number(r.quantity),
      unit: r.unit,
      unitPrice: Number(r.unit_price),
      currency: r.currency,
      lineTotal: lineTotalOf(Number(r.quantity), Number(r.unit_price), r.line_total),
      pzn: str(m, "pzn"),
    };
  });

  // my-side private fields (RLS already filtered to my company)
  const partyFields: PartyFieldView[] = (fieldsRes.data ?? []).map((r) => ({
    id: r.id,
    side: r.party_side as PartySide,
    fieldKey: r.field_key,
    label: r.field_label,
    value: r.value_text,
  }));

  // version log - resolve person names for human authors
  const personIds = Array.from(
    new Set((logRes.data ?? []).map((r) => r.changed_by_person_id).filter((x): x is string => !!x)),
  );
  const nameById = new Map<string, string>();
  if (personIds.length) {
    const { data: people } = await supabase
      .from("person")
      .select("id, first_name, last_name")
      .in("id", personIds);
    for (const p of people ?? []) {
      nameById.set(p.id, [p.first_name, p.last_name].filter(Boolean).join(" "));
    }
  }
  const actorName = (kind: LogAuthor, personId: string | null): string => {
    if (kind === "sella") return "Sella";
    if (kind === "system") return "System";
    return (personId && nameById.get(personId)) || "A teammate";
  };
  const log: LogEntry[] = (logRes.data ?? []).map((r) => {
    const kind = r.changed_by as LogAuthor;
    return {
      id: r.id,
      version: r.version,
      summary: r.change_summary,
      actorName: actorName(kind, r.changed_by_person_id),
      actorKind: kind,
      origin: r.origin as ChangeOrigin,
      changedAt: r.created_at,
    };
  });

  const side = viewerCompanyId
    ? viewerSide(viewerCompanyId, card, rel.company_a_id, rel.company_b_id)
    : null;

  return {
    card,
    sellerName,
    buyerName,
    sellerCompanyId: sellerId,
    lineItems,
    partyFields,
    // seeded per-side signals (Phase 4); Sella writes the real ones in 4d
    signals: side ? seededSignals(side) : [],
    log,
    viewerSide: side,
  };
}
