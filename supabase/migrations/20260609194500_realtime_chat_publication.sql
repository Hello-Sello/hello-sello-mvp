-- ============================================================================
-- Migration — Realtime: publish the chat tables (2d Phase 5)
-- ----------------------------------------------------------------------------
-- Adds chat_message + chat_thread to the `supabase_realtime` publication so the
-- client can subscribe to live INSERTs ("Postgres Changes").
--
-- Privacy: Postgres Changes delivers each row ONLY to subscribers whose RLS
-- SELECT policy allows it - the same policies that gate page reads gate the live
-- stream, so a non-member company receives nothing. (The client must carry its
-- auth token via realtime.setAuth(), else it connects as anon and gets nothing.)
--
-- Default replica identity is enough here: INSERTs broadcast the full new row,
-- which is all the demo needs (new messages / new threads). REPLICA IDENTITY
-- FULL would only matter for broadcasting OLD values on UPDATE/DELETE (deferred).
-- ============================================================================

alter publication supabase_realtime add table chat_message;
alter publication supabase_realtime add table chat_thread;
