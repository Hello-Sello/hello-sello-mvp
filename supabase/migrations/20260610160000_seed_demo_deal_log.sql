-- =====================================================================
-- 3a · Demo seed - version log on the confirmed demo-world deal card
-- (Ayush, 2026-06-10) - gives the card-back Logs tab real history.
-- Idempotent (delete-then-insert on this one card). Guarded if absent.
-- =====================================================================
-- deal_card_log: append-only history (FR-D5). changed_by = content_author
-- (person|system|sella); origin = deal_change_origin (p2p|deal_chat|system).
-- =====================================================================

DO $$
DECLARE
  v_card_id   UUID := '04695a2d-668d-40b4-bfa8-55b0fe306018';  -- confirmed demo-world card
  v_alice     UUID := '11111111-1111-1111-1111-111111111111';  -- GreenLeaf person (seller)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.deal_card WHERE id = v_card_id) THEN
    RAISE NOTICE 'demo card % not present - skipping log seed', v_card_id;
    RETURN;
  END IF;

  DELETE FROM public.deal_card_log WHERE deal_card_id = v_card_id;

  INSERT INTO public.deal_card_log
    (deal_card_id, version, change_summary, origin, changed_by, changed_by_person_id, created_at)
  VALUES
    (v_card_id, 1, 'Sella drafted this deal from your conversation.',
       'deal_chat', 'sella', NULL, NOW() - INTERVAL '9 days'),
    (v_card_id, 1, 'Quantities and price agreed - 26.550 € net across 6 products.',
       'p2p', 'person', v_alice, NOW() - INTERVAL '8 days');
END $$;
