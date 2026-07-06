# Allocate prototype — notes

**Status:** FINALIZED 2026-07-06 — Marcel reviewed + filed line-item feedback (DEV-157), folded in below. Throwaway — building now in `src/`.

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

### Sales calendar (2026-07-05 → DEFERRED 2026-07-06)

- **Light theme** now (was dark) — whole page matches the system theme.
- **⚠️ DEFERRED from the real build (2026-07-06 decision):** Ayush is actively building
  the Buy-side sales calendar (Marcel gave him line-item feedback today, DEV-154 — separated
  month bands, Y-axis steps, weighted-avg-price line, analytic-card headers). Rather than
  design a second calendar here, **Allocate ships first as Orders & Offers + Batches only**;
  the Sales calendar section stays a stub/placeholder in `src/app/` until the shared
  calendar component exists, then Allocate adopts it. Don't invest further in this
  section's design.

### DEV-157 "ALLOCATE" — Marcel's line-item feedback (2026-07-06), folded into the prototype

All 8 points applied directly to `index.html` (Batches/allocator section):

1. **Substitute → Supply in one go** — picking a replacement in the dropdown now
   immediately substitutes AND marks the row Supply (`setSub`); no separate "✓ Apply" click.
2. **Bubble copy = "pick a replacement"** — the picker's placeholder option, not a caption line.
3. **Button order = Decline / Substitute / Supply** (was Supply/Substitute/Decline) —
   now matches the column header label, which already said this order.
4. **Grams only** — removed the g/kg toggle entirely; `fmtVol` always renders grams.
5. **✕ to stop replacing** — once substituted, a small ✕ next to the replacement name
   (`cancelSub`) reverts the row to the original product, undecided.
6. **Big titles, no subtitles** — `.secbar h2` bumped 15.5px/700 → 22px/800; removed the
   small italic helper line under "Batches" (Choco-style: bold section titles, no
   AI-caption text under them).
7. **Filters added** on the **Product** and **Units ordered** columns (same header-dots
   pattern as Type/Unit vol already had).
8. **Default sort = highest volume total first**, tiebreak by highest unit volume
   (`allocSort` default `'voltotal'`); the old "Highest Margin" default is now just
   another sort chip.

Verified: inline JS re-parses clean (`node -e "new Function(...)"`) after every edit —
no live Chrome session to screenshot against this pass.

## Verdict

- **Winning variant (2026-07-05, Muskan): one scroll page (ex-Variant C), reordered
  Orders & offers → Batches → Sales calendar.** Tabs A/B deleted; the strip chips are
  now jump-links that smooth-scroll to each section. Section-wise refinement next.
- **Margin badge: REMOVED** from the customer cell (sort-by-margin kept).
- **Substitution (2026-07-06, superseded by DEV-157 #1):** collapsed from the 2-step
  pick→Apply into **one step** — picking a replacement immediately substitutes AND
  marks the row Supply; a ✕ next to the replacement undoes it. Decline = whole row
  (no qty input), unchanged.
- **Product strip** = small square photo tiles (first Present shop photo), hover-zoom,
  select = slightly bigger + highlighted (name + cultivar only).
- **Calendar** = DEFERRED from the real build (see DEV-157/154 note above) — Orders +
  Batches ship first.

### Resolved by Marcel (DEV-157, 2026-07-06)
- Buttons (not swipe) for Decline/Substitute/Supply — confirmed, order is now
  Decline/Substitute/Supply (see feedback list above).
- Order-# format `HS-CCC-AUR-260512-001` and `DD-Mon-YY` dates — no objection raised;
  treating both as confirmed as-is.

### Still open (low priority — doesn't block building)
- "Deal update" status colour (prototype = orange) — DEV-151 confirms the 8-state
  vocabulary and colours (pink/pink/yellow/green/orange-ish/blue/dark-green) but doesn't
  pin an exact hex; keep prototype's orange until flagged otherwise.
- Deal receipt rail — still wireframe content, not iterated.
- ⚠️ **Scope note:** `docs/product/surfaces/SELL.md` still marks batch allocation as
  **post-MVP (LAYER-2 §3 lock)**. Marcel's DEV-157/151/152 activity (2026-07-05/06)
  reads as an implicit un-park, but the lock doc itself needs an explicit update before/while
  building — see SELL.md + LAYER-2-SURFACES.md §3.

Full context now lives in `docs/product/surfaces/SELL.md` (canonical Allocate home).
