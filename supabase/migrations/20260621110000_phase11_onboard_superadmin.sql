-- ============================================================================
-- Phase 11 (11-03, Task 1) — onboard_company seeds the founder as Superadmin (D-02)
-- ----------------------------------------------------------------------------
-- Wires founder→Superadmin into company birth. CREATE OR REPLACE of the
-- existing onboard_company (20260608120000) — body identical EXCEPT one added
-- line: after the person→company link, PERFORM seed_company_superadmin() to
-- create the company's Superadmin group, add the founder, and seed the two
-- gated grants (team.manage, company.edit_profile).
--
-- Why the helper (not inline inserts): plan 02's §9 lockdown made person_group
-- and permission_matrix_entry SELECT-only for `authenticated`, so the inline
-- inserts the original onboarding RPC could have done no longer pass RLS.
-- seed_company_superadmin() is SECURITY DEFINER (bypasses RLS) and is granted to
-- authenticated, so this SECURITY INVOKER RPC can PERFORM it. Single source of
-- truth shared with the plan-03 backfill.
--
-- onboard_company stays SECURITY INVOKER, search_path = public, and keeps the
-- already_has_company guard + the explicit-id / no-RETURNING write-ordering and
-- the type-assignment loop unchanged. The change is minimal + additive (one
-- PERFORM) — T-11-07: no regression surface on this shared onboarding flow.
-- Shared-file edit performed under the held Ayush sync-ritual lock (Phase 11 is
-- Muskan's isolated lane; Ayush idle).
-- ============================================================================

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

  -- 2b. Seed the founder's Superadmin role (D-02). Definer helper writes the
  --     Superadmin group + founder person_group + the two gated grants despite the
  --     §9 SELECT-only lockdown of those tables. Must run AFTER the person link so
  --     current_company_id() (and any internal scoping) sees the new company.
  PERFORM public.seed_company_superadmin(v_company_id, v_uid);

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
  'person.company_id, seeds the founder as the company''s Superadmin via '
  'seed_company_superadmin() (D-02), and records business-category assignments — '
  'all in one tx. SECURITY INVOKER: RLS stays enforced; the founder-seed runs '
  'through a SECURITY DEFINER helper because person_group/permission_matrix_entry '
  'are SELECT-only post §9 lockdown. Returns the new company id. Raises '
  'already_has_company if the caller already belongs to one.';
