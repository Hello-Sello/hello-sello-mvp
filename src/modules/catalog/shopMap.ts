/**
 * Pure mappers for the Present shop read (Phase 7, D-01). Kept separate from the
 * Supabase read (shop.ts) so the non-trivial transforms are unit-testable with no
 * DB: which lot represents a product on the card, and its derived total terpene %.
 */

/** One terpene measurement on a batch. */
export type BatchTerpeneRow = { percent: number | null };

/** The batch fields pickRepresentativeBatch orders on. getMyShop's product_batch
 *  select returns a superset of these. */
export type BatchForPick = {
  ready_for_sale_date: string | null;
  created_at: string;
};

/** The batch shape deriveTerpPercent reads (its terpene rows). */
export type BatchWithTerpenes = {
  batch_terpene: BatchTerpeneRow[] | null;
};

/** Is batch `a` the "later" (more representative) lot than `b`? Ordering:
 *  ready_for_sale_date desc with NULLs last, tie-broken by created_at desc. */
function isMoreRepresentative(a: BatchForPick, b: BatchForPick): boolean {
  const ad = a.ready_for_sale_date;
  const bd = b.ready_for_sale_date;
  if (ad !== bd) {
    if (ad === null) return false; // NULLs sort last — a can't win
    if (bd === null) return true; // a has a date, b doesn't — a wins
    return ad > bd; // ISO dates compare lexically
  }
  return a.created_at > b.created_at; // equal (or both-null) dates → newest created wins
}

/** The lot that represents a product on its card: the latest by ready_for_sale_date
 *  (NULLs last), tie-broken by newest created_at. Null for a product with no batches. */
export function pickRepresentativeBatch<T extends BatchForPick>(batches: readonly T[]): T | null {
  if (batches.length === 0) return null;
  return batches.reduce((best, cur) => (isMoreRepresentative(cur, best) ? cur : best));
}

/** The product's headline Terp% = the sum of the representative batch's terpene
 *  rows, rounded to 2dp. Null when the batch is null or carries no terpene rows
 *  (NULL percents within the rows count as 0). */
export function deriveTerpPercent(batch: BatchWithTerpenes | null): number | null {
  if (!batch) return null;
  const rows = batch.batch_terpene;
  if (!rows || rows.length === 0) return null;
  const sum = rows.reduce((acc, r) => acc + (r.percent ?? 0), 0);
  return Math.round(sum * 100) / 100;
}
