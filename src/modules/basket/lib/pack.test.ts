import { describe, it, expect } from "vitest";
import { toGrams, resolveBasketLine } from "./pack";

describe("toGrams (Pack rule — grams computed only at Send)", () => {
  it("multiplies pack count by pack size", () => {
    expect(toGrams(3, 50)).toBe(150);
  });

  it("returns null when the pack size is unknown", () => {
    expect(toGrams(3, null)).toBeNull();
  });

  it("handles a single pack", () => {
    expect(toGrams(1, 1000)).toBe(1000);
  });
});

/**
 * The ONE line-resolution owner (PLAN-T06 / ADR-0004 §4, decision A): grams,
 * draft quantity, resolved per-gram price, winning rung, and line total — all
 * from a single call, so the drawer's display and toDraftLines' written price
 * can never drift. Pinned matrix (amendment 6): tiers [500→8, 1000→7], base 10.
 */
const TIERS = [
  { minGrams: 500, pricePerGram: 8 },
  { minGrams: 1000, pricePerGram: 7 },
];

function line(
  over: Partial<{
    packCount: number;
    packSizeGrams: number | null;
    pricePerGram: number | null;
    tiers: { minGrams: number; pricePerGram: number }[];
    unit: string;
  }> = {},
) {
  return {
    packCount: 1,
    packSizeGrams: null,
    pricePerGram: 10,
    tiers: TIERS,
    unit: "g",
    ...over,
  };
}

describe("resolveBasketLine (the one line-resolution owner)", () => {
  it("(a) 2×250g = 500g reaches the 500 rung", () => {
    expect(resolveBasketLine(line({ packCount: 2, packSizeGrams: 250 }))).toEqual({
      grams: 500,
      quantity: 500,
      pricePerGram: 8,
      appliedMin: 500,
      lineTotal: 4000,
    });
  });

  it("(b) 2×350g = 700g still resolves at the 500 rung", () => {
    expect(resolveBasketLine(line({ packCount: 2, packSizeGrams: 350 }))).toEqual({
      grams: 700,
      quantity: 700,
      pricePerGram: 8,
      appliedMin: 500,
      lineTotal: 5600,
    });
  });

  it("(c+g) 2×500g = 1000g reaches the next rung; lineTotal = 1000 × 7", () => {
    expect(resolveBasketLine(line({ packCount: 2, packSizeGrams: 500 }))).toEqual({
      grams: 1000,
      quantity: 1000,
      pricePerGram: 7,
      appliedMin: 1000,
      lineTotal: 7000,
    });
  });

  it("(d) 1×100g stays below the lowest rung — base price, null appliedMin", () => {
    expect(resolveBasketLine(line({ packCount: 1, packSizeGrams: 100 }))).toEqual({
      grams: 100,
      quantity: 100,
      pricePerGram: 10,
      appliedMin: null,
      lineTotal: 1000,
    });
  });

  it("(e) null base → every price field null, quantity intact", () => {
    expect(
      resolveBasketLine(line({ packCount: 2, packSizeGrams: 500, pricePerGram: null })),
    ).toEqual({
      grams: 1000,
      quantity: 1000,
      pricePerGram: null,
      appliedMin: null,
      lineTotal: null,
    });
  });

  it("(f) null pack size → quantity falls back to the pack count, resolved on it", () => {
    expect(resolveBasketLine(line({ packCount: 2, packSizeGrams: null }))).toEqual({
      grams: null,
      quantity: 2,
      pricePerGram: 10, // 2 is below every rung — base applies
      appliedMin: null,
      lineTotal: 20,
    });
  });

  it("(f) the fallback resolves with the LINE's unit (kg normalizes ×1000)", () => {
    // grams unknown → the raw packCount rides with l.unit, exactly what
    // toDraftLines writes; resolveTierPrice's kg rule then reaches the 1000 rung,
    // and lineTotal follows lineValueOf semantics (kg ×1000 — pricing = billing).
    expect(resolveBasketLine(line({ packCount: 1, packSizeGrams: null, unit: "kg" }))).toEqual({
      grams: null,
      quantity: 1,
      pricePerGram: 7,
      appliedMin: 1000,
      lineTotal: 7000,
    });
  });
});
