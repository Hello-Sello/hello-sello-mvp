-- ============================================================================
-- Migration 2/5 — Phase 1 core tables
-- ----------------------------------------------------------------------------
-- The identity + tenancy + governance spine: person, company, licensing,
-- groups/permissions, contacts, inbox, join requests, HS staff, audit_log.
-- Depends on migration 1 (all lookups exist).
--
-- Conventions applied (see SCHEMA-DRAFT.md):
--   id UUID PK DEFAULT gen_random_uuid() (except person.id = auth.users.id)
--   created_at/updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
--   deleted_at TIMESTAMPTZ NULL (soft delete)
--   created_by/updated_by/deleted_by UUID -> person(id) on business tables
--   company_id on company-scoped tables (RLS in F2)
--   updated_at maintained by trigger -> added in migration 5
-- ============================================================================

-- ----------------------------------------------------------------------------
-- person  (profile extension of auth.users)
--   company_id FK is added at the END of this file, after company exists
--   (person <-> company is a circular reference).
-- ----------------------------------------------------------------------------
CREATE TABLE person (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name  VARCHAR(100) NOT NULL,
  last_name   VARCHAR(100) NOT NULL,
  company_id  UUID NULL,                       -- FK added below (cycle)
  preferences JSONB NOT NULL DEFAULT '{}',
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ NULL
);

-- ----------------------------------------------------------------------------
-- company
-- ----------------------------------------------------------------------------
CREATE TABLE company (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                VARCHAR(200) NOT NULL,
  country             CHAR(2) NOT NULL,                 -- ISO 3166-1 alpha-2
  address             TEXT NULL,                        -- encrypted at rest
  description         TEXT NULL,
  primary_products    TEXT NULL,
  website             VARCHAR(500) NULL,
  verification_status VARCHAR(50) NOT NULL DEFAULT 'pending'
                        REFERENCES company_verification_status(code),
  verified_at         TIMESTAMPTZ NULL,
  verified_by         UUID NULL REFERENCES person(id),
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_by          UUID NULL REFERENCES person(id),
  updated_by          UUID NULL REFERENCES person(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_by          UUID NULL REFERENCES person(id),
  deleted_at          TIMESTAMPTZ NULL
);
CREATE INDEX idx_company_verification_status ON company(verification_status);
CREATE INDEX idx_company_country ON company(country);

-- close the person <-> company cycle
ALTER TABLE person
  ADD CONSTRAINT person_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES company(id);
CREATE INDEX idx_person_company_id ON person(company_id);

-- ----------------------------------------------------------------------------
-- company_license_file  (metadata + Storage pointer; bytes live in Storage)
-- ----------------------------------------------------------------------------
CREATE TABLE company_license_file (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES company(id),
  storage_path      TEXT NOT NULL,
  original_filename VARCHAR(500) NOT NULL,
  mime_type         VARCHAR(100) NOT NULL,
  file_size_bytes   BIGINT NOT NULL,
  scan_status       VARCHAR(20) NOT NULL DEFAULT 'pending'
                      REFERENCES file_scan_status(code),
  description       TEXT NULL,
  created_by        UUID NULL REFERENCES person(id),
  updated_by        UUID NULL REFERENCES person(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ NULL
);
CREATE INDEX idx_company_license_file_company_id ON company_license_file(company_id);
CREATE INDEX idx_company_license_file_scan_status ON company_license_file(scan_status);

-- ----------------------------------------------------------------------------
-- company_type_assignment  (M:N company <-> company_type; pure-ish junction)
-- ----------------------------------------------------------------------------
CREATE TABLE company_type_assignment (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES company(id),
  company_type_code VARCHAR(30) NOT NULL REFERENCES company_type(code),
  created_by        UUID NULL REFERENCES person(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ NULL
);
CREATE UNIQUE INDEX uq_company_type_assignment_active
  ON company_type_assignment(company_id, company_type_code)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_company_type_assignment_company_id ON company_type_assignment(company_id);
CREATE INDEX idx_company_type_assignment_type_code ON company_type_assignment(company_type_code);

-- ----------------------------------------------------------------------------
-- group  (company-defined roles; self-referential hierarchy)
-- ----------------------------------------------------------------------------
CREATE TABLE "group" (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES company(id),
  name            VARCHAR(100) NOT NULL,
  description     TEXT NULL,
  parent_group_id UUID NULL REFERENCES "group"(id),
  created_by      UUID NULL REFERENCES person(id),
  updated_by      UUID NULL REFERENCES person(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_by      UUID NULL REFERENCES person(id),
  deleted_at      TIMESTAMPTZ NULL
);
CREATE INDEX idx_group_company_id ON "group"(company_id);
CREATE UNIQUE INDEX uq_group_company_name_active
  ON "group"(company_id, name) WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- person_group  (M:N person <-> group, + platform roles; pure junction)
-- ----------------------------------------------------------------------------
CREATE TABLE person_group (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id  UUID NOT NULL REFERENCES person(id),
  group_id   UUID NULL REFERENCES "group"(id),
  role       VARCHAR(50) NULL,                  -- e.g. 'superadmin' (platform)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT person_group_has_target CHECK (group_id IS NOT NULL OR role IS NOT NULL)
);
CREATE UNIQUE INDEX uq_person_group_group_active
  ON person_group(person_id, group_id)
  WHERE deleted_at IS NULL AND group_id IS NOT NULL;
CREATE UNIQUE INDEX uq_person_group_role_active
  ON person_group(person_id, role)
  WHERE deleted_at IS NULL AND role IS NOT NULL;

-- ----------------------------------------------------------------------------
-- permission_matrix_entry  (which actions a group is granted)
-- ----------------------------------------------------------------------------
CREATE TABLE permission_matrix_entry (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES company(id),  -- denormalized; MUST equal group.company_id
  group_id   UUID NOT NULL REFERENCES "group"(id),
  action     VARCHAR(100) NOT NULL REFERENCES permission_action(code),
  granted    BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID NULL REFERENCES person(id),
  updated_by UUID NULL REFERENCES person(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_permission_matrix_group_action
  ON permission_matrix_entry(group_id, action);
CREATE INDEX idx_permission_matrix_group_id ON permission_matrix_entry(group_id);
CREATE INDEX idx_permission_matrix_company_id ON permission_matrix_entry(company_id);

-- ----------------------------------------------------------------------------
-- contact_record  (imported Gmail/Outlook contact metadata; DEV-3)
-- ----------------------------------------------------------------------------
CREATE TABLE contact_record (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id           UUID NOT NULL REFERENCES person(id),
  email               VARCHAR(255) NOT NULL,           -- encrypted at rest
  display_name        VARCHAR(200) NULL,
  first_seen          DATE NULL,
  last_seen           DATE NULL,
  email_count         INT NOT NULL DEFAULT 0,
  role                VARCHAR(20) NULL REFERENCES contact_role(code),     -- NULL = unclassified
  inferred_company_id UUID NULL REFERENCES company(id),
  provider            VARCHAR(20) NOT NULL REFERENCES contact_provider(code),
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ NULL
);
CREATE INDEX idx_contact_record_person_id ON contact_record(person_id);
CREATE UNIQUE INDEX uq_contact_record_person_email_active
  ON contact_record(person_id, email) WHERE deleted_at IS NULL;
CREATE INDEX idx_contact_record_inferred_company ON contact_record(inferred_company_id);

-- ----------------------------------------------------------------------------
-- pending_inbox_item  (company Connect inbox)
--   deal_card_id FK is deferred to migration 5 (deal_card is Phase 2).
-- ----------------------------------------------------------------------------
CREATE TABLE pending_inbox_item (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type                VARCHAR(30) NOT NULL REFERENCES inbox_request_type(code),
  sender_person_id    UUID NOT NULL REFERENCES person(id),
  sender_company_id   UUID NOT NULL REFERENCES company(id),
  receiver_company_id UUID NOT NULL REFERENCES company(id),
  note                TEXT NULL,
  deal_card_id        UUID NULL,                        -- FK added in migration 5
  status              VARCHAR(20) NOT NULL DEFAULT 'pending' REFERENCES inbox_status(code),
  assigned_to         UUID NULL REFERENCES person(id),
  assigned_at         TIMESTAMPTZ NULL,
  assigned_by         UUID NULL REFERENCES person(id),   -- NULL = self-claimed
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ NULL,
  CONSTRAINT inbox_deal_card_only_for_deal_card_type
    CHECK (deal_card_id IS NULL OR type = 'deal_card')
);
CREATE INDEX idx_inbox_receiver_status ON pending_inbox_item(receiver_company_id, status);
CREATE INDEX idx_inbox_assigned_status ON pending_inbox_item(assigned_to, status);
CREATE INDEX idx_inbox_sender_company ON pending_inbox_item(sender_company_id);

-- ----------------------------------------------------------------------------
-- join_request  (Path B: person requests to join an existing company)
-- ----------------------------------------------------------------------------
CREATE TABLE join_request (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_person_id UUID NOT NULL REFERENCES person(id),
  target_company_id   UUID NOT NULL REFERENCES company(id),
  status              VARCHAR(20) NOT NULL DEFAULT 'pending' REFERENCES join_request_status(code),
  note                TEXT NULL,
  decided_by          UUID NULL REFERENCES person(id),
  decided_at          TIMESTAMPTZ NULL,
  rejection_reason    TEXT NULL,
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ NULL
);
CREATE INDEX idx_join_request_target_status ON join_request(target_company_id, status);
CREATE INDEX idx_join_request_requester ON join_request(requester_person_id);

-- ----------------------------------------------------------------------------
-- hs_team_member  (Hello Sello staff allowlist; platform-level, NO company_id)
-- ----------------------------------------------------------------------------
CREATE TABLE hs_team_member (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id  UUID NOT NULL REFERENCES person(id),
  role       VARCHAR(20) NOT NULL DEFAULT 'reviewer',   -- reviewer / admin
  created_by UUID NULL REFERENCES person(id),
  updated_by UUID NULL REFERENCES person(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL
);
CREATE UNIQUE INDEX uq_hs_team_member_person_active
  ON hs_team_member(person_id) WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- audit_log  (universal append-only change log; immutable)
--   NO soft delete. Immutability + hash-chain triggers are added in
--   migration 5. NOTE: entry_hash is NOT NULL and is computed by a BEFORE
--   INSERT trigger -> that trigger MUST exist before any audit row is written.
--   The canonical-serialization hash logic is build-phase work (see draft);
--   migration 5 installs immutability + a hash-chain trigger stub.
-- ----------------------------------------------------------------------------
CREATE TABLE audit_log (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_number        BIGSERIAL UNIQUE NOT NULL,
  company_id             UUID NOT NULL REFERENCES company(id),
  actor_person_id        UUID NULL REFERENCES person(id),
  actor_type             VARCHAR(20) NOT NULL REFERENCES audit_actor_type(code),
  on_behalf_of_person_id UUID NULL REFERENCES person(id),
  action                 VARCHAR(100) NOT NULL REFERENCES audit_action_type(code),
  content_type           VARCHAR(50) NOT NULL REFERENCES auditable_content_type(code),
  content_id             UUID NOT NULL,                 -- polymorphic; not FK-enforced
  before_diff            JSONB NULL,
  after_diff             JSONB NULL,
  reason                 TEXT NULL,
  metadata               JSONB NOT NULL DEFAULT '{}',
  reverses_audit_id      UUID NULL REFERENCES audit_log(id),
  prev_entry_hash        BYTEA NULL,
  entry_hash             BYTEA NOT NULL,
  hmac_schema_version    SMALLINT NOT NULL DEFAULT 1,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_log_company_created ON audit_log(company_id, created_at DESC);
CREATE INDEX idx_audit_log_content ON audit_log(content_type, content_id);
CREATE INDEX idx_audit_log_actor ON audit_log(actor_person_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_sequence ON audit_log(sequence_number);
