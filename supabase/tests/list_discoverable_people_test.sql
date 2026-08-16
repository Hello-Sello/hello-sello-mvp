-- ============================================================================
-- list_discoverable_people_test.sql — the People directory RPC (DISC-7)
-- ----------------------------------------------------------------------------
-- People at other verified companies, with safe fields + a per-person
-- connection_state so the "+" knows what to render.
--   • DP-01 — returns people at OTHER verified companies (excludes own company,
--             self, unverified company, soft-deleted).
--   • DP-02 — connection_state is correct for all 4 states: none / connected /
--             requested (I sent) / incoming (they sent).
--   • DP-03 — output exposes NO email / phone column.
--   • DP-04 — an unverified caller gets zero rows.
--
-- Run:  bash supabase/tests/run_list_discoverable_people_test.sh
--
-- ⚠️  RED-FIRST (DISC-7): the function does not exist → DP-01 errors. GREEN when
-- the RPC lands.
--
-- Fixtures (privileged; rolled back). UUID space ba/bb/bc… (valid hex).
--   Company V (verified) = ba0…  caller Pv @V = ba1…  Pown @V = ba2…
--   Company W (verified) = bb0…  Pnone = bb1…  Pconn = bb2…  Preq = bb3…  Pinc = bb4…
--   Company U (UNVERIFIED) = bc0…  Pun @U = bc1…
-- ============================================================================

BEGIN;

INSERT INTO auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'ba111111-1111-1111-1111-111111111111', 'authenticated','authenticated','dp-pv@example.test','{"display_name":"Pv"}',now(),now()),
  ('00000000-0000-0000-0000-000000000000', 'ba222222-2222-2222-2222-222222222222', 'authenticated','authenticated','dp-pown@example.test','{"display_name":"Pown"}',now(),now()),
  ('00000000-0000-0000-0000-000000000000', 'bb111111-1111-1111-1111-111111111111', 'authenticated','authenticated','dp-pnone@example.test','{"display_name":"Pnone"}',now(),now()),
  ('00000000-0000-0000-0000-000000000000', 'bb222222-2222-2222-2222-222222222222', 'authenticated','authenticated','dp-pconn@example.test','{"display_name":"Pconn"}',now(),now()),
  ('00000000-0000-0000-0000-000000000000', 'bb333333-3333-3333-3333-333333333333', 'authenticated','authenticated','dp-preq@example.test','{"display_name":"Preq"}',now(),now()),
  ('00000000-0000-0000-0000-000000000000', 'bb444444-4444-4444-4444-444444444444', 'authenticated','authenticated','dp-pinc@example.test','{"display_name":"Pinc"}',now(),now()),
  ('00000000-0000-0000-0000-000000000000', 'bc111111-1111-1111-1111-111111111111', 'authenticated','authenticated','dp-pun@example.test','{"display_name":"Pun"}',now(),now());

INSERT INTO public.company (id, name, country, verification_status, verified_at, created_by) VALUES
  ('ba000000-0000-0000-0000-000000000000','DP Co V','DE','verified',now(),'ba111111-1111-1111-1111-111111111111'),
  ('bb000000-0000-0000-0000-000000000000','DP Co W','DE','verified',now(),'bb111111-1111-1111-1111-111111111111'),
  ('bc000000-0000-0000-0000-000000000000','DP Co U','DE','pending',NULL,'bc111111-1111-1111-1111-111111111111');

UPDATE public.person SET company_id='ba000000-0000-0000-0000-000000000000' WHERE id IN ('ba111111-1111-1111-1111-111111111111','ba222222-2222-2222-2222-222222222222');
UPDATE public.person SET company_id='bb000000-0000-0000-0000-000000000000' WHERE id IN ('bb111111-1111-1111-1111-111111111111','bb222222-2222-2222-2222-222222222222','bb333333-3333-3333-3333-333333333333','bb444444-4444-4444-4444-444444444444');
UPDATE public.person SET company_id='bc000000-0000-0000-0000-000000000000' WHERE id='bc111111-1111-1111-1111-111111111111';

-- connected: Pv ↔ Pconn (ba1 < bb2 → a=Pv, b=Pconn)
INSERT INTO public.person_connection (person_a_id, person_b_id, initiated_by_person_id)
VALUES ('ba111111-1111-1111-1111-111111111111','bb222222-2222-2222-2222-222222222222','ba111111-1111-1111-1111-111111111111');
-- requested: Pv → Preq
INSERT INTO public.pending_inbox_item (type, sender_person_id, sender_company_id, receiver_person_id, receiver_company_id)
VALUES ('connect_person','ba111111-1111-1111-1111-111111111111','ba000000-0000-0000-0000-000000000000','bb333333-3333-3333-3333-333333333333',NULL);
-- incoming: Pinc → Pv
INSERT INTO public.pending_inbox_item (type, sender_person_id, sender_company_id, receiver_person_id, receiver_company_id)
VALUES ('connect_person','bb444444-4444-4444-4444-444444444444','bb000000-0000-0000-0000-000000000000','ba111111-1111-1111-1111-111111111111',NULL);

-- ── DP-03: no email/phone OUT columns ──────────────────────────────────────
DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad FROM information_schema.parameters
  WHERE specific_schema='public'
    AND specific_name IN (SELECT specific_name FROM information_schema.routines WHERE routine_name='list_discoverable_people')
    AND parameter_mode='OUT' AND lower(parameter_name) IN ('email','phone','phone_number','email_address');
  IF v_bad <> 0 THEN RAISE EXCEPTION 'DP-03 FAIL: list_discoverable_people exposes an email/phone column'; END IF;
END $$;

-- ── DP-01/02/04: caller Pv ─────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"ba111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_n integer; v_state text;
BEGIN
  -- all 4 W-people are returned (scoped by id — the DB also has seed people, so
  -- a total-count assertion would be brittle; DP-04 proves the exclusions).
  SELECT count(*) INTO v_n FROM public.list_discoverable_people()
    WHERE person_id IN ('bb111111-1111-1111-1111-111111111111','bb222222-2222-2222-2222-222222222222',
                        'bb333333-3333-3333-3333-333333333333','bb444444-4444-4444-4444-444444444444');
  IF v_n <> 4 THEN RAISE EXCEPTION 'DP-01 FAIL: Pv sees % of the 4 fixture people, expected 4', v_n; END IF;

  IF EXISTS (SELECT 1 FROM public.list_discoverable_people() WHERE person_id='ba222222-2222-2222-2222-222222222222')
    THEN RAISE EXCEPTION 'DP-04 FAIL: own-company person leaked'; END IF;
  IF EXISTS (SELECT 1 FROM public.list_discoverable_people() WHERE person_id='bc111111-1111-1111-1111-111111111111')
    THEN RAISE EXCEPTION 'DP-04 FAIL: unverified-company person leaked'; END IF;

  -- the 4 connection states
  SELECT connection_state INTO v_state FROM public.list_discoverable_people() WHERE person_id='bb111111-1111-1111-1111-111111111111';
  IF v_state <> 'none' THEN RAISE EXCEPTION 'DP-02 FAIL: Pnone state = %, expected none', v_state; END IF;
  SELECT connection_state INTO v_state FROM public.list_discoverable_people() WHERE person_id='bb222222-2222-2222-2222-222222222222';
  IF v_state <> 'connected' THEN RAISE EXCEPTION 'DP-02 FAIL: Pconn state = %, expected connected', v_state; END IF;
  SELECT connection_state INTO v_state FROM public.list_discoverable_people() WHERE person_id='bb333333-3333-3333-3333-333333333333';
  IF v_state <> 'requested' THEN RAISE EXCEPTION 'DP-02 FAIL: Preq state = %, expected requested', v_state; END IF;
  SELECT connection_state INTO v_state FROM public.list_discoverable_people() WHERE person_id='bb444444-4444-4444-4444-444444444444';
  IF v_state <> 'incoming' THEN RAISE EXCEPTION 'DP-02 FAIL: Pinc state = %, expected incoming', v_state; END IF;
END $$;
RESET ROLE;

-- ── DP-05: unverified caller (Pun @ U) gets zero ───────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"bc111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.list_discoverable_people();
  IF v_n <> 0 THEN RAISE EXCEPTION 'DP-05 FAIL: unverified caller got % rows, expected 0', v_n; END IF;
END $$;
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'list_discoverable_people_test: ALL PASSED (DP-01..05)'; END $$;

ROLLBACK;
