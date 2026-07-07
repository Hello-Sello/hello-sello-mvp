---
phase: 13-settings-home-lifecycle-emails
plan: 08
subsystem: auth
tags: [settings, account-lifecycle, oauth-identities, gdpr, supabase, next, server-actions]

# Dependency graph
requires:
  - phase: 13-01
    provides: RED validation contract (settings/security/actions.test.ts)
  - phase: 13-02
    provides: SECURITY DEFINER lifecycle RPCs (deactivate/reactivate/request-delete/cancel account + deactivate/reactivate company) + person/company timestamp columns
  - phase: 13-07
    provides: RPCs applied to local DB + database.types.ts regenerated
  - phase: 13-06
    provides: signed-off Login-&-security prototype (build contract)
  - phase: 13-09
    provides: /settings shell (layout.tsx + SettingsNav) this page renders inside
provides:
  - "settings/security/actions.ts — 7 { ok } | { error } lifecycle/password/identity actions over the 13-02 definer RPCs"
  - "settings/security/page.tsx + SecurityClient.tsx — the Login & security surface (change-password, linked-OAuth unlink, email row, password-gated danger zone)"
  - "deactivateCompany() — imported by the 13-10 org security page"
  - "reactivateAccount() — for the capstone sign-in reactivation interstitial (Open-Q #3)"
affects: [13-10, 13-08-capstone, settings, account-lifecycle]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Settings sub-route = thin async server route (loads data) → client component owns interactivity (extends 13-09 profile/page.tsx → ProfileForm.tsx)"
    - "Self-serve lifecycle action = { ok } | { error } over a 13-02 definer RPC, never throws, friendly RAISE→copy mapping (mirrors team/actions.ts)"
    - "Password re-verify on an isolated standalone supabase-js client (persistSession:false) so the caller's live session is provably untouched (RESEARCH A2)"

key-files:
  created:
    - src/app/settings/security/actions.ts
    - src/app/settings/security/page.tsx
    - src/app/settings/security/SecurityClient.tsx
  modified: []

key-decisions:
  - "verifyPassword runs signInWithPassword on a THROWAWAY standalone client (raw @supabase/supabase-js, persistSession:false, no cookie adapter) — it shares no storage with the cookie-backed request client, so the live session cannot rotate. A2 resolved by construction; no reauthenticate() fallback needed."
  - "Kept the localized RPC cast even though 13-07 regenerated the types — plan mandate + uniform with team/actions.ts; the RPC stays the real boundary."
  - "Server/client split (page.tsx + SecurityClient.tsx) — a thin server route can't host onClick/useState; matches the account/page.tsx pattern the plan cites and 13-09's ProfileForm precedent."
  - "changePassword() is a non-redirecting, OAuth-safe wrapper (New+Confirm only, no current-password gate) so signed-in users aren't bounced to /login and OAuth-only users can ADD a backup password."
  - "Sole-Superadmin lockout is surfaced as an INLINE error returned by the RPC (no pre-emptive membership query) — the definer RPC is the boundary, the UI just renders its RAISE."
  - "Session revoke after deactivate/delete is best-effort; the sb_secret_ admin logout 403s on the local stack — correct code, flagged for cloud UAT (T-13-08-S2 / RESEARCH A3)."

patterns-established:
  - "Thin settings server route + client component split for interactive sub-routes"
  - "Lifecycle server actions over definer RPCs with never-throw + friendly-copy discipline"

requirements-completed: [SET-01, SET-02]

# Metrics
duration: 35 min
completed: 2026-07-06
---

# Phase 13 Plan 08: Login & Security page + SET-02 lifecycle actions Summary

**The /settings/security surface (change-password, linked-OAuth unlink guarded against lockout, password-gated reversible-deactivate / GDPR-delete) plus 7 `{ ok } | { error }` server actions wrapping the 13-02 SECURITY DEFINER RPCs — turning 13-01's RED contract GREEN with zero direct `person` writes (DEV-88).**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-06T12:28:00Z
- **Completed:** 2026-07-06T13:03:52Z
- **Tasks:** 2
- **Files created:** 3 (actions.ts, page.tsx, SecurityClient.tsx)

## Accomplishments

- **7 lifecycle/password/identity actions** (`settings/security/actions.ts`): `verifyPassword`, `changePassword`, `requestAccountDeletion`, `cancelAccountDeletion`, `deactivateAccount`, `reactivateAccount`, `deactivateCompany`, `unlinkIdentity` — every privileged write routes through a 13-02 definer RPC (scoped `id = auth.uid()`); **no direct `person` UPDATE anywhere** (verified: `from('person')` count = 0).
- **13-01's RED contract is GREEN** — `requestAccountDeletion('')` and `verifyPassword('')` reject with `{ error }` before any RPC/auth call, no throw. Full unit suite 116/116 green; `tsc --noEmit` = 0 errors.
- **Password re-verify without session disturbance** — `verifyPassword` signs in on an isolated standalone client (`persistSession:false`, no cookie adapter), so the caller's live session provably cannot rotate (A2 resolved by construction).
- **Lockout-safe identity management** — `unlinkIdentity` refuses to remove the last remaining sign-in method (T-13-08-D); the page disables Unlink + shows an explanatory note when only one identity is linked.
- **Login & security page** — change-password (OAuth-safe set/replace), linked accounts (Google/Outlook/email with guarded Unlink), replicated change-email row over the existing `changeEmail` action, and a danger zone with a **password-gated Delete** (30-day-grace microcopy, inline sole-Superadmin error), **reversible Deactivate**, and a **conditional Cancel-deletion** card when a deletion runway is already open. Explicit edit/save affordances + Aurora/glass theme.

## Task Commits

1. **Task 1: settings/security/actions.ts (SET-02 lifecycle + password + identity actions)** — `951ffc1` (feat)
2. **Task 2: settings/security/page.tsx + SecurityClient.tsx (Login & security surface)** — `ef2f031` (feat, also extends actions.ts with `changePassword`)

_(Task 1 is `tdd="true"`; 13-01 pre-committed the RED test, so Task 1 is the GREEN implementation commit.)_

## Files Created/Modified

- `src/app/settings/security/actions.ts` — 8 exported server actions over the 13-02 RPCs + the copied `revokeUserSessions` (admin `logout?scope=global`). Localized RPC cast; never throws; friendly RAISE mapping (`promote another Superadmin` → "Promote another Superadmin first"; `forbidden` → company-Superadmin copy).
- `src/app/settings/security/page.tsx` — thin async server route: loads email/pending-email, linked identities (`auth.getUserIdentities()`), and `deletion_scheduled_for`, then renders `SecurityClient`.
- `src/app/settings/security/SecurityClient.tsx` — the interactive surface (Password, Linked accounts, Email, Danger zone cards + Deactivate/Delete modals).

## Decisions Made

See `key-decisions` frontmatter. Load-bearing ones: isolated-client password verify (A2, no session rotation); localized RPC cast retained despite regenerated types (plan mandate); server/client split per account/page.tsx; sole-Superadmin lockout surfaced as an inline RPC error rather than a pre-emptive query; best-effort session revoke flagged for cloud UAT.

## Deviations from Plan

### Auto-fixed / structural

**1. [Rule 2 - Missing Critical] Added a non-redirecting `changePassword()` wrapper**
- **Found during:** Task 2 (change-password card)
- **Issue:** Reusing reset-password's `setNewPassword` verbatim (the plan's first option) redirects to `/login?reset=ok` — wrong for a signed-in user (bounces them out) and it also can't express the OAuth-only "set a backup password" flow the surface's hint copy promises.
- **Fix:** Added `changePassword(newPassword)` to `actions.ts` — a thin `supabase.auth.updateUser({ password })` wrapper returning `{ ok } | { error }`, no redirect, no current-password requirement. The plan's Task 1 `<action>` explicitly contemplated this ("if a wrapper is cleaner, add `changePassword`").
- **Files modified:** src/app/settings/security/actions.ts
- **Verification:** tsc clean; card shows inline "Password updated"; works for both email and OAuth-only users.
- **Committed in:** ef2f031

**2. [Rule 3 - Structural] Split the page into page.tsx (server) + SecurityClient.tsx (client)**
- **Found during:** Task 2
- **Issue:** The plan's `<files>` lists only `page.tsx`, but the same `<action>` mandates a "thin server route, per account/page.tsx" — and a thin async server route cannot host the required `useState`/`onClick` interactivity (change-password, unlink, modals). account/page.tsx and 13-09's profile/page.tsx both delegate to a client component.
- **Fix:** Kept `page.tsx` thin (data load only) and added `SecurityClient.tsx` for interactivity — exactly the 13-09 `ProfileForm.tsx` precedent.
- **Note on the literal `<verify>` grep:** the plan's automated check greps `page.tsx` for `requestAccountDeletion|deactivateAccount` + `password`; those live in `SecurityClient.tsx` per this split. All **binding `<acceptance_criteria>`** pass across the two files (four cards render, password-gated Delete before `requestAccountDeletion`, inline errors, tsc clean, gated route). Verified with a grep across both files.
- **Files modified:** src/app/settings/security/page.tsx (new), src/app/settings/security/SecurityClient.tsx (new)
- **Committed in:** ef2f031

**3. [Rule 1 - Correctness] Change-password form uses New + Confirm (dropped the prototype's Current-password field)**
- **Found during:** Task 2
- **Issue:** The prototype shows Current / New / Confirm, but `supabase.auth.updateUser({ password })` ignores the current password (the live session authorizes it) — collecting it would be security theatre, and *requiring* it would break the OAuth-only "set a backup password" path the hint copy promises.
- **Fix:** New + Confirm fields with client-side min-8 + match validation; no current-password field.
- **Files modified:** src/app/settings/security/SecurityClient.tsx
- **Verification:** tsc clean; both email and OAuth-only users can set a password.
- **Committed in:** ef2f031

---

**Total deviations:** 3 (1 missing-critical wrapper, 1 structural split, 1 correctness). **Impact:** all serve correctness / house-pattern consistency; no scope creep. Binding acceptance criteria fully met.

## Issues Encountered

None blocking. The session-revoke path (`admin/users/{id}/logout?scope=global`) 403s on the local stack because the `sb_secret_` key can't call the HS256-signed local GoTrue admin API — a known fixture limitation (documented in team/actions.ts). It is best-effort (the state change already committed in the RPC) and is flagged for cloud UAT, not a defect.

## Scope Notes (deferred by design)

- **Reactivation interstitial (Open-Q #3):** the sign-in-time "your account is deactivated — reactivate?" gate is a follow-on capstone screen in the auth layer, not this settings page. `reactivateAccount()` is exported and ready for it. The "deletion scheduled → Cancel deletion" case IS covered here.
- **Link a new OAuth identity:** the surface lists + unlinks identities (per plan scope); adding a new provider (an OAuth redirect flow via `auth.linkIdentity()`) is out of this plan's scope.

## Cloud-UAT Caveat (carry forward)

The deactivate/delete **session revoke** must be verified on cloud (the local `sb_secret_` admin-API 403 blocks it locally) — same established mechanism as the Phase-11 team token-revoke. Add to the SET-02 cloud-UAT checklist.

## Next Phase Readiness

- **13-10** can import `deactivateCompany` from `settings/security/actions.ts` for the org security page (friendly forbidden mapping already in place; the page revalidates `/settings/organization/security`).
- The capstone reactivation interstitial has `reactivateAccount()` ready to wire.
- No new packages, no schema changes (the 13-02 migration + 13-07 type regen are the DB dependency; both already landed).

## Self-Check: PASSED

- Created files verified on disk: `actions.ts`, `page.tsx`, `SecurityClient.tsx`, `13-08-SUMMARY.md` — all FOUND.
- Task commits verified in git log: `951ffc1` (Task 1), `ef2f031` (Task 2) — both FOUND.
- Gates re-run: `npm run test:unit` 116/116 green (incl. 13-01 contract 2/2); `npx tsc --noEmit` 0 errors; no direct `person` UPDATE (`from('person')` count = 0); all lifecycle writes via `rpc(`.

---
*Phase: 13-settings-home-lifecycle-emails*
*Completed: 2026-07-06*
