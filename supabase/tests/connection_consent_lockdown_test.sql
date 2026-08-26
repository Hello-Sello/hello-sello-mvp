-- ============================================================================
-- connection_consent_lockdown_test.sql — T09: connections & verification must
-- be server-granted, not self-declared
-- ----------------------------------------------------------------------------
-- Proves BOTH self-write holes filed at T06's G4 are closed, and that every
-- legitimate path they must not break still works:
--
--   Hole 1 (§0b/§0c, PLAN-T09) — `relationship` is directly writable by
--     `authenticated`; nothing requires the counterparty's consent. Worse, the
--     "consent evidence" (`pending_inbox_item`) is itself forgeable on both its
--     UPDATE side (§0b: rewrite `sender_company_id` after a self-addressed
--     insert) and its INSERT side (§0c: `sender_person_id` is unconstrained,
--     so a request can be attributed to a colleague who never asked — proven
--     against the shipped `accept_person_connection` RPC).
--   Hole 2 — `company.verification_status` is directly writable by any member
--     of that company (self-verify), which combined with Hole 1 lets an
--     unverified attacker unlock a connected seller's hidden catalogue.
--
-- 12 blocks (PLAN-T09 rev 3 §5 + the T09 review's blocking S7 gaps), run in
-- order:
--   1  direct INSERT on relationship                       → 42501 (grant gone)
--   2  direct UPDATE + DELETE on relationship               → 42501
--   3  forge any of the 6 omitted identity columns on an own-received item
--      (UPDATE) → 42501 (§0b)
--   3b INSERT an inbox item with a spoofed sender_person_id  → denied by inbox_insert (§0c)
--   3c the §0c accept_person_connection repro, re-run        → now fails at the INSERT
--   4  accept_connection_request for an item addressed elsewhere → RAISEs, writes nothing
--   4b the other four RPC guards (wrong type / deleted / not pending / sent by
--      the caller's own company) → each RAISEs, none writes a relationship row
--   5  accept_connection_request on a legitimate pending item → mints one row
--      correctly, INCLUDING inbox_item_id (acceptInbox's idempotency probe)
--   6  same call twice + an already-connected pair            → adopts, not re-mints
--   7  direct UPDATE of company.verification_status           → 42501
--   8  resubmit_company_verification on a rejected company     → pending
--   9  resubmit_company_verification on a verified company     → RAISEs, unchanged
--   10 approve_company / reject_company as HS team              → still work
--   11 anon calls either new function                           → 42501, by CALLING
--
-- Mirrors person_company_lockdown_test.sql: one BEGIN…ROLLBACK transaction,
-- ephemeral fixtures created as the privileged connecting role (postgres —
-- bypasses RLS + grants entirely), impersonation via SET LOCAL ROLE +
-- request.jwt.claim(s), RESET ROLE between perspectives, RAISE EXCEPTION on
-- any failed assertion, and a final success notice.
--
-- Run:  bash supabase/tests/run_connection_consent_lockdown_test.sh
--
-- ⚠️  RED-FIRST: blocks 1, 3, 3b, 3c and 7 are EXPECTED TO FAIL against the
-- pre-fix schema — the direct writes/forgeries in each currently SUCCEED
-- (that success IS the hole each proves). Blocks 4, 4b, 5, 6, 8, 9 and 11 will
-- fail with 42883 (undefined_function) until the migration creates
-- accept_connection_request / resubmit_company_verification — that is the
-- ordinary "function doesn't exist yet" red, not a hole-proof, per L-023's
-- "wrong red" caution. Do NOT "fix" any of this green here — RED is the
-- correct state until 20260823090000_connection_consent_and_verification_
-- lockdown.sql ships.
--
-- ⚠️  Two blocks fall outside both lists above, deliberately, and it's worth
-- saying so rather than leaving a silent gap in the RED story:
--   • Block 2 (relationship UPDATE/DELETE) is the SAME grant-revoke statement
--     as block 1 (migration part 1 revokes INSERT, UPDATE, DELETE, TRUNCATE
--     together) — it fails pre-fix too, but PLAN-T09 §5's own RED-proof list
--     names only 1/3/3b/3c/7 as needing a SEPARATE single-block proof run,
--     since 2 would only re-prove the identical class block 1 already proves.
--   • Block 10 (approve_company / reject_company) is a REGRESSION guard, not
--     a hole-proof: both RPCs already exist pre-fix (shipped in 03-02/03-03)
--     and this migration does not touch them, so block 10 is expected to
--     PASS in both the pre-fix and post-fix runs.
--
-- ⚠️  As PLAN-T09 §5's own B2 note records: this file can only ever prove
-- block 1 in one pre-fix run — block 1's INSERT succeeds pre-fix, RAISEs,
-- and ON_ERROR_STOP=1 aborts the whole script before block 2 even starts.
-- The individual pre-fix proofs for 1, 3, 3b, 3c and 7 are five SEPARATE
-- single-block runs, pasted into REVIEW.md — that is the orchestrator's job
-- (L-023: test-writer has no Bash), not built by this file.
--
-- Fixtures (privileged role; rolled back). UUID prefix 6… — confirmed unused
-- anywhere under supabase/ or e2e/ (the demo seeds use a…/b…/c…/d…/1…/2…/3…/
-- 9…; existing suites already claim e…, f… and d… for their own ephemeral
-- fixtures — grepped before choosing, per this ticket's instruction).
--   Companies:
--     GA  Sender Co       = 60000001-…  (pending)  — the legitimate requester
--     GB  Receiver Co     = 60000002-…  (pending)  — the legitimate accepter
--     GC  Bystander Co    = 60000003-…  (pending)  — wrong-company caller
--     GD  Attacker Co     = 60000004-…  (pending)  — the self-write attacker
--     Resubmit Co         = 60000005-…  (rejected) — block 8
--     SelfVerify Co       = 60000006-…  (verified) — block 9
--     ApproveTarget Co    = 60000007-…  (pending)  — block 10
--     RejectTarget Co     = 60000008-…  (pending)  — block 10
--   People (each UPDATE'd onto their company by the privileged role, matching
--   accept_person_connection_test.sql's fixture pattern):
--     P1 @ GA  = 61111111-…   P2 @ GB = 62222222-…   P3 @ GC = 63333333-…
--     P4 @ GD  = 64444444-…   P5 @ Resubmit = 65555555-…
--     P6 @ SelfVerify = 66666666-…
--   HS reviewer: the SEEDED 99999999-…-9999 (hsteam@hello-sello.test), same
--   fixture admin_verification_test.sql relies on — already an
--   hs_team_member row, no need to mint a fresh one.
--   Inbox items:
--     Item1 (legit, GA→GB, type='connect')          = 6a000001-…
--     Item5 (legit, GA→GB, type='pricelist_request') = 6a000005-… (block 6's
--       second-pending-item-same-pair fixture)
--     Block 4b's four, each addressed to GB and wrong in exactly one way:
--       Item2 = 6a000002-…  GA→GB, type='deal_card'      (wrong type)
--       Item3 = 6a000003-…  GA→GB, 'connect', deleted_at set (soft-deleted)
--       Item4 = 6a000004-…  GA→GB, 'connect', status='accepted' (terminal)
--       Item6 = 6a000006-…  GB→GB, 'connect'             (self-sent)
--   Pre-existing relationship (GC↔GD, minted directly as postgres, block 2's
--   target row) = 6b000002-…
-- ============================================================================

BEGIN;

-- ── Fixtures: companies ──────────────────────────────────────────────────────
INSERT INTO public.company (id, name, country, verification_status) VALUES
  ('60000001-0000-0000-0000-000000000000', 'CCL Sender Co',        'DE', 'pending'),
  ('60000002-0000-0000-0000-000000000000', 'CCL Receiver Co',      'DE', 'pending'),
  ('60000003-0000-0000-0000-000000000000', 'CCL Bystander Co',     'DE', 'pending'),
  ('60000004-0000-0000-0000-000000000000', 'CCL Attacker Co',      'DE', 'pending'),
  ('60000005-0000-0000-0000-000000000000', 'CCL Resubmit Co',      'DE', 'rejected'),
  ('60000006-0000-0000-0000-000000000000', 'CCL SelfVerify Co',    'DE', 'verified'),
  ('60000007-0000-0000-0000-000000000000', 'CCL ApproveTarget Co', 'DE', 'pending'),
  ('60000008-0000-0000-0000-000000000000', 'CCL RejectTarget Co',  'DE', 'pending');

-- ── Fixtures: people (auth.users insert fires handle_new_user, which creates
-- the person row company-less; company_id is then set by the privileged role,
-- exactly as person_company_lockdown_test.sql / accept_person_connection_test.sql do) ──
INSERT INTO auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at) VALUES
  ('00000000-0000-0000-0000-000000000000', '61111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'ccl-p1@example.test',
   '{"first_name":"P1","last_name":"Sender","full_name":"P1 Sender"}', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000000', '62222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'ccl-p2@example.test',
   '{"first_name":"P2","last_name":"Receiver","full_name":"P2 Receiver"}', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000000', '63333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'ccl-p3@example.test',
   '{"first_name":"P3","last_name":"Bystander","full_name":"P3 Bystander"}', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000000', '64444444-4444-4444-4444-444444444444',
   'authenticated', 'authenticated', 'ccl-p4@example.test',
   '{"first_name":"P4","last_name":"Attacker","full_name":"P4 Attacker"}', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000000', '65555555-5555-5555-5555-555555555555',
   'authenticated', 'authenticated', 'ccl-p5@example.test',
   '{"first_name":"P5","last_name":"Resubmit","full_name":"P5 Resubmit"}', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000000', '66666666-6666-6666-6666-666666666666',
   'authenticated', 'authenticated', 'ccl-p6@example.test',
   '{"first_name":"P6","last_name":"SelfVerify","full_name":"P6 SelfVerify"}', NOW(), NOW());

UPDATE public.person SET company_id = '60000001-0000-0000-0000-000000000000' WHERE id = '61111111-1111-1111-1111-111111111111';
UPDATE public.person SET company_id = '60000002-0000-0000-0000-000000000000' WHERE id = '62222222-2222-2222-2222-222222222222';
UPDATE public.person SET company_id = '60000003-0000-0000-0000-000000000000' WHERE id = '63333333-3333-3333-3333-333333333333';
UPDATE public.person SET company_id = '60000004-0000-0000-0000-000000000000' WHERE id = '64444444-4444-4444-4444-444444444444';
UPDATE public.person SET company_id = '60000005-0000-0000-0000-000000000000' WHERE id = '65555555-5555-5555-5555-555555555555';
UPDATE public.person SET company_id = '60000006-0000-0000-0000-000000000000' WHERE id = '66666666-6666-6666-6666-666666666666';

-- ── Fixtures: two legitimate pending inbox items, GA → GB (privileged insert,
-- bypasses RLS — these represent requests that were sent through the real,
-- unforged path) ──
INSERT INTO public.pending_inbox_item (id, type, sender_person_id, sender_company_id, receiver_company_id, note) VALUES
  ('6a000001-0000-0000-0000-000000000000', 'connect',
   '61111111-1111-1111-1111-111111111111', '60000001-0000-0000-0000-000000000000',
   '60000002-0000-0000-0000-000000000000', 'Legit request GA -> GB'),
  ('6a000005-0000-0000-0000-000000000000', 'pricelist_request',
   '61111111-1111-1111-1111-111111111111', '60000001-0000-0000-0000-000000000000',
   '60000002-0000-0000-0000-000000000000', 'A second, independent pending item, same pair');

-- ── Fixtures: block 4b's four guard items. Each is legitimate in every respect
-- EXCEPT the one thing its guard exists to catch, so a firing guard can only be
-- attributed to that one property. All are addressed to GB (P2 is block 4b's
-- caller), so the "addressed elsewhere" guard block 4 already covers can never
-- be what fires here. ──
INSERT INTO public.pending_inbox_item
  (id, type, sender_person_id, sender_company_id, receiver_company_id, status, deleted_at, note) VALUES
  -- wrong type: a deal_card ticket is claimed by claim_deal_ticket, never here
  ('6a000002-0000-0000-0000-000000000000', 'deal_card',
   '61111111-1111-1111-1111-111111111111', '60000001-0000-0000-0000-000000000000',
   '60000002-0000-0000-0000-000000000000', 'pending', NULL, 'wrong type'),
  -- soft-deleted
  ('6a000003-0000-0000-0000-000000000000', 'connect',
   '61111111-1111-1111-1111-111111111111', '60000001-0000-0000-0000-000000000000',
   '60000002-0000-0000-0000-000000000000', 'pending', NOW(), 'soft-deleted'),
  -- terminal status
  ('6a000004-0000-0000-0000-000000000000', 'connect',
   '61111111-1111-1111-1111-111111111111', '60000001-0000-0000-0000-000000000000',
   '60000002-0000-0000-0000-000000000000', 'accepted', NULL, 'already accepted'),
  -- self-sent: GB asking GB, so "consent" would be the caller's own
  ('6a000006-0000-0000-0000-000000000000', 'connect',
   '62222222-2222-2222-2222-222222222222', '60000002-0000-0000-0000-000000000000',
   '60000002-0000-0000-0000-000000000000', 'pending', NULL, 'self-sent');

-- ── Fixtures: a pre-existing ACTIVE relationship between GC and GD, minted
-- directly as the privileged role — block 2's target row. Deliberately a
-- DIFFERENT pair from GA/GB, so denying this UPDATE/DELETE can never be
-- confused with (or leak into) blocks 4-6's GA/GB mint-vs-adopt proof. ──
INSERT INTO public.relationship (id, company_a_id, company_b_id, initiated_by_company_id, status, created_by, updated_by)
VALUES ('6b000002-0000-0000-0000-000000000000',
        LEAST('60000003-0000-0000-0000-000000000000'::uuid, '60000004-0000-0000-0000-000000000000'::uuid),
        GREATEST('60000003-0000-0000-0000-000000000000'::uuid, '60000004-0000-0000-0000-000000000000'::uuid),
        '60000003-0000-0000-0000-000000000000', 'active', NULL, NULL);


-- ════════════════════════════════════════════════════════════════════════════
-- (1) direct INSERT on relationship as authenticated → 42501 (grant gone, not
-- merely policy-gated). P1 @ GA inserts a GA/GB pair that rel_all's WITH CHECK
-- would happily allow (current_company_id() = GA, one side of the pair) — the
-- ONLY thing that can stop it post-fix is the table-level grant being gone. ──
-- ════════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claim.sub', '61111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"61111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_denied boolean := false;
  v_a uuid := LEAST('60000001-0000-0000-0000-000000000000'::uuid, '60000002-0000-0000-0000-000000000000'::uuid);
  v_b uuid := GREATEST('60000001-0000-0000-0000-000000000000'::uuid, '60000002-0000-0000-0000-000000000000'::uuid);
BEGIN
  BEGIN
    INSERT INTO public.relationship (company_a_id, company_b_id, initiated_by_company_id, status)
    VALUES (v_a, v_b, '60000001-0000-0000-0000-000000000000', 'active');
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'BLOCK 1 FAIL: authenticated could INSERT directly into relationship (self-declared connection)';
  END IF;
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- (2) direct UPDATE and DELETE on relationship → 42501. P3 @ GC, one side of
-- the pre-existing GC/GD row — rel_all's USING clause would allow both, so
-- again only the grant being gone can stop them. ──
-- ════════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claim.sub', '63333333-3333-3333-3333-333333333333', true);
SELECT set_config('request.jwt.claims', '{"sub":"63333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_update_denied boolean := false;
  v_delete_denied boolean := false;
BEGIN
  BEGIN
    UPDATE public.relationship SET status = 'suspended'
     WHERE id = '6b000002-0000-0000-0000-000000000000';
  EXCEPTION WHEN insufficient_privilege THEN
    v_update_denied := true;
  END;
  IF NOT v_update_denied THEN
    RAISE EXCEPTION 'BLOCK 2 FAIL: authenticated could UPDATE relationship directly';
  END IF;

  BEGIN
    DELETE FROM public.relationship WHERE id = '6b000002-0000-0000-0000-000000000000';
  EXCEPTION WHEN insufficient_privilege THEN
    v_delete_denied := true;
  END;
  IF NOT v_delete_denied THEN
    RAISE EXCEPTION 'BLOCK 2 FAIL: authenticated could DELETE a relationship row directly';
  END IF;
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- (3) forge an omitted identity column on an own-received inbox item (UPDATE)
-- → 42501. The exact §0b attack, inverted to a probe: P4 @ GD legitimately
-- inserts a SELF-addressed item (sender = GD, receiver = GD — legal both pre-
-- and post-fix), then attempts to UPDATE sender_company_id onto GB, forging "GB
-- asked to connect to GD". Only a column-level grant revoke on the identity
-- columns can stop this — inbox_update's WITH CHECK never re-validates it.
--
-- The migration's re-GRANT omits SIX columns, and a typo re-granting any one of
-- them ships silently, so all six are probed, not just the one the §0b repro
-- used. The two nullable ones are SET to NULL: a column privilege is required
-- for a column's PRESENCE in the SET list whatever the value, and NULL is the
-- only value either can legally hold on a 'connect' row (their CHECKs pin them
-- to deal_card / connect_person items), so the probe stays a pure grant probe
-- and can never be answered by a constraint instead. ──
-- ════════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claim.sub', '64444444-4444-4444-4444-444444444444', true);
SELECT set_config('request.jwt.claims', '{"sub":"64444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_item_id uuid := '6c000003-0000-0000-0000-000000000000';
  v_denied boolean := false;
  v_set    text;
BEGIN
  -- The legitimate self-addressed insert MUST succeed (it satisfies every
  -- INSERT-side check, old and new alike) — a failure here is a fixture bug,
  -- not the hole this block exists to prove.
  INSERT INTO public.pending_inbox_item (id, type, sender_person_id, sender_company_id, receiver_company_id, note)
  VALUES (v_item_id, 'connect',
          '64444444-4444-4444-4444-444444444444', '60000004-0000-0000-0000-000000000000',
          '60000004-0000-0000-0000-000000000000', 'self-addressed (legal)');

  BEGIN
    UPDATE public.pending_inbox_item
       SET sender_company_id = '60000002-0000-0000-0000-000000000000'  -- forge: claim GB asked
     WHERE id = v_item_id;
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'BLOCK 3 FAIL: authenticated could rewrite sender_company_id on an inbox item it owns (§0b forge)';
  END IF;

  -- The other five omitted columns, same probe.
  FOREACH v_set IN ARRAY ARRAY[
    'type = ''connect_message''',
    'sender_person_id = ''61111111-1111-1111-1111-111111111111''::uuid',
    'receiver_company_id = ''60000002-0000-0000-0000-000000000000''::uuid',
    'receiver_person_id = NULL',
    'deal_card_id = NULL'
  ] LOOP
    v_denied := false;
    BEGIN
      EXECUTE format('UPDATE public.pending_inbox_item SET %s WHERE id = %L', v_set, v_item_id);
    EXCEPTION WHEN insufficient_privilege THEN
      v_denied := true;
    END;
    IF NOT v_denied THEN
      RAISE EXCEPTION 'BLOCK 3 FAIL: authenticated could write an omitted identity column on an inbox item it owns — "%" succeeded (§0b forge)', v_set;
    END IF;
  END LOOP;
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- (3b) INSERT an inbox item whose sender_person_id is NOT the caller → denied
-- by inbox_insert (§0c — the person-graph forge, general case). P4 @ GD
-- inserts a company-addressed request with sender_company_id = GD (his own —
-- satisfies the OLD check) but sender_person_id = P1, who never asked. ──
-- ════════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claim.sub', '64444444-4444-4444-4444-444444444444', true);
SELECT set_config('request.jwt.claims', '{"sub":"64444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_denied boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.pending_inbox_item (type, sender_person_id, sender_company_id, receiver_company_id, note)
    VALUES ('connect',
            '61111111-1111-1111-1111-111111111111',  -- P1 — spoofed, never asked
            '60000004-0000-0000-0000-000000000000',  -- caller's own company (old check passes)
            '60000002-0000-0000-0000-000000000000', 'forged attribution');
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'BLOCK 3b FAIL: authenticated could INSERT an inbox item attributed to a colleague who never asked (§0c)';
  END IF;
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- (3c) accept_person_connection can no longer be reached from a forged item —
-- the EXACT §0c repro (attacker inserts a connect_person request self-
-- addressed, attributed to a victim who never asked), re-run: it now fails at
-- the INSERT, so the shipped accept_person_connection RPC is never reachable
-- with a forged item, and no person_connection edge is ever created. ──
-- ════════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claim.sub', '64444444-4444-4444-4444-444444444444', true);
SELECT set_config('request.jwt.claims', '{"sub":"64444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_denied boolean := false;
  v_edges  integer;
BEGIN
  BEGIN
    INSERT INTO public.pending_inbox_item (type, sender_person_id, sender_company_id, receiver_person_id, note)
    VALUES ('connect_person',
            '61111111-1111-1111-1111-111111111111',  -- P1 — the victim, never asked
            '60000004-0000-0000-0000-000000000000',  -- attacker's own company
            '64444444-4444-4444-4444-444444444444',  -- addressed to himself (legal)
            '§0c repro');
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'BLOCK 3c FAIL: the §0c forged connect_person request was inserted — accept_person_connection is still reachable via a forged item';
  END IF;

  -- No edge was ever created between the attacker and his victim — proof the
  -- attack chain never reaches accept_person_connection at all.
  SELECT count(*) INTO v_edges FROM public.person_connection
   WHERE (person_a_id = '61111111-1111-1111-1111-111111111111'
          AND person_b_id = '64444444-4444-4444-4444-444444444444')
      OR (person_a_id = '64444444-4444-4444-4444-444444444444'
          AND person_b_id = '61111111-1111-1111-1111-111111111111');
  IF v_edges <> 0 THEN
    RAISE EXCEPTION 'BLOCK 3c FAIL: a non-consensual person_connection edge exists (% rows) despite the INSERT being denied', v_edges;
  END IF;
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- (4) accept_connection_request for an item NOT addressed to the caller's
-- company → RAISEs, and writes nothing. P3 @ GC calls it on Item1, which is
-- addressed to GB. ──
-- ════════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claim.sub', '63333333-3333-3333-3333-333333333333', true);
SELECT set_config('request.jwt.claims', '{"sub":"63333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_before integer;
  v_after  integer;
  v_raised boolean := false;
  v_a uuid := LEAST('60000001-0000-0000-0000-000000000000'::uuid, '60000002-0000-0000-0000-000000000000'::uuid);
  v_b uuid := GREATEST('60000001-0000-0000-0000-000000000000'::uuid, '60000002-0000-0000-0000-000000000000'::uuid);
BEGIN
  SELECT count(*) INTO v_before FROM public.relationship
   WHERE company_a_id = v_a AND company_b_id = v_b AND deleted_at IS NULL;

  BEGIN
    PERFORM public.accept_connection_request('6a000001-0000-0000-0000-000000000000');
  EXCEPTION WHEN raise_exception THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'BLOCK 4 FAIL: a non-addressed caller (GC) accepted a request meant for GB';
  END IF;

  SELECT count(*) INTO v_after FROM public.relationship
   WHERE company_a_id = v_a AND company_b_id = v_b AND deleted_at IS NULL;
  IF v_after <> v_before THEN
    RAISE EXCEPTION 'BLOCK 4 FAIL: the rejected accept still wrote a relationship row (% before, % after)', v_before, v_after;
  END IF;
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- (4b) the RPC's other four guards — wrong type, soft-deleted, not pending, and
-- sent by the caller's OWN company — each RAISEs and writes no relationship
-- row. P2 @ GB is the caller and every fixture is addressed to GB, so block 4's
-- "addressed elsewhere" guard can never be what fires instead.
--
-- Runs BEFORE block 5 deliberately: once GA/GB are connected, a guard that
-- failed to fire would ADOPT that live row and write nothing, so the
-- writes-nothing half of this proof would pass against a broken guard. Before
-- block 5 there is no GA/GB row, so a missed guard MUST mint one.
--
-- The total relationship count is the witness rather than a per-pair count, so
-- a write to any pair at all is caught.
--
-- `check_violation` is caught SEPARATELY and reported as its own failure, never
-- folded into "denied": if the self-sent guard were removed the mint would
-- become GB/GB and die on the relationship_canonical_order CHECK, and "a schema
-- CHECK happened to catch it" is not the same result as "the RPC refused it".
-- Nothing else is caught — an unexpected error class must still surface raw. ──
-- ════════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claim.sub', '62222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"62222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_before integer;
  v_after  integer;
  v_raised boolean;
  v_id     uuid;
  v_label  text;
  i        integer;
  v_cases  text[][] := ARRAY[
    ['6a000002-0000-0000-0000-000000000000', 'deal_card-type request (claimed by claim_deal_ticket, never here)'],
    ['6a000003-0000-0000-0000-000000000000', 'soft-deleted request'],
    ['6a000004-0000-0000-0000-000000000000', 'request already in a terminal status (accepted)'],
    ['6a000006-0000-0000-0000-000000000000', 'request sent by the caller''s OWN company (self-consent)']
  ];
BEGIN
  SELECT count(*) INTO v_before FROM public.relationship;

  FOR i IN 1 .. array_length(v_cases, 1) LOOP
    v_id    := v_cases[i][1]::uuid;
    v_label := v_cases[i][2];

    v_raised := false;
    BEGIN
      PERFORM public.accept_connection_request(v_id);
    EXCEPTION
      WHEN raise_exception THEN
        v_raised := true;
      WHEN check_violation THEN
        RAISE EXCEPTION 'BLOCK 4b FAIL: a % was not refused by the RPC — it reached the INSERT and was stopped only by a schema CHECK (%)', v_label, SQLERRM;
    END;
    IF NOT v_raised THEN
      RAISE EXCEPTION 'BLOCK 4b FAIL: accept_connection_request accepted a % — that guard did not fire', v_label;
    END IF;

    SELECT count(*) INTO v_after FROM public.relationship;
    IF v_after <> v_before THEN
      RAISE EXCEPTION 'BLOCK 4b FAIL: the refused accept (%) still wrote a relationship row (% before, % after)', v_label, v_before, v_after;
    END IF;
  END LOOP;
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- (5) accept_connection_request on a legitimate pending item → mints one row:
-- canonical order, initiated_by = sender (GA), inbox_item_id = the accepted
-- item, created_by = updated_by = the ACCEPTING person (P2), neither NULL
-- (B3, round 2). P2 @ GB accepts Item1. ──
-- ════════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claim.sub', '62222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"62222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_rel_id uuid;
  v_a uuid := LEAST('60000001-0000-0000-0000-000000000000'::uuid, '60000002-0000-0000-0000-000000000000'::uuid);
  v_b uuid := GREATEST('60000001-0000-0000-0000-000000000000'::uuid, '60000002-0000-0000-0000-000000000000'::uuid);
  v_row public.relationship%ROWTYPE;
BEGIN
  SELECT relationship_id INTO v_rel_id
    FROM public.accept_connection_request('6a000001-0000-0000-0000-000000000000');
  IF v_rel_id IS NULL THEN
    RAISE EXCEPTION 'BLOCK 5 FAIL: accept_connection_request returned NULL on a legitimate accept';
  END IF;

  SELECT * INTO v_row FROM public.relationship WHERE id = v_rel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BLOCK 5 FAIL: the returned id does not match any relationship row';
  END IF;
  IF v_row.company_a_id <> v_a OR v_row.company_b_id <> v_b THEN
    RAISE EXCEPTION 'BLOCK 5 FAIL: canonical order violated (a=%, b=%)', v_row.company_a_id, v_row.company_b_id;
  END IF;
  IF v_row.initiated_by_company_id <> '60000001-0000-0000-0000-000000000000' THEN
    RAISE EXCEPTION 'BLOCK 5 FAIL: initiated_by_company_id must be the REQUESTER (GA), got %', v_row.initiated_by_company_id;
  END IF;
  IF v_row.status <> 'active' THEN
    RAISE EXCEPTION 'BLOCK 5 FAIL: status must be active, got %', v_row.status;
  END IF;
  -- Load-bearing, not decorative: acceptInbox's idempotency probe
  -- (messaging/supabase/store.ts) looks a relationship up BY this column, so a
  -- mint that leaves it NULL makes every re-accept miss and fall through to a
  -- second rollout.
  IF v_row.inbox_item_id IS DISTINCT FROM '6a000001-0000-0000-0000-000000000000'::uuid THEN
    RAISE EXCEPTION 'BLOCK 5 FAIL: inbox_item_id must be the accepted item 6a000001-…, got % — acceptInbox''s idempotency probe reads this column', v_row.inbox_item_id;
  END IF;
  IF v_row.created_by IS NULL OR v_row.updated_by IS NULL THEN
    RAISE EXCEPTION 'BLOCK 5 FAIL: created_by/updated_by must not be NULL (created_by=%, updated_by=%)', v_row.created_by, v_row.updated_by;
  END IF;
  IF v_row.created_by <> '62222222-2222-2222-2222-222222222222'
     OR v_row.updated_by <> '62222222-2222-2222-2222-222222222222' THEN
    RAISE EXCEPTION 'BLOCK 5 FAIL: created_by/updated_by must be the ACCEPTING person, got created_by=%, updated_by=%', v_row.created_by, v_row.updated_by;
  END IF;
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- (6) the same call twice, and on an already-connected pair, ADOPTS — exactly
-- one active row per pair. Also: uq_relationship_pair_active must exist — it,
-- not FOR UPDATE, is what makes the race safe (B4, round 2). P2 @ GB re-accepts
-- Item1, then accepts Item5 (a second, independent pending item, same pair). ──
-- ════════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claim.sub', '62222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"62222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_first  uuid;
  v_second uuid;
  v_third  uuid;
  v_count  integer;
  v_a uuid := LEAST('60000001-0000-0000-0000-000000000000'::uuid, '60000002-0000-0000-0000-000000000000'::uuid);
  v_b uuid := GREATEST('60000001-0000-0000-0000-000000000000'::uuid, '60000002-0000-0000-0000-000000000000'::uuid);
BEGIN
  -- The winning id from block 5 — re-derive rather than assume block ordering
  -- leaked a variable (each block is its own DO scope).
  SELECT id INTO v_first FROM public.relationship
   WHERE company_a_id = v_a AND company_b_id = v_b AND deleted_at IS NULL;
  IF v_first IS NULL THEN
    RAISE EXCEPTION 'BLOCK 6 FAIL: no relationship exists for GA/GB — block 5 must run first';
  END IF;

  -- Re-accepting the SAME item must return the same id, not mint a second row.
  SELECT relationship_id INTO v_second
    FROM public.accept_connection_request('6a000001-0000-0000-0000-000000000000');
  IF v_second <> v_first THEN
    RAISE EXCEPTION 'BLOCK 6 FAIL: re-accepting the same item returned a different relationship id (% vs %)', v_second, v_first;
  END IF;

  -- Accepting a DIFFERENT pending item for the SAME pair must ADOPT the
  -- existing relationship, not mint a second one.
  SELECT relationship_id INTO v_third
    FROM public.accept_connection_request('6a000005-0000-0000-0000-000000000000');
  IF v_third <> v_first THEN
    RAISE EXCEPTION 'BLOCK 6 FAIL: accepting a second pending item for an already-connected pair minted a NEW relationship (% vs %)', v_third, v_first;
  END IF;

  SELECT count(*) INTO v_count FROM public.relationship
   WHERE company_a_id = v_a AND company_b_id = v_b AND deleted_at IS NULL;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'BLOCK 6 FAIL: expected exactly 1 active relationship for GA/GB, found %', v_count;
  END IF;
END $$;
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'relationship'
       AND indexname = 'uq_relationship_pair_active'
  ) THEN
    RAISE EXCEPTION 'BLOCK 6 FAIL: uq_relationship_pair_active is missing — the single-pair guarantee has no enforcement, FOR UPDATE alone does not provide it (B4)';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- (7) direct UPDATE of company.verification_status as a member → 42501. P1 @
-- GA (own company, satisfies company_update's USING/WITH CHECK) attempts to
-- self-verify. ──
-- ════════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claim.sub', '61111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"61111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_denied boolean := false;
BEGIN
  BEGIN
    UPDATE public.company SET verification_status = 'verified'
     WHERE id = '60000001-0000-0000-0000-000000000000';
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'BLOCK 7 FAIL: a member could self-verify their own company via direct UPDATE';
  END IF;
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- (8) resubmit_company_verification on a REJECTED company → pending. P5 @
-- Resubmit Co (verification_status='rejected'). ──
-- ════════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claim.sub', '65555555-5555-5555-5555-555555555555', true);
SELECT set_config('request.jwt.claims', '{"sub":"65555555-5555-5555-5555-555555555555","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_status text;
BEGIN
  PERFORM public.resubmit_company_verification();
  SELECT verification_status INTO v_status FROM public.company
   WHERE id = '60000005-0000-0000-0000-000000000000';
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'BLOCK 8 FAIL: resubmit on a rejected company left status=%, expected pending', v_status;
  END IF;
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- (9) resubmit_company_verification on a VERIFIED company → RAISEs; status
-- unchanged (no self-verify via the back door). P6 @ SelfVerify Co
-- (verification_status='verified'). ──
-- ════════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', true);
SELECT set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_raised boolean := false;
  v_status text;
BEGIN
  BEGIN
    PERFORM public.resubmit_company_verification();
  EXCEPTION WHEN raise_exception THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'BLOCK 9 FAIL: resubmit_company_verification succeeded on an already-verified company';
  END IF;

  SELECT verification_status INTO v_status FROM public.company
   WHERE id = '60000006-0000-0000-0000-000000000000';
  IF v_status <> 'verified' THEN
    RAISE EXCEPTION 'BLOCK 9 FAIL: verification_status changed to % on the rejected call', v_status;
  END IF;
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- (10) approve_company / reject_company as HS team → still work (regression
-- guard, not a hole-proof — both already exist and are untouched by this
-- migration). Impersonates the SEEDED HS reviewer, matching
-- admin_verification_test.sql's own fixture. ──
-- ════════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
SELECT set_config('request.jwt.claims', '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_status text;
  v_verified_by uuid;
  v_verified_at timestamptz;
BEGIN
  PERFORM public.approve_company('60000007-0000-0000-0000-000000000000');
  SELECT verification_status, verified_by, verified_at
    INTO v_status, v_verified_by, v_verified_at
    FROM public.company WHERE id = '60000007-0000-0000-0000-000000000000';
  IF v_status <> 'verified' THEN
    RAISE EXCEPTION 'BLOCK 10 FAIL: approve_company did not flip status (got %)', v_status;
  END IF;
  IF v_verified_by IS DISTINCT FROM '99999999-9999-9999-9999-999999999999'::uuid OR v_verified_at IS NULL THEN
    RAISE EXCEPTION 'BLOCK 10 FAIL: approve_company left verified_by/verified_at unset';
  END IF;

  PERFORM public.reject_company('60000008-0000-0000-0000-000000000000', 'incomplete licence', 'licence_incomplete');
  SELECT verification_status INTO v_status FROM public.company
   WHERE id = '60000008-0000-0000-0000-000000000000';
  IF v_status <> 'rejected' THEN
    RAISE EXCEPTION 'BLOCK 10 FAIL: reject_company did not flip status (got %)', v_status;
  END IF;
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- (11) anon executes either new function → denied, by CALLING and expecting
-- 42501 — NOT by inspecting proacl (L-010: since 20260817120000 a new
-- function is BORN without anon EXECUTE, so a proacl grep would pass whether
-- or not the grant ritual is in the migration at all). No jwt claims set — a
-- signed-out visitor has none. ──
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE anon;
DO $$
DECLARE
  v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.accept_connection_request('6a000001-0000-0000-0000-000000000000');
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'BLOCK 11 FAIL: anon could call accept_connection_request';
  END IF;
END $$;
DO $$
DECLARE
  v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.resubmit_company_verification();
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'BLOCK 11 FAIL: anon could call resubmit_company_verification';
  END IF;
END $$;
RESET ROLE;

ROLLBACK;
SELECT 'ALL CONNECTION CONSENT LOCKDOWN TESTS PASSED' AS result;
