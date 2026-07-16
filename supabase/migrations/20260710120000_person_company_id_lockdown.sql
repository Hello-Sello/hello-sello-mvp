-- ============================================================================
-- Migration — lock person.company_id against direct self-writes
-- ----------------------------------------------------------------------------
-- THE HOLE: the person UPDATE policy is row-scoped only (USING/WITH CHECK
-- id = auth.uid()) with NO column restriction, and `authenticated` holds a
-- TABLE-LEVEL UPDATE grant on person. So any signed-in user can
-- `UPDATE person SET company_id = <any>` on their own row via a direct
-- PostgREST call. Tenant isolation everywhere keys on current_company_id()
-- (= the caller's person.company_id), so this lets a user self-join any company
-- and read its private data. Proven by
-- supabase/tests/person_company_lockdown_test.sql (RED against the pre-fix schema).
--
-- WHY A COLUMN-LEVEL REVOKE ALONE DOES NOT WORK: Supabase grants `authenticated`
-- a TABLE-level UPDATE. A `REVOKE UPDATE (company_id)` cannot override a
-- table-level grant — the broader grant still admits the column. (We hit exactly
-- this on the deal tables: a column REVOKE was applied and tested, and the direct
-- write still succeeded — see the allocate-schema migration's grant notes.) So we
-- must REVOKE the whole-table UPDATE, then re-GRANT UPDATE on an explicit column
-- ALLOWLIST that omits company_id.
--
-- WHY onboard_company MUST BECOME SECURITY DEFINER: it is the ONE legitimate path
-- that sets person.company_id (linking a founder to their brand-new company). As
-- SECURITY INVOKER it runs as the caller — who, after this REVOKE, may no longer
-- write company_id — so "create a company" would break. Flipping it to SECURITY
-- DEFINER runs it as the function owner (postgres, which retains full column
-- UPDATE + bypasses RLS), so the company_id link still succeeds. Its own body
-- already self-authorizes (checks auth.uid() + the already_has_company guard) and
-- pins search_path, so widening its privilege introduces no new caller-controlled
-- write. approve_join_request / remove_member / the account-lifecycle RPCs are
-- ALREADY SECURITY DEFINER, so they are unaffected.
--
-- ⚠️  MAINTENANCE CAVEAT: because the grant is a per-column allowlist, a FUTURE
-- `ALTER TABLE person ADD COLUMN` will NOT be updatable by `authenticated` until
-- it is added to a re-GRANT. This is the documented trade-off of the column-grant
-- approach. If you add a person column that the app writes directly (not via a
-- definer RPC), extend the GRANT below.
--
-- Base RLS (20260607170000_rls_policies.sql) + the onboarding security model are
-- the shared lane — coordinate before touching them.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Close the grant door: drop the table-wide UPDATE, re-grant every column
--    EXCEPT company_id. (Deny-one: minimal blast radius — every other existing
--    write of any other column is preserved; only company_id becomes non-writable
--    by `authenticated`.)
-- ----------------------------------------------------------------------------
REVOKE UPDATE ON public.person FROM authenticated;

GRANT UPDATE (
  id,
  first_name,
  last_name,
  preferences,
  metadata,
  created_at,
  updated_at,
  deleted_at,
  display_name,
  title,
  phone,
  language,
  avatar_path,
  links,
  public_handle,
  deactivated_at,
  deletion_scheduled_for,
  anonymized_at
) ON public.person TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Move the ONE legitimate company_id write to a trusted path.
--    Body is byte-for-byte the live function; the ONLY change is
--    SECURITY INVOKER → SECURITY DEFINER.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.onboard_company(
  p_name            text,
  p_country         text,
  p_type_codes      text[] DEFAULT '{}',
  p_category_codes  text[] DEFAULT '{}',
  p_custom_category text   DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
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
