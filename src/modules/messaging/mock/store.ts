/**
 * Messaging - MOCK in-memory store. **The only throwaway file in 2b/2c.**
 *
 * Holds `relationships` / `threads` / `messages` plus two small directories
 * (`companies` / `people`) that stand in for the joins a real query resolves
 * (chat_thread.person_a_id -> person.name, relationship.company_b_id ->
 * company.name, ...). Accessors are async + return the same view shapes a real
 * Supabase select-with-joins would, so the swap (real data) is a body rewrite
 * behind `index.ts` - no component changes. Everything outside this file is real.
 *
 * Lifetime note: this is a client-side module singleton. Accepting a ticket on
 * /connect/inbox mutates this store; navigating to /connect/chat reads it - the
 * same JS module instance persists across in-app navigation. A full page reload
 * resets it to the pre-seed below (fine for a mock; real persistence is the DB).
 *
 * Anchored on the live seed identities (same as connect's mock):
 *   GreenLeaf Cultivation = aaaaaaaa-...  (the viewer/own company)
 *   Alice Green           = 11111111-...  (the viewer)
 * Pre-seed contacts (MedicoPharmaX / Apo Berlin) are invented for cold-start
 * texture and use clearly-fake `ffffffff-...` UUIDs.
 */
import type {
  AcceptInput,
  ChatMessage,
  ChatMessageView,
  ChatThread,
  ConversationListItem,
  MessageType,
  Relationship,
  ThreadType,
} from "../types";
import { planRollout } from "../lib/rollout";
import { previewOf } from "../lib/chat-display";

/* -------------------------------------------------------------------------- */
/* Identities                                                                 */
/* -------------------------------------------------------------------------- */

interface CompanyDir {
  id: string;
  name: string;
  initials: string;
}
interface PersonDir {
  id: string;
  name: string;
  initials: string;
  companyId: string;
}

const OWN_COMPANY: CompanyDir = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  name: "GreenLeaf Cultivation",
  initials: "GL",
};
/** The viewer = GreenLeaf's Alice (matches connect's VIEWER). */
const VIEWER: PersonDir = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Alice Green",
  initials: "AG",
  companyId: OWN_COMPANY.id,
};

/** Exposed so view code can compute "is this message mine?" off one constant. */
export const VIEWER_PERSON_ID = VIEWER.id;

/* -------------------------------------------------------------------------- */
/* State                                                                      */
/* -------------------------------------------------------------------------- */

const relationships: Relationship[] = [];
const threads: ChatThread[] = [];
const messages: ChatMessage[] = [];
/** thread_id -> unread count. Real unread is read-receipt derived; mock holds it. */
const unreadByThread = new Map<string, number>();

/** Join directories - id -> display, the joins a real query resolves. */
const companies = new Map<string, CompanyDir>();
const people = new Map<string, PersonDir>();

function registerCompany(c: CompanyDir): void {
  if (!companies.has(c.id)) companies.set(c.id, c);
}
function registerPerson(p: PersonDir): void {
  if (!people.has(p.id)) people.set(p.id, p);
}

let seq = 0;
const newId = (prefix: string) => `${prefix}_${String(seq++).padStart(3, "0")}`;
const nowIso = () => new Date().toISOString();

/* -------------------------------------------------------------------------- */
/* Row builders                                                               */
/* -------------------------------------------------------------------------- */

function addThread(
  p: { type: ThreadType; personAId: string | null; personBId: string | null },
  relationshipId: string,
  createdAt: string,
): ChatThread {
  const thread: ChatThread = {
    id: newId("thr"),
    relationship_id: relationshipId,
    type: p.type,
    person_a_id: p.personAId,
    person_b_id: p.personBId,
    deal_card_id: null,
    created_at: createdAt,
    deleted_at: null,
  };
  threads.push(thread);
  return thread;
}

function addMessage(
  threadId: string,
  m: {
    sender: ChatMessage["sender"];
    senderPersonId: string | null;
    type: MessageType;
    body: string;
    createdAt: string;
  },
): ChatMessage {
  const msg: ChatMessage = {
    id: newId("msg"),
    thread_id: threadId,
    sender: m.sender,
    sender_person_id: m.senderPersonId,
    type: m.type,
    body: m.body,
    metadata: {},
    created_at: m.createdAt,
    deleted_at: null,
  };
  messages.push(msg);
  return msg;
}

/** Canonical p2p participant order (DB CHECK person_a_id < person_b_id). */
function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/* -------------------------------------------------------------------------- */
/* 2b - the accept side-effect                                                */
/* -------------------------------------------------------------------------- */

/**
 * Run the accept rollout: mint a `relationship`, a c2c thread (+ its
 * `connection_established` line), and - for substantive requests - a p2p thread
 * seeded by Sella. Idempotent on `inbox_item_id` so a double-accept is a no-op.
 */
export async function acceptInbox(
  input: AcceptInput,
): Promise<{ relationshipId: string; threadIds: string[] }> {
  const existing = relationships.find((r) => r.inbox_item_id === input.inboxItemId);
  if (existing) {
    const ids = threads.filter((t) => t.relationship_id === existing.id).map((t) => t.id);
    return { relationshipId: existing.id, threadIds: ids };
  }

  // Register the joins this accept introduces.
  registerCompany({ ...input.ownCompany });
  registerCompany({ ...input.senderCompany });
  registerPerson({ ...input.viewerPerson, companyId: input.ownCompany.id });
  registerPerson({ ...input.senderPerson, companyId: input.senderCompany.id });

  const ts = nowIso();
  const relationship: Relationship = {
    id: newId("rel"),
    company_a_id: input.ownCompany.id,
    company_b_id: input.senderCompany.id,
    initiated_by_company_id: input.senderCompany.id, // the requester initiated
    inbox_item_id: input.inboxItemId,
    status: "active",
    created_by: input.viewerPerson.id,
    updated_by: input.viewerPerson.id,
    metadata: {},
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  };
  relationships.push(relationship);

  const plan = planRollout(input);
  const threadIds: string[] = [];
  plan.threads.forEach((spec, ti) => {
    const thread = addThread(
      { type: spec.type, personAId: spec.personAId, personBId: spec.personBId },
      relationship.id,
      ts,
    );
    threadIds.push(thread.id);
    let unread = 0;
    spec.seed.forEach((s, mi) => {
      // Nudge each line a few ms apart so stream order is deterministic.
      const createdAt = new Date(Date.parse(ts) + ti * 1_000 + mi * 100).toISOString();
      addMessage(thread.id, {
        sender: s.sender,
        senderPersonId: s.senderPersonId,
        type: s.type,
        body: s.body,
        createdAt,
      });
      if (s.senderPersonId !== input.viewerPerson.id) unread += 1; // not mine -> unread
    });
    unreadByThread.set(thread.id, unread);
  });

  return { relationshipId: relationship.id, threadIds };
}

/* -------------------------------------------------------------------------- */
/* 2c - reads + composer                                                      */
/* -------------------------------------------------------------------------- */

/** The conversation list (panel 3), newest activity first; empty threads sink. */
export async function getConversations(): Promise<ConversationListItem[]> {
  const items = threads.filter((t) => t.deleted_at === null).map(toListItem);
  items.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
  return structuredClone(items);
}

/** The ordered message stream for one thread (panel 4). */
export async function getMessages(threadId: string): Promise<ChatMessageView[]> {
  const stream = messages
    .filter((m) => m.thread_id === threadId && m.deleted_at === null)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(toMessageView);
  return structuredClone(stream);
}

/** Mark a thread read (clears its unread badge). Called when the thread opens. */
export async function markRead(threadId: string): Promise<void> {
  unreadByThread.set(threadId, 0);
}

/**
 * Post a human message into a thread - works for both P2P and C2C. A C2C is a
 * company-level channel you message on behalf of your company (DECISIONS.md:515);
 * it also carries system lines, but it is not read-only. Empty bodies are
 * ignored. Returns the updated stream so the caller re-renders.
 */
export async function postMessage(threadId: string, body: string): Promise<ChatMessageView[]> {
  const thread = threads.find((t) => t.id === threadId);
  if (!thread) throw new Error(`Thread not found: ${threadId}`);
  const text = body.trim();
  if (text) {
    addMessage(threadId, {
      sender: "person",
      senderPersonId: VIEWER.id,
      type: "message",
      body: text,
      createdAt: nowIso(),
    });
  }
  return getMessages(threadId);
}

/* -------------------------------------------------------------------------- */
/* Projections (the joins a real select-with-joins would resolve)             */
/* -------------------------------------------------------------------------- */

function lastMessageOf(threadId: string): ChatMessage | null {
  const msgs = messages.filter((m) => m.thread_id === threadId && m.deleted_at === null);
  if (msgs.length === 0) return null;
  return msgs.reduce((a, b) => (a.created_at >= b.created_at ? a : b));
}

function toListItem(t: ChatThread): ConversationListItem {
  const rel = relationships.find((r) => r.id === t.relationship_id);
  const last = lastMessageOf(t.id);
  const base = {
    threadId: t.id,
    threadType: t.type,
    lastMessagePreview: last ? previewOf(last.body) : null,
    lastMessageAt: last?.created_at ?? null,
    unreadCount: unreadByThread.get(t.id) ?? 0,
  };

  if (t.type === "c2c") {
    const otherId =
      rel?.company_a_id === OWN_COMPANY.id ? rel?.company_b_id : rel?.company_a_id;
    const co = otherId ? companies.get(otherId) : undefined;
    const companyName = co?.name ?? "Unknown company";
    return {
      ...base,
      name: companyName,
      subtitle: "Company chat (C2C)",
      initials: co?.initials ?? "?",
      companyId: otherId ?? "",
      companyName,
    };
  }

  // p2p (deal threads are 3a+; not created in this slice)
  const otherPersonId = t.person_a_id === VIEWER.id ? t.person_b_id : t.person_a_id;
  const per = otherPersonId ? people.get(otherPersonId) : undefined;
  const co = per ? companies.get(per.companyId) : undefined;
  const companyName = co?.name ?? "Unknown company";
  return {
    ...base,
    name: per?.name ?? "Unknown",
    subtitle: companyName,
    initials: per?.initials ?? "?",
    companyId: co?.id ?? "",
    companyName,
  };
}

function toMessageView(m: ChatMessage): ChatMessageView {
  if (m.sender === "system") {
    return { ...m, isMine: false, authorName: "System", authorInitials: null };
  }
  if (m.sender === "sella") {
    return { ...m, isMine: false, authorName: "Sella", authorInitials: null };
  }
  const per = m.sender_person_id ? people.get(m.sender_person_id) : undefined;
  return {
    ...m,
    isMine: m.sender_person_id === VIEWER.id,
    authorName: per?.name ?? "Unknown",
    authorInitials: per?.initials ?? "?",
  };
}

/* -------------------------------------------------------------------------- */
/* Pre-seed - 1-2 existing conversations so the list isn't empty cold         */
/* -------------------------------------------------------------------------- */

function seedConnected(opts: {
  other: CompanyDir;
  otherPerson: PersonDir;
  /** the C2C "connected" timestamp (also the thread created_at) */
  connectedAt: string;
  /** p2p human lines (mine vs theirs); omit to leave the relationship C2C-only */
  p2p?: { unread: number; lines: Array<{ mine: boolean; body: string; at: string }> };
}): void {
  registerCompany(opts.other);
  registerPerson(opts.otherPerson);

  const rel: Relationship = {
    id: newId("rel"),
    company_a_id: OWN_COMPANY.id,
    company_b_id: opts.other.id,
    initiated_by_company_id: opts.other.id,
    inbox_item_id: null, // pre-existing - not minted from an inbox ticket
    status: "active",
    created_by: VIEWER.id,
    updated_by: VIEWER.id,
    metadata: {},
    created_at: opts.connectedAt,
    updated_at: opts.connectedAt,
    deleted_at: null,
  };
  relationships.push(rel);

  const c2c = addThread({ type: "c2c", personAId: null, personBId: null }, rel.id, opts.connectedAt);
  addMessage(c2c.id, {
    sender: "system",
    senderPersonId: null,
    type: "connection_established",
    body: `${OWN_COMPANY.name} and ${opts.other.name} are now connected.`,
    createdAt: opts.connectedAt,
  });
  unreadByThread.set(c2c.id, 0);

  if (opts.p2p) {
    const [a, b] = canonicalPair(VIEWER.id, opts.otherPerson.id);
    const p2p = addThread({ type: "p2p", personAId: a, personBId: b }, rel.id, opts.connectedAt);
    opts.p2p.lines.forEach((l) =>
      addMessage(p2p.id, {
        sender: "person",
        senderPersonId: l.mine ? VIEWER.id : opts.otherPerson.id,
        type: "message",
        body: l.body,
        createdAt: l.at,
      }),
    );
    unreadByThread.set(p2p.id, opts.p2p.unread);
  }
}

function seedStore(): void {
  registerCompany(OWN_COMPANY);
  registerPerson(VIEWER);

  seedConnected({
    other: { id: "ffffffff-0000-0000-0000-000000000001", name: "MedicoPharmaX", initials: "MP" },
    otherPerson: {
      id: "ffffffff-1111-0000-0000-000000000001",
      name: "Anna Müller",
      initials: "AM",
      companyId: "ffffffff-0000-0000-0000-000000000001",
    },
    connectedAt: "2026-06-04T09:00:00.000Z",
    p2p: {
      unread: 2,
      lines: [
        { mine: false, body: "Hi Alice - following up on the July delivery schedule.", at: "2026-06-05T08:10:00.000Z" },
        { mine: true, body: "Hi Anna, checking with logistics now - I'll confirm today.", at: "2026-06-05T08:25:00.000Z" },
        { mine: false, body: "Re: delivery schedule - any update on the dates?", at: "2026-06-07T15:40:00.000Z" },
      ],
    },
  });

  seedConnected({
    other: { id: "ffffffff-0000-0000-0000-000000000002", name: "Apo Berlin", initials: "AB" },
    otherPerson: {
      id: "ffffffff-1111-0000-0000-000000000002",
      name: "Petra Keller",
      initials: "PK",
      companyId: "ffffffff-0000-0000-0000-000000000002",
    },
    connectedAt: "2026-06-06T11:00:00.000Z",
    p2p: {
      unread: 1,
      lines: [
        { mine: false, body: "Can you send the updated certificate of analysis?", at: "2026-06-07T10:05:00.000Z" },
      ],
    },
  });
}

seedStore();
