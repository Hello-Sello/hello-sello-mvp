-- ============================================================================
-- T05 (0027-retire-connect-inbox) · Backfill: resolve every pending deal
-- ticket
-- ----------------------------------------------------------------------------
-- DML-only. T01 (20260903120000) already stopped `confirm_detected_deal` from
-- cutting NEW deal_card tickets; this migration clears the ones that already
-- exist. D5/I-M5.
--
-- 'accepted', not 'resolved' — inbox_status seeds exactly
-- pending | accepted | rejected (20260607090001:337-340); a literal
-- 'resolved' has no such code and the FK would reject it.
--
-- All three WHERE predicates are the entire safety mechanism, none optional:
--   type = 'deal_card'    — dropping this accepts every live connect /
--                            connect_message / pricelist_request ticket too,
--                            and nothing restores them.
--   status = 'pending'    — only a still-open ticket needs resolving.
--   deleted_at IS NULL    — matches what deliver_deal:59 / claim_deal_ticket:51
--                            (T06 drops both, gated on this backfill reading 0
--                            first) consider a "live" ticket. Without it, this
--                            migration and that code disagree about scope.
--
-- No memberships inserted — T01's I-M2 already proved a deal_card is
-- reachable company-wide without one.
--
-- NO-OP on `db reset`: seed.sql seeds no deal_card pending_inbox_item rows.
-- The SQL suite alongside this migration fixtures its own rows inside a
-- BEGIN…ROLLBACK to prove the UPDATE statement is correct in isolation; the
-- REAL checkpoint (I-M5's two counts, run for real) is a manual step against
-- the target environment before W4 (T06/T07) starts — not something a suite
-- against an empty local table can prove. See TICKETS.md T05's own note.
-- ============================================================================

update public.pending_inbox_item
set status = 'accepted'
where type = 'deal_card'
  and status = 'pending'
  and deleted_at is null;
