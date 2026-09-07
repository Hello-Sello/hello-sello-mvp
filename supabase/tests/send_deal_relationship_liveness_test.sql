-- ============================================================================
-- send_deal_relationship_liveness_test.sql
-- ----------------------------------------------------------------------------
-- Proves HEL-74: once a relationship is suspended or ended (HEL-82's new
-- transitions), send_deal refuses to deliver a NEW deal onto it — and that a
-- reactivated relationship goes straight back to sending normally, with no
-- side effect left behind by a refused send (the card stays 'unsent', not
-- half-flipped).
--
-- Deliberately does NOT test create_deal_draft, confirm_deal_change, or
-- sign_deal — 20260825180000's header records that scoping call: a private
-- draft reaches no counterparty, so create_deal_draft is left alone on
-- purpose, and whether an in-flight negotiation should also freeze on
-- suspension is a follow-up product decision, not tested here because it
-- isn't built here.
--
-- Run:  bash supabase/tests/run_send_deal_relationship_liveness_test.sh
--
-- Fixture (seeded): Alice @ GreenLeaf Cultivation <-> Bob @ StonePharm — a
-- DIFFERENT relationship from the Rheinland<->GreenLeaf one
-- relationship_admin_suspend_end_test.sql uses, so the two suites never touch
-- the same row even transiently. HS reviewer fixed at 9999...9999.
--
-- Shape: one BEGIN…ROLLBACK, zero net seed mutation (L-033).
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE _fix ON COMMIT DROP AS
SELECT
  a.id                                             AS alice,
  (SELECT company_id FROM public.person WHERE id = a.id) AS greenleaf,
  '99999999-9999-9999-9999-999999999999'::uuid     AS hsteam
FROM auth.users a
WHERE a.email = 'alice@greenleaf.test';

CREATE TEMP TABLE _rel ON COMMIT DROP AS
SELECT r.id AS rel_id
FROM public.relationship r, _fix f, public.company cb
WHERE (r.company_a_id = f.greenleaf OR r.company_b_id = f.greenleaf)
  AND cb.id = CASE WHEN r.company_a_id = f.greenleaf THEN r.company_b_id ELSE r.company_a_id END
  AND cb.name LIKE 'StonePharm%'
LIMIT 1;

GRANT SELECT ON _fix, _rel TO authenticated;

DO $$
BEGIN
  IF (SELECT count(*) FROM _fix) <> 1 OR (SELECT count(*) FROM _rel) <> 1 THEN
    RAISE EXCEPTION 'FIXTURE: Alice/GreenLeaf<->StonePharm relationship not found — seed drift';
  END IF;
  IF (SELECT status FROM public.relationship WHERE id = (SELECT rel_id FROM _rel)) <> 'active' THEN
    RAISE EXCEPTION 'FIXTURE: relationship is not active at suite start — a prior suite left it dirty';
  END IF;
END $$;

-- ============================================================================
-- §A — SUSPENDED blocks a new send; the draft is untouched (still unsent).
-- ============================================================================

-- A1 — HS team suspends the relationship.
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', hsteam, 'role', 'authenticated')::text FROM _fix), true);
SET LOCAL ROLE authenticated;
SELECT public.suspend_relationship((SELECT rel_id FROM _rel), 'A1: licence lapsed');
RESET ROLE;

-- A2 — Alice births a draft (create_deal_draft is NOT gated — private, reaches
--      no counterparty), then tries to send it. Refused.
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', alice, 'role', 'authenticated')::text FROM _fix), true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE _card ON COMMIT DROP AS
SELECT public.create_deal_draft(
  (SELECT rel_id FROM _rel), 'offer', 50, 'EUR', NULL, NULL, false,
  '[{"productName":"Liveness probe","quantity":"10","unit":"g","unitPrice":"5"}]'::jsonb,
  NULL, NULL, NULL) AS id;
GRANT SELECT ON _card TO authenticated;

DO $$
BEGIN
  BEGIN
    PERFORM public.send_deal((SELECT id FROM _card));
    RAISE EXCEPTION 'A2/suspended: send_deal delivered a new deal onto a suspended relationship';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE 'A2/suspended%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%relationship is suspended%' THEN
        RAISE EXCEPTION 'A2/suspended: refused for the WRONG reason (%)', SQLERRM;
      END IF;
  END;
END $$;
RESET ROLE;

-- A3 — the refused send left no side effect: the card is still 'unsent'.
DO $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.deal_card WHERE id = (SELECT id FROM _card);
  IF v_status <> 'unsent' THEN
    RAISE EXCEPTION 'A3/atomic: card status is % after a refused send, expected unsent (untouched)', v_status;
  END IF;
END $$;

-- ============================================================================
-- §B — reactivate restores normal sending, same card, no re-birth needed.
-- ============================================================================

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', hsteam, 'role', 'authenticated')::text FROM _fix), true);
SET LOCAL ROLE authenticated;
SELECT public.reactivate_relationship((SELECT rel_id FROM _rel));
RESET ROLE;

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', alice, 'role', 'authenticated')::text FROM _fix), true);
SET LOCAL ROLE authenticated;
SELECT public.send_deal((SELECT id FROM _card));
RESET ROLE;

DO $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.deal_card WHERE id = (SELECT id FROM _card);
  IF v_status <> 'negotiation' THEN
    RAISE EXCEPTION 'B/reactivated: send_deal did not flip the card after reactivation, status is %', v_status;
  END IF;
END $$;

-- ============================================================================
-- §C — ENDED blocks a new send too, not just 'suspended' — the check is
--      "status <> active", not a hardcoded single value.
-- ============================================================================

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', hsteam, 'role', 'authenticated')::text FROM _fix), true);
SET LOCAL ROLE authenticated;
SELECT public.end_relationship((SELECT rel_id FROM _rel), 'C1: business closed');
RESET ROLE;

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', alice, 'role', 'authenticated')::text FROM _fix), true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE _card2 ON COMMIT DROP AS
SELECT public.create_deal_draft(
  (SELECT rel_id FROM _rel), 'offer', 50, 'EUR', NULL, NULL, false,
  '[{"productName":"Liveness probe 2","quantity":"10","unit":"g","unitPrice":"5"}]'::jsonb,
  NULL, NULL, NULL) AS id;
GRANT SELECT ON _card2 TO authenticated;

DO $$
BEGIN
  BEGIN
    PERFORM public.send_deal((SELECT id FROM _card2));
    RAISE EXCEPTION 'C2/ended: send_deal delivered a new deal onto an ended relationship';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE 'C2/ended%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%relationship is ended%' THEN
        RAISE EXCEPTION 'C2/ended: refused for the WRONG reason (%)', SQLERRM;
      END IF;
  END;
END $$;
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'send_deal relationship liveness: ALL CELLS PASSED (A1-A3, B, C1-C2)'; END $$;

ROLLBACK;
