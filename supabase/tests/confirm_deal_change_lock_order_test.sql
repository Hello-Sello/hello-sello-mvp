-- ============================================================================
-- confirm_deal_change_lock_order_test.sql — WR-03: uniform card-lock order
-- ----------------------------------------------------------------------------
-- Phase-12 hardening (Wave 3a). sign_deal takes the deal_card lock FIRST and
-- then nests confirm_deal_change, which used to take ONLY the
-- deal_pending_change lock — so two concurrent paths could acquire the two row
-- locks in opposite orders (card→pending vs pending→…card) and deadlock.
--
-- The fix makes confirm_deal_change lock the deal_card row FOR UPDATE *before*
-- it locks the pending row, matching sign_deal's order (the nested call then
-- re-locks the card it already holds — a no-op). This is a STATIC proof on the
-- installed function source: the card-lock needle must EXIST and must PRECEDE
-- the first deal_pending_change reference.
--
-- Static (pg_get_functiondef) rather than a live race: a deadlock is
-- non-deterministic to reproduce in one psql session, but the lock ORDER is a
-- fixed property of the source. Whitespace-normalised + lowercased so
-- re-indentation never breaks the assertion.
--
-- ⚠️ RED-FIRST: fails before the WR-03 fix (no deal_card FOR UPDATE → needle
-- position 0). GREEN once the card lock ships in
-- 20260724120100_confirm_deal_change_negotiation_membership.sql.
--
-- Run:  bash supabase/tests/run_confirm_deal_change_lock_order_test.sh
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_def  text;
  v_lock int;
  v_pend int;
BEGIN
  v_def := lower(regexp_replace(
    pg_get_functiondef('public.confirm_deal_change(uuid,text,text)'::regprocedure),
    '\s+', ' ', 'g'));

  -- the card-lock needle (specific enough to match ONLY the FOR UPDATE lock line,
  -- not the commit-branch `update public.deal_card set …` nor `deal_card_id`).
  v_lock := position('deal_card where id = p_deal_card_id for update' in v_def);
  -- the first reference to the pending-change table (its own FOR UPDATE lock).
  v_pend := position('deal_pending_change' in v_def);

  IF v_lock = 0 THEN
    RAISE EXCEPTION 'WR-03 FAIL: confirm_deal_change never locks the deal_card row FOR UPDATE (uniform lock order missing)';
  END IF;
  IF v_lock >= v_pend THEN
    RAISE EXCEPTION 'WR-03 FAIL: the deal_card lock (pos %) must PRECEDE the first deal_pending_change reference (pos %)', v_lock, v_pend;
  END IF;
END $$;

ROLLBACK;
SELECT 'ALL CONFIRM_DEAL_CHANGE_LOCK_ORDER TESTS PASSED' AS result;
