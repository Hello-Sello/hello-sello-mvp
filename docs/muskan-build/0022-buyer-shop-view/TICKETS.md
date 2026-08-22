# 0022 · buyer-shop-view — tickets

**Source:** ADR-0005 (rev 6, G3-accepted 2026-08-19 — four checker rounds folded in) + PRD 0022 (G1) + the G2 variant-A
contract. Sized S/M/XS, INVEST-checked, EARS criteria.
**Hard rule:** tickets running in parallel touch different files.
**Linear:** HEL-54 … HEL-62, team *Codebase Development Tickets*, all Backlog (created 2026-08-19).

**Slices** (ADR Consequences): all three land as three PRs against **one** deploy — no slice
is independently walkable, and `supabase db push` applies every migration file regardless of
prose ordering. G4 walks the union.

| Slice | Tickets | Gives you |
|---|---|---|
| **1 · the page** | T01 T02 T03 T04 | the buyer's shop, real cards, links + info box, request-pricing |
| **2 · the spec set** | T05 | AC 7's full specification set + the location tabs |
| **3 · the rule** | T06 T07 | decision 6, and basket admission enforced server-side |
| **0 · always first** | T00 | without it AC 1-4 cannot be walked at all |

**Not in this slug:** AC 9 (order-before-connection) — split to its own slug at G3, ADR §9.

---

## T00 — Seed products across the visibility × price matrix · **XS** · depends on: —  · [HEL-54](https://linear.app/hellosello/issue/HEL-54)

All four local products are `profile_visible = false, price_public = false`, so **zero**
products are visible to any buyer today. AC 1-4 are unwalkable and the pgTAP matrix
unwriteable on a fresh `db reset` until this lands. First, because everything else is
verified against it.

**Files:** `supabase/seed/seed.sql`

- When `supabase db reset` completes, the seed shall contain at least one product in each
  combination: visible+priced (L2), visible+price-hidden (L1), hidden+priced, hidden+unpriced.
- When a seeded product is hidden, it shall belong to a seller the demo buyer **can** connect
  to, so AC 5's before/after reload is walkable on seed data alone.
- When the seed runs, at least one seller shall have two distinct `product.location` values,
  so the location tabs render more than "All".

## T01 — `get_discoverable_company` gains the shop chrome · **M** · depends on: T00  · [HEL-55](https://linear.app/hellosello/issue/HEL-55)

The links row, tags, address and warehouse line — AC 1 surface. **Not** the location tabs:
those come from `product.location` in T05 (ADR §5, corrected).

**Files:** `supabase/migrations/<ts>_discoverable_company_shop_chrome.sql`,
`src/app/discover/companies.ts` (company mapper only), `src/types/database.types.ts`

- When a verified buyer calls `get_discoverable_company` for a verified seller, the system
  shall return `links`, `locations`, `address`, `warehouse_location` and `updated_at`
  alongside the existing eleven columns.
  > ⚠️ **AMENDED at /build T01 (2026-08-20): `tags` is NOT a new column.** It already ships as
  > `type_codes` — `array_agg(distinct cta.company_type_code)`, the identical source the seller's
  > shop reads (`shop.ts:276`). `ShopView.tsx:798-801` renders **raw** codes, so routing buyer
  > tags through `categoryLabel` (the existing `categories` field) would double-label. The
  > mapper supplies `Shop.company.tags` from `type_codes`; adding a column would put one fact in
  > two places. **Five new columns, not six.** Muskan adjudicates at G4.
- When the RPC projects `company.metadata`, it shall project the **named keys only**
  (`links`, `locations`) and never the whole object (ADR §4 leak rule).
- When the function is re-created, the migration shall re-issue the full three-statement grant
  ritual — `revoke all … from public`, `grant execute … to authenticated`,
  `revoke execute … from anon` — because `DROP + CREATE` resets grants.
- When the company mapper runs, it shall reuse `parseLinks` and `deriveInitialLocations` so
  buyer and seller parse identical data identically.

## T02 — `BuyerShopView` + the page at variant-A width · **M** · depends on: T01  · [HEL-56](https://linear.app/hellosello/issue/HEL-56)

The G2 contract: reuse `ShopView` + `ProductCard`. **A new card component is a build failure,
not a style choice.**

**Files:** `src/app/discover/[companyId]/BuyerShopView.tsx` (new),
`src/app/discover/[companyId]/page.tsx`, `src/app/discover/companies.ts` (**the
`DiscoverProduct → ShopProduct` product mapper** — round 4, B9: slice 1 promises "real cards",
which needs `ShopProduct[]`; T01 scopes `companies.ts` to the *company* mapper only and T05's
column work is slice 2, so without this the mapper had no owner), `src/app/present/ShopView.tsx`
(**two lines: the stale comment, plus `viewerIsOwner={viewerCanManage}` on the `ProductCard`
call** — round 4, B2 — **plus one render conditional, fence amended at G4, see below**), `src/modules/basket/components/BasketDrawer.tsx`,
delete `src/app/prototype-0022-buyer-shop/`

> ⚠️ **T02 and T05 both write `companies.ts`** — they are sequential, not parallel.
> On today's RPC the mapper fills what it can and leaves the AC-7 spec fields empty; T05
> fills them. **The cards render from the first slice; they are not complete until T05.**

- When a verified buyer opens `/discover/[companyId]`, the system shall render the seller's
  shop through `ShopView` with `viewerCanManage={false}`, at Present's 1400px container.
- When buyer mode renders, the system shall show **no** save control, no manage-shop control,
  no Present-mode control and no banner/logo edit control anywhere on the page (AC 11).
- When the page renders, `ConnectActions` shall occupy `ShopView`'s existing `buyerContext`
  slot rather than a hand-built page layout.
- When the product mapper builds a `ShopProduct` for a buyer, it shall forward the seller's real
  `price_public` (`DiscoverProduct.pricePublic`, `companies.ts:166,204`) and **never hardcode it
  `true`**. T03's Request-pricing gates on `pricePublic` directly, because the DB keeps
  "price on request" and "price not set yet" as distinct states on purpose
  (`20260816190000:96-97`) and ADR-0005 `:566-567` forbids the ask on merely-unpriced products.
  Hardcoding it would make that distinction unrepresentable and silently kill Request-pricing for
  every buyer, with every component test still green. *(Added at T03's plan check, 2026-08-19 —
  the premise was load-bearing and unowned by any ticket.)*
- When the seller may see no products at all, the system shall still render banner, info and
  links, and pass the locked-catalogue panel with its Connect action to the `emptyState` slot
  (AC 4).
- When a **non-connected** buyer opens the basket drawer, the system shall state that
  connecting comes first and offer the Connect action, rather than a Send that cannot fire —
  `BasketDrawer.tsx:198` nulls the recipient without a relationship, so today the buyer fills
  a basket they cannot send with no explanation (round 3, B9; the honest v1 of decision 2 now
  that AC 9 is split out).
- When `ShopView` renders a `ProductCard`, it shall pass `viewerIsOwner={viewerCanManage}` —
  without it T03's price gate defaults to owner and never fires in buyer mode, failing AC 3
  while every component test passes (round 4, B2).
- When a single **named** location is the active filter, the per-location group header shall not
  render — the dropdown already names it and there is exactly one group, so today the name
  appears twice one line apart. In the **"All locations"** view the header still renders: there
  it is the divider between locations, which is its actual job. *(G4 2026-08-19, Muskan: the
  duplication "bothered me". Only reachable since T00 — before it no product carried a
  `location`, so no named group header ever rendered.)*
- When this ticket completes, `ShopView` shall carry **no new state, and exactly one new
  branch** — the render conditional above — plus one prop pass-through and one comment; and the
  prototype route shall be gone from the tree.
  **Fence amended at G4 (2026-08-19), deliberately and narrowly.** The original read *"no new
  state and no new branch"*. Its purpose is to stop `ShopView` accreting buyer-mode knobs, and a
  conditional that hides a redundant header in the seller's own view is not that. The amendment
  buys exactly one branch, driven by state `ShopView` already owns (the active location filter);
  it does **not** relax ADR §1's rule that `ShopView` gains no behaviour prop, which stands
  untouched.

## T03 — `ProductCard`: the price gate and the request-pricing hook · **S** · depends on: —  · [HEL-57](https://linear.app/hellosello/issue/HEL-57)

Runs parallel to T01/T02 — different files. Fixes a **live defect**: the card currently
renders Add-to-basket on price-hidden products with no price condition at all.

**Files:** `src/modules/catalog/components/ProductCard.tsx`,
`src/modules/catalog/shop.ts` (make `profile_visible` optional)
*(the `ShopView` prop that feeds this gate is T02's line — see round 4, B2)*

- When the **seller has hidden a product's price** (`price_public = false`) from a non-owner, the
  card shall render no quantity control and no add-to-basket, and shall render a Request-pricing
  action naming that product (AC 3). **A merely unpriced public product (`price_public = true`,
  `price_per_gram` null) is OUT of scope** — ADR-0005 `:566-567` forbids the ask there, and the DB
  keeps the two states distinct on purpose (`20260816190000:96-97`: `price_public` exists *"so the
  UI can tell 'price on request' from 'price not set yet'"*).
  *(Re-scoped 2026-08-19 at T03's plan check. The original read "price is hidden from the viewer",
  which literally means `priceShown === false` and therefore demands the ask in exactly the cell
  the ADR forbids. `test-writer` reads this file, not the plan — so the loose wording would have
  produced a test that can never go green, and a builder fixing that test would re-introduce the
  collapse this check exists to prevent.)*
- When the viewer is the product's **owner**, the card shall render the buy row even where the
  price is unset or not public — gate is `!editing && (priceShown || viewerIsOwner)`, so the
  seller's own unpriced products keep their controls (ADR §6).
- When the card is in **edit mode**, it shall render no buy row at all — the tier editor needs
  that footer space (ADR-0004). Assert this explicitly: the owner-with-null-price case passes
  with or without the `!editing` guard, so nothing else catches its loss.
- When `viewerIsOwner` is not supplied, the card shall behave exactly as it does today, so
  `/present` is unchanged.
- When `profile_visible` is absent from a product, the card shall render **no** "Hidden" badge
  — seller state never renders in buyer mode.

## T04 — Per-product request pricing; retire the shop-level CTA · **S** · depends on: T03 **+ T02**  · [HEL-58](https://linear.app/hellosello/issue/HEL-58)

**Files:** `src/app/discover/actions.ts`,
`src/app/discover/[companyId]/RequestPricingActions.tsx` (retired),
`src/app/discover/[companyId]/BuyerShopView.tsx` (handler wiring)

- When a **non-connected** buyer requests pricing on a product, the system shall create a
  `pricelist_request` inbox item carrying that product's reference in `metadata` (AC 3, as
  amended at G3).
- When a **connected** buyer requests pricing on a product, the system shall create the same
  inbox item naming the product. *(rev 6 collapses both arms to one mechanism — round 4, B8
  found the chat arm had no design at all: no thread lookup, no message insert, no file, in a
  ticket sized S. Posting directly into an existing thread defers with the messaging slice.)*
- When a buyer has already asked about product A and then asks about product B, the system
  shall create a second ask — the dup-guard is per-ask **per-product**, never per-pair.
- When this ticket completes, the shop-level Request-pricing CTA shall no longer render.

## T05 — `get_discoverable_shop` gains the specification set · **M** · depends on: T01  · [HEL-59](https://linear.app/hellosello/issue/HEL-59)

> ⚠️ **`database.types.ts` is NOT reproducible from `supabase gen types` — found at T01 (2026-08-20).**
> The file carries an **undocumented hand-edit**: `update_deal_draft`'s four `Args` are the ONLY
> ones in the ~5000-line file with `| null` (`:5010,5013,5014,5015`), and the generator does not
> emit them that way. `src/modules/deals/actions.ts:275-279` passes `?? null` for all four, so a
> straight regeneration **breaks `tsc`** — and committing it silently breaks `updateDealDraft`.
> **Before committing any regeneration: `git diff -U0 src/types/database.types.ts` and confirm the
> only hunks are your own ticket's columns.** Any other hunk is pre-existing drift to surface, not
> a ride-along. T01 hit this and reverted the `update_deal_draft` hunk by hand.


AC 7 in full, plus `product.location` — which is what actually produces the location tabs.

**Files:** `supabase/migrations/<ts>_discoverable_shop_spec_columns.sql`,
`src/app/discover/companies.ts` (product mapper), `src/types/database.types.ts`

> ⚠️ **AMENDED — the Files line above is NOT what T05 shipped (2026-08-22).** Written after the
> fact, at Muskan's G4 ruling on item F, because T01 and T02 recorded their drift inline and T05
> did not. Every edit below had written authority; none was taken off-book. The point of the
> record is that the Files line is what a reviewer reads to size a ticket's blast radius, so
> unrecorded drift quietly makes that boundary untrue.
>
> **At `/build` (commit `731faf7`) — 6 files beyond the 3 declared:**
> - `e2e/discover-shop.spec.ts`, `supabase/tests/discoverable_shop_spec_columns_test.sql`,
>   `supabase/tests/run_discoverable_shop_spec_columns_test.sh` — the ticket's own tests. The
>   Files line simply never listed test files; T00–T04 have the same omission.
> - `src/modules/catalog/shop.ts` — the terpene derivation the RPC reproduces (`:249`) lives
>   here; the plan names it as the source of truth the SQL must match edge for edge.
> - `src/app/present/ShopView.tsx` — the location rule. Declared in the plan, not the ticket.
> - `src/app/discover/companies.test.ts` — the mapper's unit tests, same class as the tests above.
>
> **After G4, from Muskan's rulings on items A–D (2026-08-22) — 2 further files:**
> - `src/modules/catalog/components/ProductCard.tsx` — item C (the `Supplier code` row goes
>   owner-only) and item D (the spec list's bottom padding + one-row fade).
> - `src/app/globals.css` — item D's `.speclist-scroll` class.
> - plus re-edits of the migration, the SQL suite, `discover-shop.spec.ts` and `ShopView.tsx`
>   already listed above.
>
> **Gap this exposes in the pipeline, not yet written into `PIPELINE.md`:** the amend-the-ticket
> convention covers `/build` only. Nothing said what to do when a G4 *ruling* changes the diff,
> which is how items A–D landed outside every declared boundary with no place to record it.
> Muskan chose the amendment; the rule change was offered and not taken.

- When a verified buyer opens a visible product's detail face, the system shall show CBG, CBN,
  terpene percentage, cultivator, lineage, irradiation code, packaging material and resealable
  (AC 7).
- When the RPC returns a product, it shall return **no batch or lot list**, and shall derive
  `terpene_percent` server-side as *manual column first, representative-batch terpene sum as
  fallback* — matching `shop.ts:241` exactly, so buyer and seller never disagree.
- When the RPC returns pack sizes, it shall project `metadata -> 'pack_sizes'` only, never the
  whole `metadata` object (it carries the seller's private note).
- When the RPC returns a product, it shall omit `supplier_product_code` (G3: confidentiality).
- When a member of the **seller's own** company opens that seller from Discover, the RPC shall
  return their whole catalogue — site 7 gains `or p.company_id = public.current_company_id()`,
  mirroring the view. PRD §7 requires it and `is_connected_to_company` cannot supply it (a
  self-pair row is impossible under the canonical-order CHECK).
- When the function is re-created, the migration shall re-issue the full three-statement grant
  ritual.
- When the mapper builds a product, it shall derive `bundle_threshold_grams` /
  `bundle_price_per_gram` from `tiers[0]`, as `shop.ts:246-247` does.
- When T05 rewrites the product mapper, it shall **keep forwarding the seller's real
  `price_public`** (T02's criterion). T05 declares the same `companies.ts` product mapper in its
  Files, so it can silently undo that forward with every T02 test still green. The durable guard
  is a **mapper unit test both tickets run**, not a criterion in one of them.
  *(Added 2026-08-19 at T03's plan check.)*

## T06 — The connection override, written once and applied at all seven sites · **M** · depends on: T00  · [HEL-60](https://linear.app/hellosello/issue/HEL-60)

> ⚠️ **`database.types.ts` is NOT reproducible from `supabase gen types` — found at T01 (2026-08-20).**
> The file carries an **undocumented hand-edit**: `update_deal_draft`'s four `Args` are the ONLY
> ones in the ~5000-line file with `| null` (`:5010,5013,5014,5015`), and the generator does not
> emit them that way. `src/modules/deals/actions.ts:275-279` passes `?? null` for all four, so a
> straight regeneration **breaks `tsc`** — and committing it silently breaks `updateDealDraft`.
> **Before committing any regeneration: `git diff -U0 src/types/database.types.ts` and confirm the
> only hunks are your own ticket's columns.** Any other hunk is pre-existing drift to surface, not
> a ride-along. T01 hit this and reverted the `update_deal_draft` hunk by hand.


Decision 6. Carries the **G3-signed verification tightening**.

> ⚠️ **CORRECTED at /build T06 (2026-08-22): the tightening is on SITE 1 ONLY, not "three of the
> seven policies".** This header said three; its own bullet below says *"the signed tightening, on
> site 1 only"*, and `STATE.md` rev 6 agrees. The stale count is from a superseded ADR revision —
> rev 5's scope cut took the seven permission sites down to three. **But the effect is wider than
> one policy anyway, for a different reason:** `pricelist_item_public_select`, `plit_public_select`,
> `product_image_public_select` and `product_media_public_select` each nest
> `EXISTS (SELECT 1 FROM product …)`, and a policy subquery is RLS-filtered as the calling role — so
> one edit to `product_public_select` propagates to all four. Measured, not inferred (PLAN-T06 §3a).
> Unverified **and companyless** callers lose reads they have today.

> ⚠️ **AMENDED at /build T06 (2026-08-22) — two files beyond the list below**, recorded here as
> item F's G4 ruling requires, at the moment it happened rather than at the gate.
> - **`supabase/tests/discoverable_shop_spec_columns_test.sql`** — T05's suite asserts Bob
>   (StonePharm) sees **0** hidden GreenLeaf products. StonePharm is **actively connected** to
>   GreenLeaf, so T06 correctly breaks that. TEST7's negative arm repointed to Eva / Bavaria
>   (verified, unconnected), resolved **by company name** and guarded four ways so it cannot pass
>   vacuously. Declared in PLAN-T06 §7 at rev 3.
> - **`e2e/discover-shop.spec.ts`** — 🔴 **the same class, MISSED at planning and caught only by
>   `test-runner`.** Its AC-11 test asserted `location-menu-btn` never appears on a buyer's page —
>   true at T02, when a buyer could only ever see one location. T06 gives connected Bob a second
>   location (Montreal), so the dropdown correctly appears and a stale assertion fired. **The
>   production code is right**; Muskan ruled at T05's G4 (walk row 12) that the filter follows what
>   the *viewer* sees, not their role. Removed from the owner-chrome group, docstring corrected,
>   **and a positive test added** — T06's own behaviour had NO e2e coverage; the only thing watching
>   it was a test asserting the opposite. Mutation-proved (migration removed → fails
>   `location-menu-btn / Expected: visible`; restored → 11/11).
>
> **Why this is worth recording rather than just fixing:** the builder had already fixed this exact
> class in the SQL suite and still missed the e2e twin, because the declared Files list did not name
> it. A scope boundary hid a defect from the agent best placed to see it.

**Files:** `supabase/migrations/<ts>_connection_visibility_override.sql`,
`supabase/tests/` (pgTAP), `src/modules/deals/supabase/reads.ts` (the `getOwnCatalog`
company filter — cross-lane, but the leak is this migration's blast radius),
`src/types/database.types.ts`

- When `is_connected_to_company(seller)` is called by a member of a company with an **active**
  relationship to that seller, it shall return true; when the relationship is absent,
  suspended or ended, it shall return false.
- When a **connected** verified buyer loads a seller's shop, the system shall return every
  product including those with `profile_visible = false` (AC 5).
- When a connected verified buyer loads a product whose **price is hidden**, the system shall
  still return no price and no tiers (AC 6, decision 7) — connection never reveals a price.
- When a product's visibility **window** has expired, connection shall **not** override it.
- When a connection is **pending**, the buyer shall see only what the seller made visible.
- When the rule is applied, it shall touch **exactly three objects** — `product_public_select`,
  the `current_pricelist_item` public arm, and `get_discoverable_shop`. **`pricelist_item`,
  `product_image`, `product_media` and `pricelist_item_tier` policies are NOT touched**: they
  are not on the buyer's read path (the RPC and the view both bypass RLS), and
  `plit_public_select`'s inlined gate is ADR-0004's deliberate defense-in-depth (round 4, B5).
- When an authenticated member of an **unverified** company reads another company's `product`
  rows directly, the system shall return none — the signed tightening, on site 1 only.
- When a **seller** reads their own catalogue, the system shall return everything including
  hidden products, **even if their own company is not yet verified** — the `*_all` owner
  policies are not verification-gated and are not touched.
- When site 1 is rewritten, it shall first be diffed against `pg_policy.polqual` on the live
  database — never re-typed from the migration that first declared it (S5).
- When the migration completes, `product_media_public_select` shall no longer list `anon`, and
  `anon` shall hold no `SELECT` on `product_media` (S4).
- When the pgTAP suite runs, it shall assert **behaviour, not substrings** (round 4, B3): for
  each of the three changed doors — a direct `product` read, a view read, an RPC call — a
  connected buyer sees a hidden product and an unverified caller sees none. A substring check
  is unsatisfiable by design now, and could never detect a missing window anyway.
- When the seller's deal-line product picker is opened after this migration, it shall list
  **only the seller's own** products — `getOwnCatalog` (`deals/supabase/reads.ts:538-542`)
  gains the `company_id` filter it always intended. Widening site 1 makes its pre-existing
  leak strictly worse (round 3, B4).

## T07 — Server-enforced basket admission · **S** · depends on: T06  · [HEL-61](https://linear.app/hellosello/issue/HEL-61)

AC 10. `product_basket_line` is owner-scoped only today and never checks whether the buyer may
see the product — or afford to know its price.

**Files:** `supabase/migrations/<ts>_basket_admission.sql`,
`src/modules/basket/supabase/writes.ts`, `supabase/tests/` (pgTAP)

- When a buyer attempts to add a product they may not see, the server shall refuse and **no
  line shall appear** in their basket (AC 10).
- When a buyer attempts to add a product whose price is hidden from them, the server shall
  refuse (decision 3, PRD §6.5 — the rule is server-side, never the hidden control).
- When a **seller** adds their own product — including one that is hidden, or has no price set
  — the system shall allow it (the shipped flow; the owner arm).
- When any basket write runs, the test shall exercise the **upsert** path (`addToBasket`), not
  only the plain updaters — the upsert is the statement every real add goes through, and it is
  what the `FOR ALL` policy and the grants must both survive.
- *(Consequence, accepted: a buyer can no longer edit the pack count of a line whose product
  became invisible to them. PRD §7 puts that case out of scope for v1 — the line stays
  readable and deletable.)*
- When a buyer **updates** an existing basket line onto a product they may not see, the server
  shall refuse — the restrictive policy is **`FOR ALL`**, so its `WITH CHECK` runs on the
  insert and the conflict-update path alike. *(An INSERT-only policy is ornamental: `UPDATE` is
  granted table-wide, so a buyer inserts a legal line and PATCHes it onto a hidden product —
  round 3. But a column-REVOKE **breaks `addToBasket`**: its upsert payload includes
  `product_id`, and `ON CONFLICT DO UPDATE` needs UPDATE privilege on every payload column —
  round 4, B1. `FOR ALL` closes the hole with no privilege surgery.)*
- When the migration completes, `anon` shall hold no privileges on `product_basket_line`.
- When the server refuses an admission, `addToBasket` shall surface a user-facing refusal
  rather than an unhandled rejection.

## T08 — Ops housekeeping the ADR surfaced · **XS** · depends on: —  · [HEL-62](https://linear.app/hellosello/issue/HEL-62)

Two items the ADR flagged that no other ticket owns (round 4, N10). Neither is buyer-facing;
both are the kind of thing that rots quietly.

**Files:** `docs/deploy/cloud-migrations-pending.md`

- When the cloud ledger is read for ops, its `## PENDING (local only — NOT on cloud yet)`
  header at `:320` shall not be immediately followed by a `✅ APPLIED 2026-08-16` subsection
  at `:322` — the section is reconciled so it states one truth.
- When any migration in this slug re-creates a **view**, its criterion shall include re-issuing
  `GRANT SELECT … TO authenticated` and `REVOKE ALL … FROM anon` (T06's grant-ritual criterion
  covers functions only; Supabase's default ACL still hands `anon` everything on new relations).

---

## Ready checkpoint

| | T00 | T01 | T02 | T03 | T04 | T05 | T06 | T07 | T08 |
|---|---|---|---|---|---|---|---|---|---|
| **I**ndependent | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **N**egotiable | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **V**aluable | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **E**stimable | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **S**mall | XS | M | M | S | S | M | M | S | XS |
| **T**estable | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**Parallel-safe pairs** (no shared files): T03 ∥ T01 · T06 ∥ T02 · T06 ∥ T03.
~~T06 ∥ T01~~ — **struck 2026-08-19 at /build.** Both declare
`src/types/database.types.ts`, as does T05. Three tickets regenerate the same generated
file, so they conflict on merge even from separate worktrees. Generated files are shared
state even when the tickets are logically independent.

**Forced sequential:** T01 → **T02** → T05 (all three write `companies.ts` — round 4, B9) ·
T06 → T07 (T07's policy calls T06's helper) · T03 → T04 (T04 wires T03's hook) ·
T03 → T02 (T02 passes the prop T03's gate consumes) ·
**T02 → T04** (added 2026-08-19 at /build: T04's declared Files include
`BuyerShopView.tsx` "(handler wiring)" — the file **T02 creates**. T04 listed only T03) ·
T01 / T05 / T06 share `database.types.ts` (see above).

**⚠️ Worktrees do NOT buy parallelism for most of these.** `supabase/config.toml` pins
`project_id = "hello-sello-design"` on fixed ports (54321/54322), so **every worktree shares
one Docker Supabase stack** — a `supabase db reset` in one wipes the other's data mid-run.
A ticket is only worktree-safe if it needs no local DB. On that test: **T03** (pure-node
`renderToStaticMarkup`, no jsdom, no DB) and **T08** (docs only) are worktree-safe; T00, T01,
T02, T04, T05, T06 and T07 all queue on the one stack. T03's *tests* are DB-free but its G4
visual walk is not — that returns to the main tree.
Worktree base: cut from **`claude/muskan/work`**, never `origin/main` (what `claude
--worktree` defaults to) or `origin/dev` — neither carries the pipeline skills (STATE.md's
base-branch trap).

## Traceability — every acceptance criterion has a home

| AC | Ticket |
|---|---|
| 1 shop chrome, no edit control | T01 + T02 |
| 2 price + full tier ladder | T02 (reuses shipped HEL-50 ladder) |
| 3 price-hidden → no controls + Request pricing | T03 + T04 |
| 4 locked catalogue + Connect | T02 |
| 5 connected sees hidden products | T06 |
| 6 connected still sees "Price on request" | T06 |
| 7 full spec set, no lots | T05 |
| 8 quantity reaches a rung → rung price | T02 (shipped resolver; walk-only) |
| 9 order without connection | **split to its own slug** (ADR §9) — carries decision 11 + decision 2's second half with it; T02 closes the dead end it leaves |
| 10 server refuses inadmissible basket line | T07 |
| 11 no owner chrome anywhere | T02 + T03 |
