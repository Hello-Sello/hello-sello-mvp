-- ============================================================================
-- Phase 2 · seed the deal_change_declined chat_message_type code (Ayush, 2026-06-17)
-- ----------------------------------------------------------------------------
-- WHY: the Phase 2 announcement on a DECLINE (confirm_deal_change HOOK A) inserts
-- a chat_message of type 'deal_change_declined'. chat_message.type is an FK to the
-- chat_message_type lookup, so the code must exist before the first decline runs.
-- The accept announcement reuses the already-seeded 'deal_card_updated' code (it
-- IS a card update); a decline did NOT move the card, so reusing 'deal_card_updated'
-- would be semantically wrong -- a distinct code keeps the history honest and lets
-- a future filter tell declines apart.
--
-- Additive, zero blast radius: a single lookup row, ON CONFLICT DO NOTHING, so a
-- re-run (or a cloud that somehow already has it) is a no-op. Mirrors the existing
-- chat_message_type seed block in 20260607090001_lookups_and_seeds.sql. sort_order
-- 95 slots it right after 'deal_card_updated' (90). Touches nothing of Muskan's
-- catalogue/RLS.
--
-- Note on apply order: this seed has timestamp 140100, AFTER the RPC migration
-- 140000 that references the code. That is safe -- the RPC's `type =
-- 'deal_change_declined'` is read at RUNTIME (the first time a decline is
-- confirmed), not at migration-apply time, so the code only needs to exist by the
-- time a decline runs, which is after both migrations have applied.
-- ============================================================================

insert into public.chat_message_type (code, description, sort_order) values
  ('deal_change_declined', 'A held deal change was declined (projection of a log entry)', 95)
on conflict (code) do nothing;
