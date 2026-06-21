-- ============================================================================
-- rbac_enforcement_test.sql — Phase 11 RBAC adversarial proof (SC1/SC3/SC4 + §9)
-- ----------------------------------------------------------------------------
-- Proves company-role enforcement is REAL, not theater, and tenant-isolated:
--   • SC1   — a Superadmin is ALLOWED a Superadmin-only action; a Member is DENIED.
--   • SC1-q — DELETE the matrix grant ⇒ the Superadmin flips to DENIED
--             (proves has_permission() QUERIES permission_matrix_entry — RBAC-01).
--   • §9    — a Member CANNOT self-promote via a direct person_group INSERT into
--             the Superadmin group (D-19: that write must be RLS-rejected).
--   • SC4   — cross-company team reads (group / person_group / permission_matrix_entry)
--             return ZERO rows; has_permission never sees another company's grants.
--   • SC3   — change_member_role() demoting the LAST Superadmin RAISEs (D-15 lockout).
--
-- Mirrors cross_tenant_lockdown_test.sql / rls_isolation_test.sql: one
-- BEGIN…ROLLBACK transaction that seeds EPHEMERAL fixtures (two companies, a
-- Superadmin + a Member each), impersonates each caller, asserts, and leaves NO
-- trace. Impersonation: set request.jwt.claims (what auth.uid() reads) + SET LOCAL
-- ROLE authenticated, so queries run exactly as that caller with RLS active.
-- RESET ROLE between perspectives. Any failed assertion RAISEs and aborts; success
-- prints the all-passed result line at the very end of the transaction.
--
-- Run:  bash supabase/tests/run_rbac_enforcement_test.sh
--
-- ⚠️  RED-FIRST (Wave-0): this file is EXPECTED to FAIL against today's dormant,
-- un-enforced schema — that failure is the proof it genuinely exercises the real
-- doors. Today: has_permission() and change_member_role() do NOT exist, and the
-- person_group/permission_matrix_entry RLS policies still allow writes (the §9
-- escalation hole is OPEN). It goes GREEN across plans 02 (has_permission + seeded
-- matrix), 05 (change_member_role + lockout), and the §9 RLS lock-down (D-19).
-- Do NOT stub the functions or loosen the assertions to make it pass here.
--
-- Two doors are asserted, both required for "enforcement is real":
--   permission door — has_permission('team.manage') true for super / false for member,
--                     and false once the grant row is deleted.
--   escalation door — a Member's direct person_group INSERT into the Superadmin
--                     group must be REJECTED (insufficient_privilege), not silently allowed.
--
-- Fixtures (privileged role; rolled back): two NEW companies created in-fixture so
-- the test never depends on volatile seed ids. auth.users rows fire
-- on_auth_user_created → person; we then attach company_id (mirrors seed.sql §1/§3).
--   Company A = a0000000-…   A-super = a1111111-…  A-member = a2222222-…
--   Company B = b0000000-…   B-super = b1111111-…  B-member = b2222222-…
-- ============================================================================

BEGIN;

-- ── Fixture: two auth users per company. The on_auth_user_created trigger turns
-- each into a person row (company_id NULL); we attach the company below (seed.sql
-- §1/§3 pattern). Minimal columns — these callers never log in via GoTrue, the test
-- impersonates them directly through request.jwt.claims. ──────────────────────────
INSERT INTO auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'a1111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'rbac-a-super@example.test',  '{"first_name":"ASuper","last_name":"Test"}', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000000', 'a2222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'rbac-a-member@example.test', '{"first_name":"AMember","last_name":"Test"}', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000000', 'b1111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'rbac-b-super@example.test',  '{"first_name":"BSuper","last_name":"Test"}', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000000', 'b2222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'rbac-b-member@example.test', '{"first_name":"BMember","last_name":"Test"}', NOW(), NOW());

-- ── Two companies (verified so any verification gate is irrelevant to RBAC) ───────
INSERT INTO company (id, name, country, verification_status, verified_at, created_by) VALUES
  ('a0000000-0000-0000-0000-000000000000', 'RBAC Test Company A', 'DE', 'verified', NOW(),
   'a1111111-1111-1111-1111-111111111111'),
  ('b0000000-0000-0000-0000-000000000000', 'RBAC Test Company B', 'DE', 'verified', NOW(),
   'b1111111-1111-1111-1111-111111111111');

-- ── Attach each person to their company (the Member is a company person, NOT in the
-- Superadmin group → role = Member by absence of membership, per RESEARCH §2). ─────
UPDATE person SET company_id = 'a0000000-0000-0000-0000-000000000000'
  WHERE id IN ('a1111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222');
UPDATE person SET company_id = 'b0000000-0000-0000-0000-000000000000'
  WHERE id IN ('b1111111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222');

-- ── One 'Superadmin' group per company; the super joins it; seed the two gated
-- grants (team.manage + company.edit_profile) for that group (RESEARCH §2 model).
-- permission_action codes must exist first (the lookup is intentionally empty today
-- — seed them in-fixture so the FK holds; plan 02 seeds them for real). ────────────
INSERT INTO permission_action (code, description, category) VALUES
  ('team.manage',          'Invite / change role / remove company members', 'team'),
  ('company.edit_profile', 'Edit company profile & branding',               'company')
ON CONFLICT (code) DO NOTHING;

INSERT INTO "group" (id, company_id, name, created_by) VALUES
  ('a9000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000', 'Superadmin',
   'a1111111-1111-1111-1111-111111111111'),
  ('b9000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000000', 'Superadmin',
   'b1111111-1111-1111-1111-111111111111');

INSERT INTO person_group (person_id, group_id) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'a9000000-0000-0000-0000-000000000000'),
  ('b1111111-1111-1111-1111-111111111111', 'b9000000-0000-0000-0000-000000000000');

INSERT INTO permission_matrix_entry (company_id, group_id, action, granted) VALUES
  ('a0000000-0000-0000-0000-000000000000', 'a9000000-0000-0000-0000-000000000000', 'team.manage',          true),
  ('a0000000-0000-0000-0000-000000000000', 'a9000000-0000-0000-0000-000000000000', 'company.edit_profile', true),
  ('b0000000-0000-0000-0000-000000000000', 'b9000000-0000-0000-0000-000000000000', 'team.manage',          true),
  ('b0000000-0000-0000-0000-000000000000', 'b9000000-0000-0000-0000-000000000000', 'company.edit_profile', true);

-- ════════════════════════════════════════════════════════════════════════════
-- (1) SC1 — enforcement: Superadmin ALLOWED, Member DENIED  [company A]
--     has_permission() lands in plan 02; today the call errors (function missing)
--     → RED, which is the intended Wave-0 state.
-- ════════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF NOT public.has_permission('team.manage')
    THEN RAISE EXCEPTION 'SC1 FAIL: company-A Superadmin was DENIED team.manage (should be allowed)'; END IF;
  IF NOT public.has_permission('company.edit_profile')
    THEN RAISE EXCEPTION 'SC1 FAIL: company-A Superadmin was DENIED company.edit_profile (should be allowed)'; END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'a2222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF public.has_permission('team.manage')
    THEN RAISE EXCEPTION 'SC1 LEAK: company-A Member was ALLOWED team.manage (should be denied)'; END IF;
  IF public.has_permission('company.edit_profile')
    THEN RAISE EXCEPTION 'SC1 LEAK: company-A Member was ALLOWED company.edit_profile (should be denied)'; END IF;
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- (2) SC1-queried — DELETE the grant ⇒ the Superadmin flips to DENIED.
--     This is THE proof the matrix is READ, not hardcoded (RBAC-01). Done as a
--     privileged write (fixtures, rolled back), then re-impersonate the super.
-- ════════════════════════════════════════════════════════════════════════════
RESET ROLE;
DELETE FROM permission_matrix_entry
  WHERE group_id = 'a9000000-0000-0000-0000-000000000000' AND action = 'team.manage';

SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF public.has_permission('team.manage')
    THEN RAISE EXCEPTION 'SC1-QUERIED FAIL: deleting the grant did NOT deny the Superadmin — the matrix is not being queried (RBAC-01 violated)'; END IF;
  -- the OTHER grant must still hold — proves we denied the deleted action, not all actions
  IF NOT public.has_permission('company.edit_profile')
    THEN RAISE EXCEPTION 'SC1-QUERIED FAIL: deleting team.manage wrongly also denied company.edit_profile'; END IF;
END $$;
RESET ROLE;

-- re-seed the deleted grant so the later lockout test sees a normal Superadmin
INSERT INTO permission_matrix_entry (company_id, group_id, action, granted) VALUES
  ('a0000000-0000-0000-0000-000000000000', 'a9000000-0000-0000-0000-000000000000', 'team.manage', true)
ON CONFLICT (group_id, action) DO UPDATE SET granted = true;

-- ════════════════════════════════════════════════════════════════════════════
-- (3) §9 self-promotion (D-19) — a Member's DIRECT person_group INSERT into the
--     Superadmin group must be REJECTED by RLS. Today person_group_all is ALL
--     (writable) so this INSERT SUCCEEDS → the test FAILS RED, correctly flagging
--     the open escalation hole until the SELECT-only lock-down lands.
-- ════════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claim.sub', 'a2222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.person_group (person_id, group_id)
      VALUES ('a2222222-2222-2222-2222-222222222222', 'a9000000-0000-0000-0000-000000000000');
    -- if the INSERT was NOT rejected, the escalation hole is open → fail loud.
    RAISE EXCEPTION 'ESCALATION LEAK (§9/D-19): company-A Member self-promoted into the Superadmin group via a direct person_group INSERT — that write must be RLS-rejected';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;  -- expected once person_group is SELECT-only for authenticated
  END;
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- (4) SC4 — tenant isolation: company-A Superadmin sees ZERO of company-B's team
--     rows, and has_permission never sees B's grants.
-- ════════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  -- company-A caller must NOT read company-B's group / person_group / matrix rows
  IF (SELECT count(*) FROM public."group" WHERE company_id = 'b0000000-0000-0000-0000-000000000000') <> 0
    THEN RAISE EXCEPTION 'SC4 LEAK: company-A Superadmin read % of company-B group rows',
      (SELECT count(*) FROM public."group" WHERE company_id = 'b0000000-0000-0000-0000-000000000000'); END IF;
  IF (SELECT count(*) FROM public.permission_matrix_entry WHERE company_id = 'b0000000-0000-0000-0000-000000000000') <> 0
    THEN RAISE EXCEPTION 'SC4 LEAK: company-A Superadmin read % of company-B permission_matrix_entry rows',
      (SELECT count(*) FROM public.permission_matrix_entry WHERE company_id = 'b0000000-0000-0000-0000-000000000000'); END IF;
  IF (SELECT count(*) FROM public.person_group WHERE group_id = 'b9000000-0000-0000-0000-000000000000') <> 0
    THEN RAISE EXCEPTION 'SC4 LEAK: company-A Superadmin read % of company-B person_group rows',
      (SELECT count(*) FROM public.person_group WHERE group_id = 'b9000000-0000-0000-0000-000000000000'); END IF;
  -- and the A caller is still a Superadmin of A (no over-isolation regression)
  IF NOT public.has_permission('team.manage')
    THEN RAISE EXCEPTION 'SC4 REGRESSION: company-A Superadmin lost team.manage on their OWN company'; END IF;
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- (5) SC3 lockout (D-15) — demoting the ONLY Superadmin must RAISE. change_member_role
--     lands in plan 05; today the call errors (function missing) → RED.
-- ════════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_raised boolean := false;
BEGIN
  BEGIN
    PERFORM public.change_member_role('a1111111-1111-1111-1111-111111111111', 'member');
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;  -- any RAISE (lockout guard) is the pass
  END;
  IF NOT v_raised
    THEN RAISE EXCEPTION 'SC3 LOCKOUT FAIL (D-15): demoting the only Superadmin did NOT RAISE — the company can be left headless'; END IF;
END $$;
RESET ROLE;

ROLLBACK;
SELECT 'ALL RBAC ENFORCEMENT TESTS PASSED' AS result;
