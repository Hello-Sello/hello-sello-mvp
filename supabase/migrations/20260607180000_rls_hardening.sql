-- ============================================================================
-- Migration — RLS hardening (advisor follow-ups)
-- ----------------------------------------------------------------------------
-- 1. Tighten company_insert: was WITH CHECK (true) (flagged rls_policy_always_true).
--    Onboarding still works — a user with no company yet may create one and must
--    own it — but they can't spam arbitrary companies or set someone else's
--    created_by. (current_company_id() IS NULL = the onboarding window.)
-- 2. De-expose the two trigger functions from PostgREST RPC. Trigger functions
--    fire regardless of EXECUTE grant, so revoking from PUBLIC is safe and
--    removes the /rest/v1/rpc/* surface (clears the SECURITY DEFINER advisories
--    for these two). The RLS *helper* functions stay executable (policies need
--    them) — moving those to a private schema is a separate follow-up.
-- ============================================================================

DROP POLICY IF EXISTS company_insert ON company;
CREATE POLICY company_insert ON company FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND current_company_id() IS NULL);

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_log_compute_hash() FROM PUBLIC;
