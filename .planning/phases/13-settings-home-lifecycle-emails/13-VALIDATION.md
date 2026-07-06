---
phase: 13
slug: settings-home-lifecycle-emails
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-06
validated: 2026-07-06
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from `13-RESEARCH.md` § Validation Architecture. Per-task rows filled by 13-01 (Wave 0).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.9 (unit, node env) + Playwright 1.61 (e2e smoke) + `psql` SQL invariant scripts |
| **Config file** | `vitest.config.ts` (aliases `@` → `./src` and `server-only` → an empty shim so `'use server'` action modules import under the pure-node runner) |
| **Quick run command** | `npm run test:unit` (`vitest run`) |
| **Full suite command** | `npm run test:unit && npm test` (vitest + Playwright) + the SQL scripts against a fresh `supabase db reset` |
| **Estimated runtime** | unit ~1s (measured: 111 tests in ~0.8s); e2e + SQL longer |

---

## Sampling Rate

- **After every task commit:** `npm run test:unit` (fast — the action-validation + template + dispatch contracts)
- **After every plan wave:** `npm run test:unit && npm test` + the SQL invariant scripts against a fresh `supabase db reset`
- **Before `/gsd:verify-work`:** full suite green **and** a live cloud UAT for the two admin-API paths that 403 locally (erasure auth-scrub, token-revoke — the `sb_secret_` local caveat)
- **Max feedback latency:** ~2s (unit); minutes for e2e/SQL

---

## Per-Task Verification Map

| Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-01 | 1 | SET-02, SET-03 | T-13-01-I / T-13-SC | RED contracts fail for module-not-found — no stub masks a gap | unit | `npm run test:unit -- settings/security/actions` · `npm run test:unit -- lifecycle-email` | ✅ | ❌ red (W0 by design) |
| 13-02 | 1 | SET-02 | own-row scope + sole-Superadmin (DoS) | deactivate/delete RPC scoped `id = auth.uid()`; sole-Superadmin guard raises | SQL | `bash supabase/tests/run_account_lifecycle_test.sh` | ❌ W0 | ⬜ pending |
| 13-03 | 2 | SET-02 | audit-chain integrity (GDPR Art 17) | pseudonymize keeps `person`/`auth.users` rows + audit chain verifies | SQL | `bash supabase/tests/run_erasure_chain_test.sh` | ❌ W0 | ⬜ pending |
| 13-04 | 1 | SET-04 | own-row RLS (Info Disclosure) | `notification_preference` readable own-row only (`person_id = auth.uid()`) | SQL | `bash supabase/tests/run_notification_pref_rls_test.sh` | ❌ W0 | ⬜ pending |
| 13-05 | 1 | SET-03 | T-13-05-T template injection | `renderTemplate(event,vars) → {subject,html}`, exactly one CTA, untrusted vars HTML-escaped | unit | `npm run test:unit -- lifecycle-email` (template block) | ❌ W0 | ⬜ pending |
| 13-06 | 1 | SET-01 | — | settings sidebar / grouping / spacing visual sign-off (D-08) | manual | prototype review: `prototypes/settings-prototype/index.html` | ❌ W0 | ⬜ pending |
| 13-07 | 3 | SET-02, SET-03, SET-04 | — | regenerated `database.types.ts` compiles; cloud-deploy ledger updated | unit + manual | `npm run test:unit` (types compile) + ledger review | ❌ W0 | ⬜ pending |
| 13-08 | 4 | SET-01, SET-02 | password re-verify (ASVS V2 / D-10) | actions validation contract GREEN; empty/wrong password blocks delete before RPC | unit | `npm run test:unit -- settings/security/actions` | ❌ W0 | ⬜ pending |
| 13-09 | 4 | SET-01, SET-04 | open-redirect safety | `/account` 301 → `/settings/profile`; notifications read-only transactional list | e2e | `npm test -- settings-redirects` | ❌ W0 | ⬜ pending |
| 13-10 | 5 | SET-01 | org access control (ASVS V4) | Organization subtree gated by `has_permission('team.manage')`; Members never see it | e2e / manual | `npm test -- settings-org-gate` (spec authored in 13-10) | ❌ W0 | ⬜ pending |
| 13-11 | 2 | SET-03 | no-email-on-error / double-send (Pitfall 4) | `shouldDispatch` true iff RPC ok; email never on error; transport failure swallowed (fail-soft) | unit | `npm run test:unit -- lifecycle-email` (dispatch block) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. "File Exists" ❌ W0 = the plan's own verification artifact is authored when that plan runs.*

---

## Wave 0 Requirements

Delivered by **13-01** (this plan) — the two behaviour-bearing SET workstreams pinned RED before implementation:

- [x] `src/app/settings/security/actions.test.ts` — SET-02 lifecycle-action validation contract (RED: `@/app/settings/security/actions` absent → GREEN in 13-08)
- [x] `src/app/settings/lifecycle-email.test.ts` — SET-03 pure-template + dispatch-decision contract (RED: `_shared/email/templates` + `@/shared/email/dispatch` absent → GREEN in 13-05 / 13-11)

SQL invariant stubs (`account_lifecycle_test.sql`, `erasure_chain_test.sql`, `notification_pref_rls_test.sql`) are authored inside their own Wave-1 plans (13-02 / 13-03 / 13-04) alongside the migration they guard — they are RED-then-GREEN within a single plan against `supabase db reset`, so they need no separate Wave-0 stub.

*Framework already wired (vitest + Playwright); no install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Settings sidebar layout / grouping / spacing | SET-01 | Visual design judgement (D-08 prototype-first) | Open `prototypes/settings-prototype/index.html`; confirm one-click flat list + thin Personal/Org hairline |
| Erasure auth-scrub + token-revoke on deactivate | SET-02 | `sb_secret_` 403s the LOCAL GoTrue admin API — cloud-only testable | Cloud UAT: request deletion → run sweep → confirm `auth.users.email` tombstoned + sessions revoked |
| Resend from-domain deliverability | SET-03 | External transport; needs a verified sending domain (Assumption A1) | Cloud UAT: trigger one lifecycle email, confirm inbox delivery from `noreply@hello-sello.com` |

---

## Validation Sign-Off

- [x] All plans have an `<automated>` verify or a documented manual/cloud-UAT reason
- [x] Sampling continuity: no 3 consecutive plans without automated verify (13-06 manual is isolated among automated neighbours)
- [x] Wave 0 covers all MISSING references (the two RED contracts; SQL stubs owned by 13-02/03/04)
- [x] No watch-mode flags (`vitest run`, not `vitest`; `test:unit:watch` unused)
- [x] Feedback latency < 2s (unit suite ~0.8s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-06 (Wave-0 RED contracts committed; both suites RED for module-not-found)
