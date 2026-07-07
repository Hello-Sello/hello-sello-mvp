/**
 * Promotion savings math (Phase 7, D-25) - pure, unit-tested, no Supabase.
 *
 * A seller promotion (D-21) is REAL product-table reward lines. The buyer's
 * "saving" is what those rewards are WORTH minus what the buyer actually PAYS for
 * them. Both are the SAME reward lines valued two ways:
 *   - `baseLines`     = the reward at its normal/struck REFERENCE price (worth),
 *   - `acceptedLines` = the reward at its actual promotion price (paid; 0 = free).
 *
 * D-25 (load-bearing): the money is the CANONICAL per-gram value via
 * `sumLineValue` (which normalizes kg->g through `lineValueOf`), NEVER the
 * prototype's `size x units x price`. Reusing `sumLineValue` here means the
 * displayed unit can never move the saving, exactly like the card total, and the
 * rule lives in ONE place.
 */
import { sumLineValue } from "./derive";
import type { LineItemView } from "../types";

/**
 * The buyer's saving from a promotion, in currency units (D-25).
 *
 * `worth - paid`, floored at 0 - a "saving" is what the buyer keeps, which can
 * never be negative (a malformed reward that costs more than it is worth reads as
 * no saving rather than a negative one). `sumLineValue` returns null when NO line
 * carries a price; that reads as 0 here (an unpriced side contributes nothing),
 * so the same null-vs-0 discipline as the card total is preserved.
 */
export function promotionSavings(
  baseLines: LineItemView[],
  acceptedLines: LineItemView[],
): number {
  const worth = sumLineValue(baseLines) ?? 0;
  const paid = sumLineValue(acceptedLines) ?? 0;
  return Math.max(0, worth - paid);
}
