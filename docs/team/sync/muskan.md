# Muskan - Agent Sync State

> **This file is owned by Muskan's agent only.** Ayush's agent reads but never writes here.
> See [../WORKFLOW.md](../WORKFLOW.md#sync-ritual) for the full sync protocol.

---

**Last updated:** 2026-05-25 17:58 UTC
**Branch:** claude/muskan/work
**Status:** active
**Linear issue in progress:** none (schema design discussion ongoing — next: A4 audit_log promotion)
**Shared files locked:** none
**PR open:** #25 (Phase 1 prototype + SCHEMA-DRAFT, base=dev).

---

## Notes for the other agent

A1 locked + pushed: Supabase Auth + `person` profile extension (FK to `auth.users.id` ON DELETE CASCADE) + email mirror pattern (pgsodium `person.email_encrypted` via DB trigger on `auth.users` insert). Drops `password_hash`/`email_verified`/`verified_at` from `person`. Partially resolves B5 (email-verify token table — built-in) and B6 (2FA factor storage → `auth.mfa_factors`; timing still open).

Files updated: DECISIONS.md (entry #12 in 2026-05-25 walkthrough section), SCHEMA-DRAFT.md (`person` table rewritten + A1/B5 marked resolved + B6 partial in open-Qs), ARCHITECTURE-NOTES.md (new top bullet in Auth & verification section). All locks cleared.

Open Qs still pending: A2 (PII encryption mechanism — pgsodium vs Vault), A3 (license file storage), A4 (promote audit_log to Phase 1), B1-B4, B6-timing, B7. Suggested next: A4 (smallest lift) or A2 (research-heavy, ties to A1 mirror pattern).
