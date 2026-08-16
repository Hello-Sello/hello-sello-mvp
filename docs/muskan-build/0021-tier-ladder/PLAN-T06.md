# PLAN T06 — Basket resolution + grams editor

**Ticket:** HEL-51 · TICKETS.md T06 · **ADR:** 0004 §4 (decision A; "same grams as
`toDraftLines`") · Depends: T02 ✅ T03 ✅ · Parallel-safe with T04/T05 (disjoint files).

## Files

| File | Action |
|---|---|
| `src/modules/basket/lib/pack.ts` | EDIT — gains `resolveBasketLine` (the one line-resolution owner) |
| `src/modules/basket/lib/pack.test.ts` | EDIT — resolution matrix |
| `src/modules/basket/lib/toDraftLines.ts` | EDIT — writes the RESOLVED price into `unitPrice` |
| `src/modules/basket/lib/toDraftLines.test.ts` | EDIT — resolved-price cases |
| `src/modules/basket/components/BasketDrawer.tsx` | EDIT — per-line price display + grams/pack-size editor |
| `src/modules/basket/components/BasketDrawer.tiers.test.tsx` | NEW — renderToStaticMarkup contract |
| `src/modules/basket/supabase/writes.ts` | EDIT — `updateBasketLinePackSize` *(amendment: not in TICKETS' list — the drawer's editor needs a writer and none exists; no parallel ticket owns this file; recorded)* |

## `resolveBasketLine` — one owner, zero drift by construction

The drawer's display and `toDraftLines`' written price MUST be the same number (ADR
§4 pins "the same grams `toDraftLines` writes"). Instead of two call sites repeating
`toGrams`+`resolveTierPrice` (drift risk the ADR warns about), ONE pure helper in
`pack.ts` that both consume:

```ts
export interface ResolvedBasketLine {
  grams: number | null;          // toGrams(packCount, packSizeGrams)
  quantity: number;              // grams ?? packCount (the draft's quantity fallback)
  pricePerGram: number | null;   // resolved: rung or base; null base → null
  appliedMin: number | null;     // rung's minGrams or null (base)
  lineTotal: number | null;      // quantity × pricePerGram via lineValueOf semantics
}
export function resolveBasketLine(
  l: Pick<BasketLine, "packCount" | "packSizeGrams" | "pricePerGram" | "tiers" | "unit">,
): ResolvedBasketLine
```

- `grams = toGrams(l.packCount, l.packSizeGrams)`.
- Resolution: `resolveTierPrice(l.pricePerGram, l.tiers, grams ?? l.packCount,
  grams != null ? "g" : l.unit)` — when grams are known they are already grams
  (unit "g"); on the null-pack-size fallback the raw packCount rides with the
  line's own unit, mirroring exactly what `toDraftLines` writes into
  `quantity`/`unit` (the agreement the ADR demands).
- `lineTotal = quantity × resolved.pricePerGram` (null price → null total).
- Imports `resolveTierPrice` via `@/modules/catalog/index.client` — this creates
  the basket→catalog module edge the ADR names; the ADR's "both consumers import
  catalog's pricing export" invariant becomes true here.

## `toDraftLines` change

`unitPrice: resolveBasketLine(l).pricePerGram` (and `quantity` from the same call —
one source). Docstring's "Price rides through untouched" line replaced with the
resolution contract. Existing null-base test stays green by the resolver's null-base
rule.

## Drawer UI (per-line, inside `Group`)

Under the product name sub-line:
- The static `"{n}g pack"` text becomes the **grams/pack-size editor (decision A)**:
  a compact numeric input (`inputMode="decimal"`, width ~3.5rem) suffixed `g pack`,
  value = `l.packSizeGrams ?? ""`, `aria-label="Pack size in grams"`. Commit on
  blur/Enter → `updateBasketLinePackSize(l.id, grams)` → `onChanged()` (the
  existing stepper's write-then-refresh pattern; the refresh re-resolves the price —
  criterion 5a's automatic re-resolution, both directions). Invalid (≤0/NaN) input
  reverts to the last value — no dead states. Null pack size renders the input
  empty (placeholder `g`), same fallback semantics as today.
- New price line, right-aligned, tabular-nums, prototype grams-note format:
  `{packCount} × {packSize}g = **{grams}g** at **€{price}/g** → **€{total}**`
  (bold segments; comma-decimal via the repo's `eur` convention if imported, else
  `toFixed(2)` matching the drawer's plain style). When a rung applies, append the
  green chip `from {min}g applied` (10px pill, `#1d7a1c` on `rgba(52,178,51,.12)` —
  prototype `.tier-chip`); at base with tiers present, the muted `base price` chip;
  no tiers → no chip. Null price → the line shows no price segment (price-less
  flow untouched).
- All numbers come from `resolveBasketLine(l)` — the component does NO price math.

## `updateBasketLinePackSize` (writes.ts)

Shape = `updateBasketLinePackCount` (writes.ts:41-48): update
`product_basket_line.pack_size_grams` by line id, RLS-scoped, error surfaced.
Validation: positive finite number, else `{ error }`.

## Tests

- `pack.test.ts` — `resolveBasketLine` matrix: below-lowest → base + null appliedMin;
  at-threshold → rung; pack-size edit crossing a rung boundary both directions
  (500g→700g picks the 500 rung? no—grams recompute: 2×250=500 at rung, 2×350=700
  still 500-rung, 2×500=1000 next rung); null base → all price fields null but
  quantity intact; null packSizeGrams → quantity falls back to packCount + unit
  passthrough; lineTotal math incl. null; agreement: for the same line,
  `resolveBasketLine(l).pricePerGram === resolveTierPrice(l.pricePerGram, l.tiers,
  toGrams(...) ?? l.packCount, ...)` (pins the delegation).
- `toDraftLines.test.ts` — line with tiers + grams reaching a rung → `unitPrice` =
  rung price and `quantity` = grams (same call); no-tiers line → base passthrough
  (existing behavior); null-pack-size fallback keeps `quantity = packCount` and
  resolves on packCount.
- `BasketDrawer.tiers.test.tsx` (renderToStaticMarkup, initial paint): a group
  whose line has tiers + qualifying grams → HTML contains the resolved `€/g`, the
  line total, and `from 500g applied`; base-applied line → `base price` chip;
  price-less line → no price segment; the pack-size input present with
  `aria-label="Pack size in grams"` and current value.
- e2e: none this ticket (drawer interaction rides the existing basket flows;
  `present-basket.spec.ts` is all-fixme legacy — not extended here; the G4/G5 live
  walk covers the editor by hand).

## Gate
vitest full · tsc · eslint touched · guard green (no direct pricelist_item reads).

## Out of scope
ProductCard/ShopView (T04/T05) · CardFront (T07) · basket writes beyond the one new
pack-size writer · Discover · SQL.

## AMENDMENTS (plan-checker round — these OVERRIDE anything above)

1. **Testability:** `Group` is unexported and calls `useRouter()` (throws under
   renderToStaticMarkup). Extract a presentational **`BasketLineRow`** (props-only:
   the line + resolved values + callbacks; NO hooks, NO supabase imports) exported
   from BasketDrawer.tsx; `Group` renders it; the `.tsx` test renders
   `BasketLineRow` directly.
2. **Money formatting pinned:** `formatMoney` from `@/modules/deals` (de-DE,
   suffixed `4,50 €`, NBSP before €). Tests assert its REAL output including the
   NBSP. No `toFixed`, no prototype-style `€4.20`.
3. **Writer contract:** `updateBasketLinePackSize` throws on error, exactly like
   `updateBasketLinePackCount`; the editor's commit handler try/catches into
   `Group`'s existing `setError`.
4. **`toDraftLines` hardening (in-fence):** write `unit: grams != null ? "g" :
   l.unit` — makes the drawer↔draft agreement structural instead of resting on the
   unit FK never containing "kg". Update its docstring + the pack.ts header
   ("grams derived only at Send" is no longer true — live resolution reads them).
5. **The agreement test pins the REAL pair:** for a line,
   `resolveBasketLine(l).pricePerGram === toDraftLines(groupOf(l))[0].unitPrice`
   and same for `.quantity` — never resolveBasketLine vs its own internals.
6. **Test matrix, pinned:** tiers [500→8, 1000→7], base 10: (a) 2×250g=500 → 8,
   appliedMin 500; (b) 2×350g=700 → 8 (still 500-rung); (c) 2×500g=1000 → 7;
   (d) 1×100g → 10, appliedMin null; (e) null base → price/total null, quantity
   intact; (f) null packSize → quantity=packCount, unit passthrough; (g) totals:
   (c) → 7000 as 1000×7.
