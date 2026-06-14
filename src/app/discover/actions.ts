"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/shared/db/server";

/**
 * Send a connect request from the viewer's company to another company — the
 * Discover "front door". A note → `connect_message`, no note → plain `connect`.
 * The INSERT is gated by RLS (sender_company_id must be the caller's company);
 * everything downstream (accept → relationship → chat) is Connect's existing
 * machinery, so this is the one new write that closes the loop.
 */
export async function sendConnectRequest(
  receiverCompanyId: string,
  note: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return { error: "You're not signed in." };

  const { data: person } = await supabase
    .from("person")
    .select("company_id")
    .eq("id", uid)
    .single();
  const senderCompanyId = person?.company_id;
  if (!senderCompanyId) return { error: "Finish setting up your company first." };
  if (senderCompanyId === receiverCompanyId) return { error: "That's your own company." };

  // Don't stack duplicates — if a request is already pending, treat it as sent.
  const { data: existing } = await supabase
    .from("pending_inbox_item")
    .select("id")
    .eq("sender_company_id", senderCompanyId)
    .eq("receiver_company_id", receiverCompanyId)
    .eq("status", "pending")
    .is("deleted_at", null)
    .limit(1);
  if (existing && existing.length > 0) return { ok: true };

  const trimmed = note.trim();
  const { error } = await supabase.from("pending_inbox_item").insert({
    type: trimmed ? "connect_message" : "connect",
    sender_person_id: uid,
    sender_company_id: senderCompanyId,
    receiver_company_id: receiverCompanyId,
    note: trimmed || null,
    status: "pending",
  });
  if (error) return { error: error.message };

  revalidatePath("/discover");
  revalidatePath(`/discover/${receiverCompanyId}`);
  return { ok: true };
}
