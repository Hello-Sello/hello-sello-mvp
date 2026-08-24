# 0022 buyer-shop-view — RESEARCH

> Written by the `researcher` agent at `/spec` step 1 (2026-08-18), then spot-verified
> by the orchestrator against `DECISIONS.md`, `CONTEXT.md`, and the plan file.
> Every claim carries a citation. CONFIRMED = read directly. INFERRED = reasoned.

## What exists (spec)

### The page being replaced
- **`src/app/discover/[companyId]/page.tsx:1-227`** — CONFIRMED. Hero strip, connect
  actions, and a hand-written **2-up mini tile** (lines 160-197) — a *local* component,
  not `catalog/components/ProductCard.tsx`. Shows cultivar/THC/CBD/pack size/origin as
  one text line + `pricePerGram` or "Price on request". No tiers, no flip, no quantity
  stepper, no basket wiring. STATE.md's gap table (`STATE.md:34-44`) is accurate.
- **`src/app/discover/companies.ts:127-207`** (`getDiscoverableShop`) — CONFIRMED it
  **drops `tiers` on the floor**. `ShopRow` / `DiscoverProduct` (lines 136-168) have no
  `tiers` field although the RPC returns one.

### The shop component to reuse
- **`src/app/present/ShopView.tsx:190-197`** — CONFIRMED already **dual-role**, not
  owner-only. Takes `viewerCanManage?: boolean` (default `true`); when `false` every
  owner control (SaveBar, Manage shop, drawers, banner/logo edit) hides, while banner,
  info boxes, location tabs and the 4-up grid render unconditionally
  (lines 573, 596-597, 618-630, 661).
- `handleAddToBasket` (`ShopView.tsx:555-565`) is documented as *"Available to every
  viewer, owner or buyer — not owner-only chrome"* and is wired to every card regardless
  of `viewerCanManage` (line 655).
- **`src/modules/catalog/components/ProductCard.tsx:176,178`** — CONFIRMED
  `editing?: boolean` and `onAddToBasket?: (productId, qty, packIndex) => void` exist
  exactly as `STATE.md:56-59` claims.

### The read door (locked)
- `get_discoverable_company` / `list_discoverable_companies` / `get_discoverable_shop` —
  CONFIRMED live at **`supabase/migrations/20260816190000_tier_ladder_contract.sql:80-154`**
  (latest re-declaration; supersedes `20260614150000` and `20260617090000`).
  Gate is `is_caller_verified()` only — **no connection-state check**.
- `current_pricelist_item` view redeclared at the same migration, lines 44-69.
- **One-read-door rule** — `docs/architecture/ARCHITECTURE-NOTES.md:423`: *"Any new
  feature that needs a price must read through that same door"* (the view +
  `resolveTierPrice`, `src/modules/catalog/pricing.ts:36`).

### The basket
- `addToBasket` (`src/modules/basket/supabase/writes.ts:19-39`) — client-side upsert on
  `owner_person_id,product_id`.
- `getMyBasket` (`src/modules/basket/supabase/reads.ts:15-94`) — groups by
  `product.company_id`, resolves the relationship id for foreign sellers via
  `readCurrentPrices` (`src/modules/catalog/pricelist.ts:62-67`, reads
  `current_pricelist_item`).
- Table: `supabase/migrations/20260707100000_product_basket_line.sql:11-30`.

### Catalogue openness L0/L1/L2
- Defined `docs/architecture/CONTEXT.md:168`; locked `docs/decisions/DECISIONS.md:1010-1011`
  (2026-06-14). Openness = `product.profile_visible` × `product.price_public`,
  audience-scoped to **verified members**, **independent of connection state**.
- Enforced in three places, identically: RLS `pricelist_item_public_select`
  (`20260614180000_pricelist_item_public_select_profile_visible.sql:16-23`), the
  `current_pricelist_item` public arm (`20260816190000:59-67`), and
  `get_discoverable_shop`'s WHERE clause (`20260816190000:143-146`).

## Backend reality (Q2a / Q2b)

### Q2a — can a buyer read a foreign seller's prices? **CONFIRMED YES, and NOT connection-gated.**
Any **verified authenticated** caller — connected or not — reads
`current_pricelist_item.tiers` / `.price_per_gram` for a product with
`price_public = true AND profile_visible = true`. The view's public arm
(`20260816190000_tier_ladder_contract.sql:59-67`):

```
p.deleted_at IS NULL AND p.profile_visible
AND (p.visibility_start IS NULL OR p.visibility_start <= current_date)
AND (p.visibility_end   IS NULL OR p.visibility_end   >= current_date)
AND p.price_public
AND public.is_caller_verified()
```

`is_caller_verified()`
(`20260617090000_sec01_caller_verified_discover_gate.sql:26-34`) checks only that the
**caller's own** company is `verification_status = 'verified'`. It never looks at a
relationship between caller and seller.
`GRANT SELECT ... TO authenticated; REVOKE ALL ... FROM anon` (`20260816190000:71-72`).

**Negative space, CONFIRMED:** `anon` cannot read at all. An unverified authenticated
caller → `is_caller_verified() = false` → 0 rows. `price_public = false` → `price_per_gram`
and `tiers` return NULL through `get_discoverable_shop`'s
`CASE WHEN p.price_public THEN … END` (`20260816190000:121-122`).

**Provenance of the "verified, not connected" rule** (orchestrator-verified, since this
contradicts a live memory):
- `DECISIONS.md:114` — *"Shop prices: visible only to connected companies."* This is the
  **original** rule and it is **explicitly superseded**.
- `DECISIONS.md:116` (2026-05-14) — company-configurable, 3 modes. Its own text reads:
  *"**Supersedes the previous 'visible only to connected companies' rule above.**"*
- `DECISIONS.md:961` (2026-06-10) — per-product `price_public`, default OFF.
- `DECISIONS.md:1010-1011` (2026-06-14, soft-openness) — *"Products/prices show to
  logged-in **verified members** only"*, justified by German HWG advertising risk
  (verified members ≠ open internet). This is the rule the shipped code implements.

⚠️ **Live tension, unresolved:** `CONTEXT.md:165`, added at *this slug's triage
yesterday and Muskan-approved*, defines Buyer Shop View as *"The seller's Present shop
as a **connected** buyer sees it."* That word contradicts the shipped gate. `/spec` must
settle which is right and, if the connection gate wins, record it as an overrule of the
2026-06-14 lock.

### Q2b — is the basket write gated? **CONFIRMED NO, not at all.**
`product_basket_line`'s only RLS policy is pure owner-scoping
(`20260707100000_product_basket_line.sql:26-30`):

```sql
create policy basket_line_owner_all on public.product_basket_line
  for all to authenticated
  using (owner_person_id = auth.uid())
  with check (owner_person_id = auth.uid());
```

No reference to `profile_visible`, `price_public`, or any relationship state — **no
source-product check whatsoever**. `addToBasket` (`writes.ts:19-39`) inserts with only an
FK to `product(id)`.

**Negative-space gap, real, low severity:** any authenticated (even unverified) person
holding a product UUID can add that product to their own basket — including an L0-locked
product, or one from an unconnected seller. The *price* comes back NULL (the read path is
correctly gated), but the line itself is not blocked, and neither are downstream
`sendBasketGroup` / `createDeal`. INFERRED severity: low, because a UUID must be obtained
out-of-band and no price leaks — but it is a genuine spec question.

## Conflicts

### 1. A competing, never-built plan for this exact feature
`docs/superpowers/plans/2026-07-07-product-basket.md` **Tasks 9–11** (lines 1386-1650).
CONFIRMED never built: `get_connected_shop`, `getConnectedShop`, and
`src/app/discover/[companyId]/shop/` return zero matches in the repo. It differs on four
axes:

| | Tasks 9-11 (July, unbuilt) | 0022 as triaged |
|---|---|---|
| Route | **new** `/discover/[companyId]/shop` | rebuild `/discover/[companyId]` in place |
| Read door | **new** `get_connected_shop` RPC | shipped `get_discoverable_shop` + `current_pricelist_item` |
| Gate | `relationship.status = 'active'` **required** (line 1458-1463) | verified caller, connection-agnostic |
| Fidelity | full — `product_batch`, `product_media`, `product_image`, `metadata`, all spec columns | whatever `get_discoverable_shop` returns today |

It predates the shipped tier-ladder contract (2026-08-16) but postdates the soft-openness
lock (2026-06-14). It is **stale in a second way**: its returns list
`bundle_threshold_grams` / `bundle_price_per_gram` (plan lines ~1420, 1440), columns that
migration C **dropped** from `pricelist_item` on 2026-08-16.

Building it as written would create **two parallel, inconsistent gates for the same
data**, violating the one-read-door rule (`ARCHITECTURE-NOTES.md:423`).
Project `CLAUDE.md` "Loose ends" still lists Tasks 9-11 as live independent work.

### 2. A superseded line that reads live on a skim
`DECISIONS.md:114` (see Q2a). Not a real conflict once traced, but it is the most likely
source of a "prices are connection-gated" memory.

### 3. DEV-113 (Linear, Backlog, unowned)
*"Onboarding flow: select the specific shop you want to show to a new buyer you're
connecting to."* Touches exactly the open question of which location/shop tabs a buyer
sees. Not referenced by `STATE.md` or `CONTEXT.md`.

## Claims on this area
- `docs/muskan-build/0022-buyer-shop-view/STATE.md` — the active work order (triage only, no lock).
- `docs/architecture/CONTEXT.md:164-168` — `Buyer Shop View` + `Catalogue openness (L0/L1/L2)`, added at triage 2026-08-18.
- `docs/superpowers/plans/2026-07-07-product-basket.md` Tasks 9-11 — competing unbuilt plan (above).
- project `CLAUDE.md` "Loose ends" — still lists Tasks 9-11 as open.
- Linear **DEV-12** (Done, 2026-05-20) — original price-visibility-granularity doubt; resolved into the shipped per-product model. Historical.
- Linear **DEV-113** (Backlog) — buyer-facing shop-selection; adjacent, unowned.
- **HEL-50** (Done, 2026-08-14, `docs/muskan-build/0021-tier-ladder/TICKETS.md`) — built the "See all prices" ladder popover for `ProductCard` **read mode**. This is the exact UI 0022 reuses; already shipped and tested.

## Open questions for Muskan
1. Prices to any verified buyer, or **connected buyers only**? The shipped code says
   verified-only; `CONTEXT.md:165` (yours, yesterday) says connected. One must give.
2. Is the July Product-Basket plan (Tasks 9-11) formally **superseded** by 0022, or does
   it need a dead/merged marker so it stops reading as live intent?
3. What does the buyer see at **L0** (no visible products)? Should a *connected* L0 buyer
   see something different from an unconnected one?
4. Close the `product_basket_line` write gap now (constraint / trigger / re-validate at
   Send), or accept it and rely on the NULL price?
5. Does the buyer view need **location/shop tabs** at all, given DEV-113?
6. Replace `/discover/[companyId]` **in place**, or a distinct child route? Affects
   whether `ConnectActions` / `RequestPricingActions` move or coexist.

**Key files for `/spec`:** `src/app/discover/[companyId]/page.tsx` ·
`src/app/discover/companies.ts` · `src/app/present/ShopView.tsx` ·
`src/modules/catalog/components/ProductCard.tsx` · `src/modules/basket/{writes,reads}.ts` ·
`supabase/migrations/20260816190000_tier_ladder_contract.sql` ·
`supabase/migrations/20260707100000_product_basket_line.sql` ·
`docs/superpowers/plans/2026-07-07-product-basket.md` (Tasks 9-11) ·
`docs/architecture/ARCHITECTURE-NOTES.md:421-423`

---

# Approaches (design)

> Written by the `researcher` agent at `/design` step 1 (2026-08-19), then
> **spot-verified by the orchestrator against the migrations and `src/`**. Two of its
> claims did not survive that check — both corrections are recorded below the report,
> and both make the work BIGGER, not smaller. Read the corrections before the report.

## ⚠️ Orchestrator corrections — verified against the tree, 2026-08-19

### Correction 1 — the rule lives in **seven** places, not three
The report (and `RESEARCH.md`'s spec-stage half) says the `profile_visible` gate is
enforced in three identical places. **CONFIRMED WRONG.** Every current gate site, each
read at its *latest* declaration (the stale-redeclare trap — `pricelist_item_public_select`
was cited from `20260614180000`, which two later migrations supersede):

| # | Object | Kind | Latest declaration |
|---|---|---|---|
| 1 | `product_public_select` | RLS on `product` | `20260617090100_sec02_revoke_anon_catalogue_read.sql:28-31` |
| 2 | `pricelist_item_public_select` | RLS on `pricelist_item` | `20260617090100:37-44` |
| 3 | `product_image_public_select` | RLS on `product_image` | `20260617090100:48-53` |
| 4 | `product_media_public_select` | RLS on `product_media` | `20260705120100_product_media.sql:47-51` |
| 5 | `plit_public_select` | RLS on `pricelist_item_tier` | `20260814120000_tier_ladder_expand.sql:71-82` |
| 6 | `current_pricelist_item` public arm | view | `20260816190000_tier_ladder_contract.sql:62` |
| 7 | `get_discoverable_shop` WHERE | RPC | `20260816190000:143` |

This *strengthens* the helper-function recommendation (7 call sites collapse to 1, not 3),
and it raises a scope question the report never asked: **does the connection override land
on all seven, or only on the two the buyer surface actually reads?** The ADR must answer it.

### Correction 2 — `get_discoverable_shop` cannot satisfy AC 7 today
Neither the report nor the spec-stage sweep noticed this. `get_discoverable_shop`
returns **16 columns** (`20260816190000:83-100`); `ShopProduct` — the type `ShopView` and
`ProductCard` actually consume (`src/modules/catalog/shop.ts:43-86`) — carries ~28.
**Missing, and every one of them named in PRD AC 7 or decision 9:**

`cbg_percent` · `cbn_percent` · `cultivator` · `lineage_parent_a` · `lineage_parent_b` ·
`irradiation_code` · `packaging_material` · `resealable` · `terpPercent` · `location`
(the location tabs, decision 9) · `packSizes` · `media`

Correctly absent and to be **kept** absent: `batches` (AC 7 — "no batch or lot list").
Note `terpPercent` is derived seller-side from the representative batch's terpene rows
(`shopMap.ts`, via `getMyShop`) — the buyer path must derive it **server-side**, because
handing the buyer batches to derive it from would violate AC 7.

**Consequence:** the migration in this slug is not "add one predicate". It is a
`DROP + CREATE` column expansion of a `SECURITY DEFINER` RPC — which resets grants, so the
3-statement grant ritual applies (`20260816190000:152-154`). Sizing the tickets on the
report's assumption would under-scope the work by an entire ticket.

---

## The report, as returned

### Q1 — `BuyerShopView` wrapper vs more props on `ShopView`

**Grounding (CONFIRMED, whole file read):** buyer mode = 3 props — `viewerCanManage`
(default `true`), `buyerContext` (a slot), `emptyState` (a slot). A 4th
(`showLocationFilter`) was added and withdrawn (`NOTES.md:111-112`).
`viewerCanManage` gates exactly **6 render sites**, all shallow top-level JSX:
`ShopView.tsx:587` (SaveBar) · `:611` (`PresentBanner canManage`) · `:612` (`canEditLogo`)
· `:635` (Add-shop / Assign-products pill row) · `:678` (AddProductTile) · `:627` →
`EmptyShop`'s own `canManage` branch (`:1241,1244,1248`).

Everything else in the 1100-line file — `editing` state, the `pendingProductEdits` draft
tree, batch insert/edit/delete, ladder validation (`:305-324`), Present mode (`:367-389`) —
is owner-only logic a buyer view **literally cannot reach**, because the only door into it
(`onManage`) is itself gated by `canManage` (`:610-611`). So the file is not *logically*
entangled — it is *file-level* entangled: a buyer-only fix edits the component the
seller's whole edit flow lives in.

`buyerContext` / `emptyState` are **slots, not behaviour flags** — additive and safe. The
dangerous growth is specifically the `viewerCanManage`-shaped booleans, and the record
shows that growth already happened once and was caught.

| Option | Plain English | Cost to undo in 6 months | What breaks if wrong |
|---|---|---|---|
| Keep growing props | Each buyer difference = one more boolean on the seller's shipped component | Low per prop, but they accumulate permanently; removing one later risks an untested owner-path regression (buyer mode was itself untested for weeks, `NOTES.md:81`) | Boolean-prop explosion — N×M combinations become unauditable. **4 of the 6 G2 defects were exactly this**: owner chrome leaking into buyer mode because a flag was missed |
| **`BuyerShopView` wrapper** | A component that calls `ShopView` with buyer-fixed props and owns buyer-only surrounding chrome | Cheap to delete — additive, never touches `ShopView`'s internals | If a future buyer difference needs *internal* rendering changes beyond the 3 slots, the wrapper can't reach them — you'd still add a prop, just from one caller |
| Presentational core + two role shells | Extract the grid + info row into a pure component; `SellerShop` / `BuyerShop` own their own chrome | High now (1100 shipped lines, no existing split seam) — cheapest to maintain after | Regression risk on the **seller** side during the split; a bad split scatters shop logic across 3 files |
| Compound components (`<Shop.OwnerControls>`) | Caller assembles from named children instead of flags | Medium | Pays off at 3+ variants; there are 2. Over-engineering today |
| `mode: 'owner' \| 'buyer'` | One discriminated prop replaces the boolean | Medium — a rename | Doesn't solve growth: same 6 branches, differently spelled |

**Industry practice.** The React community names this the **"boolean trap"** — components
accreting toggle props per mode until cross-combination behaviour is unpredictable; the
standard fix is composition once a component passes ~5 rendering booleans, not more props
([spicefactory.co](https://spicefactory.co/blog/2019/03/26/how-to-avoid-the-boolean-trap-when-designing-react-components/),
[Imply Engineering](https://imply.io/blog/an-opinionated-guide-to-component-apis/)).
Discriminated unions are the TypeScript-native form when variants are mutually exclusive
([oneuptime.com](https://oneuptime.com/blog/post/2026-01-15-typescript-discriminated-unions-react-props/view)).

**Recommendation:** a **`BuyerShopView` wrapper now, not a core/shell split** — `ShopView`
sits at 3 tolerable props over 6 shallow branch sites, below the boolean-trap threshold,
and the split's risk to a just-stabilised owner surface outweighs today's benefit. The
wrapper stops the *next* buyer need becoming a 4th prop; needing to reach inside `ShopView`
beyond the 3 slots is the trigger to revisit the split then.

### Q2 — the permission-rule migration

**Grounding (CONFIRMED):** `is_caller_verified()`
(`20260617090000:26-34`) is `STABLE SECURITY DEFINER`, `set search_path = public`, wrapping
one `EXISTS`. It is **one of at least five identically-shaped helpers**:
`is_relationship_member` (`20260607170000_rls_policies.sql:79-86`), `card_relationship_member`
(`:88-94`), `is_workspace_member` (`:96-103`), `is_person_connected`
(`20260724100500_is_person_connected.sql:10-22`). **A repeated project idiom, not a one-off.**

The exact "connected" predicate is **already written twice, inline**, as a `CASE` arm in
`list_discoverable_companies` (`20260617090000:74-79`) and `get_discoverable_company`
(`:146-151`):

```sql
exists (select 1 from public.relationship r
  where r.deleted_at is null and r.status = 'active'
    and r.company_a_id = least(public.current_company_id(), c.id)
    and r.company_b_id = greatest(public.current_company_id(), c.id))
```

So extracting it **removes** duplication rather than adding an abstraction.

**`relationship_status` has no `pending` row** — CONFIRMED, the seed
(`20260607090001_lookups_and_seeds.sql:326-329`) is `active | suspended | ended` only. A
pending connection lives in `pending_inbox_item.status='pending'`, a different table. This
**structurally confirms** the PRD's "pending ≠ connected" edge case: a pending request has
no `relationship` row at all, so `r.status='active'` already excludes it with zero extra
logic.

**The index already exists and is correctly shaped** — `uq_relationship_pair_active ON
relationship(company_a_id, company_b_id) WHERE deleted_at IS NULL`
(`20260607090003_phase2_deal.sql:33-34`) exactly matches the `(least, greatest)` equality
lookup. No new index needed.

**Performance.** An `EXISTS` inlined in an RLS policy is evaluated **per row the planner
considers**; wrapping it in a `STABLE` function lets Postgres evaluate it once per
statement — a benchmarked ~10× improvement (450 ms → 45 ms at 10k rows,
[Scott Pierce](https://scottpierce.dev/posts/optimizing-postgres-rls/)); Supabase's own
troubleshooting docs and independent writeups converge on the same STABLE-function-plus-index
idiom ([Bytebase](https://www.bytebase.com/blog/postgres-row-level-security-footguns/),
[Supabase docs](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv)).
This project already writes `STABLE SECURITY DEFINER` for every such helper — not a new
practice, the local convention.

**Recommendation:** a new `STABLE SECURITY DEFINER` helper following the
`is_relationship_member` / `is_person_connected` shape, called from every site — the
project's own idiom (5+ precedents), the index it needs already exists, and it collapses
duplicated copies of the clause into one.

### Q3 — server-side basket admission

**Grounding (CONFIRMED):** `product_basket_line`'s only RLS
(`20260707100000_product_basket_line.sql:26-30`) is pure ownership on both `USING` and
`WITH CHECK` — no reference to `product`, `profile_visible`, `price_public`, or any
relationship. `addToBasket` (`src/modules/basket/supabase/writes.ts:19-39`) is a plain
client-side `.upsert()` — no RPC, no server check beyond RLS.

**Project precedent, counted:** `SECURITY DEFINER` appears **195 times across 81 migration
files**; `WITH CHECK` **88 times across 30**. Every write carrying a **cross-table business
rule** goes through a `SECURITY DEFINER` RPC — `accept_person_connection`, `claim_deal_ticket`,
`create_deal_draft*`, and `onboard_company` (made `SECURITY DEFINER` specifically to enforce
a rule beyond ownership, DEV-88). Plain `WITH CHECK` is reserved for simple self-scoping.
**`product_basket_line`'s write path is the outlier** — the one place a client upsert
bypasses the convention this project otherwise uses for anything with a rule attached.

| Option | Cost to undo in 6 months | What breaks if wrong |
|---|---|---|
| `WITH CHECK` on the existing policy | Medium — re-inlines the visibility rule one more time unless it calls the shared helper | The rule now lives in one more place; correctly enforced, but only if it calls the helper |
| `BEFORE INSERT` trigger | High to reason about — invisible at the call site; **no other write path in this codebase uses a trigger for a permission rule** (triggers here are lifecycle, not authorization). A new pattern, not a precedent | Trigger exceptions surface as raw DB errors unless translated — worse UX than a checked RPC |
| **`SECURITY DEFINER` RPC** | Low — the dominant pattern already (195 occurrences); undoing means editing one function body | None new; AC 10's "rejected admission produces no basket line" maps directly onto "RPC raises, no row written" |
| FK to a permission-filtered view | Very high — Postgres FKs can't target views without extra machinery; **grep found no FK-to-view anywhere** in the migrations | Brittle, unprecedented, unrecognisable to anyone else on the project |

**Industry practice.** The Supabase-ecosystem consensus: RLS handles simple row-ownership
scoping; anything with a cross-table business rule goes through a `SECURITY DEFINER` RPC so
the check runs once, server-side, with a typed response rather than a raw constraint
violation ([makerkit.dev](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices)).

**Recommendation:** move `addToBasket` to a `SECURITY DEFINER` RPC calling the same
visibility helper before the upsert — matches the codebase's dominant convention (195 vs.
zero trigger-based permission checks) and satisfies AC 10 with a typed error.

### Q4 — the container / fit decision

**Grounding (CONFIRMED):** `src/app/discover/[companyId]/page.tsx:33` — the whole page is
one `<div className="mx-auto flex w-full max-w-xl flex-col px-2 pb-10">`. There is no inner
container split: back-link, hero, identity, about, `ConnectActions` (`:88-93`) and the local
`Catalogue` function (`:104-145`) are one nested tree inside that single 576 px wrapper.
**There is no existing hero/catalogue container boundary** — a 1400 px container has to be
*introduced*, not merely widened.

**Variant A is already locked** (`NOTES.md:90,119-120`): "adopts Present's 1400px container
wholesale". Variant C (catalogue breaks out) was the explicit alternative and lost.
`/design` is not re-litigating it — only deciding *how*.

So the open part is narrower: **where do the hero and `ConnectActions` go inside the wide
container?** `ShopView.tsx:617` already exposes `{buyerContext}`, documented as rendered
beneath the info boxes for exactly this kind of buyer-only strip (`:199-201`).

**Recommendation:** compose the buyer page as `PresentBanner` → `buyerContext` (carrying
`ConnectActions`) → `ShopInfoRow` → grid — literally `ShopView`'s render order with
`ConnectActions` dropped into the slot that already exists for the purpose, rather than a
hand-built page layout. Risk if wrong: elements left at the old 576 px nested inside a
1400 px wrapper stretch and look broken — the same defect class the G2 walk caught 4 times.

