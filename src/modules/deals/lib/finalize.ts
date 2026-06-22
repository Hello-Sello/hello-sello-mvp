/**
 * The finalization GATE decision (Phase 5, D-15).
 *
 * Pure logic, extracted from `finalizeDeal` so the load-bearing rule -
 * "finalization is available ONLY when every stage is marked done" - is
 * unit-testable without the DB. `finalizeDeal` reads the deal's stage codes and
 * its `deal_stage_completion` rows, then calls this to decide whether to flip
 * the card to 'done'.
 */
import type { DealCardStatus } from "../types";

/**
 * True when EVERY stage in `stageCodes` has a matching completion code in
 * `completedStageCodes`. A deal with no stages is never "all done" (an empty
 * stage set would otherwise be vacuously true, which must not unlock finalize).
 */
export function allStagesDone(
  stageCodes: readonly string[],
  completedStageCodes: readonly string[],
): boolean {
  if (stageCodes.length === 0) return false;
  const done = new Set(completedStageCodes);
  return stageCodes.every((code) => done.has(code));
}

/**
 * The STATUS precondition for finalization (HI-02). `done` is a terminal status
 * that must only be reachable from an AGREED deal, so finalize is allowed ONLY
 * from a live agreed state: `confirmed` (both sides sealed the current version)
 * or `amended` (a committed two-sided change). Every other status - `draft`,
 * `withdrawn`, `cancelled` (and `done`, which the idempotency guard handles
 * earlier) - must NOT be finalizable, or a never-confirmed deal could be driven
 * straight to `done`, bypassing the two-sided confirm gate.
 *
 * Pure (no DB) so the rule is unit-testable; `finalizeDeal` calls it after the
 * idempotency early-return and throws when it is false.
 */
export function canFinalizeFromStatus(status: DealCardStatus): boolean {
  return status === "confirmed" || status === "amended";
}
