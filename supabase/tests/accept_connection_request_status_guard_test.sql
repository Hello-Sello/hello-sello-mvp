-- ============================================================================
-- accept_connection_request_status_guard_test.sql
-- ----------------------------------------------------------------------------
-- Proves HEL-82's `security`-reviewer-found fix: once a relationship is
-- suspended or ended, accepting a fresh connection/pricing request onto that
-- SAME pair is refused, not silently adopted. Before this fix,
-- accept_connection_request's "ENSURE, not insert" branch found the existing
-- non-active row and returned success with status untouched — a permanent
-- Connect-loop (discovery says "not connected" because it requires
-- status='active'; accepting "worked"; nothing ever un-hides the Connect
-- button) with a live side effect (a fresh chat thread) each time through it.
--
-- Run:  bash supabase/tests/run_accept_connection_request_status_guard_test.sh
--
-- Fixture: Rheinland Apotheke <-> GreenLeaf Cultivation (Clara @ Rheinland,
-- Alice @ GreenLeaf — both already-established fixtures). Same pair
-- relationship_admin_suspend_end_test.sql uses; sequential BEGIN…ROLLBACK
-- suites don't collide.
--
-- Shape: one BEGIN…ROLLBACK, zero net seed mutation (L-033).
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE _t ON COMMIT DROP AS
SELECT r.id                                            AS rel_id,
       (SELECT id FROM auth.users WHERE email = 'clara@rheinland.test') AS clara,
       (SELECT company_id FROM public.person
         WHERE id = (SELECT id FROM auth.users WHERE email = 'clara@rheinland.test')) AS rheinland,
       '11111111-1111-1111-1111-111111111111'::uuid    AS alice,
       (SELECT company_id FROM public.person WHERE id = '11111111-1111-1111-1111-111111111111') AS greenleaf,
       '99999999-9999-9999-9999-999999999999'::uuid    AS hsteam
  FROM public.relationship r
  JOIN public.company ca ON ca.id = r.company_a_id
  JOIN public.company cb ON cb.id = r.company_b_id
 WHERE (ca.name LIKE 'Rheinland%' AND cb.name LIKE 'GreenLeaf%')
    OR (ca.name LIKE 'GreenLeaf%' AND cb.name LIKE 'Rheinland%')
 LIMIT 1;
GRANT SELECT ON _t TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _t) THEN
    RAISE EXCEPTION 'FIXTURE: no Rheinland<->GreenLeaf relationship — seed drift';
  END IF;
  IF (SELECT status FROM public.relationship WHERE id = (SELECT rel_id FROM _t)) <> 'active' THEN
    RAISE EXCEPTION 'FIXTURE: relationship is not active at suite start — a prior suite left it dirty';
  END IF;
END $$;

-- HS team suspends the pair first.
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', hsteam, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
SELECT public.suspend_relationship((SELECT rel_id FROM _t), 'suite setup: licence lapsed');
RESET ROLE;

-- ============================================================================
-- §A — a fresh request onto the now-suspended pair is refused on accept.
-- ============================================================================

-- Clara (Rheinland) sends GreenLeaf a pricing ask — the RLS-legitimate path
-- (inbox_insert requires sender_company_id = current_company_id() AND
-- sender_person_id = auth.uid()), same as an ordinary caller would.
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', clara, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE _item ON COMMIT DROP AS
WITH ins AS (
  INSERT INTO public.pending_inbox_item (type, sender_person_id, sender_company_id, receiver_company_id, note)
  SELECT 'pricelist_request', clara, rheinland, greenleaf, 'A2/suite: pricing ask on a suspended pair'
  FROM _t
  RETURNING id
)
SELECT id FROM ins;
GRANT SELECT ON _item TO authenticated;
RESET ROLE;

-- Alice (GreenLeaf) tries to accept it. Refused — the relationship is suspended.
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', alice, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.accept_connection_request((SELECT id FROM _item));
    RAISE EXCEPTION 'A/suspended: accept_connection_request adopted a suspended relationship';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE 'A/suspended%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%relationship % is suspended%' THEN
        RAISE EXCEPTION 'A/suspended: refused for the WRONG reason (%)', SQLERRM;
      END IF;
  END;
END $$;
RESET ROLE;

-- The refusal left no side effect: still exactly one relationship row for
-- this pair, still suspended, no new chat thread minted.
DO $$
DECLARE v_rel_count int; v_status text;
BEGIN
  SELECT count(*) INTO v_rel_count FROM public.relationship
   WHERE (company_a_id, company_b_id) = ((SELECT LEAST(rheinland, greenleaf) FROM _t), (SELECT GREATEST(rheinland, greenleaf) FROM _t))
     AND deleted_at IS NULL;
  IF v_rel_count <> 1 THEN
    RAISE EXCEPTION 'A/no-mint: expected exactly 1 relationship row for the pair, got %', v_rel_count;
  END IF;
  SELECT status INTO v_status FROM public.relationship WHERE id = (SELECT rel_id FROM _t);
  IF v_status <> 'suspended' THEN
    RAISE EXCEPTION 'A/untouched: relationship status is % after the refused accept, expected still suspended', v_status;
  END IF;
END $$;

-- ============================================================================
-- §B — HS team reactivates; the SAME request now accepts normally, adopting
--      the SAME relationship row (not minting a second one).
-- ============================================================================

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', hsteam, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
SELECT public.reactivate_relationship((SELECT rel_id FROM _t));
RESET ROLE;

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', alice, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE _accepted ON COMMIT DROP AS
SELECT public.accept_connection_request((SELECT id FROM _item)) AS rel_id;
RESET ROLE;

DO $$
BEGIN
  IF (SELECT rel_id FROM _accepted) <> (SELECT rel_id FROM _t) THEN
    RAISE EXCEPTION 'B/reactivated: accept minted a DIFFERENT relationship row instead of adopting the existing one';
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'accept_connection_request status guard: ALL CELLS PASSED (A, B)'; END $$;

ROLLBACK;
