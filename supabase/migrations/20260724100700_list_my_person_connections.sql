-- ============================================================================
-- list_my_person_connections() — "My Network: people" (PG-10)
-- ----------------------------------------------------------------------------
-- The people you have an ACTIVE person_connection with, plus their company info.
-- SECURITY DEFINER + safe fields only (no email/phone): a person you're
-- personally connected to is usually NOT at a company you're company-connected
-- to, so company_select RLS would hide their company name/logo in a plain join.
-- Mirrors list_discoverable_people, incl. the is_caller_verified() gate.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.list_my_person_connections()
RETURNS TABLE (
  person_id uuid, display_name text, title text, avatar_path text, public_handle text,
  company_id uuid, company_name text, company_logo_path text, company_country text, company_city text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT
    p.id,
    coalesce(p.display_name, concat_ws(' ', p.first_name, p.last_name))::text,
    p.title::text, p.avatar_path::text, p.public_handle::text,
    c.id, c.name::text, c.logo_path::text, c.country::text, c.city::text
  FROM public.person_connection pc
  JOIN public.person p
    ON p.id = CASE WHEN pc.person_a_id = auth.uid() THEN pc.person_b_id ELSE pc.person_a_id END
  LEFT JOIN public.company c ON c.id = p.company_id
  WHERE pc.deleted_at IS NULL
    AND auth.uid() IN (pc.person_a_id, pc.person_b_id)
    AND p.deleted_at IS NULL
    AND public.is_caller_verified()
  ORDER BY coalesce(p.display_name, concat_ws(' ', p.first_name, p.last_name)), p.id;
$$;

REVOKE ALL ON FUNCTION public.list_my_person_connections() FROM public;
GRANT EXECUTE ON FUNCTION public.list_my_person_connections() TO authenticated;
