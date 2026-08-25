-- ============================================================================
-- Company deactivation closes every discovery door (HEL-70)
-- ----------------------------------------------------------------------------
-- `company.deactivated_at` (20260706090000:48) has existed since the account
-- lifecycle landed, is set in five places by that migration's RPCs, and was
-- consulted by NO read door. A Superadmin could pause the whole company and it
-- would keep listing in Discover, keep opening its shop, and keep handing a
-- connected buyer prices and tier ladders.
--
-- THE RULE (DECISIONS.md 2026-08-25, "Company deactivation is closed-to-everyone"):
-- a deactivated company reads IDENTICALLY to a soft-deleted one — hidden from
-- the listing, page closed on a direct link, shop and prices closed, basket
-- lines stop being admissible, new business blocked. The only differences are
-- that it is REVERSIBLE and that the company's own members never lose sight of
-- their own catalogue.
--
-- ── WHY THE OWNER ARM IS DELIBERATELY UNTOUCHED ──
-- Deactivation is reversible, so a paused company's members must still be able
-- to work on the catalogue before reactivating. That is why the new term goes
-- ONLY where a company row is consulted about a STRANGER or a COUNTERPARTY:
--   * `product_visible_to_caller` — the buyer arm's company EXISTS only. Its
--     owner arm (`p.company_id = current_company_id()`) never reads `company`,
--     so it is unreachable from this edit by construction.
--   * `list_discoverable_companies` / `list_discoverable_people` — both already
--     self-exclude with `c.id is distinct from current_company_id()`.
--   * `get_discoverable_company` / `get_discoverable_shop` — these have NO owner
--     arm on the company side, so a paused company's own member also loses the
--     BUYER PREVIEW at /discover/<own id>. Accepted: that surface is the shop,
--     and the rule says the shop is closed. /present is unaffected — it reads
--     `getMyShop()` through plain RLS, never these RPCs.
--
-- ── FIVE DOORS, NOT FOUR (L-038) ──
-- A "single owner" of a rule is a claim about AGREEMENT WITH THE OTHER DOORS,
-- not about how few files hold it. Six doors — product, image, media,
-- pricelist-item, tier, basket and the price view — inherit the term from
-- `product_visible_to_caller` alone, because T13 pointed the product policies at
-- it and HEL-69 (20260825100000:87) pointed `current_pricelist_item` at
-- `product_price_visible_to_caller`, which delegates to it. The remaining doors
-- carry their own company predicate and are edited individually.
--
-- The ticket named FOUR. There are FIVE: `list_discoverable_people`
-- (20260724101000:54) gates on `deleted_at` + `verification_status` like the
-- others and has never been redefined, so without this edit a paused company's
-- PEOPLE stay discoverable in the person graph — the same hole one door over.
-- Building four of five and calling it single-owner would repeat exactly the
-- mistake this ticket exists to fix. (Scope widened by Muskan, 2026-08-25.)
--
-- ── NOT CLOSED HERE, FILED SEPARATELY ──
-- The rule's "new connections blocked" is NOT enforceable from these five
-- edits. A connect request is a direct client INSERT into `pending_inbox_item`
-- (src/app/discover/actions.ts:76) governed by `inbox_insert`, which constrains
-- only the SENDER. Hiding the company from Discover removes the button, not the
-- door. That is a write-path change needing its own reader census (L-037).
--
-- ── HOW THESE BODIES WERE PRODUCED ──
-- Every body below was EXTRACTED from its latest definition and diffed, not
-- retyped: replacing a function from a stale copy is how Discover silently lost
-- its verified-caller gate. Exactly one line differs per function. Sources:
--   product_visible_to_caller      ← 20260823100000 (only definition)
--   list_discoverable_companies    ← 20260814120000 (latest of 4)
--   get_discoverable_company       ← 20260820090000 (latest of 3)
--   get_discoverable_shop          ← 20260822100000 (latest of 5)
--   list_discoverable_people       ← 20260724101000 (only definition)
--
-- `create or replace` throughout — no signature or return-type changes, so
-- grants survive. They are re-emitted anyway: idempotent, and `drop`+`create`
-- silently drops them (20260724120300:152 class).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- (1) The single owner of "may this caller see this product". Six doors inherit: product / image / media / pricelist-item / tier / basket / price view.
-- ----------------------------------------------------------------------------
create or replace function public.product_visible_to_caller(p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1
      from public.product p
     where p.id = p_product_id
       and p.deleted_at is null
       and (
            -- Owner arm: the seller's own product, hidden or not.
            p.company_id = public.current_company_id()
            -- Buyer arm: made public, or revealed by a LIVE connection. Every
            -- term here is re-checked on each read, so ending the relationship
            -- takes the product back.
            --
            -- THIS ARM IS TERM-FOR-TERM `get_discoverable_shop`'s buyer filter
            -- (20260822100000). It must stay that way: this function claims to
            -- be the single owner of "may this caller see this product", and a
            -- single owner is a claim about AGREEMENT WITH THE OTHER DOORS, not
            -- about how few files hold the rule. Round 4 of the ship gate found
            -- three terms present there and absent here — the seller company's
            -- `deleted_at` and `verification_status`, and the unfiled rule —
            -- and a soft-deleted seller's HIDDEN product was still handing back
            -- its current name, cultivar, PZN and price through the basket
            -- while the shop door returned nothing. Before you add a term to
            -- either door, diff the two. (LEARNINGS L-038.)
         or (
              (p.profile_visible
               or public.is_connected_to_company(p.company_id))
              and (p.visibility_start is null or p.visibility_start <= current_date)
              and (p.visibility_end   is null or p.visibility_end   >= current_date)
              and public.is_caller_verified()
              -- The SELLER's company must still be live and verified. Neither
              -- `is_connected_to_company` (relationship row only) nor
              -- `is_caller_verified` (the CALLER's company) covers this.
              and exists (
                select 1
                  from public.company c
                 where c.id = p.company_id
                   and c.deleted_at is null
                   and c.verification_status = 'verified'
                   and c.deactivated_at is null
              )
              -- UNFILED IS NOT A SHELF — withheld from buyers, kept for the
              -- owner so the `Unassigned` pile stays fileable. The owner half
              -- is carried by the owner arm above, so a bare NOT NULL is right
              -- here and must not be hoisted out of this arm.
              and p.location is not null
            )
       )
  );
$$;


revoke all     on function public.product_visible_to_caller(uuid) from public, anon;
grant  execute on function public.product_visible_to_caller(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- (2) Discover listing.
-- ----------------------------------------------------------------------------
create or replace function public.list_discoverable_companies()
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
    and c.deactivated_at is null
    and c.id is distinct from public.current_company_id()
    and public.is_caller_verified()
  group by c.id, c.name, c.country, c.city, c.logo_path
  order by c.name, c.id
  limit 200;
$$;


revoke all     on function public.list_discoverable_companies() from public, anon;
grant  execute on function public.list_discoverable_companies() to authenticated;

-- ----------------------------------------------------------------------------
-- (3) Company page on a direct link.
-- ----------------------------------------------------------------------------
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
    and c.deactivated_at is null
    and public.is_caller_verified()
  group by c.id, c.name, c.tagline, c.description, c.country, c.website, c.logo_path, c.cover_path;
$$;


revoke all     on function public.get_discoverable_company(uuid) from public, anon;
grant  execute on function public.get_discoverable_company(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- (4) Shop + prices.
-- ----------------------------------------------------------------------------
create or replace function public.get_discoverable_shop(p_company_id uuid)
returns table (
  id                 uuid,
  name               text,
  cultivar           text,
  thc_percent        numeric,
  cbd_percent        numeric,
  pack_size_grams    numeric,
  unit_code          text,
  local_code_pzn     text,
  dominance_code     text,
  country_of_origin  text,
  region             text,
  images             jsonb,   -- ordered [] of {id, path, position}; never null
  price_public       boolean, -- the seller's price dial, so the UI can tell
                              -- "price on request" from "price not set yet"
  price_per_gram     numeric, -- null unless price_public
  tiers              jsonb,   -- ordered [] of {id, min_grams, price_per_gram};
                              -- null unless price_public
  -- ---- T05: the specification set (AC 7) + location + media ----
  cbg_percent        numeric,
  cbn_percent        numeric,
  terpene_percent    numeric, -- manual column, else the representative lot's sum
  cultivator         text,
  lineage_parent_a   text,
  lineage_parent_b   text,
  irradiation_code   text,
  packaging_material text,
  resealable         boolean,
  location           text,    -- the seller's shelf name; produces the location tabs
  pack_sizes         jsonb,   -- ONLY metadata->'pack_sizes'; null when unset
  media              jsonb    -- ordered [] of {id, kind, path, url, label}; never null
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
    case when p.price_public then v.price_per_gram end,
    case when p.price_public then v.tiers          end,
    p.cbg_percent,
    p.cbn_percent,
    -- manual first, representative-lot sum second (shop.ts:249)
    coalesce(p.terpene_percent, terp.terpene_sum),
    p.cultivator::text,
    p.lineage_parent_a::text,
    p.lineage_parent_b::text,
    p.irradiation_code::text,
    p.packaging_material::text,
    p.resealable,
    p.location::text,
    -- ONE named key, never the whole metadata blob (the leak rule)
    p.metadata -> 'pack_sizes',
    coalesce(med.media_items, '[]'::jsonb)
  from public.product p
  join public.company c
    on c.id = p.company_id
   and c.id = p_company_id
   and c.deleted_at is null
   and c.verification_status = 'verified'
   and c.deactivated_at is null
  -- ordered image gallery; LEFT so a product with no images still returns ([])
  left join lateral (
    select jsonb_agg(
             jsonb_build_object('id', pi.id, 'path', pi.image_path, 'position', pi.position)
             order by pi.position
           ) as images
    from public.product_image pi
    where pi.product_id = p.id
  ) imgs on true
  -- ordered "Documents & media" list, mirroring imgs; LEFT + coalesce so a
  -- product with no media still returns and its card back renders empty.
  left join lateral (
    select jsonb_agg(
             jsonb_build_object(
               'id',    pm.id,
               'kind',  pm.kind,
               'path',  pm.path,
               'url',   pm.url,
               'label', pm.label
             )
             order by pm.position
           ) as media_items
    from public.product_media pm
    where pm.product_id = p.id
  ) med on true
  -- The representative lot, PICKED FIRST over live lots only…
  left join lateral (
    select pb.id as batch_id
    from public.product_batch pb
    where pb.product_id = p.id
      and pb.deleted_at is null
    order by pb.ready_for_sale_date desc nulls last, pb.created_at desc
    limit 1
  ) rep on true
  -- …THEN summed. No rows on that lot → sum over zero rows → NULL, which is
  -- what deriveTerpPercent returns for a lot with no terpene rows.
  left join lateral (
    select round(sum(coalesce(bt.percent, 0)), 2) as terpene_sum
    from public.batch_terpene bt
    where bt.product_batch_id = rep.batch_id
  ) terp on true
  -- the one current price row (+ ladder) — the view already picks
  -- published_at desc nulls last, created_at desc
  left join public.current_pricelist_item v
    on v.product_id = p.id
  where p.deleted_at is null
    -- THREE ARMS, THREE QUESTIONS: public / owner / connected. Attaches to
    -- profile_visible ONLY — the visibility WINDOW stays outside this
    -- parenthesis (T06 site 3; see the header).
    and (p.profile_visible = true
         or p.company_id = public.current_company_id()
         or public.is_connected_to_company(p.company_id))
    -- UNFILED IS NOT A SHELF. Withheld from buyers; the owner keeps it so the
    -- `Unassigned` pile stays fileable — see the header.
    and (p.location is not null or p.company_id = public.current_company_id())
    and (p.visibility_start is null or p.visibility_start <= current_date)
    and (p.visibility_end   is null or p.visibility_end   >= current_date)
    and public.is_caller_verified()
  order by p.name;
$$;


revoke all     on function public.get_discoverable_shop(uuid) from public, anon;
grant  execute on function public.get_discoverable_shop(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- (5) People directory — the fifth door the ticket did not name.
-- ----------------------------------------------------------------------------
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
    AND c.deactivated_at IS NULL
    AND c.id IS DISTINCT FROM public.current_company_id()
    AND p.id IS DISTINCT FROM auth.uid()
    AND public.is_caller_verified()
  GROUP BY p.id, p.display_name, p.first_name, p.last_name, p.title,
           p.avatar_path, p.public_handle, c.id, c.name, c.logo_path, c.country, c.city
  ORDER BY coalesce(p.display_name, concat_ws(' ', p.first_name, p.last_name)), p.id
  LIMIT 200;
$$;


revoke all     on function public.list_discoverable_people() from public, anon;
grant  execute on function public.list_discoverable_people() to authenticated;

