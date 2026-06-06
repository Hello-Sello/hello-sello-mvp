# Muskan - Agent Sync State

> **This file is owned by Muskan's agent only.** Ayush's agent reads but never writes here.
> See [../WORKFLOW.md](../WORKFLOW.md#sync-ritual) for the full sync protocol.

---

**Last updated:** 2026-06-06 17:25 UTC
**Branch:** claude/muskan/work
**Status:** offline (session wrapped)
**Linear issue in progress:** none
**Shared files locked:** none
**PR open:** none

---

## Notes for the other agent

**2026-06-06 (this session) — Phase-1 schema gap pass.** Validated `prototypes/phase-1-onboarding` against `SCHEMA-DRAFT.md`. Heads-up: the prototype is **stale vs the locks** (email/license on the wrong tables, no Path-B "new vs existing company" screen) — build to `SCHEMA-DRAFT.md` + `HANDOFF.md`, not the prototype code. Resolved the last open build-questions (edited `SCHEMA-DRAFT.md` only — you weren't touching it):

- **B2** → new `hs_team_member` table (platform-level, no `company_id`; grant/revoke audited).
- **B3** → `company.metadata.domain_collision` (sparse, HS-only review flag).
- **B4** → reject reason *derived* from `audit_log`; resubmit auth-gated. No schema.
- **Onboarding checklist** → derive "done"; only `dismissed` in `person.metadata`; "skipped" → future `analytics_event` (added to the Coming-later list).

- **Cleanups:** `person.is_superadmin` dropped → `person_group` is the single source of truth for Superadmin; contact tags = customer/supplier/partner/prospect/other (blank = unclassified, dropped 'unknown'); store permission *codes* not labels (EN/DE i18n); `email_integration` re-sync deferred (v0 = one-time import).

Only **B6** (2FA timing) remains open. **DECISIONS.md updated this wrap** (2026-06-06 — Phase-1 schema gaps + company category).

Also this session: **synced my branch with dev** — your `src/` modular structure + `supabase/` + Connect/Deal docs/prototypes are now in my branch. Ran a **Phase-2/3 cross-check**: 11 Phase-1 tables are lock-ready; **`pending_inbox_item` needs `request_type` + `assigned_to`** (your Connect inbox design) before it locks — I'll send you 5 Qs to finalize it. New: **company business category** (Marcel) → `company_type` + `company_type_assignment` (multi-select, asked at setup; *not* buy/sell). Built a visual schema reference: `docs/architecture/schema-phase1-visual.html`.

**Next session:** add the category step into the `phase-1-onboarding` prototype (sync-ritual first — shared); apply your answers → finalize `pending_inbox_item`; refresh the visual; then start migrations in `supabase/migrations/`.

Still on my list: A2 `email_encrypted` scan (PR #25); AWS Bedrock access.

Going offline.
