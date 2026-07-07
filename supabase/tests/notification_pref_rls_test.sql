-- ============================================================================
-- notification_pref_rls_test.sql — Phase 13 SET-04 own-row + honesty proof
-- ----------------------------------------------------------------------------
-- Proves the two invariants of the notification-preference stub
-- (20260706090100_notification_preference.sql), the same impersonated-SQL way
-- account_lifecycle_test.sql / cross_tenant_lockdown_test.sql do:
--   • (1) OWN-ROW RLS — a person reads ONLY their own notification_preference
--         rows (person_id = auth.uid()). Impersonating Nadia, she sees BOTH of
--         her rows and NONE of Bruno's; the reverse holds for Bruno. A USING(true)
--         or mis-scoped policy would leak the counterparty's row and fail here.
--   • (2) ALL-TRANSACTIONAL HONESTY — every seeded notification_category has
--         is_transactional = TRUE (nothing is genuinely toggleable in v1, so the
--         read-only section ships no dead toggle). A non-empty guard makes the
--         invariant non-vacuous (it can't pass on an empty table).
--
-- Mirrors the RBAC/lifecycle harness: ONE BEGIN…ROLLBACK transaction seeding
-- EPHEMERAL fixtures, impersonating each caller via request.jwt.claims + SET
-- LOCAL ROLE authenticated, asserting, and leaving NO trace. RESET ROLE between
-- perspectives so cross-row assertions read as the privileged role. Any failed
-- assertion RAISEs and aborts (psql -v ON_ERROR_STOP=1 → non-zero exit); success
-- prints the all-passed line at the very end.
--
-- Run:  bash supabase/tests/run_notification_pref_rls_test.sh
--       (after `supabase db reset` has applied 20260706090100_notification_preference.sql)
--
-- Fixtures (privileged role; rolled back). Obviously-test d… UUID space, unused
-- by the demo seed (1…/2…/a…/b…) and by account_lifecycle_test (a…/c…/e…), so the
-- probe never collides. auth.users inserts fire on_auth_user_created → a person
-- row (company_id NULL); the preference table needs no company, so they stay
-- company-less. These callers never log in via GoTrue — the test impersonates
-- them directly through request.jwt.claims.
--   Nadia (person A) = d1111111-…  (two preference rows)
--   Bruno (person B) = d2222222-…  (one preference row)
-- ============================================================================

BEGIN;

-- ── Fixture auth users → person rows (trigger). Minimal columns; the test never
-- logs them in. first_name/last_name come from raw_user_meta_data (person NOT
-- NULL). ────────────────────────────────────────────────────────────────────────
INSERT INTO auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'd1111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'notif-nadia@example.test', '{"first_name":"Nadia","last_name":"Notify"}', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000000', 'd2222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'notif-bruno@example.test', '{"first_name":"Bruno","last_name":"Notify"}', NOW(), NOW());

-- ── Preference rows (privileged role bypasses RLS to plant the fixtures). Nadia
-- gets TWO rows (verification + welcome over email) to prove "own row(s)" is
-- plural; Bruno gets ONE. The unique index is (person, category, channel), so
-- Nadia's two distinct categories never collide. ──────────────────────────────────
INSERT INTO public.notification_preference (person_id, category_code, channel_code, enabled) VALUES
  ('d1111111-1111-1111-1111-111111111111', 'verification', 'email', TRUE),
  ('d1111111-1111-1111-1111-111111111111', 'welcome',      'email', TRUE),
  ('d2222222-2222-2222-2222-222222222222', 'verification', 'email', TRUE);

-- ════════════════════════════════════════════════════════════════════════════
-- (1) OWN-ROW RLS — Nadia sees BOTH her rows and NONE of Bruno's.
-- ════════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claim.sub', 'd1111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"d1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  -- Nadia sees exactly her own two rows…
  IF (SELECT count(*) FROM public.notification_preference
        WHERE person_id = 'd1111111-1111-1111-1111-111111111111') <> 2 THEN
    RAISE EXCEPTION 'OWN-ROW FAIL: Nadia cannot read her own two preference rows';
  END IF;
  -- …none of Bruno's…
  IF (SELECT count(*) FROM public.notification_preference
        WHERE person_id = 'd2222222-2222-2222-2222-222222222222') <> 0 THEN
    RAISE EXCEPTION 'OWN-ROW LEAK: Nadia can read Bruno''s preference row(s) — RLS not scoped to auth.uid()';
  END IF;
  -- …and ONLY her own in total (a USING(true) policy would make this 3).
  IF (SELECT count(*) FROM public.notification_preference) <> 2 THEN
    RAISE EXCEPTION 'OWN-ROW LEAK: Nadia sees % preference rows total (expected only her own 2)',
      (SELECT count(*) FROM public.notification_preference);
  END IF;
END $$;
RESET ROLE;

-- ── Symmetry: Bruno sees ONLY his own single row (proves the scope is per-caller,
-- not a hardcoded id). ───────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claim.sub', 'd2222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"d2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.notification_preference) <> 1 THEN
    RAISE EXCEPTION 'OWN-ROW LEAK: Bruno sees % preference rows (expected only his own 1)',
      (SELECT count(*) FROM public.notification_preference);
  END IF;
  IF (SELECT count(*) FROM public.notification_preference
        WHERE person_id = 'd1111111-1111-1111-1111-111111111111') <> 0 THEN
    RAISE EXCEPTION 'OWN-ROW LEAK: Bruno can read Nadia''s preference row(s)';
  END IF;
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- (2) ALL-TRANSACTIONAL HONESTY — every seeded category is transactional, so v1
--     ships nothing genuinely toggleable. Read as the privileged role.
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  -- Non-empty guard: the four v1 categories seeded (so the check isn't vacuous).
  IF (SELECT count(*) FROM public.notification_category) < 4 THEN
    RAISE EXCEPTION 'HONESTY FAIL: expected >= 4 seeded notification_category rows, found %',
      (SELECT count(*) FROM public.notification_category);
  END IF;
  -- The invariant: NOT ONE category is opt-out-able in v1.
  IF EXISTS (SELECT 1 FROM public.notification_category WHERE is_transactional IS NOT TRUE) THEN
    RAISE EXCEPTION 'HONESTY FAIL: a notification_category is non-transactional — a dead toggle would ship in a read-only v1';
  END IF;
END $$;

ROLLBACK;
SELECT 'ALL NOTIFICATION PREFERENCE RLS TESTS PASSED' AS result;
