/**
 * Pure "the other side" subtraction for the deal recipient (phase 3b, BSKT-01).
 *
 * This is the SINGLE owner of the rule "given two participant ids and the
 * viewer, return the participant that is NOT the viewer". The p2p recipient
 * resolver (resolveP2pRecipient in supabase/reads.ts) calls it twice: once with
 * the relationship's company pair, once with the chat thread's person pair. Both
 * the company and the person subtractions already lived inline in messaging
 * store.ts and deals reads.ts; factoring the math here keeps the DB read thin
 * and lets the rule be unit-tested without Supabase (mirrors lib/derive.ts).
 *
 * No Supabase, no React, no imports - pure math.
 */

/**
 * The participant id that is NOT the viewer. If `aId` is the viewer, the other
 * side is `bId`; otherwise the other side is `aId`. Either id may be null (when
 * a pair has no second member yet), so the result is `string | null`.
 */
export function otherOf(
  viewerId: string,
  aId: string | null,
  bId: string | null,
): string | null {
  return aId === viewerId ? bId : aId;
}
