/**
 * Pure functions for the tier ladder (ADR-0004 §4–§5). Kept free of Supabase and
 * React so the rung-pick math and the size-array shape are unit-testable with no
 * DB: which price a quantity resolves to, and the ONE ordered numeric array both
 * the card bubbles and index-based pack picks consume.
 */

/** One rung of a product's tier ladder (app-side shape; the view's jsonb
 *  `{min_grams, price_per_gram}` is mapped into this at the read boundary). */
export interface PriceTier {
  minGrams: number;
  pricePerGram: number;
}

/** The resolved per-gram price for a quantity. `appliedMin` is the winning
 *  rung's minGrams, or null when the base price applies. */
export interface ResolvedPrice {
  pricePerGram: number | null;
  appliedMin: number | null;
}

/**
 * The per-gram price a quantity resolves to: the highest rung whose `minGrams`
 * the quantity reaches (`>=`), else the base price.
 *
 * Invariants (ADR-0004 §4):
 * - A null base is null all the way down — NEVER a rung price without a base
 *   (price-less offers are a supported flow), even when tiers exist.
 * - A null quantity prices at base (nothing to reach a rung with).
 * - Normalization copies `lineValueOf` EXACTLY (derive.ts): `kg` ×1000, every
 *   other unit (g, mL, pack, unknown) treated as grams as-is — pricing follows
 *   billing. Multiplying by a units count is the CALLER'S job; pass total grams.
 * - Ladder shape is not validated here — the DB trigger owns that invariant.
 *   The input array is never mutated (sorted on a defensive copy).
 */
export function resolveTierPrice(
  basePricePerGram: number | null,
  tiers: PriceTier[],
  quantity: number | null,
  unit: string,
): ResolvedPrice {
  if (basePricePerGram === null) return { pricePerGram: null, appliedMin: null };
  if (quantity === null) return { pricePerGram: basePricePerGram, appliedMin: null };

  const grams = unit === "kg" ? quantity * 1000 : quantity;

  const reached = [...tiers]
    .sort((a, b) => a.minGrams - b.minGrams)
    .filter((t) => t.minGrams <= grams);
  const winner = reached[reached.length - 1];

  return winner
    ? { pricePerGram: winner.pricePerGram, appliedMin: winner.minGrams }
    : { pricePerGram: basePricePerGram, appliedMin: null };
}

/**
 * The ONE ordered size array (ADR-0004 §5): the product's own pack sizes
 * (`packSizes[]` + `pack_size_grams`, null contributing nothing) unioned with
 * EVERY tier rung, deduped by grams (the pack-size entry wins the label on a
 * collision), sorted ascending in place with the rest.
 *
 * `grams` stays a number at every index so `sizes[packIndex]` picks keep
 * working; labels are derived ("Ng" for pack sizes, "Ng+" for rungs) and must
 * never be parsed back.
 */
export function packSizes(
  product: { pack_size_grams: number | null; packSizes: number[] },
  tiers: PriceTier[],
): { grams: number; label: string }[] {
  const byGrams = new Map<number, { grams: number; label: string }>();
  for (const tier of tiers) {
    byGrams.set(tier.minGrams, { grams: tier.minGrams, label: `${tier.minGrams}g+` });
  }
  const ownSizes = [
    ...product.packSizes,
    ...(product.pack_size_grams === null ? [] : [product.pack_size_grams]),
  ];
  for (const g of ownSizes) {
    byGrams.set(g, { grams: g, label: `${g}g` }); // pack-size label wins a rung collision
  }
  return [...byGrams.values()].sort((a, b) => a.grams - b.grams);
}
