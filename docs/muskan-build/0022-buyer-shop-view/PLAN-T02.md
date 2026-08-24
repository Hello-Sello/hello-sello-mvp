# PLAN — T02 · `BuyerShopView` + the page at variant-A width

**Ticket:** [HEL-56](https://linear.app/hellosello/issue/HEL-56) · **M** · depends on T01 ✅
**Rev:** 3 — `plan-checker` rounds 1 **and 2** folded in (**9 + 8 blocking, all accepted**).
**⚠️ Budget SPENT and the loop did NOT converge** — round 2's eight were all new, and **five
attacked rev 2's own fold-ins**, including one that flatly failed a ticket criterion on a false
justification. `critic` + `consistency` carry rev 3's unchecked edits; a 3rd round is Muskan's call.

## The contract this ticket is judged against

G2 locked **variant A**: the buyer view REUSES `ShopView` + `ProductCard`.
**A new card component is a build failure, not a style choice** (STATE.md `## Locked`).
ADR §1: a `BuyerShopView` **wrapper**; `ShopView` gains **no behaviour prop**.

## Ground truth (verified against code, line cites corrected per N7)

| fact | evidence |
|---|---|
| `ShopView` already has `viewerCanManage`, `buyerContext`, `emptyState` | `ShopView.tsx:190-212` |
| `get_discoverable_shop` returns `tiers jsonb`; `companies.ts` **drops it** | live `pg_get_function_result` (15 cols) |
| the RPC returns **no `location`** | same dump → location tabs wait for T05 |
| `ProductCard.viewerIsOwner` defaults **true** (T03) | `ProductCard.tsx:174` |
| the Hidden badge gates on `p.profile_visible === false` **exactly** | `ProductCard.tsx:504` |
| `bundle_*` derive from `tiers[0]` | `shop.ts:`**`254-255`** *(rev 1 cited 246-247)* |
| `LocationGroup`'s header block | `LocationGroup.tsx:`**`74-101`** *(rev 1 cited the prop docstrings)* |
| BasketDrawer's null recipient | `BasketDrawer.tsx:`**`197-198`** |
| the e2e reuse marker exists | `data-testid="product-card"`, `ProductCard.tsx:386` (N1) |
| T00's seed states | `seed.sql:424-428`, rungs `:490-507` — AUR-1A hidden-price, 1B priced rung-less, 1E priced + **2 rungs**, 1C/1D hidden (N10) |

## Three mappers, not one — and one type retired (B2, B3)

Rev 1 assumed a single `DiscoverProduct → ShopProduct` mapper. Wrong twice over.

### (a) `DiscoverProduct` is RETIRED — the simplification, not an addition

`DiscoverProduct` and `getDiscoverableShop` have **exactly one consumer**: `page.tsx` (`:8,109,160`),
the file this ticket rewrites. `page.tsx:160` even declares a *local* `ProductCard` shadowing the
real one — the teaser tile being deleted.

`DiscoverProduct.images` is `string[]` of **resolved URLs**, with id and path discarded
(`companies.ts:253-257`). `ShopProduct.images` is `ProductImage[]` = `{id, path}`, consumed as
`mediaUrl(images[idx].path)` and `key={im.id}` (`ProductCard.tsx:310,441-443`). **A
`DiscoverProduct → ShopProduct` mapper is therefore unimplementable** — the data it needs was
already thrown away one layer up.

**So: delete the `DiscoverProduct` type and map `ShopRow → ShopProduct` directly inside
`getDiscoverableShop`** (`ShopRow.images` is `{id, path, position}[]`, `companies.ts:220` — the
shape `ProductImage` wants). One type gone, one mapping layer gone, and the bug is fixed at its
source rather than patched downstream.

### (b) `DiscoverCompanyProfile → Shop["company"]` — a mapper NO ticket owned (B2)

`ShopView` takes `shop: Shop`, whose `company` is **snake_case carrying storage PATHS**
(`shop.ts:107-127`). T01 shipped `mapDiscoverCompanyRow` returning **camelCase with resolved
URLs**. Feeding those to `ShopView` is a **live defect that `tsc` cannot catch**:

> `ShopView.tsx:514,519` call `mediaUrl(company.cover_path, company.updated_at)`, and `mediaUrl`
> (`:57-60`) is `${SUPABASE_URL}/storage/v1/object/public/shop-media/${path}`. Passing an
> already-resolved URL yields `…/shop-media/https://…` — **broken banner and logo**. Both sides
> are `string | null`, so it compiles clean.

**Fix:** `DiscoverCompanyProfile`'s `logoUrl`/`coverUrl` are **REPLACED** by raw `logoPath` /
`coverPath` — **not supplemented** (round 2 B8). Rev 2 planned to keep both, which is the
two-representations-of-one-fact problem this plan retires `DiscoverProduct` to avoid, applied
inconsistently one field over. Verified: `DiscoverCompanyProfile.logoUrl`/`coverUrl` have **exactly
one consumer** — `[companyId]/page.tsx:44,46,200,204`, the file this ticket rewrites — so after T02
both are dead, and `companies.test.ts:147-148,162-163` would be asserting dead code.
**Consequences to carry:** update that T01 test, and `mapDiscoverCompanyRow`'s `urlFor` parameter
becomes unused — its signature is T01's shipped contract, so removing the parameter is a deliberate
change to state in the diff, not a silent tidy. *(`DiscoverCompany.logoUrl` at `companies.ts:29` is
the **directory** type — different, untouched.)* A new exported
`toShopCompany(profile): Shop["company"]` in `companies.ts` does the six-field translation
(`about→description`, `countryCode→country`, `updatedAt→updated_at`,
`warehouseLocation→warehouse_location`, `logoPath→logo_path`, `coverPath→cover_path`) and keeps
`tags` as `Shop["company"].tags`. **Unit-tested, because `tsc` provably cannot catch this class.**

### (c) `tiers` goes through `mapTiers` — never a cast (B4)

Rev 1 said "forward as `PriceTier[]`". The RPC's jsonb is **snake_case**
(`20260816190000:99` — `{id, min_grams, price_per_gram}`); `PriceTier` is
`{minGrams, pricePerGram}` (`pricing.ts:10-13`). A cast compiles and yields `minGrams: undefined`
→ **empty ladder, both `bundle_*` null, T00's AUR-1E proving nothing, every test green.**
`mapTiers` (`pricelist.ts:37`) is documented as *"the ONE snake→camel boundary"* — use it.
It also already absorbs the `tiers IS NULL` case (migration `:122`: `case when p.price_public
then v.tiers end`), so a price-hidden product degrades to `[]` rather than throwing.

## The mapper's field rules — `ShopRow → ShopProduct`

Three fields can silently destroy a shipped guarantee:

| field | the trap | the rule |
|---|---|---|
| `price_public` | hardcoding `true` makes "price on request" and "price not set yet" indistinguishable, **killing Request-pricing for every buyer with every component test green** | forward `r.price_public` verbatim |
| `profile_visible` | **seller** state; `false` paints a "Hidden" badge on a buyer's card | **omit the key entirely** — it is optional for exactly this |
| `tiers` | see (c) | `mapTiers(r.tiers)` |

Everything the RPC does not supply is `null` / `[]` — **never invented** (N2). Explicitly:
`location: null` (no tabs until T05) · `media: []` · `batches: []` · `packSizes: []` ·
`terpPercent: null` · `resealable: null` · `cbg_percent`/`cbn_percent`/`cultivator`/`lineage_*`/
`irradiation_code`/`packaging_material`: `null` · **`supplier_product_code: null`** — the ADR lock
holds for free (the RPC never returns it), and N3 asks for a one-line test so a lucky default
becomes a guarded one.

⚠️ `packSizes: []` is not inert — **but rev 2 stated its effect wrongly (round 2 B7).**
`pricing.ts:75-81` unions the tier rungs with `[...product.packSizes, ...(pack_size_grams === null
? [] : [pack_size_grams])]`, and the RPC **does** return `pack_size_grams`, which the mapper
forwards. So the buyer sees **their own pack size PLUS the rungs**; what is missing is only the
`metadata.pack_sizes` extras. `ShopView.tsx:`**`575`** resolves `onAddToBasket`'s `packIndex`
against that same array. *(A wrong fact handed to a human gate is the failure this loop exists to
catch — rev 2 planned to narrate the wrong version at G4.)*

⚠️ **`price_per_gram` — appears in neither of rev 2's lists (round 2 N1).** `tsc` forces its
presence, not its correctness: map `price_per_gram: r.price_per_gram`.

**N6 — parser reuse the ADR mandates** (`0005:800-802`: `parsePackSizes`, `pickRepresentativeBatch`,
`deriveTerpPercent`) is **moot on today's RPC** — none of their inputs is returned. Recorded so
`consistency` reads it as scoped, not missed.

## The one new branch (B1, B7, N4, N5)

**`loc === "All"`** — rev 1 wrote `loc === ALL`, and **`ALL` does not exist**:
`locationFilter.ts` exports only `UNASSIGNED`; the tab is the bare literal `"All"`
(`ShopView.tsx:240` `useState("All")`).

**Why `"All"` is the correct condition** (N4 — rev 1 asserted it, here is the proof):
`LocationTabs` builds `options = ["All", ...named]` from non-null `p.location` only
(`ShopView.tsx:883-888`), so `UNASSIGNED` is **never selectable** and can only render under "All" —
which is exactly where the criterion wants the header kept.

**❌ `|| editing` is REMOVED — rev 2 added it on a justification that is provably false (round 2 B1).**
Rev 2 argued that suppressing the header under a named tab while editing would cost the seller the
drag-to-regroup affordance. It would not:
- `filterByLocation` (`locationFilter.ts:24-26`) returns only products whose `location === loc`, so
  a named tab yields **exactly one group**;
- `handleDrop` (`LocationGroup.tsx:55`) early-returns when `from === targetLocation` — every card
  visible under that tab is **already in that group**, so no drop can do anything;
- the drop target is the **`<section>`** (`:70-72`), not the header, so it survives
  `showHeader={false}` regardless.

Nothing functional is lost — only a label, a count badge, and a hint for a drop that cannot happen.
And the criterion has **no editing exception**: *"When a single **named** location is the active
filter, the per-location group header **shall not** render."* `loc === "All" || editing` renders it
at (named, editing) and **fails the ticket**. Rev 2 presented a deviation as the correct reading,
which is worse than declaring one.
**Final: `showHeader={loc === "All"}`.**

**Placement:** an optional `showHeader` (default `true`) on `LocationGroup`, not a branch in
`ShopView` — the header belongs to `LocationGroup`, so its visibility does too (complexity pulled
downward), and `ShopView` gets one new expression at an existing call site instead of a structural
branch duplicating the grid markup.
**Declared costs:** `LocationGroup.tsx` is outside T02's Files list, and it is exported through the
public barrel (`modules/catalog/components/index.ts:9`), so this widens a **module's public
surface**, not just a local file (N5). It is **not** on the ADR's `## Reused — don't touch` list
(`0005:783-807`), so no fence forbids it. One caller today (`ShopView.tsx:650`).

⚠️ **Reachability:** the RPC returns no `location`, so this branch is **not exercisable in buyer
mode until T05**. It IS exercisable today on `/present` — GreenLeaf carries Toronto/Montreal and no
`Unassigned` group exists there (N10). Test it there.

## BasketDrawer (B5, B6)

**B5 — rev 1's predicate would have broken a shipped path.** `!group.relationshipId` is **also true
for the seller's own-company group**: `basket/lib/group.ts:24` sets
`relationshipId: isOwnCompany ? null : (…)`. That group renders a `RecipientPicker`
(`BasketDrawer.tsx:278-282`) and drafts fine today; rev 1 would have replaced it with "connect with
yourself first".
**Correct condition: `!group.isOwnCompany && group.relationshipId === null`.**

**B6 — the Connect affordance needs data the drawer does not have.** `ConnectActions` requires
`state: ConnectionState` (`ConnectActions.tsx:16-24`); `BasketGroup` carries only
`sellerCompanyId` / `sellerCompanyName` (`basket/types.ts:20-26`).
**Decision: a `Link` to `/discover/[sellerCompanyId]`, not a mounted `ConnectActions`.** No new
read, no new prop, no second copy of connect state — the buyer lands on the shop page that already
owns it.

⚠️ **But rev 2 left the same gap it accused rev 1 of (round 2 B5): a bare `<Link>` does not work
here.** `BasketDrawer` is a TopBar-anchored **popover** whose `open` lives in `useBasket()` (`:34`),
and **every** existing navigation out of it closes the drawer first — `onDrafted={() => setOpen(false)}`
(`:112`) and `onOpened={() => setOpen(false)}` (`:117`), both before `router.push`. `Group` receives
only `{group, onChanged, onDrafted}`, so a `<Link>` inside it **cannot close the drawer** and the
popover would sit over the destination. Three things to specify:
1. **Close the drawer, then navigate** — reuse the existing `onOpened`/`onDrafted` close-then-push
   pattern rather than inventing a fourth.
2. **Already-on-that-page is the likeliest case** (the buyer just added from that shop) — the
   navigation is then a no-op under an open popover. Closing the drawer must still happen.
3. **The disabled "Create a draft deal" button** (`:286-292`, disabled at `!recipient`) — the
   criterion says *"rather than a Send that cannot fire"*, so **hide it** in this arm rather than
   render it dead beside the explanation.

## Two retirements the plan must state, not leave implicit

**B8 — the shop-level Request-pricing CTA.** STATE.md `## Locked`: *"the shop-level Request-pricing
CTA is retired."* Its one call site is `page.tsx:132-140` (`<RequestPricingActions>` gated on
`anyPriceHidden`, `:112`) — **inside the file this ticket rewrites**. Retiring it also orphans
`RequestPricingActions.tsx` and `DiscoverCompanyProfile.pricingRequested`.
**Disposition:** delete the call site; **leave `RequestPricingActions.tsx` and `pricingRequested`
in place** — T04 builds the per-product ask and may reuse the action. Recorded so a reviewer sees a
decision rather than an oversight.

**B9 — `e2e/present-buyer.spec.ts` is a pre-existing RED scaffold for this exact ticket.** Three
`test.fixme` cases (`:37,49,65`) assert a connected verified buyer reaching the catalogue and
`getByTestId("product-card")` — T02's behaviour — but against `/present/[companyId]`, **the route
ADR §1 says "does not exist and never will"** (the same wrong pointer T02 fixes in
`ShopView.tsx:6-7,209`).
**Disposition: delete that spec**, and let the new `e2e/discover-shop.spec.ts` carry the contract at
the real route. Leaving both would put two dead-vs-live contracts in the tree.

## Files

| file | change |
|---|---|
| `src/app/discover/[companyId]/BuyerShopView.tsx` | **new** — the wrapper |
| `src/app/discover/[companyId]/page.tsx` | teaser layout → `BuyerShopView`; `max-w-xl` → 1400px |
| `src/app/discover/companies.ts` | retire `DiscoverProduct`; `ShopRow → ShopProduct`; `toShopCompany`; `logoPath`/`coverPath` |
| `src/app/present/ShopView.tsx` | **exactly four**: **two** stale `/present/[companyId]` pointers (`:6-7` **and** `:209`'s `viewerCanManage` docstring — N5; fixing one leaves the other, and "exactly three" is a fence `critic` will police) · `viewerIsOwner={viewerCanManage}` · `showHeader={loc === "All"}` |
| `src/modules/basket/components/BasketDrawer.tsx` | the non-connected message + Connect link |
| `src/modules/catalog/components/LocationGroup.tsx` | **declared deviation** — optional `showHeader` |
| `src/app/prototype-0022-buyer-shop/` | **deleted** (extract `BuyerContext` `:164` + `LockedCatalogue` `:183` first) |
| `e2e/present-buyer.spec.ts` | **deleted** (B9) |

**Not touched:** any migration, any policy, `get_discoverable_shop` (T05), `ProductCard` (T03),
`database.types.ts` (⚠️ see the T05/T06 hazard block in TICKETS.md).

## Steps, in runnable order

1. `ShopRow` gains `tiers`; `DiscoverCompanyProfile` gains `logoPath`/`coverPath`.
2. `toShopCompany()` + its unit test **first** — it is the one `tsc` cannot guard.
3. Retire `DiscoverProduct`; rewrite `getDiscoverableShop` as `ShopRow → ShopProduct` with the
   field rules above and `mapTiers`. **The exported pure mapper MUST be named
   `mapDiscoverShopRow`** — rev 3 pinned only `toShopCompany`, so `test-writer` inferred this name
   from the `mapDiscoverCompanyRow` / `mapDiscoverPersonRow` convention and the RED spec imports it.
   Renaming it breaks the test file the builder is not allowed to edit.
4. `ShopView`'s three edits. Diff to confirm nothing else moved.
5. `LocationGroup.showHeader`, default `true`.
6. `BuyerShopView.tsx` — carry `BuyerContext` + `LockedCatalogue` across; `ConnectActions` →
   `buyerContext`; `LockedCatalogue` → `emptyState`.
7. `page.tsx` — keep `notFound()` and the parallel `Promise.all` (no waterfall); resolve N8 below.
8. `BasketDrawer` (B5's condition, B6's link).
9. Delete the prototype route and `e2e/present-buyer.spec.ts`.
10. Run: `tsc` · full unit · `present-grid` · `present-card-edit` (both **after `db reset`** — e2e
    mutates the DB) · the new buyer e2e. **SQL runners are NOT in this gate** — T02 touches no SQL
    (round 2 N10; rev 2 over-scoped it).

> **Step-order caveat (round 2 N11):** steps 3→7 leave the tree non-compiling — `DiscoverProduct` is
> deleted at 3 while `page.tsx` still imports it until 7. Normal within one commit; called out
> because this section claims "runnable order".

**The container contract (round 2 B2 — rev 2's "1400px" instruction was wrong).**
`max-w-[1400px]` occurs **once in all of `src/`**: `ShopView.tsx:739`, inside the *Present-mode
overlay* branch. The normal `/present` surface (`:751-757`) has **no max-width** —
`present/page.tsx:25` returns `<ShopView>` bare into `<main className="min-h-0 flex-1 overflow-auto
p-3">` (`AppShell.tsx:44`). The G2-approved prototype does the same: a bare `<div className="relative">`
with no container (`prototype-0022-buyer-shop/page.tsx:82`). Building a 1400px container would
produce something **neither `/present` nor the approved prototype does.**

Worse, and unaddressed by rev 2: `ShopView`'s root carries `flex h-full flex-col … overflow-auto` —
it is designed as a near-direct child of `main`. Keeping `page.tsx`'s
`mx-auto flex w-full … flex-col px-2 pb-10` wrapper puts `h-full` against an auto-height flex parent
and **nests a second scroll container**. This is the ADR's own named blast-radius row
(`0005:812` — *"the defect class the G2 walk hit 4×"*).

**Chosen, stated exactly:** drop `max-w-xl`, drop the `.glass overflow-hidden rounded-3xl` wrapper
(`page.tsx:41` — `ShopView` brings its own banner and card chrome; nesting double-frames it), **keep**
the "Back to Discover" link (`:34-39`), and render `<ShopView>` in the shape the prototype proved —
no width container, no extra scroll parent.

## Test surface (for `test-writer`)

- **Unit — `toShopCompany`** (the B2 guard): every one of the six renamed fields asserted with a
  distinct sentinel, **and `logo_path`/`cover_path` asserted to be PATHS, not URLs**
  (`expect(out.cover_path).not.toMatch(/^https?:/)`). This is the assertion that would have caught
  the double-URL defect.
- **Unit — the product mapper:** `price_public` forwarded **both** ways (the `false` fixture is the
  one that matters) · `profile_visible` **absent from the object** —
  `expect('profile_visible' in out).toBe(false)`, **not** `toBeUndefined()`, which passes when the
  key exists holding `undefined` · `tiers` through `mapTiers` asserted as **camelCase**
  (`out.tiers[0].minGrams`) · `bundle_*` from `tiers[0]` · `images` as `{id, path}` with `path` not
  a URL · `supplier_product_code: null` (N3) · `location: null`.
- **Unit — `LocationGroup`:** header renders by default · suppressed at `showHeader={false}` ·
  **and still renders under a named tab while `editing`** (B7's regression). `renderToStaticMarkup`
  — this repo's vitest is **node env, no jsdom**.
- **e2e — new `e2e/discover-shop.spec.ts`:** a verified buyer at `/discover/[companyId]` sees real
  cards — assert `data-testid="product-card"` (N1), which the deleted teaser tile never had, so the
  assertion **cannot pass on a rebuild**. Plus AC 11: no save, manage-shop, Present-mode or
  banner-edit control anywhere.

## What must be tested that rev 2 left untested

**B3 — nothing proved `ShopView` actually PASSES the two new expressions.** ADR round 4's best catch
was *"nothing wired `viewerIsOwner`, so AC 3's gate would never have fired — with every test green"*
(STATE.md G3). Rev 2 planned `ProductCard`-side coverage (T03, shipped) and `LocationGroup`-side
coverage in isolation: **both prove the props work, neither proves `ShopView` supplies them.** Delete
both expressions from the diff and every rev-2 test still passes. `present-grid.spec.ts:71-79` selects
"Toronto Warehouse" and asserts only card counts — no header assertion — so the seller pin misses it too.
**Required:** (i) the buyer e2e asserts a `price_public=false` card shows `data-testid="request-pricing"`
— reachable only when `viewerIsOwner={false}` actually arrives (`ProductCard.tsx:377`); (ii) ~2 lines on
`present-grid` asserting the group header text is **gone** after selecting a named location.

**B4 — the BasketDrawer criterion had no test at all**, and B5 proved rev 1 would have broken the
shipped own-company path. **Written and RED:** `src/modules/basket/components/BasketDrawer.test.tsx`
— three fixtures (own-company / connected-foreign / non-connected-foreign).
✅ **The module-private `Group` obstacle dissolved without a source change**: `test-writer` mocked
`useBasket()` and rendered the already-exported `BasketDrawer` (precedent: `manage.ladder.test.ts`
for the mock pattern, `DiscoverShell.test.tsx` for mocking `next/navigation`). **Do NOT export
`Group`** — it is not needed, and this exercises the real `BasketDrawer → Group` integration rather
than a unit in isolation.
⚠️ **One half of B6 is NOT unit-testable and is not covered:** the *close-the-drawer-then-navigate*
interaction needs event dispatch, and this repo's vitest has no jsdom. The static markup (message,
Connect link present, dead Send button absent) IS covered. **Verify the close-then-navigate
behaviour by hand at G4**, or accept it untested and say so.

## Risks

- **The G2 contract is the ticket.** Reuse must be provable; a screenshot is not proof.
  `consistency` must be spawned.
- **`ShopView` is the seller's shipped surface** — `present-grid` + `present-card-edit` are the
  pins, on a clean DB.
- **AC 11 audit came back clean** (N9): all six `viewerCanManage` sites are intact and shallow, and
  `editing`/`presenting` are unreachable at `viewerCanManage={false}` because their only doors are
  `PresentBanner.tsx:73` and the gated SaveBar. No unlisted owner control leaks.
- **Three things will look like defects at G4 and are not — narrate all three** (round 2 N7, N8):
  1. the buyer's cards are **incomplete** — no AC-7 specs, no location tabs. Correct until T05.
  2. **the Request-pricing button is DEAD** — `ShopView` passes no `onRequestPricing`, so
     `onRequestPricing?.(p.id)` (`ProductCard.tsx:825`) is a no-op. Recorded and accepted at G4·T03
     (K7), but **T02 is the ticket that makes it visible in the running app for the first time.**
     T04 wires it.
  3. **cell 12 becomes visible** — `price_public = true, price_per_gram = null` renders "Price on
     request" with no ask (`:651`, `canAsk` false). STATE.md `## Owed` keeps it reachable until the
     seller-side blank-price fix ships.
