-- ============================================================================
-- deliver_deal_test.sql — the deal-delivery routing spine (Lane A / A2)
-- ----------------------------------------------------------------------------
-- Proves the ONE company-delivery path: a deal born WITHOUT a counterparty
-- person (a c2c/company-chat birth) writes exactly one claimable
-- pending_inbox_item ('deal_card') for the OTHER company — inside the birth RPC
-- itself — while every person-target birth (counterparty person set, incl. the
-- Sella-detection door, which always sets one) writes NO ticket: person
-- delivery lives in the app's send layer, never in SQL.
--
-- Mirrors person_company_lockdown_test.sql: one BEGIN…ROLLBACK transaction,
-- runtime-resolved seed ids (never hardcoded — the seed regenerates them on
-- every db reset), impersonation via request.jwt.claims + SET LOCAL ROLE, a
-- RAISE on any failed assertion, no trace left.
--
-- Run:  bash supabase/tests/run_deliver_deal_test.sh
--
-- ⚠️  RED-FIRST: EXPECTED TO FAIL before the A2 migrations land — (1) finds no
-- ticket (create_deal_draft doesn't deliver yet) and (2) errors on the missing
-- public.deliver_deal. GREEN once deliver_deal + the birth wiring ship.
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

-- the impersonated blocks below run as `authenticated`, which owns nothing —
-- grant it read (and, for _cards, write) on the probe's own temp fixtures.
GRANT SELECT ON _fix, _rel TO authenticated;
GRANT SELECT, INSERT ON _cards TO authenticated;

DO $$
BEGIN
  IF (SELECT count(*) FROM _fix) <> 1 OR (SELECT count(*) FROM _rel) <> 1 THEN
    RAISE EXCEPTION 'FIXTURE: seeded alice/bob/relationship not found — run supabase db reset';
  END IF;
END $$;

-- ── (1) COMPANY-TARGET BIRTH: Alice births with NO counterparty person (the
-- c2c door). Exactly ONE 'deal_card' ticket must land in StonePharm's inbox. ──
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
BEGIN
  SELECT count(*) INTO v_n
  FROM pending_inbox_item p, _fix f
  WHERE p.deal_card_id = (SELECT id FROM _cards WHERE kind = 'c2c')
    AND p.type = 'deal_card'
    AND p.receiver_company_id = f.stonepharm
    AND p.sender_company_id   = f.greenleaf
    AND p.status = 'pending'
    AND p.deleted_at IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'A2-1 FAIL: expected exactly 1 deal_card ticket for the other company, got %', v_n;
  END IF;
END $$;

-- ── (2) IDEMPOTENT: delivering the SAME card again adds nothing. ──
SELECT set_config('request.jwt.claim.sub', (SELECT alice FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT alice FROM _fix), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT public.deliver_deal((SELECT id FROM _cards WHERE kind = 'c2c'));
RESET ROLE;
DO $$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM pending_inbox_item
  WHERE deal_card_id = (SELECT id FROM _cards WHERE kind = 'c2c') AND deleted_at IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'A2-2 FAIL: deliver_deal is not idempotent — % tickets', v_n;
  END IF;
END $$;

-- ── (3) PERSON-TARGET BIRTH: Alice births WITH Bob as counterparty co-owner
-- (the p2p door). ZERO tickets — person delivery is the send layer's job. ──
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
    RAISE EXCEPTION 'A2-3 FAIL: a person-target birth must create no ticket, got %', v_n;
  END IF;
END $$;

-- ── (4) SELLA-DETECTED BIRTH (the confirm_detected_deal door): both sides
-- accept a synthetic detection on their seeded p2p thread → the born card must
-- have ZERO tickets (that door always sets a counterparty person; its own chat
-- message IS the person delivery — a ticket here would double-deliver). ──
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
BEGIN
  SELECT count(*) INTO v_n FROM pending_inbox_item
  WHERE deal_card_id = (SELECT id FROM _cards WHERE kind = 'sella') AND deleted_at IS NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'A2-4 FAIL: a Sella-detected birth must create no ticket (double-delivery), got %', v_n;
  END IF;
END $$;

ROLLBACK;
SELECT 'ALL DELIVER_DEAL TESTS PASSED' AS result;
