# 0022 buyer-shop-view — prototype notes

**Slug:** `0022-buyer-shop-view` · **Gate:** G2 · **Spec:** `docs/PRD/0022-buyer-shop-view.md` (G1 approved 2026-08-19)
**Run it:** open `index.html` directly in a browser. No server.

---

## The question this prototype answers

The seed says *"like the Present page we have for the seller, but just for the buyer's view."*
Reading the two containers made that harder than it sounds:

| | source | width |
|---|---|---|
| Present shop | `src/app/present/ShopView.tsx:722` | `max-w-[1400px]`, `px-6/px-8` |
| Discover company page | `src/app/discover/[companyId]/page.tsx:33` | **`max-w-xl` = 576px**, `px-2` |
| `ProductCard` | `src/modules/catalog/components/ProductCard.tsx:361` | **fixed `h-[640px]`**, photo capped 250px |

So the shop cannot simply be dropped into the page that will host it. **What shape the buyer's
shop takes inside the real container is the design question** — not what the card looks like
(that is already built and shipped).

This is the fit check PIPELINE §14 #8 requires: every variant renders inside a stub of its real
container at the real constraint, with the fit bar stating the resulting card width and the
verdict.

## The three variants

| | What it does | Costs |
|---|---|---|
| **A · Full shop** | `/discover/[companyId]` adopts Present's 1400px container wholesale. 4-up grid, cards at the width they were designed for. | Discover stops looking like Discover — the narrow, scannable company page becomes a wide storefront. Connect actions must be re-sited. |
| **B · Narrow column** | Keeps Discover's real 576px column. Cards stack 1-up. | Honest to the page as it exists, and zero container work — but a 640px card one-per-row means ~4 screens of scroll for 6 products. Browsing gets worse as the catalogue grows. |
| **C · Two-zone** | Profile header stays narrow and familiar; the catalogue breaks out full-width beneath it. | ProductCard fits as designed *and* the page still reads as Discover — at the cost of two container widths on one page. |

## What else the prototype shows (all from the PRD)

- **Connection toggle** — flips `profile_visible` handling. Not connected → public products only; connected → the whole catalogue, hidden products included (PRD §4.2, AC 5).
- **Catalogue level** — L0 (locked panel + Connect CTA, AC 4) · Mixed L1+L2 (AC 2/3) · L2 all priced.
- **Price-hidden card** — no stepper, no add-to-basket, a **per-product** Request-pricing button that names the product and routes to chat (AC 3, PRD §4.5).
- **Tier ladder** — "See all prices" popover with the applied rung tinted and the base struck through, matching the shipped T05 behaviour.
- **Basket dock** — for a non-connected buyer the Send button reads *"Send order + connection request"* and the notice states it before they commit (AC 9).

Deliberately **not** shown, per the PRD's Out list: per-customer pricelists, bundles, threshold
nudges, batch/lot selection, any seller edit affordance.

---

## Verdict — G2

**Chosen variant: A · Full shop** — Muskan, 2026-08-19. `/discover/[companyId]` adopts
Present's container; the buyer view reuses the seller's shop rather than restyling it.

**Change request that followed the pick — and why this prototype moved into the app:**

> *"can you try to use the current app shell we have so I can see how it would actually look
> in app, and we also have basket created at top so use that"* … *"I just don't want that if I
> confirm this html variant then maybe the builder will build this same thing and not follow
> my real app frontend?"*

That objection is correct and it is the reason variant A cannot be contracted from an HTML
mock. The chosen variant becomes the **G4 visual contract**; `visual-verifier` stages the live
page against it and `builder` builds toward it. Variant A's claim is *"reuse the seller's shop
unchanged"* — a hand-drawn card cannot prove that claim, and could actively teach a builder to
reproduce a **new** card that merely looks right. So variant A's contract is the real
components, not a drawing of them.

**→ The live contract is now the in-app route, not this file:**
`src/app/prototype-0022-buyer-shop/page.tsx` — real `AppShell` (IconRail + TopBar + the basket
popover), real `ShopView`, real `ProductCard`, hardcoded products, no database.
**Throwaway: delete it at `/build`.** Requires being logged in (the auth guard was
deliberately not weakened for a prototype).

This HTML file stays as the record of **why A won** — B and C are still switchable in it, and
the fit bar is the evidence for the container decision.

**Findings this rebuild produced (carry into `/design`):**
1. `ShopView` already supports the buyer mode via `viewerCanManage={false}` — but **that prop
   has no caller anywhere in the app**. Its own doc comment cites a `/present/[companyId]`
   visitor route that **does not exist** (`shop.ts:6` calls it "comes later"). The buyer mode
   is therefore **untested in practice**; this prototype is its first real exercise.
2. The real shell costs horizontal room: `IconRail` + `main`'s `p-3` mean the nominal 1400px
   is never fully available. Variant A must be judged at real laptop width, not in isolation.
3. `handleAddToBasket` is wired to the **real** server action, so it fails on fake product ids.
   Expected, and it usefully proves the wiring is genuinely the shipped one.

**Guardrails to put on the build ticket regardless (agreed with Muskan):**
- **Reuse `ShopView` + `ProductCard`. A new card component is a failure, not a style choice.**
- The `consistency` agent's single question — *reuse, or invent and patch?* — applies here.

**G2 PASSED — 2026-08-19.** Muskan walked the in-app route and confirmed the seller's
`/present` after the shared-component changes below.

### What the walk changed (all in the REAL components, all with 375 unit tests green)

Four defects and two shape changes came out of actually rendering buyer mode. The first
three are the same root cause: **`viewerCanManage={false}` had no caller, so buyer mode had
never once run.**

| # | Found | Fix |
|---|---|---|
| 1 | **"Manage shop" and "Present mode" rendered for a buyer.** `ShopView` neutered `onManage` with a no-op (a dead button) and did not gate `onPresent` **at all** — a buyer could enter Present mode on someone else's shop | `PresentBanner` gains `canManage` (default `true`); `false` hides the whole owner row. Breaks PRD **AC 11** otherwise |
| 2 | **`EmptyShop`'s heading was hardcoded "Your shop is empty"** — a buyer was told a stranger's shop was theirs. Only the paragraph varied | Heading varies by audience |
| 3 | **A locked catalogue rendered as an empty one** — no Connect action, wrong message | `emptyState` slot; the buyer page passes the locked panel (**AC 4**) |
| 4 | **Info boxes were far too tall.** Cause was `mt-auto` on the `More` control: in an equal-height row it pinned the button to the bottom of the tallest box, opening dead space under short content | Compact row, equal thirds (was `1.4fr/1fr/1fr`), app's own text styles at smaller sizes |
| 5 | `More` offered on text that did not overflow | About clamps to 2 lines and offers `More` **only when measured as clipped** (`ResizeObserver`). Location keeps its expander unconditionally — its `more` is the warehouse list, i.e. different content, not clipped text |
| 6 | Location box carried company **tags**, which are identity, not location; Links stacked vertically | Location shows one `·`-joined row; Links inline; tags move under the company name in About, for **both** viewers |

### ⚠️ The ADR must decide this — do not let it default

Buyer mode is currently expressed as **knobs on the seller's component**:
`viewerCanManage`, `buyerContext`, `emptyState`. A fourth (`showLocationFilter`) was added
and then deleted when Muskan clarified the filter stays.

Three is tolerable; the trend is not. **`/design` should decide between a `BuyerShopView`
wrapper that owns the buyer's version, and continuing to grow `ShopView`.** Every new buyer
difference currently costs one more prop on a component the seller also depends on — which
is change amplification on a shipped surface, and the reason a shared component drifts.

**Decided:** 2026-08-19 — variant A, in-app, walked and confirmed on both the buyer route
and the seller's `/present`.

> The chosen variant becomes the **G4 visual contract**: `/build` is verified against it, and
> `visual-verifier` stages the live page beside it. Record the pick here before this prototype
> is deleted or absorbed.
