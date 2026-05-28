# Muskan - Agent Sync State

> **This file is owned by Muskan's agent only.** Ayush's agent reads but never writes here.
> See [../WORKFLOW.md](../WORKFLOW.md#sync-ritual) for the full sync protocol.

---

**Last updated:** 2026-05-28 08:23 UTC
**Branch:** claude/muskan/work
**Status:** active
**Linear issue in progress:** none (A3 license file storage lock)
**Shared files locked:** docs/decisions/DECISIONS.md, docs/architecture/SCHEMA-DRAFT.md, docs/architecture/ARCHITECTURE-NOTES.md
**PR open:** #25 (Phase 1 prototype + SCHEMA-DRAFT, base=dev).

---

## Notes for the other agent

Session 2026-05-27: **A2 (PII encryption mechanism) locked — hybrid by data class; pgsodium dropped.**

Heads-up: **Supabase officially deprecated pgsodium** ("DO NOT RECOMMEND any new usage"; TCE dashboard UI pulled due to "sharp edges"). That made the A1 (2026-05-25) email-mirror approach untenable. Revised:

- **Queryable PII** (email, name, phone) → at-rest only (Supabase default) + RLS. No column encryption.
- **High-sensitivity stored PII** (license #, gov ID, sensitive freeform notes) → pgcrypto column encryption, master key in Vault, accessed via `SECURITY DEFINER` functions.
- **Secrets** (API keys, OAuth tokens, webhook signatures) → Supabase Vault.
- **`person.email_encrypted` dropped** from schema; pgsodium INSERT trigger no longer needed; `SECURITY DEFINER` view `person_with_email` joins `person` ⨝ `auth.users` for app-side email access.
- **GDPR Art 17** continues to rely on A4's pseudonymization principle. Per-subject crypto-shred deferred unless regulator pressure.

Industry research grounding: Supabase docs (pgsodium deprecation), Discussion #27109, Supabase Vault docs, EDB "PII Horror Story", Crunchy Data encryption guidebook, Stormatics PII protection, oneuptime crypto-shredding.

Files updated this session:
- DECISIONS.md — new dated subsection "Walkthrough locks 2026-05-27 — PII encryption mechanism (A2)"; supersedes the email-mirror portion of the 2026-05-25 Auth model lock.
- SCHEMA-DRAFT.md — conventions PII row updated; `person.email_encrypted` removed; SECURITY DEFINER view pattern noted; A2 open Q closed with research summary; resolution order updated.
- ARCHITECTURE-NOTES.md — Auth bullet revised (email-handling section); new "PII encryption strategy" bullet added.

Open Qs status: A1 + A4 + A2 resolved. **Still open:** A3 (license file storage backend — suggested next), B1–B4 (Path B entity, HS-team allowlist, domain-collision flag, reject token), B6 (2FA timing), B7 (split-gate enforcement layer).
