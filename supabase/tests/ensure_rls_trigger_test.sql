-- ============================================================================
-- ensure_rls_trigger_test.sql — new tables are born with RLS enabled
-- ----------------------------------------------------------------------------
-- Guards the `ensure_rls` event trigger captured by
-- 20260817130000_capture_ensure_rls_drift.sql.
--
-- WHY THIS EXISTS. The trigger lived only on production for months, created by
-- hand and absent from every migration, so a fresh `supabase db reset` built a
-- database that did not match prod. That divergence is invisible and its failure
-- mode is nasty: a future table whose migration forgets `enable row level
-- security` works locally (RLS off, rows visible) and returns ZERO ROWS on
-- production (RLS on, no policies), with no error anywhere.
--
-- 20260607170000_rls_policies.sql enables RLS in a one-time loop over the tables
-- that existed on 2026-06-07, so it protects nothing created after that date.
-- This trigger is what covers everything since — hence a test for it.
--
-- Run:  bash supabase/tests/run_ensure_rls_trigger_test.sh
-- ============================================================================

BEGIN;
CREATE TABLE public.ensure_rls_probe_tbl (id int primary key);
DO $$
BEGIN
  IF NOT (SELECT c.relrowsecurity
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relname = 'ensure_rls_probe_tbl')
  THEN
    RAISE EXCEPTION 'GUARD NOT FIRING: a newly created table has RLS disabled — the ensure_rls event trigger is missing or broken. A table created now would be open locally and deny-all on production.';
  END IF;
END $$;
ROLLBACK;

-- Standing invariant: nothing in public may sit without RLS, whatever created it.
DO $$
DECLARE v_open text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO v_open
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity;
  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'TABLES WITHOUT RLS in schema public: %', v_open;
  END IF;
END $$;

SELECT 'ALL ENSURE-RLS TRIGGER TESTS PASSED' AS result;
