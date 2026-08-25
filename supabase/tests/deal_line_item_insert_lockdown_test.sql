-- ============================================================================
-- deal_line_item_insert_lockdown_test.sql
-- ----------------------------------------------------------------------------
-- Proves: a relationship member can no longer INSERT an arbitrary line into a
-- shared deal by a direct PostgREST write, while the one legitimate INSERT path
-- — the buyer accepting the seller's pending promotion — still works, still
-- writes exactly the reward lines, and is atomic (a malformed delta leaves
-- neither an orphan line nor a half-flipped promotion).
--
-- Run:  bash supabase/tests/run_deal_line_item_insert_lockdown_test.sh
--
-- ⚠️  REPRODUCED BEFORE THIS SUITE EXISTED (a rolled-back probe, live): as
--     Clara (Rheinland, a relationship member, buyer side), a direct insert
--     onto a GreenLeaf card succeeded against the pre-fix grants. §B below is
--     that same probe, now pinned as a regression.
--
-- ⚠️  §B ASSERTS FROM `authenticated`, NOT THROUGH A DEFINER — a definer caller
--     bypasses RLS/grants entirely and would pass this suite even if the
--     REVOKE were missing, proving nothing.
--
-- ⚠️  THE FIX IS A DEFINER RPC, NOT A NARROWER POLICY. `line_all`'s WITH CHECK
--     stayed `card_relationship_member` (TRUE for both sides) because a policy
--     cannot see "is this row the buyer's promotion reward" — that fact lives in
--     `deal_promotion`, a different table. `accept_promotion(p_deal_card_id)`
--     re-derives the caller's company + the card's buyer (`card_buyer_company_id`,
--     the card-level analogue of the existing `line_seller_company_id`), reads
--     the pending promotion, writes its lines, and flips its state — one
--     function call, so a bad delta rolls back the whole thing (§A2).
--
-- ⚠️  THIS SUITE ALONE DOES NOT PROVE THE DOOR IS SHUT. `accept_promotion`
--     trusts `deal_promotion` as its authorization input; whether a caller can
--     forge that input is `deal_promotion`'s own lockdown, covered by
--     `deal_promotion_write_lockdown_test.sql`. Read the two together.
--
-- Shape: one BEGIN…ROLLBACK, zero net seed mutation (L-033).
--
-- Fixture (seeded): Rheinland Apotheke <-> GreenLeaf Cultivation. Clara Vogt is
-- at Rheinland (buyer side on this relationship's live cards); Alice Green is
-- at GreenLeaf (seller side). Both are relationship members.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Clara and Rheinland are looked up dynamically (seed.sql's "5a"/"5b" block
-- creates them with gen_random_uuid()); Alice/GreenLeaf use the fixed seed UUID.
CREATE TEMP TABLE _t ON COMMIT DROP AS
SELECT dc.id                                                            AS card_id,
       dc.version                                                       AS version,
       (SELECT id FROM auth.users WHERE email = 'clara@rheinland.test') AS clara,
       (SELECT id FROM public.company WHERE name = 'Rheinland Apotheke GmbH') AS rheinland,
       '11111111-1111-1111-1111-111111111111'::uuid                    AS alice,
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid                     AS greenleaf,
       COALESCE((SELECT max(sort_order) FROM public.deal_line_item
                  WHERE deal_card_id = dc.id AND version = dc.version), -1) AS max_sort
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
  -- §A/§C depend on Rheinland being the BUYER on this exact card, not merely a
  -- member. If seed data ever puts GreenLeaf on the buyer side of the picked
  -- card, A1/C1/C2 would pass or fail for the wrong reason.
  IF public.card_buyer_company_id((SELECT card_id FROM _t)) IS DISTINCT FROM (SELECT rheinland FROM _t) THEN
    RAISE EXCEPTION 'FIXTURE: Rheinland is not the buyer on the picked card — seed drift or wrong card';
  END IF;
END $$;

-- ============================================================================
-- §A — THE LEGITIMATE PATH, THROUGH THE RPC.
-- ============================================================================

-- A1 — buyer accepts a real pending promotion: lines land, sort_order continues
--      past the existing lines, and THIS promotion (pinned by id, via a temp
--      table rather than a psql \gset — \gset variables do not interpolate
--      inside a DO $$ $$ block) flips to accepted.
CREATE TEMP TABLE _a1 ON COMMIT DROP AS
WITH ins AS (
  INSERT INTO public.deal_promotion
    (deal_card_id, base_version, offered_by_company, offered_by_person, line_deltas, state)
  SELECT card_id, version, greenleaf, alice,
         '[{"productName":"A1 promo reward","quantity":2,"unit":"g","unitPrice":0,"currency":"EUR"}]'::jsonb,
         'pending'
    FROM _t
  RETURNING id
)
SELECT id AS a1_promo_id FROM ins;
GRANT SELECT ON _a1 TO authenticated;

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', clara, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
SELECT public.accept_promotion((SELECT card_id FROM _t));
RESET ROLE;

DO $$
DECLARE v record;
BEGIN
  SELECT sort_order INTO v FROM public.deal_line_item WHERE product_name = 'A1 promo reward';
  IF NOT FOUND THEN RAISE EXCEPTION 'A1/accept: the buyer''s legitimate accept was refused'; END IF;
  IF v.sort_order <= (SELECT max_sort FROM _t) THEN
    RAISE EXCEPTION 'A1/accept: the reward line did not continue past the existing sort_order';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.deal_promotion
     WHERE id = (SELECT a1_promo_id FROM _a1) AND state = 'accepted' AND resolved_at IS NOT NULL)
    THEN RAISE EXCEPTION 'A1/accept: the promotion did not flip to accepted'; END IF;
END $$;

-- A2 — atomicity. A second promotion carries one good delta and one delta with
--      a product_id that does not exist (FK violation mid-loop). The whole
--      call must roll back: zero orphan lines, the promotion stays pending.
INSERT INTO public.deal_promotion
  (deal_card_id, base_version, offered_by_company, offered_by_person, line_deltas, state)
SELECT card_id, version, greenleaf, alice,
       '[{"productName":"A2 good line","quantity":1,"unit":"g","unitPrice":0,"currency":"EUR"},
         {"productId":"99999999-9999-9999-9999-999999999999","productName":"A2 bad line","quantity":1,"unit":"g","unitPrice":0,"currency":"EUR"}]'::jsonb,
       'pending'
  FROM _t;

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', clara, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.accept_promotion((SELECT card_id FROM _t));
    RAISE EXCEPTION 'A2/atomic: a promotion with a malformed delta was accepted whole';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;   -- expected: the bad product_id aborted the whole call
    WHEN others THEN
      IF SQLERRM LIKE 'A2/atomic%' THEN RAISE; END IF;
      RAISE EXCEPTION 'A2/atomic: aborted for the WRONG reason (%) — proves nothing about atomicity', SQLERRM;
  END;
END $$;
RESET ROLE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.deal_line_item WHERE product_name LIKE 'A2 %')
    THEN RAISE EXCEPTION 'A2/atomic: a partial line survived the rolled-back accept — orphan row'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.deal_promotion
     WHERE deal_card_id = (SELECT card_id FROM _t) AND offered_by_company = (SELECT greenleaf FROM _t)
       AND line_deltas::text LIKE '%A2 %' AND state <> 'pending')
    THEN RAISE EXCEPTION 'A2/atomic: the promotion flipped despite the failed accept'; END IF;
END $$;

-- ============================================================================
-- §B — THE GATE. A genuine relationship member can no longer INSERT directly.
--      Asserted from `authenticated`, not a definer — a definer bypasses
--      grants entirely and would pass this even if the REVOKE were missing.
-- ============================================================================

-- B1 — the buyer side (Clara/Rheinland).
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', clara, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE n integer;
BEGIN
  BEGIN
    INSERT INTO public.deal_line_item
      (deal_card_id, version, product_id, product_name, quantity, unit, unit_price, currency, sort_order)
    SELECT card_id, version, NULL, 'B1 forged rebate', 1, 'g', 0, 'EUR', max_sort + 500 FROM _t;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN RAISE EXCEPTION 'B1/forge: the BUYER inserted an arbitrary line directly — the lockdown is not holding'; END IF;
    RAISE EXCEPTION 'B1/forge: the insert was allowed but matched 0 rows — inconclusive';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;   -- expected: the grant is gone
    WHEN others THEN
      IF SQLERRM LIKE 'B1/forge%' THEN RAISE; END IF;
      RAISE EXCEPTION 'B1/forge: refused for the WRONG reason (%) — proves nothing', SQLERRM;
  END;
END $$;
RESET ROLE;

-- B2 — ⚠️ AND THE SELLER SIDE CANNOT EITHER — role-wide, not side-specific
--      (same discipline as the sibling UPDATE/DELETE lockdown suite's B5). If
--      someone later scopes the fix to "block the buyer only", this cell goes red.
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE n integer;
BEGIN
  BEGIN
    INSERT INTO public.deal_line_item
      (deal_card_id, version, product_id, product_name, quantity, unit, unit_price, currency, sort_order)
    SELECT card_id, version, NULL, 'B2 forged rebate', 1, 'g', 0, 'EUR', max_sort + 501 FROM _t;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN RAISE EXCEPTION 'B2/scope: the SELLER still has a direct client insert path'; END IF;
    RAISE EXCEPTION 'B2/scope: allowed but matched 0 rows — inconclusive';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM LIKE 'B2/scope%' THEN RAISE; END IF;
      RAISE EXCEPTION 'B2/scope: refused for the WRONG reason (%)', SQLERRM;
  END;
END $$;
RESET ROLE;

-- ============================================================================
-- §C — THE RPC ITSELF GATES ON BUYER, NOT MEMBERSHIP. A member on the wrong
--      side, and a total stranger, must both be refused by accept_promotion —
--      not just by the (now-absent) table grant.
-- ============================================================================

-- C1 — the seller (Alice/GreenLeaf) tries to accept its own promotion.
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.accept_promotion((SELECT card_id FROM _t));
    RAISE EXCEPTION 'C1/side: the SELLER was allowed to accept its own promotion';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE 'C1/side%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%Only the buyer%' THEN
        RAISE EXCEPTION 'C1/side: refused for the WRONG reason (%)', SQLERRM;
      END IF;
  END;
END $$;
RESET ROLE;

-- C2 — a stranger (Bob, a companyless/unrelated person) is refused the same way.
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.accept_promotion((SELECT card_id FROM _t));
    RAISE EXCEPTION 'C2/stranger: a non-member was allowed to accept a promotion on this deal';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE 'C2/stranger%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%Only the buyer%' THEN
        RAISE EXCEPTION 'C2/stranger: refused for the WRONG reason (%)', SQLERRM;
      END IF;
  END;
END $$;
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'deal_line_item insert lockdown: ALL CELLS PASSED (A1-A2, B1-B2, C1-C2)'; END $$;

ROLLBACK;
