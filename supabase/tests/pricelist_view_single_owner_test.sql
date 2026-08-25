-- ============================================================================
-- pricelist_view_single_owner_test.sql — HEL-69
-- ----------------------------------------------------------------------------
-- Proves: `current_pricelist_item` stops reprinting the price-visibility rule
-- and delegates to `public.product_price_visible_to_caller(uuid)` — the
-- function that already gates `pricelist_item_public_select` and
-- `plit_public_select`, and that this view was the last price door not to call.
--
-- THE DEFECT, measured on PRODUCTION 2026-08-24 before this suite was written.
-- The view's hand-written public arm is missing three terms that
-- `product_visible_to_caller()` carries:
--     * the seller company's `deleted_at IS NULL`
--     * the seller company's `verification_status = 'verified'`
--     * the product's `location IS NOT NULL`  (unfiled is not a shelf)
-- Two live rows leak a per-gram price and its tier ladder to any CONNECTED
-- buyer: StonePharm's unfiled 'Spirit Bear T28 STR MLS' (EUR 9.50) and CNG
-- Berlin's 'fdsc' (EUR 2.00, seller still `verification_status = 'pending'`).
-- `is_caller_verified()` does NOT cover the second of those — it checks the
-- CALLER's company, never the seller's, and nothing in the view reads the
-- seller's `company` row at all.
--
-- Run:  bash supabase/tests/run_pricelist_view_single_owner_test.sh
--
-- ⚠️  RED-FIRST: §A cells 2-4 are EXPECTED to FAIL until
-- supabase/migrations/20260825100000_pricelist_view_single_owner.sql ships.
-- Against today's schema each returns the row it must withhold. That failure
-- IS the local reproduction of the production leak — do not "fix" it green
-- here. §D's viewdef assertion fails red for the same reason.
--
-- ⚠️  WHAT THIS SUITE MUST NOT ASSERT: `security_invoker = true`. The view is
-- owner-rights DELIBERATELY (ADR-0004 §4) — `pricelist` carries exactly one
-- policy, `pricelist_all USING (company_id = current_company_id())`, and the
-- view joins it, so caller-rights would return ZERO rows to every buyer and
-- take the price surface dark. The ERROR-level `security_definer_view` advisor
-- entry is knowingly accepted (ARCHITECTURE-NOTES.md:231). §D asserts the
-- compensating control instead — `security_barrier=true`, which
-- `CREATE OR REPLACE VIEW` silently drops when the WITH clause is omitted and
-- which nothing else fails loudly about.
--
-- Shape mirrors connection_visibility_override_test.sql: one BEGIN…ROLLBACK,
-- ephemeral fixtures, impersonation via set_config('request.jwt.claim(s)', …)
-- + SET LOCAL ROLE authenticated, RESET ROLE between perspectives. Mutates the
-- seeded GreenLeaf company row in §A3/§A4 and restores it in the same cell;
-- the whole transaction rolls back regardless (L-033: this suite leaves the
-- shared seed exactly as it found it).
--
-- Personas (seeded):
--   GreenLeaf  = aaaaaaaa-…  Alice = 11111111-…  (owner/seller, verified)
--   StonePharm = bbbbbbbb-…  Bob   = 22222222-…  (CONNECTED to GreenLeaf,
--                                                 seed §5d, active relationship)
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ── Fixtures (privileged role; rolled back) ─────────────────────────────────
--
-- Both products are HIDDEN (`profile_visible = false`) and PRICED
-- (`price_public = true`), so both reach the view only through the connection
-- override, and neither is withheld by the price gate. They differ in ONE
-- term — `location` — which is the whole point: FILED is the control that
-- proves each cell discriminates on the term under test and not on some
-- unrelated reason the row went missing.

-- HEL69-UNFILED — the unfiled product. Must be withheld from a buyer.
INSERT INTO public.product (company_id, name, supplier_product_code, profile_visible, price_public, location)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'HEL69 Unfiled Product', 'HEL69-UNFILED', false, true, NULL);

INSERT INTO public.pricelist_item (pricelist_id, product_id, price_per_gram, currency)
SELECT '3fe179d5-c0e7-4eff-9726-f707c04572f9'::uuid, id, 7.77, 'EUR'
FROM public.product WHERE supplier_product_code = 'HEL69-UNFILED';

-- HEL69-FILED — identical but FILED. The control: it must be visible to Bob
-- both before and after the fix, in every cell below.
INSERT INTO public.product (company_id, name, supplier_product_code, profile_visible, price_public, location)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'HEL69 Filed Product', 'HEL69-FILED', false, true, 'HEL69-FIXTURE-LOC');

INSERT INTO public.pricelist_item (pricelist_id, product_id, price_per_gram, currency)
SELECT '3fe179d5-c0e7-4eff-9726-f707c04572f9'::uuid, id, 8.88, 'EUR'
FROM public.product WHERE supplier_product_code = 'HEL69-FILED';

-- A live tier rung on the FILED product: the view hands back `tiers` alongside
-- the price, so the ladder must travel with the row and vanish with it.
INSERT INTO public.pricelist_item_tier (pricelist_item_id, min_grams, price_per_gram)
SELECT pi.id, 100, 8.00
FROM public.pricelist_item pi JOIN public.product p ON p.id = pi.product_id
WHERE p.supplier_product_code = 'HEL69-FILED';

CREATE TEMP TABLE _fix ON COMMIT DROP AS
SELECT
  (SELECT id FROM public.product WHERE supplier_product_code = 'HEL69-UNFILED') AS unfiled_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'HEL69-FILED')   AS filed_id,
  -- AUR-1D (§C, the price-hidden control) is resolved HERE, under the
  -- privileged role, and never inside an impersonated cell. Since T13 the
  -- `product` base table carries a single owner-only policy
  -- (`product_all USING (company_id = current_company_id())`), so a buyer
  -- cannot resolve ANY product id off it — an in-cell lookup as Bob returns
  -- NULL and the cell reports "seed drift" for a schema that is behaving
  -- exactly as designed.
  (SELECT id FROM public.product
    WHERE supplier_product_code = 'AUR-1D'
      AND company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid)            AS aur1d_id,
  (SELECT verification_status FROM public.company
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid)                    AS gl_status_before;
GRANT SELECT ON _fix TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM _fix WHERE unfiled_id IS NULL OR filed_id IS NULL
                                   OR aur1d_id IS NULL OR gl_status_before IS NULL)
    THEN RAISE EXCEPTION 'FIXTURE: HEL-69 fixtures failed to resolve — seed drift?'; END IF;
  -- The suite is meaningless if the seeded relationship is not active: every
  -- cell reaches the view through the connection override.
  IF (SELECT gl_status_before FROM _fix) <> 'verified'
    THEN RAISE EXCEPTION 'FIXTURE: GreenLeaf is not verified in the seed — §A3/§A4 restore would corrupt it'; END IF;
END $$;

-- ============================================================================
-- §A — the three missing terms, each with its control on the same cell
-- ============================================================================

-- A1 [control] — Bob is connected and verified, so the FILED hidden product's
-- price and its ladder MUST reach him. If this cell ever fails, every "0 rows"
-- assertion below is worthless: the row could be missing for any reason.
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_tiers jsonb;
BEGIN
  IF (SELECT count(*) FROM public.current_pricelist_item WHERE product_id = (SELECT filed_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'A1/control: connected+verified Bob must reach the FILED hidden priced product — the rest of this suite proves nothing without it'; END IF;

  SELECT tiers INTO v_tiers FROM public.current_pricelist_item WHERE product_id = (SELECT filed_id FROM _fix);
  IF jsonb_array_length(v_tiers) <> 1
    THEN RAISE EXCEPTION 'A1/control: the tier ladder must travel with the row (expected 1 rung, got %)', jsonb_array_length(v_tiers); END IF;
END $$;
RESET ROLE;

-- A2 [term: location] — UNFILED is not a shelf. The product is hidden, priced
-- and its seller is verified; the ONLY reason to withhold it is that it has
-- never been filed to a location. Today's view has no `location` term and
-- hands back EUR 7.77.
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.current_pricelist_item WHERE product_id = (SELECT unfiled_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'A2/location: an UNFILED product handed its per-gram price to a connected buyer — the view has no location term (production: Spirit Bear T28 STR MLS, EUR 9.50)'; END IF;
END $$;
RESET ROLE;

-- A3 [term: seller verification] — same FILED product, but the SELLER's company
-- is no longer verified. `is_caller_verified()` cannot catch this: it reads the
-- CALLER's company. Mutate, assert, restore inside the one cell.
UPDATE public.company SET verification_status = 'pending'
 WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.current_pricelist_item WHERE product_id = (SELECT filed_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'A3/seller-verified: an UNVERIFIED seller''s product handed its price to a connected buyer — the view never reads the seller''s company row (production: fdsc / CNG Berlin, EUR 2.00)'; END IF;
END $$;
RESET ROLE;

UPDATE public.company SET verification_status = (SELECT gl_status_before FROM _fix)
 WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

-- Restore proven, not assumed: the control must come back. Without this, a
-- later cell failing would be indistinguishable from a botched restore.
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.current_pricelist_item WHERE product_id = (SELECT filed_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'A3/restore: GreenLeaf''s verification_status was not restored'; END IF;
END $$;
RESET ROLE;

-- A4 [term: seller soft-delete] — same again for `company.deleted_at`. A
-- soft-deleted seller is the exact hole ship-gate round 4 closed on the basket
-- and shop doors; this view never got the term.
UPDATE public.company SET deleted_at = now()
 WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.current_pricelist_item WHERE product_id = (SELECT filed_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'A4/seller-deleted: a SOFT-DELETED seller''s product handed its price to a connected buyer'; END IF;
END $$;
RESET ROLE;

UPDATE public.company SET deleted_at = NULL
 WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.current_pricelist_item WHERE product_id = (SELECT filed_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'A4/restore: GreenLeaf''s deleted_at was not restored'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- §B — the OWNER arm must survive the rewrite
-- ----------------------------------------------------------------------------
-- The fix replaces a two-arm WHERE with one function call. The function's owner
-- arm is `p.company_id = current_company_id()`; the view's was
-- `pl.company_id = current_company_id()`. They are equivalent ONLY because the
-- view joins `p.company_id = pl.company_id` — assert the consequence rather
-- than trust the reasoning. A seller must lose NOTHING, unfiled and
-- price-hidden products included.
-- ============================================================================

-- B1 — Alice sees her own UNFILED product. Unfiled is withheld from buyers and
-- KEPT for the owner, so the Unassigned pile stays fileable.
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.current_pricelist_item WHERE product_id = (SELECT unfiled_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'B1/owner: the seller lost her own UNFILED product — the owner arm must not carry the location term'; END IF;

  IF (SELECT count(*) FROM public.current_pricelist_item WHERE product_id = (SELECT filed_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'B1/owner: the seller lost her own FILED product'; END IF;
END $$;
RESET ROLE;

-- B2 — the owner arm does not depend on her own company being verified either:
-- an unverified seller must still see her own catalogue to work on it.
UPDATE public.company SET verification_status = 'pending'
 WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.current_pricelist_item WHERE product_id = (SELECT filed_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'B2/owner: an unverified seller lost her OWN catalogue — the seller-verified term leaked out of the buyer arm'; END IF;
END $$;
RESET ROLE;

UPDATE public.company SET verification_status = (SELECT gl_status_before FROM _fix)
 WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

-- ============================================================================
-- §C — the price gate is untouched by this change
-- ----------------------------------------------------------------------------
-- "Connection reveals the product, never the price" is decision 6 and it is
-- carried by `price_public`, un-`or`-ed. The delegated function keeps it
-- (`p.company_id = current_company_id() OR p.price_public`). AUR-1D is the
-- seeded hidden + price-HIDDEN product.
-- ============================================================================

-- C1 — a connected buyer gets NO row for a price-hidden product, before or
-- after the fix.
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.current_pricelist_item WHERE product_id = (SELECT aur1d_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'C1/price-gate: a price-HIDDEN product surrendered its price to a connected buyer — decision 6 broken'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- §D — structural: the rule has ONE owner, and the barrier survived
-- ============================================================================

DO $$
DECLARE v_def text; v_opts text[];
BEGIN
  v_def := pg_get_viewdef('public.current_pricelist_item'::regclass, true);

  -- The point of the ticket: the predicate is DELEGATED, not repaired.
  IF v_def NOT LIKE '%product_price_visible_to_caller%'
    THEN RAISE EXCEPTION 'D1/single-owner: the view does not call product_price_visible_to_caller — the rule still has two owners'; END IF;

  -- And the copy is GONE, not merely supplemented. `is_caller_verified` was
  -- part of the inlined arm; the function carries it now. If it is still
  -- spelled here, the predicate was patched rather than replaced and it can
  -- drift again.
  IF v_def LIKE '%is_caller_verified%' OR v_def LIKE '%is_connected_to_company%' OR v_def LIKE '%profile_visible%'
    THEN RAISE EXCEPTION 'D1/single-owner: an inlined copy of the visibility predicate survives in the view body — delete it, do not supplement it'; END IF;

  -- ADR-0004 §4: owner-rights is deliberate; `security_barrier` is the
  -- compensating control and CREATE OR REPLACE VIEW drops it silently.
  SELECT reloptions INTO v_opts FROM pg_class WHERE oid = 'public.current_pricelist_item'::regclass;
  IF v_opts IS NULL OR NOT ('security_barrier=true' = ANY(v_opts))
    THEN RAISE EXCEPTION 'D2/barrier: security_barrier=true is gone — a CREATE OR REPLACE VIEW without the WITH clause dropped it, and nothing else fails when it does'; END IF;

  IF 'security_invoker=true' = ANY(v_opts)
    THEN RAISE EXCEPTION 'D2/invoker: security_invoker was turned on — ADR-0004 §4 rejects it; pricelist is owner-policy-only and every buyer read would return zero rows'; END IF;
END $$;

-- D3 — the grant ritual. A replace does not reset grants, so it is re-issued
-- every time; anon must hold nothing.
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.current_pricelist_item', 'SELECT')
    THEN RAISE EXCEPTION 'D3/grants: anon can SELECT the price view'; END IF;

  IF NOT has_table_privilege('authenticated', 'public.current_pricelist_item', 'SELECT')
    THEN RAISE EXCEPTION 'D3/grants: authenticated lost SELECT on the price view'; END IF;

  -- HEL-69 sub-finding: production shows `authenticated` holding INSERT /
  -- UPDATE / DELETE on this view although the defining migration grants only
  -- SELECT. Nothing writes through it — a DISTINCT ON view is not
  -- auto-updatable — but an unexplained write grant on a security-definer view
  -- is not something to leave standing once seen.
  IF has_table_privilege('authenticated', 'public.current_pricelist_item', 'INSERT')
     OR has_table_privilege('authenticated', 'public.current_pricelist_item', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.current_pricelist_item', 'DELETE')
    THEN RAISE EXCEPTION 'D3/grants: authenticated holds a WRITE privilege on the price view — the defining migration grants SELECT only'; END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL PRICELIST_VIEW_SINGLE_OWNER TESTS PASSED'; END $$;

ROLLBACK;
