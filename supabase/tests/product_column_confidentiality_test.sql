-- ============================================================================
-- product_column_confidentiality_test.sql — T13
-- ----------------------------------------------------------------------------
-- Proves: a verified, connected buyer can no longer read ANY row of
-- public.product belonging to another company, and therefore cannot read
-- `rrp_per_gram`, `supplier_product_code` or raw `metadata` off it.
--
-- WHY A ROW GATE AND NOT A COLUMN GATE: RLS filters rows, it does not filter
-- columns — an admitted row is returned whole (L-036). A column-level GRANT
-- allowlist is the obvious alternative and is WRONG here: grants are role-wide
-- and not policy-aware, so revoking `rrp_per_gram` from `authenticated` also
-- strips the SELLER's read of her own column. The fix is therefore to remove
-- the buyer's base-table read entirely and let her read the catalogue
-- through its own sanctioned door instead.
--
-- Personas (seed): Alice 1111… owns GreenLeaf aaaa… and its six AUR products.
--                  Bob   2222… is StonePharm, VERIFIED and CONNECTED to
--                  GreenLeaf — so the connection override is live for him and
--                  every assertion below runs against the widest buyer.
--
-- Measured on the tree before this file was written (not assumed):
--   as Bob:   public.product → 4 rows (AUR-1A,1B,1E,1F), rrp_per_gram
--             populated on ALL FOUR, including 1A and 1F whose seller set
--             price_public = false. That is the defect, live.
--             pricelist_item → 2, pricelist_item_tier → 2.
--   helper:   product_visible_to_caller() is TRUE for all six as Bob;
--             product_admissible_to_basket() is TRUE for 1B, 1C, 1E.
--
-- ⚠️ RED-FIRST: cell 1 FAILS until the migration ships — it finds 4 rows where
-- it wants 0, each carrying rrp_per_gram. Cells 2-6 pass today and are
-- REGRESSION GUARDS: they are the reads a policy narrowing is most likely to
-- take down, which is how the last two incidents on this repo happened. Cell 5
-- is the one that would have caught the mistake this ticket nearly made.
--
-- ⚠️ ONE DELIBERATE WIDENING is asserted in cell 5: Bob's pricelist_item count
-- goes 2 → 3, gaining AUR-1C (profile_visible=false, price_public=TRUE,
-- revealed to him by the connection). The base-table policy was NARROWER than
-- `get_discoverable_shop`, which already shows him that product and its public
-- price. Making the two doors agree is the point (L-038); it is recorded here
-- so it reads as intended rather than as a leak someone finds later.
--
-- Run:  bash supabase/tests/run_product_column_confidentiality_test.sh
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE _fix ON COMMIT DROP AS
SELECT
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid AS greenleaf_id,
  '11111111-1111-1111-1111-111111111111'::uuid AS alice_id,
  '22222222-2222-2222-2222-222222222222'::uuid AS bob_id;
GRANT SELECT ON _fix TO authenticated;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.product
       WHERE company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
         AND deleted_at IS NULL) <> 6
    THEN RAISE EXCEPTION 'FIXTURE: expected GreenLeaf to have 6 live products — seed drift'; END IF;
  IF (SELECT count(*) FROM public.product
       WHERE company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
         AND deleted_at IS NULL AND rrp_per_gram IS NOT NULL) <> 6
    THEN RAISE EXCEPTION 'FIXTURE: expected all six to carry rrp_per_gram — seed drift'; END IF;
END $$;

-- ============================================================================
-- Cell 1 [THE DEFECT] — Bob reads NOTHING off another company's product table.
-- Asserted as a row count, not a column count: once the row is gone, every
-- confidential column on it is gone with it, for EVERY combination of
-- profile_visible x price_public. Today: 4 rows, all four with rrp_per_gram.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE n int; leaked int;
BEGIN
  SELECT count(*), count(rrp_per_gram) INTO n, leaked
    FROM public.product
   WHERE company_id = (SELECT greenleaf_id FROM _fix);
  IF n <> 0 THEN
    RAISE EXCEPTION 'Cell 1: a connected buyer still reads % row(s) of another company''s product table (% carrying rrp_per_gram). RLS filters rows, not columns — the row must not be admitted at all', n, leaked;
  END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- Cell 2 [the buyer is not blinded] — the sanctioned door still serves her.
-- Bob is connected, so all SIX are visible through `get_discoverable_shop`,
-- including the two the connection reveals (1C, 1D). Closing the base table
-- must not cost the buyer anything she is entitled to see.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM public.get_discoverable_shop((SELECT greenleaf_id FROM _fix));
  IF n <> 6 THEN
    RAISE EXCEPTION 'Cell 2: connected buyer sees % of GreenLeaf''s 6 products through get_discoverable_shop — closing the base table must not narrow the sanctioned door', n;
  END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- Cell 3 [the door is a projection, not the row] — the same RPC must not hand
-- back the three confidential columns under any name. This is the assertion
-- that survives someone "helpfully" widening the RPC later.
-- ============================================================================
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(a.attname, ', ') INTO bad
    FROM pg_proc pr
    JOIN pg_type t ON t.oid = pr.prorettype
    JOIN pg_attribute a ON a.attrelid = t.typrelid
   WHERE pr.proname = 'get_discoverable_shop'
     AND a.attname IN ('rrp_per_gram', 'supplier_product_code', 'metadata');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Cell 3: get_discoverable_shop returns confidential column(s): %', bad;
  END IF;
END $$;

-- ============================================================================
-- Cell 4 [REGRESSION GUARD] — the seller's own read is untouched. This is the
-- assertion that fails if anyone "fixes" T13 with a column-level GRANT.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE n int; with_rrp int; with_code int;
BEGIN
  SELECT count(*), count(rrp_per_gram), count(supplier_product_code) INTO n, with_rrp, with_code
    FROM public.product
   WHERE company_id = (SELECT greenleaf_id FROM _fix) AND deleted_at IS NULL;
  IF n <> 6 OR with_rrp <> 6 OR with_code <> 6 THEN
    RAISE EXCEPTION 'Cell 4: the SELLER lost her own catalogue read — % rows, % rrp, % codes (want 6/6/6)', n, with_rrp, with_code;
  END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- Cell 5 [REGRESSION GUARD, + the one deliberate widening] — the cascading
-- policies still resolve after product_public_select is gone. They nested an
-- EXISTS over public.product, which is RLS-filtered as the CALLING role, so
-- removing the buyer's product read is exactly what would silently blank them.
-- pricelist_item: 2 -> 3 (gains AUR-1C, see the header). Tiers stay 2.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE items int; tiers int;
BEGIN
  SELECT count(*) INTO items FROM public.pricelist_item;
  SELECT count(*) INTO tiers FROM public.pricelist_item_tier;
  IF items <> 3 THEN
    RAISE EXCEPTION 'Cell 5: buyer reads % pricelist_item row(s), want 3 (AUR-1B, 1C, 1E). 0 means the cascade lost its product read; 2 means the connection arm did not reach the price door', items;
  END IF;
  IF tiers <> 2 THEN
    RAISE EXCEPTION 'Cell 5: buyer reads % pricelist_item_tier row(s), want 2 (AUR-1E''s). 0 means plit_public_select lost its product join', tiers;
  END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- Cell 6 [price confidentiality survives] — the widening in cell 5 must not
-- have reached a product whose seller hid its price. AUR-1A and AUR-1F are
-- profile_visible = true, price_public = FALSE: visible, priceless.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE leaked text;
BEGIN
  SELECT string_agg(p.supplier_product_code, ', ') INTO leaked
    FROM public.pricelist_item pli
    JOIN public.product p ON p.id = pli.product_id
   WHERE p.price_public = false;
  IF leaked IS NOT NULL THEN
    RAISE EXCEPTION 'Cell 6: buyer reads a pricelist_item for price-hidden product(s): %', leaked;
  END IF;
END $$;
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'ALL PRODUCT_COLUMN_CONFIDENTIALITY TESTS PASSED'; END $$;

ROLLBACK;
