# PLAN-T05 — `get_discoverable_shop` gains the specification set (HEL-59) · rev 3

> rev 2 folded `plan-checker` round 1 (7 blocking, all spot-verified; three were defects I
> authored). **rev 3 folds round 2** — 9 blocking, every one inside rev 2's own fold-ins, the
> fourth ticket on this slug to do that. Budget **2/2 SPENT, did NOT converge.**
>
> Round 2's headline (B1) was correct and killed a premise **I had given Muskan**: a buyer sees
> only ONE GreenLeaf location, because Montreal is exactly the hidden pair (AUR-1C/1D,
> `profile_visible = false`). Verified against the live DB. Six of the nine findings, however,
> were artifacts of MY framing D6 as a buyer-only rule. Muskan's correction: **the rule is
> general — one location, no filter; many locations, filter — for every user, not designed
> around GreenLeaf's seed.** That reframing is what rev 3 folds; see D6.

Slug 0022 · lane FULL · branch `claude/muskan/work` (frozen at `a8c3acd`, 0 behind `origin/dev`).

## What this ticket is

AC 7's full specification set, plus `product.location` (which is what produces the
location tabs), served through the ONE read door. No new door — `ARCHITECTURE-NOTES.md:423`.

## Files

| file | change |
|---|---|
| `supabase/migrations/20260822090000_discoverable_shop_spec_columns.sql` | DROP + CREATE the RPC with **12** new OUT columns (11 spec + `media`) + the owner arm; re-issue the 3-statement grant ritual |
| `src/app/discover/companies.ts` | `ShopRow` from the generated type (not hand-typed); `mapDiscoverShopRow` fills what is now returned |
| `src/types/database.types.ts` | regenerate — **guarded**, see the hazard below |
| `supabase/tests/discoverable_shop_spec_columns_test.sql` + `run_…sh` | new SQL suite |
| ~~`companies.spec-columns.test.ts`~~ | **(N7)** dropped — the mapper guard goes in `companies.test.ts`, which this ticket edits anyway. Splitting the contract across two files divides the guard the ticket calls *durable*. |
| `src/modules/catalog/shop.ts` | **(B8)** add `export` to `parsePackSizes` — one keyword, no behaviour change |
| `src/app/discover/companies.test.ts` | **(B5)** its `fullRow` literal (`:263`) gains the 11 new fields — **12** call sites become type errors otherwise (N1 — rev 2 said 7) |
| `e2e/discover-shop.spec.ts` | **(B3)** the location assertions at `:109-110` — pending adjudication |
| `src/app/present/ShopView.tsx` | **(B3)** two stale comments (`:680-684`, `:927-930`) that say "until T05" — pending adjudication |

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
**RULED (B2): the window stays OUT.** The arm attaches to I12 only:
```sql
and (p.profile_visible = true or p.company_id = public.current_company_id())
and (p.visibility_start is null or p.visibility_start <= current_date)
and (p.visibility_end   is null or p.visibility_end   >= current_date)
```
Evidence I missed: `supabase/tests/pricelist_item_tier_test.sql:344-356` expires a product and
asserts it drops out of `get_discoverable_shop('aaaa…')` — with caller `1111…` = **Alice, who is a
member of GreenLeaf, the target company** (verified against the live DB). That is exactly the cell
the owner arm opens, so the window-inclusive version turns that suite RED — and it is the **only**
check of I13 in the tree, so including the window would delete I13's sole guard while my own plan
claimed to audit for exactly that. It is also symmetric with T06's criterion *"when a product's
visibility window has expired, connection shall not override it"* (`TICKETS.md:238`), and the
window columns have no UI at all (STATE, Deferred), so nothing walkable is lost.

I do **not** attach it to I3/I4 or I14. **(N4)** The real reason for I14 is stronger than the one
I gave: I4 already gates on the **target** company, which in the owner case IS the caller's own
company, so excluding I14 is a genuine no-op rather than a judgement call. **Consequence (N2):** an owner
whose own company is unverified gets an EMPTY shop through this door — I4 excludes them regardless
of the owner arm. Existing behaviour, not a change, but it means the owner arm is observable only
for a verified company.

NULL logic of the arm (checked): `current_company_id()` is NULL for a companyless person, giving
`NULL OR true = true` and `NULL OR false = NULL` → row filtered. No half-filled-row hazard.

**D2 · Terpene derivation, matching `shop.ts:249` exactly.** `coalesce(p.terpene_percent, derived)`,
where derived sums the **representative** batch's terpene rows. Representative =
`order by ready_for_sale_date desc nulls last, created_at desc limit 1` over batches with
`deleted_at is null` (`shop.ts:214` excludes soft-deleted lots from the Terp% pick — dropping that
filter is a silent divergence). Sum is `sum(coalesce(bt.percent, 0))` rounded to 2dp, which
reproduces the TS exactly at both edges: zero terpene rows → SQL `sum` over no rows is NULL and TS
returns `null`; rows present with NULL percents → both give `0`.

**D3a · The mapper parses pack sizes with `parsePackSizes`, not a cast. (N1.)** ADR `:474-476`
requires the SAME parser as the seller so the two cannot disagree; it takes the metadata OBJECT
(`shop.ts:142-146`) and filters to finite `> 0` numbers. The RPC returns the array, so use the
wrapper idiom T01 already uses one function above — `parsePackSizes({ pack_sizes: r.pack_sizes })`,
exactly as `companies.ts:184` does `parseLinks({ links: r.links })`. Left unstated, a builder
writes `r.pack_sizes as number[]` and the filter silently vanishes.

**(B8) — it does not compile today.** `parseLinks` is exported (`shop.ts:131`); `parsePackSizes`
is **not** (`shop.ts:142`, module-private), and `src/modules/catalog/index.ts` re-exports shop.ts
as **types only**, so there is no value path either. This ticket adds the `export` keyword to
`parsePackSizes` — a shipped-file edit, now declared in Files. Without it the builder
re-implements the finite-and-positive filter, which ADR `:474-476` forbids.

**D3 · Pack sizes project `p.metadata -> 'pack_sizes'` ONLY.** Never the whole `metadata` object —
it carries the seller's private note. This is a criterion, and it is also the kind of thing a
"just forward metadata" simplification would quietly undo.

**D4 · `ShopRow` stops being hand-typed — via T01's re-widen pattern, not a bare generated type.
(B4, corrected.)** Today `getDiscoverableShop` casts through `as unknown as { data: ShopRow[] … }`
twelve lines below a comment forbidding exactly that. But a bare
`Database[…]["get_discoverable_shop"]["Returns"][number]` **does not compile**: the generator emits
`images: Json` and `.slice()` does not exist on `Json` (`companies.ts:285`), and it marks every
`RETURNS TABLE` column NOT NULL — a lie across 12 newly-nullable columns. Use the shape T01 already
built in this same file for the sibling RPC (`companies.ts:135-152`):
`Omit<RpcRow, …> & { …re-widened… }`, re-widening `images`, `tiers`, `pack_sizes`, `media` and every
nullable spec column. That file says verbatim: *"Do NOT collapse this back into an `as unknown as`
cast."*

**D5 · No batches, no lot list — but `media` IS returned. (B1, corrected.)** My rev 1 said "the
ticket says so explicitly" about media. **It does not.** The ticket says only *"no batch or lot
list"* (`TICKETS.md:191`). The ADR says the opposite twice: `:442` lists `media` as an **add**
("card-back Documents & Media; absent → the section renders empty"), and `:344` gives *"media rides
the RPC"* as T06's reason for leaving `product_media_public_select` untouched. Dropping media here
drops it from the slug and falsifies T06's premise. **The OUT list is 12 columns, not 11.**
`batches: []` still stays.

## Steps, in runnable order

1. **Migration.** DROP + CREATE with **12** new OUT columns — `cbg_percent`, `cbn_percent`,
   `terpene_percent`, `cultivator`, `lineage_parent_a`, `lineage_parent_b`, `irradiation_code`,
   `packaging_material`, `resealable`, `location`, `pack_sizes`, **`media`** — `::text` casts on
   every `varchar` (the existing body's pattern), the laterals, the owner arm, then I17 verbatim.
   **(B7)** rev 2 ruled media IN at D5 but left every operational section saying 11 and excluding
   it; a builder following those sections ships without media, every planned test green,
   falsifying T06's premise. **`media` row shape, previously unspecified anywhere:**
   `{id, kind, path, url, label}` ordered by `position`, matching `shop.ts:203-211` exactly, via a
   `left join lateral` over `product_media` mirroring the `imgs` lateral — LEFT, and
   `coalesce` to `[]` so absent media renders the card-back section empty (ADR `:442`).
2. **Regenerate `database.types.ts`**, then run the hazard guard above.
3. **`companies.ts`**: `ShopRow` from the generated type (D4); mapper fills the new fields;
   `price_public` still forwarded verbatim; `supplier_product_code` still `null`.
4. **SQL suite.** See the data note below — it PLANTS its rows.
5. **Mapper unit test**, including the shared `price_public` guard.
6. **(B6, corrected — `run_present_shop_*` does not exist; I invented it.)** Run: the new runner,
   then the two suites that actually exercise this RPC and are re-run gates for a DROP + CREATE —
   `supabase/tests/run_pricelist_item_tier_test.sh` (§5 tiers + the window) and
   `supabase/tests/run_cross_tenant_lockdown_test.sh` (`:94-95` anon EXECUTE = I17; `:114-116`
   unverified caller = I14; `:134` verified caller sees a non-empty shop) — then `tsc`, unit,
   then `discover-shop.spec.ts`.

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
3b. **(N4) Representative batch has NO terpene rows but an older batch does** -> the answer is
    **NULL**, not the older batch's sum. `shopMap.ts:45-51` derives from the representative batch
    alone and returns null when it carries no rows. This is the one shape a naive
    join-then-`limit 1` body gets **wrong** while planned tests 2, 3 and 4 all pass: pick the
    batch first, then sum that batch's rows.
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

11. **(N2) I5/I6/I7 have ZERO coverage repo-wide** (`grep -n 'images' supabase/tests/*.sql` is
    empty), as do I3, I11 and I15. This is a DROP + CREATE — all 18 invariants are being retyped,
    not only the modified ones. Test 1 covers I6/I7 nearly free by planting two images out of
    position on the sentinel product; add cheap assertions for I3, I11, I15 too.

**(N3) Alias hygiene, or `CREATE FUNCTION` fails.** The new OUT names `terpene_percent`,
`location`, `packaging_material` become visible identifiers inside a `language sql` body. The
existing body survives only because it qualifies every reference. Give the laterals non-colliding
aliases (never `as terpene_percent`) and qualify everything.

**(N6) Preserve-not-break:** `bundle_threshold_grams` / `bundle_price_per_gram` derive from
`tiers[0]` (`TICKETS.md:203`, satisfied at `companies.ts:314-315`, guarded at
`companies.test.ts:322-326`). This ticket rewrites both that mapper and that test file's type, so
it is a preserve item, not a no-op.

**Unit** (in `companies.test.ts`, N7): the mapper fills each new field from the row;
`supplier_product_code` stays null; **`batches` stays empty but `media` is now MAPPED (B7)**; **`price_public` forwarded
verbatim for both `true` and `false`** — the durable cross-ticket guard T05's own criterion asks
for, since T05 could silently undo T02's forward with every T02 test still green.

## Out of scope — must not be built

- `is_connected_to_company` and the connection override — **T06**. It does not exist in the DB yet;
  referencing it here would not even compile the migration.
- The verification tightening on `product_public_select` — T06, and it is the G3-signed one.
- Any second read path for this data (`ARCHITECTURE-NOTES.md:423`).
- Batch/lot lists on the buyer card (D5).


---

## D6 · The location filter — RULED by Muskan, restated general (rev 3)

**One rule for every viewer: a seller with ONE named location shows that location and no filter;
a seller with MANY shows the filter.** Not a buyer-mode rule — rev 2 framed it as one and that
framing generated six of round 2's nine blocking findings.

**This is the completion of logic already in the file, not a new feature.** `LocationTabs` ends
(`ShopView.tsx:927-930`) with *"a filter with one option filters nothing"* → `if (named.length === 0)
return null`. With one named location the options are `["All", "Toronto"]` — two entries returning
identical sets, so it still filters nothing. The guard becomes:

```ts
if (named.length <= 1) return null;
```

**What this dissolves from round 2:**
- **B3 (branch budget)** — not a new branch. It is a changed threshold on a conditional that
  already exists, so `STATE.md:104`'s "exactly one new branch" stays unspent. No fence break.
- **B4 (no mechanism)** — no discriminator is needed at all. The rule is uniform, so nothing
  buyer-specific reaches `LocationTabs` and no new prop exists to add.
- **B2 (no seed subject)** — a general rule does not need GreenLeaf to demonstrate it. Coverage
  comes from planted fixtures, below.
- **B6 (lone divider)** — not a defect but the rule working: a single-location seller renders
  `Toronto Warehouse · N` as a group heading under "All". That IS "just show that location".
- **B1 (unsatisfiable e2e)** — `e2e/discover-shop.spec.ts:109-110` now stays **exactly as
  shipped**. A buyer on GreenLeaf sees one location, so `location-menu-btn` is correctly absent,
  and `"Unassigned"` correctly absent. **T02's assertions are not edited.**

**The one case the rule does not cover — handled, not deferred (B5).** A seller with named
locations AND unfiled products yields an `Unassigned` group. A **seller** should see it (their
to-file pile); a **buyer** must not (shelf vocabulary, AC 11). The discriminator is
`viewerCanManage`, which `ShopView` already takes (`:212`) — no new prop. `showHeader`
(`:676-684`) is an existing conditional; it gains the `viewerCanManage` term. Unreachable on
today's seed (no GreenLeaf product has a NULL location), so it is covered by a **planted**
fixture, per L-012 — otherwise it is a rule with no guard.

**`/present` is affected too, deliberately** — a one-location seller loses a filter that filtered
nothing. Re-run `present-grid.spec.ts`, `present-manage.spec.ts`, `present-card-edit.spec.ts`.
`ShopView.tsx:680-684` and `:927-930` both say "until T05" and both become false — rewrite them to
state the ≤1 rule.

## D7 · The AC 7 render fixture — RULED (B7)

A **Playwright fixture in `e2e/discover-shop.spec.ts`** plants the spec values and asserts them on
the card back. Not the seed: `seed.sql` is T00's file, three other suites assert against it
(`seed_visibility_matrix_test.sql` among them), and changing it is cross-ticket. The fixture keeps
the change inside T05 and gives AC 7's *"shall show"* half the only test that actually renders it.

**(B9) Its testability contract, previously unstated.** e2e writes are **not** transactional
(`e2e/fixtures/local-supabase.ts` is service-role and bypasses RLS), so the fixture must:
target **AUR-1B** (visible, price public) by name; write ONLY the spec columns plus
`terpene_percent` **directly**, since `batch_terpene` is empty and the derived path is not
reachable from the UI; **never** touch `location`, `profile_visible` or `price_public`, all three
pinned by `seed_visibility_matrix_test.sql:109-139` and `discover-shop.spec.ts:191-192`, where a
leaked write fails suites this ticket does not run; restore what it wrote in an `afterEach`, the
teardown discipline `inbox-accept.spec.ts` now uses; and state how the card **back** is opened,
since that is where the spec set renders.

## Files — final

Adds to the table above: `e2e/discover-shop.spec.ts` and `src/app/present/ShopView.tsx` are now
**declared**, not pending.
