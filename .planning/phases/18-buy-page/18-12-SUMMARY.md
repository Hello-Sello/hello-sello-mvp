---
phase: 18-buy-page
plan: 12
subsystem: ui
tags: [react, nextjs, buy-page, analytics, filters, csv-import]

requires:
  - phase: 18-buy-page (18-10)
    provides: AnalyticsChart (hand-rolled SVG chart, ChartMeasure/ChartSeriesPoint contract)
  - phase: 18-buy-page (18-11)
    provides: AnalyticsTable (3-level drill-down tree table)
  - phase: 18-buy-page (18-08)
    provides: importPurchaseHistoryCsv server action + CsvImportResult error contract
  - phase: 18-buy-page (18-07)
    provides: getBuyAnalytics()/BuyAnalytics tree, weightedAveragePrice()
provides:
  - PartnersAnalyticsCard — the merged "Analytics + Sheet" glass card composing the vertical filter rail, AnalyticsChart, AnalyticsTable, and the CSV upload entry point
  - AnalyticsTable gains an additive onColumnHeaderClick/highlightedColumn prop pair (TableColumnClick type)
affects: [18-13 (wires PartnersAnalyticsCard into /buy page.tsx)]

tech-stack:
  added: []
  patterns:
    - "Parent-owns-state composition: PartnersAnalyticsCard owns FilterState/measure/selectedRowKey; both children stay presentational and receive already-derived props"
    - "Client-side re-slicing over an already-fetched server prop instead of a second fetch per filter change"
    - "Honest v0 data-shape documentation inline in code + UI when a filter has no real backing data yet (categoryId, packSize)"

key-files:
  created:
    - src/app/buy/PartnersAnalyticsCard.tsx
  modified:
    - src/app/buy/AnalyticsTable.tsx

key-decisions:
  - "Chart has no genuine per-transaction date in BuyAnalytics (getBuyAnalytics() returns period-summed totals, not a time series) — bars are one-per-entity at the current scope's most granular level (supplier, then category/product) instead of fabricating calendar buckets. Documented at length in the file header and buildChartPoints()."
  - "Type (categoryId) filter and Product filter resolve to the same row in v0 (degenerate category-per-product, 18-07's locked rule) — implemented as one combined productFilter internally, with an inline UI note next to the Type pill."
  - "Pack size filter has zero backing data in BuyAnalytics (the real product.pack_size_grams column isn't threaded through getBuyAnalytics(), which is out of this plan's files_modified scope) — rendered, wired into FilterState (participates in 'any filter clears selection' and the subtitle), but honestly has no real options and no filtering effect, with an inline UI note explaining why and what a follow-up plan would need to change."
  - "onColumnHeaderClick's type (TableColumnClick) is wider than the plan's illustrative ChartMeasure-only signature, because 4 real table columns (margin %, qty, share, DB1/unit) have no ChartMeasure representation at all (18-10's ChartMeasure deliberately excludes them) — the parent needs to see all 9 numeric-column clicks to correctly show the toast for the 4 non-chartable ones, not just the 5 chartable ones."

requirements-completed: [BUY-01]

duration: 45min
completed: 2026-07-08
---

# Phase 18 Plan 12: Merged Analytics + Sheet Card Summary

**Composed `PartnersAnalyticsCard` — the vertical 5-pill filter rail (Time/Supplier/Type/Product/Pack size + Quick range) that steers `AnalyticsChart` and `AnalyticsTable` together via client-side re-slicing of the already-fetched `BuyAnalytics` tree, plus the CSV upload entry point with per-cell error rendering.**

## Performance

- **Duration:** 45 min
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- Vertical filter rail with all 5 pills (Time, Supplier, Type/categoryId, Product, Pack size) + Quick-range chips, owning `FilterState`/`measure`/`selectedRowKey` — neither child component owns any of this state.
- `filterAnalytics()` narrows the `BuyAnalytics` tree by supplier/type-or-product before handing it to `AnalyticsTable` as `data` (so the table visibly reflects the active filter, not the raw unfiltered tree).
- `buildChartPoints()` derives the chart's bars client-side, with an honest fallback shape (one bar per entity at the current scope's most granular level) documented in place of a genuine time series the data doesn't support.
- Row selection re-scopes the chart to that supplier/category/product's own slice via `resolveScope()`; any filter-pill change clears the selection (rule 1, "last interaction wins").
- Column-header click switches `measure` for the 5 chartable columns (revenue/wap/net/gross/db1_total) and shows a toast for the 4 that aren't (margin %/qty/share/db1-per-unit), via a new additive `onColumnHeaderClick`/`highlightedColumn` pair on `AnalyticsTable`.
- CSV upload entry point calls `importPurchaseHistoryCsv()` and renders `CsvImportResult.errors` inline per row/column/message on failure, or a success toast + `router.refresh()` on success.
- Dynamic title/subtitle computed from current `filters`/`measure`/`selectedRowKey` state.

## Task Commits

Each task was committed atomically:

1. **Task 2 (AnalyticsTable additive prop half)** — `9538438` (feat): `TableColumnClick` type + `onColumnHeaderClick`/`highlightedColumn` props on `AnalyticsTable`, `Th` gains optional click/highlight styling.
2. **Tasks 1 + 2 (PartnersAnalyticsCard composition)** — `e0005e4` (feat): the full merged card — filter rail, chart/table wiring, column-click guard, row-selection re-scope, CSV upload.

_Note: Tasks 1 and 2 in the plan describe one tightly-coupled component (the filter-rail derivations from Task 1 and the column-click/row-select/CSV wiring from Task 2 all live in the same new file and call into each other); they could not be split into two independently-compiling commits without an artificial partial-file state, so Task 2's file-scoped `AnalyticsTable.tsx` half was committed on its own (independently valid, backward-compatible) and the rest of both tasks landed together in the `PartnersAnalyticsCard.tsx` commit._

## Files Created/Modified

- `src/app/buy/PartnersAnalyticsCard.tsx` — new: the merged Analytics + Sheet card (filter rail, chart/table composition, CSV upload)
- `src/app/buy/AnalyticsTable.tsx` — additive: `TableColumnClick` type + `onColumnHeaderClick`/`highlightedColumn` props, `Th` click/highlight support

## Decisions Made

See `key-decisions` in frontmatter. In short: where `BuyAnalytics` genuinely lacks a data dimension the UI claims to filter by (per-transaction dates for the chart's time series, real product-category data for Type, `pack_size_grams` for Pack size), the pill/feature is still built and wired into state — never a silent no-op stub — but its real filtering effect is honestly limited to what the data actually supports, and that limitation is documented both in code comments and in small inline UI notes next to the affected pills.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Widened `onColumnHeaderClick`'s type beyond the plan's illustrative signature**
- **Found during:** Task 2
- **Issue:** The plan's `<interfaces>` suggested `onColumnHeaderClick?: (column: ChartMeasure) => void`, but 4 of the table's 9 numeric columns (margin %, qty, share, DB1/unit) have no `ChartMeasure` value at all (18-10's `ChartMeasure` deliberately excludes them). A callback typed only to `ChartMeasure` cannot represent a click on those 4 columns, so the parent would have no way to distinguish "clicked a non-chartable column" from "didn't click anything" — an unrepresentable/ambiguous state.
- **Fix:** Introduced `TableColumnClick = ChartMeasure | "margin_percent" | "qty" | "share" | "db1_per_unit"` in `AnalyticsTable.tsx`, and the parent's `handleColumnHeaderClick` maps the 5 chartable values to a `ChartMeasure`/`setMeasure` call and shows the toast for the other 4.
- **Files modified:** src/app/buy/AnalyticsTable.tsx, src/app/buy/PartnersAnalyticsCard.tsx
- **Verification:** `npx tsc --noEmit` clean; the toast-guard exclusion list is exhaustive over all 4 non-chartable columns, not just the 3 the plan text named.
- **Committed in:** 9538438 (AnalyticsTable), e0005e4 (PartnersAnalyticsCard)

---

**Total deviations:** 1 auto-fixed (Rule 1 — widened an interface to remove an unrepresentable state)
**Impact on plan:** Necessary for correctness (a 4th non-chartable column, DB1/unit, exists in the real table and needed the same toast guard as the 3 the plan named). No scope creep — same behavior class, same guard mechanism.

## Issues Encountered

None beyond the deviation above. Two ESLint `no-unused-vars` warnings (unused `AnalyticsSupplierRow`/`AnalyticsCategoryRow` type imports, left over from an earlier draft) were cleaned up before committing — not logged as a deviation since it's routine self-review, not a plan gap.

## Known Stubs / Honest v0 Limitations

Not true stubs (nothing renders empty/fake data), but two filters have documented, real limitations worth flagging for the verifier:

| Item | File | Reason |
|------|------|--------|
| Pack size pill has no real options / no filtering effect | `src/app/buy/PartnersAnalyticsCard.tsx` (`FilterRail`, `FilterState.packSize`) | `product.pack_size_grams` exists on the real `product` table but isn't threaded through `getBuyAnalytics()` (18-07, out of this plan's `files_modified` scope). A follow-up plan needs to extend that aggregation before this pill can filter anything. |
| Chart bars are one-per-entity, not a genuine time series | `src/app/buy/PartnersAnalyticsCard.tsx` (`buildChartPoints`) | `BuyAnalytics` carries only period-summed totals per (supplier, product) — no per-transaction date exists anywhere in the aggregation to build real weekly/monthly/daily buckets. The Time pill/Quick-range chips still work for labeling and clearing selection but don't change which lines are summed. |

Both are pre-existing data-layer limitations from earlier (already-merged) plans, not introduced or worsened by this plan, and are called out inline in code (file header block comment) and in the UI (small caption text under the Type and Pack size pills).

## Threat Flags

None — this plan's only new surface is a client-side file-read + call into the already-hardened `importPurchaseHistoryCsv()` server action (its own trust boundary, T-18-14/T-18-19, owned by plan 18-08) and a client-side re-slice of already-RLS-scoped, already-fetched data. No new network endpoint, auth path, or schema change.

## Next Phase Readiness

`PartnersAnalyticsCard` is ready to be imported and rendered by plan 18-13 (`src/app/buy/page.tsx` wiring), which depends on this plan. No blockers.

---
*Phase: 18-buy-page*
*Completed: 2026-07-08*
