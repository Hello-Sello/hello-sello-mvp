---
phase: 05-surface-polish-f-flags
plan: 01
subsystem: ui
tags: [nextjs, react, discover, catalogue, pricing, feature-flags]

# Dependency graph
requires:
  - phase: 04-auth-verification-gate-hardening
    provides: verified-member gate on Discover RPCs; pricingRequested field on get_discoverable_company
provides:
  - Correct anyPriceHidden computation keyed on seller intent (pricePublic === false) not data absence
  - Request-pricing CTA renders for all buyers until they have requested pricing, regardless of connection state
affects: [05-02, 05-03, discover]

# Tech tracking
tech-stack:
  added: []
  patterns: [explicit-seller-intent flag over null-price heuristic, component-owns-success-state pattern]

key-files:
  created: []
  modified:
    - src/app/discover/[companyId]/page.tsx

key-decisions:
  - "Use pricePublic === false (explicit seller choice) not pricePerGram == null (data absence) for anyPriceHidden — the distinction is what the seller intended, not whether a row exists"
  - "Gate request-pricing CTA on !company.pricingRequested (not !connected) — connected buyers can still request pricing; pricingRequested tracks whether they already did"
  - "Remove the now-unused const connected var to keep no-unused-vars clean; it was never referenced after the F5 guard change"

patterns-established:
  - "Seller-intent flag pattern: use the explicit boolean (pricePublic === false) over null heuristics for UI branching"
  - "Component-owns-success-state: RequestPricingActions renders its own 'sent' state from the requested prop; parent only gates rendering the component at all"

requirements-completed: [POLISH-01, POLISH-03]

# Metrics
duration: 8min
completed: 2026-06-17
---

# Phase 5 Plan 01: Fix F5 + F12 on Discover Company Page Summary

**Two surgical edits to page.tsx: pricePublic === false replaces null heuristic for TierChip, and request-pricing CTA now shows to all buyers until they have requested (not just unconnected)**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-17T17:22:56Z
- **Completed:** 2026-06-17T17:30:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- F12 fixed: `anyPriceHidden` now uses `p.pricePublic === false` — new sellers with no pricelist rows no longer get the "Prices on request" TierChip label
- F5 fixed: `RequestPricingActions` CTA renders whenever `anyPriceHidden && !company.pricingRequested` — connected buyers who haven't requested pricing see the CTA; pricingRequested=true collapses it (success state lives inside the component)
- Cleaned up unused `const connected` declaration that became dead code after the F5 guard change

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix F12 anyPriceHidden + F5 request-pricing guard in page.tsx** - `fe498b0` (fix)

**Plan metadata:** *(docs commit to follow)*

## Files Created/Modified
- `src/app/discover/[companyId]/page.tsx` - Fixed anyPriceHidden computation (L107) and RequestPricingActions render guard (L128); removed unused `connected` var (L108)

## Decisions Made
- Used `p.pricePublic === false` strict equality (not `!p.pricePublic`) per D-06 — ensures `null` (no intent set yet) is correctly treated as "not hidden", not as "hidden"
- Did not touch `RequestPricingActions.tsx` — the component already handles the `requested=true` success state via its own `phase` state seeded from the prop; parent only controls whether the block renders at all

## Deviations from Plan

None - plan executed exactly as written. Both edits were the exact two-line surgical changes specified in the plan (F12 line 107, F5 line 128, cleanup line 108). No additional logic was needed.

## Issues Encountered
None - ESLint and TypeScript both passed cleanly on first attempt.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- F5 + F12 complete; page.tsx is correct
- Plan 05-02 (F6 — connection_state scoping on list_discoverable_companies) can proceed immediately
- Plan 05-03 (F2 + F13 — ShopView carousel lint + toggle error feedback) can proceed in parallel

---
*Phase: 05-surface-polish-f-flags*
*Completed: 2026-06-17*
