/**
 * Connect inbox - viewer identity + accept/decline writes.
 *
 * Resolves the signed-in viewer's identity and runs the accept/decline
 * writes against `pending_inbox_item`. No longer reads the inbox queue
 * itself — that queue-listing surface (the Connect inbox) retired in 0027;
 * Discover's requests list is now the only remaining caller.
 */
import { createClient } from "@/shared/db/client";
import { acceptInbox, type AcceptRequestType } from "@/modules/messaging";

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

/**
 * Accept an inbound request. Creates the relationship + chat FIRST (messaging
 * owns those), THEN flips the inbox item to `accepted` (connect owns the item) -
 * so a failure leaves the request still pending and retryable.
 */
export async function acceptItem(itemId: string): Promise<void> {
  const supabase = createClient();
  const viewer = await getViewerIdentity(supabase);

  const { data: item, error } = await supabase
    .from("pending_inbox_item")
    .select(
      `id, type, note, sender_company_id, sender_person_id, deal_card_id,
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

  // 1) create/adopt the relationship + threads + seed lines via
  //    accept_connection_request, unconditionally.
  const { relationshipId } = await acceptInbox({
    inboxItemId: item.id,
    requestType: item.type as AcceptRequestType,
    dealCardId: item.deal_card_id,
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

  return;
}

/** Decline an inbound request -> rejected (moves to History). */
export async function declineItem(itemId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("pending_inbox_item")
    .update({ status: "rejected" })
    .eq("id", itemId);
  if (error) throw error;
  return;
}
