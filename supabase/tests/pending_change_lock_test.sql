-- ============================================================================
-- pending_change_lock_test.sql — the DCHG-03 full-lock invariant
-- ----------------------------------------------------------------------------
-- INVARIANT UNDER TEST (Phase 1, DCHG-03 / D-03 / D-05):
--   A deal card may have AT MOST ONE active pending change at a time. A second
--   active `deal_pending_change` row for the same `deal_card_id` MUST be rejected
--   by the database with a unique-violation (SQLSTATE 23505) — the DB constraint,
--   not the disabled Edit pencil, is the real lock and the concurrency guard.
--   This is the regression guard for the "two papers on the table" race.
--
-- STATUS: RED until plan 02 creates `public.deal_pending_change` + its
--   partial-/plain-unique index on `deal_card_id`. Run now and it errors with
--   "relation deal_pending_change does not exist" — that is the expected
--   test-first state. It goes GREEN the moment the migration lands.
--
-- SHAPE: mirrors supabase/tests/rls_isolation_test.sql — a single BEGIN ...
--   ROLLBACK transaction so the fixtures are ephemeral and leave NO trace.
--
-- Run:  psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f supabase/tests/pending_change_lock_test.sql
--   ON_ERROR_STOP=1 is REQUIRED: without it psql skips past an error to the
--   final SELECT and prints a FALSE 'PASSED'. With it, any error (e.g. the
--   missing `deal_pending_change` table while this is RED) aborts with a
--   non-zero exit and NO success line.
--
-- Fixtures reuse the seeded GreenLeaf↔StonePharm RELATIONSHIP (the local seed
--   already has it — inserting a duplicate would hit uq_relationship_pair_active)
--   and a fresh, non-seeded deal_card under it.
-- ============================================================================

BEGIN;

-- ── Fixtures (rolled back at the end) ────────────────────────────────────────
-- Look up the seeded GreenLeaf↔StonePharm relationship rather than inserting a
-- duplicate; create a fresh deal_card under it.
INSERT INTO deal_card (id, relationship_id, deal_type, initiating_company_id, created_by)
SELECT 'cccccccc-cccc-cccc-cccc-cccccccccccc', r.id, 'offer',
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       '11111111-1111-1111-1111-111111111111'
FROM relationship r
WHERE r.company_a_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND r.company_b_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

-- ── First active pending change for the card (the one allowed paper) ─────────
-- The column list matches the plan-02 DDL (RESEARCH "Code Examples"):
--   deal_card_id, base_version, source, proposed_by_company, proposed_by_person,
--   proposer_reason, draft jsonb, votes jsonb.
INSERT INTO public.deal_pending_change
  (deal_card_id, base_version, source, proposed_by_company, proposed_by_person,
   proposer_reason, draft, votes)
VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 1, 'manual',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   'Increase quantity to 120',
   '{"value_net": 600, "currency": "EUR", "line_items": []}'::jsonb,
   jsonb_build_object('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'accept',
                      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', null));

-- ── A SECOND active pending change for the SAME card MUST be blocked ──────────
-- The unique index on deal_card_id makes this raise SQLSTATE 23505. We catch the
-- unique_violation as the PASS path; if the insert somehow succeeds (no lock),
-- we RAISE to fail the test loudly.
DO $$
BEGIN
  INSERT INTO public.deal_pending_change
    (deal_card_id, base_version, source, proposed_by_company, proposed_by_person,
     proposer_reason, draft, votes)
  VALUES
    ('cccccccc-cccc-cccc-cccc-cccccccccccc', 1, 'manual',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222',
     'Counter at 110',
     '{"value_net": 550, "currency": "EUR", "line_items": []}'::jsonb,
     jsonb_build_object('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null,
                        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'accept'));
  -- If we reach here, the second active row was allowed → the lock is missing.
  RAISE EXCEPTION
    'FAIL: a SECOND active pending change for one card was allowed (expected SQLSTATE 23505 / unique_violation)';
EXCEPTION
  WHEN unique_violation THEN
    NULL;  -- expected: the DB unique constraint blocked the second paper
END $$;

ROLLBACK;
SELECT 'PENDING CHANGE LOCK TEST PASSED' AS result;
