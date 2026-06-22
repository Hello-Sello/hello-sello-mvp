-- Slice 4 follow-up — make the pricelist_item public-read EXPLICITLY require
-- profile_visible, matching product_public_select (P1) + product_image (P2).
-- ----------------------------------------------------------------------------
-- This is NOT a leak fix. Verified empirically that anon already CANNOT read a
-- hidden product's price: this policy's EXISTS subquery reads `public.product`
-- under RLS, and product_public_select already requires profile_visible, so the
-- inner read returns nothing for a hidden product (transitive closure).
--
-- What this changes is the *implicit* dependency: previously the price stayed
-- private only because product's policy happened to filter profile_visible. Now
-- the policy states its full intent itself — defense-in-depth + consistency with
-- the other two public-read tables, so a future loosening of product_public_select
-- can't silently expose prices.
-- ----------------------------------------------------------------------------
drop policy if exists pricelist_item_public_select on public.pricelist_item;
create policy pricelist_item_public_select on public.pricelist_item
  for select to anon, authenticated
  using (deleted_at is null
         and exists (select 1 from public.product p
                     where p.id = pricelist_item.product_id
                       and p.deleted_at is null
                       and p.profile_visible = true
                       and p.price_public = true));
