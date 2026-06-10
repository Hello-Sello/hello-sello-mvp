-- ============================================================================
-- Migration — shop-media owner SELECT policy (Present surface)
-- ----------------------------------------------------------------------------
-- The shop-media bucket had INSERT / UPDATE / DELETE policies but no SELECT one
-- (the foundation migration deliberately skipped a public SELECT so nobody could
-- *list* the bucket). But Supabase Storage's remove() does a select-then-delete
-- internally: with no SELECT grant the API finds nothing to remove and silently
-- returns an empty result, so deleting a product photo left the file orphaned.
--
-- Fix: a COMPANY-SCOPED SELECT — a company can list only its OWN folder
-- ({company_id}/...), exactly mirroring the insert/update/delete policies. This
-- does NOT reopen broad listing (a stranger still sees nothing), and public
-- storefront rendering is unaffected (a public bucket serves objects by URL
-- without any SELECT policy). It just lets an owner manage — and delete — the
-- files they uploaded.
-- ============================================================================

drop policy if exists shop_media_select on storage.objects;
create policy shop_media_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'shop-media'
    and (storage.foldername(name))[1] = (current_company_id())::text
  );
