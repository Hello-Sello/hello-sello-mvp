-- ============================================================================
-- Connection overrides profile_visible (0022-buyer-shop-view, T06)
-- ----------------------------------------------------------------------------
-- `product.profile_visible = false` stops meaning "nobody but the owner" and
-- starts meaning "visible to companies I am NOT connected to". An ACTIVE,
-- non-soft-deleted company relationship overrides the flag.
--
-- Connection reveals PRODUCTS, never PRICES: `price_public` is left untouched
-- everywhere, so a connected buyer on a price-hidden product still gets no
-- price and no tiers.
--
-- THE RULE IS WRITTEN ONCE (`is_connected_to_company`) AND APPLIED AT EXACTLY
-- THREE SITES:
--   1. the `product_public_select` RLS policy   (a direct table read)
--   2. `current_pricelist_item`'s public arm    (the price/tier view)
--   3. `get_discoverable_shop`'s profile_visible term (the buyer's shop RPC)
--
-- ⚠️ THE VISIBILITY WINDOW STAYS OUTSIDE THE OVERRIDE PARENTHESIS at every
-- site. "When a product's visibility window has expired, connection shall not
-- override it." Folding the window inside the `or` would break that, and no
-- amount of non-expiring seed data would notice.
--
-- Two independent hardening items ride along because they sit inside this
-- migration's blast radius:
--   S3. the G3-SIGNED VERIFICATION TIGHTENING on site 1 — today ANY
--       authenticated company member, verified or not, reads every
--       `profile_visible` product in the database. `is_caller_verified()` is
--       absent from the live policy; it is added here.
--       ⚠️ THIS REMOVES READS FROM LIVE CALLERS, in two classes, and it
--       CASCADES: `pricelist_item_public_select`, `product_image_public_select`
--       and `product_media_public_select` each nest
--       `EXISTS (SELECT 1 FROM product p …)`, and a policy subquery is
--       RLS-filtered as the CALLING role — so one edit here propagates into
--       all three with no edit to them. `plit_public_select` nests the same
--       EXISTS but is NOT in that set: it already inlines
--       `public.is_caller_verified()` itself (`20260814120000:74`), so this
--       edit changes nothing for it. The ledger states the same three. Members of an UNVERIFIED company and
--       COMPANYLESS authenticated callers lose cross-company reads of
--       `product`, `product_image`, `product_media` and `pricelist_item`.
--       Both classes are named in docs/deploy/cloud-migrations-pending.md.
--       The converse does NOT propagate: each nested predicate restates
--       `p.profile_visible = true` itself, so the override stays local.
--   S4. `anon`'s table-level SELECT grant on `product_media`. `anon` is
--       blocked from that table today only INCIDENTALLY — it fails with
--       "permission denied for table product", a privilege error raised
--       inside the policy expression, not a policy decision. Re-grant SELECT
--       on `product` and the door opens. Closed deliberately below.
--
-- S5 — every object below was diffed against its LIVE body on the local stack
-- immediately before this file was written, never re-typed from the migration
-- that first declared it:
--   * `product_public_select`  → pg_policies.qual  (byte-identical to the
--     rev-1 capture; only the two intended terms differ below)
--   * `current_pricelist_item` → pg_get_viewdef (base = 20260816190000, live
--     deparse identical); re-created WITH (security_barrier = true) — see below
--   * `get_discoverable_shop`  → pg_get_functiondef (base = 20260822090000,
--     live deparse identical); rewritten TWICE on 2026-08-22, so this diff was
--     taken hours after the last change, mechanically, one predicate delta.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. The helper. NEW — `public.is_connected_to_company(uuid)` did not exist.
--
-- `shares_connection_with_company(uuid)` exists and is deliberately NOT reused:
-- it ignores `r.status`, ignores `r.deleted_at`, and returns true for a merely
-- PENDING inbox item. Each of those alone would silently widen this override
-- past its own criteria (a suspended / ended / soft-deleted / pending
-- relationship must never reveal a hidden product). Its own job — Discover's
-- "do we have any history with this company" chrome — is a deliberately looser
-- question, and changing it would rewrite a different ticket's contract.
--
-- SECURITY INVOKER (i.e. no `security definer`) is a SIGNED decision, not an
-- oversight: `rel_all` already lets a company member read their own
-- `relationship` rows under RLS, so there is nothing for DEFINER to bypass, and
-- INVOKER is the smaller privilege.
--
-- `least`/`greatest` rather than `in (company_a_id, company_b_id)`: the table
-- carries CHECK (company_a_id < company_b_id), so the pair is canonically
-- ordered and the two-column equality is exact and index-friendly. That CHECK
-- is also what makes an explicit companyless guard unnecessary — with a NULL
-- caller the predicate collapses to `a = X AND b = X`, which the CHECK makes
-- unsatisfiable. And it is why this helper can never supply the OWNER arm:
-- a self-pair `a < a` cannot exist, so is_connected_to_company(own company) is
-- always false. The owner arms stay separate, spelled out at their own sites.
-- ----------------------------------------------------------------------------
create or replace function public.is_connected_to_company(p_company_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.relationship r
    where r.status = 'active'
      and r.deleted_at is null
      and r.company_a_id = least(public.current_company_id(), p_company_id)
      and r.company_b_id = greatest(public.current_company_id(), p_company_id)
  );
$$;

-- Full 3-statement grant ritual (sec01 pattern, 20260617090000): REVOKE FROM
-- public does NOT revoke `anon` here — a 2-statement copy is how 20260618120100
-- reopened the anon door.
revoke all     on function public.is_connected_to_company(uuid) from public;
grant  execute on function public.is_connected_to_company(uuid) to authenticated;
revoke execute on function public.is_connected_to_company(uuid) from anon;

-- ----------------------------------------------------------------------------
-- 1. SITE 1 — product_public_select (RLS on public.product).
--
-- Diff against the live qual, term by term:
--   * `profile_visible = true` — UNCHANGED. The connection override is
--     deliberately NOT applied here. RLS on a base table filters ROWS, not
--     COLUMNS: any row this policy admits is handed over whole, including
--     `rrp_per_gram`, `supplier_product_code` and `metadata` — three columns
--     the buyer's sanctioned door (`get_discoverable_shop`, a 27-column
--     projection) withholds on purpose. Widening this policy therefore leaks
--     a per-gram price for a product whose seller set `price_public = false`,
--     defeating "connection reveals the product, never the price" through a
--     column the price gate never covered. The override belongs only at doors
--     that project an explicit column list.
--   * `+ and public.is_caller_verified()` — the tightening (NEW; absent live)
--   * `deleted_at` and BOTH window terms — byte-identical, deliberately
--     re-stated in the same order.
--
-- `product_all` (the owner policy) is NOT touched. It is not
-- verification-gated, which is what makes "a seller reads their own catalogue
-- even if their own company is not yet verified" hold for free.
-- ----------------------------------------------------------------------------
drop policy if exists product_public_select on public.product;
create policy product_public_select on public.product
  for select to authenticated
  using (
    deleted_at is null
    and profile_visible = true
    and (visibility_start is null or visibility_start <= current_date)
    and (visibility_end   is null or visibility_end   >= current_date)
    and public.is_caller_verified()
  );

-- ----------------------------------------------------------------------------
-- 2. SITE 2 — current_pricelist_item's public arm.
--
-- ONLY `p.profile_visible` is relaxed. `p.price_public` stays, un-`or`-ed:
-- that single term is the whole of "connection reveals the product, never the
-- price" — a connected buyer on a price-hidden product gets NO ROW from this
-- view, hence no price and no tiers. `is_caller_verified()` was already here
-- and stays; the owner arm was already here and stays.
--
-- ⚠️ RE-CREATED `WITH (security_barrier = true)`. The live view carries that
-- reloption, and `CREATE OR REPLACE VIEW` without a WITH clause SILENTLY DROPS
-- it. The guard is not in the body, so a body-to-body predicate diff comes back
-- clean while the barrier is gone — without it the planner may push a leaky
-- user-supplied function below this WHERE, i.e. below is_caller_verified() and
-- price_public. Owner-rights (NOT security_invoker) is deliberate, ADR-0004 §4.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.current_pricelist_item
WITH (security_barrier = true) AS
SELECT DISTINCT ON (pli.product_id)
  pli.id, pli.pricelist_id, pli.product_id, pli.price_per_gram, pli.currency,
  pli.updated_at,
  (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', t.id, 'min_grams', t.min_grams, 'price_per_gram', t.price_per_gram)
      ORDER BY t.min_grams), '[]'::jsonb)
     FROM public.pricelist_item_tier t
     WHERE t.pricelist_item_id = pli.id AND t.deleted_at IS NULL) AS tiers
FROM public.pricelist_item pli
JOIN public.pricelist pl ON pl.id = pli.pricelist_id
JOIN public.product p ON p.id = pli.product_id AND p.company_id = pl.company_id
WHERE pli.deleted_at IS NULL
  AND pl.deleted_at IS NULL
  AND (
    pl.company_id = public.current_company_id()          -- owner arm
    OR (                                                  -- public arm
      p.deleted_at IS NULL
      AND (p.profile_visible OR public.is_connected_to_company(p.company_id))
      AND (p.visibility_start IS NULL OR p.visibility_start <= current_date)
      AND (p.visibility_end   IS NULL OR p.visibility_end   >= current_date)
      AND p.price_public
      AND public.is_caller_verified()
    )
  )
ORDER BY pli.product_id, pl.published_at DESC NULLS LAST, pli.created_at DESC;

-- A replace does not reset grants; the ritual is re-issued anyway because the
-- one time it was skipped (20260618120100) is how the anon door reopened.
GRANT SELECT ON public.current_pricelist_item TO authenticated;
REVOKE ALL ON public.current_pricelist_item FROM anon;

-- ----------------------------------------------------------------------------
-- 3. SITE 3 — get_discoverable_shop's profile_visible term.
--
-- THREE ARMS, THREE DIFFERENT QUESTIONS — public / owner / connected. Do not
-- collapse them: the owner arm cannot come from the helper (self-pair, see
-- above) and the public arm is not a connection question at all.
--
-- CREATE OR REPLACE, never DROP + CREATE: a drop resets the grants. The
-- signature is unchanged, so a replace is legal and the 3-statement ritual
-- below is belt-and-braces rather than a repair.
--
-- Body below is the LIVE body (= 20260822090000, deparse-identical) with
-- exactly one predicate delta. The unfiled-location clause, the verified gate,
-- the window terms and the pack_sizes/media projections are all untouched.
-- ----------------------------------------------------------------------------
create or replace function public.get_discoverable_shop(p_company_id uuid)
returns table (
  id                 uuid,
  name               text,
  cultivar           text,
  thc_percent        numeric,
  cbd_percent        numeric,
  pack_size_grams    numeric,
  unit_code          text,
  local_code_pzn     text,
  dominance_code     text,
  country_of_origin  text,
  region             text,
  images             jsonb,   -- ordered [] of {id, path, position}; never null
  price_public       boolean, -- the seller's price dial, so the UI can tell
                              -- "price on request" from "price not set yet"
  price_per_gram     numeric, -- null unless price_public
  tiers              jsonb,   -- ordered [] of {id, min_grams, price_per_gram};
                              -- null unless price_public
  -- ---- T05: the specification set (AC 7) + location + media ----
  cbg_percent        numeric,
  cbn_percent        numeric,
  terpene_percent    numeric, -- manual column, else the representative lot's sum
  cultivator         text,
  lineage_parent_a   text,
  lineage_parent_b   text,
  irradiation_code   text,
  packaging_material text,
  resealable         boolean,
  location           text,    -- the seller's shelf name; produces the location tabs
  pack_sizes         jsonb,   -- ONLY metadata->'pack_sizes'; null when unset
  media              jsonb    -- ordered [] of {id, kind, path, url, label}; never null
)
language sql
stable
security definer
set search_path to ''
as $$
  select
    p.id,
    p.name::text,
    p.cultivar::text,
    p.thc_percent,
    p.cbd_percent,
    p.pack_size_grams,
    p.unit_code::text,
    p.local_code_pzn::text,
    p.dominance_code::text,
    p.country_of_origin::text,
    p.region::text,
    coalesce(imgs.images, '[]'::jsonb),
    p.price_public,
    case when p.price_public then v.price_per_gram end,
    case when p.price_public then v.tiers          end,
    p.cbg_percent,
    p.cbn_percent,
    -- manual first, representative-lot sum second (shop.ts:249)
    coalesce(p.terpene_percent, terp.terpene_sum),
    p.cultivator::text,
    p.lineage_parent_a::text,
    p.lineage_parent_b::text,
    p.irradiation_code::text,
    p.packaging_material::text,
    p.resealable,
    p.location::text,
    -- ONE named key, never the whole metadata blob (the leak rule)
    p.metadata -> 'pack_sizes',
    coalesce(med.media_items, '[]'::jsonb)
  from public.product p
  join public.company c
    on c.id = p.company_id
   and c.id = p_company_id
   and c.deleted_at is null
   and c.verification_status = 'verified'
  -- ordered image gallery; LEFT so a product with no images still returns ([])
  left join lateral (
    select jsonb_agg(
             jsonb_build_object('id', pi.id, 'path', pi.image_path, 'position', pi.position)
             order by pi.position
           ) as images
    from public.product_image pi
    where pi.product_id = p.id
  ) imgs on true
  -- ordered "Documents & media" list, mirroring imgs; LEFT + coalesce so a
  -- product with no media still returns and its card back renders empty.
  left join lateral (
    select jsonb_agg(
             jsonb_build_object(
               'id',    pm.id,
               'kind',  pm.kind,
               'path',  pm.path,
               'url',   pm.url,
               'label', pm.label
             )
             order by pm.position
           ) as media_items
    from public.product_media pm
    where pm.product_id = p.id
  ) med on true
  -- The representative lot, PICKED FIRST over live lots only…
  left join lateral (
    select pb.id as batch_id
    from public.product_batch pb
    where pb.product_id = p.id
      and pb.deleted_at is null
    order by pb.ready_for_sale_date desc nulls last, pb.created_at desc
    limit 1
  ) rep on true
  -- …THEN summed. No rows on that lot → sum over zero rows → NULL, which is
  -- what deriveTerpPercent returns for a lot with no terpene rows.
  left join lateral (
    select round(sum(coalesce(bt.percent, 0)), 2) as terpene_sum
    from public.batch_terpene bt
    where bt.product_batch_id = rep.batch_id
  ) terp on true
  -- the one current price row (+ ladder) — the view already picks
  -- published_at desc nulls last, created_at desc
  left join public.current_pricelist_item v
    on v.product_id = p.id
  where p.deleted_at is null
    -- THREE ARMS, THREE QUESTIONS: public / owner / connected. Attaches to
    -- profile_visible ONLY — the visibility WINDOW stays outside this
    -- parenthesis (T06 site 3; see the header).
    and (p.profile_visible = true
         or p.company_id = public.current_company_id()
         or public.is_connected_to_company(p.company_id))
    -- UNFILED IS NOT A SHELF. Withheld from buyers; the owner keeps it so the
    -- `Unassigned` pile stays fileable — see the header.
    and (p.location is not null or p.company_id = public.current_company_id())
    and (p.visibility_start is null or p.visibility_start <= current_date)
    and (p.visibility_end   is null or p.visibility_end   >= current_date)
    and public.is_caller_verified()
  order by p.name;
$$;

revoke all     on function public.get_discoverable_shop(uuid) from public;
grant  execute on function public.get_discoverable_shop(uuid) to authenticated;
revoke execute on function public.get_discoverable_shop(uuid) from anon;

-- ----------------------------------------------------------------------------
-- 4. S4 — close `anon`'s incidental SELECT on product_media.
--
-- ALTER POLICY (role list only) rather than DROP + CREATE: it makes "the
-- predicate is byte-identical" true BY CONSTRUCTION instead of by inspection.
-- Re-typing that nested EXISTS to change a role list would be the exact S5
-- failure family, for no gain.
--
-- `anon` also holds INSERT/UPDATE/DELETE on product_media, product and
-- product_image. Those are blocked by RLS with NO policy naming `anon` — that
-- is a real policy decision, not an accident, and is left alone. Only the
-- SELECT grant was the accidental one.
--
-- TRUNCATE is the exception and is NOT blocked by RLS: Postgres exempts that
-- verb from row security entirely, so the table grant alone gates it — and the
-- same grant that this comment relies on is what `anon` still holds. Not
-- reachable through PostgREST (it emits neither TRUNCATE nor DDL), so not a
-- live exploit; tracked as T11, which carries the proof (3 audit_log rows →
-- `set role anon; truncate` → 0 rows).
-- ----------------------------------------------------------------------------
alter policy product_media_public_select on public.product_media to authenticated;

revoke select on public.product_media from anon;
