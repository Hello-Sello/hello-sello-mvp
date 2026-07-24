-- ============================================================================
-- realtime_publication_test.sql — IN-03: realtime-publication invariant
-- ----------------------------------------------------------------------------
-- Standing proof that BOTH deal_pending_change AND deal_card are members of the
-- supabase_realtime publication, so DealPin's live postgres_changes subscription
-- (held-change lock + committed-card fields updating on both screens) has a
-- transport to ride. deal_pending_change was published by
-- 20260617130000_deal_pending_change_realtime; deal_card by
-- 20260618120010_deal_card_notes.
--
-- Why this test exists: an e2e fixture comment (refreshDealView, two-company.ts)
-- long claimed deal_pending_change "was never added" — a stale belief carried
-- from before 20260617130000 landed. This invariant makes that false claim
-- impossible to re-introduce silently: drop either table from the publication
-- and this fails.
--
-- (It is deliberately silent on WHY live delivery may still not reach the other
-- side in a test — that is a separate hypothesis to confirm with a live probe,
-- not something this publication-membership check can prove.)
--
-- Run:  bash supabase/tests/run_realtime_publication_test.sh
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_pending int;
  v_card    int;
BEGIN
  SELECT count(*) INTO v_pending
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'deal_pending_change';

  SELECT count(*) INTO v_card
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'deal_card';

  IF v_pending = 0 THEN
    RAISE EXCEPTION 'IN-03 FAIL: deal_pending_change is NOT in the supabase_realtime publication (expected via 20260617130000)';
  END IF;
  IF v_card = 0 THEN
    RAISE EXCEPTION 'IN-03 FAIL: deal_card is NOT in the supabase_realtime publication (expected via 20260618120010)';
  END IF;
END $$;

ROLLBACK;
SELECT 'ALL REALTIME_PUBLICATION TESTS PASSED' AS result;
