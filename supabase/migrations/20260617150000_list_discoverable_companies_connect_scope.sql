-- F6 directory-badge connect-scope polish.
-- This is the directory-RPC counterpart to the F6a fix shipped in
-- 20260614160000_discoverable_company_pricing_state.sql, which scoped the
-- per-company RPC (get_discoverable_company) to connect-type items only.
-- The F6a migration's own header noted: "list_discoverable_companies keeps
-- the coarse badge — noted as polish." This migration is that polish.
--
-- Fix: scope the 'requested'/'incoming' branches of list_discoverable_companies
-- to connect-type inbox items only (type in ('connect', 'connect_message')),
-- so that a pending pricelist_request no longer flips a directory company's
-- connection_state away from 'none'.
--
-- Return signature is UNCHANGED — use create or replace (not drop + recreate).
-- The F6a analog used drop + recreate only because it added a new column.

create or replace function public.list_discoverable_companies()
returns table (
  id uuid,
  name text,
  country text,
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
  group by c.id, c.name, c.country, c.logo_path
  order by c.name, c.id
  limit 200;
$$;

revoke all on function public.list_discoverable_companies() from public;
grant execute on function public.list_discoverable_companies() to authenticated;
