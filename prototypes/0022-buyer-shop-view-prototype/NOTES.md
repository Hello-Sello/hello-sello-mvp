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

**Chosen variant:** _(pending — Muskan picks in the browser)_

**Change requests:**
- _(pending)_

**Decided:** _(date)_

> The chosen variant becomes the **G4 visual contract**: `/build` is verified against it, and
> `visual-verifier` stages the live page beside it. Record the pick here before this prototype
> is deleted or absorbed.
