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
-- WHERE THE VISIBILITY RULE LIVES  (rewritten 2026-08-24 — see below)
-- ----------------------------------------------------------------------------
-- ⚠️ THIS SECTION USED TO SAY THE OPPOSITE. It argued that a bare
-- `exists (select 1 from public.product p where p.id = …)` inherits the rule
-- for free, because a policy subquery is RLS-filtered as the calling role, so
-- no predicate needed restating here. That reasoning died inside this same
-- commit and the text was not updated — the exact stale-rationale trap L-031
-- names. It is rewritten rather than deleted so the next reader knows which
-- of the two arguments won.
--
-- WHAT IS ACTUALLY TRUE NOW. `product_public_select`'s live qual is
-- `profile_visible = true` and nothing else — the ship gate's round 1 removed
-- the connection arm from it, because RLS filters ROWS, NOT COLUMNS, and every
-- admitted `product` row carries `rrp_per_gram`, `supplier_product_code` and
-- raw `metadata` that no sanctioned door returns (L-036). So the cascade this
-- section once relied on no longer carries the rule, and inheriting it "for
-- free" is not available at any price.
--
-- The rule therefore lives in ONE function — `product_visible_to_caller()`
-- below — evaluated `security definer` so basket admission never needs a
-- base-table read grant on `public.product`. That IS a second copy of the
-- predicate relative to `get_discoverable_shop`, and ADR-0005 §2 is right that
-- copies drift: round 4 caught these two drifting apart on three terms. The
-- containment is the comment on the buyer arm — the two must be diffed
-- term-for-term whenever either changes. It is a real cost, accepted
-- deliberately, not a thing this file gets for free.
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

-- ----------------------------------------------------------------------------
-- The admission predicate lives in ONE function, not in the policy body.
--
-- WHY A FUNCTION AND NOT AN RLS-FILTERED `EXISTS`: the policy's `exists` reads
-- `public.product`, and that read is itself subject to `product_public_select`.
-- Inheriting visibility that way only works if the base-table policy is wide
-- enough to admit a connected buyer's HIDDEN products — and widening it leaks
-- every column of those rows (`rrp_per_gram`, `supplier_product_code`,
-- `metadata`), because RLS filters rows, not columns. So the base-table policy
-- stays narrow (see 20260822100000) and the visibility rule moves in here,
-- where `security definer` lets it be evaluated without handing the caller a
-- readable row. The function returns a boolean and never a column.
--
-- `security definer` + `set search_path to ''` + fully-qualified names: the
-- house rule for every definer function in this schema.
-- ----------------------------------------------------------------------------
-- One statement of "may this caller SEE this product at all". Both the write
-- gate (admission, below) and the read projection (get_my_basket_lines) consult
-- it, so the rule has a single owner and cannot drift between them — the defect
-- that shipped a withdrawn product's current name back to a disconnected buyer.
--
-- `deleted_at is null` sits ABOVE both arms, so it gates the OWNER arm too.
-- The pre-2026-08-23 policy inherited the owner arm from `product_all`, which
-- carries no `deleted_at` term, so a seller could add their own SOFT-DELETED
-- product to a basket. That is now refused. Tightening, not loosening —
-- recorded so a future re-declare does not drop it by accident.
create or replace function public.product_visible_to_caller(p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1
      from public.product p
     where p.id = p_product_id
       and p.deleted_at is null
       and (
            -- Owner arm: the seller's own product, hidden or not.
            p.company_id = public.current_company_id()
            -- Buyer arm: made public, or revealed by a LIVE connection. Every
            -- term here is re-checked on each read, so ending the relationship
            -- takes the product back.
            --
            -- THIS ARM IS TERM-FOR-TERM `get_discoverable_shop`'s buyer filter
            -- (20260822100000). It must stay that way: this function claims to
            -- be the single owner of "may this caller see this product", and a
            -- single owner is a claim about AGREEMENT WITH THE OTHER DOORS, not
            -- about how few files hold the rule. Round 4 of the ship gate found
            -- three terms present there and absent here — the seller company's
            -- `deleted_at` and `verification_status`, and the unfiled rule —
            -- and a soft-deleted seller's HIDDEN product was still handing back
            -- its current name, cultivar, PZN and price through the basket
            -- while the shop door returned nothing. Before you add a term to
            -- either door, diff the two. (LEARNINGS L-038.)
         or (
              (p.profile_visible
               or public.is_connected_to_company(p.company_id))
              and (p.visibility_start is null or p.visibility_start <= current_date)
              and (p.visibility_end   is null or p.visibility_end   >= current_date)
              and public.is_caller_verified()
              -- The SELLER's company must still be live and verified. Neither
              -- `is_connected_to_company` (relationship row only) nor
              -- `is_caller_verified` (the CALLER's company) covers this.
              and exists (
                select 1
                  from public.company c
                 where c.id = p.company_id
                   and c.deleted_at is null
                   and c.verification_status = 'verified'
              )
              -- UNFILED IS NOT A SHELF — withheld from buyers, kept for the
              -- owner so the `Unassigned` pile stays fileable. The owner half
              -- is carried by the owner arm above, so a bare NOT NULL is right
              -- here and must not be hoisted out of this arm.
              and p.location is not null
            )
       )
  );
$$;

comment on function public.product_visible_to_caller(uuid) is
  'May the calling person see this product at all? Owner arm, or public/'
  'connection-revealed within its visibility window for a verified caller. '
  'The single owner of the visibility rule for basket write AND read.';

revoke all on function public.product_visible_to_caller(uuid) from public, anon;
grant execute on function public.product_visible_to_caller(uuid) to authenticated;

-- Admission = visible to the caller AND (their own product, or one carrying a
-- public price). `price_public` stays un-`or`-ed: decision 3 / PRD §6.5.
create or replace function public.product_admissible_to_basket(p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select public.product_visible_to_caller(p_product_id)
     and exists (
       select 1
         from public.product p
        where p.id = p_product_id
          and (p.company_id = public.current_company_id() or p.price_public)
     );
$$;

comment on function public.product_admissible_to_basket(uuid) is
  'T07: may the calling person put this product in a basket? Owner arm, or '
  'visible-to-caller AND price_public. Evaluated SECURITY DEFINER so basket '
  'admission never requires a base-table read grant on public.product — RLS '
  'filters rows, not columns, and those rows carry confidential fields.';

-- Both roles named deliberately: revoking from PUBLIC alone does NOT revoke
-- `anon` (the 2026-08-17 rule).
revoke all on function public.product_admissible_to_basket(uuid) from public, anon;
grant execute on function public.product_admissible_to_basket(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- The basket READ, curated.
--
-- WHY THIS EXISTS: admission (above) deliberately admits a connected seller's
-- HIDDEN product when it carries a public price — that is T07's capability. But
-- `product_public_select` does not admit that row (and must not: RLS filters
-- rows, not columns, and the row carries `rrp_per_gram`,
-- `supplier_product_code` and raw `metadata` — see 20260822100000). So a line
-- can be legitimately written and then not read back: a PostgREST embed off
-- `public.product` returns `product: null` for it, and the client's mapper
-- blanks the WHOLE basket on the resulting TypeError.
--
-- The answer is the same one the visibility fix used: go to a door that
-- PROJECTS. This function returns exactly the ten fields the drawer renders and
-- never a whole product row, so it can run `security definer` without
-- re-opening the leak. Ownership is enforced INSIDE, on auth.uid(), because
-- definer bypasses `basket_line_owner_all`.
-- ----------------------------------------------------------------------------
create or replace function public.get_my_basket_lines()
returns table (
  id                uuid,
  pack_count        numeric,
  pack_size_grams   numeric,
  product_id        uuid,
  product_name      text,
  cultivar          text,
  unit_code         text,
  local_code_pzn    text,
  seller_company_id uuid,
  seller_company_name text
)
language sql
stable
security definer
set search_path to ''
as $$
  select
    l.id,
    l.pack_count,
    l.pack_size_grams,
    p.id,
    -- The product's DETAILS are gated on live visibility, re-evaluated per
    -- read. `security definer` bypasses product RLS, so without this the row
    -- would keep surrendering the seller's CURRENT name, cultivar and PZN after
    -- the product was hidden, renamed, soft-deleted, or the relationship ended.
    -- The line itself still returns (id, counts, seller) so it stays visible
    -- and DELETABLE — the ticket's accepted consequence — but it goes dark.
    case when public.product_visible_to_caller(l.product_id) then p.name::text          end,
    case when public.product_visible_to_caller(l.product_id) then p.cultivar::text      end,
    case when public.product_visible_to_caller(l.product_id) then p.unit_code::text     end,
    case when public.product_visible_to_caller(l.product_id) then p.local_code_pzn::text end,
    p.company_id,
    c.name::text
  from public.product_basket_line l
  join public.product p on p.id = l.product_id
  left join public.company c on c.id = p.company_id
  -- Ownership gate: definer bypasses RLS, so this is the ONLY thing standing
  -- between the caller and someone else's cart. It is not optional.
  where l.owner_person_id = auth.uid()
  order by l.created_at;
$$;

comment on function public.get_my_basket_lines() is
  'T07: the caller''s own basket lines, projected to the ten fields the drawer '
  'renders. SECURITY DEFINER so a legitimately-admitted HIDDEN product still '
  'reads back without widening product_public_select; confidential product '
  'columns (rrp_per_gram, supplier_product_code, metadata) are never selected.';

-- Both roles named deliberately: revoking from PUBLIC alone does NOT revoke
-- `anon` (the 2026-08-17 rule).
revoke all on function public.get_my_basket_lines() from public, anon;
grant execute on function public.get_my_basket_lines() to authenticated;

create policy basket_line_admission on public.product_basket_line
  as restrictive for all to authenticated
  -- NO `using` clause — the shape decision, not an omission. See the header.
  with check (
    public.product_admissible_to_basket(product_basket_line.product_id)
  );

comment on policy basket_line_admission on public.product_basket_line is
  'T07: restrictive admission gate. The whole predicate lives in '
  'product_admissible_to_basket() so it is stated exactly once and needs no '
  'base-table read grant on public.product. WITH CHECK only, no USING, so an existing line '
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
