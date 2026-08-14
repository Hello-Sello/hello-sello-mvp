/**
 * RED-first unit contract for the buyer "See all prices" panel row model
 * (0021, T05 — PLAN-T05 `ladderPanel.ts`). `ladderRows` is the pure, testable
 * core of Variant B's panel: base row first, rungs ascending, savings derived
 * from the base, and `isApplied` delegated to `resolveTierPrice` so the panel
 * highlight can never disagree with the resolver.
 *
 * RED until `ladderPanel.ts` exists (the import fails to resolve). Do NOT
 * create the production module to satisfy an unrelated gate — this test
 * drives its shape.
 *
 * Also discharges PLAN-T05 amendment 7 (ADR §5's bubble↔resolver regression
 * invariant): the array the card renders and the array indices resolve
 * against are the SAME `packSizes()` output, and a rung's own index entry
 * resolves to that rung's price.
 */
import { describe, it, expect } from "vitest";
import { ladderRows } from "./ladderPanel";
import type { LadderPanelRow } from "./ladderPanel";
import { packSizes, resolveTierPrice } from "./pricing";
import type { PriceTier } from "./pricing";

const rung = (minGrams: number, pricePerGram: number): PriceTier => ({
  minGrams,
  pricePerGram,
});

describe("ladderRows — base-first ordered row model", () => {
  // Deliberately unsorted: the row model owns the ascending order.
  const ladder: PriceTier[] = [rung(1000, 4.2), rung(2000, 4), rung(500, 4.35)];

  it("base + 3 rungs → 4 rows: base first, then rungs ascending by minGrams", () => {
    const rows: LadderPanelRow[] = ladderRows(4.5, ladder, null);
    expect(rows.map((r) => r.minGrams)).toEqual([null, 500, 1000, 2000]);
    expect(rows.map((r) => r.label)).toEqual([
      "Base price",
      "from 500g",
      "from 1000g",
      "from 2000g",
    ]);
    expect(rows.map((r) => r.pricePerGram)).toEqual([4.5, 4.35, 4.2, 4]);
  });

  it("savings math: base 4.50, rung 4.20 → 7 (rounded percent)", () => {
    const rows = ladderRows(4.5, [rung(1000, 4.2)], null);
    // Math.round((1 - 4.2/4.5) * 100) = Math.round(6.66…) = 7
    expect(rows[1].savingPercent).toBe(7);
  });

  it("base row: savingPercent 0 and minGrams null", () => {
    const rows = ladderRows(4.5, ladder, null);
    expect(rows[0]).toMatchObject({
      label: "Base price",
      savingPercent: 0,
      minGrams: null,
    });
  });

  describe("isApplied — exactly one applied row, resolver (>=) semantics", () => {
    const appliedMins = (grams: number | null) =>
      ladderRows(4.5, ladder, grams)
        .filter((r) => r.isApplied)
        .map((r) => r.minGrams);

    it("below the lowest rung → the base row is applied", () => {
      expect(appliedMins(100)).toEqual([null]);
    });

    it("exactly at a rung → that rung is applied", () => {
      expect(appliedMins(1000)).toEqual([1000]);
    });

    it("between two rungs → the lower rung is applied", () => {
      expect(appliedMins(1500)).toEqual([1000]);
    });

    it("above every rung → the highest rung is applied", () => {
      expect(appliedMins(2500)).toEqual([2000]);
    });

    it("null currentGrams → the base row is applied (nothing to reach a rung with)", () => {
      expect(appliedMins(null)).toEqual([null]);
    });
  });

  it("null base → [] (no panel — never a rung price without a base)", () => {
    expect(ladderRows(null, ladder, 1000)).toEqual([]);
  });

  it("zero base → [] (no panel)", () => {
    expect(ladderRows(0, ladder, 1000)).toEqual([]);
  });

  it("empty tiers → [] (no panel)", () => {
    expect(ladderRows(4.5, [], 1000)).toEqual([]);
  });
});

describe("index integrity — rendered array IS the resolver's array (ADR §5, amendment 7)", () => {
  const tiers: PriceTier[] = [rung(2000, 6.5)];

  it("a rung's own packSizes entry resolves to that rung's price at its index", () => {
    const sizes = packSizes({ pack_size_grams: 1000, packSizes: [] }, tiers);
    expect(sizes).toEqual([
      { grams: 1000, label: "1000g" },
      { grams: 2000, label: "2000g+" },
    ]);
    // The entry the rung emitted (index 1) resolves to its own rung.
    expect(resolveTierPrice(8, tiers, sizes[1].grams, "g")).toEqual({
      pricePerGram: 6.5,
      appliedMin: 2000,
    });
    // And the pack-size entry (index 0) stays at base.
    expect(resolveTierPrice(8, tiers, sizes[0].grams, "g")).toEqual({
      pricePerGram: 8,
      appliedMin: null,
    });
  });

  it("rung == pack size dedupes to ONE entry that still carries the rung's grams", () => {
    const sizes = packSizes({ pack_size_grams: 2000, packSizes: [] }, tiers);
    expect(sizes).toEqual([{ grams: 2000, label: "2000g" }]);
    expect(resolveTierPrice(8, tiers, sizes[0].grams, "g")).toEqual({
      pricePerGram: 6.5,
      appliedMin: 2000,
    });
  });
});
