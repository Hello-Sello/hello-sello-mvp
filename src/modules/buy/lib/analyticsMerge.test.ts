/**
 * Unit contract for mergeAnalyticsLines() — the pure (supplierName, productName)
 * layering step (Task 1, 18-07 plan, RED step). vitest, no Supabase, no React —
 * mirrors src/modules/buy/lib/money.test.ts's house style.
 */
import { describe, it, expect } from "vitest";
import { mergeAnalyticsLines, type AnalyticsSourceLine } from "./analyticsMerge";

describe("mergeAnalyticsLines — same-key deal+deal lines merge", () => {
  it("two deal lines for the same (supplier, product) sum grams and spend into one", () => {
    const lines: AnalyticsSourceLine[] = [
      { source: "deal", supplierName: "Cantouring", productName: "Driftwood Diesel", productId: "p1", grams: 40, spend: 320 },
      { source: "deal", supplierName: "Cantouring", productName: "Driftwood Diesel", productId: "p1", grams: 30, spend: 300 },
    ];
    const merged = mergeAnalyticsLines(lines);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      supplierName: "Cantouring",
      productName: "Driftwood Diesel",
      productId: "p1",
      totalGrams: 70,
      totalSpend: 620,
    });
  });
});

describe("mergeAnalyticsLines — same-key deal+csv lines layer into one", () => {
  it("a deal line and a csv line for the same (supplier, product) combine, not two rows", () => {
    const lines: AnalyticsSourceLine[] = [
      { source: "deal", supplierName: "Cantouring", productName: "Driftwood Diesel", productId: "p1", grams: 40, spend: 320 },
      { source: "csv", supplierName: "Cantouring", productName: "Driftwood Diesel", productId: null, grams: 60, spend: 540 },
    ];
    const merged = mergeAnalyticsLines(lines);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      supplierName: "Cantouring",
      productName: "Driftwood Diesel",
      totalGrams: 100,
      totalSpend: 860,
    });
  });
});

describe("mergeAnalyticsLines — different keys never merge", () => {
  it("same supplier, different product → two separate lines", () => {
    const lines: AnalyticsSourceLine[] = [
      { source: "deal", supplierName: "Cantouring", productName: "Driftwood Diesel", productId: "p1", grams: 40, spend: 320 },
      { source: "deal", supplierName: "Cantouring", productName: "Blue Dream", productId: "p2", grams: 20, spend: 200 },
    ];
    const merged = mergeAnalyticsLines(lines);
    expect(merged).toHaveLength(2);
  });

  it("same product name, different supplier → two separate lines", () => {
    const lines: AnalyticsSourceLine[] = [
      { source: "deal", supplierName: "Cantouring", productName: "Driftwood Diesel", productId: "p1", grams: 40, spend: 320 },
      { source: "deal", supplierName: "Rheinland", productName: "Driftwood Diesel", productId: "p3", grams: 25, spend: 275 },
    ];
    const merged = mergeAnalyticsLines(lines);
    expect(merged).toHaveLength(2);
  });
});

describe("mergeAnalyticsLines — csv-only lines with no matching deal history", () => {
  it("a csv-only line (no deal line for that key) produces its own line with productId null", () => {
    const lines: AnalyticsSourceLine[] = [
      { source: "csv", supplierName: "Legacy Supplier GmbH", productName: "OG Kush", productId: null, grams: 100, spend: 900 },
    ];
    const merged = mergeAnalyticsLines(lines);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      supplierName: "Legacy Supplier GmbH",
      productName: "OG Kush",
      productId: null,
      totalGrams: 100,
      totalSpend: 900,
    });
  });
});

describe("mergeAnalyticsLines — productId identity preserved when only one source has it", () => {
  it("deal line (non-null productId) + csv line (null productId) → merged carries the non-null productId", () => {
    const lines: AnalyticsSourceLine[] = [
      { source: "deal", supplierName: "Cantouring", productName: "Driftwood Diesel", productId: "p1", grams: 40, spend: 320 },
      { source: "csv", supplierName: "Cantouring", productName: "Driftwood Diesel", productId: null, grams: 60, spend: 540 },
    ];
    const merged = mergeAnalyticsLines(lines);
    expect(merged[0].productId).toBe("p1");
  });

  it("csv line (null productId) encountered FIRST, deal line (non-null) second → still carries the non-null productId", () => {
    const lines: AnalyticsSourceLine[] = [
      { source: "csv", supplierName: "Cantouring", productName: "Driftwood Diesel", productId: null, grams: 60, spend: 540 },
      { source: "deal", supplierName: "Cantouring", productName: "Driftwood Diesel", productId: "p1", grams: 40, spend: 320 },
    ];
    const merged = mergeAnalyticsLines(lines);
    expect(merged[0].productId).toBe("p1");
  });
});
