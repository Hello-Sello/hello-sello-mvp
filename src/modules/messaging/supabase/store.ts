/**
 * Messaging - REAL Supabase reads + writes (Connect 2d).
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
 * WRITES are REAL too: `postMessage` inserts a real `chat_message` row (RLS
 * `msg_all`) and `acceptInbox` mints the relationship + threads + seed lines.
 * Realtime broadcasts each insert to both sides, so the chat persists end to
 * end. This is the Path A prerequisite for Sella detection - see
 * `_workshop/build-plans/4-sella-build.md`.
 */
import { createClient } from "@/shared/db/client";
import { previewOf } from "../lib/chat-display";
import { canonicalPair } from "../lib/connections-shape";
import { companylessP2pDisplay } from "../lib/companylessP2pDisplay";
import { planRollout } from "../lib/rollout";
import type {
  AcceptInput,
  ChatMessageView,
  ConversationListItem,
  GroupCreationResult,
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
  // `chat_thread.name` is a new group column (07-02) not in the generated types
  // yet, so the select-string is cast (the same discipline as the deal note/batch
  // columns) - DO NOT regenerate database.types.
  const [threadsRes, relsRes, cosRes, pplRes, msgsRes, membersRes] = await Promise.all([
    supabase
      .from("chat_thread")
      .select(
        "id, type, relationship_id, person_a_id, person_b_id, deal_card_id, created_at, name" as "id, type, relationship_id, person_a_id, person_b_id, deal_card_id, created_at",
      )
      .is("deleted_at", null),
    supabase.from("relationship").select("id, company_a_id, company_b_id"),
    supabase.from("company").select("id, name"),
    supabase.from("person").select("id, first_name, last_name, company_id"),
    supabase
      .from("chat_message")
      .select("thread_id, body, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    // group membership (07-02) - RLS (is_group_member) scopes this to the
    // groups the viewer is an active member of. The table is not in the
    // generated types yet, so it is read via the `as never` cast.
    supabase
      .from("chat_thread_member" as never)
      .select("thread_id, person_id, state"),
  ]);
  for (const r of [threadsRes, relsRes, cosRes, pplRes, msgsRes, membersRes]) {
    if (r.error) throw r.error;
  }

  const relById = new Map((relsRes.data ?? []).map((r) => [r.id, r] as const));
  const coNameById = new Map((cosRes.data ?? []).map((c) => [c.id, c.name] as const));
  const personById = new Map((pplRes.data ?? []).map((p) => [p.id, p] as const));

  // active group members grouped by thread (Pitfall 1: a group row's
  // participants come from membership, never the person_a/b slots).
  const memberRows = (membersRes.data ?? []) as unknown as {
    thread_id: string;
    person_id: string;
    state: string;
  }[];
  const activeMembersByThread = new Map<string, string[]>();
  for (const m of memberRows) {
    if (m.state !== "active") continue;
    const list = activeMembersByThread.get(m.thread_id);
    if (list) list.push(m.person_id);
    else activeMembersByThread.set(m.thread_id, [m.person_id]);
  }

  // deal rows show their deal NUMBER (3b) - resolve the hs numbers in one batch
  const dealCardIds = (threadsRes.data ?? [])
    .filter((t) => t.type === "deal" && t.deal_card_id)
    .map((t) => t.deal_card_id as string);
  const dealNoById = new Map<string, string | null>();
  if (dealCardIds.length) {
    const { data: cards, error: cardsErr } = await supabase
      .from("deal_card")
      .select("id, hs_deal_number")
      .in("id", dealCardIds);
    if (cardsErr) throw cardsErr;
    for (const c of cards ?? []) dealNoById.set(c.id, c.hs_deal_number);
  }
  // ordered asc, so the last write for a thread is its latest message
  const lastByThread = new Map<string, { body: string; created_at: string }>();
  for (const m of msgsRes.data ?? []) {
    lastByThread.set(m.thread_id, { body: m.body, created_at: m.created_at });
  }

  const items: ConversationListItem[] = (threadsRes.data ?? [])
    .filter((t) => t.type !== "deal")
    .map((t) => {
    // a group thread carries a null relationship_id (07-02) - it has no
    // relationship pair to resolve, so its counterparty comes from members.
    const rel = t.relationship_id ? relById.get(t.relationship_id) : undefined;
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
      // p2p/c2c/deal all hang off a cross-company relationship, so they are
      // external by definition; a group overrides this from its members below.
      isExternal: true,
    };

    // group (07-02) - participants + display come from chat_thread_member, NOT
    // the person_a/b slots (Pitfall 1). A deal-born group (deal_card_id set)
    // files under the Deals filter (D-07); a plain group under Groups.
    if (t.type === "group") {
      const groupName = (t as { name?: string | null }).name;
      const memberIds = activeMembersByThread.get(t.id) ?? [];
      const otherNames = memberIds
        .filter((id) => id !== viewer.personId)
        .map((id) => {
          const p = personById.get(id);
          return p ? `${p.first_name} ${p.last_name}`.trim() : null;
        })
        .filter((n): n is string => !!n);
      const dealNo = t.deal_card_id ? dealNoById.get(t.deal_card_id) ?? null : null;
      // D-06: the stored name is the subject; fall back to the deal code, then
      // to the members' first names, then a plain label.
      const displayName =
        (groupName && groupName.trim()) || dealNo || otherNames.join(", ") || "Group";
      // internal vs external: any active member from another company => external
      const isExternal = memberIds.some((id) => {
        const cid = personById.get(id)?.company_id ?? null;
        return !!cid && cid !== viewer.companyId;
      });
      return {
        ...base,
        threadType: "group" as ThreadType,
        name: displayName,
        subtitle: otherNames.length ? otherNames.join(", ") : "Group chat",
        initials: companyInitials(displayName),
        dealCardId: t.deal_card_id ?? undefined,
        isExternal,
        // deal-born groups bucket under a "Deal groups" heading in the Deals
        // filter; plain groups don't group by company (Groups filter is flat).
        companyId: t.deal_card_id ? "deal-groups" : "",
        companyName: t.deal_card_id ? "Deal groups" : otherCompanyName,
      };
    }

    // deal threads are intentionally hidden from the list (filtered above) -
    // the deal now lives only inside the p2p chat + the right-side deal-card panel.

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
    // A company-less p2p (Discover person↔person DM, relationship_id null) has no
    // relationship pair, so `otherCompanyName` fell back to "Unknown company".
    // Resolve the counterparty from the PERSON instead (PG-12).
    if (t.relationship_id == null) {
      const d = companylessP2pDisplay({
        personName,
        personCompanyId: per?.company_id ?? null,
        personCompanyName: (per?.company_id && coNameById.get(per.company_id)) || null,
        viewerCompanyId: viewer.companyId,
      });
      return {
        ...base,
        name: personName,
        otherPersonId,
        companyId: d.companyId,
        companyName: d.companyName,
        subtitle: d.subtitle,
        initials: personInitials(per?.first_name, per?.last_name),
        isExternal: d.isExternal,
      };
    }
    return {
      ...base,
      name: personName,
      otherPersonId,
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
  // a deal thread is always anchored to a relationship (only groups carry a
  // null relationship_id since 07-02); a null here is a data-integrity fault.
  if (data.relationship_id == null) {
    throw new Error(`messaging: deal thread ${data.id} has no relationship`);
  }
  return { threadId: data.id, relationshipId: data.relationship_id };
}

/* -------------------------------------------------------------------------- */
/* New-chat picker (04B) - resolve / create the thread on selection           */
/* -------------------------------------------------------------------------- */

/**
 * Resolve the C2C thread for a relationship (company-mode selection, D-05).
 * The C2C is minted on EVERY accept (`planRollout`), so it always exists - this
 * is resolve-only. RLS (`thread_all`) scopes the row to the viewer; a guard
 * throws if the (shouldn't-happen) missing case is hit.
 */
export async function resolveC2cThread(relationshipId: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("chat_thread")
    .select("id")
    .eq("type", "c2c")
    .eq("relationship_id", relationshipId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(`messaging: no c2c thread for relationship ${relationshipId}`);
  }
  return data.id;
}

/**
 * Open the P2P thread between the viewer and another person, creating it if
 * missing (person-mode selection, D-05). `planRollout` only mints a P2P for the
 * accepting/sender pair, so most connected people have NO P2P thread yet
 * (Pitfall 2) - hence resolve-or-create. The pair is stored in canonical order
 * (`person_a_id < person_b_id`, DB CHECK), and the `thread_all` WITH CHECK
 * (`auth.uid() IN (person_a_id, person_b_id)`) allows the INSERT because the
 * viewer is always one side. Returns the thread id either way.
 */
export async function openOrCreateP2pThread(
  relationshipId: string,
  otherPersonId: string,
): Promise<string> {
  const supabase = createClient();
  const viewer = await getViewer(supabase);
  const [a, b] = canonicalPair(viewer.personId, otherPersonId);

  const { data: existing, error: selErr } = await supabase
    .from("chat_thread")
    .select("id")
    .eq("relationship_id", relationshipId)
    .eq("type", "p2p")
    .eq("person_a_id", a)
    .eq("person_b_id", b)
    .is("deleted_at", null)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return existing.id;

  const { data: created, error: insErr } = await supabase
    .from("chat_thread")
    .insert({ relationship_id: relationshipId, type: "p2p", person_a_id: a, person_b_id: b })
    .select("id")
    .single();
  if (insErr) throw insErr;
  return created.id;
}

/* -------------------------------------------------------------------------- */
/* Group chat (07-02 backend) - create / approve / rename                     */
/* -------------------------------------------------------------------------- */

/**
 * Create a group thread (D-04 new-chat groups + deal-card groups) via the
 * atomic `create_group_thread` RPC. The RPC derives the creator from
 * `auth.uid()` (never a client company id) and adds every member - creator
 * included - as active immediately; there is no external-company gate
 * (2026-07-20 reversed D-05's pending_external/two-approver mechanism). The
 * RPC + `chat_thread_member` table are new (07-02), not in the generated
 * types yet, so the RPC name + params are cast (the documented `as never`
 * discipline).
 */
export async function createGroupThread(input: {
  name: string;
  memberPersonIds: string[];
  dealCardId?: string;
}): Promise<GroupCreationResult> {
  const supabase = createClient();

  const { data: newId, error } = await supabase.rpc("create_group_thread" as never, {
    // blank name => the RPC applies the D-06 default (first names / deal code)
    p_name: input.name.trim(),
    p_member_person_ids: input.memberPersonIds,
    p_deal_card_id: input.dealCardId ?? null,
  } as never);
  if (error) throw error;
  return { threadId: newId as unknown as string };
}

/**
 * Rename a group thread (D-06 - anyone in the thread may rename, anytime, from
 * the chat window). Updates `chat_thread.name`; RLS (`thread_all` group branch,
 * `is_group_member`) authorizes the write. `name` is a new column not in the
 * generated types yet, so the update payload is cast (`as never` discipline).
 */
export async function renameGroupThread(input: {
  threadId: string;
  name: string;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("chat_thread")
    .update({ name: input.name.trim() } as never)
    .eq("id", input.threadId);
  if (error) throw error;
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
 * Person-target deal delivery (Lane A): drop the "[Sender] has sent a deal"
 * message into a p2p thread. `type: 'deal_card'` + `metadata.deal_card_id`
 * make the bubble clickable (MessageBubble dispatches hs:open-deal-card);
 * the typed message never trips Sella detection (its trigger only enqueues
 * plain 'message' rows). Sender = the real person — the send is their action.
 *
 * Called from the SEND/COMPOSITION layer only (create-card host, basket send).
 * Never from deals/ (module cycle) and never from SQL (it would double-deliver
 * the Sella-detection door, which posts its own deal_detected message).
 */
export async function postDealMessage(threadId: string, dealCardId: string): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("messaging: no authenticated user");
  const { data: me } = await supabase
    .from("person")
    .select("first_name, last_name")
    .eq("id", user.id)
    .single();
  const name = me ? `${me.first_name} ${me.last_name}`.trim() : "Someone";
  const { error } = await supabase.from("chat_message").insert({
    thread_id: threadId,
    sender: "person",
    sender_person_id: user.id,
    type: "deal_card",
    body: `${name} has sent a deal`,
    metadata: { deal_card_id: dealCardId },
  });
  if (error) throw error;
}

/**
 * Run the accept rollout against Supabase: ENSURE a `relationship` (+ the
 * C2C/P2P threads and their seed lines per `planRollout`) exists, creating only
 * what is missing.
 *
 * Ensure, not insert, because the schema already declares these as unique and
 * an accept is not the only thing that creates them: one active relationship
 * per company pair (`uq_relationship_pair_active`), one C2C per relationship
 * (`uq_chat_thread_c2c`), one P2P per person pair (`uq_chat_thread_p2p`). Two
 * companies can already be connected when a request arrives - that is the
 * normal case for a pricing ask - so this function adopts what is there and
 * adds the rest. Seed lines are written only for threads it creates.
 *
 * Callers get the relationship id and every thread id the plan calls for,
 * whether this call made them or found them.
 *
 * Does NOT touch the inbox item status - connect owns that table
 * (connect.acceptItem flips it after this returns).
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

  // Deal-ticket pickup (Lane A): the deal AND its relationship exist since
  // birth — claiming means becoming a deal_member owner on the existing deal
  // (a SECURITY DEFINER RPC: deal_member RLS cannot express the bootstrap).
  // No relationship mint, no rollout threads, no Sella intro.
  if (input.requestType === "deal_card") {
    if (!input.dealCardId) {
      throw new Error("acceptInbox: a deal_card accept needs its dealCardId");
    }
    // the RPC is not in the generated types yet — localized cast, direct
    // supabase.rpc call so `this` stays bound (createDeal's documented pattern)
    const { data: relId, error: claimErr } = await supabase.rpc(
      "claim_deal_ticket" as never,
      { p_deal_card_id: input.dealCardId } as never,
    );
    if (claimErr) throw new Error((claimErr as { message: string }).message);
    return { relationshipId: relId as unknown as string, threadIds: [] };
  }

  // relationship - server-granted, never self-declared. `authenticated` has no
  // write grant on the table at all: the counterparty's consent lives in the
  // inbox item, so the item id is the ONLY thing this call may supply. The RPC
  // derives the pair, the canonical order (CHECK company_a_id < company_b_id)
  // and the initiator, verifies the request is pending and addressed to the
  // caller's company, and ADOPTS an existing active pair rather than minting a
  // second one (`uq_relationship_pair_active`). It does not flip the item's
  // status - connect.acceptItem still owns that.
  const { data: relId, error: relErr } = await supabase.rpc(
    "accept_connection_request",
    { p_inbox_item_id: input.inboxItemId },
  );
  if (relErr) throw relErr;
  const relationshipId = relId;

  // threads + seed lines from the (pure) rollout plan - ENSURED, not inserted.
  // `uq_chat_thread_c2c` (one per relationship) and `uq_chat_thread_p2p` (one
  // per person pair) tell the same story as the relationship above: on an
  // adopted relationship the c2c already exists, so re-inserting it raises
  // `23505`. Seed lines are written ONLY for a thread this call creates - that
  // is what stops a double-accept from double-posting, since the inbox item's
  // status flips only after this function returns.
  const plan = planRollout(input);
  const { data: present, error: presentErr } = await supabase
    .from("chat_thread")
    .select("id, type, person_a_id, person_b_id")
    .eq("relationship_id", relationshipId)
    .is("deleted_at", null);
  if (presentErr) throw presentErr;

  const base = Date.now();
  const threadIds: string[] = [];
  for (let ti = 0; ti < plan.threads.length; ti++) {
    const spec = plan.threads[ti];
    const already = (present ?? []).find(
      (t) =>
        t.type === spec.type &&
        (spec.type !== "p2p" ||
          (t.person_a_id === spec.personAId &&
            t.person_b_id === spec.personBId)),
    );
    if (already) {
      threadIds.push(already.id);
      continue;
    }
    const { data: thread, error: tErr } = await supabase
      .from("chat_thread")
      .insert({
        relationship_id: relationshipId,
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

  return { relationshipId, threadIds };
}
