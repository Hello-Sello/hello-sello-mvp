-- ============================================================================
-- accept_person_connection_test.sql — the person-accept RPC (PG-7)
-- ----------------------------------------------------------------------------
-- THE architecture proof for the social graph: accepting a person request makes
-- a connection + a DM thread with NO company relationship behind it.
--   • APC-01 — accept_person_connection(item) returns a p2p thread id.
--   • APC-02 — a person_connection edge now exists for the pair (canonical, active).
--   • APC-03 — a company-less p2p chat_thread exists (relationship_id NULL) and
--             IS the returned id.
--   • APC-04 — ZERO new `relationship` rows were created (the whole point:
--             a person connection needs no company relationship).
--   • APC-05 — the inbox item flipped to 'accepted'.
--   • APC-06 — one intro line was seeded in the thread.
--   • APC-07 — idempotent: a second call returns the SAME thread, still exactly
--             one edge + one thread, status stays accepted.
--   • APC-08 — a non-target caller is rejected.
--
-- Run:  bash supabase/tests/run_accept_person_connection_test.sh
--
-- ⚠️  RED-FIRST (PG-7): EXPECTED to FAIL pre-PG-7 — the function does not exist,
-- so APC-01 errors "function ... does not exist". Goes GREEN when the RPC lands.
--
-- Fixtures (privileged; rolled back). Test UUID space f…, unused by seeds.
--   Company X (verified) = f0000000-…   Company Y (verified) = f9000000-…
--   Person S (sender @X) = f1111111-…   Person T (target @Y) = f2222222-…
--   Person R (non-target) = f3333333-…   Request row = fa000000-…
-- ============================================================================

BEGIN;

INSERT INTO auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'f1111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'apc-s@example.test', '{"display_name":"Sender S"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f2222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'apc-t@example.test', '{"display_name":"Target T"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f3333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'apc-r@example.test', '{"display_name":"Other R"}', now(), now());

INSERT INTO public.company (id, name, country, verification_status, verified_at, created_by) VALUES
  ('f0000000-0000-0000-0000-000000000000', 'APC Sender Co X', 'DE', 'verified', now(), 'f1111111-1111-1111-1111-111111111111'),
  ('f9000000-0000-0000-0000-000000000000', 'APC Target Co Y', 'DE', 'verified', now(), 'f2222222-2222-2222-2222-222222222222');

UPDATE public.person SET company_id = 'f0000000-0000-0000-0000-000000000000' WHERE id = 'f1111111-1111-1111-1111-111111111111';
UPDATE public.person SET company_id = 'f9000000-0000-0000-0000-000000000000' WHERE id = 'f2222222-2222-2222-2222-222222222222';

-- Pending person request: S → T.
INSERT INTO public.pending_inbox_item (id, type, sender_person_id, sender_company_id, receiver_person_id, receiver_company_id, note)
VALUES ('fa000000-0000-0000-0000-000000000000', 'connect_person',
        'f1111111-1111-1111-1111-111111111111', 'f0000000-0000-0000-0000-000000000000',
        'f2222222-2222-2222-2222-222222222222', NULL, 'Would love to connect');

-- ── APC-01..07: target T accepts ───────────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"f2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_rel_before integer;
  v_rel_after  integer;
  v_thread uuid;
  v_thread2 uuid;
  v_a uuid := 'f1111111-1111-1111-1111-111111111111';  -- S < T canonically
  v_b uuid := 'f2222222-2222-2222-2222-222222222222';
  v_n integer;
  v_status text;
BEGIN
  SELECT count(*) INTO v_rel_before FROM public.relationship;

  v_thread := public.accept_person_connection('fa000000-0000-0000-0000-000000000000');
  IF v_thread IS NULL THEN RAISE EXCEPTION 'APC-01 FAIL: RPC returned NULL thread id'; END IF;

  -- APC-02: the edge
  SELECT count(*) INTO v_n FROM public.person_connection
   WHERE person_a_id = v_a AND person_b_id = v_b AND deleted_at IS NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'APC-02 FAIL: expected 1 active person_connection, found %', v_n; END IF;

  -- APC-03: the company-less p2p thread is the returned id
  SELECT count(*) INTO v_n FROM public.chat_thread
   WHERE id = v_thread AND type = 'p2p' AND relationship_id IS NULL
     AND person_a_id = v_a AND person_b_id = v_b AND deleted_at IS NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'APC-03 FAIL: returned id is not a company-less p2p thread for the pair'; END IF;

  -- APC-04: NO new relationship (the architecture proof)
  SELECT count(*) INTO v_rel_after FROM public.relationship;
  IF v_rel_after <> v_rel_before
    THEN RAISE EXCEPTION 'APC-04 FAIL: accept created % relationship row(s) — a person connection must need NONE', v_rel_after - v_rel_before; END IF;

  -- APC-05: item accepted
  SELECT status INTO v_status FROM public.pending_inbox_item WHERE id = 'fa000000-0000-0000-0000-000000000000';
  IF v_status <> 'accepted' THEN RAISE EXCEPTION 'APC-05 FAIL: item status is %, expected accepted', v_status; END IF;

  -- APC-06: an intro line seeded
  SELECT count(*) INTO v_n FROM public.chat_message WHERE thread_id = v_thread;
  IF v_n < 1 THEN RAISE EXCEPTION 'APC-06 FAIL: no intro message seeded in the thread'; END IF;

  -- APC-07: idempotent second call
  v_thread2 := public.accept_person_connection('fa000000-0000-0000-0000-000000000000');
  IF v_thread2 <> v_thread THEN RAISE EXCEPTION 'APC-07 FAIL: second call returned a different thread'; END IF;
  SELECT count(*) INTO v_n FROM public.person_connection WHERE person_a_id = v_a AND person_b_id = v_b AND deleted_at IS NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'APC-07 FAIL: second call duplicated the edge (% active)', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.chat_thread
   WHERE type = 'p2p' AND relationship_id IS NULL AND person_a_id = v_a AND person_b_id = v_b AND deleted_at IS NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'APC-07 FAIL: second call duplicated the thread (% found)', v_n; END IF;
END $$;
RESET ROLE;

-- ── APC-08: a non-target caller is rejected ────────────────────────────────
-- Reset the fixture item to pending so the rejection isn't a false pass on status.
UPDATE public.pending_inbox_item SET status = 'pending' WHERE id = 'fa000000-0000-0000-0000-000000000000';
SELECT set_config('request.jwt.claims', '{"sub":"f3333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.accept_person_connection('fa000000-0000-0000-0000-000000000000');
    RAISE EXCEPTION 'APC-08 FAIL: a non-target caller accepted a request not addressed to them';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'APC-08 FAIL%' THEN RAISE; END IF;  -- re-raise our own failure
    NULL;  -- expected: the RPC rejected the non-target
  END;
END $$;
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'accept_person_connection_test: ALL PASSED (APC-01..08)'; END $$;

ROLLBACK;
