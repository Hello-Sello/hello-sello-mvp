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
