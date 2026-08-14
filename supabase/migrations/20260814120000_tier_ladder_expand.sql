-- ============================================================================
-- Tier ladder — Migration E (expand). ADR-0004 rev 8 §1–§3, PLAN-T01.
-- ----------------------------------------------------------------------------
-- Adds the pricelist_item_tier child table (volume-tier rungs on a pricelist
-- row), its RLS doors, the ladder-shape constraint triggers, the
-- save_price_ladder RPC, the current_pricelist_item view (single source for
-- "the current price row + its ladder"), the one-shot bundle→tier backfill,
-- and the dual-shape extensions of get_discoverable_shop / import_products.
--
-- ⚠️ CLOUD-PUSH PRECONDITION (T08 verifies; local `db reset` unaffected):
-- production's orphaned `buy_schema` rows must be repaired BEFORE this
-- migration is pushed to the cloud. No SQL here — precondition only.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table — house-column shape copied from pricelist_item (20260607090004).
-- ----------------------------------------------------------------------------
CREATE TABLE public.pricelist_item_tier (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pricelist_item_id UUID NOT NULL REFERENCES public.pricelist_item(id),
  min_grams         NUMERIC(12,2) NOT NULL CHECK (min_grams > 0),
  price_per_gram    NUMERIC(15,4) NOT NULL CHECK (price_per_gram > 0),
  created_by        UUID NULL REFERENCES public.person(id),
  updated_by        UUID NULL REFERENCES public.person(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ NULL,
  deleted_by        UUID NULL REFERENCES public.person(id)
);
CREATE UNIQUE INDEX uq_pricelist_item_tier_min ON public.pricelist_item_tier
  (pricelist_item_id, min_grams) WHERE deleted_at IS NULL;
CREATE INDEX idx_pricelist_item_tier_item ON public.pricelist_item_tier(pricelist_item_id);

-- ----------------------------------------------------------------------------
-- 2. Rituals — explicit RLS enable, updated_at trigger (the 20260607090005
--    attach loop is a hard-coded list; new tables wire explicitly), audit seed.
-- ----------------------------------------------------------------------------
ALTER TABLE public.pricelist_item_tier ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_pricelist_item_tier_set_updated_at
  BEFORE UPDATE ON public.pricelist_item_tier
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO auditable_content_type (code, description, target_table) VALUES
  ('pricelist_item_tier', 'A volume-tier rung on a pricelist row', 'pricelist_item_tier')
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. Helper + doors.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.owns_pricelist_item(p_pricelist_item_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pricelist_item pli
    JOIN public.pricelist pl ON pl.id = pli.pricelist_id
    WHERE pli.id = p_pricelist_item_id AND pl.company_id = public.current_company_id()
  );
$$;
REVOKE ALL ON FUNCTION public.owns_pricelist_item(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.owns_pricelist_item(uuid) TO authenticated;

CREATE POLICY plit_all ON public.pricelist_item_tier FOR ALL TO authenticated
  USING (public.owns_pricelist_item(pricelist_item_id))
  WITH CHECK (public.owns_pricelist_item(pricelist_item_id));

-- Public read mirrors pricelist_item_public_select (20260614180000) but inlines
-- the visibility window AND the verified-caller gate — the full set of the view's
-- public-arm conjuncts (G4 decision, 2026-08-14: tighter than parent-policy parity;
-- an authenticated-but-unverified company must not read ladders via direct table
-- reads when the view and RPC both deny it).
CREATE POLICY plit_public_select ON public.pricelist_item_tier
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.is_caller_verified()
    AND EXISTS (
      SELECT 1 FROM public.pricelist_item pli
      JOIN public.product p ON p.id = pli.product_id
      WHERE pli.id = pricelist_item_tier.pricelist_item_id
        AND pli.deleted_at IS NULL
        AND p.deleted_at IS NULL
        AND p.profile_visible = true
        AND p.price_public = true
        AND (p.visibility_start IS NULL OR p.visibility_start <= current_date)
        AND (p.visibility_end   IS NULL OR p.visibility_end   >= current_date)
    )
  );

REVOKE ALL ON public.pricelist_item_tier FROM anon;

-- ----------------------------------------------------------------------------
-- 4. Ladder-shape constraint triggers. One checker, both write directions:
--    child rung writes AND parent base-price edits. The FOR UPDATE lock comes
--    FIRST — without it two concurrent rung writes validate against snapshots
--    and both commit into a broken ladder (ADR §1). SECURITY INVOKER: the
--    caller can already see the parent via RLS (only owners can write).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_price_ladder_shape()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_parent uuid;
  v_base   numeric;
  v_prev   numeric;
  r        record;
BEGIN
  IF TG_TABLE_NAME = 'pricelist_item_tier' THEN
    v_parent := NEW.pricelist_item_id;
  ELSE
    v_parent := NEW.id;
  END IF;

  SELECT price_per_gram INTO v_base
    FROM public.pricelist_item WHERE id = v_parent FOR UPDATE;
  IF NOT FOUND THEN
    -- Unreachable today via RLS (writers always see their parent), but a NULL
    -- v_base would make the comparisons neither TRUE nor FALSE — pin it.
    RAISE EXCEPTION 'TIER_LADDER_SHAPE: pricelist item % not found', v_parent;
  END IF;

  v_prev := NULL;
  FOR r IN
    SELECT min_grams, price_per_gram FROM public.pricelist_item_tier
    WHERE pricelist_item_id = v_parent AND deleted_at IS NULL
    ORDER BY min_grams
  LOOP
    IF r.price_per_gram >= v_base THEN
      RAISE EXCEPTION 'TIER_LADDER_SHAPE: every tier price must be below the base price (tier % >= base %)',
        r.price_per_gram, v_base;
    END IF;
    IF v_prev IS NOT NULL AND r.price_per_gram >= v_prev THEN
      RAISE EXCEPTION 'TIER_LADDER_SHAPE: tier prices must strictly descend as min_grams rises (% then %)',
        v_prev, r.price_per_gram;
    END IF;
    v_prev := r.price_per_gram;
  END LOOP;

  RETURN NULL;  -- AFTER trigger
END $$;

-- Plain (non-deferred) AFTER ROW triggers: they run at end of statement, so a
-- multi-rung INSERT is validated against the complete new ladder.
CREATE TRIGGER trg_plit_ladder_shape
  AFTER INSERT OR UPDATE ON public.pricelist_item_tier
  FOR EACH ROW EXECUTE FUNCTION public.check_price_ladder_shape();

CREATE TRIGGER trg_pli_base_ladder_shape
  AFTER UPDATE OF price_per_gram ON public.pricelist_item
  FOR EACH ROW EXECUTE FUNCTION public.check_price_ladder_shape();

-- ----------------------------------------------------------------------------
-- 5. save_price_ladder — the one write path for "base + ladder" as a unit.
--    SECURITY INVOKER: RLS enforces ownership for free (the FOR UPDATE lookup
--    finds 0 rows for a non-owner). Delete-then-insert, not in-place UPDATE:
--    the partial unique index can't be deferred and a ladder shift (500→1000)
--    would trip it mid-statement (ADR §1).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_price_ladder(
  p_pricelist_item_id uuid, p_base numeric, p_tiers jsonb
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  -- 0. input validation before any write (the column is NOT NULL — without
  --    this a null base surfaces raw Postgres text, breaking the clear-message
  --    contract). Base 0 stays legal: free product, ladder unconstructible —
  --    the shape trigger enforces that.
  IF p_base IS NULL OR p_base < 0 THEN
    RAISE EXCEPTION 'TIER_LADDER_SHAPE: base price is required';
  END IF;

  -- 1. FIRST statement: serialize on the parent row. Concurrent saves queue
  --    here; RLS-hidden or nonexistent rows raise.
  PERFORM 1 FROM public.pricelist_item
    WHERE id = p_pricelist_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'save_price_ladder: pricelist item % not found or not yours', p_pricelist_item_id;
  END IF;

  -- 2. soft-delete the old ladder
  UPDATE public.pricelist_item_tier
    SET deleted_at = now(), deleted_by = auth.uid()
    WHERE pricelist_item_id = p_pricelist_item_id AND deleted_at IS NULL;

  -- 3. base price
  UPDATE public.pricelist_item
    SET price_per_gram = p_base, updated_by = auth.uid()
    WHERE id = p_pricelist_item_id;

  -- 4. new rungs (the shape trigger validates the complete ladder at end of
  --    this statement)
  INSERT INTO public.pricelist_item_tier
    (pricelist_item_id, min_grams, price_per_gram, created_by)
  SELECT p_pricelist_item_id,
         (t->>'min_grams')::numeric,
         (t->>'price_per_gram')::numeric,
         auth.uid()
  FROM jsonb_array_elements(COALESCE(p_tiers, '[]'::jsonb)) AS t;
EXCEPTION WHEN raise_exception THEN
  -- re-raise our own messages intact (keeps the TIER_LADDER_SHAPE: prefix the
  -- client maps to a clear message)
  RAISE EXCEPTION '%', SQLERRM USING ERRCODE = 'raise_exception';
END $$;

REVOKE ALL ON FUNCTION public.save_price_ladder(uuid, numeric, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_price_ladder(uuid, numeric, jsonb) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. current_pricelist_item — ONE owner-rights view answering "the current
--    price row for a product, with its ladder". Owner-rights (NOT
--    security_invoker) is deliberate (ADR §4): caller-rights would hit the
--    pricelist owner-only policy wall and buyers would get zero rows. The
--    security_definer_view advisor finding is accepted, pre-declared in the
--    ADR. Deliberately NO status_code filter (matches the live shop RPC).
-- ----------------------------------------------------------------------------
CREATE VIEW public.current_pricelist_item
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
      p.deleted_at IS NULL AND p.profile_visible
      AND (p.visibility_start IS NULL OR p.visibility_start <= current_date)
      AND (p.visibility_end   IS NULL OR p.visibility_end   >= current_date)
      AND p.price_public
      AND public.is_caller_verified()
    )
  )
ORDER BY pli.product_id, pl.published_at DESC NULLS LAST, pli.created_at DESC;

GRANT SELECT ON public.current_pricelist_item TO authenticated;
REVOKE ALL ON public.current_pricelist_item FROM anon;

-- ----------------------------------------------------------------------------
-- 7. Backfill — bundle brackets → tier rungs, as a SHIPPED, test-callable
--    function (criterion 2 is proven against this exact statement, not a
--    copy). Well-formed brackets become one rung; malformed ones are rescued
--    to metadata.legacy_bundle (recoverable), never rungs. The WHERE guard is
--    `(…) IS NOT TRUE`, not `NOT (…)`: half-filled brackets evaluate the
--    conjunction to NULL, and `NOT NULL` would silently skip the rescue.
--    Runs AFTER the shape trigger exists — well-formed brackets satisfy the
--    ladder by construction. Migration C (T08) drops this function.
-- ----------------------------------------------------------------------------
CREATE FUNCTION public.backfill_bundle_to_tiers()
RETURNS TABLE (migrated int, rescued int)
LANGUAGE plpgsql AS $$
DECLARE v_migrated int; v_rescued int;
BEGIN
  -- well-formed brackets → one rung each
  INSERT INTO public.pricelist_item_tier (pricelist_item_id, min_grams, price_per_gram, created_by)
  SELECT pli.id, pli.bundle_threshold_grams, pli.bundle_price_per_gram, pli.created_by
  FROM public.pricelist_item pli
  WHERE pli.deleted_at IS NULL
    AND (pli.bundle_threshold_grams > 0 AND pli.bundle_price_per_gram > 0
         AND pli.bundle_price_per_gram < pli.price_per_gram)
    AND NOT EXISTS (SELECT 1 FROM public.pricelist_item_tier t          -- idempotent
                    WHERE t.pricelist_item_id = pli.id AND t.deleted_at IS NULL);
  GET DIAGNOSTICS v_migrated = ROW_COUNT;

  -- malformed brackets → metadata.legacy_bundle (recoverable), never rungs
  UPDATE public.pricelist_item pli
  SET metadata = pli.metadata || jsonb_build_object('legacy_bundle',
        jsonb_build_object('threshold', pli.bundle_threshold_grams,
                           'price',     pli.bundle_price_per_gram))
  WHERE pli.deleted_at IS NULL
    AND (pli.bundle_threshold_grams IS NOT NULL OR pli.bundle_price_per_gram IS NOT NULL)
    AND (pli.bundle_threshold_grams > 0 AND pli.bundle_price_per_gram > 0
         AND pli.bundle_price_per_gram < pli.price_per_gram) IS NOT TRUE;
  GET DIAGNOSTICS v_rescued = ROW_COUNT;

  RAISE NOTICE 'tier backfill: % migrated to rungs, % rescued to legacy_bundle',
    v_migrated, v_rescued;
  RETURN QUERY SELECT v_migrated, v_rescued;
END $$;

SELECT * FROM public.backfill_bundle_to_tiers();          -- run once, in E
REVOKE ALL ON FUNCTION public.backfill_bundle_to_tiers() FROM public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 8. get_discoverable_shop — dual shape: legacy bundle columns AND tiers.
--    DROP + CREATE (the OUT column list changes → create or replace rejected).
--    Body = the sec01 def (20260617090000) with the price lateral replaced by
--    the current_pricelist_item view (single-owner row pick), legacy bundle
--    fields via one further join keyed off the view's picked row id, and the
--    visibility window added to WHERE (G3 sign-off 1). The RPC runs
--    search_path '' — everything public.-qualified; the view is owner-rights
--    so the join works regardless of caller.
-- ----------------------------------------------------------------------------
drop function if exists public.get_discoverable_shop(uuid);

create function public.get_discoverable_shop(p_company_id uuid)
returns table (
  id                     uuid,
  name                   text,
  cultivar               text,
  thc_percent            numeric,
  cbd_percent            numeric,
  pack_size_grams        numeric,
  unit_code              text,
  local_code_pzn         text,
  dominance_code         text,
  country_of_origin      text,
  region                 text,
  images                 jsonb,   -- ordered [] of {id, path, position}; never null
  price_public           boolean, -- the seller's price dial, so the UI can tell
                                  -- "price on request" from "price not set yet"
  price_per_gram         numeric, -- null unless price_public
  bundle_threshold_grams numeric,
  bundle_price_per_gram  numeric,
  tiers                  jsonb    -- ordered [] of {id, min_grams, price_per_gram};
                                  -- null unless price_public
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
    case when p.price_public then v.price_per_gram          end,
    case when p.price_public then pli2.bundle_threshold_grams end,
    case when p.price_public then pli2.bundle_price_per_gram  end,
    case when p.price_public then v.tiers                    end
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
  -- the one current price row (+ ladder) — the view already picks
  -- published_at desc nulls last, created_at desc
  left join public.current_pricelist_item v
    on v.product_id = p.id
  -- legacy bundle fields off the SAME picked row (no second lateral)
  left join public.pricelist_item pli2
    on pli2.id = v.id
  where p.deleted_at is null
    and p.profile_visible = true
    and (p.visibility_start is null or p.visibility_start <= current_date)
    and (p.visibility_end   is null or p.visibility_end   >= current_date)
    and public.is_caller_verified()
  order by p.name;
$$;

revoke all     on function public.get_discoverable_shop(uuid) from public;
grant  execute on function public.get_discoverable_shop(uuid) to authenticated;
revoke execute on function public.get_discoverable_shop(uuid) from anon;

-- ----------------------------------------------------------------------------
-- 9. import_products — re-declared from the LIVE body (20260610160000;
--    verified: no later re-declare). ONLY change: the pricelist_item insert
--    now RETURNs its id and dual-writes the bracket under the same guard as
--    the backfill — a well-formed bracket becomes a rung, anything else with a
--    value present is stamped metadata.legacy_bundle. Guard is on the
--    EXTRACTED VALUES, not key presence (a null-valued key must not stamp
--    legacy_bundle: {null, null}).
-- ----------------------------------------------------------------------------
create or replace function public.import_products(p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_company   uuid := current_company_id();
  v_pricelist uuid;
  v_row   jsonb;
  v_prod  jsonb;
  v_pl    jsonb;
  v_cost  jsonb;
  v_batch jsonb;
  v_terp  jsonb;
  v_product_id uuid;
  v_batch_id   uuid;
  v_terp_code  text;
  v_item_id uuid;
  v_thr     numeric;
  v_bpg     numeric;
  v_count int := 0;
begin
  if v_company is null then
    raise exception 'import_products: current user has no company';
  end if;

  -- one company-wide standard pricelist (create on first import)
  select id into v_pricelist
    from pricelist
    where company_id = v_company and deleted_at is null
    order by created_at asc limit 1;
  if v_pricelist is null then
    insert into pricelist (company_id, name, status_code, currency, published_at, created_by)
    values (v_company, 'Standard', 'published', 'EUR', now(), auth.uid())
    returning id into v_pricelist;
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_prod  := v_row->'product';
    v_pl    := v_row->'pricelist';
    v_cost  := v_row->'productCost';
    v_batch := v_row->'batch';

    insert into product (
      company_id, name, cultivar, thc_percent, cbd_percent, cbg_percent, cbn_percent,
      pack_size_grams, unit_code, supplier_product_code, local_code_pzn,
      dominance_code, irradiation_code, country_of_origin, region, cultivator,
      lineage_parent_a, lineage_parent_b, packaging_material, resealable,
      rrp_per_gram, visibility_start, visibility_end, price_public,
      metadata, created_by
    ) values (
      v_company,
      v_prod->>'name', v_prod->>'cultivar',
      (v_prod->>'thc_percent')::numeric, (v_prod->>'cbd_percent')::numeric,
      (v_prod->>'cbg_percent')::numeric, (v_prod->>'cbn_percent')::numeric,
      (v_prod->>'pack_size_grams')::numeric, v_prod->>'unit_code',
      v_prod->>'supplier_product_code', v_prod->>'local_code_pzn',
      v_prod->>'dominance_code', v_prod->>'irradiation_code',
      v_prod->>'country_of_origin', v_prod->>'region', v_prod->>'cultivator',
      v_prod->>'lineage_parent_a', v_prod->>'lineage_parent_b',
      v_prod->>'packaging_material', (v_prod->>'resealable')::boolean,
      (v_prod->>'rrp_per_gram')::numeric,
      (v_prod->>'visibility_start')::date, (v_prod->>'visibility_end')::date,
      coalesce((v_prod->>'price_public')::boolean, false),
      case when v_prod ? 'note'
           then jsonb_build_object('note', v_prod->>'note') else '{}'::jsonb end,
      auth.uid()
    ) returning id into v_product_id;

    -- CSV "Image filename" → cover image (position 0). Optional; skipped when blank.
    if coalesce(v_prod->>'image_path', '') <> '' then
      insert into product_image (product_id, company_id, image_path, position)
      values (v_product_id, v_company, v_prod->>'image_path', 0);
    end if;

    if v_pl ? 'price_per_gram' then
      v_thr := (v_pl->>'bundle_threshold_grams')::numeric;
      v_bpg := (v_pl->>'bundle_price_per_gram')::numeric;
      insert into pricelist_item (pricelist_id, product_id, price_per_gram,
        bundle_threshold_grams, bundle_price_per_gram, currency, created_by)
      values (v_pricelist, v_product_id, (v_pl->>'price_per_gram')::numeric,
        v_thr, v_bpg, 'EUR', auth.uid())
      returning id into v_item_id;
      if v_thr > 0 and v_bpg > 0 and v_bpg < (v_pl->>'price_per_gram')::numeric then
        insert into pricelist_item_tier (pricelist_item_id, min_grams, price_per_gram, created_by)
        values (v_item_id, v_thr, v_bpg, auth.uid());
      elsif v_thr is not null or v_bpg is not null then
        update pricelist_item set metadata = metadata
          || jsonb_build_object('legacy_bundle',
               jsonb_build_object('threshold', v_thr, 'price', v_bpg))
        where id = v_item_id;
      end if;
    end if;

    if v_cost ? 'cogs' then
      insert into product_cost (product_id, company_id, cogs, created_by)
      values (v_product_id, v_company, (v_cost->>'cogs')::numeric, auth.uid());
    end if;

    if v_batch ? 'batch_number' or v_batch ? 'thc_percent' then
      insert into product_batch (company_id, product_id, batch_number,
        thc_percent, cbd_percent, ready_for_sale_date, expiry_date, created_by)
      values (v_company, v_product_id, v_batch->>'batch_number',
        (v_batch->>'thc_percent')::numeric, (v_batch->>'cbd_percent')::numeric,
        (v_batch->>'ready_for_sale_date')::date, (v_batch->>'expiry_date')::date, auth.uid())
      returning id into v_batch_id;

      -- terpenes: resolve display name → terpene_code; skip unknowns (don't fail the import)
      for v_terp in select value from jsonb_array_elements(coalesce(v_row->'terpenes','[]'::jsonb))
      loop
        select code into v_terp_code from terpene
          where lower(code) = lower(replace(v_terp->>'name', ' ', '_'))
             or lower(name) = lower(v_terp->>'name')
          limit 1;
        if v_terp_code is not null then
          insert into batch_terpene (product_batch_id, terpene_code, percent)
          values (v_batch_id, v_terp_code, (v_terp->>'pct')::numeric);
        end if;
      end loop;
    end if;

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('imported', v_count, 'pricelist_id', v_pricelist);
end;
$$;

revoke all on function public.import_products(jsonb) from public, anon;
grant execute on function public.import_products(jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- 10. Repair list_discoverable_companies — BOTH doors (G3 sign-off 4).
--     * BODY gate: SEC-01 (20260617090000) added `public.is_caller_verified()`
--       to all three Discover RPCs, but 20260617150000 (connect scope)
--       re-declared this one from a pre-sec01 copy — silently dropping the
--       gate — and 20260618120100 (city) carried the gap forward. Live defect:
--       an UNVERIFIED authenticated caller could browse the whole verified
--       directory (cross_tenant_lockdown_test.sql §2 pins this). Body below is
--       the LIVE 20260618120100 def verbatim + exactly one predicate restored.
--     * GRANT gate: 20260618120100's DROP+CREATE re-granted anon EXECUTE via
--       default privileges and its footer never revoked anon — reopening the
--       GAP-1 door. Re-issue the full 3-statement ritual.
--     Repaired here because this migration already touches the function family
--     (ADR §3.3). T08's item is marked "done in T01".
-- ----------------------------------------------------------------------------
create or replace function public.list_discoverable_companies()
returns table (
  id uuid,
  name text,
  country text,
  city text,
  logo_path text,
  type_codes text[],
  connection_state text   -- 'none' | 'requested' | 'incoming' | 'connected'
)
language sql
stable
security definer
set search_path to ''
as $$
  select
    c.id,
    c.name::text,
    c.country::text,
    c.city::text,
    c.logo_path::text,
    coalesce(
      array_agg(distinct cta.company_type_code::text)
        filter (where cta.company_type_code is not null),
      '{}'
    ) as type_codes,
    case
      when exists (
        select 1 from public.relationship r
        where r.deleted_at is null and r.status = 'active'
          and r.company_a_id = least(public.current_company_id(), c.id)
          and r.company_b_id = greatest(public.current_company_id(), c.id)
      ) then 'connected'
      when exists (
        select 1 from public.pending_inbox_item p
        where p.deleted_at is null and p.status = 'pending'
          and p.type in ('connect', 'connect_message')
          and p.sender_company_id = public.current_company_id()
          and p.receiver_company_id = c.id
      ) then 'requested'
      when exists (
        select 1 from public.pending_inbox_item p
        where p.deleted_at is null and p.status = 'pending'
          and p.type in ('connect', 'connect_message')
          and p.sender_company_id = c.id
          and p.receiver_company_id = public.current_company_id()
      ) then 'incoming'
      else 'none'
    end as connection_state
  from public.company c
  left join public.company_type_assignment cta
    on cta.company_id = c.id and cta.deleted_at is null
  where c.deleted_at is null
    and c.verification_status = 'verified'
    and c.id is distinct from public.current_company_id()
    and public.is_caller_verified()
  group by c.id, c.name, c.country, c.city, c.logo_path
  order by c.name, c.id
  limit 200;
$$;

revoke all     on function public.list_discoverable_companies() from public;
grant  execute on function public.list_discoverable_companies() to authenticated;
revoke execute on function public.list_discoverable_companies() from anon;
