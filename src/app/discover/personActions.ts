"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/shared/db/server";
import { requireVerified } from "@/shared/auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Send a person→person connection request — the Discover social-graph "+".
 *
 * Lands as a `connect_person` pending_inbox_item aimed at the target PERSON
 * (receiver_person_id), never a company, so it stays private to them (PG-4/5).
 * Dup-guard is per (sender_person, target_person): a second pending request to
 * the same person is a silent no-op. The accept side is accept_person_connection
 * (PG-7), which mints the edge + a company-less DM thread — no company relationship.
 *
 * requireVerified() (Bouncer 2) guards the write; the connect_person CHECKs +
 * inbox RLS are the DB floor.
 */
export async function sendPersonConnectRequest(
  targetPersonId: string,
): Promise<{ ok: true } | { error: string }> {
  if (!UUID_RE.test(targetPersonId)) return { error: "That doesn't look like a valid person." };

  const { blocked } = await requireVerified();
  if (blocked) return { error: "Your account is not verified to connect." };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return { error: "You're not signed in." };
  if (uid === targetPersonId) return { error: "That's you." };

  const { data: person } = await supabase
    .from("person")
    .select("company_id")
    .eq("id", uid)
    .single();
  const senderCompanyId = person?.company_id;
  if (!senderCompanyId) return { error: "Finish setting up your company first." };

  // Dedup per ask: an existing pending person request to this target is a no-op.
  const { data: existing } = await supabase
    .from("pending_inbox_item")
    .select("id")
    .eq("sender_person_id", uid)
    .eq("receiver_person_id", targetPersonId)
    .eq("status", "pending")
    .eq("type", "connect_person")
    .is("deleted_at", null)
    .limit(1);
  if (existing && existing.length > 0) return { ok: true };

  const { error } = await supabase.from("pending_inbox_item").insert({
    type: "connect_person",
    sender_person_id: uid,
    sender_company_id: senderCompanyId,
    receiver_person_id: targetPersonId,
    receiver_company_id: null,
    status: "pending",
  });
  if (error) return { error: error.message };

  revalidatePath("/discover");
  return { ok: true };
}

/**
 * Accept a person→person request — thin wrapper over accept_person_connection
 * (PG-7), which creates the person_connection edge + a company-less p2p DM thread
 * and flips the item to accepted, atomically. The RPC re-asserts the caller is
 * the target (receiver_person_id = auth.uid()).
 */
export async function acceptPersonRequest(
  itemId: string,
): Promise<{ ok: true } | { error: string }> {
  if (!UUID_RE.test(itemId)) return { error: "That doesn't look like a valid request." };

  const { blocked } = await requireVerified();
  if (blocked) return { error: "Your account is not verified." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_person_connection", { p_item_id: itemId });
  if (error) return { error: error.message };

  revalidatePath("/discover");
  return { ok: true };
}

/**
 * Decline a person→person request — reuses the existing inbox decline (status →
 * 'rejected'); inbox_update RLS scopes it to the target person (PG-5), so a
 * non-target caller updates zero rows.
 */
export async function declinePersonRequest(
  itemId: string,
): Promise<{ ok: true } | { error: string }> {
  if (!UUID_RE.test(itemId)) return { error: "That doesn't look like a valid request." };

  const { blocked } = await requireVerified();
  if (blocked) return { error: "Your account is not verified." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("pending_inbox_item")
    .update({ status: "rejected" })
    .eq("id", itemId)
    .eq("type", "connect_person");
  if (error) return { error: error.message };

  revalidatePath("/discover");
  return { ok: true };
}
