-- ============================================================================
-- deactivated_company_gate_test.sql — HEL-70
-- ----------------------------------------------------------------------------
-- Proves: `company.deactivated_at` closes every discovery door, and that
-- reactivating reopens all of them.
--
-- THE DEFECT. `deactivated_at` has existed since 20260706090000:48 and is set
-- in five places by that migration's own RPCs. Until 20260825110000 NO read
-- door consulted it: a paused company kept listing in Discover, kept opening
-- its shop, kept handing a connected buyer prices and tier ladders, and kept
-- its people in the person directory. Measured on production 2026-08-25:
-- 0 of 21 live companies are deactivated — a real hole with no current victim.
--
-- THE RULE (DECISIONS.md 2026-08-25, "closed-to-everyone"): a deactivated
-- company reads IDENTICALLY to a soft-deleted one, except that it is
-- REVERSIBLE and its OWN members never lose sight of their catalogue.
--
-- Run:  bash supabase/tests/run_deactivated_company_gate_test.sh
--
-- ⚠️  RED-FIRST: every §B cell and both §E cells FAIL against the pre-fix
-- schema — that failure IS the reproduction. They go green once
-- 20260825110000_deactivated_company_gate.sql lands. §A, §C and §D pass either
-- way by design: they are the controls, and a control that only passes after
-- the fix is not a control.
--
-- ⚠️  FIVE DOORS, NOT FOUR. The ticket named four. `list_discoverable_people`
-- (20260724101000:54) is the fifth and was found during this ticket's research
-- — without it a paused company's PEOPLE stay discoverable. §B5 is that cell.
-- §E asserts all five AGREE term-for-term, because a "single owner" is a claim
-- about agreement with the other doors, not about file count (L-038).
--
-- ⚠️  WHAT THIS SUITE DELIBERATELY DOES NOT ASSERT: that a new connection is
-- blocked. The rule says it; these five edits cannot deliver it. A connect
-- request is a direct client INSERT into `pending_inbox_item` governed by
-- `inbox_insert`, which constrains only the SENDER. Filed separately.
--
-- Shape mirrors pricelist_view_single_owner_test.sql: one BEGIN…ROLLBACK,
-- ephemeral fixtures, impersonation via set_config('request.jwt.claim(s)', …)
-- + SET LOCAL ROLE authenticated, RESET ROLE between perspectives. §B mutates
-- the seeded GreenLeaf row and §D restores it; the transaction rolls back
-- regardless, so this suite leaves the shared seed exactly as it found it
-- (L-033 / HEL-73 — a suite that permanently edits the seed makes every later
-- green run mean less than it looks).
--
-- Personas (seeded):
--   GreenLeaf  = aaaaaaaa-…  Alice = 11111111-…  (seller, verified)
--   StonePharm = bbbbbbbb-…  Bob   = 22222222-…  (CONNECTED to GreenLeaf,
--                                                 seed §5d, active relationship)
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ── Fixture (privileged role; rolled back) ──────────────────────────────────
--
-- ONE product, deliberately the EASIEST possible case: filed, publicly
-- visible, publicly priced, at a verified non-deleted seller Bob is connected
-- to. Every other reason a row could go missing is switched off, so when §B
-- sees nothing the ONLY remaining explanation is `deactivated_at`.

INSERT INTO public.product (company_id, name, supplier_product_code, profile_visible, price_public, location)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'HEL70 Gate Fixture', 'HEL70-FIXTURE', true, true, 'HEL70-FIXTURE-LOC');

INSERT INTO public.pricelist_item (pricelist_id, product_id, price_per_gram, currency)
SELECT '3fe179d5-c0e7-4eff-9726-f707c04572f9'::uuid, id, 6.60, 'EUR'
FROM public.product WHERE supplier_product_code = 'HEL70-FIXTURE';

CREATE TEMP TABLE _fix ON COMMIT DROP AS
SELECT
  (SELECT id FROM public.product WHERE supplier_product_code = 'HEL70-FIXTURE') AS prod_id,
  (SELECT deactivated_at FROM public.company WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) AS gl_deact_before;

GRANT SELECT ON _fix TO authenticated;

DO $$
BEGIN
  IF (SELECT prod_id FROM _fix) IS NULL
    THEN RAISE EXCEPTION 'FIXTURE: HEL-70 product failed to resolve — seed drift'; END IF;
  IF (SELECT gl_deact_before FROM _fix) IS NOT NULL
    THEN RAISE EXCEPTION 'FIXTURE: GreenLeaf is ALREADY deactivated in the seed — §A controls would be meaningless'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.company
                  WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
                    AND deleted_at IS NULL AND verification_status = 'verified')
    THEN RAISE EXCEPTION 'FIXTURE: GreenLeaf is not live+verified in the seed — the term under test would be masked'; END IF;
END $$;

-- ============================================================================
-- §A — CONTROLS. GreenLeaf is ACTIVE. Bob reaches all seven surfaces.
--      If any cell here fails, every "0 rows" in §B is worthless: the row
--      could be missing for any reason at all.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF NOT public.product_visible_to_caller((SELECT prod_id FROM _fix))
    THEN RAISE EXCEPTION 'A1/control: connected Bob must see the fixture product while GreenLeaf is active'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.list_discoverable_companies()
                  WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid)
    THEN RAISE EXCEPTION 'A2/control: GreenLeaf must appear in the Discover listing while active'; END IF;

  IF (SELECT count(*) FROM public.get_discoverable_company('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid)) <> 1
    THEN RAISE EXCEPTION 'A3/control: GreenLeaf''s company page must open while active'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) s
                  WHERE s.id = (SELECT prod_id FROM _fix))
    THEN RAISE EXCEPTION 'A4/control: the fixture product must appear in GreenLeaf''s shop while active'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.list_discoverable_people()
                  WHERE company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid)
    THEN RAISE EXCEPTION 'A5/control: GreenLeaf''s people must appear in the People directory while active'; END IF;

  IF (SELECT count(*) FROM public.current_pricelist_item WHERE product_id = (SELECT prod_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'A6/control: the fixture''s price must reach Bob while GreenLeaf is active'; END IF;

  IF NOT public.product_admissible_to_basket((SELECT prod_id FROM _fix))
    THEN RAISE EXCEPTION 'A7/control: the fixture must be basket-admissible while GreenLeaf is active'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- §B — THE GATE. GreenLeaf is deactivated. Every door closes for Bob.
--      RED against the pre-fix schema — that failure IS the reproduction.
-- ============================================================================
UPDATE public.company SET deactivated_at = now()
 WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  -- B1 covers SIX doors at once: product, image, media, pricelist-item, tier
  -- and basket all delegate to product_visible_to_caller (T13 + HEL-69).
  IF public.product_visible_to_caller((SELECT prod_id FROM _fix))
    THEN RAISE EXCEPTION 'B1/product: a DEACTIVATED seller''s product is still visible to a connected buyer — the buyer arm has no deactivated_at term'; END IF;

  IF EXISTS (SELECT 1 FROM public.list_discoverable_companies()
              WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid)
    THEN RAISE EXCEPTION 'B2/listing: a DEACTIVATED company still lists in Discover'; END IF;

  IF (SELECT count(*) FROM public.get_discoverable_company('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid)) <> 0
    THEN RAISE EXCEPTION 'B3/page: a DEACTIVATED company''s page still opens on a direct link'; END IF;

  IF (SELECT count(*) FROM public.get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid)) <> 0
    THEN RAISE EXCEPTION 'B4/shop: a DEACTIVATED company''s shop still opens'; END IF;

  -- The fifth door. Not named in the ticket; found during research.
  IF EXISTS (SELECT 1 FROM public.list_discoverable_people()
              WHERE company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid)
    THEN RAISE EXCEPTION 'B5/people: a DEACTIVATED company''s PEOPLE are still discoverable — the fifth door (20260724101000:54)'; END IF;

  IF (SELECT count(*) FROM public.current_pricelist_item WHERE product_id = (SELECT prod_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'B6/price: a DEACTIVATED seller still hands a per-gram price and tier ladder to a connected buyer'; END IF;

  IF public.product_admissible_to_basket((SELECT prod_id FROM _fix))
    THEN RAISE EXCEPTION 'B7/basket: a DEACTIVATED seller''s product is still basket-admissible'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- §C — THE OWNER KEEPS EVERYTHING. Still deactivated; Alice is GreenLeaf.
--      This is the half of the ruling that makes deactivation reversible:
--      "their own members never lose sight of their catalogue."
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  -- The owner arm never reads `company` at all, so it is unreachable from this
  -- change by construction. Asserted anyway: "by construction" is how guards
  -- get dropped without anyone noticing.
  IF NOT public.product_visible_to_caller((SELECT prod_id FROM _fix))
    THEN RAISE EXCEPTION 'C1/owner: a DEACTIVATED company''s own member lost sight of their own product — the term leaked into the owner arm'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.product WHERE id = (SELECT prod_id FROM _fix))
    THEN RAISE EXCEPTION 'C2/owner: /present''s read (plain RLS on product) went dark for the owner while deactivated'; END IF;

  IF NOT public.product_admissible_to_basket((SELECT prod_id FROM _fix))
    THEN RAISE EXCEPTION 'C3/owner: the owner lost basket admission on their own product while deactivated'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- §D — THE ROUND TRIP. Reactivate; every door must come back exactly as it was.
--      The ticket asks for this explicitly: "assert the round trip, not just
--      the off state." Deactivation that cannot be undone is deletion.
-- ============================================================================
UPDATE public.company SET deactivated_at = (SELECT gl_deact_before FROM _fix)
 WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF NOT public.product_visible_to_caller((SELECT prod_id FROM _fix))
    THEN RAISE EXCEPTION 'D1/round-trip: the product did NOT come back after reactivation'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.list_discoverable_companies()
                  WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid)
    THEN RAISE EXCEPTION 'D2/round-trip: the Discover listing did NOT come back after reactivation'; END IF;

  IF (SELECT count(*) FROM public.get_discoverable_company('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid)) <> 1
    THEN RAISE EXCEPTION 'D3/round-trip: the company page did NOT reopen after reactivation'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) s
                  WHERE s.id = (SELECT prod_id FROM _fix))
    THEN RAISE EXCEPTION 'D4/round-trip: the shop did NOT reopen after reactivation'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.list_discoverable_people()
                  WHERE company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid)
    THEN RAISE EXCEPTION 'D5/round-trip: the People directory did NOT come back after reactivation'; END IF;

  IF (SELECT count(*) FROM public.current_pricelist_item WHERE product_id = (SELECT prod_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'D6/round-trip: the price did NOT come back after reactivation'; END IF;

  IF NOT public.product_admissible_to_basket((SELECT prod_id FROM _fix))
    THEN RAISE EXCEPTION 'D7/round-trip: basket admission did NOT come back after reactivation'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- §E — THE DOORS AGREE (L-038). A behavioural pass above proves each door
--      behaves right for THIS fixture. It does not prove the rule is stated
--      the same way in each door — which is the failure this repo keeps
--      having: round 4 of slug 0022's ship gate found three terms present in
--      one door and absent in another, behaviour identical until it wasn't.
--      So assert the SOURCE of all five, not just the behaviour.
-- ============================================================================
DO $$
DECLARE
  d           text;
  missing     text[] := '{}';
  no_verified text[] := '{}';
BEGIN
  FOREACH d IN ARRAY ARRAY[
    'public.product_visible_to_caller(uuid)',
    'public.list_discoverable_companies()',
    'public.get_discoverable_company(uuid)',
    'public.get_discoverable_shop(uuid)',
    'public.list_discoverable_people()'
  ] LOOP
    -- E1: every door carries the new term.
    IF pg_get_functiondef(d::regprocedure) !~* 'deactivated_at\s+is\s+null' THEN
      missing := missing || d;
    END IF;
    -- E2: and carries it BESIDE the liveness terms it already had. A door that
    -- lost `verification_status` while gaining `deactivated_at` would pass E1
    -- and still be a regression — this is the shape that cost Discover its
    -- verified-caller gate.
    IF pg_get_functiondef(d::regprocedure) !~* 'verification_status\s*=\s*''verified''' THEN
      no_verified := no_verified || d;
    END IF;
  END LOOP;

  IF array_length(missing, 1) IS NOT NULL
    THEN RAISE EXCEPTION 'E1/agreement: these doors do NOT carry a deactivated_at term: %', array_to_string(missing, ', '); END IF;

  IF array_length(no_verified, 1) IS NOT NULL
    THEN RAISE EXCEPTION 'E2/regression: these doors LOST their verification_status term while gaining deactivated_at: %', array_to_string(no_verified, ', '); END IF;
END $$;

-- ── Nothing is committed. The seed is exactly as it was found (L-033). ──────
ROLLBACK;

DO $$
BEGIN
  IF (SELECT deactivated_at FROM public.company WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) IS NOT NULL
    THEN RAISE EXCEPTION 'TEARDOWN: GreenLeaf is still deactivated after ROLLBACK — this suite mutated the shared seed'; END IF;
  IF EXISTS (SELECT 1 FROM public.product WHERE supplier_product_code = 'HEL70-FIXTURE')
    THEN RAISE EXCEPTION 'TEARDOWN: the HEL-70 fixture product survived ROLLBACK — this suite mutated the shared seed'; END IF;
END $$;

\echo '  HEL-70 deactivated-company gate: ALL CELLS PASSED (A control x7, B gate x7, C owner x3, D round-trip x7, E agreement x2)'
