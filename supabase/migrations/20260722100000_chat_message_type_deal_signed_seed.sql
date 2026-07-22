-- ============================================================================
-- Lane A follow-up · seed the deal_signed chat_message_type code
-- (Muskan, 2026-07-22)
-- ----------------------------------------------------------------------------
-- WHY: deal lifecycle events project into the chat stream as thin system lines
-- (the DEV-33 doctrine: WhatsApp-style artifact, no push; "the system message
-- is a projection of a log entry"). Declining already has its seeded code
-- ('deal_cancelled', sort 70); SIGNING had none — reusing 'deal_card_updated'
-- would be semantically wrong (same rationale as the deal_change_declined
-- seed: a distinct code keeps the history honest and filterable).
--
-- Additive, zero blast radius: one lookup row, ON CONFLICT DO NOTHING.
-- sort_order 97 slots it after 'deal_card' (96).
-- ============================================================================

insert into public.chat_message_type (code, description, sort_order) values
  ('deal_signed', 'The deal was signed/confirmed (projection of a log entry)', 97)
on conflict (code) do nothing;
