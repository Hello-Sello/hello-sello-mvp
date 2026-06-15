-- Discover directory read endpoint (Track 1, slice 1).
-- A SECURITY DEFINER function = the safe, controlled window that lets an
-- authenticated member browse companies they are NOT connected to yet
-- (the company RLS would otherwise hide them), exposing ONLY safe fields
-- + the viewer's per-card connection state. Mirrors get_public_profile.
--
-- Design verified against Supabase + Postgres best practice (2026-06-14):
--   search_path='' + fully-qualified names (privilege-escalation hardening),
--   REVOKE PUBLIC then GRANT to authenticated only, STABLE, LIMIT + ordered.
-- Filtering/pagination stays client-side for now; the directory is small.

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
          and p.sender_company_id = public.current_company_id()
          and p.receiver_company_id = c.id
      ) then 'requested'
      when exists (
        select 1 from public.pending_inbox_item p
        where p.deleted_at is null and p.status = 'pending'
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

-- Index for the per-card 'requested'/'incoming' lookups (directional pair).
-- ('connected' is already covered by uq_relationship_pair_active.)
create index if not exists idx_inbox_pair_status
  on public.pending_inbox_item (sender_company_id, receiver_company_id, status)
  where deleted_at is null;
