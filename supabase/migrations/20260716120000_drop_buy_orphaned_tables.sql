-- ============================================================================
-- Migration — drop orphaned Buy-page tables
-- ----------------------------------------------------------------------------
-- Buy (Phase 18) was excluded from the main branch merge — its app code and
-- migration file were removed as unfinished/prototype-quality work, but its
-- schema (20260708090000_buy_schema.sql) had already been applied to
-- production independently, leaving buyer_resale_price and
-- purchase_history_import as orphaned tables with no referencing code and no
-- migration file in git. Both tables were empty (verified) with zero
-- audit_log references. Dropping them keeps prod schema consistent with git.
-- ============================================================================

DROP TABLE IF EXISTS buyer_resale_price;
DROP TABLE IF EXISTS purchase_history_import;

DELETE FROM auditable_content_type WHERE code IN ('buyer_resale_price', 'purchase_history_import');
