-- ============================================================================
-- connection_visibility_override_test.sql — T06 (HEL-60, PLAN-T06.md rev 3)
-- ----------------------------------------------------------------------------
-- Proves: the new public.is_connected_to_company(uuid) helper; the connection
-- override at all THREE touched sites (product_public_select RLS,
-- current_pricelist_item's public arm, get_discoverable_shop); the signed
-- verification TIGHTENING added at site 1 and its cascade into
-- product_image/product_media/pricelist_item via their nested
-- `EXISTS (SELECT 1 FROM product …)` policy predicates; the media anon-SELECT
-- revoke (S4); and the grant ritual on the new function (S1).
--
-- Mirrors discoverable_shop_spec_columns_test.sql / pricelist_item_tier_test.sql:
-- one BEGIN…ROLLBACK transaction, ephemeral fixtures, impersonation via
-- set_config('request.jwt.claim(s)', …) + SET LOCAL ROLE authenticated, RESET
-- ROLE between perspectives. Any failed assertion RAISEs and aborts; success
-- prints 'ALL CONNECTION_VISIBILITY_OVERRIDE TESTS PASSED'.
--
-- Run:  bash supabase/tests/run_connection_visibility_override_test.sh
--
-- ⚠️  RED-FIRST: this file is EXPECTED to FAIL until
-- supabase/migrations/<ts>_connection_visibility_override.sql ships. The very
-- first assertion block (§B, "helper direct tests") calls
-- public.is_connected_to_company(uuid), which DOES NOT EXIST on today's schema
-- — that failure is the proof this suite genuinely exercises the new objects.
-- Do NOT "fix" it green here.
--
-- THREE DOORS — every cell below is tagged with the door(s) it exercises. The
-- "no price / no tiers" shape is meaningless on door (a): `product` has no
-- price column.
--   (a) a direct `SELECT … FROM public.product`
--   (b) a direct `SELECT … FROM public.current_pricelist_item`
--   (c) `SELECT … FROM public.get_discoverable_shop(uuid)`
--
-- Personas (seeded; resolved by supplier_product_code / company / email NAME,
-- never a raw product/company/person uuid, EXCEPT the four fixed seed ids
-- below — those four, and the GreenLeaf 'Standard' pricelist id, are the
-- suite's own documented stable constants, same precedent as
-- pricelist_item_tier_test.sql:31):
--   GreenLeaf  = aaaaaaaa-…  Alice = 11111111-…  (owner/seller, verified)
--   StonePharm = bbbbbbbb-…  Bob   = 22222222-…  (CONNECTED to GreenLeaf —
--                                                 seed §5d, active relationship)
--   GreenLeaf 'Standard' pricelist = 3fe179d5-c0e7-4eff-9726-f707c04572f9
--   Eva / Bavaria Medical Cannabis GmbH  — verified, a real member, but has
--     ONLY a pending pending_inbox_item to GreenLeaf (seed §5f) and NO
--     relationship row at all — the "pending connection" / "unconnected
--     verified buyer" persona (N-3: pending is not a relationship_status; it
--     is the absence of a relationship row plus a pending inbox item).
--   HS Reviewer / hsteam@hello-sello.test — verified staff, company_id is
--     PERMANENTLY NULL (seed §4b) — the "companyless authenticated caller"
--     persona, resolved by email, never the well-known 99999999-… literal.
--
-- Seeded fixtures used AS-IS (no invention needed — PLAN-T06 §8):
--   AUR-1C — GreenLeaf, profile_visible=false, price_public=true,  price 4.00,
--            ZERO tier rungs (seed_visibility_matrix_test.sql:148 pins this —
--            assert tiers = '[]'::jsonb, never "tiers present", per N-1).
--   AUR-1D — GreenLeaf, profile_visible=false, price_public=false, price 5.00.
--   AUR-1A — GreenLeaf, profile_visible=true,  price_public=false (a PUBLIC,
--            not-hidden product — used for the pure verification-tightening
--            cells, independent of the connection override).
--   AUR-1B — GreenLeaf, profile_visible=true,  price_public=true, price 6.00.
--
-- Ephemeral fixtures planted here (product_media / product_image are EMPTY
-- repo-wide — PLAN-T06 §3a REV3 B-3 — so the cascade cells are vacuous
-- against the seed without planting rows):
--   T06-CASCADE — GreenLeaf, profile_visible=TRUE, price_public=true, with one
--     product_image row, one product_media row and one pricelist_item row.
--     Deliberately VISIBLE (not hidden): the tightening propagates into the
--     cascade tables via their nested `p.profile_visible = true` EXISTS
--     predicate, which is evaluated on the LITERAL column value — NOT
--     RLS-mediated — so a hidden product can never satisfy it regardless of
--     connection (PLAN-T06 §3a: "each nested predicate restates
--     p.profile_visible = true itself"). Only a VISIBLE product can prove the
--     tightening propagates.
--   T06-EXPIRED — GreenLeaf, profile_visible=FALSE, price_public=true,
--     visibility_end = yesterday. The "connection shall not override an
--     expired window" fixture; also the window-outside-override-parenthesis
--     mutation-provability cell (doors a + c).
--
-- MUTATION-PROVABILITY — the five minimum cells from PLAN-T06 §8, and which
-- assertion below is sensitive to each (searchable by these tags):
--   [MUT: site1-verified]   drop is_caller_verified() from site 1  → door a
--     + cascade (product_image/product_media/pricelist_item). NOTE: NOT door
--     c — see the comment on the door-c tightening block below; this suite
--     disagrees with PLAN-T06 §8's "doors a + c" label for this specific row
--     and the discrepancy is reported back, not silently encoded as fact.
--   [MUT: site2-verified]   drop is_caller_verified() from site 2  → door b only
--   [MUT: site2-owner-arm]  drop the owner arm from site 2         → door b, owner cell
--   [MUT: window-in-override] move the window inside the override parenthesis
--                                                                  → doors a + c
--   [MUT: site2-price-public] drop p.price_public from site 2      → door b ONLY
--     (door c is masked by the RPC's own `case when p.price_public then …
--     end` — asserting this mutation on door c would pass against a broken
--     build, PLAN-T06 §8)
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ── Fixtures (privileged role; rolled back) ─────────────────────────────────

-- T06-CASCADE: VISIBLE + priced, so the cascade cells prove the TIGHTENING
-- propagating through the nested EXISTS, not the override (which does not
-- propagate — see header).
INSERT INTO public.product (company_id, name, supplier_product_code, profile_visible, price_public, location)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'T06 Cascade Product', 'T06-CASCADE', true, true, 'T06-FIXTURE-LOC');

INSERT INTO public.product_image (product_id, company_id, image_path, position)
SELECT id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'T06-CASCADE-IMG', 0
FROM public.product WHERE supplier_product_code = 'T06-CASCADE';

INSERT INTO public.product_media (product_id, company_id, kind, path, label, position)
SELECT id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'coa', 'T06-CASCADE-DOC', 'T06 cascade doc', 0
FROM public.product WHERE supplier_product_code = 'T06-CASCADE';

INSERT INTO public.pricelist_item (pricelist_id, product_id, price_per_gram, currency)
SELECT '3fe179d5-c0e7-4eff-9726-f707c04572f9'::uuid, id, 12.34, 'EUR'
FROM public.product WHERE supplier_product_code = 'T06-CASCADE';

-- T06-EXPIRED: hidden + price_public + an EXPIRED window. Connection must not
-- override an expired window (own criterion), and this is the
-- window-inside-override-parenthesis mutation cell (doors a + c).
INSERT INTO public.product (company_id, name, supplier_product_code, profile_visible, price_public, location, visibility_end)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'T06 Expired Product', 'T06-EXPIRED', false, true, 'T06-FIXTURE-LOC', current_date - 1);

INSERT INTO public.pricelist_item (pricelist_id, product_id, price_per_gram, currency)
SELECT '3fe179d5-c0e7-4eff-9726-f707c04572f9'::uuid, id, 9.99, 'EUR'
FROM public.product WHERE supplier_product_code = 'T06-EXPIRED';

CREATE TEMP TABLE _fix ON COMMIT DROP AS
SELECT
  (SELECT id FROM public.product WHERE supplier_product_code = 'AUR-1C' AND company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) AS aur1c_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'AUR-1D' AND company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) AS aur1d_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'AUR-1A' AND company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) AS aur1a_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'AUR-1B' AND company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) AS aur1b_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'T06-CASCADE') AS cascade_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'T06-EXPIRED') AS expired_id,
  (SELECT id FROM public.product_image WHERE image_path = 'T06-CASCADE-IMG') AS cascade_image_id,
  (SELECT id FROM public.product_media WHERE path = 'T06-CASCADE-DOC') AS cascade_media_id,
  (SELECT pi.id FROM public.pricelist_item pi JOIN public.product p ON p.id = pi.product_id
     WHERE p.supplier_product_code = 'T06-CASCADE') AS cascade_price_id,
  (SELECT id FROM auth.users WHERE email = 'eva@bavaria.test') AS eva_id,
  (SELECT id FROM public.company WHERE name = 'Bavaria Medical Cannabis GmbH') AS bavaria_id,
  (SELECT id FROM auth.users WHERE email = 'hsteam@hello-sello.test') AS hs_reviewer_id,
  (SELECT r.id FROM public.relationship r
     WHERE r.metadata->>'seed' = 'demo-2d'
       AND r.company_a_id = least('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid)
       AND r.company_b_id = greatest('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid)) AS gl_sp_rel_id;
GRANT SELECT ON _fix TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM _fix
     WHERE aur1c_id IS NULL OR aur1d_id IS NULL OR aur1a_id IS NULL OR aur1b_id IS NULL
        OR cascade_id IS NULL OR expired_id IS NULL OR cascade_image_id IS NULL
        OR cascade_media_id IS NULL OR cascade_price_id IS NULL
        OR eva_id IS NULL OR bavaria_id IS NULL OR hs_reviewer_id IS NULL OR gl_sp_rel_id IS NULL)
    THEN RAISE EXCEPTION 'FIXTURE: one or more T06 fixtures failed to resolve — seed drift?'; END IF;
END $$;

-- ============================================================================
-- §B — the helper, called DIRECTLY. First reference to
-- public.is_connected_to_company(uuid) — RED-FIRST: errors "function does not
-- exist" until the migration ships.
-- ============================================================================

-- B1 [MUT: direction] — Alice (GreenLeaf = company_a, StonePharm = company_b)
-- must resolve true via the least/greatest canonical pair regardless of which
-- side she calls from. Proves the helper isn't accidentally direction-locked.
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF NOT public.is_connected_to_company('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid)
    THEN RAISE EXCEPTION 'B1: Alice (GreenLeaf) must be connected_to(StonePharm) — active relationship, seed §5d'; END IF;
END $$;
RESET ROLE;

-- B2 — companyless caller (HS Reviewer): least(NULL, x) collapses the
-- canonical-order CHECK to unsatisfiable — pins that this is genuinely load
-- bearing, not an inert guard (PLAN-T06 REV2 N1).
SELECT set_config('request.jwt.claim.sub', (SELECT hs_reviewer_id::text FROM _fix), true);
SELECT set_config('request.jwt.claims', '{"sub":"' || (SELECT hs_reviewer_id::text FROM _fix) || '","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF public.is_connected_to_company('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid)
    THEN RAISE EXCEPTION 'B2: a COMPANYLESS caller must never resolve is_connected_to_company() true'; END IF;
END $$;
RESET ROLE;

-- B3 — Eva/Bavaria: verified, real member, but NO relationship row to
-- GreenLeaf at all (only a pending inbox item — never counts).
SELECT set_config('request.jwt.claim.sub', (SELECT eva_id::text FROM _fix), true);
SELECT set_config('request.jwt.claims', '{"sub":"' || (SELECT eva_id::text FROM _fix) || '","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF public.is_connected_to_company('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid)
    THEN RAISE EXCEPTION 'B3: Bavaria has NO relationship row to GreenLeaf (only a pending inbox item) — must be false'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- §A — the happy-path matrix, relationship ACTIVE (as seeded)
-- ============================================================================

-- A1 [door a][AC5] — connected + verified Bob must NOT reach GreenLeaf's HIDDEN
-- AUR-1C through the BASE TABLE.
--
-- This assertion was INVERTED (it previously required count = 1). RLS filters
-- ROWS, not COLUMNS: every row this policy admits is handed over whole,
-- including `rrp_per_gram`, `supplier_product_code` and `metadata` — which the
-- buyer's sanctioned door (A2, the 27-column RPC projection) withholds on
-- purpose. Admitting the row here leaks a per-gram price for a product whose
-- seller set `price_public = false`, defeating "connection reveals the
-- product, never the price" through a column the price gate never covered.
--
-- The CAPABILITY is not lost: A2 (door c) asserts Bob still sees this exact
-- product through the RPC. Only the uncurated door closes.
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.product WHERE id = (SELECT aur1c_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'A1[door a]/AC5: connected+verified Bob must NOT read GreenLeaf''s hidden AUR-1C off the base table — that hands over every column of the row'; END IF;

  -- Negative space, stated as a column fact and not only as a row count: no
  -- hidden GreenLeaf product may be reachable at all, so neither confidential
  -- column can be selected for one.
  IF (SELECT count(*) FROM public.product
       WHERE company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
         AND profile_visible = false) <> 0
    THEN RAISE EXCEPTION 'A1[door a]/leak: a connected buyer reached a hidden product row directly — rrp_per_gram and supplier_product_code travel with it'; END IF;

  -- NOT ASSERTED HERE, AND DELIBERATELY SO: a product that is profile_visible
  -- = true but price_public = false still surrenders `rrp_per_gram` off this
  -- table to any verified caller. That leg is PRE-EXISTING — the live
  -- production policy admits it today and this slug did not create it — and
  -- closing it means removing the buyer's base-table read entirely, which the
  -- nested EXISTS cascades in product_image / product_media /
  -- pricelist_item_public_select currently depend on. Tracked separately; do
  -- not silently widen this test to cover it without that redesign.
END $$;
RESET ROLE;

-- A2 [door c][AC5] — same product, via the RPC.
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) s
       WHERE s.id = (SELECT aur1c_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'A2[door c]/AC5: connected+verified Bob must see GreenLeaf''s hidden AUR-1C via get_discoverable_shop'; END IF;
END $$;
RESET ROLE;

-- A3 [doors b+c][AC6, B3-cell, N-1] — AUR-1C is hidden AND price_public=true:
-- the price and tiers MUST still show (connection never hides a public
-- price). AUR-1C carries ZERO tier rungs (seed_visibility_matrix_test.sql:148)
-- — assert the EMPTY array, never "tiers present" (N-1: that would be
-- unsatisfiable on this fixture).
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE r record;
BEGIN
  SELECT price_per_gram, tiers INTO r FROM public.current_pricelist_item
   WHERE product_id = (SELECT aur1c_id FROM _fix);
  IF NOT FOUND THEN RAISE EXCEPTION 'A3[door b]: connected Bob must see a current_pricelist_item row for AUR-1C (price_public=true)'; END IF;
  IF r.price_per_gram IS DISTINCT FROM 4.00
    THEN RAISE EXCEPTION 'A3[door b]: AUR-1C price wrong — got %, expected 4.00', r.price_per_gram; END IF;
  IF r.tiers IS DISTINCT FROM '[]'::jsonb
    THEN RAISE EXCEPTION 'A3[door b]/N-1: AUR-1C has ZERO rungs — expected tiers = [], got %', r.tiers; END IF;

  SELECT price_per_gram, tiers INTO r FROM public.get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) s
   WHERE s.id = (SELECT aur1c_id FROM _fix);
  IF r.price_per_gram IS DISTINCT FROM 4.00
    THEN RAISE EXCEPTION 'A3[door c]: AUR-1C price wrong via RPC — got %, expected 4.00', r.price_per_gram; END IF;
  IF r.tiers IS DISTINCT FROM '[]'::jsonb
    THEN RAISE EXCEPTION 'A3[door c]/N-1: AUR-1C tiers via RPC wrong — expected [], got %', r.tiers; END IF;
END $$;
RESET ROLE;

-- A4 [door c][AC6] — AUR-1D is hidden AND price_public=FALSE: the product
-- shows, but price and tiers are null (connection never reveals a hidden
-- price — decision 7).
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE r record;
BEGIN
  SELECT price_per_gram, tiers INTO r FROM public.get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) s
   WHERE s.id = (SELECT aur1d_id FROM _fix);
  IF NOT FOUND THEN RAISE EXCEPTION 'A4[door c]/AC6: connected Bob must still see AUR-1D (hidden, price_public=false) — the product, not the price'; END IF;
  IF r.price_per_gram IS NOT NULL
    THEN RAISE EXCEPTION 'A4[door c]/AC6: AUR-1D price_per_gram must be NULL — got %', r.price_per_gram; END IF;
  IF r.tiers IS NOT NULL
    THEN RAISE EXCEPTION 'A4[door c]/AC6: AUR-1D tiers must be NULL — got %', r.tiers; END IF;
END $$;
RESET ROLE;

-- A5 [door b][AC6][MUT: site2-price-public] — AUR-1D via the view: connection
-- makes the row otherwise reachable (profile_visible=false OR connected=true
-- → true), so ONLY `and p.price_public` keeps this at zero rows. If that
-- conjunct were dropped from site 2, this assertion goes red; door (c) would
-- stay green either way (masked by the RPC's own `case when price_public`) —
-- this is why the mutation is asserted here and NOT relied on at door (c).
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.current_pricelist_item WHERE product_id = (SELECT aur1d_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'A5[door b]/MUT-site2-price-public: AUR-1D (price_public=false) LEAKED a price row to a connected buyer'; END IF;
END $$;
RESET ROLE;

-- A6 [doors a+c][MUT: window-in-override] — T06-EXPIRED: hidden, price_public,
-- CONNECTED, but the visibility window has passed. Connection must NOT
-- override an expired window — this is the single most likely way to get
-- site 1 / site 3 wrong (the window must stay OUTSIDE the override
-- parenthesis, PLAN-T06 §3).
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.product WHERE id = (SELECT expired_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'A6[door a]/MUT-window: connected Bob saw an EXPIRED-window hidden product — window must stay outside the override'; END IF;
  IF (SELECT count(*) FROM public.get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) s
       WHERE s.id = (SELECT expired_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'A6[door c]/MUT-window: connected Bob saw an EXPIRED-window hidden product via the RPC'; END IF;
  IF (SELECT count(*) FROM public.current_pricelist_item WHERE product_id = (SELECT expired_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'A6[door b]: connected Bob saw a price row for an EXPIRED-window hidden product'; END IF;
END $$;
RESET ROLE;

-- A7 [door b, owner][B-2][MUT: site2-owner-arm] — Alice reads ALL SIX of
-- GreenLeaf's own AUR-1* pricelist rows through current_pricelist_item,
-- price-hidden ones (AUR-1A, AUR-1C, AUR-1D, AUR-1F) included. Scoped to
-- 'AUR-%' so the T06-CASCADE/T06-EXPIRED fixtures above (which also carry
-- pricelist_item rows) can't inflate the count. If the owner arm
-- (`pl.company_id = current_company_id()`) were dropped, only the
-- price_public=true visible ones (AUR-1B, AUR-1E) would remain — 2, not 6.
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.current_pricelist_item v
    JOIN public.product p ON p.id = v.product_id
   WHERE p.company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
     AND p.supplier_product_code LIKE 'AUR-%';
  IF v_count <> 6
    THEN RAISE EXCEPTION 'A7[door b]/MUT-site2-owner-arm: Alice must see ALL 6 of her own AUR-1* price rows (hidden ones included) — got %', v_count; END IF;
END $$;
RESET ROLE;

-- A8 [door a, owner] — the owner reads their own catalogue even when their
-- OWN company is not yet verified (`product_all` is not verification-gated).
UPDATE public.company SET verification_status = 'pending'
 WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.product WHERE id = (SELECT aur1c_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'A8[door a]: Alice must see her OWN hidden product even while GreenLeaf itself is unverified — product_all is not verification-gated'; END IF;
END $$;
RESET ROLE;

UPDATE public.company SET verification_status = 'verified'
 WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

-- ============================================================================
-- §C — relationship status mutations (mutate the REAL GreenLeaf↔StonePharm
-- seeded relationship row in place; restore after each). Pins the helper's
-- own criterion: absent/suspended/ended all resolve false, never just
-- "not active".
-- ============================================================================

-- C1 [doors a+c][helper] — status = 'suspended'.
UPDATE public.relationship SET status = 'suspended' WHERE id = (SELECT gl_sp_rel_id FROM _fix);

SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF public.is_connected_to_company('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid)
    THEN RAISE EXCEPTION 'C1/helper: a SUSPENDED relationship must resolve is_connected_to_company() false'; END IF;
  IF (SELECT count(*) FROM public.product WHERE id = (SELECT aur1c_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'C1[door a]: a SUSPENDED relationship must not reveal a hidden product'; END IF;
  IF (SELECT count(*) FROM public.get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) s
       WHERE s.id = (SELECT aur1c_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'C1[door c]: a SUSPENDED relationship must not reveal a hidden product via the RPC'; END IF;
END $$;
RESET ROLE;

UPDATE public.relationship SET status = 'active' WHERE id = (SELECT gl_sp_rel_id FROM _fix);

-- C2 [door a][helper] — status = 'ended'.
UPDATE public.relationship SET status = 'ended' WHERE id = (SELECT gl_sp_rel_id FROM _fix);

SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF public.is_connected_to_company('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid)
    THEN RAISE EXCEPTION 'C2/helper: an ENDED relationship must resolve is_connected_to_company() false'; END IF;
  IF (SELECT count(*) FROM public.product WHERE id = (SELECT aur1c_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'C2[door a]: an ENDED relationship must not reveal a hidden product'; END IF;
END $$;
RESET ROLE;

UPDATE public.relationship SET status = 'active' WHERE id = (SELECT gl_sp_rel_id FROM _fix);

-- C3 [door a][helper] — soft-deleted (status stays 'active', deleted_at set).
UPDATE public.relationship SET deleted_at = now() WHERE id = (SELECT gl_sp_rel_id FROM _fix);

SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF public.is_connected_to_company('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid)
    THEN RAISE EXCEPTION 'C3/helper: a SOFT-DELETED relationship must resolve is_connected_to_company() false'; END IF;
  IF (SELECT count(*) FROM public.product WHERE id = (SELECT aur1c_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'C3[door a]: a SOFT-DELETED relationship must not reveal a hidden product'; END IF;
END $$;
RESET ROLE;

UPDATE public.relationship SET deleted_at = NULL WHERE id = (SELECT gl_sp_rel_id FROM _fix);

-- C4 — control: restoration actually worked, so C1-C3's negatives were not
-- silently vacuous against a permanently-broken relationship row.
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF NOT public.is_connected_to_company('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid)
    THEN RAISE EXCEPTION 'C4 control: the GreenLeaf<->StonePharm relationship was not fully restored to active'; END IF;
  -- Probe the SANCTIONED door, not the base table: door (a) no longer reveals
  -- hidden products to a connected buyer by design (see A1), so a base-table
  -- count here would be 0 for the right reason and would destroy this
  -- control's ability to detect a vacuous C1-C3.
  IF (SELECT count(*) FROM public.get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) s
       WHERE s.id = (SELECT aur1c_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'C4 control: Bob no longer sees AUR-1C after restore — C1-C3 negatives may have been vacuous'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- §D — pending connection: "buyer sees only what the seller made visible"
-- ============================================================================

-- D1 [doors a+c] — Eva/Bavaria: verified, a real pending_inbox_item to
-- GreenLeaf exists (precondition, pins N-3: pending is NOT a relationship
-- row), but she must NOT see GreenLeaf's hidden AUR-1C.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.pending_inbox_item p
     WHERE p.status = 'pending'
       AND p.sender_company_id = (SELECT bavaria_id FROM _fix)
       AND p.receiver_company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid)
    THEN RAISE EXCEPTION 'D1 precondition: Bavaria must have a PENDING inbox item to GreenLeaf (seed §5f) — seed drift?'; END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', (SELECT eva_id::text FROM _fix), true);
SELECT set_config('request.jwt.claims', '{"sub":"' || (SELECT eva_id::text FROM _fix) || '","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.product WHERE id = (SELECT aur1c_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'D1[door a]: Eva (PENDING connection to GreenLeaf, no relationship row) must not see GreenLeaf''s hidden AUR-1C'; END IF;
  IF (SELECT count(*) FROM public.get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) s
       WHERE s.id = (SELECT aur1c_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'D1[door c]: Eva (PENDING connection) must not see GreenLeaf''s hidden AUR-1C via the RPC'; END IF;
  -- control: Eva still sees GreenLeaf's PUBLIC catalogue, so the negatives
  -- above mean "hidden stays hidden", not "the whole shop vanished for her".
  IF (SELECT count(*) FROM public.get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) s
       WHERE s.id = (SELECT aur1a_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'D1 control: Eva must still see GreenLeaf''s PUBLIC AUR-1A — otherwise the negatives above are vacuous'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- §E — the TIGHTENING: an unverified caller's OWN company loses cross-company
-- reads, and it cascades into product_image/product_media/pricelist_item.
-- [MUT: site1-verified] and [MUT: site2-verified].
-- ============================================================================

-- E0 baseline, StonePharm still verified: connected Bob sees T06-CASCADE
-- through every door, and through the two cascade tables directly.
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.product WHERE id = (SELECT cascade_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'E0 baseline[door a]: verified Bob must see T06-CASCADE before any demotion'; END IF;
  IF (SELECT count(*) FROM public.product_image WHERE id = (SELECT cascade_image_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'E0 baseline[cascade]: verified Bob must see T06-CASCADE''s image before any demotion'; END IF;
  IF (SELECT count(*) FROM public.product_media WHERE id = (SELECT cascade_media_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'E0 baseline[cascade]: verified Bob must see T06-CASCADE''s media before any demotion'; END IF;
  IF (SELECT count(*) FROM public.pricelist_item WHERE id = (SELECT cascade_price_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'E0 baseline[cascade]: verified Bob must see T06-CASCADE''s pricelist_item row directly before any demotion'; END IF;
  IF (SELECT count(*) FROM public.current_pricelist_item WHERE product_id = (SELECT cascade_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'E0 baseline[door b]: verified Bob must see T06-CASCADE''s price row before any demotion'; END IF;
  IF (SELECT count(*) FROM public.get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) s
       WHERE s.id = (SELECT cascade_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'E0 baseline[door c]: verified Bob must see T06-CASCADE via the RPC before any demotion'; END IF;
END $$;
RESET ROLE;

-- E1 — demote StonePharm (Bob's OWN company) to unverified.
UPDATE public.company SET verification_status = 'pending'
 WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid;

SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  -- E2 [door a][MUT: site1-verified] — a PUBLIC, not-hidden GreenLeaf product
  -- (AUR-1A) is used deliberately: this isolates the TIGHTENING from the
  -- connection override entirely (Bob stays connected throughout).
  IF (SELECT count(*) FROM public.product WHERE id = (SELECT aur1a_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'E2[door a]/MUT-site1-verified: an UNVERIFIED caller (StonePharm demoted) must not read another company''s product, even a public one'; END IF;

  -- E3 [cascade][MUT: site1-verified] — product_image / product_media /
  -- pricelist_item, propagated via the nested EXISTS (which is RLS-mediated
  -- as the calling role, PLAN-T06 §3a).
  IF (SELECT count(*) FROM public.product WHERE id = (SELECT cascade_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'E3[door a]/cascade base: UNVERIFIED Bob must not see T06-CASCADE'; END IF;
  IF (SELECT count(*) FROM public.product_image WHERE id = (SELECT cascade_image_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'E3[cascade]/MUT-site1-verified: UNVERIFIED caller must lose the product_image cascade read'; END IF;
  IF (SELECT count(*) FROM public.product_media WHERE id = (SELECT cascade_media_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'E3[cascade]/MUT-site1-verified: UNVERIFIED caller must lose the product_media cascade read'; END IF;
  IF (SELECT count(*) FROM public.pricelist_item WHERE id = (SELECT cascade_price_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'E3[cascade]/MUT-site1-verified: UNVERIFIED caller must lose the pricelist_item cascade read'; END IF;

  -- E4 [door c] — the RPC's OWN inline `and public.is_caller_verified()`
  -- (T05-era, unchanged by T06). NOTE: this is a TEXTUALLY SEPARATE predicate
  -- from site 1's RLS policy — get_discoverable_shop is `security definer`
  -- and does not go through product_public_select at all. PLAN-T06 §8's
  -- mutation table labels "drop is_caller_verified() from site 1 → doors a+c"
  -- as one row; this suite disagrees with that specific pairing (see header)
  -- — a site-1-only removal cannot turn door (c) red, since (c) never reads
  -- site 1's policy. This assertion instead independently pins door (c)'s
  -- OWN verified-gate, which is a real and separately load-bearing guard.
  IF (SELECT count(*) FROM public.get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid)) <> 0
    THEN RAISE EXCEPTION 'E4[door c]: UNVERIFIED caller must get an EMPTY shop from get_discoverable_shop, not a partial one'; END IF;

  -- E5 [door b][MUT: site2-verified] — AUR-1B is visible AND price_public;
  -- only site 2's OWN `and public.is_caller_verified()` term keeps this at
  -- zero for an unverified caller.
  IF (SELECT count(*) FROM public.current_pricelist_item WHERE product_id = (SELECT aur1b_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'E5[door b]/MUT-site2-verified: UNVERIFIED caller must not read a price row through current_pricelist_item''s public arm'; END IF;
END $$;
RESET ROLE;

-- E6 — restore; control that E2-E5 were not vacuous against a broken world.
UPDATE public.company SET verification_status = 'verified'
 WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid;

SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.product WHERE id = (SELECT aur1a_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'E6 control: re-verifying StonePharm must restore Bob''s read of AUR-1A'; END IF;
  IF (SELECT count(*) FROM public.product_image WHERE id = (SELECT cascade_image_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'E6 control: re-verifying StonePharm must restore Bob''s cascade read of the product_image row'; END IF;
  IF (SELECT count(*) FROM public.product_media WHERE id = (SELECT cascade_media_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'E6 control: re-verifying StonePharm must restore Bob''s cascade read of the product_media row'; END IF;
  IF (SELECT count(*) FROM public.pricelist_item WHERE id = (SELECT cascade_price_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'E6 control: re-verifying StonePharm must restore Bob''s cascade read of the pricelist_item row'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- §F — the SECOND read-removing class: a COMPANYLESS authenticated caller
-- (HS Reviewer — permanently companyless, no mutation/restore needed).
-- ============================================================================

SELECT set_config('request.jwt.claim.sub', (SELECT hs_reviewer_id::text FROM _fix), true);
SELECT set_config('request.jwt.claims', '{"sub":"' || (SELECT hs_reviewer_id::text FROM _fix) || '","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  -- F1 [door a]
  IF (SELECT count(*) FROM public.product WHERE id = (SELECT aur1a_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'F1[door a]: a COMPANYLESS caller must not read another company''s product'; END IF;
  -- F2 [cascade]
  IF (SELECT count(*) FROM public.product_image WHERE id = (SELECT cascade_image_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'F2[cascade]: a COMPANYLESS caller must not read the product_image cascade'; END IF;
  IF (SELECT count(*) FROM public.product_media WHERE id = (SELECT cascade_media_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'F2[cascade]: a COMPANYLESS caller must not read the product_media cascade'; END IF;
  -- F3 [door b]
  IF (SELECT count(*) FROM public.current_pricelist_item WHERE product_id = (SELECT aur1b_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'F3[door b]: a COMPANYLESS caller must not read a price row through current_pricelist_item'; END IF;
  -- F4 [door c]
  IF (SELECT count(*) FROM public.get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid)) <> 0
    THEN RAISE EXCEPTION 'F4[door c]: a COMPANYLESS caller must get an EMPTY shop from get_discoverable_shop'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- §G — structural / grant assertions (privileged role; no impersonation)
-- ============================================================================

-- G1 — the view's security_barrier reloption. A predicate diff cannot see
-- this: `CREATE OR REPLACE VIEW` without a `WITH` clause silently drops it
-- (PLAN-T06 REV2 B2).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
     WHERE c.relname = 'current_pricelist_item'
       AND c.relnamespace = 'public'::regnamespace
       AND 'security_barrier=true' = ANY(c.reloptions))
    THEN RAISE EXCEPTION 'G1: current_pricelist_item lost its security_barrier=true reloption'; END IF;
END $$;

-- G2 [S1] — the new function's grant ritual.
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.is_connected_to_company(uuid)', 'EXECUTE')
    THEN RAISE EXCEPTION 'G2/S1: anon still holds EXECUTE on is_connected_to_company(uuid)'; END IF;
  IF NOT has_function_privilege('authenticated', 'public.is_connected_to_company(uuid)', 'EXECUTE')
    THEN RAISE EXCEPTION 'G2/S1: authenticated does NOT hold EXECUTE on is_connected_to_company(uuid)'; END IF;
END $$;

-- G3/G4 [S4] — the product_media anon SELECT close. Assert the GRANT and the
-- policy's role list directly — a behavioural `select` alone cannot tell
-- "denied by grant/policy" apart from "denied because product is unreadable
-- inside the policy expression", which is exactly how this was miscounted as
-- already closed (T05's security review).
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.product_media', 'SELECT')
    THEN RAISE EXCEPTION 'G3/S4: anon still holds a table-level SELECT grant on product_media'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'product_media'
       AND policyname = 'product_media_public_select'
       AND 'anon' = ANY(roles::text[]))
    THEN RAISE EXCEPTION 'G4/S4: product_media_public_select still lists anon in its role set'; END IF;
END $$;

DO $$
BEGIN
  RAISE NOTICE 'ALL CONNECTION_VISIBILITY_OVERRIDE TESTS PASSED';
END $$;

ROLLBACK;
SELECT 'ALL CONNECTION_VISIBILITY_OVERRIDE TESTS PASSED' AS result;
