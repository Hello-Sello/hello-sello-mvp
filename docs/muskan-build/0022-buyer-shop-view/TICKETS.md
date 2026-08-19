# 0022 · buyer-shop-view — tickets

**Source:** ADR-0005 (rev 6, G3-accepted 2026-08-19 — four checker rounds folded in) + PRD 0022 (G1) + the G2 variant-A
contract. Sized S/M/XS, INVEST-checked, EARS criteria.
**Hard rule:** tickets running in parallel touch different files.

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

## T00 — Seed products across the visibility × price matrix · **XS** · depends on: —

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

## T01 — `get_discoverable_company` gains the shop chrome · **M** · depends on: T00

The links row, tags, address and warehouse line — AC 1 surface. **Not** the location tabs:
those come from `product.location` in T05 (ADR §5, corrected).

**Files:** `supabase/migrations/<ts>_discoverable_company_shop_chrome.sql`,
`src/app/discover/companies.ts` (company mapper only), `src/types/database.types.ts`

- When a verified buyer calls `get_discoverable_company` for a verified seller, the system
  shall return `links`, `locations`, `tags`, `address`, `warehouse_location` and `updated_at`
  alongside the existing eleven columns.
- When the RPC projects `company.metadata`, it shall project the **named keys only**
  (`links`, `locations`) and never the whole object (ADR §4 leak rule).
- When the function is re-created, the migration shall re-issue the full three-statement grant
  ritual — `revoke all … from public`, `grant execute … to authenticated`,
  `revoke execute … from anon` — because `DROP + CREATE` resets grants.
- When the company mapper runs, it shall reuse `parseLinks` and `deriveInitialLocations` so
  buyer and seller parse identical data identically.

## T02 — `BuyerShopView` + the page at variant-A width · **M** · depends on: T01

The G2 contract: reuse `ShopView` + `ProductCard`. **A new card component is a build failure,
not a style choice.**

**Files:** `src/app/discover/[companyId]/BuyerShopView.tsx` (new),
`src/app/discover/[companyId]/page.tsx`, `src/app/discover/companies.ts` (**the
`DiscoverProduct → ShopProduct` product mapper** — round 4, B9: slice 1 promises "real cards",
which needs `ShopProduct[]`; T01 scopes `companies.ts` to the *company* mapper only and T05's
column work is slice 2, so without this the mapper had no owner), `src/app/present/ShopView.tsx`
(**two lines: the stale comment, plus `viewerIsOwner={viewerCanManage}` on the `ProductCard`
call** — round 4, B2), `src/modules/basket/components/BasketDrawer.tsx`,
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
- When this ticket completes, `ShopView` shall carry **no new state and no new branch** — one
  prop pass-through and one comment — and the prototype route shall be gone from the tree.

## T03 — `ProductCard`: the price gate and the request-pricing hook · **S** · depends on: —

Runs parallel to T01/T02 — different files. Fixes a **live defect**: the card currently
renders Add-to-basket on price-hidden products with no price condition at all.

**Files:** `src/modules/catalog/components/ProductCard.tsx`,
`src/modules/catalog/shop.ts` (make `profile_visible` optional)
*(the `ShopView` prop that feeds this gate is T02's line — see round 4, B2)*

- When a product's price is hidden from the viewer, the card shall render no quantity control
  and no add-to-basket, and shall render a Request-pricing action naming that product (AC 3).
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

## T04 — Per-product request pricing; retire the shop-level CTA · **S** · depends on: T03

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

## T05 — `get_discoverable_shop` gains the specification set · **M** · depends on: T01

AC 7 in full, plus `product.location` — which is what actually produces the location tabs.

**Files:** `supabase/migrations/<ts>_discoverable_shop_spec_columns.sql`,
`src/app/discover/companies.ts` (product mapper), `src/types/database.types.ts`

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

## T06 — The connection override, written once and applied at all seven sites · **M** · depends on: T00

Decision 6. Carries the **G3-signed verification tightening**: three of the seven policies
gain `is_caller_verified()` and unverified members lose reads they have today.

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

## T07 — Server-enforced basket admission · **S** · depends on: T06

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

## T08 — Ops housekeeping the ADR surfaced · **XS** · depends on: —

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

**Parallel-safe pairs** (no shared files): T03 ∥ T01 · T06 ∥ T02 · T06 ∥ T03 · T06 ∥ T01.
**Forced sequential:** T01 → **T02** → T05 (all three write `companies.ts` — round 4, B9) ·
T06 → T07 (T07's policy calls T06's helper) · T03 → T04 (T04 wires T03's hook) ·
T03 → T02 (T02 passes the prop T03's gate consumes).

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
