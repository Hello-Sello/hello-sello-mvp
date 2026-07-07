---
phase: 13-settings-home-lifecycle-emails
verified: 2026-07-06T13:36:53Z
status: human_needed
score: 4/4 v1 success criteria verified (SET-05 deferred to Phase 14)
overrides_applied: 0
deferred:
  - truth: "SET-05 — MFA + active-session list"
    addressed_in: "Phase 14"
    evidence: "ROADMAP SC5: '(Optional, deferrable to a Phase 14 hardening pass) MFA + active-session list — noted, not v1-blocking'. No 13-* plan claims SET-05 — intentional scope decision (ROADMAP: 'SET-01..04 (SET-05 MFA/sessions deferred to Phase 14)')."
human_verification:
  - test: "Live lifecycle email delivery via Resend"
    expected: "After setting the RESEND_API_KEY edge secret + `supabase functions deploy send-lifecycle-email` on cloud, each of the 7 events (verification.approved/rejected, join.requested/approved/rejected, welcome, membership.removed) delivers a real inbox email with exactly one working CTA."
    why_human: "External service integration — Resend send needs the cloud edge secret + deploy; cannot be verified programmatically locally (resend.ts returns { ok: false } with no key). Ledgered in docs/deploy/cloud-migrations-pending.md."
  - test: "Erasure worker live auth.admin scrub + deactivate/delete session-revoke"
    expected: "On cloud, erase-expired-accounts tombstones auth.users.email + soft-deletes (login disabled, row kept); requestAccountDeletion / deactivateAccount revoke the caller's sessions (POST /admin/users/{id}/logout?scope=global)."
    why_human: "The local sb_secret_ GoTrue admin API 403s these admin calls (proven via SQL simulation only — erasure_chain_test asserts the DB half). Needs a cloud UAT. Ledgered."
  - test: "Settings UI end-to-end browser walkthrough"
    expected: "Sidebar renders Personal/Organization zones with active highlight; the password-gated Delete flow shows 30-day grace + sole-Superadmin lockout copy inline; a Member hitting /settings/organization/* gets the NotAuthorized card; deactivate then reactivate works."
    why_human: "Visual appearance + user-flow completion — cannot be programmatically verified. Prototype was signed off (13-06); the React build's live render/flow benefits from a human pass."
---

# Phase 13: Settings Home & Lifecycle Emails — Verification Report

**Phase Goal:** Scattered settings consolidate into a clean org-vs-user split, and the key lifecycle moments send real emails. Completes the user-ready surface.
**Verified:** 2026-07-06T13:36:53Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

All four v1-blocking success criteria (SET-01..04) are achieved and independently verified in the codebase. SET-05 (MFA/sessions) is explicitly optional and deferred to Phase 14. Status is `human_needed` — not because of any gap, but because three dimensions of the goal (live Resend email delivery, the live auth-admin erasure scrub / session-revoke, and the settings UI visual/user-flow) are external-service / visual behaviors that cannot be confirmed programmatically and are ledgered for cloud UAT.

### Observable Truths

| # | Truth (Success Criterion) | Status | Evidence |
|---|---------------------------|--------|----------|
| 1 | **SET-01** — Settings split user-level vs org-level, org tabs role-gated to Superadmin | ✓ VERIFIED | `settings/layout.tsx` + `SettingsNav.tsx` render Personal (Profile, Login & security, Notifications) + thin hairline + Organization (Company profile, Team, Security). `organization/layout.tsx` gates the whole subtree on `has_permission('team.manage')`, fail-closed → `NotAuthorized`. `next.config.ts` has 2 permanent 301s (/account→/settings/profile, /team→/settings/organization/team). Old `account/page.tsx` + `team/page.tsx` deleted; `IconRail` popover repointed to `/settings/*`; no lingering `/account`\|`/team` links in `src/`. `tsc` clean. |
| 2 | **SET-02** — User can deactivate/delete account; Superadmin can deactivate the company | ✓ VERIFIED | `account_lifecycle` migration: 6 SECURITY DEFINER RPCs (own-row/own-company scoped, two-door grant), sole-Superadmin lockout RAISE, company-less audit guard. `erase-expired-accounts` worker (scrub→email-tombstone→`deleteUser(soft)`→audit) + daily `pg_cron`. `security/actions.ts` fronts every RPC ({ ok }|{ error }, never throws, no direct `person` UPDATE) + password re-verify + session-revoke. `SecurityClient` danger zone: password-gated Delete, reversible Deactivate, Cancel-deletion. Org `security/page.tsx` wires `deactivateCompany`/`reactivateCompany`. All 3 SQL invariant tests PASS. |
| 3 | **SET-03** — Lifecycle emails fire for 7 events, each with one clear next action | ✓ VERIFIED (code) | `templates.ts` renders all 7 events, each with exactly one `<a` CTA (Deno-free, HTML-escaped vars). `send-lifecycle-email` resolves recipient from `auth.users` (getUserById / Superadmin fan-out / founder), renders, sends via `resend.ts` (key from `Deno.env` only). All 7 dispatches wired in the 3 action files, guarded by shared pure `shouldDispatch` (post-ok) inside `after()`+try/catch (fail-soft). `lifecycle-email` unit test GREEN. **Live Resend delivery → cloud UAT (human item 1).** |
| 4 | **SET-04** — Notification-preference store (category × channel), honouring transactional vs marketing | ✓ VERIFIED | `notification_preference` migration: `notification_category`(is_transactional) × `notification_channel` × `notification_preference`(enabled) + unique index + own-row SELECT RLS (`person_id = auth.uid()`), no write policy. `notifications/page.tsx` reads categories and renders a read-only "always on" list + "Coming later" marketing/in-app note (no dead toggles — all v1 categories transactional, by design D-19). SQL RLS invariant PASS. |
| 5 | **SET-05** — MFA + active-session list | ⏭ DEFERRED | Explicitly "(Optional, deferrable to a Phase 14 hardening pass) — noted, not v1-blocking". No plan claims it. See Deferred Items. |

**Score:** 4/4 v1 success criteria verified (SET-05 deferred to Phase 14)

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | SET-05 — MFA + active-session list | Phase 14 | ROADMAP SC5 marks it optional/deferrable to a Phase 14 hardening pass, not v1-blocking; ROADMAP plan note: "SET-01..04 (SET-05 MFA/sessions deferred to Phase 14)". Intentional scope decision, not a gap. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260706090000_account_lifecycle.sql` | lifecycle cols + 6 RPCs + audit codes | ✓ VERIFIED | 4 nullable cols, 6 `security definer set search_path=''` RPCs, two-door grants, sole-Superadmin RAISE, company-less audit guard, `on conflict do nothing` codes; no hard delete. Applies clean on reset. |
| `supabase/migrations/20260706090100_notification_preference.sql` | 3 tables + unique idx + own-row RLS + seeds | ✓ VERIFIED | is_transactional on category; 4 categories + 2 channels; unique idx; own-row SELECT RLS, no write policy. |
| `supabase/migrations/20260706090200_erasure_cron.sql` | pg_cron daily → edge POST + scrub/audit RPCs | ✓ VERIFIED | `scrub_person_pii` + `audit_person_scrub` (service_role only) + `run_scheduled_erasures` (Vault reuse) + idempotent `cron.schedule('… ','0 3 * * *')`. |
| `supabase/functions/send-lifecycle-email/index.ts` | resolve recipient, render, Resend | ✓ VERIFIED | `Deno.serve`, `SUPABASE_SERVICE_ROLE_KEY`, `auth.admin.getUserById`, `renderTemplate`, `sendViaResend`, soft skip on no recipient, counts-only response. |
| `supabase/functions/_shared/email/templates.ts` | 7 events, one CTA each, Deno-free | ✓ VERIFIED | Pure module, all 7 events, single `<a` per layout, escaped vars, exhaustiveness guard. |
| `supabase/functions/_shared/email/resend.ts` | Resend POST, key from edge secret | ✓ VERIFIED | `api.resend.com/emails`, key via `Deno.env` only, fail-soft, no NEXT_PUBLIC. |
| `supabase/functions/erase-expired-accounts/index.ts` | scrub + tombstone + soft-delete + audit | ✓ VERIFIED | Due-row select, per-row scrub→tombstone→`deleteUser(true)`→audit via the two RPCs, fail-soft; no hard delete. |
| `src/app/settings/security/actions.ts` | lifecycle + password + identity actions | ✓ VERIFIED | All signatures present, RPC-fronted, `logout?scope=global` revoke, sole-identity guard; 13-01 RED contract GREEN. |
| `src/app/settings/security/page.tsx` + `SecurityClient.tsx` | Login & security surface | ✓ VERIFIED | Thin route feeds client; password-gated Delete modal, reversible Deactivate, Cancel-deletion, linked-accounts w/ sole-identity guard. |
| `src/app/settings/layout.tsx` + `SettingsNav.tsx` | persistent sidebar, Personal/Org zones | ✓ VERIFIED | Server shell + client nav, active highlight, hairline separator. |
| `src/app/settings/organization/layout.tsx` | Superadmin gate | ✓ VERIFIED | `has_permission('team.manage')` fail-closed → NotAuthorized. |
| `src/app/settings/organization/{profile,team,security}/page.tsx` | re-homed org surfaces | ✓ VERIFIED | Reuse `saveCompanyProfile`/`BrandingEditForm`, `TeamClient`+team reads, `deactivateCompany`/`reactivateCompany` panel. |
| `src/app/settings/{profile,notifications}/page.tsx` | profile re-home + read-only notifications | ✓ VERIFIED | ProfileForm reuses `saveMyProfile`/`saveAvatar`; notifications read-only. |
| `next.config.ts` | 301 redirects | ✓ VERIFIED | 2 `permanent: true` 301s. |
| `src/types/database.types.ts` | regenerated types | ✓ VERIFIED | `notification_preference` + `deactivated_at`/`deletion_scheduled_for`/`anonymized_at` present. |
| `docs/deploy/cloud-migrations-pending.md` | Phase-13 cloud ledger | ✓ VERIFIED | Phase-13 section: 3 migrations, 2 function deploys, RESEND_API_KEY secret, cloud-UAT note, P10/11/12 ordering dependency. |
| `src/shared/ui/account-card.ts` + `IconRail.tsx` | popover repoint + handle | ✓ VERIFIED | `getAccountCard` ensures a handle (`ensurePublicHandle`) + always renders QR; popover links → `/settings/*`. |

### Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| `security/actions.ts` | `request_account_deletion`/`deactivate_account` RPCs | localized-cast `supabase.rpc(...)` | ✓ WIRED |
| `requestAccountDeletion`/`deactivateAccount` | admin logout | `logout?scope=global` fetch | ✓ WIRED (403 local → cloud UAT) |
| `erase-expired-accounts/index.ts` | `scrub_person_pii` + `audit_person_scrub` | `supabase.rpc(...)` | ✓ WIRED (RPCs defined in erasure_cron migration) |
| `run_scheduled_erasures` | `/functions/v1/erase-expired-accounts` | `net.http_post` (Vault chain) | ✓ WIRED |
| `send-lifecycle-email` | `auth.users` / Resend | `getUserById` + `sendViaResend` | ✓ WIRED |
| 3 action files (7 events) | `send-lifecycle-email` | `after(() => try { invoke } catch)` guarded by `shouldDispatch` | ✓ WIRED (post-ok, fail-soft) |
| `organization/layout.tsx` | `has_permission('team.manage')` | localized-cast RPC gate → NotAuthorized | ✓ WIRED |
| `organization/security/page.tsx` | `deactivateCompany` (13-08) | import from `@/app/settings/security/actions` | ✓ WIRED |
| `next.config.ts redirects()` | `/settings/profile` + `/settings/organization/team` | `permanent: true` | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `notifications/page.tsx` | `rows` | `supabase.from('notification_category').eq('is_transactional', true)` — real DB read | Yes (4 seeded rows) | ✓ FLOWING |
| `SecurityClient` (delete state) | `deletionScheduledFor` | `getCurrentPerson().deletion_scheduled_for` — real column read | Yes | ✓ FLOWING |
| `organization/security/page.tsx` | `deactivated` | `company.deactivated_at` real read | Yes | ✓ FLOWING |
| `send-lifecycle-email` | `to` | `auth.admin.getUserById(personId).email` — SSOT | Yes (resolved server-side) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Type check | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Full unit suite | `npx vitest run` | 116 passed, 0 failed | ✓ PASS |
| 13-01 RED→GREEN (SET-02) | `vitest run settings/security/actions` | pass | ✓ PASS |
| 13-01 RED→GREEN (SET-03) | `vitest run lifecycle-email` | pass (template one-CTA + shouldDispatch) | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| Migration apply | `supabase db reset` | exit 0 — all 3 Phase-13 migrations apply in order | PASS |
| Account lifecycle invariants | `bash supabase/tests/run_account_lifecycle_test.sh` | "ALL ACCOUNT LIFECYCLE TESTS PASSED" (exit 0) | PASS |
| Erasure hash-chain invariant | `bash supabase/tests/run_erasure_chain_test.sh` | "ALL ERASURE CHAIN TESTS PASSED" (exit 0) | PASS |
| Notification own-row RLS | `bash supabase/tests/run_notification_pref_rls_test.sh` | "ALL NOTIFICATION PREFERENCE RLS TESTS PASSED" (exit 0) | PASS |

> Note: the three SQL probes FAILED on the first run because the live local Postgres was at a pre-Phase-13 state (migrations not yet applied to the running container). A `supabase db reset` (the documented 13-07 gate) applied all committed migration files cleanly and the invariants then passed. The migration files are the reproducible source of truth — not a phase gap.

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|-------------|-------------|--------|----------|
| SET-01 | 13-06, 13-08, 13-09, 13-10 | ✓ SATISFIED | Sidebar split + org gate + re-homes + 301s |
| SET-02 | 13-01, 13-02, 13-03, 13-07, 13-08 | ✓ SATISFIED | RPCs + worker + actions + UI; SQL invariants pass. Live admin-API scrub/revoke → cloud UAT |
| SET-03 | 13-01, 13-05, 13-07, 13-11 | ✓ SATISFIED (code) | Templates + sender + 7-event dispatch; unit GREEN. Live delivery → cloud UAT |
| SET-04 | 13-04, 13-07, 13-09 | ✓ SATISFIED | Store + own-row RLS + read-only section |
| SET-05 | (none) | ⏭ DEFERRED | Optional/not-v1-blocking → Phase 14. ORPHANED-by-design (declared in phase Requirements, no plan claims it — intentional, documented). |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER/"not implemented" in any Phase-13 file | ℹ️ Info | Clean — no debt markers, no stubs |

### Human Verification Required

1. **Live lifecycle email delivery (Resend)** — Set `RESEND_API_KEY` edge secret + `supabase functions deploy send-lifecycle-email` on cloud, then trigger each of the 7 events and confirm a real inbox email arrives with one working CTA. *Why human:* external service; local `resend.ts` returns `{ ok: false }` with no key. Ledgered.
2. **Erasure worker live auth.admin scrub + session-revoke** — Deploy `erase-expired-accounts` and UAT that the email tombstone + soft-delete fire, and that deactivate/delete revoke sessions (`logout?scope=global`). *Why human:* local `sb_secret_` GoTrue admin API 403s these; only the DB-side scrub is proven locally (erasure_chain_test). Ledgered.
3. **Settings UI end-to-end browser walkthrough** — Sidebar render + active highlight; password-gated Delete (30-day grace + sole-Superadmin lockout copy); Member blocked at `/settings/organization/*`; deactivate→reactivate. *Why human:* visual/user-flow completion.

### Gaps Summary

**No gaps.** All four v1-blocking success criteria (SET-01..04) are built, wired, and independently verified: `tsc` clean, 116/116 unit tests green, `supabase db reset` applies all three migrations cleanly, and all three SQL security invariants (account lifecycle own-row scope + sole-Superadmin lockout + company-less no-crash; erasure hash-chain survival; notification own-row RLS) pass. No stubs, debt markers, or placeholders. Old `/account` + `/team` routes retired behind permanent 301s with their reusable form/client components kept.

The phase is `human_needed` (not `passed`) solely because three dimensions of the goal are external-service / visual behaviors that cannot be confirmed programmatically — live Resend delivery, the live auth-admin erasure scrub / session-revoke (both 403 on the local admin API), and the settings UI walkthrough. All three are intentionally deferred to cloud UAT and recorded in `docs/deploy/cloud-migrations-pending.md`; they are documented deferrals, not defects. SET-05 (MFA/sessions) is an explicit, roadmap-sanctioned deferral to Phase 14.

---

_Verified: 2026-07-06T13:36:53Z_
_Verifier: Claude (gsd-verifier)_
