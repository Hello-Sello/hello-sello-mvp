/**
 * Unit tests for the deal card's tier hint/chip logic (T07, ADR-0004 §4
 * decision B). `tierStateFor` is the pure core behind two affordances:
 *
 *   appliedMin / matchesLadder -> the applied-rung chip (which rung the line's
 *     CURRENT price sits on, by price match against the resolved ladder; a
 *     negotiated off-ladder price matches nothing -> no chip, no mislabel)
 *   suggested*                 -> the "Qualifies for €X/g — apply" hint (what
 *     the current grams would resolve to, when that differs from the line)
 *
 * Resolution grams = quantity × max(1, units), unit-normalized inside
 * resolveTierPrice (kg ×1000) — the same number `lineTotalOf` bills. The
 * function ALWAYS computes with units; the units === 1 HINT gate is the
 * consumer's job (amendment 1), so units > 1 still resolves here.
 *
 * Price comparison is float-tolerant (|a-b| < 1e-9) in both directions:
 * rung-matching the current price AND deciding suggested vs current.
 *
 * The RED state: `./tierHint` does not exist yet, so the import throws
 * module-not-found. Same extraction discipline as `draftEdit.ts`.
 */
import { describe, it, expect } from "vitest";
import { tierStateFor } from "./tierHint";
import type { PriceTier } from "@/modules/catalog/index.client";

/** The standard two-rung ladder used across these tests: base 10 €/g,
 *  500g+ -> 8, 1000g+ -> 7. */
const LADDER: PriceTier[] = [
  { minGrams: 500, pricePerGram: 8 },
  { minGrams: 1000, pricePerGram: 7 },
];

describe("tierStateFor — resolution math (grams = quantity × max(1, units))", () => {
  it("multiplies by units: 500g × 2 units resolves at 1000g and suggests the 1000-rung", () => {
    // The units===1 hint gate lives in the CONSUMER; the pure function still
    // computes the resolution so add-time seeding (EARS 1) can use it.
    const s = tierStateFor(10, LADDER, 8, 500, "g", 2);
    expect(s.suggestedPricePerGram).toBe(7);
    expect(s.suggestedMin).toBe(1000);
    // current 8 is the 500-rung's price -> chip state still on-ladder
    expect(s.appliedMin).toBe(500);
    expect(s.matchesLadder).toBe(true);
  });

  it("quantity change crossing a rung: 1000g at the 500-rung price suggests the 1000-rung", () => {
    const s = tierStateFor(10, LADDER, 8, 1000, "g", 1);
    expect(s.suggestedPricePerGram).toBe(7);
    expect(s.suggestedMin).toBe(1000);
    expect(s.appliedMin).toBe(500);
    expect(s.matchesLadder).toBe(true);
  });

  it("normalizes kg like billing does: 1kg × 1 unit resolves at 1000g", () => {
    const s = tierStateFor(10, [{ minGrams: 500, pricePerGram: 8 }], 10, 1, "kg", 1);
    // current = base 10, but 1000g reaches the 500-rung -> suggest 8
    expect(s.suggestedPricePerGram).toBe(8);
    expect(s.suggestedMin).toBe(500);
    expect(s.appliedMin).toBeNull(); // base-priced -> no rung
    expect(s.matchesLadder).toBe(true); // equals base
  });
});

describe("tierStateFor — no suggestion when already resolved", () => {
  it("current price already the resolved rung price -> suggested null, chip on that rung", () => {
    const s = tierStateFor(10, LADDER, 7, 1000, "g", 1);
    expect(s.suggestedPricePerGram).toBeNull();
    expect(s.suggestedMin).toBeNull();
    expect(s.appliedMin).toBe(1000);
    expect(s.matchesLadder).toBe(true);
  });

  it("base applied below every rung -> appliedMin null, matchesLadder true, no suggestion", () => {
    const s = tierStateFor(10, LADDER, 10, 300, "g", 1);
    expect(s.appliedMin).toBeNull();
    expect(s.matchesLadder).toBe(true);
    expect(s.suggestedPricePerGram).toBeNull();
    expect(s.suggestedMin).toBeNull();
  });
});

describe("tierStateFor — off-ladder negotiated price (amendment 2 third state)", () => {
  it("price matching neither base nor any rung -> matchesLadder false, no chip rung, hint still proposes today's terms", () => {
    // Over-trigger is declared (amendment 4): the hint proposes the resolved
    // price whenever it differs from the line, negotiated or stale alike.
    const s = tierStateFor(10, LADDER, 7.2, 1000, "g", 1);
    expect(s.matchesLadder).toBe(false);
    expect(s.appliedMin).toBeNull();
    expect(s.suggestedPricePerGram).toBe(7);
    expect(s.suggestedMin).toBe(1000);
  });
});

describe("tierStateFor — null base (price-less offer)", () => {
  it("null base -> everything null/false, never a rung price without a base", () => {
    const s = tierStateFor(null, LADDER, 8, 1000, "g", 1);
    expect(s.appliedMin).toBeNull();
    expect(s.matchesLadder).toBe(false);
    expect(s.suggestedPricePerGram).toBeNull();
    expect(s.suggestedMin).toBeNull();
  });
});

describe("tierStateFor — empty tiers (no ladder)", () => {
  it("current equals base -> base applied, matchesLadder true, nothing to suggest", () => {
    const s = tierStateFor(10, [], 10, 1000, "g", 1);
    expect(s.appliedMin).toBeNull();
    expect(s.matchesLadder).toBe(true);
    expect(s.suggestedPricePerGram).toBeNull();
    expect(s.suggestedMin).toBeNull();
  });

  it("current differs from base -> matchesLadder false, still no suggestion (no ladder to suggest from)", () => {
    const s = tierStateFor(10, [], 9, 1000, "g", 1);
    expect(s.appliedMin).toBeNull();
    expect(s.matchesLadder).toBe(false);
    expect(s.suggestedPricePerGram).toBeNull();
    expect(s.suggestedMin).toBeNull();
  });
});

describe("tierStateFor — float tolerance (|a-b| < 1e-9)", () => {
  // NOTE: the plan pins strict `Math.abs(a-b) < 1e-9`. A literal 8.000000001
  // lands at ~1.0000001e-9 in float64 — OUTSIDE that tolerance — so the
  // within-tolerance case uses genuine float arithmetic noise instead.
  it("a current price within 1e-9 of a rung matches it and suppresses the hint", () => {
    const noisy = 7.1 + 0.2; // 7.299999999999999… ≈ 7.3, delta ~9e-16
    const s = tierStateFor(10, [{ minGrams: 500, pricePerGram: 7.3 }], noisy, 500, "g", 1);
    expect(s.appliedMin).toBe(500);
    expect(s.matchesLadder).toBe(true);
    // resolved 7.3 ≈ noisy current -> not a suggestion
    expect(s.suggestedPricePerGram).toBeNull();
    expect(s.suggestedMin).toBeNull();
  });

  it("a price a full cent off a rung is NOT within tolerance -> off-ladder", () => {
    const s = tierStateFor(10, [{ minGrams: 500, pricePerGram: 8 }], 8.01, 500, "g", 1);
    expect(s.matchesLadder).toBe(false);
    expect(s.appliedMin).toBeNull();
  });
});
