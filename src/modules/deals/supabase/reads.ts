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
  CatalogProduct,
  DealCard,
  DealCardView,
  DealType,
  DealCardStatus,
  DealWorkspaceView,
  LineItemView,
  LogAuthor,
  ChangeOrigin,
  ConfirmationStatus,
  ConfirmSeat,
  LogEntry,
  MemberRole,
  MemberView,
  PartyFieldView,
  PartySide,
  StageCode,
  StageView,
  ThingStatus,
  ThingType,
  ThingView,
  WorkspaceVisibility,
} from "../types";

type Meta = Record<string, unknown>;

/**
 * Clean display labels for the 5 stages, keyed by `deal_stage.code`. The
 * `deal_stage.description` column reads like a sentence ("Negotiating terms");
 * the pipeline bar + Things headings want a short title, so we map here. The
 * stage order still comes from `deal_stage.sort_order`, never this map.
 */
const STAGE_LABELS: Record<StageCode, string> = {
  negotiation: "Negotiation",
  compliance_quality: "Compliance & Quality",
  agreement: "Agreement",
  payment: "Payment",
  fulfilment_delivery: "Fulfilment & Delivery",
};

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

/** A lightweight deal row for the chat's deal selector (5A.2) - enough to label
 * + badge each deal without loading the whole card. */
export interface RelationshipDealRow {
  id: string;
  status: DealCardStatus;
  dealType: DealType;
  /** the HS deal number when one has been minted; null on early drafts */
  hsNumber: string | null;
  /** updated_at, falling back to created_at - drives the "Updated …" hint */
  updatedAt: string;
}

/**
 * All non-deleted deals for a relationship, newest first - the source for the
 * chat's deal selector dropdown (lets a seller pick which deal a conversation is
 * about). One deal per relationship is the demo norm (multi-deal = DEV-37), so
 * this usually returns a single row; the control is then honestly ready for more.
 */
export async function listRelationshipDeals(
  relationshipId: string,
): Promise<RelationshipDealRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("deal_card")
    .select("id, status, deal_type, hs_deal_number, updated_at, created_at")
    .eq("relationship_id", relationshipId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    status: r.status as DealCardStatus,
    dealType: r.deal_type as DealType,
    hsNumber: r.hs_deal_number,
    updatedAt: (r.updated_at ?? r.created_at) as string,
  }));
}

/**
 * The create-form product picker source: the viewer's OWN catalogue (3.5a).
 * RLS limits `product` + `pricelist_item` to the caller's company, so this is
 * always "my products" - which is exactly the seller's catalogue, since the
 * creator of an offer is the seller. A product with no live pricelist item
 * comes back with `unitPrice = null` (a price-less line is allowed, D3).
 * Two flat fetches stitched in JS (same discipline as the other reads).
 */
export async function getOwnCatalog(): Promise<CatalogProduct[]> {
  const supabase = createClient();

  const { data: products, error: pErr } = await supabase
    .from("product")
    .select("id, name, cultivar, unit_code, thc_percent, cbd_percent, local_code_pzn")
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (pErr) throw pErr;
  const rows = products ?? [];
  if (rows.length === 0) return [];

  const { data: items, error: iErr } = await supabase
    .from("pricelist_item")
    .select("product_id, price_per_gram, currency")
    .in(
      "product_id",
      rows.map((p) => p.id),
    )
    .is("deleted_at", null);
  if (iErr) throw iErr;
  const priceBy = new Map((items ?? []).map((i) => [i.product_id, i] as const));

  return rows.map((p) => {
    const item = priceBy.get(p.id);
    return {
      id: p.id,
      name: p.name,
      cultivar: p.cultivar,
      unit: p.unit_code,
      unitPrice: item ? Number(item.price_per_gram) : null,
      currency: item?.currency ?? "EUR",
      thcPercent: p.thc_percent,
      cbdPercent: p.cbd_percent,
      pzn: p.local_code_pzn,
    };
  });
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

  const [cosRes, linesRes, fieldsRes, logRes, confRes] = await Promise.all([
    supabase.from("company").select("id, name").in("id", [rel.company_a_id, rel.company_b_id]),
    supabase
      .from("deal_line_item")
      .select("id, product_id, product_name, quantity, unit, unit_price, currency, line_total, metadata, sort_order")
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
    // the two-sided confirm gate for the CURRENT version (3d). RLS = relationship
    // member, so both sides' rows return; a missing row reads as `pending`.
    supabase
      .from("deal_confirmation")
      .select("company_id, status, responding_person_id, responded_at")
      .eq("deal_card_id", card.id)
      .eq("version", card.version),
  ]);
  for (const r of [cosRes, linesRes, fieldsRes, logRes, confRes]) {
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
      productId: r.product_id,
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

  // resolve person names for log authors AND confirmation responders (one fetch)
  const personIds = Array.from(
    new Set(
      [
        ...(logRes.data ?? []).map((r) => r.changed_by_person_id),
        ...(confRes.data ?? []).map((r) => r.responding_person_id),
      ].filter((x): x is string => !!x),
    ),
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

  // the two confirm seats (3d), seller first then buyer. A missing row = pending.
  const confByCompany = new Map(
    (confRes.data ?? []).map((r) => [r.company_id, r] as const),
  );
  const seatFor = (sideKind: PartySide, companyId: string, companyName: string): ConfirmSeat => {
    const row = confByCompany.get(companyId);
    return {
      side: sideKind,
      companyId,
      companyName,
      status: (row?.status as ConfirmationStatus) ?? "pending",
      byName: row?.responding_person_id ? (nameById.get(row.responding_person_id) ?? null) : null,
      respondedAt: row?.responded_at ?? null,
    };
  };
  const confirmations: ConfirmSeat[] = [
    seatFor("seller", sellerId, sellerName),
    seatFor("buyer", buyerId, buyerName),
  ];

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
    confirmations,
  };
}

/**
 * Load the deal CONTAINER for the workspace screen (3b): the workspace row,
 * the live members (owners first - ownership is a role, one owner per company
 * side), and the deal chat's thread id. RLS scopes everything: the workspace
 * is `company_wide` so both relationship companies see it; a `private`
 * workspace would only return for invited members.
 * Throws if the card has no workspace or no deal thread (a deal is BORN with
 * both - their absence is a data bug, not a state to render).
 */
export async function getWorkspace(dealCardId: string): Promise<DealWorkspaceView> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("deal workspace: no authenticated user");

  const [wsRes, threadRes] = await Promise.all([
    supabase
      .from("deal_workspace")
      .select("id, deal_card_id, visibility")
      .eq("deal_card_id", dealCardId)
      .is("deleted_at", null)
      .single(),
    supabase
      .from("chat_thread")
      .select("id")
      .eq("type", "deal")
      .eq("deal_card_id", dealCardId)
      .is("deleted_at", null)
      .single(),
  ]);
  if (wsRes.error) throw wsRes.error;
  if (threadRes.error) throw threadRes.error;

  // live members → resolve people → resolve companies (flat, stitched in JS)
  const { data: memberRows, error: memErr } = await supabase
    .from("deal_member")
    .select("id, person_id, role, added_at")
    .eq("deal_workspace_id", wsRes.data.id)
    .is("removed_at", null)
    .order("added_at", { ascending: true });
  if (memErr) throw memErr;

  const personIds = (memberRows ?? []).map((m) => m.person_id);
  const { data: people, error: pplErr } = personIds.length
    ? await supabase.from("person").select("id, first_name, last_name, company_id").in("id", personIds)
    : { data: [], error: null };
  if (pplErr) throw pplErr;
  const personById = new Map((people ?? []).map((p) => [p.id, p] as const));

  const companyIds = Array.from(
    new Set((people ?? []).map((p) => p.company_id).filter((x): x is string => !!x)),
  );
  const { data: companies, error: coErr } = companyIds.length
    ? await supabase.from("company").select("id, name").in("id", companyIds)
    : { data: [], error: null };
  if (coErr) throw coErr;
  const companyNameById = new Map((companies ?? []).map((c) => [c.id, c.name] as const));

  const members: MemberView[] = (memberRows ?? []).map((m) => {
    const p = personById.get(m.person_id);
    return {
      id: m.id,
      personId: m.person_id,
      name: p ? [p.first_name, p.last_name].filter(Boolean).join(" ") : "Unknown person",
      companyId: p?.company_id ?? "",
      companyName: (p?.company_id && companyNameById.get(p.company_id)) || "Unknown company",
      role: m.role as MemberRole,
      isViewer: m.person_id === user.id,
    };
  });
  // owners first, then joining order
  members.sort((a, b) => Number(b.role === "owner") - Number(a.role === "owner"));

  return {
    workspaceId: wsRes.data.id,
    dealCardId: wsRes.data.deal_card_id,
    visibility: wsRes.data.visibility as WorkspaceVisibility,
    members,
    dealThreadId: threadRes.data.id,
  };
}

/**
 * Load the 5 stages + their Things for the workspace (3c). The stage list and
 * its order come from `deal_stage` (schema-driven, never hardcoded); each
 * stage carries the Things whose `stage_code` matches, ordered by `sort_order`.
 * RLS (`thing_all`) scopes Things to deal members - both relationship companies
 * see the company_wide workspace's Things. A stage with no Things returns empty.
 *
 * The "current stage" highlight is NOT computed here: the 3c bar is screen-only
 * (D2), so the highlight lives as local React state, not in this read.
 */
export async function getStagesAndThings(workspaceId: string): Promise<StageView[]> {
  const supabase = createClient();

  const [stagesRes, thingsRes] = await Promise.all([
    supabase
      .from("deal_stage")
      .select("code, sort_order")
      .order("sort_order", { ascending: true }),
    supabase
      .from("thing")
      .select("id, title, type, status, stage_code, sort_order")
      .eq("deal_workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
  ]);
  if (stagesRes.error) throw stagesRes.error;
  if (thingsRes.error) throw thingsRes.error;

  // group Things under their stage code
  const byStage = new Map<string, ThingView[]>();
  for (const r of thingsRes.data ?? []) {
    const view: ThingView = {
      id: r.id,
      title: r.title,
      type: r.type as ThingType,
      status: r.status as ThingStatus,
      stageCode: r.stage_code as StageCode,
      sortOrder: r.sort_order,
    };
    const list = byStage.get(r.stage_code) ?? [];
    list.push(view);
    byStage.set(r.stage_code, list);
  }

  return (stagesRes.data ?? []).map((s) => {
    const code = s.code as StageCode;
    const things = byStage.get(code) ?? [];
    return {
      code,
      label: STAGE_LABELS[code] ?? code,
      sortOrder: s.sort_order,
      things,
      thingsTotal: things.length,
      thingsDone: things.filter((t) => t.status === "done").length,
    };
  });
}
