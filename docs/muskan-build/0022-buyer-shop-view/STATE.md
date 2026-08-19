# 0022 buyer-shop-view — work order
lane:   FULL
stage:  triage ✅ · spec ✅ (G1) · prototype ✅ (G2) · design ✅ (G3 2026-08-19) → build (next)
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
| spec   | `docs/superpowers/plans/2026-07-07-product-basket.md` — Tasks 9–11 marked DEAD (superseded); project `CLAUDE.md` loose end updated |
| prototype | `prototypes/0022-buyer-shop-view-prototype/` — `index.html` (variants A/B/C + the fit check) + `NOTES.md` (the G2 verdict) |
| prototype | `src/app/prototype-0022-buyer-shop/page.tsx` — **the chosen contract**: real AppShell + ShopView + ProductCard, hardcoded data. ⚠️ THROWAWAY — delete at `/build` |
| prototype | `src/app/present/PresentBanner.tsx`, `ShopView.tsx`, `InfoBox.tsx` — **real component fixes** the walk surfaced (see NOTES.md table) |
| design | `docs/muskan-build/0022-buyer-shop-view/RESEARCH.md` — `## Approaches (design)` + 2 orchestrator corrections that made the slug bigger |
| design | `docs/architecture/adr/0005-buyer-shop-view.md` — **the ADR, rev 4, G3-accepted**. 3 checker rounds |
| design | `docs/muskan-build/0022-buyer-shop-view/TICKETS.md` — T00–T07, INVEST + EARS, 3 slices |
| design | `docs/architecture/adr/ADR-INDEX.md` — ADR-0005's line |

## Locked
- **Connection overrides `profile_visible`, never `price_public`** → the read path gains a
  relationship arm; the price arm is untouched. (`DECISIONS.md` 2026-08-19.)
- **One read door** — no parallel price reader for this surface (`ARCHITECTURE-NOTES.md:423`).
- **G2: variant A** — the buyer view REUSES `ShopView` + `ProductCard`. **A new card
  component is a build failure, not a style choice** (the `consistency` agent's question).
- **G2: buyer mode shows no owner chrome anywhere** — Manage shop, Present mode, SaveBar,
  banner/logo edit. PRD AC 11.
- **G3 · a `BuyerShopView` wrapper, NOT a 4th prop on `ShopView`** (ADR §1). `ShopView` gains
  no behaviour prop. Split trigger written down: a third consumer, or a 4th
  `viewerCanManage`-shaped boolean. Slots don't count.
- **G3 · the connection rule is written ONCE** (`is_connected_to_company`, `SECURITY INVOKER`
  — the first INVOKER policy helper in the tree, a deliberate departure) **and applied at ALL
  SEVEN gate sites** (ADR §2, §3). The one-helper-instead-of-five-policies alternative was
  weighed and rejected: a rule that means one thing through the RPC and another through the
  base table gets inherited wrong.
- **G3 · the verification tightening is SIGNED** — three policies gain `is_caller_verified()`;
  authenticated members of UNVERIFIED companies lose catalogue/image/media reads they have
  today. Deliberate; belongs in the G4 walk.
- **G3 · basket admission = one RESTRICTIVE `FOR INSERT` policy**, carrying the owner arm and
  the **price** rule (decision 3 is server-side per PRD §6.5). The shipped owner policy is
  untouched. An RPC was rejected: it leaves the table's direct-write door open — the DEV-88
  class (ADR §7).
- **G3 · AC 3 AMENDED** — "opens a conversation" → "sends the seller a request naming that
  product; the conversation happens in chat once connected". Non-connected → inbox item;
  connected → chat. **The shop-level Request-pricing CTA is retired.**
- **G3 · `supplier_product_code` is NOT shown to buyers** (confidentiality; AC 7 omits it).
- **G3 · the card's buy row gates on `priceShown || viewerIsOwner`** — never on
  `price_per_gram != null` alone, which would break the seller's own unpriced products.

## Deferred — must NOT be built
- **AC 9 — ordering without a connection.** Split to its own slug at G3. Buildable as Muskan
  sequenced it (accept the connection first, then the order lands in chat), but it is the only
  part of the spec off Marcel's demo path. Its three real costs are recorded in ADR §9 — it is
  a slug, not a footnote.
- **A "deactivate / unavailable" product control.** Owed *because of* decision 6: repurposing
  `profile_visible` leaves the seller no switch that hides a product from **everyone**. The
  visibility-window columns survive un-overridden but have no UI and are the wrong shape for
  out-of-stock. Decide then whether delisted and out-of-stock are one concept or two.
  (Muskan, 2026-08-19.)
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
| **G3 (design)** | 2026-08-19 | **PASSED** — ADR-0005 rev 4 accepted; 5 sign-offs answered (see Locked). **⚠️ The checker loop did NOT converge**: budget is 2 rounds; r1 = 6 blocking + 16 non-blocking, r2 = 8 **new** blocking + 15; a 3rd ran at Muskan's explicit call. r2 caught 3 real defects in the draft — a price gate that would have broken the seller's own shop, a basket rule that skipped the G1-locked price check, and a `metadata` projection that would have shipped sellers' private notes to buyers. Two researcher claims were overruled on spot-verification (the rule lives in **7** places, not 3; `get_discoverable_shop` could not satisfy AC 7). |
| **G2 (prototype)** | 2026-08-19 | **PASSED** — variant **A (full shop)**. Contract is the in-app route, not the HTML: Muskan's objection — *"if I confirm this html variant then maybe the builder will build this same thing and not follow my real app frontend"* — is correct, and variant A's claim ("reuse the seller's shop") cannot be proven by a mock. Walked on the buyer route **and** on the seller's `/present`. The walk found 4 defects + 2 shape changes in shipped components (NOTES.md). |

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

### ▶ Carried into `/design` (G3)
1. **⚠️ THE ADR MUST DECIDE: `BuyerShopView` wrapper vs more knobs on `ShopView`.** Buyer
   mode currently rides three props on the seller's component (`viewerCanManage`,
   `buyerContext`, `emptyState`); a fourth was added and withdrawn during G2. Each new buyer
   difference costs another prop on a **shipped** surface the seller depends on. Do not let
   this default by accretion.
2. **The migration** — decision 6's relationship arm on the catalogue read path
   (`DECISIONS.md` 2026-08-19). Still unwritten; the slug carries it despite triaging
   frontend-only.
3. **Basket admission must be enforced server-side** (PRD §4.7 / AC 10) — `product_basket_line`
   is owner-scoped only and never checks whether the buyer may *see* the product.
4. **Where the buyer strip finally belongs.** It renders above the info boxes via a slot;
   the HTML put it under the tagline inside the banner. Cosmetic, but it is item 1's problem
   in miniature.
5. **Delete `src/app/prototype-0022-buyer-shop/` at `/build`.**
