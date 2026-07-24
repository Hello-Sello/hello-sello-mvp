-- ============================================================================
-- Migration - draft privacy RLS (D-08 helper narrow + D-11 confirmation lock)
-- ----------------------------------------------------------------------------
-- Phase 12 Wave 1 (plan 12-04). An 'unsent' draft is PRIVATE to the company
-- that created it: the counterparty must not see the card or ANY of its
-- children until Send flips the status.
--
-- WHY the helper is the single cascade point: every deal child table gates on
-- public.card_relationship_member (directly, or through a helper that calls
-- it), so narrowing THIS ONE body hides the whole draft:
--
--   directly on card_relationship_member:
--     deal_line_item, deal_card_log, deal_change_input, deal_pending_change,
--     deal_promotion, deal_confirmation
--   via can_access_workspace (which calls card_relationship_member):
--     deal_workspace, deal_member, deal_artifact, thing
--   via can_access_thread -> can_access_workspace:
--     deal chat threads (chat_thread type='deal' + their chat_message rows)
--
-- ANTI-PATTERN WARNING: do NOT narrow per-table policies instead. The helpers
-- are SECURITY DEFINER - they bypass table RLS entirely, so a per-table sweep
-- WILL miss one (workspace/things/threads would silently leak the draft).
-- The deal_card table's own card_all policy is the ONE exception: it gates on
-- is_relationship_member directly, so it is narrowed separately below.
--
-- FAIL-SAFE (kept from 20260607170000_rls_policies.sql): current_company_id()
-- returns NULL for a user with no company yet (sign-in -> company-setup
-- window, and Path B); NULL comparison = no match = deny. The new
-- unsent-initiator predicate preserves this - a company-less user can never
-- see an unsent draft.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The single cascade point: unsent rows pass only for the initiating
--    company. `status <> 'unsent'` (not an allowlist) keeps every post-send
--    status relationship-wide with zero further edits.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.card_relationship_member(p_card_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.deal_card dc
    WHERE dc.id = p_card_id
      AND public.is_relationship_member(dc.relationship_id)
      AND (dc.status <> 'unsent'
           OR dc.initiating_company_id = public.current_company_id())
  );
$$;

-- ----------------------------------------------------------------------------
-- 2. deal_card's own policy - narrowed separately (the helpers bypass table
--    RLS, so the table policy never inherits the helper change). Same
--    predicate in BOTH arms: USING hides unsent rows from counterparty reads,
--    WITH CHECK stops writes that would land or move a row out of sight.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS card_all ON public.deal_card;
CREATE POLICY card_all ON public.deal_card FOR ALL TO authenticated
  USING (is_relationship_member(relationship_id)
         AND (status <> 'unsent' OR initiating_company_id = current_company_id()))
  WITH CHECK (is_relationship_member(relationship_id)
         AND (status <> 'unsent' OR initiating_company_id = current_company_id()));

-- ----------------------------------------------------------------------------
-- 3. D-11 - deal_confirmation goes client-read-only. RLS-enabled tables deny
--    every verb that has no policy: replacing FOR ALL with SELECT-only removes
--    the client write path entirely (no INSERT/UPDATE/DELETE policy is
--    created). The only writer was the dead confirmDeal action (verified,
--    12-SURVEY.md section 4) - nothing legitimate breaks. The table stays as
--    the reserved home of the future single-sign Seal record.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS conf_all ON public.deal_confirmation;
CREATE POLICY conf_select ON public.deal_confirmation FOR SELECT TO authenticated
  USING (card_relationship_member(deal_card_id));
