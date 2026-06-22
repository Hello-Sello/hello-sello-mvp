# present-redesign-prototype

**Throwaway prototype — Phase 7 (Present Catalogue UX).** This prototype IS the
visual + interaction spec for the React build. Open `index.html` directly in a
browser (no build, no server). Theme tokens mirror `src/app/globals.css`.

> Top dark bar switches views: **Shop view** (seller) · **Manage shop** (price table + modals) · **Buyer view**.

---

## ▶ NEXT SESSION — start here (one open decision)

**Open decision: where do custom (per-customer) price lists live?** Right now it's inconsistent:
- The **seller send step** (basket → Send as deal card) lets the seller **edit a price per line**, which saves a per-customer list (`customLists`) — but the UI made it *look like editing the Standard list* (it doesn't — Standard is untouched).
- The older **"Send price list to a customer"** modal (Manage shop) still marks **"custom price list (future)"**. → inconsistent.

**Proposed fix (await Muskan's go):** make the custom price list **first-class with one home** — a **"Price lists" area in Manage shop**: the **Standard** (public) list + **custom lists** (one per customer, each = *"based on Standard, with a few overrides"*, clearly separate). Then BOTH sends just *pick a list*; the "Send price list" custom option becomes **real**.

**Two distinct "sends" to keep separate:** **Send price list** = "here are our prices" (catalogue, no order) vs **Send deal/offer** = a concrete order (products + qty). Both *use* a price list.

**Pricing rollout decided:** **B now, A later.** B = custom list is seller-pushed (born at send / attached). A = shop auto-shows a customer their prices on login (industry standard; same data, later trigger). Research + reasoning in session history.

---

## Locked design

### Product card (flip)
- **FRONT** = product label + price (buyer-safe): photo, grade, ♥, name/cultivar/PZN, flag, **label** THC/CBD/CBG/CBN quad, full spec list, price (price/g + UVP strike + bundle) or "Price on request".
- **BACK** = "Documents & lab reports" — **folder shelf** (COAs · Lab results · Certificates & specs) + a walkthrough video link. Photos are on the front. Inert **Sella · Marktvergleich** (no figure, R1).

### Add-to-basket — batch lives with the product (seller only)
- Card footer has **two controls**: a batch dropdown (**"Select lots ▾"**) + a separate **Add to basket** button.
- The dropdown opens an inline panel listing **every lot** with measured THC/CBD · expiry · kg, each with **+/− quantity** → an order can be **split across lots**. Each (product+lot) = its own basket line.
- **Buyer view shows NO batch UI** — plain qty stepper + Add.

### Basket + send
- Basket per-company, transient. Line = product+batch (seller) / product (buyer).
- **Seller send = deal `offer`** (`source:"shop"`): batches already on lines; the send step picks the **customer** and shows an **editable price per line** (custom-list-born-at-send — *the bit under discussion above*). Hands to Ayush's Deal Basket + `createDeal`.
- **Buyer send = deal `order`** (`source:"shop"`), **batch-less** — seller assigns the lot on response. Not-connected buyer must connect first (gate).
- **Buyer "Request pricing"** for unpriced products → lands in the seller's Connect inbox.

---

## Decisions (captured)
- **Products are location-scoped — one product = one location.** Now in `docs/decisions/DECISIONS.md` (2026-06-22). Model: **Company → Locations → Products → Batches**.
- Batch chosen at add-time; split across lots; public card carries no batch identity (binding lot surfaces on the deal).
- COAs/lab results are **per-batch** (numbers exist; per-lot COA **PDF files** need a new **`batch_document`** table — not in schema).
- Sella Marktvergleich **inert** (Flowzz legally gated; co-owned with Ayush).
- Quick-view drawer dropped (flip card is the detail view).

## Reuse (verified in code)
- `DealSource = "p2p" | "sella" | "shop"` — **"shop" supported**. Ayush's **DealForm** has the batch picker; **DealBasket** carries recipient + lines; `createDeal` mints it. Buyer=`order`, seller=`offer`. Multiple named price lists already supported (`pricelist` + `pricelist_item`) — so custom lists need **no new schema**, only UI.

## Gaps needing new schema (Phase 7 build)
1. **`location`** entity per company + `product.location_id` (location-scoped products — no column today).
2. **`batch_document`** (per-lot COA/lab PDFs on the `shop-media` bucket).

## Manage shop scope (from Linear — to prototype next)
DEV-81 (products: group-to-location, full edit, media re-sort/delete/upload/download-all, video), DEV-12 (price visibility: show all / hide all / show one list publicly + per-product dials), DEV-1/DEV-41/DEV-54 (custom per-customer lists), DEV-43 (Streichpreis / strike-through discount).
