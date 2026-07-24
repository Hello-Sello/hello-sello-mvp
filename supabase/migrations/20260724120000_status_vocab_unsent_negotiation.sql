-- ============================================================================
-- Phase 12 / 12-01 · deal status vocabulary - 'unsent' + 'negotiation' in,
-- 'draft' / 'withdrawn' / 'amended' out (D-01 / D-02)
-- (Ayush, 2026-07-24)
-- ----------------------------------------------------------------------------
-- WHY: the single-sign lifecycle (DECISIONS.md 2026-07-23) splits the old
-- birth-to-sign 'draft' state in two. The NEW private pre-send state gets the
-- NEW code 'unsent' (user-facing label stays "Draft"); the sent-and-bargaining
-- state becomes 'negotiation'. The code 'draft' is retired from the DB
-- ENTIRELY (D-01): any unswept or stale reader filtering on 'draft' finds ZERO
-- rows and fails SAFE (drafts simply absent) instead of misreading a private
-- draft as a sent deal. 'withdrawn' and 'amended' were already dead vocabulary
-- (single-sign has no withdraw/amend states) and retire in the same sweep.
--
-- ORDER MATTERS (status is an FK to deal_card_status):
--   1. new lookup rows FIRST (FK targets must exist before any row uses them)
--   2. backfill every existing row off the retiring codes (D-02: all existing
--      'draft' cards were delivered at birth -> 'negotiation'; 'amended' ->
--      'confirmed'; 'withdrawn' -> 'cancelled')
--   3. flip the column default 'draft' -> 'unsent' (D-01)
--   4. only THEN delete the retired lookup rows (FK-safe)
--   5. rider: the 'deal.sent' audit_action_type row (the sendDeal action in
--      plan 12-07 stamps it; analog 20260707140100:26-29)
--
-- BLAST RADIUS: every deal_card row carrying a retiring status is rewritten in
-- step 2 (local: the ALLOC-SEED cards; cloud: the live production rows when
-- this wave is pushed - queued in docs/deploy/cloud-migrations-pending.md).
-- confirm_deal_change still writes 'draft' on commit at this point in the
-- chain - its re-emit rides the NEXT migration (20260724120100) in the SAME
-- wave, so no writer targets a deleted code once the wave is applied together
-- (RESEARCH Pitfall 1).
--
-- NOT TOUCHED: deal_stage's own code 'negotiation' (a DIFFERENT lookup table -
-- accepted string collision, the two vocabularies are never joined); the
-- pricelist status vocabulary ('draft' there is a different domain); the
-- deal_pending_change.draft COLUMN; chat_message metadata jsonb keys.
-- ============================================================================

-- 1. New vocabulary first (FK targets must exist before any row uses them)
INSERT INTO public.deal_card_status (code, description, sort_order, is_terminal) VALUES
  ('unsent',      'Draft - private to the creating company', 0, FALSE),
  ('negotiation', 'Sent - being negotiated',                 1, FALSE)
ON CONFLICT (code) DO NOTHING;

-- 2. Backfill (all existing 'draft' cards were delivered at birth - D-02)
UPDATE public.deal_card SET status = 'negotiation' WHERE status = 'draft';
UPDATE public.deal_card SET status = 'confirmed'   WHERE status = 'amended';
UPDATE public.deal_card SET status = 'cancelled'   WHERE status = 'withdrawn';

-- 3. Default flip (D-01)
ALTER TABLE public.deal_card ALTER COLUMN status SET DEFAULT 'unsent';

-- 4. Only NOW are the old lookup rows deletable (FK-safe)
DELETE FROM public.deal_card_status WHERE code IN ('draft','withdrawn','amended');

-- 5. Rider: the send-time audit code (stamped by the sendDeal action, plan 12-07)
INSERT INTO public.audit_action_type (code, description, category) VALUES
  ('deal.sent', 'Deal draft sent to the counterparty', 'lifecycle')
ON CONFLICT (code) DO NOTHING;
