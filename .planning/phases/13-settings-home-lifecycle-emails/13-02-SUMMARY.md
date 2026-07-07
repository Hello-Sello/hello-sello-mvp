---
phase: 13-settings-home-lifecycle-emails
plan: 02
subsystem: database
tags: [account-lifecycle, security-definer, rls-safe, audit, gdpr, deactivate, delete]

# Dependency graph
requires:
  - phase: 11-rbac-activation-company-team
    provides: sole-Superadmin count guard (remove_member pattern) + person_group + current_company_id() + has_permission('team.manage')
  - phase: 12-join-existing-company
    provides: company-less audit precedent (guard the company-scoped audit insert before it runs)
  - phase: 01-clean-rebuild-foundation
    provides: person/company tables + audit_log(company_id NOT NULL) + audit_action_type lookup
provides:
  - Nullable-timestamp lifecycle state model on person (deactivated_at, deletion_scheduled_for, anonymized_at) + company (deactivated_at)
  - 6 SECURITY DEFINER lifecycle RPCs scoped to the caller's own row / own company
  - 6 account.*/company.* audit codes (category 'lifecycle')
affects: [13-03 (day-30 erasure sweep reads deletion_scheduled_for/anonymized_at), 13-08 (security actions wrap these RPCs), 13-07 (blocking local apply + type regen + cloud ledger)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Orthogonal nullable timestamps define away invalid lifecycle states (no status enum)
    - SECURITY DEFINER RPC scoped id = auth.uid() (account) / id = current_company_id() (company); no base RLS/grant widening
    - Company-less audit guard (if v_company_id is not null) to respect audit_log.company_id NOT NULL

key-files:
  created:
    - supabase/migrations/20260706090000_account_lifecycle.sql
    - supabase/tests/account_lifecycle_test.sql
    - supabase/tests/run_account_lifecycle_test.sh
  modified: []

key-decisions:
  - "State is 4 orthogonal nullable timestamps, not a status enum — the 13-03 sweep is a trivial `where deletion_scheduled_for <= now() and anonymized_at is null`"
  - "Every write is a SECURITY DEFINER RPC (search_path='') scoped to id = auth.uid() (account) or id = current_company_id() (company); NO base person/company UPDATE grant or RLS widened (DEV-88 respected — grep 'grant update' = 0)"
  - "request_account_deletion reuses the P11 sole-Superadmin count guard (RAISE 'promote another Superadmin before deleting your account') to prevent a headless company"
  - "Company-less (half-onboarded) self-deletion skips the company-scoped audit insert (if v_company_id is not null) rather than crash on audit_log.company_id NOT NULL — resolves RESEARCH Open-Q #2"
  - "Never DELETE from person/auth (grep = 0); erasure is pseudonymization, performed later by 13-03's worker"

patterns-established:
  - "Nullable-timestamp lifecycle state + own-row SECURITY DEFINER RPC + in-transaction audit (guarded on non-null company_id)"

requirements-completed: [SET-02]

# Metrics
duration: ~24 min (agent) + orchestrator reconciliation
completed: 2026-07-06
---

# Phase 13 Plan 02: Account/Company Lifecycle Summary

**The SET-02 synchronous lifecycle backbone: nullable-timestamp state on `person`/`company` plus 6 SECURITY DEFINER RPCs (deactivate/request-delete/cancel/reactivate + company deactivate/reactivate), every write scoped to the caller's own row and audited in-transaction — no base RLS or grant widened.**

> ⚠️ **Reconstruction note (tool honesty):** the executor agent completed both tasks and committed all three deliverables, but the API connection dropped at the final SUMMARY-writing step (agent status: failed). This SUMMARY was reconstructed by the orchestrator from the committed migration + a full re-verification (`supabase db reset` clean on the real migration chain; `run_account_lifecycle_test.sh` → "ALL ACCOUNT LIFECYCLE TESTS PASSED"; migration grep confirms all 6 RPCs / 4 columns / 6 audit codes and the security invariants below). No code was lost or changed.

## Performance
- **Tasks:** 2 (both committed by the agent before it dropped)
- **Files:** 3 created
- **Completed:** 2026-07-06

## Accomplishments
- Additive migration adds nullable lifecycle timestamps: `person.deactivated_at`, `person.deletion_scheduled_for`, `person.anonymized_at`, `company.deactivated_at`.
- 6 SECURITY DEFINER RPCs (`search_path=''`, two-door `revoke all from public` + `grant execute to authenticated`):
  - `deactivate_account()` / `reactivate_account()` — own row (`id = auth.uid()`).
  - `request_account_deletion()` — sole-Superadmin count guard (RAISE), then sets `deactivated_at = now()` + `deletion_scheduled_for = now() + 30d`.
  - `cancel_account_deletion()` — clears the schedule.
  - `deactivate_company()` / `reactivate_company()` — `has_permission('team.manage')` belt + scoped `id = current_company_id()`.
- 6 `account.*`/`company.*` audit codes seeded (`on conflict (code) do nothing`, category `lifecycle`); `person.gdpr_scrubbed`/`soft_deleted` NOT re-seeded.
- Impersonated-SQL invariant test proves: own-row scope (user B untouched), sole-Superadmin lockout (RAISE text asserted), company-less no-crash (zero audit rows, no NOT-NULL violation).

## Task Commits
1. **Task 1: account_lifecycle migration — columns + RPCs + audit codes** — `b86d628` (feat)
2. **Task 2: impersonated-SQL invariant test** — `325b235` (test)

_(STATE.md / ROADMAP.md are owned by the orchestrator post-wave.)_

## Files Created/Modified
- `supabase/migrations/20260706090000_account_lifecycle.sql` — 4 nullable columns + 6 lifecycle RPCs + 6 audit codes.
- `supabase/tests/account_lifecycle_test.sql` — impersonated-JWT invariants (own-row scope, sole-Superadmin RAISE, company-less audit no-crash), rolled back.
- `supabase/tests/run_account_lifecycle_test.sh` — runner wrapper.

## Threat Model Coverage
- **T-13-02-T** (Tampering): `update ... where id = auth.uid()` only; no client-passed person id; **no widened person UPDATE grant** (grep `grant update` = 0 — DEV-88 respected).
- **T-13-02-E** (Elevation): `deactivate_company` belts `has_permission('team.manage')` + scopes `id = current_company_id()`; SECURITY DEFINER + two-door grant.
- **T-13-02-D** (DoS / headless company): sole-Superadmin count guard RAISE reused from `remove_member`.
- **T-13-02-I** (audit metadata on erasure): accepted — GDPR Art 17(3) retention; PII scrub is 13-03.

## Verification (orchestrator re-run post-failure)
- `supabase db reset` applies the full real migration chain (base → P11/P12 → session-49 taxonomy → early P7 catalogue → `20260706090000_account_lifecycle`) + seed **clean**, exit 0.
- `bash supabase/tests/run_account_lifecycle_test.sh` → **"ALL ACCOUNT LIFECYCLE TESTS PASSED"**, exit 0.
- Migration grep: 6 RPCs present, 4 columns added, 6 audit codes, 7 `security definer`, **0** `delete from public.(person|auth)`, **0** `grant update`, 6/6 two-door `grant execute`/`revoke all`.

## Deviations from Plan
None in code/scope. Only process deviation: the SUMMARY was authored by the orchestrator (not the agent) after the agent's connection dropped post-commit — see reconstruction note.

## Known Stubs
None. Erasure execution (pseudonymization sweep) is intentionally 13-03, not a stub here.

## Next Phase Readiness
- **13-03** can read `deletion_scheduled_for`/`anonymized_at` for the day-30 sweep.
- **13-08** can wrap these 6 RPCs in `{ ok } | { error }` server actions.
- **13-07** (blocking) applies this migration locally + regenerates types + records the cloud-push in the ledger.

## Self-Check: PASSED
- All 3 deliverables tracked in HEAD (`git ls-files`).
- Both task commits present (`b86d628`, `325b235`).
- Migration applies clean on the real chain; invariant test passes; security greps all satisfy the plan's acceptance criteria.

---
*Phase: 13-settings-home-lifecycle-emails*
*Completed: 2026-07-06 (reconstructed by orchestrator after agent connection failure)*
