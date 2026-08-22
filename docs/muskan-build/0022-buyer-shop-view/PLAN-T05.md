# PLAN-T05 — `get_discoverable_shop` gains the specification set (HEL-59) · rev 1

Slug 0022 · lane FULL · branch `claude/muskan/work` (frozen at `a8c3acd`, 0 behind `origin/dev`).

## What this ticket is

AC 7's full specification set, plus `product.location` (which is what produces the
location tabs), served through the ONE read door. No new door — `ARCHITECTURE-NOTES.md:423`.

## Files

| file | change |
|---|---|
| `supabase/migrations/20260822090000_discoverable_shop_spec_columns.sql` | DROP + CREATE the RPC with 11 new OUT columns + the owner arm; re-issue the 3-statement grant ritual |
| `src/app/discover/companies.ts` | `ShopRow` from the generated type (not hand-typed); `mapDiscoverShopRow` fills what is now returned |
| `src/types/database.types.ts` | regenerate — **guarded**, see the hazard below |
| `supabase/tests/discoverable_shop_spec_columns_test.sql` + `run_…sh` | new SQL suite |
| `src/app/discover/companies.spec-columns.test.ts` | mapper unit tests, incl. the shared `price_public` guard the ticket mandates |

## ⚠️ Carried hazard — `database.types.ts` is NOT reproducible

`update_deal_draft`'s four `Args` carry an undocumented hand-edit (`| null`, `:5010,5013-5015`)
that `supabase gen types` does not emit; `src/modules/deals/actions.ts:275-279` depends on it.
**After regenerating: `git diff -U0 src/types/database.types.ts` and confirm the only hunks are
`get_discoverable_shop`'s.** Any other hunk is pre-existing drift to surface, not a ride-along.
T01 hit this and reverted the `update_deal_draft` hunk by hand.

## Invariants — enumerated by walking the live body clause by clause (L-011)

Source: `20260816190000_tier_ladder_contract.sql:82-154`, the latest definition. Not from the
ticket's risk narrative — L-011 is exactly the failure of doing that.

| # | clause | must survive |
|---|---|---|
| I1 | `join company c on c.id = p.company_id` | the row's own company |
| I2 | **`and c.id = p_company_id`** | **the primary filter.** Lose it and a `SECURITY DEFINER` function grouped on nothing returns every verified company's catalogue to any verified caller |
| I3 | `and c.deleted_at is null` | soft-deleted company invisible |
| I4 | `and c.verification_status = 'verified'` | unverified seller invisible |
| I5 | `left join lateral … imgs` — **LEFT** | a product with no images still returns, `images = []` |
| I6 | image `order by pi.position` inside `jsonb_agg` | gallery order |
| I7 | `coalesce(imgs.images, '[]'::jsonb)` | never null |
| I8 | `left join current_pricelist_item v` — **LEFT** | an unpriced product still returns |
| I9 | `case when p.price_public then …` on BOTH `price_per_gram` and `tiers` | price stays hidden |
| I10 | `p.price_public` forwarded verbatim | "on request" vs "not set yet"; T02's criterion |
| I11 | `p.deleted_at is null` | soft-deleted product invisible |
| I12 | `p.profile_visible = true` | **modified by the owner arm below — the only visibility change in this ticket** |
| I13 | `visibility_start` / `visibility_end` window | see the owner-arm question |
| I14 | `public.is_caller_verified()` | Bouncer |
| I15 | `order by p.name` | stable card order |
| I16 | `language sql` · `stable` · `security definer` · `set search_path to ''` | all four |
| I17 | the 3-statement grant ritual (`revoke all from public` · `grant execute to authenticated` · `revoke execute from anon`) | a 2-statement copy is how `20260618120100` reopened the anon door |
| I18 | `supplier_product_code` **absent** from the OUT list | G3 confidentiality |

Test of the tests: *would any planned check notice if this vanished?* I2 and I8 both need a
check that does not exist today — added below.

## Decisions this plan takes (flagged for the checker)

**D1 · Where the owner arm attaches.** The ticket says the seller's own member gets "their whole
catalogue"; `Locked` says site 7 gains `or p.company_id = public.current_company_id()`. I attach it
to I12 **and** I13 together — both are shelf-presentation state — as
`and (p.profile_visible = true or p.company_id = public.current_company_id())`
`and (p.company_id = public.current_company_id() or (window predicates))`.
I do **not** attach it to I3/I4 (target-company verification) or I14 (the caller's own Bouncer):
those are not "catalogue" state. *Checker: is the window in or out?*

**D2 · Terpene derivation, matching `shop.ts:249` exactly.** `coalesce(p.terpene_percent, derived)`,
where derived sums the **representative** batch's terpene rows. Representative =
`order by ready_for_sale_date desc nulls last, created_at desc limit 1` over batches with
`deleted_at is null` (`shop.ts:214` excludes soft-deleted lots from the Terp% pick — dropping that
filter is a silent divergence). Sum is `sum(coalesce(bt.percent, 0))` rounded to 2dp, which
reproduces the TS exactly at both edges: zero terpene rows → SQL `sum` over no rows is NULL and TS
returns `null`; rows present with NULL percents → both give `0`.

**D3 · Pack sizes project `p.metadata -> 'pack_sizes'` ONLY.** Never the whole `metadata` object —
it carries the seller's private note. This is a criterion, and it is also the kind of thing a
"just forward metadata" simplification would quietly undo.

**D4 · `ShopRow` stops being hand-typed.** Today `getDiscoverableShop` casts through
`as unknown as { data: ShopRow[] … }` twelve lines below a comment forbidding exactly that. T05
rewrites the RPC's shape, so a renamed column would arrive as `undefined` with `tsc` green. Source
it from `Database["public"]["Functions"]["get_discoverable_shop"]["Returns"][number]`.

**D5 · No batches, no media, no lot list** — the ticket says so explicitly. `batches: []`,
`media: []` stay. The buyer's card shows specs, not inventory.

## Steps, in runnable order

1. **Migration.** DROP + CREATE with the 11 new OUT columns (`cbg_percent`, `cbn_percent`,
   `terpene_percent`, `cultivator`, `lineage_parent_a`, `lineage_parent_b`, `irradiation_code`,
   `packaging_material`, `resealable`, `location`, `pack_sizes`), `::text` casts on every
   `varchar` (the existing body's pattern), the two lateral joins, the owner arm, then I17 verbatim.
2. **Regenerate `database.types.ts`**, then run the hazard guard above.
3. **`companies.ts`**: `ShopRow` from the generated type (D4); mapper fills the new fields;
   `price_public` still forwarded verbatim; `supplier_product_code` still `null`.
4. **SQL suite.** See the data note below — it PLANTS its rows.
5. **Mapper unit test**, including the shared `price_public` guard.
6. Run: the new runner, `run_present_shop_*` neighbours, `tsc`, unit, then `discover-shop.spec.ts`.

## Data note — the seed cannot support these assertions (L-012)

Measured on a clean reset, not assumed:

- Of AC 7's columns, the seed populates **`cultivator` and `location` only**. `cbg_percent`,
  `cbn_percent`, `terpene_percent`, `lineage_parent_a/b`, `irradiation_code`,
  `packaging_material`, `resealable`, `metadata->'pack_sizes'` are **NULL on all six** GreenLeaf
  products.
- **`batch_terpene` is empty repo-wide (0 rows).** The derived-terpene fallback has no data at
  all. AUR-1A..1D have 2 live batches each; AUR-1E/1F have none.

So "returns the spec set as seeded" is unsatisfiable, and worse, a **transposition is invisible**
(NULL = NULL) — the commonest projection bug in a 11-column widening, and the one this ticket is
most exposed to. The suite therefore **plants its own row per column with a DISTINCT sentinel**
inside a rolled-back transaction: distinct values are the whole point, since identical ones pass a
transposition. `location` keeps its seeded values — `discover-shop.spec.ts` and the matrix suite
both assert `count(distinct location) = 2` across GreenLeaf, so the suite must not disturb it.

## Test surface

**SQL** (`discoverable_shop_spec_columns_test.sql`, in a transaction, rolled back):

1. **Sentinels** — plant distinct values in all 11 columns on one product; assert each comes back
   on the right column. This is the transposition guard.
2. **`terpene_percent` manual wins** — plant a manual value AND terpene rows that sum differently;
   assert the manual value.
3. **`terpene_percent` fallback** — no manual value, plant two batches with different
   `ready_for_sale_date` and different terpene sums; assert the sum of the LATER one (proves the
   representative pick, not just "some batch").
4. **Soft-deleted lot ignored** — soft-delete the representative batch; assert the value falls back
   to the other one (`shop.ts:214`).
5. **`pack_sizes` only** — plant `metadata` carrying BOTH `pack_sizes` and a private note; assert
   the note appears nowhere in the returned row.
6. **`supplier_product_code` absent** — assert the OUT column list does not contain it (I18).
7. **Owner arm** — a member of the seller's own company sees a `profile_visible = false` product;
   a verified non-owner does not (I12).
8. **I2 guard, which does not exist today** — a second verified company's products must NOT appear
   in the result for `p_company_id`. Lose the primary filter and every other test still passes.
9. **I8 guard, which does not exist today** — a product with no `current_pricelist_item` row still
   returns (LEFT), with null price.
10. **Grants** — `anon` has no EXECUTE; `authenticated` does (I17).

**Unit** (`companies.spec-columns.test.ts`): the mapper fills each new field from the row;
`supplier_product_code` stays null; `batches`/`media` stay empty; **`price_public` forwarded
verbatim for both `true` and `false`** — the durable cross-ticket guard T05's own criterion asks
for, since T05 could silently undo T02's forward with every T02 test still green.

## Out of scope — must not be built

- `is_connected_to_company` and the connection override — **T06**. It does not exist in the DB yet;
  referencing it here would not even compile the migration.
- The verification tightening on `product_public_select` — T06, and it is the G3-signed one.
- Any second read path for this data (`ARCHITECTURE-NOTES.md:423`).
- Batch/lot lists on the buyer card (D5).
