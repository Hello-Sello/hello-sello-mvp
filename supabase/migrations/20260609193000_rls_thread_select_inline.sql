-- ============================================================================
-- Migration — RLS: chat_thread read policy checks the row directly (2d fix)
-- ----------------------------------------------------------------------------
-- ROOT CAUSE: chat_thread's SELECT policy was `can_access_thread(id)` — a
-- SECURITY DEFINER STABLE helper that RE-QUERIES chat_thread for the row's own
-- id. During `INSERT ... RETURNING` (any client insert that reads the row back)
-- the new row isn't visible to that helper's snapshot, so the read-back is
-- denied (42501) even though the insert (WITH CHECK) is allowed. This blocked
-- the accept→chat flow for normal users (the seed worked only because the
-- service role bypasses RLS).
--
-- FIX: rewrite chat_thread's USING to check the row's OWN columns directly
-- (type / person_a_id / person_b_id / relationship_id / deal_card_id) — same
-- access logic, but no self-lookup, so creating-and-reading a new thread works
-- for any user and any future code. The `can_access_thread` helper is unchanged
-- and still used by chat_message (where thread_id points to an EXISTING thread,
-- so the re-query is correct there). WITH CHECK is unchanged (already inline).
-- ============================================================================

DROP POLICY IF EXISTS thread_all ON chat_thread;
CREATE POLICY thread_all ON chat_thread FOR ALL TO authenticated
  USING (
    (type = 'p2p' AND (auth.uid() = person_a_id OR auth.uid() = person_b_id))
    OR (type = 'c2c' AND is_relationship_member(relationship_id))
    OR (type = 'deal' AND EXISTS (
          SELECT 1 FROM public.deal_workspace w
          WHERE w.deal_card_id = chat_thread.deal_card_id
            AND public.can_access_workspace(w.id)
       ))
  )
  WITH CHECK (
    (type = 'p2p' AND auth.uid() IN (person_a_id, person_b_id))
    OR (type IN ('c2c', 'deal') AND is_relationship_member(relationship_id))
  );
