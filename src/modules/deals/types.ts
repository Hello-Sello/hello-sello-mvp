/**
 * Deals module - deal-card types (screen ①).
 *
 * Ground truth = Muskan's generated schema (`src/types/database.types.ts`).
 * We bind to her `Row` types directly so these can never drift from the DB.
 * The lookup `code` columns are typed `string` in the generated types (they are
 * FKs to `deal_type.code` / `deal_card_status.code` / `content_author.code` /
 * `deal_change_origin.code`); the exact allowed values are the *seeded* codes,
 * so we narrow them here.
 *
 * Code source: supabase/migrations/20260607090001_lookups_and_seeds.sql
 *              supabase/migrations/20260607090003_phase2_deal.sql
 *              supabase/migrations/20260610130000_deal_party_field.sql  (Phase 1)
 */
import type { Database } from "@/types/database.types";
import type { PriceTier } from "@/modules/catalog/index.client";

type Tables = Database["public"]["Tables"];

/* -------------------------------------------------------------------------- */
/* Raw rows - verbatim from the generated schema                              */
/* -------------------------------------------------------------------------- */

/** The deal_card row, verbatim. */
export type DealCardRow = Tables["deal_card"]["Row"];
/** The deal_line_item row, verbatim. */
export type DealLineItemRow = Tables["deal_line_item"]["Row"];
/** The deal_card_log row, verbatim. */
export type DealCardLogRow = Tables["deal_card_log"]["Row"];

/* -------------------------------------------------------------------------- */
/* Seeded code unions - narrow the lookup `string` columns                    */
/* -------------------------------------------------------------------------- */

/**
 * deal_type.code - who initiated the deal (`deal_card.deal_type`).
 * `offer` = seller-initiated; `order` = buyer-initiated. This is the input to
 * the PO/SO derivation, NOT a stored "doc_type" (see lib/derive.ts).
 */
export type DealType = "offer" | "order";

/**
 * deal_card_status.code - the deal's life (`deal_card.status`).
 * Phase-12 vocabulary (D-01): `unsent` = the private draft (user-facing label
 * stays "Draft"; RLS hides it from the counterparty), `negotiation` = sent and
 * bargaining. `ticket_created`/`ticket_closed` are the post-close reopen-ticket
 * states (07-06, D-29/D-30): after `done`, either party may reopen
 * (`ticket_created` blue) and close (`ticket_closed` dark-green) the ticket -
 * the sealed deal terms never change.
 */
export type DealCardStatus =
  | "unsent"
  | "negotiation"
  | "confirmed"
  | "done"
  | "cancelled"
  | "ticket_created"
  | "ticket_closed";

/**
 * content_author.code - who produced a log entry (`deal_card_log.changed_by`).
 * Shared lookup with `chat_message.sender`. A human bump is `person`; an
 * automated bump is `system`; Sella's drafts/summaries are `sella`.
 */
export type LogAuthor = "person" | "system" | "sella";

/**
 * deal_change_origin.code - where a change came from (`deal_card_log.origin`).
 * Drives the FR-M5 broadcast rule: `p2p` broadcasts a line INTO the deal thread;
 * `deal_chat` is silent (everyone there already saw it); `system` = generated.
 */
export type ChangeOrigin = "p2p" | "deal_chat" | "system";

/**
 * The display side of a private field (`deal_party_field.party_side`, Phase 1).
 * A label for placement only - privacy is enforced by `owner_company_id`, not this.
 */
export type PartySide = "seller" | "buyer";

/* -------------------------------------------------------------------------- */
/* Narrowed rows - identical shape to the DB row, lookup columns tightened.    */
/* Reading a real row is therefore an assignable swap (same discipline as 2a). */
/* -------------------------------------------------------------------------- */

/** deal_card with `deal_type` + `status` narrowed to their seeded unions. */
export type DealCard = Omit<DealCardRow, "deal_type" | "status"> & {
  deal_type: DealType;
  status: DealCardStatus;
};

/** deal_card_log with `changed_by` + `origin` narrowed to their seeded unions. */
export type DealCardLog = Omit<DealCardLogRow, "changed_by" | "origin"> & {
  changed_by: LogAuthor;
  origin: ChangeOrigin;
};

/* -------------------------------------------------------------------------- */
/* UI projections - the joined/derived shapes the card renders.                */
/* In real data each is one Supabase select(-with-joins); the read returns the */
/* same shape, so the read body can change behind index.ts.                    */
/* -------------------------------------------------------------------------- */

/**
 * One product row on the card front. Bound from `deal_line_item`, money kept
 * as numbers (formatting is the component's job via lib/derive.formatMoney).
 */
export interface LineItemView {
  /** deal_line_item.id */
  id: string;
  /** deal_line_item.product_id - the catalogue link (null for a free-typed line) */
  productId: string | null;
  productName: string;
  /** display thumbnail tint (metadata-driven; falls back to a neutral tint) */
  thumbnailTint: string | null;
  cultivar: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  currency: string;
  /** deal_line_item.line_total when stored; else quantity × unit_price */
  lineTotal: number;
  pzn: string | null;
  /**
   * deal_line_item.batch_id - the chosen lot this line points at (BTCH-01,
   * D-01). Null for custom/legacy lines that carry no batch. Read for the edit
   * re-seed (Plan 04) so re-opening the form re-selects the same batch.
   */
  batchId: string | null;
  /** deal_line_item.batch_number - the frozen batch number snapshot (D-02), shown on the card. */
  batchNumber: string | null;
  /**
   * The MEASURED THC/CBD of the chosen batch, frozen onto the line at deal time
   * (D-03 - the line shows the batch's measured value, never the product label).
   * Null when the line has no batch.
   */
  thcPercent: number | null;
  cbdPercent: number | null;
}

/**
 * One batch (lot) the seller can pick for a catalogue line (BTCH-01, D-07).
 * Read by the seller-only `getProductBatches`; the buyer never reads
 * `product_batch` (they only ever see the frozen snapshot on the line). Carries
 * the lab-MEASURED THC/CBD (the deal truth), distinct from the product LABEL.
 */
export interface ProductBatchView {
  /** product_batch.id */
  id: string;
  /** product_batch.batch_number (the lot's human-readable number, e.g. "GL-24-0001") */
  batchNumber: string;
  /** the lab-measured THC/CBD of this lot; null when not recorded */
  thcPercent: number | null;
  cbdPercent: number | null;
  /** product_batch.ready_for_sale_date (ISO date string) or null */
  readyForSaleDate: string | null;
  /** product_batch.expiry_date (ISO date string) or null */
  expiryDate: string | null;
}

/**
 * One line's per-side private margin, scoped to the VIEWER'S OWN side (MRGN-01).
 * Replaces the retired per-deal private-field box in role: a per-line,
 * owner-only view that plans 03 (app/edit read path) and 05 (create path) build
 * against.
 *
 * RLS already returns ONLY the viewer's own `deal_line_item_private` row, so
 * `ownInput` is always "mine to see" - the same privacy discipline the old
 * private box carried, now scoped per line. `ownInput` is the stored source of truth (D-07,
 * the viewer's frozen cost/resale); `marginPercent` is computed LIVE from
 * `ownInput` + the line's `unit_price` (D-02 - never stored), via
 * `lib/derive.lineMarginOf`.
 */
export interface LineMarginView {
  /** the deal_line_item.id this margin belongs to */
  lineItemId: string;
  /** the viewer's OWN frozen per-line input (seller cost / buyer resale, D-07); null when not yet entered */
  ownInput: number | null;
  /** the margin %, computed live from ownInput + the line's unit_price (D-02); null when not computable */
  marginPercent: number | null;
}

/** One entry in the Logs tab - a row of `deal_card_log`, display-shaped. */
export interface LogEntry {
  /** deal_card_log.id */
  id: string;
  version: number;
  summary: string;
  /** who made the change: a person's name, "Sella", or "System" */
  actorName: string;
  /** the seeded author class, for the actor icon/voice */
  actorKind: LogAuthor;
  origin: ChangeOrigin;
  /** ISO timestamp */
  changedAt: string;
}

/**
 * One advisory signal on the Signals tab. Seeded in 3a (Phase 4); Sella writes
 * the real content in 4d. Per-side: the viewer only ever sees their own side's.
 */
export interface SignalView {
  id: string;
  side: PartySide;
  /** lucide icon name or emoji key chosen by the component */
  icon: string;
  title: string;
  detail: string;
}

/**
 * Result of a `finalizeDeal` action (D-16) - a fast hint; the client re-reads
 * the card and the golden skin follows the DB status. The status after a
 * successful finalize is always 'done'.
 */
export interface FinalizeDealResult {
  /** the card status AFTER finalization (always 'done' on success) */
  cardStatus: DealCardStatus;
}

/**
 * The whole card, ready to render. One `getDealCard(id)` read assembles this:
 * the card (narrowed), the current-version line items, my-side per-line margins,
 * the seeded signals for my side, and the full version log.
 */
export interface DealCardView {
  card: DealCard;
  /** the seller + buyer company display names (from the relationship) */
  sellerName: string;
  buyerName: string;
  /** the company id that is the seller in THIS deal (derived) */
  sellerCompanyId: string;
  /** current-version line items only (never mixed across versions) */
  lineItems: LineItemView[];
  /**
   * my-side per-line margin (RLS-filtered to the viewer's company): each line's
   * own input + live margin %. The deal-level AVERAGE is NOT here - CardFront
   * rolls it up from these via averageMarginOf, so the read never duplicates it.
   */
  lineMargins: LineMarginView[];
  /** my-side advisory signals (seeded in 3a) */
  signals: SignalView[];
  /** full version history, newest first */
  log: LogEntry[];
  /** which side the viewer is on (seller/buyer); null if the viewer has no company */
  viewerSide: PartySide | null;
  /**
   * The HELD pending change on this deal (4.5.4), resolved for the viewer - or
   * `null` when no change is in flight. This is the LOCK flag: when present, a
   * change is held (the Edit pencil is disabled until it resolves); when null,
   * the deal is unlocked and editable. The strip renders the view; the pencil
   * reads only whether it is null.
   */
  pendingChange: PendingChangeView | null;
  /** the viewer's OWN company's card note (NOTE-01), resolved by company identity vs relationship.company_a_id/company_b_id - never the other side's slot */
  myNote: string | null;
  /** the OTHER company's card note (NOTE-01), resolved the same way - read-only here, never editable by the viewer */
  theirNote: string | null;
}

/* -------------------------------------------------------------------------- */
/* Deal workspace - the deal container (screen ④, 3b)                         */
/* -------------------------------------------------------------------------- */

/** The deal_workspace row, verbatim. */
export type DealWorkspaceRow = Tables["deal_workspace"]["Row"];
/** The deal_member row, verbatim. */
export type DealMemberRow = Tables["deal_member"]["Row"];

/**
 * deal_member_role.code - what a member is on this deal (`deal_member.role`).
 * Ownership is a ROLE, not a column (locked 3b, migration 20260610170000):
 * a deal has one `owner` per company side. `side_lead` exists in the lookup
 * but is unused until the membership pass.
 */
export type MemberRole = "owner" | "side_lead" | "member";

/** workspace_visibility.code - who can see the workspace (`deal_workspace.visibility`). */
export type WorkspaceVisibility = "company_wide" | "private";

/** One People-tab row: a live (not-removed) member, resolved to person + company. */
export interface MemberView {
  id: string;
  personId: string;
  name: string;
  companyId: string;
  companyName: string;
  role: MemberRole;
  /** true when this member IS the logged-in viewer (drives the "(you)" marker) */
  isViewer: boolean;
}

/**
 * The workspace container, ready to render. One `getWorkspace(dealCardId)`
 * read assembles this: the workspace row (narrowed), the live members with
 * person + company resolved, and the deal chat's thread id. The card itself
 * is NOT here - the screen reads it with the existing `getDealCard`.
 */
export interface DealWorkspaceView {
  workspaceId: string;
  dealCardId: string;
  visibility: WorkspaceVisibility;
  /** live members, owners first (one owner per company side) */
  members: MemberView[];
  /** the chat_thread (type='deal') born with the deal; the chat hero mounts this */
  dealThreadId: string;
  /**
   * The VIEWER's own company id, resolved from the session (D-10). The Room uses
   * it to decide own-side vs other-side for visibility/assignment without a
   * second read; null when the viewer has no company.
   */
  viewerCompanyId: string | null;
}

/* -------------------------------------------------------------------------- */
/* Things - the flat checklist (Stages retired, D-15)                         */
/* -------------------------------------------------------------------------- */

/** The thing row, verbatim. */
export type ThingRow = Tables["thing"]["Row"];

/**
 * thing_type.code - what kind of work a Thing is (`thing.type`).
 * `task` = plain work; `approval` = the gate that 3d wires to deal_confirmation;
 * `document_upload` = a required file (artifact upload is a later task).
 */
export type ThingType = "task" | "approval" | "document_upload";

/** thing_status.code - a Thing is `open` or `done` (`thing.status`). */
export type ThingStatus = "open" | "done";

/**
 * One checklist row in the Things tab. Bound from `thing`, lookup columns
 * narrowed. Ticking it flips `status` open<->done (a real DB write, 3c D3).
 * Things are FLAT/stageless now (D-15) - there is no stage grouping.
 */
export interface ThingView {
  /** thing.id */
  id: string;
  title: string;
  type: ThingType;
  status: ThingStatus;
  /** order within the flat list */
  sortOrder: number;
  /** thing.assignee_person_id - the person this Thing is assigned to (D-09); null when unassigned. */
  assigneePersonId: string | null;
  /** thing.is_private - true = visible only to its owner company; drives the lock icon (D-10/D-13). */
  isPrivate: boolean;
  /** thing.owner_company_id - the company that owns this Thing (D-10/D-11); the side a private item belongs to. */
  ownerCompanyId: string | null;
}

/**
 * One document row in the Deal Room's Documents list (Phase 5). The
 * `deal_artifact` projection: the lock icon needs `isPrivate` (D-13), and a
 * document's visibility FOLLOWS its linked thing (resolved decision) via
 * `thing.linked_artifact_id` - `linkedThingId` carries that reverse link.
 */
export interface ArtifactView {
  /** deal_artifact.id */
  id: string;
  title: string;
  /** deal_artifact.category code (e.g. 'invoice'); null when uncategorised. */
  category: string | null;
  /** deal_artifact.scan_status code (e.g. 'pending' | 'clean'). */
  scanStatus: string;
  /** deal_artifact.is_private - true = visible only to its owner company; drives the lock icon (D-13). */
  isPrivate: boolean;
  /** the thing.id whose linked_artifact_id points at this document, or null (a standalone document). */
  linkedThingId: string | null;
}

/* -------------------------------------------------------------------------- */
/* Create a deal (3.5a) - the manual create flow                              */
/*                                                                            */
/* 3.5a rule: the creator makes an OFFER from their OWN catalogue, so the      */
/* creator is the seller. This is RLS-safe (product is own-company-only) and  */
/* matches the demo (Alice/Aurora creates). A buyer-initiated ORDER that picks */
/* the counterparty's catalogue is a later refinement.                        */
/* -------------------------------------------------------------------------- */

/**
 * One product the create-form picker offers, read from the creator's OWN
 * catalogue (`getOwnCatalog`). `unitPrice` is null when the product has no live
 * pricelist item - a deal line can still be made price-less (D3).
 */
export interface CatalogProduct {
  /** product.id */
  id: string;
  name: string;
  cultivar: string | null;
  /** product_unit code (display only, e.g. "g") */
  unit: string;
  /**
   * product.pack_size_grams - how this product is physically sold (one pack =
   * N grams). The basket steps quantity by this (one click = one pack); null
   * when the product has no pack size on record (then the basket falls back to a
   * default gram step). Pricing stays per-gram (CARD-02).
   */
  packSizeGrams: number | null;
  /** the current base price per gram; null when the product has no live price */
  unitPrice: number | null;
  currency: string;
  thcPercent: number | null;
  cbdPercent: number | null;
  /** local_code_pzn (German PZN) */
  pzn: string | null;
  /** The product's tier ladder (ADR-0004): [] when no rungs exist. */
  tiers: PriceTier[];
}

/**
 * One line the user is assembling in the create form. Price is OPTIONAL (D3) -
 * a card can be sent before prices are disclosed. `productId` is null for a
 * free-typed line (no catalogue match).
 */
export interface DraftLineInput {
  productId: string | null;
  /**
   * The stable `deal_line_item.id` this draft line came from (BLOCKER 1 fix).
   * The per-line private row (`deal_line_item_private`) is keyed by this id, so
   * plans 03/05 thread it through (seeded in `EditDealForm.toDraftLines` from
   * `LineItemView.id`) - the private write then joins by the real line id, never
   * by productId+position (which mis-targets duplicate-product lines and drops
   * free-typed lines). OPTIONAL because a freshly-typed line in a not-yet-saved
   * create form has no id until `create_deal_draft` returns one (D-11) - on the
   * create path the private rows are written AFTER the RPC returns the new ids.
   */
  lineItemId?: string;
  productName: string;
  /** quantity in the line's `unit` (grams for catalogue lines - packs x pack size). */
  quantity: number;
  /**
   * The product's pack size in grams (from CatalogProduct), so the basket can
   * step quantity by one pack and show a pack count. Optional/null for custom
   * (off-catalogue) lines and for edit lines loaded from an older card snapshot,
   * where the basket falls back to a default gram step.
   */
  packSizeGrams?: number | null;
  /** deal_line_unit code: 'g' | 'kg' | 'unit' */
  unit: string;
  unitPrice: number | null;
  currency: string;
  cultivar?: string | null;
  pzn?: string | null;
  /**
   * The chosen batch's MEASURED THC/CBD, stamped onto the line by
   * `lineFromProduct` when a batch is picked (BTCH-01, D-03). REUSES these
   * existing fields for the measured snapshot - there are NO separate
   * batchThc/batchCbd. A catalogue line always shows the batch's measured value,
   * never the product label.
   */
  thcPercent?: number | null;
  cbdPercent?: number | null;
  /**
   * deal_line_item.batch_id - the chosen lot this line points at (BTCH-01, D-01).
   * Null/absent for a custom (off-catalogue) line, which is batch-exempt (D-06).
   * The Basket merge key is productId + batchId (D-05): same product + same batch
   * increments; same product + different batch is a NEW line.
   */
  batchId?: string | null;
  /** the frozen batch number snapshot (D-02), threaded into the RPC line jsonb. */
  batchNumber?: string | null;
  /**
   * The viewer's OWN frozen per-line private input (seller cost / buyer resale,
   * D-07) - written IMMEDIATELY + ungated, NEVER in the shared held draft (D-09).
   * Optional so existing call sites that build a `DraftLineInput` without it keep
   * compiling until plans 03/05 wire it.
   */
  ownInput?: number | null;
}

/* -------------------------------------------------------------------------- */
/* Deal Basket (3b, BSKT-01) - the reusable deal form's first-class model.      */
/*                                                                            */
/* The form's payload is promoted to a real domain concept: a Basket that      */
/* knows WHO it is addressed to (recipient), WHERE it came from (source), and  */
/* WHICH deal it is attached to (attachedDealId). The recipient is routing      */
/* data derived live from the p2p chat (D-08) - never persisted in 3b, no new  */
/* DB column. The future stored home is pending_inbox_item.assigned_to (D-09). */
/* -------------------------------------------------------------------------- */

/**
 * Who the Basket is addressed to. Routing ids only (D-02/D-08); carries no
 * content, never persisted in 3b. `personId` is optional because "no person ->
 * address the company" is a FUTURE C2C path; in p2p the person is always known.
 */
export interface DealRecipient {
  companyId: string;
  personId: string | null;
}

/**
 * The recipient plus display names, for the form's "To:" line (Scope call Q1).
 * The ids are the model; the names are display-only so the subtitle can be fed
 * without touching the messaging module. A name is null when not resolved yet.
 */
export interface DealRecipientView extends DealRecipient {
  companyName: string | null;
  personName: string | null;
}

/**
 * Which trigger built the Basket. Fully typed (D-04) so the intended doors are
 * documented, but ONLY 'p2p' is produced in 3b; 'sella' starts in Phase 5 and
 * 'shop' is future. A string-literal union, mirroring DealType (NOT an enum).
 */
export type DealSource = "p2p" | "sella" | "shop";

/**
 * The reusable Deal Basket (D-01) - the rich model the shared form hands back.
 * The 5 CONTENT fields (lines, freeDelivery, dueDate, paymentTermsCode, note)
 * are produced by DealForm itself; the 3 IDENTITY fields (recipient, source,
 * attachedDealId) are wrapper-supplied (D-03):
 *   - `attachedDealId: null` = a new deal; a set id = editing that card.
 *   - `recipient` is the resolved p2p recipient on create; null on edit (the
 *     Edit flow routes through the strip, which already knows the relationship).
 *   - `source` is 'p2p' in 3b.
 */
export interface DealBasket {
  lines: DraftLineInput[];
  freeDelivery: boolean;
  dueDate: string | null;
  paymentTermsCode: string | null;
  note: string | null;
  recipient: DealRecipient | null;
  source: DealSource;
  attachedDealId: string | null;
}

/** Just the 5 CONTENT fields DealForm owns; the wrappers complete the Basket. */
export type DealBasketContent = Pick<
  DealBasket,
  "lines" | "freeDelivery" | "dueDate" | "paymentTermsCode" | "note"
>;

/**
 * The whole create-form payload handed to `createDeal` (the human-pressed
 * commit - the AI-fence guardrail: only a human button starts this).
 */
export interface CreateDealInput {
  relationshipId: string;
  lines: DraftLineInput[];
  /** terms */
  freeDelivery?: boolean;
  /** delivery_date_target (ISO date) */
  dueDate?: string | null;
  /** payment_terms.code, e.g. 'net30' */
  paymentTermsCode?: string | null;
  /** the creation note (optional at draft - D7; becomes mandatory on edits, 3.5b) */
  note?: string | null;
  /**
   * Who initiated the deal: 'offer' = seller-initiated (default, every existing
   * call site), 'order' = buyer-initiated (the Product Basket buyer path). Maps
   * to create_deal_draft's p_deal_type; sellerCompanyId()/viewerSide() already
   * resolve buyer-vs-seller correctly for 'order'.
   */
  dealType?: DealType;
  /**
   * The chosen counterparty person on the other side (Product Basket own-company
   * offer path). Threaded into create_deal_draft's existing p_counterparty_person_id
   * so the picked person becomes a day-one deal owner. Null → company-addressed.
   */
  counterpartyPersonId?: string | null;
}

/** Result of `createDeal` - the new card id so the chat's deal area can open it. */
export interface CreateDealResult {
  dealCardId: string;
}

/**
 * What the card's CREATE mode hands up when the user presses "Send deal" (chj/
 * 07-08). The card builds the draft inline (products/conditions/note); the strip
 * adds `relationshipId` and calls `createDeal`. This replaced the old CreateDealForm.
 */
export interface CardCreateInput {
  lines: DraftLineInput[];
  freeDelivery: boolean;
  dueDate: string | null;
  paymentTermsCode: string | null;
  note: string | null;
}

/* -------------------------------------------------------------------------- */
/* Pending proposal (4.5.2) - the pre-card object the Sella strip renders.     */
/* -------------------------------------------------------------------------- */

/**
 * Where a proposal came from (`metadata.source`). `manual` = a person pressed
 * "Start a deal" (sender pre-accepted); `sella` = Sella detected it (both
 * pending). Drives the strip copy ("{name} proposed a deal" vs "Sella spotted
 * a deal") but NOT the birth path - both births run through confirm_detected_deal.
 */
export type ProposalSource = "manual" | "sella";

/**
 * One company's stance on a proposal (`metadata.votes[companyId]`). A missing /
 * null entry reads as "pending" - that company has not acted yet.
 */
export type ProposalVote = "accept" | "reject" | null;

/** One proposed line, shaped for the strip's accept popover (from `metadata.draft`). */
export interface ProposalLineView {
  /**
   * The catalogue product id this line refers to, or null for a free-typed /
   * custom line (SELL-01/D-18). The held change draft persists it (actions.ts
   * `proposeDealChange`); carrying it here lets the on-card diff (07-07) PAIR
   * current-vs-proposed lines BY id instead of by name/index, which mis-targets
   * duplicate or renamed lines. Birth proposals carry no product link -> null.
   */
  productId: string | null;
  name: string;
  quantity: number;
  unit: string;
  /** null when the proposal carried no price for this line (allowed, D3) */
  unitPrice: number | null;
  currency: string;
}

/**
 * A pending deal PROPOSAL, resolved for the viewer (4.5.2). The pre-card object:
 * a `deal_detected` chat message in the p2p thread whose card is NOT yet born
 * (no `born_deal_card_id`) and which is not withdrawn. `getPendingProposal`
 * resolves the viewer's company against `metadata.votes` so the strip only has
 * to RENDER a stance, never re-derive "whose turn is it" (the side logic stays
 * in the read, the same way `getDealCard` hides it behind `viewerSide`).
 */
export interface PendingProposalView {
  /** the deal_detected chat_message id - the handle confirm_detected_deal acts on */
  messageId: string;
  source: ProposalSource;
  /** a short human label from the draft (the strip line) */
  summary: string;
  /** the proposed lines, for the popover */
  lines: ProposalLineView[];
  currency: string;
  /** the viewer's OWN-company vote (null = the viewer must still act) */
  myVote: ProposalVote;
  /** the OTHER company's vote (null = waiting on them) */
  otherVote: ProposalVote;
  /** true when the viewer's company is the proposer (manual: sending was their yes) */
  iProposed: boolean;
}

/**
 * Result of `confirmDetectedDeal` - the born deal card id when this accept was
 * the second yes that flipped the gate, else null (a reject, or a first accept
 * still waiting on the other side).
 */
export interface ConfirmDetectedResult {
  bornCardId: string | null;
}

/* -------------------------------------------------------------------------- */
/* Held two-sided change (4.5.4) - the pending CHANGE the strip + pencil read. */
/*                                                                            */
/* This mirrors the pending PROPOSAL (4.5.2) but for an EDIT of an existing   */
/* card rather than a deal birth. An edit no longer commits instantly: it     */
/* becomes a HELD change (the editor auto-accepts their own side; the OTHER   */
/* side must accept; a decline or a proposer withdraw discards it). The card  */
/* moves to base+1 only on the second yes. The held row lives in              */
/* `deal_pending_change`; `getPendingChange` resolves the viewer's company    */
/* against its company-keyed `votes` map so the strip only RENDERS a stance.  */
/* -------------------------------------------------------------------------- */

/**
 * A HELD pending CHANGE, resolved for the viewer (4.5.4). The strip's data on
 * the deal. Reuses the proposal vote/source vocabulary verbatim: `myVote` /
 * `otherVote` are 'accept' (a yes is recorded) or null (still to act) - a
 * decline never persists in an active row (it discards the held change), so
 * the active vote map only ever carries 'accept' or null. The reason flows
 * through the strip pop-up, NOT the edit form (D-08): `proposerReason` is the
 * Send reason captured at propose; the responder's reason is captured at the
 * Accept/Decline pop-up and relayed by `confirmDealChange`.
 */
export interface PendingChangeView {
  /** the deal card the held change is built on - the handle the RPCs act on */
  dealCardId: string;
  /** 'manual' = a person edited; 'sella' = Phase 5 detected change (already in the union) */
  source: ProposalSource;
  /** a short human label from the draft (the strip line) */
  summary: string;
  /** the proposed lines, for the pop-up (mapped from the held draft snapshot) */
  lines: ProposalLineView[];
  currency: string;
  /** the viewer's OWN-company vote (null = the viewer must still act) */
  myVote: ProposalVote;
  /** the OTHER company's vote (null = waiting on them) */
  otherVote: ProposalVote;
  /** true when the viewer's company proposed the change (their Send was their yes) */
  iProposed: boolean;
  /** the live version this change is built on (the held row's base_version) */
  baseVersion: number;
  /** the proposer's required Send reason (D-07), for the pop-up context */
  proposerReason: string;
}

/**
 * The propose-a-change payload handed to `proposeDealChange` (4.5.4). Same
 * SHARED form shape as create/edit (lines + terms) on an existing card, plus
 * the `dealCardId` and the required Send `reason`. The reason flows through the
 * strip Send pop-up, NOT the edit form (D-08). The proposer's OWN-side per-line
 * input rides each line's `ownInput` (DraftLineInput) - it is written IMMEDIATELY
 * + ungated to deal_line_item_private inside the action and NEVER enters the
 * shared held draft (D-09).
 */
export interface ProposeDealChangeInput {
  dealCardId: string;
  lines: DraftLineInput[];
  /** terms */
  freeDelivery?: boolean;
  /** delivery_date_target (ISO date) */
  dueDate?: string | null;
  /** payment_terms.code, e.g. 'net30' */
  paymentTermsCode?: string | null;
  /** the proposer's OWN-side card note (NOTE-01) - rides the SHARED held draft; commits to the proposer's own note slot only (D-02) */
  note?: string | null;
  /** REQUIRED Send reason (D-07); the RPC also enforces it */
  reason: string;
}

/** Result of `proposeDealChange` - the new held `deal_pending_change` id. */
export interface ProposeDealChangeResult {
  pendingId: string;
}

/**
 * The respond-to-a-change payload handed to `confirmDealChange` (4.5.4). The
 * other side's Accept/Decline plus the REQUIRED reason (REAS-01) captured in
 * the strip pop-up. The RPC commits to base+1 only when BOTH sides accept;
 * a decline (or a proposer `withdrawDealChange`) discards the held change.
 */
export interface ConfirmDealChangeInput {
  dealCardId: string;
  decision: "accept" | "decline";
  reason: string;
}

/**
 * Result of `confirmDealChange` - the new version when THIS accept was the
 * second yes that committed the change, else null (a decline, or a first
 * accept still waiting on the other side - the RPC returns null in both cases).
 */
export interface ConfirmDealChangeResult {
  version: number | null;
}

/* -------------------------------------------------------------------------- */
/* Promotion (07-06, PROMO-01) - the INDEPENDENT yellow track.                 */
/*                                                                            */
/* D-21: a seller promotion is a SEPARATE decision from the negotiation diff,  */
/* its own `deal_promotion` row (no shared lock, so a live promotion and a live */
/* negotiation never block each other). D-21: product rewards are REAL line     */
/* deltas; D-22: non-product rewards (free delivery) live in condition_deltas   */
/* and render in Extra Conditions, never as a product line. D-26: resolving the */
/* promotion NEVER touches deal_confirmation or the Sign gate.                  */
/* -------------------------------------------------------------------------- */

/** `deal_promotion.state` - a promotion's life. `pending` until the buyer acts. */
export type PromotionState = "pending" | "accepted" | "declined";

/**
 * One REAL product-table reward line in a promotion (D-21) - e.g. "2 more units
 * of product X". Applied to `deal_line_item` INDEPENDENTLY at accept time (Open
 * Question 2). `unitPrice` is what the buyer PAYS for the reward (0 for a free
 * reward); `referencePrice` is the normal/struck per-unit price it is measured
 * against for the saving (D-25) - null when unknown (then it contributes no
 * saving). Prices are per-gram canonical, kg<->g normalized by `lineValueOf`.
 */
export interface PromotionLineDelta {
  /** the catalogue product this reward line points at; null for a free-typed reward */
  productId: string | null;
  productName: string;
  quantity: number;
  /** 'g' | 'kg' | 'unit' - the same per-gram canonical unit the card uses */
  unit: string;
  /** what the buyer PAYS for this reward line (0 = free) */
  unitPrice: number;
  currency: string;
  /** the normal/struck price the saving is measured against (D-25); null = unknown */
  referencePrice: number | null;
}

/**
 * One NON-product reward in a promotion (D-22) - e.g. free delivery. Rendered in
 * the card's Extra Conditions section by 07-07, NEVER as a product-table line.
 */
export interface PromotionConditionDelta {
  /** a stable reward key, e.g. 'free_delivery' */
  kind: string;
  /** the human label shown in Extra Conditions */
  label: string;
}

/**
 * A promotion resolved for the viewer (07-06). `getPromotion` returns the card's
 * current promotion (or null when none). The saving is pre-computed on the
 * canonical money (D-25) so the yellow track (07-07) only RENDERS "You saved X".
 */
export interface PromotionView {
  /** the deal card this promotion hangs off */
  dealCardId: string;
  state: PromotionState;
  /** the live version the offer was made against */
  baseVersion: number;
  /** REAL product-table reward lines (D-21) */
  lineDeltas: PromotionLineDelta[];
  /** non-product rewards for Extra Conditions (D-22) */
  conditionDeltas: PromotionConditionDelta[];
  /** the buyer's saving in currency units (D-25), computed via `promotionSavings`; 0 when nothing is saved */
  savings: number;
  currency: string;
  /** true when the viewer's company offered it (the seller); the buyer resolves accept/decline */
  iOffered: boolean;
}

/**
 * The offer-a-promotion payload handed to `offerPromotion` (seller-only). The
 * `offer_promotion` SECURITY DEFINER RPC it calls derives the seller from the
 * SESSION (never a client-claimed side) and inserts the `deal_promotion` row -
 * NO reason gate, NO version bump (D-26).
 */
export interface OfferPromotionInput {
  dealCardId: string;
  /** REAL product-table reward lines (D-21) */
  lineDeltas: PromotionLineDelta[];
  /** non-product rewards -> Extra Conditions (D-22); optional */
  conditionDeltas?: PromotionConditionDelta[];
}

/** Result of `offerPromotion` - the new `deal_promotion` id. */
export interface OfferPromotionResult {
  promotionId: string;
}
