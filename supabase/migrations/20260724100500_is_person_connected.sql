-- ============================================================================
-- is_person_connected(uuid) — the social-graph visibility helper (PG-2)
-- ----------------------------------------------------------------------------
-- True when an ACTIVE person_connection joins the caller (auth.uid()) and the
-- given person, in either canonical direction. SECURITY DEFINER so it can read
-- person_connection from inside a person RLS policy without recursion — the same
-- pattern as is_relationship_member / can_see_person.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_person_connected(p_other uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.person_connection pc
    WHERE pc.deleted_at IS NULL
      AND (
        (pc.person_a_id = auth.uid() AND pc.person_b_id = p_other)
        OR (pc.person_b_id = auth.uid() AND pc.person_a_id = p_other)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_person_connected(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_person_connected(uuid) TO authenticated;
