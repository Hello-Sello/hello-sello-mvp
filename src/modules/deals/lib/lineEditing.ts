/**
 * Pure line-editing helpers for the Deal Basket form (phase 3e, FORM-01/FORM-02).
 *
 * Kept pure (no React, no Supabase) so the basket rules - "increment by one
 * pack, don't duplicate" and the custom-line seed - are unit-tested in isolation
 * (mirrors lib/derive.ts and lib/basket.ts).
 *
 * Products are sold in PACKS: `product.pack_size_grams` is how many grams one
 * pack is. The basket steps quantity by one pack (one click = one pack), but the
 * line still stores grams and is still priced per gram (CARD-02 stays correct).
 *
 * FORM-01: re-adding a catalogue product adds ONE MORE PACK to the existing line
 * instead of appending a duplicate row. Matched by productId; a custom line
 * (productId null) never merges - the `productId != null` guard is load-bearing.
 *
 * FORM-02: a custom (off-catalogue) product is a free-typed line with productId
 * null, no pack size (the user types grams), and an optional price.
 */
import type { CatalogProduct, DraftLineInput } from "../types";

/**
 * Fallback pack step in grams when a product has no `pack_size_grams` on record
 * (or for custom/edit lines). 1000 g = 1 kg, the typical wholesale unit.
 */
export const DEFAULT_PACK_GRAMS = 1000;

/** One pack in grams: the product's pack size, or the default when unknown. */
export function packStepGrams(packSizeGrams: number | null | undefined): number {
  return packSizeGrams && packSizeGrams > 0 ? packSizeGrams : DEFAULT_PACK_GRAMS;
}

/**
 * How many whole packs a gram quantity represents (display only). Returns null
 * when the line has no pack size, so the UI shows grams instead of a pack count.
 */
export function packsOf(quantity: number, packSizeGrams: number | null | undefined): number | null {
  if (!packSizeGrams || packSizeGrams <= 0) return null;
  return quantity / packSizeGrams;
}

/**
 * Add `product` to `lines`, or - if a line for the SAME catalogue product AND
 * the SAME batch is already present - add one more pack to that line's quantity
 * (FORM-01 + D-05).
 *
 * `seed` builds a fresh line for a not-yet-present product. The form passes
 * `lineFromProduct`, so the catalogue auto-fill (pack size, price, cultivar,
 * pzn, thc/cbd, AND the chosen batch) is reused here, never re-inlined - the
 * grid buttons and the add-by-name pick share this one path (D-04/D-08).
 *
 * D-05 - the merge key is productId + batchId. `seed` already knows which batch
 * was picked (the form closes over the chosen batch), so we build the candidate
 * line first and read ITS batchId, then look for an existing line that matches
 * BOTH productId and that batchId: same product + same batch increments one
 * pack; same product + DIFFERENT batch becomes a new line (the batch-4 /
 * batch-5 split). The `productId != null` guard stays load-bearing so a custom
 * (off-catalogue) line never merges.
 */
export function addOrIncrement(
  lines: DraftLineInput[],
  product: CatalogProduct,
  seed: (p: CatalogProduct) => DraftLineInput,
): DraftLineInput[] {
  const candidate = seed(product);
  const chosenBatchId = candidate.batchId ?? null;
  const i = lines.findIndex(
    (l) =>
      l.productId != null &&
      l.productId === product.id &&
      (l.batchId ?? null) === chosenBatchId,
  );
  if (i === -1) return [...lines, candidate];
  const step = packStepGrams(product.packSizeGrams);
  return lines.map((l, j) =>
    j === i ? { ...l, quantity: l.quantity + step } : l,
  );
}

/**
 * A blank custom (off-catalogue) line (FORM-02). `productId` is null, so it never
 * merges (the addOrIncrement guard) and is deliberately skipped by the
 * product_id margin carry-forward (a documented, accepted limitation). No pack
 * size (the user types grams directly); the per-gram unit + default quantity
 * match the catalogue convention so the card money math (CARD-01/02) stays
 * correct; price is left open.
 */
export function emptyCustomLine(name = "", currency = "EUR"): DraftLineInput {
  return {
    productId: null,
    productName: name,
    quantity: DEFAULT_PACK_GRAMS,
    packSizeGrams: null,
    unit: "g",
    unitPrice: null,
    currency,
    // A custom line is batch-exempt (D-06): no catalogue product, no batch. The
    // explicit nulls keep the shape consistent so a custom line never merges
    // (D-05) and the form's batch guard can tell it apart from an un-batched
    // catalogue line.
    batchId: null,
    batchNumber: null,
  };
}
