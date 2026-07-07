-- =====================================================================
-- Phase 7 / 07-06 · reopen-ticket lifecycle status codes (D-29 / D-30)
-- (Ayush, 2026-07-07)
-- =====================================================================
-- WHY: after a deal closes (Deal Executed = `done`, set by the invoice trigger in
-- 07-04), the ONLY path back in is a reopen ticket (D-29): either party opens it,
-- and the sealed deal terms never change again. D-30 captures the lifecycle colors
-- for a future badge UI (the badge itself is deferred, D-17), but the STATUS codes
-- are needed now so reopenTicket/closeTicket have a status to move to.
--
-- ADDITIVE (A6): two new deal_card_status lookup rows + two audit codes. Zero rows
-- to backfill - `done` is unchanged (Deal Executed already maps to it) and no
-- existing card is in a ticket state. is_terminal = FALSE for both: a ticket can
-- be opened and closed (and the deal can be reopened again), so neither is a dead
-- end. This is DISTINCT from the parked old-Phase-8 C2C ticketing - do not
-- conflate (the C2C inbox primitives are untouched here).
-- =====================================================================

INSERT INTO public.deal_card_status (code, description, sort_order, is_terminal) VALUES
  ('ticket_created', 'Reopen ticket created', 7, FALSE),   -- D-30 blue
  ('ticket_closed',  'Reopen ticket closed',  8, FALSE)    -- D-30 dark-green
ON CONFLICT (code) DO NOTHING;

-- Audit codes for the reopen lifecycle (writeAudit logs these from reopenTicket /
-- closeTicket; the action column is FK-validated against audit_action_type).
INSERT INTO public.audit_action_type (code, description, category) VALUES
  ('deal.reopened',      'A closed deal was reopened into a ticket (either party); terms stay sealed', 'lifecycle'),
  ('deal.ticket_closed', 'A reopen ticket was closed',                                                 'lifecycle')
ON CONFLICT (code) DO NOTHING;
