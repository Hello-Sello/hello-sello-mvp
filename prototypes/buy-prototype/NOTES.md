# Buy page - prototype

**Throwaway prototype. Open question - NOT locked.**
Run: open `index.html` directly in a browser, or `python3 -m http.server 8777 --directory prototypes/buy-prototype`.
**Variant B won (2026-07-05)** - the page is now single-variant; the switcher is gone.

## Question this answers

Ayush (2026-07-05) brought three reference screenshots for the BUY page and asked for one
prototype that carries all three pieces:

1. **Deals timeline** - dark board, suppliers (partners) on the left, weeks/days on top,
   purple pills = deals. Click a partner -> its products expand; click a product -> its
   pack sizes (10 g / 50 g / 1000 g) expand; click a pill -> deal details. Glass toggle
   Week / Month / Year (click active Week again -> pick a specific week). "Purchases /
   month" band across the top. Sort by revenue / top accounts / A-Z.
   "Upload CSV to see your sales & purchases" entry point.
2. **Analytics** - price-by-volume chart (bars = weekly purchase volume kg, line =
   weighted avg purchase price €/g) + filters (time, supplier, type, product, pack size).
3. **Data sheet** - the Google-sheet economics table (revenue, weighted avg purchase
   price, buyer-inserted net/gross end-customer prices, DB1 total, margin %, DB1/unit,
   qty, revenue share, sub market, market), scrollable, frozen Supplier + Product columns,
   click a column header to chart it. DB1 is per selling unit - never averaged.

Which page structure carries these three best? (Linear was not reachable this session -
the Linear connector needs re-auth - so the screenshots + BUY.md stub are the spec.)

## The three variants

| | Name | Structure | What it tests |
|---|---|---|---|
| A | **Three tabs** | Segmented control: Deals / Analytics / Data sheet - one view at a time, each full height | The faithful mapping of the three screenshots to three sub-views |
| B | **One-scroll** | KPI strip -> timeline -> analytics -> sheet in one scrolling page with a sticky section nav | The whole BUY story in one sweep, no context switch |
| C | **Linked workbench** | Timeline on top is the MASTER; bottom dock (Chart / Table) filters to whatever partner / product / pill you select; breadcrumb pops back | Drill-down as navigation - analytics always in context of the click |

Deliberately structural differences: A = separate views, B = one page, C = cross-linked
master-detail.

## Shared foundation (same in all variants)

- Shell: pink glass rail + topbar, buyer account = Aurora Deutschland GmbH, Buy icon active.
- One dataset (`window.HS` in index.html): 9 suppliers (Auromed, Cantouring, Demecore,
  Remedysan, FourTen Pharma, BioMed Solutions, PharmaCore Int, MedLink Systems,
  VitalPharma AG), products with pack-size SKUs, 21 April-2026 deals (the pills),
  weekly volume/price series, and the sheet math in ONE place:
  `DB1 total = (net - purchase) x volume`, `DB1/unit = net - purchase`,
  `margin % = DB1 / revenue`. April "Purchases / month" is computed from the deals.
- Net + Gross end-customer prices are buyer-editable in the sheet (empty = pink
  "insert" affordance), and editing recomputes DB1 live.

## Verdict (Ayush, 2026-07-05)

**Variant B "One-scroll" won.** A (Three tabs) and C (Linked workbench) are deleted from
the prototype, and the variant switcher is gone.

Feedback applied in the same session:

1. **No dark screens.** The deals timeline board and the analytics chart panel were dark
   in the reference screenshots; Ayush wants the product theme everywhere. Both are now
   light glass cards - pink brand pills (instead of purple-on-dark), pink today-column
   highlight, light gridlines, white popovers and menus, violet price line on white.
2. **No floating filter controls.** The Week/Month/Year glass toggle used to float over
   the top edge of the board (it collided visually with the sticky section nav); it now
   sits anchored at the right end of the "Deals timeline" section header. The five chart
   filter chips (time / supplier / type / product / pack size) used to float stacked on
   the chart's right edge; they are now a docked chip row above the chart inside the card.

Still open for the real build: nothing structural - the one-scroll shape (KPIs ->
timeline -> analytics -> sheet with scroll-spy nav) is the picked direction.

## Round 2 feedback (Ayush, 2026-07-05, same day)

1. **Months band must not look like a filter.** The "Purchases / month" cells were
   white bordered boxes (April outlined pink) - they read as clickable filter chips.
   Now they are plain text labels; only the CURRENT month (April) sits on a soft pink
   highlight. Information, not control.
2. **Zebra rows + wider board.** Partner rows alternate white / soft pink (1 white,
   2 pink, 3 white ...) so the eye can follow a supplier across the wide grid. The
   timeline grid now has the same inner width as the sheet (1720px, horizontal scroll
   inside the card) and the board grew taller (560px) - room for many suppliers.
3. **Sheet = 3-level drill-down.** Supplier row (+) -> category rows per product type
   (+) -> product rows. Collapsed rows show honest rollups only: revenue total,
   weighted avg purchase price, DB1 total, margin-from-totals, qty, share. Per-unit
   and buyer-editable cells (net / gross / DB1 per unit) stay BLANK until product
   level - that is the answer to "what shows when a category is not expanded".
   Editing a product's net price live-updates its category + supplier rollups.
   Default demo state: first supplier open with its first category open.

## Round 3 feedback (Ayush, 2026-07-05): merge analytics + sheet

The graph IS the graph version of the table, so they must read as ONE thing:

- One section ("Analytics"), one glass card: control row on top (filter chips +
  range chips), the graph, a divider, then the table. The separate "Sheet" section
  and nav item are gone (nav = Deals / Analytics).
- The graph has two modes: default = Price by volume (weekly bars + price line);
  clicking any numeric TABLE HEADER switches the main graph to that column as
  per-product bars, with the table column highlighted in the same violet and an
  "x back to Price by volume" reset chip. All numeric columns are chartable.
- The filter chips steer BOTH: they filter the table rows AND the graph. With a
  supplier/type filter active, the default weekly chart switches to that filter's
  April deals aggregated per week (the global CSV series has no per-supplier data).
- Table clarity fixes: text columns are now truly left-aligned (a CSS specificity
  bug kept them right-aligned), per-cell vertical borders removed, more padding,
  and the fixed product-name column indents by level (category 16px, product 42px)
  so the tree reads at a glance.

## Round 4 feedback (Ayush, 2026-07-05): dynamic headings + all filters live

- **Dynamic headings.** The graph title/sub and a new table title/sub always
  narrate the current state, e.g. "Price by volume - Cantouring - Driftwood
  Diesel" / "1 supplier · 1 product · last month · 1000 g packs". Clicking a
  column header renames the graph ("Revenue EUR per product - ...") and the
  table sub notes which column is charted.
- **All five filters are functional now** (time / supplier / type / product /
  pack size - product and pack and time were stubs before):
  - Time slices the visible weeks (7d -> 2, 14d -> 3, month -> 5, 3 months ->
    all 13) and is synced two-way with the range chips next to the pills.
  - Product narrows table + graph to one product; picking a supplier clears a
    product that does not belong to it; the product menu is scoped by the
    active supplier/type.
  - Pack size filters the deal-based charts (the per-product economics table
    has no per-pack data - the heading says "applies to deal charts").
  - Any supplier/type/product/pack filter switches the weekly chart from the
    global CSV series to April-deals aggregation, since the CSV series has no
    per-supplier dimension.

## Round 5 feedback (Ayush, 2026-07-05): tree column + time-based graph + row selection

1. **One tree column instead of three.** The "n categories - n products" text is
   gone. Supplier, category, and product now live in ONE sticky column
   ("Supplier / Product"), one below the other with indentation and +/- chips -
   the standard tree-table pattern. The table dropped from 15 to 13 columns.
2. **The graph is always euros over time.** x = time (months by default:
   Feb/Mar/Apr), y = EUR. The time filter changes granularity: 3 months ->
   monthly bars, last month -> April weeks, 14/7 days -> daily bars from deals.
   Selecting a column header (Revenue, DB1, purchase/net/gross/unit prices)
   changes WHAT is plotted, never the axes. Per-unit euro columns draw as a
   line (weighted avg); Margin % / qty / share only highlight (not euros) with
   an explaining toast. Up to 6 products in scope render as a STACKED bar
   (color per product, legend + hover breakdown); more collapse to one total.
3. **Table rows drive the graph.** Clicking a supplier row, a category row, or
   a product row selects it (pink left bar) and the graph re-scopes to it;
   clicking again deselects one level. Filter-pill changes clear the selection
   (last interaction wins). Reset chip clears measure + selection.
   Known data honesty note: monthly per-product splits are synthesized
   deterministically (demo data has no real monthly detail); unfiltered
   monthly purchases use the real month totals from the band.

## Round 6 feedback (Ayush, 2026-07-05): vertical filter rail + pencil edit

1. **Filters moved to a vertical rail on the left of the Analytics card.**
   The horizontal control row on top read as borrowed from the reference
   screenshots; Ayush wants the filters standing vertically at the left,
   taking the card's full height. The rail holds the five filter pills
   (Time / Supplier / Type / Product / Pack size) stacked, then a "Quick
   range" group with the six range chips stacked below. Same behavior as
   before: the rail steers the graph AND the table together, range chips
   stay two-way synced with the Time pill. Graph + divider + table now sit
   in a right column next to the rail.
2. **Net / gross are pencil-edit cells now (pharmacy inserts + updates).**
   Empty cell = dashed pink "insert" pill with a pencil icon; filled cell =
   value + pencil icon (strong on row hover). Clicking the pencil opens an
   inline input (value preselected); Enter or clicking away saves, Escape
   cancels. Saving a net price live-recomputes DB1 / margin / rollups / KPIs
   as before - recompute now happens on commit, not on every keystroke.
   The Excel-sheet formulas for these fields are deliberately NOT in the
   prototype; they come in the real build.
