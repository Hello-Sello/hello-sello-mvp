-- ============================================================================
-- basket_admission_test.sql — T07 (HEL-61, PLAN-T07.md rev 3)
-- ----------------------------------------------------------------------------
-- Proves: the new `basket_line_admission` restrictive policy on
-- public.product_basket_line (WITH CHECK only, FOR ALL, TO authenticated),
-- the `anon`/`public` grant revoke, and — directly, not inferred from a
-- table read — the visibility predicate as it actually ships in
-- `product_visible_to_caller()` / `product_admissible_to_basket()`.
--
-- ⚠️ STALE-CLAIM CORRECTION (round 4): PLAN-T07 §1 originally described this
-- predicate as REUSING `product_public_select` / `product_all` via an
-- RLS-filtered EXISTS subquery, so no visibility rule would be restated here.
-- That was true only through round 1. Round 1 then removed the connection
-- arm from `product_public_select` entirely, and rounds 2-3 moved the WHOLE
-- visibility rule (public / owner / connection, the verified gate, the
-- window, and — as of round 4 — the seller company's own
-- deleted_at/verification_status and the unfiled-location term) into
-- `product_visible_to_caller()` instead. Cells 14-21 below assert that
-- function and `product_admissible_to_basket()` DIRECTLY, precisely because
-- there is no RLS-filtered subquery left to inherit the rule from — the
-- shipped shape is a single owning function, called from both the write gate
-- (below) and the read projection (`get_my_basket_lines()`), which is
-- narrower and more testable than the read-through-RLS design this file's
-- own header used to describe.
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
--
-- ROUND 4 ADDENDUM — cells 14-21, appended after G1 (own header block sits
-- just above cell 14 in the file): security round 4 found a BLOCKING leak
-- (product_visible_to_caller()'s buyer arm never checked the SELLER
-- COMPANY's own deleted_at/verification_status, only the product row's, and
-- never carried the "unfiled is not a shelf" location term
-- get_discoverable_shop() already has) and a missing-assertion gap (neither
-- product_visible_to_caller() nor get_my_basket_lines() had any test at all
-- before this addendum). Expected RED: 14, 15, 16, 17, 21. Expected GREEN now
-- (functional regression cover): 18, 19, 20 (cell 20 deliberately runs LAST —
-- see its own header — cell 21 sits before it).
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
  -- Tightened control (T07 G4 follow-through, HEL-61): the shipped migration's
  -- own contract is "revoke exactly truncate/references/trigger/maintain, keep
  -- select/insert/update/delete" (20260823100000:170-175), measured live
  -- before that migration as `authenticated=arwdDxtm/postgres`. aclitem
  -- privilege letters render in the fixed order arwdDxtm (INSERT,SELECT,
  -- UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN), so the surviving set
  -- must read exactly `arwd`. Chosen deliberately over leaving only the loose
  -- `authenticated=%` check above: this table's ACL is a named security
  -- contract (this migration exists because a signed-in buyer TRUNCATEd a row
  -- he could not see), so a future grant drifting back onto this exact table
  -- SHOULD force this assertion to be touched, not pass silently. The loose
  -- check above stays as the structural "still has some access at all" guard;
  -- this one pins the exact verb set.
  IF NOT EXISTS (SELECT 1 FROM unnest(v_acl) a WHERE a::text LIKE 'authenticated=arwd/%') THEN
    RAISE EXCEPTION 'G1: authenticated''s surviving privilege set on product_basket_line is no longer exactly arwd (select/insert/update/delete) — relacl: %', v_show; END IF;
END $$;

-- ============================================================================
-- G1 continued [T07 G4 follow-through, HEL-61] — the behavioural half of the
-- new `revoke truncate, references, trigger, maintain … from authenticated`
-- line (20260823100000_basket_admission.sql:174-175). `security` proved a
-- live hole: a signed-in buyer TRUNCATEd a basket line belonging to a seller
-- he cannot see — RLS is never consulted for TRUNCATE (table-level,
-- privilege-checked only), so no policy on this table could ever have
-- stopped it.
--
-- Two proofs, in order:
--   (a) TRUNCATE is refused, and the survivors (planted by cells 1-13) are
--       still there afterward — the row-count check exists because a TRUNCATE
--       that actually SUCCEEDED raises no exception at all, so a bare
--       `v_refused` flag cannot catch it; only a privileged post-count can.
--   (b) the over-reach guard, and the more important half: SELECT, INSERT,
--       UPDATE and DELETE must ALL still work for `authenticated` — proved
--       behaviourally (the verbs actually run, not `has_table_privilege`)
--       because a behavioural pass also proves the two policies
--       (`basket_line_owner_all`, `basket_line_admission`) survived the
--       REVOKE undisturbed, not merely that the grant bits look right.
--
-- Reuses cell 11's line (Bob, T07-STAYS-ADMISSIBLE) rather than planting a
-- new product: it is already unambiguously admissible under the new
-- restrictive policy (visible + priced), already exists, and cell 11 is the
-- file's own designated "no other cell depends on this row" fixture. Cell 11
-- left it at pack_count=3 — asserted as a precondition below, not assumed.
-- This is the LAST cell to touch it, so cycling it through SELECT → UPDATE →
-- DELETE → re-INSERT here disturbs nothing downstream (only the final PASSED
-- notice + ROLLBACK follow).
--
-- ⚠️ Both `request.jwt.claim.sub` and `request.jwt.claims` were blanked by
-- cell 10 (anon) and are transaction-scoped — RESET ROLE does not clear a
-- GUC — so Bob's claims are set again before each impersonated block below.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_refused boolean := false;
  v_msg     text;
BEGIN
  BEGIN
    TRUNCATE public.product_basket_line;
  EXCEPTION WHEN insufficient_privilege THEN
    v_refused := true;
    v_msg := SQLERRM;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'G1/TRUNCATE: authenticated TRUNCATE on product_basket_line must be refused — this is the exact hole the migration closes (RLS is never consulted for TRUNCATE)';
  END IF;
  IF v_msg !~* 'permission denied' THEN
    RAISE EXCEPTION 'G1/TRUNCATE: authenticated''s refusal must read ''permission denied'' — cell 10''s idiom, asserting the message not the SQLSTATE. Got: %', v_msg;
  END IF;
END $$;
RESET ROLE;

DO $$
DECLARE v_rows int;
BEGIN
  -- Privileged (no role set), table-wide: TRUNCATE has no WHERE clause, so a
  -- TRUNCATE that actually succeeded (raising no exception, hence invisible
  -- to the v_refused flag above) would show up here as 0, not as a partial
  -- loss confined to one owner.
  SELECT count(*) INTO v_rows FROM public.product_basket_line;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'G1/TRUNCATE: product_basket_line has 0 rows after the TRUNCATE attempt — cells 1-13 planted several; a refusal that raised insufficient_privilege but still emptied the table is not a real refusal';
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_line_id    uuid;
  v_pack_count int;
  v_affected   int;
BEGIN
  -- SELECT
  SELECT id, pack_count INTO v_line_id, v_pack_count FROM public.product_basket_line
   WHERE owner_person_id = '22222222-2222-2222-2222-222222222222'::uuid
     AND product_id = (SELECT staysadmissible_id FROM _fix);
  IF v_line_id IS NULL THEN
    RAISE EXCEPTION 'G1/CRUD: SELECT — Bob''s cell-11 line on T07-STAYS-ADMISSIBLE not found; the TRUNCATE/REFERENCES/TRIGGER/MAINTAIN revoke must not disturb SELECT';
  END IF;
  IF v_pack_count <> 3 THEN
    RAISE EXCEPTION 'G1/CRUD precondition: expected cell 11''s pack_count=3 on Bob''s line, got % — fixture drift, not what this cell tests', v_pack_count;
  END IF;

  -- UPDATE
  UPDATE public.product_basket_line SET pack_count = 7, updated_at = now() WHERE id = v_line_id;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected <> 1 THEN
    RAISE EXCEPTION 'G1/CRUD: UPDATE on product_basket_line must still work for authenticated after the revoke — 0 rows affected';
  END IF;
  IF (SELECT pack_count FROM public.product_basket_line WHERE id = v_line_id) <> 7 THEN
    RAISE EXCEPTION 'G1/CRUD: UPDATE did not persist pack_count=7 on Bob''s line';
  END IF;

  -- DELETE
  DELETE FROM public.product_basket_line WHERE id = v_line_id;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected <> 1 THEN
    RAISE EXCEPTION 'G1/CRUD: DELETE on product_basket_line must still work for authenticated after the revoke — 0 rows affected';
  END IF;
  IF EXISTS (SELECT 1 FROM public.product_basket_line WHERE id = v_line_id) THEN
    RAISE EXCEPTION 'G1/CRUD: Bob''s line must be gone after the DELETE';
  END IF;

  -- INSERT
  INSERT INTO public.product_basket_line (owner_person_id, product_id, pack_count)
  VALUES ('22222222-2222-2222-2222-222222222222'::uuid, (SELECT staysadmissible_id FROM _fix), 1);
  IF (SELECT count(*) FROM public.product_basket_line
       WHERE owner_person_id = '22222222-2222-2222-2222-222222222222'::uuid
         AND product_id = (SELECT staysadmissible_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'G1/CRUD: INSERT on product_basket_line must still work for authenticated after the revoke — the more important half of this cell, since the whole basket depends on it'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- ROUND 4 — security round 4 found a BLOCKING leak (findings #1-#4) and a
-- missing-assertion gap (F2) in this migration. `product_visible_to_caller()`
-- claims to be the SINGLE owner of "may this caller see this product", but
-- its buyer arm never consulted the SELLER COMPANY's own `deleted_at` or
-- `verification_status` — only the PRODUCT's `deleted_at` (migration comment
-- 20260823100000:110-114 covers the product row only) — and never carried
-- get_discoverable_shop()'s "unfiled is not a shelf" location term either
-- (20260822100000:332-334). `get_my_basket_lines()` and
-- `product_visible_to_caller()` are also asserted NOWHERE else in the repo
-- (grep -rn "get_my_basket_lines\|product_visible_to_caller" supabase/tests/
-- e2e/ → 0 hits before this block). Muskan's ruling: close all three missing
-- terms in one fix — company deleted_at, company verification_status, and
-- the location term — so `product_visible_to_caller()`'s buyer arm becomes
-- term-for-term equal to `get_discoverable_shop()`'s WHERE clause.
--
-- Cells 14-21 are appended HERE, after G1's CRUD checks and before the closing
-- NOTICE + ROLLBACK, so nothing above this line is disturbed by any mutation
-- below it (cells 17, 20 and 21 soft-delete/unverify/reassign company rows),
-- and nothing below needs to restore state afterward — the whole file is one
-- ROLLBACK. Cell 20 is placed LAST of all (see its own header) since it is
-- the one cell that mutates the shared GreenLeaf seed row; cell 21 (also a
-- fresh ephemeral company) sits before it.
--
-- Genuinely SEPARATE ephemeral seller companies, not GreenLeaf (L-012/L-033):
-- the leak cells mutate a seller COMPANY's own verification_status/deleted_at,
-- and every cell above this point already depends on GreenLeaf staying
-- verified+live. A fresh company has no dependents by construction.
--
-- Expected RED (the fix that makes these green is not written yet): 14, 15,
-- 16, 17, 21. Expected GREEN now — functional regression cover the repo is
-- missing (F2): 18, 19, 20.
-- ============================================================================

INSERT INTO public.company (id, name, country, verification_status, verified_at, created_by) VALUES
  ('c7000001-0000-0000-0000-000000000000'::uuid, 'T07 Round4 Seller (soft-delete case)', 'DE', 'verified', now(), NULL),
  ('c7000002-0000-0000-0000-000000000000'::uuid, 'T07 Round4 Seller (never verified)',   'DE', 'pending',  NULL,  NULL),
  ('c7000003-0000-0000-0000-000000000000'::uuid, 'T07 Round4 Seller (two-doors agree)',  'DE', 'verified', now(), NULL);

INSERT INTO public.product (company_id, name, supplier_product_code, profile_visible, price_public, cultivar, local_code_pzn, location) VALUES
  ('c7000001-0000-0000-0000-000000000000'::uuid, 'T07 Round4 Hidden Priced Product',     'T07-R4-HIDDEN-PRICED', false, true, 'T07 Round4 Cultivar', 'T07-R4-PZN-0001', 'T07-FIXTURE-LOC'),
  ('c7000002-0000-0000-0000-000000000000'::uuid, 'T07 Round4 Unverified Seller Product', 'T07-R4-UNVERIFIED',    true,  true, NULL, NULL, 'T07-FIXTURE-LOC'),
  ('c7000003-0000-0000-0000-000000000000'::uuid, 'T07 Round4 Agree Product',             'T07-R4-AGREE',         true,  true, NULL, NULL, 'T07-FIXTURE-LOC');

-- Own product, on GreenLeaf itself (cell 19 — relationship-end, not a
-- soft-delete/verification case, so it belongs on the seed company, same as
-- cells 1-13's AUR-* fixtures do).
INSERT INTO public.product (company_id, name, supplier_product_code, profile_visible, price_public, cultivar, local_code_pzn, location) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'T07 Round4 Relationship-End Product', 'T07-R4-RELEND', false, true, 'T07 Round4 RelEnd Cultivar', 'T07-R4-PZN-0002', 'T07-FIXTURE-LOC');

-- Bob (StonePharm) gets an ACTIVE relationship to seller1 ONLY — seller2's and
-- seller3's products are both profile_visible=true, so their buyer arm needs
-- no connection at all; only seller1's product is hidden (profile_visible=
-- false) and needs the connection override to be visible before the leak
-- fires. LEAST/GREATEST required by relationship_canonical_order (company_a_id
-- < company_b_id) — same idiom as seed.sql §5d.
INSERT INTO public.relationship (company_a_id, company_b_id, initiated_by_company_id, status)
VALUES (
  LEAST('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'c7000001-0000-0000-0000-000000000000'::uuid),
  GREATEST('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'c7000001-0000-0000-0000-000000000000'::uuid),
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  'active'
);

CREATE TEMP TABLE _fix2 ON COMMIT DROP AS
SELECT
  'c7000001-0000-0000-0000-000000000000'::uuid AS r4_seller1_id,
  'c7000002-0000-0000-0000-000000000000'::uuid AS r4_seller2_id,
  'c7000003-0000-0000-0000-000000000000'::uuid AS r4_seller3_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'T07-R4-HIDDEN-PRICED') AS r4_hidden_priced_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'T07-R4-UNVERIFIED')    AS r4_unverified_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'T07-R4-AGREE')         AS r4_agree_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'T07-R4-RELEND')        AS r4_relend_id;
GRANT SELECT ON _fix2 TO authenticated;
GRANT SELECT ON _fix2 TO anon;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM _fix2
     WHERE r4_hidden_priced_id IS NULL OR r4_unverified_id IS NULL
        OR r4_agree_id IS NULL OR r4_relend_id IS NULL)
    THEN RAISE EXCEPTION 'FIXTURE: one or more T07 round-4 fixtures failed to resolve'; END IF;
END $$;

-- ============================================================================
-- Cell 14 [round-4 finding #1 — 🔴 EXPECTED RED] — a verified buyer (Bob,
-- StonePharm) with an ACTIVE relationship to the seller has a basket line on
-- the seller's HIDDEN (profile_visible=false), price_public=true product. The
-- seller company is then soft-deleted. get_my_basket_lines() must go dark on
-- product_name/cultivar/local_code_pzn — today it does not:
-- product_visible_to_caller() never consults the SELLER COMPANY's own
-- deleted_at, only the PRODUCT's. This is the proven leak: a withdrawn
-- seller's catalogue detail keeps flowing into a buyer's basket drawer.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  INSERT INTO public.product_basket_line (owner_person_id, product_id, pack_count)
  VALUES ('22222222-2222-2222-2222-222222222222'::uuid, (SELECT r4_hidden_priced_id FROM _fix2), 1);
END $$;
RESET ROLE;

-- Positive control BEFORE the mutation (B4-class): the line must read back
-- WITH real detail while the seller company is still verified+live, or the
-- later "goes NULL" assertion would be vacuous.
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_name text;
BEGIN
  SELECT g.product_name INTO v_name FROM public.get_my_basket_lines() g
   WHERE g.product_id = (SELECT r4_hidden_priced_id FROM _fix2);
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Cell 14 precondition: Bob''s line must read a REAL product_name while the seller company is still verified+live — got NULL, so the later "goes dark" assertion would be vacuous';
  END IF;
END $$;
RESET ROLE;

-- The seller company is soft-deleted (privileged — models the seller's own
-- account lifecycle, not a caller-controlled write; same idiom as cell 6's
-- privileged verification_status UPDATE).
UPDATE public.company SET deleted_at = now()
 WHERE id = (SELECT r4_seller1_id FROM _fix2);

SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_name     text;
  v_cultivar text;
  v_pzn      text;
  v_found    int;
BEGIN
  SELECT count(*) INTO v_found FROM public.get_my_basket_lines() g
   WHERE g.product_id = (SELECT r4_hidden_priced_id FROM _fix2);
  IF v_found <> 1 THEN
    RAISE EXCEPTION 'Cell 14: Bob''s line must still be PRESENT (readable) after the seller company is soft-deleted — the ticket''s accepted consequence is "goes dark", never "vanishes" — got % rows', v_found;
  END IF;

  SELECT g.product_name, g.cultivar, g.local_code_pzn
    INTO v_name, v_cultivar, v_pzn
    FROM public.get_my_basket_lines() g
   WHERE g.product_id = (SELECT r4_hidden_priced_id FROM _fix2);
  IF v_name IS NOT NULL OR v_cultivar IS NOT NULL OR v_pzn IS NOT NULL THEN
    RAISE EXCEPTION 'Cell 14/round-4 LEAK: get_my_basket_lines() must return NULL product_name/cultivar/local_code_pzn once the SELLER COMPANY is soft-deleted — got name=%, cultivar=%, pzn=%. product_visible_to_caller() never checks the seller company''s own deleted_at on the buyer arm', v_name, v_cultivar, v_pzn;
  END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- Cell 15 [round-4 finding #2 — 🔴 EXPECTED RED] — product_visible_to_caller()
-- itself must be FALSE for this buyer/product pair once the seller company is
-- soft-deleted (cell 14's mutation carries forward — same fixture, same
-- transaction). Isolates the leak to the shared visibility function rather
-- than to get_my_basket_lines()'s own projection.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_visible boolean;
BEGIN
  SELECT public.product_visible_to_caller((SELECT r4_hidden_priced_id FROM _fix2)) INTO v_visible;
  IF v_visible IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Cell 15/round-4 LEAK: product_visible_to_caller() must return FALSE for Bob/r4-hidden-priced once the seller company is soft-deleted — got %', v_visible;
  END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- Cell 16 [round-4 finding #3] — a seller company with verification_status
-- <> 'verified' owning a profile_visible=true, price_public=true product must
-- be NEITHER visible NOR admissible. Under the ruled design all three new
-- terms (company deleted_at, company verification_status, location) sit in
-- product_visible_to_caller()'s BUYER ARM — the same function
-- get_discoverable_shop() is being made to agree with term-for-term
-- (get_discoverable_shop() joins company ON c.verification_status =
-- 'verified', refusing an unverified seller's products outright) — so an
-- unverified seller's product is NOT VISIBLE at all, full stop, and
-- product_admissible_to_basket() is FALSE as a CONSEQUENCE of visibility
-- being false, not as an independent admission-layer check.
--
-- (Correction, same round: an earlier draft of this cell asserted
-- profile_visible=true alone kept the product visible regardless of the
-- seller's verification state, as a "precondition" before the real
-- assertion. That is the opposite of the shipped design and made the cell
-- fail on its own precondition once the fix landed — removed.)
--
-- Flip-and-restore control, not a "still visible" precondition: with the
-- seller UNVERIFIED, both functions must read FALSE; flip the seller to
-- 'verified' and BOTH must flip to TRUE for the SAME caller/product; restore.
-- This proves the fixture is real and reachable (so step 1's FALSE reading
-- isn't vacuous — a nonexistent product would also read FALSE) and that the
-- VERIFICATION term specifically is what is doing the work. Same
-- privileged-UPDATE-then-restore idiom as cell 21's owner guardrail.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_visible    boolean;
  v_admissible boolean;
BEGIN
  SELECT public.product_visible_to_caller((SELECT r4_unverified_id FROM _fix2)) INTO v_visible;
  IF v_visible IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Cell 16 step 1: with the seller company NEVER VERIFIED (verification_status=''pending''), product_visible_to_caller() must be FALSE — got %', v_visible;
  END IF;

  SELECT public.product_admissible_to_basket((SELECT r4_unverified_id FROM _fix2)) INTO v_admissible;
  IF v_admissible IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Cell 16/round-4 LEAK step 1: with the seller company NEVER VERIFIED, product_admissible_to_basket() must be FALSE — got %. get_discoverable_shop() would never surface this shop at all', v_admissible;
  END IF;
END $$;
RESET ROLE;

-- Flip the seller company to verified (privileged) — the control half: if
-- BOTH functions now read TRUE for the identical caller/product, step 1's
-- FALSE reading was genuinely caused by verification_status, not by a
-- missing or misresolved fixture.
UPDATE public.company SET verification_status = 'verified', verified_at = now()
 WHERE id = (SELECT r4_seller2_id FROM _fix2);

SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_visible    boolean;
  v_admissible boolean;
BEGIN
  SELECT public.product_visible_to_caller((SELECT r4_unverified_id FROM _fix2)) INTO v_visible;
  IF v_visible IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Cell 16 step 2 (control): once the seller company is flipped to verified, product_visible_to_caller() must flip to TRUE for the SAME caller/product — got %. If this fails, step 1''s FALSE reading was never proven to be caused by verification_status', v_visible;
  END IF;

  SELECT public.product_admissible_to_basket((SELECT r4_unverified_id FROM _fix2)) INTO v_admissible;
  IF v_admissible IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Cell 16 step 2 (control): once the seller company is flipped to verified, product_admissible_to_basket() must flip to TRUE for the SAME caller/product — got %', v_admissible;
  END IF;
END $$;
RESET ROLE;

-- Restore the seller company to never-verified (privileged). Nothing later
-- in this file reads seller2's state, but restoring matches the file's own
-- "mutate then restore" idiom (cell 6, cell 21) and leaves no ambiguity for
-- a future cell inserted after this one.
UPDATE public.company SET verification_status = 'pending', verified_at = NULL
 WHERE id = (SELECT r4_seller2_id FROM _fix2);

-- ============================================================================
-- Cell 17 [round-4 finding #4 — 🔴 EXPECTED RED — the disproven invariant] —
-- the two doors must agree: the set of products get_discoverable_shop(seller)
-- returns must equal the set for which product_visible_to_caller() is true,
-- for the same caller. Run once with the seller verified+live (both
-- non-empty, agreeing — the control) and once with the seller soft-deleted
-- (both must go empty). Round 3 claimed this invariant; round 4 disproved it.
--
-- The product carries an explicit `location` (unlike cells 14/16's fixtures):
-- get_discoverable_shop()'s "unfiled is not a shelf" clause
-- (20260822100000:332-334) withholds a NULL-location product from a
-- non-owner caller regardless of profile_visible, which would make the
-- BEFORE-mutation control disagree for a reason unrelated to round 4 —
-- setting location avoids tripping that unrelated gap here.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_shop_before    int;
  v_visible_before boolean;
BEGIN
  SELECT count(*) INTO v_shop_before
    FROM public.get_discoverable_shop((SELECT r4_seller3_id FROM _fix2)) g
   WHERE g.id = (SELECT r4_agree_id FROM _fix2);
  SELECT public.product_visible_to_caller((SELECT r4_agree_id FROM _fix2)) INTO v_visible_before;
  IF v_shop_before <> 1 OR v_visible_before IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Cell 17 precondition: with the seller verified+live, BOTH doors must agree and be non-empty (control) — get_discoverable_shop count=%, product_visible_to_caller=%', v_shop_before, v_visible_before;
  END IF;
END $$;
RESET ROLE;

UPDATE public.company SET deleted_at = now()
 WHERE id = (SELECT r4_seller3_id FROM _fix2);

SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_shop_after    int;
  v_visible_after boolean;
BEGIN
  SELECT count(*) INTO v_shop_after
    FROM public.get_discoverable_shop((SELECT r4_seller3_id FROM _fix2)) g
   WHERE g.id = (SELECT r4_agree_id FROM _fix2);
  IF v_shop_after <> 0 THEN
    RAISE EXCEPTION 'Cell 17: get_discoverable_shop() must be EMPTY once the seller company is soft-deleted — got % rows', v_shop_after;
  END IF;

  SELECT public.product_visible_to_caller((SELECT r4_agree_id FROM _fix2)) INTO v_visible_after;
  IF v_visible_after IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Cell 17/round-4 DISPROVEN INVARIANT: the two doors DISAGREE — get_discoverable_shop() is empty (0 rows) but product_visible_to_caller() still returns % for the SAME caller/product once the seller company is soft-deleted. product_visible_to_caller() never checks the seller company''s own deleted_at on the buyer arm', v_visible_after;
  END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- Cell 18 [F2 — ownership gate on get_my_basket_lines(), GREEN now] — Eva
-- (verified, unconnected — cell 5's persona) must see ZERO of Bob's lines via
-- get_my_basket_lines(), and her OWN line must be present — asserted on the
-- specific line id, not a bare count, which would pass vacuously if Eva
-- simply had no lines of her own at all. get_my_basket_lines()'s ONLY
-- ownership guard is `where l.owner_person_id = auth.uid()`
-- (SECURITY DEFINER bypasses `basket_line_owner_all`), and nothing in the
-- repo asserts it.
-- ============================================================================
CREATE TEMP TABLE _fix3 ON COMMIT DROP AS
SELECT id AS bob_aur1b_line_id
  FROM public.product_basket_line
 WHERE owner_person_id = '22222222-2222-2222-2222-222222222222'::uuid
   AND product_id = (SELECT aur1b_id FROM _fix);
GRANT SELECT ON _fix3 TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _fix3 WHERE bob_aur1b_line_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Cell 18 precondition: Bob''s cell-1 AUR-1B line was not found — fixture drift';
  END IF;
END $$;

-- Eva adds her OWN line on AUR-1B (public+priced; no connection required —
-- profile_visible=true alone satisfies the buyer arm).
SELECT set_config('request.jwt.claim.sub', (SELECT eva_id::text FROM _fix), true);
SELECT set_config('request.jwt.claims', '{"sub":"' || (SELECT eva_id::text FROM _fix) || '","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  INSERT INTO public.product_basket_line (owner_person_id, product_id, pack_count)
  VALUES ((SELECT eva_id FROM _fix), (SELECT aur1b_id FROM _fix), 1);
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', (SELECT eva_id::text FROM _fix), true);
SELECT set_config('request.jwt.claims', '{"sub":"' || (SELECT eva_id::text FROM _fix) || '","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_eva_own_count  int;
  v_bob_leak_count int;
BEGIN
  SELECT count(*) INTO v_eva_own_count FROM public.get_my_basket_lines() g
   WHERE g.product_id = (SELECT aur1b_id FROM _fix);
  IF v_eva_own_count <> 1 THEN
    RAISE EXCEPTION 'Cell 18: Eva must see her OWN AUR-1B line via get_my_basket_lines() — got % rows (control: proves the query mechanism is not vacuously empty)', v_eva_own_count;
  END IF;

  SELECT count(*) INTO v_bob_leak_count FROM public.get_my_basket_lines() g
   WHERE g.id = (SELECT bob_aur1b_line_id FROM _fix3);
  IF v_bob_leak_count <> 0 THEN
    RAISE EXCEPTION 'Cell 18/F2: Eva must see ZERO of Bob''s lines via get_my_basket_lines() — Bob''s AUR-1B line id leaked into Eva''s own result set';
  END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- Cell 19 [functional regression cover, GREEN now — T06/T07's shipped fix] —
-- a connected buyer (Bob) sees FULL detail on GreenLeaf's hidden product; the
-- relationship is then ended (soft-deleted); the SAME call must go dark on
-- product_name/cultivar/local_code_pzn, the line must still be PRESENT, and
-- the DELETE on that line must still SUCCEED — the ticket's explicit
-- "readable and deletable" consequence, exercised end-to-end through
-- get_my_basket_lines() + a real DELETE rather than product_visible_to_caller
-- in isolation. Nothing in the repo currently asserts this (grep: 0 hits).
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  INSERT INTO public.product_basket_line (owner_person_id, product_id, pack_count)
  VALUES ('22222222-2222-2222-2222-222222222222'::uuid, (SELECT r4_relend_id FROM _fix2), 1);
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_name text; v_cultivar text; v_pzn text;
BEGIN
  SELECT g.product_name, g.cultivar, g.local_code_pzn
    INTO v_name, v_cultivar, v_pzn
    FROM public.get_my_basket_lines() g
   WHERE g.product_id = (SELECT r4_relend_id FROM _fix2);
  IF v_name IS NULL OR v_cultivar IS NULL OR v_pzn IS NULL THEN
    RAISE EXCEPTION 'Cell 19 precondition: Bob (connected to GreenLeaf) must see FULL detail on the hidden product BEFORE the relationship ends — name=%, cultivar=%, pzn=%', v_name, v_cultivar, v_pzn;
  END IF;
END $$;
RESET ROLE;

-- End the GreenLeaf <-> StonePharm relationship (seed §5d) — privileged, soft
-- delete, same shape is_connected_to_company() checks (r.deleted_at is null).
DO $$
DECLARE v_ended int;
BEGIN
  UPDATE public.relationship
     SET deleted_at = now()
   WHERE status = 'active'
     AND deleted_at IS NULL
     AND company_a_id = LEAST('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid)
     AND company_b_id = GREATEST('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid);
  GET DIAGNOSTICS v_ended = ROW_COUNT;
  IF v_ended <> 1 THEN
    RAISE EXCEPTION 'Cell 19 precondition: expected to end exactly 1 relationship row (GreenLeaf<->StonePharm, seed 5d) — got %', v_ended;
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_name     text;
  v_cultivar text;
  v_pzn      text;
  v_found    int;
  v_deleted  int;
BEGIN
  SELECT count(*) INTO v_found FROM public.get_my_basket_lines() g
   WHERE g.product_id = (SELECT r4_relend_id FROM _fix2);
  IF v_found <> 1 THEN
    RAISE EXCEPTION 'Cell 19: Bob''s line must still be PRESENT after the relationship ends — got % rows', v_found;
  END IF;

  SELECT g.product_name, g.cultivar, g.local_code_pzn
    INTO v_name, v_cultivar, v_pzn
    FROM public.get_my_basket_lines() g
   WHERE g.product_id = (SELECT r4_relend_id FROM _fix2);
  IF v_name IS NOT NULL OR v_cultivar IS NOT NULL OR v_pzn IS NOT NULL THEN
    RAISE EXCEPTION 'Cell 19: get_my_basket_lines() must go dark (NULL name/cultivar/pzn) once the relationship ends — got name=%, cultivar=%, pzn=%', v_name, v_cultivar, v_pzn;
  END IF;

  DELETE FROM public.product_basket_line
   WHERE owner_person_id = '22222222-2222-2222-2222-222222222222'::uuid
     AND product_id = (SELECT r4_relend_id FROM _fix2);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 1 THEN
    RAISE EXCEPTION 'Cell 19: the DELETE on Bob''s now-dark line must still SUCCEED (WITH CHECK has no USING clause) — the ticket''s accepted "readable and deletable" consequence — got % rows affected', v_deleted;
  END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- Cell 21 [round-4 finding #4 — 🔴 EXPECTED RED — the location term] —
-- "unfiled is not a shelf" on the basket door too. A verified+live seller,
-- ACTIVELY connected to Bob (the buyer persona used in cells 14-17), owns a
-- product with location IS NULL, profile_visible=true, price_public=true.
-- get_discoverable_shop() already withholds a NULL-location product from a
-- non-owner caller (20260822100000:332-334, "UNFILED IS NOT A SHELF");
-- product_visible_to_caller() has no equivalent term at all — the third
-- divergence Muskan ruled must close alongside findings #1-#3.
--
-- Placed BEFORE cell 20: cell 21 never touches GreenLeaf (a fresh ephemeral
-- company, per L-012/L-033), so it has no ordering dependency on cell 20's
-- GreenLeaf mutation — but cell 20's own header says it is placed LAST of
-- all round-4 cells deliberately, so cell 21 goes here to keep that true.
-- ============================================================================
INSERT INTO public.company (id, name, country, verification_status, verified_at, created_by) VALUES
  ('c7000004-0000-0000-0000-000000000000'::uuid, 'T07 Round4 Seller (unfiled location)', 'DE', 'verified', now(), NULL);

INSERT INTO public.product (company_id, name, supplier_product_code, profile_visible, price_public, location) VALUES
  ('c7000004-0000-0000-0000-000000000000'::uuid, 'T07 Round4 Unfiled Product',       'T07-R4-UNFILED',       true, true, NULL),
  ('c7000004-0000-0000-0000-000000000000'::uuid, 'T07 Round4 Filed Sibling Product', 'T07-R4-FILED-SIBLING', true, true, 'T07-FIXTURE-LOC');

-- Same shape as cell 14-17's Bob<->seller relationship (not strictly required
-- for visibility here — profile_visible=true admits without a connection —
-- but the ticket's fixture spec calls for it explicitly, and it costs
-- nothing to include).
INSERT INTO public.relationship (company_a_id, company_b_id, initiated_by_company_id, status)
VALUES (
  LEAST('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'c7000004-0000-0000-0000-000000000000'::uuid),
  GREATEST('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'c7000004-0000-0000-0000-000000000000'::uuid),
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  'active'
);

CREATE TEMP TABLE _fix4 ON COMMIT DROP AS
SELECT
  'c7000004-0000-0000-0000-000000000000'::uuid AS r4_seller4_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'T07-R4-UNFILED')       AS r4_unfiled_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'T07-R4-FILED-SIBLING') AS r4_filed_sibling_id;
GRANT SELECT ON _fix4 TO authenticated;
GRANT SELECT ON _fix4 TO anon;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM _fix4 WHERE r4_unfiled_id IS NULL OR r4_filed_sibling_id IS NULL)
    THEN RAISE EXCEPTION 'FIXTURE: one or more T07 round-4 (cell 21) fixtures failed to resolve'; END IF;
END $$;

-- Positive control FIRST (B4-class): the FILED sibling (location set) must
-- be visible AND returned by get_discoverable_shop() — proves the fixture
-- company genuinely has a reachable product, so the headline assertion below
-- cannot pass merely because the company/fixture is vacuously empty.
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_sibling_visible    boolean;
  v_sibling_shop_count int;
BEGIN
  SELECT public.product_visible_to_caller((SELECT r4_filed_sibling_id FROM _fix4)) INTO v_sibling_visible;
  SELECT count(*) INTO v_sibling_shop_count
    FROM public.get_discoverable_shop((SELECT r4_seller4_id FROM _fix4)) g
   WHERE g.id = (SELECT r4_filed_sibling_id FROM _fix4);
  IF v_sibling_visible IS DISTINCT FROM true OR v_sibling_shop_count <> 1 THEN
    RAISE EXCEPTION 'Cell 21 precondition: the FILED sibling (location set) must be visible via product_visible_to_caller() AND returned by get_discoverable_shop() — visible=%, shop_count=%. Without this control the cell would pass vacuously if the fixture company had no reachable products at all', v_sibling_visible, v_sibling_shop_count;
  END IF;
END $$;
RESET ROLE;

-- The headline assertions: the UNFILED product (location IS NULL).
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_visible    boolean;
  v_admissible boolean;
  v_shop_count int;
BEGIN
  SELECT count(*) INTO v_shop_count
    FROM public.get_discoverable_shop((SELECT r4_seller4_id FROM _fix4)) g
   WHERE g.id = (SELECT r4_unfiled_id FROM _fix4);
  IF v_shop_count <> 0 THEN
    RAISE EXCEPTION 'Cell 21 precondition: get_discoverable_shop() must already withhold the UNFILED product (its own "unfiled is not a shelf" rule, 20260822100000:332-334) — got % rows; this cell is about product_visible_to_caller() lacking the SAME rule, not about get_discoverable_shop()', v_shop_count;
  END IF;

  SELECT public.product_visible_to_caller((SELECT r4_unfiled_id FROM _fix4)) INTO v_visible;
  IF v_visible IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Cell 21/round-4 LEAK: product_visible_to_caller() must return FALSE for Bob on a product with NO location (profile_visible=true, price_public=true, seller verified+live+connected) — got %. get_discoverable_shop() already withholds this exact row; product_visible_to_caller() has no matching term', v_visible;
  END IF;

  SELECT public.product_admissible_to_basket((SELECT r4_unfiled_id FROM _fix4)) INTO v_admissible;
  IF v_admissible IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Cell 21/round-4 LEAK: product_admissible_to_basket() must be FALSE for the same unfiled product — got %', v_admissible;
  END IF;
END $$;
RESET ROLE;

-- Owner guardrail, same cell: the seller's OWN unfiled product must stay
-- visible to THEM — the `or p.company_id = current_company_id()` half of the
-- new location term (the Unassigned pile must stay fileable for the owner,
-- per 20260822100000's own "UNFILED IS NOT A SHELF" comment). No auth.users
-- row exists for the ephemeral seller4 company, so the owner arm is proven by
-- temporarily re-pointing Bob's OWN person.company_id at seller4 — a
-- PRIVILEGED UPDATE (DEV-88 / 20260710120000 only revoked this column from
-- the `authenticated` role, not from the superuser this script connects as;
-- same "mutate then restore" idiom as cell 6's company.verification_status).
-- Restored immediately after; nothing later in this file depends on Bob's
-- company_id.
UPDATE public.person SET company_id = (SELECT r4_seller4_id FROM _fix4)
 WHERE id = '22222222-2222-2222-2222-222222222222'::uuid;

SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_owner_visible boolean;
BEGIN
  SELECT public.product_visible_to_caller((SELECT r4_unfiled_id FROM _fix4)) INTO v_owner_visible;
  IF v_owner_visible IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Cell 21 owner guardrail: the SELLER must still see their OWN unfiled product via product_visible_to_caller() — got %. The location term''s escape (or p.company_id = current_company_id()) must survive the fix, or the owner''s own Unassigned pile becomes unfileable', v_owner_visible;
  END IF;
END $$;
RESET ROLE;

-- Restore Bob's real company_id (privileged — same reasoning as above).
UPDATE public.person SET company_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid
 WHERE id = '22222222-2222-2222-2222-222222222222'::uuid;

-- ============================================================================
-- Cell 20 [guardrail, GREEN now and MUST STAY green after the round-4 fix] —
-- the owner arm must survive the fix for findings #1/#2/#3/#4. Alice's OWN
-- company (GreenLeaf) is soft-deleted, then unverified — in BOTH states,
-- product_visible_to_caller() must still return TRUE for Alice on her OWN
-- product. This is the rail: the fix belongs on the BUYER arm only
-- (20260823100000's header: "the fix must go on the buyer arm ONLY"); a
-- future editor who hoists a company-liveness/verification check above BOTH
-- arms would lock every seller out of their own catalogue the moment their
-- own company is soft-deleted or goes back to pending review.
--
-- Placed LAST among the round-4 cells and mutates the shared GreenLeaf seed
-- row deliberately — this is the final assertion cell before the closing
-- NOTICE + ROLLBACK, so nothing downstream depends on GreenLeaf's restored
-- state. Reuses `noprice_id` (T07-NOPRICE, Alice's own product) read-only —
-- no earlier cell's assertion on that row is disturbed by a SELECT.
-- ============================================================================
UPDATE public.company SET deleted_at = now()
 WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_visible boolean;
BEGIN
  SELECT public.product_visible_to_caller((SELECT noprice_id FROM _fix)) INTO v_visible;
  IF v_visible IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Cell 20: Alice must still see her OWN product via product_visible_to_caller() while GreenLeaf itself is SOFT-DELETED — the owner arm must not be gated on the seller company''s own deleted_at. Got %', v_visible;
  END IF;
END $$;
RESET ROLE;

UPDATE public.company SET deleted_at = NULL, verification_status = 'pending'
 WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_visible boolean;
BEGIN
  SELECT public.product_visible_to_caller((SELECT noprice_id FROM _fix)) INTO v_visible;
  IF v_visible IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Cell 20: Alice must still see her OWN product via product_visible_to_caller() while GreenLeaf is UNVERIFIED (verification_status=''pending'') — the owner arm bypasses verification entirely, matching cell 6''s precedent for the INSERT-side owner arm. Got %', v_visible;
  END IF;
END $$;
RESET ROLE;

DO $$
BEGIN
  RAISE NOTICE 'ALL BASKET_ADMISSION TESTS PASSED';
END $$;

ROLLBACK;
SELECT 'ALL BASKET_ADMISSION TESTS PASSED' AS result;
