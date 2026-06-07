-- ============================================================================
-- Migration 5/5 — deferred FKs + triggers
-- ----------------------------------------------------------------------------
-- Runs last. Closes cross-phase FKs that couldn't exist at table-create time,
-- installs updated_at automation, and makes audit_log append-only +
-- tamper-evident.
-- Depends on migrations 1-4 (all tables exist).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Deferred cross-phase foreign keys
-- ----------------------------------------------------------------------------

-- pending_inbox_item.deal_card_id -> deal_card (deal_card is Phase 2 / migration 3)
ALTER TABLE pending_inbox_item
  ADD CONSTRAINT pending_inbox_item_deal_card_id_fkey
  FOREIGN KEY (deal_card_id) REFERENCES deal_card(id);
CREATE INDEX idx_pending_inbox_deal_card ON pending_inbox_item(deal_card_id)
  WHERE deal_card_id IS NOT NULL;

-- deal_line_item.product_id -> product (product is catalog / migration 4)
ALTER TABLE deal_line_item
  ADD CONSTRAINT deal_line_item_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES product(id);
CREATE INDEX idx_deal_line_item_product ON deal_line_item(product_id)
  WHERE product_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. updated_at automation
--    One trigger function; attached to every table that carries updated_at.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    -- Phase 1
    'person','company','company_license_file','group','permission_matrix_entry',
    'contact_record','pending_inbox_item','join_request','hs_team_member',
    -- Phase 2 deal
    'relationship','relationship_note','relationship_term','relationship_artifact',
    'deal_card','deal_confirmation','deal_workspace','deal_member','deal_artifact','thing',
    -- Catalog
    'product','product_batch','product_buyer_code','pricelist','pricelist_item'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_set_updated_at
         BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t, t);
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. audit_log — append-only + tamper-evident hash chain
--    Immutability is enforced here regardless of role (defense in depth).
--    The dedicated app_writer role + grants are an F2 (RLS/roles) concern.
--
--    NOTE: the canonical serialization below is v1 (hmac_schema_version=1) and
--    intentionally simple. Build phase should validate it against the JCS spec
--    and add the GDPR-scrub recompute helper (both flagged in SCHEMA-DRAFT).
--    Bumping the scheme later just increments hmac_schema_version on new rows.
--    BUILD-PHASE HARDENING: the advisory lock is taken AFTER the BIGSERIAL
--    sequence_number is drawn, so under concurrent inserts the chain can fork
--    (two rows chaining off the same tip). For a truly fork-proof chain, acquire
--    the lock before consuming the sequence (app-boundary session lock) or run
--    the append at SERIALIZABLE. Acceptable for v0 single-writer demo load.
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- reject any UPDATE/DELETE on audit_log
CREATE OR REPLACE FUNCTION audit_log_reject_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only (% rejected)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_log_no_update
  BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_reject_mutation();
CREATE TRIGGER trg_audit_log_no_delete
  BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_reject_mutation();

-- compute prev_entry_hash + entry_hash on insert (serialized via advisory lock)
-- search_path pinned so extensions.digest resolves under any caller's path.
CREATE OR REPLACE FUNCTION audit_log_compute_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  prev      BYTEA;
  canonical TEXT;
BEGIN
  -- serialize appends so the global chain stays well-ordered
  PERFORM pg_advisory_xact_lock(hashtext('audit_log_chain'));

  SELECT entry_hash INTO prev
  FROM audit_log
  ORDER BY sequence_number DESC
  LIMIT 1;

  NEW.prev_entry_hash := prev;   -- NULL for the first row

  canonical := concat_ws('|',
    NEW.id::text,
    NEW.sequence_number::text,
    NEW.company_id::text,
    coalesce(NEW.actor_person_id::text, ''),
    NEW.actor_type,
    coalesce(NEW.on_behalf_of_person_id::text, ''),
    NEW.action,
    NEW.content_type,
    NEW.content_id::text,
    coalesce(NEW.before_diff::text, ''),
    coalesce(NEW.after_diff::text, ''),
    coalesce(NEW.reason, ''),
    NEW.metadata::text,
    coalesce(NEW.reverses_audit_id::text, ''),
    to_char(NEW.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  );

  NEW.entry_hash := extensions.digest(coalesce(prev, ''::bytea) || convert_to(canonical, 'UTF8'), 'sha256');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_log_hash
  BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_compute_hash();
