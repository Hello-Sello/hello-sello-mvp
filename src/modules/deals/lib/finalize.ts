/**
 * The finalization GATE decision (Phase 5, D-15).
 *
 * Pure logic, extracted from `finalizeDeal` so the load-bearing rule -
 * "finalization is available ONLY when every stage is marked done" - is
 * unit-testable without the DB. `finalizeDeal` reads the deal's stage codes and
 * its `deal_stage_completion` rows, then calls this to decide whether to flip
 * the card to 'done'.
 */

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
