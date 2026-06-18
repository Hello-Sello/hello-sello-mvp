---
phase: 04-auth-verification-gate-hardening
plan: "01"
subsystem: auth-gate
tags: [auth, gate, revoked, schema, scaffold, tdd, red]
dependency_graph:
  requires: []
  provides:
    - revoked-lookup-value
    - auth-gate-e2e-contract
    - auth-gate-sql-invariant
  affects:
    - 04-02-PLAN (gate implementation — turns e2e RED green)
    - 04-03-PLAN (UX banners + onboarding loop fix — satisfies rejected/revoked assertions)
    - 04-04-PLAN (DB reset — applies migration, turns SQL test green)
tech_stack:
  added: []
  patterns:
    - additive-migration-with-on-conflict
    - tdd-red-first-e2e-scaffold
    - psql-host-docker-fallback-test-runner
key_files:
  created:
    - supabase/migrations/20260617140000_auth04_revoked_status.sql
    - e2e/auth-gate.spec.ts
    - e2e/fixtures/auth-gate-fixtures.ts
    - supabase/tests/auth_gate_test.sql
    - supabase/tests/run_auth_gate_test.sql.sh
  modified: []
decisions:
  - "revoked is a NEW distinct lookup value (sort_order=4, is_terminal=TRUE), not overloaded onto rejected — per CONTEXT session-locked decision"
  - "setRejected fixture calls reject_company RPC (not bespoke INSERT) so audit_log.reason and audit_log.metadata.preset match the D-07 data source"
  - "setVerifiedThenRevoked does direct UPDATE (no revoke_company RPC — out of Phase 4 scope per CONTEXT Deferred Ideas)"
  - "No-company fixture uses HS reviewer (company_id=NULL cross-tenant staff) — avoids need for a new seed user"
metrics:
  duration: "~25 minutes"
  completed: "2026-06-17"
  tasks_completed: 3
  tasks_total: 3
  files_created: 5
  files_modified: 0
---

# Phase 04 Plan 01: Wave-0 RED scaffolds + AUTH-03 schema prerequisite

**One-liner:** Additive `revoked` lookup migration + RED e2e contract for four broken-session redirects + SQL invariant test ready to go GREEN on the 04-04 reset.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add revoked lookup value + widen Decided-tab filter | 1512c64 | supabase/migrations/20260617140000_auth04_revoked_status.sql |
| 2 | RED e2e spec for four broken-session redirects + gated-action bypass | 3f736b6 | e2e/auth-gate.spec.ts, e2e/fixtures/auth-gate-fixtures.ts |
| 3 | SQL invariant test for revoked lookup + Decided-tab filter | f38190f | supabase/tests/auth_gate_test.sql, supabase/tests/run_auth_gate_test.sql.sh |

## What Was Built

**Task 1 — Migration (20260617140000_auth04_revoked_status.sql):**
- Idempotent INSERT of `revoked` (sort_order=4, is_terminal=TRUE, description='Access revoked by Hello Sello') into `company_verification_status` using `ON CONFLICT (code) DO NOTHING`
- CREATE OR REPLACE `list_decided_verifications()` with the WHERE filter widened from `in ('verified', 'rejected')` to `in ('verified', 'rejected', 'revoked')` — verbatim copy of the original body from 20260617094300, only the filter line changed
- No `revoke_company` RPC, no revocation trigger (CONTEXT Deferred Ideas respected)
- Migration is latest-timestamped (sorts after 20260617130000 as required)

**Task 2 — E2E spec (auth-gate.spec.ts + auth-gate-fixtures.ts):**
- Five RED test cases: no-company→/onboarding, pending→/home+banner, rejected→/onboarding+stays (loop guard), revoked→/home+suspended-banner, gated-action bypass
- Rejected case explicitly asserts `URL settles on /onboarding` AND `URL does not contain /home` with a 1.5s wait — the RED contract for the 04-03 loop fix (onboarding/page.tsx line 31 exemption)
- Banner assertions use stable test-ids: `data-testid="rejection-banner"` and `data-testid="suspended-banner"` — the 04-03 contract
- Fixtures use the no-company HS reviewer (company_id=NULL) for the no-company case, Alice for status mutations
- `setRejected` calls `reject_company` RPC so audit_log.reason matches D-07's data source
- `setVerifiedThenRevoked` does a direct UPDATE (no RPC in scope)
- `resetToVerified` cleans both company status and rejection audit_log rows between tests

**Task 3 — SQL test (auth_gate_test.sql + run_auth_gate_test.sql.sh):**
- Three assertions: (A) revoked row exists with is_terminal=TRUE, (B) direct UPDATE to revoked succeeds (no FK error), (C) list_decided_verifications() returns the revoked company when called as HS reviewer
- Runner mirrors run_admin_verification_test.sh exactly: host psql → docker fallback
- Prints `ALL AUTH GATE TESTS PASSED` on success; RAISE EXCEPTION with clear message on each failure

## RED State Documentation

The e2e spec (Task 2) is intentionally RED against current code:
- No server-side gate on /discover (04-02 builds it)
- No rejection-banner or suspended-banner in the UI (04-03 builds them)
- onboarding/page.tsx line 31 still bounces rejected companies to /home (04-03 fixes it)
- revoked case: no gate enforcement, no suspended banner

The SQL test (Task 3) is RED until 04-04 reset applies the migration.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — this plan is scaffolding (tests + migration), no UI components or data stubs.

## Threat Flags

None — `list_decided_verifications()` replacement keeps the same security posture as the original (SECURITY DEFINER, `revoke all from public`, `grant execute to authenticated`). The `revoked` lookup value is additive with no new network surface.

## Self-Check: PASSED
