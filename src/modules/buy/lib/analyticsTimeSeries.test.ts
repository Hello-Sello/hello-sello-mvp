/**
 * Unit contract for bucketAnalyticsTimeSeries() — the pure time-bucketing step
 * that makes the Analytics chart's "euros over time" spec real (18-CONTEXT.md's
 * locked "Analytics + Sheet" chart rule). vitest, no Supabase, no React —
 * mirrors src/modules/buy/lib/analyticsMerge.test.ts's house style.
 *
 * RED step (TDD) — written before analyticsTimeSeries.ts exists, so every
 * test below is expected to fail on import until the GREEN commit lands.
 */
import { describe, it, expect } from "vitest";
import { bucketAnalyticsTimeSeries, type TimeSeriesSourceLine } from "./analyticsTimeSeries";

function line(partial: Partial<TimeSeriesSourceLine> & Pick<TimeSeriesSourceLine, "date" | "grams" | "spend">): TimeSeriesSourceLine {
  return {
    supplierName: "Cantouring",
    productName: "Driftwood Diesel",
    productId: "p1",
    net: null,
    gross: null,
    ...partial,
  };
}

describe("bucketAnalyticsTimeSeries — empty input", () => {
  it("returns an empty array for no lines, any granularity", () => {
    expect(bucketAnalyticsTimeSeries([], "day")).toEqual([]);
    expect(bucketAnalyticsTimeSeries([], "week")).toEqual([]);
    expect(bucketAnalyticsTimeSeries([], "month")).toEqual([]);
  });
});

describe("bucketAnalyticsTimeSeries — single period", () => {
  it("one line in month granularity produces exactly one point", () => {
    const lines = [line({ date: "2026-07-12", grams: 40, spend: 320 })];
    const points = bucketAnalyticsTimeSeries(lines, "month");
    expect(points).toHaveLength(1);
    expect(points[0].periodLabel).toBe("Jul");
    expect(points[0].periodStart).toBe("2026-07-01T00:00:00.000Z");
    expect(points[0].grams).toBe(40);
    expect(points[0].spend).toBe(320);
    expect(points[0].wap).toBeCloseTo(8, 5);
    expect(points[0].revenue).toBeNull();
    expect(points[0].db1Total).toBeNull();
  });
});

describe("bucketAnalyticsTimeSeries — multiple periods, sorted ascending", () => {
  it("two lines a month apart produce two points in chronological order", () => {
    const lines = [
      line({ date: "2026-08-05", grams: 10, spend: 90 }),
      line({ date: "2026-06-01", grams: 20, spend: 160 }),
    ];
    const points = bucketAnalyticsTimeSeries(lines, "month");
    expect(points).toHaveLength(2);
    expect(points[0].periodLabel).toBe("Jun");
    expect(points[1].periodLabel).toBe("Aug");
    expect(points[0].periodStart < points[1].periodStart).toBe(true);
  });

  it("two lines in the same calendar month merge into one point", () => {
    const lines = [
      line({ date: "2026-07-02", grams: 10, spend: 80 }),
      line({ date: "2026-07-28", grams: 30, spend: 240 }),
    ];
    const points = bucketAnalyticsTimeSeries(lines, "month");
    expect(points).toHaveLength(1);
    expect(points[0].grams).toBe(40);
    expect(points[0].spend).toBe(320);
  });
});

describe("bucketAnalyticsTimeSeries — granularity changes which period a line falls into", () => {
  it("the same two lines produce 1 point at month granularity but 2 points at day granularity", () => {
    const lines = [
      line({ date: "2026-07-01", grams: 10, spend: 80 }),
      line({ date: "2026-07-15", grams: 10, spend: 90 }),
    ];
    expect(bucketAnalyticsTimeSeries(lines, "month")).toHaveLength(1);
    expect(bucketAnalyticsTimeSeries(lines, "day")).toHaveLength(2);
  });

  it("week granularity buckets a Monday and the following Sunday into the same ISO week", () => {
    // 2026-07-06 is a Monday; 2026-07-12 is the following Sunday (same ISO week).
    const lines = [
      line({ date: "2026-07-06", grams: 10, spend: 80 }),
      line({ date: "2026-07-12", grams: 10, spend: 90 }),
    ];
    const points = bucketAnalyticsTimeSeries(lines, "week");
    expect(points).toHaveLength(1);
    expect(points[0].periodLabel).toMatch(/^Wk \d+$/);
  });

  it("week granularity puts the following Monday into a different bucket", () => {
    const lines = [
      line({ date: "2026-07-06", grams: 10, spend: 80 }), // Monday, week A
      line({ date: "2026-07-13", grams: 10, spend: 90 }), // next Monday, week B
    ];
    const points = bucketAnalyticsTimeSeries(lines, "week");
    expect(points).toHaveLength(2);
  });

  it("day granularity gives each distinct calendar day its own point, formatted D-Mon", () => {
    const lines = [
      line({ date: "2026-04-12T14:30:00Z", grams: 5, spend: 40 }),
      line({ date: "2026-04-12T02:00:00Z", grams: 5, spend: 40 }),
    ];
    const points = bucketAnalyticsTimeSeries(lines, "day");
    expect(points).toHaveLength(1);
    expect(points[0].periodLabel).toBe("12-Apr");
  });
});

describe("bucketAnalyticsTimeSeries — revenue/db1 math matches money.ts's fixture", () => {
  it("reproduces money.test.ts's 3-line fixture (40g@8, 30g@10, 30g@12, net=14) inside one period", () => {
    const lines = [
      line({ date: "2026-07-01", grams: 40, spend: 320, net: 14 }),
      line({ date: "2026-07-05", grams: 30, spend: 300, net: 14 }),
      line({ date: "2026-07-10", grams: 30, spend: 360, net: 14 }),
    ];
    const points = bucketAnalyticsTimeSeries(lines, "month");
    expect(points).toHaveLength(1);
    const point = points[0];
    expect(point.grams).toBe(100);
    expect(point.spend).toBe(980);
    expect(point.wap).toBeCloseTo(9.8, 5);
    expect(point.revenue).toBeCloseTo(1400, 5); // 14 * 100
    expect(point.db1Total).toBeCloseTo(420, 5); // (14 - 9.8) * 100, summed per-line
  });

  it("a period with no priced lines has revenue and db1Total both null (never 0/NaN)", () => {
    const lines = [line({ date: "2026-07-01", grams: 40, spend: 320, net: null })];
    const points = bucketAnalyticsTimeSeries(lines, "month");
    expect(points[0].revenue).toBeNull();
    expect(points[0].db1Total).toBeNull();
  });

  it("a period mixing a priced and an unpriced line sums revenue/db1 only from the priced line", () => {
    const lines = [
      line({ date: "2026-07-01", grams: 40, spend: 320, net: 14 }), // priced: revenue 560, db1 (14-8)*40=240
      line({ date: "2026-07-02", grams: 20, spend: 200, net: null }), // unpriced
    ];
    const points = bucketAnalyticsTimeSeries(lines, "month");
    expect(points).toHaveLength(1);
    expect(points[0].grams).toBe(60); // both lines still contribute to grams/spend
    expect(points[0].spend).toBe(520);
    expect(points[0].revenue).toBeCloseTo(560, 5);
    expect(points[0].db1Total).toBeCloseTo(240, 5);
  });
});
