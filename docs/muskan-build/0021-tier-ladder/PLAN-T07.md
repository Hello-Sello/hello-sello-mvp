# PLAN T07 — Deal card: applied rung + hint (DEV-156)

**Ticket:** HEL-52 · TICKETS.md T07 · **ADR:** 0004 §4 (decision B) · Depends: T02 ✅
T03 ✅ · **⚠️ Ayush's file — sync lock on `CardFront.tsx` taken 2026-08-14 (pushed).**
Parallel-safe with T04/T05/T06 (disjoint files).

**ADR line-number errata:** the ADR cites `CardFront.tsx:375-393`/`141`; on this
branch the anchors are `lineFromCatalog` :465-484 and `lineTotalOf` :182-185.

## Files

| File | Action |
|---|---|
| `src/modules/deals/lib/tierHint.ts` | NEW — pure hint/chip logic *(amendment: TICKETS lists CardFront only; the repo's own precedent is `draftEdit.ts` — "pure logic extracted so the matrix is unit-testable"; no parallel ticket owns deals/lib)* |
| `src/modules/deals/lib/tierHint.test.ts` | NEW |
| `src/modules/deals/components/CardFront.tsx` | EDIT — minimal, precise (Ayush's file) |

## `tierHint.ts` — the pure core

```ts
export interface TierState {
  appliedMin: number | null;        // rung the CURRENT price+quantity sits on, by price match
  suggestedPricePerGram: number | null;  // resolved price for current grams, if ≠ line price
  suggestedMin: number | null;           // its rung (null = base)
}
export function tierStateFor(
  unitPrice: number | null, tiers: PriceTier[],
  quantity: number, unit: string, units: number,
): TierState
```

- Billed grams = `quantity × max(1, units)`, normalized inside `resolveTierPrice`
  (kg×1000 else as-is) — EARS bullet 1's exact number, the same one `lineTotalOf`
  bills (resolver↔`lineValueOf` agreement is already pinned by T02's suite; a T07
  test asserts the CARD passes quantity×units, not re-testing the resolver).
- `appliedMin`: the rung whose price equals the line's current `unitPrice` (price
  match against the resolved ladder) — powers the chip. Base-priced → null.
- `suggested*`: `resolveTierPrice(unitPrice-as-base? NO —` the line's price may
  already be a rung price. Resolution needs the BASE. So the signature takes the
  base separately:

```ts
export function tierStateFor(
  basePricePerGram: number | null,   // from the catalog product (tiers' base)
  tiers: PriceTier[],
  currentUnitPrice: number | null,   // what the line carries now
  quantity: number, unit: string, units: number,
): TierState
```
  `resolved = resolveTierPrice(base, tiers, quantity × max(1,units), unit)`;
  `suggested = resolved.pricePerGram !== currentUnitPrice ? resolved : null`.
  Null base or empty tiers → all-null (no hint, no chip). Tolerant float compare
  (`Math.abs(a-b) < 1e-9`).

## CardFront edits (each one small, all seller+edit gated like the code around them)

1. **`EditLine` gains two fields:** `tiers: PriceTier[]` and `basePricePerGram:
   number | null` — frontend-only, **never enter the payload** (same discipline and
   docstring register as `units`; `toDraftLine` untouched).
2. **`lineFromCatalog`** (EARS 1): seed `tiers: p.tiers`, `basePricePerGram:
   p.unitPrice`, and `unitPrice` = `resolveTierPrice(p.unitPrice, p.tiers,
   (p.packSizeGrams ?? 1) × 1, p.unit).pricePerGram` — a catalog add lands already
   resolved at its seed quantity. (`swapProduct` inherits via `lineFromCatalog`.)
3. **Back-fill for seeded lines** (edit mode only): where the catalog is already
   fetched (`editMode && isSeller`), derive per-line `tiers`/`base` by
   `catalog.find(c => c.id === l.productId)` at render — NOT stored back into
   state, and **never touching `unitPrice`** (criterion 7: seeded prices are the
   snapshot; only explicit user action reprices).
4. **Applied-rung chip** (edit row price cell + read row price label, when tier
   state is known): `from {min}g applied` — `dc-badge-change`-family styling
   (`--dc-green`), matching T06's basket chip wording. Base with tiers → muted
   `base price` chip. No tiers/base unknown (e.g. read mode where catalog isn't
   fetched) → no chip, silently.
5. **The hint** (EARS 2): in the open edit row, under the price input, when
   `suggested != null`: a small green pill-button
   `Qualifies for €{suggested}/g — apply` (aria-label `Apply tier price`).
   Click = ONE action: `const next = withPrice(lines, l.key, suggested);
   setLines(next); doSendChange({ linesOverride: next });` — which rides the
   existing funnel: `resendAction` routes it (unsent → draft-update; live →
   propose/replace), so it IS "enqueue a held change via the existing
   propose/accept flow", never a direct write.
   - `doSendChange` gains an optional `linesOverride?: EditLine[]` (reads
     `linesOverride ?? lines` — fixes the stale-state trap; zero behavior change
     for existing callers).
   - Disabled (rendered inert with `disabled` + muted style + title
     `A change is already pending`) when `data.pendingChange != null` — the
     literal EARS reading; stricter than `path === "blocked"` on purpose.
6. **Snapshot rule — verify only** (EARS 3): no code. Verified structurally:
   existing lines read `deal_line_item.unit_price` at `card.version`
   (reads.ts:660-671); catalog fetch is `editMode && isSeller` gated; back-fill
   (edit 3) never writes `unitPrice`. Recorded in REVIEW.md as the verification.

## Tests

- `tierHint.test.ts`: quantity×units math (500g × 2 units → 1000-rung suggested);
  kg unit; suggested null when price already resolved; appliedMin by price match;
  null base → all null; empty tiers → all null; float tolerance.
- e2e: none (CardFront has no component test — 1500-line client component; the
  hint's interaction is covered at the G4 visual walk + G5 live walk; repo
  precedent: PasswordField doctrine).

## Gate
vitest full · tsc · eslint touched · guard green.
**After commit: release the CardFront.tsx sync lock (worktree → sync file → push).**

## Out of scope
`MOCK_SIZES` → `packSizes()` swap (beyond ticket criteria — noted as follow-up) ·
buyer-side anything (D-12: price is seller-only) · read-mode chip for lines whose
tiers are unknown · toDraftLine/payload shape · any SQL.

## AMENDMENTS (plan-checker round — these OVERRIDE anything above)

1. **Hint gated on `units === 1`.** `units` is frontend-only and never enters the
   payload — a hint resolved on quantity×units>1 would propose a 1000g-rung price
   on a 500g payload line, mispricing the counterparty's view. With units > 1: no
   hint (chip may still show). `tierStateFor` keeps the units param for the
   RESOLUTION math used at add-time (EARS 1, where units is always 1); the HINT
   consumer applies the gate. Record in the file's comment why.
2. **`TierState` gains a third state:** `{ appliedMin: number | null; matchesLadder:
   boolean; suggested… }` — chip renders ONLY when `matchesLadder` (price equals a
   rung, or equals base). A negotiated off-ladder price → no chip, no "base price"
   mislabel.
3. **`linesOverride` threads through EVERY `lines` read in `doSendChange`:** the
   :613 length guard, :640 `workingLines` (the no-change early-out — miss this and
   the hint click dies in "Nothing to send yet"), :674 payload. `rewriteDraftLinePrivate`
   (:580/:594) deliberately untouched (index + ownInput only) — note it in code.
4. **Over-trigger declared:** the hint also fires when the price is stale at
   unchanged quantity (suggested ≠ current for any reason). Intentional — the hint
   proposes today's terms; EARS 2 is a "when…shall", not "only-when". Recorded for G4.
5. `tierHint.ts` imports `resolveTierPrice` from `@/modules/catalog/index.client`
   (the door), never `catalog/pricing` deep.
