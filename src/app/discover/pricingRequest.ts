/**
 * The two pure pieces of a per-product pricing ask (0022 T04, D3/D7).
 *
 * A plain module, NOT `"use server"` — `actions.ts` is, and a `"use server"`
 * file may export only async functions, so a sync builder cannot live there.
 * It is also not folded into `companies.ts`: that module maps Discover RPC
 * rows into view models (the READ side), and the seller-facing note format is
 * an outbound-write contract, not a mapper.
 *
 * `note` is what the seller actually reads — it renders in `InboxRow` and
 * `InboxDetail`. `metadata.product_id` is what the code reads: the reference
 * the criterion requires, and the key the per-product dup-guard filters on
 * (`metadata->>product_id`), so the constant has exactly one owner.
 */

/** The `metadata` key carrying the asked-about product, and the dup-guard's
 *  filter key. One owner: the builder below and the PostgREST filter in
 *  `createPairInboxItem` must never disagree.
 *  `request_product_pricing_c2c` (T02, `supabase/migrations/
 *  20260903130000_request_product_pricing_c2c.sql`) mirrors this VALUE as a
 *  literal SQL string in its own dup-guard and metadata insert — SQL cannot
 *  import a TS constant, so keep the two in sync by hand if this ever
 *  changes. */
export const PRODUCT_ID_KEY = "product_id";

/** `pending_inbox_item.note` is unbounded TEXT but every writer clamps to 280
 *  (`createPairInboxItem` does it server-side for crafted calls). The note is
 *  built to fit that cap rather than relying on the clamp, so the closing
 *  quote and full stop survive even for a pathological product name. */
const NOTE_MAX = 280;
const PREFIX = 'Pricing request for "';
const SUFFIX = '".';
const NAME_MAX = NOTE_MAX - PREFIX.length - SUFFIX.length;

/**
 * The seller-visible sentence naming the product. The name is resolved
 * server-side from `get_discoverable_shop`, never taken from the client, so
 * this is not an injection surface — but it IS seller-authored free text, so
 * an embedded quote must leave the sentence intact (it does: the quotes are
 * decoration, nothing parses this string).
 */
export function buildPricingRequestNote(productName: string): string {
  const name = productName.trim();
  const clamped = name.length > NAME_MAX ? `${name.slice(0, NAME_MAX - 1)}…` : name;
  return `${PREFIX}${clamped}${SUFFIX}`;
}

/** The `metadata` payload for a per-product ask. Exactly one key — anything
 *  else would end up in front of the seller via the inbox's metadata reads. */
export function buildPricingRequestMetadata(productId: string): { product_id: string } {
  return { product_id: productId };
}
