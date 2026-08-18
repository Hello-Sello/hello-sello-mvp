# 0022 buyer-shop-view — work order
lane:   FULL
stage:  triage ✅ → spec (next, G1)
branch: **claude/muskan/work** — no feature branch (Muskan's call, 2026-08-18)
>  No cut: this slug is frontend-heavy with no expected migration, so a feature branch
>  would only add a merge step. `/ship` still rebases onto `dev` and PRs from here.
>  ⚠️ **If /spec or /design turns up a migration or an RLS change, revisit this** — that
>  is what earned 0021 its own branch.
>
>  Base-branch trap, recorded so the next slug doesn't hit it: a feature branch here must
>  cut from `claude/muskan/work`, **never `origin/dev`**. At triage the work branch was 26
>  commits ahead, and `origin/dev` carried only `.claude/skills/track-doubt/` — none of the
>  pipeline skills. A branch cut from dev could not run `/spec` or `/build` at all. (0021
>  cut from dev legitimately: the work branch had just merged there via Release 1/2.
>  Always re-check the delta before cutting.)
seed:   "wehave to build the august_mvp what dhould be the next thing to build?" — Muskan, verbatim

> Routed to `docs/muskan-build/august-mvp.md` **item 2** — the only unbuilt item on the
> list. Items 1, 3, 4, 5, 6, 7 are verified done in code (releases 1+2 live; the tier
> ladder `0021` swallowed 3–7). Item 8 (production UAT) is blocked by this slug.

## What it is — Muskan's framing, 2026-08-18

> "From Discover, the user should be able to see the seller's shop properly, like the
> Present page we have for the seller, but just for the buyer's view."

**Not** "wire a basket button onto the existing tiles." The catalogue block on
`/discover/[companyId]` is a hand-written 2-up teaser grid. It gets **replaced** by the
buyer's version of the Present shop.

`/discover/[companyId]` is an EXISTING route (the page in the 2026-08-18 screenshot) —
one file serving every seller. No new route; its insides get rebuilt.

### The gap (Present has / Discover shows)
| Present | Discover today |
|---|---|
| shop banner + logo + info box | hero strip + one text line |
| description, links, locations | — |
| location/shop tabs | — |
| 4-up grid of `catalog/components/ProductCard` | 2-up grid of a local mini tile |
| flip card: full specs, lots, THC/CBD | one line of text |
| quantity stepper + pack sizes | — |
| "See all prices" tier ladder | — |

## Why FULL — the six questions
| # | | evidence |
|---|---|---|
| 0 | NO | never built; not a regression |
| 1 | **YES** | a buyer-side shop surface exists nowhere — `/present` is the seller editing their OWN shop |
| 2 | **UNCERTAIN → YES** | `get_discoverable_shop` already returns `tiers` (migration C, live) and `product_basket_line` is owner-scoped RLS, so the happy path looks backend-complete — but NOT proven: (a) can a buyer read a foreign seller's `current_pricelist_item` rows? (b) is a basket write gated on product visibility? |
| 3 | NO | `CONTEXT.md:130` "Product Basket" already names the buy-from-another-connected-shop case |
| 4 | YES | a buyer can place orders for the first time |
| 5 | NO | `docs/team/sync/*.md` — no locks held; Ayush offline |
| 6 | YES | page shell + card reuse + reads + basket write + UAT |

## Reuse already in place — confirmed in code
- `catalog/components/ProductCard.tsx` takes `editing?: boolean` (**defaults false**) and an
  `onAddToBasket?` hook documented as *"the store/send flow is a later phase; defaults to a
  no-op here."* The card was built expecting exactly this mode.
- `resolveTierPrice` + `ladderPanel` (the "See all prices" popover) ship with it.
- `get_discoverable_shop` returns a `tiers` column that `src/app/discover/companies.ts`
  currently **drops on the floor** — `DiscoverProduct` has no `tiers` field.
- `addToBasket` / `getMyBasket` / `BasketDrawer` all handle a foreign seller group already.

## Files so far
| stage  | wrote |
|--------|-------|
| triage | this file |
| triage | `docs/architecture/CONTEXT.md` — added the **Buyer shop view** section: `Buyer Shop View` + `Catalogue openness (L0/L1/L2)` (2026-08-18, Muskan approved) |

## Locked
(empty until G3)

## Deferred — must NOT be built
- Per-customer pricelists (Phase 15 — September; the one most likely to be confused with this)
- Cross-product bundles (September)
- Threshold nudge ("add 20g more and pay €7/g")
- Person-to-person deals (deals require a company `relationship`)
- Seller-side edit affordances on this surface — buyer view is READ + BUY only

## Attempts
(empty)

## Gate log
(empty)

## For Muskan
- Q2 came back **UNCERTAIN, not NO**. `/spec` must settle: can a buyer read a foreign
  seller's price rows, and is the basket write gated on visibility? (negative-space check:
  assert who should NOT be able to add.)
- L0/L1/L2 openness already exists on this page (locked catalogue / prices-on-request /
  open). `/spec` must say what the buyer shop view looks like at each of the three.
- Open from `august-mvp.md`: compliance position for real pharmacies ordering — ask Marcel.
