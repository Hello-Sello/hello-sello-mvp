# Muskan - Agent Sync State

> **This file is owned by Muskan's agent only.** Ayush's agent reads but never writes here.
> See [../WORKFLOW.md](../WORKFLOW.md#sync-ritual) for the full sync protocol.

---

**Last updated:** 2026-05-29 13:04 UTC
**Branch:** claude/muskan/work
**Status:** idle
**Linear issue in progress:** none
**Shared files locked:** none
**PR open:** #25 (Phase 1 prototype + SCHEMA-DRAFT, base=dev).

---

## Notes for the other agent

🎯 **ALL architecture-shaping open questions are now resolved.** Recent locks: A2 (PII) 2026-05-27 · A3 (license storage) 2026-05-28 · B7 (enforcement layer) + B1 (join-request entity) 2026-05-29. Remaining open Qs (B2/B3/B4/B6) are build/mechanism — decide at build, not blocking architecture.

**B1 — Path B join-request entity (2026-05-29):** **Dedicated `join_request` table** (new), NOT a reuse of `pending_inbox_item`. DDD aggregate-boundary call: `pending_inbox_item` = company↔company connection; a join request = a *person* → *company* membership request where **approval grants membership** (sets `person.company_id` + role) — different invariants, language, lifecycle, side-effect. New table: `requester_person_id`, `target_company_id` (may be still-pending company), `status` {pending/approved/rejected/cancelled}, `note`, `decided_by`, `decided_at`, `rejection_reason`, + standard cols. Multi-Superadmin routing defaulted to "any Superadmin of target company" (build detail). Approve/reject → `audit_log` (content_type `'join_request'`).

**B7 — access-policy enforcement layer (2026-05-29):** **Layered / defense-in-depth.** RLS = security floor (tenant isolation via `company_id` + `auth.uid()`); central app-layer policy module = complex authorization (split-gate + DEV-51 16-combo matrix), NOT scattered inline checks. Policy DSL (OPA/Oso) deferred. Architecture-only. **Unblocks DEV-51.**

**A3 recap (2026-05-28):** License files → Supabase Storage private bucket, AES-256 at-rest + RLS + signed URLs, Edge-Function virus scan, allowlist {PDF,JPG,PNG,HEIC} + magic bytes, 20 MB/max 5. New `company_license_file` child table; `company.license_filename` dropped.

**A2 recap (2026-05-27):** pgsodium dropped (Supabase deprecated). Hybrid PII encryption: queryable → at-rest + RLS; high-sensitivity → pgcrypto + Vault key; secrets → Vault. `person.email_encrypted` dropped → `SECURITY DEFINER` view `person_with_email`. **⚠️ Ayush:** PR #25 prototype may reference `email_encrypted` — needs a scan/cleanup under the new A2 lock.

Schema now has two new tables since you last looked: **`company_license_file`** (A3) and **`join_request`** (B1). `company.license_filename` removed.

Open Qs status: **A1+A2+A3+A4+B1+B7 resolved (all architecture done).** Remaining (build/mechanism, deferred): **B2** (HS-team allowlist location), **B3** (domain-collision flag location), **B4** (reject reason + resubmit token), **B6** (2FA enforcement timing).
