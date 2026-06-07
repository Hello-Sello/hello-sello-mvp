-- ============================================================================
-- Migration 1/5 — Lookups & Seeds
-- ----------------------------------------------------------------------------
-- All lookup (reference) tables + their seed rows. Runs FIRST so every
-- business table in later migrations can add real FKs to these codes.
--
-- Convention (SCHEMA-DRAFT.md): enums are lookup tables, never native ENUM.
-- Store/reference the stable `code`; user-facing EN/DE labels are translated
-- in the app off `code`, so `description` here is an English fallback only.
-- Lookups are global reference data: exempt from company_id / audit columns.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. Generic code/description/sort_order lookups
-- ----------------------------------------------------------------------------

-- company_type — business categories a company can identify as (supply-chain position)
CREATE TABLE company_type (
  code        VARCHAR(30) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0
);
INSERT INTO company_type (code, description, sort_order) VALUES
  ('cultivator', 'Grows cannabis', 1),
  ('wholesaler', 'Buys and resells in bulk', 2),
  ('importer',   'Imports product into the market', 3),
  ('pharmacy',   'Dispenses to patients', 4);

-- inbox_request_type — kind of inbound request an inbox item represents
CREATE TABLE inbox_request_type (
  code        VARCHAR(30) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0
);
INSERT INTO inbox_request_type (code, description, sort_order) VALUES
  ('connect',           'Plain connection request', 1),
  ('connect_message',   'Connection request carrying a note', 2),
  ('pricelist_request', 'Request for the standard pricelist', 3),
  ('deal_card',         'Carries a deal-card link; accepting seeds a deal draft', 4);

-- artifact_category — optional grouping for relationship-level files
CREATE TABLE artifact_category (
  code        VARCHAR(30) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0
);
INSERT INTO artifact_category (code, description, sort_order) VALUES
  ('contract',    'Signed contract', 1),
  ('nda',         'Non-disclosure agreement', 2),
  ('certificate', 'Certificate or accreditation', 3),
  ('marketing',   'Marketing material', 4),
  ('other',       'Uncategorized', 5);

-- agreed_term_type — controlled vocabulary for relationship-level standing terms
CREATE TABLE agreed_term_type (
  code         VARCHAR(30) PRIMARY KEY,
  description  TEXT NOT NULL,
  value_format VARCHAR(20) NOT NULL,   -- UI input hint: enum / number / text / boolean
  sort_order   SMALLINT NOT NULL DEFAULT 0
);
INSERT INTO agreed_term_type (code, description, value_format, sort_order) VALUES
  ('payment_terms',           'Standing payment terms', 'enum', 1),
  ('incoterms',               'Standing incoterms', 'enum', 2),
  ('min_order_qty',           'Minimum order quantity', 'number', 3),
  ('delivery_lead_time_days', 'Delivery lead time in days', 'number', 4),
  ('exclusivity',             'Exclusivity arrangement (region / channel / product)', 'text', 5);

-- ----------------------------------------------------------------------------
-- A2. Discriminator / reference lookups (formalized 2026-06-07).
--     These were inline "Lookup: a/b/c" VARCHAR columns in the draft; promoted
--     to real lookup tables so new values never need a migration (your
--     convention: enums = lookup tables).
-- ----------------------------------------------------------------------------

-- permission_action — actions a Group can be granted (permission_matrix_entry.action).
--   Seeds deferred: the full permission vocabulary is built alongside the
--   permission-matrix UI. Empty in v0 (one user/company; matrix unexercised).
CREATE TABLE permission_action (
  code        VARCHAR(100) PRIMARY KEY,
  description TEXT NOT NULL,
  category    VARCHAR(50) NULL
);

-- contact_role — classification of an imported contact (contact_record.role)
CREATE TABLE contact_role (
  code        VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0
);
INSERT INTO contact_role (code, description, sort_order) VALUES
  ('customer', 'A customer', 1),
  ('supplier', 'A supplier', 2),
  ('partner',  'A partner', 3),
  ('prospect', 'A prospect', 4),
  ('other',    'Other', 5);

-- contact_provider — source of an imported contact (contact_record.provider)
CREATE TABLE contact_provider (
  code        VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0
);
INSERT INTO contact_provider (code, description, sort_order) VALUES
  ('gmail',   'Google / Gmail', 1),
  ('outlook', 'Microsoft / Outlook', 2);

-- deal_line_unit — unit of measure on a deal line item (deal_line_item.unit).
--   NOTE: overlaps conceptually with product_unit (g/mL/pack). Kept separate to
--   stay faithful to the draft's distinct value set (g/kg/unit). Possible future
--   consolidation into one unit_of_measure lookup — flagged 2026-06-07.
CREATE TABLE deal_line_unit (
  code        VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0
);
INSERT INTO deal_line_unit (code, description, sort_order) VALUES
  ('g',    'Gram', 1),
  ('kg',   'Kilogram', 2),
  ('unit', 'Unit', 3);

-- deal_type — who initiated a deal card (deal_card.deal_type)
CREATE TABLE deal_type (
  code        VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0
);
INSERT INTO deal_type (code, description, sort_order) VALUES
  ('offer', 'Seller-initiated', 1),
  ('order', 'Buyer-initiated', 2);

-- chat_thread_type — kind of chat thread (chat_thread.type)
CREATE TABLE chat_thread_type (
  code        VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0
);
INSERT INTO chat_thread_type (code, description, sort_order) VALUES
  ('c2c',  'Company-to-company channel', 1),
  ('p2p',  'Person-to-person thread', 2),
  ('deal', 'Deal thread', 3);

-- content_author — who/what produced a piece of content. Shared by
--   chat_message.sender AND deal_card_log.changed_by (identical value set —
--   one lookup instead of two duplicates).
CREATE TABLE content_author (
  code        VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0
);
INSERT INTO content_author (code, description, sort_order) VALUES
  ('person', 'A human participant', 1),
  ('system', 'An automated system process', 2),
  ('sella',  'The Sella AI agent', 3);

-- deal_change_origin — where a deal-change input came from (deal_change_input.origin)
CREATE TABLE deal_change_origin (
  code        VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0
);
INSERT INTO deal_change_origin (code, description, sort_order) VALUES
  ('p2p',       'From a person-to-person chat', 1),
  ('deal_chat', 'From the deal chat', 2),
  ('system',    'System-generated', 3);

-- note_scope — visibility scope of a relationship note (relationship_note.scope)
CREATE TABLE note_scope (
  code        VARCHAR(10) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0
);
INSERT INTO note_scope (code, description, sort_order) VALUES
  ('team',     'Visible to the whole company', 1),
  ('personal', 'Visible only to the author', 2);

-- chat_message_type — discriminator for a chat message (chat_message.type)
CREATE TABLE chat_message_type (
  code        VARCHAR(50) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0
);
INSERT INTO chat_message_type (code, description, sort_order) VALUES
  ('message',                'A normal message', 10),
  ('connection_established', 'Connection established (system line)', 20),
  ('deal_started',           'A deal was started', 30),
  ('intro',                  'Introduction line', 40),
  ('deal_detected',          'Sella detected a possible deal', 50),
  ('workspace_created',      'A deal workspace was created', 60),
  ('deal_cancelled',         'A deal was cancelled', 70),
  ('deal_opened',            'A deal was opened', 80),
  ('deal_card_updated',      'A deal card was updated (projection of a log entry)', 90);

-- payment_terms — agreed payment terms (deal_card.payment_terms_code).
--   Draft named NET30 / NET60 / COD as examples; broadened to a common B2B set.
--   Lookup table = add values without a migration.
CREATE TABLE payment_terms (
  code        VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0
);
INSERT INTO payment_terms (code, description, sort_order) VALUES
  ('cod',     'Cash on delivery', 10),
  ('prepaid', 'Paid in advance', 20),
  ('net7',    'Net 7 days', 30),
  ('net14',   'Net 14 days', 40),
  ('net30',   'Net 30 days', 50),
  ('net60',   'Net 60 days', 60),
  ('net90',   'Net 90 days', 70);

-- incoterms — agreed Incoterms (deal_card.incoterms_code). Incoterms 2020 set.
CREATE TABLE incoterms (
  code        VARCHAR(10) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0
);
INSERT INTO incoterms (code, description, sort_order) VALUES
  ('EXW', 'Ex Works', 10),
  ('FCA', 'Free Carrier', 20),
  ('FAS', 'Free Alongside Ship', 30),
  ('FOB', 'Free On Board', 40),
  ('CFR', 'Cost and Freight', 50),
  ('CIF', 'Cost, Insurance and Freight', 60),
  ('CPT', 'Carriage Paid To', 70),
  ('CIP', 'Carriage and Insurance Paid To', 80),
  ('DAP', 'Delivered At Place', 90),
  ('DPU', 'Delivered At Place Unloaded', 100),
  ('DDP', 'Delivered Duty Paid', 110);

-- ----------------------------------------------------------------------------
-- B. Catalog lookups (code/description/sort_order)
-- ----------------------------------------------------------------------------

-- product_unit — unit of measure for catalog products
CREATE TABLE product_unit (
  code        VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0
);
INSERT INTO product_unit (code, description, sort_order) VALUES
  ('g',    'Gram', 1),
  ('mL',   'Millilitre', 2),
  ('pack', 'Pack', 3);

-- strain_dominance — cannabis strain classification
CREATE TABLE strain_dominance (
  code        VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0
);
INSERT INTO strain_dominance (code, description, sort_order) VALUES
  ('indica',           'Indica', 1),
  ('sativa',           'Sativa', 2),
  ('hybrid',           'Balanced hybrid', 3),
  ('indica_dominant',  'Indica-dominant hybrid', 4),
  ('sativa_dominant',  'Sativa-dominant hybrid', 5);

-- irradiation_type — sterilisation method applied to product
CREATE TABLE irradiation_type (
  code        VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0
);
INSERT INTO irradiation_type (code, description, sort_order) VALUES
  ('beta',          'Beta irradiation', 1),
  ('gamma',         'Gamma irradiation', 2),
  ('un_irradiated', 'Not irradiated', 3);

-- pricelist_status — lifecycle of a pricelist header
CREATE TABLE pricelist_status (
  code        VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0
);
INSERT INTO pricelist_status (code, description, sort_order) VALUES
  ('draft',     'Draft, not yet visible to buyers', 1),
  ('published', 'Published and live', 2);

-- ----------------------------------------------------------------------------
-- C. Status lookups — shared shape:
--    code VARCHAR PK · description · sort_order · is_terminal
--    (is_terminal = TRUE marks an end state, so "history"/"done" filters
--     read is_terminal instead of hardcoding status names)
-- ----------------------------------------------------------------------------

CREATE TABLE company_verification_status (
  code        VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  is_terminal BOOLEAN NOT NULL DEFAULT FALSE
);
INSERT INTO company_verification_status (code, description, sort_order, is_terminal) VALUES
  ('pending',  'Awaiting HS team review', 1, FALSE),
  ('verified', 'Approved', 2, TRUE),
  ('rejected', 'Rejected', 3, TRUE);

CREATE TABLE file_scan_status (
  code        VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  is_terminal BOOLEAN NOT NULL DEFAULT FALSE
);
INSERT INTO file_scan_status (code, description, sort_order, is_terminal) VALUES
  ('pending',    'Awaiting virus scan', 1, FALSE),
  ('clean',      'Scan passed', 2, TRUE),
  ('infected',   'Malware detected', 3, TRUE),
  ('scan_error', 'Scan failed to complete', 4, TRUE);

CREATE TABLE relationship_term_status (
  code        VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  is_terminal BOOLEAN NOT NULL DEFAULT FALSE
);
INSERT INTO relationship_term_status (code, description, sort_order, is_terminal) VALUES
  ('pending',  'Proposed, awaiting the other side', 1, FALSE),
  ('accepted', 'Accepted and in force', 2, TRUE),
  ('rejected', 'Declined', 3, TRUE);

-- relationship_status — lifecycle of a company-to-company relationship
CREATE TABLE relationship_status (
  code        VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  is_terminal BOOLEAN NOT NULL DEFAULT FALSE
);
INSERT INTO relationship_status (code, description, sort_order, is_terminal) VALUES
  ('active',    'Active relationship', 1, FALSE),
  ('suspended', 'Temporarily suspended', 2, FALSE),
  ('ended',     'Ended', 3, TRUE);

CREATE TABLE inbox_status (
  code        VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  is_terminal BOOLEAN NOT NULL DEFAULT FALSE
);
INSERT INTO inbox_status (code, description, sort_order, is_terminal) VALUES
  ('pending',  'Awaiting a decision', 1, FALSE),
  ('accepted', 'Accepted', 2, TRUE),
  ('rejected', 'Rejected', 3, TRUE);

CREATE TABLE join_request_status (
  code        VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  is_terminal BOOLEAN NOT NULL DEFAULT FALSE
);
INSERT INTO join_request_status (code, description, sort_order, is_terminal) VALUES
  ('pending',   'Awaiting approval', 1, FALSE),
  ('approved',  'Approved', 2, TRUE),
  ('rejected',  'Rejected', 3, TRUE),
  ('cancelled', 'Withdrawn by requester', 4, TRUE);

CREATE TABLE deal_card_status (
  code        VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  is_terminal BOOLEAN NOT NULL DEFAULT FALSE
);
INSERT INTO deal_card_status (code, description, sort_order, is_terminal) VALUES
  ('draft',     'Being negotiated', 1, FALSE),
  ('withdrawn', 'Initiator pulled back before a response', 2, TRUE),
  ('confirmed', 'Both sides confirmed', 3, FALSE),
  ('amended',   'Reopened/changed after confirmation', 4, FALSE),
  ('done',      'Delivery note + invoice present (app-set)', 5, TRUE),
  ('cancelled', 'Cancelled', 6, TRUE);

CREATE TABLE deal_confirmation_status (
  code        VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  is_terminal BOOLEAN NOT NULL DEFAULT FALSE
);
INSERT INTO deal_confirmation_status (code, description, sort_order, is_terminal) VALUES
  ('pending',   'Awaiting this party', 1, FALSE),
  ('confirmed', 'This party confirmed', 2, TRUE),
  ('rejected',  'This party rejected', 3, TRUE);

CREATE TABLE workspace_visibility (
  code        VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  is_terminal BOOLEAN NOT NULL DEFAULT FALSE
);
INSERT INTO workspace_visibility (code, description, sort_order, is_terminal) VALUES
  ('company_wide', 'Visible to the whole company (default)', 1, FALSE),
  ('private',      'Restricted to invited members', 2, FALSE);

CREATE TABLE deal_member_role (
  code        VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  is_terminal BOOLEAN NOT NULL DEFAULT FALSE
);
INSERT INTO deal_member_role (code, description, sort_order, is_terminal) VALUES
  ('owner',     'Deal owner', 1, FALSE),
  ('side_lead', 'Lead for one side; controls own-side member adds', 2, FALSE),
  ('member',    'Participant', 3, FALSE);

CREATE TABLE thing_type (
  code        VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  is_terminal BOOLEAN NOT NULL DEFAULT FALSE
);
INSERT INTO thing_type (code, description, sort_order, is_terminal) VALUES
  ('task',            'A unit of work', 1, FALSE),
  ('approval',        'An approval gate (links to deal_confirmation)', 2, FALSE),
  ('document_upload', 'A required document (links to deal_artifact)', 3, FALSE);

CREATE TABLE thing_status (
  code        VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  is_terminal BOOLEAN NOT NULL DEFAULT FALSE
);
INSERT INTO thing_status (code, description, sort_order, is_terminal) VALUES
  ('open', 'Not yet done', 1, FALSE),
  ('done', 'Completed', 2, TRUE);

CREATE TABLE deal_stage (
  code        VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  is_terminal BOOLEAN NOT NULL DEFAULT FALSE
);
INSERT INTO deal_stage (code, description, sort_order, is_terminal) VALUES
  ('negotiation',         'Negotiating terms', 1, FALSE),
  ('compliance_quality',  'Compliance & quality checks', 2, FALSE),
  ('agreement',           'Agreement reached (Draft -> Confirmed flips here)', 3, FALSE),
  ('payment',             'Payment', 4, FALSE),
  ('fulfilment_delivery', 'Fulfilment & delivery', 5, FALSE);

-- NOTE: code widened to VARCHAR(30) (vs the VARCHAR(20) status shape) because
-- 'certificate_of_origin' is 21 chars. Flagged to schema owner 2026-06-07.
CREATE TABLE deal_artifact_category (
  code        VARCHAR(30) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  is_terminal BOOLEAN NOT NULL DEFAULT FALSE
);
INSERT INTO deal_artifact_category (code, description, sort_order, is_terminal) VALUES
  ('delivery_note',         'Delivery note', 1, FALSE),
  ('invoice',               'Invoice', 2, FALSE),
  ('proforma_invoice',      'Proforma invoice', 3, FALSE),
  ('contract',              'Contract', 4, FALSE),
  ('co_a',                  'Certificate of analysis', 5, FALSE),
  ('packing_list',          'Packing list', 6, FALSE),
  ('certificate_of_origin', 'Certificate of origin', 7, FALSE),
  ('phytosanitary_cert',    'Phytosanitary certificate', 8, FALSE),
  ('other',                 'Other', 9, FALSE);

-- ----------------------------------------------------------------------------
-- D. Audit lookups (audit_log vocabulary)
-- ----------------------------------------------------------------------------

CREATE TABLE audit_actor_type (
  code        VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL
);
INSERT INTO audit_actor_type (code, description) VALUES
  ('user',    'An end user'),
  ('hs_team', 'A Hello Sello team member'),
  ('sella',   'The Sella AI agent'),
  ('system',  'An automated system process'),
  ('webhook', 'An inbound webhook');

CREATE TABLE audit_action_type (
  code               VARCHAR(100) PRIMARY KEY,  -- resource.action_past_tense
  description        TEXT NOT NULL,
  category           VARCHAR(50) NOT NULL,
  reversibility_tier VARCHAR(15) NULL,          -- taxonomy deferred
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO audit_action_type (code, description, category) VALUES
  ('company.verify_approved',         'HS team approved a company verification', 'verification'),
  ('company.verify_rejected',         'HS team rejected a company verification', 'verification'),
  ('company.verify_reverted',         'A prior verification decision was reversed', 'verification'),
  ('company.license_viewed',          'HS team viewed a company license document', 'access'),
  ('company.license_downloaded',      'HS team downloaded a company license document', 'access'),
  ('pricelist.published',             'A user published a pricelist', 'pricing'),
  ('pricelist.amended',               'A pricelist was edited', 'pricing'),
  ('permission.granted',              'A permission was granted to a Group', 'permissions'),
  ('permission.revoked',              'A permission was revoked from a Group', 'permissions'),
  ('esignature.signed',               'A user e-signed an approval', 'esignature'),
  ('person.soft_deleted',             'An entity was soft-deleted', 'lifecycle'),
  ('person.gdpr_scrubbed',            'PII was scrubbed for GDPR right-to-be-forgotten', 'compliance'),
  ('relationship_term.proposed',      'One side proposed a new agreed term', 'lifecycle'),
  ('relationship_term.accepted',      'The other side accepted a proposed term', 'lifecycle'),
  ('relationship_term.rejected',      'The other side rejected a proposed term', 'lifecycle'),
  ('relationship_artifact.uploaded',  'A relationship-level file was uploaded', 'lifecycle'),
  ('relationship_artifact.downloaded','A relationship-level file was downloaded', 'access'),
  ('relationship_artifact.deleted',   'A relationship-level file was soft-deleted', 'lifecycle'),
  ('product.created',                 'A catalog product was created', 'lifecycle'),
  ('product.amended',                 'A catalog product was edited', 'lifecycle'),
  ('product_batch.created',           'A product batch (lot) was added', 'lifecycle'),
  ('hs_team.member_added',            'A Hello Sello team member was granted access', 'permissions'),
  ('hs_team.member_removed',          'A Hello Sello team member''s access was revoked', 'permissions');

CREATE TABLE auditable_content_type (
  code         VARCHAR(50) PRIMARY KEY,
  description  TEXT NOT NULL,
  target_table VARCHAR(50) NOT NULL
);
INSERT INTO auditable_content_type (code, description, target_table) VALUES
  ('company',                 'A company', 'company'),
  ('person',                  'A person', 'person'),
  ('pricelist',               'A pricelist header', 'pricelist'),
  ('pricelist_item',          'A pricelist row', 'pricelist_item'),
  ('deal_card',               'A deal card', 'deal_card'),
  ('person_group',            'A person-group membership', 'person_group'),
  ('group',                   'A permission group', 'group'),
  ('permission_matrix_entry', 'A permission grant', 'permission_matrix_entry'),
  ('pending_inbox_item',      'An inbox item', 'pending_inbox_item'),
  ('relationship_note',       'A relationship note', 'relationship_note'),
  ('relationship_term',       'A relationship term', 'relationship_term'),
  ('relationship_artifact',   'A relationship artifact', 'relationship_artifact'),
  ('deal_workspace',          'A deal workspace', 'deal_workspace'),
  ('deal_member',             'A deal workspace member', 'deal_member'),
  ('thing',                   'A deal thing (task/approval/upload)', 'thing'),
  ('deal_artifact',           'A deal artifact', 'deal_artifact'),
  ('product',                 'A catalog product', 'product'),
  ('product_batch',           'A product batch', 'product_batch'),
  ('product_buyer_code',      'A buyer-specific product code', 'product_buyer_code'),
  ('join_request',            'A request to join a company', 'join_request');

-- ----------------------------------------------------------------------------
-- E. Terpene reference vocabulary (catalog)
-- ----------------------------------------------------------------------------

CREATE TABLE terpene (
  code              VARCHAR(40) PRIMARY KEY,
  name              VARCHAR(60) NOT NULL,
  aroma_description TEXT NULL
);
INSERT INTO terpene (code, name) VALUES
  ('myrcene',            'Myrcene'),
  ('limonene',           'Limonene'),
  ('beta_caryophyllene', 'Beta-Caryophyllene'),
  ('pinene',             'Pinene'),
  ('linalool',           'Linalool'),
  ('terpinolene',        'Terpinolene'),
  ('humulene',           'Humulene'),
  ('ocimene',            'Ocimene'),
  ('bisabolol',          'Bisabolol'),
  ('nerolidol',          'Nerolidol'),
  ('eucalyptol',         'Eucalyptol'),
  ('camphene',           'Camphene'),
  ('terpineol',          'Terpineol'),
  ('geraniol',           'Geraniol'),
  ('valencene',          'Valencene'),
  ('fenchol',            'Fenchol'),
  ('borneol',            'Borneol'),
  ('phellandrene',       'Phellandrene'),
  ('sabinene',           'Sabinene'),
  ('guaiol',             'Guaiol'),
  ('delta_3_carene',     'Delta-3-Carene'),
  ('pulegone',           'Pulegone');
