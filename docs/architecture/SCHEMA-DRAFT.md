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
| Audit columns | `created_by` + `updated_by` (UUID → person(id)) on every **business** table; **pure junctions** (`person_group`, `company_type_assignment`) and the self-owned `person` profile are exempt. `deleted_by` pairs with `deleted_at` where an inline "who removed it" helps. | Required for change-log primitive (DEV-29/40/41); `audit_log` remains the legal trail |
| Multi-tenancy | `company_id UUID REFERENCES company(id)` on every company-scoped table | Enables Row-Level Security (RLS); fast tenant filtering |
| Encoding | UTF-8 everywhere | Internationalization-ready (DE/EN locked in MVP) |
| Enums | Defined as **lookup tables**, not Postgres native ENUM. Store/reference the stable `code` (e.g. `view_deals`), never display labels. | New values without migration; user-facing labels (EN/DE) are translated in the app keyed off `code`, so wording can change without touching stored data |
| Flexible fields | `metadata JSONB NOT NULL DEFAULT '{}'` on tables likely to expand | Kills ~80% of "add a column" migrations |
| PII encryption | **Locked 2026-05-27 (A2):** Hybrid by data class. Queryable PII (email, name, phone) → at-rest only (Supabase default) + RLS. High-sensitivity stored PII (license #, gov ID, sensitive notes) → pgcrypto column encryption, master key in Vault. Secrets (API keys, tokens) → Supabase Vault. See DECISIONS.md walkthrough locks 2026-05-27. | GDPR Art 32; right-sized protection per risk class |
| Indexes | `INDEX` for FKs, query-shaped composite indexes for common filters | Performance |

**Planned additions (deferred — additive, no migration penalty):**
- **Optimistic-lock `version INTEGER`** on collaboratively-edited tables (`company`, `group`, `permission_matrix_entry`, + future `pricelist` / `deal_card`) → add when team/multi-user editing ships. v0 is one-user-per-company, so no write conflicts yet; the later add is a plain additive column. (Schema review 2026-06-06.)
- **UUID v7 for PKs** — staying on **v4** (`gen_random_uuid()`) for now; v7 needs PG18-native `uuidv7()` or the `pg_uuidv7` extension (neither on Supabase PG17 yet). v4→v7 later is a cheap **default swap** (same `uuid` type — no FK re-key). Revisit when Supabase ships native v7 **or** `audit_log` grows large. (Decision 2026-06-06 — see DECISIONS.md.)

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
- ~~`is_superadmin` boolean on `person`?~~ → **Dropped 2026-06-06.** Single source of truth for Superadmin is `person_group` (role=`'superadmin'`); a privilege flag on the user's own row risked self-escalation and duplicated the role record.
- ~~2FA — separate `person_2fa` table or columns on `person`?~~ → **Resolved 2026-05-25:** use Supabase Auth's `auth.mfa_factors` (TOTP supported natively).
- ~~Email verification tokens → separate `email_verification_token` table.~~ → **Resolved 2026-05-25:** Supabase Auth handles email verification flow natively.
- Onboarding checklist state? → **Resolved 2026-06-06:** "done" is *derived* (gmail = a `contact_record` exists; team = a `group` exists; profile = `preferences.title` set), not stored. Only `dismissed` persisted in `metadata`. "Skipped" is analytics → future `analytics_event` table (see Coming-later), never a column on `person`.

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
| `verification_status` | VARCHAR(50) | NOT NULL DEFAULT `'pending'`, REFERENCES `company_verification_status(code)` | 'pending', 'verified', 'rejected' |
| `verified_at` | TIMESTAMPTZ | NULL | |
| `verified_by` | UUID | NULL, REFERENCES `person(id)` | Hello Sello staff who verified |
| `metadata` | JSONB | NOT NULL DEFAULT `'{}'` | currency, regulatory_ids, etc. |
| `created_by` | UUID | NULL, REFERENCES `person(id)` | Founding user who created the company |
| `updated_by` | UUID | NULL, REFERENCES `person(id)` | |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `deleted_by` | UUID | NULL, REFERENCES `person(id)` | Who soft-deleted (pairs with `deleted_at`) |
| `deleted_at` | TIMESTAMPTZ | NULL | |

**Indexes:**
- `INDEX(verification_status)` for "show pending verifications" admin view
- `INDEX(country)` for geo queries

**Open questions:**
- Company buy/sell "type" (distributor / pharmacy / both *as a deal role*): **LOCKED — no such column.** Buyer/seller is per-deal, driven by actions. *(Distinct from business **category** — see next line.)*
- Company business **category** (Cultivator / Wholesaler / Importer / Pharmacy …): **Added 2026-06-06 (Marcel).** Multi-select, asked at company setup — a stable "what this business is" attribute, NOT a buy/sell role. Stored via new `company_type` lookup + `company_type_assignment` junction (a company can hold several — vertically-integrated cannabis firms commonly do). NOT a column on `company`.
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
| `scan_status` | VARCHAR(20) | NOT NULL DEFAULT `'pending'`, REFERENCES `license_scan_status(code)` | 'pending', 'clean', 'infected', 'scan_error' |
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

### `company_type` (lookup)

The fixed list of business categories a company can identify as (its position in the supply chain). Lookup table so new categories are added without a migration. **Business category, not a buy/sell role** (buyer/seller is per-deal). (Added 2026-06-06 — Marcel.)

| Column | Type | Notes |
|---|---|---|
| `code` | VARCHAR(30) PK | e.g. `cultivator`, `wholesaler`, `importer`, `pharmacy` |
| `description` | TEXT NOT NULL | Human-readable; EN/DE translated in the app (store the code, not the label) |
| `sort_order` | SMALLINT NOT NULL DEFAULT 0 | Display order in the multi-select |

**Seed values:** `cultivator`, `wholesaler`, `importer`, `pharmacy` (more added as the market needs).

---

### `company_type_assignment`

Many-to-many link: which business categories a company has. A company can hold several (e.g. cultivator + importer + wholesaler — vertically-integrated cannabis firms commonly do). (Added 2026-06-06 — Marcel.)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL, DEFAULT `gen_random_uuid()` | |
| `company_id` | UUID | NOT NULL, REFERENCES `company(id)` | The company |
| `company_type_code` | VARCHAR(30) | NOT NULL, REFERENCES `company_type(code)` | One of its categories |
| `created_by` | UUID | NULL, REFERENCES `person(id)` | Who set it |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `deleted_at` | TIMESTAMPTZ | NULL | Soft-delete to remove a category |

**Constraints:**
- `UNIQUE(company_id, company_type_code) WHERE deleted_at IS NULL` — no duplicate category per company

**Indexes:**
- `INDEX(company_id)` — a company's categories
- `INDEX(company_type_code)` — "show all pharmacies" / category filtering on Discover

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
| `created_by` | UUID | NULL, REFERENCES `person(id)` | |
| `updated_by` | UUID | NULL, REFERENCES `person(id)` | |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `deleted_by` | UUID | NULL, REFERENCES `person(id)` | Who soft-deleted (pairs with `deleted_at`) |
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
- **2026-06-06:** `person_group` (role=`'superadmin'`) is the **single source of truth** for Superadmin — the duplicate `person.is_superadmin` boolean was dropped.

---

### `permission_matrix_entry`

Which actions each group is allowed to perform.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL | |
| `company_id` | UUID | NOT NULL, REFERENCES `company(id)` | Denormalized from the group for direct RLS; MUST equal `group.company_id` (never moves) |
| `group_id` | UUID | NOT NULL, REFERENCES `group(id)` | |
| `action` | VARCHAR(100) | NOT NULL | FK to `permission_action` lookup table |
| `granted` | BOOLEAN | NOT NULL DEFAULT FALSE | |
| `created_by` | UUID | NULL, REFERENCES `person(id)` | Who set this grant |
| `updated_by` | UUID | NULL, REFERENCES `person(id)` | Who last toggled it |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

**Indexes:**
- `UNIQUE(group_id, action)`
- `INDEX(group_id)`
- `INDEX(company_id)` — tenant filtering for RLS

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
| `role` | VARCHAR(20) | NULL | 'customer', 'supplier', 'partner', 'prospect', 'other' (lookup table); **NULL = not yet classified** (don't store 'unknown') |
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

### `inbox_request_type` (lookup)

The kind of inbound request an inbox item represents. Lookup table so a new type is an INSERT, not a migration (Ayush 2026-06-06: anything new is just "connect + some payload"). (Added 2026-06-06.)

| Column | Type | Notes |
|---|---|---|
| `code` | VARCHAR(30) PK | `connect`, `connect_message`, `pricelist_request`, `deal_card` |
| `description` | TEXT NOT NULL | Human-readable; EN/DE translated in the app (store the code, not the label) |
| `sort_order` | SMALLINT NOT NULL DEFAULT 0 | Display order |

**Seed values:**
- `connect` — plain connection request.
- `connect_message` — connection request carrying a note (uses `pending_inbox_item.note`; no extra column).
- `pricelist_request` — request for the one standard pricelist; **no payload in MVP** (revisit when per-buyer pricelists land).
- `deal_card` — carries a hard link via `pending_inbox_item.deal_card_id`; accepting seeds a deal draft.

---

### `pending_inbox_item`

Inbound requests routed to a company's shared **Connect inbox**. Four types (`connect` / `connect_message` / `pricelist_request` / `deal_card`). Each is **claimed or admin-assigned** to one owner, shown under four lenses (Unassigned / Mine / All / My-history). (Inbox model locked 2026-06-06 — Ayush.)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL | |
| `type` | VARCHAR(30) | NOT NULL, REFERENCES `inbox_request_type(code)` | Set on insert; no default |
| `sender_person_id` | UUID | NOT NULL, REFERENCES `person(id)` | |
| `sender_company_id` | UUID | NOT NULL, REFERENCES `company(id)` | |
| `receiver_company_id` | UUID | NOT NULL, REFERENCES `company(id)` | The company whose inbox this lands in |
| `note` | TEXT | NULL | Free-form message; carries the body for `connect_message` |
| `deal_card_id` | UUID | NULL, REFERENCES `deal_card(id)` | Set **only** when `type = 'deal_card'` |
| `status` | VARCHAR(20) | NOT NULL DEFAULT `'pending'`, REFERENCES `inbox_status(code)` | 'pending', 'accepted', 'rejected' |
| `assigned_to` | UUID | NULL, REFERENCES `person(id)` | Current owner, however acquired (claim or admin-assign) |
| `assigned_at` | TIMESTAMPTZ | NULL | When ownership was set |
| `assigned_by` | UUID | NULL, REFERENCES `person(id)` | **NULL = self-claimed** (pickup); **set = who assigned** the owner |
| `metadata` | JSONB | NOT NULL DEFAULT `'{}'` | |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `deleted_at` | TIMESTAMPTZ | NULL | |

**Constraints:**
- `CHECK (deal_card_id IS NULL OR type = 'deal_card')` — only a `deal_card` request may carry a deal-card link.

**Indexes:**
- `INDEX(receiver_company_id, status)` — Unassigned / All lenses ("my company's open items")
- `INDEX(assigned_to, status)` — Mine / My-history lenses
- `INDEX(sender_company_id)`

**Ownership & lenses (locked 2026-06-06):**
- One owner field. `assigned_to` = current owner regardless of route; `assigned_by` = provenance (NULL = picked up, set = assigned). "Assigned" is **derived** (`assigned_to IS NOT NULL`), not a status value.
- Lenses: **Unassigned** = `status='pending' AND assigned_to IS NULL`; **Mine** = `assigned_to = me`; **All** = company's open items; **My history** = `assigned_to = me AND status IN ('accepted','rejected')`.
- Reassign: unassigned → anyone with the inbox permission may claim (`assigned_to=self`, `assigned_by=NULL`); already-assigned → only the current owner or a Superadmin may reassign. Every (re)assignment writes an `audit_log` row (content_type `'pending_inbox_item'`, already seeded).
- **RLS (build-time):** receiver-company members **and** sender-company members can both *read* the row (their inbox / their sent request); claim / assign / status writes are gated separately (inbox permission + owner-or-Superadmin).

**Open questions:**
- Should this evolve into a generic `notification` table covering more P↔C event types? → **Phase 2 question** — answer when we have more event shapes.
- Re-requests (sender already sent one)? → **Default:** allow multiple rows; UI disables button if pending request exists.

---

### `join_request`

Path B onboarding: a person requests to join an existing company; a Superadmin of that company approves/rejects. **Distinct from `pending_inbox_item`** (which is company↔company connection) — approval here grants company membership. (B1 locked 2026-05-29.)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL, DEFAULT `gen_random_uuid()` | |
| `requester_person_id` | UUID | NOT NULL, REFERENCES `person(id)` | The joiner (may have `company_id` NULL at request time) |
| `target_company_id` | UUID | NOT NULL, REFERENCES `company(id)` | Company to join; may still be `verification_status = pending` |
| `status` | VARCHAR(20) | NOT NULL DEFAULT `'pending'`, REFERENCES `join_request_status(code)` | 'pending', 'approved', 'rejected', 'cancelled' |
| `note` | TEXT | NULL | Optional message from requester |
| `decided_by` | UUID | NULL, REFERENCES `person(id)` | Superadmin who approved/rejected |
| `decided_at` | TIMESTAMPTZ | NULL | |
| `rejection_reason` | TEXT | NULL | Free-text if rejected |
| `metadata` | JSONB | NOT NULL DEFAULT `'{}'` | |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `deleted_at` | TIMESTAMPTZ | NULL | |

**Indexes:**
- `INDEX(target_company_id, status)` — "pending join requests for my company"
- `INDEX(requester_person_id)` — "my join requests"

**Approval side effect:** on `approved`, set `requester_person.company_id = target_company_id` + assign default role/group. This membership-granting effect is why it's a separate aggregate from `pending_inbox_item`. Approve/reject logged to `audit_log` (content_type `'join_request'`).

**Open questions:**
- Multi-Superadmin routing (any vs assigned) → **Default:** any Superadmin of target company; build/policy detail, deferred (v0 = one user/company, unexercised).
- Domain-collision auto-suggest (B3) accepting the banner creates a `join_request` → wiring is build-time.

---

### `hs_team_member`

Hello Sello internal staff allowed to review/verify companies (the `/admin/verifications` allowlist). **Platform-level, NOT tenant-scoped** — deliberately has no `company_id`, since HS staff act across all companies. (B2 locked 2026-06-06.)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL, DEFAULT `gen_random_uuid()` | |
| `person_id` | UUID | NOT NULL, REFERENCES `person(id)` | The staff member (has a normal account) |
| `role` | VARCHAR(20) | NOT NULL DEFAULT `'reviewer'` | 'reviewer' / 'admin' — promote to a lookup table if values grow |
| `created_by` | UUID | NULL, REFERENCES `person(id)` | Who granted access (grant is auditable) |
| `updated_by` | UUID | NULL, REFERENCES `person(id)` | |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `deleted_at` | TIMESTAMPTZ | NULL | Soft-delete = revoke membership (keeps history) |

**No `company_id`** — platform-level staff, not tenant-scoped. Rare, deliberate exception to the multi-tenancy convention (like the audit lookup tables).

**Constraints:**
- `UNIQUE(person_id) WHERE deleted_at IS NULL` — at most one active membership per person

**Access control / audit:**
- RLS: writes restricted to service-role / existing HS-admin; HS members may read.
- Grant + revoke logged to `audit_log` — adds `hs_team.member_added` / `hs_team.member_removed` to `audit_action_type` (category `permissions`).

**Why a table (not `person.is_hs_team` or an env-var):** a boolean on the user's own row invites self-escalation and mixes platform-staff into tenant data; an env-var is invisible to RLS (which needs to grant HS its cross-tenant read) and can't be tied to an audited person. (B2 rationale, 2026-06-06.)

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

## Status lookups

Per-entity status lists (convention: enums = lookup tables). **Shared shape:** `code` VARCHAR(20) PK · `description` TEXT NOT NULL (EN/DE translated in app off `code`) · `sort_order` SMALLINT NOT NULL DEFAULT 0 · `is_terminal` BOOLEAN NOT NULL DEFAULT FALSE (true = end state — lets "history" / "done" filters read `is_terminal` instead of hardcoding status names). (Added 2026-06-06 — schema review.)

| Table | `code` seeds (✓ = `is_terminal`) |
|---|---|
| `company_verification_status` | `pending` · `verified` ✓ · `rejected` ✓ |
| `license_scan_status` | `pending` · `clean` ✓ · `infected` ✓ · `scan_error` ✓ |
| `inbox_status` | `pending` · `accepted` ✓ · `rejected` ✓ |
| `join_request_status` | `pending` · `approved` ✓ · `rejected` ✓ · `cancelled` ✓ |
| `deal_card_status` | `draft` · `withdrawn` ✓ · `confirmed` · `amended` · `cancelled` ✓ |
| `deal_confirmation_status` | `pending` · `confirmed` ✓ · `rejected` ✓ |

**Referenced by:** `company.verification_status` → `company_verification_status` · `company_license_file.scan_status` → `license_scan_status` · `pending_inbox_item.status` → `inbox_status` · `join_request.status` → `join_request_status` · `deal_card.status` → `deal_card_status` · `deal_confirmation.status` → `deal_confirmation_status`.

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
| B1 | ~~**Path B "join request" entity**~~ → **RESOLVED 2026-05-29.** Dedicated `join_request` table (above), NOT a reuse of `pending_inbox_item` — different concept (person→company membership vs company↔company connection), different invariants, approval grants membership. Multi-Superadmin routing defaulted to "any Superadmin of target company" (build detail). See DECISIONS.md walkthrough locks 2026-05-29 — B1. | ~~Soft default~~ Resolved | New `join_request` table |
| B2 | ~~**HS-team allowlist**~~ → **RESOLVED 2026-06-06.** Dedicated `hs_team_member` table (above) — platform-level, no `company_id`; FK to `person`, `role` (reviewer/admin), soft-delete = revoke, grant/revoke audited. Rejected `person.is_hs_team` (self-escalation) + env-var (RLS-invisible). | ~~Soft default~~ Resolved | New `hs_team_member` table |
| B3 | ~~**Domain-collision override flag**~~ → **RESOLVED 2026-06-06.** Lives in `company.metadata.domain_collision = { overridden, matched_company_id, matched_domain }` — sparse, HS-team-only review flag. No dedicated column/table. | ~~Soft default~~ Resolved | `company.metadata` |
| B4 | ~~**Reject reason + resubmit token**~~ → **RESOLVED 2026-06-06.** Reason *derived* from latest `company.verify_rejected` in `audit_log` (already mandatory there); resubmit is auth-gated + reuses `company_license_file`. No `rejection_reason` column, no token table. | ~~Soft default~~ Resolved | No schema (audit_log + auth) |
| B5 | ~~**`email_verification_token` table schema**~~ → **RESOLVED 2026-05-25** via A1 lock (Supabase Auth owns this). | ~~Soft default~~ Resolved | No new table needed |
| B6 | **2FA enforcement timing — DEV-29 conflict.** *Factor storage resolved via A1 → `auth.mfa_factors`.* Open: required pre-first-e-signature? Optional for non-signing users? Which factor (TOTP / SMS / email)? | Soft default | Auth flow timing only |
| B7 | ~~**Split-gate enforcement layer**~~ → **RESOLVED 2026-05-29.** Layered / defense-in-depth: Postgres RLS = security floor (tenant isolation via `company_id` + `auth.uid()`); central app-layer policy module = complex authorization (split-gate + DEV-51 16-combo matrix); policy DSL (OPA/Oso) deferred. See DECISIONS.md walkthrough locks 2026-05-29 — B7. Unblocks [DEV-51](https://linear.app/hellosello/issue/DEV-51). | ~~Architecture~~ Resolved (no schema) | Cross-cutting |

**Suggested resolution order:** ~~A1~~ → ~~A4~~ → ~~A2~~ → ~~A3~~ → ~~B7~~ → ~~B1~~ → ~~B2/B3/B4~~ (resolved 2026-06-06) → **B6 remains (2FA enforcement timing — auth-flow detail, decide at build).** *(All architecture-shaping open questions resolved: A1+A4 2026-05-25, A2 2026-05-27, A3 2026-05-28, B7+B1 2026-05-29, B2/B3/B4 2026-06-06. Only B6 left — auth-flow timing.)*

---

## Migration-avoidance checklist — the 8 questions

The questions every B2B schema must answer **before launch**. Wrong defaults here = painful migrations later.

| # | Question | Locked default | Why |
|---|---|---|---|
| 1 | ID type — auto-increment integer or UUID? | **UUID** | Distributed systems, no enumeration attacks, no FK lock contention |
| 2 | Soft-delete — `deleted_at` on every table? | **Yes** | B2B almost always needs deleted records for audit |
| 3 | Audit columns — `created_at`, `updated_at`, `created_by`, `updated_by` on every table? | **Yes — business tables** (pure junctions + self-owned `person` exempt; `deleted_by` where useful) | Regulated industry requires audit trail (DEV-29/40/41); `audit_log` is the legal trail |
| 4 | Multi-tenancy — every row carries `company_id`? | **Yes** | Even on derived tables, for RLS / fast filtering |
| 5 | GDPR right-to-be-forgotten — delete or anonymize? | **Anonymize** | Keep referential integrity; null PII columns |
| 6 | PII encryption — encrypt email, phone, address at rest? | **Yes (principle locked)** · Mechanism still open — see Open Questions | GDPR compliance; reduces blast radius |
| 7 | Enums — Postgres native ENUM, lookup table, or string? | **Lookup table** | Add values without migration |
| 8 | Flexible metadata — `metadata JSONB` column? | **Yes** on tables likely to expand | Kills 80% of "add a column" migrations |

---

## Phase 2 tables (in progress — 2026-06-07)

**Status:** shapes locked from Ayush's chat prototype (`prototypes/chat-prototype`, locked 2026-06-06). Discussed + extended 2026-06-07. Tables for `relationship_note`, `pricelist` pending screen ③ (Relationship page).

**Wire diagram:**
```
pending_inbox_item (P1) — accepted → relationship (P2)
                                         │
                      ┌──────────────────┼──────────────────┐
                      ▼                  ▼                   ▼
             chat_thread(c2c)    chat_thread(p2p)       deal_card (P2)
                      │                  │                   │
              chat_message        chat_message         confirmed → chat_thread(deal)
                                                              │
                                                       deal_card_log
                                                       deal_change_input
                                                       deal_line_item
```

---

### `relationship`

Created when a `pending_inbox_item` is accepted (P↔C → P↔P transition). Parent of all chat threads and deals between two companies.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL, DEFAULT `gen_random_uuid()` | |
| `company_a_id` | UUID | NOT NULL, REFERENCES `company(id)` | Lower UUID alphabetically — enforces one row per pair |
| `company_b_id` | UUID | NOT NULL, REFERENCES `company(id)` | |
| `initiated_by_company_id` | UUID | NOT NULL, REFERENCES `company(id)` | Who sent the original `pending_inbox_item` |
| `inbox_item_id` | UUID | NULL, REFERENCES `pending_inbox_item(id)` | Origin record for traceability |
| `status` | VARCHAR(20) | NOT NULL DEFAULT `'active'` | Lookup: `'active'` / `'suspended'` / `'ended'` |
| `metadata` | JSONB | NOT NULL DEFAULT `'{}'` | Agreed terms, custom notes — extended when screen ③ lands |
| `created_by` | UUID | NULL, REFERENCES `person(id)` | |
| `updated_by` | UUID | NULL, REFERENCES `person(id)` | |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `deleted_at` | TIMESTAMPTZ | NULL | |

**Constraints:**
- `CHECK (company_a_id < company_b_id)` — canonical ordering, enforces one row per pair regardless of who initiated
- `UNIQUE(company_a_id, company_b_id) WHERE deleted_at IS NULL`

**Indexes:**
- `INDEX(company_a_id)`, `INDEX(company_b_id)` — "all relationships for this company"
- `INDEX(inbox_item_id)` — trace back to origin

**Open:** full columns (per-side notes, agreed terms, custom pricelist) pending screen ③. `metadata` is the placeholder.

---

### `chat_thread`

One per C2C channel (created at connection accept), one per P2P pair, one per confirmed deal.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL, DEFAULT `gen_random_uuid()` | |
| `relationship_id` | UUID | NOT NULL, REFERENCES `relationship(id)` | |
| `type` | VARCHAR(10) | NOT NULL | Lookup: `'c2c'` / `'p2p'` / `'deal'` |
| `person_a_id` | UUID | NULL, REFERENCES `person(id)` | Only for `p2p` threads |
| `person_b_id` | UUID | NULL, REFERENCES `person(id)` | Only for `p2p` threads |
| `deal_card_id` | UUID | NULL, REFERENCES `deal_card(id)` | Only for `deal` threads; set when workspace spawns |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `deleted_at` | TIMESTAMPTZ | NULL | |

**Constraints:**
- `CHECK (type != 'p2p' OR (person_a_id IS NOT NULL AND person_b_id IS NOT NULL))` — p2p must name both people
- `CHECK (type != 'deal' OR deal_card_id IS NOT NULL)` — deal thread must name the card
- `CHECK (type != 'p2p' OR person_a_id < person_b_id)` — canonical ordering enforced at DB level; app must sort before insert (Q2 locked 2026-06-07, same pattern as `relationship.company_a_id < company_b_id`)
- `UNIQUE(relationship_id, type) WHERE type = 'c2c' AND deleted_at IS NULL` — one C2C per relationship
- `UNIQUE(relationship_id, person_a_id, person_b_id) WHERE type = 'p2p' AND deleted_at IS NULL` — one P2P per person-pair

**Note:** `scope` (company/person/deal) is derivable from `type` — no extra column (Ayush's lock, 2026-06-06).

**Indexes:**
- `INDEX(relationship_id, type)`
- `INDEX(person_a_id)`, `INDEX(person_b_id)` — "all chats for this person"

---

### `chat_message`

Every line in every thread. System and Sella lines are rows here too — **no separate `system_message` table**.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL, DEFAULT `gen_random_uuid()` | |
| `thread_id` | UUID | NOT NULL, REFERENCES `chat_thread(id)` | |
| `sender_person_id` | UUID | NULL, REFERENCES `person(id)` | NULL when sender is `system` or `sella` |
| `sender` | VARCHAR(10) | NOT NULL | Lookup: `'person'` / `'system'` / `'sella'` |
| `type` | VARCHAR(50) | NOT NULL DEFAULT `'message'` | Discriminator lookup — see seed values below |
| `body` | TEXT | NOT NULL | Human message text or system copy |
| `metadata` | JSONB | NOT NULL DEFAULT `'{}'` | e.g. deal_card_version ref, Sella context, confirmation state |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `deleted_at` | TIMESTAMPTZ | NULL | |

**`chat_message_type` lookup seed values:**
`message`, `connection_established`, `deal_started`, `intro`, `deal_detected`, `workspace_created`, `deal_cancelled`, `deal_opened`, `deal_card_updated`

**Invariant:** `deal_card_updated` messages are **projections** of a `deal_card_log` entry — the log is truth, the message is display. A change made in the Deal chat writes the log but does NOT broadcast a `deal_card_updated` message (everyone there already saw the conversation). Broadcast fires only when `origin != deal_chat`.

**Indexes:**
- `INDEX(thread_id, created_at DESC)` — paginated message load
- `INDEX(sender_person_id)` — "messages by this person"

---

### `deal_card`

Mutable current state of a deal. Versioned — every accepted change bumps `version`; line items snapshot at each version.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL, DEFAULT `gen_random_uuid()` | |
| `relationship_id` | UUID | NOT NULL, REFERENCES `relationship(id)` | |
| `thread_id` | UUID | NULL, REFERENCES `chat_thread(id)` | Set when workspace spawns (both parties confirm); NULL while draft |
| `version` | INT | NOT NULL DEFAULT 1 | Bumped on every accepted change |
| `status` | VARCHAR(20) | NOT NULL DEFAULT `'draft'`, REFERENCES `deal_card_status(code)` | Lookup: `'draft'` / `'withdrawn'` / `'confirmed'` / `'amended'` / `'cancelled'` |
| `deal_type` | VARCHAR(10) | NOT NULL | Lookup: `'offer'` (seller-initiated) / `'order'` (buyer-initiated) |
| `initiating_company_id` | UUID | NOT NULL, REFERENCES `company(id)` | Direction of the deal; drives OFFER vs ORDER labelling |
| `value_net` | NUMERIC(15, 2) | NULL | Computed total; updated on each version |
| `currency` | CHAR(3) | NOT NULL DEFAULT `'EUR'` | ISO 4217 |
| `offer_expires_at` | TIMESTAMPTZ | NULL | When the quote/offer lapses; Sella monitors |
| `delivery_date_target` | TIMESTAMPTZ | NULL | Target delivery date |
| `payment_terms_code` | VARCHAR(20) | NULL, REFERENCES `payment_terms(code)` | NET30 / NET60 / COD etc. |
| `incoterms_code` | VARCHAR(10) | NULL, REFERENCES `incoterms(code)` | EXW / DAP / DDP etc. |
| `buyer_po_number` | VARCHAR(100) | NULL | Buyer's internal PO ref; generated at confirmation |
| `seller_so_number` | VARCHAR(100) | NULL | Seller's internal SO ref; generated at confirmation |
| `hs_deal_number` | VARCHAR(50) | NULL | Auto-generated at confirmation: `HS-AAA##-BBB##-NNNNNNNN` |
| `metadata` | JSONB | NOT NULL DEFAULT `'{}'` | Stage template id, special handling notes, insurance refs |
| `created_by` | UUID | NULL, REFERENCES `person(id)` | |
| `updated_by` | UUID | NULL, REFERENCES `person(id)` | |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `deleted_at` | TIMESTAMPTZ | NULL | |

**Two-party gate (Q3 — locked 2026-06-07):** per-party confirmation state lives in a dedicated `deal_confirmation` table (see below). `withdrawn` status on this card means the initiating party pulled back before the other party responded.

**Indexes:**
- `INDEX(relationship_id, status)`
- `INDEX(initiating_company_id)`
- `INDEX(offer_expires_at) WHERE offer_expires_at IS NOT NULL` — Sella expiry monitoring

---

### `deal_confirmation`

Per-party confirmation gate for deal birth and deal amendments. Two rows exist per `(deal_card_id, version)` — one per company. Both must reach `confirmed` before the version is accepted; either `rejected` sends the deal back to negotiation. *(Locked 2026-06-07 — Q3.)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL, DEFAULT `gen_random_uuid()` | |
| `deal_card_id` | UUID | NOT NULL, REFERENCES `deal_card(id)` | |
| `version` | INT | NOT NULL | Which card version is being gated |
| `company_id` | UUID | NOT NULL, REFERENCES `company(id)` | The responding party |
| `responding_person_id` | UUID | NULL, REFERENCES `person(id)` | NULL until the party responds |
| `status` | VARCHAR(20) | NOT NULL DEFAULT `'pending'`, REFERENCES `deal_confirmation_status(code)` | `'pending'` / `'confirmed'` / `'rejected'` |
| `responded_at` | TIMESTAMPTZ | NULL | When the party confirmed or rejected |
| `note` | TEXT | NULL | Optional rejection reason or note |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

**Constraints:**
- `UNIQUE(deal_card_id, version, company_id)` — one response per party per version

**Indexes:**
- `INDEX(deal_card_id, version)` — check gate state for a version
- `INDEX(company_id, status)` — "deals awaiting my company's confirmation"

**State machine:**
- `pending` → `confirmed` (party accepts)
- `pending` → `rejected` (party declines — deal returns to negotiation)

**Side effects (app-layer):**
- Both rows `confirmed` → `deal_card.status` advances (`draft` → `confirmed` on v1; version bumps on amendments) + workspace spawns on v1
- Either row `rejected` → deal returns to negotiation; `deal_card.status` stays `draft` or `amended`
- `deal_card.status = 'withdrawn'` — set by the initiating company only, and only while the other party's row is still `pending`; this is a deal-card-level action, not a confirmation row action

**`deal_confirmation_status` lookup seed values:** `pending` · `confirmed` ✓ · `rejected` ✓

---

### `deal_line_item`

Products per deal version. **Option A (versioned snapshots):** each version bump copies unchanged lines + writes new/changed ones. Query current = `WHERE deal_card_id = X AND version = (card.version)`; reconstruct v1 = `WHERE deal_card_id = X AND version = 1`. No diff-replay needed. *(Decided 2026-06-07 — no mutable line items; regulated industry needs read-only historical snapshots.)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL, DEFAULT `gen_random_uuid()` | |
| `deal_card_id` | UUID | NOT NULL, REFERENCES `deal_card(id)` | |
| `version` | INT | NOT NULL | Snapshot version — matches `deal_card.version` at time of write |
| `product_id` | UUID | NULL, REFERENCES `catalog_product(id)` | NULL if free-text product (no catalog in Phase 1) |
| `product_name` | VARCHAR(200) | NOT NULL | Denormalized — snapshot name at this version |
| `quantity` | NUMERIC(15, 3) | NOT NULL | |
| `unit` | VARCHAR(20) | NOT NULL | Lookup: `'kg'` / `'g'` / `'unit'` etc. |
| `unit_price` | NUMERIC(15, 4) | NOT NULL | Seller's agreed price for this version |
| `seller_margin` | NUMERIC(6, 4) | NULL | **Seller-only** — never exposed to buyer; RLS + app-layer policy |
| `buyer_metric` | NUMERIC(6, 4) | NULL | **Buyer-only** — name TBD (see open questions) |
| `currency` | CHAR(3) | NOT NULL DEFAULT `'EUR'` | Matches `deal_card.currency` |
| `line_total` | NUMERIC(15, 2) | GENERATED ALWAYS AS (`quantity * unit_price`) STORED | Computed |
| `thc_percent` | NUMERIC(5, 2) | NULL | Cannabis-specific; regulatory-grade; Sella validates against license thresholds |
| `cbd_percent` | NUMERIC(5, 2) | NULL | Cannabis-specific |
| `sort_order` | SMALLINT | NOT NULL DEFAULT 0 | Display order on card front |
| `metadata` | JSONB | NOT NULL DEFAULT `'{}'` | Country of origin, packing notes, customs codes (not yet queried — promote later) |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

**No `deleted_at`** — line items at a locked version are immutable.

**Constraints:**
- `UNIQUE(deal_card_id, version, sort_order)`

**Indexes:**
- `INDEX(deal_card_id, version)` — primary access pattern

**What belongs elsewhere, not here:**
- Batch numbers, CoA files, actual delivered quantities → `deal_delivery` (Phase 3, DEV-36). The line item answers *"what was agreed"*; the delivery answers *"what was shipped"*. One deal can have N deliveries (DEV-53).

---

### `deal_card_log`

Append-only version history. Lives on the card back (Signals | Logs filter). Feeds `audit_log`.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL, DEFAULT `gen_random_uuid()` | |
| `deal_card_id` | UUID | NOT NULL, REFERENCES `deal_card(id)` | |
| `version` | INT | NOT NULL | Which card version this entry created |
| `change_summary` | TEXT | NOT NULL | What changed — Sella-written or system |
| `origin` | VARCHAR(15) | NOT NULL | Lookup: `'p2p'` / `'deal_chat'` / `'system'` — drives the broadcast rule |
| `changed_by_person_id` | UUID | NULL, REFERENCES `person(id)` | |
| `changed_by` | VARCHAR(10) | NOT NULL | `'person'` / `'sella'` / `'system'` |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

**No soft delete** — this is history.

**Broadcast rule:** `origin != 'deal_chat'` → broadcast a `deal_card_updated` chat message into the Deal thread. Change made *in* the Deal chat → log + evidence only, no redundant message.

**Indexes:**
- `INDEX(deal_card_id, version)`

---

### `deal_change_input`

Per-user evidence — each party's own note when a change is proposed. The "individual for individual user" record from the P2P↔Deal sync model (Ayush's lock, 2026-06-06).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, NOT NULL, DEFAULT `gen_random_uuid()` | |
| `deal_card_id` | UUID | NOT NULL, REFERENCES `deal_card(id)` | |
| `log_id` | UUID | NOT NULL, REFERENCES `deal_card_log(id)` | Which version change this note belongs to |
| `party_person_id` | UUID | NOT NULL, REFERENCES `person(id)` | The person who submitted this note |
| `note` | TEXT | NOT NULL | Their own words on the change |
| `submitted_at` | TIMESTAMPTZ | NOT NULL | |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

**Indexes:**
- `INDEX(deal_card_id, log_id)`
- `INDEX(party_person_id)`

---

## Open questions — Phase 2 (decide before writing migrations)

| # | Question | Affects |
|---|---|---|
| ~~Q2~~ | ~~**`chat_thread` P2P uniqueness**~~ → **RESOLVED 2026-06-07.** `CHECK (person_a_id < person_b_id)` enforced at DB level; app sorts before insert. Same pattern as `relationship` table. | `chat_thread` constraint ✓ |
| ~~Q3~~ | ~~**Two-party confirmation state**~~ → **RESOLVED 2026-06-07.** Dedicated `deal_confirmation` table — one row per party per version. `deal_card.status` gets `'withdrawn'` (initiator pulls back before other party responds — terminal). See `deal_confirmation` table above + DECISIONS.md 2026-06-07. | `deal_confirmation` table added |
| TBD | **`buyer_metric` field name** — buyer's counterpart to seller's `margin` on the Deal card. Still TBD. | `deal_line_item.buyer_metric` column name |
| screen③ | **`relationship_note`** — per-side private notes; shape pending screen ③ (Relationship page). | New table |
| screen③ | **`pricelist`** (master / standard / custom-per-relationship) — three layers per DEV-1; shape pending screen ③. | New table(s) |

---

## Deferred to Phase 3+

| Table | Phase | Notes |
|---|---|---|
| `deal_delivery` | 3 | Batch numbers, CoA files, actual delivered quantities, delivery note + invoice (DEV-36). Child of `deal_card`; one deal has N deliveries (DEV-53). |
| `deal_workspace`, `deal_room` | 3 | Containers for the deal workspace UI |
| `thing` | 3 | Universal deal-execution primitive |
| `order` (with PO#/SO#/HS#/QR) | 4 | Generated at confirmation; XML-readable for ERP integration |
| `analytics_event` | 2+ | Append-only UI telemetry. Not `audit_log` — that's compliance-grade. May live in external tool (PostHog/Amplitude). Deferred past v0. |
| `email_integration` | 2+ | Per (person × provider) OAuth connection for contact re-sync. Tokens in Supabase Vault (A2). Deferred past v0. |
| `audit_log` | ~~2~~ **Promoted to Phase 1** | See §A4 — already in Phase 1 tables above. |

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
