-- ============================================================================
-- Migration — Deal artifact storage (Phase 7, D-27/D-28)
-- ----------------------------------------------------------------------------
-- The `deal_artifact` table (Phase 2 deal migration) is only a POINTER
-- (storage_path). The invoice PDF itself needs somewhere to live. D-27 makes the
-- SELLER uploading a real invoice PDF the ONE trigger that closes the deal, so
-- this adds the private bucket that upload lands in:
--
--   A private Storage bucket `deal-artifacts` (+ storage.objects RLS). Files are
--   namespaced by DEAL WORKSPACE: `<deal_workspace_id>/<object>`. Access = being
--   able to reach that workspace, via public.can_access_workspace(<workspace_id>)
--   (the same helper deal_artifact's own table-level RLS uses), so ONLY the two
--   deal-workspace companies can read/write the invoice.
--
-- D-28 / ASVS V5: the bucket is PDF-only (allowed_mime_types = ['application/pdf'])
-- so a non-PDF (or a spoofed content-type) is rejected at the storage layer, not
-- just in the app.
--
-- Mirrors the relationship-artifact pattern (20260610010000) but swaps the
-- relationship-membership check for workspace access and locks the mime set to
-- PDF only. No tables touched — the deal_artifact table + its table-level RLS
-- (dealart_all) already exist.
--
-- NOTE for Muskan (RLS owner): this only ADDS a new bucket + its storage.objects
-- policies; it does not alter any existing public-schema RLS.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Private bucket (20 MB; PDF only — the invoice is the single close artifact)
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'deal-artifacts',
  'deal-artifacts',
  false,
  20971520,  -- 20 MB (matches the relationship-artifact size guard)
  ARRAY['application/pdf']  -- D-28 PDF-only (ASVS V5); no image/other types
)
ON CONFLICT (id) DO NOTHING;

-- storage.objects already has RLS enabled by Supabase. Scope each policy to the
-- bucket and to access of the deal workspace in the first path segment.
-- Path contract: `<deal_workspace_id>/<file>`  →  foldername(name)[1] = workspace id.

DROP POLICY IF EXISTS "deal_artifacts_insert" ON storage.objects;
CREATE POLICY "deal_artifacts_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'deal-artifacts'
    AND public.can_access_workspace(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "deal_artifacts_select" ON storage.objects;
CREATE POLICY "deal_artifacts_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'deal-artifacts'
    AND public.can_access_workspace(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "deal_artifacts_delete" ON storage.objects;
CREATE POLICY "deal_artifacts_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'deal-artifacts'
    AND public.can_access_workspace(((storage.foldername(name))[1])::uuid)
  );
