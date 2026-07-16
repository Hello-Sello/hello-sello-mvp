/**
 * Unit tests for the PROMOTION savings math (Phase 7, D-25).
 *
 * The load-bearing PURE decision is `promotionSavings` - "how much is the buyer's
 * reward worth, over what they pay for it". D-25 requires it be computed on the
 * CANONICAL per-gram money (`lineValueOf`/`sumLineValue`), NEVER the prototype's
 * `size × units × price`, so the displayed unit (g vs kg) can never move the
 * money. The two arguments are the SAME reward lines valued two ways:
 *   - `baseLines`     = the reward at its normal/struck reference price (what it
 *                        is worth), and
 *   - `acceptedLines` = the reward at its actual promotion price (what the buyer
 *                        pays - 0 for a free reward).
 * Savings = worth - paid.
 *
 * The action-level wiring (offer/accept/decline + getPromotion) is integration-
 * heavy and exercised e2e in 07-08; this file locks only the pure money rule.
 */
import { describe, it, expect } from "vitest";
import { promotionSavings } from "./promotion";
import type { LineItemView } from "../types";

/** Minimal LineItemView builder - only the money-bearing fields matter here. */
function line(p: Partial<LineItemView>): LineItemView {
  return {
    id: "l",
    productId: null,
    productName: "Reward",
    thumbnailTint: null,
    cultivar: null,
    quantity: 0,
    unit: "g",
    unitPrice: 0,
    currency: "EUR",
    lineTotal: 0,
    pzn: null,
    batchId: null,
    batchNumber: null,
    thcPercent: null,
    cbdPercent: null,
    ...p,
  };
}

describe("promotionSavings (the D-25 canonical savings rule)", () => {
  it("is 0 when the reward is 2 more units at the SAME €/g (paid, not free)", () => {
    // worth = 2g x 5 = 10; paid = 2g x 5 = 10 -> no saving, the buyer just bought more.
    const base = [line({ quantity: 2, unit: "g", unitPrice: 5 })];
    const accepted = [line({ quantity: 2, unit: "g", unitPrice: 5 })];
    expect(promotionSavings(base, accepted)).toBe(0);
  });

  it("counts a FREE reward line (0 EUR paid) as its struck original value", () => {
    // worth = 100g x 5 = 500; paid = 100g x 0 = 0 -> the buyer saved the full 500.
    const base = [line({ quantity: 100, unit: "g", unitPrice: 5 })];
    const accepted = [line({ quantity: 100, unit: "g", unitPrice: 0 })];
    expect(promotionSavings(base, accepted)).toBe(500);
  });

  it("normalizes kg<->g (canonical per-gram money, never size x units x price)", () => {
    // A free 1kg reward and a free 1000g reward are the SAME money: 1kg x 5 =
    // 1000g x 5 = 5000. If the math used size x units x price it would read
    // 1 x 5 = 5 for the kg line and 1000 x 5 = 5000 for the g line - they would
    // DIFFER. Asserting they are EQUAL proves the per-gram normalization is used.
    const paidFreeKg = [line({ quantity: 1, unit: "kg", unitPrice: 0 })];
    const paidFreeG = [line({ quantity: 1000, unit: "g", unitPrice: 0 })];
    const worthKg = [line({ quantity: 1, unit: "kg", unitPrice: 5 })];
    const worthG = [line({ quantity: 1000, unit: "g", unitPrice: 5 })];

    expect(promotionSavings(worthKg, paidFreeKg)).toBe(5000);
    expect(promotionSavings(worthG, paidFreeG)).toBe(5000);
    // the kg reward and its g-equivalent produce the IDENTICAL saving.
    expect(promotionSavings(worthKg, paidFreeG)).toBe(
      promotionSavings(worthG, paidFreeKg),
    );
  });

  it("sums a mix of a free line and a paid line", () => {
    // free 100g @5 (worth 500, paid 0 = +500) + paid 10g @5 (worth 50, paid 50 = +0)
    const base = [
      line({ quantity: 100, unit: "g", unitPrice: 5 }),
      line({ quantity: 10, unit: "g", unitPrice: 5 }),
    ];
    const accepted = [
      line({ quantity: 100, unit: "g", unitPrice: 0 }),
      line({ quantity: 10, unit: "g", unitPrice: 5 }),
    ];
    expect(promotionSavings(base, accepted)).toBe(500);
  });

  it("never goes negative - a reward that costs MORE than its worth clamps to 0", () => {
    // defensive: savings is 'what the buyer saved', which cannot be below zero.
    const base = [line({ quantity: 10, unit: "g", unitPrice: 5 })];
    const accepted = [line({ quantity: 10, unit: "g", unitPrice: 9 })];
    expect(promotionSavings(base, accepted)).toBe(0);
  });

  it("is 0 for an empty reward (no lines either side)", () => {
    expect(promotionSavings([], [])).toBe(0);
  });
});
