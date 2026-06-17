---
phase: 04-auth-verification-gate-hardening
plan: "03"
subsystem: auth-gate
tags: [auth, routing, rejected, revoked, resubmit, banner, ux, onboarding]
dependency_graph:
  requires:
    - 04-01 (revoked lookup value, RED e2e scaffold with test-id contracts)
    - 04-02 (requireVerified accessor, bouncer-1 Discover/Connect layout gates, REQUIRE_LICENSE prop)
  provides:
    - revoked-suspended-banner
    - rejected-resume-onboarding
    - resubmit-pending-transition
  affects:
    - 04-01 e2e spec (turns Cases 3 and 4 from RED to GREEN)
    - 04-04-PLAN (DB reset + full e2e run)
tech_stack:
  added: []
  patterns:
    - server-component-audit-log-read
    - verification-status-branch-routing
    - tdd-green-implementation
key_files:
  created: []
  modified:
    - src/app/home/page.tsx
    - src/app/onboarding/page.tsx
    - src/app/onboarding/OnboardingStepper.tsx
    - src/app/onboarding/actions.ts
decisions:
  - "revoked hard-block renders only the SuspendedBanner — no Discover/Connect affordances; internal content (checklist etc.) not shown either (simplest safe default for D-10)"
  - "rejected-resume starts stepper on 'company' step (not 'start') since the company already exists; companyName pre-filled from the company row"
  - "duplicate_company banner uses warning tone (orange) to distinguish from the danger tone (red) used for fixable rejections"
  - "StepNav CTA relabelled 'Fix and resubmit' for rejected-resume fixable path; suppressed entirely for duplicate_company (D-08)"
  - "Resubmit UPDATE guarded on .eq('verification_status', 'rejected') — double guard at DB row level (T-04-08)"
metrics:
  duration: "~4 minutes"
  completed: "2026-06-17"
  tasks_completed: 3
  tasks_total: 3
  files_created: 0
  files_modified: 4
---

# Phase 04 Plan 03: Broken-Session-Routing UX Summary

**One-liner:** Status-aware home page branches rejected→/onboarding redirect and revoked→suspended hard-block banner; onboarding page's rejected-resume mode closes the redirect loop, fetches the audit_log rejection reason, pre-fills prior data, and renders the fixable-vs-duplicate banner with resubmit; actions.ts flips rejected→pending on successful resubmit.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Status-aware home — rejected redirect + revoked suspended hard-block | 9a2a9a0 | src/app/home/page.tsx |
| 2 | Rejected-resume onboarding — loop-safe guard, reason banner, pre-fill, fixable-vs-duplicate branch | 3f4533b | src/app/onboarding/page.tsx, src/app/onboarding/OnboardingStepper.tsx |
| 3 | Resubmit flips rejected → pending | 1147c7f | src/app/onboarding/actions.ts |

## What Was Built

**Task 1 — home/page.tsx:**
- Added `status` variable from the `company.verification_status` read (already present; widened the branch).
- `status === 'rejected'` → `redirect('/onboarding')`: the reason banner + resubmit live there (Task 2). onboarding/page.tsx exempts rejected from its own guard so no loop.
- `status === 'revoked'` → renders `<SuspendedBanner />` with `data-testid="suspended-banner"`. Hard-block: only the banner is shown; no checklist, no Discover/Connect affordances (D-10 / AUTH-03).
- `SuspendedBanner` copy: "Your access has been suspended. Contact Hello Sello support." Tone matches `VerificationBanner` (danger/red vs info/blue). Uses `AlertTriangle` icon from lucide-react.
- `pending` branch and `!company_id → /onboarding` redirect unchanged.

**Task 2 — onboarding/page.tsx + OnboardingStepper.tsx:**
- `page.tsx` reads `company.verification_status` and `name` in a single SELECT BEFORE the company_id guard.
- Guard changed from `if (person.company_id && !resumeStep)` to `if (person.company_id && !resumeStep && companyStatus !== 'rejected')` — exempts rejected from the /home redirect, closing the loop with home/page.tsx (AUTH-02 / D-07).
- When `companyStatus === 'rejected'`:
  - Pre-fills the company setup fields from the existing company row (`address`, `description`, `primary_products`, `website`, and `name` via `companyName`).
  - Runs the direct `audit_log` SELECT (action `company.verify_rejected`, own company) under the existing `audit_select` RLS — no new SECURITY DEFINER RPC (T-04-07).
  - Derives `isDuplicate = presetCode === 'duplicate_company'` — no import of non-existent FIXABLE/STRUCTURAL symbols; only `RejectPreset` type imported for narrowing.
  - Passes `rejectionReason`, `rejectionPreset`, `isDuplicate`, `isRejectedResume` to `<OnboardingStepper/>`.
- `OnboardingStepper.tsx`:
  - Props extended with `rejectionReason`, `rejectionPreset`, `isDuplicate`, `isRejectedResume` (all optional, default safe values).
  - `isRejectedResume` sets initial step to `'company'` (not `'start'`), treats the mode as `resuming = true`.
  - `name` state initialised from `prefill.companyName` (pre-filled for rejected-resume).
  - `RejectionBanner` component rendered at the top of the company step when `isRejectedResume`.
    - `duplicate_company`: warning tone (orange border/bg), "join existing company" copy with support email link, no resubmit affordance.
    - fixable (any other preset): danger tone (red border/bg), reason text shown, "Please correct the details below and resubmit for review." copy.
  - `StepNav`: when `isCompany && isDuplicate`, the "Continue" / "Fix and resubmit" CTA is fully suppressed (D-08). Fixable path shows "Fix and resubmit" label.

**Task 3 — onboarding/actions.ts:**
- `createCompany` reads `currentStatus` (single SELECT) before the file upload loop.
- After all uploads succeed, if `currentStatus === 'rejected'` → `UPDATE company SET verification_status = 'pending' WHERE id = ... AND verification_status = 'rejected'` (double-guard; T-04-08: cannot clobber verified or revoked).
- The licence guard (`LICENCE_REQUIRED && files.length === 0`), idempotent-retry path (`companyId` existing), and 04-02 `REQUIRE_LICENSE`/`requireVerified` additions are unchanged.

## Threat Mitigations

| Threat | Mitigation Implemented |
|--------|----------------------|
| T-04-07 (IDOR — cross-tenant audit_log read) | `audit_log` SELECT scoped to `person.company_id` + existing `audit_select` RLS (`company_id = current_company_id()`). No cross-tenant read possible. |
| T-04-08 (EoP — resubmit self-verifies or un-revokes) | UPDATE guarded on `.eq('verification_status', 'rejected')` — can only transition rejected → pending; cannot set verified or clear revoked. |
| T-04-09 (EoP — revoked session reaches gated nav) | `home/page.tsx` renders only `SuspendedBanner` for revoked; no Discover/Connect affordances. Bouncer 1 (04-02) independently blocks Discover/Connect at the layout level. |
| T-04-10 (Tampering — duplicate_company offered resubmit) | UI suppresses the resubmit CTA for `isDuplicate`; `createCompany` is only invoked from the fixable path in normal flow. |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all data flows are wired:
- `rejectionReason` comes from a real `audit_log` SELECT
- Pre-fill values come from the live `company` row
- `verification_status` transitions are real DB writes

## Threat Flags

None — no new network endpoints or auth paths introduced. New DB access:
- `audit_log` SELECT (own company, existing RLS) — no new surface
- `company` UPDATE `rejected → pending` (own company, guarded) — no new surface

## Self-Check: PASSED
