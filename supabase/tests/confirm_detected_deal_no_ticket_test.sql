-- ============================================================================
-- confirm_detected_deal_no_ticket_test.sql
-- ----------------------------------------------------------------------------
-- T01 (0027-retire-connect-inbox, DEV-169): `confirm_detected_deal` stops
-- cutting a `pending_inbox_item` ticket when the resolved counterparty is
-- unknown (`v_cp is null`). Proves the ticket's 3 EARS criteria:
--   1. A deal born from a c2c-thread detection creates ZERO pending_inbox_item
--      rows (and the receiving company's pending count doesn't move at all).
--   2. The born workspace is reachable by a member of the receiving company
--      who is NOT the resolved counterparty and holds no deal_member row —
--      access comes from card_relationship_member + company_wide visibility,
--      not from membership.
--   3. The existing idempotency guard (born_deal_card_id) still holds on a
--      second confirm call.
--
-- WHY THE FIXTURE MUST BE C2C, NOT P2P (this is the whole difficulty of the
-- ticket — see PLAN-T01.md): the deleted branch (`else perform
-- public.deliver_deal(v_card)`) only runs when `v_cp` (the resolved
-- counterparty PERSON) is null. `chat_thread_p2p_has_both_people`
-- (20260607090003:132) forces `person_a_id`/`person_b_id` non-null on every
-- p2p thread, and Sella detection only lands on p2p threads through the
-- sanctioned route — so `v_cp` is never null there, and BOTH assertions below
-- are already green on a p2p fixture before AND after this ticket's fix. That
-- fixture would prove nothing. This suite instead calls the RPC directly
-- against the seeded GreenLeaf<->StonePharm C2C thread, where
-- `person_a_id`/`person_b_id` are structurally NULL, forcing `v_cp` to
-- resolve NULL and exercising the exact branch T01 deletes.
--
-- ⚠️ NULL-LOGIC DEPENDENCY (documented, not this ticket's job to harden — see
-- PLAN-T01.md): 20260827130000:85's participant guard is
-- `if v_uid <> v_pa and v_uid <> v_pb then raise ...`. On a c2c thread both
-- v_pa/v_pb are NULL, so both comparisons evaluate to NULL, `NULL AND NULL`
-- is NULL, and `IF NULL THEN` does not fire — the guard silently passes for
-- ANY authenticated caller on a c2c thread, not just Alice/Bob. This suite's
-- use of Alice/Bob below is for fixture realism only; the guard does not
-- enforce it. A future reader must not mistake this test's use of named
-- participants as proof the guard checks c2c participation — it doesn't.
--
-- ⚠️ VOTE ORDER IS PINNED, NOT ARBITRARY (plan-checker round 1 caught this
-- unrecorded once already): Alice (GreenLeaf) accepts FIRST, Bob (StonePharm)
-- accepts SECOND — Bob's vote is the birth-triggering one.
-- `v_proposer`/`v_company` at birth time is the CURRENT CALLER's company
-- (20260827130000:117, re-evaluated fresh on every call), and detection rows
-- carry no `proposed_by_company`, so `v_proposer` = Bob's company =
-- StonePharm. That makes StonePharm the initiating/sending side and
-- GREENLEAF THE RECEIVING SIDE — which is what makes Carla (a GreenLeaf
-- person) a valid stand-in for the ticket's "member of the receiving company"
-- probe. Reversing Alice/Bob breaks the test's own premise, not just its
-- assertions.
--
-- Precondition corrected after plan-checker round 1: `create_deal_draft`
-- (20260724120200:164-166) ALWAYS inserts the creator (here: Bob, the caller
-- who births the card) as workspace owner, unconditionally, before this
-- ticket's `else` branch is even reached. Asserting ZERO deal_member rows for
-- the born workspace is therefore FALSE on a correct build and would send a
-- future builder chasing a phantom bug. The correct precondition is: exactly
-- ONE deal_member row (Bob, owner) — zero for everyone else, in particular
-- zero for Carla and zero for Alice.
--
-- EXPECTED TO BE RED against the unmodified live function
-- (20260827130000_confirm_detected_deal_relationship_write_gate_refactor.sql):
-- that body's `else` branch still calls `perform public.deliver_deal(v_card)`
-- on a null `v_cp`, which cuts exactly one `pending_inbox_item` row for
-- GreenLeaf. This suite's EARS-1 assertions (both the direct card-scoped
-- count and the receiver-scoped delta) will fail with "expected 0 ... found
-- 1" until T01's migration (20260903120000) ships. Nothing in this file
-- modifies a migration to make it pass — that is the builder's job next.
--
-- Fixture: the seeded GreenLeaf<->StonePharm C2C thread (seed.sql:308-321,
-- the SAME relationship confirm_detected_deal_relationship_liveness_test.sql
-- uses on its P2P thread — sequential BEGIN…ROLLBACK suites don't collide).
-- Carla (33333333-...-3333, carla@greenleaf.test) is seeded as a second
-- GreenLeaf person, not part of the Alice/Bob pair, holding no deal_member
-- row anywhere (seed.sql:113-149). No new seed rows are added.
--
-- Run:  bash supabase/tests/run_confirm_detected_deal_no_ticket_test.sh
--
-- Shape: one BEGIN…ROLLBACK, zero net seed mutation (L-033), mirrors
-- confirm_detected_deal_relationship_liveness_test.sql exactly.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ----------------------------------------------------------------------------
-- Fixture — the seeded GreenLeaf<->StonePharm c2c thread, guarded.
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE _t ON COMMIT DROP AS
SELECT
  ct.id                                            AS thread_id,
  ct.relationship_id                                AS rel_id,
  '11111111-1111-1111-1111-111111111111'::uuid     AS alice,
  '22222222-2222-2222-2222-222222222222'::uuid     AS bob,
  '33333333-3333-3333-3333-333333333333'::uuid     AS carla,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid      AS greenleaf,
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid      AS stonepharm
FROM public.chat_thread ct
JOIN public.relationship r ON r.id = ct.relationship_id
WHERE ct.type = 'c2c'
  AND r.company_a_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND r.company_b_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
GRANT SELECT ON _t TO authenticated;

DO $$
BEGIN
  IF (SELECT count(*) FROM _t) <> 1 THEN
    RAISE EXCEPTION 'FIXTURE: the seeded GreenLeaf<->StonePharm c2c thread not found — seed drift';
  END IF;
  IF (SELECT status FROM public.relationship WHERE id = (SELECT rel_id FROM _t)) <> 'active' THEN
    RAISE EXCEPTION 'FIXTURE: relationship is not active at suite start — a prior suite left it dirty';
  END IF;
  -- Carla must genuinely hold no deal_member row anywhere, or the precondition
  -- and EARS-2 assertions below would be proving something weaker than claimed.
  IF EXISTS (SELECT 1 FROM public.deal_member WHERE person_id = (SELECT carla FROM _t) AND removed_at IS NULL) THEN
    RAISE EXCEPTION 'FIXTURE: Carla already holds a deal_member row — precondition assumption violated by seed drift';
  END IF;
END $$;

-- Receiver-scoped pending-inbox snapshot, taken BEFORE any accept — the floor
-- check for EARS-1. Delta-based (project rule: assert a delta, not a
-- hardcoded count), so pre-existing seeded pending_inbox_item rows for
-- GreenLeaf (from unrelated fixtures) can't false-positive this suite.
CREATE TEMP TABLE _snapshot ON COMMIT DROP AS
SELECT count(*) AS cnt
FROM public.pending_inbox_item
WHERE receiver_company_id = (SELECT greenleaf FROM _t) AND deleted_at IS NULL;
GRANT SELECT ON _snapshot TO authenticated;

-- A fresh 'deal_detected' suggestion on the C2C thread, written the legitimate
-- way (service voice, as postgres — bypasses msg_all the same way the
-- relationship-liveness suite's p2p fixture does).
CREATE TEMP TABLE _msg ON COMMIT DROP AS
WITH ins AS (
  INSERT INTO public.chat_message (thread_id, sender, sender_person_id, type, body, metadata)
  SELECT thread_id, 'sella', NULL, 'deal_detected', 'Sella detected a deal (c2c)',
    '{"draft":{"currency":"EUR","line_items":[{"name":"C2C-detected probe","quantity":5,"unit":"g","unit_price":3}]}}'::jsonb
  FROM _t
  RETURNING id
)
SELECT id FROM ins;
GRANT SELECT ON _msg TO authenticated;

-- ============================================================================
-- §A — the votes. Alice (GreenLeaf) first, Bob (StonePharm) second — Bob's
--      vote births the card. See header: this order is load-bearing, not
--      cosmetic.
-- ============================================================================

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', alice, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
SELECT public.confirm_detected_deal((SELECT id FROM _msg), 'accept');
RESET ROLE;

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', bob, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
SELECT public.confirm_detected_deal((SELECT id FROM _msg), 'accept');
RESET ROLE;

CREATE TEMP TABLE _card ON COMMIT DROP AS
SELECT (metadata->>'born_deal_card_id')::uuid AS card_id
FROM public.chat_message WHERE id = (SELECT id FROM _msg);
GRANT SELECT ON _card TO authenticated;

DO $$
BEGIN
  IF (SELECT card_id FROM _card) IS NULL THEN
    RAISE EXCEPTION 'A/birth: no deal_card was born after both accepts — fixture is broken, not this ticket''s subject';
  END IF;
END $$;

CREATE TEMP TABLE _ws ON COMMIT DROP AS
SELECT dw.id AS ws_id
FROM public.deal_workspace dw
WHERE dw.deal_card_id = (SELECT card_id FROM _card) AND dw.deleted_at IS NULL;
GRANT SELECT ON _ws TO authenticated;

DO $$
BEGIN
  IF (SELECT count(*) FROM _ws) <> 1 THEN
    RAISE EXCEPTION 'A/birth: expected exactly one live deal_workspace for the born card, found %', (SELECT count(*) FROM _ws);
  END IF;
END $$;

-- ============================================================================
-- §B — EARS 1: zero pending_inbox_item rows from a c2c-thread detection.
--      RED against the live function today — the deleted `else` branch still
--      calls deliver_deal(v_card) on a null v_cp and cuts exactly one row.
-- ============================================================================

DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.pending_inbox_item
  WHERE deal_card_id = (SELECT card_id FROM _card);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'B/EARS-1: expected 0 pending_inbox_item rows for the c2c-detected born card, found %', v_count;
  END IF;
END $$;

DO $$
DECLARE v_before int; v_after int;
BEGIN
  SELECT cnt INTO v_before FROM _snapshot;
  SELECT count(*) INTO v_after FROM public.pending_inbox_item
  WHERE receiver_company_id = (SELECT greenleaf FROM _t) AND deleted_at IS NULL;
  IF v_after <> v_before THEN
    RAISE EXCEPTION 'B/EARS-1 floor: GreenLeaf''s receiver-scoped pending count moved from % to % — a ticket was cut', v_before, v_after;
  END IF;
END $$;

-- ============================================================================
-- §C — precondition, then EARS 2: the born workspace is accessible to a
--      receiving-company member who is neither the resolved counterparty nor
--      a deal_member (Carla) — via card_relationship_member + company_wide
--      visibility, not via membership.
-- ============================================================================

-- Precondition (plan-checker round 1's correction): exactly ONE deal_member
-- row — Bob (the caller who births the card), role owner — inserted
-- unconditionally by create_deal_draft BEFORE this ticket's branch is ever
-- reached. Zero for anyone else, in particular zero for Carla and zero for
-- Alice. Asserting zero rows total would be false on a correct build.
DO $$
DECLARE v_total int; v_bob_owner int;
BEGIN
  SELECT count(*) INTO v_total FROM public.deal_member
  WHERE deal_workspace_id = (SELECT ws_id FROM _ws) AND removed_at IS NULL;
  IF v_total <> 1 THEN
    RAISE EXCEPTION 'C/precondition: expected exactly one deal_member row for the born workspace, found %', v_total;
  END IF;

  SELECT count(*) INTO v_bob_owner FROM public.deal_member
  WHERE deal_workspace_id = (SELECT ws_id FROM _ws)
    AND person_id = (SELECT bob FROM _t)
    AND role = 'owner'
    AND removed_at IS NULL;
  IF v_bob_owner <> 1 THEN
    RAISE EXCEPTION 'C/precondition: expected Bob (the birthing caller) as sole owner of the born workspace, found %', v_bob_owner;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.deal_member
    WHERE deal_workspace_id = (SELECT ws_id FROM _ws)
      AND person_id = (SELECT carla FROM _t) AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'C/precondition: Carla unexpectedly holds a deal_member row on the born workspace';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.deal_member
    WHERE deal_workspace_id = (SELECT ws_id FROM _ws)
      AND person_id = (SELECT alice FROM _t) AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'C/precondition: Alice unexpectedly holds a deal_member row on the born workspace';
  END IF;
END $$;

-- EARS 2: Carla — GreenLeaf (the receiving company), NOT the resolved
-- counterparty (v_cp is null on this c2c fixture — there IS no resolved
-- counterparty), holding no deal_member row (proven above) — must still see
-- the workspace via can_access_workspace.
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', carla, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_access boolean;
BEGIN
  SELECT public.can_access_workspace((SELECT ws_id FROM _ws)) INTO v_access;
  IF NOT v_access THEN
    RAISE EXCEPTION 'C/EARS-2: Carla (GreenLeaf, receiving company, zero deal_member rows) cannot access the born workspace — expected true';
  END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- §D — EARS 3 (idempotency half): a second confirm call leaves
--      born_deal_card_id unchanged and creates no second card/workspace.
--      (EARS 3's liveness half — the relationship-liveness check unchanged —
--      is covered by confirm_detected_deal_relationship_liveness_test.sql,
--      which never exercises the deleted branch and needs no change here.)
-- ============================================================================

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', bob, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
SELECT public.confirm_detected_deal((SELECT id FROM _msg), 'accept');
RESET ROLE;

DO $$
DECLARE v_card_id2 uuid; v_ws_count int;
BEGIN
  SELECT (metadata->>'born_deal_card_id')::uuid INTO v_card_id2
  FROM public.chat_message WHERE id = (SELECT id FROM _msg);
  IF v_card_id2 IS DISTINCT FROM (SELECT card_id FROM _card) THEN
    RAISE EXCEPTION 'D/idempotency: born_deal_card_id changed on re-call — expected %, got %', (SELECT card_id FROM _card), v_card_id2;
  END IF;

  SELECT count(*) INTO v_ws_count FROM public.deal_workspace
  WHERE deal_card_id = (SELECT card_id FROM _card) AND deleted_at IS NULL;
  IF v_ws_count <> 1 THEN
    RAISE EXCEPTION 'D/idempotency: expected exactly one live workspace after re-call, found %', v_ws_count;
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'confirm_detected_deal no-ticket (c2c): ALL CELLS PASSED (A, B, C, D)'; END $$;

ROLLBACK;
