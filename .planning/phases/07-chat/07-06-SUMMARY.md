---
phase: 07-chat
plan: 06
subsystem: database
tags: [deals, promotion, reopen-ticket, rls, supabase, server-actions, vitest]

# Dependency graph
requires:
  - phase: 07-04
    provides: retired Stages backend, lifecycle/finalize-by-invoice path (canFinalizeByInvoice, done status), invoice-close trigger
provides:
  - deal_promotion table (SEPARATE lock-free row) + RLS + promotion audit codes
  - reopen-ticket lifecycle status codes (ticket_created/ticket_closed) + audit codes
  - pure promotion savings math (promotionSavings via canonical per-gram money)
  - offerPromotion / acceptPromotion / declinePromotion server actions
  - getPromotion read (viewer-relative, savings precomputed)
  - reopenTicket / closeTicket server actions (either party, terms immutable)
affects: [07-07, 07-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Independent state track modeled as its OWN row (deal_promotion) with NO active-row lock, so it never collides with the negotiation's one-active-row lock"
    - "Reuse sumLineValue/lineValueOf for all promotion money (D-25) - the unit can never move the saving"
    - "Additive lifecycle status codes + audit codes (ON CONFLICT DO NOTHING, 0 rows to backfill)"

key-files:
  created:
    - supabase/migrations/20260707140000_deal_promotion.sql
    - supabase/migrations/20260707140100_lifecycle_status_codes.sql
    - src/modules/deals/lib/promotion.ts
    - src/modules/deals/lib/promotion.test.ts
  modified:
    - src/modules/deals/types.ts
    - src/modules/deals/actions.ts
    - src/modules/deals/supabase/reads.ts
    - src/modules/deals/index.ts
    - src/modules/deals/components/DealPin.tsx

key-decisions:
  - "The promotion is a SEPARATE deal_promotion row (NOT a kind on deal_pending_change) with NO one-active-row lock, so a live promotion and a live negotiation never block each other (D-21)"
  - "Savings are computed via the canonical lineValueOf/sumLineValue money (worth minus paid), never size x units x price (D-25)"
  - "Resolving the promotion NEVER touches deal_confirmation or the Sign gate; offer does not bump the version (D-26) - the prototype's Sign-gating is not built"
  - "acceptPromotion applies the reward line_deltas INDEPENDENTLY at accept time (Open Question 2), as real deal_line_item rows at the current version"
  - "reopen ticket is additive lifecycle status codes (D-30); either party may reopen from done; sealed terms stay immutable (D-29)"

patterns-established:
  - "Pattern 1: dealSides(supabase, id) private helper resolves version/status/seller/buyer once; callers only compare their session company against these (never trust a client-claimed side)"
  - "Pattern 2: deal_promotion reads/writes use the localized `as never` cast (table not in generated types), mirroring deal_pending_change"

requirements-completed: [PROMO-01, RTKT-01]

# Metrics
duration: 22min
completed: 2026-07-07
---

# Phase 07 Plan 06: Promotion track + reopen-ticket backend Summary

**An independent, lock-free, Sign-agnostic yellow promotion track with canonical savings math, plus a post-close reopen-ticket path that either party can open without changing the sealed deal terms.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-07-07T10:29Z (approx)
- **Completed:** 2026-07-07T10:41Z (approx)
- **Tasks:** 3 completed
- **Files created:** 4 / **Files modified:** 5

## Accomplishments
- Built the promotion state machine as a genuinely SEPARATE `deal_promotion` row with no shared lock, so a live promotion and a live negotiation cannot block each other (D-21, Pitfall 2).
- Locked the load-bearing correction in code: promotion offer/accept/decline never touch `deal_confirmation` and never bump the version, so Sign stays callable throughout (D-26). `promotion.ts` contains no reference to `deal_confirmation` at all (grep-verified).
- Wrote the pure savings math (`promotionSavings`) on the canonical per-gram money (`sumLineValue`/`lineValueOf`), proven kg<->g normalized by a mixed-unit unit test - the displayed unit can never move the saving (D-25).
- Added the reopen-ticket backend: additive `ticket_created`/`ticket_closed` lifecycle status codes, and `reopenTicket`/`closeTicket` actions that either party can call while leaving the sealed line items/conditions untouched (D-29/D-30).

## Task Commits

Each task was committed atomically:

1. **Task 1: deal_promotion table + RLS + lifecycle status codes** - `92eff80` (feat)
2. **Task 2 (RED): failing promotion savings unit test** - `b1f5739` (test)
3. **Task 2 (GREEN): promotion savings math + actions + reads + types** - `401c023` (feat)
4. **Task 3: reopen-ticket backend + STATUS_BADGE fix** - `dc42fc4` (feat)

_Task 2 is TDD: RED (throwing stub + 6 failing tests) then GREEN (6 passing)._

## Files Created/Modified
- `supabase/migrations/20260707140000_deal_promotion.sql` - the SEPARATE lock-free `deal_promotion` table (line_deltas/condition_deltas/state) + `promotion_member_all` RLS + `promotion.*` audit codes. Deliberately NO active-row index on deal_card_id.
- `supabase/migrations/20260707140100_lifecycle_status_codes.sql` - additive `deal_card_status` rows `ticket_created`/`ticket_closed` + `deal.reopened`/`deal.ticket_closed` audit codes.
- `src/modules/deals/lib/promotion.ts` - pure `promotionSavings(baseLines, acceptedLines)` = worth minus paid via `sumLineValue` (D-25), clamped at 0.
- `src/modules/deals/lib/promotion.test.ts` - 6 unit tests (same-price extra units = 0, free reward = struck value, kg<->g equivalence, mixed lines, negative clamp, empty).
- `src/modules/deals/types.ts` - `PromotionState`/`PromotionLineDelta`/`PromotionConditionDelta`/`PromotionView`/`OfferPromotionInput`/`OfferPromotionResult`; `DealCardStatus` += `ticket_created`/`ticket_closed`.
- `src/modules/deals/actions.ts` - `offerPromotion`/`acceptPromotion`/`declinePromotion`, `reopenTicket`/`closeTicket`, and the shared `dealSides` helper.
- `src/modules/deals/supabase/reads.ts` - `getPromotion` (viewer-relative, savings precomputed) + coercion helpers.
- `src/modules/deals/index.ts` - barrel exports for the new types/math/read/actions.
- `src/modules/deals/components/DealPin.tsx` - completed the exhaustive `STATUS_BADGE` record for the two new statuses (Rule 3 fix).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Completed the exhaustive `STATUS_BADGE` record in DealPin**
- **Found during:** Task 3
- **Issue:** Extending the `DealCardStatus` union with `ticket_created`/`ticket_closed` made `tsc` fail on `Record<DealCardStatus, ...>` in `DealPin.tsx` (missing keys).
- **Fix:** Added the two entries with the D-30 colours (blue / dark-green). The badge UI itself is deferred (D-17); this only keeps the record exhaustive so the build is green.
- **Files modified:** `src/modules/deals/components/DealPin.tsx`
- **Commit:** `dc42fc4`

**2. [Rule 2 - Missing correctness] Seeded the reopen audit codes + promotion provenance columns**
- **Found during:** Tasks 1 and 3
- **Issue:** `writeAudit`'s `action` column is FK-validated against `audit_action_type`, so `reopenTicket`/`closeTicket` calling `deal.reopened`/`deal.ticket_closed` would FK-fail without those codes. The plan seeded the `promotion.*` codes but not the reopen ones.
- **Fix:** Added `deal.reopened`/`deal.ticket_closed` to the lifecycle migration (idempotent). Also added `offered_by_company`/`offered_by_person`/`resolved_by_person`/`resolved_at` provenance columns to `deal_promotion` (mirroring `deal_pending_change`'s `proposed_by_*`) so who-offered/who-resolved is auditable.
- **Files modified:** `supabase/migrations/20260707140100_lifecycle_status_codes.sql`, `supabase/migrations/20260707140000_deal_promotion.sql`
- **Commit:** `92eff80`

## Notes / Context

- **Migrations NOT applied locally** (per the migration handoff note): plan 07-08 owns the single local `supabase db reset` and the `database.types.ts` regen. The new `deal_promotion` table + status/audit codes are therefore not yet in the generated types - all `deal_promotion` reads/writes use the localized `as never` cast, exactly like `deal_pending_change`.
- **Prototype NOTES.md absent in the worktree:** `prototypes/deal-card-promo-prototype/` is untracked in the main repo, so it is not checked out here. No information was lost - the corrected mechanic (D-23/D-26) is fully captured in `07-CONTEXT.md`, which is what was followed.
- **Runtime behaviour** (Sign works while a promotion is pending, accept applies the reward units, reopen from `done` without term changes) is exercised e2e in 07-08 after the local DB reset. This plan is backend-only; the yellow UI + reopen button render in 07-07.

## Known Stubs
None that block the plan goal. The promotion UI (07-07), the local DB apply + types regen (07-08), and applying `condition_deltas` visually in Extra Conditions (07-07) are downstream by design, not stubs.

## Verification

| Gate | Result |
|------|--------|
| Task 1 migration greps (deal_promotion present, no active-row lock on deal_card_id, ticket codes) | PASS |
| Task 2 greps (sumLineValue/lineValueOf in promotion.ts, acceptPromotion in actions, no deal_confirmation in promotion.ts) | PASS |
| `npm run test:unit` | 77 passed (9 files), incl. 6 new promotion tests |
| `npx tsc --noEmit` | exit 0 |
| `npx eslint src/modules/deals` | exit 0 |
| `npm run build` | exit 0 (Compiled successfully) |

## Self-Check: PASSED
- Created files verified present: 2 migrations, `promotion.ts`, `promotion.test.ts`.
- Commits verified in git log: `92eff80`, `b1f5739`, `401c023`, `dc42fc4`.
