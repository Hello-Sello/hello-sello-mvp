# 0021 · tier-ladder — tickets

**Source:** ADR-0004 (rev 8) + PRD 0021. Sized S/M/XS, INVEST-checked, EARS criteria.
**Hard rule:** tickets running in parallel touch different files.

---

## T01 — Migration E (expand) · **M** · depends on: —

The new table + all rituals + three doors + view + backfill + both RPC re-declares +
types regen + one seeded bracket row. Everything in ADR §1–§3 E-steps 0–5.
**Files:** `supabase/migrations/<ts>_tier_ladder_expand.sql`, `supabase/seed/seed.sql`,
`src/types/database.types.ts`, `supabase/tests/cross_tenant_lockdown_test.sql`, pgTAP.

- When migration E runs on a fresh `db reset`, the system shall create
  `pricelist_item_tier` with RLS enabled, both policies, anon revoked, trigger attached.
- When a `pricelist_item` row has a well-formed bundle bracket, the backfill shall
  create exactly one rung and criterion-8 data survives; malformed brackets shall land
  in `metadata.legacy_bundle` with a NOTICE count, never as rungs.
- When `get_discoverable_shop` is called by a verified user post-E, it shall return
  BOTH legacy bundle fields and `tiers`, with anon/PUBLIC execute revoked (pgTAP).
- When an anon request selects the table or the view, it shall be denied (lockdown test).
- When two `save_price_ladder` calls race on one item, the system shall serialize them
  (parent `FOR UPDATE` first statement) and the survivor's ladder shall be intact.

## T02 — Resolver + packSizes (pure functions) · **S** · depends on: —

**Files:** `src/modules/catalog/pricing.ts` + unit tests. Nothing else.

- When quantity×units (normalized: kg×1000, other units as-is) reaches a rung's
  `min_grams`, `resolveTierPrice` shall return that rung's price and `appliedMin`.
- When base is null, it shall return `{pricePerGram: null, appliedMin: null}`.
- When quantity is null or below every rung, it shall return base with `appliedMin: null`.
- When `packSizes(product, tiers)` is called, every rung shall emit a `{grams, label}`
  entry, ordered, deduped against pack sizes.
- Agreement test: resolver ↔ `lineValueOf` across `g`, `kg`, `mL`, `pack`.

## T03 — Single-owner reads: `pricelist.ts` + reader migration · **M** · depends on: T01, T02

**Files:** `src/modules/catalog/pricelist.ts` (new), `src/modules/catalog/index.client.ts`
(new), `src/modules/catalog/shop.ts`, `src/modules/catalog/manage.ts` (row-lookup only),
`src/modules/deals/supabase/reads.ts`, `src/modules/basket/supabase/reads.ts`,
`src/modules/basket/types.ts`, `src/README.md` (two-door line), grep-guard test.

- When any surface reads a product's price, it shall go through
  `current_pricelist_item` via `catalog/pricelist.ts` (grep-guard over `src/**` green).
- When `writeStandardPrice` looks up the row to update, it shall use the canonical rule
  (via `pricelist.ts`), then write the base table by id.
- When a basket line loads, `BasketLine` shall carry `tiers[]`.
- When the trigger rejects a base edit, `pricelist.ts` shall surface a clear message,
  not raw Postgres text.

## T04 — Seller tier editor · **M** · depends on: T03

**Files:** `src/modules/catalog/components/ProductCard.tsx` (edit mode),
`src/modules/catalog/manage.ts` (ladder save action → `save_price_ladder`).

- When the seller opens edit mode on a priced product, the card shall show its rungs as
  editable "from N g → €/g" rows (lot-row styling) under the base price.
- When 3 rungs exist, "+ Add tier" shall be disabled.
- When a rung's minimum is ≤ the previous rung's, the row shall mark invalid and Save
  shall be disabled (UX mirror; DB trigger is the enforcement).
- When the seller saves, all rungs + base shall persist atomically via
  `save_price_ladder` and reopening shall show them (criteria 1–2).

## T05 — Buyer "See all prices" panel (Variant B) · **M** · depends on: T04 *(same file)*

**Files:** `src/modules/catalog/components/ProductCard.tsx` (read mode),
`src/app/present/ShopView.tsx` (packSizes consumption + index fix).

- When a product has rungs and its price is public, the card shall show a "See all
  prices" reveal listing base + every rung with per-gram price and % saving (Variant B
  prototype = the visual contract).
- When the buyer picks a rung via Choose, the quantity shall pre-fill to reach it
  (criterion 3, 5a-entry) through the `packSizes` index — never a parsed label.
- When the price is hidden, the card shall show no prices and no reveal (criterion 4).
- When the seller views their own saved card, they shall see the same reveal (rule 3a).

## T06 — Basket resolution + grams editor · **M** · depends on: T02, T03 *(parallel-safe with T04/T05: different files)*

**Files:** `src/modules/basket/components/BasketDrawer.tsx`,
`src/modules/basket/lib/toDraftLines.ts`, `src/modules/basket/lib/pack.ts` + tests.

- When a line's grams (`toGrams(packCount, packSizeGrams)`) reach a rung, the drawer
  shall display that rung's price and the line total at it (criterion 5).
- When the buyer edits the line's grams/pack size (decision A control), the price shall
  re-resolve automatically, up or down (criterion 5a).
- When the basket becomes a draft, `toDraftLines` shall write the resolved price into
  `unitPrice` — same grams, same resolver as the drawer display.

## T07 — Deal card: applied rung + hint (DEV-156) · **S** · depends on: T02, T03 · **⚠️ sync ritual first — Ayush's file**

**Files:** `src/modules/deals/components/CardFront.tsx`.

- When a catalog line is added, it shall resolve with quantity × max(1, units),
  normalized by unit — same number the billing math uses.
- When a draft line's quantity changes such that a different rung qualifies, the card
  shall show a hint — and clicking it shall enqueue a held change via the existing
  propose/accept flow, disabled while a change is pending (criterion 6a; ADR-0001/2).
- When a deal is signed and the seller later edits the ladder, the deal's numbers shall
  not move (criterion 7 — snapshot; verify, don't build).

## T08 — Migration C (contract, HELD) + doc drift · **S** · depends on: T01–T07 **deployed and live**

**Files:** `docs/muskan-build/0021-tier-ladder/contract-migration.sql.hold` (authored;
moved into `supabase/migrations/` with fresh timestamp ONLY after the tiers deploy is
verified live), `docs/deploy/cloud-migrations-pending.md` (two entries, C marked HELD),
`SCHEMA.md`, `SCHEMA-DRAFT.md`, `data-model.html`, `catalogue-ingestion-DESIGN.md`,
`CONTEXT.md` (vocab), `DECISIONS.md` (dated amendment), repair of `20260618120100`'s
missing anon revoke, `buy_schema` orphan repair (E precondition, verify done).

- When C runs (post-deploy only), the two bundle columns shall be gone, both RPCs
  tiers-only, view re-created + re-granted, types regenerated.
- When the docs are read after C, no document shall present the bundle columns as the
  current price home.

---

**Parallel lanes:** T01 ∥ T02 → T03 → (T04 → T05) ∥ T06 ∥ T07 → T08.
