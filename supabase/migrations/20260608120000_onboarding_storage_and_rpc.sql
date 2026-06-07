-- ============================================================================
-- Migration — Company onboarding infra (1c)
-- ----------------------------------------------------------------------------
-- Two additive pieces for the company-onboarding flow. NO tables are created or
-- altered here — the company / company_license_file / company_type_assignment /
-- group tables already exist (Phase 1). This adds only:
--
--   1. A private Storage bucket `company-licenses` (+ storage.objects RLS) so the
--      license-upload step has somewhere to put the file. Files are namespaced by
--      company: `<company_id>/<object>`. A company may read/write/delete only its
--      own folder; the HS team may read any (for verification review).
--
--   2. onboard_company(name, country, type_codes[]) — the atomic company-birth.
--      Company creation is really THREE ordered writes that the RLS forces into
--      sequence (see below). Bundling them in one function = one transaction:
--      either the whole company is born or nothing is, so a mid-way failure can't
--      leave an orphan company with no owner.
--
-- The RLS ordering (from F2):
--   • company INSERT          — allowed only when current_company_id() IS NULL
--                               (a company-less user creating their first company)
--   • person UPDATE company_id — allowed for your own row
--   • company_type_assignment — INSERT requires company_id = current_company_id()
--                               i.e. the person link above must already be done
-- So the order is fixed: company → link person → types. The function runs them in
-- that order inside one tx.
--
-- SECURITY INVOKER (the default — NOT definer): RLS stays fully enforced. We do
-- NOT bypass it. The ordering simply resolves correctly within the single
-- function transaction (current_company_id() re-reads person between statements),
-- so atomicity is gained without widening the security surface.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Storage bucket for license files (private)
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-licenses',
  'company-licenses',
  false,
  20971520,  -- 20 MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- storage.objects already has RLS enabled by Supabase. Scope every policy to the
-- `company-licenses` bucket and to the caller's own company folder (first path
-- segment = company_id). HS team may read any folder for verification review.
DROP POLICY IF EXISTS "company_licenses_insert" ON storage.objects;
CREATE POLICY "company_licenses_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'company-licenses'
    AND (storage.foldername(name))[1] = public.current_company_id()::text
  );

DROP POLICY IF EXISTS "company_licenses_select" ON storage.objects;
CREATE POLICY "company_licenses_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'company-licenses'
    AND (
      (storage.foldername(name))[1] = public.current_company_id()::text
      OR public.is_hs_team()
    )
  );

DROP POLICY IF EXISTS "company_licenses_delete" ON storage.objects;
CREATE POLICY "company_licenses_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'company-licenses'
    AND (storage.foldername(name))[1] = public.current_company_id()::text
  );

-- ----------------------------------------------------------------------------
-- 2. onboard_company — atomic company birth (insert company → link person → types)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.onboard_company(
  p_name       text,
  p_country    text,
  p_type_codes text[] DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  -- Pre-generate the id rather than INSERT ... RETURNING. RETURNING under RLS
  -- forces a SELECT-policy check on the new row, but company_select is
  -- (id = current_company_id() OR is_hs_team()) — and the caller isn't linked to
  -- the company yet, so they can't "see" it and the insert is rejected. Generating
  -- the id here lets us INSERT without RETURNING and link the person afterwards.
  v_company_id uuid := gen_random_uuid();
  v_code       text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Guard: a person who already belongs to a company cannot create another.
  -- (The company INSERT policy would reject this anyway; this gives a clean error.)
  IF public.current_company_id() IS NOT NULL THEN
    RAISE EXCEPTION 'already_has_company';
  END IF;

  -- 1. Birth the company. created_by = caller satisfies the INSERT policy; the
  --    explicit id avoids RETURNING (see the SELECT-policy note above).
  INSERT INTO public.company (id, name, country, created_by)
  VALUES (v_company_id, p_name, p_country, v_uid);

  -- 2. Link the caller to it. From here current_company_id() returns v_company_id,
  --    which unlocks the child inserts below under RLS.
  UPDATE public.person
  SET company_id = v_company_id, updated_at = now()
  WHERE id = v_uid;

  -- 3. Business-category assignments (multi-select; may be empty).
  FOREACH v_code IN ARRAY p_type_codes LOOP
    INSERT INTO public.company_type_assignment (company_id, company_type_code, created_by)
    VALUES (v_company_id, v_code, v_uid);
  END LOOP;

  RETURN v_company_id;
END;
$$;

COMMENT ON FUNCTION public.onboard_company(text, text, text[]) IS
  'Atomic company birth for onboarding (1c): inserts company, links the caller''s '
  'person.company_id, and records business-category assignments — all in one tx. '
  'SECURITY INVOKER: RLS stays enforced; the forced write-ordering resolves within '
  'the transaction. Returns the new company id. Raises already_has_company if the '
  'caller already belongs to one.';
