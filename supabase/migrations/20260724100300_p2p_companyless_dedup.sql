-- ============================================================================
-- chat_thread — one company-less p2p thread per person pair (PG-6)
-- ----------------------------------------------------------------------------
-- The existing uq_chat_thread_p2p index is keyed on (relationship_id, person_a,
-- person_b). For a person↔person DM relationship_id is NULL, and Postgres treats
-- NULLs as distinct, so that index does NOT dedupe company-less p2p threads.
--
-- This adds a partial unique index covering exactly the company-less p2p rows,
-- so the person-accept RPC (PG-7) can't create a second DM thread for a pair.
-- Additive; does not touch the existing index or any company-anchored p2p rows.
-- Shared table (Ayush's lane) — sync-locked; new migration only.
-- ============================================================================

CREATE UNIQUE INDEX uq_chat_thread_p2p_companyless
  ON public.chat_thread (person_a_id, person_b_id)
  WHERE type = 'p2p' AND relationship_id IS NULL AND deleted_at IS NULL;
