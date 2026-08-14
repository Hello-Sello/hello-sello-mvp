# PLAN T02 — Resolver + packSizes (pure functions)

**Ticket:** HEL-47 · TICKETS.md T02 · **ADR:** 0004 rev 8 §4–§5.
Disposable — dies with the ticket.

## Files

| File | Action |
|---|---|
| `src/modules/catalog/pricing.ts` | NEW — the two pure functions + types |
| `src/modules/catalog/pricing.test.ts` | NEW — vitest, co-located (repo convention) |
| `src/modules/deals/index.ts` | EDIT — ONE export line: `lineValueOf` (see agreement test) |

No other files. No `index.client.ts` (T03's door), no components. The deals-barrel
line is a plan-checker-mandated fence amendment: `lineValueOf` is NOT currently
exported (`index.ts:47-57` exports `lineTotalOf` only), and without the real import
the agreement test degrades to a hand-written copy that can't catch drift. No ticket
in this epic owns `deals/index.ts` (T07 owns `CardFront.tsx` only) — no parallel
collision. TICKETS.md T02 files line gains this amendment.

## Exports

```ts
export interface PriceTier {
  minGrams: number;
  pricePerGram: number;
}

export interface ResolvedPrice {
  pricePerGram: number | null;
  appliedMin: number | null;   // the rung's minGrams, or null when base applies
}

export function resolveTierPrice(
  basePricePerGram: number | null,
  tiers: PriceTier[],
  quantity: number | null,
  unit: string,
): ResolvedPrice;

export function packSizes(
  product: { pack_size_grams: number | null; packSizes: number[] },
  tiers: PriceTier[],
): { grams: number; label: string }[];
```

**Consistency-review amendment (blocking, accepted 2026-08-14):** the field is
`pack_size_grams` (snake), matching `ShopProduct` (`shop.ts:57,78`) structurally —
so T05's twins (`ProductCard.tsx:158-159`, `ShopView.tsx:531-535`) pass their product
straight through with no hand-built adapter object. (First draft said
`packSizeGrams`; that would have re-created the adaptation layer the extraction
removes.)

**Plan-checker finding (blocking, accepted):** products carry TWO size sources — the
base `pack_size_grams` AND the seller's extra `packSizes: number[]` (`shop.ts:78`,
parsed at `:228`); both consumers union them today (`ShopView.tsx:531-535`,
`ProductCard.tsx:158-159`). Seeing only one would emit a shorter array than today's
bubbles and shift every `sizes[packIndex]` pick — the exact index-shift bug ADR §5
exists to prevent. Hence the two-field signature.

`PriceTier` is the app-side shape; T03 maps the view's `tiers` jsonb
(`{min_grams, price_per_gram}`) into it at the read boundary — snake→camel happens
once, at the edge, like every other read in the repo.

## `resolveTierPrice` semantics (EARS bullets 1–3)

1. `basePricePerGram === null` → `{pricePerGram: null, appliedMin: null}`. Always —
   even when tiers exist (ADR: "never a rung price without a base"; price-less offers
   are a supported flow).
2. `quantity === null` → `{pricePerGram: base, appliedMin: null}`.
3. Normalize: `grams = unit === "kg" ? quantity * 1000 : quantity` — copied EXACTLY
   from `lineValueOf` (`src/modules/deals/lib/derive.ts:127-130`): kg×1000, every
   other unit (g, mL, pack, unknown) treated as grams as-is. Pricing follows billing.
4. Pick the highest rung with `minGrams <= grams` (sort a defensive copy ascending by
   `minGrams`; do not mutate the input). Below every rung → base with
   `appliedMin: null`. Empty tiers array → base.
5. No validation of ladder shape here — the DB owns that invariant (T01 trigger).
   The resolver resolves whatever it's given.

## `packSizes` semantics (EARS bullet 4)

Purpose (ADR §5): ONE ordered numeric array both `ProductCard` bubbles and
`ShopView`'s index-based pick plumbing consume — `sizes[packIndex]` must stay a
number, labels derived, never parsed back.

1. Union the product's size sources: `packSizes[]` + `packSizeGrams` (null contributes
   nothing) — mirroring today's consumer union (`ShopView.tsx:531-535`,
   `ProductCard.tsx:158-159`).
2. Every rung emits `{grams: minGrams, label}` — EVERY rung, no exceptions (a rung
   without an entry breaks index-based pre-fill, criterion 5a).
3. Dedupe by `grams`; on collision the pack-size entry wins (plain label).
4. Sort ascending by `grams` — rung entries sort IN PLACE with the rest (ADR §5:
   "the ordered numeric array first, labels derived").
5. Labels (plan-checker corrected — there is no `formatGrams` helper): pack-size
   entries → `` `${g}g` `` (`ProductCard.tsx:160`); rung entries → `` `${g}g+` ``,
   preserving today's tier-bubble suffix (`:161`). Two deliberate visual deltas for
   T05 to inherit, both ADR-sanctioned: rungs sorted in place (today the one tier
   bubble is appended last) and possibly >1 `g+` bubble. The Variant B prototype is
   the visual contract T05 verifies against.

## Test plan (`pricing.test.ts`, vitest, RED first)

`describe("resolveTierPrice")`:
- at-threshold: grams exactly = minGrams applies the rung (`>=` semantics)
- below-lowest → base, appliedMin null
- above-highest → highest rung
- between rungs → lower rung
- empty ladder → base
- null quantity → base
- null base with tiers present → both null
- kg: `resolveTierPrice(10, [{500, 8}], 1, "kg")` → rung applies (1000g ≥ 500)
- mL and pack treated as grams as-is
- units multiplier (ADR Consequences list; the ×units multiplication itself is T07's
  caller-side job, but the pure property lands here): 500 g × 2 units → caller passes
  1000 as quantity → the 1000 g rung resolves
- unsorted tiers input still resolves correctly; input array not mutated

`describe("agreement with lineValueOf")` (EARS bullet 5):
- REAL import: `import { lineValueOf } from "@/modules/deals"` — enabled by the
  one-line barrel export this ticket adds (see Files). For each unit in
  `g / kg / mL / pack`: the grams the resolver normalizes must equal
  `lineValueOf(quantity, unit, 1)` (unit price 1 makes the return value the grams).
  A real import, so drift in `derive.ts` breaks this suite — the whole point.

`describe("packSizes")`:
- product 50g pack + rungs [500, 1000] → [{50}, {500}, {1000}], ordered, labeled
- rung equal to pack size dedupes
- null packSizeGrams → rungs only
- no rungs → pack size only; both empty → []

## Out of scope (fences)

- NO barrel/door edits (T03), NO UI (T04/T05), NO basket/deal wiring (T06/T07).
- NO imports of supabase clients — pure functions only.
