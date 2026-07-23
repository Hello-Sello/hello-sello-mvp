-- ============================================================================
-- p2p_companyless_dedup_test.sql — one company-less p2p thread per pair (PG-6)
-- ----------------------------------------------------------------------------
-- A person↔person DM thread has relationship_id = NULL. The existing p2p
-- uniqueness index (uq_chat_thread_p2p) is keyed on relationship_id, so with a
-- NULL relationship Postgres treats every row as distinct → duplicate DM threads
-- for the same pair slip through. This adds a partial unique index that closes
-- that gap:
--   • PDX-01 — a first company-less p2p thread inserts OK.
--   • PDX-02 — a SECOND company-less p2p thread for the same pair is REJECTED.
--   • PDX-03 — after soft-deleting the first, a fresh one for the same pair is
--             ALLOWED (the index keys on deleted_at IS NULL).
--
-- Run:  bash supabase/tests/run_p2p_companyless_dedup_test.sh
--
-- ⚠️  RED-FIRST (PG-6): EXPECTED to FAIL pre-PG-6 — with no partial index the
-- duplicate at PDX-02 is accepted, so the "was accepted" RAISE fires. Goes GREEN
-- when the migration adds the partial unique index.
--
-- Fixtures (privileged; rolled back). Test UUID space e…, unused by seeds.
--   Person P = e1111111-…   Person Q = e2222222-…   (company-less; e1 < e2)
-- ============================================================================

BEGIN;

INSERT INTO auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'e1111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'pdx-p@example.test', '{"display_name":"Person P"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e2222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'pdx-q@example.test', '{"display_name":"Person Q"}', now(), now());

DO $$
DECLARE v_first uuid;
BEGIN
  -- PDX-01: first company-less p2p thread
  INSERT INTO public.chat_thread (relationship_id, type, person_a_id, person_b_id)
  VALUES (NULL, 'p2p', 'e1111111-1111-1111-1111-111111111111', 'e2222222-2222-2222-2222-222222222222')
  RETURNING id INTO v_first;
  IF v_first IS NULL THEN RAISE EXCEPTION 'PDX-01 FAIL: first company-less p2p thread did not insert'; END IF;

  -- PDX-02: a duplicate for the same pair must be rejected
  BEGIN
    INSERT INTO public.chat_thread (relationship_id, type, person_a_id, person_b_id)
    VALUES (NULL, 'p2p', 'e1111111-1111-1111-1111-111111111111', 'e2222222-2222-2222-2222-222222222222');
    RAISE EXCEPTION 'PDX-02 FAIL: a duplicate company-less p2p thread was accepted (partial unique index missing)';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- PDX-03: soft-delete the first → a fresh one for the same pair is allowed
  UPDATE public.chat_thread SET deleted_at = now() WHERE id = v_first;
  INSERT INTO public.chat_thread (relationship_id, type, person_a_id, person_b_id)
  VALUES (NULL, 'p2p', 'e1111111-1111-1111-1111-111111111111', 'e2222222-2222-2222-2222-222222222222');
END $$;

DO $$ BEGIN RAISE NOTICE 'p2p_companyless_dedup_test: ALL PASSED (PDX-01..03)'; END $$;

ROLLBACK;
