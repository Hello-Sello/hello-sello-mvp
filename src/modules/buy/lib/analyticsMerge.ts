/**
 * Buy — the pure (supplierName, productName) grouping/merge step (no Supabase,
 * no React → unit-testable), mirroring `partners.ts`'s `mergePartners()`
 * extraction pattern (plan 18-06).
 *
 * This IS the "layering" 18-CONTEXT.md's "Data source layering (locked)"
 * describes: live `deal_line_item` rows and CSV-imported `purchase_history_import`
 * rows for the SAME (supplier, product) pair combine into ONE weighted-average
 * calculation, not two separate rows. `analytics.ts#getBuyAnalytics` is the ONLY
 * caller — it fetches + shapes both sources into `AnalyticsSourceLine[]`, then
 * delegates the grouping to this module rather than re-implementing it inline.
 */

/** One already-shaped, already-gram-normalized purchase line from either source. */
export interface AnalyticsSourceLine {
  source: "deal" | "csv";
  supplierName: string;
  productName: string;
  /** null for a CSV-only line (no real catalogue row). */
  productId: string | null;
  /** Already gram-normalized via lineGrams() by the caller. */
  grams: number;
  /** Total euros spent on this line (price * grams-equivalent qty). */
  spend: number;
  /**
   * ISO date string — deal `delivery_date_target ?? created_at`, or CSV
   * `purchase_date` (18-14 fix). ADDITIVE ONLY, optional so existing callers/
   * fixtures that predate this field keep compiling: `mergeAnalyticsLines()`
   * below still groups/sums purely by (supplierName, productName) and never
   * reads this field — it exists so `getBuyAnalytics()` can expose the raw,
   * per-line, date-carrying array (`BuyAnalytics.lines`) for the Analytics
   * chart's real time-bucketing (`./analyticsTimeSeries.ts`), alongside the
   * (supplier, product)-collapsed totals this module still produces for the
   * table. Always populated by `getBuyAnalytics()` itself — optional only for
   * the type's backward compatibility, not because a real caller may omit it.
   */
  date?: string;
  /** Same rationale as `date` — not read by `mergeAnalyticsLines()`. */
  packSizeGrams?: number | null;
}

/** One (supplierName, productName) key's combined purchase history, both sources summed. */
export interface MergedAnalyticsLine {
  supplierName: string;
  productName: string;
  /** The first non-null productId seen for this key, else null. */
  productId: string | null;
  totalGrams: number;
  totalSpend: number;
}

/**
 * Groups live-deal lines and CSV-imported lines into one map keyed by the exact-
 * string `(supplierName, productName)` pair — no fuzzy matching (mirrors
 * `getBuyPartners()`'s v0 exact-match-only rule, 18-CONTEXT.md). Lines for
 * different keys never merge, even sharing a supplierName or productName alone.
 *
 * `productId` identity: a deal-sourced line's non-null `productId` always wins
 * over a CSV-only line's `null` for the same key, regardless of encounter order
 * — so a CSV-only group never silently loses its real catalogue link once a
 * live deal line for the same pair exists.
 */
export function mergeAnalyticsLines(lines: AnalyticsSourceLine[]): MergedAnalyticsLine[] {
  const byKey = new Map<string, MergedAnalyticsLine>();

  for (const line of lines) {
    const key = `${line.supplierName}\0${line.productName}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        supplierName: line.supplierName,
        productName: line.productName,
        productId: line.productId,
        totalGrams: line.grams,
        totalSpend: line.spend,
      });
      continue;
    }
    existing.totalGrams += line.grams;
    existing.totalSpend += line.spend;
    if (existing.productId == null && line.productId != null) {
      existing.productId = line.productId;
    }
  }

  return Array.from(byKey.values());
}
