-- ============================================================================
-- business_category_taxonomy_test.sql — DEV-99 #3 structure + data assertions
-- ----------------------------------------------------------------------------
-- Proves the two-level business taxonomy migration landed correctly. Mirrors
-- supabase/tests/profile_foundation_test.sql: psql-runnable, RAISE EXCEPTION on
-- any miss, prints a success line at the end.
--
-- Run:  ./supabase/tests/run_business_category_taxonomy_test.sh
--
-- RED BY DESIGN until 20260703…_business_category_taxonomy.sql lands: today the
-- business_category table does not exist, so the FIRST assertion RAISEs and psql
-- exits non-zero. That failing state proves the test checks real behaviour; it
-- turns GREEN only after the migration applies.
--
-- Asserts:
--   Category lookup   business_category(code,description,sort_order) exists,
--                     seeded with exactly the 6 codes incl. 'custom'
--   Category junction company_business_category mirrors company_type_assignment
--                     (+ nullable custom_label text) with the unique-active index
--   Custom rule       CHECK constraint ties custom_label to code='custom'
--   Activity growth   company_type has the 8 Marcel activities; legacy
--                     'cultivator' code is GONE (remapped → eu_gmp_cultivator)
--   Remap             no active assignment still points at 'cultivator'
--   Backfill          every company with an activity has a 'pharma' category
--   RLS               business_category is readable; company_business_category
--                     is scoped to current_company_id()
-- ============================================================================

DO $$
DECLARE
  v_code text;
  new_activities text[] := ARRAY[
    'pharmacy','wholesaler','importer','gacp_cultivator','eu_gmp_cultivator',
    'tga_gmp_cultivator','manufacturer_pharma','other'];
  cat_codes text[] := ARRAY['pharma','food','fmcg_cpg','automotive','services','custom'];
BEGIN
  -- ── Category lookup table exists ──────────────────────────────────────────
  IF to_regclass('public.business_category') IS NULL THEN
    RAISE EXCEPTION 'FAIL: table public.business_category does not exist';
  END IF;

  -- exactly the 6 category codes (5 fixed + custom), no more no fewer
  FOREACH v_code IN ARRAY cat_codes LOOP
    IF NOT EXISTS (SELECT 1 FROM public.business_category WHERE code = v_code) THEN
      RAISE EXCEPTION 'FAIL: business_category missing code %', v_code;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.business_category) <> array_length(cat_codes, 1) THEN
    RAISE EXCEPTION 'FAIL: business_category should have exactly % rows', array_length(cat_codes, 1);
  END IF;

  -- ── Category junction mirrors the activity junction + custom_label ────────
  IF to_regclass('public.company_business_category') IS NULL THEN
    RAISE EXCEPTION 'FAIL: table public.company_business_category does not exist';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='company_business_category'
      AND column_name='custom_label' AND data_type='text' AND is_nullable='YES'
  ) THEN
    RAISE EXCEPTION 'FAIL: company_business_category.custom_label (nullable text) missing';
  END IF;

  -- unique-active index (one active category per company), mirrors cta
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='company_business_category'
      AND indexdef ILIKE '%unique%' AND indexdef ILIKE '%company_id%'
      AND indexdef ILIKE '%business_category_code%' AND indexdef ILIKE '%deleted_at is null%'
  ) THEN
    RAISE EXCEPTION 'FAIL: unique-active index on company_business_category missing';
  END IF;

  -- ── Custom rule: CHECK ties custom_label to the 'custom' code ─────────────
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'company_business_category' AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%custom_label%'
  ) THEN
    RAISE EXCEPTION 'FAIL: custom_label CHECK constraint missing';
  END IF;

  -- ── Activity growth: 8 Marcel activities present, 'cultivator' gone ───────
  FOREACH v_code IN ARRAY new_activities LOOP
    IF NOT EXISTS (SELECT 1 FROM public.company_type WHERE code = v_code) THEN
      RAISE EXCEPTION 'FAIL: company_type missing activity code %', v_code;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.company_type WHERE code = 'cultivator') THEN
    RAISE EXCEPTION 'FAIL: legacy company_type code ''cultivator'' should be removed';
  END IF;

  -- ── Remap: no active assignment still references 'cultivator' ─────────────
  IF EXISTS (
    SELECT 1 FROM public.company_type_assignment
    WHERE company_type_code = 'cultivator' AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'FAIL: active company_type_assignment still points at ''cultivator''';
  END IF;

  -- ── Backfill: every company with an activity has a 'pharma' category ──────
  IF EXISTS (
    SELECT 1 FROM public.company c
    WHERE EXISTS (SELECT 1 FROM public.company_type_assignment a
                  WHERE a.company_id = c.id AND a.deleted_at IS NULL)
      AND NOT EXISTS (SELECT 1 FROM public.company_business_category b
                      WHERE b.company_id = c.id AND b.business_category_code = 'pharma'
                        AND b.deleted_at IS NULL)
  ) THEN
    RAISE EXCEPTION 'FAIL: a company with an activity is missing the Pharma category backfill';
  END IF;

  -- ── RLS: category lookup readable; junction scoped to current_company_id ──
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='business_category' AND cmd IN ('SELECT','ALL')
  ) THEN
    RAISE EXCEPTION 'FAIL: business_category has no read policy';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='company_business_category'
      AND (coalesce(qual,'') || coalesce(with_check,'')) ILIKE '%current_company_id%'
  ) THEN
    RAISE EXCEPTION 'FAIL: company_business_category not scoped to current_company_id()';
  END IF;
END $$;

SELECT 'ALL BUSINESS-CATEGORY TAXONOMY ASSERTIONS PASSED' AS result;
