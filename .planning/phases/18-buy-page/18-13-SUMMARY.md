---
phase: 18-buy-page
plan: 13
subsystem: ui

tags: [nextjs, react-server-components, playwright, supabase, buy-surface]

# Dependency graph
requires:
  - phase: 18-buy-page (plan 01)
    provides: DealCalendar merge/rebase onto current tip + hs:open-deal-card rename
  - phase: 18-buy-page (plan 03)
    provides: isOpenDeal(), getBuyerCalendarDeals() (buyer-side calendar read)
  - phase: 18-buy-page (plan 07)
    provides: getBuyAnalytics() (Analytics/Sheet aggregation)
  - phase: 18-buy-page (plan 12)
    provides: PartnersAnalyticsCard (merged Analytics + Sheet card)
provides:
  - The composed /buy page (KPI strip -> Deals timeline -> Analytics+Sheet -> Buyer-Sella stub)
  - src/modules/buy/index.ts, the consolidating public barrel for the buy module
  - BuyDealCardHost (hs:open-deal-card, byte-for-byte twin of AllocateDealCardHost)
  - e2e/buy-calendar.spec.ts, e2e/buy-pencil-edit.spec.ts
affects: [18-VALIDATION, future Buy-surface fast-follows (CSV import polish, pack-size filter)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server Component composition mirrors src/app/sell/page.tsx exactly: Promise.all reads, KPI derivation inline in page.tsx, client components fed via props"
    - "Sticky section JumpStrip pattern (no tabs, only scrollIntoView anchors) reused verbatim from Sell/Allocate"
    - "A '\"use server\"' file may ONLY export async functions (including type-only re-exports, which Turbopack's action-reference codegen still resolves as if runtime values) — pure helpers/types must live in a sibling lib/ module"

key-files:
  created:
    - src/app/buy/page.tsx (rewritten from stub)
    - src/app/buy/KpiStrip.tsx
    - src/app/buy/JumpStrip.tsx
    - src/app/buy/BuySellaStub.tsx
    - src/app/buy/BuyDealCardHost.tsx
    - src/modules/buy/index.ts
    - src/modules/buy/lib/resalePriceRow.ts
    - e2e/buy-calendar.spec.ts
    - e2e/buy-pencil-edit.spec.ts
  modified:
    - src/modules/buy/resalePriceActions.ts (moved sync builder + types out, "use server" export fix)
    - src/app/buy/AnalyticsTable.tsx (pencil-cell testids)
    - src/app/buy/PencilEditCell.tsx (optional testId prop)
    - src/modules/deals/components/DealCalendar.tsx (deal-pill testid, shared with Sell)

key-decisions:
  - "Fixed ISO-week boundary (not a rolling 7-day window) for the 'avg price vs previous week' KPI delta — simpler given the schema, documented inline in page.tsx (Claude's Discretion per 18-CONTEXT.md)"
  - "No getBuyerOrders()/Orders table built — Buy's design contract has no Orders block; getBuyerCalendarDeals() + getBuyAnalytics() alone cover every KPI card"
  - "buildResalePriceUpsertRow and its input/result types relocated to a new src/modules/buy/lib/resalePriceRow.ts, out of the \"use server\" resalePriceActions.ts entirely — required by a Next.js/Turbopack constraint discovered during this plan's live verification"

patterns-established:
  - "Buy module barrel (src/modules/buy/index.ts) mirrors allocate/deals barrel-of-barrels convention"
  - "PencilEditCell now accepts an optional testId prop for e2e-stable selection across its idle-empty/idle-filled/editing states"

requirements-completed: [BUY-01]

# Metrics
duration: ~25min
completed: 2026-07-08
---

# Phase 18 Plan 13: Compose /buy Summary

**Composed the final `/buy` page (KPI strip -> real `DealCalendar` side="buyer" -> merged Analytics/Sheet card -> Buyer-Sella stub) and fixed a latent Next.js "use server" export bug that only surfaced once a real page first imported the resale-price action chain.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-08T05:57:00+02:00 (approx.)
- **Completed:** 2026-07-08T06:23:00+02:00
- **Tasks:** 3
- **Files modified:** 13 (9 created, 4 modified; 1 test file relocated)

## Accomplishments
- `/buy` is live: 4-card KPI strip (Purchases this month, Open deals, Avg price €/g + delta, DB1 total) all derived from real `getBuyerCalendarDeals()` + `getBuyAnalytics()` reads, zero placeholder numbers
- Deals timeline wired to the real shared `DealCalendar` component, `side="buyer"`, pill-click opens the real `DealCard` via `BuyDealCardHost` (byte-for-byte `hs:open-deal-card` twin of `AllocateDealCardHost`)
- Sticky `JumpStrip` nav (Deals timeline / Analytics / Buyer-Sella) mirrors Sell's exact pattern
- `src/modules/buy/index.ts` barrel consolidates every buy sub-module export, matching `allocate`/`deals`'s established convention
- Found and fixed a real, previously-latent bug (see Deviations) that would have broken `/buy` at build time the moment it shipped
- Both e2e specs written, live-verified passing (twice, to confirm idempotency across DB states) against the worktree's own dev server

## Task Commits

Each task was committed atomically:

1. **Task 1: Barrel + KpiStrip + JumpStrip + BuySellaStub** - `5eebe22` (feat)
2. **Task 2: BuyDealCardHost + page.tsx composition** - `f5214de` (feat)
3. **Task 3: E2E specs + final live verification** - `e22047a` (test — includes the Rule 1 bugfix found during live verification)

_Note: Task 3's commit includes both the new e2e specs and the resalePriceActions.ts fix discovered while making the specs pass — both are part of the same live-verification step._

## Files Created/Modified
- `src/app/buy/page.tsx` — the composed one-scroll Buy page (KPI strip → Deals timeline → Analytics+Sheet → Buyer-Sella), async Server Component, `Promise.all([getBuyerCalendarDeals(), getBuyAnalytics()])`
- `src/app/buy/KpiStrip.tsx` — presentational 4-card KPI strip
- `src/app/buy/JumpStrip.tsx` — sticky section nav (deals-section/analytics-section/sella-section)
- `src/app/buy/BuySellaStub.tsx` — honest "coming soon" stub (Sparkles icon, mirrors `SellaPlaceholderBar`'s mark)
- `src/app/buy/BuyDealCardHost.tsx` — byte-for-byte copy of `AllocateDealCardHost`'s `hs:open-deal-card` contract
- `src/modules/buy/index.ts` — the buy module's public barrel
- `src/modules/buy/lib/resalePriceRow.ts` — pure `buildResalePriceUpsertRow` + `SaveBuyerResalePriceInput`/`Result` types, extracted out of the `"use server"` action file
- `src/modules/buy/resalePriceActions.ts` — now exports only the async `saveBuyerResalePrice` action
- `src/app/buy/AnalyticsTable.tsx` — `pencil-cell-net`/`pencil-cell-gross` testids wired to `PencilEditCell`
- `src/app/buy/PencilEditCell.tsx` — optional `testId` prop
- `src/modules/deals/components/DealCalendar.tsx` — `deal-pill` testid on the pill button (shared file with Sell, additive only)
- `e2e/buy-calendar.spec.ts` — KPI strip, real pill → real DealCard, sticky nav
- `e2e/buy-pencil-edit.spec.ts` — net-price pencil-edit write path + DB1 rollup update

## Decisions Made
- Fixed ISO-week boundary for the "avg price vs previous week" KPI delta (Claude's Discretion, documented inline) — simpler than a rolling window given the schema
- No `getBuyerOrders()`/Orders table built (deliberate, matches the plan's objective — verified via `grep -c` acceptance criterion)
- `buildResalePriceUpsertRow` + its types moved to a new pure `lib/resalePriceRow.ts` file, out of `resalePriceActions.ts` entirely (see Deviations)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `resalePriceActions.ts` ("use server") exported a sync helper and type-only re-exports, breaking Next.js's server-action constraint**
- **Found during:** Task 2/3 (first live verification of the composed `/buy` page — the previous stub page never imported this chain, so the bug was invisible until now)
- **Issue:** `resalePriceActions.ts` has `"use server"` at the top. Next.js requires EVERY export of a `"use server"` module to be an async function. The file also exported `buildResalePriceUpsertRow` (a synchronous pure builder) — this crashed the dev server with "Server Actions must be async functions" the moment `/buy`'s barrel imported it. After moving the builder out, a second, subtler failure appeared: even a `export type { ... }` re-export of the input/result types from the same `"use server"` file caused Turbopack's action-reference codegen to generate a broken runtime import ("Export ... doesn't exist in target module") — type-only exports are erased at compile time, but the codegen doesn't account for that.
- **Fix:** Created `src/modules/buy/lib/resalePriceRow.ts` (no `"use server"`) holding `buildResalePriceUpsertRow`, `SaveBuyerResalePriceInput`, and `SaveBuyerResalePriceResult`. `resalePriceActions.ts` now only exports the async `saveBuyerResalePrice`. The barrel (`src/modules/buy/index.ts`) imports the types from `./lib/resalePriceRow` directly instead of re-exporting them through the action file. The pure-function unit test moved with it (git-detected rename, same assertions, zero behavior change).
- **Files modified:** `src/modules/buy/resalePriceActions.ts`, `src/modules/buy/lib/resalePriceRow.ts` (new), `src/modules/buy/lib/resalePriceRow.test.ts` (relocated from `resalePriceActions.test.ts`), `src/modules/buy/index.ts`
- **Verification:** `npx tsc --noEmit` clean, `npm run test:unit` 237/237 passing, and live-verified on the worktree's own dev server — `/buy` renders with zero console/page errors (confirmed via a scripted Playwright check before and after the fix)
- **Committed in:** `e22047a` (Task 3 commit)

**2. [Rule 2 - Missing testability] Added `data-testid` attributes needed for the e2e specs**
- **Found during:** Task 3
- **Issue:** Neither `DealCalendar`'s pill button nor `PencilEditCell`'s idle/editing states had stable selectors, making the required e2e specs impossible to write reliably (title-text and CSS-class selectors are brittle per this project's own `present-grid.spec.ts` convention).
- **Fix:** Added `data-testid="deal-pill"` to `DealCalendar.tsx`'s pill button (a shared component with Sell — purely additive, no behavior change). Added an optional `testId` prop to `PencilEditCell`, applied on all three of its rendered states (editing/insert/filled), and wired `pencil-cell-net`/`pencil-cell-gross` from `AnalyticsTable.tsx`.
- **Files modified:** `src/modules/deals/components/DealCalendar.tsx`, `src/app/buy/PencilEditCell.tsx`, `src/app/buy/AnalyticsTable.tsx`
- **Verification:** Both e2e specs pass using these testids; `kpi-card` testid (already planned) plus these three cover every selector the specs need.
- **Committed in:** `e22047a` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing testability)
**Impact on plan:** Deviation 1 was a pre-existing, invisible bug from plan 18-09 — this plan's composition was the first code path to actually exercise it, so fixing it here (rather than deferring) was necessary to satisfy this plan's own "live-verified, zero console errors" success criterion. Deviation 2 is purely additive (new optional props / attributes), no behavior change to any existing consumer. No scope creep.

## Issues Encountered

**Worktree dev-server isolation:** The shared `:3000` dev server (per CLAUDE.md's "consolidated ONE :3000 dev server" note) is bound to the MAIN repo checkout directory, not this worktree — confirmed via `lsof`/`ps` (cwd = main repo root). This worktree also had no `node_modules` (resolved transitively via the main repo's, walking up the directory tree) and no `.env.local`. Resolved by: copying `.env.local` from the main checkout, starting an independent `next dev -p 3002` inside the worktree, and using a temporary (uncommitted, `.scratch-verify/`-only, deleted before finishing) Playwright config override pointing `baseURL` at `:3002` to run the two new specs — the committed `playwright.config.ts` (baseURL `:3000`) is untouched and will correctly target the merged app once this branch lands on `claude/muskan/work`. A stray `buyer_resale_price` test row written during manual verification was deleted directly via the Supabase service-role client before finishing, so the shared local DB is unaffected for other parallel worktree agents.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 7 phase-18 success criteria are now demonstrably live on `/buy`: KPI strip, Deals timeline, Analytics live layer, Analytics CSV layer, pencil-edit resale price, Partner rows + Relationship link, Buyer-Sella stub.
- The buy module barrel (`src/modules/buy/index.ts`) is ready for any future Buy-surface fast-follow (pack-size filter wiring, CSV import polish) to consume without reaching into individual files.
- No blockers. The `resalePriceActions.ts` fix should be flagged to whoever reviews/merges 18-09's original plan lineage, since it corrects a latent bug in that plan's own deliverable (documented here rather than re-opening that plan).

## Self-Check: PASSED

All 14 claimed files verified present on disk; all 3 task commits (`5eebe22`, `f5214de`, `e22047a`) verified present in git log.

---
*Phase: 18-buy-page*
*Completed: 2026-07-08*
