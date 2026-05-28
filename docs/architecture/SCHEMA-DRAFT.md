# Database Schema — Living Draft

**Status:** In progress. Updated alongside each prototype phase.
**Purpose:** Capture proposed table schema EARLY — before the real DB is built — so we have prior knowledge and can avoid painful migrations.
**Audience:** You + backend engineers + anyone designing data-layer code.

> **How to read this doc:** the **Conventions** section is locked first (rules that apply to every table). Then each table has its columns + open questions. The **Migration-avoidance checklist** at the end is the 8 questions every B2B schema must answer before launch.

---

## Conventions (decide ONCE, apply to all tables)

| Convention | Decision | Why |
|---|---|---|
| Naming | `snake_case` for tables and columns | Postgres convention; consistent with SQL keywords |
| Primary keys | `id UUID DEFAULT gen_random_uuid()` | Better for distributed systems, no enumeration attacks, no FK lock contention |
| Timestamps | `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` + `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` | UTC; `updated_at` maintained via trigger |
| Soft delete | `deleted_at TIMESTAMPTZ NULL` on every table | Regulated industry needs the deleted record retrievable for audit |
| Audit columns | `created_by UUID REFERENCES person(id)` + `updated_by UUID REFERENCES person(id)` | Required for change-log primitive (DEV-29/40/41) |
| Multi-tenancy | `company_id UUID REFERENCES company(id)` on every company-scoped table | Enables Row-Level Security (RLS); fast tenant filtering |
| Encoding | UTF-8 everywhere | Internationalization-ready (DE/EN locked in MVP) |
| Enums | Defined as **lookup tables**, not Postgres native ENUM | New values without migration |
| Flexible fields | `metadata JSONB NOT NULL DEFAULT '{}'` on tables likely to expand | Kills ~80% of "add a column" migrations |
| PII encryption | **Locked 2026-05-27 (A2):** Hybrid by data class. Queryable PII (email, name, phone) → at-rest only (Supabase default) + RLS. High-sensitivity stored PII (license #, gov ID, sensitive notes) → pgcrypto column encryption, master key in Vault. Secrets (API keys, tokens) → Supabase Vault. See DECISIONS.md walkthrough locks 2026-05-27. | GDPR Art 32; right-sized protection per risk class |
| Indexes | `INDEX` for FKs, query-shaped composite indexes for common filters | Performance |

---

## Phase 1 tables

### `person`

Profile extension on top of Supabase Auth. **Identity lives in `auth.users` (Supabase-managed).** This table holds the app-side profile + company linkage.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL, REFERENCES `auth.users(id)` ON DELETE CASCADE | 1:1 with `auth.users` |
| `first_name` | VARCHAR(100) | NOT NULL | |
| `last_name` | VARCHAR(100) | NOT NULL | |
| `company_id` | UUID | NULL, REFERENCES `company(id)` | NULL until company setup completes |
| `is_superadmin` | BOOLEAN | NOT NULL DEFAULT FALSE | First user of company is Superadmin |
| `preferences` | JSONB | NOT NULL DEFAULT `'{}'` | title, phone, language, timezone (extensible) |
| `metadata` | JSONB | NOT NULL DEFAULT `'{}'` | Future fields |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `deleted_at` | TIMESTAMPTZ | NULL | |

**Owned by `auth.users` (not duplicated here):** `email` (single source of truth — A2 locked 2026-05-27 dropped the encrypted mirror; at-rest encryption + RLS sufficient), `encrypted_password` (bcrypt), `email_confirmed_at`, `last_sign_in_at`, MFA factors (`auth.mfa_factors`), OAuth identities (`auth.identities`).

**App-side email access:** via `SECURITY DEFINER` view `person_with_email` that joins `person` ⨝ `auth.users` (where `person.id = auth.users.id`) and exposes `email` to authorized roles only. RLS predicates on the view enforce tenant + role-level access. *(Pattern locked 2026-05-27 in A2 — replaces the dropped pgsodium mirror column.)*

**Indexes:**
- `INDEX(company_id)` for tenant filtering
- Email uniqueness enforced by `auth.users.email` (Supabase) — no duplicate constraint needed here

**Open questions:**
- Should `preferences` extract into a separate `person_preferences` table for searchability? → **Default:** keep as JSONB; promote later if we ever query by preference.
- ~~2FA — separate `person_2fa` table or columns on `person`?~~ → **Resolved 2026-05-25:** use Supabase Auth's `auth.mfa_factors` (TOTP supported natively).
- ~~Email verification tokens → separate `email_verification_token` table.~~ → **Resolved 2026-05-25:** Supabase Auth handles email verification flow natively.

---

### `company`

Company entities.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL | |
| `name` | VARCHAR(200) | NOT NULL | |
| `country` | CHAR(2) | NOT NULL | ISO 3166-1 alpha-2 |
| `address` | TEXT | NULL | **Encrypted at rest**; filled in company-details modal |
| `description` | TEXT | NULL | |
| `primary_products` | TEXT | NULL | Comma-separated for MVP; promote later if filtering needed |
| `website` | VARCHAR(500) | NULL | |
| `verification_status` | VARCHAR(50) | NOT NULL DEFAULT `'pending'` | FK to lookup table; values: 'pending', 'verified', 'rejected' |
| `verified_at` | TIMESTAMPTZ | NULL | |
| `verified_by` | UUID | NULL, REFERENCES `person(id)` | Hello Sello staff who verified |
| `metadata` | JSONB | NOT NULL DEFAULT `'{}'` | currency, regulatory_ids, etc. |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `deleted_at` | TIMESTAMPTZ | NULL | |

**Indexes:**
- `INDEX(verification_status)` for "show pending verifications" admin view
- `INDEX(country)` for geo queries

**Open questions:**
- Company "type" (distributor / pharmacy / both): **LOCKED — no such column.** Every company can be either at any time per deal.
- Logos / brand assets → separate `company_asset` table (likely multiple per company).
- Tax IDs, regulatory IDs (BfArM, EU-GMP, etc.) → as `metadata.regulatory_ids` for MVP; promote to columns if we filter/query by them.
- ~~File storage backend (S3 / GCS / local)~~ → **RESOLVED 2026-05-28 (A3):** Supabase Storage private bucket. License files in `company_license_file` (below); see `ARCHITECTURE-NOTES.md`.

---

### `company_license_file`

License/certificate files uploaded at company setup. **File bytes live in a Supabase Storage private bucket; this table holds metadata + the storage pointer only.** (A3 locked 2026-05-28.)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL, DEFAULT `gen_random_uuid()` | |
| `company_id` | UUID | NOT NULL, REFERENCES `company(id)` | Tenant scope + owner |
| `storage_path` | TEXT | NOT NULL | Key/path in Supabase Storage private bucket |
| `original_filename` | VARCHAR(500) | NOT NULL | User's original filename (display only) |
| `mime_type` | VARCHAR(100) | NOT NULL | Validated server-side via magic bytes |
| `file_size_bytes` | BIGINT | NOT NULL | Validated ≤ 20 MB |
| `scan_status` | VARCHAR(20) | NOT NULL DEFAULT `'pending'` | values: 'pending', 'clean', 'infected', 'scan_error' (lookup table if it grows) |
| `description` | TEXT | NULL | Optional free-text from uploader (helps HS reviewer) |
| `created_by` | UUID | NULL, REFERENCES `person(id)` | Uploader |
| `updated_by` | UUID | NULL, REFERENCES `person(id)` | |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `deleted_at` | TIMESTAMPTZ | NULL | Re-upload during pending = soft-delete old + insert new |

**Indexes:**
- `INDEX(company_id)` for fetching a company's files
- `INDEX(scan_status)` for "files pending/failed scan" queries

**Access control:** Private bucket; RLS on `storage.objects` gates download. HS-team reviewers get short-lived signed URLs. Every view/download logged to `audit_log` (`license_viewed` / `license_downloaded` — A4). Virus scan via Edge Function at upload boundary sets `scan_status`.

**Open questions:**
- Extract license number / issuing authority / expiry into structured columns here? → **Default:** not in v0 (HS reviewer reads the file directly). If extracted later, the license-number column follows A2's pgcrypto high-sensitivity tier.

---

### `group`

Custom roles defined per company (Notion-style).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL | |
| `company_id` | UUID | NOT NULL, REFERENCES `company(id)` | |
| `name` | VARCHAR(100) | NOT NULL | "Sales Team", "Approver", etc. |
| `description` | TEXT | NULL | |
| `parent_group_id` | UUID | NULL, REFERENCES `group(id)` | For future hierarchy (Senior Sales ⊂ Sales) — added now to avoid migration |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `deleted_at` | TIMESTAMPTZ | NULL | |

**Indexes:**
- `INDEX(company_id)`
- `UNIQUE(company_id, name) WHERE deleted_at IS NULL`

---

### `person_group`

Many-to-many between persons and groups. Also tracks platform-level roles like Superadmin.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL | |
| `person_id` | UUID | NOT NULL, REFERENCES `person(id)` | |
| `group_id` | UUID | NULL, REFERENCES `group(id)` | NULL when `role` is a platform role |
| `role` | VARCHAR(50) | NULL | E.g., 'superadmin' (platform-level) |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `deleted_at` | TIMESTAMPTZ | NULL | |

**Constraints:**
- `CHECK (group_id IS NOT NULL OR role IS NOT NULL)` — must have one
- `UNIQUE(person_id, group_id) WHERE deleted_at IS NULL AND group_id IS NOT NULL`
- `UNIQUE(person_id, role) WHERE deleted_at IS NULL AND role IS NOT NULL`

**Open questions:**
- Should "Superadmin" be a row in `group` instead of a special `role` field? → **Default:** keep separate — platform roles vs company-defined Groups are different concepts.

---

### `permission_matrix_entry`

Which actions each group is allowed to perform.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL | |
| `group_id` | UUID | NOT NULL, REFERENCES `group(id)` | |
| `action` | VARCHAR(100) | NOT NULL | FK to `permission_action` lookup table |
| `granted` | BOOLEAN | NOT NULL DEFAULT FALSE | |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

**Indexes:**
- `UNIQUE(group_id, action)`
- `INDEX(group_id)`

**Companion lookup table — `permission_action`:**

| Column | Type | Notes |
|---|---|---|
| `code` | VARCHAR(100) PK | E.g., 'view_deals', 'edit_pricelist' |
| `description` | TEXT | Human-readable |
| `category` | VARCHAR(50) | For grouping in UI |

---

### `contact_record`

Imported contacts via Gmail/Outlook metadata (DEV-3).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL | |
| `person_id` | UUID | NOT NULL, REFERENCES `person(id)` | Owner of this contact list |
| `email` | VARCHAR(255) | NOT NULL | **Encrypted at rest** |
| `display_name` | VARCHAR(200) | NULL | |
| `first_seen` | DATE | NULL | First email exchange date |
| `last_seen` | DATE | NULL | Most recent email exchange |
| `email_count` | INT | NOT NULL DEFAULT 0 | |
| `role` | VARCHAR(20) | NULL | 'customer', 'supplier', 'partner', 'other' (lookup table) |
| `inferred_company_id` | UUID | NULL, REFERENCES `company(id)` | Match against existing companies on platform |
| `provider` | VARCHAR(20) | NOT NULL | 'gmail' or 'outlook' (lookup table) |
| `metadata` | JSONB | NOT NULL DEFAULT `'{}'` | |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `deleted_at` | TIMESTAMPTZ | NULL | |

**Indexes:**
- `INDEX(person_id)`
- `UNIQUE(person_id, email) WHERE deleted_at IS NULL`
- `INDEX(inferred_company_id)` for "show contacts already on the platform"

**DEV-3 lock:** metadata only. NO email subjects, NO bodies, NO third-party enrichment.
`activity_bucket` (Active / Occasional / Dormant) is **computed live** from `email_count` + `last_seen`, NOT stored.

**Open questions:**
- Store OAuth refresh token to re-sync? → **Default:** yes, separate `email_integration` table per (person × provider).

---

### `pending_inbox_item`

Connection requests between companies (P↔C).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL | |
| `sender_person_id` | UUID | NOT NULL, REFERENCES `person(id)` | |
| `sender_company_id` | UUID | NOT NULL, REFERENCES `company(id)` | |
| `receiver_company_id` | UUID | NOT NULL, REFERENCES `company(id)` | |
| `note` | TEXT | NULL | Free-form message from sender |
| `status` | VARCHAR(20) | NOT NULL DEFAULT `'pending_pickup'` | FK to lookup: 'pending_pickup', 'picked_up', 'rejected' |
| `picked_up_by` | UUID | NULL, REFERENCES `person(id)` | |
| `picked_up_at` | TIMESTAMPTZ | NULL | |
| `metadata` | JSONB | NOT NULL DEFAULT `'{}'` | |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `deleted_at` | TIMESTAMPTZ | NULL | |

**Indexes:**
- `INDEX(receiver_company_id, status)` — for "show pending pickups for my company"
- `INDEX(sender_company_id)`

**Open questions:**
- Should this evolve into a generic `notification` table covering more P↔C event types? → **Phase 2 question** — answer when we have more event shapes.
- Re-requests (sender already sent one)? → **Default:** allow multiple rows; UI disables button if pending request exists.

---

### `audit_log`

Universal append-only change-log for every audited business action. **Immutable** — DB triggers reject UPDATE and DELETE. Polymorphic content reference (`content_type` + `content_id`) covers any entity type. **Tamper-evident** via SHA-256 hash chain from day 1. Full design locked 2026-05-25 (SCHEMA-DRAFT §A4 — see DECISIONS.md walkthrough locks 2026-05-25, entry "Audit log design").

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL | |
| `sequence_number` | BIGSERIAL | UNIQUE NOT NULL | Monotonic counter; gaps signal tampering |
| `company_id` | UUID | NOT NULL, REFERENCES `company(id)` | Tenant scoping; for HS-team actions on a company, this is the acted-on company |
| `actor_person_id` | UUID | NULL, REFERENCES `person(id)` | NULL when actor is non-person (sella/system/webhook) |
| `actor_type` | VARCHAR(20) | NOT NULL, REFERENCES `audit_actor_type(code)` | 'user' / 'hs_team' / 'sella' / 'system' / 'webhook' |
| `on_behalf_of_person_id` | UUID | NULL, REFERENCES `person(id)` | Triggering human when actor is agent/system. NULL = same as actor (for human actions) or no triggering human (autonomous system) |
| `action` | VARCHAR(100) | NOT NULL, REFERENCES `audit_action_type(code)` | Stripe-style `resource.action_past_tense` |
| `content_type` | VARCHAR(50) | NOT NULL, REFERENCES `auditable_content_type(code)` | 'company' / 'person' / 'pricelist' / 'deal_card' / 'person_group' / etc. |
| `content_id` | UUID | NOT NULL | Polymorphic ref — not DB-enforced (varies by content_type) |
| `before_diff` | JSONB | NULL | Diff of fields that changed (only changed fields, NOT full row). NULL for pure creation. |
| `after_diff` | JSONB | NULL | Same shape as before_diff. NULL for pure deletion. |
| `reason` | TEXT | NULL | Free-text reason (mandatory for `verify_rejected`; usually NULL) |
| `metadata` | JSONB | NOT NULL DEFAULT `'{}'` | IP, user_agent, `agent_id` (in metadata until promoted), session_id, related entity refs |
| `reverses_audit_id` | UUID | NULL, REFERENCES `audit_log(id)` | When NOT NULL, this row IS a reversal of the row it points to (compensating event pattern) |
| `prev_entry_hash` | BYTEA | NULL | SHA-256 of the previous row's `entry_hash` (NULL for first row) |
| `entry_hash` | BYTEA | NOT NULL | SHA-256 of (this row's canonical bytes + prev_entry_hash) |
| `hmac_schema_version` | SMALLINT | NOT NULL DEFAULT 1 | Lets us migrate to a new hash scheme later without breaking old rows |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

**No `deleted_at` / soft delete** — audit log is the source of truth for what happened; nothing is deleted.

**Indexes:**
- `INDEX(company_id, created_at DESC)` — "show audit for this company over time"
- `INDEX(content_type, content_id)` — "show audit for this specific entity"
- `INDEX(actor_person_id)` — "what did this person do"
- `INDEX(action)` — filter by action type
- `INDEX(sequence_number)` — gap detection during chain verification

**DB-level enforcement (immutability + hash chain):**
- `BEFORE UPDATE` trigger → raise exception (immutable)
- `BEFORE DELETE` trigger → raise exception (except via privileged `gdpr_scrub_audit_log()` function)
- `BEFORE INSERT` trigger → compute `prev_entry_hash` (advisory lock around append) and `entry_hash` from canonical serialization of this row
- Dedicated app role (`app_writer`) granted INSERT/SELECT only; UPDATE/DELETE/TRUNCATE revoked (defense in depth)

**GDPR scrub** (principle locked, implementation deferred to build phase):
- Pseudonymization (not hard delete) of `actor_person_id`, `on_behalf_of_person_id`, PII fields inside `before_diff`/`after_diff`, `reason`, `metadata`
- Replace person references with sentinel UUID `'00000000-0000-0000-0000-000000000000'`
- Meta-audit: scrub itself logged as a new row with `action='person.gdpr_scrubbed'`
- Recompute downstream hashes after scrub (preserves chain validity for non-scrubbed segments)
- Privileged `SECURITY DEFINER` function, EXECUTE restricted to HS team role

**Open questions (build-phase or future):**

| # | Item | When |
|---|---|---|
| Canonical serialization rules for hash chain | Alphabetically sorted JSON keys, ISO 8601 UTC timestamps, UTF-8 encoding. JCS standard recommended. | Build phase |
| GDPR scrub function implementation details | Sentinel UUID approach, PII field path enumeration, recompute-hash helper | Build phase |
| Backup retention vs scrubbed data policy | TBD when backups configured | Phase 2 |
| **Reversibility tier taxonomy** | Column `audit_action_type.reversibility_tier VARCHAR(15) NULL` exists in MVP. Tier values + per-action assignments deferred until: Layer 1 §10 multi-Sella architecture lock + Layer 4 §4 autonomy ladder + DEV-29 e-signature semantics. When all three land → classify each action_type, optionally add CHECK constraint. | Post-MVP |

**Planned additions (industry-aligned, deferred):**

| Addition | Trigger to add |
|---|---|
| `agent_id` as proper column (currently in `metadata.agent_id` JSONB) | When Sella taxonomy stabilizes (Layer 1 §10 multi-Sella architecture lock) |
| `tool_name` column | When Sella tool layer ships (post-MVP, ties to DEV-11) |
| `delegation_scope` column | Only if external-callable agents introduced (Phase 3+) |
| Partitioning by month via `pg_partman` | Trigger / strategy / migration TBD. Skip TimescaleDB (deprecated on Supabase Postgres 17). |
| Selective mirror of business-relevant auth events (`person.created`, `person.email_verified`, `person.mfa_enabled`) from `auth.audit_log_entries` | When SOC 2 prep wants single-table queries OR specific audit query needs it |
| PGAudit complement for security forensics (separate from this business audit) | Phase 2 — when security investigation needs raw-SQL audit |

---

### `audit_actor_type` (lookup)

| Column | Type | Notes |
|---|---|---|
| `code` | VARCHAR(20) PK | E.g., 'user', 'sella' |
| `description` | TEXT NOT NULL | Human-readable |

**Seed values:** 'user', 'hs_team', 'sella', 'system', 'webhook'

---

### `audit_action_type` (lookup)

| Column | Type | Notes |
|---|---|---|
| `code` | VARCHAR(100) PK | Stripe-style `resource.action_past_tense` (e.g., 'company.verify_approved') |
| `description` | TEXT NOT NULL | Human-readable for UI |
| `category` | VARCHAR(50) NOT NULL | For filtering: 'verification' / 'access' / 'pricing' / 'permissions' / 'esignature' / 'lifecycle' / 'compliance' |
| `reversibility_tier` | VARCHAR(15) NULL | Taxonomy + per-action assignments deferred — see audit_log open Qs |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |

**MVP seed values:**

| code | description | category |
|---|---|---|
| `company.verify_approved` | HS team approved a company verification | `verification` |
| `company.verify_rejected` | HS team rejected a company verification | `verification` |
| `company.verify_reverted` | A prior verification decision was reversed | `verification` |
| `company.license_viewed` | HS team viewed a company license document | `access` |
| `company.license_downloaded` | HS team downloaded a company license document | `access` |
| `pricelist.published` | A user published a pricelist | `pricing` |
| `pricelist.amended` | A pricelist was edited | `pricing` |
| `permission.granted` | A permission was granted to a Group | `permissions` |
| `permission.revoked` | A permission was revoked from a Group | `permissions` |
| `esignature.signed` | A user e-signed an approval | `esignature` |
| `person.soft_deleted` | An entity was soft-deleted | `lifecycle` |
| `person.gdpr_scrubbed` | PII was scrubbed for GDPR right-to-be-forgotten | `compliance` |

(More added per feature as they ship.)

---

### `auditable_content_type` (lookup)

| Column | Type | Notes |
|---|---|---|
| `code` | VARCHAR(50) PK | E.g., 'company', 'pricelist' |
| `description` | TEXT NOT NULL | Human-readable |
| `target_table` | VARCHAR(50) NOT NULL | The table `content_id` usually points to |

**MVP seed values:** 'company', 'person', 'pricelist', 'deal_card', 'person_group', 'group', 'permission_matrix_entry', 'pending_inbox_item' (more added as schema grows)

---

## Open questions to research before locking the schema

### ~~PII encryption — which mechanism?~~ → RESOLVED 2026-05-27

**Resolved 2026-05-27 — hybrid by data class.** See DECISIONS.md walkthrough locks 2026-05-27 — "PII encryption mechanism (A2)". Summary:

- **Queryable PII** (email, name, phone) → at-rest only (Supabase default) + RLS. No column encryption — column-encrypting these breaks WHERE/JOIN and is flagged by industry guidance as over-encryption.
- **High-sensitivity stored PII** (license #, gov ID, sensitive freeform notes) → **pgcrypto** column encryption, master key in Supabase Vault, accessed via `SECURITY DEFINER` functions.
- **Secrets** (API keys, OAuth tokens, webhook signatures) → **Supabase Vault** (its actual designed use case).
- **pgsodium dropped** — Supabase officially deprecated it ("DO NOT RECOMMEND any new usage"). `person.email_encrypted` mirror removed from §person table; replaced by `SECURITY DEFINER` view pattern.
- **GDPR Art 17** (right-to-erasure) handled via A4 pseudonymization principle (already locked). Per-subject crypto-shred deferred unless regulator pressure.

Sources: Supabase pgsodium deprecation notice + Discussion #27109, Supabase Vault docs, EDB "PII Horror Story" Postgres best practices, Crunchy Data encryption guidebook, Stormatics PII protection.

---

### Auth/onboarding walkthrough — additional open questions (2026-05-25)

Surfaced by the 2026-05-25 walkthrough locks (DECISIONS.md "Walkthrough locks 2026-05-25 — onboarding & authentication flow"). Resolve before writing Phase 1 migrations.

| # | Question | Type | Affects |
|---|---|---|---|
| A1 | ~~**Supabase Auth (`auth.users`) vs. roll own `person.password_hash`?**~~ → **RESOLVED 2026-05-25 — Supabase Auth + mirror pattern.** See DECISIONS.md walkthrough locks 2026-05-25, entry "Auth model". | ~~Hard blocker~~ Resolved | `person`, email-verify token table, 2FA design |
| A3 | ~~**License file storage backend**~~ → **RESOLVED 2026-05-28.** Supabase Storage private bucket + at-rest (AES-256) + RLS + signed URLs; Edge-Function virus scan at upload boundary; allowlist {PDF,JPG,PNG,HEIC} + magic bytes; 20 MB/file, max 5; new `company_license_file` child table (above), `company.license_filename` dropped. See DECISIONS.md walkthrough locks 2026-05-28 — A3. | ~~Hard blocker~~ Resolved | New `company_license_file` table; `company.license_filename` removed |
| A4 | ~~**Promote `audit_log` to Phase 1.**~~ → **RESOLVED 2026-05-25 — full audit_log design locked** (Q1–Q10 walked through with industry research). See `audit_log` table block above + DECISIONS.md walkthrough locks 2026-05-25 "Audit log design". Phase 1 ships: polymorphic single table + JSONB diffs + dual-identity actor + hash chain + reversibility tier + GDPR pseudonymization principle. | ~~Hard blocker~~ Resolved | New Phase 1 table built with hash chain + reversibility + dual identity |
| B1 | **Path B "join request" entity** — new `join_request` table or reuse `pending_inbox_item`? Multi-Superadmin company: any Superadmin reviews or routed to one? | Soft default | New table or schema change |
| B2 | **HS-team allowlist** — `person.is_hs_team` column, separate `hs_team_member` table, or env-var allowlist consumed by middleware? | Soft default | `person` schema or new tiny table |
| B3 | **Domain-collision override flag** — when user picks "new company" despite domain match, where does the silent flag live? `company.metadata.domain_collision_override` or column on review-queue entry? | Soft default | `company.metadata` or review entry |
| B4 | **Reject reason + resubmit token** — `company.rejection_reason TEXT`? Token-based resubmit link (UUID, expiry)? | Soft default | `company` columns or new `email_token` table |
| B5 | ~~**`email_verification_token` table schema**~~ → **RESOLVED 2026-05-25** via A1 lock (Supabase Auth owns this). | ~~Soft default~~ Resolved | No new table needed |
| B6 | **2FA enforcement timing — DEV-29 conflict.** *Factor storage resolved via A1 → `auth.mfa_factors`.* Open: required pre-first-e-signature? Optional for non-signing users? Which factor (TOTP / SMS / email)? | Soft default | Auth flow timing only |
| B7 | **Split-gate enforcement layer** — locked at "action-policy layer, not session/auth layer". Mechanism: RLS, server-side per-RPC checks, middleware, or policy DSL? Ties to [DEV-51](https://linear.app/hellosello/issue/DEV-51) (16-combo matrix encoding). | Architecture (no schema) | Cross-cutting |

**Suggested resolution order:** ~~A1~~ → ~~A4~~ → ~~A2~~ → ~~A3~~ → **B-series next (any order)** → B7 last (architecture-only, not schema). *(A1 + A4 resolved 2026-05-25; A2 resolved 2026-05-27; A3 resolved 2026-05-28.)*

---

## Migration-avoidance checklist — the 8 questions

The questions every B2B schema must answer **before launch**. Wrong defaults here = painful migrations later.

| # | Question | Locked default | Why |
|---|---|---|---|
| 1 | ID type — auto-increment integer or UUID? | **UUID** | Distributed systems, no enumeration attacks, no FK lock contention |
| 2 | Soft-delete — `deleted_at` on every table? | **Yes** | B2B almost always needs deleted records for audit |
| 3 | Audit columns — `created_at`, `updated_at`, `created_by`, `updated_by` on every table? | **Yes** | Regulated industry requires audit trail (DEV-29/40/41) |
| 4 | Multi-tenancy — every row carries `company_id`? | **Yes** | Even on derived tables, for RLS / fast filtering |
| 5 | GDPR right-to-be-forgotten — delete or anonymize? | **Anonymize** | Keep referential integrity; null PII columns |
| 6 | PII encryption — encrypt email, phone, address at rest? | **Yes (principle locked)** · Mechanism still open — see Open Questions | GDPR compliance; reduces blast radius |
| 7 | Enums — Postgres native ENUM, lookup table, or string? | **Lookup table** | Add values without migration |
| 8 | Flexible metadata — `metadata JSONB` column? | **Yes** on tables likely to expand | Kills 80% of "add a column" migrations |

---

## Coming in Phase 2 (tracked for future)

These tables aren't built yet but will follow the same conventions:

| Table | Phase | Notes |
|---|---|---|
| `relationship` | 2 | Created at pickup (P↔C → P↔P transition) |
| `relationship_note` | 2 | Per-side notes; private to each company |
| `pricelist` (master, standard, custom-per-relationship) | 2 | Three layers per DEV-1 |
| `chat_message`, `chat_thread` | 2/3 | P↔P chat |
| `deal_card`, `deal_card_version` | 3 | Git-style version history |
| `deal_workspace`, `deal_room` | 3 | Containers |
| `thing` | 3 | Universal execution primitive |
| `order` (with PO#/SO#/HS#/QR) | 4 | Generated at confirmation |
| `audit_log` | ~~Cross-cutting~~ **Promoted to Phase 1** (see open Qs §A4) | Universal change-log primitive — needed for HS verify flow |

---

## Cross-references

| Resource | Purpose |
|---|---|
| [`docs/architecture/ARCHITECTURE-NOTES.md`](./ARCHITECTURE-NOTES.md) | Engineering implications scratchpad (high level) |
| [`docs/architecture/CONTEXT.md`](./CONTEXT.md) | Domain glossary |
| [`docs/decisions/DECISIONS.md`](../decisions/DECISIONS.md) | Locked product decisions |
| [`docs/product/layers/`](../product/layers/) | LAYER-1 through LAYER-5 |
| [`prototypes/phase-1-onboarding/HANDOFF.md`](../../prototypes/phase-1-onboarding/HANDOFF.md) | Frontend handoff for these screens |

---

*This file is a working draft. Append-only as new phases land. Don't delete old open questions — answer them inline and keep the history.*
