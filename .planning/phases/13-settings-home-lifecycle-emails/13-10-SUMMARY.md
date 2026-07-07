---
phase: 13-settings-home-lifecycle-emails
plan: 10
subsystem: ui
tags: [settings, rbac, organization, superadmin, company-lifecycle, react, next, glassmorphic]

# Dependency graph
requires:
  - phase: 13-08
    provides: deactivateCompany action + reactivate_company RPC + ActionResult shape (settings/security/actions.ts)
  - phase: 13-09
    provides: the /settings shell + sidebar (SettingsNav Organization group) + the /team → /settings/organization/team 301
  - phase: 13-06
    provides: signed-off settings prototype/layout
provides:
  - Superadmin-gated /settings/organization subtree (server-door layout gate, fail-closed)
  - Re-homed company-profile edit (/settings/organization/profile) — reused BrandingEditForm/saveCompanyProfile
  - Re-homed team + pending-join-requests (/settings/organization/team) — reused TeamClient/team-actions
  - Thin Organization Security tab (/settings/organization/security) — reversible company-deactivate + reactivate
  - Retired the old /team route (deleted page.tsx behind its 301) — one gated home, no competing surface
affects: [phase-8-capstone, settings-IA, org-vs-user-split]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server-door layout gate: organization/layout.tsx runs has_permission('team.manage') fail-closed (any RPC error / !== true → NotAuthorized card) as defense-in-depth over the matrix RPC"
    - "Dumb + fed client panel: the server page passes deactivate/reactivate server actions as props to the client panel (composition root wires actions; panel stays presentational)"
    - "Re-home (moved, not rebuilt): reuse TeamClient + BrandingEditForm + existing actions verbatim under a new route"

key-files:
  created:
    - src/app/settings/organization/layout.tsx
    - src/app/settings/organization/profile/page.tsx
    - src/app/settings/organization/profile/CompanyProfileForm.tsx
    - src/app/settings/organization/team/page.tsx
    - src/app/settings/organization/security/page.tsx
    - src/app/settings/organization/security/CompanyDeactivatePanel.tsx
  modified:
    - src/app/settings/security/actions.ts

key-decisions:
  - "Gate lives in organization/layout.tsx (server door, B7 lock — NOT the proxy); child pages don't re-check, the layout + the RPCs re-assert"
  - "Render the NotAuthorized card (not a redirect) on a failed gate — keeps a Member inside the settings shell, mirrors team/page.tsx copy"
  - "Pass server actions as props to the client panel (dumb + fed) — satisfies the plan key_link (page.tsx imports deactivateCompany) and keeps the panel presentational"
  - "Added a reactivateCompany action wrapper over the existing reactivate_company RPC (D-12 reversibility needed a reactivate control; only deactivateCompany existed)"

patterns-established:
  - "Fail-closed RBAC layout gate for a whole route subtree"
  - "Companion client component beside a server page when a reused/interactive child needs a client boundary"

requirements-completed: [SET-01]

# Metrics
duration: 16 min
completed: 2026-07-06
---

# Phase 13 Plan 10: Superadmin-gated Organization Settings Subtree Summary

**A fail-closed `has_permission('team.manage')` server door on `/settings/organization/*` that re-homes the company-profile edit + the team/join-requests surface (moved, not rebuilt) and hosts a thin reversible company-deactivate tab — retiring the old `/team` route behind its 301.**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-07-06T13:06:00Z (approx)
- **Completed:** 2026-07-06T13:22:00Z (approx)
- **Tasks:** 2
- **Files:** 6 created, 1 modified, 1 deleted

## Accomplishments
- **Org subtree gate (defense-in-depth):** `organization/layout.tsx` runs the same `has_permission('team.manage')` boolean-RPC gate as the old `team/page.tsx`, fail-closed (any RPC error or non-`true` → a server-rendered `NotAuthorized` card). A Member never sees org data — the gate runs before any child page loads. The matrix RPC stays the real boundary; this is the belt.
- **Company-profile re-home:** `organization/profile/page.tsx` loads the caller's company and hands it to a thin client wrapper over the reused `BrandingEditForm` (which writes through the same `saveCompanyProfile` writer — D-09, one form/one writer, no drift). `AccountClient.tsx` untouched.
- **Team re-home:** `organization/team/page.tsx` reuses `TeamClient` + the existing `team/actions.ts` reads verbatim (moved, not rebuilt). `team/actions.ts` (carrying 13-11's email dispatch) untouched.
- **Old /team retired:** deleted `src/app/team/page.tsx`; `TeamClient.tsx` + `team/actions.ts` + `actions.test.ts` remain. The `/team → /settings/organization/team` 301 (13-09) intercepts the path, so no competing surface exists.
- **Thin Org Security tab:** `organization/security/page.tsx` reads the live `company.deactivated_at` flag and wires `deactivateCompany` / `reactivateCompany` into a dumb-and-fed `CompanyDeactivatePanel` — explicit confirm modal, inline `{ error }` (incl. the forbidden mapping), reversible/no-hard-delete microcopy (D-12), and a reactivate control when already deactivated. No MFA/SSO/matrix (D-06).

## Task Commits

1. **Task 1: org layout gate + company-profile re-home + team re-home + retire /team** — `1b42d0b` (feat)
2. **Task 2: thin org security tab (reversible company-deactivate)** — `ed0aa3c` (feat)

## Files Created/Modified
- `src/app/settings/organization/layout.tsx` (created) — the Superadmin server-door for the whole subtree; fail-closed `has_permission('team.manage')` → `NotAuthorized` card.
- `src/app/settings/organization/profile/page.tsx` (created) — server route loading the company for the re-homed profile edit.
- `src/app/settings/organization/profile/CompanyProfileForm.tsx` (created) — thin client wrapper (VerifiedBadge + reused `BrandingEditForm`, no-op `onDirty`).
- `src/app/settings/organization/team/page.tsx` (created) — re-homed team + pending-join-requests (reuses `TeamClient`), gate lives in the layout.
- `src/app/settings/organization/security/page.tsx` (created) — composition root; reads `deactivated_at`, wires the two lifecycle actions into the panel.
- `src/app/settings/organization/security/CompanyDeactivatePanel.tsx` (created) — client confirm/reactivate UI (dumb + fed; confirm modal + inline error).
- `src/app/settings/security/actions.ts` (modified) — added the `reactivateCompany` wrapper over the existing `reactivate_company` RPC (mirrors `deactivateCompany`).
- `src/app/team/page.tsx` (deleted) — old standalone team route retired behind its 301.

## Decisions Made
- **Gate in the layout, render a card on failure.** The subtree is protected once at `organization/layout.tsx` (server door, not the proxy — B7 lock). On a failed/erroring gate it renders the `NotAuthorized` card (copied from `team/page.tsx`) rather than redirecting, so a Member who follows a sidebar link stays oriented inside the settings shell. Child pages don't re-gate; the layout + the RPCs re-assert.
- **Server actions passed as props (dumb + fed).** `security/page.tsx` imports `deactivateCompany`/`reactivateCompany` and passes them to `CompanyDeactivatePanel`. This makes the page the composition root (matches the plan's `key_link`: page.tsx imports `deactivateCompany`) and keeps the panel a pure presentational client component.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added the `reactivateCompany` action wrapper**
- **Found during:** Task 2 (org security tab)
- **Issue:** The plan requires a "reactivate control if already deactivated" and D-12 mandates the company-deactivate be reversible, but only `deactivateCompany` existed in `settings/security/actions.ts`. The underlying `reactivate_company` RPC already existed in the DB (`database.types.ts`), so only the thin action wrapper was missing.
- **Fix:** Added `reactivateCompany` next to `deactivateCompany` (the DRY home — beside `reactivateAccount`), mirroring it exactly: localized RPC cast, forbidden→friendly mapping, revalidate both `/settings/security` and `/settings/organization/security`.
- **Files modified:** src/app/settings/security/actions.ts
- **Verification:** `npx tsc --noEmit` clean; full unit suite 116/116 green; wired into the panel's reactivate control.
- **Committed in:** ed0aa3c (Task 2 commit)

**2. [Rule 3 - Structural] Two companion client components not itemized in the plan's `<files>`**
- **Found during:** Tasks 1 & 2
- **Issue:** `CompanyProfileForm.tsx` and `CompanyDeactivatePanel.tsx` are not in the plan's `<files>` lists, but they are required: the reused `BrandingEditForm` needs a client parent to receive its required `onDirty` function prop, and the deactivate confirm/reactivate UI is interactive — both need a client boundary while their route pages must stay server components to read data.
- **Fix:** Co-located each as a thin client component beside its server page (the established `settings/profile → ProfileForm` and `settings/security → SecurityClient` pattern).
- **Files modified:** src/app/settings/organization/profile/CompanyProfileForm.tsx, src/app/settings/organization/security/CompanyDeactivatePanel.tsx
- **Verification:** `npx tsc --noEmit` clean; both acceptance greps pass.
- **Committed in:** 1b42d0b (profile) / ed0aa3c (security)

---

**Total deviations:** 2 auto-fixed (1 missing-critical, 1 structural). **Impact:** No scope creep — deviation 1 completes the D-12 reversibility the plan asked for; deviation 2 is the required Next.js server/client composition. `team/actions.ts` and `AccountClient.tsx` were NOT edited (confirmed via diff).

## Known Stubs
None — the Security tab wires the real `deactivateCompany`/`reactivateCompany` actions and reads the live `company.deactivated_at` flag; the profile + team surfaces reuse fully-wired forms/actions.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required (no new packages, no new env vars; the `reactivate_company` RPC already exists in the schema).

## Next Phase Readiness
- Phase 13 SET-01 org subtree is complete: the org-vs-user split now has one Superadmin-gated home with no competing surfaces.
- **Cloud caveat (unchanged from the phase ledger):** the SET-02 company-lifecycle RPCs (`deactivate_company` / `reactivate_company`) and their migrations remain part of the pending cloud deploy — the UI is proven locally against the committed schema (`docs/deploy/cloud-migrations-pending.md`).
- STATE.md / ROADMAP.md intentionally NOT updated by this executor (per the run objective — the orchestrator owns central state).

## Verification
- `npx tsc --noEmit`: 0 errors (was 0 at baseline).
- `npm run test:unit`: 17 files / 116 tests passed.
- Task 1 automated verify: layout has `has_permission`; team/profile pages exist; `team/page.tsx` deleted — PASS.
- Task 2 automated verify: security page exists, contains `deactivateCompany` + `reversible|deactivate` — PASS.

## Self-Check: PASSED
- All 6 created files exist on disk; `src/app/team/page.tsx` retired.
- Both task commits found in git log (`1b42d0b`, `ed0aa3c`).
- `team/actions.ts` + `AccountClient.tsx` confirmed unedited via `git diff`.

---
*Phase: 13-settings-home-lifecycle-emails*
*Completed: 2026-07-06*
