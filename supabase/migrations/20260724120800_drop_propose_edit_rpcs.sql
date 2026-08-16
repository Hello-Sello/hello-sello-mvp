-- ============================================================================
-- Migration - drop the two-sided-confirm era writers (D-18, DB half)
-- ----------------------------------------------------------------------------
-- propose_deal (chat-proposal birth) and edit_deal_draft (pre-accept draft
-- edit) belonged to the retired two-sided-confirm lifecycle. Deal birth is
-- create_deal_draft; edits ride the held-change pair
-- (propose_deal_change / confirm_deal_change).
--
-- Their app callers die in plan 12-07 (same wave/PR - never deployed apart).
-- The database.types.ts entries are HAND-EDITED out in 12-07 as well: never
-- regenerate the types file.
--
-- Exact argument signatures copied from the defining migrations:
--   propose_deal    - 20260614121000_propose_deal_rpc.sql
--   edit_deal_draft - 20260611160000_edit_deal_draft_rpc.sql
-- ============================================================================

DROP FUNCTION IF EXISTS public.propose_deal(uuid, jsonb);

DROP FUNCTION IF EXISTS public.edit_deal_draft(
  uuid, numeric, text, timestamptz, text, boolean, jsonb, text, text
);
