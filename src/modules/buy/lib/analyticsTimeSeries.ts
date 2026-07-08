/**
 * Buy — the pure time-bucketing step for the Analytics chart (no Supabase, no
 * React → unit-testable), mirroring `analyticsMerge.ts`'s extraction pattern.
 *
 * This is what makes 18-CONTEXT.md's locked chart rule real: "the graph is
 * ALWAYS euros over time (x = time), granularity depends on the Time filter."
 * `getBuyAnalytics()` (analytics.ts) attaches a real per-line `date` (deal
 * `delivery_date_target ?? created_at`, or CSV `purchase_date`) to every raw
 * source line and exposes them as `BuyAnalytics.lines`; `PartnersAnalyticsCard`
 * (18-12) calls `bucketAnalyticsTimeSeries()` over that array (optionally
 * pre-filtered/re-scoped by its existing filter/row-selection logic) instead of
 * fabricating one-bar-per-entity bars.
 *
 * Money math is NEVER re-derived here — `weightedAveragePrice()`/`db1Total()`
 * (`./money.ts`) are the only source of that arithmetic. Per-line DB1 uses that
 * SAME line's own unit price (`spend / grams`) as its "wap" argument, which is
 * algebraically identical to `revenue - spend` for that line (since
 * `db1Total(net, wap, qty) = net*qty - wap*qty = net*qty - spend` when
 * `wap = spend/qty`) — summing these per-line results across a period gives
 * the period's true DB1 total even though different products/prices coexist
 * in the same bucket (a single `db1Total()` call could not do this correctly,
 * since it only accepts one `net` per call).
 *
 * Period bucketing — three granularities, all fixed-calendar (never rolling),
 * mirroring 18-RESEARCH.md's "Claude's Discretion: fixed-calendar-week"
 * precedent (simpler than a rolling N-day window, same simplicity bias):
 * - `day`: the UTC calendar day.
 * - `week`: the ISO week (Monday-Sunday), keyed by that week's Monday.
 * - `month`: the UTC calendar month, keyed by its 1st.
 * All date math runs in UTC deliberately — buy/sell timestamps are stored as
 * `TIMESTAMPTZ`/`DATE`, and bucketing in UTC keeps the boundary rule identical
 * regardless of caller timezone (a stated simplification, not a bug).
 */
import { weightedAveragePrice, db1Total as lineDb1Total } from "./money";

export type TimeGranularity = "day" | "week" | "month";

/** One already-dated, already-priced purchase line — the raw (pre-merge)
 *  shape `getBuyAnalytics()` exposes via `BuyAnalytics.lines` for charting. */
export interface TimeSeriesSourceLine {
  supplierName: string;
  productName: string;
  /** null for a CSV-only line (no real catalogue row). */
  productId: string | null;
  /** ISO date string — deal `delivery_date_target ?? created_at`, or CSV `purchase_date`. */
  date: string;
  /** Already gram-normalized via lineGrams(). */
  grams: number;
  /** Total euros spent on this line. */
  spend: number;
  /** This line's (supplier, product) resolved buyer resale price, or null if not yet entered. */
  net: number | null;
  gross: number | null;
}

/** One aggregated period's worth of chart data. */
export interface TimeSeriesPoint {
  /** e.g. "Jul", "Wk 28", "12-Apr" — matches `ChartSeriesPoint.label`'s existing examples. */
  periodLabel: string;
  /** ISO string, start of the period (UTC) — used for sort order and as the point's grouping key. */
  periodStart: string;
  grams: number;
  spend: number;
  /** weightedAveragePrice() over every line in this period, regardless of pricing. */
  wap: number;
  /** Sum of `net * grams` across priced lines only; null if NO line in this period has a net yet. */
  revenue: number | null;
  /** Sum of each priced line's own db1Total(); null under the same condition as `revenue`. */
  db1Total: number | null;
}

function isoWeekStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const isoDay = d.getUTCDay() || 7; // Sunday (0) -> 7, so Monday is always day 1
  d.setUTCDate(d.getUTCDate() - (isoDay - 1));
  return d;
}

function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const isoDay = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - isoDay); // nearest Thursday determines the ISO week's year
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function shortMonth(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
}

/** Resolves a line's `date` to its bucket's (periodStart, periodLabel) pair. */
function periodFor(date: Date, granularity: TimeGranularity): { periodStart: Date; periodLabel: string } {
  if (granularity === "month") {
    const periodStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    return { periodStart, periodLabel: shortMonth(periodStart) };
  }
  if (granularity === "week") {
    const periodStart = isoWeekStart(date);
    return { periodStart, periodLabel: `Wk ${isoWeekNumber(date)}` };
  }
  const periodStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return { periodStart, periodLabel: `${periodStart.getUTCDate()}-${shortMonth(periodStart)}` };
}

interface MutableBucket {
  periodStart: Date;
  periodLabel: string;
  grams: number;
  spend: number;
  revenue: number;
  db1: number;
  anyPriced: boolean;
}

/**
 * Groups dated, priced purchase lines into one aggregated point per period —
 * the ONLY place euros-over-time bucketing happens for the Analytics chart.
 * Lines with an unparseable `date` are skipped defensively (never crash the
 * chart over one bad row); this never happens for real `getBuyAnalytics()`
 * output, since `delivery_date_target ?? created_at` / `purchase_date` are
 * both NOT NULL-backed at the schema level.
 */
export function bucketAnalyticsTimeSeries(
  lines: TimeSeriesSourceLine[],
  granularity: TimeGranularity,
): TimeSeriesPoint[] {
  const byKey = new Map<string, MutableBucket>();

  for (const line of lines) {
    const date = new Date(line.date);
    if (Number.isNaN(date.getTime())) continue;

    const { periodStart, periodLabel } = periodFor(date, granularity);
    const key = periodStart.toISOString();
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = { periodStart, periodLabel, grams: 0, spend: 0, revenue: 0, db1: 0, anyPriced: false };
      byKey.set(key, bucket);
    }

    bucket.grams += line.grams;
    bucket.spend += line.spend;

    if (line.net != null) {
      bucket.anyPriced = true;
      bucket.revenue += line.net * line.grams;
      // This line's own unit price (spend/grams) stands in for db1Total()'s
      // `wap` argument — see file header comment for why this is exact, not
      // an approximation, even though the period mixes multiple products.
      const lineWap = weightedAveragePrice(line.spend, line.grams);
      bucket.db1 += lineDb1Total(line.net, lineWap, line.grams) ?? 0;
    }
  }

  return Array.from(byKey.values())
    .sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime())
    .map((bucket) => ({
      periodLabel: bucket.periodLabel,
      periodStart: bucket.periodStart.toISOString(),
      grams: bucket.grams,
      spend: bucket.spend,
      wap: weightedAveragePrice(bucket.spend, bucket.grams),
      revenue: bucket.anyPriced ? bucket.revenue : null,
      db1Total: bucket.anyPriced ? bucket.db1 : null,
    }));
}
