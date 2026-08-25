-- ============================================================================
-- deal_promotion_write_lockdown_test.sql
-- ----------------------------------------------------------------------------
-- Proves: a relationship member can no longer write `deal_promotion` directly
-- by a PostgREST INSERT/UPDATE/DELETE, while the legitimate paths — the seller
-- offering (`offer_promotion`), and the buyer accepting or declining
-- (`accept_promotion`, `decline_promotion`) — still work, including the two
-- structural guarantees added alongside the grants: at most one PENDING
-- promotion per card, and line_deltas/condition_deltas must be jsonb arrays.
--
-- Run:  bash supabase/tests/run_deal_promotion_write_lockdown_test.sh
--
-- ⚠️  WHY THIS TABLE MATTERS TO `deal_line_item`'s OWN LOCKDOWN.
--     `accept_promotion` trusts `deal_promotion.offered_by_company` and
--     `.line_deltas` as its authorization input: it checks the CALLER is the
--     buyer, then writes whatever that row's line_deltas say. Before this
--     fix, `deal_promotion`'s only policy (`promotion_member_all`, FOR ALL,
--     `card_relationship_member` on both USING and WITH CHECK) let the buyer:
--       1. INSERT a self-authored promotion, spoofing offered_by_company as
--          the seller, with arbitrary line_deltas;
--       2. call accept_promotion as themselves — the buyer gate passes,
--          because they ARE the buyer;
--       3. the definer writes those arbitrary lines into deal_line_item.
--     §D below reproduces that exact bypass (a rolled-back probe, live,
--     before this suite existed: a buyer forged a 1000-gram free-product
--     line through it) and pins it as a regression, plus the UPDATE variant
--     (rewrite the seller's REAL pending promotion before accepting it).
--     Read together with `deal_line_item_insert_lockdown_test.sql` — that
--     suite alone does not prove the door is shut; this one closes it.
--
-- ⚠️  §C/§D ASSERT FROM `authenticated`, NOT THROUGH A DEFINER — a definer
--     caller bypasses RLS/grants entirely and would pass even if the REVOKE
--     were missing. §D1/§D2 in particular DISCRIMINATE the caught exception
--     (`insufficient_privilege`, same as §C) rather than swallowing any
--     error — a loose `WHEN others` on the suite's own headline regression
--     cells would pass even if the refusal came from an unrelated bug.
--
-- Shape: one BEGIN…ROLLBACK, zero net seed mutation (L-033).
--
-- Fixture (seeded): Rheinland Apotheke <-> GreenLeaf Cultivation. Clara Vogt is
-- at Rheinland (buyer side on this relationship's live cards); Alice Green is
-- at GreenLeaf (seller side). Both are relationship members.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE _t ON COMMIT DROP AS
SELECT dc.id                                                            AS card_id,
       dc.version                                                       AS version,
       (SELECT id FROM auth.users WHERE email = 'clara@rheinland.test') AS clara,
       (SELECT id FROM public.company WHERE name = 'Rheinland Apotheke GmbH') AS rheinland,
       '11111111-1111-1111-1111-111111111111'::uuid                    AS alice,
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid                     AS greenleaf,
       '22222222-2222-2222-2222-222222222222'::uuid                    AS bob
  FROM public.deal_card dc
  JOIN public.relationship r ON r.id = dc.relationship_id
  JOIN public.company ca ON ca.id = r.company_a_id
  JOIN public.company cb ON cb.id = r.company_b_id
 WHERE (ca.name LIKE 'Rheinland%' AND cb.name LIKE 'GreenLeaf%')
    OR (ca.name LIKE 'GreenLeaf%' AND cb.name LIKE 'Rheinland%')
 LIMIT 1;
GRANT SELECT ON _t TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _t)
    THEN RAISE EXCEPTION 'FIXTURE: no deal card on the Rheinland<->GreenLeaf relationship — seed drift'; END IF;
  IF (SELECT company_id FROM public.person WHERE id = (SELECT clara FROM _t))
       IS DISTINCT FROM (SELECT rheinland FROM _t)
    THEN RAISE EXCEPTION 'FIXTURE: Clara is not at Rheinland — seed drift'; END IF;
  IF public.card_buyer_company_id((SELECT card_id FROM _t)) IS DISTINCT FROM (SELECT rheinland FROM _t) THEN
    RAISE EXCEPTION 'FIXTURE: Rheinland is not the buyer on the picked card — seed drift or wrong card';
  END IF;
END $$;

-- ============================================================================
-- §A — THE LEGITIMATE PATHS, THROUGH THE RPCs.
-- ============================================================================

-- A1 — the real seller offers a promotion via the RPC.
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE _a1 ON COMMIT DROP AS
SELECT public.offer_promotion(
  (SELECT card_id FROM _t),
  '[{"productName":"A1 offer reward","quantity":3,"unit":"g","unitPrice":0,"currency":"EUR"}]'::jsonb
) AS promo_id;
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.deal_promotion
                   WHERE id = (SELECT promo_id FROM _a1)
                     AND state = 'pending'
                     AND offered_by_company = (SELECT greenleaf FROM _t))
    THEN RAISE EXCEPTION 'A1/offer: the seller''s legitimate offer was refused or misattributed'; END IF;
END $$;

-- A2 — while A1 is still pending, a second offer must be refused (at most one
--      pending promotion per card — uq_deal_promotion_one_pending).
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.offer_promotion((SELECT card_id FROM _t), '[]'::jsonb);
    RAISE EXCEPTION 'A2/one-pending: a second pending promotion was created alongside A1''s';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE 'A2/one-pending%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%already pending%' THEN
        RAISE EXCEPTION 'A2/one-pending: refused for the WRONG reason (%)', SQLERRM;
      END IF;
  END;
END $$;
RESET ROLE;

-- A3 — the buyer accepts A1: the reward line lands, sort_order continues.
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', clara, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
SELECT public.accept_promotion((SELECT card_id FROM _t));
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.deal_line_item WHERE product_name = 'A1 offer reward')
    THEN RAISE EXCEPTION 'A3/accept: the accept did not apply the offered reward'; END IF;
END $$;

-- A4 — nothing pending any more: a second accept must be refused, not
--      re-apply an already-resolved promotion.
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', clara, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.accept_promotion((SELECT card_id FROM _t));
    RAISE EXCEPTION 'A4/double-accept: an already-resolved promotion was accepted again';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE 'A4/double-accept%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%no pending promotion%' THEN
        RAISE EXCEPTION 'A4/double-accept: refused for the WRONG reason (%)', SQLERRM;
      END IF;
  END;
END $$;
RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.deal_line_item WHERE product_name = 'A1 offer reward') <> 1
    THEN RAISE EXCEPTION 'A4/double-accept: the reward line was applied more than once'; END IF;
END $$;

-- A5 — now that A1 is resolved, a NEW offer is allowed again (the unique
--      index is on state='pending', not on the card as a whole) — declined
--      by the buyer this time.
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE _a5 ON COMMIT DROP AS
SELECT public.offer_promotion(
  (SELECT card_id FROM _t),
  '[{"productName":"A5 decline test","quantity":1,"unit":"g","unitPrice":0,"currency":"EUR"}]'::jsonb
) AS promo_id;
RESET ROLE;

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', clara, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
SELECT public.decline_promotion((SELECT card_id FROM _t));
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.deal_promotion
                   WHERE id = (SELECT promo_id FROM _a5) AND state = 'declined' AND resolved_at IS NOT NULL)
    THEN RAISE EXCEPTION 'A5/decline: the buyer''s legitimate decline did not flip the promotion'; END IF;
END $$;

-- A6 — a non-array line_deltas is refused by the column CHECK, not left to
--      wedge accept_promotion later with a raw jsonb_array_elements error.
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.offer_promotion((SELECT card_id FROM _t), '{"not":"an array"}'::jsonb);
    RAISE EXCEPTION 'A6/check: a non-array line_deltas was accepted';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE 'A6/check%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%deal_promotion_line_deltas_is_array%' THEN
        RAISE EXCEPTION 'A6/check: refused for the WRONG reason (%)', SQLERRM;
      END IF;
  END;
END $$;
RESET ROLE;

-- ============================================================================
-- §B — THE RPCs GATE ON SIDE, NOT MEMBERSHIP.
-- ============================================================================

-- B1 — the buyer tries to offer a promotion (wrong side).
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', clara, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.offer_promotion((SELECT card_id FROM _t), '[]'::jsonb);
    RAISE EXCEPTION 'B1/side: the BUYER was allowed to offer a promotion';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE 'B1/side%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%Only the seller%' THEN
        RAISE EXCEPTION 'B1/side: refused for the WRONG reason (%)', SQLERRM;
      END IF;
  END;
END $$;
RESET ROLE;

-- B2 — the seller tries to decline a promotion (wrong side).
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.decline_promotion((SELECT card_id FROM _t));
    RAISE EXCEPTION 'B2/side: the SELLER was allowed to decline its own promotion';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE 'B2/side%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%Only the buyer%' THEN
        RAISE EXCEPTION 'B2/side: refused for the WRONG reason (%)', SQLERRM;
      END IF;
  END;
END $$;
RESET ROLE;

-- B3 — a total stranger (Bob, neither side of this relationship) is refused
--      the same way as a wrong-side member.
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', bob, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.accept_promotion((SELECT card_id FROM _t));
    RAISE EXCEPTION 'B3/stranger: a non-member was allowed to accept a promotion on this deal';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE 'B3/stranger%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%Only the buyer%' THEN
        RAISE EXCEPTION 'B3/stranger: refused for the WRONG reason (%)', SQLERRM;
      END IF;
  END;
END $$;
RESET ROLE;

-- ============================================================================
-- §C — THE GATE. A genuine relationship member can no longer write the table
--      directly, for ANY of INSERT/UPDATE/DELETE. Asserted from
--      `authenticated`, not a definer.
-- ============================================================================

-- C1 — direct INSERT, buyer side (Clara/Rheinland).
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', clara, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE n integer;
BEGIN
  BEGIN
    INSERT INTO public.deal_promotion (deal_card_id, base_version, offered_by_company, offered_by_person, line_deltas, state)
    SELECT card_id, version, greenleaf, clara, '[]'::jsonb, 'pending' FROM _t;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN RAISE EXCEPTION 'C1/forge: the BUYER inserted a promotion row directly — the lockdown is not holding'; END IF;
    RAISE EXCEPTION 'C1/forge: the insert was allowed but matched 0 rows — inconclusive';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM LIKE 'C1/forge%' THEN RAISE; END IF;
      RAISE EXCEPTION 'C1/forge: refused for the WRONG reason (%) — proves nothing', SQLERRM;
  END;
END $$;
RESET ROLE;

-- C2 — ⚠️ AND THE SELLER SIDE CANNOT EITHER — role-wide, not side-specific.
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE n integer;
BEGIN
  BEGIN
    INSERT INTO public.deal_promotion (deal_card_id, base_version, offered_by_company, offered_by_person, line_deltas, state)
    SELECT card_id, version, greenleaf, alice, '[]'::jsonb, 'pending' FROM _t;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN RAISE EXCEPTION 'C2/scope: the SELLER still has a direct client insert path'; END IF;
    RAISE EXCEPTION 'C2/scope: allowed but matched 0 rows — inconclusive';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM LIKE 'C2/scope%' THEN RAISE; END IF;
      RAISE EXCEPTION 'C2/scope: refused for the WRONG reason (%)', SQLERRM;
  END;
END $$;
RESET ROLE;

-- C3 — direct DELETE, buyer side. UPDATE is already exercised by §D2 below
--      (the confused-deputy rewrite is itself an UPDATE probe); DELETE has no
--      other cell in this suite.
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', clara, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE n integer;
BEGIN
  BEGIN
    DELETE FROM public.deal_promotion WHERE id = (SELECT promo_id FROM _a5);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN RAISE EXCEPTION 'C3/forge: the BUYER deleted a promotion row directly'; END IF;
    RAISE EXCEPTION 'C3/forge: the delete was allowed but matched 0 rows — inconclusive';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM LIKE 'C3/forge%' THEN RAISE; END IF;
      RAISE EXCEPTION 'C3/forge: refused for the WRONG reason (%) — proves nothing', SQLERRM;
  END;
END $$;
RESET ROLE;

-- C4 — ⚠️ AND THE SELLER SIDE CANNOT DELETE EITHER.
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE n integer;
BEGIN
  BEGIN
    DELETE FROM public.deal_promotion WHERE id = (SELECT promo_id FROM _a5);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN RAISE EXCEPTION 'C4/scope: the SELLER deleted its own promotion row directly'; END IF;
    RAISE EXCEPTION 'C4/scope: allowed but matched 0 rows — inconclusive';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM LIKE 'C4/scope%' THEN RAISE; END IF;
      RAISE EXCEPTION 'C4/scope: refused for the WRONG reason (%)', SQLERRM;
  END;
END $$;
RESET ROLE;

-- C5 — the two card-side helpers are internal-only: neither is directly
--      callable by `authenticated` (only other definer functions call them).
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', clara, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.card_buyer_company_id((SELECT card_id FROM _t));
    RAISE EXCEPTION 'C5/helper: card_buyer_company_id is directly callable by authenticated';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM LIKE 'C5/helper%' THEN RAISE; END IF;
      RAISE EXCEPTION 'C5/helper: refused for the WRONG reason (%)', SQLERRM;
  END;
  BEGIN
    PERFORM public.card_seller_company_id((SELECT card_id FROM _t));
    RAISE EXCEPTION 'C5/helper: card_seller_company_id is directly callable by authenticated';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM LIKE 'C5/helper%' THEN RAISE; END IF;
      RAISE EXCEPTION 'C5/helper: refused for the WRONG reason (%)', SQLERRM;
  END;
END $$;
RESET ROLE;

-- ============================================================================
-- §D — THE CONFUSED-DEPUTY REGRESSION. Before this migration, a buyer with
--      direct write access to deal_promotion could make accept_promotion's
--      buyer-only gate meaningless: forge (or rewrite) the input it trusts,
--      then accept it as themselves. Both variants must now fail at THIS
--      table's own gate, not merely "not blow up" — the EXCEPTION handlers
--      below discriminate `insufficient_privilege` exactly like §C, on
--      purpose: these are the suite's headline cells, and a loose `WHEN
--      others` here would let an unrelated bug masquerade as the fix holding.
-- ============================================================================

-- D1 — self-authored spoofed promotion, then attempt to accept it. The
--      insert must fail before accept_promotion is ever reached.
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', clara, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE n integer;
BEGIN
  BEGIN
    INSERT INTO public.deal_promotion (deal_card_id, base_version, offered_by_company, offered_by_person, line_deltas, state)
    SELECT card_id, version, greenleaf, clara,
           '[{"productName":"D1 forged free product","quantity":1000,"unit":"g","unitPrice":0,"currency":"EUR"}]'::jsonb,
           'pending'
      FROM _t;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN RAISE EXCEPTION 'D1/deputy: the buyer self-authored a spoofed "seller" promotion — confused-deputy path is open'; END IF;
    RAISE EXCEPTION 'D1/deputy: the insert was allowed but matched 0 rows — inconclusive';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM LIKE 'D1/deputy%' THEN RAISE; END IF;
      RAISE EXCEPTION 'D1/deputy: refused for the WRONG reason (%) — proves nothing', SQLERRM;
  END;
END $$;
RESET ROLE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.deal_line_item WHERE product_name = 'D1 forged free product')
    THEN RAISE EXCEPTION 'D1/deputy: a forged line landed on the deal despite the insert refusal'; END IF;
END $$;

-- D2 — the real seller's genuine pending promotion, rewritten by the buyer
--      before accept. The UPDATE must fail; the row's real line_deltas
--      survive unchanged.
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE _d2 ON COMMIT DROP AS
SELECT public.offer_promotion(
  (SELECT card_id FROM _t),
  '[{"productName":"D2 real seller reward","quantity":1,"unit":"g","unitPrice":0,"currency":"EUR"}]'::jsonb
) AS promo_id;
RESET ROLE;

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', clara, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE n integer;
BEGIN
  BEGIN
    UPDATE public.deal_promotion
       SET line_deltas = '[{"productName":"D2 rewritten by buyer","quantity":9999,"unit":"g","unitPrice":0,"currency":"EUR"}]'::jsonb
     WHERE id = (SELECT promo_id FROM _d2);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN RAISE EXCEPTION 'D2/deputy: the buyer rewrote the seller''s real pending promotion before accepting it'; END IF;
    RAISE EXCEPTION 'D2/deputy: the update was allowed but matched 0 rows — inconclusive';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM LIKE 'D2/deputy%' THEN RAISE; END IF;
      RAISE EXCEPTION 'D2/deputy: refused for the WRONG reason (%) — proves nothing', SQLERRM;
  END;
END $$;
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.deal_promotion
                   WHERE id = (SELECT promo_id FROM _d2)
                     AND line_deltas::text LIKE '%D2 real seller reward%')
    THEN RAISE EXCEPTION 'D2/deputy: the promotion''s real line_deltas did not survive the refused update'; END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'deal_promotion write lockdown: ALL CELLS PASSED (A1-A6, B1-B3, C1-C5, D1-D2)'; END $$;

ROLLBACK;
