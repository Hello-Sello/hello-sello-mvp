-- ============================================================================
-- list_discoverable_companies — reinstate the SEC-01 verified-caller gate (DISC-2)
-- ----------------------------------------------------------------------------
-- SEC-01 (20260617090000) added `and public.is_caller_verified()` to this RPC's
-- WHERE; later create-or-replace passes (20260617150000, 20260618120100) rebuilt
-- it from a pre-SEC-01 body and silently dropped the gate — so an UNVERIFIED
-- caller has been able to read the whole verified-company directory since
-- 2026-06-17.
--
-- Rebuilt from the CURRENT LIVE body (captured via pg_get_functiondef, not a
-- stale file). The ONLY change is the added `and public.is_caller_verified()`
-- predicate in the WHERE — every other line (columns, connection_state CASE,
-- joins, group/order/limit) is byte-identical to live.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.list_discoverable_companies()
 RETURNS TABLE(id uuid, name text, country text, city text, logo_path text, type_codes text[], connection_state text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    c.id,
    c.name::text,
    c.country::text,
    c.city::text,
    c.logo_path::text,
    coalesce(
      array_agg(distinct cta.company_type_code::text)
        filter (where cta.company_type_code is not null),
      '{}'
    ) as type_codes,
    case
      when exists (
        select 1 from public.relationship r
        where r.deleted_at is null and r.status = 'active'
          and r.company_a_id = least(public.current_company_id(), c.id)
          and r.company_b_id = greatest(public.current_company_id(), c.id)
      ) then 'connected'
      when exists (
        select 1 from public.pending_inbox_item p
        where p.deleted_at is null and p.status = 'pending'
          and p.type in ('connect', 'connect_message')
          and p.sender_company_id = public.current_company_id()
          and p.receiver_company_id = c.id
      ) then 'requested'
      when exists (
        select 1 from public.pending_inbox_item p
        where p.deleted_at is null and p.status = 'pending'
          and p.type in ('connect', 'connect_message')
          and p.sender_company_id = c.id
          and p.receiver_company_id = public.current_company_id()
      ) then 'incoming'
      else 'none'
    end as connection_state
  from public.company c
  left join public.company_type_assignment cta
    on cta.company_id = c.id and cta.deleted_at is null
  where c.deleted_at is null
    and c.verification_status = 'verified'
    and c.id is distinct from public.current_company_id()
    and public.is_caller_verified()
  group by c.id, c.name, c.country, c.city, c.logo_path
  order by c.name, c.id
  limit 200;
$function$;
