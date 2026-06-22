-- ============================================================================
-- Phase 5 · CORRECTIVE: tighten the thing / deal_artifact WITH CHECK so a member
-- cannot spoof ownership or hide a shared item from the other company (HI-01).
-- (Ayush, 2026-06-22)
-- ----------------------------------------------------------------------------
-- WHY: the previous migration (20260622090000) put the private-narrow on the
-- USING clause (read/which-rows-are-visible) but left WITH CHECK (the
-- write-time predicate) gated ONLY on can_access_workspace. Because WITH CHECK
-- did not constrain owner_company_id / uploaded_by_company_id or is_private, a
-- workspace member of EITHER relationship company could craft a direct Supabase
-- write that:
--   * INSERTs a row with owner = the OTHER company + is_private = true -
--     planting a fabricated private item into the other side's private view
--     (ownership spoofing / repudiation); or
--   * UPDATEs a currently-SHARED row (is_private = false, so the USING passes)
--     to is_private = true with owner = the other side - the old row passes
--     USING, the new row passes the lax WITH CHECK, and a shared Thing/document
--     becomes HIDDEN from the company that should still see it (unilateral
--     tamper / denial across the company boundary).
--
-- This is NOT a confidentiality leak (the USING narrow still hides the other
-- side's private rows on read), but it is a cross-company INTEGRITY /
-- AUTHORIZATION gap, and RLS is the only line of defence here: thing /
-- deal_artifact are written CLIENT-SIDE (setThingVisibility / assignThing are
-- exported client functions; the columns are directly client-writable), not
-- through a SECURITY DEFINER RPC. The app's own write paths are well-behaved,
-- but a hand-crafted call from an authenticated counterparty is enough.
--
-- THE FIX (the review's HI-01 predicate): add the ownership rule to WITH CHECK
-- so a member can only write a PRIVATE row that their OWN company owns -
--   is_private = false  OR  owner = current_company_id()
-- A shared row (is_private = false) is unconstrained on ownership (sharing is
-- open, D-08), but you can NEVER mark a row private while assigning ownership to
-- the other side, and you can never flip a shared row to private-owned-by-them.
-- can_access_workspace stays (membership), and the USING clause from
-- 20260622090000 is preserved verbatim (this is a policy re-create, not a USING
-- change). No data is touched - every existing row is is_private = false.
--
-- thing keys on owner_company_id (the explicit owner column added in
-- 20260622090000); deal_artifact keys on its EXISTING uploaded_by_company_id.
-- ============================================================================

-- ---------------------------------------------------------------------
-- 1. thing - re-create thing_all, ownership rule added to WITH CHECK.
--    USING is identical to 20260622090000 (the read-side private narrow).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS thing_all ON public.thing;
CREATE POLICY thing_all ON public.thing FOR ALL TO authenticated
  USING (
    public.can_access_workspace(deal_workspace_id)
    AND (is_private = false OR owner_company_id = public.current_company_id())
  )
  WITH CHECK (
    public.can_access_workspace(deal_workspace_id)
    -- can only mark MY OWN company's items private; a shared (is_private=false)
    -- row needs no ownership constraint, but a private row MUST be owned by me -
    -- this blocks spoofing the other company as a private owner AND blocks
    -- flipping a shared row to private-owned-by-the-other-side.
    AND (is_private = false OR owner_company_id = public.current_company_id())
  );

-- ---------------------------------------------------------------------
-- 2. deal_artifact - same shape, keyed on the EXISTING owner column
--    (uploaded_by_company_id). USING identical to 20260622090000.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS dealart_all ON public.deal_artifact;
CREATE POLICY dealart_all ON public.deal_artifact FOR ALL TO authenticated
  USING (
    public.can_access_workspace(deal_workspace_id)
    AND (is_private = false OR uploaded_by_company_id = public.current_company_id())
  )
  WITH CHECK (
    public.can_access_workspace(deal_workspace_id)
    AND (is_private = false OR uploaded_by_company_id = public.current_company_id())
  );
