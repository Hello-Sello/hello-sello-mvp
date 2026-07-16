-- ============================================================================
-- person_company_lockdown_test.sql — company_id self-write lockdown proof
-- ----------------------------------------------------------------------------
-- Proves an authenticated caller cannot rewrite their own person.company_id
-- directly (the cross-tenant self-join hole), while the trusted onboard_company
-- path can still set it legitimately for a brand-new company.
--
-- Mirrors cross_tenant_lockdown_test.sql: one BEGIN…ROLLBACK transaction that
-- creates ephemeral fixtures, impersonates each caller, asserts, and leaves NO
-- trace. Impersonation: set request.jwt.claims (what auth.uid() reads) + SET
-- LOCAL ROLE, so queries run exactly as that caller with RLS active. RESET ROLE
-- between perspectives. Any failed assertion RAISEs and aborts; success prints
-- 'ALL PERSON-COMPANY LOCKDOWN TESTS PASSED'.
--
-- Run:  bash supabase/tests/run_person_company_lockdown_test.sh
--
-- ⚠️  RED-FIRST: this file is EXPECTED TO FAIL against the pre-fix schema — the
-- direct UPDATE in (1) currently SUCCEEDS (that IS the hole), which is the proof
-- the probe genuinely exercises it. It goes GREEN once the fix lands: REVOKE
-- UPDATE ON person FROM authenticated + re-GRANT an explicit column allowlist
-- omitting company_id, and onboard_company becomes SECURITY DEFINER. Do NOT
-- "fix" it green here — RED is the correct state until the lockdown migration ships.
--
-- Fixtures (privileged role; rolled back). UUID prefix e… — confirmed unused by
-- the demo-world / relationship-demo / Path-B seeds (which use a…/b…/c…/d…).
--   Attacker (company-less)      = e1111111-…  Victim company = GreenLeaf (aaaaaaaa-…)
--   Second company-less caller   = e2222222-…  (isolates the onboard_company
--                                                check from whatever (1) does)
-- ============================================================================

BEGIN;

-- ── Fixtures: two fresh company-less callers (mirrors join_request_isolation_
-- test's pattern — insert into auth.users, the on_auth_user_created trigger
-- creates the person row with company_id NULL). Two SEPARATE identities so the
-- onboard_company check in (2) isn't confounded by whatever (1)'s attack did to
-- caller e1111111's company_id. ──
INSERT INTO auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'e1111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'dev88-attacker@example.test',
   '{"first_name":"Eve","last_name":"Attacker","full_name":"Eve Attacker"}', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000000', 'e2222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'dev88-founder@example.test',
   '{"first_name":"Fay","last_name":"Founder","full_name":"Fay Founder"}', NOW(), NOW());

-- ── (1) THE ATTACK — a company-less caller directly rewrites their own
-- person.company_id to an existing company they never joined (GreenLeaf). This
-- MUST be rejected. Against the pre-fix schema it SUCCEEDS — that success IS the
-- hole this migration closes. ──
SELECT set_config('request.jwt.claim.sub', 'e1111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"e1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_denied boolean := false;
BEGIN
  BEGIN
    UPDATE person SET company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      WHERE id = 'e1111111-1111-1111-1111-111111111111';
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true; -- correctly denied at the grant door
  END;

  IF NOT v_denied THEN
    IF (SELECT company_id FROM person WHERE id = 'e1111111-1111-1111-1111-111111111111')
        = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    THEN
      RAISE EXCEPTION 'LEAK: caller self-set company_id to a company they never joined';
    END IF;
  END IF;
END $$;
RESET ROLE;

-- ── (2) NO OVER-LOCK — the trusted onboard_company path must still be able to
-- link a caller to a brand-new company. Must pass BEFORE and AFTER the fix —
-- it's the legitimate path the lockdown must not break. A SEPARATE caller
-- (e2222222) so this check never depends on how (1) resolved. ──
SELECT set_config('request.jwt.claim.sub', 'e2222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"e2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_new_company uuid;
BEGIN
  v_new_company := onboard_company('Fay Test Co', 'DE', '{}', '{}', NULL);
  IF (SELECT company_id FROM person WHERE id = 'e2222222-2222-2222-2222-222222222222')
      IS DISTINCT FROM v_new_company
  THEN
    RAISE EXCEPTION 'REGRESSION: onboard_company did not link the caller to the new company';
  END IF;
END $$;
RESET ROLE;

ROLLBACK;
SELECT 'ALL PERSON-COMPANY LOCKDOWN TESTS PASSED' AS result;
