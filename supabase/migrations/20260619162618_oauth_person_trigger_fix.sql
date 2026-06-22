-- ============================================================================
-- Migration — OAuth-tolerant handle_new_user()  (Phase 06.1, plan 06.1-01)
-- ----------------------------------------------------------------------------
-- The original trigger (20260607160000_auth_person_trigger.sql) read only
-- raw_user_meta_data->>'first_name' / 'last_name'. Password signup supplies
-- those keys, but OAuth providers do not:
--
--   Password  : first_name, last_name           (set by this app's signUp)
--   Google    : given_name, family_name, full_name
--   Outlook/azure : full_name, name only (often NO given/family → must split)
--
-- Against the old trigger, OAuth signups produced BLANK names (two empty
-- strings). This replaces ONLY the function body with a resolution chain so all
-- signup paths populate sensible first/last names and signup never 500s:
--
--   1. explicit fields   — first_name/given_name, last_name/family_name
--   2. split a full name — split_part(full,' ',1) for first, the rest for last
--   3. last-resort        — email local-part, then literal 'Member', last = ''
--
-- left(.,100) caps both for the VARCHAR(100) person.first_name/last_name limit.
--
-- Design preserved from 20260607160000:
--   • CREATE OR REPLACE FUNCTION only — the on_auth_user_created trigger is NOT
--     dropped/recreated (the function body is the sole change). No DROP TRIGGER.
--   • SECURITY DEFINER + SET search_path = public (definer-function hardening).
--   • company_id stays NULL at signup (set later at company setup; Path-B invariant).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- NOTE: `full`, `first`, `last` are reserved SQL keywords and cannot be used
  -- as plpgsql variable names (they break expression parsing, e.g. `full <> ''`).
  -- Use the `_nm` suffix instead.
  meta     jsonb := NEW.raw_user_meta_data;
  full_nm  text  := COALESCE(meta ->> 'full_name', meta ->> 'name', '');
  first_nm text;
  last_nm  text;
BEGIN
  -- 1) Explicit fields: password signup (first_name/last_name) OR
  --    Google (given_name/family_name). NULLIF drops empty strings so the
  --    COALESCE falls through to the next source.
  first_nm := COALESCE(NULLIF(meta ->> 'first_name', ''), NULLIF(meta ->> 'given_name', ''));
  last_nm  := COALESCE(NULLIF(meta ->> 'last_name', ''),  NULLIF(meta ->> 'family_name', ''));

  -- 2) Fall back to splitting a combined name (Outlook/azure case): first word
  --    is the first name, the remainder (if any) is the last name.
  IF first_nm IS NULL AND full_nm <> '' THEN
    first_nm := split_part(full_nm, ' ', 1);
    IF last_nm IS NULL AND position(' ' IN full_nm) > 0 THEN
      last_nm := NULLIF(substring(full_nm FROM position(' ' IN full_nm) + 1), '');
    END IF;
  END IF;

  -- 3) Last-resort defaults so the NOT NULL columns are always satisfied and
  --    signup never fails: email local-part, then the literal 'Member';
  --    last_name collapses to an empty string for single-name signups.
  first_nm := COALESCE(NULLIF(first_nm, ''), NULLIF(split_part(NEW.email, '@', 1), ''), 'Member');
  last_nm  := COALESCE(NULLIF(last_nm, ''), '');

  INSERT INTO public.person (id, first_name, last_name)
  VALUES (NEW.id, left(first_nm, 100), left(last_nm, 100));

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Auto-creates a public.person row when an auth.users row is inserted. '
  'Resolves first/last names across password (first_name/last_name), Google '
  '(given_name/family_name), and Outlook/azure (split full_name/name) metadata '
  'shapes, with an email-local-part / ''Member'' last-resort so OAuth signup '
  'never fails at the DB layer. company_id is left NULL (set later at company setup).';
