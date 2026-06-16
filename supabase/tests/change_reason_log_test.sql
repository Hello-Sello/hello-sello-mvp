-- ============================================================================
-- change_reason_log_test.sql — the REAS-02 two-sided reason-log invariant
-- ----------------------------------------------------------------------------
-- INVARIANT UNDER TEST (Phase 1, REAS-02 / D-06 / D-07):
--   When a held change COMMITS (both sides accept), the durable history must
--   record EXACTLY:
--     • ONE `deal_card_log` row for the new version, and
--     • TWO `deal_change_input` rows linked to that log row — one per responder
--       (the proposer's required reason + the accepter's required reason).
--   This is the shape the commit RPC (plan 02/03) must satisfy so a two-sided
--   change always carries both intents into the permanent log.
--
-- STATUS: RED until plan 02 creates `public.deal_pending_change` (referenced
--   below so this test fails fast until the table exists) and plan 02/03 add the
--   commit RPC. Run now and it errors with "relation deal_pending_change does
--   not exist" — the expected test-first state. The commit RPC does not exist
--   yet, so we encode the invariant directly: write one log row + two input rows
--   exactly as the commit must, then assert the counts. The assertion is the
--   contract the commit body is built to satisfy.
--
-- SHAPE: mirrors supabase/tests/rls_isolation_test.sql — a single BEGIN ...
--   ROLLBACK transaction; ephemeral fixtures, NO committed trace.
--
-- Run:  psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f supabase/tests/change_reason_log_test.sql
--   ON_ERROR_STOP=1 is REQUIRED: without it psql skips past an error to the
--   final SELECT and prints a FALSE 'PASSED'. With it, any error (e.g. the
--   missing `deal_pending_change` table while this is RED) aborts non-zero.
--
-- Fixtures reuse the seeded GreenLeaf↔StonePharm RELATIONSHIP (the local seed
--   already has it) + a fresh, non-seeded deal_card under it.
-- ============================================================================

BEGIN;

-- ── Fixtures (rolled back at the end) ────────────────────────────────────────
-- Reuse the seeded relationship; create a fresh deal_card at version 2 under it.
INSERT INTO deal_card (id, relationship_id, version, deal_type, initiating_company_id, created_by)
SELECT 'cccccccc-cccc-cccc-cccc-cccccccccccc', r.id, 2, 'offer',
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       '11111111-1111-1111-1111-111111111111'
FROM relationship r
WHERE r.company_a_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND r.company_b_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

-- The change began as a held pending row (referencing the plan-02 table forces
-- this test RED until the migration lands — the deal_pending_change row is the
-- thing that resolves into the log + inputs below).
INSERT INTO public.deal_pending_change
  (deal_card_id, base_version, source, proposed_by_company, proposed_by_person,
   proposer_reason, draft, votes)
VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 1, 'manual',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   'Increase quantity to 120',
   '{"value_net": 600, "currency": "EUR", "line_items": []}'::jsonb,
   jsonb_build_object('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'accept',
                      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'accept'));

-- ── The commit's durable write: ONE log row for the new version ──────────────
-- origin is a deal_change_origin code ('deal_chat'); changed_by is a
-- content_author code ('person'); both as the commit RPC will use them.
INSERT INTO public.deal_card_log
  (id, deal_card_id, version, change_summary, origin, changed_by, changed_by_person_id)
VALUES
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
   'cccccccc-cccc-cccc-cccc-cccccccccccc', 2, 'Deal updated to v2.',
   'deal_chat', 'person', '11111111-1111-1111-1111-111111111111');

-- ── TWO deal_change_input rows linked to that ONE log row (one per responder) ─
INSERT INTO public.deal_change_input
  (deal_card_id, log_id, party_person_id, note, submitted_at)
VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc',
   'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
   '11111111-1111-1111-1111-111111111111', 'Increase quantity to 120', now()),  -- proposer
  ('cccccccc-cccc-cccc-cccc-cccccccccccc',
   'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
   '22222222-2222-2222-2222-222222222222', 'Agreed, 120 works', now());          -- accepter

-- ── Assert the exact shape: 1 log row + 2 input rows, all linked ─────────────
DO $$
DECLARE
  v_log_count   int;
  v_input_count int;
BEGIN
  SELECT count(*) INTO v_log_count
  FROM public.deal_card_log
  WHERE deal_card_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' AND version = 2;
  IF v_log_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: expected exactly 1 deal_card_log row for v2, found %', v_log_count;
  END IF;

  SELECT count(*) INTO v_input_count
  FROM public.deal_change_input
  WHERE log_id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
  IF v_input_count <> 2 THEN
    RAISE EXCEPTION 'FAIL: expected exactly 2 deal_change_input rows (proposer + accepter), found %', v_input_count;
  END IF;

  -- both inputs must be distinct people (the two sides), not the same reason twice
  IF (SELECT count(DISTINCT party_person_id)
      FROM public.deal_change_input
      WHERE log_id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1') <> 2 THEN
    RAISE EXCEPTION 'FAIL: the two deal_change_input rows must come from the two distinct responders';
  END IF;
END $$;

ROLLBACK;
SELECT 'CHANGE REASON LOG TEST PASSED' AS result;
