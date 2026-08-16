# PLAN T03 — Single-owner reads: `pricelist.ts` + reader migration

**Ticket:** HEL-48 · TICKETS.md T03 · **ADR:** 0004 rev 8 §4. Depends: T01 ✅ T02 ✅.
Disposable — dies with the ticket.

## Files

| File | Action |
|---|---|
| `src/modules/catalog/pricelist.ts` | NEW — single owner: view read + ladder write + error mapping |
| `src/modules/catalog/pricelist.test.ts` | NEW — unit tests (fake injected client) |
| `src/modules/catalog/pricelist.guard.test.ts` | NEW — the read-scoped grep-guard over `src/**` |
| `src/modules/catalog/index.client.ts` | NEW — client-safe door: `pricing` + `pricelist` exports |
| `src/modules/catalog/shop.ts` | EDIT — price via view; `ShopProduct` gains `tiers` |
| `src/modules/catalog/manage.ts` | EDIT — row-lookup only + trigger-error mapping at the update site |
| `src/modules/deals/supabase/reads.ts` | EDIT — `getOwnCatalog` price query → view |
| `src/modules/deals/types.ts` | EDIT — `CatalogProduct` gains `tiers: PriceTier[]` (amendment: not in TICKETS' list, but T07's CardFront needs tiers on catalog lines and no parallel ticket owns this file — same class as T02's barrel amendment) |
| `src/modules/basket/supabase/reads.ts` | EDIT — price via view, stitch |
| `src/modules/basket/types.ts` | EDIT — `BasketLine` gains `tiers: PriceTier[]` |
| `src/modules/basket/lib/group.test.ts` | EDIT — full `BasketLine` literal gains `tiers: []` (checker B2: tsc breaks otherwise) |
| `src/modules/deals/lib/lineEditing.test.ts` | EDIT — full `CatalogProduct` literal gains `tiers: []` (checker B2) |
| `src/README.md` | EDIT — one two-door line under "The one rule" |

## `pricelist.ts` — the single owner

Client-safe: NO `"use server"`, NO import of `@/shared/db/server` (would drag
`next/headers` into the client barrel — the exact hazard `index.ts:6-9` documents).
The client is INJECTED:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
export type PriceDb = SupabaseClient<Database>;
```

Type-only import; `@supabase/supabase-js` is a DIRECT dependency (package.json:17 —
checker-verified) and both factory outputs return `SupabaseClient<Database, "public">`,
structurally identical. `moduleResolution: "bundler"` resolves it.

Exports:

1. `type ProductPrice = { productId: string; itemId: string; pricelistId: string;
   pricePerGram: number | null; currency: string; updatedAt: string;
   tiers: PriceTier[] }`
2. `async function readCurrentPrices(db: PriceDb, productIds?: string[]):
   Promise<Map<string, ProductPrice>>` — `.from("current_pricelist_item").select(
   "id, pricelist_id, product_id, price_per_gram, currency, updated_at, tiers")`,
   `.in("product_id", ids)` when given. Rows with null `product_id`/`id` (view
   nullability) are skipped defensively; `currency` coalesces to `"EUR"`,
   `updatedAt` to `""` (checker N2 — every view column is typed nullable). Returns
   a Map keyed by productId.
3. `function mapTiers(json: unknown): PriceTier[]` — tolerant narrow of the view's
   jsonb (`{min_grams, price_per_gram}` → `{minGrams, pricePerGram}`; snake→camel
   happens HERE, once, per pricing.ts:8-9's contract). Non-arrays/malformed entries
   → `[]`/skipped, same discipline as `parsePackSizes` (shop.ts:116-131). Exported
   for unit tests.
4. `async function lookupStandardPriceRow(db: PriceDb, productId: string):
   Promise<string | null>` — the canonical row-pick for the WRITE path: reads the
   view (owner arm) for this product, returns the item id. Replaces
   `writeStandardPrice`'s oldest-created-first pick (manage.ts:444-450) — the
   canonical-rule flip the ADR §4 blast-radius table names.
5. `async function savePriceLadder(db: PriceDb, itemId: string, base: number,
   tiers: PriceTier[]): Promise<{ ok: true } | { error: string }>` — the
   `save_price_ladder` RPC wrapper (camel→snake on the way out). T04 wires the UI
   action to it.
6. `function ladderErrorMessage(raw: string): string` — `TIER_LADDER_SHAPE:`-prefixed
   messages → the human part after the prefix; anything else → a generic
   "Price could not be saved: …" retaining the raw tail. Used by `savePriceLadder`
   AND by `writeStandardPrice`'s base-update error path (EARS bullet 4: the trigger
   fires on base edits under a ladder — manage.ts:456 today surfaces raw Postgres
   text).

## `index.client.ts` — the second door

```ts
// Client-safe public door for catalog (two-door convention, ADR-0004 §4).
// The main index.ts re-exports "use server" manage actions; client modules
// (basket, deals) import pricing + pricelist reads through THIS barrel.
export * from "./pricing";
export * from "./pricelist";
```

README gains one line right after "The one rule" paragraph: modules with a
server-tainted main barrel may expose a second `index.client.ts` door (catalog is
the first: `pricing` + `pricelist` reads); deep paths stay forbidden.

## Reader migrations (each keeps behavior, swaps the source)

**`shop.ts` / `getMyShop`:** drop `pricelist_item(…)` from the embed string; after
the product query, `readCurrentPrices(supabase, ids)` and stitch. `ShopProduct`:
keeps `price_per_gram`, `bundle_threshold_grams`, `bundle_price_per_gram`
(BRIDGE — derived from rung 1: `tiers[0]?.minGrams/…pricePerGram` — so
`ProductCard.tsx`/`ShopView.tsx` (T04/T05 files, untouchable now) keep compiling and
rendering the bundle bubble; post-backfill rung 1 IS the old bracket, so display is
equivalent; T04/T05 retire the bridge fields' consumers, C retires the columns),
gains `tiers: PriceTier[]`. shop.ts imports from `./pricelist` (same module —
deep-internal import is fine inside the module).

**`manage.ts` / `writeStandardPrice`:** the row-lookup (manage.ts:444-450) becomes
`lookupStandardPriceRow(supabase, productId)`; update-by-id stays; the update's
error return goes through `ladderErrorMessage(error.message)`. Create path (insert)
untouched per ADR §1. Imports from `./pricelist` (same module). Also reword the
comments at manage.ts:315/318 — `pricelist_item (` matches the guard's embed regex
(checker B1). **Accepted consequence (checker N7):** the view-based lookup requires
a live, own-company pricelist — an item under a soft-deleted or cross-company
pricelist no longer matches and the write falls to the INSERT branch (a fresh item
under the standard pricelist). That is the canonical rule working as intended: a
dead pricelist's row is not a valid write target.

**`deals/supabase/reads.ts` / `getOwnCatalog`:** the flat `pricelist_item` select
(reads.ts:542-551) becomes `readCurrentPrices(supabase, ids)` via
`@/modules/catalog/index.client`. Map stays; `unitPrice` from `pricePerGram`;
`CatalogProduct` gains `tiers` (deals/types.ts) and the mapping fills it. The
pre-existing no-company-filter bug on the product query (reads.ts:534-540) is NOT
fixed — ADR blast-radius: flag to Ayush, out of scope.

**`basket/supabase/reads.ts` / `getMyBasket`:** drop the nested
`pricelist_item(price_per_gram)` embed AND both `referencedTable` orderings
(reads.ts:36-40 — the view is one row per product, the embed-ordering hack dies);
after the line query, `readCurrentPrices(supabase, productIds)` + stitch
`pricePerGram` + `tiers`. `BasketLine` gains `tiers: PriceTier[]`
(`basket/types.ts`); `toDraftLines` untouched (T06).

**NOT touched:** `app/discover/companies.ts` (currently drops the RPC's `tiers`
field via its hand cast — that consumption belongs to T05's file set per TICKETS;
reading legacy bundle fields off the RPC is not a `pricelist_item` read, guard-safe).

**Named behavior changes (checker N3/N4/N5 — all ADR-sanctioned, G3-signed):**
- Basket/read paths now inherit the view's public-arm gates: unverified callers and
  out-of-window or price-hidden products yield `pricePerGram: null` where the old
  embed might have shown a price (ADR §4 tightening, G3 sign-off 2).
- Row-pick unification: basket's `updated_at desc` and shop's unordered `[0]`
  (no `deleted_at` filter!) both flip to the view's canonical pick — a product whose
  only price row is soft-deleted goes from priced to null (correct).
- Bridge window: after T04 lets sellers save 3 rungs, the old bubble UI shows only
  rung 1 until T05 lands — display incompleteness, never a wrong price
  (`bundle_price_per_gram` has zero UI consumers — checker-verified).

## The grep-guard test (new pattern — no precedent in repo)

`pricelist.guard.test.ts`, vitest, node env: recursive walk of `src/` via `node:fs`
(no new dep), files `.ts`/`.tsx`, excluding `*.test.*`, `src/types/database.types.ts`,
and the owner `src/modules/catalog/pricelist.ts`. Two banned patterns, READ-scoped:

1. `/pricelist_item\s*\(/` — the PostgREST embed form inside `.select` literals
   (checked per-line; the known comment-only mentions have no `(` after the word —
   verified in exploration; if a comment ever trips it, rewording the comment is the
   fix, the guard stays dumb and loud).
2. `/\.from\(\s*["']pricelist_item["']\s*\)\s*[\s\S]{0,80}?\.select\(/` — direct
   table read. WRITES (`).update(`, `).insert(`) stay legal — manage.ts:454/:484 are
   the sanctioned write sites.

Assertion failure lists file:line + the matched line. A self-test fixture string
inside the test proves both regexes actually match the banned forms (guard-guards
itself).

## Unit tests (`pricelist.test.ts`)

- `mapTiers`: well-formed jsonb → ordered camelCase; garbage (null, non-array,
  missing keys, string numbers) → skipped/[]; order preserved from input.
- `ladderErrorMessage`: `TIER_LADDER_SHAPE: rungs must descend` → "rungs must
  descend"; raw Postgres text → generic prefix + tail.
- `readCurrentPrices` + `lookupStandardPriceRow` + `savePriceLadder` against a
  minimal fake `PriceDb` (object with `.from().select().in()` / `.rpc()` chains
  returning canned rows) — asserts the query targets `current_pricelist_item`, the
  Map keys, null-row skipping, camel→snake on the RPC payload, error mapping wired.

## Gate

`npx vitest run` (full) · `npx tsc --noEmit` · `npx eslint` on touched files ·
`supabase db reset` + both SQL suites unchanged-green (no SQL edits here, smoke
only) · e2e deferred to `/ship` per pipeline.

## Out of scope (fences)

- NO UI files (`ProductCard.tsx`, `ShopView.tsx`, `BasketDrawer.tsx`,
  `CardFront.tsx`, `toDraftLines.ts` — T04–T07).
- NO SQL changes. NO discover/companies.ts. NO fixing getOwnCatalog's company filter.
