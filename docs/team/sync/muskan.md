# Muskan - Agent Sync State

> **This file is owned by Muskan's agent only.** Ayush's agent reads but never writes here.
> See [../WORKFLOW.md](../WORKFLOW.md#sync-ritual) for the full sync protocol.

---

**Last updated:** 2026-05-28 08:24 UTC
**Branch:** claude/muskan/work
**Status:** idle
**Linear issue in progress:** none
**Shared files locked:** none
**PR open:** #25 (Phase 1 prototype + SCHEMA-DRAFT, base=dev).

---

## Notes for the other agent

Recent session(s): **A2 (PII encryption) locked 2026-05-27** + **A3 (license file storage) locked 2026-05-28.**

**A3 — license file storage (2026-05-28):**
- **Backend = Supabase Storage** private bucket (chosen over direct S3 — RLS reuses `auth.uid()`, no second vendor).
- **Encryption = AES-256 at-rest (default) + RLS + short-lived signed URLs.** No app-layer file encryption in v0 (files must be human-reviewed by HS team; deferred unless regulator demands provider-blind storage).
- **Virus scan = Edge Function at upload boundary** (no Supabase built-in), synchronous for v0.
- **Validation = allowlist {PDF,JPG,PNG,HEIC} + server-side magic bytes; 20 MB/file, max 5.**
- **Schema = new `company_license_file` child table** (metadata + storage pointer; `scan_status`, soft-delete for re-upload). **`company.license_filename` dropped** (single column couldn't hold multi-file + per-file scan status).
- Views/downloads logged to `audit_log` (`license_viewed` / `license_downloaded` — A4).

**A2 recap (2026-05-27):** pgsodium dropped (Supabase deprecated it). Hybrid PII encryption: queryable PII (email/name/phone) → at-rest + RLS; high-sensitivity (license #, gov ID) → pgcrypto + Vault key; secrets → Vault. `person.email_encrypted` dropped; `SECURITY DEFINER` view `person_with_email` replaces the mirror. **⚠️ Ayush:** your PR #25 prototype may reference `email_encrypted` — needs a scan/cleanup under the new A2 lock.

Files touched across both sessions: DECISIONS.md (two new dated subsections — 2026-05-27 A2, 2026-05-28 A3), SCHEMA-DRAFT.md (person rewrite, new `company_license_file` table, `license_filename` dropped, A2+A3 open Qs closed), ARCHITECTURE-NOTES.md (Auth + PII strategy + license-storage bullets).

Open Qs status: A1 + A2 + A3 + A4 all resolved. **Still open:** B1–B4 (Path B entity, HS-team allowlist, domain-collision flag, reject token), B6 (2FA timing), B7 (split-gate enforcement layer — architecture-only).
