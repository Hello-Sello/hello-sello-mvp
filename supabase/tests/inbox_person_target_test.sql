-- ============================================================================
-- inbox_person_target_test.sql — pending_inbox_item gains a PERSON target (PG-4)
-- ----------------------------------------------------------------------------
-- The Connect inbox was company-addressed only (receiver_company_id NOT NULL, no
-- person target). Discover's person↔person connect needs a request aimed at a
-- PERSON. This proves the schema now supports that WITHOUT leaking a personal
-- request to the target's colleagues:
--   • IPT-01 — receiver_person_id column exists and is nullable.
--   • IPT-02 — inbox_request_type has a `connect_person` value.
--   • IPT-03 — receiver_company_id is now NULLABLE (a person request carries no
--             company target — that is what keeps it person-scoped, not
--             company-visible via the existing inbox_select company branch).
--   • IPT-04 — a connect_person row WITHOUT receiver_person_id is REJECTED.
--   • IPT-05 — a connect_person row WITH a receiver_company_id is REJECTED
--             (person requests must NOT be company-addressed → no colleague leak).
--   • IPT-06 — a non-person type carrying receiver_person_id is REJECTED.
--   • IPT-07 — a non-person type WITHOUT receiver_company_id is REJECTED
--             (company requests still require a company target — no regression).
--   • IPT-08 — a valid connect_person row (receiver_person_id set, no company)
--             inserts OK.
--   • IPT-09 — a valid legacy company request (type connect, receiver_company_id
--             set, no person) still inserts OK — no regression.
--
-- Run:  bash supabase/tests/run_inbox_person_target_test.sh
--
-- ⚠️  RED-FIRST (PG-4): EXPECTED to FAIL against today's schema — receiver_person_id
-- and the connect_person type don't exist yet, so IPT-01 RAISEs. Goes GREEN when
-- the PG-4 migration adds the column + type + the four type/target CHECKs and
-- drops receiver_company_id's NOT NULL. Do NOT loosen assertions to pass here.
--
-- Fixtures (privileged; rolled back). Test UUID space f…, unused by seeds.
--   Company X (verified) = f0000000-…
--   Person S (sender, at X)   = f1111111-…      Person T (target)  = f2222222-…
-- ============================================================================

BEGIN;

INSERT INTO auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'f1111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'ipt-sender@example.test', '{"display_name":"Sender S"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f2222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'ipt-target@example.test', '{"display_name":"Target T"}', now(), now());

INSERT INTO public.company (id, name, country, verification_status, verified_at, created_by) VALUES
  ('f0000000-0000-0000-0000-000000000000', 'IPT Sender Co', 'DE', 'verified', now(),
   'f1111111-1111-1111-1111-111111111111');

-- Attach the sender to their company (privileged — bypasses the DEV-88 lockdown).
UPDATE public.person SET company_id = 'f0000000-0000-0000-0000-000000000000'
  WHERE id = 'f1111111-1111-1111-1111-111111111111';

-- ════════════════════════════════════════════════════════════════════════════
-- (IPT-01/02/03) schema shape.
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_nullable text; v_has_type integer;
BEGIN
  -- receiver_person_id exists + nullable
  SELECT is_nullable INTO v_nullable FROM information_schema.columns
  WHERE table_schema='public' AND table_name='pending_inbox_item' AND column_name='receiver_person_id';
  IF v_nullable IS NULL
    THEN RAISE EXCEPTION 'IPT-01 FAIL: pending_inbox_item.receiver_person_id does not exist'; END IF;
  IF v_nullable <> 'YES'
    THEN RAISE EXCEPTION 'IPT-01 FAIL: receiver_person_id must be nullable, is %', v_nullable; END IF;

  -- connect_person type seeded
  SELECT count(*) INTO v_has_type FROM public.inbox_request_type WHERE code='connect_person';
  IF v_has_type <> 1
    THEN RAISE EXCEPTION 'IPT-02 FAIL: inbox_request_type is missing the connect_person value'; END IF;

  -- receiver_company_id now nullable
  SELECT is_nullable INTO v_nullable FROM information_schema.columns
  WHERE table_schema='public' AND table_name='pending_inbox_item' AND column_name='receiver_company_id';
  IF v_nullable <> 'YES'
    THEN RAISE EXCEPTION 'IPT-03 FAIL: receiver_company_id must be nullable now (person requests carry no company target), is %', v_nullable; END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- (IPT-04..07) the four type/target CHECK invariants reject bad rows.
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  -- IPT-04: connect_person WITHOUT receiver_person_id
  BEGIN
    INSERT INTO public.pending_inbox_item (type, sender_person_id, sender_company_id, receiver_person_id, receiver_company_id)
    VALUES ('connect_person', 'f1111111-1111-1111-1111-111111111111', 'f0000000-0000-0000-0000-000000000000', NULL, NULL);
    RAISE EXCEPTION 'IPT-04 FAIL: connect_person without receiver_person_id was accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- IPT-05: connect_person WITH a receiver_company_id (would leak to colleagues)
  BEGIN
    INSERT INTO public.pending_inbox_item (type, sender_person_id, sender_company_id, receiver_person_id, receiver_company_id)
    VALUES ('connect_person', 'f1111111-1111-1111-1111-111111111111', 'f0000000-0000-0000-0000-000000000000',
            'f2222222-2222-2222-2222-222222222222', 'f0000000-0000-0000-0000-000000000000');
    RAISE EXCEPTION 'IPT-05 FAIL: connect_person WITH receiver_company_id was accepted (person request must be person-scoped)';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- IPT-06: a non-person type carrying receiver_person_id
  BEGIN
    INSERT INTO public.pending_inbox_item (type, sender_person_id, sender_company_id, receiver_person_id, receiver_company_id)
    VALUES ('connect', 'f1111111-1111-1111-1111-111111111111', 'f0000000-0000-0000-0000-000000000000',
            'f2222222-2222-2222-2222-222222222222', 'f0000000-0000-0000-0000-000000000000');
    RAISE EXCEPTION 'IPT-06 FAIL: a connect (company) request carrying receiver_person_id was accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- IPT-07: a non-person type WITHOUT receiver_company_id
  BEGIN
    INSERT INTO public.pending_inbox_item (type, sender_person_id, sender_company_id, receiver_person_id, receiver_company_id)
    VALUES ('connect', 'f1111111-1111-1111-1111-111111111111', 'f0000000-0000-0000-0000-000000000000', NULL, NULL);
    RAISE EXCEPTION 'IPT-07 FAIL: a connect (company) request WITHOUT receiver_company_id was accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- (IPT-08/09) valid rows insert — person request and legacy company request.
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_person uuid; v_company uuid;
BEGIN
  INSERT INTO public.pending_inbox_item (type, sender_person_id, sender_company_id, receiver_person_id, receiver_company_id)
  VALUES ('connect_person', 'f1111111-1111-1111-1111-111111111111', 'f0000000-0000-0000-0000-000000000000',
          'f2222222-2222-2222-2222-222222222222', NULL)
  RETURNING id INTO v_person;
  IF v_person IS NULL THEN RAISE EXCEPTION 'IPT-08 FAIL: a valid connect_person row did not insert'; END IF;

  INSERT INTO public.pending_inbox_item (type, sender_person_id, sender_company_id, receiver_person_id, receiver_company_id)
  VALUES ('connect', 'f1111111-1111-1111-1111-111111111111', 'f0000000-0000-0000-0000-000000000000',
          NULL, 'f0000000-0000-0000-0000-000000000000')
  RETURNING id INTO v_company;
  IF v_company IS NULL THEN RAISE EXCEPTION 'IPT-09 FAIL: a valid legacy company request did not insert'; END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'inbox_person_target_test: ALL PASSED (IPT-01..09)'; END $$;

ROLLBACK;
