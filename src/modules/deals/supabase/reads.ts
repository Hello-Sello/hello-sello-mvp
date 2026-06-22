/**
 * Deal card - REAL Supabase reads (3a, Phase 2).
 *
 * Same shape as relationship/messaging reads: flat, RLS-scoped fetches stitched
 * in JS, viewer from the session. RLS does the side-aware projection for us:
 *   - deal_card / deal_line_item / deal_card_log → both relationship members
 *   - deal_line_item_private → ONLY the viewer's own company's rows (the per-line
 *     margin input never reaches the other side - enforced by the dli_private_all
 *     RLS policy, see migration 20260607190000)
 * So whatever `deal_line_item_private` returns is already "my side" - no
 * filtering here; viewerSide then picks the right column (seller / buyer).
 *
 * Line items are immutable snapshots: descriptive fields with no column
 * (cultivar, pzn, image) are read from each line's `metadata`, not the live
 * product. We fetch only the CURRENT version's lines (deal_card.version).
 */
import { createClient } from "@/shared/db/client";
import { sellerCompanyId, viewerSide, lineTotalOf, lineMarginOf } from "../lib/derive";
import { otherOf } from "../lib/recipient";
import { seededSignals } from "../lib/signals";
import type {
  ArtifactView,
  CatalogProduct,
  DealCard,
  DealCardView,
  DealRecipientView,
  DealType,
  DealCardStatus,
  DealWorkspaceView,
  LineItemView,
  LineMarginView,
  LogAuthor,
  ChangeOrigin,
  ConfirmationStatus,
  ConfirmSeat,
  LogEntry,
  MemberRole,
  MemberView,
  PartySide,
  ProductBatchView,
  PendingChangeView,
  PendingProposalView,
  ProposalLineView,
  ProposalSource,
  ProposalVote,
  StageCode,
  StageCompletionView,
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
 * The pending PROPOSAL for a p2p thread (4.5.2), resolved for the viewer - or
 * null when there is none. A proposal is a `deal_detected` chat message whose
 * card is NOT yet born (no `metadata.born_deal_card_id`) and which is not
 * withdrawn; we take the most recent such message in the thread.
 *
 * Resolving the viewer HERE (their company vs `metadata.votes`) keeps the strip
 * a pure renderer - it gets `myVote` / `otherVote` already decided, the same way
 * `getDealCard` hands back `viewerSide`. RLS limits the read to thread
 * participants, so both sides legitimately see both shared votes (the neutral
 * surface, D7); the proposer's PRIVATE box never enters a proposal, so there is
 * nothing private to leak here.
 */
export async function getPendingProposal(
  threadId: string,
): Promise<PendingProposalView | null> {
  const supabase = createClient();

  // viewer's company - to read MY vote out of the company-keyed vote map
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: viewerPerson } = await supabase
    .from("person")
    .select("company_id")
    .eq("id", user.id)
    .single();
  const viewerCompanyId: string | null = viewerPerson?.company_id ?? null;
  if (!viewerCompanyId) return null;

  // recent proposals in this thread, newest first; pick the first still-pending one
  const { data, error } = await supabase
    .from("chat_message")
    .select("id, metadata, created_at")
    .eq("thread_id", threadId)
    .eq("type", "deal_detected")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw error;

  const row = (data ?? []).find((m) => {
    const meta = (m.metadata ?? {}) as Meta;
    const born = meta["born_deal_card_id"];
    return !born && meta["withdrawn"] !== true && meta["superseded_by"] == null;
  });
  if (!row) return null;

  const meta = (row.metadata ?? {}) as Meta;
  const votes = (meta["votes"] ?? {}) as Record<string, ProposalVote>;
  const otherCompanyId = Object.keys(votes).find((k) => k !== viewerCompanyId) ?? null;

  const draft = (meta["draft"] ?? {}) as Meta;
  const currency = typeof draft["currency"] === "string" ? (draft["currency"] as string) : "EUR";
  const rawLines = Array.isArray(draft["line_items"]) ? (draft["line_items"] as Meta[]) : [];
  const lines: ProposalLineView[] = rawLines.map((l) => ({
    name: typeof l["name"] === "string" && l["name"].trim() ? (l["name"] as string) : "Item",
    quantity: Number(l["quantity"] ?? 0),
    unit: typeof l["unit"] === "string" ? (l["unit"] as string) : "g",
    unitPrice: l["unit_price"] == null ? null : Number(l["unit_price"]),
    currency,
  }));

  const summary =
    typeof draft["summary"] === "string" && draft["summary"].trim()
      ? (draft["summary"] as string)
      : "a deal";

  return {
    messageId: row.id,
    source: meta["source"] === "manual" ? ("manual" as ProposalSource) : ("sella" as ProposalSource),
    summary,
    lines,
    currency,
    myVote: votes[viewerCompanyId] ?? null,
    otherVote: otherCompanyId ? (votes[otherCompanyId] ?? null) : null,
    iProposed: meta["proposed_by_company"] === viewerCompanyId,
  };
}

/** The held `deal_pending_change` row shape we read (the table is not in the
 * generated types yet, so we narrow the casted `select` result here). */
type PendingChangeRow = {
  deal_card_id: string;
  base_version: number;
  source: string;
  proposed_by_company: string;
  proposer_reason: string;
  draft: Meta;
  votes: Record<string, string | null>;
};

/** Normalise a raw held-change vote to a `ProposalVote`. The active vote map
 * only ever carries 'accept' or null (a decline discards the held row), so any
 * non-'accept' value reads as "not accepted yet" (null) for the strip. */
const toVote = (raw: string | null | undefined): ProposalVote =>
  raw === "accept" ? "accept" : null;

/**
 * The held pending CHANGE on a deal (4.5.4), resolved for the viewer - or null
 * when no change is in flight. Mirrors `getPendingProposal` but reads the single
 * active `deal_pending_change` row by `deal_card_id` (RLS = relationship member,
 * so it returns for BOTH sides). Resolving the viewer HERE (their company vs the
 * company-keyed `votes` map) keeps the strip a pure renderer - it gets `myVote`
 * / `otherVote` / `iProposed` already decided, the same way `getDealCard` hands
 * back `viewerSide`. The shared draft carries SHARED facts only (D-09), so there
 * is nothing private to leak.
 *
 * `deal_pending_change` is not in the generated types yet, so the table read uses
 * the localized `as never` cast (Muskan's documented pattern; no full regen this
 * phase) - the same discipline the new RPCs use in `actions.ts`.
 */
export async function getPendingChange(
  dealCardId: string,
): Promise<PendingChangeView | null> {
  const supabase = createClient();

  // viewer's company - to read MY vote out of the company-keyed vote map
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: viewerPerson } = await supabase
    .from("person")
    .select("company_id")
    .eq("id", user.id)
    .single();
  const viewerCompanyId: string | null = viewerPerson?.company_id ?? null;
  if (!viewerCompanyId) return null;

  // the single active held row for this card (at most one - the unique lock).
  // The table is not in the generated types, so the table name is cast.
  const { data, error } = await supabase
    .from("deal_pending_change" as never)
    .select(
      "deal_card_id, base_version, source, proposed_by_company, proposer_reason, draft, votes",
    )
    .eq("deal_card_id", dealCardId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as PendingChangeRow;

  const votes = (row.votes ?? {}) as Record<string, string | null>;
  const otherCompanyId = Object.keys(votes).find((k) => k !== viewerCompanyId) ?? null;

  const draft = (row.draft ?? {}) as Meta;
  const currency = typeof draft["currency"] === "string" ? (draft["currency"] as string) : "EUR";
  const rawLines = Array.isArray(draft["line_items"]) ? (draft["line_items"] as Meta[]) : [];
  const lines: ProposalLineView[] = rawLines.map((l) => ({
    name: typeof l["name"] === "string" && l["name"].trim() ? (l["name"] as string) : "Item",
    quantity: Number(l["quantity"] ?? 0),
    unit: typeof l["unit"] === "string" ? (l["unit"] as string) : "g",
    unitPrice: l["unit_price"] == null ? null : Number(l["unit_price"]),
    currency,
  }));

  const summary =
    typeof draft["summary"] === "string" && draft["summary"].trim()
      ? (draft["summary"] as string)
      : "a deal";

  return {
    dealCardId: row.deal_card_id,
    source: row.source === "sella" ? ("sella" as ProposalSource) : ("manual" as ProposalSource),
    summary,
    lines,
    currency,
    myVote: toVote(votes[viewerCompanyId]),
    otherVote: otherCompanyId ? toVote(votes[otherCompanyId]) : null,
    iProposed: row.proposed_by_company === viewerCompanyId,
    baseVersion: row.base_version,
    proposerReason: row.proposer_reason,
  };
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
    .select("id, name, cultivar, unit_code, pack_size_grams, thc_percent, cbd_percent, local_code_pzn")
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
      packSizeGrams: p.pack_size_grams != null ? Number(p.pack_size_grams) : null,
      unitPrice: item ? Number(item.price_per_gram) : null,
      currency: item?.currency ?? "EUR",
      thcPercent: p.thc_percent,
      cbdPercent: p.cbd_percent,
      pzn: p.local_code_pzn,
    };
  });
}

/**
 * The batch picker source (BTCH-01, D-07): one product's own lots, read
 * seller-side. The picker is only ever mounted on the seller's screen (Plan 04);
 * RLS `batch_all` (`company_id = current_company_id()`) auto-scopes the read to
 * the caller's own batches, so NO manual company_id filter is needed - the same
 * discipline as `getOwnCatalog`. The buyer never reads `product_batch` (they
 * only ever see the frozen snapshot on the public `deal_line_item`).
 *
 * `product_batch` is in the generated types, so no `as never` cast is needed.
 * The batch carries the lab-MEASURED THC/CBD (the deal truth), distinct from the
 * product LABEL value.
 */
export async function getProductBatches(productId: string): Promise<ProductBatchView[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("product_batch")
    .select("id, batch_number, thc_percent, cbd_percent, ready_for_sale_date, expiry_date")
    .eq("product_id", productId)
    .is("deleted_at", null)
    .order("batch_number", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((b) => ({
    id: b.id,
    batchNumber: b.batch_number,
    thcPercent: b.thc_percent != null ? Number(b.thc_percent) : null,
    cbdPercent: b.cbd_percent != null ? Number(b.cbd_percent) : null,
    readyForSaleDate: b.ready_for_sale_date ?? null,
    expiryDate: b.expiry_date ?? null,
  }));
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
  // note_company_a/b (NOTE-01) are not in the generated DealCardRow type yet -
  // the select-string column list is cast to bypass the generated literal-union
  // check (the same as-never discipline used for deal_pending_change below).
  // DO NOT regenerate database.types.
  const { data: cardRow, error: cardErr } = await supabase
    .from("deal_card")
    .select(
      "id, relationship_id, thread_id, version, status, deal_type, initiating_company_id, value_net, currency, delivery_date_target, buyer_po_number, seller_so_number, hs_deal_number, metadata, created_at, updated_at, deleted_at, created_by, updated_by, incoterms_code, offer_expires_at, payment_terms_code, note_company_a, note_company_b" as "id, relationship_id, thread_id, version, status, deal_type, initiating_company_id, value_net, currency, delivery_date_target, buyer_po_number, seller_so_number, hs_deal_number, metadata, created_at, updated_at, deleted_at, created_by, updated_by, incoterms_code, offer_expires_at, payment_terms_code",
    )
    .eq("id", cardId)
    .single();
  if (cardErr) throw cardErr;
  const noteRow = cardRow as unknown as { note_company_a: string | null; note_company_b: string | null };

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

  const [cosRes, linesRes, logRes, confRes] = await Promise.all([
    supabase.from("company").select("id, name").in("id", [rel.company_a_id, rel.company_b_id]),
    supabase
      .from("deal_line_item")
      // thc_percent/cbd_percent/batch_number/batch_id (BTCH-01) are not in the
      // generated DealLineItemRow type yet - cast the select-string column list to
      // bypass the generated literal-union check (same as-never discipline as the
      // 3c note columns above). DO NOT regenerate database.types.
      .select(
        "id, product_id, product_name, quantity, unit, unit_price, currency, line_total, metadata, sort_order, thc_percent, cbd_percent, batch_number, batch_id" as "id, product_id, product_name, quantity, unit, unit_price, currency, line_total, metadata, sort_order",
      )
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
  for (const r of [cosRes, linesRes, logRes, confRes]) {
    if (r.error) throw r.error;
  }

  // my-side per-line private input (MRGN-01, D-06): read deal_line_item_private
  // for THIS version's line ids. The table is keyed only by deal_line_item_id
  // (no card/version column), so it reads after linesRes resolves; RLS
  // (dli_private_all) already scopes it to MY company - no extra company filter.
  const lineIds = (linesRes.data ?? []).map((r) => r.id);
  const { data: privRows, error: privErr } = lineIds.length
    ? await supabase
        .from("deal_line_item_private")
        .select("deal_line_item_id, seller_margin, buyer_metric")
        .in("deal_line_item_id", lineIds)
    : { data: [], error: null };
  if (privErr) throw privErr;

  // seller / buyer names, derived from who issued the deal
  const coById = new Map((cosRes.data ?? []).map((c) => [c.id, c.name] as const));
  const sellerId = sellerCompanyId(card, rel.company_a_id, rel.company_b_id);
  const buyerId = sellerId === rel.company_a_id ? rel.company_b_id : rel.company_a_id;
  const sellerName = coById.get(sellerId) ?? "Unknown company";
  const buyerName = coById.get(buyerId) ?? "Unknown company";

  // line items - read descriptive extras from each line's own snapshot (metadata),
  // and the batch snapshot (BTCH-01, D-03) from the REAL columns (not metadata).
  const lineItems: LineItemView[] = (linesRes.data ?? []).map((r) => {
    const m = (r.metadata ?? {}) as Meta;
    // batch columns are not on the generated row type yet (the select cast above);
    // read them off a locally-cast view (same as the noteRow discipline).
    const b = r as unknown as {
      thc_percent: number | string | null;
      cbd_percent: number | string | null;
      batch_number: string | null;
      batch_id: string | null;
    };
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
      batchId: b.batch_id ?? null,
      batchNumber: b.batch_number ?? null,
      thcPercent: b.thc_percent != null ? Number(b.thc_percent) : null,
      cbdPercent: b.cbd_percent != null ? Number(b.cbd_percent) : null,
    };
  });

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

  // per-line margin (MRGN-01, D-02/D-06): pick MY column by viewerSide, then
  // compute the % LIVE from that stored input + the line's unit_price via the
  // pure lineMarginOf (never a stored margin). The deal-level average is NOT
  // computed here - CardFront rolls it up from these (WARNING 4 lock).
  const privByLine = new Map(
    (privRows ?? []).map((p) => [p.deal_line_item_id, p] as const),
  );
  const lineMargins: LineMarginView[] = lineItems.map((line) => {
    const priv = privByLine.get(line.id);
    const ownInput =
      side === "seller"
        ? (priv?.seller_margin == null ? null : Number(priv.seller_margin))
        : (priv?.buyer_metric == null ? null : Number(priv.buyer_metric));
    return {
      lineItemId: line.id,
      ownInput,
      marginPercent: lineMarginOf(line.unitPrice, ownInput, side ?? "seller"),
    };
  });

  // resolve mine/theirs by COMPANY IDENTITY (not seller/buyer role), mirroring
  // confirm_deal_change's structural slot write (D-02/D-03) - both notes are
  // visible to both sides, but each side only ever sends its OWN slot.
  const myNote =
    viewerCompanyId === rel.company_a_id
      ? noteRow.note_company_a
      : viewerCompanyId === rel.company_b_id
        ? noteRow.note_company_b
        : null;
  const theirNote =
    viewerCompanyId === rel.company_a_id
      ? noteRow.note_company_b
      : viewerCompanyId === rel.company_b_id
        ? noteRow.note_company_a
        : null;

  // the held pending CHANGE on this card (4.5.4), resolved for the viewer. Null
  // when none is in flight; present = a change is held and the Edit pencil locks.
  // The strip reads the resolved view; the pencil reads only whether it is null.
  const pendingChange = await getPendingChange(card.id);

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
    lineMargins,
    // seeded per-side signals (Phase 4); Sella writes the real ones in 4d
    signals: side ? seededSignals(side) : [],
    log,
    viewerSide: side,
    confirmations,
    pendingChange,
    myNote,
    theirNote,
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

  // the viewer's own company - resolved from the session so the Room can decide
  // own-side vs other-side without a second read (D-10).
  const { data: viewerPerson } = await supabase
    .from("person")
    .select("company_id")
    .eq("id", user.id)
    .single();

  return {
    workspaceId: wsRes.data.id,
    dealCardId: wsRes.data.deal_card_id,
    visibility: wsRes.data.visibility as WorkspaceVisibility,
    members,
    dealThreadId: threadRes.data.id,
    viewerCompanyId: viewerPerson?.company_id ?? null,
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
      // assignee_person_id (D-09, column exists) + is_private/owner_company_id
      // (D-10, new columns) are not in the generated row type yet, so the
      // select-string is cast to its narrower literal and the extras are read off
      // a locally-cast view below (same as-never discipline as getDealCard's
      // batch/note columns). DO NOT regenerate database.types.
      .select(
        "id, title, type, status, stage_code, sort_order, assignee_person_id, is_private, owner_company_id" as "id, title, type, status, stage_code, sort_order",
      )
      .eq("deal_workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
  ]);
  if (stagesRes.error) throw stagesRes.error;
  if (thingsRes.error) throw thingsRes.error;

  // group Things under their stage code
  const byStage = new Map<string, ThingView[]>();
  for (const r of thingsRes.data ?? []) {
    // the new columns are not on the generated row type (the select cast above);
    // read them off a locally-cast view (same as the batch/note discipline).
    const v = r as unknown as {
      assignee_person_id: string | null;
      is_private: boolean;
      owner_company_id: string | null;
    };
    const view: ThingView = {
      id: r.id,
      title: r.title,
      type: r.type as ThingType,
      status: r.status as ThingStatus,
      stageCode: r.stage_code as StageCode,
      sortOrder: r.sort_order,
      assigneePersonId: v.assignee_person_id ?? null,
      isPrivate: v.is_private ?? false,
      ownerCompanyId: v.owner_company_id ?? null,
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

/**
 * Read a workspace's STORED stage-done state (Phase 5, D-14). Each row is a
 * deliberate "Mark stage done" click; a stage with NO row reads as not-done.
 * `deal_stage_completion` is SHARED (both sides see progress), so RLS already
 * returns every member's view - no manual filter. The table is not in the
 * generated types yet, so the table name uses the `as never` cast (Muskan's
 * documented pattern; no full regen this phase).
 */
export async function getStageCompletions(
  workspaceId: string,
): Promise<StageCompletionView[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("deal_stage_completion" as never)
    .select("stage_code, marked_done_at, marked_done_by_person_id")
    .eq("deal_workspace_id", workspaceId);
  if (error) throw error;

  const rows = (data ?? []) as unknown as {
    stage_code: string;
    marked_done_at: string | null;
    marked_done_by_person_id: string | null;
  }[];
  return rows.map((r) => ({
    stageCode: r.stage_code as StageCode,
    markedDoneAt: r.marked_done_at ?? null,
    markedDoneByPersonId: r.marked_done_by_person_id ?? null,
  }));
}

/**
 * Read the Deal Room's Documents list (Phase 5). RLS (`dealart_all`, rewritten
 * in 20260622090000) already hides the OTHER side's private documents, so this is
 * a flat workspace-scoped fetch with no manual company filter. A document's
 * visibility FOLLOWS its linked thing (resolved decision): the link lives on
 * `thing.linked_artifact_id` (the REVERSE direction), so we read the linking
 * Things and build an artifactId -> thingId map to attach `linkedThingId`.
 *
 * `is_private` is not on the generated deal_artifact row type yet, so the
 * select-string is cast to its narrower literal (same as-never discipline as
 * getDealCard). DO NOT regenerate database.types.
 */
export async function getDealArtifacts(workspaceId: string): Promise<ArtifactView[]> {
  const supabase = createClient();

  const [artRes, linkRes] = await Promise.all([
    supabase
      .from("deal_artifact")
      .select(
        "id, title, category, scan_status, is_private" as "id, title, category, scan_status",
      )
      .eq("deal_workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    // the link lives on thing.linked_artifact_id (the reverse direction). RLS
    // already scopes Things to the workspace; we only need the id <-> link pairs.
    supabase
      .from("thing")
      .select("id, linked_artifact_id")
      .eq("deal_workspace_id", workspaceId)
      .not("linked_artifact_id", "is", null),
  ]);
  if (artRes.error) throw artRes.error;
  if (linkRes.error) throw linkRes.error;

  // artifactId -> the thing that links it
  const thingByArtifact = new Map<string, string>();
  for (const t of linkRes.data ?? []) {
    if (t.linked_artifact_id) thingByArtifact.set(t.linked_artifact_id, t.id);
  }

  const rows = (artRes.data ?? []) as unknown as {
    id: string;
    title: string;
    category: string | null;
    scan_status: string;
    is_private: boolean;
  }[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category ?? null,
    scanStatus: r.scan_status,
    isPrivate: r.is_private ?? false,
    linkedThingId: thingByArtifact.get(r.id) ?? null,
  }));
}

/**
 * Resolve the p2p recipient for the Deal Basket (3b, BSKT-01 / D-08).
 *
 * The recipient is the OTHER side of the p2p chat: the company on the other end
 * of the relationship, and the person on the other end of the thread. This is
 * pure routing data derived LIVE from the chat context the app already holds -
 * there is NO new DB column and NO migration. Two flat RLS-scoped fetches (the
 * relationship pair + the thread pair) are stitched in JS, the same discipline
 * every read in this file uses; the "other one" math is the single `otherOf`
 * owner (shared with the company/person subtractions elsewhere). Display names
 * are read in the same rows so the form's "To:" line is fed without touching the
 * messaging module (Scope call Q1).
 *
 * For a p2p thread the DB CHECK guarantees both persons are non-null, so the
 * resolved recipient always has a person id; the names degrade to null only if a
 * row is missing, which the caller renders as company-only.
 */
export async function resolveP2pRecipient(
  relationshipId: string,
  threadId: string,
): Promise<DealRecipientView> {
  const supabase = createClient();

  // viewer's company + person - the "me" anchor for both subtractions
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
  // p2p anchors on a viewer that has a company; a missing one cannot be
  // subtracted safely (WR-01) - fail loud instead of masking it as "" and
  // letting otherOf hand back the wrong (or the viewer's own) company.
  const viewerCompanyId = viewerPerson?.company_id ?? null;
  if (!viewerCompanyId) {
    throw new Error("deal: viewer has no company; cannot resolve p2p recipient");
  }

  // the relationship pair (recipient company = the OTHER side) + the thread pair
  // (recipient person = the OTHER participant), read in parallel.
  const [relRes, threadRes] = await Promise.all([
    supabase
      .from("relationship")
      .select("company_a_id, company_b_id")
      .eq("id", relationshipId)
      .single(),
    supabase
      .from("chat_thread")
      .select("person_a_id, person_b_id")
      .eq("id", threadId)
      .single(),
  ]);
  if (relRes.error) throw relRes.error;
  if (threadRes.error) throw threadRes.error;
  const rel = relRes.data;
  const thread = threadRes.data;

  // the OTHER side of each pair (the single math owner from lib/recipient)
  const companyId = otherOf(viewerCompanyId, rel.company_a_id, rel.company_b_id);
  const personId = otherOf(user.id, thread.person_a_id, thread.person_b_id);
  // the recipient company must resolve to a real id; a null here means the
  // relationship row is malformed (viewer not a member) - fail rather than
  // return "" as a valid-looking routing id (WR-01).
  if (!companyId) {
    throw new Error("deal: could not resolve recipient company for the relationship");
  }

  // display names for the "To:" line (free - the rows are already read to subtract)
  let companyName: string | null = null;
  let personName: string | null = null;
  if (companyId) {
    const { data: co } = await supabase
      .from("company")
      .select("name")
      .eq("id", companyId)
      .single();
    companyName = co?.name ?? null;
  }
  if (personId) {
    const { data: per } = await supabase
      .from("person")
      .select("first_name, last_name")
      .eq("id", personId)
      .single();
    personName = per ? `${per.first_name} ${per.last_name}`.trim() : null;
  }

  return {
    companyId,
    personId,
    companyName,
    personName,
  };
}
