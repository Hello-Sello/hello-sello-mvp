-- ============================================================================
-- Migration 0 — the stack's default privileges, stated explicitly
-- ----------------------------------------------------------------------------
-- Runs BEFORE every other migration (timestamp 090000, one second ahead of
-- 090001). Everything below is a re-statement of what a Supabase stack has
-- always issued at init for role `postgres` in schema `public`. Nothing here
-- is a new grant: production's `pg_default_acl` already holds these exact
-- values, so applying this migration there is a verified no-op.
--
-- WHY IT EXISTS
-- The local CLI stopped issuing them. On CLI 10.9.7 a clean `db reset` leaves
-- role `postgres` with `anon=Dxtm authenticated=Dxtm service_role=Dxtm` on
-- TABLES — INSERT/SELECT/UPDATE/DELETE stripped — while the `supabase_admin`
-- row in the same database still carries the full `arwdDxtm`. Result:
-- `authenticated` could SELECT 1 of 93 tables, `/rest/v1/person` 403'd,
-- `requireVerified()` failed closed, and every gated route bounced to /home.
-- Nine RPCs were unreachable for the same reason on FUNCTIONS. The database
-- was unusable and no repo migration caused it.
--
-- WHY IT RUNS FIRST, AND WHY THAT IS THE WHOLE DESIGN
-- ALTER DEFAULT PRIVILEGES only affects objects created AFTER it. Placed
-- first, every table, sequence and function born in the 147 migrations that
-- follow inherits the right grants — and every deliberate REVOKE in those
-- migrations still runs LATER and still wins. Specifically preserved:
--   · person.company_id  — the column-level UPDATE revoke (privilege
--     escalation fix, 20260710120000). Re-granting it here would be the bug.
--   · anon EXECUTE on functions — revoked by 20260817120000 § 3 and enforced
--     by its event trigger. Granted below, revoked there; end state = prod.
-- That ordering is why this is one statement of the rule rather than a copy
-- of every revoke in the tree. Do NOT "fix" grant drift by re-granting after
-- migrations (e.g. from `supabase/policies/`): that runs last, silently undoes
-- the revokes above, and makes the lockdown suites assert a state no real
-- environment has.
--
-- RLS, not grants, is the access boundary. `anon` holding table privileges is
-- the standard Supabase model and matches production exactly; every table in
-- this schema is RLS-enabled (enforced by the `ensure_rls` event trigger).
--
-- Verified 2026-08-22 against production `pg_default_acl` (schema public,
-- role postgres): tables `arwdDxtm`, sequences `rwU`, functions `X`.
-- ============================================================================

alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated, service_role;
