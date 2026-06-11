-- =====================================================================
-- 3c · Demo seed - Things on the demo-world deal workspace
-- (Ayush, 2026-06-10): a per-stage checklist of Things hung off the
-- workspace born in 3b (card 04695a2d, GreenLeaf ↔ StonePharm).
-- Things group BY STAGE (deal_stage codes). Stage bar is screen-only
-- (3c D2) so NO stage pointer is stored here - only Things.
-- =====================================================================
-- Idempotency: Things are SEED data → delete-by-tag + reinsert is safe
-- (unlike the 3b CONTAINER rows, which must never be dropped). We scope
-- the DELETE to the `thing` table + this seed tag, so nothing else is
-- touched. A mix of open/done in stages 1-2 makes per-stage progress show.
-- =====================================================================

DO $$
DECLARE
  v_card_id UUID := '04695a2d-668d-40b4-bfa8-55b0fe306018';  -- demo-world card
  v_alice   UUID := '11111111-1111-1111-1111-111111111111';  -- GreenLeaf (seller) owner
  v_bob     UUID := '22222222-2222-2222-2222-222222222222';  -- StonePharm (buyer) owner
  v_ws_id   UUID;
BEGIN
  -- only seed if the workspace is present (safe on a fresh/reset DB)
  SELECT id INTO v_ws_id FROM public.deal_workspace
    WHERE deal_card_id = v_card_id AND deleted_at IS NULL;
  IF v_ws_id IS NULL THEN
    RAISE NOTICE 'demo workspace for card % not present - skipping Things seed', v_card_id;
    RETURN;
  END IF;

  -- clear only THIS seed's Things (tagged), then reinsert
  DELETE FROM public.thing
    WHERE deal_workspace_id = v_ws_id AND metadata->>'seed' = 'demo-world-3c';

  -- (workspace_id, title, type, status, stage_code, assignee, sort, done?)
  -- done rows get completed_at/by; open rows leave them NULL.
  INSERT INTO public.thing
    (deal_workspace_id, title, type, status, stage_code, assignee_person_id,
     sort_order, completed_at, completed_by_person_id, metadata, created_by)
  VALUES
    -- Stage 1 · Negotiation (2 done, 1 open → shows progress)
    (v_ws_id, 'Agree product list & quantities', 'task', 'done', 'negotiation',
       v_alice, 1, NOW() - INTERVAL '3 hours', v_alice, '{"seed":"demo-world-3c"}', v_alice),
    (v_ws_id, 'Agree unit price & currency', 'task', 'done', 'negotiation',
       v_bob, 2, NOW() - INTERVAL '3 hours', v_bob, '{"seed":"demo-world-3c"}', v_alice),
    (v_ws_id, 'Confirm delivery date target', 'task', 'open', 'negotiation',
       v_alice, 3, NULL, NULL, '{"seed":"demo-world-3c"}', v_alice),

    -- Stage 2 · Compliance & Quality (1 done, 2 open)
    (v_ws_id, 'Verify GreenLeaf cultivation license (GMP)', 'task', 'done', 'compliance_quality',
       v_alice, 1, NOW() - INTERVAL '2 hours', v_alice, '{"seed":"demo-world-3c"}', v_alice),
    (v_ws_id, 'Verify StonePharm import / narcotics license', 'task', 'open', 'compliance_quality',
       v_bob, 2, NULL, NULL, '{"seed":"demo-world-3c"}', v_alice),
    (v_ws_id, 'Upload CoA - THC / CBD lab results', 'document_upload', 'open', 'compliance_quality',
       v_alice, 3, NULL, NULL, '{"seed":"demo-world-3c"}', v_alice),

    -- Stage 3 · Agreement (the approval Thing = the 3d e-sign gate)
    (v_ws_id, 'Both sides e-sign the agreement', 'approval', 'open', 'agreement',
       NULL, 1, NULL, NULL, '{"seed":"demo-world-3c"}', v_alice),
    (v_ws_id, 'Generate PO / SO numbers', 'task', 'open', 'agreement',
       v_bob, 2, NULL, NULL, '{"seed":"demo-world-3c"}', v_alice),

    -- Stage 4 · Payment (post-confirm; shown ahead)
    (v_ws_id, 'Issue invoice (NET30)', 'task', 'open', 'payment',
       v_alice, 1, NULL, NULL, '{"seed":"demo-world-3c"}', v_alice),
    (v_ws_id, 'Confirm payment received', 'task', 'open', 'payment',
       v_alice, 2, NULL, NULL, '{"seed":"demo-world-3c"}', v_alice),

    -- Stage 5 · Fulfilment & Delivery (post-confirm; shown ahead)
    (v_ws_id, 'Arrange GDP transport', 'task', 'open', 'fulfilment_delivery',
       v_bob, 1, NULL, NULL, '{"seed":"demo-world-3c"}', v_alice),
    (v_ws_id, 'Delivery to pharmacy + chain-of-custody manifest', 'document_upload', 'open', 'fulfilment_delivery',
       v_bob, 2, NULL, NULL, '{"seed":"demo-world-3c"}', v_alice);

  RAISE NOTICE 'seeded % Things on workspace %',
    (SELECT COUNT(*) FROM public.thing WHERE deal_workspace_id = v_ws_id AND metadata->>'seed' = 'demo-world-3c'),
    v_ws_id;
END $$;
