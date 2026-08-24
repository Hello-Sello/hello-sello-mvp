-- ============================================================================
-- get_discoverable_company gains the shop chrome (0022-buyer-shop-view, T01)
-- ----------------------------------------------------------------------------
-- The buyer's shop view renders the seller's shop chrome — banner/info box,
-- description, links, named locations — through the SAME components the seller
-- uses on /present. Those need five facts the Discover profile RPC never
-- returned: address, warehouse_location, updated_at, and the two NAMED metadata
-- keys `links` and `locations`.
--
-- ⚠️ THE LEAK RULE (ADR-0005 §4): this projects `c.metadata -> 'links'` and
-- `c.metadata -> 'locations'` — two named keys — NEVER `c.metadata`. Enforcing
-- it in SQL means a future metadata key cannot quietly widen what a buyer reads.
--
-- ⚠️ DROP + CREATE is forced: adding OUT columns changes the return type and
-- Postgres rejects `create or replace` across that. The body below is the
-- CURRENT definition copied verbatim from
-- 20260617090000_sec01_caller_verified_discover_gate.sql:112-183 (dumped from
-- the running DB and diffed: identical; no later migration redefines it), with
-- ONLY the five projections appended after `pricing_requested`, so no existing
-- column's position moves. Nothing in the WHERE, the joins, the grouping or the
-- header is retyped from memory — this is the class of change that silently
-- dropped list_discoverable_companies's verified gate.
--
-- The `group by` is deliberately UNCHANGED: company.id is the PRIMARY KEY and
-- is already grouped, so Postgres's functional-dependency rule lets every other
-- c.* column — including c.metadata -> 'links' — project ungrouped.
-- ============================================================================

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
  pricing_requested boolean,
  -- ── T01: the shop chrome (appended; no existing column's position moves) ──
  address text,
  warehouse_location text,
  updated_at timestamptz,
  links jsonb,
  locations jsonb
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
    ),
    -- ── T01: the shop chrome. `metadata` is projected as TWO NAMED KEYS only. ──
    c.address::text,
    c.warehouse_location::text,
    c.updated_at,
    c.metadata -> 'links',
    c.metadata -> 'locations'
  from public.company c
  left join public.company_type_assignment cta
    on cta.company_id = c.id and cta.deleted_at is null
  where c.id = p_company_id
    and c.deleted_at is null
    and c.verification_status = 'verified'
    and public.is_caller_verified()
  group by c.id, c.name, c.tagline, c.description, c.country, c.website, c.logo_path, c.cover_path;
$$;

-- The grant ritual. A DROP discards the ACL, so restate it here rather than
-- rely on the revoke_anon_execute_on_new_function event trigger
-- (20260817120000 §4) three months back in the log. Target ACL:
-- postgres=X, authenticated=X, service_role=X — no PUBLIC, no anon.
-- `service_role` is not granted by any statement below: it is reconstituted by
-- Supabase's default GRANT ... ON FUNCTIONS TO service_role. Same shape as
-- 20260814120000:375-377 for get_discoverable_shop.
revoke all     on function public.get_discoverable_company(uuid) from public;
grant  execute on function public.get_discoverable_company(uuid) to authenticated;
revoke execute on function public.get_discoverable_company(uuid) from anon;
