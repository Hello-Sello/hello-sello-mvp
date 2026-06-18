-- ============================================================================
-- margin-carryforward.invariant.sql -- the Phase 3d MRGN-01 / D-08 carry-forward invariant
-- ----------------------------------------------------------------------------
-- INVARIANT UNDER TEST (Phase 3d, MRGN-01 / D-08):
--   A side's per-line PRIVATE input (deal_line_item_private) must SURVIVE a held
--   change that commits a NEW version on the same card -- even when the change is
--   UNRELATED to the margin (here: a quantity-only bump). The deal_line_item rows
--   are recreated with fresh ids on every committed version, so without the
--   product_id-keyed carry-forward inside confirm_deal_change the private row
--   would be orphaned on the old line and silently vanish from the new version.
--
--   This is exactly the Pitfall-1 warning-sign scenario: insert a margin, commit
--   an UNRELATED held change, and the margin must NOT disappear.
--
-- SHAPE: mirrors the Phase 1/2 SQL invariant precedent
--   (supabase/tests/announcement_projection_test.sql + the impersonation from
--   cross_tenant_lockdown_test.sql) -- a single BEGIN ... ROLLBACK transaction
--   with ephemeral fixtures and NO committed trace. confirm_deal_change reads
--   auth.uid() / current_company_id(), so we impersonate the CALLER via
--   set_config('request.jwt.claim.sub') + set_config('request.jwt.claims').
--
-- Run:  psql -v ON_ERROR_STOP=1 \
--         "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--         -f e2e/sql/margin-carryforward.invariant.sql
--   ON_ERROR_STOP=1 is REQUIRED: without it psql skips past a RAISE EXCEPTION to
--   the final SELECT and prints a FALSE 'PASSED'. With it, any failure aborts
--   the script non-zero.
--
-- RUNTIME ID RESOLUTION (never hardcode a generated id): the seed regenerates ids
--   on every `supabase db reset`. The GreenLeaf<->StonePharm RELATIONSHIP id and
--   the GreenLeaf catalogue PRODUCT id are resolved at runtime -- the relationship
--   by the two seeded company ids, and the product by its STABLE
--   supplier_product_code ('AUR-1A'), since the product row itself has a
--   gen_random_uuid() id. The seeded COMPANY and PERSON ids ARE stable fixtures in
--   the seed (aaaa.../1111... = GreenLeaf/Alice, bbbb.../2222... = StonePharm/Bob),
--   exactly as the existing supabase/tests/*.sql invariants rely on them.
--
-- Seed actors (stable seed UUIDs):
--   GreenLeaf  company aaaa...  / Alice person 1111...  (the SELLER + PROPOSER)
--   StonePharm company bbbb...  / Bob   person 2222...  (the ACCEPTER / CALLER)
-- ============================================================================

BEGIN;

-- ── Fixtures (rolled back at the end) ────────────────────────────────────────
-- A fresh deal_card at version 1 under the seeded GreenLeaf<->StonePharm relationship.
INSERT INTO public.deal_card (id, relationship_id, version, deal_type, initiating_company_id, created_by)
SELECT 'dddddddd-dddd-dddd-dddd-dddddddddddd', r.id, 1, 'offer',
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       '11111111-1111-1111-1111-111111111111'
FROM public.relationship r
WHERE r.company_a_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND r.company_b_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

-- The card's DEAL thread (chat_thread_deal_has_card: a 'deal' thread needs the card).
-- confirm_deal_change resolves this thread to post its announcement into; it is not
-- asserted here, but it must exist so the commit branch runs cleanly.
INSERT INTO public.chat_thread (id, relationship_id, type, deal_card_id)
SELECT 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', r.id, 'deal',
       'dddddddd-dddd-dddd-dddd-dddddddddddd'
FROM public.relationship r
WHERE r.company_a_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND r.company_b_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

-- ── The v1 priced line, keyed to a REAL GreenLeaf catalogue product ──────────
-- product_id is resolved at runtime by the stable supplier_product_code 'AUR-1A'
-- (the seeded product row's own id is gen_random_uuid(), so it must NEVER be
-- hardcoded). product_id MUST be non-null so the carry-forward join has a key.
DO $$
DECLARE
  v_product uuid;
  v_line    uuid;
BEGIN
  SELECT id INTO v_product
  FROM public.product
  WHERE company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    AND supplier_product_code = 'AUR-1A'
    AND deleted_at IS NULL
  LIMIT 1;
  IF v_product IS NULL THEN
    RAISE EXCEPTION 'SETUP: GreenLeaf seed product AUR-1A not found - is the seed loaded?';
  END IF;

  INSERT INTO public.deal_line_item (
    deal_card_id, version, product_id, product_name, quantity, unit, unit_price, currency, sort_order)
  VALUES (
    'dddddddd-dddd-dddd-dddd-dddddddddddd', 1, v_product, 'Pedanios 31/1 COS-CA',
    100, 'g', 5.0000, 'EUR', 0)
  RETURNING id INTO v_line;

  -- The SELLER (GreenLeaf) enters a private per-line cost of 3.5000 on the v1 line.
  -- This is the row that MUST survive the unrelated quantity bump.
  INSERT INTO public.deal_line_item_private (
    deal_line_item_id, company_id, seller_margin, created_by)
  VALUES (
    v_line, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 3.5000,
    '11111111-1111-1111-1111-111111111111');
END $$;

-- ── The UNRELATED held change: quantity-only bump (margin untouched) ─────────
-- Proposed by GreenLeaf/Alice (auto-accept seeds her vote). The draft carries the
-- SAME productId on the line (the stable cross-version key the carry-forward joins
-- on) and a DIFFERENT quantity (120 not 100). The margin input is NOT in the draft
-- (it never rides the shared held jsonb - Pitfall 3); it lives only in the
-- RLS-protected deal_line_item_private row.
DO $$
DECLARE
  v_product uuid;
BEGIN
  SELECT id INTO v_product
  FROM public.product
  WHERE company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    AND supplier_product_code = 'AUR-1A'
    AND deleted_at IS NULL
  LIMIT 1;

  INSERT INTO public.deal_pending_change
    (deal_card_id, base_version, source, proposed_by_company, proposed_by_person,
     proposer_reason, draft, votes)
  VALUES
    ('dddddddd-dddd-dddd-dddd-dddddddddddd', 1, 'manual',
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
     'Increase quantity to 120',
     jsonb_build_object(
       'value_net', 600, 'currency', 'EUR',
       'line_items', jsonb_build_array(jsonb_build_object(
         'productId',  v_product::text,   -- the stable carry-forward key (Pitfall 1)
         'name',       'Pedanios 31/1 COS-CA',
         'quantity',   120,               -- the ONLY change: quantity 100 -> 120
         'unit',       'g',
         'unit_price', '5.00'))),
     jsonb_build_object('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'accept'));
END $$;

-- Impersonate Bob (StonePharm) as the authenticated caller -> the SECOND yes commits.
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

-- The SECOND yes -> both keys 'accept' -> commit to v2.
SELECT public.confirm_deal_change(
  'dddddddd-dddd-dddd-dddd-dddddddddddd', 'accept', 'Agreed, 120 works');

-- ── ASSERT: the seller's 3.5000 margin survived onto the NEW v2 line ─────────
DO $$
DECLARE
  v_new       int;
  v_new_line  uuid;
  v_priv_cnt  int;
  v_margin    numeric;
BEGIN
  -- the card moved to base+1 (version 2)
  SELECT version INTO v_new FROM public.deal_card
  WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  IF v_new <> 2 THEN
    RAISE EXCEPTION 'FAIL(setup): expected card version 2 after both-accept, found %', v_new;
  END IF;

  -- the freshly snapshotted v2 line (a NEW id, NOT the v1 line's id)
  SELECT id INTO v_new_line FROM public.deal_line_item
  WHERE deal_card_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' AND version = 2
  LIMIT 1;
  IF v_new_line IS NULL THEN
    RAISE EXCEPTION 'FAIL(setup): no v2 deal_line_item was snapshotted on commit';
  END IF;

  -- THE INVARIANT: exactly ONE seller private row on the NEW line, value preserved.
  SELECT count(*) INTO v_priv_cnt FROM public.deal_line_item_private
  WHERE deal_line_item_id = v_new_line
    AND company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  IF v_priv_cnt <> 1 THEN
    RAISE EXCEPTION 'FAIL(D-08): expected exactly 1 carried-forward seller private row on the v2 line, found % - the per-line margin did NOT survive the version bump', v_priv_cnt;
  END IF;

  SELECT seller_margin INTO v_margin FROM public.deal_line_item_private
  WHERE deal_line_item_id = v_new_line
    AND company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  IF v_margin IS DISTINCT FROM 3.5000 THEN
    RAISE EXCEPTION 'FAIL(D-08): the carried-forward seller_margin must equal 3.5000, found % - the value was lost or altered across the version bump', v_margin;
  END IF;
END $$;

ROLLBACK;
SELECT 'MARGIN CARRY-FORWARD INVARIANT (D-08) PASSED' AS result;
