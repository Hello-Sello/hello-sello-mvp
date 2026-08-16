-- ============================================================================
-- pricelist_item_tier_test.sql — T01 (tier-ladder Migration E) contract proof
-- ----------------------------------------------------------------------------
-- Proves the pricelist_item_tier table + doors, the shipped backfill function,
-- the save_price_ladder RPC, the current_pricelist_item view (owner + public
-- arms, visibility window, verified gate), the get_discoverable_shop dual
-- shape (legacy bundle columns AND tiers), and the ladder-shape constraint
-- triggers on direct writes. Contract: ADR-0004 rev 8 / PLAN-T01.md.
--
-- Mirrors cross_tenant_lockdown_test.sql: one BEGIN…ROLLBACK transaction that
-- creates ephemeral fixtures, impersonates each caller, asserts, and leaves NO
-- trace. Impersonation: set request.jwt.claims (what auth.uid() reads) +
-- SET LOCAL ROLE authenticated, so queries run exactly as that caller with RLS
-- active. RESET ROLE between perspectives. Any failed assertion RAISEs and
-- aborts; success prints 'ALL PRICELIST_ITEM_TIER TESTS PASSED'.
--
-- Run:  bash supabase/tests/run_pricelist_item_tier_test.sh
--       (that runner also drives the two-session race proof — phase 2 —
--        which needs real committed transactions and cannot live in here)
--
-- ⚠️  RED-FIRST: this file is EXPECTED to FAIL until Migration E
-- (20260814120000_tier_ladder_expand.sql) lands — that failure is the proof it
-- genuinely exercises the new objects. Do NOT "fix" it green here.
--
-- Personas (seeded; resolve products by supplier_product_code, never by UUID —
-- product ids are non-deterministic across resets, seed §6c pattern):
--   GreenLeaf = aaaaaaaa-…  Alice = 11111111-…  (owner/seller, verified)
--   StonePharm = bbbbbbbb-…  Bob  = 22222222-…  (other company, verified;
--                                                DEMOTED late in the view group)
--   GreenLeaf 'Standard' pricelist = 3fe179d5-c0e7-4eff-9726-f707c04572f9
-- ============================================================================

BEGIN;

-- ── Fixtures (privileged role; rolled back) ──────────────────────────────────
-- Own fixture products/items instead of mutating the seeded AUR-1A..1D rows
-- (AUR-1A carries the seeded demo bracket + rung; touching it would couple this
-- test to seed drift). NOT NULL floor on product: company_id + name.
INSERT INTO public.product (company_id, name, supplier_product_code)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tier Test Backfill Wellformed', 'TIER-BF1'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tier Test Backfill Halffilled', 'TIER-BF2'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tier Test Backfill Nondiscount', 'TIER-BF3'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tier Test RPC Target', 'TIER-RPC'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tier Test View Target', 'TIER-VIEW');

INSERT INTO public.pricelist_item
  (pricelist_id, product_id, price_per_gram, bundle_threshold_grams, bundle_price_per_gram, currency)
SELECT '3fe179d5-c0e7-4eff-9726-f707c04572f9', p.id, v.base, v.thr, v.bpg, 'EUR'
FROM (VALUES
  ('TIER-BF1',  8.00, 2000::numeric, 6.50::numeric),  -- well-formed bracket → 1 rung
  ('TIER-BF2',  8.00, 1500,          NULL),           -- half-filled → rescue, 0 rungs
  ('TIER-BF3',  8.00, 1000,          9.00),           -- non-discount → rescue, 0 rungs
  ('TIER-RPC', 10.00, NULL,          NULL),           -- save_price_ladder target
  ('TIER-VIEW',12.00, NULL,          NULL)            -- view / shop-RPC target
) AS v(code, base, thr, bpg)
JOIN public.product p
  ON p.company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
 AND p.supplier_product_code = v.code AND p.deleted_at IS NULL;

CREATE TEMP TABLE _fix ON COMMIT DROP AS
SELECT
  (SELECT pli.id FROM public.pricelist_item pli JOIN public.product p ON p.id = pli.product_id
    WHERE p.supplier_product_code = 'TIER-BF1'  AND p.company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND pli.deleted_at IS NULL) AS bf1_item,
  (SELECT pli.id FROM public.pricelist_item pli JOIN public.product p ON p.id = pli.product_id
    WHERE p.supplier_product_code = 'TIER-BF2'  AND p.company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND pli.deleted_at IS NULL) AS bf2_item,
  (SELECT pli.id FROM public.pricelist_item pli JOIN public.product p ON p.id = pli.product_id
    WHERE p.supplier_product_code = 'TIER-BF3'  AND p.company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND pli.deleted_at IS NULL) AS bf3_item,
  (SELECT pli.id FROM public.pricelist_item pli JOIN public.product p ON p.id = pli.product_id
    WHERE p.supplier_product_code = 'TIER-RPC'  AND p.company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND pli.deleted_at IS NULL) AS rpc_item,
  (SELECT pli.id FROM public.pricelist_item pli JOIN public.product p ON p.id = pli.product_id
    WHERE p.supplier_product_code = 'TIER-VIEW' AND p.company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND pli.deleted_at IS NULL) AS view_item,
  (SELECT p.id FROM public.product p
    WHERE p.supplier_product_code = 'TIER-VIEW' AND p.company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND p.deleted_at IS NULL) AS view_product;
GRANT SELECT ON _fix TO authenticated;

DO $$
BEGIN
  IF (SELECT count(*) FROM _fix WHERE bf1_item IS NULL OR bf2_item IS NULL OR bf3_item IS NULL
        OR rpc_item IS NULL OR view_item IS NULL OR view_product IS NULL) <> 0
    THEN RAISE EXCEPTION 'FIXTURE: tier-test fixtures failed to resolve — run supabase db reset'; END IF;
END $$;

-- ── (1) Schema doors — table, policies, triggers, anon holds NOTHING ─────────
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.pricelist_item_tier'::regclass)
    THEN RAISE EXCEPTION 'SCHEMA: RLS is NOT enabled on pricelist_item_tier'; END IF;

  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'pricelist_item_tier'
        AND policyname IN ('plit_all', 'plit_public_select')) <> 2
    THEN RAISE EXCEPTION 'SCHEMA: expected policies plit_all + plit_public_select on pricelist_item_tier, found %',
      (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pricelist_item_tier'
         AND policyname IN ('plit_all', 'plit_public_select')); END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.pricelist_item_tier'::regclass
        AND tgname = 'trg_pricelist_item_tier_set_updated_at')
    THEN RAISE EXCEPTION 'SCHEMA: trigger trg_pricelist_item_tier_set_updated_at is not attached'; END IF;

  -- ladder-shape constraint triggers: child-write side + parent base-edit side
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.pricelist_item_tier'::regclass AND tgname = 'trg_plit_ladder_shape')
    THEN RAISE EXCEPTION 'SCHEMA: ladder-shape trigger trg_plit_ladder_shape missing on pricelist_item_tier'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.pricelist_item'::regclass AND tgname = 'trg_pli_base_ladder_shape')
    THEN RAISE EXCEPTION 'SCHEMA: ladder-shape trigger trg_pli_base_ladder_shape missing on pricelist_item'; END IF;

  -- grant door: anon must hold NO privilege on the table or the view
  IF has_table_privilege('anon', 'public.pricelist_item_tier', 'SELECT, INSERT, UPDATE, DELETE')
    THEN RAISE EXCEPTION 'SCHEMA: anon still holds a privilege on pricelist_item_tier'; END IF;
  IF has_table_privilege('anon', 'public.current_pricelist_item', 'SELECT, INSERT, UPDATE, DELETE')
    THEN RAISE EXCEPTION 'SCHEMA: anon still holds a privilege on current_pricelist_item'; END IF;

  -- grant door (functions): anon must hold no EXECUTE
  IF has_function_privilege('anon', 'public.save_price_ladder(uuid,numeric,jsonb)', 'EXECUTE')
    THEN RAISE EXCEPTION 'SCHEMA: anon still GRANTed EXECUTE on save_price_ladder(uuid,numeric,jsonb)'; END IF;
  IF has_function_privilege('anon', 'public.owns_pricelist_item(uuid)', 'EXECUTE')
    THEN RAISE EXCEPTION 'SCHEMA: anon still GRANTed EXECUTE on owns_pricelist_item(uuid)'; END IF;
END $$;

-- ── (2) Backfill semantics — the SHIPPED backfill_bundle_to_tiers(), not a copy ──
-- Runs as the privileged role (all grants on the function are revoked; only a
-- superuser session — migration or this test — may call it). Counts are exact:
-- the migration already ran the backfill before seed, and the seeded AUR-1A
-- bracket is skipped by the idempotency guard (its rung row is seeded), so only
-- this test's three fixtures are candidates.
DO $$
DECLARE
  v_migrated int; v_rescued int; v_migrated2 int;
BEGIN
  SELECT migrated, rescued INTO v_migrated, v_rescued FROM public.backfill_bundle_to_tiers();
  IF v_migrated <> 1
    THEN RAISE EXCEPTION 'BACKFILL: expected migrated=1 (well-formed fixture), function reported %', v_migrated; END IF;
  IF v_rescued <> 2
    THEN RAISE EXCEPTION 'BACKFILL: expected rescued=2 (half-filled + non-discount fixtures), function reported %', v_rescued; END IF;

  -- well-formed bracket → exactly one live rung carrying the bracket's values
  IF (SELECT count(*) FROM public.pricelist_item_tier t
      WHERE t.pricelist_item_id = (SELECT bf1_item FROM _fix) AND t.deleted_at IS NULL) <> 1
    THEN RAISE EXCEPTION 'BACKFILL: well-formed bracket did not become exactly 1 rung'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pricelist_item_tier t
      WHERE t.pricelist_item_id = (SELECT bf1_item FROM _fix) AND t.deleted_at IS NULL
        AND t.min_grams = 2000 AND t.price_per_gram = 6.50)
    THEN RAISE EXCEPTION 'BACKFILL: migrated rung does not carry (2000 g, 6.50)'; END IF;
  IF (SELECT metadata ? 'legacy_bundle' FROM public.pricelist_item WHERE id = (SELECT bf1_item FROM _fix))
    THEN RAISE EXCEPTION 'BACKFILL: well-formed bracket was wrongly stamped legacy_bundle'; END IF;

  -- malformed brackets → 0 rungs, rescued into metadata.legacy_bundle
  IF (SELECT count(*) FROM public.pricelist_item_tier t
      WHERE t.pricelist_item_id IN (SELECT bf2_item FROM _fix UNION SELECT bf3_item FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'BACKFILL: a malformed bracket became a rung'; END IF;
  IF (SELECT metadata->'legacy_bundle' FROM public.pricelist_item WHERE id = (SELECT bf2_item FROM _fix)) IS NULL
    THEN RAISE EXCEPTION 'BACKFILL: half-filled bracket was not rescued to legacy_bundle'; END IF;
  IF (SELECT (metadata->'legacy_bundle'->>'threshold')::numeric FROM public.pricelist_item
      WHERE id = (SELECT bf2_item FROM _fix)) <> 1500
     OR (SELECT metadata->'legacy_bundle'->>'price' FROM public.pricelist_item
      WHERE id = (SELECT bf2_item FROM _fix)) IS NOT NULL
    THEN RAISE EXCEPTION 'BACKFILL: half-filled legacy_bundle payload wrong (want threshold 1500, price null)'; END IF;
  IF (SELECT metadata->'legacy_bundle' FROM public.pricelist_item WHERE id = (SELECT bf3_item FROM _fix)) IS NULL
     OR (SELECT (metadata->'legacy_bundle'->>'price')::numeric FROM public.pricelist_item
      WHERE id = (SELECT bf3_item FROM _fix)) <> 9.00
    THEN RAISE EXCEPTION 'BACKFILL: non-discount bracket was not rescued to legacy_bundle intact'; END IF;

  -- idempotency: a second run migrates nothing and does not duplicate rungs
  SELECT migrated INTO v_migrated2 FROM public.backfill_bundle_to_tiers();
  IF v_migrated2 <> 0
    THEN RAISE EXCEPTION 'BACKFILL: second run migrated % rows — not idempotent', v_migrated2; END IF;
  IF (SELECT count(*) FROM public.pricelist_item_tier t
      WHERE t.pricelist_item_id = (SELECT bf1_item FROM _fix) AND t.deleted_at IS NULL) <> 1
    THEN RAISE EXCEPTION 'BACKFILL: second run duplicated the migrated rung'; END IF;
END $$;

-- ── (3) save_price_ladder — owner writes, shape gate, RLS wall, last-save-wins ──
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_item uuid;
  v_raised boolean;
BEGIN
  SELECT rpc_item INTO v_item FROM _fix;

  -- ladder X: 2 valid rungs (descending, both < base 10) → both live, ordered
  PERFORM public.save_price_ladder(v_item, 10.00,
    '[{"min_grams":500,"price_per_gram":9},{"min_grams":1000,"price_per_gram":8}]'::jsonb);
  IF (SELECT string_agg(trim_scale(min_grams)::text || ':' || trim_scale(price_per_gram)::text, ',' ORDER BY min_grams)
      FROM public.pricelist_item_tier WHERE pricelist_item_id = v_item AND deleted_at IS NULL) IS DISTINCT FROM '500:9,1000:8'
    THEN RAISE EXCEPTION 'RPC: ladder X not saved as 2 ordered live rungs — got %',
      (SELECT string_agg(trim_scale(min_grams)::text || ':' || trim_scale(price_per_gram)::text, ',' ORDER BY min_grams)
       FROM public.pricelist_item_tier WHERE pricelist_item_id = v_item AND deleted_at IS NULL); END IF;
  IF (SELECT price_per_gram FROM public.pricelist_item WHERE id = v_item) <> 10.00
    THEN RAISE EXCEPTION 'RPC: base price was not persisted by save_price_ladder'; END IF;

  -- shape violation: a rung priced >= base must be rejected with the clear prefix
  v_raised := false;
  BEGIN
    PERFORM public.save_price_ladder(v_item, 10.00, '[{"min_grams":500,"price_per_gram":10}]'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
    IF SQLERRM NOT LIKE '%TIER_LADDER_SHAPE%'
      THEN RAISE EXCEPTION 'RPC: rung >= base rejected with the WRONG error (no TIER_LADDER_SHAPE): %', SQLERRM; END IF;
  END;
  IF NOT v_raised
    THEN RAISE EXCEPTION 'RPC: a rung priced >= base was ACCEPTED by save_price_ladder'; END IF;

  -- null base: rejected up-front with the same clear-message contract
  v_raised := false;
  BEGIN
    PERFORM public.save_price_ladder(v_item, NULL, '[{"min_grams":500,"price_per_gram":9}]'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
    IF SQLERRM NOT LIKE '%TIER_LADDER_SHAPE%'
      THEN RAISE EXCEPTION 'RPC: null base rejected with the WRONG error (no TIER_LADDER_SHAPE): %', SQLERRM; END IF;
  END;
  IF NOT v_raised
    THEN RAISE EXCEPTION 'RPC: a NULL base was ACCEPTED by save_price_ladder'; END IF;

  -- sequential saves: ladder Y replaces X exactly (old rungs soft-deleted)
  PERFORM public.save_price_ladder(v_item, 10.00,
    '[{"min_grams":700,"price_per_gram":8.5},{"min_grams":1400,"price_per_gram":7.5}]'::jsonb);
  IF (SELECT string_agg(trim_scale(min_grams)::text || ':' || trim_scale(price_per_gram)::text, ',' ORDER BY min_grams)
      FROM public.pricelist_item_tier WHERE pricelist_item_id = v_item AND deleted_at IS NULL) IS DISTINCT FROM '700:8.5,1400:7.5'
    THEN RAISE EXCEPTION 'RPC: live ladder after save Y is not exactly Y — got %',
      (SELECT string_agg(trim_scale(min_grams)::text || ':' || trim_scale(price_per_gram)::text, ',' ORDER BY min_grams)
       FROM public.pricelist_item_tier WHERE pricelist_item_id = v_item AND deleted_at IS NULL); END IF;
  IF (SELECT count(*) FROM public.pricelist_item_tier
      WHERE pricelist_item_id = v_item AND deleted_at IS NOT NULL) < 2
    THEN RAISE EXCEPTION 'RPC: ladder X rungs were not soft-deleted (expected >= 2 deleted rows)'; END IF;
END $$;
RESET ROLE;

-- Bob (StonePharm) must NOT be able to save a ladder on Alice's item: the RPC
-- is SECURITY INVOKER, so RLS hides the parent row and the FOR UPDATE lookup
-- finds nothing → the RPC raises. Any exception is a pass; silence is the leak.
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_raised boolean := false;
BEGIN
  BEGIN
    PERFORM public.save_price_ladder((SELECT rpc_item FROM _fix), 9.00,
      '[{"min_grams":500,"price_per_gram":8}]'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
  END;
  IF NOT v_raised
    THEN RAISE EXCEPTION 'LEAK: Bob (other company) saved a ladder on Alice''s pricelist_item'; END IF;
END $$;
RESET ROLE;

-- ── (4) current_pricelist_item — owner arm, public arm, window, verified gate ──
-- Rungs for the view target, written as the privileged role (base 12 → 11, 10).
INSERT INTO public.pricelist_item_tier (pricelist_item_id, min_grams, price_per_gram)
SELECT view_item, v.min_g, v.ppg FROM _fix, (VALUES (500, 11.00), (1000, 10.00)) AS v(min_g, ppg);

-- Alice (owner arm): her row is visible with tiers ordered by min_grams,
-- regardless of the public dials (still profile_visible=false here).
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_tiers jsonb;
BEGIN
  IF (SELECT count(*) FROM public.current_pricelist_item
      WHERE product_id = (SELECT view_product FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'VIEW: owner arm — Alice does not see exactly 1 row for her product'; END IF;
  SELECT tiers INTO v_tiers FROM public.current_pricelist_item
    WHERE product_id = (SELECT view_product FROM _fix);
  IF v_tiers IS NULL OR jsonb_array_length(v_tiers) <> 2
    THEN RAISE EXCEPTION 'VIEW: owner arm — tiers is not a 2-rung jsonb array: %', v_tiers; END IF;
  IF (v_tiers->0->>'min_grams')::numeric <> 500 OR (v_tiers->1->>'min_grams')::numeric <> 1000
    THEN RAISE EXCEPTION 'VIEW: tiers not ordered by min_grams: %', v_tiers; END IF;
  IF (v_tiers->0->>'price_per_gram')::numeric <> 11.00 OR (v_tiers->1->>'price_per_gram')::numeric <> 10.00
    THEN RAISE EXCEPTION 'VIEW: tier prices wrong in jsonb payload: %', v_tiers; END IF;
END $$;
RESET ROLE;

-- Bob (public arm): visible ONLY once the product is profile_visible AND
-- price_public — walk the dials one at a time.
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.current_pricelist_item
      WHERE product_id = (SELECT view_product FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'LEAK: Bob sees a non-visible product''s price row through the view'; END IF;
END $$;
RESET ROLE;

UPDATE public.product SET profile_visible = true
  WHERE id = (SELECT view_product FROM _fix);

SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.current_pricelist_item
      WHERE product_id = (SELECT view_product FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'LEAK: Bob sees a price row for a profile_visible product whose price is NOT public'; END IF;
END $$;
RESET ROLE;

UPDATE public.product SET price_public = true
  WHERE id = (SELECT view_product FROM _fix);

SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_tiers jsonb;
BEGIN
  IF (SELECT count(*) FROM public.current_pricelist_item
      WHERE product_id = (SELECT view_product FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'VIEW: public arm — verified Bob cannot see a fully public priced product'; END IF;
  SELECT tiers INTO v_tiers FROM public.current_pricelist_item
    WHERE product_id = (SELECT view_product FROM _fix);
  IF v_tiers IS NULL OR jsonb_array_length(v_tiers) <> 2
    THEN RAISE EXCEPTION 'VIEW: public arm — Bob''s row does not carry the 2-rung tiers array: %', v_tiers; END IF;
END $$;
RESET ROLE;

-- visibility window: product expired yesterday → gone for Bob, kept for Alice
UPDATE public.product SET visibility_end = current_date - 1
  WHERE id = (SELECT view_product FROM _fix);

SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.current_pricelist_item
      WHERE product_id = (SELECT view_product FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'LEAK: visibility_end in the past but Bob still sees the price row'; END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.current_pricelist_item
      WHERE product_id = (SELECT view_product FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'VIEW: owner arm must survive the visibility window — Alice lost her own row'; END IF;
END $$;
RESET ROLE;

-- verified gate: demote StonePharm → Bob (unverified) gets nothing
UPDATE public.product SET visibility_end = NULL
  WHERE id = (SELECT view_product FROM _fix);
UPDATE public.company SET verification_status = 'pending'
  WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.current_pricelist_item
      WHERE product_id = (SELECT view_product FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'LEAK: an UNVERIFIED caller sees price rows through the view''s public arm'; END IF;
  -- table door too (G4 decision): plit_public_select carries is_caller_verified(),
  -- so the DIRECT table read must also return nothing for an unverified caller.
  IF (SELECT count(*) FROM public.pricelist_item_tier t
      WHERE t.pricelist_item_id = (SELECT view_item FROM _fix)
        AND t.deleted_at IS NULL) <> 0
    THEN RAISE EXCEPTION 'LEAK: an UNVERIFIED caller reads rungs via a direct table SELECT'; END IF;
END $$;
RESET ROLE;

-- restore for the groups below (Alice-driven, but keep the world consistent)
UPDATE public.company SET verification_status = 'verified'
  WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

-- ── (5) get_discoverable_shop — dual shape (legacy bundle cols + tiers) + window ──
-- Give the view target a legacy bracket too, so ONE row proves both shapes.
UPDATE public.pricelist_item
  SET bundle_threshold_grams = 3000, bundle_price_per_gram = 9.00
  WHERE id = (SELECT view_item FROM _fix);

SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  r record;
BEGIN
  SELECT * INTO r FROM public.get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') s
    WHERE s.id = (SELECT view_product FROM _fix);
  IF NOT FOUND
    THEN RAISE EXCEPTION 'SHOP: public rung-carrying product missing from get_discoverable_shop'; END IF;
  IF r.tiers IS NULL OR jsonb_array_length(r.tiers) <> 2
    THEN RAISE EXCEPTION 'SHOP: tiers column is not a 2-rung jsonb array: %', r.tiers; END IF;
  -- dual shape: the legacy bundle columns are still in the OUT row and pass through
  IF r.bundle_threshold_grams <> 3000 OR r.bundle_price_per_gram <> 9.00
    THEN RAISE EXCEPTION 'SHOP: legacy bundle columns missing/wrong in dual-shape output (got %, %)',
      r.bundle_threshold_grams, r.bundle_price_per_gram; END IF;
END $$;
RESET ROLE;

-- new window filter: an expired product drops out of the RPC's rows entirely
UPDATE public.product SET visibility_end = current_date - 1
  WHERE id = (SELECT view_product FROM _fix);

SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') s
      WHERE s.id = (SELECT view_product FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'SHOP: visibility_end in the past but the product still shows in get_discoverable_shop'; END IF;
END $$;
RESET ROLE;

-- ── (6) Ladder-shape constraint triggers — direct writes, both directions ────
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_item uuid;
  v_raised boolean;
BEGIN
  SELECT rpc_item INTO v_item FROM _fix;   -- live ladder Y: (700 → 8.5), (1400 → 7.5); base 10

  -- direct INSERT of a rung priced >= base must trip the trigger
  v_raised := false;
  BEGIN
    INSERT INTO public.pricelist_item_tier (pricelist_item_id, min_grams, price_per_gram)
    VALUES (v_item, 2000, 999);
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
    IF SQLERRM NOT LIKE '%TIER_LADDER_SHAPE%'
      THEN RAISE EXCEPTION 'TRIGGER: direct rung INSERT >= base rejected with the WRONG error: %', SQLERRM; END IF;
  END;
  IF NOT v_raised
    THEN RAISE EXCEPTION 'TRIGGER: a direct rung INSERT priced >= base was ACCEPTED'; END IF;

  -- lowering the parent base below an existing rung must trip the parent-side trigger
  v_raised := false;
  BEGIN
    UPDATE public.pricelist_item SET price_per_gram = 8.00 WHERE id = v_item;
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
    IF SQLERRM NOT LIKE '%TIER_LADDER_SHAPE%'
      THEN RAISE EXCEPTION 'TRIGGER: base-below-rung UPDATE rejected with the WRONG error: %', SQLERRM; END IF;
  END;
  IF NOT v_raised
    THEN RAISE EXCEPTION 'TRIGGER: lowering base below a live rung via direct UPDATE was ACCEPTED'; END IF;

  RAISE NOTICE 'ALL PRICELIST_ITEM_TIER TESTS PASSED';
END $$;
RESET ROLE;

ROLLBACK;
SELECT 'ALL PRICELIST_ITEM_TIER TESTS PASSED' AS result;
