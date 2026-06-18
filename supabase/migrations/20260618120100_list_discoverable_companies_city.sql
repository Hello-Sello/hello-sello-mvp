-- Phase 6 · Plan 01 — list_discoverable_companies: add city to RETURNS TABLE (D-02)
--
-- Adding a column to the RETURNS TABLE changes the function's return type, which
-- Postgres rejects with `create or replace` → must drop + recreate.
-- Body is copied verbatim from 20260617150000_list_discoverable_companies_connect_scope.sql
-- (the live definition), with three additions:
--   1. `city text` added to RETURNS TABLE (after country)
--   2. `c.city::text` added to SELECT (after c.country::text)
--   3. `c.city` added to GROUP BY
--
-- Connect-scope predicates (type in ('connect','connect_message') on the
-- requested/incoming branches) are carried verbatim — do not regress D-15
-- badge correctness.

drop function if exists public.list_discoverable_companies();

create function public.list_discoverable_companies()
returns table (
  id uuid,
  name text,
  country text,
  city text,
  logo_path text,
  type_codes text[],
  connection_state text   -- 'none' | 'requested' | 'incoming' | 'connected'
)
language sql
stable
security definer
set search_path to ''
as $$
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
  group by c.id, c.name, c.country, c.city, c.logo_path
  order by c.name, c.id
  limit 200;
$$;

revoke all on function public.list_discoverable_companies() from public;
grant execute on function public.list_discoverable_companies() to authenticated;
