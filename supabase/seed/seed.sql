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
-- 4b. HS-team reviewer fixture + a pending company for the verification queue
--     (Wave-0 test scaffolding for Phase 3)
--
--   HS reviewer: hsteam@hello-sello.test · UUID 99999999-9999-9999-9999-999999999999
--   Pending company: PendingCo GmbH    · UUID cccccccc-cccc-cccc-cccc-cccccccccccc
--
--   The reviewer's person.company_id MUST stay NULL — they are cross-tenant staff,
--   not attached to any company (Pitfall 1 in Phase-3 RESEARCH: the cross-tenant
--   audit_insert RLS constraint holds only when the reviewer has no session company).
--   All inserts are idempotent (WHERE NOT EXISTS) so repeated `db reset` is safe.
-- ----------------------------------------------------------------------------

-- 4b-i) HS reviewer auth user (triggers on_auth_user_created → person row, company_id NULL)
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  '99999999-9999-9999-9999-999999999999',
  'authenticated', 'authenticated', 'hsteam@hello-sello.test',
  crypt('password123', gen_salt('bf')),
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{"first_name":"HS","last_name":"Reviewer"}',
  NOW(), NOW(), '', '', '', ''
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users WHERE id = '99999999-9999-9999-9999-999999999999'
);

-- 4b-ii) email identity for the HS reviewer (required for email login)
INSERT INTO auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  '99999999-9999-9999-9999-999999999999',
  '99999999-9999-9999-9999-999999999999',
  '{"sub":"99999999-9999-9999-9999-999999999999","email":"hsteam@hello-sello.test"}',
  'email', NOW(), NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM auth.identities
  WHERE user_id = '99999999-9999-9999-9999-999999999999' AND provider = 'email'
);

-- 4b-iii) hs_team_member row for the reviewer (role = 'reviewer')
-- The person row was created by the trigger above; reference it by UUID.
INSERT INTO hs_team_member (person_id, role)
SELECT '99999999-9999-9999-9999-999999999999', 'reviewer'
WHERE NOT EXISTS (
  SELECT 1 FROM hs_team_member
  WHERE person_id = '99999999-9999-9999-9999-999999999999' AND deleted_at IS NULL
);

-- 4b-iv) A pending company for the verification queue (oldest-first ordering D-08:
--        created_at earlier than the verified seed companies so it sorts first)
INSERT INTO company (id, name, country, verification_status, created_by, created_at, updated_at)
SELECT
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'PendingCo GmbH',
  'DE',
  'pending',
  '99999999-9999-9999-9999-999999999999',
  NOW() - INTERVAL '30 days',
  NOW() - INTERVAL '30 days'
WHERE NOT EXISTS (
  SELECT 1 FROM company WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
);

-- 4b-v) Company type for PendingCo (cultivator)
INSERT INTO company_type_assignment (company_id, company_type_code, created_by)
SELECT 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'cultivator', '99999999-9999-9999-9999-999999999999'
WHERE NOT EXISTS (
  SELECT 1 FROM company_type_assignment
  WHERE company_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    AND company_type_code = 'cultivator'
    AND deleted_at IS NULL
);

-- NOTE: the HS reviewer person row is intentionally NOT attached to any company.
-- No UPDATE person SET company_id = ... for id = '9999...'.
-- This is the correct state: an HS reviewer is cross-tenant, company_id stays NULL.

-- ----------------------------------------------------------------------------
-- 5. Demo world — three more companies/logins, two relationships with chat,
--    and two pending connect requests to GreenLeaf.
--    MOVED here on 2026-06-16 from migration 20260609180000_seed_demo_world.sql.
--    Reason: it ran as a migration (BEFORE this file) but looked up the
--    GreenLeaf/StonePharm accounts that this file creates above — so a fresh
--    reset died on a null company_a_id. Living here (after the base, after all
--    migrations) makes the lookups resolve. Every row is idempotent + tagged
--    metadata.seed='demo-2d'. Cleanup: delete ... where metadata->>'seed'='demo-2d'.
-- ----------------------------------------------------------------------------

-- 5a) Three more logins (clara/david/eva) → trigger makes each person row
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new)
select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  v.email, extensions.crypt('password123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('first_name', v.fn, 'last_name', v.ln), now(), now(), '', '', '', ''
from (values
  ('clara@rheinland.test','Clara','Vogt'),
  ('david@nordcanna.test','David','Berg'),
  ('eva@bavaria.test','Eva','Klein')
) as v(email, fn, ln)
where not exists (select 1 from auth.users u where u.email = v.email);

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
  'email', now(), now(), now()
from auth.users u
where u.email in ('clara@rheinland.test','david@nordcanna.test','eva@bavaria.test')
  and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');

-- 5b) Three more companies (idempotent by name)
insert into company (name, country, verification_status, metadata, created_at, updated_at)
select v.name, 'DE', 'verified', jsonb_build_object('seed','demo-2d'), now(), now()
from (values ('Rheinland Apotheke GmbH'),('NordCanna Distribution GmbH'),('Bavaria Medical Cannabis GmbH')) as v(name)
where not exists (select 1 from company c where c.name = v.name);

-- 5c) Link the 3 new persons to their company + tag
update public.person p set company_id = c.id, metadata = jsonb_build_object('seed','demo-2d')
from auth.users u, company c
where p.id = u.id and (
  (u.email='clara@rheinland.test' and c.name='Rheinland Apotheke GmbH') or
  (u.email='david@nordcanna.test' and c.name='NordCanna Distribution GmbH') or
  (u.email='eva@bavaria.test'     and c.name='Bavaria Medical Cannabis GmbH'));

-- 5d) GreenLeaf <-> StonePharm (rich: c2c + p2p + 5 msgs)
with ids as (select
   (select id from company where name='GreenLeaf Cultivation') gl,
   (select id from company where name='StonePharm') sp,
   (select id from auth.users where email='alice@greenleaf.test') alice,
   (select id from auth.users where email='bob@stonepharm.test') bob),
rel as (
  insert into relationship (company_a_id,company_b_id,initiated_by_company_id,status,created_by,metadata,created_at,updated_at)
  select least(gl,sp),greatest(gl,sp),sp,'active',alice,jsonb_build_object('seed','demo-2d'),now()-interval '5 days',now()-interval '5 days'
  from ids
  where not exists (select 1 from relationship r, ids i
    where r.metadata->>'seed'='demo-2d' and r.company_a_id=least(i.gl,i.sp) and r.company_b_id=greatest(i.gl,i.sp))
  returning id),
c2c as (insert into chat_thread (relationship_id,type,created_at) select rel.id,'c2c',now()-interval '5 days' from rel returning id),
c2cmsg as (insert into chat_message (thread_id,sender,sender_person_id,type,body,created_at)
  select c2c.id,'system',null,'connection_established','GreenLeaf Cultivation and StonePharm are now connected.',now()-interval '5 days' from c2c returning id),
p2p as (insert into chat_thread (relationship_id,type,person_a_id,person_b_id,created_at)
  select rel.id,'p2p',least(ids.alice,ids.bob),greatest(ids.alice,ids.bob),now()-interval '5 days' from rel,ids returning id)
insert into chat_message (thread_id,sender,sender_person_id,type,body,created_at)
select p2p.id,'person',case m.who when 'alice' then ids.alice else ids.bob end,'message',m.body,now()-(m.mins||' minutes')::interval
from p2p, ids, (values
  ('bob','Hi Alice - StonePharm here. We are looking for indica flower for Q3, around 5 kg per month. Do you have capacity?',5000),
  ('alice','Hi Bob - yes, we can cover 5 kg per month of indica. Current batch is GMP-certified, ~22% THC.',4900),
  ('bob','Great. What is your indicative price per gram at that volume?',4800),
  ('alice','At 5 kg per month on a 6-month commitment we can do EUR 3.80 per g, delivered, CoA each batch.',4700),
  ('bob','That works as a starting point. Can you send a short written offer we can take internally?',4600)
) as m(who,body,mins);

-- 5e) GreenLeaf <-> Rheinland (medium: c2c + p2p + 3 msgs)
with ids as (select
   (select id from company where name='GreenLeaf Cultivation') gl,
   (select id from company where name='Rheinland Apotheke GmbH') rh,
   (select id from auth.users where email='alice@greenleaf.test') alice,
   (select id from auth.users where email='clara@rheinland.test') clara),
rel as (
  insert into relationship (company_a_id,company_b_id,initiated_by_company_id,status,created_by,metadata,created_at,updated_at)
  select least(gl,rh),greatest(gl,rh),rh,'active',alice,jsonb_build_object('seed','demo-2d'),now()-interval '3 days',now()-interval '3 days'
  from ids
  where not exists (select 1 from relationship r, ids i
    where r.metadata->>'seed'='demo-2d' and r.company_a_id=least(i.gl,i.rh) and r.company_b_id=greatest(i.gl,i.rh))
  returning id),
c2c as (insert into chat_thread (relationship_id,type,created_at) select rel.id,'c2c',now()-interval '3 days' from rel returning id),
c2cmsg as (insert into chat_message (thread_id,sender,sender_person_id,type,body,created_at)
  select c2c.id,'system',null,'connection_established','GreenLeaf Cultivation and Rheinland Apotheke GmbH are now connected.',now()-interval '3 days' from c2c returning id),
p2p as (insert into chat_thread (relationship_id,type,person_a_id,person_b_id,created_at)
  select rel.id,'p2p',least(ids.alice,ids.clara),greatest(ids.alice,ids.clara),now()-interval '3 days' from rel,ids returning id)
insert into chat_message (thread_id,sender,sender_person_id,type,body,created_at)
select p2p.id,'person',case m.who when 'alice' then ids.alice else ids.clara end,'message',m.body,now()-(m.mins||' minutes')::interval
from p2p, ids, (values
  ('clara','Hello Alice, Rheinland Apotheke here. Do you carry CBD-dominant strains for chronic-pain patients?',2000),
  ('alice','Hi Clara - yes, two CBD-dominant cultivars in stock. I can share specs and current availability.',1900),
  ('clara','Perfect, please do. We are onboarding several new patients this month.',1800)
) as m(who,body,mins);

-- 5f) Pending requests to GreenLeaf (unconnected senders, for live accept testing)
insert into pending_inbox_item (type, sender_person_id, sender_company_id, receiver_company_id, note, status, metadata, created_at, updated_at)
select v.type,
  (select id from auth.users where email=v.sender_email),
  (select id from company where name=v.sender_co),
  (select id from company where name='GreenLeaf Cultivation'),
  v.note,'pending',jsonb_build_object('seed','demo-2d'),now()-interval '1 day',now()-interval '1 day'
from (values
  ('connect_message','david@nordcanna.test','NordCanna Distribution GmbH','We distribute medical cannabis across northern Germany and would like to connect about a recurring indica supply.'),
  ('connect','eva@bavaria.test','Bavaria Medical Cannabis GmbH', null::text)
) as v(type, sender_email, sender_co, note)
where not exists (select 1 from pending_inbox_item p
  where p.metadata->>'seed'='demo-2d' and p.sender_company_id = (select id from company where name=v.sender_co));

-- ----------------------------------------------------------------------------
-- 6. GreenLeaf catalogue — products + a published pricelist + priced items, so
--    the create-deal form's product picker (getOwnCatalog) has real, priced
--    rows when you sign in as Alice (the seller). MOVED here 2026-06-16 from
--    migration 20260611140000_3p5a_create_seed.sql (demo data belongs in
--    seed.sql, after GreenLeaf/aaaa exists). Idempotent.
-- ----------------------------------------------------------------------------

-- 6a) products on GreenLeaf (company aaaa)
insert into public.product (company_id, name, cultivar, supplier_product_code, local_code_pzn,
                     pack_size_grams, unit_code, thc_percent, cbd_percent, rrp_per_gram,
                     cultivator, country_of_origin, region)
select v.company_id, v.name, v.cultivar, v.code, v.pzn, v.pack, 'g', v.thc, v.cbd, v.rrp,
       v.cultivator, 'Canada', v.region
from (values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'Pedanios 31/1 COS-CA',  'Cosmic Cream', 'AUR-1A', '38364843', 1000, 31, 1, 9.00, 'Aurora Inc',    'Toronto'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'Pedanios 31/1 PND-CA',  'Pink Diesel',  'AUR-1B', '52839467', 1000, 31, 1, 8.50, 'Aurora Inc',    'Toronto'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'San Raf 29/1 PNK',      'Pink OG Kush', 'AUR-1C', '38374774', 1000, 22, 1, 5.00, 'Pure Sunfarms', 'Montreal'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'Pedanios 10/10 MBE-CA', 'Moon Berry',   'AUR-1D', '38383838',   10, 10, 10, 6.00, 'Aurora Inc',    'Toronto')
) as v(company_id, name, cultivar, code, pzn, pack, thc, cbd, rrp, cultivator, region)
where not exists (
  select 1 from public.product p
  where p.company_id = v.company_id and p.supplier_product_code = v.code and p.deleted_at is null
);

-- 6b) a published "Standard" pricelist for GreenLeaf (fixed id keeps re-seeds stable)
insert into public.pricelist (id, company_id, name, status_code, currency, published_at, created_by)
select '3fe179d5-c0e7-4eff-9726-f707c04572f9'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
       'Standard', 'published', 'EUR', now(), '11111111-1111-1111-1111-111111111111'
where not exists (select 1 from public.pricelist where id = '3fe179d5-c0e7-4eff-9726-f707c04572f9');

-- 6c) pricelist items (price per gram) → the picker shows live prices
insert into public.pricelist_item (pricelist_id, product_id, price_per_gram, currency)
select '3fe179d5-c0e7-4eff-9726-f707c04572f9'::uuid, p.id, v.price, 'EUR'
from (values ('AUR-1A', 8.00),('AUR-1B', 6.00),('AUR-1C', 4.00),('AUR-1D', 5.00)) as v(code, price)
join public.product p
  on p.company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
 and p.supplier_product_code = v.code and p.deleted_at is null
where not exists (
  select 1 from public.pricelist_item pi
  where pi.pricelist_id = '3fe179d5-c0e7-4eff-9726-f707c04572f9'::uuid and pi.product_id = p.id and pi.deleted_at is null
);
