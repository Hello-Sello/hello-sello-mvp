/**
 * Pure Deal Basket builders (phase 3b, BSKT-01).
 *
 * The shared DealForm hands back only the 6 CONTENT fields; the wrappers add the
 * 3 IDENTITY fields that make a Basket (D-03/D-04). These two builders are the
 * single place that merge happens, kept pure so the identity rule is unit-tested
 * without React or Supabase (mirrors lib/derive.ts and lib/recipient.ts).
 *
 * Create builds a Basket for a NEW deal addressed to the resolved recipient;
 * Edit builds one attached to an existing card with no recipient (Edit routes
 * through the strip, which already knows the relationship - Scope call A1).
 */
import type { DealBasket, DealBasketContent, DealRecipient } from "../types";

/** A new-deal Basket: no attached card, source p2p, addressed to `recipient`. */
export function buildCreateBasket(
  content: DealBasketContent,
  recipient: DealRecipient | null,
): DealBasket {
  return { ...content, attachedDealId: null, source: "p2p", recipient };
}

/** An edit Basket: attached to `attachedDealId`, source p2p, no recipient (A1). */
export function buildEditBasket(
  content: DealBasketContent,
  attachedDealId: string,
): DealBasket {
  return { ...content, attachedDealId, source: "p2p", recipient: null };
}
