---
status: proposed   # → accepted at G3 (Muskan) · rev 8 — after seven adr-checker rounds (11+15+15+14+15+14+12 findings, 2026-08-14) · rev-7 rule kept: prefer the fix that REMOVES a mechanism · G3 decision A: basket gains a grams editor
---

# Volume tiers are child rows of the price row, replacing the single bundle bracket

**Spec:** `docs/PRD/0021-tier-ladder.md` (G1-approved, amended at G3: decision B +
held-change hint) · **Prototype:** Variant B, `prototypes/0021-tier-ladder-prototype/`

## Plain English — the options, and why the winner wins

**For the product:** with **child rows** (chosen), a 4th tier later is a row a seller
adds — no engineering. With **fixed columns** (tier2_min, tier2_price, …), every change
to how many tiers exist is a migration and an app release. With **sit-beside** (keep the
old bundle columns AND a new table), sellers would have two places holding volume deals
and screens could show different prices for the same product.

**Cost later / reversibility:** child rows are the easiest to undo — drop one small
table, one view and two function bodies revert. Fixed columns bake the number 3 into
every reader. Sit-beside is the hardest to leave because data accumulates in both
places.

**What breaks if we picked wrong:** if 3 turns out to be genuinely fixed forever, we
carried a table where columns would have done — mild waste, nothing breaks. The reverse
mistake (columns, then Marcel wants 4) repeats today's exact pain: this feature exists
because ONE bracket was hard-coded as columns.

**Industry practice:** quantity-break pricing in B2B commerce platforms (Shopify
wholesale price breaks, Magento tier prices, Odoo pricelist rules) is universally a
child-row table per price entry, unbounded, UI-capped. `DECISIONS.md` already applied
this exact reasoning twice (terpenes, buyer codes).

**Recommendation:** child rows, replace, in two deploy-safe steps — the only option
that is simultaneously reversible, single-source, and industry-normal.

## Context

`pricelist_item` holds `price_per_gram` (base, NOT NULL) plus one optional bracket
(`bundle_threshold_grams` + `bundle_price_per_gram`). Marcel's ask: 3 tiers per product
with a dropdown. G1 locked: repeatable rows capped at 3 in UI; **replace** the bracket
(one source of truth, `DECISIONS.md:747`); base price stays put. G3 decision B: the
ladder prices the basket → draft moment; after that, negotiation owns prices. Snapshot
rule (`CONTEXT.md:92`) is regulatory.

## Decision

### 1. New table `pricelist_item_tier`

Child of `pricelist_item`; named to dodge the corpus-wide overload of bare "tier".

| Column | Type | Rule |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `pricelist_item_id` | UUID NOT NULL → `pricelist_item(id)` | parent price row |
| `min_grams` | NUMERIC(12,2) NOT NULL, `CHECK (min_grams > 0)` | "from N g", `>=` semantics |
| `price_per_gram` | NUMERIC(15,4) NOT NULL, `CHECK (price_per_gram > 0)` | €/g — prices are always per gram |
| house columns | `created_by/updated_by/created_at/updated_at/deleted_at/deleted_by` | same shape as parent |

`CREATE UNIQUE INDEX uq_pricelist_item_tier_min ON pricelist_item_tier
(pricelist_item_id, min_grams) WHERE deleted_at IS NULL;` — partial unique index (the
soft-delete idiom, `20260607090004:154-155`). Plus an index on `pricelist_item_id`.

**The discount-ladder shape is DB-enforced.** A plain (non-deferred) **constraint
trigger** fires on `pricelist_item_tier` INSERT/UPDATE (incl. soft-delete flips) **and
on `pricelist_item.price_per_gram` UPDATE**. Its body **first takes `SELECT … FROM
pricelist_item WHERE id = <parent> FOR UPDATE`** — without the lock, two concurrent
rung writes validate against snapshots that don't see each other and both commit into a
broken ladder (the race class already documented at `20260607090005:73-77`) — then
asserts over the parent's live rungs: every rung's price < base, strict descent.
Rationale: the editor is not the only writer (`plit_all` allows direct POSTs;
`writeStandardPrice` can lower base under a ladder → buying more would cost more).

**The ladder save is one RPC — `save_price_ladder(p_pricelist_item_id, p_base,
p_tiers jsonb)` — and it is SECURITY INVOKER, not DEFINER.** INVOKER means RLS
(`plit_all` / `pli_all`) enforces ownership **for free** — no hand-written authz check
to forget, no RLS bypass to leak through (a DEFINER version without an explicit
ownership check would let any authenticated user rewrite any seller's prices;
`search_path` pinned regardless, per `20260607090006`). **Its FIRST statement is
`SELECT 1 FROM pricelist_item WHERE id = p_pricelist_item_id FOR UPDATE`** — the
trigger's own lock fires too late to serialize two concurrent *saves*: the second
save's soft-delete would match 0 rows after the first commits (its trigger then never
fires), and its inserts would merge with the winner's into a ladder neither seller
authored. Locking the parent before the soft-delete makes concurrent saves strictly
last-writer-wins. Then, inside the same transaction, the write order is **soft-delete
all live rungs → update base → insert the new set** —
delete+insert rather than in-place UPDATEs, because the partial unique index cannot be
deferred and an in-place ladder shift (500→1000, 1000→2000) would trip it
mid-statement. Each statement is trigger-checked immediately against in-transaction
state, so no `SET CONSTRAINTS` machinery exists at all; the plpgsql body wraps the
writes in an `EXCEPTION` block and returns a clear message when the trigger raises.
**Scope: the ladder save on an existing price row.** The create path (first price on a
new product — insert `pricelist` + `pricelist_item`, no rungs yet) stays where it is
today, in `writeStandardPrice`'s base-table insert (`manage.ts:484`); a product cannot
have rungs before it has a price row, so the RPC never needs a create branch.

**Rituals, in order:**

1. `ALTER TABLE public.pricelist_item_tier ENABLE ROW LEVEL SECURITY;` — kept explicit
   even though the repo has an `rls_auto_enable()` event trigger
   (`ARCHITECTURE-NOTES.md:231` — so a policy-less new table is deny-all, not open;
   rev-2's "silently inert" rationale was wrong). The real rule the ritual encodes:
   **a migration that adds a table ships its policies in the same migration**, and the
   explicit enable keeps the migration self-contained if the event trigger ever goes.
2. `trg_pricelist_item_tier_set_updated_at` — the `20260607090005` attach is a
   hard-coded list; new tables wire it explicitly.
3. The ladder-shape constraint trigger + `save_price_ladder` RPC (above).
4. `auditable_content_type` seed row (`20260607090001:509` convention) — **kept for
   convention parity, honestly inert today**: nothing under `catalog/` writes audit
   rows (only `deals/actions.ts` does). Wiring price-change audits is a separate
   decision — raised at G3 as a follow-up ticket candidate, not smuggled in here.
5. Helper **`owns_pricelist_item(p_pricelist_item_id uuid)`** — takes the parent item's
   id, walks item → pricelist → `current_company_id()`. SECURITY DEFINER (policies need
   it to cross RLS), shaped like `20260607170000:142-148`, `GRANT EXECUTE … TO
   authenticated` **and `REVOKE ALL ON FUNCTION … FROM public, anon`** (GAP-1: Supabase
   auto-grants EXECUTE to anon on every public function, `20260617090000:271-277`).
   Same grant/revoke pair for `save_price_ladder` (which stays INVOKER).

### 2. Access control — three doors, all mirrored from the parent

1. `plit_all` — FOR ALL TO authenticated, USING/WITH CHECK
   `owns_pricelist_item(pricelist_item_id)`.
2. `plit_public_select` — FOR SELECT TO authenticated: **`deleted_at IS NULL` on the
   rung itself** (the parent policy opens with exactly this, `20260617090100:39` — a
   retired rung must not stay publicly readable), plus the public-catalogue gate
   (product live, `profile_visible`, **`price_public`**), plus a parent-live check
   (`EXISTS` parent `pricelist_item` with `deleted_at IS NULL`). Kept though buyer
   paths use the view/RPC: defense in depth for future direct reads.
3. `REVOKE ALL ON pricelist_item_tier FROM anon;` (sec02's "half-closed" lesson,
   `20260617090100:4-8`). Enforcement extends
   `supabase/tests/cross_tenant_lockdown_test.sql:64-76` to the child **and the §4
   view** (`has_table_privilege('anon',…)` for both).

### 3. Expand → deploy → contract — with an enforceable hold on C

`supabase db push` applies **every** file in `supabase/migrations/` — the ledger's
batch ritual (`cloud-migrations-pending.md:146,175`) describes the tool, not a
preference, so a prose "don't push C yet" cannot hold C back. **The enforceable
mechanism: C's file does not exist in `supabase/migrations/` until the tier-reading
deploy is live.** It is authored into the build folder
(`docs/muskan-build/0021-tier-ladder/contract-migration.sql.hold`) and moved in — with
a fresh timestamp — only after the Vercel deploy is verified. The ledger carries two
entries: E (normal), and C marked **HELD — file not yet in migrations/, precondition:
tiers-reading app live**. Without the hold, C's column-drop would 400 the deployed
app's PostgREST select naming the columns (`shop.ts:164` — the one true 400 path;
`discover/companies.ts` merely reads `undefined` off an RPC row, no error).

**Migration E (expand):**
0. **Precondition:** repair the `buy_schema` orphan row first — `db push` currently
   trips "remote migration version not found locally" on it
   (`cloud-migrations-pending.md:36-40`); until repaired, neither E nor C can be
   CLI-pushed at all.
1. Table + rituals + doors (§1–§2) + view (§4).
2. Backfill: one rung per parent row `WHERE bundle_threshold_grams > 0 AND
   bundle_price_per_gram > 0 AND bundle_price_per_gram < price_per_gram AND deleted_at
   IS NULL`. Malformed brackets (half-filled, or non-discount — legal today, the
   columns carry no CHECKs) are **not migrated as rungs but not lost either**: E copies
   every rejected bracket into `pricelist_item.metadata.legacy_bundle` (JSONB already
   exists, `20260607090004:146`) before C ever drops the columns, and `RAISE NOTICE`s
   both counts. Spec criterion 8 covers well-formed rows; sellers with malformed ones
   keep their data recoverable.
3. `get_discoverable_shop(uuid)`: **DROP + CREATE** (OUT columns change), returning
   legacy bundle fields **and** `tiers` jsonb (both behind the `price_public` CASE
   gate). Its price lateral is **replaced by a LEFT JOIN on the view**; the legacy
   bundle fields — which the view deliberately does not project — come from **one
   further `LEFT JOIN public.pricelist_item pli ON pli.id = v.id`, keyed off the
   view's already-picked row id** — the row-pick stays single-owner, no second lateral.
   **Deliberate tightening, for G3 eyes:** the live RPC's WHERE
   (`20260617090000:261-263`) has **no visibility-window filter** — an expired product
   still shows in Discover today; the view's public arm enforces the window, and the
   RPC's own product WHERE gains it too, so out-of-window products leave Discover
   entirely (what a seller setting `visibility_end` expects). Re-issue the sec01
   hardening — **all three statements**: `REVOKE ALL FROM PUBLIC`, `GRANT … TO
   authenticated`, `REVOKE EXECUTE … FROM anon` (`20260617090000:267-277`, the only
   correct pattern to copy — `20260618120100:77-78` re-issued just the first two after
   its own DROP+CREATE and never restored the anon revoke; flagged as a defect to
   repair in this same ticket).
4. `import_products(jsonb)`: re-declare from the LIVE body (`20260610160000:87-91`
   *writes* the bundle columns) to dual-write — legacy columns + tier row under the
   same guard as the backfill (rejected brackets → `metadata.legacy_bundle`, NOTICEd).
5. Regenerate `database.types.ts`.

**App deploy:** all readers move to tiers (blast-radius below).

**Migration C (contract, HELD until deploy):** `DROP VIEW` → drop the two columns →
`CREATE VIEW` + re-grants (the view doesn't project the columns, but the dance makes C
dependency-proof); re-declare both RPCs tiers-only (DROP + CREATE + re-grants;
`import_products` stops dual-writing); regenerate types.

Both RPC bodies **and the view's C-time re-CREATE** are diffed against the **LIVE
cloud** definitions before rewrite (the hold window is open-ended and cross-lane —
the view must not be rebuilt from this document's text if cloud drifted meanwhile). ⚠️
Ledger housekeeping noted in passing: the "PENDING (2026-07-10)" section's own header
still says pending, while the 2026-07-22 reconcile list (`:34`) shows it pushed —
reconcile separately; this ADR does not depend on it. Local seed gains one well-formed
bracket row so the backfill and criterion 8 are walkable on a fresh `db reset` (today
`supabase/seed/seed.sql:408` seeds no bracket).

### 4. One canonical price row, via a gated view — then one resolver

`pricelist_item` is unique per *(pricelist, product)*: a product may carry several
price rows, and the pickers disagree — basket `updated_at desc`; shop RPC
`published_at desc nulls last, created_at desc`; `getMyShop` (`shop.ts:164-171`)
unordered `[0]`, no `deleted_at` filter; `getOwnCatalog`
(`src/modules/deals/supabase/reads.ts:449-455`) unordered map; and the write path picks
the **oldest** (`manage.ts:444-450`).

**One owner for "which row": view `current_pricelist_item`.** NOT `security_invoker` —
a caller-rights view joins `pricelist`, which has only the owner policy
(`20260607170000:343-345`), so buyers would get zero rows. **Owner-rights with
`security_barrier`**, access rule explicit in its WHERE, two arms:

- *owner arm:* `pl.company_id = current_company_id()`
- *public arm:* **`product_public_select`'s full predicate inlined** — `product.deleted_at
  IS NULL AND profile_visible AND (visibility_start IS NULL OR visibility_start <=
  current_date) AND (visibility_end IS NULL OR visibility_end >= current_date)` — plus
  `price_public` **plus `public.is_caller_verified()`** (the Discover RPC's gate,
  `20260617090000:263` — a gate this repo already lost once and had to reinstate,
  `20260724100900`; today's table policy lacks it, so this is a tightening over
  parity, flagged for G3 alongside the visibility window). (Not merely the item
  policy's gate: its EXISTS reads `product` under RLS, delegating the window to
  `product_public_select`; an owner-rights view loses that closure, so the window is
  restated or expired products leak their ladder.)

Row pick, runnable-verbatim: `DISTINCT ON (pli.product_id)` with `ORDER BY
pli.product_id, pl.published_at DESC NULLS LAST, pli.created_at DESC` over `WHERE
pli.deleted_at IS NULL AND pl.deleted_at IS NULL AND pl.company_id = p.company_id` —
deliberately NO `status_code` filter, matching the live RPC. **Projection, enumerated
(not `pricelist_item.*`):** `id, pricelist_id, product_id, price_per_gram, currency,
updated_at, tiers` — nothing from `product` (a two-table projection would make
PostgREST embed inference ambiguous; readers take the view flat and stitch in JS), and
**explicitly not the two legacy bundle columns** — which is what makes C's `DROP
COLUMN` dependency-clean (the DROP/CREATE dance stays as belt-and-braces). `tiers` =
ordered jsonb **over live rungs only (`WHERE t.deleted_at IS NULL` inside the
aggregate)** — a soft-deleted rung must not keep selling. `GRANT SELECT TO
authenticated; REVOKE ALL FROM anon;` **Accepted trade-off, pre-declared:** an
owner-rights view raises Supabase's `security_definer_view` advisor finding
(ERROR-level). We accept the entry — the repo already records living with an advisor
finding deliberately (`ARCHITECTURE-NOTES.md:231`) — because "fixing" it by flipping
`security_invoker` on would zero out every buyer read (the `pricelist` owner-policy
wall, above).

**Single-owner file `src/modules/catalog/pricelist.ts`** exports the view-read and the
ladder-write (`save_price_ladder` call). **Client contract: it takes an injected
`SupabaseClient`** — its call sites span both worlds (basket and `getOwnCatalog` read
with the browser client; `getMyShop` uses `@/shared/db/server`, `writeStandardPrice`
runs in a server action), and injection serves all four without the file taking a side.
No `"use server"`, no client import of its own. All four switch their *reads* to it.
**Writes stay on the base table / the RPC** (the view is not auto-updatable; the create
path stays in `writeStandardPrice`, §1). The SQL shop RPC joins the view (§3.3). pgTAP
keeps one smoke assertion (RPC output matches the view for a public product) — a
tripwire, not a second copy.

**Consumers import through a module door, not a deep path.** `src/README.md:35` is
absolute — "only through its public `index.ts`, never reach into another module's
internals" — and PIPELINE.md names the one existing violation as the cautionary tale;
this ADR must not add two more. Since the main barrel is server-tainted
(`index.ts:6-9`), catalog gains a **second public door: `index.client.ts`** (client-safe
barrel exporting `pricing` + the `pricelist.ts` reads), and basket/deals import
`@/modules/catalog/index.client`. The README gains one line naming the two-door
convention in the same ticket.

**Enforcement (invariant bucket):** lint alone cannot see PostgREST **embed strings** —
today's actual readers embed `pricelist_item(…)` inside `.select("…")` literals
(`shop.ts:164`, `basket/supabase/reads.ts:36`), which no `.from()` AST selector
matches. So the guard is a **unit test that greps `src/**`** — not just the module
tree: two of the four fenced surfaces live under `src/app/` (`ShopView.tsx:535`,
`discover/companies.ts:210`) — for **reads**: `pricelist_item(` inside a `.select`
literal, or `.from("pricelist_item")` followed by `.select`, outside
`catalog/pricelist.ts`, fails the suite. (Read-scoped on purpose: the sanctioned
writes — `manage.ts:484`'s create insert and the RPC call — stay on the base table.
**`writeStandardPrice`'s row *lookup* — `manage.ts:445-446`, a read — rehomes into
`catalog/pricelist.ts`**, or the guard fails on it.)

**On `DECISIONS.md:766`** ("table-split, not a masking view … no view/privilege
traps"): that lock hides seller-only *columns*; this view canonicalizes a *row pick*
and hides no columns — first `CREATE VIEW` in the tree, a new pattern beside that lock,
not a supersession. The privilege-trap concern is met head-on: explicit grant/revoke +
lockdown assertions (§2.3).

**On ADR-0003** (one reusable basket/deal form): `tiers[]` on `BasketLine` and the
card-side hint are **shared logic behind the single form path** — the resolver is data
the one form consumes; no second form is introduced.

**One owner for "which rung":** pure function
**`resolveTierPrice(basePricePerGram, tiers, quantity, unit)`** →
`{pricePerGram, appliedMin}`:

- `basePricePerGram: number | null` — **null base → `{pricePerGram: null, appliedMin:
  null}`**, never a rung price without a base (price-less offers are a supported flow:
  `DECISIONS.md:1289` "sent price-less and the seller fills it").
- Unit normalization **copies `lineValueOf` exactly** (`derive.ts:127-130`): **`kg` ×
  1000, every other unit's quantity treated as grams as-is** — because that is what the
  billing math already does (`lineFromCatalog` puts grams in `quantity` even for `pack`
  products, `CardFront.tsx:381`), and pricing must follow billing, not invent a second
  unit theory. A test pins resolver ↔ `lineValueOf` agreement across `g`, `kg`, `mL`,
  `pack`. Null quantity → base.
- Else: highest rung with `min_grams <= grams`, or base.

Lives in **`src/modules/catalog/pricing.ts`**, reached via the `index.client.ts` door
(above). **Module edges created: two** (basket → catalog, deals → catalog — today they
import nothing from catalog; each edge carries both the resolver and the view-read, so
four import edges), all into a leaf module, no cycle possible. Enforcement: lint/test
assertion that both consumers import catalog's pricing export — no local price math.

**Where resolution happens (decision B):**

- Basket: `BasketLine` carries `tiers[]`; panel + totals resolve live **on the same
  grams `toDraftLines` writes: `toGrams(packCount, packSizeGrams)`**
  (`basket/lib/pack.ts:7-10`) — pinned in the agreement test, or the panel could show
  one rung while the draft strikes another. **The basket line gains a grams/pack-size
  editor (G3 decision A, Muskan):** today the drawer offers only a pack-count stepper,
  so "edit down to 700 g" (spec criterion 5a) was unreachable — buyers think in grams
  (the ladder speaks grams), so the line's pack size becomes editable rather than
  renegotiating the criterion into pack arithmetic.
- Catalog-add on the card: `CardFront.tsx:375-393` (`lineFromCatalog`) resolves with
  **the line's full physical quantity: `quantity × max(1, units)`**, normalized by
  unit. The `units` multiplier is frontend-only, but it multiplies the *billed* grams
  (`CardFront.tsx:141`) — a 500 g × 2-units line bills 1000 g and must resolve at the
  1000 g rung, or the card and the basket price the same physical grams differently
  (spec rule 5). Resolution and billing read the same number, always.
- After draft creation, prices are negotiation-owned — and the hint honors the card's
  locks: per ADR-0002 line prices are shared/held fields, per ADR-0001 a pending change
  locks the deal. The "qualifies for €X/g" hint **enqueues a held change through the
  existing propose/accept flow** — never a direct write — and is disabled while a
  change is pending.
- `deal_line_item.unit_price` stays the snapshot — no deal-side schema change.

### 5. UI per the G2 prototype (Variant B)

Seller edit: tier rows under the base-price field, lot-row styling, "+ Add tier" dead
at 3, out-of-order rows refuse to save, rung-1-undercuts-base pre-validated (UX mirror
of the DB trigger; the RPC returns a clear message when tripped, and
**`pricelist.ts` maps the trigger's error to the same clear message on the
`writeStandardPrice` path** — a base edit under an existing ladder trips the trigger
outside the RPC, and `manage.ts:456` today surfaces raw Postgres text. Base `0` remains
saveable as today; with base `0` the trigger makes any ladder unconstructible, which is
correct — no discount can undercut a free product). **The 3-rung cap is
deliberately advisory** — a UI convenience, not an invariant: the table is unbounded, a
direct 4th rung is a valid ladder (the trigger still enforces shape), the editor
renders what exists. Buyer + seller read: "See all prices" panel; Choose pre-fills
quantity. **Pack-size logic is extracted as `packSizes(product, tiers): {grams, label}[]`**
— the ordered numeric array first, labels derived (ShopView needs `sizes[packIndex]`
as a number to resolve a pick back to grams; exporting labels-only would force parsing
`"1000g+"` back to a number, reintroducing the exact bug class documented at
`ShopView.tsx:524-525`). **Every rung emits an entry** — the pick plumbing is
index-based (`onAddToBasket(productId, qty, packIndex)` → `sizes[packIndex]`,
`ShopView.tsx:530-538`), so a rung without an entry silently falls back to the base
pack size and criterion 5a fails; the panel's Choose returns an index into this same
array. Both surfaces (`ProductCard.tsx:154-163` and `ShopView.tsx:530-538`, today's
private twins) consume it; a regression test asserts bubble ↔ resolver agreement. CSV
import: single bracket in, landing as rung 1 (multi-tier import deferred, spec §4).
**`product.bundle_description` ("8x50g", `20260607090004:25`) is KEPT** — packaging
text, not pricing.

## Reused — already built; we feed it, don't touch

- `deal_line_item.unit_price` snapshot mechanism (`CONTEXT.md:92`).
- The held-change machinery (ADR-0001 lock, ADR-0002 shared/held classes,
  `propose_deal_change`) — the hint rides it, changes nothing in it.
- ADR-0003's single basket/deal form — tiers are data behind it, not a second path.
- `pricelist` / `pricelist_item` schema, `owns_pricelist()`, the `price_public` +
  `profile_visible` + visibility-window gates — referenced, not modified (except the
  RPC WHERE gaining the window, §3.3, flagged for G3).
- `LotRow` pattern (`ProductCard.tsx:878`) + the G2 prototype's panel — visual contracts.
- `cross_tenant_lockdown_test.sql` harness — extended, not rewritten.

## Blast-radius — what this can break, traced

| Surface | Files | Risk |
|---|---|---|
| Discover shop (Marcel's path) | `get_discoverable_shop` RPC, `discover/companies.ts` | RPC shape change ×2; grants reset on every DROP+CREATE (re-issued each time); **deliberate tightening: out-of-window products leave Discover (G3 sign-off)** |
| Present (seller shop) | `shop.ts`, `ShopView.tsx`, `ProductCard.tsx`, `manage.ts` | pack-bubble regression path; write-path row-pick flip (oldest → canonical); ladder saves route through `save_price_ladder` |
| CSV import | `template.ts`, `import_products` RPC | dual-write window; malformed brackets → `metadata.legacy_bundle` (NOTICEd), recoverable |
| Basket | `types.ts`, `supabase/reads.ts`, `toDraftLines.ts`, `BasketDrawer` | line type grows `tiers[]`; embed swapped for flat view read + JS stitch; **drawer gains a grams/pack-size editor (decision A)** |
| Deals — **cross-lane (Ayush)** | `deals/supabase/reads.ts`, `CardFront.tsx` (DEV-156) | sync ritual first; hint rides his held-change flow (ADR-0001/2). ⚠️ **Pre-existing bug, independent of this ADR** (the view replaces only the price query): `getOwnCatalog`'s *product* query (`reads.ts:440-444`) has no company filter — the seller's picker can list other companies' visible products. Flag to Ayush; nothing here changes it |
| DB steady state | ladder trigger + `save_price_ladder` | base-price edits gain a constraint they never had; multi-write saves are atomic in the RPC |
| Docs stating the old columns | `SCHEMA.md:409`, `SCHEMA-DRAFT.md`, `data-model.html`, `catalogue-ingestion-DESIGN.md` (both CSV contracts), `CONTEXT.md` (vocab: "volume tier"), `DECISIONS.md:747` (dated amendment) | stale-doc drift |
| Cloud ledger | `cloud-migrations-pending.md` | E entry normal; **C entry HELD — file kept out of `migrations/` until the tiers deploy is live** (the only mechanism `db push` respects); stale 07-10 section header flagged for separate reconcile (already-pushed per the `:32` reconcile list) |

## Invariants — sorted by enforcement

| Invariant | Enforced by |
|---|---|
| A rung's minimum and price are positive | DB (`CHECK`) |
| No two rungs of one price row share a minimum | DB (partial unique index) |
| Every rung undercuts base; strict descent — on every write path incl. base edits, incl. concurrent writers | DB (constraint trigger + parent-row `FOR UPDATE` lock; `save_price_ladder` INVOKER RPC saves atomically via delete+insert) + migration/import guards |
| Ladder readable only where the base price is (public gate + visibility window + no anon; view + helper + RPCs included) | DB (RLS + policies + `REVOKE` on table/view/functions), asserted by `cross_tenant_lockdown_test` |
| A struck deal's price never moves when the ladder changes | DB shape (`unit_price` snapshot) |
| Every reader picks the same price row | Test (read-scoped grep-guard over `.select` embeds + `.from().select` outside `catalog/pricelist.ts`) + pgTAP smoke (RPC joins the view) |
| Card, basket, and deal resolve the same rung — same physical grams incl. kg and the `units` multiplier | Test (both consumers import catalog's pricing export; resolver ↔ `lineValueOf` agreement across all units; card passes quantity × units) |
| No rung price without a base price | App (resolver null-base contract + test) |
| Post-draft, prices move only through the held-change flow | App + existing DB locks (ADR-0001 pending-change lock; the hint only proposes) |

*(Not an invariant: the 3-rung cap — deliberately advisory, §5.)*

## Consequences

- Two migrations (E; C authored `.hold` in the build folder, moved into `migrations/`
  with a fresh timestamp only after the tiers deploy is live); two ledger entries; both
  regenerate types.
- One new view (owner-rights, `security_barrier`, enumerated 7-column projection, gated
  WHERE — first view in the tree, new pattern beside `DECISIONS.md:766`; accepted
  `security_definer_view` advisor entry), one locked constraint trigger, one
  `save_price_ladder` **INVOKER** RPC (delete+insert), one resolver, one single-owner
  `pricelist.ts` (injected-client), one client-safe `index.client.ts` door (+ one
  README line), one read-scoped grep-guard test, extended pgTAP + lockdown tests, one
  resolver unit suite (at-threshold, below-lowest, above-highest, empty ladder, null
  grams, **null base**, **kg**, `mL`/`pack`-as-grams, **units multiplier**), one
  `packSizes` extraction (every rung an entry) + regression test.
- Two module edges (basket → catalog, deals → catalog; four import edges), all into a
  leaf, through the client barrel door.
- `ADR-INDEX.md` gains this ADR's line.
