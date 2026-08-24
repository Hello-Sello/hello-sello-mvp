-- ============================================================================
-- anon_execute_lockdown_test.sql — nothing in schema public is anon-executable
-- ----------------------------------------------------------------------------
-- Guards the invariant established by 20260817120000_anon_execute_lockdown.sql:
--
--     `anon` may EXECUTE exactly ONE function in schema public —
--     get_public_profile, which serves the public /c/<handle> page.
--
-- WHY THIS CANNOT BE A DATABASE DEFAULT. The obvious fix is ALTER DEFAULT
-- PRIVILEGES. Only half of it is reachable:
--   * revoking `anon` from the default DOES work (proven — a new function is
--     born without an anon entry in proacl);
--   * revoking PUBLIC does NOT. Postgres merges its built-in "EXECUTE TO PUBLIC"
--     for functions on top of any pg_default_acl entry, and ALTER DEFAULT
--     PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC cannot suppress it
--     (verified: revoking `authenticated` the same way DID propagate, so the
--     stored default IS honoured — PUBLIC specifically is not removable).
--     This is long-standing Postgres behaviour, not a Supabase quirk: reported
--     as Postgres BUG #8685 (2013) and still open against Supabase as
--     supabase/supabase#43884, whose reporter settled on the same event-trigger
--     workaround used here.
-- Since anon is a member of PUBLIC, a new function is anon-reachable the moment
-- it is created. So enforcement lives in the `revoke_anon_execute_on_new_function`
-- EVENT TRIGGER (migration 20260817120000 § 4), which strips PUBLIC + anon as
-- part of the CREATE FUNCTION command itself.
--
-- This test is the PROOF, not the enforcement: section (1) catches anything that
-- slipped through, section (4) proves the trigger is actually firing. Both matter
-- — a trigger that silently stopped working would otherwise look identical to a
-- codebase with nothing to find.
--
-- Reads catalogs only — no fixtures, no writes, nothing to roll back for (1).
-- Sections (2) and (3) impersonate callers inside BEGIN…ROLLBACK, mirroring
-- person_company_lockdown_test.sql.
--
-- Run:  bash supabase/tests/run_anon_execute_lockdown_test.sh
-- ============================================================================

-- ── (1) THE INVARIANT — enumerate every anon-executable function in public and
-- fail with the offenders named. `anon` reaches a function through EITHER its own
-- grant OR the PUBLIC grant, and has_function_privilege() accounts for both, so
-- this catches whichever half a future migration forgets. ──
DO $$
DECLARE
  v_allowed  text[] := ARRAY['get_public_profile'];
  v_offenders text;
BEGIN
  SELECT string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
                    E'\n  ' ORDER BY p.proname)
    INTO v_offenders
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prokind = 'f'
     AND has_function_privilege('anon', p.oid, 'EXECUTE')
     AND NOT (p.proname = ANY (v_allowed));

  IF v_offenders IS NOT NULL THEN
    RAISE EXCEPTION E'ANON-EXECUTABLE FUNCTIONS FOUND in schema public:\n  %\n\nEvery RPC must ship with: REVOKE EXECUTE ON FUNCTION public.<name>(<args>) FROM PUBLIC, anon;\nIf a function is DELIBERATELY public, add it to v_allowed here AND have its migration GRANT EXECUTE to anon AFTER creating it (the event trigger revokes at creation time, so the later grant wins).', v_offenders;
  END IF;
END $$;

-- ── (2) NO OVER-LOCK — the one allowlisted function must still be reachable by a
-- signed-out visitor, or the /c/<handle> QR page breaks. ──
BEGIN;
SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM * FROM public.get_public_profile('no-such-handle');
EXCEPTION WHEN insufficient_privilege THEN
  RAISE EXCEPTION 'OVER-LOCK: anon can no longer call get_public_profile — the public /c/<handle> page is broken';
END $$;
RESET ROLE;
ROLLBACK;

-- ── (3) PRIVILEGE ESCALATION — seed_company_superadmin creates a Superadmin
-- group and grants team.manage / company.edit_profile to any person_id handed to
-- it, and checks NOTHING about its caller. It was granted to `authenticated`, so
-- an ordinary member could promote themselves inside their own company with one
-- call. Only onboard_company and the Phase-11 backfill call it, both as the
-- owner `postgres`, so no legitimate caller needs the grant.
--
-- ⚠️  RED-FIRST: against the pre-fix schema this section FAILS — the call
-- SUCCEEDS and has_permission('team.manage') flips false → true. That success IS
-- the hole. It goes GREEN once the REVOKE lands. ──
BEGIN;
INSERT INTO auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000000', 'e3333333-3333-3333-3333-333333333333',
        'authenticated', 'authenticated', 'anon-lockdown-member@example.test',
        '{"first_name":"Mal","last_name":"Member","full_name":"Mal Member"}', NOW(), NOW());

-- Make the caller an ordinary member of GreenLeaf with NO permissions. Done with
-- the privileged role because person.company_id is deliberately not self-writable.
UPDATE person SET company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
 WHERE id = 'e3333333-3333-3333-3333-333333333333';

SELECT set_config('request.jwt.claim.sub', 'e3333333-3333-3333-3333-333333333333', true);
SELECT set_config('request.jwt.claims', '{"sub":"e3333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_denied boolean := false;
BEGIN
  IF has_permission('team.manage') THEN
    RAISE EXCEPTION 'FIXTURE BROKEN: caller already holds team.manage before the attack';
  END IF;

  BEGIN
    PERFORM seed_company_superadmin(current_company_id(), auth.uid());
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true; -- correctly denied at the grant door
  END;

  IF NOT v_denied AND has_permission('team.manage') THEN
    RAISE EXCEPTION 'ESCALATION: an ordinary member granted themselves team.manage via seed_company_superadmin';
  END IF;
END $$;
RESET ROLE;
ROLLBACK;

-- ── (4) THE AUTO-REVOKE GUARD — a function created from here on must be born
-- locked. This is what actually enforces the invariant, because Postgres always
-- grants EXECUTE to PUBLIC on new functions and ALTER DEFAULT PRIVILEGES cannot
-- take that away (see the header). Proves the event trigger installed by
-- 20260817120000 is present AND firing, not merely defined. ──
BEGIN;
CREATE FUNCTION public.anon_lockdown_probe_fn() RETURNS int LANGUAGE sql AS 'SELECT 1';
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.anon_lockdown_probe_fn()', 'EXECUTE') THEN
    RAISE EXCEPTION 'GUARD NOT FIRING: a newly created function is anon-executable — the revoke_anon_execute_on_new_function_trg event trigger is missing or broken';
  END IF;
END $$;
ROLLBACK;

SELECT 'ALL ANON-EXECUTE LOCKDOWN TESTS PASSED' AS result;
