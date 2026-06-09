-- ============================================================================
-- Seed — 2d demo world (Connect realtime / go-real)
-- ----------------------------------------------------------------------------
-- Applied live via Supabase MCP on 2026-06-09 (execute_sql). This file is the
-- idempotent, team-shared record + the fresh-DB setup script. Safe to re-run:
-- every insert is guarded, so on the current DB it is a no-op.
--
-- Creates a clearly-dummy test world for building/testing Connect (and, later,
-- the deal card + relationship page). Real customers (e.g. Canadian Craft /
-- Marcel) are NEVER referenced.
--
--   5 companies, one login each (password123):
--     GreenLeaf Cultivation   alice@greenleaf.test  (exists — seller/home)
--     StonePharm              bob@stonepharm.test   (exists — buyer)
--     Rheinland Apotheke GmbH clara@rheinland.test  (new — buyer)
--     NordCanna Distribution  david@nordcanna.test  (new — buyer, unconnected)
--     Bavaria Medical Cannabis eva@bavaria.test     (new — buyer, unconnected)
--
--   Connected: GreenLeaf<->StonePharm (C2C + P2P + 5 msgs),
--              GreenLeaf<->Rheinland  (C2C + P2P + 3 msgs).
--   Pending to GreenLeaf: NordCanna (connect_message), Bavaria (connect).
--
-- Every seeded row is tagged metadata.seed='demo-2d'.
-- CLEANUP (anytime, safe — never hits real rows):
--   delete from relationship where metadata->>'seed'='demo-2d';
--   delete from pending_inbox_item where metadata->>'seed'='demo-2d';
--   delete from auth.users where email in
--     ('clara@rheinland.test','david@nordcanna.test','eva@bavaria.test');
--
-- NOTE: relationship + chat_thread(p2p) enforce a canonical-order CHECK
--       (company_a_id < company_b_id / person_a_id < person_b_id) — use
--       least()/greatest(), never assume "company_a = the home company".
-- ============================================================================

-- 1) Logins — auth.users (the on_auth_user_created trigger makes public.person)
--    + auth.identities (email row; login fails silently without it).
--    Token cols set to '' (some GoTrue versions choke on NULL).
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

-- 2) Companies (idempotent by name)
insert into company (name, country, verification_status, metadata, created_at, updated_at)
select v.name, 'DE', 'verified', jsonb_build_object('seed','demo-2d'), now(), now()
from (values ('Rheinland Apotheke GmbH'),('NordCanna Distribution GmbH'),('Bavaria Medical Cannabis GmbH')) as v(name)
where not exists (select 1 from company c where c.name = v.name);

-- 3) Link the 3 new persons to their company + tag
update public.person p set company_id = c.id, metadata = jsonb_build_object('seed','demo-2d')
from auth.users u, company c
where p.id = u.id and (
  (u.email='clara@rheinland.test' and c.name='Rheinland Apotheke GmbH') or
  (u.email='david@nordcanna.test' and c.name='NordCanna Distribution GmbH') or
  (u.email='eva@bavaria.test'     and c.name='Bavaria Medical Cannabis GmbH'));

-- 4) GreenLeaf <-> StonePharm (rich: c2c + p2p + 5 msgs)
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

-- 5) GreenLeaf <-> Rheinland (medium: c2c + p2p + 3 msgs)
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

-- 6) Pending requests to GreenLeaf (unconnected senders, for live accept testing)
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
