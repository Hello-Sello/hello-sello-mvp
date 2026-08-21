-- ============================================================================
-- seed_visibility_matrix_test.sql — T00 seed matrix proof (0022-buyer-shop-view)
-- ----------------------------------------------------------------------------
-- Proves the seed lands exactly PLAN-T00.md's "matrix (rev 4)" table on
-- GreenLeaf (company aaaaaaaa-…), which is what makes AC 1-4 of the slug
-- walkable at all: today every product ships profile_visible=false AND
-- price_public=false, so ZERO products are buyer-visible on a fresh reset.
--
-- Asserted, all against GreenLeaf and all non-deleted products:
--   (1) all four corners of the (profile_visible x price_public) matrix are
--       occupied by at least one product
--   (2) exactly the five expected supplier_product_code rows exist, each
--       with exactly its expected (visible, priced, location) triple
--   (3) count(distinct location) = 2 — two named location tabs render
--   (4) rung counts per product: AUR-1A 1, AUR-1B 0, AUR-1C 0, AUR-1D 0,
--       AUR-1E 2 — see the two LOAD-BEARING notes inline below
--   (5) AUR-1D still carries a live price row (pricelist_item, not deleted)
--   (6) TICKETS.md T00 criterion 2 — a hidden product's seller has a
--       genuinely-connectable demo buyer (see block 6 for the exact join;
--       this one is satisfied by pre-existing seed §5f, not by T00's own
--       edits — noted inline, not hidden)
--
-- This is a pure data-shape proof, not a permissions proof (cross_tenant_
-- lockdown_test.sql and pricelist_item_tier_test.sql already cover RLS/grants
-- for this schema) — no role impersonation, just direct reads inside a
-- rolled-back transaction so a bad run leaves no trace.
--
-- Run:  bash supabase/tests/run_seed_visibility_matrix_test.sh
--
-- ⚠️  RED-FIRST: this file is EXPECTED to FAIL against today's seed, which
-- has only four products (AUR-1A..1D), all profile_visible=false AND
-- price_public=false, no `location` ever written, and AUR-1A's single
-- seeded rung as the only row in pricelist_item_tier. That failure is the
-- proof the assertions genuinely exercise T00's matrix. Do NOT "fix" it
-- green here — T00 lands it in supabase/seed/seed.sql.
--
-- GreenLeaf = aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
--
-- ⚠️  PRECONDITION — run against a FRESH `supabase db reset`, not a DB that has
-- ever run e2e. This suite asserts raw seed state on purpose (that's the whole
-- point of it — see every neighbouring suite's "own fixture products instead of
-- mutating the seeded rows" convention, e.g. pricelist_item_tier_test.sql:37-38).
-- It does NOT self-fixture and must not be restructured to. The specific known
-- mutator: e2e/present-card-edit.spec.ts flips AUR-1A's price_public dial ON and
-- saves it (:244-245), and builds a live 2-rung ladder on AUR-1B and saves it
-- (:181-189) — after that spec has run once against a DB, blocks (2) and (4)
-- below false-fail against real (mutated) data, not against a broken suite.
-- ============================================================================

-- Fail loud under ANY harness, including a flagless `psql -f -` invocation —
-- do not rely on the caller passing `-v ON_ERROR_STOP=1`. Without this, a
-- failed assertion inside a DO block aborts the transaction, the unconditional
-- ROLLBACK below then succeeds cleanly, and the trailing SELECT prints "…
-- PASSED" with exit code 0 — a false green under exactly the flagless form
-- .claude/skills/ship/SKILL.md documents.
\set ON_ERROR_STOP on

BEGIN;

-- ── (1) all four corners of the matrix are occupied ─────────────────────────
DO $$
DECLARE
  v_company uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.product
     WHERE company_id = v_company AND deleted_at IS NULL
       AND profile_visible = true AND price_public = true)
    THEN RAISE EXCEPTION 'MATRIX: no product occupies the visible+priced (L2) corner'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.product
     WHERE company_id = v_company AND deleted_at IS NULL
       AND profile_visible = true AND price_public = false)
    THEN RAISE EXCEPTION 'MATRIX: no product occupies the visible+price-hidden (L1) corner'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.product
     WHERE company_id = v_company AND deleted_at IS NULL
       AND profile_visible = false AND price_public = true)
    THEN RAISE EXCEPTION 'MATRIX: no product occupies the hidden+priced corner'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.product
     WHERE company_id = v_company AND deleted_at IS NULL
       AND profile_visible = false AND price_public = false)
    THEN RAISE EXCEPTION 'MATRIX: no product occupies the hidden+price-hidden corner'; END IF;
END $$;

-- ── (2) exactly the five expected rows, each in its exact corner + location ─
DO $$
DECLARE
  v_company uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_bad_count int;
BEGIN
  -- All five of AUR-1A..1E must be present — this filters on
  -- supplier_product_code IN (...), so it can only ever detect FEWER than the
  -- five (a missing/renamed/soft-deleted row); it cannot detect a SIXTH
  -- product coexisting (present-add-product-fields.spec.ts:43 legitimately
  -- inserts one, and that is not a failure this check is meant to catch).
  IF (SELECT count(*) FROM public.product
       WHERE company_id = v_company AND deleted_at IS NULL
         AND supplier_product_code IN ('AUR-1A','AUR-1B','AUR-1C','AUR-1D','AUR-1E')) <> 5
    THEN RAISE EXCEPTION 'MATRIX: expected exactly 5 rows for AUR-1A..1E, found %',
      (SELECT count(*) FROM public.product
        WHERE company_id = v_company AND deleted_at IS NULL
          AND supplier_product_code IN ('AUR-1A','AUR-1B','AUR-1C','AUR-1D','AUR-1E')); END IF;

  -- Each named code lands on its exact (visible, priced, location) triple —
  -- PLAN-T00.md "The matrix (rev 4)" table, verbatim.
  SELECT count(*) INTO v_bad_count
    FROM (VALUES
      ('AUR-1A', true,  false, 'Toronto Warehouse'),
      ('AUR-1B', true,  true,  'Toronto Warehouse'),
      ('AUR-1C', false, true,  'Montreal Warehouse'),
      ('AUR-1D', false, false, 'Montreal Warehouse'),
      ('AUR-1E', true,  true,  'Toronto Warehouse')
    ) AS expected(code, visible, priced, loc)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.product p
      WHERE p.company_id = v_company AND p.deleted_at IS NULL
        AND p.supplier_product_code = expected.code
        AND p.profile_visible = expected.visible
        AND p.price_public = expected.priced
        AND p.location = expected.loc);
  IF v_bad_count <> 0
    THEN RAISE EXCEPTION 'MATRIX: % of the 5 expected (code, visible, priced, location) triples did not match seed data',
      v_bad_count; END IF;
END $$;

-- ── (3) two distinct location values ⇒ two named tabs ────────────────────────
DO $$
DECLARE
  v_company uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
BEGIN
  IF (SELECT count(DISTINCT location) FROM public.product
       WHERE company_id = v_company AND deleted_at IS NULL) <> 2
    THEN RAISE EXCEPTION 'MATRIX: expected exactly 2 distinct product.location values, found %',
      (SELECT count(DISTINCT location) FROM public.product
        WHERE company_id = v_company AND deleted_at IS NULL); END IF;
END $$;

-- ── (4) rung counts per product — the two LOAD-BEARING traps ────────────────
DO $$
DECLARE
  v_company uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_rungs record;
  v_expected jsonb := '{"AUR-1A":1,"AUR-1B":0,"AUR-1C":0,"AUR-1D":0,"AUR-1E":2}'::jsonb;
BEGIN
  FOR v_rungs IN
    SELECT p.supplier_product_code AS code, count(t.id) AS rungs
      FROM public.product p
      JOIN public.pricelist_item pi ON pi.product_id = p.id AND pi.deleted_at IS NULL
      LEFT JOIN public.pricelist_item_tier t
        ON t.pricelist_item_id = pi.id AND t.deleted_at IS NULL
     WHERE p.company_id = v_company AND p.deleted_at IS NULL
       AND p.supplier_product_code IN ('AUR-1A','AUR-1B','AUR-1C','AUR-1D','AUR-1E')
     GROUP BY 1
  LOOP
    IF v_rungs.rungs <> (v_expected ->> v_rungs.code)::int THEN
      RAISE EXCEPTION 'MATRIX: % has % rungs, expected % — LOAD-BEARING: AUR-1B=0 protects e2e/present-card-edit.spec.ts''s "blank slate" pin (it builds a 2-rung ladder on an asserted-zero-rung product in-test); AUR-1E=2 catches PLAN-T00 step 3''s trap where a two-statement rung INSERT ships a silently one-rung ladder',
        v_rungs.code, v_rungs.rungs, (v_expected ->> v_rungs.code)::int;
    END IF;
  END LOOP;

  -- Every expected code must actually have a pricelist_item row to join
  -- through, or the LOOP above silently skips it instead of failing loud.
  IF (SELECT count(*) FROM jsonb_object_keys(v_expected) k
       WHERE NOT EXISTS (
         SELECT 1 FROM public.product p
           JOIN public.pricelist_item pi ON pi.product_id = p.id AND pi.deleted_at IS NULL
          WHERE p.company_id = v_company AND p.deleted_at IS NULL
            AND p.supplier_product_code = k)) <> 0
    THEN RAISE EXCEPTION 'MATRIX: at least one of AUR-1A..1E has no live pricelist_item row to count rungs against — the rung-count loop above would have skipped it silently';
  END IF;
END $$;

-- ── (5) AUR-1D still carries a live price row (rev 3 kept it on purpose — ────
--        deal_line_item.unit_price is NOT NULL, so deleting it 23502s the
--        demo path; do not let a future rev re-delete it) ──────────────────
DO $$
DECLARE
  v_company uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.pricelist_item pi
      JOIN public.product p ON p.id = pi.product_id
     WHERE p.company_id = v_company AND p.deleted_at IS NULL
       AND p.supplier_product_code = 'AUR-1D'
       AND pi.deleted_at IS NULL)
    THEN RAISE EXCEPTION 'MATRIX: AUR-1D has NO live pricelist_item row — deal_line_item.unit_price is NOT NULL, so a price-less AUR-1D throws 23502 on the demo deal-draft path (PLAN-T00.md Behaviour changes, note 4)';
  END IF;
END $$;

-- ── (6) criterion 2 — a hidden product's seller has a genuinely-connectable ──
--        demo buyer (TICKETS.md T00: "When a seeded product is hidden, it
--        shall belong to a seller the demo buyer CAN connect to, so AC 5's
--        before/after reload is walkable on seed data alone"). "Can connect"
--        is the load-bearing clause: a pending, connect-type request from a
--        VERIFIED sender company that has NO ACTIVE relationship yet — an
--        already-connected sender does not satisfy the criterion at all.
--
--        Bob/StonePharm does NOT qualify: GreenLeaf<->StonePharm is a seeded
--        ACTIVE relationship (seed.sql:316, §5d) — Bob is already connected,
--        not "can connect". The qualifying senders are david@nordcanna.test
--        and eva@bavaria.test (seed.sql:363-376, §5f): both 'pending', both
--        connect-type ('connect_message' / 'connect' — inbox_request_type,
--        20260607090001_lookups_and_seeds.sql:35-39), both verified companies
--        (§5b), and NEITHER has ANY relationship row to GreenLeaf (only §5d
--        and §5e create relationship rows, and those are StonePharm/Rheinland).
--        `relationship`'s canonical order is `company_a_id < company_b_id`
--        (20260607090003_phase2_deal.sql:31), matched here with
--        least()/greatest() rather than assumed as (receiver, sender).
--
--        ⚠️ Honest note: unlike blocks (1)-(5), this block does not flip
--        RED->GREEN across T00's own edit. The connectable-buyer fixture is
--        §5f, which already exists in today's seed, independently of T00's
--        visibility-flag/location UPDATE — and today EVERY GreenLeaf product
--        is hidden (profile_visible defaults false), so the join already
--        finds a match before T00 lands. It is a real, mechanically-checked
--        regression guard for AC 5's walk (it WOULD fail if a future rev
--        deleted §5f, changed its type/status, or added a relationship row
--        for NordCanna/Bavaria) — just not one this specific ticket's diff
--        turns from failing to passing. The suite as a whole is still
--        RED-first: block (1) above aborts the transaction before this block
--        ever runs, on today's all-hidden, all-price-hidden seed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.product hp
      JOIN public.pending_inbox_item ibx
        ON ibx.receiver_company_id = hp.company_id
     WHERE hp.profile_visible = false
       AND hp.deleted_at IS NULL
       AND ibx.status = 'pending'
       AND ibx.type IN ('connect', 'connect_message')
       AND ibx.deleted_at IS NULL
       AND EXISTS (
         SELECT 1 FROM public.company sender
          WHERE sender.id = ibx.sender_company_id
            AND sender.verification_status = 'verified'
            AND NOT EXISTS (
              SELECT 1 FROM public.relationship r
               WHERE r.deleted_at IS NULL
                 AND r.status = 'active'
                 AND r.company_a_id = least(ibx.receiver_company_id, ibx.sender_company_id)
                 AND r.company_b_id = greatest(ibx.receiver_company_id, ibx.sender_company_id)
            )
       ))
    THEN RAISE EXCEPTION 'CRITERION 2: no hidden product''s seller has a verified, not-yet-connected sender with a pending connect request — AC 5''s before/after reload is unwalkable on seed data alone';
  END IF;
END $$;

ROLLBACK;
SELECT 'ALL SEED VISIBILITY MATRIX TESTS PASSED' AS result;
