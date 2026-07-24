-- ============================================================================
-- list_my_person_connections — add the p2p DM thread_id (PG-13a)
-- ----------------------------------------------------------------------------
-- The My Network "Message" button needs the company-less p2p DM thread to open.
-- Rebuilt from the CURRENT LIVE body (pg_get_functiondef). The ONLY changes:
--   + a `thread_id uuid` OUT column,
--   + a LEFT JOIN to the connection's company-less p2p chat_thread (canonical
--     person_a/b = least/greatest(auth.uid(), p.id)),
--   + `t.id` in the SELECT.
-- Everything else (fields, joins, WHERE, gate, order) is byte-identical to live.
-- Adding an OUT column changes the return type, so DROP + CREATE (not REPLACE);
-- the grant is re-applied below.
-- ============================================================================

DROP FUNCTION IF EXISTS public.list_my_person_connections();

CREATE OR REPLACE FUNCTION public.list_my_person_connections()
 RETURNS TABLE(person_id uuid, display_name text, title text, avatar_path text, public_handle text,
   company_id uuid, company_name text, company_logo_path text, company_country text, company_city text,
   thread_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT
    p.id,
    coalesce(p.display_name, concat_ws(' ', p.first_name, p.last_name))::text,
    p.title::text, p.avatar_path::text, p.public_handle::text,
    c.id, c.name::text, c.logo_path::text, c.country::text, c.city::text,
    t.id
  FROM public.person_connection pc
  JOIN public.person p
    ON p.id = CASE WHEN pc.person_a_id = auth.uid() THEN pc.person_b_id ELSE pc.person_a_id END
  LEFT JOIN public.company c ON c.id = p.company_id
  LEFT JOIN public.chat_thread t
    ON t.type = 'p2p' AND t.relationship_id IS NULL AND t.deleted_at IS NULL
    AND t.person_a_id = least(auth.uid(), p.id)
    AND t.person_b_id = greatest(auth.uid(), p.id)
  WHERE pc.deleted_at IS NULL
    AND auth.uid() IN (pc.person_a_id, pc.person_b_id)
    AND p.deleted_at IS NULL
    AND public.is_caller_verified()
  ORDER BY coalesce(p.display_name, concat_ws(' ', p.first_name, p.last_name)), p.id;
$function$;

REVOKE ALL ON FUNCTION public.list_my_person_connections() FROM public;
GRANT EXECUTE ON FUNCTION public.list_my_person_connections() TO authenticated;
