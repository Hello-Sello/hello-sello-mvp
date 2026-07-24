-- ============================================================================
-- rls_isolation_test.sql — proves multi-tenant RLS isolation (F2) + the
-- Phase-12 draft-privacy narrow (D-08) and the status-write revoke (D-09)
-- ----------------------------------------------------------------------------
-- Run against a DB that has the migrations + the seed applied
-- (GreenLeaf/Alice + StonePharm/Bob). Wrapped in a single transaction that
-- ROLLBACKs, so it creates ephemeral fixtures, asserts, and leaves NO trace.
--
-- Run:  psql "$DATABASE_URL" -f supabase/tests/rls_isolation_test.sql
--   (or paste into the SQL editor). Any failed assertion RAISEs and aborts;
--   success prints 'ALL RLS ISOLATION TESTS PASSED'.
--
-- How impersonation works: set request.jwt.claim.sub (what auth.uid() reads) +
-- SET LOCAL ROLE authenticated, so queries run exactly as that signed-in user
-- with RLS active. RESET ROLE between users. Service/postgres role is NOT used
-- for the assertions (it bypasses RLS -> would give false passes).
--
-- Assertions are SCOPED to the fixture ids (EXISTS / per-id counts), never
-- table-wide counts: the seed now carries its own deal cards, workspaces, and
-- private rows on the same relationships, so global counts would drift with
-- every seed change.
--
-- Coverage: company isolation (connection-scoped since
-- shares_connection_with_company), the TWO-ARM draft privacy proof (an
-- 'unsent' card is invisible to the counterparty — card, lines, and things
-- via the card_relationship_member cascade — and becomes visible after the
-- flip to 'negotiation'), the private-workspace visibility lockstep
-- (unchanged: a private workspace hides its things from non-members even on
-- a visible card), the D-09 grant-layer write block (a raw UPDATE on
-- deal_card raises insufficient_privilege for EITHER side — the revoke fires
-- before RLS), the seller-only column split, and the product write block.
-- Extend as policies grow.
--
-- Fixture cards (both initiated by GreenLeaf on the seeded relationship):
--   C1 cccccccc-… status 'unsent'      + W1 (company_wide) + thing T1 + line L1
--   C2 c2c2c2c2-… status 'negotiation' + W2 (private)      + thing T2
-- C1 is the D-08 arm card (unsent -> flipped to negotiation mid-test).
-- C2 pins the workspace lockstep: visible card, private workspace, Bob sees 0.
-- ============================================================================

BEGIN;

-- ── Fixtures (privileged role; rolled back at the end) ───────────────────────
-- The seeded world already carries the GreenLeaf<->StonePharm relationship
-- (uq_relationship_pair_active forbids a duplicate) — resolve it at runtime.
CREATE TEMP TABLE _rel ON COMMIT DROP AS
SELECT r.id AS rel
FROM relationship r
WHERE r.deleted_at IS NULL
  AND ((r.company_a_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND r.company_b_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
    OR (r.company_a_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND r.company_b_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));

DO $$
BEGIN
  IF (SELECT count(*) FROM _rel) <> 1 THEN
    RAISE EXCEPTION 'FIXTURE: seeded GreenLeaf<->StonePharm relationship not found — run supabase db reset';
  END IF;
END $$;

-- C1: the D-08 arm card — born 'unsent' (private to GreenLeaf until the flip)
INSERT INTO deal_card (id, relationship_id, status, deal_type, initiating_company_id, created_by)
SELECT 'cccccccc-cccc-cccc-cccc-cccccccccccc',
       rel, 'unsent', 'offer',
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       '11111111-1111-1111-1111-111111111111'
FROM _rel;

-- W1: company_wide, so post-flip thing visibility is gated ONLY by the
-- card_relationship_member cascade (the D-08 proof point).
INSERT INTO deal_workspace (id, deal_card_id, visibility, created_by)
VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        'cccccccc-cccc-cccc-cccc-cccccccccccc', 'company_wide',
        '11111111-1111-1111-1111-111111111111');

INSERT INTO deal_member (deal_workspace_id, person_id, role, added_by_person_id)
VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        '11111111-1111-1111-1111-111111111111', 'owner',
        '11111111-1111-1111-1111-111111111111');

INSERT INTO thing (id, deal_workspace_id, title, stage_code, created_by)
VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff',
        'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Draft-only task', 'negotiation',
        '11111111-1111-1111-1111-111111111111');

-- C2: already 'negotiation' (visible to both sides) — carries the private
-- workspace W2 so the original visibility-lockstep test stays unambiguous.
INSERT INTO deal_card (id, relationship_id, status, deal_type, initiating_company_id, created_by)
SELECT 'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2',
       rel, 'negotiation', 'offer',
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       '11111111-1111-1111-1111-111111111111'
FROM _rel;

INSERT INTO deal_workspace (id, deal_card_id, visibility, created_by)
VALUES ('e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2',
        'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2', 'private',
        '11111111-1111-1111-1111-111111111111');

INSERT INTO deal_member (deal_workspace_id, person_id, role, added_by_person_id)
VALUES ('e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2',
        '11111111-1111-1111-1111-111111111111', 'owner',
        '11111111-1111-1111-1111-111111111111');

INSERT INTO thing (id, deal_workspace_id, title, stage_code, created_by)
VALUES ('f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f2f2f2',
        'e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2', 'Secret private task', 'negotiation',
        '11111111-1111-1111-1111-111111111111');

-- seller-only column split: a product (GreenLeaf) + cost, a line item + per-side
-- private metrics (seller margin = GreenLeaf, buyer metric = StonePharm).
INSERT INTO deal_line_item (id, deal_card_id, version, product_name, quantity, unit, unit_price)
VALUES ('99999999-9999-9999-9999-999999999999','cccccccc-cccc-cccc-cccc-cccccccccccc',1,'Flower',100,'g',5.0);
INSERT INTO product (id, company_id, name)
VALUES ('77777777-7777-7777-7777-777777777777','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','GL Flower');
INSERT INTO product_cost (product_id, company_id, cogs)
VALUES ('77777777-7777-7777-7777-777777777777','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',1.2345);
INSERT INTO deal_line_item_private (deal_line_item_id, company_id, seller_margin)
VALUES ('99999999-9999-9999-9999-999999999999','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',0.15);
INSERT INTO deal_line_item_private (deal_line_item_id, company_id, buyer_metric)
VALUES ('99999999-9999-9999-9999-999999999999','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',0.10);

-- ── ALICE (GreenLeaf) — the initiator sees her own unsent draft ─────────────
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  -- company isolation: own company visible, an UNCONNECTED company is not
  -- (Bavaria/NordCanna have seeded pending connect items to GreenLeaf, so
  -- PendingCo is the one company Alice shares NOTHING with)
  IF NOT EXISTS (SELECT 1 FROM company WHERE name = 'GreenLeaf Cultivation')
    THEN RAISE EXCEPTION 'FAIL: Alice should see her own company'; END IF;
  IF EXISTS (SELECT 1 FROM company WHERE name = 'PendingCo GmbH')
    THEN RAISE EXCEPTION 'LEAK: Alice saw a company she shares no connection with'; END IF;
  -- the initiator sees BOTH her cards, including the unsent draft
  IF NOT EXISTS (SELECT 1 FROM deal_card WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc')
    THEN RAISE EXCEPTION 'FAIL: Alice (initiator) should see her own UNSENT draft'; END IF;
  IF NOT EXISTS (SELECT 1 FROM deal_card WHERE id = 'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2')
    THEN RAISE EXCEPTION 'FAIL: Alice should see the negotiation card'; END IF;
  -- both things: T1 (company_wide) + T2 (private, but she is a member)
  IF (SELECT count(*) FROM thing WHERE deal_workspace_id IN
        ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2')) <> 2
    THEN RAISE EXCEPTION 'FAIL: Alice should see both fixture things'; END IF;
  -- column split: seller sees her cogs + margin, NOT the buyer metric
  IF NOT EXISTS (SELECT 1 FROM product_cost WHERE product_id = '77777777-7777-7777-7777-777777777777')
    THEN RAISE EXCEPTION 'FAIL: seller should see her own product_cost'; END IF;
  IF (SELECT count(*) FROM deal_line_item_private
        WHERE deal_line_item_id = '99999999-9999-9999-9999-999999999999') <> 1
     OR EXISTS (SELECT 1 FROM deal_line_item_private
        WHERE deal_line_item_id = '99999999-9999-9999-9999-999999999999' AND buyer_metric IS NOT NULL)
    THEN RAISE EXCEPTION 'LEAK: seller should see only her margin row, not the buyer metric'; END IF;
  -- D-09: the grant-layer revoke fires BEFORE RLS — even the INITIATOR cannot
  -- raw-update her own card; transitions go through the definer RPCs only.
  BEGIN
    UPDATE deal_card SET status = 'negotiation'
      WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    RAISE EXCEPTION 'LEAK: Alice raw-updated deal_card status (D-09 revoke missing)';
  EXCEPTION WHEN insufficient_privilege THEN NULL;  -- expected: no UPDATE grant
  END;
END $$;
RESET ROLE;

-- ── BOB (StonePharm) — ARM A: the 'unsent' draft is INVISIBLE (D-08) ────────
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  -- company isolation: own + connected visible; a company connected only to
  -- GREENLEAF (not to StonePharm) must stay hidden
  IF NOT EXISTS (SELECT 1 FROM company WHERE name = 'StonePharm')
    THEN RAISE EXCEPTION 'FAIL: Bob should see his own company'; END IF;
  IF EXISTS (SELECT 1 FROM company WHERE name = 'Rheinland Apotheke GmbH')
    THEN RAISE EXCEPTION 'LEAK: Bob saw a company he shares no connection with'; END IF;
  -- the unsent card C1 must be hidden; the negotiation card C2 stays visible
  IF EXISTS (SELECT 1 FROM deal_card WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc')
    THEN RAISE EXCEPTION 'LEAK: Bob saw the counterparty''s UNSENT draft (D-08 narrow missing)'; END IF;
  IF NOT EXISTS (SELECT 1 FROM deal_card WHERE id = 'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2')
    THEN RAISE EXCEPTION 'FAIL: Bob (rel member) should see the negotiation card'; END IF;
  -- children of the unsent card hide with it via the helper cascade
  IF (SELECT count(*) FROM deal_line_item
        WHERE deal_card_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc') <> 0
    THEN RAISE EXCEPTION 'LEAK: Bob saw line items of an unsent draft'; END IF;
  IF (SELECT count(*) FROM thing WHERE deal_workspace_id IN
        ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2')) <> 0
    THEN RAISE EXCEPTION 'LEAK: Bob saw fixture things (unsent-draft cascade + private workspace must both hide)'; END IF;
  -- write-block: Bob must NOT insert a product into GreenLeaf's catalog
  BEGIN
    INSERT INTO product (company_id, name)
      VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'hack');
    RAISE EXCEPTION 'LEAK: Bob inserted a product into GreenLeaf catalog';
  EXCEPTION WHEN insufficient_privilege THEN NULL;  -- expected: RLS blocked it
  END;
  -- column split: buyer must NOT see GreenLeaf's cogs or the seller margin
  IF EXISTS (SELECT 1 FROM product_cost WHERE product_id = '77777777-7777-7777-7777-777777777777')
    THEN RAISE EXCEPTION 'LEAK: buyer saw the seller''s product_cost (cogs)'; END IF;
  IF (SELECT count(*) FROM deal_line_item_private
        WHERE deal_line_item_id = '99999999-9999-9999-9999-999999999999') <> 1
     OR EXISTS (SELECT 1 FROM deal_line_item_private
        WHERE deal_line_item_id = '99999999-9999-9999-9999-999999999999' AND seller_margin IS NOT NULL)
    THEN RAISE EXCEPTION 'LEAK: buyer should see only his metric row, not the seller margin'; END IF;
END $$;
RESET ROLE;

-- ── THE FLIP (privileged): simulate send — C1 'unsent' -> 'negotiation'.
--    (send_deal itself is proven in deliver_deal_test.sql; here we isolate
--    the RLS behavior of the status value alone.) ─────────────────────────────
UPDATE deal_card SET status = 'negotiation'
WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

-- ── BOB (StonePharm) — ARM B: post-send the card + children APPEAR ──────────
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM deal_card WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc')
    THEN RAISE EXCEPTION 'FAIL: Bob should see the card after the flip to negotiation'; END IF;
  IF (SELECT count(*) FROM deal_line_item
        WHERE deal_card_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc') <> 1
    THEN RAISE EXCEPTION 'FAIL: Bob should see the line item after the flip (helper cascade)'; END IF;
  -- the company_wide thing appears with the card…
  IF NOT EXISTS (SELECT 1 FROM thing WHERE id = 'ffffffff-ffff-ffff-ffff-ffffffffffff')
    THEN RAISE EXCEPTION 'FAIL: Bob should see the company_wide thing after the flip'; END IF;
  -- …but the PRIVATE workspace lockstep still holds on the visible card C2
  IF EXISTS (SELECT 1 FROM thing WHERE id = 'f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f2f2f2')
    THEN RAISE EXCEPTION 'LEAK: Bob saw a thing in a PRIVATE workspace he is not a member of'; END IF;
  -- D-09 from the counterparty side: a visible card is still not raw-updatable
  BEGIN
    UPDATE deal_card SET status = 'confirmed'
      WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    RAISE EXCEPTION 'LEAK: Bob raw-updated deal_card status (D-09 revoke missing)';
  EXCEPTION WHEN insufficient_privilege THEN NULL;  -- expected: no UPDATE grant
  END;
END $$;
RESET ROLE;

ROLLBACK;
SELECT 'ALL RLS ISOLATION TESTS PASSED' AS result;
