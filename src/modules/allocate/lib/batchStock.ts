/**
 * Batches allocator - pure, client-safe types + stock derivation
 * (Sell surface, DEV-76/DEV-157).
 *
 * Split out of `../batches.ts` (which additionally imports the SERVER-only
 * `@/shared/db/server` client for `getAllocationWorklist()`): a client
 * component that needs `AllocationRow`/`computeBatchStock` must import them
 * from here, never from `../batches`, or Next.js bundles that file's
 * `next/headers` import into the client and crashes the whole page. Mirrors
 * `src/modules/deals/lib/derive.ts`'s separation from `supabase/reads.ts`.
 */

/** One demand row: a real `deal_line_item` the seller must Decline/Substitute/Supply. */
export type AllocationRow = {
  lineItemId: string;
  dealCardId: string;
  customerName: string;
  buyerCompanyId: string;
  productId: string;
  productName: string;
  substitutedFromProductId: string | null;
  /** The ORIGINAL product's name, when substituted — Rule 2 addition (not in
   *  the plan's original type sketch): the struck-through display needs it. */
  substitutedFromProductName: string | null;
  /** Display-only decomposition of volTotalGrams via the product's pack size - see module doc. */
  unitsOrdered: number;
  unitVolGrams: number;
  volTotalGrams: number;
  pricePerGram: number;
  priceTotal: number;
  batchId: string | null;
  batchNumber: string | null;
  batchSplits: { batchId: string; grams: number }[] | null;
  allocationStatus: "pending" | "supply" | "decline";
  locked: boolean;
  availableBatches: { id: string; batchNumber: string; quantityGrams: number }[];
  /** The parent deal_card's created_at (Rule 2 addition, not in the plan's
   *  original type sketch): AllocationTable's "First Order" sort chip needs a
   *  real chronological signal — mirrors Plan 2's SellerOrderRow.receivedAt. */
  receivedAt: string;
};

/**
 * Live per-batch stock: allocated (from `supply`-status rows only) vs the
 * batch's own real `quantity_grams` - PURE, no Supabase (unit-testable). Never
 * derives from a stored "allocated" column; declined/pending rows never
 * commit stock, matching the prototype's `renderAllocFoot` rule exactly.
 */
export function computeBatchStock(
  rows: AllocationRow[],
): Map<string, { allocatedGrams: number; totalGrams: number }> {
  const stock = new Map<string, { allocatedGrams: number; totalGrams: number }>();
  const ensure = (batchId: string, totalGrams: number) => {
    const existing = stock.get(batchId);
    if (existing) return existing;
    const created = { allocatedGrams: 0, totalGrams };
    stock.set(batchId, created);
    return created;
  };

  // Seed every batch this worklist knows about (0 allocated) so a selected
  // product's untouched batches still render a (0 / total) bar.
  for (const row of rows) {
    for (const b of row.availableBatches) ensure(b.id, b.quantityGrams);
  }

  for (const row of rows) {
    if (row.allocationStatus !== "supply") continue;
    if (row.batchSplits && row.batchSplits.length > 0) {
      for (const split of row.batchSplits) {
        ensure(split.batchId, 0).allocatedGrams += split.grams;
      }
    } else if (row.batchId) {
      ensure(row.batchId, 0).allocatedGrams += row.volTotalGrams;
    }
  }
  return stock;
}
