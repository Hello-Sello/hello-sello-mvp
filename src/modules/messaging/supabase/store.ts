/**
 * Messaging - REAL Supabase reads (2d, Phase 3).
 *
 * Replaces the READ half of `mock/store.ts`. Returns the exact
 * `ConversationListItem` / `ChatMessageView` shapes the components consume, so
 * the swap is just an import change in `ChatView`. The viewer comes from the
 * logged-in session (person.id = auth.uid()) - no hardcoded VIEWER.
 *
 * RLS (`can_access_thread` / `msg_all`) scopes threads + messages to the viewer,
 * and the 2d counterparty-visibility policy lets us read the other side's
 * company + person NAME. We fetch each table flat (RLS-scoped) and stitch the
 * view in JS - the same "directory" resolution the mock did, just from the DB.
 *
 * WRITES (`postMessage`, `acceptInbox`) stay mock until Phase 4.
 */
import { createClient } from "@/shared/db/client";
import { previewOf } from "../lib/chat-display";
import { planRollout } from "../lib/rollout";
import type {
  AcceptInput,
  ChatMessageView,
  ConversationListItem,
  MessageSender,
  MessageType,
  ThreadType,
} from "../types";

function personInitials(first: string | null | undefined, last: string | null | undefined): string {
  const i = ((first?.[0] ?? "") + (last?.[0] ?? "")).toUpperCase();
  return i || "?";
}

function companyInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0] ?? "").join("");
  return (letters || name[0] || "?").toUpperCase();
}

/** Unwrap a PostgREST embed that may type as an object or a single-element array. */
function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

type SupabaseBrowserClient = ReturnType<typeof createClient>;

/** The viewer's person id + company id, from the session. */
async function getViewer(
  supabase: SupabaseBrowserClient,
): Promise<{ personId: string; companyId: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("messaging: no authenticated user");
  const { data, error } = await supabase
    .from("person")
    .select("id, company_id")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  return { personId: user.id, companyId: data?.company_id ?? null };
}

/** The viewer's person id (= auth.uid()). Exposed for consumers that need it. */
export async function getViewerPersonId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("messaging: no authenticated user");
  return user.id;
}

/** The conversation list (panel 3), newest activity first; empty threads sink. */
export async function getConversations(): Promise<ConversationListItem[]> {
  const supabase = createClient();
  const viewer = await getViewer(supabase);

  // Flat, RLS-scoped fetches; stitched in JS (mirrors the mock's directories).
  const [threadsRes, relsRes, cosRes, pplRes, msgsRes] = await Promise.all([
    supabase
      .from("chat_thread")
      .select("id, type, relationship_id, person_a_id, person_b_id, created_at")
      .is("deleted_at", null),
    supabase.from("relationship").select("id, company_a_id, company_b_id"),
    supabase.from("company").select("id, name"),
    supabase.from("person").select("id, first_name, last_name"),
    supabase
      .from("chat_message")
      .select("thread_id, body, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
  ]);
  for (const r of [threadsRes, relsRes, cosRes, pplRes, msgsRes]) {
    if (r.error) throw r.error;
  }

  const relById = new Map((relsRes.data ?? []).map((r) => [r.id, r] as const));
  const coNameById = new Map((cosRes.data ?? []).map((c) => [c.id, c.name] as const));
  const personById = new Map((pplRes.data ?? []).map((p) => [p.id, p] as const));
  // ordered asc, so the last write for a thread is its latest message
  const lastByThread = new Map<string, { body: string; created_at: string }>();
  for (const m of msgsRes.data ?? []) {
    lastByThread.set(m.thread_id, { body: m.body, created_at: m.created_at });
  }

  const items: ConversationListItem[] = (threadsRes.data ?? []).map((t) => {
    const rel = relById.get(t.relationship_id);
    const otherCompanyId =
      rel?.company_a_id === viewer.companyId ? rel?.company_b_id : rel?.company_a_id;
    const otherCompanyName = (otherCompanyId && coNameById.get(otherCompanyId)) || "Unknown company";
    const last = lastByThread.get(t.id) ?? null;

    const base = {
      threadId: t.id,
      threadType: t.type as ThreadType,
      relationshipId: t.relationship_id,
      lastMessagePreview: last ? previewOf(last.body) : null,
      lastMessageAt: last?.created_at ?? null,
      unreadCount: 0, // client-tracked unread lands in Phase 6
      companyId: otherCompanyId ?? "",
      companyName: otherCompanyName,
    };

    if (t.type === "c2c") {
      return {
        ...base,
        name: otherCompanyName,
        subtitle: "Company chat (C2C)",
        initials: companyInitials(otherCompanyName),
      };
    }

    // p2p - the other participant
    const otherPersonId = t.person_a_id === viewer.personId ? t.person_b_id : t.person_a_id;
    const per = otherPersonId ? personById.get(otherPersonId) : undefined;
    const personName = per ? `${per.first_name} ${per.last_name}`.trim() : "Unknown";
    return {
      ...base,
      name: personName,
      subtitle: otherCompanyName,
      initials: personInitials(per?.first_name, per?.last_name),
    };
  });

  items.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
  return items;
}

/** The ordered message stream for one thread (panel 4). */
export async function getMessages(threadId: string): Promise<ChatMessageView[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const viewerId = user?.id ?? null;

  const { data, error } = await supabase
    .from("chat_message")
    .select(
      `id, thread_id, sender, sender_person_id, type, body, metadata, created_at, deleted_at,
       author:person!chat_message_sender_person_id_fkey ( first_name, last_name )`,
    )
    .eq("thread_id", threadId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((m): ChatMessageView => {
    const base = {
      id: m.id,
      thread_id: m.thread_id,
      sender: m.sender as MessageSender,
      sender_person_id: m.sender_person_id,
      type: m.type as MessageType,
      body: m.body,
      metadata: m.metadata,
      created_at: m.created_at,
      deleted_at: m.deleted_at,
    };
    if (m.sender === "system") {
      return { ...base, isMine: false, authorName: "System", authorInitials: null };
    }
    if (m.sender === "sella") {
      return { ...base, isMine: false, authorName: "Sella", authorInitials: null };
    }
    const author = one(m.author);
    return {
      ...base,
      isMine: m.sender_person_id === viewerId,
      authorName: author ? `${author.first_name} ${author.last_name}`.trim() : "Unknown",
      authorInitials: personInitials(author?.first_name, author?.last_name),
    };
  });
}

/**
 * Mark a thread read. No read-receipt table is in scope for the demo, so this
 * is a server no-op; client-tracked unread (localStorage last-seen) lands in
 * Phase 6.
 */
export async function markRead(_threadId: string): Promise<void> {
  // intentional no-op (Phase 6)
}

/**
 * The deal chat born with a deal (3b): resolve one card's deal thread.
 * RLS: visible only through the card's workspace (`thread_all`), so a
 * non-member company gets a no-row error here, never the thread.
 */
export async function getDealThread(
  dealCardId: string,
): Promise<{ threadId: string; relationshipId: string }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("chat_thread")
    .select("id, relationship_id")
    .eq("type", "deal")
    .eq("deal_card_id", dealCardId)
    .is("deleted_at", null)
    .single();
  if (error) throw error;
  return { threadId: data.id, relationshipId: data.relationship_id };
}

/* -------------------------------------------------------------------------- */
/* Writes (Phase 4)                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Post a human message into a thread (P2P or C2C). Empty bodies are ignored.
 * RLS (`msg_all` WITH CHECK `can_access_thread`) enforces the viewer may write
 * here. Returns the refreshed stream so the caller re-renders.
 */
export async function postMessage(threadId: string, body: string): Promise<ChatMessageView[]> {
  const text = body.trim();
  if (!text) return getMessages(threadId);
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("messaging: no authenticated user");
  const { error } = await supabase.from("chat_message").insert({
    thread_id: threadId,
    sender: "person",
    sender_person_id: user.id,
    type: "message",
    body: text,
  });
  if (error) throw error;
  return getMessages(threadId);
}

/**
 * Run the accept rollout against Supabase: mint a `relationship` (+ the C2C/P2P
 * threads and their seed lines per `planRollout`). Idempotent on
 * `inbox_item_id`, so a double-accept is a no-op. Does NOT touch the inbox item
 * status - connect owns that table (connect.acceptItem flips it).
 */
export async function acceptInbox(
  input: AcceptInput,
): Promise<{ relationshipId: string; threadIds: string[] }> {
  const supabase = createClient();

  // idempotent: a relationship already minted from this inbox item?
  const { data: existing, error: exErr } = await supabase
    .from("relationship")
    .select("id")
    .eq("inbox_item_id", input.inboxItemId)
    .maybeSingle();
  if (exErr) throw exErr;
  if (existing) {
    const { data: thr } = await supabase
      .from("chat_thread")
      .select("id")
      .eq("relationship_id", existing.id);
    return { relationshipId: existing.id, threadIds: (thr ?? []).map((t) => t.id) };
  }

  // relationship - canonical company order (CHECK company_a_id < company_b_id)
  const [companyA, companyB] =
    input.ownCompany.id < input.senderCompany.id
      ? [input.ownCompany.id, input.senderCompany.id]
      : [input.senderCompany.id, input.ownCompany.id];
  const { data: rel, error: relErr } = await supabase
    .from("relationship")
    .insert({
      company_a_id: companyA,
      company_b_id: companyB,
      initiated_by_company_id: input.senderCompany.id, // the requester initiated
      inbox_item_id: input.inboxItemId,
      status: "active",
      created_by: input.viewerPerson.id,
      updated_by: input.viewerPerson.id,
    })
    .select("id")
    .single();
  if (relErr) throw relErr;

  // threads + seed lines from the (pure) rollout plan
  const plan = planRollout(input);
  const base = Date.now();
  const threadIds: string[] = [];
  for (let ti = 0; ti < plan.threads.length; ti++) {
    const spec = plan.threads[ti];
    const { data: thread, error: tErr } = await supabase
      .from("chat_thread")
      .insert({
        relationship_id: rel.id,
        type: spec.type,
        person_a_id: spec.personAId,
        person_b_id: spec.personBId,
      })
      .select("id")
      .single();
    if (tErr) throw tErr;
    threadIds.push(thread.id);
    if (spec.seed.length) {
      // nudge each line a few ms apart so the stream order is deterministic
      const rows = spec.seed.map((s, mi) => ({
        thread_id: thread.id,
        sender: s.sender,
        sender_person_id: s.senderPersonId,
        type: s.type,
        body: s.body,
        created_at: new Date(base + ti * 1_000 + mi * 100).toISOString(),
      }));
      const { error: mErr } = await supabase.from("chat_message").insert(rows);
      if (mErr) throw mErr;
    }
  }

  return { relationshipId: rel.id, threadIds };
}
