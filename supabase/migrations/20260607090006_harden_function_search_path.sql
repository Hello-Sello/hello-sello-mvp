-- ============================================================================
-- Migration 6/6 — harden function search_path
-- ----------------------------------------------------------------------------
-- Pins search_path on the two trigger functions that lacked it, clearing the
-- Supabase `function_search_path_mutable` security advisory. Both functions
-- only use pg_catalog built-ins (NOW(), RAISE), so an empty search_path is
-- safe — pg_catalog is always implicitly resolvable.
-- (audit_log_compute_hash already pins search_path in migration 5.)
-- ============================================================================

ALTER FUNCTION set_updated_at() SET search_path = '';
ALTER FUNCTION audit_log_reject_mutation() SET search_path = '';
