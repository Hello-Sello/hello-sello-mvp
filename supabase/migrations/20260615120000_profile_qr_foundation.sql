-- ============================================================================
-- Migration — profile_qr_foundation (DATA-02, F3 drift backfill)
-- ----------------------------------------------------------------------------
-- Commits the person profile columns + public_handle + the public `avatars`
-- bucket that were applied to the cloud DB via MCP in session-19 but never
-- written as a file. Reproduces on a clean LOCAL reset exactly what the cloud
-- DB already holds (the drift is repo-behind-cloud).
--
-- Read/written through the one src/modules/profile door (getMyProfile /
-- updateMyProfile / getPublicProfile). The public /c/[handle] page reads the
-- avatar via getPublicUrl (no auth) → the bucket is PUBLIC-read; writes are
-- own-folder (path is `${personId}/avatar`, so segment 1 = auth.uid()).
--
-- All new person columns are NULLABLE: the handle_new_user signup trigger
-- (20260607160000) inserts only id/first_name/last_name, so a NOT NULL column
-- with no default would break signup + the seed. No handle backfill here —
-- ensureHandle() assigns one on first profile save (a fresh DB has nothing to
-- backfill); the UNIQUE index is the collision source of truth.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. person profile columns (all nullable; links defaults '{}')
-- ----------------------------------------------------------------------------
ALTER TABLE public.person
  ADD COLUMN IF NOT EXISTS display_name  text,
  ADD COLUMN IF NOT EXISTS title         text,
  ADD COLUMN IF NOT EXISTS phone         text,
  ADD COLUMN IF NOT EXISTS language      text,
  ADD COLUMN IF NOT EXISTS links         jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS avatar_path   text,
  ADD COLUMN IF NOT EXISTS public_handle text;

-- ----------------------------------------------------------------------------
-- 2. public_handle uniqueness (collision source of truth; ensureHandle retries 23505)
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS person_public_handle_key
  ON public.person (public_handle);

-- ----------------------------------------------------------------------------
-- 3. public avatars bucket (business-card images; public-read by design)
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,  -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. avatars RLS: public read; own-folder write (path = `${auth.uid()}/avatar`)
-- ----------------------------------------------------------------------------
-- storage.objects already has RLS enabled by Supabase.
DROP POLICY IF EXISTS "avatars_public_select" ON storage.objects;
CREATE POLICY "avatars_public_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_insert" ON storage.objects;
CREATE POLICY "avatars_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_update" ON storage.objects;
CREATE POLICY "avatars_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_delete" ON storage.objects;
CREATE POLICY "avatars_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
