-- =====================================================================
-- Phase 7 · Group chat foundation (1/3): chat_thread_member table +
-- 'group' thread type + nullable relationship_id  (Ayush, 2026-07-07)
-- =====================================================================
-- WHY: today chat_thread is strictly 2-party -- two nullable person slots
-- (person_a_id / person_b_id) + a canonical-order CHECK + relationship_id
-- NOT NULL. A deal group (the 2 deal parties + an external 3rd company)
-- fits none of that shape (RESEARCH Pitfall 1). Groups need a real
-- membership model, so this migration adds:
--   (1) a 'group' chat_thread_type code,
--   (2) a nullable relationship_id (group access is via membership, not a
--       company-pair anchor) + a stored, renameable display name (D-06),
--   (3) the chat_thread_member table (one row per member, with the D-05
--       external-approval state machine carried in `state`),
--   (4) a SECURITY DEFINER membership helper + the table's own RLS policy.
--
-- The external-party 2-click gate (D-05) lives in membership `state` +
-- the RPC (file 3), NEVER a client flag -- so it is an isolation guarantee.
--
-- ADDITIVE ONLY: one new type code, one nullable-drop + one new column on
-- chat_thread, one new table + helper + policy, three new audit codes.
-- The p2p canonical-order CHECK is already gated on `type <> 'p2p'`, so it
-- does not block group rows.
-- =====================================================================

-- (1) the new thread kind (idempotent)
INSERT INTO public.chat_thread_type (code, description, sort_order)
VALUES ('group', 'Group chat', 4)
ON CONFLICT (code) DO NOTHING;

-- (2) group rows carry no relationship anchor -- access is via membership
--     only (Open Question 1 recommendation). p2p/c2c/deal rows keep filling
--     relationship_id as before; only the NOT NULL constraint is dropped.
ALTER TABLE public.chat_thread ALTER COLUMN relationship_id DROP NOT NULL;

-- (2b) a group has a stored, renameable display name (D-06). p2p/c2c/deal
--      threads derive their label from participants, so this stays NULL for
--      them; only group rows use it.
ALTER TABLE public.chat_thread ADD COLUMN IF NOT EXISTS name TEXT NULL;

-- ---------------------------------------------------------------------
-- (3) the membership table. `state` carries the D-05 external gate:
--     'active'           -> a full participant (sees + writes messages),
--     'pending_external' -> an external-company member awaiting TWO
--                           distinct active-member approvals (file 3).
--     `approvals` records the approver person ids for the 2-click gate.
-- ---------------------------------------------------------------------
CREATE TABLE public.chat_thread_member (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  UUID NOT NULL REFERENCES public.chat_thread(id) ON DELETE CASCADE,
  person_id  UUID NOT NULL REFERENCES public.person(id),
  state      TEXT NOT NULL DEFAULT 'active'
               CHECK (state IN ('active', 'pending_external')),
  approvals  JSONB NOT NULL DEFAULT '[]'::jsonb,     -- distinct approver person ids
  added_by   UUID NULL REFERENCES public.person(id),
  added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- one row per member (mirrors uq_deal_member_active on deal_member)
CREATE UNIQUE INDEX uq_chat_thread_member
  ON public.chat_thread_member(thread_id, person_id);

-- the reverse read: "which group threads is this person in?"
CREATE INDEX idx_chat_thread_member_person
  ON public.chat_thread_member(person_id);

-- ---------------------------------------------------------------------
-- (4a) membership helper. It MUST be SECURITY DEFINER: a plain RLS policy
--      that self-SELECTs chat_thread_member inside its own USING clause
--      raises "infinite recursion detected in policy" (42P17) at query
--      time. A SECURITY DEFINER function runs as the owner and bypasses
--      RLS, so the self-reference is safe -- the exact pattern the codebase
--      already uses for deal_member via is_workspace_member(). This one
--      helper is also the single authoritative "active group member" rule
--      reused by both RLS policies in file 2 (one owner, one edit site).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_group_member(p_thread_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_thread_member m
    WHERE m.thread_id = p_thread_id
      AND m.person_id = auth.uid()
      AND m.state = 'active'
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_group_member(uuid) TO authenticated;

-- (4b) RLS: an active member sees the membership rows of their own threads.
--      Writes go through the SECURITY DEFINER RPCs (file 3), which bypass
--      this policy; the WITH CHECK still guards any direct client write.
ALTER TABLE public.chat_thread_member ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_thread_member_visible ON public.chat_thread_member FOR ALL TO authenticated
  USING (public.is_group_member(thread_id))
  WITH CHECK (public.is_group_member(thread_id));

-- ---------------------------------------------------------------------
-- (5) audit codes for the group lifecycle moments (the app layer / RPCs
--     writeAudit these). Idempotent via the code primary key.
-- ---------------------------------------------------------------------
INSERT INTO public.audit_action_type (code, description, category) VALUES
  ('group.created',         'A group chat was created',                              'lifecycle'),
  ('group.member_added',    'A person was added to a group chat',                    'lifecycle'),
  ('group.member_approved', 'An external group member was approved by an active member', 'lifecycle')
ON CONFLICT (code) DO NOTHING;
