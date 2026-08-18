-- ============================================================================
-- Capture the `ensure_rls` event trigger into migrations (schema-drift repair)
-- ----------------------------------------------------------------------------
-- WHAT WAS WRONG. public.rls_auto_enable() and its event trigger `ensure_rls`
-- exist on PRODUCTION but were created by hand (Supabase dashboard) and never
-- written into a migration. 20260607170000_rls_policies.sql only mentions it in
-- a comment — "the project's rls_auto_enable already enables it". So a fresh
-- `supabase db reset` produced a database that did NOT match production.
--
-- WHY IT MATTERS. The trigger switches RLS on for every new table in public.
-- 20260607170000 enables RLS in a one-time loop over the tables existing on
-- 2026-06-07; anything created after that depends on its own migration saying
-- so. Without this trigger locally, a future table whose migration forgets
-- `enable row level security` behaves DIFFERENTLY in the two environments:
--   * local — RLS off, rows visible, tests pass, feature looks fine;
--   * prod  — trigger switches RLS on, no policies exist, so every query
--             returns ZERO ROWS with no error.
-- Silent, data-shaped, and very hard to trace back to a trigger you cannot see
-- in the repo. This file removes that divergence.
--
-- NO-OP ON PRODUCTION BY CONSTRUCTION. The body below was copied from prod's
-- live pg_get_functiondef() output and the trigger clause from its live
-- pg_event_trigger row (ddl_command_end, tags CREATE TABLE / CREATE TABLE AS /
-- SELECT INTO), so applying this re-declares prod with what prod already has.
-- On a fresh local reset it CREATES the missing pieces — which is the point.
--
-- Note the ordering: 20260817120000 § 4 installs an event trigger that strips
-- PUBLIC + anon from any function created in public, so on a fresh reset
-- rls_auto_enable() is auto-locked the moment this file creates it — matching
-- the explicit guarded revoke that 20260817120000 § 1 applies on production.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

-- Belt-and-braces: on production this function pre-dates the § 4 auto-revoke
-- trigger, and CREATE OR REPLACE does not re-run the creation hook, so state the
-- lockdown explicitly rather than relying on either mechanism.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon;

-- Idempotent: DROP IF EXISTS then CREATE, so this is safe to re-apply against
-- production where `ensure_rls` is already present.
DROP EVENT TRIGGER IF EXISTS ensure_rls;
CREATE EVENT TRIGGER ensure_rls
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION public.rls_auto_enable();
