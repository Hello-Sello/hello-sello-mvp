-- Slice 4 · P2 — get_discoverable_shop: the audience-scoped catalogue window.
-- ----------------------------------------------------------------------------
-- Mirrors get_discoverable_company (slice 2): a SECURITY DEFINER projection that
-- lets a verified member view a verified company's opted-in products BEFORE
-- connecting (normal RLS hides cross-tenant rows). It returns ONLY profile_visible
-- products; prices ONLY where price_public; and NEVER the seller-only cost (cogs).
--
-- RLS is bypassed inside a definer function, so the WHERE clause + the verified-
-- company join ARE the security boundary (D2-D4 in the build plan). The image and
-- price children are pulled via LEFT JOIN LATERAL keyed on the product, so they
-- inherit the parent's visibility filter — no unfiltered side-join can leak.
--
-- Also completes the dial floor on the image sibling: P1 tightened the product
-- public-read to profile_visible, but product_image_public_select still used the
-- old window — so a hidden product's images were directly readable. Tighten it to
-- match, so the floor is consistent across both tables.
-- ----------------------------------------------------------------------------

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
  order by p.name;
$$;

revoke all     on function public.get_discoverable_shop(uuid) from public;
grant  execute on function public.get_discoverable_shop(uuid) to authenticated;

-- Complete the dial floor: images follow the parent product's profile_visible.
drop policy if exists product_image_public_select on public.product_image;
create policy product_image_public_select on public.product_image
  for select to anon, authenticated
  using (exists (select 1 from public.product p
                 where p.id = product_image.product_id
                   and p.deleted_at is null
                   and p.profile_visible = true
                   and (p.visibility_start is null or p.visibility_start <= current_date)
                   and (p.visibility_end   is null or p.visibility_end   >= current_date)));
