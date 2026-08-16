/**
 * The single price-read owner (ADR-0004 §4): every price READ in the app goes
 * through the `current_pricelist_item` view via this module — the view owns
 * which row is "the" current price (live pricelist, visibility window, public
 * arm), so callers never re-implement row-picking. Writes stay in manage.ts;
 * the `save_price_ladder` RPC wrapper here is the one door to the ladder write.
 *
 * Client-safe by construction: the Supabase client is INJECTED (`PriceDb`), so
 * this file never touches `@/shared/db/server` and can be re-exported through
 * the client barrel (`index.client.ts`) without dragging `next/headers` in.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { PriceTier } from "./pricing";

/** Any authenticated Supabase client (server or browser) — both factory
 *  outputs are structurally `SupabaseClient<Database>`. */
export type PriceDb = SupabaseClient<Database>;

/** A product's current price as the view resolves it. `tiers` is already
 *  camelCase (`mapTiers` is the ONE snake→camel boundary, per pricing.ts). */
export type ProductPrice = {
  productId: string;
  itemId: string;
  pricelistId: string;
  pricePerGram: number | null;
  currency: string;
  updatedAt: string;
  tiers: PriceTier[];
};

/**
 * Narrow the view's `tiers` jsonb to `PriceTier[]` — snake→camel happens here,
 * once. Tolerant of any legacy/foreign shape (same discipline as
 * `parsePackSizes`): a non-array yields [], malformed rungs are skipped.
 */
export function mapTiers(json: unknown): PriceTier[] {
  if (!Array.isArray(json)) return [];
  const tiers: PriceTier[] = [];
  for (const entry of json) {
    const rung = entry as { min_grams?: unknown; price_per_gram?: unknown } | null;
    if (
      rung &&
      typeof rung.min_grams === "number" &&
      Number.isFinite(rung.min_grams) &&
      typeof rung.price_per_gram === "number" &&
      Number.isFinite(rung.price_per_gram)
    ) {
      tiers.push({ minGrams: rung.min_grams, pricePerGram: rung.price_per_gram });
    }
  }
  return tiers;
}

/**
 * Read the current price for each product, keyed by product id. Omitting
 * `productIds` reads every row the caller may see (RLS + the view's arms).
 * Every view column is typed nullable (view projection): rows missing
 * `product_id`/`id` are skipped, `currency` coalesces to "EUR", `updatedAt`
 * to "".
 */
export async function readCurrentPrices(
  db: PriceDb,
  productIds?: string[],
): Promise<Map<string, ProductPrice>> {
  let query = db
    .from("current_pricelist_item")
    .select("id, pricelist_id, product_id, price_per_gram, currency, updated_at, tiers");
  if (productIds) query = query.in("product_id", productIds);
  const { data, error } = await query;
  if (error) throw error;

  const prices = new Map<string, ProductPrice>();
  for (const row of data ?? []) {
    if (row.product_id == null || row.id == null) continue;
    prices.set(row.product_id, {
      productId: row.product_id,
      itemId: row.id,
      pricelistId: row.pricelist_id ?? "",
      pricePerGram: row.price_per_gram,
      currency: row.currency ?? "EUR",
      updatedAt: row.updated_at ?? "",
      tiers: mapTiers(row.tiers),
    });
  }
  return prices;
}

/**
 * The canonical write-target pick: the item id the view resolves for this
 * product, or null when no live row exists (then the write path inserts a
 * fresh item). Replaces the old oldest-created-first pick — a row under a
 * dead or cross-company pricelist is not a valid write target.
 */
export async function lookupStandardPriceRow(
  db: PriceDb,
  productId: string,
): Promise<string | null> {
  const prices = await readCurrentPrices(db, [productId]);
  return prices.get(productId)?.itemId ?? null;
}

/** The DB trigger prefixes its ladder-shape rejections with this; everything
 *  after the prefix is already human-readable. */
const TIER_LADDER_PREFIX = "TIER_LADDER_SHAPE:";

/** Trigger text → a message fit for the seller: shape rejections lose the
 *  prefix; any other failure keeps its raw tail for diagnosis. */
export function ladderErrorMessage(raw: string): string {
  const at = raw.indexOf(TIER_LADDER_PREFIX);
  if (at !== -1) return raw.slice(at + TIER_LADDER_PREFIX.length).trim();
  return `Price could not be saved: ${raw}`;
}

/**
 * Save a product's base price + full tier ladder atomically via the
 * `save_price_ladder` RPC (camel→snake on the way out). The trigger owns the
 * ladder-shape invariant; its rejection comes back through
 * `ladderErrorMessage`.
 */
export async function savePriceLadder(
  db: PriceDb,
  itemId: string,
  base: number,
  tiers: PriceTier[],
): Promise<{ ok: true } | { error: string }> {
  const { error } = await db.rpc("save_price_ladder", {
    p_pricelist_item_id: itemId,
    p_base: base,
    p_tiers: tiers.map((t) => ({
      min_grams: t.minGrams,
      price_per_gram: t.pricePerGram,
    })),
  });
  return error ? { error: ladderErrorMessage(error.message) } : { ok: true };
}
