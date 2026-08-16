/**
 * RED-first unit contract for the tier-ladder pure functions (0021, T02).
 * Covers `resolveTierPrice` (rung pick on the canonical per-gram basis, ADR-0004
 * §4) + `packSizes` (the ONE ordered numeric array bubbles and index-based picks
 * consume, ADR-0004 §5), plus the agreement pin against the billing math's
 * `lineValueOf`. vitest, no Supabase, no React.
 *
 * RED until pricing.ts exists (the import fails to resolve) AND the deals barrel
 * exports `lineValueOf` (T02's one-line amendment). Do NOT create the production
 * module to satisfy an unrelated gate — this test drives its shape.
 */
import { describe, it, expect } from "vitest";
import { resolveTierPrice, packSizes } from "./pricing";
import type { PriceTier, ResolvedPrice } from "./pricing";
import { lineValueOf } from "@/modules/deals";

const rung = (minGrams: number, pricePerGram: number): PriceTier => ({
  minGrams,
  pricePerGram,
});

describe("resolveTierPrice — highest rung reached wins (>= semantics)", () => {
  const ladder: PriceTier[] = [rung(500, 8), rung(1000, 7)];

  it("applies a rung when grams exactly equal its minGrams, and appliedMin is that rung's minGrams", () => {
    const resolved: ResolvedPrice = resolveTierPrice(10, ladder, 500, "g");
    expect(resolved).toEqual({ pricePerGram: 8, appliedMin: 500 });
  });

  it("returns base with appliedMin null below the lowest rung", () => {
    expect(resolveTierPrice(10, ladder, 100, "g")).toEqual({
      pricePerGram: 10,
      appliedMin: null,
    });
  });

  it("applies the highest rung above every rung", () => {
    expect(resolveTierPrice(10, ladder, 1500, "g")).toEqual({
      pricePerGram: 7,
      appliedMin: 1000,
    });
  });

  it("applies the lower rung between two rungs", () => {
    expect(resolveTierPrice(10, ladder, 700, "g")).toEqual({
      pricePerGram: 8,
      appliedMin: 500,
    });
  });

  it("returns base with appliedMin null for an empty tiers array", () => {
    expect(resolveTierPrice(10, [], 700, "g")).toEqual({
      pricePerGram: 10,
      appliedMin: null,
    });
  });

  it("returns base with appliedMin null for a null quantity", () => {
    expect(resolveTierPrice(10, ladder, null, "g")).toEqual({
      pricePerGram: 10,
      appliedMin: null,
    });
  });

  it("returns both null for a null base even when tiers exist (never a rung price without a base)", () => {
    expect(resolveTierPrice(null, ladder, 1500, "g")).toEqual({
      pricePerGram: null,
      appliedMin: null,
    });
  });

  it("normalizes kg to grams: 1 kg reaches a 500 g rung", () => {
    expect(resolveTierPrice(10, [rung(500, 8)], 1, "kg")).toEqual({
      pricePerGram: 8,
      appliedMin: 500,
    });
  });

  it("treats mL as grams as-is", () => {
    // 600 mL ≥ the 500 rung; 100 mL is below it.
    expect(resolveTierPrice(10, [rung(500, 8)], 600, "mL")).toEqual({
      pricePerGram: 8,
      appliedMin: 500,
    });
    expect(resolveTierPrice(10, [rung(500, 8)], 100, "mL")).toEqual({
      pricePerGram: 10,
      appliedMin: null,
    });
  });

  it("treats pack as grams as-is: quantity 3 'pack' stays 3 grams, below a 500 g rung", () => {
    expect(resolveTierPrice(10, [rung(500, 8)], 3, "pack")).toEqual({
      pricePerGram: 10,
      appliedMin: null,
    });
  });

  it("units multiplier is caller-side: 500 g × 2 units passed as quantity 1000 resolves the 1000 g rung", () => {
    expect(resolveTierPrice(10, ladder, 1000, "g")).toEqual({
      pricePerGram: 7,
      appliedMin: 1000,
    });
  });

  it("resolves an unsorted tiers input correctly without mutating it", () => {
    const unsorted: PriceTier[] = Object.freeze([
      Object.freeze(rung(1000, 7)),
      Object.freeze(rung(500, 8)),
    ]) as unknown as PriceTier[];

    expect(resolveTierPrice(10, unsorted, 700, "g")).toEqual({
      pricePerGram: 8,
      appliedMin: 500,
    });
    // Input order untouched — the sort must happen on a defensive copy.
    expect(unsorted.map((t) => t.minGrams)).toEqual([1000, 500]);
  });
});

describe("agreement with lineValueOf — pricing follows billing per unit", () => {
  // With unitPrice 1, lineValueOf's return IS the billed grams. A rung placed at
  // exactly that grams value must be applied at-threshold by the resolver, so the
  // resolver's normalization can never drift from the billing math in derive.ts.
  const cases: { unit: string; quantity: number }[] = [
    { unit: "g", quantity: 750 },
    { unit: "kg", quantity: 2 }, // 2 kg → 2000 g, distinguishes ×1000 from as-is
    { unit: "mL", quantity: 750 },
    { unit: "pack", quantity: 3 },
  ];

  it.each(cases)(
    "$unit: a rung at lineValueOf($quantity, $unit, 1) grams is applied at-threshold",
    ({ unit, quantity }) => {
      const billedGrams = lineValueOf(quantity, unit, 1);
      expect(
        resolveTierPrice(10, [rung(billedGrams, 8)], quantity, unit),
      ).toEqual({ pricePerGram: 8, appliedMin: billedGrams });
    },
  );
});

describe("packSizes — one ordered numeric array, labels derived", () => {
  const ladder: PriceTier[] = [rung(500, 8), rung(1000, 7)];

  it("unions pack sizes with every rung, ordered ascending", () => {
    const sizes = packSizes({ pack_size_grams: 50, packSizes: [10, 25] }, ladder);
    expect(sizes.map((s) => s.grams)).toEqual([10, 25, 50, 500, 1000]);
  });

  it("labels pack-size entries 'Ng' and rung entries 'Ng+'", () => {
    const sizes = packSizes({ pack_size_grams: 50, packSizes: [10, 25] }, ladder);
    expect(sizes.map((s) => s.label)).toEqual([
      "10g",
      "25g",
      "50g",
      "500g+",
      "1000g+",
    ]);
  });

  it("dedupes a rung equal to a pack size into ONE entry, pack-size label wins", () => {
    const sizes = packSizes(
      { pack_size_grams: 500, packSizes: [10] },
      ladder,
    );
    expect(sizes.map((s) => s.grams)).toEqual([10, 500, 1000]);
    expect(sizes.find((s) => s.grams === 500)?.label).toBe("500g");
  });

  it("null pack_size_grams contributes nothing — packSizes[] + rungs only", () => {
    const sizes = packSizes({ pack_size_grams: null, packSizes: [10] }, ladder);
    expect(sizes.map((s) => s.grams)).toEqual([10, 500, 1000]);
  });

  it("no rungs → pack sizes only", () => {
    const sizes = packSizes({ pack_size_grams: 50, packSizes: [10] }, []);
    expect(sizes.map((s) => s.grams)).toEqual([10, 50]);
  });

  it("empty everything → []", () => {
    expect(packSizes({ pack_size_grams: null, packSizes: [] }, [])).toEqual([]);
  });

  it("keeps the index-based contract: sizes[i].grams is a number at every position", () => {
    const sizes = packSizes({ pack_size_grams: 50, packSizes: [10, 25] }, ladder);
    sizes.forEach((entry, i) => {
      expect(typeof sizes[i].grams).toBe("number");
      expect(sizes[i].grams).toBe(entry.grams);
    });
  });
});
