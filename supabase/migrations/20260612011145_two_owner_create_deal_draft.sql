-- ============================================================================
-- Sella 4b · two-owner create_deal_draft  (Ayush, 2026-06-12)
-- ----------------------------------------------------------------------------
-- Completes the two-owner deal design (owners-as-data, locked 2026-06-10): a deal
-- has ONE owner per company side, present from BIRTH. The 3.5a create_deal_draft
-- inserted only the creator as owner and was never told the other side. This adds a
-- NULLABLE p_counterparty_person_id (the LAST arg, so the existing 10-arg call site
-- keeps working unchanged) and inserts that person as a second 'owner'. The SAME RPC
-- now serves the manual "+ Create a deal" AND the detected-deal birth (Sella 4b);
-- both pass the chat counterparty.
--
-- Backward compatible: counterparty null -> exactly the old behaviour (one owner).
-- Defensive: when given, the counterparty must be a real person on the OTHER side of
-- the relationship (define away "random person made an owner").
--
-- We DROP the 10-arg signature first: a different arg list is a NEW overload, not a
-- replacement, and leaving both would make a 10-arg call ambiguous.
-- Two owners are allowed: uq_deal_member_one_owner was dropped at 3b; the surviving
-- indexes are uq_deal_member_active (one row per person) + uq_deal_member_one_side_lead.
-- ============================================================================

drop function if exists public.create_deal_draft(
  uuid, text, numeric, text, timestamptz, text, boolean, jsonb, text, text
);

create or replace function public.create_deal_draft(
  p_relationship_id        uuid,
  p_deal_type              text,
  p_value_net              numeric,
  p_currency               text,
  p_due_date               timestamptz,
  p_payment_terms_code     text,
  p_free_delivery          boolean,
  p_lines                  jsonb,
  p_private_value          text,
  p_note                   text,
  p_counterparty_person_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_company    uuid;
  v_a          uuid;
  v_b          uuid;
  v_cp_company uuid;
  v_card       uuid;
  v_ws         uuid;
  v_thread     uuid;
  v_log        uuid;
  v_line       jsonb;
  v_i          int := 0;
begin
  if v_uid is null then
    raise exception 'create_deal_draft: not authenticated';
  end if;

  select company_id into v_company from public.person where id = v_uid;
  if v_company is null then
    raise exception 'create_deal_draft: caller has no company';
  end if;

  -- the gate that replaces RLS: caller must be a member of the relationship
  select company_a_id, company_b_id into v_a, v_b
  from public.relationship
  where id = p_relationship_id and deleted_at is null;
  if v_a is null then
    raise exception 'create_deal_draft: relationship not found';
  end if;
  if v_company <> v_a and v_company <> v_b then
    raise exception 'create_deal_draft: caller is not a member of this relationship';
  end if;

  -- when a co-owner is named, it MUST be a real person on the OTHER side
  if p_counterparty_person_id is not null and p_counterparty_person_id <> v_uid then
    select company_id into v_cp_company from public.person where id = p_counterparty_person_id;
    if v_cp_company is null then
      raise exception 'create_deal_draft: counterparty person not found';
    end if;
    if v_cp_company = v_company then
      raise exception 'create_deal_draft: counterparty must be on the other side of the relationship';
    end if;
    if v_cp_company <> v_a and v_cp_company <> v_b then
      raise exception 'create_deal_draft: counterparty company is not a member of this relationship';
    end if;
  end if;

  -- 1 · the card (draft, v1; thread_id null - attaches by relationship)
  insert into public.deal_card (
    relationship_id, version, status, deal_type, initiating_company_id,
    value_net, currency, delivery_date_target, payment_terms_code,
    created_by, updated_by, metadata)
  values (
    p_relationship_id, 1, 'draft', coalesce(p_deal_type, 'offer'), v_company,
    p_value_net, coalesce(p_currency, 'EUR'), p_due_date, p_payment_terms_code,
    v_uid, v_uid,
    case when p_free_delivery then '{"free_delivery":true}'::jsonb else '{}'::jsonb end)
  returning id into v_card;

  -- 2 · line items at v1 (price OPTIONAL; line_total is a GENERATED column)
  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb))
  loop
    insert into public.deal_line_item (
      deal_card_id, version, product_id, product_name, quantity, unit,
      unit_price, currency, sort_order, metadata)
    values (
      v_card, 1,
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

  -- 3 · the creator's own-side private box (seller: buying price from supplier)
  if p_private_value is not null and length(btrim(p_private_value)) > 0 then
    insert into public.deal_party_field (
      deal_card_id, version, owner_company_id, party_side, field_key,
      field_label, value_text, sort_order, created_by)
    values (
      v_card, 1, v_company, 'seller', 'supplier_cost',
      'Buying price (from supplier)', btrim(p_private_value), 0, v_uid);
  end if;

  -- 4 · the container, born at draft: workspace + BOTH owners + deal thread + opener
  insert into public.deal_workspace (deal_card_id, visibility, created_by)
  values (v_card, 'company_wide', v_uid)
  returning id into v_ws;

  -- the creator is an owner (their own side)
  insert into public.deal_member (deal_workspace_id, person_id, role, added_by_person_id)
  values (v_ws, v_uid, 'owner', v_uid);

  -- the counterparty co-owner (the other side), present from birth when known
  if p_counterparty_person_id is not null and p_counterparty_person_id <> v_uid then
    insert into public.deal_member (deal_workspace_id, person_id, role, added_by_person_id)
    values (v_ws, p_counterparty_person_id, 'owner', v_uid);
  end if;

  insert into public.chat_thread (relationship_id, type, deal_card_id)
  values (p_relationship_id, 'deal', v_card)
  returning id into v_thread;

  insert into public.chat_message (thread_id, sender, type, body)
  values (v_thread, 'system', 'workspace_created',
          'Deal draft created - the card is pinned above.');

  -- 5 · the creation log line (always) + the creator's note (optional at draft)
  insert into public.deal_card_log (
    deal_card_id, version, change_summary, origin, changed_by, changed_by_person_id)
  values (v_card, 1, 'Deal draft created.', 'deal_chat', 'person', v_uid)
  returning id into v_log;

  if p_note is not null and length(btrim(p_note)) > 0 then
    insert into public.deal_change_input (
      deal_card_id, log_id, party_person_id, note, submitted_at)
    values (v_card, v_log, v_uid, btrim(p_note), now());
  end if;

  return v_card;
end;
$$;

grant execute on function public.create_deal_draft(
  uuid, text, numeric, text, timestamptz, text, boolean, jsonb, text, text, uuid
) to authenticated;
