# PLAN T04 — Seller tier editor

**Ticket:** HEL-49 · TICKETS.md T04 · **ADR:** 0004 §5 · **Visual contract:** the
prototype's `footerEdit` (index.html:378-408). Depends: T03 ✅.

## Design call (surfaced for G4): ladder edits join the pending-draft flow

The prototype mocks a dedicated Save inside the tier editor. The real card's locked
contract is the opposite: *"edit mode writes NOTHING — everything reports up"*
(ProductCard.tsx:10-15), one pink Save in ShopView flushes `pendingProductEdits`,
and the e2e observes `data-dirty` + `save-changes-btn`. Ladder edits follow the
card's contract, not the mock's convenience: rows edit into the draft, the ONE Save
flushes them — atomically per product via the one `save_price_ladder` RPC (EARS 4
holds). The prototype's per-editor Save + "✓ Saved" flash are dropped; the existing
save flow is the feedback. **Recorded as a prototype deviation for the G4 visual walk.**

## Files

| File | Action |
|---|---|
| `src/modules/catalog/ladderDraft.ts` | NEW — pure draft/validation logic (the testable core) |
| `src/modules/catalog/ladderDraft.test.ts` | NEW — validation matrix |
| `src/modules/catalog/components/ProductCard.tsx` | EDIT — edit-mode tier editor UI |
| `src/modules/catalog/components/ProductCard.tiers.test.tsx` | NEW — renderToStaticMarkup contract |
| `src/modules/catalog/manage.ts` | EDIT — `saveLadder` server action |
| `src/modules/catalog/manage.ladder.test.ts` | NEW — action test (vi.mock pattern, `basket/actions.test.ts` shape) |
| `src/app/present/ShopView.tsx` | EDIT — draft plumbing + flush routing + save-disable *(amendment: TICKETS lists ShopView under T05, but the flush loop lives here and T04→T05 are strictly sequential — no parallel collision; recorded)* |
| `e2e/present-card-edit.spec.ts` | EDIT — tier-save round-trip case |

## `ladderDraft.ts` — the pure core (repo pattern: logic out of components)

```ts
export interface LadderRowDraft { min: string; price: string }   // raw input strings
export interface LadderValidation {
  rows: { minInvalid: boolean; priceInvalid: boolean; message: string | null }[];
  canSave: boolean;
}
export function draftFromTiers(tiers: PriceTier[]): LadderRowDraft[]
export function tiersFromDraft(rows: LadderRowDraft[]): PriceTier[]  // blank rows dropped, Number()ed, sorted asc by min
export function validateLadder(rows: LadderRowDraft[], base: number | null): LadderValidation
```

Validation = the full UX mirror of the DB trigger (ADR §5):
- min not a positive number → row invalid
- min ≤ previous row's min → invalid, message exactly
  `Must be higher than the tier above ({prev}g)` (prototype :400)
- price not positive → invalid
- price ≥ base (when base non-null) → invalid, `Must be below the base price`
- price ≥ previous row's price → invalid, `Must be below the tier above`
- `canSave` = no invalid rows. Empty draft (0 rows) → canSave true (a ladder may be
  cleared). Blank-but-not-yet-typed rows (`{min:'',price:''}`) don't invalidate
  until non-empty (typing UX), but a blank row among filled ones is dropped at save
  (prototype `saveTiers` semantics).

## ProductCard edit-mode UI (prototype `footerEdit`, adapted to draft flow)

In the footer, below the price/Show-price block, when `editing`:
- Header `Volume price tiers` + `(max 3)` (10px uppercase muted — match the
  BatchEditor header register).
- One row per draft rung: `from` · min input · `g →` · price input · `€/g` · ✕
  remove — inputs styled with the existing `lotField` classes (804-805), row
  container per LotRow (`rounded-lg bg-white/70 p-1` family, prototype :393-399).
  Invalid row: red border/bg on the offending input + the red 10px message line under
  it. aria-labels: `Tier {i} minimum grams`, `Tier {i} price per gram`,
  `Remove tier {i}` (e2e handles).
- `+ Add tier` button (dashed brand border) — `disabled` when 3 rows; adjacent note
  `ladder is full` when disabled (prototype :401-402).
- Draft state lives in `ProductFieldDraft`: new optional field
  `tiers?: LadderRowDraft[]` (undefined = untouched → flush skips ladder). Rows
  initialize from `p.tiers` via `draftFromTiers` on first edit interaction
  (same lazy-init pattern the other draft fields use via `numVal`/`nameVal`).
- All changes report up through the existing `onEditField(p.id, { tiers: rows })`.

Read-mode footer: UNTOUCHED (T05).

## `manage.ts` — `saveLadder` action

```ts
export async function saveLadder(
  productId: string, base: number | null, tiers: PriceTier[],
): Promise<ManageResult>
```
Shape = `addProductBatch` (auth via `getCurrentCompanyId()`, validate, act,
`revalidatePath("/present")`). Body:
1. Validate: base must be a finite number ≥ 0 when tiers exist (the RPC/trigger is
   the enforcement; this is the friendly gate); tiers re-checked through
   `validateLadder` server-side (defense in depth — the client mirror can be bypassed).
2. `lookupStandardPriceRow(supabase, productId)` → item id. If null AND base != null:
   create the row via the existing `writeStandardPrice` path (extract its
   create-branch into a small private helper both callers use — no duplication),
   then re-lookup. If null and base null → `{ error: "Set a base price first." }`.
3. `savePriceLadder(supabase, itemId, base, tiers)` (module-internal import — the
   client door deliberately doesn't export it) → maps trigger errors via
   `ladderErrorMessage` already.

## ShopView wiring

- `toFieldPatch` passes `tiers` through (typed, via `tiersFromDraft`).
- Flush loop (418-444): per product — if the draft contains `tiers`, call
  `saveLadder(productId, base, tiers)` where base = the drafted price if present
  else the product's current `price_per_gram`; and SKIP `writeStandardPrice` for
  that product (one atomic write path, no double base write). Products without
  ladder edits keep today's path untouched.
- Save button disable (EARS 3): compute `validateLadder` over every drafted ladder;
  any `!canSave` → `save-changes-btn` disabled (+ the existing error line shows
  "Fix the highlighted price tiers first."). `data-dirty` behavior unchanged.

## Tests

- `ladderDraft.test.ts`: the matrix — ascending-min violations (message text
  pinned incl. `{prev}g`), price ≥ base, price ≥ previous, blank-row tolerance,
  round-trip `draftFromTiers`↔`tiersFromDraft` (sort + drop blanks), canSave.
- `ProductCard.tiers.test.tsx` (renderToStaticMarkup, initial-render contract —
  draft comes in as a PROP, so "3 rows → + Add tier disabled + ladder is full" and
  "invalid draft → red message text present" are first-paint assertable):
  - editing + draft of 3 rows → 3 `from` rows in HTML, `+ Add tier` disabled,
    `ladder is full` present
  - editing + invalid draft (min 500 then 400) → `Must be higher than the tier
    above (500g)` present
  - editing + no ladder → header + `+ Add tier` enabled, zero rows
  - NOT editing → no tier editor markup
- `manage.ladder.test.ts` (vi.mock `@/shared/db/server` + `./pricelist` per
  `basket/actions.test.ts`): no-company → error; lookup null + base null → "Set a
  base price first."; lookup null + base → create-then-save called; happy path
  passes exact args to `savePriceLadder`; server-side validateLadder rejects an
  out-of-order payload without calling the RPC.
- e2e (`present-card-edit.spec.ts`, serial section): manage shop → AUR-1B (no
  rungs) → add 2 tiers (500→5, 1000→4.5 under base 6) → Save → reload → edit mode
  → both rows present with values (EARS 1+4). Invalid case: set second min 400 →
  red message visible + Save disabled → fix → Save enabled. AUR-1A (seeded 1 rung):
  rows pre-populated from live data.

## Gate
vitest full · tsc · eslint touched · guard test stays green (no `pricelist_item(`
strings added — watch comments) · e2e file runs green locally (`npx playwright test
e2e/present-card-edit.spec.ts`) · `db reset` before e2e for a clean seed.

## Out of scope
Read-mode reveal + packSizes swap (T05) · basket (T06) · deal card (T07) ·
Discover tile · any SQL.

## AMENDMENTS (plan-checker round — these OVERRIDE anything above)

1. **`src/app/present/SaveBar.tsx` added to the file list.** The pink Save lives
   there (:66), not in ShopView. It gains a new prop (`invalid?: string | null` —
   when set, Save alone is disabled with the message shown; Exit and "+ Add
   products" stay usable — do NOT reuse `busy`).
2. **Flush routing, precisely:** in ShopView's flush loop, when `d.fields.tiers`
   is present for a product: (a) STRIP `price_per_gram` from that product's
   `fieldPatch` before calling `updateProductFields` (else double base write, and
   the lone base write can trip the trigger against old rungs); (b) after
   `updateProductFields`, call `saveLadder(productId, base, tiersFromDraft(rows))`
   where base = drafted price if present else `p.price_per_gram`. `tiers` is read
   STRAIGHT from the draft — it never enters `toFieldPatch`/`ProductFieldPatch`
   (no manage.ts type change).
3. **`ladderDraft.ts` gains a numeric-shape validator** `validateTiers(tiers:
   PriceTier[], base: number | null): string | null` (first error or null) —
   `saveLadder` uses THIS server-side; `validateLadder` (string drafts) stays the
   UI mirror. Shared descent/undercut logic factored internally, not duplicated.
4. `saveLadder`: empty tiers + no existing price row → `{ ok: true }` no-op (never
   fail a Save for clearing a ladder on an unpriced product).
5. The extracted create-row helper MUST re-lookup via `lookupStandardPriceRow` —
   never `.insert(...).select("id")` on pricelist_item (trips the grep-guard).
6. Card rows resolve as `fields.tiers ?? draftFromTiers(p.tiers)` (the
   `numVal`/`nameVal` lazy pattern); every keystroke reports the FULL array
   (shallow-merge safe).
7. Invalid styling = the whole `.tier-line` row reds (prototype :393), not just
   the input. `+ Add tier` disables at `rows.length >= 3` (advisory cap: a direct
   4th rung still renders, Add stays dead).
8. e2e: locate AUR-1B's card by product name text, not `.first()`; aria-labels are
   1-based (`Tier 1 minimum grams`).
9. `ladderDraft.ts` imports `PriceTier` from `./pricing` (sibling), not the barrel.
10. **G4 deviations ledger (complete):** per-editor Save dropped (draft flow);
    "✓ Saved" flash dropped (existing save feedback); whole-row red kept; one
    invalid ladder blocks the WHOLE shop Save (with message) — no scroll-to-offender.
