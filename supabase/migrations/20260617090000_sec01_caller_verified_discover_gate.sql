-- SEC-01 + GAP-1 — gate the three Discover RPCs on the CALLER's own verification,
-- and close the anon EXECUTE grant door.
-- ----------------------------------------------------------------------------
-- The Discover RPCs (list_discoverable_companies / get_discoverable_company /
-- get_discoverable_shop) filter the TARGET company by verification_status =
-- 'verified' but never check the CALLER. So any logged-in user — even an
-- unverified one — could browse the whole verified directory + every verified
-- company's profile and opted-in catalogue, and anon could too (Supabase
-- auto-grants EXECUTE to anon on every public function).
--
-- This migration closes BOTH doors (two-door discipline):
--   * BODY gate  — a new public.is_caller_verified() helper, added as one
--     predicate to each RPC's WHERE clause. false ⇒ the SELECT returns 0 rows
--     (empty return, matching the existing "nothing to show" client contract).
--   * GRANT gate — revoke the auto-granted anon EXECUTE on all three RPCs so
--     an unauthenticated caller can't even invoke the function.
--
-- The RPCs run `set search_path to ''`, so the helper is called fully-qualified
-- (public.is_caller_verified()). The helper itself pins search_path = public.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 1. The single authoritative caller-verified gate (mirrors is_hs_team()).
--    anon ⇒ current_company_id() is NULL ⇒ no match ⇒ false (fail-safe deny).
-- ----------------------------------------------------------------------------
create or replace function public.is_caller_verified()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.company c
    where c.id = public.current_company_id()
      and c.verification_status = 'verified'
      and c.deleted_at is null
  );
$$;

revoke all on function public.is_caller_verified() from public;
grant execute on function public.is_caller_verified() to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Recreate the three Discover RPCs (final defs copied verbatim) with exactly
--    one new predicate — `and public.is_caller_verified()` — in each WHERE
--    clause. Because the functions are `language sql`, this predicate is
--    constant-per-call: false ⇒ the whole SELECT returns 0 rows (empty return).
--    Signatures are preserved (no client-contract break).
-- ----------------------------------------------------------------------------

-- 2a. list_discoverable_companies — final def from
--     20260614120000_list_discoverable_companies.sql.
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
    and public.is_caller_verified()
  group by c.id, c.name, c.country, c.logo_path
  order by c.name, c.id
  limit 200;
$$;

revoke all on function public.list_discoverable_companies() from public;
grant execute on function public.list_discoverable_companies() to authenticated;

-- 2b. get_discoverable_company — FINAL def from
--     20260614160000_discoverable_company_pricing_state.sql (keeps the
--     pricing_requested boolean column; NOT the superseded 130000 def).
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
    and public.is_caller_verified()
  group by c.id, c.name, c.tagline, c.description, c.country, c.website, c.logo_path, c.cover_path;
$$;

revoke all on function public.get_discoverable_company(uuid) from public;
grant execute on function public.get_discoverable_company(uuid) to authenticated;

-- 2c. get_discoverable_shop — final def from
--     20260614150000_get_discoverable_shop.sql. (The product-image RLS policy from
--     that migration is SEC-02's job / plan 02-03 — deliberately NOT touched here.)
create or replace function public.get_discoverable_shop(p_company_id uuid)
returns table (
  id                     uuid,
  name                   text,
  cultivar               text,
  thc_percent            numeric,
  cbd_percent            numeric,
  pack_size_grams        numeric,
  unit_code              text,
  local_code_pzn         text,
  dominance_code         text,
  country_of_origin      text,
  region                 text,
  images                 jsonb,   -- ordered [] of {id, path, position}; never null
  price_public           boolean, -- the seller's price dial, so the UI can tell
                                  -- "price on request" from "price not set yet"
  price_per_gram         numeric, -- null unless price_public
  bundle_threshold_grams numeric,
  bundle_price_per_gram  numeric
)
language sql
stable
security definer
set search_path to ''
as $$
  select
    p.id,
    p.name::text,
    p.cultivar::text,
    p.thc_percent,
    p.cbd_percent,
    p.pack_size_grams,
    p.unit_code::text,
    p.local_code_pzn::text,
    p.dominance_code::text,
    p.country_of_origin::text,
    p.region::text,
    coalesce(imgs.images, '[]'::jsonb),
    p.price_public,
    case when p.price_public then price.price_per_gram         end,
    case when p.price_public then price.bundle_threshold_grams end,
    case when p.price_public then price.bundle_price_per_gram  end
  from public.product p
  join public.company c
    on c.id = p.company_id
   and c.id = p_company_id
   and c.deleted_at is null
   and c.verification_status = 'verified'
  -- ordered image gallery; LEFT so a product with no images still returns ([])
  left join lateral (
    select jsonb_agg(
             jsonb_build_object('id', pi.id, 'path', pi.image_path, 'position', pi.position)
             order by pi.position
           ) as images
    from public.product_image pi
    where pi.product_id = p.id
  ) imgs on true
  -- one deterministic price from THIS company's own pricelist (schema allows >1)
  left join lateral (
    select pli.price_per_gram, pli.bundle_threshold_grams, pli.bundle_price_per_gram
    from public.pricelist_item pli
    join public.pricelist pl
      on pl.id = pli.pricelist_id
     and pl.company_id = p.company_id
     and pl.deleted_at is null
    where pli.product_id = p.id
      and pli.deleted_at is null
    order by pl.published_at desc nulls last, pli.created_at desc
    limit 1
  ) price on true
  where p.deleted_at is null
    and p.profile_visible = true
    and public.is_caller_verified()
  order by p.name;
$$;

revoke all     on function public.get_discoverable_shop(uuid) from public;
grant  execute on function public.get_discoverable_shop(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. GAP-1 — close the grant door. Supabase auto-grants EXECUTE to anon on every
--    public function; pair the body gate above with an anon revoke so an
--    unauthenticated caller can't even invoke these RPCs.
-- ----------------------------------------------------------------------------
revoke execute on function public.list_discoverable_companies() from anon;
revoke execute on function public.get_discoverable_company(uuid) from anon;
revoke execute on function public.get_discoverable_shop(uuid) from anon;
