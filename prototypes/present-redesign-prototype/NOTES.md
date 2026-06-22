# present-redesign-prototype

**Throwaway prototype — DESIGN LOCKED 2026-06-22.** Phase 7 (Present Catalogue UX).
This prototype IS the visual + interaction spec for the React build. Open
`index.html` directly in a browser (no build, no server). Theme tokens mirror
`src/app/globals.css`.

> Switch views with the dark bar at the very top: **Shop view** (seller's own shop) ·
> **Manage shop** (price-list table + modals) · **Buyer view** (what a visiting buyer sees).

---

## Locked design

### The product card (flip)
- **FRONT = product label + price** (everything buyer-safe): photo carousel, grade badge,
  ♥, name/cultivar/PZN, country flag, **label** THC/CBD/CBG/CBN quad, full spec list
  (dominance · cultivator · origin · region · lineage · irradiation · format · packaging ·
  resealable · supplier code), price (price/g + UVP strike-through + bundle tier) or
  "Price on request".
- **BACK = "Documents & lab reports"** — a **folder shelf** (click a folder to open all its files):
  **COAs**, **Lab results**, **Certificates & specs**; plus a single **walkthrough video** link.
  Photos are NOT here (they're on the front). Inert **Sella · Marktvergleich** stub (no figure, R1).
- Collectible feel: subtle tilt + sheen on hover; click flips. "Documents" button flips to the back.

### Add-to-basket — batch lives with the product (seller only)
- The card footer has **two controls**: a **batch dropdown ("Select lots ▾")** + a separate **Add to basket** button.
- Opening the dropdown lists **every lot** with measured THC/CBD · expiry · kg available, each with a **+/− quantity**.
  A seller can **split one order across lots** (e.g. 30 of lot A + 20 of lot B). Add stays disabled until a lot has a qty.
- Each (product + lot) becomes its **own basket line** (merge key = product + batch) — mirrors Ayush's BTCH-01 / D-06.
- **Buyer view shows NO batch UI** — a plain qty stepper + Add. Buyers never pick or see lots.

### Basket + send
- Basket is **per-company, transient**. A line = product+batch (seller) or product (buyer).
- **Seller send = a deal `offer`** (`source: "shop"`): the batches are already on the lines, so the send step
  just picks the **connected customer** (recipient). Hands off to Ayush's **Deal Basket + `createDeal`**.
- **Buyer send = a deal `order`** (`source: "shop"`), addressed to the shop's company, **batch-less**
  (buyer can't pick) — the **seller assigns the lot when they respond**. Gated: a not-connected buyer must connect first.

### Chrome (premium pass)
Layered low-opacity shadows · light heading weights · hairline borders · restrained accent (one brand pink) ·
generous whitespace · compact search · `Manage shop ▾` menu · animated basket (count-bump + fly-to-cart + slide-over).

---

## Decisions captured here (need to land in docs/decisions later)
- **D — batch chosen at add-time** (product + batch = one line), **split across lots** supported.
- **D — public card carries NO batch number/identity.** The binding lot + its COA surface on the **deal**, not the listing.
- **D — COAs / lab results are per-batch.** The per-batch *numbers* exist (`product_batch`, `batch_terpene`);
  storing per-lot COA/lab **PDF files** needs a **new `batch_document` table** (file + `batch_id` + type) on the
  `shop-media` bucket — a Phase 7 build item, not yet in schema.
- **D — quick-view drawer dropped** (the flip card is the detail view).
- **Sella Marktvergleich stays inert** (no figure) — Flowzz pull is **legally gated** (German competition/data law)
  and **co-owned with Ayush**; real design parked for a joint Sella session.

## Reuse (verified in code)
- `DealSource = "p2p" | "sella" | "shop"` — **"shop" already supported**.
- Ayush's **DealForm** has the mandatory batch picker; **DealBasket** carries recipient + lines; `createDeal` mints it.
- Buyer vs seller = `deal_type` **`order`** vs **`offer`**.

## Open / not proven here
- Buyer **order view** (the buyer's send/confirm + "Request pricing") — next.
- **Ayush sync:** batch-less buyer order; seller assigns the lot on response.
- Real data / RLS / cross-tenant buyer read; the `batch_document` storage; live deal hand-off.
