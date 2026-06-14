"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/shared/db/server";

type PairInboxType = "connect" | "connect_message" | "pricelist_request";

/**
 * Create a company→company request in the receiver's Connect inbox — the one
 * write behind every Discover CTA. The INSERT is RLS-gated (sender_company_id
 * must be the caller's company); everything downstream (accept → relationship →
 * chat / rollout) is Connect's existing machinery.
 *
 * Dup-guard is PER ASK, not per pair: connect and connect_message are the same
 * "connect" ask (don't stack them), but a pricing request is a different ask and
 * may coexist with a pending connect — so a buyer can both connect AND request
 * pricing without one silently swallowing the other.
 */
async function createPairInboxItem(
  type: PairInboxType,
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

  const sameAsk: PairInboxType[] =
    type === "pricelist_request" ? ["pricelist_request"] : ["connect", "connect_message"];
  const { data: existing } = await supabase
    .from("pending_inbox_item")
    .select("id")
    .eq("sender_company_id", senderCompanyId)
    .eq("receiver_company_id", receiverCompanyId)
    .eq("status", "pending")
    .in("type", sameAsk)
    .is("deleted_at", null)
    .limit(1);
  if (existing && existing.length > 0) return { ok: true };

  const trimmed = note.trim();
  const { error } = await supabase.from("pending_inbox_item").insert({
    type,
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

/**
 * The Discover "front door" connect. A note → `connect_message`, no note →
 * plain `connect`.
 */
export async function sendConnectRequest(
  receiverCompanyId: string,
  note: string,
): Promise<{ ok: true } | { error: string }> {
  return createPairInboxItem(note.trim() ? "connect_message" : "connect", receiverCompanyId, note);
}

/**
 * Ask a company for their pricing — the L1 CTA. Lands as a `pricelist_request`
 * in their Connect inbox; accepting runs Connect's existing rollout.
 */
export async function requestPricing(
  receiverCompanyId: string,
  note: string,
): Promise<{ ok: true } | { error: string }> {
  return createPairInboxItem("pricelist_request", receiverCompanyId, note);
}
