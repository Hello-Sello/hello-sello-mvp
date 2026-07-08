/**
 * Buy — pure money-math helpers (no Supabase, no React → unit-testable).
 *
 * This is the ONE authoritative source for Buy's wap/DB1/margin math (18-CONTEXT.md,
 * "Money model"). Every KPI card, table rollup, and chart series on the Analytics/Sheet
 * block reduces to these four functions — later Buy plans (analytics aggregation, table
 * rollups, chart data) must import from here rather than re-deriving the formulas, so the
 * numbers can never drift between the KPI strip, the table, and the chart. Mirrors the
 * "derive, don't store" house style of `src/modules/deals/lib/derive.ts`.
 *
 * `net` (the buyer's hand-entered resale price) is an INPUT to this module, never computed
 * by it. When `net` is `null` (not yet entered), every downstream value (db1Total/db1PerUnit/
 * marginPercent) must be `null` too — never `0` (misleadingly reads as break-even) or `NaN`
 * (corrupts any downstream sum). See T-18-03 in 18-02-PLAN.md's threat register.
 */

/**
 * Weighted average purchase price, €/g: totalSpend / totalGrams over a period's purchases
 * (already summed — layering real deals + CSV history is analytics.ts's job, not this file's).
 * Returns `0` when there are no purchases yet (totalGrams === 0), matching
 * `calendarKpis()`'s existing `totalGrams === 0 ? 0 : totalValue / totalGrams` convention
 * (src/modules/allocate/calendar.ts) — not `null`, since "no data" reads the same as "0 spent".
 */
export function weightedAveragePrice(totalSpend: number, totalGrams: number): number {
  return totalGrams === 0 ? 0 : totalSpend / totalGrams;
}

/**
 * DB1 total for a selling unit: (net - wap) * qty. Never averaged (CONTEXT.md, locked) —
 * always computed per unit and summed by the caller if a rollup is needed.
 * `null` when `net` hasn't been entered yet — never `0`/`NaN`.
 */
export function db1Total(net: number | null, wap: number, qty: number): number | null {
  if (net == null) return null;
  return (net - wap) * qty;
}

/** DB1 per unit: net - wap. `null` when `net` hasn't been entered yet. */
export function db1PerUnit(net: number | null, wap: number): number | null {
  if (net == null) return null;
  return net - wap;
}

/**
 * Margin %: db1Total / revenue (revenue = net * qty). `null` when `db1Total` is `null`
 * (net not yet entered) or when `revenue` is `0` — never divide by zero.
 */
export function marginPercent(db1Total: number | null, revenue: number): number | null {
  if (db1Total == null) return null;
  if (revenue === 0) return null;
  return db1Total / revenue;
}
