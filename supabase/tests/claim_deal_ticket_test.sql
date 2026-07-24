-- ============================================================================
-- claim_deal_ticket_test.sql — deal-ticket pickup (Lane A / A3, re-timed for
-- Phase 12: the ticket is written by send_deal, no longer at birth)
-- ----------------------------------------------------------------------------
-- Proves the pickup half of the company-delivery spine: a member of the
-- RECEIVING company claims a delivered 'deal_card' ticket and becomes a
-- deal_member OWNER on the already-existing deal — no new relationship, no new
-- threads. The claim is gated (only the ticket's receiver company may claim)
-- and idempotent (a re-claim adds nothing). deal_member's RLS cannot express
-- this bootstrap (the claimer is not yet a workspace member), hence the
-- SECURITY DEFINER RPC — same pattern as create_deal_draft.
--
-- Phase-12 re-time (D-04/D-06): birth is PRIVATE and writes no ticket; the
-- fixture below births, proves the ticket is absent, then SENDS (send_deal is
-- the one delivery writer) and proves the ticket appears before claiming.
--
-- Run:  bash supabase/tests/run_claim_deal_ticket_test.sh
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

CREATE TEMP TABLE _card (id uuid) ON COMMIT DROP;

GRANT SELECT ON _fix, _rel TO authenticated;
GRANT SELECT, INSERT ON _card TO authenticated;

DO $$
BEGIN
  IF (SELECT count(*) FROM _fix) <> 1 OR (SELECT count(*) FROM _rel) <> 1 THEN
    RAISE EXCEPTION 'FIXTURE: seeded alice/bob/relationship not found — run supabase db reset';
  END IF;
END $$;

-- ── Fixture: Alice births a COMPANY-TARGET deal (no counterparty person) —
-- birth writes NO ticket (D-04); Alice then SENDS, and send_deal delivers the
-- StonePharm ticket (D-06). ──
SELECT set_config('request.jwt.claim.sub', (SELECT alice FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT alice FROM _fix), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_card uuid;
BEGIN
  v_card := public.create_deal_draft(
    (SELECT rel FROM _rel), 'offer', 50, 'EUR', NULL, NULL, false,
    '[{"productName":"Probe Flower","quantity":"10","unit":"g","unitPrice":"5"}]'::jsonb,
    NULL, NULL, NULL);
  INSERT INTO _card VALUES (v_card);
END $$;
RESET ROLE;

DO $$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM pending_inbox_item
  WHERE deal_card_id = (SELECT id FROM _card) AND deleted_at IS NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'A3-0 FAIL: birth must not deliver a ticket (D-04), got %', v_n;
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', (SELECT alice FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT alice FROM _fix), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT public.send_deal((SELECT id FROM _card));
RESET ROLE;

DO $$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n
  FROM pending_inbox_item p, _fix f
  WHERE p.deal_card_id = (SELECT id FROM _card)
    AND p.type = 'deal_card'
    AND p.receiver_company_id = f.stonepharm
    AND p.status = 'pending'
    AND p.deleted_at IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'A3-0 FAIL: expected exactly 1 claimable ticket after send, got %', v_n;
  END IF;
END $$;

-- ── (1) SENDER-SIDE CLAIM DENIED: Alice's company holds no ticket — the claim
-- must raise, and she must NOT gain a second membership by any other route. ──
SELECT set_config('request.jwt.claim.sub', (SELECT alice FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT alice FROM _fix), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_denied boolean := false;
  v_rel uuid;
BEGIN
  BEGIN
    v_rel := public.claim_deal_ticket((SELECT id FROM _card));
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'A3-1 FAIL: the SENDER company claimed its own ticket';
  END IF;
END $$;
RESET ROLE;

-- ── (2) THE CLAIM: Bob (receiver company) claims → he becomes a deal_member
-- OWNER on the existing workspace, and the RPC returns the deal''s relationship. ──
SELECT set_config('request.jwt.claim.sub', (SELECT bob FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT bob FROM _fix), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_rel uuid;
BEGIN
  v_rel := public.claim_deal_ticket((SELECT id FROM _card));
  IF v_rel IS DISTINCT FROM (SELECT rel FROM _rel) THEN
    RAISE EXCEPTION 'A3-2 FAIL: claim returned % — expected the deal''s relationship', v_rel;
  END IF;
END $$;
RESET ROLE;

DO $$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n
  FROM deal_member dm
  JOIN deal_workspace dw ON dw.id = dm.deal_workspace_id
  WHERE dw.deal_card_id = (SELECT id FROM _card)
    AND dm.person_id = (SELECT bob FROM _fix)
    AND dm.role = 'owner';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'A3-2 FAIL: expected Bob as owner exactly once, got %', v_n;
  END IF;
END $$;

-- ── (3) IDEMPOTENT: a second claim adds no duplicate membership. ──
SELECT set_config('request.jwt.claim.sub', (SELECT bob FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT bob FROM _fix), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT public.claim_deal_ticket((SELECT id FROM _card));
RESET ROLE;
DO $$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n
  FROM deal_member dm
  JOIN deal_workspace dw ON dw.id = dm.deal_workspace_id
  WHERE dw.deal_card_id = (SELECT id FROM _card);
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'A3-3 FAIL: expected 2 members (creator + claimer), got %', v_n;
  END IF;
END $$;

-- ── (4) NO TICKET, NO CLAIM: a person-target deal (counterparty picked at
-- birth, co-owner joins at SEND, person delivery = the chat pill) never gets
-- a company ticket — so it cannot be claimed by anyone. ──
SELECT set_config('request.jwt.claim.sub', (SELECT alice FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT alice FROM _fix), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_card uuid;
  v_denied boolean := false;
BEGIN
  v_card := public.create_deal_draft(
    (SELECT rel FROM _rel), 'offer', 50, 'EUR', NULL, NULL, false,
    '[{"productName":"Probe Flower","quantity":"10","unit":"g","unitPrice":"5"}]'::jsonb,
    NULL, NULL, (SELECT bob FROM _fix));
  -- send it: Bob becomes co-owner HERE; the company half no-ops (no ticket).
  PERFORM public.send_deal(v_card);
  BEGIN
    PERFORM public.claim_deal_ticket(v_card);
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'A3-4 FAIL: a ticketless deal was claimable';
  END IF;
END $$;
RESET ROLE;

ROLLBACK;
SELECT 'ALL CLAIM_DEAL_TICKET TESTS PASSED' AS result;
