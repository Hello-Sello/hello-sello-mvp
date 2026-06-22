-- SEC-02 — revoke anon catalogue read: close BOTH doors on product / pricelist_item /
-- product_image so anon cannot scrape any seller's opted-in catalogue via PostgREST.
-- ----------------------------------------------------------------------------
-- Two doors per table: (1) the role GRANT that PostgREST checks first, and (2) the
-- RLS policy TO clause. A TO authenticated policy alone does NOT block anon — Supabase's
-- default GRANT SELECT TO anon still lets anon hit the table (the policy just returns no
-- rows, so it looks closed but is half-closed; a future policy slip re-exposes everything).
-- This migration closes door 1 (the GRANT) here and door 2 (the policy) below.
--
-- The /c/[handle] public profile is unaffected: it reads only via the get_public_profile
-- DEFINER RPC (person/auth.users/company), never these tables (02-RESEARCH § Q2).
-- The three own-company write/read policies are SEPARATE and left untouched.
-- ----------------------------------------------------------------------------

-- Door 1 of 2 — strip Supabase's default SELECT grant from the anonymous role
-- (PostgREST's first gate).
revoke select on public.product from anon;
revoke select on public.pricelist_item from anon;
revoke select on public.product_image from anon;

-- Door 2 of 2 — scope the three public-read policies to the authenticated role only
-- (was: anon + authenticated). Each USING row filter is copied verbatim from its source
-- migration; only the role scope changes, so an authenticated viewer sees exactly the same
-- profile_visible rows (no over-lock, no under-lock). Own-company write/read left untouched.

-- product_public_select — source: 20260614140000_product_profile_visible_dial.sql
drop policy if exists product_public_select on public.product;
create policy product_public_select on public.product
  for select to authenticated
  using (deleted_at is null
         and profile_visible = true
         and (visibility_start is null or visibility_start <= current_date)
         and (visibility_end   is null or visibility_end   >= current_date));

-- pricelist_item_public_select — source: 20260614180000_pricelist_item_public_select_profile_visible.sql
drop policy if exists pricelist_item_public_select on public.pricelist_item;
create policy pricelist_item_public_select on public.pricelist_item
  for select to authenticated
  using (deleted_at is null
         and exists (select 1 from public.product p
                     where p.id = pricelist_item.product_id
                       and p.deleted_at is null
                       and p.profile_visible = true
                       and p.price_public = true));

-- product_image_public_select — source: 20260614150000_get_discoverable_shop.sql
drop policy if exists product_image_public_select on public.product_image;
create policy product_image_public_select on public.product_image
  for select to authenticated
  using (exists (select 1 from public.product p
                 where p.id = product_image.product_id
                   and p.deleted_at is null
                   and p.profile_visible = true
                   and (p.visibility_start is null or p.visibility_start <= current_date)
                   and (p.visibility_end   is null or p.visibility_end   >= current_date)));
