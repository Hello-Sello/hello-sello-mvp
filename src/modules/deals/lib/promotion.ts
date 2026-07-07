/**
 * Promotion savings math (Phase 7, D-25) - RED stub.
 *
 * The real body lands in the GREEN commit. It stays a stub here so the failing
 * test compiles and fails for the RIGHT reason (behavior absent, not a type/import
 * error).
 */
import type { LineItemView } from "../types";

export function promotionSavings(
  _baseLines: LineItemView[],
  _acceptedLines: LineItemView[],
): number {
  throw new Error("promotionSavings: not implemented (RED)");
}
