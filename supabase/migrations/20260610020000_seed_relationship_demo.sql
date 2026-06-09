-- ============================================================================
-- Migration — Seed relationship demo world (2e, Phase 8)
-- ----------------------------------------------------------------------------
-- Gives the demo relationship (GreenLeaf ↔ StonePharm = Alice ↔ Bob) a rich,
-- HONEST history so the relationship page + analytics light up:
--   • historical deal_cards (mostly done/cancelled + one confirmed) — these are
--     PAST deals; the live demo's Sella-drafts-a-deal moment stays live in 3a.
--   • standing agreed terms (accepted, in-force).
-- Notes + one artifact already exist on this relationship (created during 2e
-- build/verify), so this migration does NOT seed those.
--
-- Tagged metadata.seed='demo-world' so **3a reuses the same deals** and so this
-- is idempotent: it deletes its own prior demo-world rows before re-inserting.
-- Seller-initiated OFFERs (deal_type='offer', initiating_company = GreenLeaf),
-- per connect-demo O4.
--
-- NOTE: no deal threads here. The relationship page reads deal_card directly
-- (it does not read deal threads); the deal workspace + its thread are screen ④
-- (3a). thread_id stays NULL on these seeded cards.
-- ============================================================================

DO $$
DECLARE
  v_rel    UUID := '5e64f146-7015-4061-a9ac-e98a0684c062'; -- GreenLeaf ↔ StonePharm
  v_seller UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';  -- GreenLeaf (initiator/seller)
  v_buyer  UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';  -- StonePharm
  v_alice  UUID := '11111111-1111-1111-1111-111111111111';  -- GreenLeaf person
  v_bob    UUID := '22222222-2222-2222-2222-222222222222';  -- StonePharm person
BEGIN
  -- idempotent: clear any prior demo-world seed on this relationship
  DELETE FROM deal_card
    WHERE relationship_id = v_rel AND metadata->>'seed' = 'demo-world';
  DELETE FROM relationship_term
    WHERE relationship_id = v_rel AND metadata->>'seed' = 'demo-world';

  -- ---- historical deals (past record) ----------------------------------------
  INSERT INTO deal_card
    (relationship_id, status, deal_type, initiating_company_id, value_net, currency,
     payment_terms_code, incoterms_code, hs_deal_number, metadata, created_by, created_at, updated_at)
  VALUES
    (v_rel, 'confirmed', 'offer', v_seller, 24200, 'EUR', 'net30', 'DAP', 'HS-GL25-A189',
       jsonb_build_object('title', 'August batch · 6 SKUs', 'seed', 'demo-world'),
       v_alice, TIMESTAMPTZ '2026-06-02 10:00+00', TIMESTAMPTZ '2026-06-02 10:00+00'),
    (v_rel, 'done', 'offer', v_seller, 18400, 'EUR', 'net30', 'DAP', 'HS-GL25-9F26',
       jsonb_build_object('title', 'Spring indica batch · 4 SKUs', 'seed', 'demo-world'),
       v_alice, TIMESTAMPTZ '2026-03-12 10:00+00', TIMESTAMPTZ '2026-03-20 10:00+00'),
    (v_rel, 'done', 'offer', v_seller, 6900, 'EUR', 'net30', 'DAP', 'HS-GL25-7C10',
       jsonb_build_object('title', 'CBD isolate trial', 'seed', 'demo-world'),
       v_alice, TIMESTAMPTZ '2025-11-18 10:00+00', TIMESTAMPTZ '2025-11-25 10:00+00'),
    (v_rel, 'cancelled', 'offer', v_seller, 1200, 'EUR', NULL, NULL, 'HS-GL25-2B81',
       jsonb_build_object('title', 'Sample order', 'seed', 'demo-world'),
       v_alice, TIMESTAMPTZ '2025-09-09 10:00+00', TIMESTAMPTZ '2025-09-12 10:00+00');

  -- ---- standing agreed terms (accepted, in-force) ----------------------------
  -- proposed by GreenLeaf/Alice, accepted by Bob.
  INSERT INTO relationship_term
    (relationship_id, term_type_code, value, status,
     proposed_by_company_id, proposed_by_person_id, proposed_at,
     responded_by_person_id, responded_at, metadata)
  VALUES
    (v_rel, 'payment_terms', 'net30', 'accepted', v_seller, v_alice,
       TIMESTAMPTZ '2025-03-15 10:00+00', v_bob, TIMESTAMPTZ '2025-03-16 10:00+00',
       jsonb_build_object('seed', 'demo-world')),
    (v_rel, 'incoterms', 'DAP', 'accepted', v_seller, v_alice,
       TIMESTAMPTZ '2025-03-15 10:00+00', v_bob, TIMESTAMPTZ '2025-03-16 10:00+00',
       jsonb_build_object('seed', 'demo-world')),
    (v_rel, 'min_order_qty', '5000', 'accepted', v_seller, v_alice,
       TIMESTAMPTZ '2025-03-15 10:00+00', v_bob, TIMESTAMPTZ '2025-03-16 10:00+00',
       jsonb_build_object('seed', 'demo-world')),
    (v_rel, 'delivery_lead_time_days', '10', 'accepted', v_seller, v_alice,
       TIMESTAMPTZ '2025-03-15 10:00+00', v_bob, TIMESTAMPTZ '2025-03-16 10:00+00',
       jsonb_build_object('seed', 'demo-world'));
END $$;
