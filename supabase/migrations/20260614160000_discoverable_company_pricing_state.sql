-- Slice 4 · P6a — make get_discoverable_company's viewer-state precise enough for
-- the profile's two distinct CTAs (Connect vs Request pricing).
-- ----------------------------------------------------------------------------
-- Until now ANY pending item flipped connection_state to 'requested'/'incoming'.
-- Once the Request-pricing button exists (P7), asking for pricing would wrongly
-- make the Connect button say "Request sent". Fix: scope the connect-state to
-- connect-type items, and add a separate pricing_requested flag for the pricing
-- button's own persistent state. Return signature changes, so drop + recreate.
-- (list_discoverable_companies keeps the coarse badge — it has no pricing button;
-- noted as polish in docs/muskan-build/discover-connect-loop.md.)
-- ----------------------------------------------------------------------------

drop function if exists public.get_discoverable_company(uuid);

create function public.get_discoverable_company(p_company_id uuid)
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
  connection_state text,
  pricing_requested boolean
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
    end,
    exists (
      select 1 from public.pending_inbox_item p
      where p.deleted_at is null and p.status = 'pending'
        and p.type = 'pricelist_request'
        and p.sender_company_id = public.current_company_id()
        and p.receiver_company_id = c.id
    )
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
