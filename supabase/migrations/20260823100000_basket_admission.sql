-- ============================================================================
-- Server-enforced basket admission (0022-buyer-shop-view, T07)
-- ----------------------------------------------------------------------------
-- `product_basket_line` carries exactly ONE policy today (20260707100000:26-30,
-- `basket_line_owner_all`). It answers "is this MY line?" and nothing else — it
-- never asks whether the caller may SEE the product, or may know its PRICE. So
-- any authenticated caller could POST /product_basket_line with any product_id,
-- a competitor's hidden product included, and the row was admitted. Nothing
-- downstream re-checked: the basket READ joins `product` (so RLS hides the
-- name), but the ROW existed, the count was wrong, and `toDraftLines` carried
-- it into a deal draft.
--
-- This migration adds a SECOND, RESTRICTIVE policy. `basket_line_owner_all` is
-- NOT re-declared and NOT altered — there is no `create or replace` anywhere in
-- this file, so the class that once silently stripped
-- `list_discoverable_companies()`'s verified gate cannot apply here.
--
-- ----------------------------------------------------------------------------
-- WHY THE PREDICATE DOES NOT RESTATE THE VISIBILITY RULE
-- ----------------------------------------------------------------------------
-- The visibility rule already exists, twice over, as the two `product` policies:
--
--   product_all            qual: company_id = current_company_id()
--   product_public_select  qual: deleted_at is null
--                                and (profile_visible or is_connected_to_company(company_id))
--                                and «visibility window» and is_caller_verified()
--
-- A policy subquery is RLS-FILTERED AS THE CALLING ROLE. So a bare
--
--     exists (select 1 from public.product p where p.id = …)
--
-- evaluates THROUGH whichever `product` policy applies to the caller — a buyer
-- gets T06's rule (visibility window, verified gate, connection override), the
-- seller gets `product_all` — with NO predicate duplicated here and NO edit
-- needed in this file when that rule next changes. This is the same cascade
-- 20260822100000 already relies on for `pricelist_item`, `product_image` and
-- `product_media`. A second authoritative copy of the visibility rule is the
-- failure ADR-0005 §2 fences; this avoids it by construction.
--
-- ONLY THE PRICE ARM IS NEW TEXT, because no `product` policy expresses it: a
-- buyer may not add a product whose price is hidden from them (decision 3,
-- PRD §6.5 — the rule is server-side; the hidden Add control is never the
-- gate). The SELLER may, including one that is hidden or has no price set at
-- all — hence the owner arm, for which the price rule is N/A.
--
-- ----------------------------------------------------------------------------
-- WHY `WITH CHECK` ONLY, AND DELIBERATELY NO `USING` CLAUSE
-- ----------------------------------------------------------------------------
-- The ticket accepts this consequence verbatim:
--
--   "a buyer can no longer edit the pack count of a line whose product became
--    invisible to them. PRD §7 puts that case out of scope for v1 — THE LINE
--    STAYS READABLE AND DELETABLE."
--
-- A restrictive FOR ALL policy WITH a `USING` clause would make that line
-- unreadable AND undeletable — silently delete-proofing rows and shrinking
-- baskets. Measured on this stack before this file was written (rolled-back
-- transaction, restrictive `for all … with check (false)` installed alongside
-- the owner policy):
--
--   SELECT  → 1 row visible                                    readable  ✓
--   INSERT  → ERROR: new row violates row-level security policy refused  ✓
--   DELETE  → DELETE 1, then 0 remaining                        deletable ✓
--
-- And `pg_policy.polqual` is genuinely NULL when `USING` is omitted: it does
-- NOT default to the `WITH CHECK` expression and does NOT default to `false`.
--
-- `WITH CHECK` runs on INSERT and on UPDATE's new row. SELECT and DELETE have
-- no `WITH CHECK` phase, so they are untouched BY CONSTRUCTION — which is why
-- this shape delivers the accepted consequence exactly rather than
-- approximately. `basket_admission_test.sql` cell 9 is the guard: it fails if
-- anyone later "tightens" this policy by adding a mirroring `USING`.
--
-- ----------------------------------------------------------------------------
-- WHY `FOR ALL`, NOT `FOR INSERT`, AND NOT A COLUMN-REVOKE
-- ----------------------------------------------------------------------------
-- `UPDATE` is granted table-wide to `authenticated`, so an INSERT-only policy
-- is ORNAMENTAL: a buyer inserts a legal line, then PATCHes its `product_id`
-- onto a hidden product — admission by another verb. `FOR ALL`'s `WITH CHECK`
-- covers the insert and the conflict-update path alike.
--
-- The column-REVOKE answer (the DEV-88 idiom) was tried and rejected: it BREAKS
-- the shipped add path. `addToBasket` (writes.ts) is a PostgREST upsert
-- (`onConflict: "owner_person_id,product_id"`), and `ON CONFLICT DO UPDATE`
-- requires UPDATE privilege on EVERY payload column — `product_id` included.
-- `FOR ALL` closes the hole with no privilege surgery at all.
-- ============================================================================

create policy basket_line_admission on public.product_basket_line
  as restrictive for all to authenticated
  -- NO `using` clause — the shape decision, not an omission. See the header.
  with check (
    exists (
      select 1
        from public.product p
       where p.id = product_basket_line.product_id
         and (
              -- Owner arm: the seller's own product. The price rule is N/A —
              -- hidden, price-hidden, or no price set at all are all fine.
              p.company_id = public.current_company_id()
              -- Buyer arm: decision 3 / PRD §6.5. Visibility itself is NOT
              -- restated — it rides the RLS-filtered EXISTS above.
           or p.price_public
         )
    )
  );

comment on policy basket_line_admission on public.product_basket_line is
  'T07: restrictive admission gate. Product visibility is inherited from the '
  'product RLS policies via the RLS-filtered EXISTS (never restated here); only '
  'the price arm is written. WITH CHECK only, no USING, so an existing line '
  'whose product later goes invisible stays readable and deletable — the '
  'ticket''s accepted consequence.';

-- ----------------------------------------------------------------------------
-- Grants: `anon` has no business here at all, and `authenticated` holds four
-- verbs it never uses — one of which is TRUNCATE.
-- ----------------------------------------------------------------------------
-- ⚠️ RLS DOES NOT REACH TRUNCATE. This is the whole reason a grant-level fix is
-- the ONLY fix available here. A policy is consulted per row, on SELECT /
-- INSERT / UPDATE / DELETE; TRUNCATE is a table-level operation and Postgres
-- checks the TRUNCATE privilege alone. So `basket_line_owner_all` — which asks
-- "is this MY line?" — and the new `basket_line_admission` policy above are
-- both structurally incapable of standing in the way. No policy that could be
-- written on this table would change that.
--
-- ⚠️ WHAT THIS DOES AND DOES NOT CLOSE. Tables get NO default PUBLIC grant.
-- Live `pg_class.relacl` for this table, queried before writing this line:
--
--   {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,
--    authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
--
-- — there is NO PUBLIC entry. The `from public` statement below is DEFENCE IN
-- DEPTH, not a door being closed. (The session-76/77 rule about a standing
-- PUBLIC grant is about EXECUTE ON FUNCTIONS, which is where 20260817120000
-- operates and where 20260822100000:102-107 applies it correctly. It does not
-- transfer to tables.)
--
-- ⚠️ WHAT IT DOES GENUINELY CLOSE — IN BOTH ROLES, which is the point.
-- `anon` AND `authenticated` each hold TRUNCATE on this table today
-- (`has_table_privilege(…, 'TRUNCATE')` → true for both, measured). Closing
-- only the signed-out role would have left the *reachable* one open: proven
-- with real rows during review — a signed-in buyer truncated a basket line
-- belonging to a seller he cannot see, because (per the note above) no policy
-- on this table can be consulted for TRUNCATE at all.
--
-- That is session 77's shape exactly — an audit aimed at `anon` while the same
-- grant sat one role over — so BOTH roles are closed here, which is what makes
-- the T11 claim in the next paragraph honest.
--
-- The three revokes below close ONE TABLE's instance of T11's class (`anon` and
-- `authenticated` hold TRUNCATE on ~90 tables). T11 still owns the sweep; it
-- just will not re-report `product_basket_line` as open, in either role.
--
-- ENUMERATED BEFORE REVOKING (the T09 method).
--   `anon` — nothing signed-out touches this table: `reads.ts:19-21` returns
--     `{groups: [], totalLineCount: 0}` BEFORE issuing any query when there is
--     no user, and `BasketProvider.tsx:23-25` catches regardless. The only
--     server-side toucher is `actions.ts:42`, a delete inside
--     `createBasketDraft`, which runs authenticated.
--   `authenticated` — the app's every use of this table is SELECT / INSERT /
--     UPDATE / DELETE (PostgREST emits nothing else; it has no TRUNCATE and no
--     DDL verb), so those four are re-stated as KEPT and only the four unused
--     verbs go. The named-verb form is deliberate: `revoke all` + re-`grant`
--     would put the app's four working verbs at the mercy of a re-grant list,
--     and a verb dropped there breaks the basket silently.
revoke all on public.product_basket_line from anon;
revoke all on public.product_basket_line from public;

-- KEPT for `authenticated`: SELECT, INSERT, UPDATE, DELETE — the whole basket
-- depends on them. REVOKED: the four it has never used. `MAINTAIN` is PG17+;
-- both this stack and the cloud project run engine 17 (checked, not assumed),
-- so the bare verb parses on both.
revoke truncate, references, trigger, maintain
  on public.product_basket_line from authenticated;
