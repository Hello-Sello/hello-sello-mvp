-- ============================================================================
-- Migration — display_name is the canonical person name (DEV-6.1 follow-up)
-- ----------------------------------------------------------------------------
-- The onboarding "Your profile" step now gates on `display_name` (not
-- first_name/last_name), because the split model can't represent mononyms /
-- single-name social logins (the first real Google signup, "Muskan", had no
-- surname and could never complete onboarding).
--
-- Two coupled changes, applied together so the data never contradicts the rule:
--   1. handle_new_user() ALSO writes display_name on signup (every path:
--      password full_name, Google name, Outlook/azure name, or a compose from
--      the resolved first/last). first_name/last_name stay as derived values
--      for the QR vCard — they are no longer the source of truth for "the name".
--   2. One-time BACKFILL: existing rows with a null/blank display_name get one
--      composed from first+last, so users created before this change aren't
--      left failing the new check. Idempotent (only touches blank rows).
--
-- Design preserved from 20260619162618_oauth_person_trigger_fix:
--   • CREATE OR REPLACE FUNCTION only; the on_auth_user_created trigger is NOT
--     dropped/recreated. SECURITY DEFINER + SET search_path = public.
--   • Signup never 500s: the same last-resort chain for first_name remains.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta       jsonb := NEW.raw_user_meta_data;
  full_nm    text  := COALESCE(meta ->> 'full_name', meta ->> 'name', '');
  first_nm   text;
  last_nm    text;
  display_nm text;
BEGIN
  -- first/last resolution (unchanged from 20260619162618) — kept for the vCard.
  first_nm := COALESCE(NULLIF(meta ->> 'first_name', ''), NULLIF(meta ->> 'given_name', ''));
  last_nm  := COALESCE(NULLIF(meta ->> 'last_name', ''),  NULLIF(meta ->> 'family_name', ''));

  IF first_nm IS NULL AND full_nm <> '' THEN
    first_nm := split_part(full_nm, ' ', 1);
    IF last_nm IS NULL AND position(' ' IN full_nm) > 0 THEN
      last_nm := NULLIF(substring(full_nm FROM position(' ' IN full_nm) + 1), '');
    END IF;
  END IF;

  first_nm := COALESCE(NULLIF(first_nm, ''), NULLIF(split_part(NEW.email, '@', 1), ''), 'Member');
  last_nm  := COALESCE(NULLIF(last_nm, ''), '');

  -- Canonical name: prefer the provider's full name verbatim (handles mononyms,
  -- multi-part and reordered names); else compose from the resolved first/last
  -- (last may be empty → just the first name). Never blank — first_nm is.
  display_nm := COALESCE(
    NULLIF(full_nm, ''),
    NULLIF(btrim(concat_ws(' ', first_nm, NULLIF(last_nm, ''))), ''),
    first_nm
  );

  INSERT INTO public.person (id, first_name, last_name, display_name)
  VALUES (NEW.id, left(first_nm, 100), left(last_nm, 100), display_nm);

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Auto-creates a public.person on auth.users insert. display_name is the '
  'canonical name (provider full_name, else first+last compose); first/last are '
  'derived for the vCard. Resolves password/Google/Outlook metadata; never 500s.';

-- ----------------------------------------------------------------------------
-- One-time backfill: rows created before display_name was canonical.
-- concat_ws skips NULLs, so a mononym (last_name = '') yields just the first
-- name. Only touches rows where display_name is currently null/blank.
-- ----------------------------------------------------------------------------
UPDATE public.person
SET display_name = NULLIF(btrim(concat_ws(' ', first_name, NULLIF(last_name, ''))), '')
WHERE display_name IS NULL OR btrim(display_name) = '';
