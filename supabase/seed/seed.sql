-- ============================================================================
-- seed.sql — dev seed data  (F4)
-- ----------------------------------------------------------------------------
-- Runs automatically after migrations on `supabase db reset` ([db.seed] in
-- config.toml → sql_paths = ["./seed.sql"]).
--
-- Seeds the smallest world the demo needs: TWO verified companies + ONE user
-- each, ready to connect. The connect → accept → relationship flow is performed
-- live in the demo, so NO relationship is seeded (see the optional block at the
-- bottom if you want pre-existing data while building).
--
-- Cast of two (mirrors the cultivator → pharmacy demo arc):
--   • Alice Green  · alice@greenleaf.test  · GreenLeaf Cultivation (cultivator)
--   • Bob Stone    · bob@stonepharm.test   · StonePharm (pharmacy)
--   Dev password for both: "password123"
--
-- HOW THE person ROW APPEARS: we INSERT into auth.users; the on_auth_user_created
-- trigger (migration 6) creates the matching public.person row, reading
-- first_name / last_name from raw_user_meta_data. So order matters:
--   1. auth.users  → trigger makes person (company_id NULL)
--   2. company
--   3. UPDATE person.company_id   4. company_type_assignment   5. verify
--
-- ⚠️ VERIFY ON FIRST APPLY: the exact auth.users / auth.identities column set is
--    GoTrue-version-specific. If `supabase db reset` errors on an auth insert,
--    diff these columns against your Supabase version and adjust. crypt()/
--    gen_salt() need pgcrypto (enabled in migration 5 — available by seed time).
-- ============================================================================

-- Fixed UUIDs so re-seeds are deterministic and FKs are easy to read.
--   Alice      = 11111111-1111-1111-1111-111111111111
--   Bob        = 22222222-2222-2222-2222-222222222222
--   GreenLeaf  = aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
--   StonePharm = bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb

-- ----------------------------------------------------------------------------
-- 1. Auth users  → each fires on_auth_user_created → creates a person row
-- ----------------------------------------------------------------------------
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES
  ('00000000-0000-0000-0000-000000000000',
   '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'alice@greenleaf.test',
   crypt('password123', gen_salt('bf')),
   NOW(),
   '{"provider":"email","providers":["email"]}',
   '{"first_name":"Alice","last_name":"Green"}',
   NOW(), NOW(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'bob@stonepharm.test',
   crypt('password123', gen_salt('bf')),
   NOW(),
   '{"provider":"email","providers":["email"]}',
   '{"first_name":"Bob","last_name":"Stone"}',
   NOW(), NOW(), '', '', '', '');

-- email/password identity (required for email login in recent Supabase)
INSERT INTO auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
) VALUES
  (gen_random_uuid(),
   '11111111-1111-1111-1111-111111111111',
   '11111111-1111-1111-1111-111111111111',
   '{"sub":"11111111-1111-1111-1111-111111111111","email":"alice@greenleaf.test"}',
   'email', NOW(), NOW(), NOW()),
  (gen_random_uuid(),
   '22222222-2222-2222-2222-222222222222',
   '22222222-2222-2222-2222-222222222222',
   '{"sub":"22222222-2222-2222-2222-222222222222","email":"bob@stonepharm.test"}',
   'email', NOW(), NOW(), NOW());

-- ----------------------------------------------------------------------------
-- 2. Companies  (verified up front; verified_by NULL = no HS reviewer seeded)
-- ----------------------------------------------------------------------------
INSERT INTO company (id, name, country, verification_status, verified_at, created_by) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'GreenLeaf Cultivation', 'DE',
   'verified', NOW(), '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'StonePharm', 'DE',
   'verified', NOW(), '22222222-2222-2222-2222-222222222222');

-- ----------------------------------------------------------------------------
-- 3. Attach each person to their company (company_id was NULL after signup)
-- ----------------------------------------------------------------------------
UPDATE person SET company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  WHERE id = '11111111-1111-1111-1111-111111111111';
UPDATE person SET company_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  WHERE id = '22222222-2222-2222-2222-222222222222';

-- ----------------------------------------------------------------------------
-- 4. Business categories (cultivator sells, pharmacy buys)
-- ----------------------------------------------------------------------------
INSERT INTO company_type_assignment (company_id, company_type_code, created_by) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cultivator',
   '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'pharmacy',
   '22222222-2222-2222-2222-222222222222');

-- ----------------------------------------------------------------------------
-- OPTIONAL — pre-seeded relationship. Left commented so the demo's
-- connect → accept → relationship step has work to do. Uncomment ONLY if you
-- want a ready-made relationship to build chat/deal against.
-- ----------------------------------------------------------------------------
-- INSERT INTO relationship (
--   company_a_id, company_b_id, initiated_by_company_id, status, created_by
-- ) VALUES (
--   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',   -- a < b (canonical order)
--   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
--   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
--   'active', '11111111-1111-1111-1111-111111111111'
-- );
