# 0022 buyer-shop-view — work order
lane:   FULL
stage:  triage ✅ · spec ✅ (G1 passed 2026-08-19) → prototype (next, G2)
branch: **claude/muskan/work** — no feature branch (Muskan's call, 2026-08-18)
>  No cut: this slug is frontend-heavy with no expected migration, so a feature branch
>  would only add a merge step. `/ship` still rebases onto `dev` and PRs from here.
>  ⚠️ **If /spec or /design turns up a migration or an RLS change, revisit this** — that
>  is what earned 0021 its own branch.
>
>  ✅ **CONDITION FIRED at G1 (2026-08-19), reviewed, call UNCHANGED.** Spec decision 6
>  (an accepted relationship overrides `product.profile_visible`) is a permission-rule
>  change, so this slug DOES carry a migration. Muskan re-confirmed no feature branch:
>  sole owner, one migration (0021 had thirteen across eight tickets), and `/ship`
>  rebases either way. Trade-off accepted: the migration ships only when this whole
>  branch ships.
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
| spec   | `docs/muskan-build/0022-buyer-shop-view/RESEARCH.md` — researcher sweep; settles Q2a/Q2b with citations |
| spec   | `docs/PRD/0022-buyer-shop-view.md` — the PRD, APPROVED at G1 |
| spec   | `docs/architecture/CONTEXT.md` — corrected `Buyer Shop View` ("connected buyer" → any verified buyer), per-product Request-pricing CTA, **new** `Connection override (visibility only)` term |
| spec   | `docs/decisions/DECISIONS.md` — 2026-08-19 entry: relationship overrides visibility, amends the 2026-06-14 soft-openness lock |

## Locked
(empty until G3 — but two G1 calls are already load-bearing on the ADR)
- **Connection overrides `profile_visible`, never `price_public`** → the read path gains a
  relationship arm; the price arm is untouched. (`DECISIONS.md` 2026-08-19.)
- **One read door** — no parallel price reader for this surface (`ARCHITECTURE-NOTES.md:423`).

## Deferred — must NOT be built
- Per-customer pricelists (Phase 15 — September; the one most likely to be confused with this)
- Cross-product bundles (September)
- Threshold nudge ("add 20g more and pay €7/g")
- Person-to-person deals (deals require a company `relationship`)
- Seller-side edit affordances on this surface — buyer view is READ + BUY only

## Attempts
(empty)

## Gate log
| gate | date | verdict |
|---|---|---|
| **G1 (spec)** | 2026-08-19 | **PASSED** — Muskan approved the PRD. 11 decisions recorded in PRD §3, taken over a one-question-at-a-time interview. Two shared-doc amendments written under the sync ritual (CONTEXT.md, DECISIONS.md). No researcher claim overruled; decision 6 is a **new** call that amends a locked one. Branch condition fired and was reviewed — call unchanged. |

## For Muskan
- ✅ **Q2a SETTLED** — a verified buyer *can* read a foreign seller's prices where
  `price_public` is on, connected or not; `anon` is revoked outright. Evidence:
  `RESEARCH.md` § Backend reality, and `DECISIONS.md:114`'s connection-gated rule is
  superseded twice over (`:116`, `:1010`).
- ✅ **Q2b SETTLED — the gap is real.** The basket table is owner-scoped only and never
  checks whether the buyer may *see* the product. Spec closes it server-side (PRD §4.7,
  AC 10).
- ✅ **L0/L1/L2 answered for all three** — PRD §3 decisions 3–7, AC 2–6.
- ⚠️ **Owed, not blocking:** `docs/superpowers/plans/2026-07-07-product-basket.md`
  Tasks 9–11 needs a dead marker (superseded by this PRD), and project `CLAUDE.md`'s
  "Loose ends" still lists it as live work.
- ⚠️ **Still open, ask Marcel:** compliance position for real pharmacies ordering
  (`august-mvp.md:99-100`) — a before-launch question, not a build blocker.
- ⚠️ **DEV-113** (Backlog, unowned) — which shop/location a buyer is shown at connect
  time. Decision 9 takes "all the seller's location tabs" *for now*.
