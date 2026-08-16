-- ============================================================================
-- list_discoverable_companies_verified_gate_test.sql — restore SEC-01 gate (DISC-2)
-- ----------------------------------------------------------------------------
-- The live list_discoverable_companies dropped its is_caller_verified() caller
-- gate (SEC-01) through later create-or-replace from a pre-SEC-01 body. This
-- restores it. Proven:
--   • DC2-01 — a VERIFIED caller still gets the directory (>= 1 row).
--   • DC2-02 — an UNVERIFIED caller gets ZERO rows.
--
-- Run:  bash supabase/tests/run_list_discoverable_companies_verified_gate_test.sh
--
-- ⚠️  RED-FIRST (DISC-2): EXPECTED to FAIL pre-fix — with no gate an unverified
-- caller sees the directory, so DC2-02 RAISEs. GREEN once the WHERE gains
-- `and public.is_caller_verified()`.
--
-- Fixtures (privileged; rolled back). UUID space ea/eb/ec… (valid hex).
--   Company V (verified) = ea0…  caller Pv @V = ea1…
--   Company U (UNVERIFIED) = eb0…  caller Pu @U = eb1…
--   Company X (verified, discoverable) = ec0…
-- ============================================================================

BEGIN;

INSERT INTO auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'ea111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'dc2-pv@example.test', '{"display_name":"Pv"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'eb111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'dc2-pu@example.test', '{"display_name":"Pu"}', now(), now());

INSERT INTO public.company (id, name, country, verification_status, verified_at, created_by) VALUES
  ('ea000000-0000-0000-0000-000000000000', 'DC2 Verified V', 'DE', 'verified', now(), 'ea111111-1111-1111-1111-111111111111'),
  ('eb000000-0000-0000-0000-000000000000', 'DC2 Unverified U', 'DE', 'pending', NULL, 'eb111111-1111-1111-1111-111111111111'),
  ('ec000000-0000-0000-0000-000000000000', 'DC2 Discoverable X', 'DE', 'verified', now(), 'ea111111-1111-1111-1111-111111111111');

UPDATE public.person SET company_id = 'ea000000-0000-0000-0000-000000000000' WHERE id = 'ea111111-1111-1111-1111-111111111111';
UPDATE public.person SET company_id = 'eb000000-0000-0000-0000-000000000000' WHERE id = 'eb111111-1111-1111-1111-111111111111';

-- ── DC2-01: verified caller Pv gets the directory ──────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"ea111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.list_discoverable_companies();
  IF v_n < 1 THEN RAISE EXCEPTION 'DC2-01 FAIL: verified caller got % rows, expected >= 1', v_n; END IF;
END $$;
RESET ROLE;

-- ── DC2-02: unverified caller Pu gets zero ─────────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"eb111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.list_discoverable_companies();
  IF v_n <> 0 THEN RAISE EXCEPTION 'DC2-02 FAIL: unverified caller got % rows, expected 0 (SEC-01 gate missing)', v_n; END IF;
END $$;
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'list_discoverable_companies_verified_gate_test: ALL PASSED (DC2-01..02)'; END $$;

ROLLBACK;
