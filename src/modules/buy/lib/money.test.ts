/**
 * Unit contract for Buy's pure money math (Task 1, 18-02 plan, RED step).
 * vitest, no Supabase, no React — mirrors src/modules/allocate/status.test.ts's
 * house style (plain describe/it over pure functions).
 */
import { describe, it, expect } from "vitest";
import { weightedAveragePrice, db1Total, db1PerUnit, marginPercent } from "./money";

describe("weightedAveragePrice — wap = totalSpend / totalGrams", () => {
  it("1000 spend over 100 grams → 10 €/g", () => {
    expect(weightedAveragePrice(1000, 100)).toBe(10);
  });

  it("zero grams (no purchases yet) → 0, not NaN", () => {
    expect(weightedAveragePrice(0, 0)).toBe(0);
  });
});

describe("db1Total — (net - wap) * qty, per selling unit, never averaged", () => {
  it("net=15, wap=10, qty=100 → 500", () => {
    expect(db1Total(15, 10, 100)).toBe(500);
  });

  it("net === wap (break-even) → 0", () => {
    expect(db1Total(10, 10, 100)).toBe(0);
  });

  it("net < wap (selling at a loss) → a negative value, not clamped to 0", () => {
    expect(db1Total(8, 10, 100)).toBe(-200);
  });

  it("net === null (not yet entered) → null, never 0 or NaN", () => {
    expect(db1Total(null, 10, 100)).toBeNull();
  });
});

describe("db1PerUnit — net - wap", () => {
  it("15, 10 → 5", () => {
    expect(db1PerUnit(15, 10)).toBe(5);
  });

  it("net === null → null, never 0 or NaN", () => {
    expect(db1PerUnit(null, 10)).toBeNull();
  });
});

describe("marginPercent — db1Total / revenue", () => {
  it("db1Total=500, revenue=1500 → ~0.3333 (33.33%)", () => {
    expect(marginPercent(500, 1500)).toBeCloseTo(0.3333, 4);
  });

  it("revenue=0 → null, never divide by zero", () => {
    expect(marginPercent(500, 0)).toBeNull();
  });

  it("db1Total === null (net not yet entered) → null, never 0 or NaN", () => {
    expect(marginPercent(null, 1500)).toBeNull();
  });
});

describe("full fixture — 3 purchase lines summed into wap, then net through the whole chain", () => {
  it("cross-checks wap -> db1Total -> db1PerUnit -> marginPercent against a hand-computed expected value", () => {
    // 3 known purchase lines (qty grams, unit_price €/g):
    //   40g @ 8, 30g @ 10, 30g @ 12
    // totalSpend = 40*8 + 30*10 + 30*12 = 320 + 300 + 360 = 980
    // totalGrams = 40 + 30 + 30 = 100
    const lines = [
      { qty: 40, unitPrice: 8 },
      { qty: 30, unitPrice: 10 },
      { qty: 30, unitPrice: 12 },
    ];
    const totalSpend = lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
    const totalGrams = lines.reduce((sum, l) => sum + l.qty, 0);
    const wap = weightedAveragePrice(totalSpend, totalGrams);
    expect(wap).toBeCloseTo(9.8, 5);

    // Buyer hand-enters a resale price of 14 €/g, selling the full 100g.
    const net = 14;
    const qty = totalGrams;
    const revenue = net * qty; // 1400
    const total = db1Total(net, wap, qty);
    const perUnit = db1PerUnit(net, wap);
    const margin = marginPercent(total, revenue);

    expect(perUnit).toBeCloseTo(4.2, 5); // 14 - 9.8
    expect(total).toBeCloseTo(420, 5); // 4.2 * 100
    expect(margin).toBeCloseTo(420 / 1400, 5); // ≈0.3
  });
});

describe("null propagation — a not-yet-entered net never silently becomes 0 or NaN", () => {
  it("db1Total(null, wap, qty) is null", () => {
    expect(db1Total(null, 9.8, 100)).toBeNull();
  });

  it("db1PerUnit(null, wap) is null", () => {
    expect(db1PerUnit(null, 9.8)).toBeNull();
  });

  it("marginPercent(null, revenue) is null", () => {
    expect(marginPercent(null, 1400)).toBeNull();
  });
});
