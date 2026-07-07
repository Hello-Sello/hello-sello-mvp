---
phase: 13-settings-home-lifecycle-emails
plan: 11
subsystem: api
tags: [email, lifecycle, server-actions, next-after, supabase-edge, fire-and-forget, rls]

# Dependency graph
requires:
  - phase: 13-05
    provides: send-lifecycle-email edge fn + _shared/email/templates.ts (the send layer these actions invoke)
  - phase: 13-01
    provides: RED dispatch contract (src/app/settings/lifecycle-email.test.ts — shouldDispatch)
provides:
  - "SET-03 wiring: 7 lifecycle events dispatch their transactional email fire-and-forget via Next after(), post-ok, fail-soft"
  - "src/shared/email/dispatch.ts — shouldDispatch(rpcResult): the shared 'send iff the RPC returned ok' gate"
  - "Requester recipient resolution for join.approved/rejected via an RLS-scoped join_request read"
affects: [13-05, notification-preference-gating, SET-04]

# Tech tracking
tech-stack:
  added: []   # zero new packages — uses built-in next/server after()
  patterns:
    - "fail-soft after() dispatch: post-ok, non-blocking, try/catch-swallowed — a send failure can never fail or roll back the action"
    - "shouldDispatch: one centralised pure post-ok rule shared by all 7 event sites"
    - "RLS-scoped recipient read (jr_select) to resolve a requester person_id instead of guessing"

key-files:
  created:
    - src/shared/email/dispatch.ts
  modified:
    - src/app/admin/verifications/actions.ts
    - src/app/team/actions.ts
    - src/app/onboarding/actions.ts

key-decisions:
  - "Created src/shared/email/dispatch.ts (plan files_modified omitted it) because 13-01's test imports @/shared/email/dispatch; wired shouldDispatch as the post-ok gate at all 7 sites"
  - "membership.removed dispatches on remove_member RPC ok — independent of the best-effort token-revoke below — so the notification is not lost when the local session-kill 403s"
  - "join.approved/rejected resolve the requester person_id from an RLS-scoped join_request read (jr_select lets the target-company Superadmin read the row), never a guess"
  - "welcome is one-shot by construction — fired only inside createCompany's null→set company branch — so no welcome_sent_at column is needed (resolves Open-Q #1)"

patterns-established:
  - "Lifecycle email dispatch: after(async () => { try { supabase.functions.invoke('send-lifecycle-email', { body }) } catch {} }) placed strictly after the state-change RPC's ok guard"
  - "shouldDispatch(result) gates every dispatch site so the 'no email for a no-op/errored action' rule lives in one place"

requirements-completed: [SET-03]

# Metrics
duration: 12min
completed: 2026-07-06
---

# Phase 13 Plan 11: Lifecycle Email Dispatch Wiring Summary

**All 7 account-lifecycle events (verification.approved/rejected, join.requested/approved/rejected, welcome, membership.removed) now dispatch their transactional email fire-and-forget via Next 16 `after()` from the server action that causes each event — post-ok, non-blocking, and try/catch fail-soft — gated by a shared `shouldDispatch` rule that turns 13-01's dispatch contract GREEN.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-06T11:29Z (approx)
- **Completed:** 2026-07-06T11:40:36Z
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- Created `src/shared/email/dispatch.ts` exporting `shouldDispatch(rpcResult)` — the single, pure "send iff the RPC returned ok" rule — closing the plan's omission (13-01's test imports `@/shared/email/dispatch`). The 13-01 dispatch contract is now GREEN (whole `lifecycle-email.test.ts` passes, 3/3).
- Wired 7 fail-soft `after()` dispatch sites across the 3 existing action files, each strictly after the RPC's `if (error) return { error }` guard, each swallowed by try/catch — no action's `{ ok } | { error }` return contract changed and no `invoke` sits in a critical path.
- Resolved the join-decision recipient the plan flagged: `approveJoin`/`rejectJoin` read `requester_person_id` from the `join_request` row via RLS (`jr_select` lets the target-company Superadmin read it) rather than guessing.
- Kept the welcome one-shot by construction (only inside `createCompany`'s `if (!companyId)` first-creation branch) — no schema column added.

## Task Commits

1. **Task 1: dispatch verification + team-decision + removal events** — `eb85500` (feat) — `src/shared/email/dispatch.ts` (new) + `admin/verifications/actions.ts` (verification.approved/rejected) + `team/actions.ts` (join.approved/rejected, membership.removed)
2. **Task 2: dispatch join.requested + one-shot welcome** — `a6ec6dc` (feat) — `onboarding/actions.ts` (join.requested + welcome)

## Files Created/Modified
- `src/shared/email/dispatch.ts` — `shouldDispatch(rpcResult): boolean` — returns true iff `rpcResult.error == null`; the shared post-ok gate for all 7 dispatch sites.
- `src/app/admin/verifications/actions.ts` — `approveCompany` → `verification.approved { company_id }`; `rejectCompany` → `verification.rejected { company_id, reason: note }`.
- `src/app/team/actions.ts` — `approveJoin` → `join.approved { person_id }`; `rejectJoin` → `join.rejected { person_id, reason }`; `removeMember` → `membership.removed { person_id }`. Added an RLS-scoped `join_request` read to resolve the requester for the two join decisions.
- `src/app/onboarding/actions.ts` — `requestToJoin` → `join.requested { company_id }`; `createCompany` → one-shot `welcome { person_id, company_id }` on the null→set company transition.

## Decisions Made
- **`shouldDispatch` created + wired as the gate (scope note).** The plan's `files_modified` did not list `src/shared/email/dispatch.ts`, but 13-01's test statically depends on it and it centralises the "post-ok only" rule (Pitfall 4). Created it and used it to gate every dispatch, so the rule is expressed once and greps uniformly.
- **`membership.removed` fires on the RPC ok, not after the token-revoke.** `removeMember` also does a best-effort `revokeUserSessions` that 403s on the local stack; gating the email on it would drop the notification for a member who was genuinely removed. The dispatch sits right after the `remove_member` ok guard (the interfaces-table contract: "rpc('remove_member') ok"), so it fires whenever the membership was actually removed.
- **Recipient resolution for join decisions via RLS, not a guess.** `jr_select` (rls_policies.sql:239) permits `target_company_id = current_company_id()`, so the deciding Superadmin can read the request row directly; the read runs before the decision and captures `requester_person_id` for the post-ok dispatch.
- **Welcome one-shot without new schema (Open-Q #1).** Fired only inside the `if (!companyId)` branch; any retry finds a company and short-circuits, so exactly one welcome per person.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking / plan omission] Created and wired `src/shared/email/dispatch.ts`**
- **Found during:** Task 1 (pre-flight — 13-01's RED test imports `@/shared/email/dispatch`, which the plan's `files_modified` did not list)
- **Issue:** The dispatch contract could not go GREEN and there was no shared post-ok gate for the 7 sites.
- **Fix:** Authored `dispatch.ts` exporting `shouldDispatch(rpcResult)` (dispatch iff no RPC error) and gated every `after()` dispatch with it.
- **Files modified:** `src/shared/email/dispatch.ts` (created), all 3 action files (import + gate)
- **Verification:** `npm run test:unit -- lifecycle-email` → 3/3 pass; `grep` confirms `shouldDispatch` at every site.
- **Committed in:** `eb85500` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking / plan omission — pre-flagged in the plan's gap note).
**Impact on plan:** Necessary to turn 13-01 GREEN and to centralise the post-ok rule. No scope creep — additive only; no return contract changed.

## Issues Encountered
None during planned work. One out-of-scope discovery (below).

## Out-of-Scope Discoveries (not fixed — scope boundary)
- **Pre-existing `tsc` + unit "Test Files" failure in a sibling SET-01/02 file.** `src/app/settings/security/actions.test.ts:32` fails `TS2307 Cannot find module '@/app/settings/security/actions'` — a RED test that ships ahead of its implementation (that action module is absent; a different Settings plan owns it). 13-11 touched none of those files. Logged to `deferred-items.md`. `npx tsc --noEmit` is clean for all four files 13-11 authored/edited, and the full unit suite is `114 passed (114)` tests (only that one file fails to load).

## Known Stubs
None. All 4 files are complete and wired; no placeholder/TODO/empty-data patterns introduced.

## Threat Flags
None. The plan's STRIDE register is fully mitigated by this wiring: `after()` post-response + try/catch (T-13-11-D DoS — send can never stall/roll back the action); dispatch strictly after the RPC ok, the RPC pending-guard blocks raced double-decisions (T-13-11-S spoofing); actions pass only IDs, recipient resolved server-side in the edge fn (T-13-11-I disclosure); zero new packages, built-in `next/server` (T-13-SC tampering). No new endpoints, auth paths, or trust-boundary surface introduced.

## Verification Results
- `npm run test:unit -- lifecycle-email` → **3/3 pass** (dispatch block GREEN; whole file passes).
- Full unit suite → **114 passed (114)**; the only failing Test File is the pre-existing sibling RED (out of scope).
- `npx tsc --noEmit` → clean for the four 13-11 files; the single reported error is the pre-existing `settings/security` sibling module-not-found.
- 7 distinct `event: '…'` strings, 7 `send-lifecycle-email` invokes, 7 `after(async` blocks — one per lifecycle event, each try/catch-wrapped. No file deletions in either commit.

## Next Phase Readiness
- SET-03 dispatch layer is complete and connected to 13-05's send layer. Live end-to-end email delivery still depends on the edge fn's deploy + `RESEND_API_KEY` (13-05 / cloud UAT), tracked outside this plan.
- No blockers introduced for downstream Settings/notification-preference (SET-04) work.

## Self-Check: PASSED
- `src/shared/email/dispatch.ts` — FOUND on disk.
- Commits `eb85500` (Task 1) and `a6ec6dc` (Task 2) — both present in `git log`.
- Acceptance criteria (grep counts ≥ thresholds, lifecycle-email test GREEN, tsc clean for edited files) — all re-run and passing.

---
*Phase: 13-settings-home-lifecycle-emails*
*Completed: 2026-07-06*
