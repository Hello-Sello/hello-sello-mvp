---
phase: 13-settings-home-lifecycle-emails
plan: 01
subsystem: testing
tags: [vitest, red-contract, tdd, nyquist, server-actions, email-templates]

# Dependency graph
requires:
  - phase: 12-path-b-join-existing-company
    provides: "vitest server-only shim + team/actions.test.ts RED-contract shape (12-01)"
provides:
  - "RED unit contract pinning the SET-02 lifecycle-action validation shape (deactivate / requestDeletion / cancel / verifyPassword / deactivateCompany)"
  - "RED unit contract pinning the SET-03 pure-template (renderTemplate) + dispatch-decision (shouldDispatch) contracts"
  - "13-VALIDATION.md filled: test infra + per-task verification map for 13-01..13-11 (nyquist_compliant, wave_0_complete)"
affects: [13-05, 13-08, 13-11, verify-work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave-0 RED contract via missing-module import (10-01 <VerifiedBadge> mechanism)"
    - "Two-contract test file decoupled by a lazy import so each downstream plan greens its block independently"

key-files:
  created:
    - src/app/settings/security/actions.test.ts
    - src/app/settings/lifecycle-email.test.ts
  modified:
    - .planning/phases/13-settings-home-lifecycle-emails/13-VALIDATION.md

key-decisions:
  - "shouldDispatch pinned at @/shared/email/dispatch (Next-side, pure predicate: dispatch iff RPC ok) — a DRY home for the 'no email on error' rule shared by all 7 event sites"
  - "renderTemplate import is static top-level (RED-now for module-not-found); shouldDispatch import is lazy so 13-05 greens the template block without waiting on 13-11"

patterns-established:
  - "Decoupled two-contract RED file: static import governs file-load RED; lazy import isolates the second contract's red→green"

requirements-completed: [SET-02, SET-03]  # contracts PINNED (not implemented); completion lands in 13-08 / 13-05 / 13-11

# Metrics
duration: ~18 min
completed: 2026-07-06
---

# Phase 13 Plan 01: Wave-0 RED Contracts (Settings Lifecycle + Emails) Summary

**Two failing vitest contracts that pin the SET-02 lifecycle-action validation shape and the SET-03 renderTemplate + shouldDispatch contracts before their modules exist, plus a filled per-plan validation map — the phase's Nyquist gate.**

## Performance

- **Duration:** ~18 min
- **Started:** ~2026-07-06T12:43Z (local +02:00)
- **Completed:** ~2026-07-06T13:01Z (local +02:00)
- **Tasks:** 2 (both `type=auto`)
- **Files modified:** 3 (2 test files created, 1 validation map filled)

## Accomplishments

- **Task 1 — SET-02 RED contract** (`src/app/settings/security/actions.test.ts`): imports `* as security from '@/app/settings/security/actions'` (absent) and asserts `requestAccountDeletion('')` and `verifyPassword('')` return `{ error }` with no throw. Typed shape documents all five lifecycle actions. RED for module-not-found; GREEN target for **13-08**. Mirrors `team/actions.test.ts`.
- **Task 2 — SET-03 RED contract** (`src/app/settings/lifecycle-email.test.ts`): two describe blocks —
  - *pure template* — `renderTemplate('verification.approved', {})` → non-empty `{subject, html}` with **exactly one** `<a ` CTA (D-17); GREEN target for **13-05**.
  - *dispatch decision* — `shouldDispatch({error:null})===true`, `shouldDispatch({error:{...}})===false` (no email on a no-op/errored RPC, Pitfall 4); GREEN target for **13-11**.
- **13-VALIDATION.md filled**: test infrastructure (vitest 4.1.9 unit + Playwright e2e + `psql` SQL invariants), sampling rate, a per-task verification map covering every plan **13-01..13-11** (requirement, threat ref, command), and `nyquist_compliant: true` + `wave_0_complete: true`.

## Task Commits

1. **Task 1: SET-02 RED validation contract** — `5452628` (test)
2. **Task 2: SET-03 RED contract + validation map** — `253047a` (test)

**Plan metadata:** this SUMMARY commit (docs).

## Files Created/Modified

- `src/app/settings/security/actions.test.ts` — RED validation contract for the 5 SET-02 lifecycle server actions.
- `src/app/settings/lifecycle-email.test.ts` — RED template + dispatch contracts for SET-03.
- `.planning/phases/13-settings-home-lifecycle-emails/13-VALIDATION.md` — filled validation strategy + per-plan map.

## RED Verification

Both suites confirmed RED for the intended **module-not-found** reason (not config errors), verified against the implementation-absent state:

- `npm run test:unit -- settings/security/actions` → `Cannot find package '@/app/settings/security/actions'` → `1 failed / no tests`.
- `npm run test:unit -- lifecycle-email` → `Cannot find module '../../../supabase/functions/_shared/email/templates'`.
- Full suite: `Test Files 2 failed | 15 passed (17)`, `Tests 111 passed (111)` — only my two intentional wave-0 contracts fail; nothing pre-existing broke.

## Decisions Made

- **`shouldDispatch` lives at `@/shared/email/dispatch`** (a pure Next-side predicate `dispatch iff RPC.error == null`). Centralising the "send only after ok, never on error" rule in one testable place beats repeating `if (error) return; after(...)` across all 7 event sites (DRY; Pitfall 4). Its exact path is a contract 13-11 implements against, exactly as `renderTemplate`'s path is 13-05's.
- **Decoupled two-contract file:** `renderTemplate` is a static top-level import (so the file is RED-now for module-not-found) while `shouldDispatch` is a lazy `await import()` inside its own test — so once 13-05 lands `templates.ts`, the template block greens independently of 13-11.

## Deviations from Plan

None to the plan's task instructions — both RED contracts were authored and verified exactly as written, and no implementation modules were created. Two **environmental** anomalies (outside plan scope, not code deviations) were handled and are documented under Issues Encountered.

## Issues Encountered

**1. Background `agentation` auto-implemented and auto-committed other plans onto this branch.**
The repo's `agentation` devDependency (a code-generator) ran concurrently in this worktree and **committed the rest of Phase 13's implementation onto my branch**, interleaved with my commits. Branch log since base `c66aaa6`:

```
60ae0d0 feat(13-05): send-lifecycle-email edge function      (agentation, after mine)
325b235 test(13-02): impersonated-SQL invariants             (agentation, after mine)
b86d628 feat(13-02): lifecycle columns + RPCs + audit codes   (agentation, after mine)
253047a test(13-01): SET-03 RED contract + validation map     (MINE — Task 2)
5452628 test(13-01): SET-02 RED validation contract           (MINE — Task 1)
78e1853 prototype(13-06): settings home mock                  (agentation, before mine)
777d6df feat(13-05): pure lifecycle email templates + Resend  (agentation, before mine)
```

- **Impact on RED integrity:** because `777d6df` pre-committed `supabase/functions/_shared/email/templates.ts` (tracked), the **live branch tree resolves `renderTemplate`** — so against the checked-out branch the SET-03 *template* block is GREEN, not RED. I verified the intended RED (module-not-found) by moving the pre-generated module aside during verification; the working tree was later reconciled by agentation and now matches HEAD. Task 1 (SET-02 actions) and the SET-03 *dispatch* block remain genuinely RED (their modules are still absent).
- **Handling:** I did **not** create, stage, commit, revert, or rewind any agentation file/commit — every one of my commits (`5452628`, `253047a`, this SUMMARY) contains **only my own files**, verified via `git show --stat`. Rewinding history to strip the foreign commits is prohibited (destroys concurrent work) and was not attempted.
- **⚠️ For the orchestrator / verifier:** this branch contains commits **beyond 13-01's scope** (13-02, 13-05, 13-06 implementation). The wave-0 "both suites RED" invariant holds only against the implementation-absent state. Reconcile branch ownership before merging waves, and do not treat the branch's partially-GREEN state as a 13-01 defect.

**2. `rtk` git proxy fabricated `git status` output.**
The user's global `rtk` hook (which rewrites `git …` → `rtk git …`) returned a **fabricated** status (invented `A ` staged entries and nonexistent `prototypes/settings-prototype/*` paths) and its `git add` did not stage. I routed **all** git operations through `rtk proxy git …` (raw, unfiltered) and cross-checked staging with `git diff --cached` before every commit, so each commit contains exactly the intended files.

---

**Total deviations:** 0 plan-instruction deviations. 2 environmental anomalies handled (agentation branch contamination; rtk status fabrication). **Impact:** my deliverables are correct and scope-clean; no scope creep.

## Known Stubs

None — the deliverables are failing tests (intended RED) and a validation map, not runtime stubs.

## Threat Flags

None new. Per the plan's register: `T-13-01-I` (accept — tests assert `{ error }` shape only, no real credentials) and `T-13-SC` (mitigate — **zero** new npm/Deno packages added this plan) are both honored.

## Next Phase Readiness

- **13-05** turns the SET-03 template block GREEN (`renderTemplate` → `{subject, html}`, one CTA).
- **13-08** turns Task 1 GREEN (`settings/security/actions.ts` validation contract).
- **13-11** turns the SET-03 dispatch block GREEN (exports `shouldDispatch` at `@/shared/email/dispatch`, wires `after()` dispatch into the 7 event sites).
- **Blocker for the orchestrator:** reconcile the foreign 13-02/13-05/13-06 commits that `agentation` placed on this branch before the wave merge (see Issues Encountered #1).

## Self-Check: PASSED

- `src/app/settings/security/actions.test.ts` — FOUND
- `src/app/settings/lifecycle-email.test.ts` — FOUND
- `.planning/phases/13-settings-home-lifecycle-emails/13-VALIDATION.md` — FOUND
- Commit `5452628` (Task 1) — FOUND (ancestor of HEAD)
- Commit `253047a` (Task 2) — FOUND (ancestor of HEAD)

---
*Phase: 13-settings-home-lifecycle-emails*
*Completed: 2026-07-06*
