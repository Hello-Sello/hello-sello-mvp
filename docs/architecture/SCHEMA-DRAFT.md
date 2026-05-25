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
| PII encryption | **Principle locked:** PII columns (`email`, `phone`, `address`) will be encrypted at rest. **Mechanism: OPEN** — see open questions section | GDPR compliance; reduces blast radius of breaches |
| Indexes | `INDEX` for FKs, query-shaped composite indexes for common filters | Performance |

---

## Phase 1 tables

### `person`

Users of the platform.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL | Generated server-side |
| `first_name` | VARCHAR(100) | NOT NULL | |
| `last_name` | VARCHAR(100) | NOT NULL | |
| `email` | VARCHAR(255) | NOT NULL | **Encrypted at rest** |
| `password_hash` | TEXT | NOT NULL | bcrypt or argon2 |
| `email_verified` | BOOLEAN | NOT NULL DEFAULT FALSE | |
| `verified_at` | TIMESTAMPTZ | NULL | When email verified |
| `company_id` | UUID | NULL, REFERENCES `company(id)` | NULL until company setup completes |
| `is_superadmin` | BOOLEAN | NOT NULL DEFAULT FALSE | First user of company is Superadmin |
| `preferences` | JSONB | NOT NULL DEFAULT `'{}'` | title, phone, language, timezone (extensible) |
| `metadata` | JSONB | NOT NULL DEFAULT `'{}'` | Future fields |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `deleted_at` | TIMESTAMPTZ | NULL | |

**Indexes:**
- `UNIQUE(email) WHERE deleted_at IS NULL`
- `INDEX(company_id)` for tenant filtering

**Open questions:**
- Should `preferences` extract into a separate `person_preferences` table for searchability? → **Default:** keep as JSONB; promote later if we ever query by preference.
- 2FA — separate `person_2fa` table or columns on `person`? → **Default:** separate table (only some users enable 2FA).
- Email verification tokens → separate `email_verification_token` table.

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
| `license_filename` | VARCHAR(500) | NULL | Path/key in object storage |
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
- File storage backend (S3 / GCS / local) → see `ARCHITECTURE-NOTES.md`.

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

## Open questions to research before locking the schema

### PII encryption — which mechanism?

**Locked:** we will encrypt PII (`email`, `phone`, `address`) at rest.
**Open:** which mechanism to use. Research and decide before writing the first migration.

| Option | How | When to pick |
|---|---|---|
| A. SQL functions | App code explicitly calls `encrypt()` / `decrypt()` in queries | Most control, but verbose app code |
| B. Triggers on INSERT/UPDATE | DB auto-encrypts writes before storing | App code stays clean; logic hidden in DB |
| C. Views for SELECT | A view auto-decrypts reads | Pair with (B) for transparent encryption both ways |
| D. Supabase Edge Function | Encrypt in TypeScript before sending to DB | Use if key must live in external KMS, not Vault |
| E. Declarative (newer Supabase features) | Mark column as encrypted, Supabase handles it | Simplest if available + matches our needs |

**Research tasks before deciding:**
- Confirm which encryption extensions Supabase supports out-of-the-box (`pgsodium`, `pgcrypto`, others?)
- Confirm how Supabase Vault integrates with each
- Test performance impact on inserts/reads with realistic row counts
- Decide where the encryption key lives (Vault vs external KMS)
- Check OWASP + GDPR Article 32 requirements for the chosen mechanism
- Confirm with Ayush — does any choice affect his React app's contract?

**To revisit:** before the first migration that creates the `person` table for real.

---

### Auth/onboarding walkthrough — additional open questions (2026-05-25)

Surfaced by the 2026-05-25 walkthrough locks (DECISIONS.md "Walkthrough locks 2026-05-25 — onboarding & authentication flow"). Resolve before writing Phase 1 migrations.

| # | Question | Type | Affects |
|---|---|---|---|
| A1 | **Supabase Auth (`auth.users`) vs. roll own `person.password_hash`?** Decides whether `person` owns auth or just profile data. Cascades into email-verify, password reset, 2FA shape. | Hard blocker | `person`, email-verify token table, 2FA design |
| A3 | **License file storage backend** — Supabase Storage vs. S3 + encryption-at-rest mechanism; virus-scan tool; file size/count limits (working: ~10-25 MB/file, ≤5-10 files). | Hard blocker | `company.license_filename` semantics; ties to PII encryption above |
| A4 | **Promote `audit_log` to Phase 1.** HS team approve/reject is audit-logged (DEV-41 change-log primitive). Schema: `{id, actor_person_id, timestamp, content_type, content_id, action, before_diff, after_diff, reason}`. | Hard blocker | New Phase 1 table |
| B1 | **Path B "join request" entity** — new `join_request` table or reuse `pending_inbox_item`? Multi-Superadmin company: any Superadmin reviews or routed to one? | Soft default | New table or schema change |
| B2 | **HS-team allowlist** — `person.is_hs_team` column, separate `hs_team_member` table, or env-var allowlist consumed by middleware? | Soft default | `person` schema or new tiny table |
| B3 | **Domain-collision override flag** — when user picks "new company" despite domain match, where does the silent flag live? `company.metadata.domain_collision_override` or column on review-queue entry? | Soft default | `company.metadata` or review entry |
| B4 | **Reject reason + resubmit token** — `company.rejection_reason TEXT`? Token-based resubmit link (UUID, expiry)? | Soft default | `company` columns or new `email_token` table |
| B5 | **`email_verification_token` table schema** — already defaulted "separate table" but no schema. Token expiry, resend rate-limit rules. | Soft default | New table |
| B6 | **2FA enforcement timing — DEV-29 conflict.** DEV-29 requires 2FA-authenticated login for e-signature actions; onboarding doesn't enforce 2FA setup. Required pre-first-e-signature? Optional for non-signing users? Factor (TOTP / SMS / email)? | Soft default | `person_2fa` table + auth flow |
| B7 | **Split-gate enforcement layer** — locked at "action-policy layer, not session/auth layer". Mechanism: RLS, server-side per-RPC checks, middleware, or policy DSL? Ties to [DEV-51](https://linear.app/hellosello/issue/DEV-51) (16-combo matrix encoding). | Architecture (no schema) | Cross-cutting |

**Suggested resolution order:** A1 → A4 → A2 (PII encryption above) → A3 → B-series in any order → B7 last (architecture-only, not schema).

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
