-- ============================================================================
-- list_my_person_connections_test.sql — "my network: people" RPC (PG-10)
-- ----------------------------------------------------------------------------
-- Returns the people you have an active person_connection with, plus their
-- company info — as a SECURITY DEFINER RPC (safe fields only), because a person
-- you're personally connected to is usually NOT at a company you're company-
-- connected to, so company_select RLS would hide their company name/logo in a
-- plain join. Mirrors list_discoverable_people.
--   • MPC-01 — returns your connected person (exactly the other side of the edge).
--   • MPC-02 — that row carries the person's company info (name resolved).
--   • MPC-03 — excludes non-connections (a stranger) and self.
--   • MPC-04 — output exposes NO email / phone column.
--   • MPC-05 — a soft-deleted edge drops the person from the list.
--   • MPC-06 — an unverified caller gets zero rows (is_caller_verified gate).
--
-- Run:  bash supabase/tests/run_list_my_person_connections_test.sh
--
-- ⚠️  RED-FIRST (PG-10): the function does not exist → MPC-01 errors. GREEN when
-- the RPC lands.
--
-- Fixtures (privileged; rolled back). UUID space ca/cb/cc… (valid hex).
--   Company X = ca0…(verified)  Y = cb0…(verified)  Z = cc0…(UNVERIFIED, for MPC-06)
--   Person P (@X) = ca1…  Person T (@Y) = ca2…  Person R (@Z) = ca3…
--   Active edge: P ↔ T.
-- ============================================================================

BEGIN;

INSERT INTO auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'ca111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'mpc-p@example.test', '{"display_name":"Person P"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'ca222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'mpc-t@example.test', '{"display_name":"Person T"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'ca333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'mpc-r@example.test', '{"display_name":"Person R"}', now(), now());

INSERT INTO public.company (id, name, country, verification_status, verified_at, created_by) VALUES
  ('ca000000-0000-0000-0000-000000000000', 'MPC Co X', 'DE', 'verified', now(), 'ca111111-1111-1111-1111-111111111111'),
  ('cb000000-0000-0000-0000-000000000000', 'MPC Co Y', 'DE', 'verified', now(), 'ca222222-2222-2222-2222-222222222222'),
  ('cc000000-0000-0000-0000-000000000000', 'MPC Co Z', 'DE', 'pending', NULL, 'ca333333-3333-3333-3333-333333333333');

UPDATE public.person SET company_id = 'ca000000-0000-0000-0000-000000000000' WHERE id = 'ca111111-1111-1111-1111-111111111111';
UPDATE public.person SET company_id = 'cb000000-0000-0000-0000-000000000000' WHERE id = 'ca222222-2222-2222-2222-222222222222';
UPDATE public.person SET company_id = 'cc000000-0000-0000-0000-000000000000' WHERE id = 'ca333333-3333-3333-3333-333333333333';

INSERT INTO public.person_connection (person_a_id, person_b_id, initiated_by_person_id)
VALUES ('ca111111-1111-1111-1111-111111111111', 'ca222222-2222-2222-2222-222222222222',
        'ca111111-1111-1111-1111-111111111111');

-- The company-less p2p DM thread for the pair (as accept_person_connection makes),
-- so MPC-07 can assert the RPC returns its thread_id for the Message button.
INSERT INTO public.chat_thread (relationship_id, type, person_a_id, person_b_id)
VALUES (NULL, 'p2p', 'ca111111-1111-1111-1111-111111111111', 'ca222222-2222-2222-2222-222222222222');

-- ── MPC-04: output columns exclude email/phone (schema-level check) ─────────
DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM information_schema.parameters
  WHERE specific_schema='public'
    AND specific_name IN (SELECT specific_name FROM information_schema.routines WHERE routine_name='list_my_person_connections')
    AND parameter_mode='OUT'
    AND lower(parameter_name) IN ('email','phone','phone_number','email_address');
  IF v_bad <> 0 THEN RAISE EXCEPTION 'MPC-04 FAIL: list_my_person_connections exposes an email/phone column'; END IF;
END $$;

-- ── MPC-01/02/03: P sees T with company info, not R, not self ───────────────
SELECT set_config('request.jwt.claims', '{"sub":"ca111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_n integer; v_pid uuid; v_cname text; v_tid uuid;
BEGIN
  SELECT count(*) INTO v_n FROM public.list_my_person_connections();
  IF v_n <> 1 THEN RAISE EXCEPTION 'MPC-01 FAIL: P has % connections, expected 1', v_n; END IF;

  SELECT person_id, company_name, thread_id INTO v_pid, v_cname, v_tid FROM public.list_my_person_connections();
  IF v_pid <> 'ca222222-2222-2222-2222-222222222222'
    THEN RAISE EXCEPTION 'MPC-03 FAIL: returned person % , expected T', v_pid; END IF;
  IF v_cname IS NULL OR v_cname = ''
    THEN RAISE EXCEPTION 'MPC-02 FAIL: connected person''s company_name not resolved'; END IF;
  -- MPC-07: the p2p DM thread_id is returned (for the Message button, PG-13)
  IF v_tid IS NULL
    THEN RAISE EXCEPTION 'MPC-07 FAIL: thread_id not returned for a connection with a p2p thread'; END IF;
END $$;
RESET ROLE;

-- ── MPC-05: soft-delete the edge → 0 connections ───────────────────────────
UPDATE public.person_connection SET deleted_at = now()
 WHERE person_a_id = 'ca111111-1111-1111-1111-111111111111' AND person_b_id = 'ca222222-2222-2222-2222-222222222222';
SELECT set_config('request.jwt.claims', '{"sub":"ca111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.list_my_person_connections();
  IF v_n <> 0 THEN RAISE EXCEPTION 'MPC-05 FAIL: soft-deleted edge still returns % rows', v_n; END IF;
END $$;
RESET ROLE;

-- ── MPC-06: an unverified caller (R @ pending company Z) gets zero ──────────
-- Give R a live edge so the ONLY reason for 0 rows is the verified gate.
INSERT INTO public.person_connection (person_a_id, person_b_id, initiated_by_person_id)
VALUES ('ca222222-2222-2222-2222-222222222222', 'ca333333-3333-3333-3333-333333333333',
        'ca333333-3333-3333-3333-333333333333');
SELECT set_config('request.jwt.claims', '{"sub":"ca333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.list_my_person_connections();
  IF v_n <> 0 THEN RAISE EXCEPTION 'MPC-06 FAIL: unverified caller got % rows, expected 0', v_n; END IF;
END $$;
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'list_my_person_connections_test: ALL PASSED (MPC-01..06)'; END $$;

ROLLBACK;
