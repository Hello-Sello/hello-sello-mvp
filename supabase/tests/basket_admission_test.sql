-- ============================================================================
-- basket_admission_test.sql — T07 (HEL-61, PLAN-T07.md rev 3)
-- ----------------------------------------------------------------------------
-- Proves: the new `basket_line_admission` restrictive policy on
-- public.product_basket_line (WITH CHECK only, FOR ALL, TO authenticated) and
-- the `anon`/`public` grant revoke. Reuses `product_public_select` /
-- `product_all` (T06) for the visibility arm via an RLS-filtered EXISTS
-- subquery — no visibility predicate is restated here (PLAN-T07 §1).
--
-- L-009 checked: `ls supabase/tests/ | grep -i basket` → no existing basket
-- suite. Genuinely new file.
--
-- Mirrors connection_visibility_override_test.sql's idiom exactly: one
-- BEGIN…ROLLBACK transaction, ephemeral fixtures, impersonation via
-- set_config('request.jwt.claim(s)', …) + SET LOCAL ROLE authenticated/anon,
-- RESET ROLE between perspectives. Any failed assertion RAISEs and aborts;
-- success prints 'ALL BASKET_ADMISSION TESTS PASSED'.
--
-- Run:  bash supabase/tests/run_basket_admission_test.sh
--
-- ⚠️  RED-FIRST: this file is EXPECTED to FAIL until
-- supabase/migrations/<ts>_basket_admission.sql ships. Today's ONLY policy on
-- product_basket_line is the shipped `basket_line_owner_all` — ownership only,
-- no product-visibility or price predicate at all. So:
--   * cells expecting REFUSED (3, 4, 5, 7, part of 10) currently ADMIT —
--     the suite aborts at the first one it reaches (cell 3), which is the
--     proof it genuinely exercises the missing policy. Do NOT "fix" it green
--     here.
--   * cells expecting ADMITTED (1, 2, 6, 8, 11, 12, 13) already pass today —
--     the current owner-only policy admits everything its owner writes,
--     which is exactly the hole this migration closes. Their purpose is to
--     prove the NEW policy doesn't become a blanket-deny once it lands, and
--     to guard the functional invariant (11) and the N2 gap (12) — same
--     precedent as connection_visibility_override_test.sql's own header,
--     which documents the identical asymmetry.
--   * cell 9 is a SHAPE guard, not a missing-feature guard: it protects the
--     "WITH CHECK, no USING" DECISION, and only goes red if someone later
--     regresses it by adding a mirroring USING clause (`add-using`). It is
--     expected to PASS both before and after this migration ships — its RED
--     state lives entirely in the `[MUT: add-using]` column, not in today's
--     tree.
--   * cell 10's grant-message assertion (`SQLERRM ~ 'permission denied'`) is
--     ALSO red today, for a DIFFERENT reason than "gate absent": anon was
--     already blocked before this migration, but by RLS rather than by
--     grants — `basket_line_owner_all` is `TO authenticated`
--     (20260707100000:26-30), so NO permissive policy applied to anon at all
--     and the write fell to RLS's default deny ("new row violates row-level
--     security policy…"). The post-REVOKE refusal is a GRANT refusal
--     ("permission denied for table…"). Both raise SQLSTATE 42501, which is
--     why PLAN-T07 §5 forbids asserting on the SQLSTATE alone.
--
-- Personas (seeded; resolved by supplier_product_code / company / email NAME,
-- never a raw product/company/person uuid, EXCEPT the four fixed seed ids
-- below — same precedent as connection_visibility_override_test.sql:34-38):
--   GreenLeaf  = aaaaaaaa-…  Alice = 11111111-…  (owner/seller, verified)
--   StonePharm = bbbbbbbb-…  Bob   = 22222222-…  (CONNECTED to GreenLeaf —
--                                                 seed §5d, active relationship)
--   Eva / Bavaria Medical Cannabis GmbH — verified, a real member, NO
--     relationship row to GreenLeaf at all (only a pending inbox item) — the
--     "unconnected verified buyer" persona.
--   anon — no JWT claims set (grant-arm cell 10).
--
-- Seeded fixtures used AS-IS (supabase/seed/seed.sql:391-394,409,433-441,
-- 462-467 — L-012 checked, values cited, not assumed):
--   AUR-1B — GreenLeaf, profile_visible=true,  price_public=true,  price 6.00.
--   AUR-1C — GreenLeaf, profile_visible=false, price_public=true,  price 4.00.
--   AUR-1D — GreenLeaf, profile_visible=false, price_public=false, price 5.00.
--   AUR-1F — GreenLeaf, profile_visible=true,  price_public=false, price 8.00.
--            The seed's designated stable price-hidden row (seed.sql:438-441:
--            "AUR-1F re-occupies the L1 corner (visible, price hidden)").
--            AUR-1A holds the same corner and is deliberately NOT used — see
--            cell 4.
--
-- L-033: each of the four was greped across e2e/ and supabase/tests/ for a
-- COMMITTED mutator before being pinned. The two columns this suite's
-- predicate reads (profile_visible, price_public) are written from exactly two
-- controls — `ProductCard`'s "Hide product" button and its "Show price to
-- buyers" checkbox — and only one e2e drives either, on AUR-1A only
-- (present-card-edit.spec.ts:244). AUR-1B does carry two OTHER persistent e2e
-- mutations — a 2-rung price ladder (present-card-edit.spec.ts:171-199, never
-- removed) and its spec columns (discover-shop.spec.ts:355-405, restored in
-- afterEach) — neither of which this predicate reads.
--
-- Ephemeral fixtures planted here (each new, per L-005 — a new row has no
-- dependents by construction, and each is scoped to exactly one cell so no
-- cell depends on another cell's mutation of shared state):
--   T07-SHAPE-GUARD      — GreenLeaf, visible+priced (admissible at insert
--                           time); cell 9's product, demoted to hidden +
--                           price-hidden AFTER Bob's line already exists.
--   T07-STAYS-ADMISSIBLE — GreenLeaf, visible+priced; cell 11's product,
--                           never mutated — a plain updater's positive case.
--   T07-NOPRICE-PUB      — GreenLeaf, visible + price_public=true, but NO
--                           pricelist_item row at all; cell 12 (N2 — the
--                           predicate reads `price_public`, not "has a
--                           price"; a benign but real gap, pinned not fixed).
--   T07-NOPRICE          — GreenLeaf, hidden + price_public=false, NO
--                           pricelist_item row; cell 13, Alice's own product
--                           with no price set (ticket's explicit "or has no
--                           price set" clause, ADR:856's DB test).
--
-- MUTATION-PROVABILITY (PLAN-T07 §5) — which cell(s) each named mutation
-- must break, tagged inline on the cell that proves it (N4: named per
-- conjunct, not one blanket mutation):
--   [MUT: drop-policy]     the whole restrictive policy         → 3, 4, 5, 7
--   [MUT: drop-price-arm]  `or p.price_public`                  → 1, 2, 7, 8,
--                                                                  12, and the
--                                                                  SETUP INSERTS
--                                                                  of 9 and 11
--   [MUT: drop-owner-arm]  `p.company_id = current_company_id()`→ 6, 13
--   [MUT: add-using]       a USING clause mirroring the check    → 9 (the
--                                                                  shape guard)
--
-- Reds that are NOT the cell's own headline assertion, and are easy to miss
-- because ON_ERROR_STOP hides everything after the first one:
--   * cell 9 plants Bob's line on T07-SHAPE-GUARD and cell 11 plants his on
--     T07-STAYS-ADMISSIBLE. Bob owns neither, so `price_public` is the only arm
--     admitting either — drop-price-arm aborts both cells at their SETUP
--     insert, before the thing they exist to assert.
--   * cell 7 reds under drop-price-arm through its PRECONDITION: it reuses the
--     AUR-1B line cell 1 planted, and drop-price-arm refuses that insert.
--   * cell 13's product (T07-NOPRICE) is profile_visible=false AND
--     price_public=false, so the owner arm is the only thing admitting Alice's
--     insert — which is why drop-owner-arm reds 13 as well as 6.
--
-- A suite that stays green with the mechanism removed is asserting nothing —
-- these tags are the reviewer's map for verifying that claim by hand
-- (temporarily apply each mutation to the shipped migration, rerun, confirm
-- the named cell(s) and ONLY those go red).
--
-- Whole matrix measured cell-by-cell against all four mutations (each installed
-- in a rolled-back transaction, every cell's write probed independently rather
-- than reading only the first abort). Under add-using, cell 9's post-hide
-- readings go 1/1/0 → 0/0/1: the row SURVIVES a DELETE that reported success,
-- and a buyer-only recount reads 0 either way — which is the case that cell's
-- privileged post-delete count exists to catch.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ── Fixtures (privileged role; rolled back) ─────────────────────────────────

INSERT INTO public.product (company_id, name, supplier_product_code, profile_visible, price_public, location)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'T07 Shape Guard Product', 'T07-SHAPE-GUARD', true, true, 'T07-FIXTURE-LOC');

INSERT INTO public.product (company_id, name, supplier_product_code, profile_visible, price_public, location)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'T07 Stays Admissible Product', 'T07-STAYS-ADMISSIBLE', true, true, 'T07-FIXTURE-LOC');

INSERT INTO public.product (company_id, name, supplier_product_code, profile_visible, price_public, location)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'T07 No Pricelist Row (public)', 'T07-NOPRICE-PUB', true, true, 'T07-FIXTURE-LOC');

INSERT INTO public.product (company_id, name, supplier_product_code, profile_visible, price_public, location)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'T07 No Pricelist Row (owner)', 'T07-NOPRICE', false, false, 'T07-FIXTURE-LOC');

CREATE TEMP TABLE _fix ON COMMIT DROP AS
SELECT
  (SELECT id FROM public.product WHERE supplier_product_code = 'AUR-1F' AND company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) AS aur1f_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'AUR-1B' AND company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) AS aur1b_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'AUR-1C' AND company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) AS aur1c_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'AUR-1D' AND company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) AS aur1d_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'T07-SHAPE-GUARD') AS shapeguard_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'T07-STAYS-ADMISSIBLE') AS staysadmissible_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'T07-NOPRICE-PUB') AS nopricepub_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'T07-NOPRICE') AS noprice_id,
  (SELECT id FROM auth.users WHERE email = 'eva@bavaria.test') AS eva_id,
  (SELECT id FROM public.company WHERE name = 'Bavaria Medical Cannabis GmbH') AS bavaria_id;
GRANT SELECT ON _fix TO authenticated;
GRANT SELECT ON _fix TO anon;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM _fix
     WHERE aur1f_id IS NULL OR aur1b_id IS NULL OR aur1c_id IS NULL OR aur1d_id IS NULL
        OR shapeguard_id IS NULL OR staysadmissible_id IS NULL OR nopricepub_id IS NULL
        OR noprice_id IS NULL OR eva_id IS NULL OR bavaria_id IS NULL)
    THEN RAISE EXCEPTION 'FIXTURE: one or more T07 fixtures failed to resolve — seed drift?'; END IF;
END $$;

-- ============================================================================
-- Cell 1 [door: direct table][control] — Bob adds AUR-1B (visible + priced).
-- Proves the policy is not blanket-deny. [MUT: drop-price-arm] would refuse
-- this (Bob is not the owner, so only `price_public` keeps it admitted).
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  INSERT INTO public.product_basket_line (owner_person_id, product_id, pack_count)
  VALUES ('22222222-2222-2222-2222-222222222222'::uuid, (SELECT aur1b_id FROM _fix), 1);
  IF (SELECT count(*) FROM public.product_basket_line
       WHERE owner_person_id = '22222222-2222-2222-2222-222222222222'::uuid
         AND product_id = (SELECT aur1b_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'Cell 1: Bob''s admitted line for AUR-1B (visible+priced) did not persist — control case broken'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- Cell 2 [AC10 bullet 1][MUT: drop-price-arm] — Bob adds AUR-1C (hidden to
-- the public, but T06's connection override makes it visible to him, and it
-- IS price_public). Proves the connection override reaches the basket, not
-- just the read side.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  INSERT INTO public.product_basket_line (owner_person_id, product_id, pack_count)
  VALUES ('22222222-2222-2222-2222-222222222222'::uuid, (SELECT aur1c_id FROM _fix), 1);
  IF (SELECT count(*) FROM public.product_basket_line
       WHERE owner_person_id = '22222222-2222-2222-2222-222222222222'::uuid
         AND product_id = (SELECT aur1c_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'Cell 2/AC10-1: Bob (connected) must be ADMITTED adding GreenLeaf''s hidden-but-connected AUR-1C'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- Cell 3 [AC10 bullet 2][MUT: drop-policy] — Bob adds AUR-1D: connected, so
-- VISIBLE to him (T06 override reaches hidden products regardless of price),
-- but price_public=false. Only the price arm can refuse this — visibility
-- alone would admit it. RED-FIRST: today's owner-only policy admits this.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.product_basket_line (owner_person_id, product_id, pack_count)
    VALUES ('22222222-2222-2222-2222-222222222222'::uuid, (SELECT aur1d_id FROM _fix), 1);
  EXCEPTION WHEN insufficient_privilege THEN
    v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'Cell 3/AC10-2: Bob must be REFUSED adding AUR-1D (visible-to-him via connection, but price_public=false) — the price arm, independent of visibility';
  END IF;
  IF (SELECT count(*) FROM public.product_basket_line
       WHERE owner_person_id = '22222222-2222-2222-2222-222222222222'::uuid
         AND product_id = (SELECT aur1d_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'Cell 3: no basket line for AUR-1D may exist after the refusal — AC10-1 (no line shall appear)'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- Cell 4 [AC10 bullet 2][MUT: drop-policy] — Bob adds AUR-1F: publicly
-- visible (profile_visible=true), but price_public=false. Isolates the price
-- arm from the visibility arm entirely (AUR-1F needs no connection override
-- at all to be seen).
--
-- ⚠️ FIXTURE: AUR-1F, not AUR-1A. Both occupy the same seed corner (visible,
-- price-hidden), but `e2e/present-card-edit.spec.ts:244-245` checks "Show price
-- to buyers" on AUR-1A and SAVES — committing `price_public = true` and never
-- restoring it. An AUR-1A assertion here therefore aborts the whole file, cells
-- 5-13 and the grant block included, on any stack that has run e2e since the
-- last `db reset`. Nothing committed mutates AUR-1F (L-033).
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.product_basket_line (owner_person_id, product_id, pack_count)
    VALUES ('22222222-2222-2222-2222-222222222222'::uuid, (SELECT aur1f_id FROM _fix), 1);
  EXCEPTION WHEN insufficient_privilege THEN
    v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'Cell 4/AC10-2: Bob must be REFUSED adding AUR-1F (publicly visible, price_public=false) — price arm, independent of visibility';
  END IF;
  IF (SELECT count(*) FROM public.product_basket_line
       WHERE owner_person_id = '22222222-2222-2222-2222-222222222222'::uuid
         AND product_id = (SELECT aur1f_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'Cell 4: no basket line for AUR-1F may exist after the refusal'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- Cell 5 [AC10 bullet 1][MUT: drop-policy] — Eva (verified, UNCONNECTED to
-- GreenLeaf — only a pending inbox item, seed §5f) adds AUR-1C (hidden,
-- price_public=true). Refused via the EXISTS cascade: product_public_select
-- hides AUR-1C from her entirely, so the subquery finds 0 rows regardless of
-- price_public.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.pending_inbox_item p
     WHERE p.status = 'pending'
       -- `type` is load-bearing, not decoration: without it a leftover
       -- 'pricelist_request' row satisfies this EXISTS. discover-shop.spec.ts
       -- creates exactly such a row Bavaria→GreenLeaf and never tears it down
       -- (resetPricingRequests is StonePharm-scoped), so this precondition
       -- would pass vacuously if the seeded 'connect' row (seed.sql:370-371)
       -- ever went missing.
       AND p.type = 'connect'
       AND p.receiver_company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
       AND p.sender_company_id = (SELECT bavaria_id FROM _fix))
    THEN RAISE EXCEPTION 'Cell 5 precondition: Eva/Bavaria must have a PENDING inbox item to GreenLeaf and NO relationship row — seed drift?'; END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', (SELECT eva_id::text FROM _fix), true);
SELECT set_config('request.jwt.claims', '{"sub":"' || (SELECT eva_id::text FROM _fix) || '","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.product_basket_line (owner_person_id, product_id, pack_count)
    VALUES ((SELECT eva_id FROM _fix), (SELECT aur1c_id FROM _fix), 1);
  EXCEPTION WHEN insufficient_privilege THEN
    v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'Cell 5/AC10-1: Eva (unconnected, verified) must be REFUSED adding GreenLeaf''s hidden AUR-1C — visibility arm via the EXISTS cascade';
  END IF;
  IF (SELECT count(*) FROM public.product_basket_line
       WHERE owner_person_id = (SELECT eva_id FROM _fix)
         AND product_id = (SELECT aur1c_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'Cell 5: no basket line for AUR-1C may exist after Eva''s refusal'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- Cell 6 [AC10 bullet 3][MUT: drop-owner-arm] — Alice (owner) adds her OWN
-- AUR-1D (hidden, price-hidden). Owner arm bypasses the price rule entirely.
-- ⚠️ The seed ships GreenLeaf `verified` — mutated to `pending` IN-TRANSACTION
-- here (idiom: connection_visibility_override_test.sql:340-354) to prove
-- `product_all`/the owner arm is not verification-gated, matching that
-- suite's own A8 cell. Restored immediately after.
-- ============================================================================
UPDATE public.company SET verification_status = 'pending'
 WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  INSERT INTO public.product_basket_line (owner_person_id, product_id, pack_count)
  VALUES ('11111111-1111-1111-1111-111111111111'::uuid, (SELECT aur1d_id FROM _fix), 1);
  IF (SELECT count(*) FROM public.product_basket_line
       WHERE owner_person_id = '11111111-1111-1111-1111-111111111111'::uuid
         AND product_id = (SELECT aur1d_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'Cell 6/AC10-3: Alice must be ADMITTED adding her own hidden+price-hidden AUR-1D, even while GreenLeaf itself is unverified — the owner arm'; END IF;
END $$;
RESET ROLE;

UPDATE public.company SET verification_status = 'verified'
 WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

-- ============================================================================
-- Cell 7 [AC10 bullet 6][MUT: drop-policy] — the FOR ALL / update-path half:
-- Bob's already-admitted AUR-1B line (from cell 1) PATCHed onto AUR-1D
-- (price-hidden). An INSERT-only policy would pass this test wrongly.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_line_id uuid;
  v_refused boolean := false;
BEGIN
  SELECT id INTO v_line_id FROM public.product_basket_line
   WHERE owner_person_id = '22222222-2222-2222-2222-222222222222'::uuid
     AND product_id = (SELECT aur1b_id FROM _fix);
  IF v_line_id IS NULL THEN
    RAISE EXCEPTION 'Cell 7 precondition: Bob''s legal AUR-1B line (from cell 1) was not found';
  END IF;

  BEGIN
    UPDATE public.product_basket_line
       SET product_id = (SELECT aur1d_id FROM _fix), updated_at = now()
     WHERE id = v_line_id;
  EXCEPTION WHEN insufficient_privilege THEN
    v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'Cell 7/AC10-6: Bob must be REFUSED patching an admitted line''s product_id onto AUR-1D (price-hidden) — the FOR ALL / conflict-update-path half of the policy. An INSERT-only policy passes this wrongly';
  END IF;
  IF (SELECT product_id FROM public.product_basket_line WHERE id = v_line_id) IS DISTINCT FROM (SELECT aur1b_id FROM _fix)
    THEN RAISE EXCEPTION 'Cell 7: the refused UPDATE must leave product_id unchanged at AUR-1B'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- Cell 8 [AC10 bullet 4][MUT: drop-price-arm] — the UPSERT path itself,
-- exercised twice on AUR-1C: the second INSERT hits the ON CONFLICT DO UPDATE
-- branch, which is the exact statement addToBasket issues (writes.ts, `addToBasket`).
-- Admitted (connected + price_public).
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  INSERT INTO public.product_basket_line (owner_person_id, product_id, pack_count, pack_size_grams, updated_at)
  VALUES ('22222222-2222-2222-2222-222222222222'::uuid, (SELECT aur1c_id FROM _fix), 1, 1000, now())
  ON CONFLICT (owner_person_id, product_id) DO UPDATE
    SET pack_count = excluded.pack_count, pack_size_grams = excluded.pack_size_grams, updated_at = excluded.updated_at;

  INSERT INTO public.product_basket_line (owner_person_id, product_id, pack_count, pack_size_grams, updated_at)
  VALUES ('22222222-2222-2222-2222-222222222222'::uuid, (SELECT aur1c_id FROM _fix), 2, 1000, now())
  ON CONFLICT (owner_person_id, product_id) DO UPDATE
    SET pack_count = excluded.pack_count, pack_size_grams = excluded.pack_size_grams, updated_at = excluded.updated_at;

  IF (SELECT pack_count FROM public.product_basket_line
       WHERE owner_person_id = '22222222-2222-2222-2222-222222222222'::uuid
         AND product_id = (SELECT aur1c_id FROM _fix)) <> 2
    THEN RAISE EXCEPTION 'Cell 8/AC10-4: Bob''s upsert (ON CONFLICT DO UPDATE) on AUR-1C must persist pack_count=2 — the exact statement addToBasket issues must succeed for an admissible product'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- Cell 9 [AC10 consequence][MUT: add-using] — 🔴 B4: the shape guard.
-- Bob adds T07-SHAPE-GUARD while it is admissible; the SELLER then hides it
-- (price_public=false, profile_visible=false) AFTER the line exists. Because
-- the shipped policy carries WITH CHECK only (no USING), Bob's own line must
-- stay readable and deletable regardless — "SELECT and DELETE both succeed"
-- is NOT enough to detect a wrongly-added USING clause: under that mutation
-- the DELETE affects 0 rows silently and Bob's own post-delete count reads 0
-- too, so every naive assertion stays green while the row survives. Only the
-- PRE-delete buyer-visible count (must be 1) plus a PRIVILEGED POST-delete
-- count (must be 0) split the two worlds.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  INSERT INTO public.product_basket_line (owner_person_id, product_id, pack_count)
  VALUES ('22222222-2222-2222-2222-222222222222'::uuid, (SELECT shapeguard_id FROM _fix), 1);
END $$;
RESET ROLE;

UPDATE public.product SET price_public = false, profile_visible = false
 WHERE id = (SELECT shapeguard_id FROM _fix);

SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_before int;
  v_deleted int;
BEGIN
  SELECT count(*) INTO v_before FROM public.product_basket_line
   WHERE owner_person_id = '22222222-2222-2222-2222-222222222222'::uuid
     AND product_id = (SELECT shapeguard_id FROM _fix);
  IF v_before <> 1 THEN
    RAISE EXCEPTION 'Cell 9/B4 [MUT: add-using]: Bob''s BUYER-VISIBLE count BEFORE the delete must be 1 (readable) — got %. The accepted consequence is "readable and deletable", never "vanished" — a USING clause mirroring the check would fail this exact line', v_before;
  END IF;

  DELETE FROM public.product_basket_line
   WHERE owner_person_id = '22222222-2222-2222-2222-222222222222'::uuid
     AND product_id = (SELECT shapeguard_id FROM _fix);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 1 THEN
    RAISE EXCEPTION 'Cell 9/B4: Bob''s DELETE of his own now-invisible-product line must affect exactly 1 row — got %. A silent 0-row delete ("succeeds" but removes nothing) is the add-using regression', v_deleted;
  END IF;
END $$;
RESET ROLE;

DO $$
DECLARE v_after int;
BEGIN
  SELECT count(*) INTO v_after FROM public.product_basket_line
   WHERE product_id = (SELECT shapeguard_id FROM _fix);
  IF v_after <> 0 THEN
    RAISE EXCEPTION 'Cell 9/B4: the PRIVILEGED post-delete count must be 0 — got %. The row survived a DELETE that reported success. This is precisely the case a buyer-only recount cannot detect', v_after;
  END IF;
END $$;

-- ============================================================================
-- Cell 10 [AC10 bullet 7 — anon] — anon INSERT must be refused, and the
-- refusal message (NOT the SQLSTATE, which is 42501 for both an RLS refusal
-- and a grant refusal) must read "permission denied" — the post-REVOKE
-- grant-level refusal, not merely the pre-existing RLS refusal.
--
-- ⚠️ The jwt claims are cleared FIRST. Cell 9 set them (:394-395) with
-- `set_config(…, is_local => true)` — transaction-scoped, and `RESET ROLE`
-- does not clear a GUC — so without this they are still Bob's and the cell
-- would not mean what it says. `auth.uid()` is
-- `coalesce(nullif(request.jwt.claim.sub,''), request.jwt.claims->>'sub')::uuid`,
-- so blanking both settings is what makes it NULL: a signed-out caller
-- carries no claims.
--
-- Note the refusal anon got BEFORE this migration was an RLS default-deny, not
-- a grant refusal: `basket_line_owner_all` is `TO authenticated`
-- (20260707100000:26-30), so no permissive policy applied to anon at all. That
-- is why the MESSAGE, not the SQLSTATE, is the assertion.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);
SET LOCAL ROLE anon;
DO $$
DECLARE
  v_denied boolean := false;
  v_msg text;
BEGIN
  BEGIN
    INSERT INTO public.product_basket_line (owner_person_id, product_id, pack_count)
    VALUES ('22222222-2222-2222-2222-222222222222'::uuid, (SELECT aur1b_id FROM _fix), 1);
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
    v_msg := SQLERRM;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Cell 10/AC10-7: anon INSERT on product_basket_line must be refused';
  END IF;
  IF v_msg !~* 'permission denied' THEN
    RAISE EXCEPTION 'Cell 10/AC10-7: anon''s refusal must read ''permission denied'' (the post-REVOKE grant refusal) — SQLSTATE 42501 alone cannot distinguish this from a pre-existing RLS refusal ("new row violates row-level security policy…"), which anon gets even before the migration ships. Got message: %', v_msg;
  END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- Cell 11 [functional invariant, L-011's class][MUT: drop-price-arm breaks
-- the setup insert] — an ALREADY-ADMISSIBLE line stays editable. Own product,
-- own fixture (T07-STAYS-ADMISSIBLE), never touched by any other cell — every
-- other numbered cell here is an attack or a refusal; this is the one
-- positive case for the shipped drawer's plain pack-count updater
-- (writes.ts, `updateBasketLinePackCount`).
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  INSERT INTO public.product_basket_line (owner_person_id, product_id, pack_count)
  VALUES ('22222222-2222-2222-2222-222222222222'::uuid, (SELECT staysadmissible_id FROM _fix), 1);

  UPDATE public.product_basket_line SET pack_count = 3, updated_at = now()
   WHERE owner_person_id = '22222222-2222-2222-2222-222222222222'::uuid
     AND product_id = (SELECT staysadmissible_id FROM _fix);

  IF (SELECT pack_count FROM public.product_basket_line
       WHERE owner_person_id = '22222222-2222-2222-2222-222222222222'::uuid
         AND product_id = (SELECT staysadmissible_id FROM _fix)) <> 3
    THEN RAISE EXCEPTION 'Cell 11: Bob must be able to update pack_count on his still-admissible line — existing lines stay editable (ADR:856)'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- Cell 12 [N2 — pinned gap, not fixed][MUT: drop-price-arm] — Bob adds a
-- product with price_public=true but NO pricelist_item row at all. The
-- predicate reads `p.price_public`, not "has a resolvable price" — looser
-- than the shipped card's own rule (ProductCard.tsx:407:
-- `priceShown = … && p.price_per_gram != null`). Admitted; benign
-- (toDraftLines.ts:8-11 documents the price-less send) but asserted so the
-- gap is pinned rather than rediscovered later.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  INSERT INTO public.product_basket_line (owner_person_id, product_id, pack_count)
  VALUES ('22222222-2222-2222-2222-222222222222'::uuid, (SELECT nopricepub_id FROM _fix), 1);
  IF (SELECT count(*) FROM public.product_basket_line
       WHERE owner_person_id = '22222222-2222-2222-2222-222222222222'::uuid
         AND product_id = (SELECT nopricepub_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'Cell 12/N2: Bob must be ADMITTED adding a price_public=true product with NO pricelist_item row — the predicate reads price_public, not "has a price"; pinning this gap, not fixing it here'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- Cell 13 [AC10 bullet 3 — "or has no price set"][ADR:856] — Alice (owner)
-- adds her own product with NO pricelist_item row at all. The ticket's price
-- clause explicitly includes this case; cell 6 only covers price-HIDDEN.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  INSERT INTO public.product_basket_line (owner_person_id, product_id, pack_count)
  VALUES ('11111111-1111-1111-1111-111111111111'::uuid, (SELECT noprice_id FROM _fix), 1);
  IF (SELECT count(*) FROM public.product_basket_line
       WHERE owner_person_id = '11111111-1111-1111-1111-111111111111'::uuid
         AND product_id = (SELECT noprice_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'Cell 13/AC10-3: Alice must be ADMITTED adding her own product with NO price set at all — the ticket''s explicit clause, ADR:856''s DB test'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- G1 [AC10 bullet 7, structural] — anon and PUBLIC hold NO privileges on
-- product_basket_line at all, checked directly rather than only inferred
-- from cell 10's behavioural refusal (which cannot on its own distinguish
-- "no grant" from "grant present but RLS still blocks it").
--
-- Asserted on `relacl`, not verb-by-verb via `has_table_privilege`. The
-- criterion is "anon shall hold NO privileges", and a verb list is only ever
-- as complete as whoever wrote it — enumerating SELECT/INSERT/UPDATE/DELETE/
-- TRUNCATE silently exempts REFERENCES, TRIGGER and MAINTAIN. The ACL either
-- carries an `anon=` entry or it does not: strictly stronger, and the same
-- idiom this migration's ledger pre-flight uses against cloud.
-- ============================================================================
DO $$
DECLARE
  v_acl  aclitem[];
  v_show text;
BEGIN
  SELECT coalesce(relacl, '{}'::aclitem[]) INTO v_acl
    FROM pg_class WHERE oid = 'public.product_basket_line'::regclass;
  v_show := coalesce(nullif(array_to_string(v_acl, ', '), ''), '(empty)');
  -- Each aclitem's text form is `grantee=privs/grantor`, so a LIKE anchored at
  -- the start matches one whole grantee and nothing else. A PUBLIC entry
  -- renders with an EMPTY grantee ('=arwd…/postgres') — hence the bare '=%'.
  IF EXISTS (SELECT 1 FROM unnest(v_acl) a WHERE a::text LIKE 'anon=%') THEN
    RAISE EXCEPTION 'G1/AC10-7: anon still holds privileges on product_basket_line — relacl: %', v_show; END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_acl) a WHERE a::text LIKE '=%') THEN
    RAISE EXCEPTION 'G1/AC10-7: PUBLIC still holds privileges on product_basket_line — relacl: %', v_show; END IF;
  -- Positive control: the revoke must not have taken `authenticated` with it.
  -- Without this an emptied or NULL relacl would satisfy both negatives above.
  IF NOT EXISTS (SELECT 1 FROM unnest(v_acl) a WHERE a::text LIKE 'authenticated=%') THEN
    RAISE EXCEPTION 'G1: authenticated lost its grants on product_basket_line — the revoke over-reached. relacl: %', v_show; END IF;
END $$;

DO $$
BEGIN
  RAISE NOTICE 'ALL BASKET_ADMISSION TESTS PASSED';
END $$;

ROLLBACK;
SELECT 'ALL BASKET_ADMISSION TESTS PASSED' AS result;
