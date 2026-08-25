-- ============================================================================
-- confirm_detected_deal_relationship_liveness_test.sql
-- ----------------------------------------------------------------------------
-- Proves HEL-74's SECOND delivery-door fix: Sella's double-accept path
-- (confirm_detected_deal) refuses to birth a deal onto a suspended/ended
-- relationship, same as send_deal — critic found this door bypasses
-- send_deal's guard entirely (it must never call send_deal, by its own
-- header) and 20260825180000's scoping paragraph didn't name it.
--
-- Run:  bash supabase/tests/run_confirm_detected_deal_relationship_liveness_test.sh
--
-- Fixture: the seeded p2p thread between Alice 1111... and Bob 2222..., on
-- their companies' relationship (GreenLeaf<->StonePharm — the SAME pair
-- send_deal_relationship_liveness_test.sql uses; sequential BEGIN…ROLLBACK
-- suites don't collide). HS reviewer fixed at 9999...9999.
--
-- Shape: one BEGIN…ROLLBACK, zero net seed mutation (L-033).
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE _t ON COMMIT DROP AS
SELECT
  ct.id                                            AS thread_id,
  ct.relationship_id                                AS rel_id,
  '11111111-1111-1111-1111-111111111111'::uuid     AS alice,
  '22222222-2222-2222-2222-222222222222'::uuid     AS bob,
  '99999999-9999-9999-9999-999999999999'::uuid     AS hsteam
FROM public.chat_thread ct
WHERE ct.type = 'p2p'
  AND ct.person_a_id IN ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222')
  AND ct.person_b_id IN ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222')
  AND ct.person_a_id <> ct.person_b_id;
GRANT SELECT ON _t TO authenticated;

DO $$
BEGIN
  IF (SELECT count(*) FROM _t) <> 1 THEN
    RAISE EXCEPTION 'FIXTURE: the seeded Alice/Bob p2p thread not found — seed drift';
  END IF;
  IF (SELECT status FROM public.relationship WHERE id = (SELECT rel_id FROM _t)) <> 'active' THEN
    RAISE EXCEPTION 'FIXTURE: relationship is not active at suite start — a prior suite left it dirty';
  END IF;
END $$;

-- A fresh 'deal_detected' suggestion, written the legitimate way (service
-- voice, as postgres — bypasses RLS/grants same as the real detect trigger).
CREATE TEMP TABLE _msg ON COMMIT DROP AS
WITH ins AS (
  INSERT INTO public.chat_message (thread_id, sender, sender_person_id, type, body, metadata)
  SELECT thread_id, 'sella', NULL, 'deal_detected', 'Sella detected a deal',
    '{"draft":{"currency":"EUR","line_items":[{"name":"Detected probe","quantity":5,"unit":"g","unit_price":3}]}}'::jsonb
  FROM _t
  RETURNING id
)
SELECT id FROM ins;
GRANT SELECT ON _msg TO authenticated;

-- ============================================================================
-- §A — a vote still records during a suspension (birth is what's gated, not
--      voting) — Alice accepts first, before anything is suspended.
-- ============================================================================

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', alice, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
SELECT public.confirm_detected_deal((SELECT id FROM _msg), 'accept');
RESET ROLE;

-- ============================================================================
-- §B — HS team suspends the relationship; Bob's second accept (the birth
--      trigger — both sides now say yes) is refused, and nothing is born.
-- ============================================================================

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', hsteam, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
SELECT public.suspend_relationship((SELECT rel_id FROM _t), 'B: licence lapsed');
RESET ROLE;

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', bob, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.confirm_detected_deal((SELECT id FROM _msg), 'accept');
    RAISE EXCEPTION 'B/suspended: confirm_detected_deal birthed a deal onto a suspended relationship';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE 'B/suspended%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%relationship is suspended%' THEN
        RAISE EXCEPTION 'B/suspended: refused for the WRONG reason (%)', SQLERRM;
      END IF;
  END;
END $$;
RESET ROLE;

DO $$
DECLARE v_meta jsonb;
BEGIN
  SELECT metadata INTO v_meta FROM public.chat_message WHERE id = (SELECT id FROM _msg);
  IF v_meta ? 'born_deal_card_id' THEN
    RAISE EXCEPTION 'B/side-effect: a deal_card_id was recorded despite the refused birth';
  END IF;
END $$;

-- ============================================================================
-- §C — reactivate, then Bob re-accepts (the vote did not survive the refused
--      call — see this suite's sibling migration header): births normally.
-- ============================================================================

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', hsteam, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
SELECT public.reactivate_relationship((SELECT rel_id FROM _t));
RESET ROLE;

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', bob, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
SELECT public.confirm_detected_deal((SELECT id FROM _msg), 'accept');
RESET ROLE;

DO $$
DECLARE v_card_id uuid; v_status text;
BEGIN
  SELECT (metadata->>'born_deal_card_id')::uuid INTO v_card_id
  FROM public.chat_message WHERE id = (SELECT id FROM _msg);
  IF v_card_id IS NULL THEN
    RAISE EXCEPTION 'C/reactivated: no deal_card was born after reactivation + re-accept';
  END IF;
  SELECT status INTO v_status FROM public.deal_card WHERE id = v_card_id;
  IF v_status <> 'negotiation' THEN
    RAISE EXCEPTION 'C/reactivated: born card status is %, expected negotiation', v_status;
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'confirm_detected_deal relationship liveness: ALL CELLS PASSED (A, B, C)'; END $$;

ROLLBACK;
