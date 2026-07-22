-- ============================================================================
-- Lane A · seed the deal_card chat_message_type code (Muskan, 2026-07-20)
-- ----------------------------------------------------------------------------
-- WHY: person-target deal delivery (A5) posts a "[Sender] has sent a deal"
-- chat_message of type 'deal_card' (metadata carries the deal_card_id; the
-- bubble opens the card in the side panel). chat_message.type is an FK to the
-- chat_message_type lookup, so the code must exist before the first send.
--
-- Additive, zero blast radius: a single lookup row, ON CONFLICT DO NOTHING —
-- a re-run (or a cloud that somehow already has it) is a no-op. Mirrors
-- 20260617140100_chat_message_type_declined_seed.sql. sort_order 96 slots it
-- after 'deal_change_declined' (95).
--
-- NOTE: the sella-detect trigger only enqueues on type = 'message', so this
-- person-sent typed message never trips detection.
-- ============================================================================

insert into public.chat_message_type (code, description, sort_order) values
  ('deal_card', 'A deal was sent to this person - the message opens the deal card', 96)
on conflict (code) do nothing;
