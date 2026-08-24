-- ============================================================================
-- T11 — deny-by-default for TABLES. The half session 77 never installed.
-- ----------------------------------------------------------------------------
-- `20260817120000` installed deny-by-default for FUNCTIONS: an
-- ALTER DEFAULT PRIVILEGES narrowing plus the
-- `revoke_anon_execute_on_new_function` event trigger. NOTHING EQUIVALENT
-- EXISTED FOR RELATIONS. `pg_default_acl` still granted `anon = arwdDxtm` and
-- `authenticated = arwdDxtm` on every new table, so both roles held TRUNCATE
-- and TRIGGER across the schema.
--
-- Measured immediately before this migration: **anon held 614 table privileges
-- in `public`** — TRUNCATE on 89 tables, INSERT on 88, DELETE on 88, UPDATE on
-- 86, SELECT on 85. `authenticated` held TRUNCATE on 91 and TRIGGER on 92.
--
-- ⚠️ RLS DOES NOT APPLY TO TRUNCATE. The policy expression that refuses a
-- signed-out INSERT/UPDATE/DELETE does nothing against it. The append-only,
-- hash-chained `audit_log` — the tamper-evidence spine — was erasable by an
-- unauthenticated role. Proven in the ticket with real rows, and again in
-- cell 5 of this migration's suite.
--
-- REACHABILITY, STATED HONESTLY SO THIS IS NOT OVERCLAIMED: PostgREST emits
-- neither TRUNCATE nor DDL, so neither was reachable from the app's public
-- surface today. This is a grant-level hole one FK or one new client from
-- mattering — and T09 already met it once: `TRUNCATE company CASCADE` as anon
-- failed ONLY because the cascade reached `relationship`, whose TRUNCATE T09
-- happened to have revoked for unrelated reasons.
--
-- ⚠️ ENUMERATED BEFORE REVOKING (T09's method; the ticket's fourth criterion):
--   * **NO RLS policy in schema `public` names `anon`.** Checked across every
--     policy in the database — the only three naming anon or public live in
--     `cron` (job, job_run_details) and `storage` (avatars_public_select), and
--     this migration touches neither schema. anon's 614 grants are therefore
--     unreachable today as well as unwanted.
--   * The one public route that renders database content, `/c/[handle]`, goes
--     through the `get_public_profile` SECURITY DEFINER RPC — which runs as its
--     owner and needs no table grant. Verified by reading the route: it calls
--     `getPublicProfile`, and there is no `.from(` anywhere under `src/app/c/`.
--   * `authenticated` KEEPS SELECT/INSERT/UPDATE/DELETE. Only TRUNCATE and
--     TRIGGER are removed, and PostgREST emits neither. Guarded by cell 4,
--     which is the cell that fails if someone later widens this into a blanket
--     `REVOKE ALL ... FROM authenticated`.
--
-- WHY `ALTER DEFAULT PRIVILEGES` IS ENOUGH HERE, WHEN IT WAS NOT FOR FUNCTIONS:
-- S3 records that `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS
-- FROM PUBLIC` does not work, because Postgres merges its BUILT-IN `EXECUTE TO
-- PUBLIC` grant on top of any pg_default_acl entry. **Tables have no such
-- built-in PUBLIC grant**, and the same statement against a NAMED role was
-- already proven to propagate (session 77's function narrowing shows exactly
-- that: `postgres | f | postgres=X,authenticated=X,service_role=X` — anon
-- absent). So the stored default does the work here.
--
-- The event trigger below is therefore belt-and-braces, not the primary
-- mechanism: `ALTER DEFAULT PRIVILEGES` is scoped to the ROLE that creates the
-- object, and a table created by any role other than `postgres` would miss the
-- narrowing entirely. The trigger has no such blind spot. Both ship, because
-- the ticket's requirement is a MECHANISM rather than a rule in a doc, and
-- cell 3 asserts the mechanism actually fires rather than that it exists.
--
-- Proof: supabase/tests/table_privilege_lockdown_test.sql (5 cells; 1, 2, 3, 5
-- RED before this migration, 4 a regression guard that passes before and after).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The existing surface.
-- ----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;

-- Named verbs, not ALL: authenticated's read/write grants are what the entire
-- app runs on and are deliberately untouched.
revoke truncate, trigger on all tables in schema public from authenticated;

-- ----------------------------------------------------------------------------
-- 2. The stored default, so new tables start closed.
-- ----------------------------------------------------------------------------
alter default privileges for role postgres in schema public
  revoke all on tables from anon;

alter default privileges for role postgres in schema public
  revoke truncate, trigger on tables from authenticated;

-- ----------------------------------------------------------------------------
-- 3. The mechanism that has no role blind spot.
--
-- Mirrors `revoke_anon_execute_on_new_function` (20260817120000 §4) exactly,
-- including SECURITY DEFINER + an empty search_path.
-- ----------------------------------------------------------------------------
create or replace function public.revoke_anon_privileges_on_new_table()
returns event_trigger
language plpgsql
security definer
set search_path to ''
as $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.object_identity
      FROM pg_event_trigger_ddl_commands() c
     WHERE c.command_tag IN ('CREATE TABLE', 'CREATE VIEW', 'CREATE MATERIALIZED VIEW')
       AND c.schema_name = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON %s FROM anon', r.object_identity);
    EXECUTE format('REVOKE TRUNCATE, TRIGGER ON %s FROM authenticated', r.object_identity);
  END LOOP;
END;
$$;

comment on function public.revoke_anon_privileges_on_new_table() is
  'T11: deny-by-default for relations. ALTER DEFAULT PRIVILEGES is scoped to the '
  'creating role, so a table created by any role other than postgres would slip '
  'through it; this trigger has no such blind spot. Assert that it FIRES (create '
  'a throwaway table and read the ACL back), never that it exists.';

drop event trigger if exists revoke_anon_privileges_on_new_table_trg;
create event trigger revoke_anon_privileges_on_new_table_trg
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE VIEW', 'CREATE MATERIALIZED VIEW')
  execute function public.revoke_anon_privileges_on_new_table();
