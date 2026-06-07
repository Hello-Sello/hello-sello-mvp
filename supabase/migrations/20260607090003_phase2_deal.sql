-- ============================================================================
-- Migration 3/5 — Phase 2 deal tables
-- ----------------------------------------------------------------------------
-- The communication + deal-execution spine: relationship, notes/terms/
-- artifacts, chat, deal_card + confirmation/line-items/log, workspace,
-- members, things, deal artifacts.
-- Depends on migrations 1 (lookups) + 2 (person/company/inbox).
--
-- Cross-cycle / cross-phase FKs deferred:
--   chat_thread.deal_card_id <-> deal_card.thread_id  -> closed at end of file
--   deal_line_item.product_id -> product (Phase 2 catalog)  -> migration 5
-- ============================================================================

-- ----------------------------------------------------------------------------
-- relationship  (company-pair; parent of all threads + deals)
-- ----------------------------------------------------------------------------
CREATE TABLE relationship (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_a_id             UUID NOT NULL REFERENCES company(id),   -- lower UUID
  company_b_id             UUID NOT NULL REFERENCES company(id),
  initiated_by_company_id  UUID NOT NULL REFERENCES company(id),
  inbox_item_id            UUID NULL REFERENCES pending_inbox_item(id),
  status                   VARCHAR(20) NOT NULL DEFAULT 'active'
                             REFERENCES relationship_status(code),
  metadata                 JSONB NOT NULL DEFAULT '{}',
  created_by               UUID NULL REFERENCES person(id),
  updated_by               UUID NULL REFERENCES person(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at               TIMESTAMPTZ NULL,
  CONSTRAINT relationship_canonical_order CHECK (company_a_id < company_b_id)
);
CREATE UNIQUE INDEX uq_relationship_pair_active
  ON relationship(company_a_id, company_b_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_relationship_company_a ON relationship(company_a_id);
CREATE INDEX idx_relationship_company_b ON relationship(company_b_id);
CREATE INDEX idx_relationship_inbox_item ON relationship(inbox_item_id);

-- ----------------------------------------------------------------------------
-- relationship_note  (team / personal notes about a relationship)
-- ----------------------------------------------------------------------------
CREATE TABLE relationship_note (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id UUID NOT NULL REFERENCES relationship(id),
  company_id      UUID NOT NULL REFERENCES company(id),   -- which side wrote it
  scope           VARCHAR(10) NOT NULL REFERENCES note_scope(code),
  body            TEXT NOT NULL,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_by      UUID NULL REFERENCES person(id),
  updated_by      UUID NULL REFERENCES person(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ NULL
);
CREATE INDEX idx_relationship_note_rel_company ON relationship_note(relationship_id, company_id);
CREATE INDEX idx_relationship_note_created_by ON relationship_note(created_by);

-- ----------------------------------------------------------------------------
-- relationship_term  (standing agreed terms; proposal/accept flow)
-- ----------------------------------------------------------------------------
CREATE TABLE relationship_term (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id         UUID NOT NULL REFERENCES relationship(id),
  term_type_code          VARCHAR(30) NOT NULL REFERENCES agreed_term_type(code),
  value                   TEXT NOT NULL,
  status                  VARCHAR(20) NOT NULL DEFAULT 'pending'
                            REFERENCES relationship_term_status(code),
  proposed_by_company_id  UUID NOT NULL REFERENCES company(id),
  proposed_by_person_id   UUID NOT NULL REFERENCES person(id),
  proposed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_by_person_id  UUID NULL REFERENCES person(id),
  responded_at            TIMESTAMPTZ NULL,
  response_note           TEXT NULL,
  superseded_at           TIMESTAMPTZ NULL,
  superseded_by_id        UUID NULL REFERENCES relationship_term(id),
  metadata                JSONB NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at             TIMESTAMPTZ NULL,
  CONSTRAINT relationship_term_responder_paired
    CHECK ((responded_by_person_id IS NULL) = (responded_at IS NULL))
);
CREATE UNIQUE INDEX uq_relationship_term_in_force
  ON relationship_term(relationship_id, term_type_code)
  WHERE status = 'accepted' AND superseded_at IS NULL AND deleted_at IS NULL;
CREATE INDEX idx_relationship_term_rel_type ON relationship_term(relationship_id, term_type_code);
CREATE INDEX idx_relationship_term_rel_status ON relationship_term(relationship_id, status);
CREATE INDEX idx_relationship_term_superseded_by ON relationship_term(superseded_by_id);

-- ----------------------------------------------------------------------------
-- relationship_artifact  (relationship-level files; Storage pointer)
-- ----------------------------------------------------------------------------
CREATE TABLE relationship_artifact (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id       UUID NOT NULL REFERENCES relationship(id),
  uploaded_by_company_id UUID NOT NULL REFERENCES company(id),
  title                 VARCHAR(200) NOT NULL,
  description           TEXT NULL,
  category              VARCHAR(30) NULL REFERENCES artifact_category(code),
  storage_path          TEXT NOT NULL,
  original_filename     VARCHAR(500) NOT NULL,
  mime_type             VARCHAR(100) NOT NULL,
  file_size_bytes       BIGINT NOT NULL,
  scan_status           VARCHAR(20) NOT NULL DEFAULT 'pending'
                          REFERENCES file_scan_status(code),
  metadata              JSONB NOT NULL DEFAULT '{}',
  created_by            UUID NULL REFERENCES person(id),
  updated_by            UUID NULL REFERENCES person(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_by           UUID NULL REFERENCES person(id),
  deleted_at           TIMESTAMPTZ NULL
);
CREATE INDEX idx_relationship_artifact_rel ON relationship_artifact(relationship_id);
CREATE INDEX idx_relationship_artifact_company ON relationship_artifact(uploaded_by_company_id);
CREATE INDEX idx_relationship_artifact_category ON relationship_artifact(category);
CREATE INDEX idx_relationship_artifact_scan ON relationship_artifact(scan_status);

-- ----------------------------------------------------------------------------
-- chat_thread  (c2c / p2p / deal)
--   deal_card_id FK is added after deal_card exists (end of this file).
-- ----------------------------------------------------------------------------
CREATE TABLE chat_thread (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id UUID NOT NULL REFERENCES relationship(id),
  type            VARCHAR(10) NOT NULL REFERENCES chat_thread_type(code),
  person_a_id     UUID NULL REFERENCES person(id),   -- p2p only
  person_b_id     UUID NULL REFERENCES person(id),   -- p2p only
  deal_card_id    UUID NULL,                          -- deal only; FK added below
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ NULL,
  CONSTRAINT chat_thread_p2p_has_both_people
    CHECK (type <> 'p2p' OR (person_a_id IS NOT NULL AND person_b_id IS NOT NULL)),
  CONSTRAINT chat_thread_deal_has_card
    CHECK (type <> 'deal' OR deal_card_id IS NOT NULL),
  CONSTRAINT chat_thread_p2p_canonical_order
    CHECK (type <> 'p2p' OR person_a_id < person_b_id)
);
CREATE UNIQUE INDEX uq_chat_thread_c2c
  ON chat_thread(relationship_id, type) WHERE type = 'c2c' AND deleted_at IS NULL;
CREATE UNIQUE INDEX uq_chat_thread_p2p
  ON chat_thread(relationship_id, person_a_id, person_b_id)
  WHERE type = 'p2p' AND deleted_at IS NULL;
CREATE INDEX idx_chat_thread_rel_type ON chat_thread(relationship_id, type);
CREATE INDEX idx_chat_thread_person_a ON chat_thread(person_a_id);
CREATE INDEX idx_chat_thread_person_b ON chat_thread(person_b_id);

-- ----------------------------------------------------------------------------
-- deal_card  (mutable current state of a deal; versioned)
-- ----------------------------------------------------------------------------
CREATE TABLE deal_card (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id       UUID NOT NULL REFERENCES relationship(id),
  thread_id             UUID NULL REFERENCES chat_thread(id),   -- deal thread, born at Draft
  version               INT NOT NULL DEFAULT 1,
  status                VARCHAR(20) NOT NULL DEFAULT 'draft' REFERENCES deal_card_status(code),
  deal_type             VARCHAR(10) NOT NULL REFERENCES deal_type(code),
  initiating_company_id UUID NOT NULL REFERENCES company(id),
  value_net             NUMERIC(15, 2) NULL,
  currency              CHAR(3) NOT NULL DEFAULT 'EUR',
  offer_expires_at      TIMESTAMPTZ NULL,
  delivery_date_target  TIMESTAMPTZ NULL,
  payment_terms_code    VARCHAR(20) NULL REFERENCES payment_terms(code),
  incoterms_code        VARCHAR(10) NULL REFERENCES incoterms(code),
  buyer_po_number       VARCHAR(100) NULL,
  seller_so_number      VARCHAR(100) NULL,
  hs_deal_number        VARCHAR(50) NULL,
  metadata              JSONB NOT NULL DEFAULT '{}',
  created_by            UUID NULL REFERENCES person(id),
  updated_by            UUID NULL REFERENCES person(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at           TIMESTAMPTZ NULL
);
CREATE INDEX idx_deal_card_rel_status ON deal_card(relationship_id, status);
CREATE INDEX idx_deal_card_initiating ON deal_card(initiating_company_id);
CREATE INDEX idx_deal_card_offer_expires ON deal_card(offer_expires_at)
  WHERE offer_expires_at IS NOT NULL;

-- close the chat_thread <-> deal_card soft cycle
ALTER TABLE chat_thread
  ADD CONSTRAINT chat_thread_deal_card_id_fkey
  FOREIGN KEY (deal_card_id) REFERENCES deal_card(id);
CREATE INDEX idx_chat_thread_deal_card ON chat_thread(deal_card_id);

-- ----------------------------------------------------------------------------
-- chat_message  (every line in every thread; system/sella lines too)
-- ----------------------------------------------------------------------------
CREATE TABLE chat_message (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id        UUID NOT NULL REFERENCES chat_thread(id),
  sender_person_id UUID NULL REFERENCES person(id),    -- NULL for system/sella
  sender           VARCHAR(10) NOT NULL REFERENCES content_author(code),
  type             VARCHAR(50) NOT NULL DEFAULT 'message' REFERENCES chat_message_type(code),
  body             TEXT NOT NULL,
  metadata         JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ NULL
);
CREATE INDEX idx_chat_message_thread_created ON chat_message(thread_id, created_at DESC);
CREATE INDEX idx_chat_message_sender ON chat_message(sender_person_id);

-- ----------------------------------------------------------------------------
-- deal_confirmation  (per-party gate; two rows per (card, version))
-- ----------------------------------------------------------------------------
CREATE TABLE deal_confirmation (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_card_id         UUID NOT NULL REFERENCES deal_card(id),
  version              INT NOT NULL,
  company_id           UUID NOT NULL REFERENCES company(id),
  responding_person_id UUID NULL REFERENCES person(id),
  status               VARCHAR(20) NOT NULL DEFAULT 'pending'
                         REFERENCES deal_confirmation_status(code),
  responded_at         TIMESTAMPTZ NULL,
  note                 TEXT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_deal_confirmation_party UNIQUE (deal_card_id, version, company_id)
);
CREATE INDEX idx_deal_confirmation_card_version ON deal_confirmation(deal_card_id, version);
CREATE INDEX idx_deal_confirmation_company_status ON deal_confirmation(company_id, status);

-- ----------------------------------------------------------------------------
-- deal_line_item  (products per deal version; immutable snapshots)
--   product_id FK -> product is deferred to migration 5 (catalog is migration 4).
-- ----------------------------------------------------------------------------
CREATE TABLE deal_line_item (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_card_id  UUID NOT NULL REFERENCES deal_card(id),
  version       INT NOT NULL,
  product_id    UUID NULL,                              -- FK added in migration 5
  product_name  VARCHAR(200) NOT NULL,
  quantity      NUMERIC(15, 3) NOT NULL,
  unit          VARCHAR(20) NOT NULL REFERENCES deal_line_unit(code),
  unit_price    NUMERIC(15, 4) NOT NULL,
  seller_margin NUMERIC(6, 4) NULL,                     -- seller-only (RLS)
  buyer_metric  NUMERIC(6, 4) NULL,                     -- buyer-only; name TBD
  currency      CHAR(3) NOT NULL DEFAULT 'EUR',
  line_total    NUMERIC(15, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  thc_percent   NUMERIC(5, 2) NULL,
  cbd_percent   NUMERIC(5, 2) NULL,
  sort_order    SMALLINT NOT NULL DEFAULT 0,
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_deal_line_item_version_sort UNIQUE (deal_card_id, version, sort_order)
);
CREATE INDEX idx_deal_line_item_card_version ON deal_line_item(deal_card_id, version);

-- ----------------------------------------------------------------------------
-- deal_card_log  (append-only version history)
-- ----------------------------------------------------------------------------
CREATE TABLE deal_card_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_card_id        UUID NOT NULL REFERENCES deal_card(id),
  version             INT NOT NULL,
  change_summary      TEXT NOT NULL,
  origin              VARCHAR(15) NOT NULL REFERENCES deal_change_origin(code),
  changed_by_person_id UUID NULL REFERENCES person(id),
  changed_by          VARCHAR(10) NOT NULL REFERENCES content_author(code),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_deal_card_log_card_version ON deal_card_log(deal_card_id, version);

-- ----------------------------------------------------------------------------
-- deal_change_input  (per-user evidence note on a change)
-- ----------------------------------------------------------------------------
CREATE TABLE deal_change_input (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_card_id    UUID NOT NULL REFERENCES deal_card(id),
  log_id          UUID NOT NULL REFERENCES deal_card_log(id),
  party_person_id UUID NOT NULL REFERENCES person(id),
  note            TEXT NOT NULL,
  submitted_at    TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_deal_change_input_card_log ON deal_change_input(deal_card_id, log_id);
CREATE INDEX idx_deal_change_input_party ON deal_change_input(party_person_id);

-- ----------------------------------------------------------------------------
-- deal_workspace  (deal execution container; born at Draft; 1:1 with card)
-- ----------------------------------------------------------------------------
CREATE TABLE deal_workspace (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_card_id    UUID NOT NULL REFERENCES deal_card(id),
  owner_person_id UUID NOT NULL REFERENCES person(id),
  visibility      VARCHAR(20) NOT NULL DEFAULT 'company_wide'
                    REFERENCES workspace_visibility(code),
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_by      UUID NULL REFERENCES person(id),
  updated_by      UUID NULL REFERENCES person(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ NULL
);
CREATE UNIQUE INDEX uq_deal_workspace_card_active
  ON deal_workspace(deal_card_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_deal_workspace_card ON deal_workspace(deal_card_id);
CREATE INDEX idx_deal_workspace_owner ON deal_workspace(owner_person_id);
CREATE INDEX idx_deal_workspace_private ON deal_workspace(visibility) WHERE visibility = 'private';

-- ----------------------------------------------------------------------------
-- deal_member  (workspace x person; UX list + private-mode access gate)
-- ----------------------------------------------------------------------------
CREATE TABLE deal_member (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_workspace_id    UUID NOT NULL REFERENCES deal_workspace(id),
  person_id            UUID NOT NULL REFERENCES person(id),
  role                 VARCHAR(20) NOT NULL DEFAULT 'member' REFERENCES deal_member_role(code),
  added_by_person_id   UUID NOT NULL REFERENCES person(id),
  added_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at           TIMESTAMPTZ NULL,
  removed_by_person_id UUID NULL REFERENCES person(id),
  metadata             JSONB NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_deal_member_active
  ON deal_member(deal_workspace_id, person_id) WHERE removed_at IS NULL;
CREATE UNIQUE INDEX uq_deal_member_one_owner
  ON deal_member(deal_workspace_id) WHERE role = 'owner' AND removed_at IS NULL;
CREATE UNIQUE INDEX uq_deal_member_one_side_lead
  ON deal_member(deal_workspace_id) WHERE role = 'side_lead' AND removed_at IS NULL;
CREATE INDEX idx_deal_member_workspace ON deal_member(deal_workspace_id);
CREATE INDEX idx_deal_member_person ON deal_member(person_id);
CREATE INDEX idx_deal_member_workspace_role ON deal_member(deal_workspace_id, role);

-- ----------------------------------------------------------------------------
-- deal_artifact  (deal-scoped files; Storage pointer)
--   Created before `thing` because thing.linked_artifact_id references it.
-- ----------------------------------------------------------------------------
CREATE TABLE deal_artifact (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_workspace_id      UUID NOT NULL REFERENCES deal_workspace(id),
  uploaded_by_company_id UUID NOT NULL REFERENCES company(id),
  title                  VARCHAR(200) NOT NULL,
  description            TEXT NULL,
  category               VARCHAR(30) NULL REFERENCES deal_artifact_category(code),
  storage_path           TEXT NOT NULL,
  original_filename      VARCHAR(500) NOT NULL,
  mime_type              VARCHAR(100) NOT NULL,
  file_size_bytes        BIGINT NOT NULL,
  scan_status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                           REFERENCES file_scan_status(code),
  metadata               JSONB NOT NULL DEFAULT '{}',
  created_by             UUID NULL REFERENCES person(id),
  updated_by            UUID NULL REFERENCES person(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_by            UUID NULL REFERENCES person(id),
  deleted_at            TIMESTAMPTZ NULL
);
CREATE INDEX idx_deal_artifact_workspace ON deal_artifact(deal_workspace_id);
CREATE INDEX idx_deal_artifact_workspace_category ON deal_artifact(deal_workspace_id, category);
CREATE INDEX idx_deal_artifact_company ON deal_artifact(uploaded_by_company_id);
CREATE INDEX idx_deal_artifact_done_detect ON deal_artifact(deal_workspace_id, category)
  WHERE category IN ('delivery_note', 'invoice') AND deleted_at IS NULL;
CREATE INDEX idx_deal_artifact_scan ON deal_artifact(scan_status)
  WHERE scan_status IN ('pending', 'scan_error');

-- ----------------------------------------------------------------------------
-- thing  (the visible work primitive; grouped by deal_stage)
-- ----------------------------------------------------------------------------
CREATE TABLE thing (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_workspace_id      UUID NOT NULL REFERENCES deal_workspace(id),
  title                  VARCHAR(200) NOT NULL,
  description            TEXT NULL,
  type                   VARCHAR(20) NOT NULL DEFAULT 'task' REFERENCES thing_type(code),
  status                 VARCHAR(20) NOT NULL DEFAULT 'open' REFERENCES thing_status(code),
  stage_code             VARCHAR(30) NOT NULL REFERENCES deal_stage(code),
  assignee_person_id     UUID NULL REFERENCES person(id),
  due_at                 TIMESTAMPTZ NULL,
  linked_confirmation_id UUID NULL REFERENCES deal_confirmation(id),
  linked_artifact_id     UUID NULL REFERENCES deal_artifact(id),
  sort_order             SMALLINT NOT NULL DEFAULT 0,
  completed_at           TIMESTAMPTZ NULL,
  completed_by_person_id UUID NULL REFERENCES person(id),
  metadata               JSONB NOT NULL DEFAULT '{}',
  created_by             UUID NULL REFERENCES person(id),
  updated_by             UUID NULL REFERENCES person(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at             TIMESTAMPTZ NULL,
  CONSTRAINT thing_completion_paired
    CHECK ((completed_at IS NULL) = (completed_by_person_id IS NULL)),
  CONSTRAINT thing_done_has_completion
    CHECK (status <> 'done' OR completed_at IS NOT NULL),
  CONSTRAINT thing_confirmation_only_for_approval
    CHECK (type = 'approval' OR linked_confirmation_id IS NULL),
  CONSTRAINT thing_artifact_only_for_upload
    CHECK (type = 'document_upload' OR linked_artifact_id IS NULL)
);
CREATE INDEX idx_thing_workspace_stage_sort ON thing(deal_workspace_id, stage_code, sort_order);
CREATE INDEX idx_thing_assignee_open ON thing(assignee_person_id, status) WHERE status = 'open';
CREATE INDEX idx_thing_workspace_type ON thing(deal_workspace_id, type);
CREATE INDEX idx_thing_linked_confirmation ON thing(linked_confirmation_id)
  WHERE linked_confirmation_id IS NOT NULL;
CREATE INDEX idx_thing_linked_artifact ON thing(linked_artifact_id)
  WHERE linked_artifact_id IS NOT NULL;
