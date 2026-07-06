---
phase: 13-settings-home-lifecycle-emails
plan: 09
subsystem: ui
tags: [settings, next-redirects, rsc, profile, notifications, qrcode]

requires:
  - phase: 13-07
    provides: regenerated notification_* database types (read by the notifications section)
  - phase: 13-06
    provides: the signed-off settings sidebar prototype (build contract)
  - phase: 10-account-quick-wins
    provides: getMyProfile / saveMyProfile / AvatarUpload / getAccountCard (reused, not rebuilt)
provides:
  - The persistent /settings shell (sidebar layout: Personal + hairline + Organization, D-01/D-02)
  - /settings → /settings/profile landing redirect
  - Profile re-homed at /settings/profile (reuses saveMyProfile form; AccountClient untouched)
  - Read-only transactional Notifications section (SET-04, D-19/20) — no dead toggles
  - Permanent 301s /account→/settings/profile and /team→/settings/organization/team (next.config)
  - Account popover repointed to /settings/*; account QR now renders for every account
affects: [13-08, 13-10, settings, present, connect]

tech-stack:
  added: []
  patterns:
    - "Settings sidebar = server layout.tsx (data) + client SettingsNav.tsx (usePathname active state)"
    - "Old→new path moves live in next.config redirects(), NOT the proxy (B7 lock: proxy stays auth-only)"
    - "ensurePublicHandle() = public door on the profile module that resolves the auth user itself"

key-files:
  created:
    - src/app/settings/layout.tsx
    - src/app/settings/SettingsNav.tsx
    - src/app/settings/page.tsx
    - src/app/settings/profile/page.tsx
    - src/app/settings/profile/ProfileForm.tsx
    - src/app/settings/notifications/page.tsx
  modified:
    - next.config.ts
    - src/app/account/actions.ts
    - src/shared/ui/IconRail.tsx
    - src/shared/ui/account-card.ts
    - src/modules/profile/index.ts
  deleted:
    - src/app/account/page.tsx

key-decisions:
  - "Sidebar split into a server layout (loads name+company) + a client SettingsNav (usePathname highlight) — layout stays a server component as the plan required, the active-route highlight needs the client boundary"
  - "Rebuilt a thin ProfileForm instead of exporting AccountClient's internal ProfileForm — AccountClient.tsx is referenced by 13-08/13-10, editing it to export would collide"
  - "Organization links render in the sidebar unconditionally in 13-09; the Superadmin subtree gate lands in organization/layout.tsx (13-10)"
  - "Notification categories are read from the DB (source of truth); the page supplies friendly copy + order only, never writes"

patterns-established:
  - "Reusable settings sidebar built from existing glass tokens + Aurora/raspberry palette (matches IconRail), not a bespoke look"
  - "Read-only settings section = honesty over theater: list always-on transactional emails, no dead switches (D-19)"

requirements-completed: [SET-01, SET-04]

duration: 15min
completed: 2026-07-06
---

# Phase 13 Plan 09: Settings Home + Profile Re-home + Read-only Notifications Summary

**A persistent `/settings` sidebar shell (Personal + hairline + Organization) that re-homes the profile form under `/settings/profile`, ships a read-only transactional Notifications section, and 301-redirects the old `/account` + `/team` routes — plus repointing the account popover and making the scan-to-connect QR render for every account.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-06T12:31:27Z
- **Completed:** 2026-07-06T12:46:52Z
- **Tasks:** 2 plan tasks + 2 orchestrator-injected refinements
- **Files changed:** 12 (6 created, 5 modified, 1 deleted)

## Accomplishments

- **Settings shell (Task 1):** `settings/layout.tsx` (server) loads the caller's name + company and renders `SettingsNav` (client, `usePathname` active-highlight) beside the active sub-route. Personal group (Profile, Login & security, Notifications) sits above a thin hairline + small "Organization" label with the org links (D-01/D-02). Built from the app's existing glass tokens + raspberry palette (matches IconRail), not a bespoke look.
- **Landing redirect:** `/settings` → `/settings/profile` (thin `redirect()`).
- **Old→new 301s:** `next.config.ts` gains `redirects()` — `/account`→`/settings/profile` and `/team`→`/settings/organization/team`, both `permanent: true`. The proxy is untouched (no allowlist entry — `/settings/*` is gated-by-default; B7 lock).
- **Profile re-home (Task 2):** `/settings/profile` reuses the same `saveMyProfile` / `saveAvatar` actions + shared `AvatarUpload` via a thin standalone `ProfileForm` (AccountClient.tsx left untouched — 13-08/13-10 reference it).
- **Read-only Notifications (Task 2):** `/settings/notifications` reads the transactional `notification_category` rows and lists them with "Always on" pills + a "coming later" note. No functional toggles (D-19/20).
- **`/account` retired:** `account/page.tsx` deleted; the 301 intercepts the path. `AccountClient.tsx` + `actions.ts` kept (still imported by TopBar / BrandingEditForm / the re-homed form).
- **Refinement 1:** IconRail account popover repointed — My Profile→`/settings/profile`, Company Profile→`/settings/organization/profile`, Settings→`/settings`.
- **Refinement 2:** `getAccountCard()` now calls `ensurePublicHandle()` then renders the QR unconditionally, so accounts without a lazily-assigned handle still show "SCAN TO CONNECT".

## Task Commits

1. **Task 1: settings shell + landing redirect + old→new 301s** — `c8a18c4` (feat)
2. **Task 2: profile re-home + read-only notifications + retire /account** — `f653916` (feat)
3. **Refinements: repoint account popover + always-render account QR** — `b20fb90` (feat)

## Files Created/Modified

- `src/app/settings/layout.tsx` — server shell: loads name+company, renders sidebar + `{children}`
- `src/app/settings/SettingsNav.tsx` — client sidebar: flat Personal/Organization list, active highlight
- `src/app/settings/page.tsx` — `redirect('/settings/profile')`
- `src/app/settings/profile/page.tsx` — thin server route loading the profile
- `src/app/settings/profile/ProfileForm.tsx` — reused profile form (saveMyProfile + AvatarUpload)
- `src/app/settings/notifications/page.tsx` — read-only transactional notifications list
- `next.config.ts` — added `redirects()` with the two permanent 301s
- `src/app/account/actions.ts` — `saveMyProfile` now also revalidates `/settings/profile`
- `src/shared/ui/IconRail.tsx` — 3 popover links repointed to `/settings/*`
- `src/shared/ui/account-card.ts` — ensure handle + render QR unconditionally
- `src/modules/profile/index.ts` — private `ensureHandle` returns the handle; new public `ensurePublicHandle()`
- `src/app/account/page.tsx` — **deleted** (route retired behind its 301)

## Decisions Made

- **Server layout + client nav split:** the plan required a server-component layout, but active-route highlighting needs `usePathname` (client). Solved with a `SettingsNav.tsx` client child — mirrors the codebase's IconRail/AppShell pattern (client nav) and AccountClient/TeamClient pattern (server route + client component). `SettingsNav.tsx` is an extra file beyond the plan's `files_modified` but is a natural sub-component, not scope creep.
- **Thin ProfileForm, not an AccountClient export:** re-implemented the small `Field`/`ReadOnly`/SaveBar presentation locally because extracting AccountClient's internal primitives would require editing AccountClient.tsx (forbidden — 13-08/13-10 reference it). The load-bearing logic (`saveMyProfile`, `saveAvatar`, `AvatarUpload`, `MyProfile`) is genuinely reused, so there is one writer, not a fork.
- **`ensurePublicHandle()` as the module door:** the injected refinement said "call `ensureHandle(userId)`", but the real `ensureHandle` is private and takes `(supabase, userId, displayName)`. Exposing it raw would leak a supabase client into `account-card.ts`. Added a public `ensurePublicHandle()` that resolves the auth user itself and reuses the private helper — keeps the module boundary and the QR server-side.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `saveMyProfile` did not revalidate the re-homed profile route**
- **Found during:** Task 2 (profile re-home)
- **Issue:** `saveMyProfile` only revalidated `/account` (now deleted) + `/home`. With the profile re-homed under the `/settings` layout, saving a name would leave the server-rendered `/settings/profile` route and the sidebar header (which shows the display name) stale until a manual navigation/refresh.
- **Fix:** Added `revalidatePath('/settings/profile')` alongside the existing revalidations. Backward-compatible for AccountClient (which still calls `saveMyProfile`).
- **Files modified:** `src/app/account/actions.ts`
- **Verification:** `tsc --noEmit` clean; the revalidate targets the exact route the re-homed form + layout render under.
- **Committed in:** `f653916` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing-critical). **Impact:** the re-home is only correct with the added revalidation; no scope creep. The `SettingsNav.tsx` extra file is a structural necessity (server-layout + client-nav split), documented under Decisions.

## Orchestrator-Injected Refinements (user-signed-off, beyond `files_modified`)

- **IconRail popover links** (`src/shared/ui/IconRail.tsx`) — repointed the three `MenuLink`s to `/settings/profile`, `/settings/organization/profile`, `/settings`. The avatar/name/company-chip/QR/Sign-out are untouched.
- **QR always renders** (`src/shared/ui/account-card.ts` + `src/modules/profile/index.ts`) — `getAccountCard()` ensures a `public_handle` via the new `ensurePublicHandle()` and builds the QR unconditionally (past the `if (!p) return null` guard). Stays server-side; `qrcode` never ships to the client.

## How the Organization/Profile link was handled

`typedRoutes` is **off** in this project (no `typedRoutes` in `next.config.ts` / `tsconfig.json`), so `<Link href="/settings/organization/profile">` compiles as a plain string href even though the route doesn't exist yet (it lands in 13-10). No typed-routes error was triggered — no blocker to report, no route invented.

## Issues Encountered

- **Pre-existing `tsc` error (not owned):** `src/app/settings/security/actions.test.ts` L32 `TS2307` — `@/app/settings/security/actions` (13-08's target, built right after this plan). This is the single expected pre-existing error; my files introduce **zero** new `tsc` errors (verified: error count stayed at exactly 1, that exact module).

## Known Forward-References (not stubs)

- The sidebar + IconRail link to `/settings/security` (13-08) and `/settings/organization/*` (13-10), which do not exist yet. These are intentional forward-references per the plan (those plans land immediately after 13-09), not dead stubs — the Personal shell delivered here (Profile, Notifications, redirects) is fully functional. The Organization subtree Superadmin gate is 13-10's job (`organization/layout.tsx`); until then a Member sees the links but the routes are absent.

## Next Phase Readiness

- **Ready for 13-08** (Login & security: `/settings/security` + `actions.ts` — the one pre-existing `TS2307` resolves when that module lands) and **13-10** (Organization subtree + its Superadmin gate). The sidebar already links both.
- STATE.md / ROADMAP.md intentionally **not** updated (per orchestrator instruction — handled centrally).

## Self-Check: PASSED

- All 6 created files exist on disk (verified with `[ -f ]`).
- `src/app/account/page.tsx` deleted; zero import statements reference it (`tsc` corroborates).
- `next.config.ts` has 2 `permanent: true` redirects incl. `/settings/profile`.
- IconRail: all 3 links repointed, no `/account?tab` remaining.
- `ensurePublicHandle` exported and used in `account-card.ts`.
- Commits `c8a18c4`, `f653916`, `b20fb90` exist on `worktree-phase-13-settings-emails`.
- `tsc --noEmit`: exactly 1 error, the expected pre-existing 13-08 `TS2307`; no new error introduced.

---
*Phase: 13-settings-home-lifecycle-emails*
*Completed: 2026-07-06*
