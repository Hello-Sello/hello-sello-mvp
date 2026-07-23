-- ============================================================================
-- list_incoming_person_requests() — incoming person requests (PG-11)
-- ----------------------------------------------------------------------------
-- The pending connect_person requests aimed at the caller, with the sender's
-- safe fields + company. SECURITY DEFINER because for a PENDING request the
-- sender is not connected yet, so person_select won't reveal their name in a
-- plain join. Safe fields only (no email/phone); is_caller_verified() gate.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.list_incoming_person_requests()
RETURNS TABLE (
  item_id uuid, note text, created_at timestamptz,
  sender_person_id uuid, sender_display_name text, sender_title text, sender_avatar_path text,
  sender_company_id uuid, sender_company_name text, sender_company_logo_path text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT
    i.id, i.note, i.created_at,
    p.id,
    coalesce(p.display_name, concat_ws(' ', p.first_name, p.last_name))::text,
    p.title::text, p.avatar_path::text,
    c.id, c.name::text, c.logo_path::text
  FROM public.pending_inbox_item i
  JOIN public.person p ON p.id = i.sender_person_id
  LEFT JOIN public.company c ON c.id = i.sender_company_id
  WHERE i.receiver_person_id = auth.uid()
    AND i.status = 'pending'
    AND i.type = 'connect_person'
    AND i.deleted_at IS NULL
    AND public.is_caller_verified()
  ORDER BY i.created_at DESC, i.id;
$$;

REVOKE ALL ON FUNCTION public.list_incoming_person_requests() FROM public;
GRANT EXECUTE ON FUNCTION public.list_incoming_person_requests() TO authenticated;
