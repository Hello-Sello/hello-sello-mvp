-- Single-company read for the Discover profile page (Track 1, slice 2).
-- Same safe SECURITY DEFINER window as list_discoverable_companies, by id:
-- lets a member view a verified company's L0 profile (card fields only) even
-- when not connected. No products here — those are gated to slice 4.

create or replace function public.get_discoverable_company(p_company_id uuid)
returns table (
  id uuid,
  name text,
  tagline text,
  about text,
  country text,
  website text,
  logo_path text,
  cover_path text,
  type_codes text[],
  connection_state text
)
language sql
stable
security definer
set search_path to ''
as $$
  select
    c.id,
    c.name::text,
    c.tagline,
    c.description::text,
    c.country::text,
    c.website::text,
    c.logo_path::text,
    c.cover_path::text,
    coalesce(
      array_agg(distinct cta.company_type_code::text)
        filter (where cta.company_type_code is not null),
      '{}'
    ),
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
    end
  from public.company c
  left join public.company_type_assignment cta
    on cta.company_id = c.id and cta.deleted_at is null
  where c.id = p_company_id
    and c.deleted_at is null
    and c.verification_status = 'verified'
  group by c.id, c.name, c.tagline, c.description, c.country, c.website, c.logo_path, c.cover_path;
$$;

revoke all on function public.get_discoverable_company(uuid) from public;
grant execute on function public.get_discoverable_company(uuid) to authenticated;
