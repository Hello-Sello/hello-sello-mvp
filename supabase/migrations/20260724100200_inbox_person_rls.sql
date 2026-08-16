-- ============================================================================
-- inbox RLS — let the TARGET PERSON see & act on a person request (PG-5)
-- ----------------------------------------------------------------------------
-- PG-4 added receiver_person_id; the inbox policies were still company-keyed, so
-- the target person could neither see nor accept a request aimed at them.
--
-- Rebuilt from the LIVE body of both policies (20260607170000_rls_policies.sql:
-- 231-237); the ONLY change is the added `OR receiver_person_id = auth.uid()`
-- branch on inbox_select (USING) and inbox_update (USING + WITH CHECK). The
-- company branches are byte-identical to live. inbox_insert is untouched (a
-- person-connect sender still has sender_company_id = current_company_id()).
--
-- Diff vs live:
--   inbox_select USING:  + OR receiver_person_id = auth.uid()
--   inbox_update USING:   + OR receiver_person_id = auth.uid()
--   inbox_update W/CHECK: + OR receiver_person_id = auth.uid()
-- Shared table (Ayush's lane) — sync-locked; new migration only.
-- ============================================================================

DROP POLICY IF EXISTS inbox_select ON public.pending_inbox_item;
CREATE POLICY inbox_select ON public.pending_inbox_item FOR SELECT TO authenticated
  USING (
    receiver_company_id = current_company_id()
    OR sender_company_id = current_company_id()
    OR receiver_person_id = auth.uid()
  );

DROP POLICY IF EXISTS inbox_update ON public.pending_inbox_item;
CREATE POLICY inbox_update ON public.pending_inbox_item FOR UPDATE TO authenticated
  USING (
    receiver_company_id = current_company_id()
    OR receiver_person_id = auth.uid()
  )
  WITH CHECK (
    receiver_company_id = current_company_id()
    OR receiver_person_id = auth.uid()
  );
