-- ============================================================================
-- E1 · seed the two Wave-3 negotiation pill chat_message_type codes
-- (Ayush, 2026-07-24 · Wave 3a)
-- ----------------------------------------------------------------------------
-- WHY: Wave-3 chat pills project deal-negotiation events into the chat stream.
-- chat_message.type is an FK to the chat_message_type lookup, so the codes must
-- exist before the first pill is posted:
--   · 'deal_change_proposed'       — a held deal change was proposed;
--   · 'deal_negotiation_requested' — a party asked to negotiate.
--
-- Additive, zero blast radius: two lookup rows, ON CONFLICT DO NOTHING — a
-- re-run (or a cloud that already has them) is a no-op. Mirrors
-- 20260722100000_chat_message_type_deal_signed_seed.sql. sort_order 98/99 slot
-- them after 'deal_signed' (97).
--
-- NOTE: the sella-detect trigger only enqueues on type = 'message', so these
-- typed pills never trip detection.
-- ============================================================================

insert into public.chat_message_type (code, description, sort_order) values
  ('deal_change_proposed',       'A held deal change was proposed', 98),
  ('deal_negotiation_requested', 'A party asked to negotiate',      99)
on conflict (code) do nothing;
