-- ============================================================================
-- update_deal_draft_test.sql — CR-02: a real in-place edit path for unsent drafts
-- ----------------------------------------------------------------------------
-- Phase-12 (Wave 3a). Before this there was NO way to edit an unsent draft: the
-- pencil routed through proposeDealChange, which can never commit pre-Send (the
-- both-accept gate), so the edit was lost and the card wedged. update_deal_draft
-- rewrites the draft IN PLACE — no version bump, no deal_pending_change — and is
-- locked to the CREATING company while the card is still 'unsent'.
--
-- Proves:
--   (1) IN-PLACE  — a value + line edit lands on v1; version stays 1; NO pending
--       change is created; the v1 line reflects the new content.
--   (2) NON-INITIATOR — the counterparty company cannot edit the draft (raises).
--   (3) NON-UNSENT — once sent (negotiation) the draft edit path is closed
--       (raises '…unsent…').
--
-- One BEGIN…ROLLBACK, runtime-resolved seed ids, impersonation via
-- request.jwt.claims + SET LOCAL ROLE, RAISE on any failed assertion.
--
-- ⚠️ RED-FIRST: fails before update_deal_draft exists (the first call throws
-- undefined_function). GREEN once 20260724121100_update_deal_draft.sql ships.
--
-- Run:  bash supabase/tests/run_update_deal_draft_test.sh
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
GRANT SELECT ON _fix, _rel, _c TO authenticated;
GRANT INSERT ON _c TO authenticated;

DO $$
BEGIN
  IF (SELECT count(*) FROM _fix) <> 1 OR (SELECT count(*) FROM _rel) <> 1 THEN
    RAISE EXCEPTION 'FIXTURE: seeded alice/bob/relationship not found — run supabase db reset';
  END IF;
END $$;

-- ── (1) IN-PLACE edit ───────────────────────────────────────────────────────
SELECT set_config('request.jwt.claim.sub', (SELECT alice FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT alice FROM _fix), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_card uuid;
BEGIN
  v_card := public.create_deal_draft(
    (SELECT rel FROM _rel), 'offer', 50, 'EUR', NULL, NULL, false,
    '[{"productName":"Original Flower","quantity":"10","unit":"g","unitPrice":"5"}]'::jsonb,
    NULL, NULL);
  INSERT INTO _c VALUES ('edit', v_card);
  PERFORM public.update_deal_draft(
    v_card, 999, 'EUR', NULL, NULL, false,
    '[{"productName":"Edited Flower","quantity":"20","unit":"g","unitPrice":"7"}]'::jsonb,
    NULL);
END $$;
RESET ROLE;
DO $$
DECLARE v_val numeric; v_ver int; v_pc int; v_ln int; v_name text; v_qty numeric;
BEGIN
  SELECT value_net, version INTO v_val, v_ver
  FROM public.deal_card WHERE id = (SELECT id FROM _c WHERE kind = 'edit');
  IF v_val <> 999 THEN
    RAISE EXCEPTION 'CR-02 FAIL: value_net not updated in place (got %)', v_val;
  END IF;
  IF v_ver <> 1 THEN
    RAISE EXCEPTION 'CR-02 FAIL: a draft edit must NOT bump the version (got %)', v_ver;
  END IF;
  SELECT count(*) INTO v_pc
  FROM public.deal_pending_change WHERE deal_card_id = (SELECT id FROM _c WHERE kind = 'edit');
  IF v_pc <> 0 THEN
    RAISE EXCEPTION 'CR-02 FAIL: a draft edit must NOT create a pending change (got %)', v_pc;
  END IF;
  SELECT count(*), max(product_name), max(quantity) INTO v_ln, v_name, v_qty
  FROM public.deal_line_item
  WHERE deal_card_id = (SELECT id FROM _c WHERE kind = 'edit') AND version = 1;
  IF v_ln <> 1 THEN
    RAISE EXCEPTION 'CR-02 FAIL: expected exactly 1 rewritten v1 line, got %', v_ln;
  END IF;
  IF v_name <> 'Edited Flower' OR v_qty <> 20 THEN
    RAISE EXCEPTION 'CR-02 FAIL: the v1 line does not reflect the edit (% / %)', v_name, v_qty;
  END IF;
END $$;

-- ── (2) NON-INITIATOR is rejected ───────────────────────────────────────────
SELECT set_config('request.jwt.claim.sub', (SELECT alice FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT alice FROM _fix), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_card uuid;
BEGIN
  v_card := public.create_deal_draft(
    (SELECT rel FROM _rel), 'offer', 50, 'EUR', NULL, NULL, false,
    '[{"productName":"Original Flower","quantity":"10","unit":"g","unitPrice":"5"}]'::jsonb,
    NULL, NULL);
  INSERT INTO _c VALUES ('bob', v_card);
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', (SELECT bob FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT bob FROM _fix), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.update_deal_draft(
      (SELECT id FROM _c WHERE kind = 'bob'), 111, 'EUR', NULL, NULL, false,
      '[{"productName":"Bob Edit","quantity":"1","unit":"g","unitPrice":"1"}]'::jsonb, NULL);
    RAISE EXCEPTION 'FAIL: update_deal_draft accepted a non-initiator edit (CR-02 leak)';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%creating company%' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;

-- ── (3) NON-UNSENT is rejected ──────────────────────────────────────────────
SELECT set_config('request.jwt.claim.sub', (SELECT alice FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT alice FROM _fix), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_card uuid;
BEGIN
  v_card := public.create_deal_draft(
    (SELECT rel FROM _rel), 'offer', 50, 'EUR', NULL, NULL, false,
    '[{"productName":"Original Flower","quantity":"10","unit":"g","unitPrice":"5"}]'::jsonb,
    NULL, NULL);
  INSERT INTO _c VALUES ('sent', v_card);
  PERFORM public.send_deal(v_card);  -- unsent -> negotiation
  BEGIN
    PERFORM public.update_deal_draft(
      v_card, 222, 'EUR', NULL, NULL, false,
      '[{"productName":"Late Edit","quantity":"2","unit":"g","unitPrice":"2"}]'::jsonb, NULL);
    RAISE EXCEPTION 'FAIL: update_deal_draft edited a card that is no longer a draft (CR-02 leak)';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%unsent%' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;

ROLLBACK;
SELECT 'ALL UPDATE_DEAL_DRAFT TESTS PASSED' AS result;
