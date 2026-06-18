/**
 * The repo's FIRST unit tests (phase 3a / plan 01) - pure-math proof for the
 * two card MONEY rules. RED-first: the helpers under test (`lineValueOf`,
 * `sumLineValue`) do not exist yet, so this file fails to import / fails its
 * assertions until Task 3 implements them. No Supabase, no React, no DB - the
 * helpers are pure, so the tests are pure too.
 *
 * CARD-01 (OBS-1): the card value is the SUM of the PRICED line totals, derived
 * live; zero priced lines -> null (never 0), mirroring actions.ts:sumValueNet.
 *
 * CARD-02 (OBS-2): pricelist prices are PER GRAM. Switching a line's unit g<->kg
 * with the per-gram price held must NOT change the money - the displayed unit is
 * presentation; per-gram is the canonical basis.
 */
import { describe, it, expect } from "vitest";
import { lineValueOf, sumLineValue, lineMarginOf, averageMarginOf } from "./derive";
import type { LineItemView } from "../types";

/** A minimal priced line - only the fields the money math reads matter. */
function line(partial: Partial<LineItemView>): LineItemView {
  return {
    id: "l1",
    productId: null,
    productName: "Test",
    thumbnailTint: null,
    cultivar: null,
    quantity: 0,
    unit: "g",
    unitPrice: 0,
    currency: "EUR",
    lineTotal: 0,
    pzn: null,
    ...partial,
  };
}

describe("lineValueOf (CARD-02 - per-gram is the canonical basis)", () => {
  it("treats a 'g' line as quantity x per-gram price", () => {
    expect(lineValueOf(1000, "g", 5)).toBe(5000);
  });

  it("normalizes a 'kg' line to grams before pricing (x1000)", () => {
    // 1 kg at 5 EUR/g === 1000 g at 5 EUR/g === 5000
    expect(lineValueOf(1, "kg", 5)).toBe(5000);
  });

  it("is value-stable across g<->kg when the per-gram price is held", () => {
    // The exact OBS-2 scenario: flip the unit label g->kg, keep the per-gram
    // price, and the line value must not move.
    expect(lineValueOf(1, "kg", 5)).toBe(lineValueOf(1000, "g", 5));
  });

  it("treats a 'unit' (count) line as plain quantity x price - no gram conversion", () => {
    expect(lineValueOf(3, "unit", 12)).toBe(36);
  });

  it("does not crash or NaN on an unknown unit code (falls through to qty x price)", () => {
    expect(lineValueOf(2, "box", 7)).toBe(14);
  });
});

describe("sumLineValue (CARD-01 - sum the priced lines, never a stale 0)", () => {
  it("sums the priced line values, ignoring any stored value_net", () => {
    const lines = [
      line({ quantity: 1000, unit: "g", unitPrice: 5 }), // 5000
      line({ quantity: 2, unit: "unit", unitPrice: 100 }), // 200
    ];
    expect(sumLineValue(lines)).toBe(5200);
  });

  it("returns null (NOT 0) when NO line carries a price", () => {
    const lines = [
      line({ quantity: 1000, unit: "g", unitPrice: null as unknown as number }),
      line({ quantity: 5, unit: "unit", unitPrice: null as unknown as number }),
    ];
    expect(sumLineValue(lines)).toBeNull();
  });

  it("returns null for an empty line list", () => {
    expect(sumLineValue([])).toBeNull();
  });

  it("sums ONLY the priced lines when some lines have no price", () => {
    const lines = [
      line({ quantity: 1000, unit: "g", unitPrice: 5 }), // 5000, counted
      line({ quantity: 500, unit: "g", unitPrice: null as unknown as number }), // skipped
    ];
    expect(sumLineValue(lines)).toBe(5000);
  });

  it("is unit-stable: a card summed in kg equals the same card summed in g", () => {
    const inG = [line({ quantity: 1000, unit: "g", unitPrice: 5 })];
    const inKg = [line({ quantity: 1, unit: "kg", unitPrice: 5 })];
    expect(sumLineValue(inKg)).toBe(sumLineValue(inG));
  });
});

describe("lineMarginOf (MRGN-01 - D-03 locked formulas, computed live)", () => {
  it("seller margin = (unit_price - cost) / unit_price", () => {
    // unit_price 10, cost 6 -> (10-6)/10 = 0.4
    expect(lineMarginOf(10, 6, "seller")).toBeCloseTo(0.4);
  });

  it("buyer margin = (resale - unit_price) / resale - buyer divides by THEIR resale", () => {
    // unit_price 10, resale 16 -> (16-10)/16 = 0.375 (NOT (16-10)/10)
    expect(lineMarginOf(10, 16, "buyer")).toBeCloseTo(0.375);
  });

  it("returns null (NOT 0) when the owner has not entered an input yet", () => {
    expect(lineMarginOf(10, null, "seller")).toBeNull();
  });

  it("seller side returns null when unit_price is 0 (division-by-zero guard)", () => {
    expect(lineMarginOf(0, 5, "seller")).toBeNull();
  });

  it("buyer side returns null when resale is 0 (division-by-zero guard)", () => {
    expect(lineMarginOf(10, 0, "buyer")).toBeNull();
  });
});

describe("averageMarginOf (MRGN-01 - D-04 deal-level rollup, A1 simple mean)", () => {
  it("averages only the non-null margins", () => {
    // (0.4 + 0.2) / 2 = 0.3, the null is skipped
    expect(averageMarginOf([0.4, null, 0.2])).toBeCloseTo(0.3);
  });

  it("returns null when no margin is present", () => {
    expect(averageMarginOf([null, null])).toBeNull();
  });
});
