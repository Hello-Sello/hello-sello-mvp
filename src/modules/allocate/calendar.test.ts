/**
 * Unit contract for the Deal Calendar pure derivations (deal-calendar.md).
 * vitest, no Supabase, no React — mirrors status.test.ts's house style.
 */
import { describe, it, expect } from "vitest";
import { calendarDay, calendarKpis, lineGrams } from "./calendar";

describe("calendarDay — which date positions a pill (delivery ?? created)", () => {
  it("uses the delivery date when one is set", () => {
    expect(calendarDay("2026-07-12T00:00:00Z", "2026-07-01T00:00:00Z")).toBe(
      "2026-07-12T00:00:00Z",
    );
  });

  it("falls back to the created date when there is no delivery date", () => {
    expect(calendarDay(null, "2026-07-01T00:00:00Z")).toBe("2026-07-01T00:00:00Z");
  });
});

describe("lineGrams — a deal line's weight in grams for the €/g blend", () => {
  it("passes grams straight through", () => {
    expect(lineGrams(250, "g")).toBe(250);
  });

  it("converts kilograms to grams", () => {
    expect(lineGrams(2, "kg")).toBe(2000);
  });

  it("treats a countable 'unit' line as zero grams (not a weight)", () => {
    expect(lineGrams(5, "unit")).toBe(0);
  });
});

describe("calendarKpis — the 'Status this month' figures", () => {
  it("sums value, counts deals, blends €/g by weight, and counts distinct counterparties", () => {
    const kpis = calendarKpis([
      { value: 1000, grams: 200, counterpartyId: "AU" }, // 5 €/g
      { value: 600, grams: 100, counterpartyId: "CA" }, // 6 €/g
    ]);
    expect(kpis.totalValue).toBe(1600);
    expect(kpis.dealCount).toBe(2);
    // weighted (money ÷ grams), NOT the simple mean of 5 and 6 → 1600/300
    expect(kpis.weightedAvgPrice).toBeCloseTo(5.333, 2);
    expect(kpis.activeCounterparties).toBe(2);
  });

  it("returns zeros (no NaN) for an empty month", () => {
    const kpis = calendarKpis([]);
    expect(kpis).toEqual({
      totalValue: 0,
      dealCount: 0,
      weightedAvgPrice: 0,
      activeCounterparties: 0,
    });
  });
});
