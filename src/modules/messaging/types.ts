/**
 * Messaging module - chat types.
 *
 * Ground truth = Muskan's generated schema (`src/types/database.types.ts`).
 * We bind to her `Row` types directly so these can never drift from the DB.
 * The lookup `code` columns are typed `string` in the generated types (they are
 * FKs to `chat_thread_type.code` / `content_author.code` / `chat_message_type.code`
 * / `relationship_status.code`); the exact allowed values are the *seeded* codes,
 * so we narrow them here.
 * Code source: supabase/migrations/20260607090001_lookups_and_seeds.sql
 *              supabase/migrations/20260607090003_phase2_deal.sql
 */
import type { Database } from "@/types/database.types";

type Tables = Database["public"]["Tables"];

/* -------------------------------------------------------------------------- */
/* Raw rows - verbatim from the generated schema                              */
/* -------------------------------------------------------------------------- */

/** The chat_thread row, verbatim. */
export type ChatThreadRow = Tables["chat_thread"]["Row"];
/** The chat_message row, verbatim. */
export type ChatMessageRow = Tables["chat_message"]["Row"];
/** The relationship row, verbatim. */
export type RelationshipRow = Tables["relationship"]["Row"];

/* -------------------------------------------------------------------------- */
/* Seeded code unions - narrow the lookup `string` columns                    */
/* -------------------------------------------------------------------------- */

/**
 * chat_thread_type.code - seeded values.
 * `c2c` + `p2p` are the 2a slice; `deal` is the deal workspace (3a+);
 * `group` is the Phase-7 multi-member group chat (07-02 backend). A group
 * resolves its participants from `chat_thread_member`, not the person slots.
 */
export type ThreadType = "c2c" | "p2p" | "deal" | "group";

/**
 * content_author.code - the message author class (`chat_message.sender`).
 * A human line is `person` (NOT `user`); `system` = the C2C audit voice;
 * `sella` = the AI facilitator in P2P/deal threads.
 */
export type MessageSender = "person" | "system" | "sella";

/**
 * chat_message_type.code - seeded discriminator (`chat_message.type`).
 * Full seeded union (mirrors the lookup table); **this slice only emits**
 * `message`, `connection_established`, and `intro`. The `deal_*` /
 * `workspace_created` codes belong to the deal flow (3a+).
 */
export type MessageType =
  | "message"
  | "connection_established"
  | "intro"
  | "deal_detected"
  | "deal_started"
  | "workspace_created"
  | "deal_opened"
  | "deal_cancelled"
  | "deal_card_updated";

/** relationship_status.code - seeded values. This slice writes `active`. */
export type RelationshipStatus = "active" | "suspended" | "ended";

/* -------------------------------------------------------------------------- */
/* Narrowed rows - identical shape to the DB row, lookup columns tightened.   */
/* Reading a real row is therefore an assignable swap (same discipline as 2a).*/
/* -------------------------------------------------------------------------- */

/** chat_thread with `type` narrowed to its seeded union. */
export type ChatThread = Omit<ChatThreadRow, "type"> & { type: ThreadType };

/** chat_message with `sender` + `type` narrowed to their seeded unions. */
export type ChatMessage = Omit<ChatMessageRow, "sender" | "type"> & {
  sender: MessageSender;
  type: MessageType;
};

/** relationship with `status` narrowed to its seeded union. */
export type Relationship = Omit<RelationshipRow, "status"> & {
  status: RelationshipStatus;
};

/* -------------------------------------------------------------------------- */
/* UI projections - the joined/derived shapes the list + thread render.       */
/* In real data each is one Supabase select-with-joins; the mock returns the  */
/* same shape, so mock -> real is a body rewrite behind index.ts.             */
/* -------------------------------------------------------------------------- */

/**
 * One row in the conversation list (panel 3). The `company*` fields drive the
 * "Companies" grouping filter and (later, 2e) the relationship deep-link.
 */
export interface ConversationListItem {
  /** chat_thread.id */
  threadId: string;
  threadType: ThreadType;
  /**
   * chat_thread.relationship_id - the deep-link target for the relationship page
   * (2e). A `group` thread carries NO relationship anchor (07-02 dropped the
   * NOT NULL: group access is by membership), so this is `null` for groups;
   * p2p/c2c/deal rows always fill it.
   */
  relationshipId: string | null;
  /** display name: the company name for a c2c, the other person's name for a p2p */
  name: string;
  /** subtitle under the name: "Company chat (C2C)" for c2c, the company name for a p2p */
  subtitle: string;
  /** computed avatar initials */
  initials: string;
  /** the other company - grouping key for the "Companies" filter */
  companyId: string;
  companyName: string;
  /** last message body, truncated for preview; null when the thread has no messages */
  lastMessagePreview: string | null;
  /** ISO timestamp of the last message; drives sort + time-ago. null = empty thread */
  lastMessageAt: string | null;
  /** unread count - mock-derived for now */
  unreadCount: number;
  /**
   * On `threadType === 'deal'` rows (3b) AND deal-card-born `group` rows (D-07):
   * the deal this chat belongs to. A deal row navigates to the workspace; a
   * deal-born group files under the Deals filter (D-07) and can open the card.
   */
  dealCardId?: string;
  /**
   * True when the chat involves another company (external), false when it is
   * own-company-only (internal). Drives the Group ▾ Internal/External filters
   * (D-01). `p2p`/`c2c`/`deal` are always cross-company (external); a `group`
   * computes it from its members. `undefined` is treated as external.
   */
  isExternal?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Group creation (07-05) - the external-gate (D-05) result shapes            */
/* -------------------------------------------------------------------------- */

/**
 * A group member the server placed behind the D-05 external gate: an external
 * company person added to a deal-card-born group, still `pending_external`
 * until TWO distinct active members approve (`approve_group_member`).
 */
export interface PendingExternalMember {
  /** person.id - the target handed to approveGroupMember */
  personId: string;
  /** display name for the approval row */
  name: string;
}

/**
 * What `createGroupThread` returns: the new group thread id plus any members
 * the server put behind the external gate (D-05). An empty `pendingExternal`
 * means the group is fully active (a plain new-chat group, or a deal group
 * with only the 2 deal parties).
 */
export interface GroupCreationResult {
  threadId: string;
  pendingExternal: PendingExternalMember[];
}

/**
 * One message in the thread stream (panel 4). `isMine` is only meaningful for
 * `sender === 'person'`; system/sella lines render in their own voice (§1).
 */
export interface ChatMessageView extends ChatMessage {
  /** sender_person_id === the viewer's person id */
  isMine: boolean;
  /** display name of the author: the person's name, "Sella", or "System" */
  authorName: string;
  /** avatar initials for a person author; null for system/sella */
  authorInitials: string | null;
}

/* -------------------------------------------------------------------------- */
/* New-chat picker (04B) - the "my connections -> their people/companies" view */
/* The connections read (supabase/connections.ts) returns these; the FE        */
/* new-chat dropdown consumes them via @/modules/messaging.                     */
/* -------------------------------------------------------------------------- */

/**
 * One person of a connected company, for a person-mode row in the picker.
 * There is NO `person.role` column in the schema, so `role` is derived from
 * `person.metadata.role` and is `null` for almost everyone (the picker simply
 * renders nothing under the name when it is null). There is deliberately NO
 * presence/last-seen field - no presence backend exists, so the picker does not
 * fake one.
 */
export interface ConnectedPerson {
  /** person.id - the P2P "other person" handed to openOrCreateP2pThread */
  personId: string;
  /** display_name ?? (first_name + " " + last_name) */
  name: string;
  /** computed avatar initials */
  initials: string;
  /** person.metadata.role if a non-empty string, else null (no role column) */
  role: string | null;
}

/**
 * One connected company, for a company-mode row in the picker. `connectedAt`
 * (= relationship.created_at) drives the "New connections by date" section, and
 * `openDealCount` is the truthful open-deal badge (D-06). `people` are this
 * company's people the viewer is allowed to see (RLS counterparty visibility).
 */
export interface ConnectedCompany {
  /** company.id (the OTHER company in the relationship) */
  companyId: string;
  /** relationship.id - the key for resolving/creating the C2C or P2P thread */
  relationshipId: string;
  /** company.name */
  name: string;
  /** company.city - a real column; powers "N contacts · City" (may be null) */
  city: string | null;
  /** computed avatar initials */
  initials: string;
  /** count of this company's visible people */
  contactsCount: number;
  /** relationship.created_at (ISO) - the connected-since date */
  connectedAt: string;
  /** count of OPEN deal_card rows for this relationship (D-06; no faked unread) */
  openDealCount: number;
  /** this company's visible people */
  people: ConnectedPerson[];
}

/**
 * The whole picker directory: every company the viewer is connected to, with
 * its people. The FE derives person-mode (flatten people) and the
 * "New connections" section (filter by `connectedAt` within the recency window)
 * from this single shape.
 */
export interface MyConnectionsView {
  companies: ConnectedCompany[];
}

/**
 * One person row from the widened name search (D-04). The New-Group picker
 * defaults to the connected directory but searches beyond it to ANY HelloSello
 * user the viewer's RLS allows to see - this is that search's result shape.
 */
export interface PeopleSearchResult {
  /** person.id - handed to createGroupThread as a member */
  personId: string;
  /** display_name ?? (first_name + " " + last_name) */
  name: string;
  /** computed avatar initials */
  initials: string;
  /** the person's company (for the subtitle line); null if RLS hid it */
  companyId: string | null;
  companyName: string | null;
}

/* -------------------------------------------------------------------------- */
/* The accept contract - the published language between connect and messaging */
/* -------------------------------------------------------------------------- */

/**
 * The four inbound request types that drive the accept rollout (§2).
 * Deliberately a *local copy* of connect's `InboxRequestType` (same string
 * values): messaging owns this contract and must NOT import connect's types,
 * so the module dependency stays one-directional (connect -> messaging) with
 * no cycle. connect maps its `InboxItemView.type` onto this when it calls
 * `acceptInbox`.
 */
export type AcceptRequestType =
  | "connect"
  | "connect_message"
  | "pricelist_request"
  | "deal_card";

/** A company party in the accept contract. */
export interface PartyCompany {
  /** company.id */
  id: string;
  /** company.name */
  name: string;
  /** computed avatar initials - passed through so inbox + chat agree */
  initials: string;
}

/** A person party in the accept contract. */
export interface PartyPerson {
  /** person.id */
  id: string;
  /** person.first_name + " " + person.last_name */
  name: string;
  /** computed avatar initials */
  initials: string;
}

/**
 * The plain DTO `connect.acceptItem` hands to `messaging.acceptInbox` to run
 * the accept side-effects (mint relationship + threads + seed lines, §2).
 * Plain data only - no connect row types - so messaging never depends on
 * connect (the seam that breaks the otherwise-circular dependency).
 */
export interface AcceptInput {
  /** pending_inbox_item.id - written onto relationship.inbox_item_id */
  inboxItemId: string;
  /** which rollout to run (the §2 table) */
  requestType: AcceptRequestType;
  /** the sender's note (present for connect_message); null otherwise */
  note: string | null;
  /** our side - the accepting company */
  ownCompany: PartyCompany;
  /** the requesting company */
  senderCompany: PartyCompany;
  /** the owner/viewer person on our side (the P2P participant + relationship.created_by) */
  viewerPerson: PartyPerson;
  /** the sender's contact person on their side (the other P2P participant) */
  senderPerson: PartyPerson;
}
