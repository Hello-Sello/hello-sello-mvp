-- ============================================================================
-- chat_message_type_pills_seed_test.sql — E1: the two negotiation pill codes
-- ----------------------------------------------------------------------------
-- Phase-12 (Wave 3a). The Wave-3 chat pills need their chat_message_type lookup
-- rows to exist before the first pill is posted (chat_message.type is an FK to
-- chat_message_type). E1 seeds BOTH:
--   · 'deal_change_proposed'        — a held deal change was proposed;
--   · 'deal_negotiation_requested'  — a party asked to negotiate.
--
-- This asserts BOTH rows exist. A single BEGIN…ROLLBACK; a pure lookup check,
-- no impersonation.
--
-- ⚠️ RED-FIRST: fails before the seed (either code missing). GREEN once
-- 20260724121200_chat_message_type_pills_seed.sql ships.
--
-- Run:  bash supabase/tests/run_chat_message_type_pills_seed_test.sh
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.chat_message_type WHERE code = 'deal_change_proposed') THEN
    RAISE EXCEPTION 'E1 FAIL: chat_message_type code ''deal_change_proposed'' is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.chat_message_type WHERE code = 'deal_negotiation_requested') THEN
    RAISE EXCEPTION 'E1 FAIL: chat_message_type code ''deal_negotiation_requested'' is missing';
  END IF;
END $$;

ROLLBACK;
SELECT 'ALL CHAT_MESSAGE_TYPE_PILLS_SEED TESTS PASSED' AS result;
