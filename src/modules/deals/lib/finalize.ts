/**
 * The finalization GATE decision (Phase 7, D-27/D-28).
 *
 * Pure logic, extracted from `finalizeDeal` so the load-bearing close rule is
 * unit-testable without the DB. The Stages gate (allStagesDone /
 * canFinalizeFromStatus) is RETIRED with Stages (D-15); D-27 replaces it: the
 * SELLER uploading a real invoice PDF is the ONE trigger that closes the deal
 * (there is no buyer confirm-receipt gate).
 */
import type { DealCardStatus } from "../types";

/**
 * True when the deal may close on the invoice trigger (D-27):
 *   1. STATUS precondition - the deal must be in a live AGREED state, `confirmed`
 *      (both sides sealed the current version) or `amended` (a committed two-sided
 *      change). Every other status - `draft` (never agreed), `withdrawn`,
 *      `cancelled` (dead), and `done` (already terminal; the idempotency
 *      early-return in finalizeDeal handles it) - must NOT close, or a
 *      never-agreed deal could be driven straight to `done`.
 *   2. TRIGGER - a SELLER-uploaded invoice PDF exists (`hasSellerInvoice`). The
 *      caller resolves this from a `deal_artifact(category='invoice')` whose
 *      `uploaded_by_company_id` is the seller company (ASVS V4); a buyer-uploaded
 *      or absent invoice makes it false.
 *
 * Pure (no DB) so the rule is unit-testable; `finalizeDeal` calls it after the
 * idempotency early-return and throws when it is false.
 */
export function canFinalizeByInvoice(
  status: DealCardStatus,
  hasSellerInvoice: boolean,
): boolean {
  if (status !== "confirmed" && status !== "amended") return false;
  return hasSellerInvoice;
}
