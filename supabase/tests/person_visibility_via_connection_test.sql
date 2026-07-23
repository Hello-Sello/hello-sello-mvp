-- ============================================================================
-- person_visibility_via_connection_test.sql — see a person you're connected to (PG-2/3)
-- ----------------------------------------------------------------------------
-- The primary blocker for the social graph: person_select only allowed self /
-- own company / HS team / a COMPANY-linked person. So a person you're personally
-- (but not company-) connected to read as invisible. PG-2 adds is_person_connected,
-- PG-3 adds it as a person_select branch. Proven here:
--   • PV-01 — is_person_connected(other) is TRUE for a connected pair (either dir).
--   • PV-02 — is_person_connected(stranger) is FALSE.
--   • PV-03 — person_select: P can now SELECT connected person T's row — with P and
--             T at DIFFERENT, non-connected companies, so the ONLY reason is the
--             new person branch.
--   • PV-04 — person_select: P still cannot see an unrelated stranger R.
--   • PV-05 — regression: the existing branches still hold (P sees themselves).
--
-- Run:  bash supabase/tests/run_person_visibility_via_connection_test.sh
--
-- ⚠️  RED-FIRST (PG-2/3): EXPECTED to FAIL pre-PG-2 — is_person_connected does not
-- exist, so PV-01 errors "function does not exist". Goes GREEN when PG-2 (helper)
-- + PG-3 (person_select rebuilt from live, adding only the person branch) land.
--
-- Fixtures (privileged; rolled back). Test UUID space ba/bb/bc…, unused by seeds.
--   Company X = ba0…  Company Y = bb0…  Company Z = bc0…  (all distinct, NOT connected)
--   Person P (@X) = ba1…  Person T (@Y) = ba2…  Person R (@Z) = ba3…
--   Active person_connection: P ↔ T (ba1 < ba2 → person_a = P, person_b = T)
-- ============================================================================

BEGIN;

INSERT INTO auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'ba111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'pv-p@example.test', '{"display_name":"Person P"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'ba222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'pv-t@example.test', '{"display_name":"Person T"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'ba333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'pv-r@example.test', '{"display_name":"Person R"}', now(), now());

INSERT INTO public.company (id, name, country, verification_status, verified_at, created_by) VALUES
  ('ba000000-0000-0000-0000-000000000000', 'PV Co X', 'DE', 'verified', now(), 'ba111111-1111-1111-1111-111111111111'),
  ('bb000000-0000-0000-0000-000000000000', 'PV Co Y', 'DE', 'verified', now(), 'ba222222-2222-2222-2222-222222222222'),
  ('bc000000-0000-0000-0000-000000000000', 'PV Co Z', 'DE', 'verified', now(), 'ba333333-3333-3333-3333-333333333333');

UPDATE public.person SET company_id = 'ba000000-0000-0000-0000-000000000000' WHERE id = 'ba111111-1111-1111-1111-111111111111';
UPDATE public.person SET company_id = 'bb000000-0000-0000-0000-000000000000' WHERE id = 'ba222222-2222-2222-2222-222222222222';
UPDATE public.person SET company_id = 'bc000000-0000-0000-0000-000000000000' WHERE id = 'ba333333-3333-3333-3333-333333333333';

INSERT INTO public.person_connection (person_a_id, person_b_id, initiated_by_person_id)
VALUES ('ba111111-1111-1111-1111-111111111111', 'ba222222-2222-2222-2222-222222222222',
        'ba111111-1111-1111-1111-111111111111');

-- Impersonate P for all assertions.
SELECT set_config('request.jwt.claims', '{"sub":"ba111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_b boolean; v_n integer;
BEGIN
  -- PV-01: connected → true
  SELECT public.is_person_connected('ba222222-2222-2222-2222-222222222222') INTO v_b;
  IF v_b IS NOT TRUE THEN RAISE EXCEPTION 'PV-01 FAIL: is_person_connected(T) = %, expected true', v_b; END IF;

  -- PV-02: stranger → false
  SELECT public.is_person_connected('ba333333-3333-3333-3333-333333333333') INTO v_b;
  IF v_b IS NOT FALSE THEN RAISE EXCEPTION 'PV-02 FAIL: is_person_connected(R) = %, expected false', v_b; END IF;

  -- PV-03: P can SEE connected T (different, non-connected company → only the person branch allows it)
  SELECT count(*) INTO v_n FROM public.person WHERE id = 'ba222222-2222-2222-2222-222222222222';
  IF v_n <> 1 THEN RAISE EXCEPTION 'PV-03 FAIL: P sees % of connected person T, expected 1 (person branch missing)', v_n; END IF;

  -- PV-04: P cannot see stranger R
  SELECT count(*) INTO v_n FROM public.person WHERE id = 'ba333333-3333-3333-3333-333333333333';
  IF v_n <> 0 THEN RAISE EXCEPTION 'PV-04 LEAK: P sees % of stranger R, expected 0', v_n; END IF;

  -- PV-05: regression — P still sees self
  SELECT count(*) INTO v_n FROM public.person WHERE id = 'ba111111-1111-1111-1111-111111111111';
  IF v_n <> 1 THEN RAISE EXCEPTION 'PV-05 FAIL: P cannot see self (existing branch regressed)'; END IF;
END $$;
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'person_visibility_via_connection_test: ALL PASSED (PV-01..05)'; END $$;

ROLLBACK;
