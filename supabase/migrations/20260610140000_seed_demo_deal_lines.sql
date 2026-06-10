-- =====================================================================
-- 3a · Demo seed - line items on the confirmed demo-world deal card
-- (Ayush, 2026-06-10) - gives Phase 3 a rich card to render + the
-- relationship Deals tab real products. Idempotent (delete-by-tag).
-- =====================================================================
-- Line items are immutable SNAPSHOTS (PRD): descriptive fields with no column
-- (cultivar, PZN, dominance) live in metadata; product_id is left NULL here
-- (these historical strains predate the live catalog). The live draftable card
-- (Phase 8) seeds its own lines the same way.
-- Target: the confirmed demo-world card on Alice↔Bob.
-- =====================================================================

DO $$
DECLARE
  v_card_id UUID := '04695a2d-668d-40b4-bfa8-55b0fe306018';  -- confirmed demo-world card
BEGIN
  -- only seed if the card is present (idempotent + safe on a fresh/reset DB)
  IF NOT EXISTS (SELECT 1 FROM public.deal_card WHERE id = v_card_id) THEN
    RAISE NOTICE 'demo card % not present - skipping line seed', v_card_id;
    RETURN;
  END IF;

  -- clean prior demo lines on this card (idempotent re-run)
  DELETE FROM public.deal_line_item
   WHERE deal_card_id = v_card_id AND metadata->>'seed' = 'demo-world';

  -- NOTE: line_total is a GENERATED column (= quantity × unit_price) - do not insert it.
  INSERT INTO public.deal_line_item
    (deal_card_id, version, product_name, quantity, unit, unit_price, currency,
     thc_percent, cbd_percent, sort_order, metadata)
  VALUES
    (v_card_id, 1, 'Northern Lights', 2000, 'g', 4.20, 'EUR', 18.0, 0.5, 0,
       '{"seed":"demo-world","cultivar":"Indica","pzn":"17345601","dominance":"indica"}'::jsonb),
    (v_card_id, 1, 'Sour Diesel',     1500, 'g', 4.50, 'EUR', 22.0, 0.3, 1,
       '{"seed":"demo-world","cultivar":"Sativa","pzn":"17345602","dominance":"sativa"}'::jsonb),
    (v_card_id, 1, 'White Widow',     1000, 'g', 4.30, 'EUR', 20.0, 0.4, 2,
       '{"seed":"demo-world","cultivar":"Hybrid","pzn":"17345603","dominance":"hybrid"}'::jsonb),
    (v_card_id, 1, 'OG Kush',          750, 'g', 4.60, 'EUR', 24.0, 0.2, 3,
       '{"seed":"demo-world","cultivar":"Indica","pzn":"17345604","dominance":"indica"}'::jsonb),
    (v_card_id, 1, 'Amnesia Haze',     500, 'g', 4.80, 'EUR', 21.0, 0.3, 4,
       '{"seed":"demo-world","cultivar":"Sativa","pzn":"17345605","dominance":"sativa"}'::jsonb),
    (v_card_id, 1, 'Gelato',           250, 'g', 5.00, 'EUR', 19.0, 0.6, 5,
       '{"seed":"demo-world","cultivar":"Hybrid","pzn":"17345606","dominance":"hybrid"}'::jsonb);

  -- keep the card's net value consistent with the seeded lines (sum of line_total)
  UPDATE public.deal_card
     SET value_net = 26550, currency = 'EUR'
   WHERE id = v_card_id;
END $$;
