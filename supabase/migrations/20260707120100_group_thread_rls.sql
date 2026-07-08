-- =====================================================================
-- Phase 7 · Group chat foundation (2/3): the group RLS branch on BOTH
-- policies that guard a thread  (Ayush, 2026-07-07)
-- =====================================================================
-- WHY (RESEARCH Pitfall 1, load-bearing): a group thread is guarded by TWO
-- separate rules, and the group branch MUST be added to BOTH or group
-- messages silently 42501-deny:
--   * `thread_all` (the FOR ALL row policy on chat_thread) decides who can
--     read/write the THREAD row itself.
--   * `can_access_thread(uuid)` (a SECURITY DEFINER helper) guards
--     chat_message insert/select -- it is what a group member's messages
--     flow through. Without its group branch, a member can see the thread
--     but every message insert/select denies.
--
-- Both branches reuse the single authoritative membership rule from file 1
-- (public.is_group_member) so the "active group member" definition has one
-- owner. No existing p2p/c2c/deal branch is removed or weakened -- the group
-- case is purely additive.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) thread_all: keep the inline p2p/c2c/deal branches (the 2d self-lookup
--     fix from 20260609193000), add the group branch to BOTH USING and
--     WITH CHECK. is_group_member is SECURITY DEFINER, so it does not
--     re-query chat_thread and cannot reintroduce the read-back deadlock.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS thread_all ON public.chat_thread;
CREATE POLICY thread_all ON public.chat_thread FOR ALL TO authenticated
  USING (
    (type = 'p2p' AND (auth.uid() = person_a_id OR auth.uid() = person_b_id))
    OR (type = 'c2c' AND is_relationship_member(relationship_id))
    OR (type = 'deal' AND EXISTS (
          SELECT 1 FROM public.deal_workspace w
          WHERE w.deal_card_id = chat_thread.deal_card_id
            AND public.can_access_workspace(w.id)
       ))
    OR (type = 'group' AND public.is_group_member(chat_thread.id))
  )
  WITH CHECK (
    (type = 'p2p' AND auth.uid() IN (person_a_id, person_b_id))
    OR (type IN ('c2c', 'deal') AND is_relationship_member(relationship_id))
    OR (type = 'group' AND public.is_group_member(chat_thread.id))
  );

-- ---------------------------------------------------------------------
-- (2) can_access_thread: re-define with the existing p2p/c2c/deal branches
--     PLUS the SAME group branch. This helper guards chat_message
--     insert/select -- the group branch is what lets an active member's
--     messages through. Preserve LANGUAGE sql STABLE SECURITY DEFINER
--     SET search_path = public verbatim.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_thread(p_thread_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_thread t
    WHERE t.id = p_thread_id
      AND (
        (t.type = 'p2p'  AND auth.uid() IN (t.person_a_id, t.person_b_id))
        OR (t.type = 'c2c' AND public.is_relationship_member(t.relationship_id))
        OR (t.type = 'deal' AND EXISTS (
              SELECT 1 FROM public.deal_workspace w
              WHERE w.deal_card_id = t.deal_card_id
                AND public.can_access_workspace(w.id)
        ))
        OR (t.type = 'group' AND public.is_group_member(t.id))
      )
  );
$$;
