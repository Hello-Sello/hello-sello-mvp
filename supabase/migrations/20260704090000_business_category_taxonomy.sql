-- ============================================================================
-- Migration — Business-category taxonomy (DEV-99 #3)
-- ----------------------------------------------------------------------------
-- Adds a second, INDEPENDENT classification level to a company:
--
--   Business Category (sector)     → NEW  business_category + company_business_category
--   Business Activity (role)       → REUSE company_type + company_type_assignment
--
-- Both are multi-select. Kept as two separate lookup tables (not one table with a
-- discriminator) so the DB enforces domain integrity per level and the model
-- extends cleanly to non-cannabis sectors later. A company-defined "Custom"
-- category is a single lookup code ('custom') + a free-text label stored ON the
-- assignment row (custom_label) — no user rows pollute the shared lookup.
--
-- Also grows company_type (= Activity) from the 4 legacy codes to Marcel's 8,
-- remapping the legacy generic 'cultivator' → 'eu_gmp_cultivator' before dropping
-- it, and backfills a 'pharma' category onto every existing company (all current
-- demo companies are cannabis-medical). Data steps are idempotent.
--
-- RLS mirrors the phase-1 conventions (20260607170000_rls_policies.sql):
--   • lookup tables      → `<name>_read` FOR SELECT TO authenticated USING (true)
--   • ownership junction → `cbc_all` FOR ALL scoped to current_company_id()
-- The phase-1 "enable RLS on every table" loop already ran, so these new tables
-- enable RLS explicitly here. Table grants come from Supabase default privileges.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Business Category lookup (mirrors company_type's shape)
-- ----------------------------------------------------------------------------
CREATE TABLE public.business_category (
  code        VARCHAR(30) PRIMARY KEY,
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0
);
INSERT INTO public.business_category (code, description, sort_order) VALUES
  ('pharma',     'Pharma',        1),
  ('food',       'Food',          2),
  ('fmcg_cpg',   'FMCG / CPG',    3),
  ('automotive', 'Automotive',    4),
  ('services',   'Services',      5),
  ('custom',     'Custom',       99);

-- ----------------------------------------------------------------------------
-- 2. company_business_category junction (mirrors company_type_assignment;
--    adds custom_label free-text for the 'custom' code)
-- ----------------------------------------------------------------------------
CREATE TABLE public.company_business_category (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             UUID NOT NULL REFERENCES public.company(id),
  business_category_code VARCHAR(30) NOT NULL REFERENCES public.business_category(code),
  custom_label           TEXT NULL,
  created_by             UUID NULL REFERENCES public.person(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at             TIMESTAMPTZ NULL,
  -- custom_label is required (non-empty) iff the code is 'custom'; forbidden otherwise.
  -- Makes the "custom with no name" / "non-custom with a stray label" states impossible.
  CONSTRAINT company_business_category_custom_label_ck CHECK (
    (business_category_code =  'custom' AND custom_label IS NOT NULL AND btrim(custom_label) <> '')
    OR
    (business_category_code <> 'custom' AND custom_label IS NULL)
  )
);
CREATE UNIQUE INDEX uq_company_business_category_active
  ON public.company_business_category(company_id, business_category_code)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_company_business_category_company_id ON public.company_business_category(company_id);
CREATE INDEX idx_company_business_category_code       ON public.company_business_category(business_category_code);

-- ----------------------------------------------------------------------------
-- 3. RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.business_category          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_business_category  ENABLE ROW LEVEL SECURITY;

CREATE POLICY business_category_read ON public.business_category
  FOR SELECT TO authenticated USING (true);

CREATE POLICY cbc_all ON public.company_business_category FOR ALL TO authenticated
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());

-- ----------------------------------------------------------------------------
-- 4. Grow company_type (= Business Activity) to Marcel's 8 codes
--    Keep wholesaler / importer / pharmacy; align their labels + order.
-- ----------------------------------------------------------------------------
UPDATE public.company_type SET description = 'Pharmacy',   sort_order = 1 WHERE code = 'pharmacy';
UPDATE public.company_type SET description = 'Wholesaler', sort_order = 2 WHERE code = 'wholesaler';
UPDATE public.company_type SET description = 'Importer',   sort_order = 3 WHERE code = 'importer';
INSERT INTO public.company_type (code, description, sort_order) VALUES
  ('gacp_cultivator',    'GACP Cultivator',      4),
  ('eu_gmp_cultivator',  'EU-GMP Cultivator',    5),
  ('tga_gmp_cultivator', 'TGA-GMP Cultivator',   6),
  ('manufacturer_pharma','Manufacturer Pharma',  7),
  ('other',              'Other',               99)
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. Remap the legacy generic 'cultivator' → 'eu_gmp_cultivator', then drop it.
--    (eu_gmp_cultivator is brand-new, so the unique-active index can't collide.)
-- ----------------------------------------------------------------------------
UPDATE public.company_type_assignment
  SET company_type_code = 'eu_gmp_cultivator'
  WHERE company_type_code = 'cultivator';
DELETE FROM public.company_type WHERE code = 'cultivator';

-- ----------------------------------------------------------------------------
-- 6. Backfill: every company that has an activity gets the 'pharma' category
--    (all current demo companies are cannabis-medical). Idempotent.
-- ----------------------------------------------------------------------------
INSERT INTO public.company_business_category (company_id, business_category_code, created_by)
SELECT DISTINCT a.company_id, 'pharma', NULL::uuid
FROM public.company_type_assignment a
WHERE a.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.company_business_category b
    WHERE b.company_id = a.company_id
      AND b.business_category_code = 'pharma'
      AND b.deleted_at IS NULL
  );

-- ----------------------------------------------------------------------------
-- 7. onboard_company — also write Business Categories (+ custom_label).
--    Adding params changes the signature, so DROP the old 3-arg version first
--    (else the defaulted new args make a 3-arg call ambiguous between the two).
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.onboard_company(text, text, text[]);

CREATE OR REPLACE FUNCTION public.onboard_company(
  p_name            text,
  p_country         text,
  p_type_codes      text[] DEFAULT '{}',
  p_category_codes  text[] DEFAULT '{}',
  p_custom_category text   DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  -- Pre-generate the id rather than INSERT ... RETURNING: RETURNING would run the
  -- company_select policy on the not-yet-linked row and be rejected (see phase-1).
  v_company_id   uuid := gen_random_uuid();
  v_code         text;
  v_pending_join uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF public.current_company_id() IS NOT NULL THEN RAISE EXCEPTION 'already_has_company'; END IF;

  -- 1. Birth the company (explicit id; created_by satisfies the INSERT policy).
  INSERT INTO public.company (id, name, country, created_by)
  VALUES (v_company_id, p_name, p_country, v_uid);

  -- 2. Link the caller → now current_company_id() = v_company_id, unlocking children.
  UPDATE public.person SET company_id = v_company_id, updated_at = now() WHERE id = v_uid;

  -- 2b. Seed founder Superadmin (definer helper; must run after the person link).
  PERFORM public.seed_company_superadmin(v_company_id, v_uid);

  -- 2c. Path-B reconciliation: cancel any pending join_request the caller had.
  SELECT id INTO v_pending_join
    FROM public.join_request WHERE requester_person_id = v_uid AND status = 'pending' LIMIT 1;
  IF v_pending_join IS NOT NULL THEN PERFORM public.withdraw_join_request(v_pending_join); END IF;

  -- 3. Business Activities (multi-select; may be empty).
  FOREACH v_code IN ARRAY p_type_codes LOOP
    INSERT INTO public.company_type_assignment (company_id, company_type_code, created_by)
    VALUES (v_company_id, v_code, v_uid);
  END LOOP;

  -- 4. Business Categories (multi-select; may be empty). The 'custom' code carries
  --    its free-text label in p_custom_category; the table CHECK enforces
  --    "label present iff custom", so an empty custom label raises here.
  FOREACH v_code IN ARRAY p_category_codes LOOP
    INSERT INTO public.company_business_category (company_id, business_category_code, custom_label, created_by)
    VALUES (
      v_company_id, v_code,
      CASE WHEN v_code = 'custom' THEN nullif(btrim(p_custom_category), '') ELSE NULL END,
      v_uid
    );
  END LOOP;

  RETURN v_company_id;
END;
$$;
