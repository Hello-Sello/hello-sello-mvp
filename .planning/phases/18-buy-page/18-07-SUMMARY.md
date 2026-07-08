---
phase: 18-buy-page
plan: 07
subsystem: api
tags: [buy, analytics, weighted-average-price, db1, aggregation, typescript, vitest]

requires:
  - phase: 18-buy-page (plan 02)
    provides: lib/money.ts — weightedAveragePrice/db1Total/db1PerUnit/marginPercent, already-TDD'd
  - phase: 18-buy-page (plan 05)
    provides: buyer_resale_price + purchase_history_import schema
provides:
  - "mergeAnalyticsLines() — pure (supplierName, productName) grouping/merge step, unit-tested (7 cases)"
  - "getBuyAnalytics() — live deal_line_item + CSV purchase_history_import layered into the 3-level Supplier -> Category -> Product tree"
affects: [18-10, 18-11, 18-12, 18-13]

tech-stack:
  added: []
  patterns:
    - "Pure grouping/merge step extracted from an async aggregation function (mirrors 18-06's mergePartners() extraction)"
    - "Degenerate category-per-product v0 tree (no new product.category schema)"

key-files:
  created:
    - src/modules/buy/lib/analyticsMerge.ts
    - src/modules/buy/lib/analyticsMerge.test.ts
    - src/modules/buy/analytics.ts

key-decisions:
  - "mergeAnalyticsLines() keys on exact-string `${supplierName}\\0${productName}` — no fuzzy matching, mirrors getBuyPartners()'s v0 rule"
  - "Money for a deal line uses lineTotalOf(quantity, unitPrice, line_total) from @/modules/deals — the same stored-total-with-fallback convention as deals/supabase/reads.ts, not a raw quantity*unitPrice"
  - "Supplier/category rollups (revenue/db1Total) sum only priced products; the rollup is null only when NONE of a supplier's products have a net entered yet — never a misleading 0"
  - "getBuyAnalytics() imports getBuyPartners() from ./partners (plan 18-06, same wave, parallel worktree) per the plan's interface — this file does not exist yet in this isolated worktree; see Known Integration Gap below"

patterns-established:
  - "analyticsMerge.ts stays pure (no Supabase import, no async) so the layering step is testable with hand-built fixtures, same discipline as partners.ts's mergePartners()"

requirements-completed: [BUY-01]

duration: 3min
completed: 2026-07-08
---

# Phase 18 Plan 07: Buy Analytics Aggregation Summary

**`getBuyAnalytics()` builds the real Supplier -> Category -> Product tree from live `deal_line_item` + CSV `purchase_history_import` rows, delegating the `(supplierName, productName)` layering to a newly TDD'd `mergeAnalyticsLines()` and all money math to the already-tested `lib/money.ts`.**

## Performance

- **Duration:** ~3 min (RED commit to final commit)
- **Started:** 2026-07-08T05:30:01+02:00
- **Completed:** 2026-07-08T05:32:13+02:00
- **Tasks:** 2 completed
- **Files modified:** 3 (2 created for Task 1, 1 created for Task 2)

## Accomplishments
- `mergeAnalyticsLines()` — pure grouping/merge step, TDD'd RED->GREEN, 7 passing tests covering all 5 required behavior cases (deal+deal merge, deal+csv layering, different-key no-merge x2, csv-only line, productId identity preserved from whichever source has it, in either encounter order)
- `getBuyAnalytics()` — real aggregation: buyer-narrowed `deal_line_item` fetch (mirrors `getSellerOrders`'s seller-narrowing, inverted) + `purchase_history_import` CSV fetch, layered via `mergeAnalyticsLines()`, priced via `lib/money.ts`, wrapped in the locked v0 degenerate-category-per-product tree
- Confirmed via grep: money math delegated to `./lib/money` (1 import), grouping delegated to `mergeAnalyticsLines` (not reimplemented inline), connected/relationshipId delegated to `getBuyPartners()` (not re-derived)

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: failing test for mergeAnalyticsLines()** - `d1353b4` (test)
2. **Task 1 GREEN: implement mergeAnalyticsLines()** - `95b1e1f` (feat)
3. **Task 2: implement getBuyAnalytics()** - `3c2e362` (feat)

_TDD task 1 followed RED -> GREEN; no REFACTOR commit needed (implementation was already minimal and clean on first pass)._

## Files Created/Modified
- `src/modules/buy/lib/analyticsMerge.ts` - `mergeAnalyticsLines()`, the pure exact-key grouping/merge step over `AnalyticsSourceLine[]`
- `src/modules/buy/lib/analyticsMerge.test.ts` - 7 tests covering all 5 required behavior cases
- `src/modules/buy/analytics.ts` - `getBuyAnalytics()` + its exported tree types (`AnalyticsProductRow`/`AnalyticsCategoryRow`/`AnalyticsSupplierRow`/`BuyAnalytics`)

## Decisions Made
- **Money-per-line convention:** used `lineTotalOf(quantity, unitPrice, line_total)` (from `@/modules/deals`, already used by `deals/supabase/reads.ts`) rather than a raw `quantity * unit_price`, so a stored `line_total` is always preferred and a missing one falls back consistently with the rest of the codebase's own convention for this exact table.
- **Partial rollup honesty:** a supplier/category's `revenue`/`db1Total` sum only the priced products among its group; the aggregate is `null` only when NONE of its products have a `net` entered yet (matches `lib/money.ts`'s "null, never misleading 0" contract at the per-product level, extended sensibly to a partial rollup rather than collapsing the whole supplier to null the moment ANY one product is unpriced).
- **CSV spend:** `purchase_history_import` has no `line_total` column (never derived, always a direct CSV field), so CSV lines compute spend as `quantity * unit_price` directly — there is no stored-total fallback to prefer for that source.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking, type-safety isolation] Isolated the one unavoidable cross-plan type gap so it doesn't cascade**
- **Found during:** Task 2 (`getBuyAnalytics()` implementation, tsc check)
- **Issue:** `getBuyPartners()` (plan 18-06's deliverable) does not exist in this worktree yet — see "Known Integration Gap" below. Left unhandled, the unresolved import's implicit `any` cascaded into 4 additional tsc errors downstream (`TS7006` on the `.map()` callback param, 3x `TS2339` on `partner?.key/connected/relationshipId`).
- **Fix:** Added a local `BuyPartnerLike` interface (mirroring the confirmed real `BuyPartner` shape) and cast `getBuyPartners()`'s return at the one call site: `(await getBuyPartners()) as BuyPartnerLike[]`. This collapses the 5 tsc errors down to exactly the 1 genuine, unavoidable one (`TS2307: Cannot find module './partners'`), with zero other type-safety loss.
- **Files modified:** `src/modules/buy/analytics.ts`
- **Verification:** `npx tsc --noEmit` before the cast: 5 errors; after: 1 error (only the expected `TS2307`).
- **Committed in:** `3c2e362` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3, isolating a cross-plan type gap)
**Impact on plan:** No scope creep — the fix is a type-narrowing cast, not new behavior. It exists purely so the one unavoidable cross-plan gap (below) doesn't hide real bugs behind cascading `any`-inference noise.

## Known Integration Gap (not a bug — requires no fix from this plan)

**`src/modules/buy/partners.ts` (plan 18-06's deliverable, same wave, running in a separate parallel worktree) does not exist in this worktree.** Plan 18-07's own frontmatter lists `depends_on: ["18-02", "18-05"]` — NOT `18-06` — yet the plan's `<interfaces>`/task text (both revised, post plan-checker) explicitly requires `getBuyAnalytics()` to import and call `getBuyPartners()` from `./partners`. Since 18-06 executes as a fully isolated sibling worktree in this same wave, its file is not visible here until the orchestrator merges both wave-2 branches.

**This was verified, not guessed:** inspecting the sibling worktree (`agent-ad6fe94ad46c77388`, mid-execution) confirmed `src/modules/buy/partners.ts` exists there with the exact `BuyPartner`/`getBuyPartners()` shape this file imports against — so the import path, export name, and shape are all correct and require no changes once merged.

**Current state:**
- `npx tsc --noEmit` on this worktree alone: 1 error (`TS2307: Cannot find module './partners'` at `src/modules/buy/analytics.ts:26`) — the sole, expected, unavoidable consequence of the missing sibling file.
- `npx vitest run` (full suite, this worktree): 215/215 pass, unaffected (analytics.ts has no test file of its own this plan — its own acceptance criteria per the plan are type-correctness + delegation-by-grep, both otherwise satisfied).
- All grep-based delegation checks pass: `lib/money` import count = 1, `mergeAnalyticsLines` referenced, `getBuyPartners` referenced.

**Action needed (not by this plan):** once the orchestrator merges plan 18-06's worktree (same wave), re-run `npx tsc --noEmit` on the merged base — the single `TS2307` should disappear with zero further changes to `analytics.ts`. If it does NOT disappear cleanly, that indicates 18-06 shipped a different export shape than the one verified here, and `analytics.ts` would need a small follow-up patch (not expected).

## Issues Encountered
None beyond the Known Integration Gap above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `getBuyAnalytics()` and `mergeAnalyticsLines()` are ready for plan 18-10 (analytics table) and 18-11 (page composition) to consume once this worktree merges alongside 18-06.
- Blocker for full end-to-end verification (not for this plan's own scope): the wave-2 merge must land 18-06's `partners.ts` before `npx tsc --noEmit` is clean project-wide.

---
*Phase: 18-buy-page*
*Completed: 2026-07-08*

## Self-Check: PASSED

- FOUND: src/modules/buy/lib/analyticsMerge.ts
- FOUND: src/modules/buy/lib/analyticsMerge.test.ts
- FOUND: src/modules/buy/analytics.ts
- FOUND: .planning/phases/18-buy-page/18-07-SUMMARY.md
- FOUND commit: d1353b4 (test RED)
- FOUND commit: 95b1e1f (feat GREEN — mergeAnalyticsLines)
- FOUND commit: 3c2e362 (feat — getBuyAnalytics)
