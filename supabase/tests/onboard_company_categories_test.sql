-- ============================================================================
-- onboard_company_categories_test.sql — DEV-99 #3 RPC behaviour
-- ----------------------------------------------------------------------------
-- Proves onboard_company writes BOTH classification levels: activities
-- (company_type_assignment) and categories (company_business_category), and
-- captures the free-text custom_label for the 'custom' category.
--
-- Impersonation mirrors rbac_enforcement_test.sql: insert an auth.users row
-- (the on_auth_user_created trigger makes a company-less person), then set
-- request.jwt.claims + SET LOCAL ROLE authenticated so auth.uid() resolves to it.
--
-- Wrapped by the caller in BEGIN … ROLLBACK, so it leaves no trace.
--
-- RED until the RPC gains (p_category_codes text[], p_custom_category text):
-- calling the 5-arg signature errors "function ... does not exist".
-- ============================================================================

-- company-less user → trigger creates the person (company_id NULL)
INSERT INTO auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000000',
        'add17e57-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
        'onboard-cat-test@example.test',
        '{"first_name":"Testy","last_name":"Cat"}'::jsonb, now(), now());

SELECT set_config('request.jwt.claims',
  '{"sub":"add17e57-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_company uuid;
BEGIN
  v_company := public.onboard_company(
    p_name            => 'Testy Co',
    p_country         => 'DE',
    p_type_codes      => ARRAY['wholesaler','eu_gmp_cultivator'],
    p_category_codes  => ARRAY['pharma','custom'],
    p_custom_category => 'Cosmetics'
  );

  -- both activities landed
  IF (SELECT count(*) FROM public.company_type_assignment
      WHERE company_id = v_company AND deleted_at IS NULL) <> 2 THEN
    RAISE EXCEPTION 'FAIL: expected 2 activity assignments';
  END IF;

  -- both categories landed
  IF (SELECT count(*) FROM public.company_business_category
      WHERE company_id = v_company AND deleted_at IS NULL) <> 2 THEN
    RAISE EXCEPTION 'FAIL: expected 2 category assignments';
  END IF;

  -- custom label captured on the 'custom' row
  IF NOT EXISTS (SELECT 1 FROM public.company_business_category
      WHERE company_id = v_company AND business_category_code = 'custom'
        AND custom_label = 'Cosmetics' AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'FAIL: custom_label not captured on the custom category';
  END IF;

  -- a fixed category carries NO custom_label (CHECK holds)
  IF NOT EXISTS (SELECT 1 FROM public.company_business_category
      WHERE company_id = v_company AND business_category_code = 'pharma'
        AND custom_label IS NULL AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'FAIL: fixed category pharma should have null custom_label';
  END IF;
END $$;

RESET ROLE;
SELECT 'ONBOARD CATEGORY ASSERTIONS PASSED' AS result;
