/**
 * shouldDispatch — the single, pure rule for the SET-03 lifecycle-email path:
 * "send the transactional email ONLY after the state-change RPC returned ok,
 * NEVER on error" (Pitfall 4 — no email for a no-op / errored action).
 *
 * Centralised once so all 7 event sites (verification.approved/rejected,
 * join.requested/approved/rejected, welcome, membership.removed) share one gate
 * instead of each re-deriving the decision inline. The action still returns its
 * own `{ error }` to the caller; this only decides whether the fire-and-forget
 * `after()` dispatch runs.
 *
 * @param rpcResult the `{ error }` shape every Supabase RPC / query returns.
 * @returns true iff the RPC carried no error (`error` null or undefined).
 */
export function shouldDispatch(rpcResult: { error: unknown }): boolean {
  return rpcResult.error == null
}
