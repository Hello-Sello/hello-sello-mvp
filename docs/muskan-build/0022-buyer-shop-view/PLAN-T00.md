# PLAN — T00 · Seed products across the visibility × price matrix  (rev 4)

**Ticket:** [HEL-54](https://linear.app/hellosello/issue/HEL-54) · **XS** · depends on: —
**Slug:** 0022-buyer-shop-view · **Branch:** `claude/muskan/work` (base frozen: 0 behind `origin/dev`, 46 ahead)
**rev 3** folds in two checker rounds. rev 1's matrix broke a live e2e assertion; rev 2
deleted a price row that would have thrown `23502` on the demo path, and mutated a product
the deal fixtures already use. **rev 3 is strictly smaller than rev 2** — it deletes nothing
and mutates no product that anything depends on.

---

## Why this is first

Seed never writes `profile_visible`, `price_public` or `location`. Both flags default
`false` (`20260609210000:34`, `20260614140000:19`), so **every one of GreenLeaf's four
products is invisible to every buyer on a fresh `db reset`**. AC 1–4 are unwalkable and
T06/T07's pgTAP matrix has nothing to assert against.

## Two hard pins the seed must not break

`e2e/present-card-edit.spec.ts` is `test.describe.configure({ mode: "serial" })` (`:25`),
so either pin cascades through the rest of the file. Both were read, not assumed:

| pin | evidence | consequence for the matrix |
|---|---|---|
| **AUR-1A must keep `price_public = false`** | `:239-241` — *"Seed ships price_public=false — the reveal must be absent"*, then `:244` drives the dial **on** via `getByLabel("Show price to buyers").check()`. A pre-checked box is a no-op → no dirty state → the save at `:245` and the `data-edit="off"` assert at `:246` all fail | AUR-1A **cannot** be the priced corner |
| **AUR-1B must keep zero seeded rungs** | `:162-176` — *"the blank slate"*; `:176` asserts `getByLabel("Tier 1 minimum grams")` has count 0 before building a 2-rung ladder on it | AUR-1B **cannot** be given a ladder |

Together these rule out both fixes the first round proposed. The corners move to the two
unpinned products instead, which costs nothing.

## Ground facts established before planning

| fact | evidence |
|---|---|
| the four products, keyed by `supplier_product_code` | `seed.sql:384-399` (§6a), values-join-product, idempotent |
| prices for all four | `seed.sql:410-424` (§6c): 1A 8.00 · 1B 6.00 · 1C 4.00 · 1D 5.00 |
| AUR-1A carries the only seeded rung (2000 g → 6.50) | `seed.sql:426-441` (§6c-2) |
| window columns are `visibility_start` / `visibility_end`, seed leaves both NULL | `20260614140000:31-32` → always in window |
| location **tabs** come from `product.location`, not the warehouse list | `ShopView.tsx:524` → `groupByLocation`; `deriveInitialLocations` (`shop.ts:267`) is the company warehouse list, a different concept |
| GreenLeaf has two **pending** connect requests | `seed.sql:363-376` (§5f): NordCanna/david + Bavaria/eva ⇒ an unconnected demo buyer who *can* connect ⇒ AC 5's before/after reload walks on seed alone |
| a price-less product is a supported state | `deals/supabase/reads.ts:530-531` — *"A product with no current price comes back with `unitPrice = null` (a price-less line is allowed, D3)"* |
| §6a ends `:399`, §6b starts `:401`; no migration creates these rows | placement of the new block cannot race the insert |

## Blast radius — read, not assumed

| consumer | verdict |
|---|---|
| `e2e/present-card-edit.spec.ts` | **the binding constraint** — both pins above. rev 2's matrix leaves AUR-1A's dial and AUR-1B's rung count untouched, so nothing moves |
| `e2e/deal-p2p-send.spec.ts:135,159` | **safe** — selects `Pedanios 10/10 MBE-CA` by label and asserts a `CHANGE` tag; no price is read. Deleting AUR-1D's price row does not reach it |
| `supabase/tests/pricelist_item_tier_test.sql` | **safe** — its dial-walk targets `supplier_product_code = 'TIER-VIEW'`, created by the test itself (`:43`, `:63`) |
| `supabase/tests/cross_tenant_lockdown_test.sql` | **safe** — `:47` flips *all* GreenLeaf products visible+public in-fixture and asserts `count(*) > 0`; our matrix is a subset. Its **`:42`** comment goes stale → Deviation 1 |
| six more `/present` specs using `.first()` — `present-manage`, `present-edit-model`, `present-add-product-fields`, `present-mode`, `present-info`, `present-basket` | **safe, but traced not assumed.** `present-basket` is entirely `test.fixme` (`:31,44,54`). `present-manage` is the one worth reading: `mode: "serial"` (`:30`) and it mutates the seed, so location grouping reshuffles its DOM mid-file — test 1 renames `.first()` (AUR-1D), which re-sorts the groups and flips first-seen to Toronto; `.first()` lands on AUR-1A in both the old and new worlds, test 2's count assert is relative (`:81-83`), and tests 3-8 get AUR-1B in both. It passes by arithmetic, not by luck, but only just |
| `e2e/present-grid.spec.ts:7-13` | header claims *"no per-product location set… the dropdown lists only 'All locations'"* — falsified by the `location` writes. Assertions still pass (`ShopView.tsx:883-888` derives options from `products[].location` and keeps "All locations") → Deviation 1 |
| `e2e/present-buyer.spec.ts` | inert — all three cases `test.fixme()` |
| `e2e/deal-c2c-create.spec.ts:157` | unrelated — asserts absence from `/connect/inbox`, not from a shop |
| `e2e/discover.spec.ts:12-14` | header states it "avoids exact seed counts" |
| `20260614170000_seed_discover_demo_catalogue.sql:11-15` | dead + contradictory (sets *San Raf* to the opposite corner; products moved to `seed.sql` after its timestamp). Out of scope → note for T08 |

## The matrix (rev 4)

**Nothing is deleted and no depended-on product is mutated.** The four seeded products take
the four corners by flipping two boolean dials; a **fifth, brand-new product** carries the
ladder. A new row has no dependents by construction, which is what dissolves rev 2's two
worst findings at once.

| code | product | `profile_visible` | `price_public` | rungs | `location` | corner | walks |
|---|---|---|---|---|---|---|---|
| AUR-1A | Pedanios 31/1 COS-CA | **true** | false *(pin 1)* | its seeded 2000 g rung, never revealed while the price is hidden | Toronto Warehouse | **L1** visible + price-hidden | AC 3, AC 11 |
| AUR-1B | Pedanios 31/1 PND-CA | **true** | **true** | none *(pin 2)* | Toronto Warehouse | **L2** visible + priced | AC 2 (price half) |
| AUR-1C | San Raf 29/1 PNK | false | **true** | **none — unchanged** | Montreal Warehouse | hidden + priced | AC 5 |
| AUR-1D | Pedanios 10/10 MBE-CA | false | false | none · **price row kept** | Montreal Warehouse | hidden + price-hidden | AC 6 |
| **NEW** `AUR-1E` | **Tantalus 24/1 BLB-CA** | **true** | **true** | **2 new rungs** (500 g → 5.40, 1000 g → 4.80 under a 6.00 base) | Toronto Warehouse | L2 + ladder | **AC 2 ladder half + AC 8, without a connection** |

Two distinct `location` values ⇒ two named tabs. Both hidden corners sit on GreenLeaf.

**Tab and grid order** (corrected — rev 2 stated it backwards): `shop.ts:175` orders by
`name`, giving 1D, 1A, 1B, 1C, 1E; `locationFilter.ts:37-54` keeps **first-seen** order, and
1D is Montreal. So tabs render **`All | Montreal Warehouse | Toronto Warehouse`**. `.first()`
stays AUR-1D in both the old and new worlds, so no existing spec moves — and `AUR-1E`'s name
is chosen to sort **last**, after "San Raf", for exactly that reason.

**No known gap.** rev 2 claimed no non-connected buyer could reach a ladder and called it
forced. It wasn't — `TICKETS.md:32-33` says "**at least** one product in each combination",
so a fifth row was always allowed. AC 2's ladder half and AC 8 are now walkable unconnected.

**On the fourth corner's wording:** the ticket says "hidden+unpriced" where the visible pair
says "price-hidden". rev 3 reads both as the `price_public` dial — the vocabulary the ticket's
own L0/L1/L2 labels come from. It does **not** additionally seed a `price_per_gram IS NULL`
product: see Behaviour changes, note 4.

## Steps, in runnable order

**Ordered to match the file**, so a builder applying them one at a time never sees a
silent no-op: the matrix UPDATE keys on `AUR-1E`, so the row must exist first.

1. **`seed.sql` §6a — add the fifth product** as a fifth VALUES row inside the existing
   guarded insert, so idempotency is inherited (`:396-399` correlates per row on
   `(company_id, code, deleted_at is null)`):
   `('aaaa…'::uuid, 'Tantalus 24/1 BLB-CA', 'Blue Blaze', 'AUR-1E', '38395011', 1000, 24, 1, 7.50, 'Tantalus Labs', 'Vancouver')`.
   Only `(company_id, supplier_product_code)` is unique (`20260607090004_catalog.sql:52-53`);
   `name` and `local_code_pzn` carry no unique index, so both literals are free.

2. **`seed.sql` §6c — add its base price:** `('AUR-1E', 6.00)`.

3. **`seed.sql` §6c-2 — add its two rungs in ONE `INSERT … SELECT`**, never two statements.
   §6c-2's `not exists` guard is evaluated against the **pre-statement snapshot**, so a second
   statement would see the first rung and silently skip — shipping a one-rung ladder that still
   passes the shape trigger and that no assertion catches. Both rungs ride one statement with a
   two-row `VALUES` join, reusing the guard verbatim.
   Shape rules (`20260814120000:126,130`): every rung strictly below base, rungs strictly
   descending as `min_grams` rises. 5.40 then 4.80 under base 6.00 satisfies both. The checker is
   `AFTER … FOR EACH ROW` and re-reads the whole ladder (`:122-134`), so AFTER-ROW queuing means
   one two-row INSERT validates once against the complete ladder.

4. **`seed.sql` — add §6a-2** immediately after §6a's insert (`:399`), before §6b (`:401`).
   One idempotent `UPDATE … FROM (VALUES …)` keyed on `supplier_product_code`, mirroring §6c's
   values-join-product idiom. Never hardcode a product UUID (§7's own rule).

   ```sql
   -- 6a-2) The visibility x price matrix. Seed shipped every product with both
   --       dials OFF (column defaults), so a fresh reset had ZERO buyer-visible
   --       products and the buyer shop view could not be walked at all. Each
   --       corner of the 2x2 is occupied on purpose; `location` gives the shop
   --       two tabs. AUR-1A stays price_public=false and AUR-1B stays rung-less
   --       on purpose - e2e/present-card-edit.spec.ts drives both dials itself
   --       and asserts those starting states. Idempotent.
   update public.product p
      set profile_visible = v.visible,
          price_public    = v.priced,
          location        = v.loc
     from (values
       ('AUR-1A', true,  false, 'Toronto Warehouse'),
       ('AUR-1B', true,  true,  'Toronto Warehouse'),
       ('AUR-1C', false, true,  'Montreal Warehouse'),
       ('AUR-1D', false, false, 'Montreal Warehouse'),
       ('AUR-1E', true,  true,  'Toronto Warehouse')
     ) as v(code, visible, priced, loc)
    where p.company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
      and p.supplier_product_code = v.code
      and p.deleted_at is null
      and (p.profile_visible is distinct from v.visible
        or p.price_public    is distinct from v.priced
        or p.location        is distinct from v.loc);
   ```

   **`is distinct from` is required, not stylistic — and the reason is narrower than rev 3
   claimed.** `product.location` is nullable `varchar(80)` with no default
   (`20260705120000:14`); the two flags are `not null default false`. With `<>` the predicate
   is `A or B or NULL`, which is TRUE wherever a flag actually changes and NULL only where
   **both** flags already match — i.e. exactly one row, **AUR-1D**, would be skipped, not all
   five. The consequence is worse than a no-op: AUR-1D keeps `location = NULL`, producing a
   trailing `Unassigned` group and reordering the grid so `.first()` becomes **AUR-1A** —
   precisely the class of move the two pins exist to prevent.

5. **Correct three stale comments, and close criterion 3 with a real assertion:**
   - `supabase/tests/cross_tenant_lockdown_test.sql:42` — *"Seed ships its products
     profile_visible=false"*. (`:43` is the UUID sentence and stays true; `:47` flips all
     GreenLeaf products, a superset of the matrix, so no assertion in that file moves.)
   - `supabase/seed/seed.sql:443-482` §7 header — *"each of the **4** products gets >=2 physical
     lots"*. T00 makes that false: AUR-1E ships with no lots, so no stock and
     `terpPercent = null` (`shop.ts:241` falls back to the representative batch). Correct the
     wording; batches for AUR-1E are **not** in T00's criteria and stay out.
   - `e2e/present-grid.spec.ts:7-13` + `:46-62` — **rewrite the header AND add one assertion.**
     The header currently says multi-location grouping is deferred to `locationFilter.test.ts`.
     Simply restating that as "now exercised" would be false: `:46-62` opens the dropdown,
     asserts an `/all locations/i` option exists, clicks it, and asserts the count is unchanged
     — it never selects a **named** location. Add: select `Toronto Warehouse`, assert the card
     count drops to 3. That makes the rewritten header true **and** gives T00's third criterion
     ("two distinct `product.location` values, so the tabs render more than 'All'") its only
     committed assertion. Without it the criterion is checked by an ad-hoc query and nothing else.

6. **`docs/team/sync/muskan.md`** — the ritual is **two standalone commits**, not one step:
   commit+push the sync file alone with `supabase/seed/seed.sql` added to `Shared files locked`
   **before** step 1; commit+push it alone again with the lock removed **after** step 5. Bump
   `Last updated` both times — it is two gates stale. (Deviation 2.)

## Signatures

No TypeScript, no RPC, no migration, no new column, **no deletions**. Writes only:
`product.profile_visible`, `product.price_public`, `product.location` on five rows; one new
`product` row; one new `pricelist_item` row; two new `pricelist_item_tier` rows.

## Behaviour changes — named, not "preserved"

1. A fresh `db reset` shows **three** products on GreenLeaf's public shop where it showed zero
   (AUR-1A, AUR-1B, AUR-1E); a connected buyer additionally sees AUR-1C and AUR-1D.
2. GreenLeaf's seller `/present` gains a two-tab location bar (`All | Montreal | Toronto`)
   where it had one "Unassigned" group, and a fifth card.
3. `get_discoverable_shop('aaaa…')` returns rows for any verified caller where it returned none.
4. **The seed still has no `price_per_gram IS NULL` product — deliberately.** rev 2 created one
   by deleting AUR-1D's price; `deal_line_item.unit_price` is `NUMERIC(15,4) NOT NULL`
   (`20260607090003_phase2_deal.sql:235`), `create_deal_draft` inserts
   `nullif(v_line->>'unitPrice','')::numeric` (`20260618140000:151`), `actions.ts:40` passes
   `null` through, and Save draft gates only on `lines.length === 0` (`CardFront.tsx:1569`) —
   so a price-less product in the picker throws `23502` on the demo path. `reads.ts:531`'s
   "a price-less line is allowed" is a **read**-side comment and does not cover the write path.
   T03 and T07 both fixture their own null-price rows (the `TIER-VIEW` precedent,
   `pricelist_item_tier_test.sql:43`); T00's criteria never asked for one.
5. `AUR-1E` appears in the seller's deal-line picker with its ladder-resolved prefill (6.00
   base, 4.80 at a 1000 g pack via `resolveTierPrice`, `CardFront.tsx:483,494-496`). New-row
   behaviour, not a change: rev 2 put those rungs on **AUR-1C**, which
   `e2e/fixtures/two-company.ts:621-626` and `e2e/deal-change.spec.ts:822-860` already use.
6. **⚠️ T00 activates the cross-tenant catalogue read for the first time in the seed's life —
   name it, do not discover it at G4.** Today **zero** products are `profile_visible`, so all
   four public-read policies match nothing: `product_public_select`
   (`20260614140000:27-32`, **no company scope**), `pricelist_item_public_select`
   (`20260614180000:16-23`), `plit_public_select` (`20260814120000:71-87`), and the
   `current_pricelist_item` public arm. Flipping three products visible turns all four on.
   The concrete consequence: `getOwnCatalog` has **no `company_id` filter** — its own comment
   at `reads.ts:526-528` says *"the picker currently returns EVERY company's visible products
   (known issue)"* — so after T00, **Bob/StonePharm opening "Add product from your shop" sees
   GreenLeaf's three visible products, priced, in his own dropdown.** Also opened: a
   non-connected buyer can direct-write those products into `product_basket_line` (the hole T07
   closes), and AUR-1E's rungs become readable by any verified caller via `plit_public_select`.
   **`TICKETS.md` already owns the fix in T06** (*"Widening site 1 makes its pre-existing leak
   strictly worse"*), but **T06 depends on T00**, so T00 alone opens the window. No test catches
   it — no e2e opens a picker as a non-GreenLeaf user. **Decision for G4: the window is accepted
   because nothing ships until `/ship` and T06 closes it inside this same slug — and the G4 walk
   gains one check: sign in as bob@stonepharm.test, open the deal-line picker, and record what
   it lists.**

## Verification — what "green" means

```sql
-- the matrix: 5 rows, all four (visible, priced) corners occupied
select supplier_product_code, profile_visible, price_public, location
  from public.product
 where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and deleted_at is null
 order by supplier_product_code;
-- two location tabs
select count(distinct location) from public.product
 where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and deleted_at is null;   -- 2
-- rung counts: pin 2 held, the new ladder is TWO rungs not one (step 4's trap)
select p.supplier_product_code, count(t.id) as rungs
  from public.product p
  join public.pricelist_item pi on pi.product_id = p.id and pi.deleted_at is null
  left join public.pricelist_item_tier t on t.pricelist_item_id = pi.id and t.deleted_at is null
 where p.company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and p.deleted_at is null
 group by 1 order by 1;
-- expect AUR-1A 1, AUR-1B 0, AUR-1C 0, AUR-1D 0, AUR-1E 2
```
Then, on a **fresh `supabase db reset`** (the seed's `not exists` guards mean a re-run against
a dirty DB is a no-op — the pgTAP suites run against whatever is currently loaded, so the
reset is part of the gate, not a convenience):
- `supabase/tests/cross_tenant_lockdown_test.sql` + `pricelist_item_tier_test.sql` green
- `npx playwright test e2e/present-card-edit.spec.ts e2e/present-grid.spec.ts` green — these
  two drive this exact seed against `/present`; neither the SQL above nor `npm run test` can
  catch a pin regression
- `npm run test` unaffected

## Respecting the fences

- **Locked** — nothing touches the connection rule, the one read door, `ShopView`,
  `ProductCard`, or any of the three permission sites. T00 is data only.
- **Deferred** — no AC 9 work; no deactivate/unavailable control (T00 leaving `profile_visible`
  as the only switch is *why* that deferral is owed).
- **ADR `Reused` fence** — no new component, RPC, column or migration.

## Deviations declared

1. **Edits in two files outside the ticket's `Files:` list** —
   `supabase/tests/cross_tenant_lockdown_test.sql:42` (comment only) and
   `e2e/present-grid.spec.ts` (**comment + one added assertion**). Both files carry prose this
   ticket falsifies. The `present-grid` change is no longer comment-only: rewriting its header to
   claim multi-location coverage would be false unless the spec actually selects a named
   location, so step 5 adds that assertion — which is also the **only** committed check of T00's
   third criterion. The fixture at `cross_tenant_lockdown_test.sql:46-47` and every existing
   `present-grid` assertion stay correct. No parallel collision: T06 also claims
   `supabase/tests/`, but `TICKETS.md` makes T06 depend on T00.
2. **Sync ritual: read-half satisfied, declare-half done.** `git show
   origin/claude/ayush/work:docs/team/sync/ayush.md` → **offline**, **locked: none**, last
   updated 2026-07-24; Muskan is sole owner.
3. **A fifth seed product**, which T00's three criteria do not name. Justification: T00 exists so
   AC 1–4 are walkable, and AC 2/AC 8 need a laddered buyer-reachable product. Both existing
   candidates are pinned, and mutating AUR-1C moves live deal fixtures. A new row is the only
   option with no dependents. `TICKETS.md:32-33` says "at least one per combination", so a fifth
   row is within the criterion as written.

## Who the unconnected buyer is

Criterion 2 holds, but not via Bob: GreenLeaf ↔ StonePharm is a seeded **active** relationship
(`seed.sql:316`). The unconnected buyers are **david@nordcanna.test** and **eva@bavaria.test** —
real auth users (`:269-270`) in verified companies (`:283`) with pending requests to GreenLeaf
(`:363-376`). AC 5's before/after reload walks as: sign in as david → hidden products absent →
Alice accepts his request → reload → AUR-1C and AUR-1D appear.
