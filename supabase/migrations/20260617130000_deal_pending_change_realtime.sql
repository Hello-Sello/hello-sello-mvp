-- ============================================================================
-- 4.5.4 fix · publish deal_pending_change to supabase_realtime (Ayush, 2026-06-17)
-- ----------------------------------------------------------------------------
-- DealPin.tsx subscribes to postgres_changes (INSERT/DELETE) on
-- public.deal_pending_change so the Edit-pencil lock and the "Review change" pill
-- appear and clear LIVE on BOTH sides (Phase 1: "the strip + pencil update live on
-- both screens"). But the table was never added to the supabase_realtime
-- publication — the original table migration (20260616120000) omitted it, so only
-- chat_message + chat_thread were published. The result: the subscription never
-- received any events, and a held change only showed on the OTHER side after a
-- manual page refresh (confirmed live + by the e2e suite).
--
-- This one line enables the broadcast. RLS still applies to realtime
-- postgres_changes, so each side only receives events for pending changes on a
-- relationship it belongs to (the pendingchange_member_all policy) — no leak.
-- ============================================================================

alter publication supabase_realtime add table public.deal_pending_change;
