-- ============================================================================
-- discoverable_shop_spec_columns_test.sql — get_discoverable_shop's spec set
-- ----------------------------------------------------------------------------
-- Proves T05 (HEL-59, PLAN-T05.md rev 3): the 12 new OUT columns on
-- get_discoverable_shop (cbg_percent, cbn_percent, terpene_percent, cultivator,
-- lineage_parent_a, lineage_parent_b, irradiation_code, packaging_material,
-- resealable, location, pack_sizes, media), the terpene derivation (manual
-- column first, representative-batch sum as fallback — shop.ts:249 exactly),
-- the owner arm (I12), the primary-filter guard (I2), the unpriced-product
-- guard (I8), and the grant ritual (I17). Source of the invariants: the LIVE
-- function body, 20260816190000_tier_ladder_contract.sql:82-154 (L-011 — read
-- clause by clause, not the ticket's risk narrative).
--
-- Mirrors pricelist_item_tier_test.sql / cross_tenant_lockdown_test.sql: one
-- BEGIN…ROLLBACK transaction that creates ephemeral fixtures, impersonates each
-- caller, asserts, and leaves NO trace. Impersonation: set request.jwt.claims
-- (what auth.uid() reads) + SET LOCAL ROLE authenticated, so queries run
-- exactly as that caller with RLS active. RESET ROLE between perspectives. Any
-- failed assertion RAISEs and aborts; success prints
-- 'ALL DISCOVERABLE_SHOP_SPEC_COLUMNS TESTS PASSED'.
--
-- Run:  bash supabase/tests/run_discoverable_shop_spec_columns_test.sh
--
-- ⚠️  RED-FIRST: this file is EXPECTED to FAIL until
-- supabase/migrations/20260822090000_discoverable_shop_spec_columns.sql (or
-- whatever timestamp the builder lands) ships — every DO block below calls
-- public.get_discoverable_shop and reads columns that DO NOT EXIST on today's
-- function, so it errors out immediately. That failure is the proof it
-- genuinely exercises the widened RPC. Do NOT "fix" it green here.
--
-- ⚠️  L-012 (the plan's Data note): the seed populates ONLY `cultivator` and
-- `location` of AC 7's column set — cbg_percent, cbn_percent, terpene_percent,
-- lineage_parent_a/b, irradiation_code, packaging_material, resealable and
-- metadata->'pack_sizes' are NULL on every seeded GreenLeaf product, and
-- batch_terpene is EMPTY repo-wide. "Returns the spec set as seeded" is
-- therefore unsatisfiable — this suite PLANTS its own fixture rows instead,
-- one DISTINCT sentinel per column (a transposition — two columns swapped —
-- is invisible when the planted values collide, and that is the single most
-- likely bug in a 12-column widening). `location` is set to a fixture-only
-- value on fixture products (never on the seeded AUR-1* rows), so the
-- seed_visibility_matrix_test.sql count(DISTINCT location) = 2 pin on
-- GreenLeaf is untouched.
--
-- Personas (seeded; resolved by supplier_product_code / company name, never a
-- raw product/company uuid — those are non-deterministic across resets, the
-- seed §6c pattern):
--   GreenLeaf = aaaaaaaa-…  Alice = 11111111-…  (owner/seller, verified)
--   StonePharm = bbbbbbbb-…  Bob  = 22222222-…  (other verified company, used
--                                                 as a plain verified NON-OWNER
--                                                 caller throughout)
-- Fixture products carry supplier_product_code values prefixed 'T05-' so they
-- can never collide with the seed's 'AUR-1*' codes. A throwaway THIRD company
-- ("T05 Deleted Co") backs the I3 (soft-deleted company) check; its id is
-- resolved by name, never hardcoded, since gen_random_uuid() mints it fresh.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ── Fixtures (privileged role; rolled back) ─────────────────────────────────
-- Own fixture products throughout — never mutate the seeded AUR-1* rows
-- (coupling this suite to seed drift), matching pricelist_item_tier_test.sql's
-- convention. NOT NULL floor: company_id + name; every other column defaults
-- false/'{}' unless set below.

INSERT INTO public.product (
  company_id, name, supplier_product_code, profile_visible,
  cbg_percent, cbn_percent, terpene_percent, cultivator,
  lineage_parent_a, lineage_parent_b, irradiation_code,
  packaging_material, resealable, location, metadata
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'T05 Sentinel Product', 'T05-SENT', true,
  44.41, 55.52, 66.63, 'SENT-CULTIVATOR',
  'SENT-LINEAGE-A', 'SENT-LINEAGE-B', 'gamma',
  'SENT-PACKAGING', true, 'SENT-LOCATION',
  '{"pack_sizes": [7, 12], "note": "SENT-PRIVATE-NOTE-DO-NOT-LEAK"}'::jsonb
);

INSERT INTO public.product (company_id, name, supplier_product_code, profile_visible)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'T05 No Image Product', 'T05-NOIMG', true);

INSERT INTO public.product (company_id, name, supplier_product_code, profile_visible, terpene_percent)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'T05 Terp Manual Product', 'T05-TERP-MANUAL', true, 12.34);

INSERT INTO public.product (company_id, name, supplier_product_code, profile_visible)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'T05 Terp Fallback Product', 'T05-TERP-FALLBACK', true);

INSERT INTO public.product (company_id, name, supplier_product_code, profile_visible)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'T05 Terp Rep Empty Product', 'T05-TERP-REP-EMPTY', true);

INSERT INTO public.product (company_id, name, supplier_product_code, profile_visible)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'T05 Terp Softdel Product', 'T05-TERP-SOFTDEL', true);

INSERT INTO public.product (company_id, name, supplier_product_code, profile_visible, metadata)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'T05 Pack Sizes Product', 'T05-PACKSIZES', true,
  '{"pack_sizes": [3, 6], "note": "SECRET-NOTE-XYZ-DO-NOT-LEAK"}'::jsonb);

-- test 7: hidden (profile_visible = false) — the owner arm's whole point
INSERT INTO public.product (company_id, name, supplier_product_code, profile_visible)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'T05 Owner Hidden Product', 'T05-OWNER-HIDDEN', false);

-- test 9 (I8): visible + price_public, but deliberately NO pricelist_item row
INSERT INTO public.product (company_id, name, supplier_product_code, profile_visible, price_public)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'T05 No Price Product', 'T05-I8-NOPRICE', true, true);

-- I15: two products whose NAMES sort deterministically
INSERT INTO public.product (company_id, name, supplier_product_code, profile_visible)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'AAA T05 Order Test', 'T05-ORDER-A', true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'ZZZ T05 Order Test', 'T05-ORDER-Z', true);

-- I11: soft-deleted after the "still there" precondition check below
INSERT INTO public.product (company_id, name, supplier_product_code, profile_visible)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'T05 Softdel Product', 'T05-SOFTDEL-PROD', true);

-- I2: lives under the OTHER company (StonePharm) — must never leak into a
-- get_discoverable_shop(GreenLeaf) call
INSERT INTO public.product (company_id, name, supplier_product_code, profile_visible)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'T05 I2 Other Company Product', 'T05-I2-OTHER', true);

-- I3: a THROWAWAY third company, verified, with one visible product
INSERT INTO public.company (name, country, verification_status)
VALUES ('T05 Deleted Co', 'DE', 'verified');
INSERT INTO public.product (company_id, name, supplier_product_code, profile_visible)
SELECT id, 'T05 C3 Product', 'T05-C3-PROD', true FROM public.company WHERE name = 'T05 Deleted Co';

CREATE TEMP TABLE _fix ON COMMIT DROP AS
SELECT
  (SELECT id FROM public.product WHERE supplier_product_code = 'T05-SENT') AS sent_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'T05-NOIMG') AS noimg_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'T05-TERP-MANUAL') AS terp_manual_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'T05-TERP-FALLBACK') AS terp_fallback_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'T05-TERP-REP-EMPTY') AS terp_rep_empty_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'T05-TERP-SOFTDEL') AS terp_softdel_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'T05-PACKSIZES') AS packsizes_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'T05-OWNER-HIDDEN') AS owner_hidden_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'T05-I8-NOPRICE') AS i8_noprice_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'T05-ORDER-A') AS order_a_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'T05-ORDER-Z') AS order_z_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'T05-SOFTDEL-PROD') AS softdel_prod_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'T05-I2-OTHER') AS i2_other_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'T05-C3-PROD') AS c3_prod_id,
  (SELECT id FROM public.company WHERE name = 'T05 Deleted Co') AS c3_company_id;
GRANT SELECT ON _fix TO authenticated;

DO $$
BEGIN
  IF (SELECT count(*) FROM _fix
      WHERE sent_id IS NULL OR noimg_id IS NULL OR terp_manual_id IS NULL
         OR terp_fallback_id IS NULL OR terp_rep_empty_id IS NULL OR terp_softdel_id IS NULL
         OR packsizes_id IS NULL OR owner_hidden_id IS NULL OR i8_noprice_id IS NULL
         OR order_a_id IS NULL OR order_z_id IS NULL OR softdel_prod_id IS NULL
         OR i2_other_id IS NULL OR c3_prod_id IS NULL OR c3_company_id IS NULL) <> 0
    THEN RAISE EXCEPTION 'FIXTURE: one or more T05 product/company fixtures failed to resolve'; END IF;
END $$;

-- Images (I5/I6/I7) — planted OUT OF ORDER (position 1 inserted first) so the
-- ordering assertion cannot pass by accident of insert order.
INSERT INTO public.product_image (product_id, company_id, image_path, position)
SELECT sent_id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, v.path, v.pos
FROM _fix, (VALUES ('SENT-IMG-A', 1), ('SENT-IMG-B', 0)) AS v(path, pos);

-- Media (D5/B7) — also planted out of position order.
INSERT INTO public.product_media (product_id, company_id, kind, path, url, label, position)
SELECT sent_id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'coa', 'SENT-MEDIA-DOC', NULL, 'SENT-MEDIA-LABEL', 1
FROM _fix
UNION ALL
SELECT sent_id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'video_link', NULL, 'https://video.test/sent', NULL, 0
FROM _fix;

-- Batches, for the terpene derivation tests (2, 3, 3b, 4). Terpene codes are
-- real lookup rows (myrcene/limonene/pinene/linalool — 20260607090001).
INSERT INTO public.product_batch (company_id, product_id, batch_number, ready_for_sale_date)
SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, terp_manual_id, 'T05-TM-BATCH', DATE '2024-01-01' FROM _fix
UNION ALL
SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, terp_fallback_id, 'T05-TF-OLD', DATE '2020-01-01' FROM _fix
UNION ALL
SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, terp_fallback_id, 'T05-TF-NEW', DATE '2024-06-01' FROM _fix
UNION ALL
SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, terp_rep_empty_id, 'T05-TRE-OLD', DATE '2020-01-01' FROM _fix
UNION ALL
SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, terp_rep_empty_id, 'T05-TRE-NEW', DATE '2024-06-01' FROM _fix
UNION ALL
-- T05-TSD-A is the LATER batch (would be the naive representative pick) but is
-- soft-deleted below; T05-TSD-B is the earlier, LIVE one — it must win once
-- the deleted lot is excluded from the pick entirely (shop.ts:214).
SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, terp_softdel_id, 'T05-TSD-A', DATE '2024-06-01' FROM _fix
UNION ALL
SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, terp_softdel_id, 'T05-TSD-B', DATE '2020-01-01' FROM _fix;

CREATE TEMP TABLE _batches ON COMMIT DROP AS
SELECT
  (SELECT id FROM public.product_batch WHERE batch_number = 'T05-TM-BATCH') AS tm_batch,
  (SELECT id FROM public.product_batch WHERE batch_number = 'T05-TF-OLD') AS tf_old,
  (SELECT id FROM public.product_batch WHERE batch_number = 'T05-TF-NEW') AS tf_new,
  (SELECT id FROM public.product_batch WHERE batch_number = 'T05-TRE-OLD') AS tre_old,
  (SELECT id FROM public.product_batch WHERE batch_number = 'T05-TRE-NEW') AS tre_new,
  (SELECT id FROM public.product_batch WHERE batch_number = 'T05-TSD-A') AS tsd_a,
  (SELECT id FROM public.product_batch WHERE batch_number = 'T05-TSD-B') AS tsd_b;
GRANT SELECT ON _batches TO authenticated;

DO $$
BEGIN
  IF (SELECT count(*) FROM _batches
      WHERE tm_batch IS NULL OR tf_old IS NULL OR tf_new IS NULL OR tre_old IS NULL
         OR tre_new IS NULL OR tsd_a IS NULL OR tsd_b IS NULL) <> 0
    THEN RAISE EXCEPTION 'FIXTURE: one or more T05 batch fixtures failed to resolve'; END IF;
END $$;

-- test 4's exclusion guard: T05-TSD-A is the batch a naive "pick by date over
-- ALL batches" implementation would choose — soft-delete it so only a correct
-- "pick by date over LIVE batches only" implementation excludes it up front.
UPDATE public.product_batch SET deleted_at = now() WHERE id = (SELECT tsd_a FROM _batches);

INSERT INTO public.batch_terpene (product_batch_id, terpene_code, percent)
SELECT tm_batch, 'myrcene', 5.00 FROM _batches
UNION ALL SELECT tm_batch, 'limonene', 5.00 FROM _batches   -- sum 10.00, vs manual 12.34
UNION ALL SELECT tf_old, 'pinene', 1.00 FROM _batches
UNION ALL SELECT tf_old, 'linalool', 2.00 FROM _batches     -- sum 3.00 (older, must lose)
UNION ALL SELECT tf_new, 'myrcene', 4.00 FROM _batches
UNION ALL SELECT tf_new, 'limonene', 5.00 FROM _batches     -- sum 9.00 (newer, must win)
UNION ALL SELECT tre_old, 'myrcene', 4.00 FROM _batches     -- sum 4.00 (older; must NOT be used)
-- tre_new (the representative pick) deliberately carries ZERO terpene rows.
UNION ALL SELECT tsd_a, 'myrcene', 50.00 FROM _batches
UNION ALL SELECT tsd_a, 'limonene', 49.00 FROM _batches     -- sum 99.00 — must be EXCLUDED (soft-deleted)
UNION ALL SELECT tsd_b, 'myrcene', 7.00 FROM _batches;      -- sum 7.00 — the correct answer

-- ── (1) SENTINELS — the transposition guard, plus I5/I6/I7 (N2) ─────────────
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  r record;
BEGIN
  SELECT * INTO r FROM public.get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) s
    WHERE s.id = (SELECT sent_id FROM _fix);
  IF NOT FOUND THEN RAISE EXCEPTION 'TEST1: sentinel product missing from get_discoverable_shop'; END IF;

  IF r.cbg_percent IS DISTINCT FROM 44.41
    THEN RAISE EXCEPTION 'TEST1: cbg_percent wrong — got %, expected 44.41', r.cbg_percent; END IF;
  IF r.cbn_percent IS DISTINCT FROM 55.52
    THEN RAISE EXCEPTION 'TEST1: cbn_percent wrong — got %, expected 55.52', r.cbn_percent; END IF;
  IF r.terpene_percent IS DISTINCT FROM 66.63
    THEN RAISE EXCEPTION 'TEST1: terpene_percent (manual, no batches on this product) wrong — got %, expected 66.63', r.terpene_percent; END IF;
  IF r.cultivator IS DISTINCT FROM 'SENT-CULTIVATOR'
    THEN RAISE EXCEPTION 'TEST1: cultivator wrong — got %', r.cultivator; END IF;
  IF r.lineage_parent_a IS DISTINCT FROM 'SENT-LINEAGE-A'
    THEN RAISE EXCEPTION 'TEST1: lineage_parent_a wrong — got %', r.lineage_parent_a; END IF;
  IF r.lineage_parent_b IS DISTINCT FROM 'SENT-LINEAGE-B'
    THEN RAISE EXCEPTION 'TEST1: lineage_parent_b wrong — got %', r.lineage_parent_b; END IF;
  IF r.irradiation_code IS DISTINCT FROM 'gamma'
    THEN RAISE EXCEPTION 'TEST1: irradiation_code wrong — got %', r.irradiation_code; END IF;
  IF r.packaging_material IS DISTINCT FROM 'SENT-PACKAGING'
    THEN RAISE EXCEPTION 'TEST1: packaging_material wrong — got %', r.packaging_material; END IF;
  IF r.resealable IS DISTINCT FROM true
    THEN RAISE EXCEPTION 'TEST1: resealable wrong — got %', r.resealable; END IF;
  IF r.location IS DISTINCT FROM 'SENT-LOCATION'
    THEN RAISE EXCEPTION 'TEST1: location wrong — got %', r.location; END IF;
  IF r.pack_sizes IS DISTINCT FROM '[7, 12]'::jsonb
    THEN RAISE EXCEPTION 'TEST1: pack_sizes wrong — got %, expected [7, 12]', r.pack_sizes; END IF;

  -- I6/I7: ordered image gallery, never null. Position 0 ('SENT-IMG-B') was
  -- inserted SECOND — this only passes if the RPC truly orders by pi.position.
  IF r.images IS NULL OR jsonb_array_length(r.images) <> 2
    THEN RAISE EXCEPTION 'TEST1/I5-I7: images is not a 2-element jsonb array: %', r.images; END IF;
  IF (r.images->0->>'path') <> 'SENT-IMG-B' OR (r.images->1->>'path') <> 'SENT-IMG-A'
    THEN RAISE EXCEPTION 'TEST1/I6: images not ordered by position — got %', r.images; END IF;

  -- media (D5/B7): also position-ordered; 'video_link' (position 0) first.
  IF r.media IS NULL OR jsonb_array_length(r.media) <> 2
    THEN RAISE EXCEPTION 'TEST1: media is not a 2-element jsonb array: %', r.media; END IF;
  IF (r.media->0->>'kind') <> 'video_link' OR (r.media->1->>'kind') <> 'coa'
    THEN RAISE EXCEPTION 'TEST1: media not ordered by position — got %', r.media; END IF;
END $$;
RESET ROLE;

-- ── I5 (LEFT joins), continued — a product with NO images/media still
--     returns, coalesced to [] rather than null ──────────────────────────────
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  r record;
BEGIN
  SELECT * INTO r FROM public.get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) s
    WHERE s.id = (SELECT noimg_id FROM _fix);
  IF NOT FOUND THEN RAISE EXCEPTION 'I5: no-image/no-media product missing from get_discoverable_shop'; END IF;
  IF r.images IS DISTINCT FROM '[]'::jsonb
    THEN RAISE EXCEPTION 'I5: images should be [] for a product with none (LEFT join), got %', r.images; END IF;
  IF r.media IS DISTINCT FROM '[]'::jsonb
    THEN RAISE EXCEPTION 'I5: media should be [] for a product with none (LEFT join, D5 coalesce), got %', r.media; END IF;
END $$;
RESET ROLE;

-- ── (2) terpene_percent — MANUAL column wins over a conflicting batch sum ───
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  r record;
BEGIN
  SELECT * INTO r FROM public.get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) s
    WHERE s.id = (SELECT terp_manual_id FROM _fix);
  IF NOT FOUND THEN RAISE EXCEPTION 'TEST2: manual-terpene product missing'; END IF;
  IF r.terpene_percent IS DISTINCT FROM 12.34
    THEN RAISE EXCEPTION 'TEST2: manual terpene_percent (12.34) must win over the conflicting batch sum (10.00) — got %', r.terpene_percent; END IF;
END $$;
RESET ROLE;

-- ── (3) terpene_percent — FALLBACK: the representative (LATER) batch's sum ──
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  r record;
BEGIN
  SELECT * INTO r FROM public.get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) s
    WHERE s.id = (SELECT terp_fallback_id FROM _fix);
  IF NOT FOUND THEN RAISE EXCEPTION 'TEST3: fallback-terpene product missing'; END IF;
  IF r.terpene_percent IS DISTINCT FROM 9.00
    THEN RAISE EXCEPTION 'TEST3: terpene_percent must be the LATER batch''s sum (9.00, ready_for_sale_date 2024-06-01), not the older one''s (3.00) — got %', r.terpene_percent; END IF;
END $$;
RESET ROLE;

-- ── (3b) representative batch has NO terpene rows but an OLDER one does —────
--        the answer is NULL, never the older batch's sum (N4) ───────────────
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  r record;
BEGIN
  SELECT * INTO r FROM public.get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) s
    WHERE s.id = (SELECT terp_rep_empty_id FROM _fix);
  IF NOT FOUND THEN RAISE EXCEPTION 'TEST3b: rep-empty-terpene product missing'; END IF;
  IF r.terpene_percent IS NOT NULL
    THEN RAISE EXCEPTION 'TEST3b: the representative batch carries NO terpene rows — expected NULL (never the older batch''s 4.00 sum), got %', r.terpene_percent; END IF;
END $$;
RESET ROLE;

-- ── (4) a soft-deleted representative lot is EXCLUDED from the pick, not ────
--        merely skipped after being chosen (shop.ts:214) ────────────────────
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  r record;
BEGIN
  SELECT * INTO r FROM public.get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) s
    WHERE s.id = (SELECT terp_softdel_id FROM _fix);
  IF NOT FOUND THEN RAISE EXCEPTION 'TEST4: softdel-terpene product missing'; END IF;
  IF r.terpene_percent IS DISTINCT FROM 7.00
    THEN RAISE EXCEPTION 'TEST4: the soft-deleted (later) lot must be excluded from the representative pick entirely — expected the live batch''s sum (7.00), got % (99.00 would mean the deleted lot leaked through)', r.terpene_percent; END IF;
END $$;
RESET ROLE;

-- ── (5) pack_sizes projects ONLY metadata->'pack_sizes' — the private note ──
--        never leaks through any column of the row ──────────────────────────
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  r record;
BEGIN
  SELECT * INTO r FROM public.get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) s
    WHERE s.id = (SELECT packsizes_id FROM _fix);
  IF NOT FOUND THEN RAISE EXCEPTION 'TEST5: pack-sizes product missing'; END IF;
  IF r.pack_sizes IS DISTINCT FROM '[3, 6]'::jsonb
    THEN RAISE EXCEPTION 'TEST5: pack_sizes wrong — got %, expected [3, 6]', r.pack_sizes; END IF;
  IF row_to_json(r)::text LIKE '%SECRET-NOTE-XYZ%'
    THEN RAISE EXCEPTION 'TEST5: the seller''s private metadata note LEAKED into the row: %', row_to_json(r); END IF;
END $$;
RESET ROLE;

-- ── (6) I18 — supplier_product_code is ABSENT from the OUT column list ──────
-- pg_proc.proargnames carries BOTH the one IN arg (p_company_id) and every OUT
-- column for a RETURNS TABLE function — a reliable, code-free introspection.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.oid = 'public.get_discoverable_shop(uuid)'::regprocedure
       AND 'supplier_product_code' = ANY(p.proargnames))
    THEN RAISE EXCEPTION 'I18/TEST6: supplier_product_code is present in get_discoverable_shop''s OUT column list — G3 confidentiality violation'; END IF;
END $$;

-- ── (7) the OWNER ARM — a member of the seller's own company sees a
--        profile_visible = false product; a verified non-owner does not ─────
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) s
       WHERE s.id = (SELECT owner_hidden_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'TEST7: Alice (GreenLeaf owner) must see her own hidden (profile_visible=false) product — the owner arm'; END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) s
       WHERE s.id = (SELECT owner_hidden_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'LEAK/TEST7: Bob (StonePharm, verified non-owner) saw a hidden (profile_visible=false) product through the owner arm'; END IF;
END $$;
RESET ROLE;

-- ── (8) I2 — the PRIMARY FILTER. Lose "and c.id = p_company_id" and every ───
--        verified company's catalogue leaks to any verified caller ──────────
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) s
       WHERE s.id = (SELECT i2_other_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'LEAK/I2/TEST8: StonePharm''s product leaked into a get_discoverable_shop(GreenLeaf) call — the primary filter (c.id = p_company_id) is broken'; END IF;
END $$;
RESET ROLE;

-- ── (9) I8 — a product with NO current_pricelist_item row still returns ─────
--        (LEFT join), with a null price rather than being dropped entirely ──
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  r record;
BEGIN
  SELECT * INTO r FROM public.get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) s
    WHERE s.id = (SELECT i8_noprice_id FROM _fix);
  IF NOT FOUND
    THEN RAISE EXCEPTION 'I8/TEST9: a product with NO current_pricelist_item row is missing from get_discoverable_shop — the LEFT join was made an INNER join'; END IF;
  IF r.price_per_gram IS NOT NULL
    THEN RAISE EXCEPTION 'I8/TEST9: price_per_gram should be NULL when no pricelist_item row exists, got %', r.price_per_gram; END IF;
END $$;
RESET ROLE;

-- ── (10) I17 — the 3-statement grant ritual ──────────────────────────────────
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.get_discoverable_shop(uuid)', 'EXECUTE')
    THEN RAISE EXCEPTION 'I17/TEST10: anon still GRANTed EXECUTE on get_discoverable_shop(uuid)'; END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_discoverable_shop(uuid)', 'EXECUTE')
    THEN RAISE EXCEPTION 'I17/TEST10: authenticated is NOT GRANTed EXECUTE on get_discoverable_shop(uuid)'; END IF;
END $$;

-- ── (11a) I3 — a soft-deleted COMPANY's shop returns zero rows ──────────────
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.get_discoverable_shop((SELECT c3_company_id FROM _fix))) <> 1
    THEN RAISE EXCEPTION 'I3 precondition: the throwaway company''s product should be visible BEFORE the soft-delete'; END IF;
END $$;
RESET ROLE;

UPDATE public.company SET deleted_at = now() WHERE id = (SELECT c3_company_id FROM _fix);

SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.get_discoverable_shop((SELECT c3_company_id FROM _fix))) <> 0
    THEN RAISE EXCEPTION 'I3: a soft-deleted company''s shop must return zero rows'; END IF;
END $$;
RESET ROLE;

-- ── (11b) I11 — a soft-deleted PRODUCT is invisible ──────────────────────────
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) s
       WHERE s.id = (SELECT softdel_prod_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'I11 precondition: the soft-delete-candidate product should be visible BEFORE the soft-delete'; END IF;
END $$;
RESET ROLE;

UPDATE public.product SET deleted_at = now() WHERE id = (SELECT softdel_prod_id FROM _fix);

SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) s
       WHERE s.id = (SELECT softdel_prod_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'I11: a soft-deleted product must not appear in get_discoverable_shop'; END IF;
END $$;
RESET ROLE;

-- ── (12) I4 — an UNVERIFIED TARGET seller's shop returns zero rows ──────────
--         Added at T05's critic review. I4 sits on the SAME join line as I3,
--         which got a test above, and was skipped by the plan's own
--         "would any check notice if this vanished?" audit. It would not have:
--         cross_tenant_lockdown and pricelist_item_tier both cover the
--         unverified CALLER (I14), never the unverified TARGET. Losing I4 makes
--         any pending or rejected company's catalogue readable by any verified
--         caller holding its id.
--         `deleted_at` is reset first so this isolates verification_status
--         alone — 11a left the company soft-deleted, which would mask I4.
UPDATE public.company
   SET deleted_at = NULL, verification_status = 'pending'
 WHERE id = (SELECT c3_company_id FROM _fix);

SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.get_discoverable_shop((SELECT c3_company_id FROM _fix))) <> 0
    THEN RAISE EXCEPTION 'I4: an UNVERIFIED target company must return zero rows'; END IF;
END $$;
RESET ROLE;

-- restore, so nothing after this depends on the pending state
UPDATE public.company SET verification_status = 'verified'
 WHERE id = (SELECT c3_company_id FROM _fix);

SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.get_discoverable_shop((SELECT c3_company_id FROM _fix))) <> 1
    THEN RAISE EXCEPTION 'I4 control: re-verifying must bring the shop back — otherwise (12) proves nothing about verification_status'; END IF;
END $$;
RESET ROLE;

-- ── (13) coalesce(bt.percent, 0) — ALL-NULL percents derive 0, NOT NULL ─────
--         Added at T05's critic review. This clause is load-bearing in exactly
--         one shape: every terpene row on the REPRESENTATIVE lot has a NULL
--         percent. Bare sum(bt.percent) returns NULL there; deriveTerpPercent
--         returns 0 (shopMap.ts:49-50, guarded by shopMap.test.ts:70). Without
--         this fixture the coalesce can be deleted with the suite still green,
--         producing precisely the buyer/seller disagreement D2 exists to stop.
--         Uses the rep-empty product, whose representative lot carries no rows
--         at all in test (3b) — here we give that same lot NULL-percent rows,
--         which is a different state: rows present, values absent.
INSERT INTO public.batch_terpene (product_batch_id, terpene_code, percent)
SELECT b.id, 'myrcene', NULL
FROM public.product_batch b
WHERE b.product_id = (SELECT terp_rep_empty_id FROM _fix)
  AND b.deleted_at IS NULL
ORDER BY b.ready_for_sale_date DESC NULLS LAST, b.created_at DESC
LIMIT 1;

SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) s
   WHERE s.id = (SELECT terp_rep_empty_id FROM _fix);
  IF r.terpene_percent IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'coalesce(percent,0): all-NULL terpene rows must derive 0, not %, matching deriveTerpPercent', r.terpene_percent;
  END IF;
END $$;
RESET ROLE;

-- ── (11c) I15 — stable order by p.name. row_number() OVER () with no ────────
--         ORDER BY numbers rows in the underlying scan's EMISSION order —
--         for a bare `FROM function(...)` with nothing else reordering it,
--         that is the function's own internal `order by p.name`. ───────────
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  rn_a int;
  rn_z int;
BEGIN
  SELECT rn INTO rn_a FROM (
    SELECT s.id, row_number() OVER () AS rn
      FROM public.get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) s
  ) t WHERE t.id = (SELECT order_a_id FROM _fix);
  SELECT rn INTO rn_z FROM (
    SELECT s.id, row_number() OVER () AS rn
      FROM public.get_discoverable_shop('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) s
  ) t WHERE t.id = (SELECT order_z_id FROM _fix);
  IF rn_a IS NULL OR rn_z IS NULL
    THEN RAISE EXCEPTION 'I15: one of the order-test products did not appear in the result at all'; END IF;
  IF rn_a >= rn_z
    THEN RAISE EXCEPTION 'I15: "AAA T05 Order Test" (position %) must sort BEFORE "ZZZ T05 Order Test" (position %) — order by p.name', rn_a, rn_z; END IF;

RAISE NOTICE 'ALL DISCOVERABLE_SHOP_SPEC_COLUMNS TESTS PASSED';
END $$;
RESET ROLE;

ROLLBACK;
SELECT 'ALL DISCOVERABLE_SHOP_SPEC_COLUMNS TESTS PASSED' AS result;
