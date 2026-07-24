-- ============================================================================
-- CR-02 (backend) · update_deal_draft — the in-place edit path for unsent drafts
-- (Ayush, 2026-07-24 · Wave 3a)
-- ----------------------------------------------------------------------------
-- WHY: an 'unsent' draft had NO real edit path. The pencil routed through
-- proposeDealChange, which stages a deal_pending_change and can never commit
-- before Send (the D-02 both-accept gate needs a counterparty vote that a
-- private draft has no one to give) — so the edit was lost and the card wedged.
-- edit_deal_draft was dropped in 20260724120800 with no replacement; this is
-- that replacement.
--
-- update_deal_draft rewrites the draft IN PLACE, exactly like a re-birth of the
-- same card:
--   · NO version bump (a draft has only v1; there is nothing to snapshot);
--   · NO deal_pending_change (that machinery is for post-Send negotiation);
--   · locked to the CREATING company while the card is still 'unsent'.
--
-- Guards, in order:
--   1. session identity (auth.uid() -> person.company_id; never client input);
--   2. FOR UPDATE lock on the card (a concurrent send/edit serializes here);
--   3. status = 'unsent' (only a private draft is editable in place);
--   4. caller company = initiating_company_id (only the creator edits).
--
-- The scalar + note + metadata write mirrors create_deal_draft's birth exactly:
--   · metadata MERGES (metadata - 'free_delivery') || {free_delivery} so
--     counterparty_person_id (the from-birth routing fact send_deal reads) and
--     any other key SURVIVE the edit — same merge shape as the IN-01 fix in
--     confirm_deal_change;
--   · the note versions into the creator's slot via the same v_a/v_b CASE.
--
-- The lines are rewritten by DELETE-then-reinsert at v_card.version (NOT a
-- hardcoded 1) using create_deal_draft's exact line-snapshot block.
--
-- ⚠️ CASCADE NOTE for the frontend caller (Region C): deal_line_item_private
-- (the per-line margin) is ON DELETE CASCADE off deal_line_item, so the DELETE
-- below DROPS those private rows. The server action must RE-WRITE
-- deal_line_item_private after calling update_deal_draft — exactly as createDeal
-- re-writes it after create_deal_draft returns the new line ids. This RPC does
-- NOT touch deal_line_item_private itself (it has no per-line margin input).
--
-- SECURITY DEFINER (bypasses the deal_card write revoke, D-09/CR-01) + grant to
-- authenticated. Additive migration; new object, after the wave's 1209xx files.
-- ============================================================================

create or replace function public.update_deal_draft(
  p_deal_card_id       uuid,
  p_value_net          numeric,
  p_currency           text,
  p_due_date           timestamptz,
  p_payment_terms_code text,
  p_free_delivery      boolean,
  p_lines              jsonb,
  p_note               text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_company uuid;
  v_card    record;
  v_a       uuid;
  v_b       uuid;
  v_line    jsonb;
  v_i       int := 0;
begin
  if v_uid is null then
    raise exception 'update_deal_draft: not authenticated';
  end if;
  select company_id into v_company from public.person where id = v_uid;
  if v_company is null then
    raise exception 'update_deal_draft: caller has no company';
  end if;

  -- lock the card (a concurrent send/edit serializes on this lock)
  select * into v_card from public.deal_card where id = p_deal_card_id for update;
  if v_card.id is null then
    raise exception 'update_deal_draft: deal not found';
  end if;

  -- only a PRIVATE draft is editable in place (post-Send changes go through the
  -- propose/confirm negotiation path)
  if v_card.status <> 'unsent' then
    raise exception 'update_deal_draft: only an unsent draft can be edited';
  end if;

  -- only the creator may edit their own draft
  if v_company is distinct from v_card.initiating_company_id then
    raise exception 'update_deal_draft: only the creating company can edit this draft';
  end if;

  -- the two company keys, for the note-slot CASE (same shape as create_deal_draft)
  select company_a_id, company_b_id into v_a, v_b
  from public.relationship where id = v_card.relationship_id;

  -- 1 · the scalar + metadata + note write (mirrors create_deal_draft birth).
  --     metadata MERGES so counterparty_person_id and other keys survive.
  update public.deal_card
  set value_net = p_value_net,
      currency = coalesce(p_currency, 'EUR'),
      delivery_date_target = p_due_date,
      payment_terms_code = p_payment_terms_code,
      metadata = (metadata - 'free_delivery')
                 || (case when p_free_delivery then '{"free_delivery":true}'::jsonb else '{}'::jsonb end),
      note_company_a = case when v_company = v_a then nullif(btrim(p_note), '') else note_company_a end,
      note_company_b = case when v_company = v_b then nullif(btrim(p_note), '') else note_company_b end,
      updated_by = v_uid,
      updated_at = now()
  where id = p_deal_card_id;

  -- 2 · rewrite the lines in place: drop this version's lines then re-insert.
  --     Use v_card.version (a draft is v1, but never hardcode it). The
  --     deal_line_item_private CASCADE fires here (see header) — the frontend
  --     re-writes those rows after this returns.
  delete from public.deal_line_item
  where deal_card_id = p_deal_card_id and version = v_card.version;

  -- create_deal_draft's exact line-snapshot block (3f batch snapshot into the
  -- real columns; cultivar/pzn ride metadata; custom lines carry nulls).
  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb))
  loop
    insert into public.deal_line_item (
      deal_card_id, version, product_id, product_name, quantity, unit,
      unit_price, currency, sort_order,
      batch_id, batch_number, thc_percent, cbd_percent, metadata)
    values (
      p_deal_card_id, v_card.version,
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
end;
$$;

grant execute on function public.update_deal_draft(
  uuid, numeric, text, timestamptz, text, boolean, jsonb, text
) to authenticated;
