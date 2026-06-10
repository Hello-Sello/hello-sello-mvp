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
 * The whole card, ready to render. One `getDealCard(id)` read assembles this:
 * the card (narrowed), the current-version line items, my-side private fields,
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
  /** my-side private fields (RLS-filtered to the viewer's company) */
  partyFields: PartyFieldView[];
  /** my-side advisory signals (seeded in 3a) */
  signals: SignalView[];
  /** full version history, newest first */
  log: LogEntry[];
  /** which side the viewer is on (seller/buyer); null if the viewer has no company */
  viewerSide: PartySide | null;
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
