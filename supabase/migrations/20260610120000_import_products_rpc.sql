-- ============================================================================
-- Migration — import_products(jsonb) RPC (Present surface, CSV bulk import)
-- ----------------------------------------------------------------------------
-- One atomic operation that turns N validated CSV rows into catalog rows. A
-- single row fans out across product + pricelist_item + product_batch +
-- batch_terpene + product_cost — bundling them in one function = one
-- transaction, so a mid-import failure rolls the whole thing back (no
-- half-imported catalog).
--
-- SECURITY INVOKER (default): RLS stays fully enforced. Every child table has a
-- company-scoped write policy (product_all / pli_all / batch_all /
-- product_cost_all / bterp_all), so the caller can only ever write into their
-- OWN company — the function sets company_id := current_company_id() and the
-- WITH CHECK policies verify it. No privilege escalation.
--
-- Input shape (one element per row), produced by src/modules/catalog/parse.ts:
--   { product:{...}, pricelist:{...}, productCost:{...}, batch:{...},
--     terpenes:[{name,pct}] }
-- ============================================================================

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
      rrp_per_gram, image_path, visibility_start, visibility_end, price_public,
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
      (v_prod->>'rrp_per_gram')::numeric, v_prod->>'image_path',
      (v_prod->>'visibility_start')::date, (v_prod->>'visibility_end')::date,
      coalesce((v_prod->>'price_public')::boolean, false),
      case when v_prod ? 'note'
           then jsonb_build_object('note', v_prod->>'note') else '{}'::jsonb end,
      auth.uid()
    ) returning id into v_product_id;

    if v_pl ? 'price_per_gram' then
      insert into pricelist_item (pricelist_id, product_id, price_per_gram,
        bundle_threshold_grams, bundle_price_per_gram, currency, created_by)
      values (v_pricelist, v_product_id, (v_pl->>'price_per_gram')::numeric,
        (v_pl->>'bundle_threshold_grams')::numeric,
        (v_pl->>'bundle_price_per_gram')::numeric, 'EUR', auth.uid());
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

-- anon has no company (the function would raise anyway); keep it off the anon API
revoke all on function public.import_products(jsonb) from public, anon;
grant execute on function public.import_products(jsonb) to authenticated;
