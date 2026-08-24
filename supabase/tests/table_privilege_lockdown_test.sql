-- ============================================================================
-- table_privilege_lockdown_test.sql — T11
-- ----------------------------------------------------------------------------
-- Proves: deny-by-default for TABLES, the half session 77 never installed.
-- `20260817120000` did it for FUNCTIONS (an ALTER DEFAULT PRIVILEGES narrowing
-- plus the revoke_anon_execute_on_new_function event trigger). Nothing
-- equivalent existed for relations, so `pg_default_acl` kept granting
-- anon = arwdDxtm and authenticated = arwdDxtm on every new table.
--
-- WHY TRUNCATE IS THE HEADLINE: RLS DOES NOT APPLY TO TRUNCATE. The policy
-- expression that refuses a signed-out INSERT/UPDATE/DELETE does nothing here.
-- The append-only, hash-chained audit_log — the tamper-evidence spine — was
-- erasable by an unauthenticated role. Cell 5 reproduces that exploit.
--
-- REACHABILITY, STATED HONESTLY: PostgREST emits neither TRUNCATE nor DDL, so
-- neither was reachable from the app's public surface. This is a grant-level
-- hole one FK or one new client from mattering — and T09 already met it once
-- (`TRUNCATE company CASCADE` as anon failed only because the cascade reached
-- `relationship`, whose TRUNCATE T09 happened to revoke).
--
-- ENUMERATED BEFORE REVOKING (the ticket's fourth criterion, T09's method):
--   * NO RLS policy in schema `public` names `anon` — checked across all
--     policies; the only three that name anon/public live in `cron` and
--     `storage`, neither of which this migration touches. So anon's 89 table
--     grants are unreachable today and unused.
--   * `/c/[handle]`, the one public route that shows database content, goes
--     through the `get_public_profile` SECURITY DEFINER RPC and reads no table
--     as anon.
--   * `authenticated` keeps SELECT/INSERT/UPDATE/DELETE untouched — only
--     TRUNCATE and TRIGGER go, and PostgREST emits neither. Cell 4 guards this.
--
-- ⚠️ RED-FIRST: cells 1, 2, 3 and 5 FAIL until the migration ships. Measured
-- before writing this file: anon holds TRUNCATE on 89 tables, INSERT on 88,
-- SELECT on 85; authenticated holds TRUNCATE on 91 and TRIGGER on 92.
-- Cell 4 passes today and is the regression guard.
--
-- Run:  bash supabase/tests/run_table_privilege_lockdown_test.sh
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ============================================================================
-- Cell 1 — no existing public table leaves `anon` holding ANY privilege.
-- ============================================================================
DO $$
DECLARE n int; sample text;
BEGIN
  SELECT count(*), string_agg(DISTINCT table_name, ', ' ORDER BY table_name)
    INTO n, sample
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND grantee = 'anon';
  IF n <> 0 THEN
    RAISE EXCEPTION 'Cell 1: anon still holds % table privilege(s) in public. First few: %',
      n, left(sample, 120);
  END IF;
END $$;

-- ============================================================================
-- Cell 2 — `authenticated` holds no TRUNCATE and no TRIGGER anywhere in public.
-- Its read/write verbs are NOT touched; cell 4 proves that separately.
-- ============================================================================
DO $$
DECLARE n int; sample text;
BEGIN
  SELECT count(*), string_agg(DISTINCT table_name, ', ' ORDER BY table_name)
    INTO n, sample
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND grantee = 'authenticated'
     AND privilege_type IN ('TRUNCATE', 'TRIGGER');
  IF n <> 0 THEN
    RAISE EXCEPTION 'Cell 2: authenticated still holds TRUNCATE/TRIGGER on % table(s). First few: %',
      n, left(sample, 120);
  END IF;
END $$;

-- ============================================================================
-- Cell 3 [THE MECHANISM] — the check is that the default FIRES, not that a
-- migration once ran. A throwaway table is created here and its ACL read back.
-- This is the `ensure_rls_trigger_test.sql` shape, and it is the only cell that
-- would survive someone adding a table in a later migration and forgetting.
-- ============================================================================
CREATE TABLE public.t11_throwaway_guard (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
DO $$
DECLARE anon_privs text; auth_bad text;
BEGIN
  SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) INTO anon_privs
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 't11_throwaway_guard' AND grantee = 'anon';
  IF anon_privs IS NOT NULL THEN
    RAISE EXCEPTION 'Cell 3: a NEWLY CREATED table granted anon: % — deny-by-default is not firing', anon_privs;
  END IF;

  SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) INTO auth_bad
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 't11_throwaway_guard'
     AND grantee = 'authenticated' AND privilege_type IN ('TRUNCATE', 'TRIGGER');
  IF auth_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Cell 3: a NEWLY CREATED table granted authenticated: % — deny-by-default is not firing', auth_bad;
  END IF;
END $$;
DROP TABLE public.t11_throwaway_guard;

-- ============================================================================
-- Cell 4 [REGRESSION GUARD] — the app's own verbs survive. This is the cell
-- that fails if the sweep is written as a blanket REVOKE ALL from authenticated.
-- ============================================================================
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(v, ', ') INTO missing
    FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) v
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.role_table_grants
      WHERE table_schema='public' AND table_name='product'
        AND grantee='authenticated' AND privilege_type = v);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Cell 4: authenticated LOST % on public.product — the sweep was too wide', missing;
  END IF;
END $$;

-- ============================================================================
-- Cell 5 [THE PROVEN EXPLOIT] — anon truncating the audit log. Seeded with real
-- rows first, so a pass cannot come from an empty table. RLS is irrelevant here
-- by design, which is the entire point of the ticket.
-- ============================================================================
-- The suite supplies its own rows rather than trusting the seed: audit_log is
-- EMPTY on a fresh `db reset` (the ticket's "3 seeded rows" came from app
-- activity, not the seed), and a seed row is not a stable fixture until you
-- grep what writes it (L-033). Rolled back with the rest of the transaction.
INSERT INTO public.audit_log
  (company_id, actor_type, action, content_type, content_id, entry_hash)
SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'system', 'product.created',
       'product', gen_random_uuid(), decode('00','hex')
FROM generate_series(1, 3);

DO $$
DECLARE before_n int; after_n int;
BEGIN
  SELECT count(*) INTO before_n FROM public.audit_log;
  IF before_n < 3 THEN
    RAISE EXCEPTION 'Cell 5 precondition: expected the 3 fixture rows, found %', before_n;
  END IF;

  BEGIN
    SET LOCAL ROLE anon;
    EXECUTE 'TRUNCATE TABLE public.audit_log CASCADE';
    RESET ROLE;
    SELECT count(*) INTO after_n FROM public.audit_log;
    RAISE EXCEPTION 'Cell 5: anon TRUNCATED the audit log — % rows before, % after. RLS does not apply to TRUNCATE', before_n, after_n;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;  -- the expected outcome
  END;
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL TABLE_PRIVILEGE_LOCKDOWN TESTS PASSED'; END $$;

ROLLBACK;
