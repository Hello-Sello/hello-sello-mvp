-- ============================================================================
-- Phase 5 · per-thing / per-document VISIBILITY + the RLS private-narrow
-- (Ayush, 2026-06-22)
-- ----------------------------------------------------------------------------
-- WHY: privacy here is the OPPOSITE of the deal_card note (20260618120010). A
-- note is SHARED by design, so it needed no new RLS - the existing row policy
-- already covered it. A private Thing/document is the reverse: it must be
-- invisible to the OTHER company, so it needs an RLS NARROW on top of workspace
-- membership. Today neither `thing` nor `deal_artifact` carries a visibility
-- flag; both are seen by every workspace member (thing_all / dealart_all gate
-- only on can_access_workspace).
--
-- THE MODEL (D-10/D-11/D-12/D-13):
--   - each THING and each DOCUMENT carries its own visibility.
--   - assigned to the OTHER side (company-level) => AUTO-SHARED (is_private=false):
--     both companies must see/act on it.
--   - assigned to your OWN side => your choice, DEFAULT PRIVATE (is_private=true),
--     flippable to shared at any time.
--   - a private item is yours alone: the other side cannot see OR flip it.
--   - the lock icon (D-13) reads is_private on both tables.
--
-- OWNER COLUMN CHOICE: `thing` gets an explicit `owner_company_id` (planner
-- decision) - it makes the RLS predicate a single equality and mirrors the
-- existing `deal_artifact.uploaded_by_company_id` precedent. `deal_artifact`
-- already HAS an owner column (uploaded_by_company_id), so it needs no new owner
-- column - its private-narrow keys on that. A document's is_private mirrors its
-- linked thing's is_private (set in the app write via thing.linked_artifact_id);
-- a standalone document defaults private (matches the own-side default).
--
-- ADDITIVE, NO BACKFILL: every column is nullable/defaulted, so every existing
-- row reads with is_private=false (shared) and no migration of data is needed.
-- ============================================================================

-- ---------------------------------------------------------------------
-- 1. Additive columns (no backfill - defaulted)
-- ---------------------------------------------------------------------
alter table public.thing add column is_private boolean not null default false;
alter table public.thing add column owner_company_id uuid null references public.company(id);
alter table public.deal_artifact add column is_private boolean not null default false;

-- ---------------------------------------------------------------------
-- 2. RLS rewrite for `thing` - the private narrow ON TOP OF workspace membership.
--    USING (D-12): a private row is visible/editable ONLY to its owner company.
--    Because the USING hides the other side's private rows, an UPDATE targeting
--    one returns 0 rows (a no-op) - so company B cannot flip company A's private
--    item (T-05-02). WITH CHECK stays on can_access_workspace so any member can
--    still insert/assign (D-08 keeps add/assign OPEN; the company is resolved
--    server/client-side from the session, never from input).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS thing_all ON public.thing;
CREATE POLICY thing_all ON public.thing FOR ALL TO authenticated
  USING (
    public.can_access_workspace(deal_workspace_id)
    AND (is_private = false OR owner_company_id = public.current_company_id())
  )
  WITH CHECK (public.can_access_workspace(deal_workspace_id));

-- ---------------------------------------------------------------------
-- 3. RLS rewrite for `deal_artifact` - same shape, keyed on the EXISTING owner
--    column (uploaded_by_company_id), so no new owner column is needed. A
--    document's is_private mirrors its linked thing's (set in the app write); a
--    standalone document defaults private.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS dealart_all ON public.deal_artifact;
CREATE POLICY dealart_all ON public.deal_artifact FOR ALL TO authenticated
  USING (
    public.can_access_workspace(deal_workspace_id)
    AND (is_private = false OR uploaded_by_company_id = public.current_company_id())
  )
  WITH CHECK (public.can_access_workspace(deal_workspace_id));

-- ---------------------------------------------------------------------
-- 4. Realtime: a visibility flip (or a new Thing/document) should update both
--    screens live, mirroring the deal_card / deal_pending_change realtime
--    precedents. Neither table is in the publication yet, so a plain add is safe.
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.thing;
alter publication supabase_realtime add table public.deal_artifact;
