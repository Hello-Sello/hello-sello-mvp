-- ============================================================================
-- rls_isolation_test.sql — proves multi-tenant RLS isolation (F2)
-- ----------------------------------------------------------------------------
-- Run against a DB that has the migrations + the F4 seed applied
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
-- Coverage: company isolation, shared-deal access (not over-locked), the
-- private-workspace visibility lockstep (the subtle one), and a write block.
-- Extend as policies grow.
-- ============================================================================

BEGIN;

-- ── Fixtures (privileged role; rolled back at the end) ───────────────────────
INSERT INTO relationship (id, company_a_id, company_b_id, initiated_by_company_id, created_by)
VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '11111111-1111-1111-1111-111111111111');

INSERT INTO deal_card (id, relationship_id, deal_type, initiating_company_id, created_by)
VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', 'offer',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '11111111-1111-1111-1111-111111111111');

INSERT INTO deal_workspace (id, deal_card_id, owner_person_id, visibility, created_by)
VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        '11111111-1111-1111-1111-111111111111', 'private',
        '11111111-1111-1111-1111-111111111111');

INSERT INTO deal_member (deal_workspace_id, person_id, role, added_by_person_id)
VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        '11111111-1111-1111-1111-111111111111', 'owner',
        '11111111-1111-1111-1111-111111111111');

INSERT INTO thing (id, deal_workspace_id, title, stage_code, created_by)
VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff',
        'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Secret private task', 'negotiation',
        '11111111-1111-1111-1111-111111111111');

-- ── ALICE (GreenLeaf) ────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM company) <> 1
     OR NOT EXISTS (SELECT 1 FROM company WHERE name = 'GreenLeaf Cultivation')
    THEN RAISE EXCEPTION 'FAIL: Alice should see ONLY GreenLeaf, saw % rows', (SELECT count(*) FROM company); END IF;
  IF (SELECT count(*) FROM deal_card) <> 1
    THEN RAISE EXCEPTION 'FAIL: Alice (rel member) should see the deal card'; END IF;
  IF (SELECT count(*) FROM thing) <> 1
    THEN RAISE EXCEPTION 'FAIL: Alice (workspace member) should see the private thing'; END IF;
END $$;
RESET ROLE;

-- ── BOB (StonePharm) ─────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM company) <> 1
     OR NOT EXISTS (SELECT 1 FROM company WHERE name = 'StonePharm')
    THEN RAISE EXCEPTION 'FAIL: Bob should see ONLY StonePharm, saw % rows', (SELECT count(*) FROM company); END IF;
  IF (SELECT count(*) FROM deal_card) <> 1
    THEN RAISE EXCEPTION 'FAIL: Bob (rel member) should see the shared deal card'; END IF;
  -- KEY lockstep test: private workspace, Bob is NOT a member -> must see 0 things
  IF (SELECT count(*) FROM thing) <> 0
    THEN RAISE EXCEPTION 'LEAK: Bob saw % things in a PRIVATE workspace he is not a member of', (SELECT count(*) FROM thing); END IF;
  -- write-block: Bob must NOT insert a product into GreenLeaf's catalog
  BEGIN
    INSERT INTO product (company_id, name)
      VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'hack');
    RAISE EXCEPTION 'LEAK: Bob inserted a product into GreenLeaf catalog';
  EXCEPTION WHEN insufficient_privilege THEN NULL;  -- expected: RLS blocked it
  END;
END $$;
RESET ROLE;

ROLLBACK;
SELECT 'ALL RLS ISOLATION TESTS PASSED' AS result;
