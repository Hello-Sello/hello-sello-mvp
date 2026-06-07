-- ============================================================================
-- Migration 6/6 — Auth ↔ person wiring  (F3)
-- ----------------------------------------------------------------------------
-- person.id REFERENCES auth.users(id), but nothing creates the person row when
-- a user signs up. This installs the bridge: an AFTER INSERT trigger on
-- auth.users that auto-creates the matching person profile.
--
-- Depends on migration 2 (person table exists).
--
-- Design (locked 2026-06-07):
--   • SECURITY DEFINER — the trigger runs in the auth subsystem's context, so it
--     needs elevated rights to write public.person. `SET search_path` is pinned
--     to defend the definer function against search_path hijacking.
--   • company_id stays NULL at signup. A user exists before they have a company
--     (the sign-in → company-setup window). It is set later at company setup.
--     Honors the Path-B invariant: person.company_id is nullable, set in one place.
--   • first_name / last_name are read from the signup metadata
--     (auth.users.raw_user_meta_data). The sign-up form must pass them; COALESCE
--     to '' is a NOT NULL safety net so a metadata-less signup can't 500.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.person (id, first_name, last_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'last_name',  '')
  );
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Auto-creates a public.person row when an auth.users row is inserted. '
  'company_id is left NULL (set later at company setup).';

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
