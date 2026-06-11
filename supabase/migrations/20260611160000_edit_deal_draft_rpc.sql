-- ============================================================================
-- 3.5b · edit a deal: deal.amended audit code + edit_deal_draft(...) RPC
-- (Ayush, 2026-06-11)
-- ----------------------------------------------------------------------------
-- An edit is a NEW immutable version. This RPC, in ONE transaction, bumps
-- deal_card.version N->N+1, snapshots the new line items at N+1 (the old
-- version's lines stay frozen), carries the party-private boxes forward, writes
-- the editor's own value, and appends the log line + the MANDATORY change note.
-- It does NOT touch deal_confirmation: the gate is per-(card,version), so N+1
-- has no confirmations and both seats reset to pending automatically (3d re-runs
-- as-is). The card drops back to 'draft' so a previously-confirmed deal must be
-- re-confirmed after a change.
--
-- SECURITY DEFINER + an explicit relationship-membership gate (same reasoning as
-- create_deal_draft): the carry-forward COPIES the other side's private rows,
-- which RLS owner-only would forbid. The note is REQUIRED here (D2) - the RPC
-- raises if it is blank. Audit (deal.amended) stays in the app layer.
-- ============================================================================

INSERT INTO audit_action_type (code, description, category) VALUES
  ('deal.amended', 'A deal card was edited into a new version (re-negotiation)', 'lifecycle')
ON CONFLICT (code) DO NOTHING;

create or replace function public.edit_deal_draft(
  p_deal_card_id       uuid,
  p_value_net          numeric,
  p_currency           text,
  p_due_date           timestamptz,
  p_payment_terms_code text,
  p_free_delivery      boolean,
  p_lines              jsonb,
  p_private_value      text,
  p_note               text
) returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_company uuid;
  v_rel     uuid;
  v_a       uuid;
  v_b       uuid;
  v_old     int;
  v_new     int;
  v_log     uuid;
  v_line    jsonb;
  v_i       int := 0;
begin
  if v_uid is null then
    raise exception 'edit_deal_draft: not authenticated';
  end if;
  if p_note is null or length(btrim(p_note)) = 0 then
    raise exception 'edit_deal_draft: a note is required for every change';
  end if;

  select company_id into v_company from public.person where id = v_uid;
  if v_company is null then
    raise exception 'edit_deal_draft: caller has no company';
  end if;

  select dc.relationship_id, dc.version, r.company_a_id, r.company_b_id
    into v_rel, v_old, v_a, v_b
  from public.deal_card dc
  join public.relationship r on r.id = dc.relationship_id
  where dc.id = p_deal_card_id and dc.deleted_at is null;
  if v_rel is null then
    raise exception 'edit_deal_draft: card not found';
  end if;
  if v_company <> v_a and v_company <> v_b then
    raise exception 'edit_deal_draft: caller is not a member of this relationship';
  end if;

  v_new := v_old + 1;

  -- bump to the new version + back to draft (re-negotiation), with new scalars
  update public.deal_card
  set version = v_new,
      status = 'draft',
      value_net = p_value_net,
      currency = coalesce(p_currency, currency),
      delivery_date_target = p_due_date,
      payment_terms_code = p_payment_terms_code,
      metadata = case when p_free_delivery then '{"free_delivery":true}'::jsonb else '{}'::jsonb end,
      updated_by = v_uid,
      updated_at = now()
  where id = p_deal_card_id;

  -- snapshot the new line items at the new version (old version stays frozen)
  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb))
  loop
    insert into public.deal_line_item (
      deal_card_id, version, product_id, product_name, quantity, unit,
      unit_price, currency, sort_order, metadata)
    values (
      p_deal_card_id, v_new,
      nullif(v_line->>'productId', '')::uuid,
      v_line->>'productName',
      (v_line->>'quantity')::numeric,
      coalesce(v_line->>'unit', 'g'),
      nullif(v_line->>'unitPrice', '')::numeric,
      coalesce(v_line->>'currency', 'EUR'),
      v_i,
      jsonb_build_object(
        'cultivar', v_line->'cultivar',
        'pzn', v_line->'pzn',
        'thc_percent', v_line->'thcPercent',
        'cbd_percent', v_line->'cbdPercent'));
    v_i := v_i + 1;
  end loop;

  -- carry ALL private boxes forward (so the other side's is not lost)...
  insert into public.deal_party_field (
    deal_card_id, version, owner_company_id, party_side, field_key, field_label,
    value_text, sort_order, created_by)
  select deal_card_id, v_new, owner_company_id, party_side, field_key, field_label,
         value_text, sort_order, created_by
  from public.deal_party_field
  where deal_card_id = p_deal_card_id and version = v_old;

  -- ...then write the editor's own value at the new version
  if p_private_value is not null and length(btrim(p_private_value)) > 0 then
    update public.deal_party_field
    set value_text = btrim(p_private_value)
    where deal_card_id = p_deal_card_id and version = v_new
      and owner_company_id = v_company and field_key = 'supplier_cost';
    if not found then
      insert into public.deal_party_field (
        deal_card_id, version, owner_company_id, party_side, field_key,
        field_label, value_text, sort_order, created_by)
      values (
        p_deal_card_id, v_new, v_company, 'seller', 'supplier_cost',
        'Buying price (from supplier)', btrim(p_private_value), 0, v_uid);
    end if;
  end if;

  -- the change log line + the MANDATORY note
  insert into public.deal_card_log (
    deal_card_id, version, change_summary, origin, changed_by, changed_by_person_id)
  values (p_deal_card_id, v_new, 'Deal updated to v' || v_new || '.', 'deal_chat', 'person', v_uid)
  returning id into v_log;

  insert into public.deal_change_input (
    deal_card_id, log_id, party_person_id, note, submitted_at)
  values (p_deal_card_id, v_log, v_uid, btrim(p_note), now());

  return v_new;
end;
$$;

grant execute on function public.edit_deal_draft(
  uuid, numeric, text, timestamptz, text, boolean, jsonb, text, text
) to authenticated;
