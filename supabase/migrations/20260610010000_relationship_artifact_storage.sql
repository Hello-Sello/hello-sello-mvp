-- ============================================================================
-- Migration — Relationship artifact storage (2e, Phase 6)
-- ----------------------------------------------------------------------------
-- The `relationship_artifact` table (Phase 2 deal migration) is only a POINTER
-- (storage_path). The file itself needs somewhere to live. This adds:
--
--   A private Storage bucket `relationship-artifacts` (+ storage.objects RLS).
--   Files are namespaced by RELATIONSHIP: `<relationship_id>/<object>`. Unlike
--   company-licenses (namespaced per company, own-folder-only), a relationship
--   artifact is SHARED by both sides, so access = membership of that
--   relationship via public.is_relationship_member(<relationship_id>).
--
-- Mirrors the company-licenses pattern (20260608120000) but swaps the
-- own-company-folder check for relationship membership. No tables touched - the
-- relationship_artifact table + its table-level RLS (relart_all) already exist.
--
-- NOTE for Muskan (RLS owner): this only ADDS a new bucket + its storage.objects
-- policies; it does not alter any existing public-schema RLS.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Private bucket (20 MB; docs + common image types, same set as licenses)
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'relationship-artifacts',
  'relationship-artifacts',
  false,
  20971520,  -- 20 MB (matches relationship_artifact size guard)
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- storage.objects already has RLS enabled by Supabase. Scope each policy to the
-- bucket and to membership of the relationship in the first path segment.
-- Path contract: `<relationship_id>/<file>`  →  foldername(name)[1] = relationship_id.

DROP POLICY IF EXISTS "rel_artifacts_insert" ON storage.objects;
CREATE POLICY "rel_artifacts_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'relationship-artifacts'
    AND public.is_relationship_member(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "rel_artifacts_select" ON storage.objects;
CREATE POLICY "rel_artifacts_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'relationship-artifacts'
    AND public.is_relationship_member(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "rel_artifacts_delete" ON storage.objects;
CREATE POLICY "rel_artifacts_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'relationship-artifacts'
    AND public.is_relationship_member(((storage.foldername(name))[1])::uuid)
  );
