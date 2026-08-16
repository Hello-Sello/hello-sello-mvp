/**
 * Pure tier-ladder state for one deal-card line (T07, ADR-0004 §4 decision B).
 *
 * `tierStateFor` is the logic behind two card affordances, extracted from
 * `CardFront.tsx` so the load-bearing math is unit-testable without React or
 * the DB - the same discipline as `draftEdit.ts`:
 *
 *   appliedMin / matchesLadder -> the applied-rung chip: which rung the line's
 *     CURRENT price sits on, by tolerant price match against the ladder. A
 *     negotiated off-ladder price matches nothing (no chip, no mislabel).
 *   suggested*                 -> the "Qualifies for €X/g — apply" hint: what
 *     the current grams resolve to, when that differs from the line's price.
 *     Over-trigger is intentional: the hint proposes TODAY'S terms whenever
 *     the resolved price differs, stale or negotiated alike (EARS 2 is a
 *     "when…shall", not "only-when").
 *
 * Resolution grams = quantity × max(1, units) - the same number `lineTotalOf`
 * bills; unit normalization (kg ×1000) lives inside `resolveTierPrice`. The
 * function ALWAYS computes with units so add-time seeding (EARS 1, where
 * units is 1) shares the math; the units === 1 HINT gate is the CONSUMER'S
 * job - `units` is frontend-only and never enters the payload, so a hint
 * resolved on quantity×units>1 would propose a bulk-rung price on a
 * single-pack payload line, mispricing the counterparty's view.
 */
import { resolveTierPrice, type PriceTier } from "@/modules/catalog/index.client";

/** The chip + hint state for one line. */
export interface TierState {
  /** The rung the CURRENT price sits on (by price match, deepest rung wins),
   *  or null when base-priced or off-ladder. */
  appliedMin: number | null;
  /** Whether the current price equals a rung price or the base at all - false
   *  for a negotiated off-ladder price (no chip rendered then). */
  matchesLadder: boolean;
  /** The resolved price for the current grams when it DIFFERS from the line's
   *  price; null = nothing to suggest (no ladder, or already resolved). */
  suggestedPricePerGram: number | null;
  /** The suggested rung's minGrams (null = the base price). */
  suggestedMin: number | null;
}

/** Tolerant float compare - prices within 1e-9 are the same price. */
const eq = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;

export function tierStateFor(
  basePricePerGram: number | null,
  tiers: PriceTier[],
  currentUnitPrice: number | null,
  quantity: number,
  unit: string,
  units: number,
): TierState {
  // A null base is null all the way down (resolveTierPrice's own invariant):
  // never a rung price - or a chip - without a base.
  if (basePricePerGram === null) {
    return {
      appliedMin: null,
      matchesLadder: false,
      suggestedPricePerGram: null,
      suggestedMin: null,
    };
  }

  const resolved = resolveTierPrice(
    basePricePerGram,
    tiers,
    quantity * Math.max(1, units),
    unit,
  );

  // Which rung the CURRENT price sits on, by tolerant price match (the deepest
  // matching rung wins); matching the base is on-ladder with no rung.
  let appliedMin: number | null = null;
  let matchesLadder = false;
  if (currentUnitPrice != null) {
    for (const t of [...tiers].sort((a, b) => a.minGrams - b.minGrams)) {
      if (eq(t.pricePerGram, currentUnitPrice)) appliedMin = t.minGrams;
    }
    matchesLadder = appliedMin != null || eq(basePricePerGram, currentUnitPrice);
  }

  // Nothing to suggest without a ladder, or when the resolved price already IS
  // the line's price (tolerant compare in this direction too).
  const suggest =
    tiers.length > 0 &&
    resolved.pricePerGram != null &&
    (currentUnitPrice == null || !eq(resolved.pricePerGram, currentUnitPrice));

  return {
    appliedMin,
    matchesLadder,
    suggestedPricePerGram: suggest ? resolved.pricePerGram : null,
    suggestedMin: suggest ? resolved.appliedMin : null,
  };
}
