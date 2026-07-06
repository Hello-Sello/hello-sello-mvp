# Sell — the Allocate page

## One-sentence definition

Seller-side operations surface where a producer **allocates their batches across incoming pharmacy orders** — supply, substitute or decline each — with margin and FIFO control. Big-7 value prop: *"Sell — allocate your batches with amazing margin control."*

> **Nav label = "Allocate"** (the verb), sidebar target for this surface.

## Status

- Depth: **prototype finalized** (design contract = `prototypes/allocate-prototype/`, built 2026-07-05, finalized 2026-07-06)
- Last updated: 2026-07-06
- Build status: **BUILDING NOW.** Post-MVP lock un-parked (LAYER-2 §3, 2026-07-06) — goal is Sell/Allocate live in-product for the **8 July demo** (seed data OK). Marcel confirmed direction + filed line-item feedback same-day (DEV-157), folded into the prototype. Building via `/gsd:quick` — Orders & Offers + Batches first.
- **Sales calendar section is DEFERRED** from this build — Ayush is building the Buy-side calendar (Marcel's DEV-154 feedback, 2026-07-06); Allocate ships with the calendar section as a stub/placeholder and adopts the shared component once it exists.

## Who uses this surface and why

Primarily the **seller-side sales / procurement team** (e.g. Canadian Craft, Aurora). Strictly seller-side ops — **no cross-side analytics** (those live in Grow). The job: a supplier with limited batch inventory decides how to distribute it across competing pharmacy orders, optimising for margin and best mix, honouring FIFO on batches.

---

## Page architecture — one scrollable page, 3 sections

**Locked (2026-07-05):** a single scrolling page (not tabs). A pill jump-strip at the top smooth-scrolls to each section. Scroll order:

1. **Orders & offers** — the incoming-order inbox
2. **Batches** — the allocation work surface (the differentiator)
3. **Sales calendar** — partner purchasing timeline (deal tracking)

*(Variants A "calendar-first" and B "orders-first" were prototyped as tabbed pages and discarded in favour of the scroll page reordered Orders → Batches → Calendar.)*

A shared **Deal receipt card** (right rail) slides in when a row/order/pill is clicked — see [§ Shared: deal receipt](#shared-deal-receipt-card).

---

## Section 1 — Orders & offers

The inbox of incoming orders. Excel/Power-BI-style header controls: each header carries a sort or filter menu; the icon turns pink when active.

**Columns:** Order Nr. · Customer · Insight · Received · Delivery · SKU · Ordered via · Order status · ⋮

| Column | Header control |
|---|---|
| Customer | Sort A→Z / Z→A · **Top accounts first** (by revenue) |
| Received / Delivery | Sort oldest / newest |
| SKU (count of products) | Sort low→high / high→low |
| Ordered via | Filter: **Hello Sello / E-mail / Fax** (no "→ Sella" pointer) |
| Order status | Filter by status value |

- **Row ⋮ menu** (standard three-dots — no inline action icons): **View** (opens the deal card) · **Send** (to a colleague) · **Print** (the deal order).
- **"Requested delivery" → "Delivery"** (renamed).
- Customer column is name-only (no icon chip).

### Order number format — ⚠️ deviates from DEV-26

`HS-<seller initials>-<buyer initials>-<YYMMDD>-<NNN>` — e.g. `HS-CCC-AUR-260512-001`.
(HS · both companies' initials · 2-digit year + month + day · 3-digit sequence.)

**This is shorter than the DEV-26 locked pattern** `HS-AAA##-BBB##-NNNNNNNN` (`HS-AUR01-CCR01-00058632`). DEV-26 §4 already flagged the short-code derivation rule as open. **If Marcel confirms this format, DECISIONS.md + LAYER-3 §4 need an amendment.**

### Date format — platform-wide standard

`DD-Mon-YY` — e.g. `12-May-26`. Applies everywhere (orders, receipt, signatures). **To be written into DECISIONS.md as a UI convention once confirmed.**

### Order-status vocabulary (Marcel, 2026-07-05)

Maps 1:1 onto the locked deal lifecycle — good convergence signal.

| Status | Colour | Meaning | Doctrine link |
|---|---|---|---|
| Sales offer | pink | seller sent the offer | DEV-26 OFFER birth mode |
| Purchase order | pink | buyer sent the order | DEV-26 ORDER birth mode |
| Deal accepted | yellow | both parties accepted | — |
| Deal executed | green | seller uploaded invoice + delivery note | DEV-25 done-trigger |
| Deal update | orange* | invoice differs from deal / potential split / potential product cancellation | DEV-23 / DEV-36 amendment |
| Ticket created | blue | a party opened an issue ticket | — |
| Ticket closed | dark green | ticket resolved | — |

\*"Deal update" colour not specified by Marcel — prototype uses orange (attention-needed, distinct from the yellow "accepted"). Confirm with Marcel.

---

## Section 2 — Batches (the allocator)

The permanent **work surface** — a producer comes here to allocate. The table is **always visible** (all products, all open order rows).

### Product strip (top)

- Horizontal row of **small square photo tiles** (~72px) — the image is the product's **first shop photo from Present** (updates when the shop updates; gradient + initials fallback).
- **Hover** = gentle zoom-lift. **Selected** = slightly bigger + pink highlight, shows name + cultivar.
- Clicking a tile **filters** the table to that product; click again → all products.

### The allocation table

**Columns:** Customer · Type · Product · Units ordered · Unit vol · Vol total · Price / g · Price total · Batch · Status · Decline / Substitute / Supply

Header controls (same Excel/Power-BI pattern):
- **Customer:** sort A→Z / Z→A / **Top accounts first**
- **Type:** filter by Key Account / Category
- **Unit vol:** filter by pack size (10g / 50g / 1000g) → then pick batches for the volume you're working with
- **Sort strip:** Highest Margin (default) · First Order · Key Accounts
- **g / kg toggle:** one unit switch governs **every** volume shown (vol total, batch stock, split inputs, stock bars) — units stay consistent throughout.

### Per-row decisions — Supply / Substitute / Decline

The key model insight: **substitution is a separate two-step attribute; Supply/Decline is the decision.** (Conflating them into one "mode" made the flow unreadable — they were split.)

- **Supply** — commit the order from batch stock.
- **Substitute** — two steps: click **Substitute** → a product dropdown opens (nothing cut yet, status "picking substitute…") → pick replacement → click **✓ Apply** → the old product gets a strikethrough, the new shows in green, and the view **jumps to the substitute product**. The row still needs a Supply/Decline decision ("Substituted → now Supply or Decline"). Undoable.
- **Decline** — one click declines the **whole** order row (no partial-quantity input).

### Batches — FIFO + splitting

- Batches listed **oldest-first**; the **oldest batch is preselected by default** (FIFO — implicit, not labelled in the UI).
- **Split batches:** per row, "⑂ split batches" → N lines of (batch + quantity); the sum is validated live against the row volume (✓ fully allocated / Xg unallocated / over). Lets a producer fulfil one order from e.g. some kg of SB-273 + some kg of SB-275.

### Live batch stock bars

- **Above** the table (next to the g/kg toggle): a bar per batch showing **allocated / available**, filling as you allocate; turns red if over-allocated. Only **supplied** volume commits stock (declines/pending don't).

### Partial confirm & send

- Decide any **1..n rows** → **CONFIRM & SEND (n)** locks just those (dimmed + "✓ SENT"); the rest stay **pending** for a later pass. (A producer works a few customers, sends, comes back.)

---

## Section 3 — Sales calendar

Deal-tracking timeline — **partners as rows, days/weeks/months as columns**, purchase pills, per-period €-totals ("Purchases / month"), sortable by revenue / top accounts / alphabetical, Week/Month/Year toggle. Clicking a pill opens the deal receipt. Sella = right-edge sliver, "AI functions coming soon".

**⚠️ Design is a placeholder.** Ayush is building the same sales calendar for the **Buy** section — this section will **adopt his component** (one shared calendar, both surfaces). Muskan to sync with him; don't invest further in this section's layout.

---

## Shared: deal receipt card

The red "ticket" rail (slides in from Calendar pills + Order rows). Carries: deal ID, from→to, line items (with strikethrough substitutions + discount lines), a **Things** checklist (CNL / PO uploads — DEV-30 THINGS), a message, and actions: **Change · Approve · Finalize by uploading invoice · Create ticket for clarification**. **Approve = the DEV-29 signature** (captures approver + timestamp).

*(Still carries the wireframe's content — not yet iterated in the prototype.)*

---

## What this surface shares with others

- **Foundation:** User, Brand, Notifications, Auth, Permissions, Event stream.
- **Cross-cutting Sella:** seller-Sella (help draft offers, suggest pricing, query analytics — "coming soon").
- **Surface-to-surface contracts:**
  - **Present** owns the products/photos surfaced here (batch tile image = first shop photo).
  - **Buy** shares the **Sales-calendar component** (Ayush's build).
  - Offers become **Deals** in Connect; the deal receipt card is the Layer-3 deal artifact.
  - **DEV-1 pricelist cascade** governs price/g: customer-specific (Relationship) → seller STANDARD → manual.

## Doc guardrails honoured in the prototype

- Sell is **strictly seller-side ops** (LAYER-2 §3) — no buyer analytics.
- Batch allocation is **post-MVP** (LAYER-2 §3) — this stays a prototype until re-scoped.
- Seller procurement does inventory/batch mgmt → **FIFO allocation** (LAYER-1 §Users).
- DEV-29 approve-button-as-signature; DEV-25/26/23/36 status vocabulary.

## Open / pending Marcel confirmation

1. **Order-number format** — confirm `HS-CCC-AUR-260512-001` (vs DEV-26 pattern) → amend DECISIONS.md + LAYER-3 §4 if yes. Also: dashes between every part vs fused initials (`HS-CCCAUR-…`).
2. **Date format** `DD-Mon-YY` platform-wide → DECISIONS.md UI convention.
3. **"Deal update" status colour** (prototype = orange).
4. **Buttons vs swipe** for Supply/Substitute/Decline (prototype = buttons; swipe = possible mobile affordance).
5. **Sales-calendar design** — adopt Ayush's Buy component.
6. Deal receipt card — not yet iterated (still wireframe content).

## References

- `prototypes/allocate-prototype/` (`index.html` + `NOTES.md`) — the live design contract.
- `../layers/LAYER-2-SURFACES.md` §3 (Sell), §5 (Grow boundary)
- `../layers/LAYER-3-DEAL-EXECUTION.md` (deal lifecycle, DEV-25/26/23/29/30/36)
- `../layers/LAYER-1-USERS-AND-CORE-OBJECTS.md` (seller roles, FIFO allocation)
- `../PITCH.md` ("pre-sell batches and allocate by best margin")
- `../../CSV's/` — real Canadian Craft product/pricelist data (prototype seed)
- Open Linear: DEV-15 (nav pattern — this page answers it), DEV-19 (Sell features beyond the 3 sections), DEV-76 (Sell→Allocate build, deferred)
