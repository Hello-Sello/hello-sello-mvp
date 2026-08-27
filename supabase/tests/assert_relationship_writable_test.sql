-- ============================================================================
-- assert_relationship_writable_test.sql — HEL-84 / 0026-relationship-write-gate
-- ----------------------------------------------------------------------------
-- Unit-level proof of the shared function ITSELF (PLAN-HEL-84.md §1,
-- ADR 0008), independent of any RLS policy or RPC that calls it — those
-- integration-level cells live in msg_all_deal_detected_gate_test.sql,
-- inbox_insert_receiver_gate_test.sql, and deliver_deal_test.sql (all
-- extended by this same ticket).
--
-- ⚠️  RED-FIRST: public.assert_relationship_writable does not exist on this
-- branch yet — every cell below fails to even resolve the function until
-- <ts>_assert_relationship_writable.sql lands. That failure to resolve IS
-- the reproduction.
--
-- Run:  bash supabase/tests/run_assert_relationship_writable_test.sh
--
-- Fixture: Alice @ GreenLeaf Cultivation <-> Bob @ StonePharm — the SAME pair
-- send_deal_relationship_liveness_test.sql uses; sequential BEGIN…ROLLBACK
-- suites don't collide. Clara @ Rheinland Apotheke (clara@rheinland.test) is
-- a genuine THIRD-company caller — a party to a DIFFERENT relationship
-- (GreenLeaf<->Rheinland), never to this one. HS reviewer fixed at
-- 9999...9999.
--
-- Shape: one BEGIN…ROLLBACK, zero net seed mutation (L-033) — including the
-- one ephemeral company-less auth.users/person row §E mints, which is rolled
-- back with everything else. Minted with gen_random_uuid(), not a fixed
-- literal — nothing in this repo's UUID-prefix namespace to collide with.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE _fix ON COMMIT DROP AS
SELECT
  a.id                                             AS alice,
  (SELECT company_id FROM public.person WHERE id = a.id) AS greenleaf,
  b.id                                              AS bob,
  (SELECT id FROM auth.users WHERE email = 'clara@rheinland.test') AS clara,
  '99999999-9999-9999-9999-999999999999'::uuid     AS hsteam
FROM auth.users a, auth.users b
WHERE a.email = 'alice@greenleaf.test' AND b.email = 'bob@stonepharm.test';

CREATE TEMP TABLE _rel ON COMMIT DROP AS
SELECT r.id AS rel_id
FROM public.relationship r, _fix f, public.company cb
WHERE (r.company_a_id = f.greenleaf OR r.company_b_id = f.greenleaf)
  AND cb.id = CASE WHEN r.company_a_id = f.greenleaf THEN r.company_b_id ELSE r.company_a_id END
  AND cb.name LIKE 'StonePharm%'
LIMIT 1;

GRANT SELECT ON _fix, _rel TO authenticated;

DO $$
BEGIN
  IF (SELECT count(*) FROM _fix) <> 1 OR (SELECT count(*) FROM _rel) <> 1 THEN
    RAISE EXCEPTION 'FIXTURE: Alice/GreenLeaf<->StonePharm relationship not found — seed drift';
  END IF;
  IF (SELECT clara FROM _fix) IS NULL THEN
    RAISE EXCEPTION 'FIXTURE: Clara (clara@rheinland.test) not found — seed drift';
  END IF;
  IF (SELECT status FROM public.relationship WHERE id = (SELECT rel_id FROM _rel)) <> 'active' THEN
    RAISE EXCEPTION 'FIXTURE: relationship is not active at suite start — a prior suite left it dirty';
  END IF;
END $$;

-- A company-less person: a real, reachable v0 state (person.company_id is
-- nullable by this repo's own design, true of every user between signup and
-- company onboarding). handle_new_user() (20260607160000) auto-creates the
-- matching public.person row with company_id left NULL — this fixture never
-- touches it.
CREATE TEMP TABLE _companyless ON COMMIT DROP AS
WITH ins AS (
  INSERT INTO auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
          'hel84-companyless@example.test',
          '{"first_name":"NoCompany","last_name":"Yet","full_name":"NoCompany Yet"}', NOW(), NOW())
  RETURNING id
)
SELECT id FROM ins;
GRANT SELECT ON _companyless TO authenticated;

DO $$
BEGIN
  IF (SELECT company_id FROM public.person WHERE id = (SELECT id FROM _companyless)) IS NOT NULL THEN
    RAISE EXCEPTION 'FIXTURE: the freshly-minted company-less person unexpectedly already has a company_id — handle_new_user() no longer leaves it NULL';
  END IF;
END $$;

-- Message-identity capture for §F below (Invariant 9: the SAME text for
-- "doesn't exist" and "not yours" — a probe can't tell them apart). §C/§D/§E
-- write to this from inside SET LOCAL ROLE authenticated, so INSERT (not
-- just SELECT) must be granted, matching deliver_deal_test.sql's own
-- _cards/_sent precedent for a temp table written by an impersonated block.
CREATE TEMP TABLE _msgs (cell text, msg text) ON COMMIT DROP;
GRANT SELECT, INSERT ON _msgs TO authenticated;

-- ============================================================================
-- §A — NULL passthrough (Invariant 8): no relationship to gate, always true.
--      Nothing suspendable about a first-contact pending_inbox_item, a
--      company-less p2p thread, or a group thread.
-- ============================================================================
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', alice, 'role', 'authenticated')::text FROM _fix), true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_result boolean;
BEGIN
  SELECT public.assert_relationship_writable(NULL) INTO v_result;
  IF v_result IS NOT TRUE THEN
    RAISE EXCEPTION 'A1/null: expected true for a NULL relationship id, got %', v_result;
  END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- §B — active relationship, calling party (Alice) → true.
-- ============================================================================
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', alice, 'role', 'authenticated')::text FROM _fix), true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_result boolean;
BEGIN
  SELECT public.assert_relationship_writable((SELECT rel_id FROM _rel)) INTO v_result;
  IF v_result IS NOT TRUE THEN
    RAISE EXCEPTION 'B1/active-party: expected true for an active relationship + a real party, got %', v_result;
  END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- §C — nonexistent id → raises 'relationship not found'.
-- ============================================================================
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', alice, 'role', 'authenticated')::text FROM _fix), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.assert_relationship_writable('00000000-0000-0000-0000-00000000dead'::uuid);
    RAISE EXCEPTION 'C1/nonexistent: assert_relationship_writable did not raise for a nonexistent id';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'C1/nonexistent%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%relationship not found%' THEN
      RAISE EXCEPTION 'C1/nonexistent: refused for the WRONG reason (%)', SQLERRM;
    END IF;
    INSERT INTO _msgs VALUES ('nonexistent', SQLERRM);
  END;
END $$;
RESET ROLE;

-- ============================================================================
-- §D — active relationship, authenticated caller who is NOT a party (Clara,
--      genuinely at a THIRD company) → the SAME 'relationship not found' text
--      as §C — closes a real probe: without this, ANY authenticated user
--      could call this function directly with an arbitrary id and read the
--      relationship's status back out of a distinguishable raise.
-- ============================================================================
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', clara, 'role', 'authenticated')::text FROM _fix), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.assert_relationship_writable((SELECT rel_id FROM _rel));
    RAISE EXCEPTION 'D1/non-party: a non-party (Clara) probed an active relationship she is not part of and it returned true';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'D1/non-party%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%relationship not found%' THEN
      RAISE EXCEPTION 'D1/non-party: refused for the WRONG reason (%) — a probe could distinguish "not yours" from "doesn''t exist"', SQLERRM;
    END IF;
    INSERT INTO _msgs VALUES ('non-party', SQLERRM);
  END;
END $$;
RESET ROLE;

-- ============================================================================
-- §E — active relationship, authenticated caller with person.company_id IS
--      NULL (company-less — a real, reachable v0 state) → the SAME
--      'relationship not found' text, not a silent pass. This is the EXACT
--      population round 3's B1 fix (discriminating on auth.uid(), not
--      current_company_id()) exists to close: current_company_id() is ALSO
--      NULL for this caller, so a discriminator using
--      "current_company_id() IS NULL" (the earlier, wrong draft) would let
--      this caller straight through the membership check unconditionally —
--      a THIRD-company cell alone (§D) would stay green even if that fix
--      were reverted, because current_company_id() is non-NULL for a real
--      third-company member. This cell is the one that actually re-proves it.
-- ============================================================================
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', id, 'role', 'authenticated')::text FROM _companyless), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.assert_relationship_writable((SELECT rel_id FROM _rel));
    RAISE EXCEPTION 'E1/companyless: a company-less signed-in caller probed an active relationship and it returned true — the fail-open B1 fixed is back';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'E1/companyless%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%relationship not found%' THEN
      RAISE EXCEPTION 'E1/companyless: refused for the WRONG reason (%)', SQLERRM;
    END IF;
    INSERT INTO _msgs VALUES ('companyless', SQLERRM);
  END;
END $$;
RESET ROLE;

-- ============================================================================
-- §F — §C/§D/§E must all raise the IDENTICAL text, not just three raises
--      that happen to look similar (Invariant 9 — "assert the message
--      strings are identical, not just that both raise").
-- ============================================================================
DO $$
DECLARE v_nx text; v_np text; v_cl text;
BEGIN
  SELECT msg INTO v_nx FROM _msgs WHERE cell = 'nonexistent';
  SELECT msg INTO v_np FROM _msgs WHERE cell = 'non-party';
  SELECT msg INTO v_cl FROM _msgs WHERE cell = 'companyless';
  IF v_nx IS DISTINCT FROM v_np THEN
    RAISE EXCEPTION 'F1/identity FAIL: nonexistent-id message (%) differs from non-party message (%) — a probe could tell them apart', v_nx, v_np;
  END IF;
  IF v_nx IS DISTINCT FROM v_cl THEN
    RAISE EXCEPTION 'F2/identity FAIL: nonexistent-id message (%) differs from company-less message (%) — a probe could tell them apart', v_nx, v_cl;
  END IF;
END $$;

-- ============================================================================
-- §G — service_role, no `sub` claim → returns true, no raise (Invariant 10).
--      Claims explicitly cleared first (round 2, N6): deliver_deal_test.sql's
--      own fixture (:160) proves a bare role switch alone leaves a PRIOR
--      transaction-local set_config claim in place — without clearing both
--      request.jwt.claims and request.jwt.claim.sub, this cell would exercise
--      the membership branch with Clara's/the company-less caller's leftover
--      sub from §D/§E above, not the service_role-with-no-context path
--      Invariant 10 is actually about.
-- ============================================================================
SELECT set_config('request.jwt.claims', '', true);
SELECT set_config('request.jwt.claim.sub', '', true);
SET LOCAL ROLE service_role;
DO $$
DECLARE v_result boolean;
BEGIN
  SELECT public.assert_relationship_writable((SELECT rel_id FROM _rel)) INTO v_result;
  IF v_result IS NOT TRUE THEN
    RAISE EXCEPTION 'G1/service-role: expected true for service_role with no JWT context, got %', v_result;
  END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- §H — SUSPENDED relationship, calling party (Alice) → raises 'relationship
--      is suspended — no new writes'. Flip runs privileged (RESET ROLE —
--      authenticated lacks UPDATE on relationship, 20260823090000:89).
-- ============================================================================
RESET ROLE;
UPDATE public.relationship SET status = 'suspended' WHERE id = (SELECT rel_id FROM _rel);
DO $$
BEGIN
  IF (SELECT status FROM public.relationship WHERE id = (SELECT rel_id FROM _rel)) <> 'suspended' THEN
    RAISE EXCEPTION 'H1/flip FAIL: relationship status is % after the UPDATE, expected suspended',
      (SELECT status FROM public.relationship WHERE id = (SELECT rel_id FROM _rel));
  END IF;
END $$;

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', alice, 'role', 'authenticated')::text FROM _fix), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.assert_relationship_writable((SELECT rel_id FROM _rel));
    RAISE EXCEPTION 'H2/suspended: assert_relationship_writable returned true for a SUSPENDED relationship';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'H2/suspended%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%relationship is suspended%' THEN
      RAISE EXCEPTION 'H2/suspended: refused for the WRONG reason (%)', SQLERRM;
    END IF;
  END;
END $$;
RESET ROLE;

-- ============================================================================
-- §I — ENDED relationship, calling party (Alice) → raises 'relationship is
--      ended — no new writes'. Proves the check is "status <> active", not a
--      hardcoded comparison against 'suspended' alone.
-- ============================================================================
RESET ROLE;
UPDATE public.relationship SET status = 'ended' WHERE id = (SELECT rel_id FROM _rel);
DO $$
BEGIN
  IF (SELECT status FROM public.relationship WHERE id = (SELECT rel_id FROM _rel)) <> 'ended' THEN
    RAISE EXCEPTION 'I1/flip FAIL: relationship status is % after the UPDATE, expected ended',
      (SELECT status FROM public.relationship WHERE id = (SELECT rel_id FROM _rel));
  END IF;
END $$;

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', alice, 'role', 'authenticated')::text FROM _fix), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.assert_relationship_writable((SELECT rel_id FROM _rel));
    RAISE EXCEPTION 'I2/ended: assert_relationship_writable returned true for an ENDED relationship';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'I2/ended%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%relationship is ended%' THEN
      RAISE EXCEPTION 'I2/ended: refused for the WRONG reason (%)', SQLERRM;
    END IF;
  END;
END $$;
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'assert_relationship_writable: ALL CELLS PASSED (A null, B active-party, C nonexistent, D non-party, E companyless, F identity, G service_role, H suspended, I ended)'; END $$;

ROLLBACK;
