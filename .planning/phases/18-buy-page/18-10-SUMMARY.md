---
phase: 18-buy-page
plan: 10
subsystem: ui
tags: [svg, react, chart, buy, analytics]

# Dependency graph
requires:
  - phase: 18-buy-page (plan 18-07)
    provides: getBuyAnalytics() data-stitching layer (BuyAnalytics/AnalyticsSupplierRow shape)
provides:
  - "AnalyticsChart React component — hand-rolled inline-SVG bar/line chart"
  - "ChartMeasure/ChartSeriesPoint type contracts for the graph's props"
affects: [18-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hand-rolled inline-SVG chart geometry (no charting library) — pure helper functions ported 1:1 from the prototype's renderChart() coordinate math, JSX renders declaratively instead of imperative innerHTML string-building"
    - "Impossible-state-unrepresentable via the type union (ChartMeasure excludes non-chartable columns) rather than a runtime guard"

key-files:
  created: [src/app/buy/AnalyticsChart.tsx]
  modified: []

key-decisions:
  - "Bars always render from ChartSeriesPoint.byProduct (stacked <=6 products, collapsed to one total bar >6); the line overlay renders whenever weightedAvgPrice is non-null per point, decoupled from which ChartMeasure is selected — the parent (18-12) decides what those per-point values mean for a given measure, this component only draws them"
  - "Line dots draw for every non-null weightedAvgPrice point; the connecting polyline only draws once there are >=2 non-null points (ports the prototype's own `pts.length > 1` guard) — a lone point still shows its dot, just no line segment"
  - "Reused the existing `formatMoney()` from @/modules/deals instead of a new Intl.NumberFormat wrapper — one money-formatting source of truth, not a third copy alongside deals/lib/derive.ts and relationship/lib/stats.ts"

patterns-established:
  - "Pattern: presentational chart components take pre-aggregated `ChartSeriesPoint[]` from a data-stitching layer and own zero filter/selection state themselves — that stays in the parent composition"

requirements-completed: [BUY-01]

# Metrics
duration: 8min
completed: 2026-07-08
---

# Phase 18 Plan 10: AnalyticsChart Summary

**Hand-rolled inline-SVG bar/line chart (`src/app/buy/AnalyticsChart.tsx`) porting the finalized Buy prototype's `renderChart()` coordinate math — zero charting-library dependency.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-07-08T05:33Z (session start)
- **Completed:** 2026-07-08T05:42Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- `ChartMeasure` union with exactly the 6 chartable values from `<interfaces>` — `margin_percent`/`qty`/`share` compile-time absent, matching CONTEXT.md's "these are highlight-only, never plotted as euros" lock
- Geometry helpers (`computeGeometry`, `xForPoint`, `barWidthFor`, `yForValue`, `lineScaleFor`, `yForLineValue`, `collectProductKeys`, `pointTotal`, `valueFor`, `shouldStack`) — a direct, pure-function port of the prototype's `renderChart()` math (W/H/margins, `xc(i)`, `y2(v)`, `bw`, `pMin`/`pMax` padding)
- Full render: gridlines + euro axis labels, stacked bars (<=6 products, colour-per-product) or one collapsed total bar (>6), weighted-avg-price line overlay on its own right axis, dynamic title/subtitle heading, "back to Price by volume" reset chip, product/line legend, native `<title>` hover tooltip per bar column
- Verified both the >6-product collapse path and the <=6 stacked path against fixtures (via a throwaway `tsx` script exercising the pure helpers directly) — no NaN/Infinity produced in either path

## Task Commits

1. **Task 1: Chart type contracts + SVG geometry helpers** - `17abae2` (feat)
2. **Task 2: AnalyticsChart component — bar/line rendering + stack-vs-collapse** - `e348542` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `src/app/buy/AnalyticsChart.tsx` - hand-rolled inline-SVG `AnalyticsChart` component; exports `AnalyticsChart`, `ChartMeasure`, `ChartSeriesPoint`, `MEASURE_LABELS`, and the pure geometry helpers/constants for reuse

## Decisions Made
- Bars/line are driven purely by the already-shaped `ChartSeriesPoint[]` props, not by branching on `measure` internally (measure is only used for the line-legend label) — keeps the component's render logic identical regardless of which of the 6 measures the parent has selected, per the interface's "axes never change, only the plotted measure does" lock
- Reused `formatMoney()` from `@/modules/deals` for all euro formatting (axis ticks, tooltip, price-line ticks) rather than adding a local Intl wrapper — DRY, one money-formatting source of truth already established by `deals/lib/derive.ts`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
`AnalyticsChart` is ready for plan 18-12 (`PartnersAnalyticsCard`) to compose: it needs to pass `measure`, an already-aggregated `series: ChartSeriesPoint[]` (derived from `getBuyAnalytics()`'s supplier/category/product tree per the current filter/selection scope), `title`/`subtitle` strings, and `onResetToDefault`. No blockers — this component owns no filter or selection state itself, so 18-12 is free to design its own state shape without touching this file again.

## Self-Check: PASSED

- FOUND: src/app/buy/AnalyticsChart.tsx
- FOUND: 17abae2 (in git log)
- FOUND: e348542 (in git log)
- `npx tsc --noEmit` clean
- `grep -c "from \"recharts\"\|from \"chart.js\"\|from \"visx\""` on the file returns 0
- `npx eslint src/app/buy/AnalyticsChart.tsx` — no issues found

---
*Phase: 18-buy-page*
*Completed: 2026-07-08*
