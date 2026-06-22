/**
 * Connect inbox - REAL Supabase read (2d, Phase 2).
 *
 * Replaces the READ half of `mock/inbox.mock.ts`. Returns the exact
 * `InboxItemView` / `TeamMember` / `ViewerContext` shapes the components
 * already consume, so the swap is just an import change in `InboxView`.
 *
 * RLS (`inbox_select`) scopes `pending_inbox_item` to the viewer's company
 * (receiver or sender), so no company filter is needed here - the DB does it.
 *
 * Inbox WRITES (claim / assign / accept / decline) stay mock until Phase 4.
 */
import { createClient } from "@/shared/db/client";
import { acceptInbox, type AcceptRequestType } from "@/modules/messaging";
import type {
  InboxItemView,
  InboxRequestType,
  InboxStatus,
  TeamMember,
  ViewerContext,
} from "@/modules/connect/types";

function personInitials(
  first: string | null | undefined,
  last: string | null | undefined,
): string {
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

/** The current viewer, from the logged-in Supabase session (person.id = auth.uid()). */
export async function getViewerContext(): Promise<ViewerContext> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("getViewerContext: no authenticated user");
  // Demo (one user per company): the signed-in person manages their own inbox.
  return { personId: user.id, isAdmin: true };
}

/** Owners a ticket can be assigned to = the viewer's company people (RLS-scoped). */
export async function getAssignableMembers(): Promise<TeamMember[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("person")
    .select("id, first_name, last_name")
    .is("deleted_at", null);
  if (error) throw error;
  return (data ?? []).map((p) => ({
    personId: p.id,
    displayName: `${p.first_name} ${p.last_name}`.trim(),
    initials: personInitials(p.first_name, p.last_name),
    isAdmin: p.id === user?.id,
  }));
}

/** The inbox queue for the viewing company, newest first. */
export async function getInbox(): Promise<InboxItemView[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("pending_inbox_item")
    .select(
      `id, type, status, note, sender_company_id, sender_person_id, receiver_company_id,
       assigned_to, assigned_by, assigned_at, deal_card_id, metadata, created_at, updated_at, deleted_at,
       sender:company!pending_inbox_item_sender_company_id_fkey ( name ),
       assignee:person!pending_inbox_item_assigned_to_fkey ( id, first_name, last_name )`,
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row): InboxItemView => {
    const sender = one(row.sender);
    const assignee = one(row.assignee);
    return {
      id: row.id,
      type: row.type as InboxRequestType,
      status: row.status as InboxStatus,
      note: row.note,
      sender_company_id: row.sender_company_id,
      sender_person_id: row.sender_person_id,
      receiver_company_id: row.receiver_company_id,
      assigned_to: row.assigned_to,
      assigned_by: row.assigned_by,
      assigned_at: row.assigned_at,
      deal_card_id: row.deal_card_id,
      metadata: row.metadata,
      created_at: row.created_at,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at,
      sender: {
        companyId: row.sender_company_id,
        companyName: sender?.name ?? "Unknown company",
        initials: companyInitials(sender?.name ?? "?"),
      },
      assignee: assignee
        ? {
            personId: assignee.id,
            displayName: `${assignee.first_name} ${assignee.last_name}`.trim(),
            initials: personInitials(assignee.first_name, assignee.last_name),
            isAdmin: false,
          }
        : null,
      mutualCount: 0, // derived later; not needed for the demo
      dealCard: null, // deal_card preview lands in 3a
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Writes (Phase 4)                                                           */
/* -------------------------------------------------------------------------- */

/** The viewer's person + company identity, for building the accept rollout. */
async function getViewerIdentity(supabase: ReturnType<typeof createClient>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("inbox: no authenticated user");
  const { data, error } = await supabase
    .from("person")
    .select("id, first_name, last_name, company:company!person_company_id_fkey ( id, name )")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  const co = one(data.company);
  const companyName = co?.name ?? "Unknown company";
  return {
    person: {
      id: data.id,
      name: `${data.first_name} ${data.last_name}`.trim(),
      initials: personInitials(data.first_name, data.last_name),
    },
    company: { id: co?.id ?? "", name: companyName, initials: companyInitials(companyName) },
  };
}

/** Claim an unassigned ticket for the viewer (self-assign; no assigned_by). */
export async function claimItem(itemId: string, viewerPersonId: string): Promise<InboxItemView[]> {
  const supabase = createClient();
  const { error } = await supabase
    .from("pending_inbox_item")
    .update({ assigned_to: viewerPersonId, assigned_by: null, assigned_at: new Date().toISOString() })
    .eq("id", itemId);
  if (error) throw error;
  return getInbox();
}

/** (Re)assign a ticket to a teammate. */
export async function assignItem(
  itemId: string,
  toPersonId: string,
  byPersonId: string,
): Promise<InboxItemView[]> {
  const supabase = createClient();
  const { error } = await supabase
    .from("pending_inbox_item")
    .update({ assigned_to: toPersonId, assigned_by: byPersonId, assigned_at: new Date().toISOString() })
    .eq("id", itemId);
  if (error) throw error;
  return getInbox();
}

/**
 * Accept an inbound request. Creates the relationship + chat FIRST (messaging
 * owns those), THEN flips the inbox item to `accepted` (connect owns the item) -
 * so a failure leaves the request still pending and retryable.
 */
export async function acceptItem(itemId: string): Promise<InboxItemView[]> {
  const supabase = createClient();
  const viewer = await getViewerIdentity(supabase);

  const { data: item, error } = await supabase
    .from("pending_inbox_item")
    .select(
      `id, type, note, sender_company_id, sender_person_id,
       sender:company!pending_inbox_item_sender_company_id_fkey ( name ),
       sender_person:person!pending_inbox_item_sender_person_id_fkey ( first_name, last_name )`,
    )
    .eq("id", itemId)
    .single();
  if (error) throw error;

  const senderCo = one(item.sender);
  const senderPerson = one(item.sender_person);
  const senderCompanyName = senderCo?.name ?? "Unknown company";
  const senderPersonName = senderPerson
    ? `${senderPerson.first_name} ${senderPerson.last_name}`.trim()
    : "Unknown";

  // 1) create relationship + threads + seed lines
  const { relationshipId } = await acceptInbox({
    inboxItemId: item.id,
    requestType: item.type as AcceptRequestType,
    note: item.note,
    ownCompany: viewer.company,
    senderCompany: {
      id: item.sender_company_id,
      name: senderCompanyName,
      initials: companyInitials(senderCompanyName),
    },
    viewerPerson: viewer.person,
    senderPerson: {
      id: item.sender_person_id,
      name: senderPersonName,
      initials: personInitials(senderPerson?.first_name, senderPerson?.last_name),
    },
  });

  // 1b) 4d: Sella rewrites the seeded static intro into a warm, context-aware opener
  // (person-waiting -> inline, per the placement rule). The Bedrock call lives in the
  // sella-intro edge fn so the key stays in Supabase (Path A). FAIL-SOFT: if Sella is
  // down the static seeded intro simply stays - the accept is unaffected.
  try {
    await supabase.functions.invoke("sella-intro", {
      body: {
        relationship_id: relationshipId,
        request_type: item.type,
        note: item.note,
        sender_company: senderCompanyName,
        sender_person: senderPersonName,
        recipient_company: viewer.company.name,
        recipient_person: viewer.person.name,
      },
    });
  } catch {
    // Sella down -> the static intro stays; the accept is unaffected.
  }

  // 2) flip the inbox item to accepted
  const { error: upErr } = await supabase
    .from("pending_inbox_item")
    .update({ status: "accepted" })
    .eq("id", itemId);
  if (upErr) throw upErr;

  return getInbox();
}

/** Decline an inbound request -> rejected (moves to History). */
export async function declineItem(itemId: string): Promise<InboxItemView[]> {
  const supabase = createClient();
  const { error } = await supabase
    .from("pending_inbox_item")
    .update({ status: "rejected" })
    .eq("id", itemId);
  if (error) throw error;
  return getInbox();
}
