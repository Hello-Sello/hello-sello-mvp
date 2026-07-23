-- ============================================================================
-- person_select — add the person↔person visibility branch (PG-3)
-- ----------------------------------------------------------------------------
-- The primary blocker for the social graph. person_select (LIVE body:
-- 20260609183000_rls_connect_counterparty_visibility.sql:56-62) allowed self /
-- own company / HS team / a COMPANY-linked person (can_see_person). A person you
-- are personally — but not company- — connected to therefore read as invisible
-- ("Unknown"). This rebuilds person_select from that LIVE body; the ONLY change
-- is the added `is_person_connected(id)` branch. The four existing branches are
-- byte-identical to live.
--
-- Diff vs live: + or is_person_connected(id)
-- ============================================================================

DROP POLICY IF EXISTS person_select ON public.person;
CREATE POLICY person_select ON public.person FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR company_id = current_company_id()
  OR is_hs_team()
  OR can_see_person(id, company_id)
  OR is_person_connected(id)
);
