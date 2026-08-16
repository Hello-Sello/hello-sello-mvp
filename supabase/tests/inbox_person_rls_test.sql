-- ============================================================================
-- inbox_person_rls_test.sql — inbox RLS lets the TARGET PERSON see/act (PG-5)
-- ----------------------------------------------------------------------------
-- PG-4 added a person target; the inbox RLS was still company-keyed, so the
-- target person could neither see nor accept a request aimed at them. This proves
-- the person branch, and — critically — that a personal request stays PERSONAL:
--   • IRLS-01 — the target person T SELECTs the connect_person row aimed at them.
--   • IRLS-02 — a COLLEAGUE of T (same company) does NOT see it (person-scoped
--             beats company-colleague visibility — the whole point of PG-4's
--             "no company target" design).
--   • IRLS-03 — T can UPDATE the row (accept/decline it).
--   • IRLS-04 — the colleague cannot UPDATE it (0 rows affected under RLS).
--   • IRLS-05 — regression: the company branch still works — a member of the
--             RECEIVER company still sees a company-addressed request.
--
-- Run:  bash supabase/tests/run_inbox_person_rls_test.sh
--
-- ⚠️  RED-FIRST (PG-5): EXPECTED to FAIL pre-PG-5 — the target person can't SELECT
-- their own connect_person row (company-only RLS), so IRLS-01 RAISEs. Goes GREEN
-- when inbox_select/inbox_update gain the `receiver_person_id = auth.uid()` branch
-- (rebuilt from the LIVE body, that branch the only addition).
--
-- Fixtures (privileged; rolled back). Test UUID space f…, unused by seeds.
--   Company X (verified) = f0000000-…   Company Y (verified) = f9000000-…
--   Person S (sender @X) = f1111111-…   Person T (target @Y) = f2222222-…
--   Person R (T's COLLEAGUE @Y) = f3333333-…
--   Person-request row  = fa000000-…    Company-request row  = fb000000-…
-- ============================================================================

BEGIN;

INSERT INTO auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'f1111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'irls-s@example.test', '{"display_name":"Sender S"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f2222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'irls-t@example.test', '{"display_name":"Target T"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f3333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'irls-r@example.test', '{"display_name":"Colleague R"}', now(), now());

INSERT INTO public.company (id, name, country, verification_status, verified_at, created_by) VALUES
  ('f0000000-0000-0000-0000-000000000000', 'IRLS Sender Co X', 'DE', 'verified', now(), 'f1111111-1111-1111-1111-111111111111'),
  ('f9000000-0000-0000-0000-000000000000', 'IRLS Target Co Y', 'DE', 'verified', now(), 'f2222222-2222-2222-2222-222222222222');

UPDATE public.person SET company_id = 'f0000000-0000-0000-0000-000000000000' WHERE id = 'f1111111-1111-1111-1111-111111111111';
UPDATE public.person SET company_id = 'f9000000-0000-0000-0000-000000000000' WHERE id = 'f2222222-2222-2222-2222-222222222222';
UPDATE public.person SET company_id = 'f9000000-0000-0000-0000-000000000000' WHERE id = 'f3333333-3333-3333-3333-333333333333';

-- Person request: S (company X) → person T. No company target (person-scoped).
INSERT INTO public.pending_inbox_item (id, type, sender_person_id, sender_company_id, receiver_person_id, receiver_company_id)
VALUES ('fa000000-0000-0000-0000-000000000000', 'connect_person',
        'f1111111-1111-1111-1111-111111111111', 'f0000000-0000-0000-0000-000000000000',
        'f2222222-2222-2222-2222-222222222222', NULL);

-- Company request: company X → company Y (a normal company-addressed request), so
-- IRLS-05 can prove the company receiver branch still works. Sender person = S.
INSERT INTO public.pending_inbox_item (id, type, sender_person_id, sender_company_id, receiver_person_id, receiver_company_id)
VALUES ('fb000000-0000-0000-0000-000000000000', 'connect',
        'f1111111-1111-1111-1111-111111111111', 'f0000000-0000-0000-0000-000000000000',
        NULL, 'f9000000-0000-0000-0000-000000000000');

-- ── IRLS-01: target T sees the person request ──────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"f2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.pending_inbox_item WHERE id = 'fa000000-0000-0000-0000-000000000000';
  IF v_n <> 1 THEN RAISE EXCEPTION 'IRLS-01 FAIL: target T sees % of their connect_person row, expected 1', v_n; END IF;
END $$;
RESET ROLE;

-- ── IRLS-02: T's COLLEAGUE R (same company) does NOT see it ─────────────────
SELECT set_config('request.jwt.claims', '{"sub":"f3333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.pending_inbox_item WHERE id = 'fa000000-0000-0000-0000-000000000000';
  IF v_n <> 0 THEN RAISE EXCEPTION 'IRLS-02 LEAK: colleague R sees % of T''s personal request, expected 0 (person-scoping broken)', v_n; END IF;
END $$;
RESET ROLE;

-- ── IRLS-03: T can UPDATE (accept) the row ─────────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"f2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_n integer;
BEGIN
  UPDATE public.pending_inbox_item SET status = 'accepted' WHERE id = 'fa000000-0000-0000-0000-000000000000';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'IRLS-03 FAIL: T updated % rows, expected 1', v_n; END IF;
END $$;
RESET ROLE;

-- ── IRLS-04: colleague R cannot UPDATE it (0 rows affected under RLS) ───────
SELECT set_config('request.jwt.claims', '{"sub":"f3333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_n integer;
BEGIN
  UPDATE public.pending_inbox_item SET status = 'declined' WHERE id = 'fa000000-0000-0000-0000-000000000000';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RAISE EXCEPTION 'IRLS-04 LEAK: colleague R updated % rows, expected 0', v_n; END IF;
END $$;
RESET ROLE;

-- ── IRLS-05: regression — a member of the RECEIVER company sees a company request.
-- Person T is @ company Y = the company request's receiver → sees it via the company branch.
SELECT set_config('request.jwt.claims', '{"sub":"f2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.pending_inbox_item WHERE id = 'fb000000-0000-0000-0000-000000000000';
  IF v_n <> 1 THEN RAISE EXCEPTION 'IRLS-05 FAIL: receiver-company member sees % of the company request, expected 1 (company branch regressed)', v_n; END IF;
END $$;
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'inbox_person_rls_test: ALL PASSED (IRLS-01..05)'; END $$;

ROLLBACK;
