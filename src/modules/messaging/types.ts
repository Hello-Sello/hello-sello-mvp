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
 * This slice creates `c2c` + `p2p`; `deal` is the deal workspace (3a+).
 */
export type ThreadType = "c2c" | "p2p" | "deal";

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
  /** chat_thread.relationship_id - the deep-link target for the relationship page (2e) */
  relationshipId: string;
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
   * Only on `threadType === 'deal'` rows (3b): the deal this chat belongs to.
   * A deal row does not select in place - it NAVIGATES to the workspace
   * (`/connect/deal/[dealCardId]`), where the deal chat lives.
   */
  dealCardId?: string;
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
