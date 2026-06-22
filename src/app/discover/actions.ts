"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/shared/db/server";
import { requireVerified } from "@/shared/auth";

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

  // Clamp server-side — the 280 cap is only a client maxLength, and `note` is
  // unbounded TEXT, so a crafted call must not be able to store an essay.
  const trimmed = note.trim().slice(0, 280);
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
 *
 * Bouncer 2 (AUTH-01, D-01): requireVerified() guards this action before any
 * write. Server Actions are public endpoints reachable without page navigation
 * (RESEARCH Pitfall 1) — the layout guard (bouncer 1) is NOT enough. The
 * is_caller_verified() RLS floor (SEC-01) remains the last line of defense.
 */
export async function sendConnectRequest(
  receiverCompanyId: string,
  note: string,
): Promise<{ ok: true } | { error: string }> {
  const { blocked } = await requireVerified();
  if (blocked) return { error: "Your account is not verified to connect with other companies." };
  return createPairInboxItem(note.trim() ? "connect_message" : "connect", receiverCompanyId, note);
}

/**
 * Ask a company for their pricing — the L1 CTA. Lands as a `pricelist_request`
 * in their Connect inbox; accepting runs Connect's existing rollout.
 *
 * Bouncer 2 (AUTH-01, D-01): same requireVerified() guard as sendConnectRequest.
 * Direct action invocation bypasses the layout; this check closes that gap.
 */
export async function requestPricing(
  receiverCompanyId: string,
  note: string,
): Promise<{ ok: true } | { error: string }> {
  const { blocked } = await requireVerified();
  if (blocked) return { error: "Your account is not verified to request pricing." };
  return createPairInboxItem("pricelist_request", receiverCompanyId, note);
}
