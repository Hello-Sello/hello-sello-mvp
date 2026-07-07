---
phase: 13-settings-home-lifecycle-emails
plan: 04
subsystem: database
tags: [postgres, rls, supabase, notifications, lookup-tables, schema]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: person table + auth.uid() + the lookup-table/own-row RLS conventions (rls_policies.sql, lookups_and_seeds.sql)
  - phase: 13-settings-home-lifecycle-emails (13-02)
    provides: account_lifecycle migration + account_lifecycle_test.sql harness (the same-phase impersonation-test template)
provides:
  - notification_category lookup with an is_transactional honesty flag (4 v1 categories, all transactional)
  - notification_channel lookup (email wired; in_app reserved, not enforced)
  - notification_preference per-person category×channel join with a unique index + own-row SELECT RLS
  - a runnable own-row + all-transactional SQL invariant test (+ runner)
affects: [13-03 (SET-03 sender consults is_transactional), 13-09 (read-only Notifications settings section renders this)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Forward-shaped stub: model category×channel×person for later marketing/in-app opt-out, wire EMAIL only + all-transactional now so the future send-check is a no-op pass-through"
    - "SELECT-only-via-RLS: own-row SELECT policy + NO write policy = writes denied by default (RLS is the authorization boundary), matching business_category_taxonomy"

key-files:
  created:
    - supabase/migrations/20260706090100_notification_preference.sql
    - supabase/tests/notification_pref_rls_test.sql
    - supabase/tests/run_notification_pref_rls_test.sh
  modified: []

key-decisions:
  - "Rendered 'grant SELECT only' as an own-row SELECT RLS policy with no write policy (default-deny), matching the repo convention (business_category adds no explicit SQL GRANTs) — not an explicit SQL GRANT/REVOKE"
  - "Preference table intentionally ships empty (no write path in v1); is_transactional = TRUE on all 4 categories makes the read-only section carry no dead toggle"
  - "Test seeds ephemeral d-space auth.users→person rows (company-less) rather than reusing the demo seed — isolates the own-row proof from volatile seed state"

patterns-established:
  - "notification lookup trio mirrors the business_category → company_business_category lookup-then-junction shape"
  - "own-row preference isolation proven by the account_lifecycle_test.sql impersonation harness (request.jwt.claims + SET LOCAL ROLE authenticated, BEGIN…ROLLBACK)"

requirements-completed: [SET-04]

# Metrics
duration: 18 min
completed: 2026-07-06
---

# Phase 13 Plan 04: Notification-Preference Stub Summary

**Forward-shaped notification-preference store (category×channel×person) with an `is_transactional` honesty flag — EMAIL wired only, all categories transactional, own-row-isolated by RLS, and no dead toggle — proven by an impersonated-JWT SQL invariant test.**

## Performance

- **Duration:** ~18 min
- **Completed:** 2026-07-06T11:20:36Z
- **Tasks:** 2
- **Files created:** 3

## Accomplishments
- One additive migration creating the `notification_category` (with `is_transactional`) + `notification_channel` + `notification_preference` trio, a `(person_id, category_code, channel_code)` unique index, own-row SELECT RLS, and the 4-category / 2-channel seeds (all `ON CONFLICT (code) DO NOTHING`).
- Own-row isolation proven runnable: `bash supabase/tests/run_notification_pref_rls_test.sh` exits 0 against a fresh `supabase db reset` (Nadia reads only her 2 rows, none of Bruno's; Bruno only his 1).
- All-transactional honesty asserted in SQL — every seeded category is `is_transactional = TRUE`, so the read-only section (13-09) ships nothing genuinely toggleable.

## Task Commits

1. **Task 1: notification_preference migration** - `4b7b75a` (feat)
2. **Task 2: own-row RLS invariant test** - `383b949` (test)

**Plan metadata:** (this SUMMARY commit — docs)

## Files Created/Modified
- `supabase/migrations/20260706090100_notification_preference.sql` - lookup trio + unique index + own-row SELECT RLS + lookup read policies + seeds
- `supabase/tests/notification_pref_rls_test.sql` - impersonated-JWT own-row isolation + all-transactional invariant proof
- `supabase/tests/run_notification_pref_rls_test.sh` - runner (host psql, docker fallback), mirrors `run_account_lifecycle_test.sh`

## Decisions Made
- **"Grant SELECT only" → own-row SELECT RLS with no write policy.** The repo's established convention (verified in `20260704090000_business_category_taxonomy.sql`) makes lookups readable via a `FOR SELECT TO authenticated USING (true)` policy and relies on Supabase default privileges + RLS as the gate rather than explicit SQL GRANTs. RLS is the authorization boundary (PROJECT.md), so the absence of any INSERT/UPDATE/DELETE policy on `notification_preference` is the "SELECT only" grant — writes are denied by default. This satisfies the plan's intent (own-row, read-only) using the idiomatic pattern instead of introducing a divergent explicit-GRANT approach.
- **Test uses ephemeral `d`-space persons, not the demo seed.** Seeding two throwaway `auth.users`→`person` rows (company-less — the preference table needs no company) isolates the own-row proof from volatile seed state and never collides with the demo (`1…/2…/a…/b…`) or the sibling `account_lifecycle_test` (`a…/c…/e…`) UUID spaces.

## Deviations from Plan

None - plan executed exactly as written. (The "grant SELECT only" wording was implemented as an own-row SELECT RLS policy with no write policy per the repo's lookup-table convention — a faithful execution of the plan's read-only intent, documented above under Decisions.)

## Known Stubs
- **`notification_preference` ships empty by design.** No write path is wired in v1 (D-19..D-22); the table exists so SET-03's sender has a place to consult opt-out later. This is intentional forward-shaping, not accidental theater — the "Notifications" settings section (rendered in 13-09) is read-only and lists only the transactional categories. Resolved-by-design; no future plan must "fill" it for this plan's goal to hold.
- **`in_app` channel is reserved, not enforced.** Modelled (D-21) so the schema extends to in-app notifications without a migration; v1 wires EMAIL only.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SET-03 (13-03) can later gate its send on `notification_category.is_transactional` — in v1 all categories are transactional, so the check is a forward-compatible pass-through (send always).
- 13-09 can render the read-only Notifications section off `notification_category` (own-row `notification_preference` read is RLS-safe).
- No cloud deploy performed here — this additive migration joins the phase-13 cloud-deploy ledger with the sibling 13-02 migration (per CLAUDE.md item #0).

## Self-Check: PASSED
- Created files exist on disk: `20260706090100_notification_preference.sql`, `notification_pref_rls_test.sql`, `run_notification_pref_rls_test.sh` — all FOUND.
- Task commits exist: `4b7b75a` (feat), `383b949` (test) — both FOUND.
- `supabase db reset` applied the migration clean; `bash supabase/tests/run_notification_pref_rls_test.sh` → exit 0, "ALL NOTIFICATION PREFERENCE RLS TESTS PASSED".

---
*Phase: 13-settings-home-lifecycle-emails*
*Completed: 2026-07-06*
