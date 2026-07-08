---
phase: 18-buy-page
plan: 15-code-review-fixes
subsystem: ui
tags: [react, buy, analytics, code-review, correctness]

# Dependency graph
requires:
  - phase: 18-buy-page
    provides: PartnersAnalyticsCard, AnalyticsTable, AnalyticsChart, PencilEditCell, buy/page.tsx KPI strip, analytics.ts/analyticsTimeSeries.ts money+time math
provides:
  - Fixed multi-digit typing in the buyer resale-price pencil-edit cell (unstable ref callback)
  - Time filter pill on Buy's Analytics card now actually restricts chart lines + table rows, not just chart bucket granularity
  - avgPriceDelta KPI compares this-week vs previous-week (same-sized windows), not month-to-date vs previous-week
  - net/gross chart measures return 0 for periods with no purchase activity, matching every other measure
  - Row selection (resolveScope) and chart per-product grouping (buildTimeChartSeries) are supplier-scoped, fixing cross-supplier identically-named-product collisions
affects: [18-buy-page, buy-analytics]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stable ref + useEffect([editing]) for one-shot focus/select on a DOM node, instead of an inline ref callback that re-fires every render"
    - "Compound supplier-scoped keys (`${supplierKey}::${id}`) for row selection/grouping, kept separate from intentionally-bare cross-supplier filter-pill keys"

key-files:
  created: []
  modified:
    - src/app/buy/PencilEditCell.tsx
    - src/app/buy/page.tsx
    - src/app/buy/PartnersAnalyticsCard.tsx
    - src/app/buy/AnalyticsTable.tsx

key-decisions:
  - "Time filter window = simple now-N-day cutoffs (7/14/30/90 days) per TIME_WINDOW_DAYS, not calendar-month/quarter boundaries — consistent with GRANULARITY_BY_TIME's own stated simplicity bias"
  - "Time-window row-dropping in filterAnalytics() does not recompute per-window rollup totals (revenue/wap/etc stay all-time for rows that remain in scope) — full per-window recompute would require analytics.ts money-math changes, out of this fix's scope"
  - "distinctProducts() and the Product/Type filter pill deliberately stay bare-name (cross-supplier) — only row-selection (resolveScope) and chart grouping (buildTimeChartSeries) were supplier-scoped"

patterns-established:
  - "Never use an inline arrow-function ref callback when the ref needs to persist identity across renders (React re-invokes a fresh callback identity on every render)"

requirements-completed: []

# Metrics
duration: 36min
completed: 2026-07-08
---

# Phase 18 Plan 15: Buy Code-Review Fixes Summary

**Fixed 5 confirmed correctness bugs on the just-shipped Buy Analytics card: broken multi-digit price entry, a cosmetic Time filter, a mismatched-window KPI delta, phantom chart bars, and cross-supplier product-name collisions in row selection/charting.**

## Performance

- **Duration:** 36 min (06:42 prior plan commit -> 07:17 last fix commit)
- **Started:** 2026-07-08T06:42:05+02:00
- **Completed:** 2026-07-08T07:17:52+02:00
- **Tasks:** 5 fixes + 1 lint cleanup
- **Files modified:** 4

## Accomplishments
- Buyer can now type a multi-digit price into a pencil-edit cell without the browser eating every character after the first (stable `useRef` + `useEffect([editing])` instead of an inline ref callback that re-fired `el.select()` on every keystroke's re-render).
- The Time filter pill (Last 7/14 days, Last month, Last 3 months) actually narrows which purchase lines/table rows are in scope, not just the chart's bucket granularity — added `isInTimeWindow()`/`linesInTimeWindow()` helpers shared by both `filterAnalytics()` and `filterAnalyticsLines()`.
- The "Avg price €/g" KPI's "vs last week" delta now compares two real same-sized ISO weeks (`thisWeekKpis` vs `prevWeekKpis`) instead of a variable 1-31-day month-to-date sample against a fixed 7-day week.
- `valueForTimeSeriesMeasure()` returns 0 for net/gross in a period with zero purchase activity (moved the `!point` guard above the net/gross special-case), matching every other measure and the codebase's "never fabricate data" rule.
- Row selection (`resolveScope()`) and the chart's per-product stacking (`buildTimeChartSeries()`) are now supplier-scoped (`${supplierKey}::${id}`), so two different suppliers with an identically-named product no longer collide — clicking one resolves to the exact supplier clicked, and the chart renders their spend/grams as separate segments instead of silently merging them.

## Task Commits

Each fix was committed atomically:

1. **Fix 1: PencilEditCell reselect bug** - `3f0c9b6` (fix) + `6ad3034` (style: drop stray eslint-disable found during verification)
2. **Fix 3: avgPriceDelta mismatched windows** - `823affe` (fix)
3. **Fix 4: phantom net/gross chart bars** - `66b2b6d` (fix)
4. **Fix 2: Time filter cosmetic-only bug** - `38fe526` (fix)
5. **Fix 5: cross-supplier product collision** - `7144c6b` (fix)

_Fix order in git history is 1, 3, 4, 2, 5 (grouped to keep unrelated hunks in the same shared file — PartnersAnalyticsCard.tsx — cleanly separable per commit); all 5 fixes from the objective are present._

## Files Created/Modified
- `src/app/buy/PencilEditCell.tsx` - Stable `inputRef` + `useEffect(() => {...}, [editing])` replaces the inline `ref={(el) => {...}}` callback that re-selected the whole input value on every keystroke.
- `src/app/buy/page.tsx` - Added `inCurrentIsoWeek()` + `thisWeekKpis`; `avgPriceDelta` now diffs `thisWeekKpis.weightedAvgPrice - prevWeekKpis.weightedAvgPrice` (was `monthKpis... - prevWeekKpis...`).
- `src/app/buy/PartnersAnalyticsCard.tsx` - Four changes: (a) moved `valueForTimeSeriesMeasure()`'s `!point` check to the top so net/gross return 0 for inactive periods; (b) added `TIME_WINDOW_DAYS`/`isInTimeWindow()`/`linesInTimeWindow()` and wired them into `filterAnalytics()`/`filterAnalyticsLines()` so the Time pill actually restricts scope; (c) `resolveScope()` now matches category/product keys as `${supplierKey}::${id}`; (d) `buildTimeChartSeries()`'s per-product grouping key is now `${supplierName}::${productId ?? productName}`.
- `src/app/buy/AnalyticsTable.tsx` - `CategoryRows` now selects/compares on its existing `categoryKey` (`${supplierKey}::${categoryId}`) instead of the bare `category.categoryId`; `ProductRow` gained a `supplierKey` prop and its `rowKey` is now `${supplierKey}::${productId ?? productName}`.

## Decisions Made
- Time filter window uses simple `now - N days` cutoffs (7/14/30/90) rather than calendar-month/quarter boundaries — mirrors `GRANULARITY_BY_TIME`'s own documented "pick whichever is simpler" precedent from the original 18-14 fix.
- `filterAnalytics()`'s time-window fix drops table rows with zero activity in the window but does NOT recompute each remaining row's rollup totals (revenue/wap/db1/margin) to be window-scoped — those come from `getBuyAnalytics()`'s already-computed all-time aggregation. Recomputing them per-window would require changes to `analytics.ts`'s money-math layer, which is out of this fix's declared scope (the objective explicitly offered this as the accepted option (a)).
- `distinctProducts()` and the Product/Type filter pill's bare-name matching were deliberately left untouched — a buyer filtering by product name is meant to see it across every supplier that sold it (cross-supplier by design); only row-selection and chart-grouping needed supplier-scoping.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed a stray `eslint-disable-next-line react-hooks/exhaustive-deps` in PencilEditCell.tsx**
- **Found during:** Post-fix verification (`rtk proxy npx eslint`)
- **Issue:** The Fix-1 effect (`useEffect(() => {...}, [editing])`) doesn't actually trigger the exhaustive-deps rule (it has no external reactive values besides `editing`), so the disable comment I'd added defensively was flagged as an unused-directive lint warning.
- **Fix:** Deleted the disable comment; re-ran eslint — 0 warnings.
- **Files modified:** `src/app/buy/PencilEditCell.tsx`
- **Verification:** `rtk proxy npx eslint src/app/buy/PencilEditCell.tsx` → clean.
- **Committed in:** `6ad3034`

---

**Total deviations:** 1 auto-fixed (1 bug/lint cleanup, self-caused during Fix 1's own implementation)
**Impact on plan:** Trivial, no scope creep — a lint-warning cleanup of the same fix's own code, not a new behavior change.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 5 code-review findings fixed, each independently verified against the actual current code before editing.
- Full gate green: `npx tsc --noEmit` clean, `rtk proxy npx eslint src/app/buy src/modules/buy` clean (0 problems), `npm run test:unit` 248/248 passed (34 test files).
- No new tests were added for the new pure helpers (`isInTimeWindow`, `inCurrentIsoWeek`) — recommended as a light follow-up if a future plan touches this area, but not blocking given the existing unit-test surface for this module is at the money/merge/CSV-parsing layer, not the component layer, and these are small, directly-reasoned-through fixes.
- E2E (`e2e/buy-pencil-edit.spec.ts`) was read and confirmed unaffected by these changes (it uses Playwright's `.fill()`, which doesn't hit the ref-reselect bug either way, and doesn't reference row-selection keys).

---
*Phase: 18-buy-page*
*Completed: 2026-07-08*
