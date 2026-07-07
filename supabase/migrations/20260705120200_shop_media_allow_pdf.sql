-- ============================================================================
-- Migration — allow application/pdf on the shop-media bucket (Present, Phase 7)
-- ----------------------------------------------------------------------------
-- The shop-media bucket was created image-only (present_storefront_foundation).
-- CoA / custom-doc uploads (product_media, D-11) are PDFs, so widen the MIME
-- allowlist to add application/pdf. file_size_limit stays at 10 MB (server-
-- enforced). The folder-scoped shop_media_insert/update/delete write policies
-- already scope to the caller's own company folder — left untouched.
-- ============================================================================

update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
 where id = 'shop-media';
