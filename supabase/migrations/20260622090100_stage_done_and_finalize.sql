-- ============================================================================
-- Phase 5 · stage-done STORED state + finalization audit codes
-- (Ayush, 2026-06-22)
-- ----------------------------------------------------------------------------
-- WHY: stage-done is a MANUAL user action, NEVER auto-flipped (D-14). Even when
-- all of a stage's CURRENT things are done, the stage is NOT auto-completed -
-- new things can be added later. So stage-done must be STORED (a row written
-- only by a deliberate "Mark stage done" click), not DERIVED from the things.
-- The UI GLOWS the control once all current things are done (the nudge), but the
-- human still confirms.
--
-- FINALIZATION (D-15/D-16/D-17): finalization becomes available only when ALL 5
-- stages have a completion row. finalizeDeal then flips deal_card.status='done'
-- and writes the SINGLE deal_confirmation seal. That seal is written ONLY by
-- finalizeDeal, NEVER by confirm_deal_change (the seal-deferred-to-final-stage
-- rule) - a guard prevents a double-write race with the draft gate. The card's
-- gold follows the DB status, not the click.
--
-- SHARED, not owner-scoped: stage progress is visible to BOTH sides (each side
-- needs to see how far the deal has moved). So RLS gates on can_access_workspace
-- (any workspace member reads/writes), the same SHARED-vs-owner reasoning the
-- deal_pending_change migration documents - NOT current_company_id().
--
-- ADDITIVE ONLY: a new table + its own policy + two audit codes. Touches no
-- existing table or RLS. FKs only to deal_workspace / deal_stage / person ->
-- droppable later with zero blast radius.
-- ============================================================================

-- ---------------------------------------------------------------------
-- 1. The stored per-(workspace, stage) completion row. stage_code is VARCHAR(30)
--    to match thing.stage_code (the existing FK to deal_stage(code)). The
--    completion is stamped with WHO marked it done (repudiation defence, T-05-05).
-- ---------------------------------------------------------------------
CREATE TABLE public.deal_stage_completion (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_workspace_id        UUID NOT NULL REFERENCES public.deal_workspace(id) ON DELETE CASCADE,
  stage_code               VARCHAR(30) NOT NULL REFERENCES public.deal_stage(code),
  marked_done_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  marked_done_by_person_id UUID NOT NULL REFERENCES public.person(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- one done-row per (workspace, stage): the upsert key markStageDone writes to.
-- A re-mark of the same stage updates the existing row, never inserts a second.
CREATE UNIQUE INDEX uq_deal_stage_completion
  ON public.deal_stage_completion(deal_workspace_id, stage_code);

-- the read pattern: list a workspace's completed stages (the finalization gate).
CREATE INDEX idx_deal_stage_completion_workspace
  ON public.deal_stage_completion(deal_workspace_id);

-- ---------------------------------------------------------------------
-- 2. RLS: SHARED. Any workspace member may read stage progress and mark a stage
--    done (D-08 keeps it open). Reuses can_access_workspace for both using +
--    with check - NOT the owner-only current_company_id() variant, because both
--    sides must see how far the deal has moved.
-- ---------------------------------------------------------------------
ALTER TABLE public.deal_stage_completion ENABLE ROW LEVEL SECURITY;

CREATE POLICY stagecompletion_member_all ON public.deal_stage_completion FOR ALL TO authenticated
  USING (public.can_access_workspace(deal_workspace_id))
  WITH CHECK (public.can_access_workspace(deal_workspace_id));

-- ---------------------------------------------------------------------
-- 3. Audit codes for the new lifecycle moments (writeAudit FKs to
--    audit_action_type.code). Idempotent via the code primary key, the same
--    precedent as audit_actions_deal_confirm / deal_pending_change.
-- ---------------------------------------------------------------------
INSERT INTO public.audit_action_type (code, description, category) VALUES
  ('deal.stage_done', 'A stage was marked done in the Deal Room', 'lifecycle'),
  ('deal.finalized',  'The deal was finalized (all stages done) and moved to Done', 'lifecycle')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4. Realtime: a stage-done flip should update both screens live (the nudge +
--    the finalization gate must re-evaluate on the other side without a refresh).
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.deal_stage_completion;
