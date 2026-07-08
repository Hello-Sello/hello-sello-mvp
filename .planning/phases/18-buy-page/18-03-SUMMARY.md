---
phase: 18-buy-page
plan: 03
subsystem: api
tags: [typescript, vitest, tdd, supabase, deals, allocate]

# Dependency graph
requires:
  - phase: 18-buy-page (Plan 01, Wave 0)
    provides: getSellerCalendarDeals(), calendarDay/calendarKpis/lineGrams pure helpers, real DealCalendar component
provides:
  - "isOpenDeal(status) — pure open/terminal classification mirroring deal_card_status.is_terminal"
  - "getBuyerCalendarDeals() — buyer-side twin of getSellerCalendarDeals(), buyer-only narrowing (T-18-04 mitigation)"
  - "narrowByRole() — the shared, unit-testable narrowing predicate both seller- and buyer-side calendar reads use"
  - "CalendarDeal.status field (raw DealCardStatus) on both getSellerCalendarDeals() and getBuyerCalendarDeals()"
affects: [18-buy-page (KPI strip, Deals-timeline block, remaining Wave 1/2 plans)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure narrowing predicate (narrowByRole) extracted out of an async Supabase-coupled read so buyer/seller role-filtering logic is unit-testable with hand-built fixtures, no live DB"

key-files:
  created:
    - src/modules/buy/lib/openDeals.ts
    - src/modules/buy/lib/openDeals.test.ts
    - src/modules/allocate/calendarDeals.test.ts
  modified:
    - src/modules/allocate/calendarDeals.ts
    - src/modules/allocate/index.ts

key-decisions:
  - "Extracted narrowByRole() as a shared generic pure function (not duplicated per side) so the exact seller/buyer narrowing logic is unit-tested once, proving both directions from the same tested code path"
  - "CardRoleFacts.deal_type kept as raw string (not DealType) to match Supabase's untyped select shape; narrowByRole casts internally before calling sellerCompanyId/buyerCompanyId, mirroring the existing inline-cast style already used elsewhere in this file"

requirements-completed: [BUY-01]

# Metrics
duration: ~20min
completed: 2026-07-08
---

# Phase 18 Plan 03: Open-deal classification + buyer-side calendar narrowing Summary

**`isOpenDeal()` (TDD, all 8 DealCardStatus codes) + `getBuyerCalendarDeals()`, the buyer-side twin of the already-shipped `getSellerCalendarDeals()`, both proven correct by fixture-based unit tests — not just asserted by comment.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2 completed
- **Files modified:** 5 (2 new source, 2 new test, 2 existing modified)

## Accomplishments
- `isOpenDeal(status: DealCardStatus)` — Set-based, mirrors `deal_card_status.is_terminal` exactly (`done`/`withdrawn`/`cancelled` = terminal), all 8 codes table-driven tested.
- `getBuyerCalendarDeals()` built as a verbatim structural port of `getSellerCalendarDeals()`, narrowed by `buyerCompanyId` instead of `sellerCompanyId`, with `counterparty` correctly naming the SELLER (the other side of the relationship from the buyer).
- Extracted `narrowByRole()` — the shared pure "is this row's derived role === callerCompanyId" filter both seller and buyer reads now call, closing the gap where this logic was previously only exercised live against Supabase (untested in isolation).
- `CalendarDeal.status: DealCardStatus` (the raw status, distinct from `displayStage`) added to both `getSellerCalendarDeals()` and `getBuyerCalendarDeals()`, additive — `tsc --noEmit` confirms `DealCalendar.tsx` still compiles unchanged.
- Buyer/seller narrowing symmetry proven with an explicit test case (mirror of `orders.ts`'s T-260707-04 mitigation), not just asserted by comment.

## Task Commits

Each task was committed atomically (RED → GREEN per TDD gate):

1. **Task 1: isOpenDeal()**
   - `5e1e197` test(18-03): add failing test for isOpenDeal() — RED
   - `359e85a` feat(18-03): implement isOpenDeal() — GREEN
2. **Task 2: getBuyerCalendarDeals() (buyer-side narrowing symmetry)**
   - `d5c5a1a` test(18-03): add failing test for the shared buyer/seller narrowing predicate — RED
   - `c125055` feat(18-03): implement getBuyerCalendarDeals() and narrowByRole() — GREEN

_No REFACTOR commits — GREEN implementations matched the intended final shape; no additional cleanup needed._

## Files Created/Modified
- `src/modules/buy/lib/openDeals.ts` - `isOpenDeal()` pure derivation, migration-referenced comment
- `src/modules/buy/lib/openDeals.test.ts` - table-driven unit test, all 8 DealCardStatus codes
- `src/modules/allocate/calendarDeals.ts` - added `narrowByRole()`, `getBuyerCalendarDeals()`, `CalendarDeal.status`; `getSellerCalendarDeals()` now calls the shared `narrowByRole()` instead of its own inline filter
- `src/modules/allocate/calendarDeals.test.ts` - unit tests for `narrowByRole()` proving buyer/seller narrowing symmetry with hand-built fixtures (no live Supabase)
- `src/modules/allocate/index.ts` - barrel export of `getBuyerCalendarDeals`

## Decisions Made
- Extracted `narrowByRole()` as one shared generic function rather than writing near-duplicate filters for seller vs. buyer — both `getSellerCalendarDeals()` and `getBuyerCalendarDeals()` now share the exact same tested narrowing code path, eliminating any risk of the two drifting apart.
- Kept `CardRoleFacts.deal_type` as `string` (not `DealType`) to match Supabase's untyped select result shape, casting to `DealType` once inside `narrowByRole()` before delegating to `sellerCompanyId`/`buyerCompanyId` — consistent with the existing inline-cast style already present in this file (`c.deal_type as DealType`) rather than introducing a new pattern.

## Deviations from Plan

None - plan executed exactly as written. `getSellerCalendarDeals()`'s inline filter was extracted into `narrowByRole()` as the plan's `<action>` block explicitly called for ("if the seller-side narrowing logic ... is not already isolated as a testable pure function, this is the point where both should be").

## Issues Encountered

- Initial `narrowByRole()` generic constraint (`T extends CardRoleFacts` with `deal_type: DealType`) failed `tsc --noEmit` because Supabase's untyped `.select()` result carries `deal_type: string`, not the narrowed union. Fixed by relaxing the constraint to `deal_type: string` and casting to `DealType` inside the function body (mirrors the existing inline-cast style in this file) before calling `sellerCompanyId`/`buyerCompanyId`. Re-verified: `tsc --noEmit` clean, all 13 tests still green.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `isOpenDeal()` unblocks the KPI strip's "Open deals" card (BUY-01).
- `getBuyerCalendarDeals()` unblocks the Deals-timeline block's real buyer-side data feed — a subsequent plan can wire `<DealCalendar side="buy" deals={await getBuyerCalendarDeals()} .../>` directly, following the same pattern Plan 01 used for the seller side.
- No blockers for the remaining Wave 1/2 plans in this phase.

---
*Phase: 18-buy-page*
*Completed: 2026-07-08*

## Self-Check: PASSED

All 5 created/modified files verified present on disk; all 4 task commits (`5e1e197`, `359e85a`, `d5c5a1a`, `c125055`) verified present in git log.
