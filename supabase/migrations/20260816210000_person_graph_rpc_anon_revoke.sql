-- ============================================================================
-- person-graph RPCs — explicitly revoke EXECUTE from `anon`
-- ----------------------------------------------------------------------------
-- The five person-graph RPCs shipped with `REVOKE ALL ... FROM public` +
-- `GRANT EXECUTE ... TO authenticated`. That is NOT sufficient on Supabase:
-- `anon` is a real role that receives EXECUTE on new public functions through
-- ALTER DEFAULT PRIVILEGES, and revoking from PUBLIC does not remove a role's
-- own grant. So all five stayed callable unauthenticated via
-- /rest/v1/rpc/<name> (flagged by the database linter,
-- lint 0028_anon_security_definer_function_executable).
--
-- No data was exposed: every body gates on auth.uid() (NULL for anon) and the
-- list RPCs additionally gate on public.is_caller_verified() (false for anon) —
-- probed on production, all three list RPCs returned 0 rows and
-- accept_person_connection raised before any write. This migration removes the
-- reliance on those body gates alone, matching the standard set by
-- 20260814120000 (tier ladder), which revokes `anon` explicitly on
-- list_discoverable_companies.
--
-- Grants only — no function body is touched, so no stale-redeclare risk.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.accept_person_connection(uuid)      FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_person_connected(uuid)           FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_my_person_connections()        FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_incoming_person_requests()     FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_discoverable_people()          FROM anon;
