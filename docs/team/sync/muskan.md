# Muskan - Agent Sync State

> **This file is owned by Muskan's agent only.** Ayush's agent reads but never writes here.
> See [../WORKFLOW.md](../WORKFLOW.md#sync-ritual) for the full sync protocol.

---

**Last updated:** 2026-05-29 12:55 UTC
**Branch:** claude/muskan/work
**Status:** idle
**Linear issue in progress:** none
**Shared files locked:** none
**PR open:** #25 (Phase 1 prototype + SCHEMA-DRAFT, base=dev).

---

## Notes for the other agent

Recent locks: **A2 (PII encryption) 2026-05-27** · **A3 (license file storage) 2026-05-28** · **B7 (enforcement layer) 2026-05-29.**

**B7 — split-gate / access-policy enforcement layer (2026-05-29):** **Layered / defense-in-depth.** Postgres **RLS = security floor** (tenant isolation via `company_id` + `auth.uid()`; DB blocks cross-tenant rows even if app code has a bug). **Central app-layer policy module = complex authorization** — the split-gate (verified/pending) + the DEV-51 16-combo cross-company matrix live in ONE authoritative module called by every protected action/RPC, NOT scattered inline checks. RLS deliberately not used for the complex matrix. Policy DSL (OPA/Oso) deferred until the hand-written matrix outgrows maintainable code. Architecture-only (no schema). **Unblocks DEV-51.**

**Triage note for the B-series:** B7 + B1 are the only architecture-shaping doubts. **B1** (Path B join-request entity — new table vs reuse `pending_inbox_item`) is the next architecture call. **B2/B3/B4/B6** reclassified as build/mechanism (concepts already locked; where-the-field-lives / which-technique) — decide at build, not now.

**A3 recap (2026-05-28):** License files → Supabase Storage private bucket, AES-256 at-rest + RLS + signed URLs, Edge-Function virus scan, allowlist {PDF,JPG,PNG,HEIC} + magic bytes, 20 MB/max 5. New `company_license_file` child table; `company.license_filename` dropped. No app-layer file encryption in v0.

**A2 recap (2026-05-27):** pgsodium dropped (Supabase deprecated). Hybrid PII encryption: queryable (email/name/phone) → at-rest + RLS; high-sensitivity (license #, gov ID) → pgcrypto + Vault key; secrets → Vault. `person.email_encrypted` dropped → `SECURITY DEFINER` view `person_with_email`. **⚠️ Ayush:** PR #25 prototype may reference `email_encrypted` — needs a scan/cleanup under the new A2 lock.

Files touched (this B7 session): DECISIONS.md (new 2026-05-29 B7 subsection), ARCHITECTURE-NOTES.md (Access policy section — resolved the "under research" line + added layered-enforcement bullet), SCHEMA-DRAFT.md (B7 open Q closed + resolution order/triage updated). No schema changes.

Open Qs status: **A1 + A2 + A3 + A4 + B7 resolved.** Remaining: **B1** (architecture — next), **B2/B3/B4/B6** (build/mechanism — deferred to build).
