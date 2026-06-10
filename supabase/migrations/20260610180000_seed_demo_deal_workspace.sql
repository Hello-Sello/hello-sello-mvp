-- =====================================================================
-- 3b · Demo seed - the deal CONTAINER on the demo-world card
-- (Ayush, 2026-06-10): deal_workspace + TWO owner members (one per
-- company side) + the deal chat (chat_thread type='deal') + 3 opening
-- messages, all on card 04695a2d (HS-GL25-A189, GreenLeaf ↔ StonePharm).
-- =====================================================================
-- Idempotency: the CONTAINER rows (workspace / members / thread) are
-- insert-if-absent, NOT delete-recreate - 3c/3d hang real rows (things,
-- confirmations, artifacts) off them, so a rerun must never drop them.
-- Only the seed chat MESSAGES are delete-by-tag + reinsert.
-- Owners: per the locked 3b model, ownership = deal_member.role='owner',
-- one owner per company side (Alice for GreenLeaf, Bob for StonePharm).
-- =====================================================================

DO $$
DECLARE
  v_card_id UUID := '04695a2d-668d-40b4-bfa8-55b0fe306018';  -- demo-world card
  v_alice   UUID := '11111111-1111-1111-1111-111111111111';  -- GreenLeaf owner
  v_bob     UUID := '22222222-2222-2222-2222-222222222222';  -- StonePharm owner
  v_rel_id  UUID;
  v_hs      TEXT;
  v_ws_id   UUID;
  v_thread  UUID;
  v_co_a    TEXT;
  v_co_b    TEXT;
BEGIN
  -- only seed if the card is present (safe on a fresh/reset DB)
  SELECT relationship_id, hs_deal_number INTO v_rel_id, v_hs
    FROM public.deal_card WHERE id = v_card_id;
  IF v_rel_id IS NULL THEN
    RAISE NOTICE 'demo card % not present - skipping workspace seed', v_card_id;
    RETURN;
  END IF;

  -- company names from the LIVE table (never hardcode - companies get renamed)
  SELECT ca.name, cb.name INTO v_co_a, v_co_b
    FROM public.relationship r
    JOIN public.company ca ON ca.id = r.company_a_id
    JOIN public.company cb ON cb.id = r.company_b_id
    WHERE r.id = v_rel_id;

  -- 1 · the workspace (company_wide = live default; uq_deal_workspace_card_active
  --     already guarantees at most one live workspace per card)
  SELECT id INTO v_ws_id FROM public.deal_workspace
    WHERE deal_card_id = v_card_id AND deleted_at IS NULL;
  IF v_ws_id IS NULL THEN
    INSERT INTO public.deal_workspace (deal_card_id, visibility, metadata, created_by)
    VALUES (v_card_id, 'company_wide', '{"seed":"demo-world"}', v_alice)
    RETURNING id INTO v_ws_id;
  END IF;

  -- 2 · the two owners, one per company side (uq_deal_member_active blocks dupes)
  INSERT INTO public.deal_member (deal_workspace_id, person_id, role, added_by_person_id, metadata)
  SELECT v_ws_id, p.person_id, 'owner', p.person_id, '{"seed":"demo-world"}'::jsonb
  FROM (VALUES (v_alice), (v_bob)) AS p(person_id)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.deal_member m
    WHERE m.deal_workspace_id = v_ws_id AND m.person_id = p.person_id AND m.removed_at IS NULL
  );

  -- 3 · the deal chat (natural key: one live deal thread per card)
  SELECT id INTO v_thread FROM public.chat_thread
    WHERE type = 'deal' AND deal_card_id = v_card_id AND deleted_at IS NULL;
  IF v_thread IS NULL THEN
    INSERT INTO public.chat_thread (relationship_id, type, deal_card_id)
    VALUES (v_rel_id, 'deal', v_card_id)
    RETURNING id INTO v_thread;
  END IF;

  -- 4 · opening messages (delete-by-tag + reinsert; staggered timestamps
  --     so the order is stable; types from the chat_message_type lookup)
  DELETE FROM public.chat_message
    WHERE thread_id = v_thread AND metadata->>'seed' = 'demo-world';
  INSERT INTO public.chat_message (thread_id, sender, sender_person_id, type, body, metadata, created_at) VALUES
    (v_thread, 'sella', NULL, 'workspace_created',
     'Deal workspace created for ' || v_hs || '. ' || v_co_a || ' and ' || v_co_b || ' are in - the card is pinned above.',
     '{"seed":"demo-world"}', NOW() - INTERVAL '2 hours'),
    (v_thread, 'person', v_alice, 'message',
     'Moving our deal talk in here so everything stays next to the card.',
     '{"seed":"demo-world"}', NOW() - INTERVAL '1 hour'),
    (v_thread, 'person', v_bob, 'message',
     'Works for me. I''ll go through the open points tomorrow morning.',
     '{"seed":"demo-world"}', NOW() - INTERVAL '30 minutes');

  RAISE NOTICE 'deal workspace seed ok: ws=% thread=%', v_ws_id, v_thread;
END $$;
