-- ============================================================================
-- Migration — product_media (Present surface, Phase 7)
-- ----------------------------------------------------------------------------
-- Per-product "Documents & Media" on the card back (D-11): external video links
-- (Loom/YouTube/Vimeo) + CoA / custom-doc PDFs. Mirrors the proven product_image
-- gallery shape exactly — a 1:many child of product, position-ordered, with
-- `company_id` denormalized onto the row so RLS is a direct column check
-- (like product_all) rather than a join back to product on every access.
--
-- Two storage shapes in one table, distinguished by `kind`:
--   - video_link → external URL in `url`   (no file; nothing in shop-media)
--   - coa / doc  → PDF path  in `path`     (bytes live in the shop-media bucket,
--                                            uploaded client-direct; we store the
--                                            path string only)
-- A check constraint enforces the right column is present per kind.
-- ============================================================================

create table public.product_media (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.product(id) on delete cascade,
  company_id  uuid not null references public.company(id),  -- denormalized for direct RLS
  kind        text not null check (kind in ('video_link', 'coa', 'doc')),
  path        varchar(255),  -- storage path for coa/doc
  url         text,          -- external link for video_link
  label       varchar(160),
  position    smallint not null default 0,
  created_at  timestamptz not null default now(),
  -- a video_link needs a url; a coa/doc needs a path
  constraint product_media_shape check (
    (kind = 'video_link' and url is not null)
    or (kind in ('coa', 'doc') and path is not null)
  )
);
create index idx_product_media_product on public.product_media(product_id, position);

alter table public.product_media enable row level security;

-- Owner read+write, company-scoped — mirrors product_all / product_image_all.
create policy product_media_all on public.product_media for all to authenticated
  using (company_id = current_company_id())
  with check (company_id = current_company_id());

-- Public read for media of in-window, non-deleted, on-profile products. Gated by
-- the parent product's visibility, not the media row. Matches the TIGHTER
-- profile_visible floor the discover RPC applies (not just visibility window),
-- so back-of-card media follows the same gate as the price/gallery reads.
create policy product_media_public_select on public.product_media for select to anon, authenticated
  using (exists (select 1 from public.product p
                 where p.id = product_media.product_id
                   and p.deleted_at is null
                   and p.profile_visible = true
                   and (p.visibility_start is null or p.visibility_start <= current_date)
                   and (p.visibility_end   is null or p.visibility_end   >= current_date)));
