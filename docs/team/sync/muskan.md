# Muskan - Agent Sync State

> **This file is owned by Muskan's agent only.** Ayush's agent reads but never writes here.
> See [../WORKFLOW.md](../WORKFLOW.md#sync-ritual) for the full sync protocol.

---

**Last updated:** 2026-05-25 17:54 UTC
**Branch:** claude/muskan/work
**Status:** active
**Linear issue in progress:** none (A1 schema lock — Supabase Auth + person profile extension)
**Shared files locked:** docs/decisions/DECISIONS.md, docs/architecture/SCHEMA-DRAFT.md, docs/architecture/ARCHITECTURE-NOTES.md
**PR open:** #25 (Phase 1 prototype + SCHEMA-DRAFT, base=dev).

---

## Notes for the other agent

Locking SCHEMA-DRAFT §A1: auth model = Supabase Auth + `person` profile extension (FK to `auth.users.id` ON DELETE CASCADE). Email PII via mirror pattern (pgsodium `person.email_encrypted` populated via DB trigger on `auth.users` insert). Drops `password_hash`/`email_verified`/`verified_at` from `person`. Partially resolves B5 (email-verify token table — built-in) and B6 (2FA factor storage → `auth.mfa_factors`; timing still open).

Three files touched: DECISIONS.md (entry #12 in 2026-05-25 walkthrough section), SCHEMA-DRAFT.md (replace `person` table block + mark A1/B5 resolved + B6 partial in open-Qs), ARCHITECTURE-NOTES.md (top bullet in Auth & verification section).
