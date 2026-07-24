-- ============================================================================
-- list_discoverable_people() — the People directory (DISC-7)
-- ----------------------------------------------------------------------------
-- People at OTHER verified companies, safe fields only, plus a per-person
-- connection_state (none/requested/incoming/connected) over the PERSON graph so
-- the card "+" renders the right state and can't be spammed. Mirrors
-- list_discoverable_companies (SECURITY DEFINER + is_caller_verified() gate).
-- connection_state uses person_connection (connected, either canonical dir) +
-- pending connect_person requests (requested = I sent, incoming = they sent).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.list_discoverable_people()
RETURNS TABLE (
  person_id uuid, display_name text, title text, avatar_path text, public_handle text,
  company_id uuid, company_name text, company_logo_path text, company_country text, company_city text,
  type_codes text[], connection_state text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT
    p.id,
    coalesce(p.display_name, concat_ws(' ', p.first_name, p.last_name))::text,
    p.title::text, p.avatar_path::text, p.public_handle::text,
    c.id, c.name::text, c.logo_path::text, c.country::text, c.city::text,
    coalesce(
      array_agg(distinct cta.company_type_code::text)
        filter (where cta.company_type_code is not null),
      '{}'
    ) as type_codes,
    case
      when exists (
        select 1 from public.person_connection pc
        where pc.deleted_at is null
          and ((pc.person_a_id = auth.uid() and pc.person_b_id = p.id)
            or (pc.person_b_id = auth.uid() and pc.person_a_id = p.id))
      ) then 'connected'
      when exists (
        select 1 from public.pending_inbox_item i
        where i.deleted_at is null and i.status = 'pending' and i.type = 'connect_person'
          and i.sender_person_id = auth.uid() and i.receiver_person_id = p.id
      ) then 'requested'
      when exists (
        select 1 from public.pending_inbox_item i
        where i.deleted_at is null and i.status = 'pending' and i.type = 'connect_person'
          and i.sender_person_id = p.id and i.receiver_person_id = auth.uid()
      ) then 'incoming'
      else 'none'
    end as connection_state
  FROM public.person p
  JOIN public.company c ON c.id = p.company_id
  LEFT JOIN public.company_type_assignment cta ON cta.company_id = c.id AND cta.deleted_at IS NULL
  WHERE p.deleted_at IS NULL
    AND c.deleted_at IS NULL
    AND c.verification_status = 'verified'
    AND c.id IS DISTINCT FROM public.current_company_id()
    AND p.id IS DISTINCT FROM auth.uid()
    AND public.is_caller_verified()
  GROUP BY p.id, p.display_name, p.first_name, p.last_name, p.title,
           p.avatar_path, p.public_handle, c.id, c.name, c.logo_path, c.country, c.city
  ORDER BY coalesce(p.display_name, concat_ws(' ', p.first_name, p.last_name)), p.id
  LIMIT 200;
$$;

REVOKE ALL ON FUNCTION public.list_discoverable_people() FROM public;
GRANT EXECUTE ON FUNCTION public.list_discoverable_people() TO authenticated;
