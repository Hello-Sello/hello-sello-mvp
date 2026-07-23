-- ============================================================================
-- person_connection_test.sql — the person↔person connection edge (Lane B, PG-1)
-- ----------------------------------------------------------------------------
-- Proves the new SOCIAL graph edge is well-formed and tenant-isolated, the same
-- BEGIN…ROLLBACK / impersonate-via-jwt style as join_request_isolation_test.sql:
--   • PC-01 — schema: person_connection exists with exactly the pure-social
--             columns (id, person_a_id, person_b_id, initiated_by_person_id,
--             created_at, deleted_at) and NO `status` column (YAGNI — a
--             connection just exists or is soft-deleted; "pending" lives in the
--             inbox, not the edge).
--   • PC-02 — canonical order: an insert with person_a_id > person_b_id is
--             REJECTED by the CHECK (person_a_id < person_b_id), mirroring
--             relationship_canonical_order.
--   • PC-03 — one-active-edge: a second ACTIVE row for the same person pair is
--             REJECTED by the partial unique index; after soft-deleting the
--             first, a fresh active row for the same pair is ALLOWED (the index
--             keys on deleted_at IS NULL).
--   • PC-04 — RLS: each of the two people SELECTs their own edge; a third,
--             unrelated person sees ZERO rows (person_connection_select =
--             auth.uid() IN (person_a_id, person_b_id)).
--
-- Run:  bash supabase/tests/run_person_connection_test.sh
--
-- ⚠️  RED-FIRST (PG-1): EXPECTED to FAIL against today's schema — person_connection
-- does not exist yet, so PC-01's to_regclass is NULL and the first assertion
-- RAISEs. That non-zero exit IS the RED signal. It goes GREEN when the PG-1
-- migration lands the table + canonical CHECK + partial unique index + RLS.
-- Do NOT loosen assertions to pass here — RED is the correct end state pre-PG-1.
--
-- Fixtures (privileged; rolled back). Test UUID space e…, unused by seeds.
--   Person P = e1111111-…   Person Q = e2222222-…   (the connected pair; e1<e2)
--   Person R = e3333333-…   (unrelated third party — proves the RLS isolation)
-- These people are company-less (company_id NULL) ON PURPOSE: a person connection
-- must stand entirely on its own, with no company relationship behind it.
-- ============================================================================

BEGIN;

-- ── Fixtures: auth users → the on_auth_user_created trigger mints a person row
-- (company_id NULL, canonical display_name). No companies attached — pure social. ──
INSERT INTO auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'e1111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'pc-person-p@example.test',
   '{"display_name":"Person P"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e2222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'pc-person-q@example.test',
   '{"display_name":"Person Q"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e3333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'pc-person-r@example.test',
   '{"display_name":"Person R"}', now(), now());

-- ════════════════════════════════════════════════════════════════════════════
-- (PC-01) schema — the pure-social column set, and NO `status` column.
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_missing text;
  v_has_status integer;
BEGIN
  IF to_regclass('public.person_connection') IS NULL
    THEN RAISE EXCEPTION 'PC-01 FAIL: table public.person_connection does not exist'; END IF;

  SELECT string_agg(c, ', ') INTO v_missing
  FROM unnest(ARRAY['id','person_a_id','person_b_id','initiated_by_person_id','created_at','deleted_at']) AS c
  WHERE c NOT IN (
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='person_connection'
  );
  IF v_missing IS NOT NULL
    THEN RAISE EXCEPTION 'PC-01 FAIL: person_connection is missing column(s): %', v_missing; END IF;

  SELECT count(*) INTO v_has_status
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='person_connection' AND column_name='status';
  IF v_has_status <> 0
    THEN RAISE EXCEPTION 'PC-01 FAIL: person_connection has a `status` column (YAGNI — drop it; pure-social edge is exists/soft-deleted only)'; END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- (PC-02) canonical order — person_a_id < person_b_id enforced by CHECK.
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  BEGIN
    INSERT INTO public.person_connection (person_a_id, person_b_id, initiated_by_person_id)
    VALUES ('e2222222-2222-2222-2222-222222222222', 'e1111111-1111-1111-1111-111111111111',
            'e2222222-2222-2222-2222-222222222222');  -- a > b, must be rejected
    RAISE EXCEPTION 'PC-02 FAIL: a non-canonical (person_a_id > person_b_id) row was accepted — the canonical CHECK is missing';
  EXCEPTION WHEN check_violation THEN
    NULL;  -- expected
  END;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- (PC-03) one active edge per pair; soft-delete frees the pair.
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_first uuid;
BEGIN
  INSERT INTO public.person_connection (person_a_id, person_b_id, initiated_by_person_id)
  VALUES ('e1111111-1111-1111-1111-111111111111', 'e2222222-2222-2222-2222-222222222222',
          'e1111111-1111-1111-1111-111111111111')
  RETURNING id INTO v_first;

  -- a SECOND active row for the same pair must be rejected
  BEGIN
    INSERT INTO public.person_connection (person_a_id, person_b_id, initiated_by_person_id)
    VALUES ('e1111111-1111-1111-1111-111111111111', 'e2222222-2222-2222-2222-222222222222',
            'e2222222-2222-2222-2222-222222222222');
    RAISE EXCEPTION 'PC-03 FAIL: a second ACTIVE edge for the same pair was accepted — the partial unique index is missing';
  EXCEPTION WHEN unique_violation THEN
    NULL;  -- expected
  END;

  -- soft-delete the first; a fresh active row for the same pair is then allowed
  UPDATE public.person_connection SET deleted_at = now() WHERE id = v_first;
  INSERT INTO public.person_connection (person_a_id, person_b_id, initiated_by_person_id)
  VALUES ('e1111111-1111-1111-1111-111111111111', 'e2222222-2222-2222-2222-222222222222',
          'e1111111-1111-1111-1111-111111111111');  -- must succeed (index keys on deleted_at IS NULL)

  -- leave exactly one ACTIVE edge for the pair, for the PC-04 RLS checks
  DELETE FROM public.person_connection WHERE deleted_at IS NOT NULL;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- (PC-04) RLS — the two people see their edge; a third party sees zero.
-- ════════════════════════════════════════════════════════════════════════════
-- Person P
SELECT set_config('request.jwt.claim.sub', 'e1111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"e1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.person_connection;
  IF v_n <> 1 THEN RAISE EXCEPTION 'PC-04 FAIL: person P sees % edges, expected 1', v_n; END IF;
END $$;
RESET ROLE;

-- Person Q
SELECT set_config('request.jwt.claim.sub', 'e2222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"e2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.person_connection;
  IF v_n <> 1 THEN RAISE EXCEPTION 'PC-04 FAIL: person Q sees % edges, expected 1', v_n; END IF;
END $$;
RESET ROLE;

-- Person R (unrelated third party) — must see ZERO
SELECT set_config('request.jwt.claim.sub', 'e3333333-3333-3333-3333-333333333333', true);
SELECT set_config('request.jwt.claims', '{"sub":"e3333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.person_connection;
  IF v_n <> 0 THEN RAISE EXCEPTION 'PC-04 LEAK: unrelated person R sees % edges, expected 0 (RLS isolation broken)', v_n; END IF;
END $$;
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'person_connection_test: ALL PASSED (PC-01..04)'; END $$;

ROLLBACK;
