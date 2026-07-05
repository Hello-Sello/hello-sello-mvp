# Allocate prototype — notes

**Status:** first pass 2026-07-05, for Marcel to confirm. Throwaway — build later in `src/`.

## The question this prototype answers

How do the 3 Allocate sections (from Marcel's wireframes) live on **one tabbed page**,
and **which tab lands first**?

- **Variant A** — Sales calendar first (deal tracking as the landing visual — Muskan's steer)
- **Variant B** — Orders & offers first (matches the wireframes' "Section 1" label)
- **Variant C** — no tabs: all 3 sections stacked on **one scrollable page** (calendar → orders → batches), the strip becomes jump-chips that smooth-scroll to each section

Toggle in the dark top strip (or ←/→ keys, cycling A→B→C). `?variant=A|B|C` in the URL is shareable.

## What's in it

| Tab | Interactions that work |
|---|---|
| **Sales calendar** | Week/Month/Year toggle · sort cycle (revenue → top accounts → A–Z) · click a purple pill → deal receipt rail |
| **Orders & offers** | Click a row → deal receipt rail · per-row ✕/⇄/✓ mock actions |
| **Batches** | Pick a jar → pack size (10/50/1000g) + batch picker → allocation table: **Supply / Substitute / Decline** per row (substitute shows a product picker) → batch commit bar fills → **CONFIRM SUPPLY** (needs every row decided) |

Shared **deal receipt rail** (the red ticket): Change / **Approve** (adds the DEV-29-style
signature status line) / Finalize by invoice / Create ticket. Line items include the
strikethrough-substitution + discount row from the wireframe.

Seeded with the **real Canadian Craft products** from `docs/CSV's/Product list… .csv`
(Spirit Bear STR 28/1, Superseed GRP 27/1, Mystery Mountain TBM 8/10, Tofino Ripper ELC 20/1)
with their real RRP / standard / bundle prices. Margin % shown per allocation row
(COGS assumed 2,50 €/g — placeholder).

## Deliberate choices to confirm with Marcel

1. **Tab order** — A or B (the whole point of the variants).
2. **Buttons, not swipe** for Supply/Substitute/Decline (his wireframe asks "swipe or buttons?").
   Buttons chosen for desktop; swipe could be the mobile affordance later.
3. **Calendar totals row** = per-month chips above the week grid (his wireframe mixes
   month totals over week columns; kept his framing, labelled it "Purchases / month").
4. **Company = Canadian Craft** (real launch customer + real CSV data), not the wireframes'
   Aurora — pure demo-credibility choice, flip back if he prefers Aurora.
5. **Margin % per row** — small addition beyond the wireframe; it's the pitch line
   ("allocate by best margin") made visible. Cut if noise.
6. **Sella** = right-edge sliver, "AI functions coming soon" (per his annotation).

## Doc guardrails honoured

- Sell is **strictly seller-side ops** (LAYER-2 §3) — no buyer analytics here.
- ~~DEV-26 deal-ID shape~~ **⚠️ DEVIATION (Muskan, 2026-07-05):** order numbers now
  `HS-<seller>-<buyer>-<YYMMDD>-<NNN>` (e.g. `HS-CCC-AUR-260512-001`) — shorter than the
  DEV-26 locked pattern `HS-AAA##-BBB##-NNNNNNNN`. If Marcel confirms, DECISIONS.md +
  LAYER-3 §4 need an amendment (the short-code derivation there was already flagged open).
- DEV-29 approve-button-as-signature on the receipt's Approve.
- DEV-1 price cascade implied by standard vs bundle prices in the product card.
- Batch allocation is **post-MVP** per LAYER-2 lock — this stays a prototype until that's re-scoped.

## Decisions captured while iterating (2026-07-05)

- **Order-status vocabulary (Marcel):** Sales offer (pink, seller sent) · Purchase order
  (pink, buyer sent) · Deal accepted (yellow, both accepted) · Deal executed (green,
  seller uploaded invoice + delivery note) · Deal update (invoice differs from deal /
  potential split / potential product cancellation) · Ticket created (blue) ·
  Ticket closed (dark green).
  → Maps cleanly onto locked doctrine: offer/order = **DEV-26 birth modes**; executed =
  **DEV-25 done-trigger** (invoice + delivery note); update = **DEV-23/36 amendment**.
  When confirmed, this naming belongs in LAYER-3 / DECISIONS.md as the user-facing
  status vocabulary.
- **Excel/Power-BI header sort+filter** on the orders table: Customer/Received/Delivery/SKU
  sortable; Ordered via + Order status filterable by value. "Requested delivery" → "Delivery".
  Ordered-via values are plain **Hello Sello / E-mail / Fax** (no "→ Sella" pointer).

- **Row actions = ⋮ menu only** (View / Send / Print) — no inline decline/substitute/accept
  icons in the orders table; standard three-dots pattern platform-wide.
- **Date format = `DD-Mon-YY`** (e.g. `12-May-26`) — **platform-wide standard.**
  → When confirmed with Marcel, this belongs in DECISIONS.md as a UI convention.

### Batches section (Marcel/Muskan 2026-07-05)

- **Table = permanent work surface** (always visible, all products); the jar strip on top
  **filters** by product (click again → all). Product + Batch columns added.
- **FIFO batching:** batches sorted oldest-first, default selection = oldest batch.
- **Batch splitting:** per row, "⑂ split batches" → N lines of batch + grams; sum
  validated against the row volume (✓ fully allocated / Xg unallocated / over).
- **Partial confirm:** decide any 1..n rows → CONFIRM & SEND locks just those.
- **Partial decline:** decline qty editable; remainder auto-supplies.
- **Substitution visible:** old product struck through, replacement picked below.
- **Light theme** for the allocator table (matches system theme, not the dark wireframe).
- **Margin badge removed** from customer cell (sort-by-margin remains).

### Sales calendar (2026-07-05)

- **Light theme** now (was dark) — whole page matches the system theme.
- **⚠️ Design placeholder:** Ayush is building the same sales calendar for the **Buy**
  section — this section will adopt his design/component when ready (one shared
  calendar, both surfaces). Muskan to sync with him. Don't invest further here.

## Verdict

- **Winning variant (2026-07-05, Muskan): one scroll page (ex-Variant C), reordered
  Orders & offers → Batches → Sales calendar.** Tabs A/B deleted; the strip chips are
  now jump-links that smooth-scroll to each section. Section-wise refinement next.
- **Margin badge: REMOVED** from the customer cell (sort-by-margin kept).
- **Substitution redesigned** into a 2-step attribute (pick → ✓ Apply → old struck through,
  view jumps to substitute) separate from the Supply/Decline decision — the fix that made
  the flow legible. Decline = whole row (no qty input).
- **Product strip** = small square photo tiles (first Present shop photo), hover-zoom,
  select = slightly bigger + highlighted (name + cultivar only).
- **Calendar** = light theme, but a PLACEHOLDER → adopt Ayush's Buy-section calendar.

### Still open for Marcel
- Swipe vs buttons for Supply/Substitute/Decline (prototype = buttons).
- Order-# format `HS-CCC-AUR-260512-001` vs DEV-26 pattern (+ dashes vs fused initials).
- `DD-Mon-YY` date convention platform-wide.
- "Deal update" status colour (prototype = orange).
- Deal receipt rail — still wireframe content, not iterated.

Full context now lives in `docs/product/surfaces/SELL.md` (canonical Allocate home).
