-- ============================================================================
-- deliver_deal_test.sql — the deal-delivery routing spine (Lane A / A2,
-- re-timed for Phase 12: birth is PRIVATE. T01/HEL-63 (2026-08-25) then took
-- deliver_deal OUT of send_deal entirely: send_deal's company arm now posts
-- a chat pill directly instead of calling deliver_deal. deliver_deal is
-- still called by confirm_detected_deal (case (4) below) — and, since
-- send_deal no longer exercises it, THIS file now calls it directly to keep
-- proving its own idempotency guard (case (2a) below).
-- ----------------------------------------------------------------------------
-- Phase 12 split birth from delivery (D-04/D-06): create_deal_draft births a
-- PRIVATE 'unsent' card and writes NO ticket. This file proves the re-timed
-- spine, T01/HEL-63-corrected:
--   (1) a c2c birth (no counterparty person) delivers NOTHING; send_deal then
--       flips the card to 'negotiation' and posts a 'deal_card' chat pill
--       into the c2c thread — ZERO pending_inbox_item rows (T01/HEL-63; the
--       full pill/RLS proof lives in send_deal_c2c_announce_test.sql);
--   (2) deliver_deal stays idempotent under two DIRECT calls (T01/HEL-63 —
--       send_deal no longer calls it, so a single call would no longer prove
--       anything), and a SECOND send_deal is rejected (only an unsent draft
--       can be sent — the double-send guard);
--   (3) a person-target birth (counterparty person set) delivers nothing at
--       birth AND writes no ticket at send — send_deal's person half posts
--       the clickable 'deal_card' pill on the p2p thread instead;
--   (4) the Sella-detection door (confirm_detected_deal) births straight into
--       'negotiation', delivered-by-construction: co-owner added inside the
--       door, zero tickets (a ticket here would double-deliver). This is now
--       deliver_deal's LAST production caller.
--
-- Mirrors person_company_lockdown_test.sql: one BEGIN…ROLLBACK transaction,
-- runtime-resolved seed ids (never hardcoded — the seed regenerates them on
-- every db reset), impersonation via request.jwt.claims + SET LOCAL ROLE, a
-- RAISE on any failed assertion, no trace left.
--
-- Run:  bash supabase/tests/run_deliver_deal_test.sh
-- ============================================================================

BEGIN;

-- ── Runtime fixture resolution (seeded world, §5d): Alice @ GreenLeaf,
-- Bob @ StonePharm, their relationship + their p2p thread. ──
CREATE TEMP TABLE _fix ON COMMIT DROP AS
SELECT
  a.id                                        AS alice,
  b.id                                        AS bob,
  (SELECT company_id FROM person WHERE id = a.id) AS greenleaf,
  (SELECT company_id FROM person WHERE id = b.id) AS stonepharm
FROM auth.users a, auth.users b
WHERE a.email = 'alice@greenleaf.test' AND b.email = 'bob@stonepharm.test';

CREATE TEMP TABLE _rel ON COMMIT DROP AS
SELECT r.id AS rel
FROM relationship r, _fix f
WHERE (r.company_a_id = f.greenleaf AND r.company_b_id = f.stonepharm)
   OR (r.company_a_id = f.stonepharm AND r.company_b_id = f.greenleaf);

CREATE TEMP TABLE _cards (id uuid, kind text) ON COMMIT DROP;
CREATE TEMP TABLE _sent (thread uuid) ON COMMIT DROP;

-- the impersonated blocks below run as `authenticated`, which owns nothing —
-- grant it read (and, where it writes, insert) on the probe's own temp fixtures.
GRANT SELECT ON _fix, _rel TO authenticated;
GRANT SELECT, INSERT ON _cards TO authenticated;
GRANT SELECT, INSERT ON _sent TO authenticated;

DO $$
BEGIN
  IF (SELECT count(*) FROM _fix) <> 1 OR (SELECT count(*) FROM _rel) <> 1 THEN
    RAISE EXCEPTION 'FIXTURE: seeded alice/bob/relationship not found — run supabase db reset';
  END IF;
  -- HEL-84: the earlier citation for this fixture-liveness guard (:67-69)
  -- only asserted the ROW EXISTS, not that its status is 'active' — added
  -- explicitly (send_deal_relationship_liveness_test.sql:55 and confirm_
  -- detected_deal_relationship_liveness_test.sql:44 both already assert this
  -- for their own fixtures) so a future seed change can't silently start
  -- this suite on an already-non-active relationship, which would make case
  -- (5)'s own "flip took" assertion below meaningless.
  IF (SELECT status FROM relationship WHERE id = (SELECT rel FROM _rel)) <> 'active' THEN
    RAISE EXCEPTION 'FIXTURE: relationship is not active at suite start — a prior suite left it dirty';
  END IF;
END $$;

-- ── (1a) COMPANY-TARGET BIRTH IS PRIVATE: Alice births with NO counterparty
-- person (the c2c door). NO ticket may exist yet — birth no longer delivers. ──
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
  INSERT INTO _cards VALUES (v_card, 'c2c');
END $$;
RESET ROLE;

DO $$
DECLARE
  v_n int;
  v_status text;
BEGIN
  SELECT count(*) INTO v_n FROM pending_inbox_item
  WHERE deal_card_id = (SELECT id FROM _cards WHERE kind = 'c2c') AND deleted_at IS NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'A2-1a FAIL: birth must not deliver (D-04), got % tickets', v_n;
  END IF;
  SELECT status INTO v_status FROM deal_card
  WHERE id = (SELECT id FROM _cards WHERE kind = 'c2c');
  IF v_status <> 'unsent' THEN
    RAISE EXCEPTION 'A2-1a FAIL: a fresh draft must be unsent, got %', v_status;
  END IF;
END $$;

-- ── (1b) SEND ANNOUNCES, NOT TICKETS: Alice sends → the flip to
-- 'negotiation' + ZERO pending_inbox_item rows + exactly ONE 'deal_card'
-- pill in the seeded c2c thread. T01/HEL-63 (2026-08-25): send_deal's
-- company arm no longer calls deliver_deal — it posts the same clickable
-- pill the person arm already posts, into the c2c thread instead. The
-- 'deal_card' ticket producer this case used to prove is now covered by
-- deliver_deal_test's own (2a) below, called directly. ──
SELECT set_config('request.jwt.claim.sub', (SELECT alice FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT alice FROM _fix), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT public.send_deal((SELECT id FROM _cards WHERE kind = 'c2c'));
RESET ROLE;

DO $$
DECLARE
  v_n int;
  v_status text;
BEGIN
  SELECT count(*) INTO v_n
  FROM pending_inbox_item
  WHERE deal_card_id = (SELECT id FROM _cards WHERE kind = 'c2c') AND deleted_at IS NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'A2-1b FAIL: send_deal must not write a ticket for a company-addressed deal any more (it posts a chat pill instead — see send_deal_c2c_announce_test.sql), got %', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM chat_message m
  JOIN chat_thread t ON t.id = m.thread_id
  JOIN _rel r ON r.rel = t.relationship_id
  WHERE t.type = 'c2c' AND t.deleted_at IS NULL
    AND m.type = 'deal_card'
    AND m.metadata->>'deal_card_id' = (SELECT id FROM _cards WHERE kind = 'c2c')::text
    AND m.deleted_at IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'A2-1b FAIL: expected exactly 1 deal_card pill in the c2c thread after send, got %', v_n;
  END IF;

  SELECT status INTO v_status FROM deal_card
  WHERE id = (SELECT id FROM _cards WHERE kind = 'c2c');
  IF v_status <> 'negotiation' THEN
    RAISE EXCEPTION 'A2-1b FAIL: send must flip the card to negotiation, got %', v_status;
  END IF;
END $$;

-- ── (2a) IDEMPOTENT: deliver_deal is called directly TWICE. T01/HEL-63
-- (plan-checker finding 3 / the L-044 trap): now that (1b) above asserts
-- ZERO tickets after send_deal, a single deliver_deal call here would be the
-- FIRST insert ever made for this card, and "1 ticket" would pass trivially
-- without ever exercising deliver_deal's own `if not exists` dedupe guard
-- (20260720095000:51-56). Calling it twice is the only way this repo still
-- proves that guard. WR-01: the direct call is a PRIVILEGED (postgres) call —
-- authenticated lost EXECUTE (probe 2c below), so both calls run as owner. ──
RESET ROLE;
SELECT public.deliver_deal((SELECT id FROM _cards WHERE kind = 'c2c'));
SELECT public.deliver_deal((SELECT id FROM _cards WHERE kind = 'c2c'));
DO $$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM pending_inbox_item
  WHERE deal_card_id = (SELECT id FROM _cards WHERE kind = 'c2c') AND deleted_at IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'A2-2a FAIL: deliver_deal is not idempotent after 2 direct calls — % tickets', v_n;
  END IF;
END $$;

-- ── (2c / WR-01) EXECUTE REVOKED: authenticated may NOT call deliver_deal
-- directly — only a nested definer call from confirm_detected_deal may (T01/
-- HEL-63: send_deal no longer calls deliver_deal at all; this file's own
-- (2a) probe above runs privileged, not as authenticated). As Alice, a
-- direct call is blocked at the grant layer (insufficient_privilege). ──
SELECT set_config('request.jwt.claim.sub', (SELECT alice FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT alice FROM _fix), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.deliver_deal((SELECT id FROM _cards WHERE kind = 'c2c'));
    RAISE EXCEPTION 'WR-01 LEAK: authenticated executed deliver_deal directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;  -- expected: EXECUTE revoked
  END;
END $$;
RESET ROLE;

-- ── (2b) DOUBLE-SEND GUARD (T-12-05): a second send_deal must be rejected —
-- the card is no longer 'unsent'. ──
SELECT set_config('request.jwt.claim.sub', (SELECT alice FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT alice FROM _fix), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.send_deal((SELECT id FROM _cards WHERE kind = 'c2c'));
    RAISE EXCEPTION 'A2-2b FAIL: a second send_deal must be rejected';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%only an unsent draft%' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;

-- ── (3) PERSON-TARGET: Alice births WITH Bob picked as counterparty (the p2p
-- door). ZERO tickets at birth AND at send — the company half no-ops (the
-- co-owner joins at send); the person half posts the 'deal_card' pill on the
-- p2p thread instead. ──
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
    NULL, NULL, (SELECT bob FROM _fix));
  INSERT INTO _cards VALUES (v_card, 'p2p');
END $$;
RESET ROLE;
DO $$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM pending_inbox_item
  WHERE deal_card_id = (SELECT id FROM _cards WHERE kind = 'p2p') AND deleted_at IS NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'A2-3a FAIL: a person-target birth must create no ticket, got %', v_n;
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', (SELECT alice FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT alice FROM _fix), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_thread uuid;
BEGIN
  v_thread := public.send_deal((SELECT id FROM _cards WHERE kind = 'p2p'));
  IF v_thread IS NULL THEN
    RAISE EXCEPTION 'A2-3b FAIL: a person-target send must return the p2p thread id';
  END IF;
  INSERT INTO _sent VALUES (v_thread);
END $$;
RESET ROLE;

DO $$
DECLARE
  v_n int;
BEGIN
  -- company half no-ops: a co-owner exists, so still zero tickets
  SELECT count(*) INTO v_n FROM pending_inbox_item
  WHERE deal_card_id = (SELECT id FROM _cards WHERE kind = 'p2p') AND deleted_at IS NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'A2-3c FAIL: a person-target send must create no company ticket, got %', v_n;
  END IF;
  -- person half delivers: exactly one clickable 'deal_card' pill on the thread
  SELECT count(*) INTO v_n FROM chat_message
  WHERE thread_id = (SELECT thread FROM _sent)
    AND type = 'deal_card'
    AND metadata->>'deal_card_id' = (SELECT id FROM _cards WHERE kind = 'p2p')::text;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'A2-3d FAIL: expected exactly 1 deal_card pill on the p2p thread, got %', v_n;
  END IF;
  -- and the co-owner joined at send
  SELECT count(*) INTO v_n
  FROM deal_member dm
  JOIN deal_workspace dw ON dw.id = dm.deal_workspace_id
  WHERE dw.deal_card_id = (SELECT id FROM _cards WHERE kind = 'p2p')
    AND dm.person_id = (SELECT bob FROM _fix)
    AND dm.removed_at IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'A2-3e FAIL: the counterparty must become co-owner at send, got % memberships', v_n;
  END IF;
END $$;

-- ── (4) SELLA-DETECTED BIRTH (the confirm_detected_deal door): both sides
-- accept a synthetic detection on their seeded p2p thread → the born card is
-- 'negotiation' from birth (D-07, delivered-by-construction) and has ZERO
-- tickets (that door always sets a counterparty person; its own chat message
-- IS the person delivery — a ticket here would double-deliver). ──
CREATE TEMP TABLE _det (msg uuid) ON COMMIT DROP;
GRANT SELECT ON _det TO authenticated;
WITH thread AS (
  SELECT t.id
  FROM chat_thread t, _fix f, _rel r
  WHERE t.relationship_id = r.rel AND t.type = 'p2p' AND t.deleted_at IS NULL
    AND ((t.person_a_id = f.alice AND t.person_b_id = f.bob)
      OR (t.person_a_id = f.bob   AND t.person_b_id = f.alice))
  LIMIT 1
), ins AS (
  INSERT INTO chat_message (thread_id, sender, type, body, metadata)
  SELECT id, 'sella', 'deal_detected', 'Probe detection',
         '{"draft":{"currency":"EUR","line_items":[{"name":"Probe Flower","quantity":10,"unit":"g","unit_price":5}]}}'::jsonb
  FROM thread
  RETURNING id
)
INSERT INTO _det SELECT id FROM ins;

DO $$
BEGIN
  IF (SELECT count(*) FROM _det) <> 1 THEN
    RAISE EXCEPTION 'FIXTURE: seeded alice<->bob p2p thread not found';
  END IF;
END $$;

-- Alice accepts…
SELECT set_config('request.jwt.claim.sub', (SELECT alice FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT alice FROM _fix), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT public.confirm_detected_deal((SELECT msg FROM _det), 'accept');
RESET ROLE;

-- …then Bob accepts → the card is born NOW, through create_deal_draft.
SELECT set_config('request.jwt.claim.sub', (SELECT bob FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT bob FROM _fix), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_card uuid;
  v_born boolean;
BEGIN
  SELECT deal_card_id, born_now INTO v_card, v_born
  FROM public.confirm_detected_deal((SELECT msg FROM _det), 'accept');
  IF v_card IS NULL OR NOT v_born THEN
    RAISE EXCEPTION 'FIXTURE: detection birth did not happen (card %, born %)', v_card, v_born;
  END IF;
  INSERT INTO _cards VALUES (v_card, 'sella');
END $$;
RESET ROLE;

DO $$
DECLARE
  v_n int;
  v_status text;
BEGIN
  SELECT count(*) INTO v_n FROM pending_inbox_item
  WHERE deal_card_id = (SELECT id FROM _cards WHERE kind = 'sella') AND deleted_at IS NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'A2-4 FAIL: a Sella-detected birth must create no ticket (double-delivery), got %', v_n;
  END IF;
  SELECT status INTO v_status FROM deal_card
  WHERE id = (SELECT id FROM _cards WHERE kind = 'sella');
  IF v_status <> 'negotiation' THEN
    RAISE EXCEPTION 'A2-4 FAIL: the Sella door must birth straight into negotiation (D-07), got %', v_status;
  END IF;
END $$;

-- ── (5, AC4/HEL-84) SUSPENDED RELATIONSHIP REFUSES DELIVERY: this repo's own
-- PLAN-HEL-84.md §0 confirms deliver_deal is unreachable through the product
-- except nested inside confirm_detected_deal, which already gates the same
-- relationship first — so this cell is the ONLY place deliver_deal's OWN new
-- gate is exercised directly (built anyway, per ADR 0008's Blast-radius, "so
-- a third future caller can't reopen the gap silently"). True last cell,
-- immediately before this file's own ROLLBACK: the flip below persists for
-- the rest of this transaction, and every case above already ran. ──
RESET ROLE;
UPDATE relationship SET status = 'suspended' WHERE id = (SELECT rel FROM _rel);
DO $$
BEGIN
  IF (SELECT status FROM relationship WHERE id = (SELECT rel FROM _rel)) <> 'suspended' THEN
    RAISE EXCEPTION 'A2-5/flip FAIL: relationship status is % after the UPDATE, expected suspended',
      (SELECT status FROM relationship WHERE id = (SELECT rel FROM _rel));
  END IF;
END $$;

-- Bob's claims — the ones already active at this point in the file (case
-- (4)'s own RESET ROLE, above, clears only the ROLE, not this
-- transaction-local set_config) — restated explicitly here rather than
-- relied on implicitly. Called PRIVILEGED, with NO SET LOCAL ROLE
-- authenticated: case (2c)/WR-01 above already proved authenticated has
-- EXECUTE revoked on deliver_deal entirely — the call below runs as the
-- connection's own privileged role, same as case (2a)'s direct calls, while
-- Bob's claims stay active so assert_relationship_writable's membership
-- check (a real party, not the service_role skip) resolves the way a
-- genuine nested caller would see it. Unlike §4's refactor of send_deal/
-- confirm_detected_deal, this membership predicate is NOT redundant-but-
-- harmless for deliver_deal — it never had a caller-is-party check of its
-- own before this ticket.
SELECT set_config('request.jwt.claim.sub', (SELECT bob FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT bob FROM _fix), 'role', 'authenticated')::text, true);
DO $$ BEGIN BEGIN
  PERFORM public.deliver_deal((SELECT id FROM _cards WHERE kind = 'c2c'));
  RAISE EXCEPTION 'A2-5/AC4 FAIL: deliver_deal delivered onto a SUSPENDED relationship';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'A2-5/AC4%' THEN RAISE; END IF;
  IF SQLERRM NOT LIKE '%relationship is suspended%' THEN
    RAISE EXCEPTION 'A2-5/AC4 FAIL: refused for the WRONG reason (%)', SQLERRM;
  END IF;
END; END $$;

ROLLBACK;
SELECT 'ALL DELIVER_DEAL TESTS PASSED' AS result;
