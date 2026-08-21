"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/shared/db/server";
import { requireVerified } from "@/shared/auth";
import { getDiscoverableShop } from "./companies";
import {
  PRODUCT_ID_KEY,
  buildPricingRequestMetadata,
  buildPricingRequestNote,
} from "./pricingRequest";

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
 *
 * `productId` narrows the ask one step further, to per ask PER PRODUCT: asking
 * about product A must not swallow an ask about product B. It is optional
 * because the connect arm has no product — when it is undefined the emitted
 * query and the inserted row are exactly what they were before, and a legacy
 * shop-level row (whose `metadata` is the `'{}'` default) can never match a
 * per-product guard: `'{}'::jsonb ->> 'product_id'` is NULL, and `NULL = <uuid>`
 * is NULL, which a WHERE clause does not admit.
 */
async function createPairInboxItem(
  type: PairInboxType,
  receiverCompanyId: string,
  note: string,
  productId?: string,
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
  let pending = supabase
    .from("pending_inbox_item")
    .select("id")
    .eq("sender_company_id", senderCompanyId)
    .eq("receiver_company_id", receiverCompanyId)
    .eq("status", "pending")
    .in("type", sameAsk)
    .is("deleted_at", null);
  if (productId) pending = pending.filter(`metadata->>${PRODUCT_ID_KEY}`, "eq", productId);
  // FAIL CLOSED. Dropping this error would make a failed query indistinguishable
  // from "no duplicate found" (`data` is undefined either way), and the dup-guard
  // would wave a duplicate row through on any transient PostgREST fault.
  const { data: existing, error: pendingError } = await pending.limit(1);
  if (pendingError) return { error: pendingError.message };
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
    // OMITTED entirely when there is no product — never an explicit `null`.
    // `pending_inbox_item.metadata` is JSONB NOT NULL DEFAULT '{}', so a null
    // would 23502 on every connect request; an absent key falls through to the
    // default.
    ...(productId ? { metadata: buildPricingRequestMetadata(productId) } : {}),
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
 * Ask a seller for the price of ONE product — the L1 ask, per product. Lands as
 * a `pricelist_request` in their Connect inbox naming the product; accepting
 * runs Connect's existing rollout. One mechanism for both arms: connected or
 * not, the seller gets the same item (ADR-0005, G3).
 *
 * Authorization and the product NAME come through the same door that rendered
 * the card — `get_discoverable_shop`, SECURITY DEFINER, applying the seller's
 * own visibility rules. That resolution answers VISIBILITY only: a product id
 * the buyer cannot see is refused. It does NOT answer the PRICE rule — the UI
 * offers the ask only when the price is hidden (`canAsk` requires
 * `!pricePublic`), but this action will accept an ask on a price-PUBLIC product
 * the buyer can see. Closing that gap is a behaviour change, not a docstring's
 * to assert.
 *
 * The name the seller reads is resolved server-side, so no string this action
 * accepts reaches her — but that is a property of THIS action, not of the row.
 * `authenticated` holds INSERT on every `pending_inbox_item` column with no
 * validating trigger, so a direct PostgREST insert can still carry an arbitrary
 * `note`/`metadata`. Pre-existing, and not widened here.
 *
 * `getDiscoverableShop` swallows RPC errors (returns []), so a transient fault
 * is indistinguishable from a real denial — the refusal below is worded to be
 * honest under both. Separating them means changing that function's return
 * contract, which is T05's file, not this one's.
 *
 * Bouncer 2 (AUTH-01, D-01): same requireVerified() guard as sendConnectRequest.
 * Direct action invocation bypasses the layout; this check closes that gap.
 */
export async function requestProductPricing(
  receiverCompanyId: string,
  productId: string,
): Promise<{ ok: true } | { error: string }> {
  const { blocked } = await requireVerified();
  if (blocked) return { error: "Your account is not verified to request pricing." };

  const product = (await getDiscoverableShop(receiverCompanyId)).find((p) => p.id === productId);
  if (!product)
    return { error: "We couldn't confirm that product is available from this shop. Try again." };

  return createPairInboxItem(
    "pricelist_request",
    receiverCompanyId,
    buildPricingRequestNote(product.name),
    productId,
  );
}
