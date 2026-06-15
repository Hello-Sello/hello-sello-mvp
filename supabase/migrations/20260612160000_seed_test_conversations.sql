-- Seed: test companies + varied p2p conversations (data-only, no logins).
--
-- PURPOSE: give us a rich, repeatable test bed. Everything is anchored on the
-- EXISTING login Alice Green (Aurora, the seller) so you sign in ONCE as
-- alice@greenleaf.test and a full, varied inbox is waiting. The 7 conversations
-- deliberately span the kinds Sella must tell apart (firm / forming / chat /
-- haggle / logistics / vague), so they double as Sella's grading set.
--
-- SAFE + REPEATABLE: every row uses a `5eed…` id and a `{"seed":"muskan-test"}`
-- metadata tag. The DELETEs below run first, so re-applying this file RESETS the
-- whole set cleanly (no duplicates). No existing data is touched.
--
-- TO WIPE COMPLETELY: run just the DELETE block below.
--
-- id scheme:  company 5eedc…  person/user 5eede…  relationship 5eed4…  thread 5eed7…
-- anchors:    Aurora company = aaaaaaaa-…  ·  Alice person = 11111111-…
--
-- NOTE: public.person.id is a FK to auth.users.id, and an on-insert trigger
-- (handle_new_user) auto-creates the person row from a new user. So each buyer
-- needs a bare auth.users row first — created WITHOUT a password, so it can
-- never log in (true "data-only"). It exists only to be the chat's sender.

------------------------------------------------------------------------------
-- 0. CLEANUP (makes this file idempotent / a one-click reload)
------------------------------------------------------------------------------
delete from public.sella_detection      where thread_id::text  like '5eed7%';
delete from public.chat_message          where thread_id::text  like '5eed7%';
delete from public.chat_thread           where id::text         like '5eed7%';
delete from public.relationship          where id::text         like '5eed4%';
delete from public.company_type_assignment where company_id::text like '5eedc%';
delete from public.person                where id::text         like '5eede%';
delete from auth.users                   where id::text         like '5eede%';
delete from public.company               where id::text         like '5eedc%';

------------------------------------------------------------------------------
-- 1. BUYER COMPANIES (+ their category tag). Aurora is the seller they talk to.
------------------------------------------------------------------------------
insert into public.company (id, name, country, tagline, description, metadata) values
  ('5eedc000-0000-0000-0000-000000000001','Rheinmedica Apotheke','DE','Pharmacy-grade medical cannabis, Rhineland.','Cologne pharmacy group dispensing medical cannabis across NRW.','{"seed":"muskan-test"}'),
  ('5eedc000-0000-0000-0000-000000000002','Iberia MedPharma S.L.','ES','Importing medical cannabis to Iberia.','Madrid importer supplying licensed Spanish pharmacies.','{"seed":"muskan-test"}'),
  ('5eedc000-0000-0000-0000-000000000003','Lowlands Health B.V.','NL','Dutch medical cannabis wholesale.','Rotterdam wholesaler serving Benelux clinics and pharmacies.','{"seed":"muskan-test"}'),
  ('5eedc000-0000-0000-0000-000000000004','Helvetia Pharma AG','CH','Swiss precision in medical cannabis.','Zurich pharmacy group handling cantonal medical supply.','{"seed":"muskan-test"}'),
  ('5eedc000-0000-0000-0000-000000000005','Alpencanna Vertrieb GmbH','AT','Alpine medical cannabis distribution.','Vienna wholesaler operating across the DACH region.','{"seed":"muskan-test"}'),
  ('5eedc000-0000-0000-0000-000000000006','Lusitania Health Lda','PT','Medical cannabis for Portugal.','Lisbon importer and distributor, Infarmed-licensed.','{"seed":"muskan-test"}'),
  ('5eedc000-0000-0000-0000-000000000007','NordMed Apotheke','DE','Northern Germany''s medical pharmacy.','Hamburg pharmacy specialising in cannabinoid therapies.','{"seed":"muskan-test"}');

insert into public.company_type_assignment (company_id, company_type_code) values
  ('5eedc000-0000-0000-0000-000000000001','pharmacy'),
  ('5eedc000-0000-0000-0000-000000000002','importer'),
  ('5eedc000-0000-0000-0000-000000000003','wholesaler'),
  ('5eedc000-0000-0000-0000-000000000004','pharmacy'),
  ('5eedc000-0000-0000-0000-000000000005','wholesaler'),
  ('5eedc000-0000-0000-0000-000000000006','importer'),
  ('5eedc000-0000-0000-0000-000000000007','pharmacy');

------------------------------------------------------------------------------
-- 2a. BARE auth.users for each buyer (NO password = cannot log in). The
--     handle_new_user trigger reads first/last name from raw_user_meta_data
--     and auto-creates the matching public.person row.
------------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('5eede000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','petra@rheinmedica.test','{"first_name":"Petra","last_name":"Stein","seed":"muskan-test"}','2026-06-01 00:00:00+00','2026-06-01 00:00:00+00'),
  ('5eede000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','diego@iberia-medpharma.test','{"first_name":"Diego","last_name":"Marín","seed":"muskan-test"}','2026-06-01 00:00:00+00','2026-06-01 00:00:00+00'),
  ('5eede000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sanne@lowlands-health.test','{"first_name":"Sanne","last_name":"Visser","seed":"muskan-test"}','2026-06-01 00:00:00+00','2026-06-01 00:00:00+00'),
  ('5eede000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','luca@helvetia-pharma.test','{"first_name":"Luca","last_name":"Brunner","seed":"muskan-test"}','2026-06-01 00:00:00+00','2026-06-01 00:00:00+00'),
  ('5eede000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','markus@alpencanna.test','{"first_name":"Markus","last_name":"Huber","seed":"muskan-test"}','2026-06-01 00:00:00+00','2026-06-01 00:00:00+00'),
  ('5eede000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ines@lusitania-health.test','{"first_name":"Inês","last_name":"Costa","seed":"muskan-test"}','2026-06-01 00:00:00+00','2026-06-01 00:00:00+00'),
  ('5eede000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000000','authenticated','authenticated','jonas@nordmed.test','{"first_name":"Jonas","last_name":"Fischer","seed":"muskan-test"}','2026-06-01 00:00:00+00','2026-06-01 00:00:00+00');

------------------------------------------------------------------------------
-- 2b. FILL IN each person (trigger already made id + names; upsert the rest)
------------------------------------------------------------------------------
insert into public.person (id, first_name, last_name, display_name, title, company_id, metadata) values
  ('5eede000-0000-0000-0000-000000000001','Petra','Stein','Petra Stein','Head of Procurement','5eedc000-0000-0000-0000-000000000001','{"seed":"muskan-test"}'),
  ('5eede000-0000-0000-0000-000000000002','Diego','Marín','Diego Marín','Purchasing Lead','5eedc000-0000-0000-0000-000000000002','{"seed":"muskan-test"}'),
  ('5eede000-0000-0000-0000-000000000003','Sanne','Visser','Sanne Visser','Buyer','5eedc000-0000-0000-0000-000000000003','{"seed":"muskan-test"}'),
  ('5eede000-0000-0000-0000-000000000004','Luca','Brunner','Luca Brunner','Procurement Manager','5eedc000-0000-0000-0000-000000000004','{"seed":"muskan-test"}'),
  ('5eede000-0000-0000-0000-000000000005','Markus','Huber','Markus Huber','Head Buyer','5eedc000-0000-0000-0000-000000000005','{"seed":"muskan-test"}'),
  ('5eede000-0000-0000-0000-000000000006','Inês','Costa','Inês Costa','Sourcing Manager','5eedc000-0000-0000-0000-000000000006','{"seed":"muskan-test"}'),
  ('5eede000-0000-0000-0000-000000000007','Jonas','Fischer','Jonas Fischer','Dispensing Pharmacist','5eedc000-0000-0000-0000-000000000007','{"seed":"muskan-test"}')
on conflict (id) do update set
  first_name  = excluded.first_name,
  last_name   = excluded.last_name,
  display_name= excluded.display_name,
  title       = excluded.title,
  company_id  = excluded.company_id,
  metadata    = excluded.metadata;

------------------------------------------------------------------------------
-- 3. RELATIONSHIP between each buyer and Aurora (buyer initiated, active)
------------------------------------------------------------------------------
insert into public.relationship (id, company_a_id, company_b_id, initiated_by_company_id, status, metadata) values
  ('5eed4000-0000-0000-0000-000000000001','5eedc000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','5eedc000-0000-0000-0000-000000000001','active','{"seed":"muskan-test"}'),
  ('5eed4000-0000-0000-0000-000000000002','5eedc000-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','5eedc000-0000-0000-0000-000000000002','active','{"seed":"muskan-test"}'),
  ('5eed4000-0000-0000-0000-000000000003','5eedc000-0000-0000-0000-000000000003','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','5eedc000-0000-0000-0000-000000000003','active','{"seed":"muskan-test"}'),
  ('5eed4000-0000-0000-0000-000000000004','5eedc000-0000-0000-0000-000000000004','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','5eedc000-0000-0000-0000-000000000004','active','{"seed":"muskan-test"}'),
  ('5eed4000-0000-0000-0000-000000000005','5eedc000-0000-0000-0000-000000000005','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','5eedc000-0000-0000-0000-000000000005','active','{"seed":"muskan-test"}'),
  ('5eed4000-0000-0000-0000-000000000006','5eedc000-0000-0000-0000-000000000006','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','5eedc000-0000-0000-0000-000000000006','active','{"seed":"muskan-test"}'),
  ('5eed4000-0000-0000-0000-000000000007','5eedc000-0000-0000-0000-000000000007','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','5eedc000-0000-0000-0000-000000000007','active','{"seed":"muskan-test"}');

------------------------------------------------------------------------------
-- 4. p2p THREAD per relationship (person_a = Alice / seller, person_b = buyer)
------------------------------------------------------------------------------
insert into public.chat_thread (id, relationship_id, type, person_a_id, person_b_id, created_at) values
  ('5eed7000-0000-0000-0000-000000000001','5eed4000-0000-0000-0000-000000000001','p2p','11111111-1111-1111-1111-111111111111','5eede000-0000-0000-0000-000000000001','2026-06-12 13:00:00+00'),
  ('5eed7000-0000-0000-0000-000000000002','5eed4000-0000-0000-0000-000000000002','p2p','11111111-1111-1111-1111-111111111111','5eede000-0000-0000-0000-000000000002','2026-06-12 09:30:00+00'),
  ('5eed7000-0000-0000-0000-000000000003','5eed4000-0000-0000-0000-000000000003','p2p','11111111-1111-1111-1111-111111111111','5eede000-0000-0000-0000-000000000003','2026-06-11 09:00:00+00'),
  ('5eed7000-0000-0000-0000-000000000004','5eed4000-0000-0000-0000-000000000004','p2p','11111111-1111-1111-1111-111111111111','5eede000-0000-0000-0000-000000000004','2026-06-12 10:30:00+00'),
  ('5eed7000-0000-0000-0000-000000000005','5eed4000-0000-0000-0000-000000000005','p2p','11111111-1111-1111-1111-111111111111','5eede000-0000-0000-0000-000000000005','2026-06-11 14:00:00+00'),
  ('5eed7000-0000-0000-0000-000000000006','5eed4000-0000-0000-0000-000000000006','p2p','11111111-1111-1111-1111-111111111111','5eede000-0000-0000-0000-000000000006','2026-06-12 11:30:00+00'),
  ('5eed7000-0000-0000-0000-000000000007','5eed4000-0000-0000-0000-000000000007','p2p','11111111-1111-1111-1111-111111111111','5eede000-0000-0000-0000-000000000007','2026-06-12 08:00:00+00');

------------------------------------------------------------------------------
-- 5. THE CONVERSATIONS. sender='person', type='message' → trips the live Sella
--    detector on each. Alice = 11111111… ; the buyer = the thread's person_b.
--    The "expect" note on each thread is the right answer for grading Sella.
------------------------------------------------------------------------------

-- THREAD 1 — Rheinmedica — CLEAR / FIRM DEAL → expect: firm, high confidence
insert into public.chat_message (thread_id, sender, sender_person_id, type, body, created_at, metadata) values
  ('5eed7000-0000-0000-0000-000000000001','person','5eede000-0000-0000-0000-000000000001','message','Hi Alice, Rheinmedica here. We need 10 kg of your indica flower for Q3.','2026-06-12 13:00:00+00','{"seed":"muskan-test"}'),
  ('5eed7000-0000-0000-0000-000000000001','person','11111111-1111-1111-1111-111111111111','message','Hi Petra — happy to help. We can supply 10 kg of our Aurora Indica 22 over Q3.','2026-06-12 13:02:00+00','{"seed":"muskan-test"}'),
  ('5eed7000-0000-0000-0000-000000000001','person','5eede000-0000-0000-0000-000000000001','message','Perfect. What is your price per gram at that volume?','2026-06-12 13:04:00+00','{"seed":"muskan-test"}'),
  ('5eed7000-0000-0000-0000-000000000001','person','11111111-1111-1111-1111-111111111111','message','At 10 kg we can do EUR 3.50 per gram, delivered, EU-GMP certified.','2026-06-12 13:06:00+00','{"seed":"muskan-test"}'),
  ('5eed7000-0000-0000-0000-000000000001','person','5eede000-0000-0000-0000-000000000001','message','Agreed — EUR 3.50/g for 10 kg, delivery across Q3. Let us lock it in.','2026-06-12 13:08:00+00','{"seed":"muskan-test"}'),
  ('5eed7000-0000-0000-0000-000000000001','person','11111111-1111-1111-1111-111111111111','message','Great, we have a deal. I will prepare the paperwork.','2026-06-12 13:10:00+00','{"seed":"muskan-test"}');

-- THREAD 2 — Iberia MedPharma — FORMING DEAL → expect: forming, med
insert into public.chat_message (thread_id, sender, sender_person_id, type, body, created_at, metadata) values
  ('5eed7000-0000-0000-0000-000000000002','person','5eede000-0000-0000-0000-000000000002','message','Hola Alice, Iberia MedPharma. We are exploring sativa flower for the Spanish market.','2026-06-12 09:30:00+00','{"seed":"muskan-test"}'),
  ('5eed7000-0000-0000-0000-000000000002','person','11111111-1111-1111-1111-111111111111','message','Hi Diego — we have Aurora Sativa 18. What volumes are you thinking?','2026-06-12 09:33:00+00','{"seed":"muskan-test"}'),
  ('5eed7000-0000-0000-0000-000000000002','person','5eede000-0000-0000-0000-000000000002','message','Maybe 3 to 5 kg per quarter if the pricing works. What range are we talking?','2026-06-12 09:36:00+00','{"seed":"muskan-test"}'),
  ('5eed7000-0000-0000-0000-000000000002','person','11111111-1111-1111-1111-111111111111','message','Around EUR 4.10 per gram at 5 kg, a little higher at 3 kg.','2026-06-12 09:39:00+00','{"seed":"muskan-test"}'),
  ('5eed7000-0000-0000-0000-000000000002','person','5eede000-0000-0000-0000-000000000002','message','Noted. Let me check with the team and come back to you.','2026-06-12 09:42:00+00','{"seed":"muskan-test"}');

-- THREAD 3 — Lowlands Health — JUST CHATTING → expect: no_deal
insert into public.chat_message (thread_id, sender, sender_person_id, type, body, created_at, metadata) values
  ('5eed7000-0000-0000-0000-000000000003','person','5eede000-0000-0000-0000-000000000003','message','Hi Alice! Great to connect here on Hello Sello.','2026-06-11 09:00:00+00','{"seed":"muskan-test"}'),
  ('5eed7000-0000-0000-0000-000000000003','person','11111111-1111-1111-1111-111111111111','message','Likewise Sanne — welcome! How is business in the Netherlands?','2026-06-11 09:05:00+00','{"seed":"muskan-test"}'),
  ('5eed7000-0000-0000-0000-000000000003','person','5eede000-0000-0000-0000-000000000003','message','Busy! Expanding the medical line this year. Hope to work together sometime.','2026-06-11 09:10:00+00','{"seed":"muskan-test"}'),
  ('5eed7000-0000-0000-0000-000000000003','person','11111111-1111-1111-1111-111111111111','message','Would love that. Let me know whenever you want to talk product.','2026-06-11 09:14:00+00','{"seed":"muskan-test"}');

-- THREAD 4 — Helvetia Pharma — HAGGLING, NO AGREEMENT → expect: edge (no firm deal; price gap unresolved)
insert into public.chat_message (thread_id, sender, sender_person_id, type, body, created_at, metadata) values
  ('5eed7000-0000-0000-0000-000000000004','person','5eede000-0000-0000-0000-000000000004','message','Alice, we are interested in 8 kg indica but EUR 3.50 is too high for us.','2026-06-12 10:30:00+00','{"seed":"muskan-test"}'),
  ('5eed7000-0000-0000-0000-000000000004','person','11111111-1111-1111-1111-111111111111','message','I hear you Luca. The best I can do at 8 kg is EUR 3.40 per gram.','2026-06-12 10:33:00+00','{"seed":"muskan-test"}'),
  ('5eed7000-0000-0000-0000-000000000004','person','5eede000-0000-0000-0000-000000000004','message','We were hoping for EUR 3.00. At 3.40 it does not work for our margins.','2026-06-12 10:36:00+00','{"seed":"muskan-test"}'),
  ('5eed7000-0000-0000-0000-000000000004','person','11111111-1111-1111-1111-111111111111','message','EUR 3.00 is not viable at GMP quality, sorry. Maybe at 15 kg I could approach 3.20.','2026-06-12 10:39:00+00','{"seed":"muskan-test"}'),
  ('5eed7000-0000-0000-0000-000000000004','person','5eede000-0000-0000-0000-000000000004','message','Let me think about whether we can raise the volume.','2026-06-12 10:42:00+00','{"seed":"muskan-test"}');

-- THREAD 5 — Alpencanna — LOGISTICS ONLY → expect: no_deal (operational, no commercial terms)
insert into public.chat_message (thread_id, sender, sender_person_id, type, body, created_at, metadata) values
  ('5eed7000-0000-0000-0000-000000000005','person','5eede000-0000-0000-0000-000000000005','message','Hi Alice, following up on the shipment paperwork for the last order.','2026-06-11 14:00:00+00','{"seed":"muskan-test"}'),
  ('5eed7000-0000-0000-0000-000000000005','person','11111111-1111-1111-1111-111111111111','message','Hi Markus — sending the CMR and CoA now. Customs cleared yesterday.','2026-06-11 14:04:00+00','{"seed":"muskan-test"}'),
  ('5eed7000-0000-0000-0000-000000000005','person','5eede000-0000-0000-0000-000000000005','message','Got them, thanks. Pallet arrived intact. Will the next batch ship same carrier?','2026-06-11 14:08:00+00','{"seed":"muskan-test"}'),
  ('5eed7000-0000-0000-0000-000000000005','person','11111111-1111-1111-1111-111111111111','message','Yes, same logistics partner. I will share tracking once it dispatches.','2026-06-11 14:12:00+00','{"seed":"muskan-test"}');

-- THREAD 6 — Lusitania Health — FORMING → FIRM in one thread → expect: firm (latest state wins)
insert into public.chat_message (thread_id, sender, sender_person_id, type, body, created_at, metadata) values
  ('5eed7000-0000-0000-0000-000000000006','person','5eede000-0000-0000-0000-000000000006','message','Alice, Lusitania Health. We are interested in CBD-dominant flower for Portugal.','2026-06-12 11:30:00+00','{"seed":"muskan-test"}'),
  ('5eed7000-0000-0000-0000-000000000006','person','11111111-1111-1111-1111-111111111111','message','Hi Inês — Aurora CBD 12 fits well. What volumes?','2026-06-12 11:33:00+00','{"seed":"muskan-test"}'),
  ('5eed7000-0000-0000-0000-000000000006','person','5eede000-0000-0000-0000-000000000006','message','Start with 4 kg, possibly more later. What is the price?','2026-06-12 11:36:00+00','{"seed":"muskan-test"}'),
  ('5eed7000-0000-0000-0000-000000000006','person','11111111-1111-1111-1111-111111111111','message','EUR 3.90 per gram at 4 kg.','2026-06-12 11:39:00+00','{"seed":"muskan-test"}'),
  ('5eed7000-0000-0000-0000-000000000006','person','5eede000-0000-0000-0000-000000000006','message','Approved on our side — we will take 4 kg at EUR 3.90/g, shipping next month.','2026-06-12 11:50:00+00','{"seed":"muskan-test"}'),
  ('5eed7000-0000-0000-0000-000000000006','person','11111111-1111-1111-1111-111111111111','message','Excellent, confirmed. I am drafting the order now.','2026-06-12 11:52:00+00','{"seed":"muskan-test"}');

-- THREAD 7 — NordMed — VAGUE INTEREST → expect: no_deal (no product/qty/price committed)
insert into public.chat_message (thread_id, sender, sender_person_id, type, body, created_at, metadata) values
  ('5eed7000-0000-0000-0000-000000000007','person','5eede000-0000-0000-0000-000000000007','message','Hi Alice, we might need some flower next quarter, not sure yet.','2026-06-12 08:00:00+00','{"seed":"muskan-test"}'),
  ('5eed7000-0000-0000-0000-000000000007','person','11111111-1111-1111-1111-111111111111','message','No problem Jonas — happy to keep the conversation open. Any particular strain type?','2026-06-12 08:04:00+00','{"seed":"muskan-test"}'),
  ('5eed7000-0000-0000-0000-000000000007','person','5eede000-0000-0000-0000-000000000007','message','Probably indica, but it depends on our prescriptions. I will know more in a few weeks.','2026-06-12 08:08:00+00','{"seed":"muskan-test"}'),
  ('5eed7000-0000-0000-0000-000000000007','person','11111111-1111-1111-1111-111111111111','message','Sounds good, ping me when you have a clearer picture.','2026-06-12 08:12:00+00','{"seed":"muskan-test"}');
