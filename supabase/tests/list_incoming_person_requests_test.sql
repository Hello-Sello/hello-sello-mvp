-- ============================================================================
-- list_incoming_person_requests_test.sql — incoming person requests RPC (PG-11)
-- ----------------------------------------------------------------------------
-- The pending connect_person requests aimed at YOU, with the sender's safe fields
-- + company. A SECURITY DEFINER RPC because for a PENDING request the sender is
-- not connected yet, so person_select won't reveal their name in a plain join.
--   • IPR-01 — returns exactly the pending connect_person requests aimed at you.
--   • IPR-02 — each row carries the sender person + company info.
--   • IPR-03 — excludes: rejected/accepted ones, company-type requests, and
--             person requests aimed at someone else.
--   • IPR-04 — output exposes NO email / phone column.
--   • IPR-05 — an unverified caller gets zero rows.
--
-- Run:  bash supabase/tests/run_list_incoming_person_requests_test.sh
--
-- ⚠️  RED-FIRST (PG-11): the function does not exist → IPR-01 errors. GREEN when
-- the RPC lands.
--
-- Fixtures (privileged; rolled back). UUID space da/db/dc… (valid hex).
--   Company X = da0…(verified)  Y = db0…(verified)  Z = dc0…(UNVERIFIED)
--   Person S (@X, sender) = da1…  T (@Y, caller) = da2…  O (@Z) = da3…
-- ============================================================================

BEGIN;

INSERT INTO auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'da111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'ipr-s@example.test', '{"display_name":"Sender S"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'da222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'ipr-t@example.test', '{"display_name":"Target T"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'da333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'ipr-o@example.test', '{"display_name":"Other O"}', now(), now());

INSERT INTO public.company (id, name, country, verification_status, verified_at, created_by) VALUES
  ('da000000-0000-0000-0000-000000000000', 'IPR Co X', 'DE', 'verified', now(), 'da111111-1111-1111-1111-111111111111'),
  ('db000000-0000-0000-0000-000000000000', 'IPR Co Y', 'DE', 'verified', now(), 'da222222-2222-2222-2222-222222222222'),
  ('dc000000-0000-0000-0000-000000000000', 'IPR Co Z', 'DE', 'pending', NULL, 'da333333-3333-3333-3333-333333333333');

UPDATE public.person SET company_id = 'da000000-0000-0000-0000-000000000000' WHERE id = 'da111111-1111-1111-1111-111111111111';
UPDATE public.person SET company_id = 'db000000-0000-0000-0000-000000000000' WHERE id = 'da222222-2222-2222-2222-222222222222';
UPDATE public.person SET company_id = 'dc000000-0000-0000-0000-000000000000' WHERE id = 'da333333-3333-3333-3333-333333333333';

-- 1) the one that SHOULD show: pending connect_person S → T
INSERT INTO public.pending_inbox_item (type, sender_person_id, sender_company_id, receiver_person_id, receiver_company_id, note, status)
VALUES ('connect_person','da111111-1111-1111-1111-111111111111','da000000-0000-0000-0000-000000000000','da222222-2222-2222-2222-222222222222',NULL,'hi T','pending');
-- 2) excluded by status: rejected connect_person S → T
INSERT INTO public.pending_inbox_item (type, sender_person_id, sender_company_id, receiver_person_id, receiver_company_id, status)
VALUES ('connect_person','da111111-1111-1111-1111-111111111111','da000000-0000-0000-0000-000000000000','da222222-2222-2222-2222-222222222222',NULL,'rejected');
-- 3) excluded by type: company connect X → company Y
INSERT INTO public.pending_inbox_item (type, sender_person_id, sender_company_id, receiver_person_id, receiver_company_id, status)
VALUES ('connect','da111111-1111-1111-1111-111111111111','da000000-0000-0000-0000-000000000000',NULL,'db000000-0000-0000-0000-000000000000','pending');
-- 4) excluded by target: pending connect_person S → O
INSERT INTO public.pending_inbox_item (type, sender_person_id, sender_company_id, receiver_person_id, receiver_company_id, status)
VALUES ('connect_person','da111111-1111-1111-1111-111111111111','da000000-0000-0000-0000-000000000000','da333333-3333-3333-3333-333333333333',NULL,'pending');

-- ── IPR-04: no email/phone OUT columns ─────────────────────────────────────
DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad FROM information_schema.parameters
  WHERE specific_schema='public'
    AND specific_name IN (SELECT specific_name FROM information_schema.routines WHERE routine_name='list_incoming_person_requests')
    AND parameter_mode='OUT'
    AND lower(parameter_name) IN ('email','phone','phone_number','email_address');
  IF v_bad <> 0 THEN RAISE EXCEPTION 'IPR-04 FAIL: list_incoming_person_requests exposes an email/phone column'; END IF;
END $$;

-- ── IPR-01/02/03: T sees exactly the pending connect_person aimed at them ───
SELECT set_config('request.jwt.claims', '{"sub":"da222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_n integer; v_sp uuid; v_cname text;
BEGIN
  SELECT count(*) INTO v_n FROM public.list_incoming_person_requests();
  IF v_n <> 1 THEN RAISE EXCEPTION 'IPR-01/03 FAIL: T sees % incoming person requests, expected exactly 1', v_n; END IF;

  SELECT sender_person_id, sender_company_name INTO v_sp, v_cname FROM public.list_incoming_person_requests();
  IF v_sp <> 'da111111-1111-1111-1111-111111111111' THEN RAISE EXCEPTION 'IPR-02 FAIL: wrong sender %', v_sp; END IF;
  IF v_cname IS NULL OR v_cname = '' THEN RAISE EXCEPTION 'IPR-02 FAIL: sender company_name not resolved'; END IF;
END $$;
RESET ROLE;

-- ── IPR-05: unverified caller (O @ pending company Z) gets zero ─────────────
SELECT set_config('request.jwt.claims', '{"sub":"da333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.list_incoming_person_requests();
  IF v_n <> 0 THEN RAISE EXCEPTION 'IPR-05 FAIL: unverified caller got % rows, expected 0', v_n; END IF;
END $$;
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'list_incoming_person_requests_test: ALL PASSED (IPR-01..05)'; END $$;

ROLLBACK;
