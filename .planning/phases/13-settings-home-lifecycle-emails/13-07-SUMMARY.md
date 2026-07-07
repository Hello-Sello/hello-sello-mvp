---
phase: 13-settings-home-lifecycle-emails
plan: 07
subsystem: database
tags: [supabase, migrations, database.types, pg_cron, gdpr, resend, cloud-ledger, local-first]

# Dependency graph
requires:
  - phase: 13-02
    provides: 20260706090000_account_lifecycle.sql (lifecycle columns + RPCs + audit codes)
  - phase: 13-03
    provides: 20260706090200_erasure_cron.sql (pg_cron sweep + scrub primitives + erase-expired-accounts worker)
  - phase: 13-04
    provides: 20260706090100_notification_preference.sql (notification_* tables + RLS)
provides:
  - Full Phase-13 migration set proven to apply on a clean local DB (supabase db reset green)
  - Three SQL invariants green against the fresh DB (account_lifecycle, erasure_chain, notification_pref_rls)
  - Regenerated src/types/database.types.ts (person/company lifecycle columns + notification_* tables)
  - Phase-13 cloud-deploy ledger section (3 migrations + 2 edge fns + RESEND_API_KEY + cloud-UAT note), deferred
affects: [13-08, 13-09, 13-11, phase-13-verification, cloud-deploy]

# Tech tracking
tech-stack:
  added: []  # zero new packages — uses the wired supabase CLI only
  patterns:
    - "Local-first schema-apply gate: prove the full migration set replays from committed files (db reset) before any runtime verification"
    - "Full type regen validated as surgical-additive (diff: 106 add / 0 removed / 0 changed) rather than blind overwrite"
    - "Cloud config recorded in docs/deploy/cloud-migrations-pending.md ledger, not pushed (deferred cloud debt)"

key-files:
  created:
    - .planning/phases/13-settings-home-lifecycle-emails/13-07-SUMMARY.md
  modified:
    - src/types/database.types.ts
    - docs/deploy/cloud-migrations-pending.md

key-decisions:
  - "Full `supabase gen types typescript --local` regen (not surgical hand-edit) — validated purely additive (106 add / 0 removed / 0 changed), so no existing localized RPC cast can break; the regen also now surfaces the 9 lifecycle/erasure RPCs in the generated Functions type"
  - "The single tsc TS2307 (@/app/settings/security/actions in actions.test.ts) is the expected pre-existing 13-01 RED contract (GREEN in 13-08), NOT a regen break — no other tsc error appeared"
  - "Cloud push deferred to the ledger; Phase-13 pushes AFTER the still-pending P10/P11/P12 batches (CLAUDE.md #0), with an honesty flag to reconcile against the ledger's own 2026-06-23 APPLIED entry before pushing"

patterns-established:
  - "GREEN-on-arrival SQL invariant wrappers run after db reset (host psql → docker exec fallback)"
  - "Ledger entry format: migration table + non-migration cloud steps + cloud-UAT caveats + ordering dependency"

requirements-completed: [SET-02, SET-03, SET-04]

# Metrics
duration: ~20 min
completed: 2026-07-06
---

# Phase 13 Plan 07: Local-First Schema Apply + Type Regen + Cloud Ledger Summary

**Proved the full Phase-13 migration set (SET-02 lifecycle + SET-02 pg_cron erasure + SET-04 notification stub) replays clean on a fresh local DB, regenerated `database.types.ts` as a purely-additive change, and recorded all net-new cloud config in the deploy ledger — no cloud push.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-06T12:24Z
- **Tasks:** 2
- **Files modified:** 2 (+ 1 summary created)

## Accomplishments

- `supabase db reset` replayed all 97 migrations on a clean DB with zero errors, applying the three Phase-13 migrations in order (`20260706090000` → `090100` → `090200`) plus seed.
- All three SQL invariant wrappers passed (exit 0): `account_lifecycle`, `erasure_chain`, `notification_pref_rls` — proving own-row lifecycle scope, the sole-Superadmin lockout, the non-destructive PII scrub + intact audit hash chain, and notification own-row RLS against the real schema.
- Regenerated `src/types/database.types.ts` from the applied DB: **+106 lines, 0 removed, 0 changed in place** — new `person` columns (`deactivated_at`, `deletion_scheduled_for`, `anonymized_at`), `company.deactivated_at`, the three `notification_*` tables, and the 9 lifecycle/erasure RPCs now in the generated Functions type.
- `tsc --noEmit` reports **exactly one** error — the expected pre-existing 13-01 RED contract (`TS2307 @/app/settings/security/actions`, GREEN target 13-08) — confirming the regen introduced no new type breaks.
- Appended a Phase-13 section to `docs/deploy/cloud-migrations-pending.md` recording every net-new cloud action (3 migrations, 2 edge-function deploys, the `RESEND_API_KEY` edge secret, the cloud-UAT note) and the ordering dependency on the still-pending P10/P11/P12 batches. **Zero cloud commands executed.**

## Task Commits

1. **Task 1: apply migrations locally + SQL invariants + regen types** — `23c6a94` (chore)
2. **Task 2: append SET-02/03/04 cloud config to the deploy ledger (deferred)** — `590ad2f` (docs)

_STATE.md / ROADMAP.md left untouched — the orchestrator owns those._

## Files Created/Modified

- `src/types/database.types.ts` — regenerated from the applied local DB; adds person/company lifecycle columns + `notification_*` tables + lifecycle/erasure RPCs (purely additive).
- `docs/deploy/cloud-migrations-pending.md` — new Phase-13 PENDING section (deferred cloud debt).
- `.planning/phases/13-settings-home-lifecycle-emails/13-07-SUMMARY.md` — this file.

## Decisions Made

- **Regen over hand-edit, validated first.** The repo convention had been surgical hand-edits with RPCs cast-based. I generated the full regen to a temp file and diffed before overwriting: it was purely additive (106/0/0), so the escape-hatch (widespread divergence → stop) did not trigger, and I proceeded with the clean full regen. The generated file now also carries the 9 RPCs, which is harmless (additive to the Functions type).
- **The one tsc error is expected, not fixed here.** `@/app/settings/security/actions` is 13-01's intentional RED contract; its GREEN target is 13-08. Creating that module is out of scope for this plan, so tsc legitimately exits non-zero on that single error only.
- **Cloud stays deferred.** Recorded in the ledger with the P10/P11/P12 ordering dependency, plus an honesty flag noting the ledger's own 2026-06-23 "APPLIED TO CLOUD" entry appears to already cover P10/11/12 — a human should reconcile against a live `list_migrations` before pushing.

## Deviations from Plan

None - plan executed exactly as written. The `supabase db reset` applied cleanly on the first run (no seed or migration-ordering fixes needed), the regen was purely additive (no localized-cast repair required), and tsc surfaced only the pre-declared expected error.

## Issues Encountered

None. The one anticipated non-blocking condition — `tsc` exiting non-zero on the single expected 13-01 RED error — is by design (GREEN in 13-08) and does not affect this plan's gate.

## User Setup Required

None for this plan. The net-new cloud config (`RESEND_API_KEY` edge secret, two edge-function deploys, three migration pushes) is logged as deferred debt in `docs/deploy/cloud-migrations-pending.md` for a later, human-run cloud deploy — including the A1 Resend from-domain (`noreply@hello-sello.com`) confirmation and the A3 cloud UAT for the two admin-API paths that 403 locally.

## Next Phase Readiness

- The local stack now reflects the real Phase-13 schema, so downstream plans (13-08 settings actions GREEN, 13-09 notifications read, 13-11 welcome email) and phase verification can run against a live DB with regenerated types.
- Ready for the next plan in Phase 13.

## Self-Check: PASSED

- `src/types/database.types.ts` — FOUND (modified, contains `notification_preference`; committed in `23c6a94`)
- `docs/deploy/cloud-migrations-pending.md` — FOUND (Phase-13 section with `send-lifecycle-email` + `RESEND_API_KEY` + `account_lifecycle`; committed in `590ad2f`)
- `.planning/phases/13-settings-home-lifecycle-emails/13-07-SUMMARY.md` — FOUND (this file)
- Commit `23c6a94` — FOUND in git log
- Commit `590ad2f` — FOUND in git log
- All 3 SQL invariants exit 0; `db reset` clean; tsc shows only the expected 13-01 RED error; zero cloud commands run

---
*Phase: 13-settings-home-lifecycle-emails*
*Completed: 2026-07-06*
