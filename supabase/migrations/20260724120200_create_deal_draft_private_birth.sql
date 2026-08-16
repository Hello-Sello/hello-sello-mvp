-- ============================================================================
-- Phase 12 · birth is private: slim create_deal_draft (A1 / D-04, D-05)
-- (Ayush, 2026-07-24)
-- ----------------------------------------------------------------------------
-- Re-emits the FULL live create_deal_draft body VERBATIM (from
-- 20260720100100_create_deal_draft_delivers.sql - the current live definition,
-- the one that added the birth-time deliver_deal call; NOT any earlier body)
-- with FIVE deltas that make birth PRIVATE (D-04). Delivery moves wholesale to
-- the new send_deal (next migration in this wave, D-06):
--
--   (a) the deal_card INSERT births status 'unsent' (was 'draft'; D-01 retires
--       the 'draft' code entirely - the vocab migration earlier in this wave
--       owns the lookup rows + backfill);
--   (b) the counterparty co-owner deal_member insert is DELETED - the co-owner
--       joins at send;
--   (c) the chat_thread type 'deal' + opener 'workspace_created' system-message
--       insert is DELETED (and its now-unused v_thread declare with it) - the
--       birth-created deal chat is a RETIRED concept (D-05): a "deal chat" now
--       means ONLY a group created from the deal card. The thread insert is NOT
--       moved to send. Legacy birth-thread rows are deliberately LEFT in the DB
--       (D-05 discretion locked: leave) - they stay readable via the kept RLS
--       'deal' branch and are already hidden from the conversation list;
--   (d) the birth-time `perform public.deliver_deal(v_card)` call is DELETED -
--       send_deal owns the WHOLE delivery in ONE transaction (D-06);
--   (e) NEW: the picked counterparty person PERSISTS on the card as
--       metadata.counterparty_person_id (Open Q1 locked) - a draft reopened
--       later still knows its recipient; send_deal reads this stored fact
--       server-side (no client input at send, Open Q2).
--
-- KEPT unchanged: the card insert (initiating_company_id from session), line
-- items v1 (3f batch snapshot), deal_workspace ('company_wide'), the creator
-- deal_member, the 'Deal draft created.' log line, the note slots, and the
-- counterparty validation block - the person must still be a real person on
-- the OTHER side of the relationship, even though the member insert is gone.
--
-- Same signature -> CREATE OR REPLACE; additive migration, no file edited.
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

  -- 1 · the card (private draft, v1; thread_id null - attaches by relationship).
  --     Delta (e): the validated counterparty person persists in metadata under
  --     'counterparty_person_id' - the same guard the old co-owner insert used
  --     (a real person on the other side, never the creator themself). The send
  --     RPC reads this stored fact at send time.
  insert into public.deal_card (
    relationship_id, version, status, deal_type, initiating_company_id,
    value_net, currency, delivery_date_target, payment_terms_code,
    created_by, updated_by, metadata)
  values (
    p_relationship_id, 1, 'unsent', coalesce(p_deal_type, 'offer'), v_company,
    p_value_net, coalesce(p_currency, 'EUR'), p_due_date, p_payment_terms_code,
    v_uid, v_uid,
    (case when p_free_delivery then '{"free_delivery":true}'::jsonb else '{}'::jsonb end)
      || (case when p_counterparty_person_id is not null and p_counterparty_person_id <> v_uid
            then jsonb_build_object('counterparty_person_id', p_counterparty_person_id)
            else '{}'::jsonb end))
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

  -- 4 · the container, born PRIVATE: workspace + the creator owner only.
  --     Deltas (b)/(c): the counterparty co-owner joins at SEND, and no birth
  --     thread or opener message is created any more (see this file's header).
  insert into public.deal_workspace (deal_card_id, visibility, created_by)
  values (v_card, 'company_wide', v_uid)
  returning id into v_ws;

  -- the creator is an owner (their own side)
  insert into public.deal_member (deal_workspace_id, person_id, role, added_by_person_id)
  values (v_ws, v_uid, 'owner', v_uid);

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

  return v_card;
end;
$$;

grant execute on function public.create_deal_draft(
  uuid, text, numeric, text, timestamptz, text, boolean, jsonb, text, text, uuid
) to authenticated;
