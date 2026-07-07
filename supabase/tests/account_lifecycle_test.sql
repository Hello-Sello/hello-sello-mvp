-- ============================================================================
-- account_lifecycle_test.sql — Phase 13 SET-02 lifecycle invariant proof
-- ----------------------------------------------------------------------------
-- Proves the three security-critical invariants of the account/company
-- lifecycle RPCs (20260706090000_account_lifecycle.sql), the same impersonated-
-- SQL way rbac_enforcement_test.sql / join_request_isolation_test.sql do:
--   • (1) OWN-ROW SCOPE — deactivate_account() touches ONLY the caller's own
--         person row (id = auth.uid()); a bystander's row is untouched. The RPC
--         takes NO target id (no overload), so a caller cannot widen the write.
--   • (2) SOLE-SUPERADMIN GUARD — request_account_deletion() by a company's LAST
--         active Superadmin RAISEs 'promote another Superadmin …' (D-11 lockout);
--         once a second Superadmin exists the call succeeds and schedules erasure
--         ~30 days out. Also proves the WITH-company audit path writes one row.
--   • (3) COMPANY-LESS AUDIT (Open-Q #2) — a half-onboarded caller (company_id
--         NULL) can request deletion WITHOUT tripping audit_log.company_id NOT
--         NULL, and writes ZERO audit rows (the guard skipped it).
--
-- Mirrors the RBAC/Path-B harness: ONE BEGIN…ROLLBACK transaction seeding
-- EPHEMERAL fixtures, impersonating each caller via request.jwt.claims + SET
-- LOCAL ROLE authenticated, asserting, and leaving NO trace. RESET ROLE between
-- perspectives so cross-row assertions read as the privileged role. Any failed
-- assertion RAISEs and aborts (psql -v ON_ERROR_STOP=1 → non-zero exit); success
-- prints the all-passed line at the very end.
--
-- Run:  bash supabase/tests/run_account_lifecycle_test.sh
--       (after `supabase db reset` has applied 20260706090000_account_lifecycle.sql)
--
-- Fixtures (privileged role; rolled back). Obviously-test a…/c…/e… UUID space,
-- unused by the demo seed so the probe never collides mid-transaction. auth.users
-- inserts fire on_auth_user_created → a person row (company_id NULL); we attach
-- company_id below (seed.sql §1/§3 pattern). These callers never log in via
-- GoTrue — the test impersonates them directly through request.jwt.claims.
--   Company A (verified) = a0000000-…  Alice = a1111111-…  Bob = a2222222-…
--   Company C (verified) = c0000000-…  Carol = c1111111-…  Dave = c3333333-…
--   Erin (company-less)  = e1111111-…  (company_id NULL — the Open-Q #2 case)
-- ============================================================================

BEGIN;

-- ── Fixture auth users → person rows (trigger). Minimal columns; the test never
-- logs them in. first_name/last_name come from raw_user_meta_data (person NOT
-- NULL). ────────────────────────────────────────────────────────────────────────
INSERT INTO auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'a1111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'life-alice@example.test', '{"first_name":"Alice","last_name":"Life"}', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000000', 'a2222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'life-bob@example.test',   '{"first_name":"Bob","last_name":"Life"}',   NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000000', 'c1111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'life-carol@example.test', '{"first_name":"Carol","last_name":"Life"}', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000000', 'c3333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'life-dave@example.test',  '{"first_name":"Dave","last_name":"Life"}',  NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000000', 'e1111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'life-erin@example.test',  '{"first_name":"Erin","last_name":"Life"}',  NOW(), NOW());

-- ── Two verified companies. Alice+Bob belong to A; Carol+Dave to C. Erin stays
-- company-less (company_id NULL — the Path-to-onboarding / Open-Q #2 state). ───────
INSERT INTO company (id, name, country, verification_status, verified_at, created_by) VALUES
  ('a0000000-0000-0000-0000-000000000000', 'Lifecycle Test Company A', 'DE', 'verified', NOW(),
   'a1111111-1111-1111-1111-111111111111'),
  ('c0000000-0000-0000-0000-000000000000', 'Lifecycle Test Company C', 'DE', 'verified', NOW(),
   'c1111111-1111-1111-1111-111111111111');

UPDATE person SET company_id = 'a0000000-0000-0000-0000-000000000000'
  WHERE id IN ('a1111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222');
UPDATE person SET company_id = 'c0000000-0000-0000-0000-000000000000'
  WHERE id IN ('c1111111-1111-1111-1111-111111111111', 'c3333333-3333-3333-3333-333333333333');

-- ── Company C's Superadmin group. Carol is the SOLE member → current_superadmin_
-- group_id() resolves this group for her, count = 1 (the sole-Superadmin case).
-- Dave is added LATER (mid-test) to make count = 2. ──────────────────────────────
INSERT INTO "group" (id, company_id, name, created_by) VALUES
  ('c9000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000000', 'Superadmin',
   'c1111111-1111-1111-1111-111111111111');

INSERT INTO person_group (person_id, group_id) VALUES
  ('c1111111-1111-1111-1111-111111111111', 'c9000000-0000-0000-0000-000000000000');

-- ════════════════════════════════════════════════════════════════════════════
-- (0) SIGNATURE — the RPCs take NO target id (a caller cannot pass someone else's
--     id to widen the write; own-row scope is structural, not just runtime).
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('deactivate_account', 'reactivate_account',
                         'request_account_deletion', 'cancel_account_deletion')
       AND p.pronargs > 0
  ) THEN
    RAISE EXCEPTION 'SIGNATURE FAIL: a self-account RPC has an argument overload — it must take NO target id';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- (1) OWN-ROW SCOPE — Alice deactivates HERSELF; Bob's row is untouched.
-- ════════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT public.deactivate_account();
RESET ROLE;

DO $$
BEGIN
  IF (SELECT deactivated_at FROM public.person WHERE id = 'a1111111-1111-1111-1111-111111111111') IS NULL THEN
    RAISE EXCEPTION 'SCOPE FAIL: deactivate_account did NOT set the caller (Alice) deactivated_at';
  END IF;
  IF (SELECT deactivated_at FROM public.person WHERE id = 'a2222222-2222-2222-2222-222222222222') IS NOT NULL THEN
    RAISE EXCEPTION 'SCOPE LEAK: deactivate_account touched a bystander (Bob) — write not scoped to auth.uid()';
  END IF;
  -- WITH-company caller writes exactly one account.deactivated audit row (Alice ∈ A)
  IF (SELECT count(*) FROM public.audit_log
        WHERE actor_person_id = 'a1111111-1111-1111-1111-111111111111'
          AND action = 'account.deactivated') <> 1 THEN
    RAISE EXCEPTION 'AUDIT FAIL: company-ful deactivate_account did not write exactly one audit row';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- (2) SOLE-SUPERADMIN GUARD — Carol is C's only Superadmin: request deletion
--     RAISEs. Add Dave as a second Superadmin: the call then succeeds + schedules
--     erasure ~30 days out and writes one account.deletion_requested audit row.
-- ════════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claim.sub', 'c1111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"c1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_raised boolean := false;
  v_msg    text;
BEGIN
  BEGIN
    PERFORM public.request_account_deletion();
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
    v_msg    := SQLERRM;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'LOCKOUT FAIL: the sole Superadmin was allowed to schedule self-erasure (company left headless)';
  END IF;
  IF position('promote another Superadmin' in v_msg) = 0 THEN
    RAISE EXCEPTION 'LOCKOUT FAIL: wrong RAISE message (expected to mention "promote another Superadmin"): %', v_msg;
  END IF;
END $$;
RESET ROLE;

-- The lockout must have blocked the write entirely (no partial schedule).
DO $$
BEGIN
  IF (SELECT deletion_scheduled_for FROM public.person WHERE id = 'c1111111-1111-1111-1111-111111111111') IS NOT NULL THEN
    RAISE EXCEPTION 'LOCKOUT FAIL: a blocked request_account_deletion still scheduled erasure';
  END IF;
END $$;

-- Promote a second Superadmin (privileged fixture write).
INSERT INTO person_group (person_id, group_id) VALUES
  ('c3333333-3333-3333-3333-333333333333', 'c9000000-0000-0000-0000-000000000000');

-- Now Carol's request succeeds.
SELECT set_config('request.jwt.claim.sub', 'c1111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"c1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT public.request_account_deletion();
RESET ROLE;

DO $$
DECLARE
  v_sched timestamptz;
BEGIN
  SELECT deletion_scheduled_for INTO v_sched
    FROM public.person WHERE id = 'c1111111-1111-1111-1111-111111111111';
  IF v_sched IS NULL THEN
    RAISE EXCEPTION 'SCHEDULE FAIL: request_account_deletion did not set deletion_scheduled_for once a 2nd Superadmin existed';
  END IF;
  IF v_sched NOT BETWEEN now() + interval '29 days' AND now() + interval '31 days' THEN
    RAISE EXCEPTION 'SCHEDULE FAIL: deletion_scheduled_for is not ~30 days out (got %)', v_sched;
  END IF;
  IF (SELECT deactivated_at FROM public.person WHERE id = 'c1111111-1111-1111-1111-111111111111') IS NULL THEN
    RAISE EXCEPTION 'SCHEDULE FAIL: request_account_deletion did not also deactivate the account';
  END IF;
  IF (SELECT count(*) FROM public.audit_log
        WHERE actor_person_id = 'c1111111-1111-1111-1111-111111111111'
          AND action = 'account.deletion_requested') <> 1 THEN
    RAISE EXCEPTION 'AUDIT FAIL: successful request_account_deletion did not write exactly one audit row';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- (3) COMPANY-LESS AUDIT (Open-Q #2) — Erin (company_id NULL) can request
--     deletion WITHOUT tripping audit_log.company_id NOT NULL, and writes ZERO
--     audit rows (the in-RPC guard skipped the company-scoped insert).
-- ════════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claim.sub', 'e1111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"e1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_raised boolean := false;
  v_msg    text;
BEGIN
  BEGIN
    PERFORM public.request_account_deletion();
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
    v_msg    := SQLERRM;
  END;
  IF v_raised THEN
    RAISE EXCEPTION 'COMPANY-LESS FAIL: request_account_deletion raised for a company-less caller: %', v_msg;
  END IF;
END $$;
RESET ROLE;

DO $$
BEGIN
  -- The RPC still updated Erin's OWN row (proves it ran to completion, no crash)…
  IF (SELECT deletion_scheduled_for FROM public.person WHERE id = 'e1111111-1111-1111-1111-111111111111') IS NULL THEN
    RAISE EXCEPTION 'COMPANY-LESS FAIL: request_account_deletion did not schedule erasure for the company-less caller';
  END IF;
  -- …but wrote NO audit row (the company_id-NULL guard skipped the insert).
  IF (SELECT count(*) FROM public.audit_log
        WHERE actor_person_id = 'e1111111-1111-1111-1111-111111111111') <> 0 THEN
    RAISE EXCEPTION 'COMPANY-LESS FAIL: a company-less request_account_deletion wrote an audit row (guard did not skip)';
  END IF;
END $$;

ROLLBACK;
SELECT 'ALL ACCOUNT LIFECYCLE TESTS PASSED' AS result;
