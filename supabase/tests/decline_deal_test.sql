-- ============================================================================
-- decline_deal_test.sql — WR-02: decline is a NEGOTIATION-only verb
-- ----------------------------------------------------------------------------
-- Phase-12 hardening (Wave 3a). decline_deal used to fire from ANY status that
-- was not already 'cancelled'/'done', so it could:
--   · cancel a PRIVATE 'unsent' draft (which must be DISCARDED, never declined —
--     declining un-hides a draft the counterparty was never meant to see); and
--   · cancel a 'confirmed' (signed) deal (confirmed -> cancelled is unsupported).
--
-- This proves the guard matrix:
--   (1) BLOCK   unsent      -> raises '…private draft…', status stays 'unsent'
--   (2) ALLOW   negotiation -> status becomes 'cancelled'
--   (3) BLOCK   confirmed   -> raises '…only a deal in negotiation…'
-- (cancelled/done stay idempotent — covered by the existing early-return.)
--
-- Mirrors deliver_deal_test.sql: one BEGIN…ROLLBACK, runtime-resolved seed ids,
-- impersonation via request.jwt.claims + SET LOCAL ROLE, RAISE on any failed
-- assertion, no trace left.
--
-- ⚠️ RED-FIRST: fails before the WR-02 guard lands (decline silently cancels an
-- unsent draft AND a confirmed deal). Goes GREEN once the two guards ship in
-- 20260724120600_deal_transition_rpcs.sql.
--
-- Run:  bash supabase/tests/run_decline_deal_test.sh
-- ============================================================================

BEGIN;

CREATE TEMP TABLE _fix ON COMMIT DROP AS
SELECT
  a.id AS alice,
  b.id AS bob,
  (SELECT company_id FROM person WHERE id = a.id) AS greenleaf,
  (SELECT company_id FROM person WHERE id = b.id) AS stonepharm
FROM auth.users a, auth.users b
WHERE a.email = 'alice@greenleaf.test' AND b.email = 'bob@stonepharm.test';

CREATE TEMP TABLE _rel ON COMMIT DROP AS
SELECT r.id AS rel
FROM relationship r, _fix f
WHERE (r.company_a_id = f.greenleaf AND r.company_b_id = f.stonepharm)
   OR (r.company_a_id = f.stonepharm AND r.company_b_id = f.greenleaf);

CREATE TEMP TABLE _c (kind text, id uuid) ON COMMIT DROP;

-- the impersonated blocks run as `authenticated`, which owns nothing — grant it
-- read on the fixtures and insert on the card table it fills.
GRANT SELECT ON _fix, _rel, _c TO authenticated;
GRANT INSERT ON _c TO authenticated;

DO $$
BEGIN
  IF (SELECT count(*) FROM _fix) <> 1 OR (SELECT count(*) FROM _rel) <> 1 THEN
    RAISE EXCEPTION 'FIXTURE: seeded alice/bob/relationship not found — run supabase db reset';
  END IF;
END $$;

-- ── (1) BLOCK unsent: a private draft cannot be declined ────────────────────
-- Alice births a company-target (c2c) draft — status 'unsent', private.
SELECT set_config('request.jwt.claim.sub', (SELECT alice FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT alice FROM _fix), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_card uuid;
BEGIN
  v_card := public.create_deal_draft(
    (SELECT rel FROM _rel), 'offer', 50, 'EUR', NULL, NULL, false,
    '[{"productName":"Probe Flower","quantity":"10","unit":"g","unitPrice":"5"}]'::jsonb,
    NULL, NULL);
  INSERT INTO _c VALUES ('unsent', v_card);
END $$;
-- Alice attempts to decline her own private draft → must raise.
DO $$
BEGIN
  BEGIN
    PERFORM public.decline_deal((SELECT id FROM _c WHERE kind = 'unsent'));
    RAISE EXCEPTION 'FAIL: decline_deal did not reject an unsent draft (WR-02 leak)';
  EXCEPTION WHEN raise_exception THEN
    -- swallow ONLY the expected guard; the FAIL sentinel (no 'private draft')
    -- re-raises and surfaces the leak.
    IF SQLERRM NOT LIKE '%private draft%' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
-- the rejected decline must NOT have moved the draft.
DO $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.deal_card
  WHERE id = (SELECT id FROM _c WHERE kind = 'unsent');
  IF v_status <> 'unsent' THEN
    RAISE EXCEPTION 'FAIL: a rejected decline still moved the draft (status now %)', v_status;
  END IF;
END $$;

-- ── (2) ALLOW negotiation: the real decline path ────────────────────────────
SELECT set_config('request.jwt.claim.sub', (SELECT alice FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT alice FROM _fix), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_card uuid;
BEGIN
  v_card := public.create_deal_draft(
    (SELECT rel FROM _rel), 'offer', 50, 'EUR', NULL, NULL, false,
    '[{"productName":"Probe Flower","quantity":"10","unit":"g","unitPrice":"5"}]'::jsonb,
    NULL, NULL);
  INSERT INTO _c VALUES ('nego', v_card);
  PERFORM public.send_deal((SELECT id FROM _c WHERE kind = 'nego'));  -- unsent -> negotiation
END $$;
RESET ROLE;
-- Bob (the counterparty) declines the live negotiation.
SELECT set_config('request.jwt.claim.sub', (SELECT bob FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT bob FROM _fix), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT public.decline_deal((SELECT id FROM _c WHERE kind = 'nego'));
RESET ROLE;
DO $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.deal_card
  WHERE id = (SELECT id FROM _c WHERE kind = 'nego');
  IF v_status <> 'cancelled' THEN
    RAISE EXCEPTION 'FAIL: declining a negotiation must cancel it, got %', v_status;
  END IF;
END $$;

-- ── (3) BLOCK confirmed: a signed deal cannot be declined ───────────────────
SELECT set_config('request.jwt.claim.sub', (SELECT alice FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT alice FROM _fix), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_card uuid;
BEGIN
  v_card := public.create_deal_draft(
    (SELECT rel FROM _rel), 'offer', 50, 'EUR', NULL, NULL, false,
    '[{"productName":"Probe Flower","quantity":"10","unit":"g","unitPrice":"5"}]'::jsonb,
    NULL, NULL);
  INSERT INTO _c VALUES ('conf', v_card);
  PERFORM public.send_deal((SELECT id FROM _c WHERE kind = 'conf'));  -- -> negotiation
END $$;
RESET ROLE;
-- Bob (non-initiator = the fixed signer) signs → 'confirmed'.
SELECT set_config('request.jwt.claim.sub', (SELECT bob FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT bob FROM _fix), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT public.sign_deal((SELECT id FROM _c WHERE kind = 'conf'));
-- and now a decline of the confirmed deal must be rejected.
DO $$
BEGIN
  BEGIN
    PERFORM public.decline_deal((SELECT id FROM _c WHERE kind = 'conf'));
    RAISE EXCEPTION 'FAIL: decline_deal accepted a confirmed deal (WR-02 leak)';
  EXCEPTION WHEN raise_exception THEN
    -- swallow ONLY the expected guard; the FAIL sentinel (no 'only a deal in
    -- negotiation') re-raises and surfaces the leak.
    IF SQLERRM NOT LIKE '%only a deal in negotiation%' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
DO $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.deal_card
  WHERE id = (SELECT id FROM _c WHERE kind = 'conf');
  IF v_status <> 'confirmed' THEN
    RAISE EXCEPTION 'FAIL: a rejected decline still moved the confirmed deal (status now %)', v_status;
  END IF;
END $$;

ROLLBACK;
SELECT 'ALL DECLINE_DEAL TESTS PASSED' AS result;
