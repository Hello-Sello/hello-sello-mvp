-- ============================================================================
-- profile_foundation_test.sql — DATA-01/02 existence assertions (Phase 1, Wave 0)
-- ----------------------------------------------------------------------------
-- Proves the clean-rebuild foundation objects exist after `supabase db reset`.
-- Mirrors supabase/tests/rls_isolation_test.sql: psql-runnable, RAISE EXCEPTION
-- on any miss, prints a success line at the end.
--
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/profile_foundation_test.sql
--
-- RED BY DESIGN until plans 01-02 + 01-03 land: today none of these objects are
-- in the committed chain, so the FIRST assertion RAISEs and psql exits non-zero.
-- That failing state is the proof the test checks real behavior; it turns GREEN
-- only after the foundation migration (DATA-02) and the RPC migration (DATA-01).
--
-- Asserts:
--   DATA-01  public.get_public_profile(text) exists (the anon-facing RPC)
--   DATA-02  person += display_name/title/phone/language/links/avatar_path/public_handle
--            (all nullable; text except links jsonb)
--   DATA-02  UNIQUE index on person(public_handle)
--   DATA-02  public storage bucket 'avatars'
--   DATA-02  own-folder write policy on storage.objects:
--            (storage.foldername(name))[1] = auth.uid()::text
-- ============================================================================

DO $$
DECLARE
  col text;
  txt_cols text[] := ARRAY['display_name','title','phone','language','avatar_path','public_handle'];
BEGIN
  -- ── DATA-01: the curated anon RPC exists, arg (p_handle) text ──────────────
  -- (pg_get_functiondef('public.get_public_profile(text)'::regprocedure) is the
  --  authoritative existence probe; to_regprocedure returns NULL when absent.)
  IF to_regprocedure('public.get_public_profile(text)') IS NULL THEN
    RAISE EXCEPTION 'FAIL DATA-01: function public.get_public_profile(text) does not exist';
  END IF;

  -- ── DATA-02: the new person profile columns (all nullable) ────────────────
  -- nullable because the signup trigger (20260607160000) inserts only id/first/last.
  FOREACH col IN ARRAY (txt_cols || ARRAY['links']) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='person' AND column_name=col
    ) THEN
      RAISE EXCEPTION 'FAIL DATA-02: person.% column missing', col;
    END IF;
    IF (SELECT is_nullable FROM information_schema.columns
        WHERE table_schema='public' AND table_name='person' AND column_name=col) <> 'YES' THEN
      RAISE EXCEPTION 'FAIL DATA-02: person.% must be nullable', col;
    END IF;
  END LOOP;

  -- text columns are text; links is jsonb
  FOREACH col IN ARRAY txt_cols LOOP
    IF (SELECT data_type FROM information_schema.columns
        WHERE table_schema='public' AND table_name='person' AND column_name=col) <> 'text' THEN
      RAISE EXCEPTION 'FAIL DATA-02: person.% expected data_type text', col;
    END IF;
  END LOOP;
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='person' AND column_name='links') <> 'jsonb' THEN
    RAISE EXCEPTION 'FAIL DATA-02: person.links expected data_type jsonb';
  END IF;

  -- ── DATA-02: UNIQUE index on person(public_handle) ────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='person'
      AND indexdef ILIKE '%unique%' AND indexdef ILIKE '%public_handle%'
  ) THEN
    RAISE EXCEPTION 'FAIL DATA-02: no UNIQUE index on person(public_handle)';
  END IF;

  -- ── DATA-02: public avatars bucket ────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id='avatars' AND public = true
  ) THEN
    RAISE EXCEPTION 'FAIL DATA-02: storage bucket ''avatars'' missing or not public';
  END IF;

  -- ── DATA-02: own-folder write policy (cross-user avatar overwrite guard) ───
  -- predicate must scope writes to the caller's folder:
  --   (storage.foldername(name))[1] = auth.uid()::text
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND cmd <> 'SELECT'                                    -- a write-side policy
      AND coalesce(qual,'') || coalesce(with_check,'') ILIKE '%avatars%'
      AND coalesce(qual,'') || coalesce(with_check,'') ILIKE '%foldername%'
      AND coalesce(qual,'') || coalesce(with_check,'') ILIKE '%auth.uid%'
  ) THEN
    RAISE EXCEPTION 'FAIL DATA-02: avatars own-folder write policy (auth.uid()::text) missing';
  END IF;
END $$;

SELECT 'ALL PROFILE FOUNDATION ASSERTIONS PASSED' AS result;
