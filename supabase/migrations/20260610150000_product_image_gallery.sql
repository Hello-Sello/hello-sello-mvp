-- ============================================================================
-- Migration — product image gallery (Present surface)
-- ----------------------------------------------------------------------------
-- A product has MANY images (a carousel), not one. This replaces the single
-- `product.image_path` column with a 1:many `product_image` table — one row per
-- image, explicitly ordered by `position`. This is the unanimous shape across
-- the major open-source commerce platforms (Medusa `ProductImage.rank`, Saleor
-- `ProductMedia.sort_order`, Spree `spree_assets.position`, Vendure ordered
-- assets) and matches Supabase guidance (model file relationships in your own
-- table referencing the storage path; the storage schema is read-only).
--
-- A JSON/array column on the product row was rejected: reorder/delete become
-- whole-document rewrites, and you can't write per-image RLS.
--
-- The cover image is simply `position = 0` (no separate "primary" column —
-- one source of truth for ordering and which image is the cover).
--
-- Files land in the existing public `shop-media` bucket under
-- {company_id}/products/... (unchanged); this table just stores the paths.
-- `company_id` is denormalized onto the row so RLS is a direct column check
-- (mirrors `product_all`) rather than a join back to product on every access.
-- ============================================================================

create table public.product_image (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.product(id) on delete cascade,
  company_id  uuid not null references public.company(id),  -- denormalized for direct RLS
  image_path  varchar(255) not null,
  position    smallint not null default 0,
  created_at  timestamptz not null default now()
);
create index idx_product_image_product on public.product_image(product_id, position);

alter table public.product_image enable row level security;

-- Owner read+write, company-scoped — mirrors `product_all`.
create policy product_image_all on public.product_image for all to authenticated
  using (company_id = current_company_id())
  with check (company_id = current_company_id());

-- Public read for images of in-window, non-deleted products — mirrors
-- `product_public_select` so a buyer browsing another company's shop sees the
-- gallery. Gated by the parent product's visibility, not the image row.
create policy product_image_public_select on public.product_image for select to anon, authenticated
  using (exists (select 1 from public.product p
                 where p.id = product_image.product_id
                   and p.deleted_at is null
                   and (p.visibility_start is null or p.visibility_start <= current_date)
                   and (p.visibility_end   is null or p.visibility_end   >= current_date)));

-- Backfill: every existing single image becomes the cover (position 0).
insert into public.product_image (product_id, company_id, image_path, position)
  select id, company_id, image_path, 0
    from public.product
   where image_path is not null;

-- Retire the single-image column. All readers now use product_image.
-- (The import RPC is updated in the next migration to match.)
alter table public.product drop column image_path;
