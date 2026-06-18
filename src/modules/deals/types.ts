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
/** The deal_party_field row (role-scoped private fields, Phase 1), verbatim. */
export type DealPartyFieldRow = Tables["deal_party_field"]["Row"];

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
 * 3a only writes `draft`; the rest are reached by later units (3d confirm,
 * fulfilment) and the 2e seeded history.
 */
export type DealCardStatus =
  | "draft"
  | "withdrawn"
  | "confirmed"
  | "amended"
  | "done"
  | "cancelled";

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
}

/**
 * My-side private field (seller Margin / buyer placeholder). RLS only ever
 * returns the viewer's own rows, so a `PartyFieldView` is always "mine to see".
 */
export interface PartyFieldView {
  /** deal_party_field.id */
  id: string;
  side: PartySide;
  /** stable key, e.g. 'margin' */
  fieldKey: string;
  /** display label, e.g. 'Margin' */
  label: string;
  /** display value, e.g. '4.000 €' / '17%' / placeholder text */
  value: string | null;
}

/**
 * One line's per-side private margin, scoped to the VIEWER'S OWN side (MRGN-01).
 * Replaces {@link PartyFieldView} in role: a per-line, owner-only view that plans
 * 03 (app/edit read path) and 05 (create path) build against.
 *
 * RLS already returns ONLY the viewer's own `deal_line_item_private` row, so
 * `ownInput` is always "mine to see" - the same privacy discipline `PartyFieldView`
 * carried, now scoped per line. `ownInput` is the stored source of truth (D-07,
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
 * deal_confirmation_status.code - one party's stance on the current version
 * (`deal_confirmation.status`). A missing row reads as `pending` (the seat
 * exists - both companies always have a seat - even before anyone acts).
 */
export type ConfirmationStatus = "pending" | "confirmed" | "rejected";

/**
 * One seat in the two-sided confirm gate (3d) - a company's stance on the
 * current card version. The `ConfirmBar` renders the two seats and knows
 * nothing about `deal_confirmation`; this view is its only input (so 3.5 can
 * feed the same bar from the per-change accept source - "same face, engine swap").
 */
export interface ConfirmSeat {
  side: PartySide;
  companyId: string;
  companyName: string;
  status: ConfirmationStatus;
  /** the person who responded (for "confirmed · Alice"); null while pending */
  byName: string | null;
  /** ISO timestamp of the response; null while pending */
  respondedAt: string | null;
}

/** What a party can do at the gate (3d server action input). */
export type ConfirmDecision = "confirm" | "decline" | "withdraw";

/** Result of a `confirmDeal` action - a fast hint; the client re-reads the card. */
export interface ConfirmResult {
  /** the card status AFTER the action */
  cardStatus: DealCardStatus;
  /** true only when this action was the second confirm that flipped the gate */
  bothConfirmed: boolean;
}

/**
 * The whole card, ready to render. One `getDealCard(id)` read assembles this:
 * the card (narrowed), the current-version line items, my-side private fields,
 * the seeded signals for my side, the full version log, and the two confirm
 * seats for the current version (3d).
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
  /** my-side private fields (RLS-filtered to the viewer's company) */
  partyFields: PartyFieldView[];
  /** my-side advisory signals (seeded in 3a) */
  signals: SignalView[];
  /** full version history, newest first */
  log: LogEntry[];
  /** which side the viewer is on (seller/buyer); null if the viewer has no company */
  viewerSide: PartySide | null;
  /** the two confirm seats for the current version (3d); seller first, then buyer */
  confirmations: ConfirmSeat[];
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
}

/* -------------------------------------------------------------------------- */
/* Stages + Things - the per-stage checklist (screen ④, 3c)                   */
/* -------------------------------------------------------------------------- */

/** The thing row, verbatim. */
export type ThingRow = Tables["thing"]["Row"];

/**
 * deal_stage.code - the 5 fixed pipeline stages (`thing.stage_code`).
 * Seeded in 20260607090001 (sort_order 1-5). For 3c the bar that shows these
 * is screen-only; the stage list itself is read from `deal_stage`.
 */
export type StageCode =
  | "negotiation"
  | "compliance_quality"
  | "agreement"
  | "payment"
  | "fulfilment_delivery";

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
 */
export interface ThingView {
  /** thing.id */
  id: string;
  title: string;
  type: ThingType;
  status: ThingStatus;
  stageCode: StageCode;
  /** order within its stage */
  sortOrder: number;
}

/**
 * One stage with its Things, ready to render. The 5 stages come from
 * `deal_stage` (so order + labels stay schema-driven); each carries the Things
 * whose `stage_code` matches. `thingsDone`/`thingsTotal` drive the progress
 * count. The "current" highlight is NOT here - it's screen-only local state (D2).
 */
export interface StageView {
  code: StageCode;
  /** display label, e.g. "Compliance & Quality" (from deal_stage.description, titled) */
  label: string;
  /** deal_stage.sort_order (1-5) */
  sortOrder: number;
  things: ThingView[];
  thingsTotal: number;
  thingsDone: number;
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
  /** pricelist_item.price_per_gram; null when the product has no live price */
  unitPrice: number | null;
  currency: string;
  thcPercent: number | null;
  cbdPercent: number | null;
  /** local_code_pzn (German PZN) */
  pzn: string | null;
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
  quantity: number;
  /** deal_line_unit code: 'g' | 'kg' | 'unit' */
  unit: string;
  unitPrice: number | null;
  currency: string;
  cultivar?: string | null;
  pzn?: string | null;
  thcPercent?: number | null;
  cbdPercent?: number | null;
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
 * The 6 CONTENT fields (lines, freeDelivery, dueDate, paymentTermsCode,
 * privateValue, note) are produced by DealForm itself; the 3 IDENTITY fields
 * (recipient, source, attachedDealId) are wrapper-supplied (D-03):
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
  privateValue: string | null;
  note: string | null;
  recipient: DealRecipient | null;
  source: DealSource;
  attachedDealId: string | null;
}

/** Just the 6 CONTENT fields DealForm owns; the wrappers complete the Basket. */
export type DealBasketContent = Pick<
  DealBasket,
  "lines" | "freeDelivery" | "dueDate" | "paymentTermsCode" | "privateValue" | "note"
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
  /** the creator's OWN-side private box (seller: buying price from supplier) */
  privateValue?: string | null;
  /** the creation note (optional at draft - D7; becomes mandatory on edits, 3.5b) */
  note?: string | null;
}

/** Result of `createDeal` - the new card id so the chat's deal area can open it. */
export interface CreateDealResult {
  dealCardId: string;
}

/**
 * The propose-form payload handed to `proposeDeal` (Waypoint 4.5.1). Same shape
 * as create plus the p2p `threadId` the proposal message is posted into. The
 * manual door no longer births a card - it writes a `deal_detected` proposal
 * (sender's side pre-accepted) and the card is born only when the other side
 * accepts (the unified `confirm_detected_deal` birth).
 *
 * Note: `privateValue` is intentionally NOT carried to the proposal - the
 * proposal is a chat message both sides can read, so the proposer's own-side
 * private box would leak. The private box is added after birth via edit.
 */
export interface ProposeDealInput extends CreateDealInput {
  /** the p2p chat thread the proposal message is posted into */
  threadId: string;
}

/** Result of `proposeDeal` - the `deal_detected` proposal message id (pre-card object). */
export interface ProposeDealResult {
  messageId: string;
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

/**
 * The edit-form payload handed to `editDeal` (3.5b). Same shape as create but on
 * an existing card, and the `note` is MANDATORY - every change carries a human
 * "why" (D2). Pressing Update bumps the version and resets the confirm gate.
 */
export interface EditDealInput {
  dealCardId: string;
  lines: DraftLineInput[];
  freeDelivery?: boolean;
  dueDate?: string | null;
  paymentTermsCode?: string | null;
  privateValue?: string | null;
  /** REQUIRED on an edit (unlike create, where it is optional at draft). */
  note: string;
}

/** Result of `editDeal` - the new version number the card was bumped to. */
export interface EditDealResult {
  version: number;
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
 * strip Send pop-up, NOT the edit form (D-08). `privateValue` is the proposer's
 * OWN-side private box - it is written IMMEDIATELY + ungated at the current
 * version inside the action and NEVER enters the shared held draft (D-09).
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
  /** the proposer's OWN-side private box - written immediately, never in the shared draft (D-09) */
  privateValue?: string | null;
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
