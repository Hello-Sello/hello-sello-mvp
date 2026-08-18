# 0022 — Buyer shop view (the seller's shop, as a buyer sees it)

**Status:** DRAFT — awaiting G1
**Source:** Muskan, verbatim: *"From Discover, the user should be able to see the seller's
shop properly, like the Present page we have for the seller, but just for the buyer's view."*
**Scope home:** August MVP item 2 (`docs/muskan-build/august-mvp.md`) — the last unbuilt item
**Research:** `docs/muskan-build/0022-buyer-shop-view/RESEARCH.md`
**Spec rules:** per `docs/agents/PIPELINE.md` §5 this file names no tables, no file paths, no
components — the *what*, not the *how*. The *how* lands in the ADR at `/design`.

---

## 1. Problem

A buyer can find a seller on Discover, open their company page, and then stop. The page
shows a teaser: two products across, one line of text each — cultivar, THC, CBD, pack size,
origin — and a price or "Price on request". No specifications, no volume tiers, no quantity,
no way to buy.

The seller, meanwhile, has a full shop: banner, description, links, locations, and product
cards carrying the complete spec sheet, pack sizes and a volume price ladder. That shop
exists and is maintained — buyers just have no window onto it.

The consequence is the August MVP's blocking gap: **a buyer cannot place an order.** Marcel's
ask for the demo is *log in → connect to Canadian Craft → order with volume price brackets.*
Everything in that sentence is built except the middle: the buyer's view of the shop.

## 2. In / Out for v1

### In
- The catalogue area of the seller's company page becomes **the buyer's view of that
  seller's shop** — the same shop the seller maintains, rendered without edit affordances.
- Shop chrome: banner, logo, description/info, links, **location tabs**.
- Product cards at full fidelity: **complete specification set** on the card's detail face,
  images, pack sizes, quantity selection, and the **volume tier ladder reveal**.
- **Add to basket** from the card.
- **Per-product Request pricing** on any product whose price the seller has hidden, opening
  a conversation with the seller about that specific product.
- **Connection-aware product visibility** — a connected buyer sees the seller's whole
  catalogue; a non-connected buyer sees only what the seller has made visible.
- **Server-enforced basket admission** — a buyer may only add a product they are permitted
  to see.
- **Ordering without a connection**: sending an order to a seller you are not connected to
  also sends a connection request, announced before the buyer commits.

### Out — must not be built
| Deferred | Where it lives |
|---|---|
| Per-customer / per-buyer pricelists | Phase 15, September — the item most likely to be confused with this one |
| Cross-product bundles | September |
| Threshold nudge (*"add 20 g more and pay €7/g"*) | September |
| Person-to-person deals | Deals require a company relationship |
| Any seller edit affordance on this surface | Buyer view is **read + buy only** |
| Batch / lot selection by the buyer | The buyer orders a product, not a lot (§3.6) |
| Which shop or location a buyer is shown at connect time | DEV-113, unowned |
| Logged-out / anonymous viewing of a catalogue | Unchanged — stays closed |

## 3. Decided in the spec interview (2026-08-18, Muskan)

| # | Question | Call |
|---|---|---|
| 1 | Can a **non-connected** verified buyer see prices? | **Yes — but only where the seller made that product's price public.** Confirms the shipped verified-member model; no overrule of the 2026-06-14 soft-openness lock |
| 2 | What does add-to-basket do for a non-connected buyer? | **Full controls.** Sending the order **also sends a connection request**, and the buyer is told so before they send |
| 3 | Price hidden — can the buyer still add it to a basket? | **No.** *"No buyer would send an order without knowing the price."* The card is read-only and offers **Request pricing** instead |
| 4 | Is Request pricing per-product or shop-level? | **Per-product** — the seller must know which product is being asked about. The exchange happens **in chat**; everything goes through chat |
| 5 | What does a buyer see when the seller has hidden every product? | **The shop shell + a locked-catalogue message with a Connect action** — banner, info and links still render |
| 6 | Does being **connected** override the seller's product-visibility switch? | **Yes.** *"Connected companies can always see shops."* The visibility switch means **"private from companies I am not connected to."** ⚠️ This changes locked behaviour — see §6.1 |
| 7 | Does being connected also override the **price** switch? | **No.** Price stays a standalone per-product choice for connected and non-connected alike. Customised pricing for connected buyers is Phase 15's job, not this slug's |
| 8 | How much product detail does the buyer get? | **Full specifications, no batch/lot list.** The buyer orders the product, not a specific lot |
| 9 | Does the buyer get the seller's **location tabs**? | **Yes, for now** — same tabs as the seller's own shop. Flagged: DEV-113 asks a related unresolved question |
| 10 | Should basket admission be enforced on the server? | **Yes** — the same permission rule as the read path, checked when the product is added |
| 11 | Non-connected buyer sends — what reaches the seller? | **Both at once**: the connection request and the order. The **order cannot be opened or acted on until the connection request is accepted** |

**Muskan's overrule of researcher findings:** none. Decision 6 changes a locked behaviour
but was not a researcher claim — it is a new product call (§6.1).

## 4. Functional requirements

1. **One shop, two viewers.** The buyer sees the seller's shop — the same catalogue, the
   same cards, the same location grouping — with every edit affordance absent, not merely
   disabled.
2. **Visibility rule.** A buyer may see a product if **either** their company is connected
   to the seller **or** the seller has marked that product visible. Verification of the
   buyer's own company remains a precondition in both cases.
3. **Price rule.** A product's price shows only where the seller has made that price
   public. Connection does not change this. Where the price is hidden, the tier ladder is
   hidden with it.
4. **Priced product.** Card shows the price, the pack sizes, a quantity control, a reveal
   of the full volume tier ladder, and add-to-basket. Quantity reaching a rung applies that
   rung's price before the product is added.
5. **Price-hidden product.** Card shows "Price on request", carries no quantity control and
   no add-to-basket, and carries a **Request pricing** action that opens a conversation with
   the seller identifying that product.
6. **Empty catalogue.** Where a buyer may see no products at all, the shop shell still
   renders and the catalogue area states that the catalogue is private, with a Connect
   action.
7. **Basket admission.** The permission rule in (2) is enforced where the product is
   admitted to the basket, on the server. A rejected admission produces no basket line.
8. **Ordering without a connection.** Before the buyer commits, the surface states that
   sending will also send a connection request. On send, both reach the seller. The order is
   **inert** for the seller — visible, not openable — until the connection request is
   accepted; accepting it releases the order.
9. **Prices are read through the existing single price door.** No feature re-derives a
   price or a ladder for itself (`ARCHITECTURE-NOTES.md:423`).

## 5. Inputs / outputs

**In:** the identity of the seller company being viewed; the viewing person and their
company; that company's verification state; the connection state between the two companies;
per-product visibility and price-visibility settings; the seller's catalogue, locations,
shop presentation, prices and tier ladders.

**Out:** the rendered buyer shop view; basket lines; a per-product pricing request delivered
as a conversation with the seller; an order plus, where no connection exists, a connection
request.

## 6. Constraints

### 6.1 ⚠️ Decision 6 changes locked behaviour and needs a backend change
Product visibility today is **connection-independent by design** — locked 2026-06-14
(`DECISIONS.md:1010`) and justified by German HWG advertising limits: catalogue and prices
show to logged-in **verified members**, never the open internet, and never scoped by
relationship. The current read path checks only the caller's own verification.

Decision 6 adds a second, wider door: *connected → see everything.* Consequences:
- **This slug now carries a migration and a permission-rule change.** `STATE.md` records
  that the no-feature-branch call must be revisited if `/spec` turned up exactly this.
- **The HWG reasoning is not weakened** — the audience only ever widens to a company that
  is verified *and* has an accepted relationship with the seller. It is narrower than the
  public arm it sits beside, not broader.
- The change must be recorded in `DECISIONS.md` as an amendment to the 2026-06-14 lock.

### 6.2 Terminology correction owed
`CONTEXT.md` defines **Buyer Shop View** as *"as a connected buyer sees it."* Decision 1
establishes the surface serves non-connected verified buyers too. That word must be
corrected when this spec is approved.

### 6.3 One read door
Prices and ladders are read through the existing single price door. A parallel reader for
this surface is prohibited (`ARCHITECTURE-NOTES.md:423`).

### 6.4 A competing unbuilt plan is superseded
`docs/superpowers/plans/2026-07-07-product-basket.md` Tasks 9–11 specify a different route,
a different read door and a **connection-required** gate for this same capability. It was
never built and is stale (it returns two price columns that no longer exist). This PRD
supersedes it; it needs a dead marker so it stops reading as live intent.

### 6.5 Enforcement is server-side
Every rule in §4 (2), (3) and (7) is enforced on the server. Hiding a control in the
interface is presentation, never the gate.

## 7. Edge cases

| Case | Behaviour |
|---|---|
| Viewer's own company is **not verified** | No catalogue and no prices — unchanged from today's gate |
| Viewer is **logged out** | Out of scope; unchanged |
| Viewer is a member of the **seller's own** company | Sees their own shop; this surface offers no edit affordance — editing lives on the seller's own shop surface |
| Product visible, price public, but **no tier ladder** | Base price only; the ladder reveal does not appear |
| Product **visible-from / visible-until** window has passed | Treated as not visible; the connection override in §4 (2) applies to the seller's visibility switch, not to an expired window |
| Connection exists but is **pending, not accepted** | Not connected — the buyer sees only what the seller made visible |
| Buyer basket already holds a line for a product that later becomes invisible to them | Out of scope for v1; the price simply resolves as unavailable |
| Seller has locations but **no products in one** | Tab renders empty, consistent with the seller's own shop |

## 8. Acceptance criteria

Each is walkable on a running page. G4 walks these verbatim.

1. A **verified buyer not connected** to a seller opens that seller from Discover and sees
   the seller's shop banner, information, links and location tabs — with **no edit control
   anywhere on the page**.
2. On that page, a product the seller made **visible with a public price** shows its price,
   and opening its price reveal shows the **full volume tier ladder**.
3. On that page, a product the seller made **visible with the price hidden** shows
   "Price on request", shows **no quantity control and no add-to-basket**, and carries **its
   own Request-pricing action**. Using it opens a conversation with the seller that names
   that product.
4. A seller who has **hidden every product**: the buyer still sees banner, information and
   links, and the catalogue area shows a locked-catalogue message with a Connect action, and
   **no products**.
5. The **same buyer, once connected** to that seller, reloads and now sees **every product,
   including the ones the seller had hidden**.
6. On that connected view, a product whose **price is hidden still shows "Price on
   request"** — connection has not revealed a price.
7. Opening any product's detail face shows the **full specification set** — CBG, CBN,
   terpene percentage, cultivator, lineage, irradiation code, packaging material, resealable
   — and shows **no batch or lot list**.
8. Raising the quantity on a priced product until it reaches a tier rung changes the price
   shown on the card to that rung's price **before** the product is added.
9. A **non-connected** buyer with a filled basket sees, **before committing**, a statement
   that sending will also send a connection request. After sending: the seller sees **both**
   a connection request and the order; attempting to open the order **is refused**; after
   the seller accepts the connection request, the order **opens**.
10. **Negative space** — a buyer who is neither connected to the seller nor looking at a
    visible product attempts to add that product to their basket: the **server refuses** and
    **no line appears** in the buyer's basket.
11. **Negative space** — nowhere on this surface, connected or not, does a save control,
    a manage-shop control, or a banner/logo edit control appear.

## 9. Open, not blocking

- **Compliance position for real pharmacies ordering** — ask Marcel (carried from
  `august-mvp.md`).
- **DEV-113** — which shop/location a buyer is shown when connecting. Decision 9 takes
  "all the seller's location tabs" *for now*.
