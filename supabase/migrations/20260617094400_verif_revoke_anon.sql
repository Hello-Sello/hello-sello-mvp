-- Phase 3 bug-fix: explicit anon EXECUTE revoke on all admin verification RPCs.
--
-- Two-door D-13 pattern (per SEC-01 precedent at 20260617090000):
--   revoke all … from public  removes the PUBLIC grant
--   revoke execute … from anon  closes the named-role door
-- Both steps are required because Supabase creates functions owned by postgres which
-- pre-grants EXECUTE to anon, authenticated, and service_role via default privileges.
-- The 03-02/03-03 migrations performed revoke-from-public but missed the named anon
-- revoke, leaving has_function_privilege('anon', …, 'EXECUTE') = true.
-- This migration adds the missing explicit revokes to match the SEC-01 pattern.
-- VERIF-05 SQL invariant test (admin_verification_test.sql) goes GREEN after this.
-- ----------------------------------------------------------------------------

-- From 20260617094200_verif_admin_rpcs.sql
revoke execute on function public.list_pending_verifications()     from anon;
revoke execute on function public.get_verification_detail(uuid)    from anon;
revoke execute on function public.approve_company(uuid)            from anon;

-- From 20260617094300_verif_reject_and_licence.sql
revoke execute on function public.reject_company(uuid, text, text) from anon;
revoke execute on function public.list_decided_verifications()     from anon;
revoke execute on function public.get_company_licences(uuid)       from anon;
revoke execute on function public.log_license_viewed(uuid)         from anon;
