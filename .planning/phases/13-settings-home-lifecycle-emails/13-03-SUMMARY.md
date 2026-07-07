---
phase: 13-settings-home-lifecycle-emails
plan: 03
subsystem: infra
tags: [gdpr, pg_cron, pg_net, edge-function, deno, audit-log, hash-chain, supabase, erasure, service-role]

# Dependency graph
requires:
  - phase: 13-02 (account_lifecycle)
    provides: person.deletion_scheduled_for / anonymized_at columns + the person.gdpr_scrubbed audit code
provides:
  - Daily pg_cron sweep (run_scheduled_erasures) that POSTs the erase-expired-accounts edge worker
  - erase-expired-accounts Deno worker — GDPR pseudonymization of expired accounts (both rows KEPT)
  - scrub_person_pii + audit_person_scrub — service_role-only SECURITY DEFINER erasure primitives
  - erasure_chain_test.sql — a runnable invariant proving the audit hash chain survives erasure
affects: [13-07 cloud-deploy ledger (function + cron + edge-runtime admin-API UAT), SET-03 lifecycle emails, GDPR Art 17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Erasure = pseudonymize-in-place (scrub PII + tombstone email + soft-delete), NEVER row-delete — the audit FK chain stays intact"
    - "System DB primitives locked to service_role: revoke from public,anon,authenticated then grant to service_role (Supabase default privileges need the explicit anon/authenticated revoke)"
    - "Hash-chain invariant test: recompute every entry_hash exactly as the insert trigger, before + after a mutation, to prove non-destructiveness"

key-files:
  created:
    - supabase/migrations/20260706090200_erasure_cron.sql
    - supabase/functions/erase-expired-accounts/index.ts
    - supabase/functions/erase-expired-accounts/deno.json
    - supabase/tests/erasure_chain_test.sql
    - supabase/tests/run_erasure_chain_test.sh
  modified: []

key-decisions:
  - "DB-side scrub + audit routed through two committed SECURITY DEFINER RPCs so the invariant test runs the IDENTICAL code path the worker triggers (no drift) and the 6-field scrub list is a single source of truth"
  - "gdpr_scrubbed audit uses actor_type 'system' (automated sweep, no human actor); company_id is RETAINED (not PII) so the audit keeps its company scope"
  - "The worker's auth.admin scrub (email tombstone + soft-delete) is proven via SQL simulation in the test; running it from the live edge runtime is the RESEARCH A3 cloud-UAT item"

patterns-established:
  - "Reuse the sella-detect cron→pg_net→Vault→edge chain for any scheduled edge trigger (project_url + edge_anon_key already seeded)"
  - "Idempotent + fail-soft batch worker: select due rows, per-row try/catch, each step a no-op on re-run"

requirements-completed: [SET-02]

# Metrics
duration: 25 min
completed: 2026-07-06
---

# Phase 13 Plan 03: Asynchronous GDPR Erasure Summary

**A daily pg_cron sweep drives an `erase-expired-accounts` Deno worker that pseudonymizes expired accounts (scrub person PII + tombstone `auth.users` email + soft-delete login) while KEEPING both rows, proven non-destructive to the append-only audit hash chain by a runnable SQL invariant.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-06T12:07Z
- **Tasks:** 2
- **Files created:** 5

## Accomplishments
- **Committed daily sweep** — `run_scheduled_erasures()` (SECURITY DEFINER, `search_path=''`) reads the reused Vault `project_url` + `edge_anon_key` and `net.http_post`s `/functions/v1/erase-expired-accounts`; scheduled `'0 3 * * *'` via the idempotent unschedule-then-schedule guard. Verified registered in `cron.job`.
- **Erasure worker** — per due row (`deletion_scheduled_for <= now() AND anonymized_at IS NULL`), in order: `scrub_person_pii` → `updateUserById` (email tombstone) → `deleteUser(shouldSoftDelete)` → `audit_person_scrub`. Fail-soft per row, idempotent, uses `SUPABASE_SERVICE_ROLE_KEY`. Passes `deno check`.
- **Two erasure primitives** — `scrub_person_pii` (empties first/last name, display_name, avatar_path, preferences, metadata + sets `anonymized_at`; keeps `company_id`) and `audit_person_scrub` (company-less-guarded, idempotent `person.gdpr_scrubbed` audit). Both service_role-only.
- **Hash-chain invariant test** — recomputes every `entry_hash` exactly as the insert trigger, before and after the scrub. Asserts: both rows survive, PII scrubbed, login disabled, email tombstoned, bystander untouched, chain re-verifies end-to-end, pre-existing hashes byte-identical, and a second sweep is a no-op. Exits 0 on a fresh `db reset`.

## Task Commits

1. **Task 1: erasure_cron migration (cron sweep + scrub RPCs)** — `c09381c` (feat)
2. **Task 2: erase-expired-accounts worker + hash-chain test** — `8bdab31` (feat)

## Files Created/Modified
- `supabase/migrations/20260706090200_erasure_cron.sql` — pg_cron daily sweep + `run_scheduled_erasures` + `scrub_person_pii` + `audit_person_scrub`
- `supabase/functions/erase-expired-accounts/index.ts` — the Deno service-role erasure worker
- `supabase/functions/erase-expired-accounts/deno.json` — worker config (mirrors the sibling send-lifecycle-email)
- `supabase/tests/erasure_chain_test.sql` — the hash-chain invariant proof
- `supabase/tests/run_erasure_chain_test.sh` — host-psql / docker-fallback runner

## Decisions Made
- **Two committed definer RPCs for the DB-side scrub + audit** (vs. raw inline SQL in the worker). The plan showed a raw `update public.person …` and permitted "a small definer RPC or a direct service-role insert" for the audit. Routing BOTH through committed RPCs keeps the person write in a definer RPC (DEV-88 discipline), makes the six-field scrub list a single source of truth shared by worker + test, and lets the invariant test exercise the IDENTICAL code path the worker triggers. The worker's four-step order (scrub → tombstone → soft-delete → audit) is preserved.
- **`company_id` is retained through the scrub** — it is the tenant link, not PII; keeping it preserves the audit trail's company scope (and lets `audit_person_scrub` resolve the company after the scrub).
- **Audit `actor_type = 'system'`** — the sweep is an automated process, not a human actor.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Security] Revoked EXECUTE from anon + authenticated on all three erasure functions**
- **Found during:** Task 1 (DB-level grant verification after the first `db reset`)
- **Issue:** `revoke all … from public` was insufficient — Supabase default privileges EXPLICITLY grant EXECUTE on new `public` functions to `anon` + `authenticated`, which `revoke from public` does NOT remove. The grant check showed `scrub_person_pii` callable by `authenticated`, i.e. any logged-in user could call `scrub_person_pii('<victim-id>')` and destroy another user's PII + mark them anonymized (a DEV-88-class hole).
- **Fix:** `revoke all on function … from public, anon, authenticated;` on all three functions, then `grant execute … to service_role`.
- **Verification:** Re-ran `db reset`; `information_schema.routine_privileges` now shows execute = `postgres,service_role` only. Erasure test still exits 0.
- **Committed in:** `c09381c` (Task 1 commit)

**2. [Rule 3 - Blocking/Type] Omitted `phone: null` from `updateUserById`**
- **Found during:** Task 2 (`deno check` against `@supabase/supabase-js@2` types)
- **Issue:** The plan listed `phone: null`, but `AdminUserAttributes.phone` is typed `string | undefined`, so `null` is a type error.
- **Fix:** Dropped `phone` from the attributes. The tombstone still clears the actual PII carriers — `email` (the SSOT identifier; `email_encrypted` was dropped 2026-05-27) and `user_metadata`/`app_metadata` (which hold the signup name).
- **Verification:** `deno check index.ts` passes clean.
- **Committed in:** `8bdab31` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 missing-critical-security, 1 type/blocking).
**Impact on plan:** Both essential for correctness/security. The security revoke closes a real destruction vector; the type fix keeps the worker deployable. No scope creep.

## Issues Encountered
- **`rtk` shell wrapper mangled top-level `docker`/`git`** ("unknown flag: --format"). Worked around by routing raw `docker`/`git` through `rtk proxy …` (per the plan's git-safety note). No impact on deliverables.

## Threat Flags
None — no new trust boundary beyond the plan's `<threat_model>`. All STRIDE mitigations implemented (row-scoped due-only selection, per-row fail-soft, service-role-only key, no new package surface) plus the added anon/authenticated EXECUTE revoke.

## Next Phase Readiness
- **Cloud-UAT item (13-07 ledger):** the worker's `auth.admin` scrub (email tombstone + `deleteUser` soft-delete) is proven via SQL simulation in the invariant test; running it from the LIVE edge runtime with `SUPABASE_SERVICE_ROLE_KEY` (RESEARCH A3 — the JWT service role that should work on the local/cloud admin API where the Next `sb_secret_` path 403s) is deferred to cloud UAT. Migration + worker code + SQL invariant are complete and committed.
- **Cloud deploy (deferred, 13-07):** deploy the `erase-expired-accounts` function and confirm the `edge_anon_key` Vault secret is seeded on cloud (it is out-of-band, not in a migration) so `run_scheduled_erasures` can authenticate the POST.

## Self-Check: PASSED
- All 5 created files exist on disk (verified with `[ -f ]`).
- Both task commits exist: `c09381c`, `8bdab31` (verified in `git log`).
- `supabase db reset` applies the migration clean; `bash supabase/tests/run_erasure_chain_test.sh` exits 0; sibling `account_lifecycle` test still green (no regression); worker passes `deno check`.

---
*Phase: 13-settings-home-lifecycle-emails*
*Completed: 2026-07-06*
