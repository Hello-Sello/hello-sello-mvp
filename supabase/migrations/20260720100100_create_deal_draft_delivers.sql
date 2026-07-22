-- ============================================================================
-- Lane A · birth → deliver: create_deal_draft now calls deliver_deal (A2)
-- (Muskan, 2026-07-20)
-- ----------------------------------------------------------------------------
-- Re-emits the FULL live create_deal_draft body VERBATIM (from
-- 20260618140000_deal_line_item_batch.sql — the current live definition with
-- the 3f batch snapshot; NOT the superseded 20260618130200) with ONE addition:
-- `perform public.deliver_deal(v_card);` just before `return v_card;` — after
-- the deal_member inserts, so the routing key (counterparty co-owner present?)
-- is final when deliver_deal reads it.
--
-- ONE birth path → ONE delivery call: confirm_detected_deal reuses this
-- function, so the Sella/proposal door is covered here too (its counterparty
-- co-owner makes deliver_deal a no-op — its own chat message is the delivery;
-- adding a second call there would double-deliver).
--
-- NOTE (transitional, until the person-delivery slice lands): the chat-panel
-- create door does not pass p_counterparty_person_id yet, so a p2p-chat birth
-- currently routes company-target (an inbox ticket). The basket door already
-- passes the person. The send-layer slice threads the person through the chat
-- door and posts the chat message instead.
--
-- Same signature → CREATE OR REPLACE; additive migration, no file edited.
-- ============================================================================

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
  --     3f (D-03/D-04): write the chosen batch's snapshot into the REAL columns
  --     (batch_id, batch_number, thc_percent, cbd_percent). Before 3f these
  --     measured values went only into dead metadata (latent bug); cultivar/pzn
  --     stay in metadata. Custom lines (productId null) carry nulls naturally.
  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb))
  loop
    insert into public.deal_line_item (
      deal_card_id, version, product_id, product_name, quantity, unit,
      unit_price, currency, sort_order,
      batch_id, batch_number, thc_percent, cbd_percent, metadata)
    values (
      v_card, 1,
      nullif(v_line->>'productId', '')::uuid,
      v_line->>'productName',
      (v_line->>'quantity')::numeric,
      coalesce(v_line->>'unit', 'g'),
      nullif(v_line->>'unitPrice', '')::numeric,
      coalesce(v_line->>'currency', 'EUR'),
      v_i,
      nullif(v_line->>'batchId', '')::uuid,
      nullif(v_line->>'batchNumber', ''),
      nullif(v_line->>'thcPercent', '')::numeric,
      nullif(v_line->>'cbdPercent', '')::numeric,
      jsonb_build_object(
        'cultivar', v_line->'cultivar',
        'pzn', v_line->'pzn'));
    v_i := v_i + 1;
  end loop;

  -- 3 · (RETIRED) the create-time deal_party_field private box is removed here
  --     (D-11/D-09): the per-line margin lives in deal_line_item_private now, so
  --     nothing reads deal_party_field after this phase. p_private_value is
  --     accepted-but-ignored; the per-line private rows are written by createDeal
  --     after this function returns the new deal_line_item ids.

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

  -- 5 · the creation log line (always, status string - unaffected by the note change)
  insert into public.deal_card_log (
    deal_card_id, version, change_summary, origin, changed_by, changed_by_person_id)
  values (v_card, 1, 'Deal draft created.', 'deal_chat', 'person', v_uid)
  returning id into v_log;

  -- NOTE-01 / D-05 / D-08: the create-time note versions on the card from
  -- birth (the creator's slot), NOT into deal_change_input (the log). The
  -- creator's company is structurally one of v_a/v_b; the else branch keeps
  -- the other slot at its default null.
  update public.deal_card
  set note_company_a = case when v_company = v_a then nullif(btrim(p_note), '') else note_company_a end,
      note_company_b = case when v_company = v_b then nullif(btrim(p_note), '') else note_company_b end
  where id = v_card;

  -- Lane A (A2): the ONE delivery call — after the deal_member inserts, so the
  -- routing key (counterparty co-owner present?) is final. Company-target →
  -- inbox ticket; person-target → no-op (the send layer posts the chat message).
  perform public.deliver_deal(v_card);

  return v_card;
end;
$$;

grant execute on function public.create_deal_draft(
  uuid, text, numeric, text, timestamptz, text, boolean, jsonb, text, text, uuid
) to authenticated;
