---
phase: 04-auth-verification-gate-hardening
plan: "02"
subsystem: auth-gate
tags: [auth, gate, server-side, two-bouncer, env-fix, requireVerified, discover, connect]
dependency_graph:
  requires:
    - 04-01 (revoked lookup value, RED e2e scaffold)
  provides:
    - requireVerified-accessor
    - bouncer-1-discover-layout
    - bouncer-1-connect-layout
    - bouncer-2-discover-actions
    - server-only-REQUIRE_LICENSE
  affects:
    - 04-03-PLAN (rejection/revoked UI banners — layout gates now redirect to pages that need the banners)
    - 04-04-PLAN (DB reset — migration already committed in 04-01; gates now live)
tech_stack:
  added: []
  patterns:
    - async-server-component-layout-gate
    - two-bouncer-defense-in-depth
    - server-prop-for-client-env-flag
key_files:
  created:
    - src/app/discover/layout.tsx
  modified:
    - src/shared/auth/index.ts
    - src/app/connect/layout.tsx
    - src/app/discover/actions.ts
    - src/app/onboarding/actions.ts
    - src/app/onboarding/page.tsx
    - src/app/onboarding/OnboardingStepper.tsx
decisions:
  - "requireVerified() returns { blocked, reason } — caller decides the redirect target; reason:null covers both the no-company case (D-03) and unknown-status fail-safe, reason:'pending'|'rejected'|'revoked' are distinct bounce targets"
  - "discover/layout.tsx created as a new async Server Component (did not exist before)"
  - "connect/layout.tsx converted from sync to async to support await requireVerified() — ConnectSubNav frame preserved"
  - "D-03 page coverage: Discover + Connect gated; Present + Account intentionally exempt (see GATED-vs-EXEMPT table)"
  - "REQUIRE_LICENSE is server-only (no NEXT_PUBLIC_); OnboardingStepper receives licenceRequired as a boolean prop from the Server Component parent"
  - "AUTH-04 satisfied by existing proxy.ts getClaims() — no proxy modification (D-11)"
metrics:
  duration: "~4 minutes"
  completed: "2026-06-17"
  tasks_completed: 3
  tasks_total: 3
  files_created: 1
  files_modified: 6
---

# Phase 04 Plan 02: Two-Bouncer Gate + REQUIRE_LICENSE Fix Summary

**One-liner:** `requireVerified()` accessor in shared/auth drives Discover/Connect layout gates (bouncer 1) and Discover Server Action guards (bouncer 2); `NEXT_PUBLIC_REQUIRE_LICENSE` renamed to server-only `REQUIRE_LICENSE` with the flag passed as a prop to the client component.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | requireVerified() accessor + bouncer 1 (Discover/Connect layout gates) | f46a9da | src/shared/auth/index.ts, src/app/discover/layout.tsx, src/app/connect/layout.tsx |
| 2 | Bouncer 2 — requireVerified() guard on gated Discover Server Actions | 471df87 | src/app/discover/actions.ts |
| 3 | Server-only REQUIRE_LICENSE rename + AUTH-04 proxy verification | 5ac1422 | src/app/onboarding/actions.ts, src/app/onboarding/page.tsx, src/app/onboarding/OnboardingStepper.tsx |

## What Was Built

**Task 1 — requireVerified() + bouncer 1:**

- `src/shared/auth/index.ts` gained `export async function requireVerified()` returning `{ blocked: boolean; reason: 'pending'|'rejected'|'revoked'|null }`. It composes `getCurrentPerson()` + a single `company.verification_status` read — no new auth primitives, just a consolidating accessor. The `reason:null` case covers both no-company (D-03) and unknown/missing status (fail-safe closed).
- `src/app/discover/layout.tsx` is a new async Server Component. It awaits `requireVerified()` and redirects by reason before any Discover content renders. Does NOT touch `/present` or `/account` (see GATED-vs-EXEMPT table below).
- `src/app/connect/layout.tsx` converted from a sync Server Component to `async` so it can `await requireVerified()`. The `<ConnectSubNav/>` + children frame is unchanged. Same redirect logic as Discover.

**Task 2 — bouncer 2 on Discover Server Actions:**

- `sendConnectRequest` and `requestPricing` in `src/app/discover/actions.ts` each call `await requireVerified()` at the very top, before `createPairInboxItem`. If `blocked`, they return an error result with no DB write. This closes the direct-invocation bypass (RESEARCH Pitfall 1). The existing `is_caller_verified()` RLS floor (SEC-01) is untouched.

**Task 3 — REQUIRE_LICENSE server-only rename:**

- `src/app/onboarding/actions.ts` line 16: `NEXT_PUBLIC_REQUIRE_LICENSE` → `REQUIRE_LICENSE`; comment updated to explain the server-only rationale.
- `src/app/onboarding/page.tsx`: reads `process.env.REQUIRE_LICENSE === 'true'` server-side (module level, runs in Server Component), passes as `licenceRequired={licenceRequired}` prop to `<OnboardingStepper/>`.
- `src/app/onboarding/OnboardingStepper.tsx`: removed the `const LICENCE_REQUIRED = process.env.NEXT_PUBLIC_REQUIRE_LICENSE === 'true'` module-level read; added `licenceRequired: boolean` (default `false`) to the component props; threaded the prop to `submitCompany()` and down to `<CompanyStep licenceRequired={licenceRequired}>`; `CompanyStep` updated to accept and use the prop.
- `grep -rn NEXT_PUBLIC_REQUIRE_LICENSE src/` → zero hits.

**AUTH-04 proxy verification (D-11):**

Read `src/shared/db/proxy.ts`. `updateSession()` calls `supabase.auth.getClaims()` on every matched request. `getClaims()` validates the JWT signature against the project's published keys and rotates the token if needed. If `!user` and the route is neither `/login`, `/signup`, nor `/c/*`, the proxy returns `NextResponse.redirect(url)` to `/login`. This satisfies AUTH-04 — expired/absent sessions are caught at the edge before any layout or page code runs. No modification to `proxy.ts` was made or needed.

## D-03 GATED-vs-EXEMPT Page Table

This table closes the "every gated page must bounce no-company users to /onboarding" requirement (AUTH-02, D-03) by explicit decision — not by omission.

| Surface | Status | Mechanism | Rationale |
|---------|--------|-----------|-----------|
| /discover | GATED | `discover/layout.tsx` → `requireVerified()` → redirect by reason | Cross-company browsing; an unverified caller must not see the directory |
| /connect | GATED | `connect/layout.tsx` → `requireVerified()` → redirect by reason | Cross-company inbox; blocked until verified |
| /home | GATED (pre-existing) | `home/page.tsx` line 18: `if (!person.company_id) redirect('/onboarding')` | Already enforced; no change needed in this plan |
| /present | INTENTIONALLY EXEMPT | No layout gate | Shows the seller's OWN internal content (catalogue, products). An unverified seller seeing their own empty draft is not a cross-company data leak. Gated EXTERNAL actions inside Present (if any) are protected at bouncer 2, not the page layer. |
| /account | INTENTIONALLY EXEMPT | No layout gate | Account/settings is reachable pre-company by design — the user must be able to manage their account before/without a company. |

If a later phase adds a new gated external surface, it inherits the async-layout-gate pattern from `discover/layout.tsx`.

## Redirect Map (by reason)

| reason | redirect target | Meaning |
|--------|----------------|---------|
| `'pending'` | `/home` | Company under review — the pending banner on /home explains the wait |
| `'rejected'` | `/onboarding` | Rejection UX (04-03 builds the banner + resubmit flow) |
| `'revoked'` | `/home` | Hard-block suspended banner (04-03 builds it) |
| `null` | `/onboarding` | No company yet (D-03 bounce) OR unknown status (fail-safe) |

## Deploy-Coordination Carry-Over (Task 3)

**Manual step required before `REQUIRE_LICENSE` takes effect in any environment:**

The environment variable VALUE must be renamed from `NEXT_PUBLIC_REQUIRE_LICENSE` to `REQUIRE_LICENSE` in:
1. `.env.local` (local dev) — currently points to LOCAL Supabase; update when switching back to cloud
2. Vercel environment variables — update in the Vercel project dashboard for Preview and Production

Until this rename happens in a given environment, `process.env.REQUIRE_LICENSE` reads `undefined`, which evaluates to `false` — the licence file becomes silently optional. This is a **manual deploy step** (RESEARCH A2 env_var_trap), not a code change.

## AUTH-04 Verification Summary (D-11)

The existing `src/shared/db/proxy.ts` `updateSession()` function satisfies AUTH-04:
- Calls `supabase.auth.getClaims()` on every matched request (validates JWT signature + rotates token)
- If `!user` and route is not `/login`/`/signup`/`/c/*`, redirects to `/login`
- Signed-in users hitting auth routes are bounced to `/`

No proxy modification was made. AUTH-04 is satisfied by the existing implementation.

**Token-expiry mid-action edge case (D-12):** A user idle >1hr who then clicks a Discover CTA will see a brief error before their next navigation cleanly redirects. This is accepted as a minor MVP edge case (deferred `onAuthStateChange` client listener). The D-12 deferral is documented; it does not affect the gate correctness.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all gate logic is wired. `requireVerified()` makes real DB calls. The `licenceRequired` prop flows from the server env read to the client component. No placeholder values.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced. The gated Server Actions now have an additional app-layer guard (bouncer 2) on top of the existing RLS floor.

## Self-Check: PASSED

All 7 source files exist. All 3 task commits verified in git log (f46a9da, 471df87, 5ac1422).
