-- ============================================================================
-- promotion_status_gate_test.sql — HEL-83
-- ----------------------------------------------------------------------------
-- Proves: a promotion can only be OFFERED or ACCEPTED while the deal is in
-- `negotiation`; that DECLINE deliberately still works in every status; and
-- that neither gate weakened the authorization checks they sit behind.
--
-- Run:  bash supabase/tests/run_promotion_status_gate_test.sh
--
-- ⚠️  RED-FIRST: §B and §C fail against the pre-fix functions. Neither
-- `offer_promotion` nor `accept_promotion` looked at `deal_card.status` at all,
-- so both succeed on a `done` card. `accept_promotion` succeeding there is the
-- reproduction that matters: it inserts real `deal_line_item` rows into a deal
-- whose invoice has already been issued.
--
-- ── THE RULING THIS ENFORCES ──
-- Muskan, 2026-09-03: only `negotiation`. HEL-83 deferred this to a product
-- decision because the actor is the legitimate buyer or seller acting at a bad
-- time, not an intruder. Full vocabulary and reasoning in the migration header
-- (`20260903110000_promotion_status_gate.sql`) and `DECISIONS.md` 2026-09-03.
--
-- ── WHY §D EXISTS AND MUST NEVER BE "TIDIED" INTO §B/§C ──
-- `decline_promotion` is deliberately NOT gated. If a deal leaves `negotiation`
-- while a promotion is pending, a gated decline would strand that row `pending`
-- forever behind two refusing buttons. §D is the cell that makes anyone who
-- "fixes the inconsistency" go red, on purpose. Same principle as HEL-84, where
-- a decline had to keep working on a suspended relationship.
--
-- ⚠️  EVERY STATUS FLIP HERE IS PRIVILEGED, and every assertion reads the DB
-- privileged too. `authenticated` holds no UPDATE on `deal_card` (status writes
-- were revoked in `20260724120900`), so a flip attempted in-role would fail for
-- the wrong reason entirely. See L-066 — an assertion must not be taken from
-- inside a role that cannot see what it is asserting about.
--
-- Shape: one BEGIN…ROLLBACK, zero net seed mutation (L-033 / HEL-73). Every
-- count is a DELTA against a baseline captured in this transaction, never an
-- absolute against a shared row (the trap that broke announce_deal_event §D2).
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE _fix ON COMMIT DROP AS
SELECT
  a.id                                                   AS alice,   -- GreenLeaf = SELLER
  (SELECT company_id FROM public.person WHERE id = a.id) AS greenleaf,
  b.id                                                   AS bob,     -- StonePharm = BUYER
  (SELECT company_id FROM public.person WHERE id = b.id) AS stonepharm
FROM auth.users a, auth.users b
WHERE a.email = 'alice@greenleaf.test' AND b.email = 'bob@stonepharm.test';

CREATE TEMP TABLE _rel ON COMMIT DROP AS
SELECT r.id AS rel_id
FROM public.relationship r, _fix f
WHERE (r.company_a_id = f.greenleaf AND r.company_b_id = f.stonepharm)
   OR (r.company_a_id = f.stonepharm AND r.company_b_id = f.greenleaf);

GRANT SELECT ON _fix, _rel TO authenticated;

-- This suite's OWN card, minted privileged. `deal_type = 'offer'` +
-- `initiating_company_id = greenleaf` makes Alice the SELLER and Bob the BUYER
-- via card_seller_company_id / card_buyer_company_id — asserted below rather
-- than assumed, because every §B/§C cell depends on those roles being right.
CREATE TEMP TABLE _card ON COMMIT DROP AS
WITH ins AS (
  INSERT INTO public.deal_card (relationship_id, status, deal_type, initiating_company_id, currency, version)
  SELECT rel_id, 'negotiation', 'offer', f.greenleaf, 'EUR', 1
  FROM _rel, _fix f
  RETURNING id
)
SELECT id FROM ins;
GRANT SELECT ON _card TO authenticated;

DO $$
BEGIN
  IF (SELECT count(*) FROM _fix) <> 1 OR (SELECT count(*) FROM _rel) <> 1
    THEN RAISE EXCEPTION 'FIXTURE: Alice/GreenLeaf<->StonePharm relationship not found — seed drift'; END IF;
  IF (SELECT status FROM public.relationship WHERE id = (SELECT rel_id FROM _rel)) <> 'active'
    THEN RAISE EXCEPTION 'FIXTURE: relationship not active — a gate would refuse for the wrong reason'; END IF;
  IF public.card_seller_company_id((SELECT id FROM _card)) IS DISTINCT FROM (SELECT greenleaf FROM _fix)
    THEN RAISE EXCEPTION 'FIXTURE: Alice is not the resolved SELLER — every offer_promotion cell would refuse on authorization, not on status'; END IF;
  IF public.card_buyer_company_id((SELECT id FROM _card)) IS DISTINCT FROM (SELECT stonepharm FROM _fix)
    THEN RAISE EXCEPTION 'FIXTURE: Bob is not the resolved BUYER — every accept/decline cell would refuse for the wrong reason'; END IF;
END $$;

-- Re-arm a pending promotion. Privileged, so it never trips the very gate under
-- test — each cell must start from a known `pending` row regardless of what the
-- previous cell did to it.
CREATE FUNCTION pg_temp.arm() RETURNS void LANGUAGE sql AS $fn$
  DELETE FROM public.deal_promotion WHERE deal_card_id = (SELECT id FROM _card);
  INSERT INTO public.deal_promotion
    (deal_card_id, base_version, offered_by_company, offered_by_person, line_deltas, condition_deltas, state)
  SELECT c.id, 1, f.greenleaf, f.alice,
         '[{"productName":"HEL83 reward","quantity":10,"unit":"g","unitPrice":0,"currency":"EUR"}]'::jsonb,
         '[]'::jsonb, 'pending'
  FROM _card c, _fix f;
$fn$;

CREATE FUNCTION pg_temp.set_status(p_status text) RETURNS void LANGUAGE sql AS $fn$
  UPDATE public.deal_card SET status = p_status WHERE id = (SELECT id FROM _card);
$fn$;

CREATE FUNCTION pg_temp.line_count() RETURNS int LANGUAGE sql STABLE AS $fn$
  SELECT count(*)::int FROM public.deal_line_item WHERE deal_card_id = (SELECT id FROM _card);
$fn$;

CREATE FUNCTION pg_temp.as_seller() RETURNS void LANGUAGE sql AS $fn$
  SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', alice, 'role', 'authenticated')::text FROM _fix), true);
  SELECT set_config('request.jwt.claim.sub', (SELECT alice::text FROM _fix), true);
$fn$;

CREATE FUNCTION pg_temp.as_buyer() RETURNS void LANGUAGE sql AS $fn$
  SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', bob, 'role', 'authenticated')::text FROM _fix), true);
  SELECT set_config('request.jwt.claim.sub', (SELECT bob::text FROM _fix), true);
$fn$;

-- ============================================================================
-- §A — CONTROLS. The whole promotion track must still work in `negotiation`.
--      If any cell here fails, the gate is too tight and has broken the
--      feature it was meant to bound.
-- ============================================================================
SELECT pg_temp.set_status('negotiation');

-- A1 — the seller can offer.
SELECT pg_temp.as_seller();
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_id uuid;
BEGIN
  v_id := public.offer_promotion((SELECT id FROM _card),
            '[{"productName":"HEL83 A1","quantity":5,"unit":"g","unitPrice":0,"currency":"EUR"}]'::jsonb,
            '[]'::jsonb);
  IF v_id IS NULL THEN RAISE EXCEPTION 'A1/offer: offering in negotiation returned NULL'; END IF;
END $$;
RESET ROLE;

-- A2 — the buyer can accept, and the reward line really lands.
SELECT pg_temp.as_buyer();
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_before int; v_after int;
BEGIN
  v_before := pg_temp.line_count();
  PERFORM public.accept_promotion((SELECT id FROM _card));
  v_after := pg_temp.line_count();
  IF v_after - v_before <> 1 THEN
    RAISE EXCEPTION 'A2/accept: accepting in negotiation added % line(s), expected 1', v_after - v_before;
  END IF;
END $$;
RESET ROLE;

DO $$
BEGIN
  IF (SELECT state FROM public.deal_promotion WHERE deal_card_id = (SELECT id FROM _card)) <> 'accepted'
    THEN RAISE EXCEPTION 'A2/accept: the promotion row was not marked accepted'; END IF;
END $$;

-- A3 — the buyer can decline.
SELECT pg_temp.arm();
SELECT pg_temp.as_buyer();
SET LOCAL ROLE authenticated;
DO $$ BEGIN PERFORM public.decline_promotion((SELECT id FROM _card)); END $$;
RESET ROLE;
DO $$
BEGIN
  IF (SELECT state FROM public.deal_promotion WHERE deal_card_id = (SELECT id FROM _card)) <> 'declined'
    THEN RAISE EXCEPTION 'A3/decline: the promotion row was not marked declined'; END IF;
END $$;

-- ============================================================================
-- §B — OFFER IS REFUSED in every non-negotiation status. Six cells, driven from
--      the lookup table itself rather than a hand-typed list, so a status added
--      to `deal_card_status` later is covered here the day it appears.
-- ============================================================================
SELECT pg_temp.as_seller();
DO $$
DECLARE v_status text; v_err text;
BEGIN
  FOR v_status IN
    SELECT code FROM public.deal_card_status WHERE code <> 'negotiation' ORDER BY sort_order
  LOOP
    PERFORM pg_temp.set_status(v_status);
    v_err := NULL;
    BEGIN
      SET LOCAL ROLE authenticated;
      PERFORM public.offer_promotion((SELECT id FROM _card),
                '[{"productName":"HEL83 B","quantity":1,"unit":"g","unitPrice":0,"currency":"EUR"}]'::jsonb,
                '[]'::jsonb);
      RESET ROLE;
      RAISE EXCEPTION 'B/offer FAIL: a promotion was OFFERED on a % deal', v_status;
    EXCEPTION
      WHEN OTHERS THEN
        RESET ROLE;
        IF SQLERRM LIKE 'B/offer FAIL%' THEN RAISE; END IF;
        v_err := SQLERRM;
    END;
    IF v_err NOT LIKE '%only a deal in negotiation%' THEN
      RAISE EXCEPTION 'B/offer: status % was refused for the WRONG reason (%) — a cell that passes by accident proves nothing', v_status, v_err;
    END IF;
  END LOOP;
END $$;
RESET ROLE;

-- ============================================================================
-- §C — ACCEPT IS REFUSED in every non-negotiation status, AND no line lands.
--      The refusal alone is not the claim worth proving — `accept_promotion`
--      INSERTS `deal_line_item` rows, so the cell asserts the line count is
--      unmoved as well. `done` is the case HEL-83 was filed about: lines
--      appearing on a deal whose invoice already exists.
-- ============================================================================
-- ⚠️ `unsent` is EXCLUDED from this loop and proven separately in C-UNSENT
--    below. On an unsent draft the buyer is not a `card_relationship_member` at
--    all — `card_relationship_member` carries its own draft-privacy branch
--    (`status <> 'unsent' OR initiating_company_id = current_company_id()`), so
--    the buyer is refused BEFORE the status gate is ever reached, with the
--    authorization message. Folding it into this loop would make the loop
--    assert a message the system correctly does not produce.
DO $$
DECLARE v_status text; v_err text; v_before int; v_after int;
BEGIN
  FOR v_status IN
    SELECT code FROM public.deal_card_status
     WHERE code NOT IN ('negotiation','unsent') ORDER BY sort_order
  LOOP
    PERFORM pg_temp.arm();
    PERFORM pg_temp.set_status(v_status);
    v_before := pg_temp.line_count();
    v_err := NULL;
    BEGIN
      PERFORM pg_temp.as_buyer();
      SET LOCAL ROLE authenticated;
      PERFORM public.accept_promotion((SELECT id FROM _card));
      RESET ROLE;
      RAISE EXCEPTION 'C/accept FAIL: a promotion was ACCEPTED on a % deal', v_status;
    EXCEPTION
      WHEN OTHERS THEN
        RESET ROLE;
        IF SQLERRM LIKE 'C/accept FAIL%' THEN RAISE; END IF;
        v_err := SQLERRM;
    END;
    IF v_err NOT LIKE '%only a deal in negotiation%' THEN
      RAISE EXCEPTION 'C/accept: status % was refused for the WRONG reason (%)', v_status, v_err;
    END IF;

    v_after := pg_temp.line_count();
    IF v_after <> v_before THEN
      RAISE EXCEPTION 'C/accept FAIL: status % refused, but % line(s) still landed on the deal — the raise happened AFTER the insert loop', v_status, v_after - v_before;
    END IF;

    IF (SELECT state FROM public.deal_promotion WHERE deal_card_id = (SELECT id FROM _card)) <> 'pending' THEN
      RAISE EXCEPTION 'C/accept FAIL: status % refused, but the promotion row was still resolved', v_status;
    END IF;
  END LOOP;
END $$;

-- C-UNSENT — the draft case, refused one layer EARLIER and for a different,
--   pre-existing reason: draft privacy. Worth its own cell because it proves
--   the unsent draft is closed to the buyer by TWO independent mechanisms now,
--   and that the older one still fires first. No line may land either way.
SELECT pg_temp.arm();
SELECT pg_temp.set_status('unsent');
DO $$
DECLARE v_err text; v_before int;
BEGIN
  v_before := pg_temp.line_count();
  BEGIN
    PERFORM pg_temp.as_buyer();
    SET LOCAL ROLE authenticated;
    PERFORM public.accept_promotion((SELECT id FROM _card));
    RESET ROLE;
    RAISE EXCEPTION 'C-UNSENT FAIL: the buyer accepted a promotion on an UNSENT draft they cannot even see';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    IF SQLERRM LIKE 'C-UNSENT FAIL%' THEN RAISE; END IF;
    v_err := SQLERRM;
  END;
  IF v_err NOT LIKE '%Only the buyer%' THEN
    RAISE EXCEPTION 'C-UNSENT: expected the draft-privacy refusal via card_relationship_member, got (%)', v_err;
  END IF;
  IF pg_temp.line_count() <> v_before THEN
    RAISE EXCEPTION 'C-UNSENT FAIL: refused, but a line still landed';
  END IF;
END $$;

-- ============================================================================
-- §D — ⚠️ THE DELIBERATE ASYMMETRY. DECLINE STILL WORKS IN EVERY STATUS.
--      This is not an oversight to be tidied away later: gating the decline
--      would strand a `pending` promotion forever on any deal that left
--      negotiation while one was open — the buyer would face two buttons that
--      both refuse and no way to clear the row. Declining changes nothing on
--      the deal itself. Anyone who "fixes the inconsistency" by gating all
--      three fails HERE, which is the entire point of this section.
-- ============================================================================
-- `unsent` excluded for the SAME pre-existing reason as §C: the buyer is not a
-- card_relationship_member of an unsent draft, so they cannot decline one
-- either. That is not a stranding risk — a promotion on a private draft was
-- never visible to them, and the seller still owns the draft outright.
DO $$
DECLARE v_status text; v_before int;
BEGIN
  FOR v_status IN
    SELECT code FROM public.deal_card_status WHERE code <> 'unsent' ORDER BY sort_order
  LOOP
    PERFORM pg_temp.arm();
    PERFORM pg_temp.set_status(v_status);
    v_before := pg_temp.line_count();

    PERFORM pg_temp.as_buyer();
    SET LOCAL ROLE authenticated;
    PERFORM public.decline_promotion((SELECT id FROM _card));
    RESET ROLE;

    IF (SELECT state FROM public.deal_promotion WHERE deal_card_id = (SELECT id FROM _card)) <> 'declined' THEN
      RAISE EXCEPTION 'D/decline FAIL: a pending promotion could NOT be cleared on a % deal — it is now stranded, which is exactly what leaving decline ungated prevents', v_status;
    END IF;
    IF pg_temp.line_count() <> v_before THEN
      RAISE EXCEPTION 'D/decline FAIL: declining on a % deal changed the line count', v_status;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- §E — AUTHORIZATION SURVIVED. The gate was added AFTER each authorization
--      check on purpose: an outsider must be refused for not being a party and
--      must never learn the card's status. Both cells run on a `done` card —
--      if the status gate had been placed first, these would fail with the
--      status message and leak it.
-- ============================================================================
SELECT pg_temp.set_status('done');

-- E1 — the BUYER cannot offer (offering is the seller's move), and is told so.
SELECT pg_temp.as_buyer();
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_err text;
BEGIN
  BEGIN
    PERFORM public.offer_promotion((SELECT id FROM _card), '[]'::jsonb, '[]'::jsonb);
    RAISE EXCEPTION 'E1/authz FAIL: the BUYER offered a promotion';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'E1/authz FAIL%' THEN RAISE; END IF;
    v_err := SQLERRM;
  END;
  IF v_err NOT LIKE '%Only the seller%' THEN
    RAISE EXCEPTION 'E1/authz: expected the seller-only refusal, got (%) — the status gate was placed BEFORE the authorization check and is leaking the card status', v_err;
  END IF;
END $$;
RESET ROLE;

-- E2 — the SELLER cannot accept, and is told so rather than told the status.
SELECT pg_temp.arm();
SELECT pg_temp.as_seller();
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_err text;
BEGIN
  BEGIN
    PERFORM public.accept_promotion((SELECT id FROM _card));
    RAISE EXCEPTION 'E2/authz FAIL: the SELLER accepted their own promotion';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'E2/authz FAIL%' THEN RAISE; END IF;
    v_err := SQLERRM;
  END;
  IF v_err NOT LIKE '%Only the buyer%' THEN
    RAISE EXCEPTION 'E2/authz: expected the buyer-only refusal, got (%) — check the gate is not placed before the authorization check', v_err;
  END IF;
END $$;
RESET ROLE;

ROLLBACK;

\echo 'PASS — promotion_status_gate_test.sql (HEL-83): offer/accept are negotiation-only; decline always works'
