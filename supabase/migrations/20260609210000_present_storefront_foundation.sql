-- ============================================================================
-- Migration — Present storefront foundation (Present surface v0)
-- ----------------------------------------------------------------------------
-- Everything the seller shop needs that the schema didn't already have. The
-- product / product_batch / pricelist_item / company_type tables already exist
-- (Phase 1 + 2). This adds only:
--
--   1. company profile columns for the shop hero (tagline, cover, logo, warehouse)
--   2. product.price_public — per-product price visibility (default OFF →
--      buyers see "Request pricing"; seller opts each product in)
--   3. a PUBLIC `shop-media` storage bucket for product photos + cover + logo,
--      writes folder-scoped to the caller's own company (mirrors company-licenses).
--      No public SELECT policy: a public bucket serves objects by URL without one,
--      and a broad SELECT would let anyone *list* the bucket (we never enumerate it
--      — the app renders from product.image_path).
--   4. additive public-read RLS so a buyer can browse another company's shop:
--      catalog (product) is public for in-window rows; prices (pricelist_item)
--      are public ONLY for products the seller marked price_public.
--
-- The existing write policies (product_all / pli_all, both company-scoped) are
-- left untouched — these are SELECT-only policies OR'd on top, so write
-- isolation is preserved. Verified against live DB before applying.
-- ============================================================================

-- 1. company profile columns ------------------------------------------------
alter table public.company
  add column if not exists tagline text,
  add column if not exists cover_path varchar,
  add column if not exists logo_path varchar,
  add column if not exists warehouse_location varchar;

-- 2. per-product price visibility -------------------------------------------
alter table public.product
  add column if not exists price_public boolean not null default false;

-- 3. public shop-media bucket -----------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shop-media', 'shop-media', true, 10485760,  -- 10 MB
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- writes scoped to the caller's own company folder ({company_id}/...); read public
drop policy if exists "shop_media_insert" on storage.objects;
create policy "shop_media_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'shop-media'
              and (storage.foldername(name))[1] = public.current_company_id()::text);

drop policy if exists "shop_media_update" on storage.objects;
create policy "shop_media_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'shop-media'
         and (storage.foldername(name))[1] = public.current_company_id()::text);

drop policy if exists "shop_media_delete" on storage.objects;
create policy "shop_media_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'shop-media'
         and (storage.foldername(name))[1] = public.current_company_id()::text);

-- (no public SELECT policy — public bucket serves by URL; see header note)

-- 4. public-read catalog + gated prices -------------------------------------
drop policy if exists product_public_select on public.product;
create policy product_public_select on public.product
  for select to anon, authenticated
  using (deleted_at is null
         and (visibility_start is null or visibility_start <= current_date)
         and (visibility_end   is null or visibility_end   >= current_date));

drop policy if exists pricelist_item_public_select on public.pricelist_item;
create policy pricelist_item_public_select on public.pricelist_item
  for select to anon, authenticated
  using (deleted_at is null
         and exists (select 1 from public.product p
                     where p.id = pricelist_item.product_id
                       and p.price_public = true
                       and p.deleted_at is null));
