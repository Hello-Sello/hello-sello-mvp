-- ============================================================================
-- cross_tenant_lockdown_test.sql — SEC-01/SEC-02/SEC-03 adversarial proof
-- ----------------------------------------------------------------------------
-- Proves an unverified-or-anonymous viewer gets NOTHING through either door:
--   • REST table read   (anon SELECT on product / pricelist_item / product_image)
--   • Discover RPC read  (an unverified authenticated caller hitting the 3 RPCs)
-- ...while a VERIFIED caller still gets the directory (no over-lock regression).
--
-- Mirrors rls_isolation_test.sql: one BEGIN…ROLLBACK transaction that creates
-- ephemeral fixtures, impersonates each caller, asserts, and leaves NO trace.
-- Impersonation: set request.jwt.claims (what auth.uid() reads) + SET LOCAL ROLE,
-- so queries run exactly as that caller with RLS active. RESET ROLE between
-- perspectives. Any failed assertion RAISEs and aborts; success prints
-- 'ALL CROSS-TENANT LOCKDOWN TESTS PASSED'.
--
-- Run:  bash supabase/tests/run_cross_tenant_lockdown_test.sh
--
-- ⚠️  RED-FIRST (Wave-0): this file is EXPECTED to FAIL against today's un-gated
-- schema — that failure is the proof it genuinely exercises the doors. It goes
-- GREEN in 02-04, after SEC-01 (caller-verified RPC gate) and SEC-02
-- (revoke anon grant + TO authenticated policies) land. Do NOT "fix" it green here.
--
-- Two door-types are asserted, both required for "gets nothing":
--   policy door  — `SET LOCAL ROLE anon; count(*) FROM <table>` ⇒ 0
--   grant door   — has_table_privilege('anon', <table>, 'SELECT')          = false
--                  has_function_privilege('anon', <rpc>,   'EXECUTE')      = false (GAP-1)
--
-- Fixtures (privileged role; rolled back): seed.sql ships BOTH demo companies as
-- 'verified', so we DEMOTE StonePharm to 'pending' in-fixture to obtain an
-- UNVERIFIED caller (Bob). GreenLeaf stays 'verified' and is both the verified
-- caller (Alice) and the verified target with a profile_visible catalogue.
--   GreenLeaf = aaaaaaaa-…  Alice = 11111111-…   (verified caller + target)
--   StonePharm = bbbbbbbb-…  Bob  = 22222222-…   (DEMOTED → unverified caller)
-- ============================================================================

BEGIN;

-- ── Fixture: demote StonePharm so Bob is the UNVERIFIED caller (rolled back) ──
UPDATE company SET verification_status = 'pending'
  WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

-- ── Fixture: give GreenLeaf a profile_visible catalogue for the verified-caller
-- no-over-lock check. Seed ships its products profile_visible=false and product
-- UUIDs are non-deterministic across resets, so flip them in-fixture by company
-- (rolled back). The assertion must test the lockdown behaviour, not volatile seed
-- state — without this it would false-fail whenever nothing happens to be opted in. ──
UPDATE product SET profile_visible = true, price_public = true
  WHERE company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND deleted_at IS NULL;

-- ── (1) ANON (no JWT) — both doors must be shut ──────────────────────────────
SET LOCAL ROLE anon;
DO $$
BEGIN
  -- policy door: anon must read zero catalogue rows.
  -- After SEC-02 revokes anon's SELECT grant, the read raises insufficient_privilege
  -- (permission denied) — a STRONGER close than "0 rows", since the query never
  -- reaches RLS. Treat that as a pass; only an actual count > 0 is a leak. The
  -- has_table_privilege grant-door checks below remain the definitive assertion.
  BEGIN
    IF (SELECT count(*) FROM product) <> 0
      THEN RAISE EXCEPTION 'LEAK: anon read % product rows', (SELECT count(*) FROM product); END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    IF (SELECT count(*) FROM pricelist_item) <> 0
      THEN RAISE EXCEPTION 'LEAK: anon read % pricelist_item rows', (SELECT count(*) FROM pricelist_item); END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    IF (SELECT count(*) FROM product_image) <> 0
      THEN RAISE EXCEPTION 'LEAK: anon read % product_image rows', (SELECT count(*) FROM product_image); END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- grant door (tables): anon must hold no SELECT privilege
  IF has_table_privilege('anon', 'public.product', 'SELECT')
    THEN RAISE EXCEPTION 'LEAK: anon still GRANTed SELECT on product'; END IF;
  IF has_table_privilege('anon', 'public.pricelist_item', 'SELECT')
    THEN RAISE EXCEPTION 'LEAK: anon still GRANTed SELECT on pricelist_item'; END IF;
  IF has_table_privilege('anon', 'public.product_image', 'SELECT')
    THEN RAISE EXCEPTION 'LEAK: anon still GRANTed SELECT on product_image'; END IF;

  -- grant door (RPCs, GAP-1): anon must hold no EXECUTE on the Discover RPCs
  IF has_function_privilege('anon', 'public.list_discoverable_companies()', 'EXECUTE')
    THEN RAISE EXCEPTION 'LEAK: anon still GRANTed EXECUTE on list_discoverable_companies()'; END IF;
  IF has_function_privilege('anon', 'public.get_discoverable_company(uuid)', 'EXECUTE')
    THEN RAISE EXCEPTION 'LEAK: anon still GRANTed EXECUTE on get_discoverable_company(uuid)'; END IF;
  IF has_function_privilege('anon', 'public.get_discoverable_shop(uuid)', 'EXECUTE')
    THEN RAISE EXCEPTION 'LEAK: anon still GRANTed EXECUTE on get_discoverable_shop(uuid)'; END IF;
END $$;
RESET ROLE;

-- ── (2) UNVERIFIED authenticated caller — Bob (StonePharm demoted) ───────────
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  -- caller's own company is unverified ⇒ every Discover door returns nothing
  IF (SELECT count(*) FROM list_discoverable_companies()) <> 0
    THEN RAISE EXCEPTION 'LEAK: unverified caller saw % companies via list_discoverable_companies()',
      (SELECT count(*) FROM list_discoverable_companies()); END IF;
  IF (SELECT count(*) FROM get_discoverable_company('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')) <> 0
    THEN RAISE EXCEPTION 'LEAK: unverified caller saw % rows via get_discoverable_company()',
      (SELECT count(*) FROM get_discoverable_company('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')); END IF;
  IF (SELECT count(*) FROM get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')) <> 0
    THEN RAISE EXCEPTION 'LEAK: unverified caller saw % rows via get_discoverable_shop()',
      (SELECT count(*) FROM get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')); END IF;
END $$;
RESET ROLE;

-- ── (3) VERIFIED authenticated caller — Alice (GreenLeaf) — no over-lock ─────
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  -- a verified caller must still see the directory (the lockdown isn't over-broad)
  IF (SELECT count(*) FROM list_discoverable_companies()) = 0
    THEN RAISE EXCEPTION 'REGRESSION: verified caller saw an EMPTY directory'; END IF;
  -- ...and the verified target's profile_visible catalogue (San Raf 29/1 PNK)
  IF (SELECT count(*) FROM get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')) = 0
    THEN RAISE EXCEPTION 'REGRESSION: verified caller saw an EMPTY shop for a verified target'; END IF;
END $$;
RESET ROLE;

ROLLBACK;
SELECT 'ALL CROSS-TENANT LOCKDOWN TESTS PASSED' AS result;
