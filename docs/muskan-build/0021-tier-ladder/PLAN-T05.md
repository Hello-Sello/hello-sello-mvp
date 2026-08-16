# PLAN T05 — Buyer "See all prices" panel (Variant B)

**Ticket:** HEL-50 · TICKETS.md T05 · **ADR:** 0004 §5 · **Visual contract:** the
prototype's `footerBuyerB` (index.html:330-351) + chip/grams-note (:271-289) —
NOTES.md: "Variant B as prototyped = the G4 visual contract." Depends: T04 ✅
(same file — sequential).

## Scope reality (recorded at planning, for G4)

TICKETS' files reach `/present` (seller's own shop — spec rule 3a "seller sees what
the buyer sees") and any future surface reusing the shared `ProductCard`. Discover's
buyer page uses its OWN tile without tiers (`discover/[companyId]/page.tsx:160-197`,
`DiscoverProduct` has no tiers field) — OUT of this ticket per its file list;
flagged as follow-up belonging to the connected-shop/basket-wire work (august-mvp).

## Files

| File | Action |
|---|---|
| `src/modules/catalog/ladderPanel.ts` | NEW — pure row-model (`ladderRows`) *(amendment-class: the testable core, repo extraction pattern)* |
| `src/modules/catalog/ladderPanel.test.ts` | NEW |
| `src/modules/catalog/components/ProductCard.tsx` | EDIT — read-mode reveal + packSizes swap |
| `src/modules/catalog/components/ProductCard.panel.test.tsx` | NEW — renderToStaticMarkup contract |
| `src/app/present/ShopView.tsx` | EDIT — `handleAddToBasket` consumes `packSizes()` (kills the private twin + index bug class) |
| `e2e/present-card-edit.spec.ts` | EDIT — one reveal round-trip case (file already serial + tier-seeded) |

## `ladderPanel.ts` — pure row model (prototype `ladderOptions` :293-302)

```ts
export interface LadderPanelRow {
  label: string;            // "Base price" | "from {min}g"
  pricePerGram: number;
  savingPercent: number;    // 0 for base; Math.round((1 - price/base) * 100)
  minGrams: number | null;  // null = base row
  isApplied: boolean;       // current qty/pack resolves to this row
}
export function ladderRows(
  basePricePerGram: number | null, tiers: PriceTier[],
  currentGrams: number | null,
): LadderPanelRow[]
```
Base first, rungs ascending. Null/zero base or empty tiers → `[]` (no panel).
`isApplied` via `resolveTierPrice(base, tiers, currentGrams, "g")` — appliedMin
match. Import via `./pricing` (same module).

## ProductCard read-mode edits

1. **Reveal trigger** (prototype :339): under the price value in the `priceShown`
   block — a borderless underlined brand link toggling exactly `See all prices` /
   `Hide prices` (`aria-expanded`, local `useState`). Rendered ONLY when
   `priceShown && p.tiers.length > 0` — **criterion 4 holds structurally:
   `priceShown` already gates on `pricePublic && price != null`; hidden price ⇒ no
   prices AND no reveal.** Seller-viewing-own-saved-card sees the same block (rule
   3a — same component, same gate).
2. **Panel** (prototype :342-349): inline under the price row, pink-tinted rounded
   box; one row per `ladderRows` entry: label + (green `−{n}%` for rungs) + price +
   `Choose` button (none on the base row). Applied row gets the tinted background.
   Prices via the card's existing `eur()` (comma-decimal — the shipped convention
   wins over the prototype's `€4.20`, recorded as a deliberate delta).
   `aria-label="Choose from {min}g"` per rung.
3. **Choose → pre-fill via the packSizes INDEX** (EARS 2, ADR §5): the card swaps
   `packLabels` for `packSizes(p, p.tiers)` (T02's function — kills the private
   twin). Bubbles render `sizes[i].label`; state `pack` stays an index into the SAME
   array; Choose sets `pack` to the rung's entry index (every rung emits an entry —
   guaranteed by packSizes) and `qty` to 1 (the rung's grams are the pack size —
   `Math.ceil(min/pack)` collapses to 1 with the rung-sized pack; prototype
   pre-fills to reach the rung, this reaches it exactly). Panel closes; the
   availability chip (`from {min}g applied` / `base price`, prototype :271-275 —
   reuse T06/T07's chip treatment) updates; stepper changes re-resolve the chip
   automatically (spec rule 6) via `resolveTierPrice` on
   `sizes[pack].grams × qty`.
4. **`onAddToBasket(productId, qty, packIndex)` unchanged** — index-based plumbing
   preserved.
5. **Bridge retirement (card half):** `packLabels`' `bundle_threshold_grams` append
   dies with `packLabels`; the card no longer reads the bridge fields.

## ShopView edit

`handleAddToBasket`'s hand-built union (:529-541) → `packSizes(product,
product.tiers).map(s => s.grams)[packIndex] ?? product.pack_size_grams ?? null`.
The 12-line bug-post-mortem comment shrinks to a two-line pointer at the single
owner. ShopView stops reading `bundle_threshold_grams` (bridge retirement, view
half). **The two lists are now the same function — the index-mismatch bug class is
structurally dead** (ADR §5's exact goal).

## Tests

- `ladderPanel.test.ts`: base+3 rungs → 4 rows ordered, savings math (4.50 base,
  4.20 → 7%), base row saving 0/minGrams null; isApplied at each grams point incl.
  below-lowest → base applied; null base → []; empty tiers → [].
- `ProductCard.panel.test.tsx` (initial-paint): tiers + public price → `See all
  prices` in HTML; price hidden (`price_public` false) → NO reveal text, NO `€`
  ladder rows; no tiers → no reveal; panel content can't be asserted open (state)
  — the ROW MODEL is unit-tested; the open-panel interaction is e2e.
- e2e (one case in the serial file): AUR-1A (seeded rung) read mode → click
  `See all prices` → panel shows `Base price` + `from 2000g` rows → `Choose` on the
  rung → the 2000g bubble is selected + chip shows `from 2000g applied` → add to
  basket → drawer line shows the rung price (ties T05→T06 live).

## Gate
vitest full · tsc · eslint touched · guard green · e2e file green after fresh
`db reset`.

## Out of scope
Discover tile/companies.ts (follow-up recorded) · basket internals (T06 done) ·
seller edit mode (T04 done) · SQL.

## AMENDMENTS (plan-checker round — OVERRIDE the body)

1. **Chip gated like the reveal:** the availability line renders in both modes and
   outside `priceShown` — the chip renders ONLY when `!editing && priceShown &&
   p.tiers.length > 0` (criterion 4: hidden price ⇒ no chip either).
2. **ShopView guard:** `product ? packSizes(product, product.tiers)[packIndex]?.grams
   ?? product.pack_size_grams ?? null : null` — no undefined deref; import
   `packSizes` from `@/modules/catalog/index.client` (the door), not a deep path.
3. **Headline shows the APPLIED price (prototype-faithful):** the `Approx.` value
   becomes the resolved price at the current `sizes[pack]?.grams ?? null` × qty
   (falls back to base; `eur()` formatting). The chip, panel highlight, and
   headline therefore always agree.
4. **`currentGrams` owner:** computed once in the card as
   `(sizes[pack]?.grams ?? null) && qty` product, guarded for stale indices; feeds
   the chip, the headline resolution, and `ladderRows`' isApplied.
5. **Money-format deltas recorded for G4:** card (panel + headline) uses `eur()` →
   `6,50€`; the drawer (T06) uses `formatMoney` → `6,5 €` (NBSP). Two adjacent
   formats — deliberate, both pre-existing conventions of their surfaces; unify
   later if Muskan wants.
6. **Bridge fields:** `bundle_threshold_grams`/`bundle_price_per_gram` STAY on
   `ShopProduct` (write-only after this ticket; dropped with migration C/T08).
7. **ADR §5's bubble↔resolver regression invariant is discharged by** a unit test
   asserting: for a product+tiers, the array the card renders and the array
   ShopView resolves indices against are the SAME `packSizes()` output, and
   `sizes[i].grams` at the rung index resolves to that rung via `resolveTierPrice`
   (index-integrity test in `ladderPanel.test.ts`).
8. **e2e assertions pinned:** drawer price asserted as `6,5` + NBSP + `€` (formatMoney
   output); drawer has no testids — locate the drawer panel by its visible
   structure/text (`getByText` on the product name within the opened drawer, then
   the price string in its row container). The prototype's grams-note on the CARD
   is NOT built (the drawer's own note from T06 covers it) — recorded.
