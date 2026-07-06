# Phase 13 — Deferred / Out-of-Scope Items

Discoveries logged during execution that are outside the current plan's scope
(per the executor scope-boundary rule). Not fixed here — tracked for the owning plan.

## From 13-11 (lifecycle-email dispatch wiring)

- **Pre-existing `tsc` error in a sibling SET-01/02 file — NOT 13-11's.**
  `src/app/settings/security/actions.test.ts:32` — `TS2307 Cannot find module
  '@/app/settings/security/actions'`. That RED test ships ahead of its implementation
  (`src/app/settings/security/actions.ts` is absent); it turns GREEN when the
  Settings-security plan builds that action module. 13-11 touched none of these files.
  `npx tsc --noEmit` is clean for the three files 13-11 edited
  (`src/shared/email/dispatch.ts`, `src/app/admin/verifications/actions.ts`,
  `src/app/team/actions.ts`) and the onboarding action.
