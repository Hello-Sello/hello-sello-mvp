-- ============================================================================
-- deal_line_item_write_lockdown_test.sql — DEV-159
-- ----------------------------------------------------------------------------
-- Proves: a member of a deal's relationship can no longer rewrite or delete a
-- `deal_line_item` row by a direct PostgREST write, while every legitimate
-- path — the seven SECURITY DEFINER RPCs, the buyer's promotion accept, and
-- all reads — is untouched.
--
-- Run:  bash supabase/tests/run_deal_line_item_write_lockdown_test.sh
--
-- ⚠️  RED-FIRST: every §B cell PASSES the write against the pre-fix grants.
--     That acceptance IS DEV-159's reproduction, and it is a LIVE production
--     hole — verified 2026-08-25, `authenticated` holds DELETE/INSERT/UPDATE.
--
-- ⚠️  WHY A GRANT AND NOT A POLICY. `line_all` is a single FOR ALL policy whose
--     USING and WITH CHECK are both `card_relationship_member(deal_card_id)` —
--     TRUE for BOTH sides of the relationship. It cannot distinguish buyer from
--     seller, so the allocation columns were writable by the counterparty.
--     DEV-159 proposed three fixes; a census killed the need for all three:
--     across the whole of `src/`, client code performs exactly ONE write to this
--     table — the INSERT at `deals/actions.ts:991` — and ZERO updates and ZERO
--     deletes. The seven legitimate writers are all SECURITY DEFINER and bypass
--     grants. So the privilege is simply removed rather than fenced.
--
--     Rejected on purpose: a column-allowlist re-GRANT (breaks silently every
--     time a column is added — DEV-159's own option 1) and a BEFORE UPDATE
--     trigger on the hot deal write path (option 2). Removing an unused
--     privilege is smaller than either and cannot drift.
--
-- ⚠️  §A IS THE REAL WORK. A revoke that is too wide still passes every §B cell.
--
-- ⚠️  §B5 PINS THAT THIS IS ROLE-WIDE, NOT SIDE-SPECIFIC. The seller cannot
--     direct-write either. Anyone "fixing" this later by making the policy
--     seller-only would be reintroducing a client write path.
--
-- Shape: one BEGIN…ROLLBACK, zero net seed mutation (L-033 / HEL-73).
--
-- Fixture (seeded): the Rheinland Apotheke <-> GreenLeaf relationship carries
-- deal lines. Clara Vogt is at Rheinland (the BUYER side); Alice Green is at
-- GreenLeaf (the SELLER side). Both are relationship members, which is exactly
-- what made the hole reachable.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE _t ON COMMIT DROP AS
SELECT dli.id                                            AS line_id,
       dli.deal_card_id                                  AS card_id,
       '09d37c01-4db6-4596-9af3-b7107b053a9c'::uuid      AS clara,     -- Rheinland
       '65acb952-3aed-46bc-b608-f02f73268de8'::uuid      AS rheinland,
       '11111111-1111-1111-1111-111111111111'::uuid      AS alice,     -- GreenLeaf
       dli.sort_order                                    AS sort_order,
       dli.version                                       AS version
  FROM public.deal_line_item dli
  JOIN public.deal_card dc ON dc.id = dli.deal_card_id
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
    THEN RAISE EXCEPTION 'FIXTURE: no deal line on the Rheinland<->GreenLeaf relationship — seed drift'; END IF;
  -- The hole depends on the caller being a relationship MEMBER. If Clara is not
  -- one, every §B cell would refuse for the wrong reason and the suite would be
  -- green while proving nothing.
  IF NOT EXISTS (
    SELECT 1 FROM _t t
     JOIN public.deal_card dc ON dc.id = t.card_id
     JOIN public.relationship r ON r.id = dc.relationship_id
     WHERE t.rheinland IN (r.company_a_id, r.company_b_id))
    THEN RAISE EXCEPTION 'FIXTURE: Rheinland is not on this deal''s relationship — §B would pass vacuously'; END IF;
  IF (SELECT company_id FROM public.person WHERE id = (SELECT clara FROM _t))
       IS DISTINCT FROM (SELECT rheinland FROM _t)
    THEN RAISE EXCEPTION 'FIXTURE: Clara is not at Rheinland — seed drift'; END IF;
END $$;

-- ============================================================================
-- §A — CONTROLS.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '09d37c01-4db6-4596-9af3-b7107b053a9c', true);
SELECT set_config('request.jwt.claims', '{"sub":"09d37c01-4db6-4596-9af3-b7107b053a9c","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

-- A1 — reads are untouched. The counterparty must still SEE the deal lines;
--      this ticket is about integrity, not confidentiality.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.deal_line_item WHERE id = (SELECT line_id FROM _t))
    THEN RAISE EXCEPTION 'A1/read: the revoke took SELECT as well — the counterparty can no longer see the deal'; END IF;
END $$;

-- A2 — the buyer's promotion accept still INSERTs (`deals/actions.ts:991`).
--      This is the ONE client write in the codebase and it must survive.
INSERT INTO public.deal_line_item
  (deal_card_id, version, product_id, product_name, quantity, unit, unit_price, currency, sort_order)
SELECT card_id, version, NULL, 'DEV159 A2 promotion reward', 1, 'g', 0, 'EUR', sort_order + 9001 FROM _t;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.deal_line_item WHERE product_name = 'DEV159 A2 promotion reward')
    THEN RAISE EXCEPTION 'A2/insert: acceptPromotion''s insert was refused — the revoke was too wide'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- §B — THE GATE. Clara is a genuine member of this deal's relationship. That is
--      precisely the privilege DEV-159 abuses. RED against the pre-fix grants:
--      every one of these writes currently SUCCEEDS.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '09d37c01-4db6-4596-9af3-b7107b053a9c', true);
SELECT set_config('request.jwt.claims', '{"sub":"09d37c01-4db6-4596-9af3-b7107b053a9c","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v RECORD; n integer;
BEGIN
 FOR v IN SELECT * FROM _t LOOP
  -- B1 — the exact probe in DEV-159's Proof section
  BEGIN
    UPDATE public.deal_line_item
       SET allocation_status = 'supply', allocation_locked_at = now()
     WHERE id = v.line_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN
      RAISE EXCEPTION 'B1/forge: the BUYER marked a seller line supply and forged allocation_locked_at — DEV-159 is open';
    END IF;
    RAISE EXCEPTION 'B1/forge: the UPDATE was allowed but matched 0 rows — inconclusive, fix the fixture';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;      -- expected: the grant is gone
    WHEN others THEN
      IF SQLERRM LIKE 'B1/forge%' THEN RAISE; END IF;
      RAISE EXCEPTION 'B1/forge: refused, but for the WRONG reason (%) — a cell that passes by accident proves nothing', SQLERRM;
  END;

  -- B2 — rewriting the MONEY, not just the allocation state
  BEGIN
    UPDATE public.deal_line_item SET unit_price = 0.01, quantity = 99999 WHERE id = v.line_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN RAISE EXCEPTION 'B2/forge: the counterparty rewrote unit_price and quantity on a live deal line'; END IF;
    RAISE EXCEPTION 'B2/forge: allowed but matched 0 rows — inconclusive';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM LIKE 'B2/forge%' THEN RAISE; END IF;
      RAISE EXCEPTION 'B2/forge: refused for the WRONG reason (%)', SQLERRM;
  END;

  -- B3 — rewriting the substitution/batch trail
  BEGIN
    UPDATE public.deal_line_item SET batch_number = 'DEV159-FORGED' WHERE id = v.line_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN RAISE EXCEPTION 'B3/forge: the counterparty rewrote the batch trail'; END IF;
    RAISE EXCEPTION 'B3/forge: allowed but matched 0 rows — inconclusive';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM LIKE 'B3/forge%' THEN RAISE; END IF;
      RAISE EXCEPTION 'B3/forge: refused for the WRONG reason (%)', SQLERRM;
  END;

  -- B4 — deleting a line out of the other side's deal
  BEGIN
    DELETE FROM public.deal_line_item WHERE id = v.line_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN RAISE EXCEPTION 'B4/forge: the counterparty DELETED a line from a live deal'; END IF;
    RAISE EXCEPTION 'B4/forge: allowed but matched 0 rows — inconclusive';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM LIKE 'B4/forge%' THEN RAISE; END IF;
      RAISE EXCEPTION 'B4/forge: refused for the WRONG reason (%)', SQLERRM;
  END;
 END LOOP;
END $$;
RESET ROLE;

-- B5 — ⚠️ AND THE SELLER CANNOT EITHER. The remedy is the removal of a
--      role-wide privilege, NOT a side-specific policy. If someone later
--      "improves" this by making `line_all` seller-only, this cell goes red and
--      tells them they have restored a client write path.
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v RECORD; n integer;
BEGIN
 FOR v IN SELECT * FROM _t LOOP
  BEGIN
    UPDATE public.deal_line_item SET allocation_status = 'supply' WHERE id = v.line_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN RAISE EXCEPTION 'B5/scope: the SELLER still has a direct client write path — the fix was made side-specific instead of removing the grant'; END IF;
    RAISE EXCEPTION 'B5/scope: allowed but matched 0 rows — inconclusive';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM LIKE 'B5/scope%' THEN RAISE; END IF;
      RAISE EXCEPTION 'B5/scope: refused for the WRONG reason (%)', SQLERRM;
  END;
 END LOOP;
END $$;
RESET ROLE;

-- ============================================================================
-- §C — THE DEFINER DOOR IS UNHARMED. All seven legitimate writers are SECURITY
--      DEFINER owned by postgres and must still update this table. Proven with
--      a purpose-built definer rather than by calling set_line_allocation,
--      whose own seller-gate would make a pass ambiguous.
-- ============================================================================
CREATE FUNCTION pg_temp.dev159_definer_update(p_line uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n integer;
BEGIN
  UPDATE public.deal_line_item SET allocation_status = 'supply' WHERE id = p_line;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

SELECT set_config('request.jwt.claims', '{"sub":"09d37c01-4db6-4596-9af3-b7107b053a9c","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v RECORD;
BEGIN
  FOR v IN SELECT * FROM _t LOOP
    IF pg_temp.dev159_definer_update(v.line_id) <> 1
      THEN RAISE EXCEPTION 'C1/definer: a SECURITY DEFINER write was blocked — the seven deal RPCs are broken by this change'; END IF;
  END LOOP;
END $$;
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'DEV-159 deal_line_item write lockdown: ALL CELLS PASSED (A1-A2, B1-B5, C1)'; END $$;

ROLLBACK;
