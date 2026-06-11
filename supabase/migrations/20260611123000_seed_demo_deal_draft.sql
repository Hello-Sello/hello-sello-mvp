-- =====================================================================
-- 3d · reset the demo card to Draft so the confirm gate can be walked
-- (Ayush, 2026-06-11): card 04695a2d (HS-GL25-A189) was seeded in
-- 20260610020000 as a PAST 'confirmed' deal, but 3a/3b/3c built the LIVE
-- workspace on it. For the demo it is the deal being negotiated NOW, so it
-- must start at Draft with both sides pending. Idempotent + scoped to the
-- one demo card. Confirmation rows are removed (absence = pending).
-- =====================================================================
DO $$
DECLARE
  v_card_id UUID := '04695a2d-668d-40b4-bfa8-55b0fe306018';
BEGIN
  UPDATE public.deal_card
    SET status = 'draft', updated_at = NOW()
    WHERE id = v_card_id AND status <> 'draft';

  DELETE FROM public.deal_confirmation
    WHERE deal_card_id = v_card_id;
END $$;
