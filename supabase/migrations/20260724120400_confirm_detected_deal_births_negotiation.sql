-- ============================================================================
-- Phase 12 · confirm_detected_deal births straight into negotiation (D-07)
-- (Ayush, 2026-07-24)
-- ----------------------------------------------------------------------------
-- Re-emits the FULL live confirm_detected_deal body VERBATIM (from
-- 20260707130200_confirm_detected_deal_born_now.sql - the current live
-- definition carrying the born_now OUT flag + the 3f batch snapshot; NOT any
-- earlier body) with ONE delta (D-07): a deal born from the Sella double-accept
-- door is DELIVERED BY CONSTRUCTION - both sides just said yes - so after the
-- existing create_deal_draft call and the initiating_company_id correction to
-- the proposer, the born card is flipped 'unsent' -> 'negotiation' and the
-- counterparty co-owner deal_member joins the born workspace (mirroring what
-- the OLD birth RPC did and the slim one - 20260724120200, this wave - no
-- longer does). Belt (research A3): if the counterparty person is ever null,
-- `perform public.deliver_deal` writes the company-target inbox ticket instead.
--
-- This door must NEVER call send_deal: the caller here is the CONFIRMER, not
-- the initiator - send_deal's initiator guard (caller company must equal
-- initiating_company_id, which this function just corrected AWAY from the
-- confirmer to the proposer) would reject the call. The door does its own flip
-- + co-owner insert, atomically in the same transaction as the birth.
--
-- The signature is unchanged; the source used DROP + CREATE for its earlier
-- return-type change - that exact shape is kept (idempotent and safe: the only
-- caller is the app action confirmDetectedDeal; plpgsql bodies that reference
-- this function create no hard dependency).
-- ============================================================================

drop function if exists public.confirm_detected_deal(uuid, text);

create function public.confirm_detected_deal(
  p_message_id uuid,
  p_decision   text,             -- 'accept' | 'reject'
  out deal_card_id uuid,         -- the born deal_card id, or null if not yet both-accepted
  out born_now     boolean       -- true ONLY on the path that births the card now
)
returns record
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid      uuid := auth.uid();
  v_company  uuid;
  v_meta     jsonb;
  v_thread   uuid;
  v_rel      uuid;
  v_pa       uuid;  v_pb uuid;     -- the two p2p persons
  v_ca       uuid;  v_cb uuid;     -- the two companies
  v_cp       uuid;                 -- counterparty person (the co-owner)
  v_proposer uuid;                 -- the initiating side (offer/order direction)
  v_lines    jsonb;
  v_type     text;
  v_card     uuid;
  v_ws       uuid;                 -- the born workspace (D-07 co-owner insert)
begin
  born_now := false;              -- default for every non-birth exit
  if v_uid is null then
    raise exception 'confirm_detected_deal: not authenticated';
  end if;
  if p_decision not in ('accept', 'reject') then
    raise exception 'confirm_detected_deal: decision must be accept or reject';
  end if;

  -- lock the suggestion; read its state
  select metadata, thread_id into v_meta, v_thread
  from public.chat_message
  where id = p_message_id and type = 'deal_detected' and deleted_at is null
  for update;
  if v_thread is null then
    raise exception 'confirm_detected_deal: deal_detected message not found';
  end if;

  -- already born -> idempotent: hand back the existing card (born_now stays false)
  if v_meta ? 'born_deal_card_id' and v_meta->>'born_deal_card_id' is not null then
    deal_card_id := (v_meta->>'born_deal_card_id')::uuid;
    return;
  end if;

  -- the thread's two people + the relationship's two companies
  select relationship_id, person_a_id, person_b_id into v_rel, v_pa, v_pb
  from public.chat_thread where id = v_thread;
  if v_uid <> v_pa and v_uid <> v_pb then
    raise exception 'confirm_detected_deal: caller is not a participant in this thread';
  end if;
  select company_a_id, company_b_id into v_ca, v_cb from public.relationship where id = v_rel;
  select company_id into v_company from public.person where id = v_uid;

  -- record this side's vote (by company)
  if v_meta->'votes' is null then
    v_meta := jsonb_set(v_meta, '{votes}', '{}'::jsonb);
  end if;
  v_meta := jsonb_set(v_meta, array['votes', v_company::text], to_jsonb(p_decision));

  -- a reject just records the vote - no birth (born_now stays false)
  if p_decision = 'reject' then
    update public.chat_message set metadata = v_meta where id = p_message_id;
    deal_card_id := null;
    return;
  end if;

  -- both sides accepted? -> birth the Draft via the existing two-owner RPC
  if (v_meta->'votes'->>v_ca::text) = 'accept' and (v_meta->'votes'->>v_cb::text) = 'accept' then
    v_cp := case when v_uid = v_pa then v_pb else v_pa end;

    -- the proposer is the initiating side; detection rows have none -> the
    -- confirmer (unchanged behaviour).
    v_proposer := coalesce(nullif(v_meta->>'proposed_by_company', '')::uuid, v_company);

    -- 3f (BTCH-01 / D-04): carry the batch snapshot keys through to
    -- create_deal_draft. The draft line carries batchId / batchNumber /
    -- thcPercent / cbdPercent (set by proposeDeal); create_deal_draft reads them
    -- under those SAME key names and writes them into the real line columns.
    -- Without these four keys the proposal birth dropped the picked batch.
    select coalesce(jsonb_agg(jsonb_build_object(
             'productName', li->>'name',
             'quantity',    li->'quantity',
             'unit',        li->>'unit',
             'unitPrice',   li->'unit_price',
             'cultivar',    li->'cultivar',
             'pzn',         li->'pzn',
             'batchId',     li->'batchId',
             'batchNumber', li->'batchNumber',
             'thcPercent',  li->'thcPercent',
             'cbdPercent',  li->'cbdPercent')), '[]'::jsonb)
      into v_lines
      from jsonb_array_elements(coalesce(v_meta->'draft'->'line_items', '[]'::jsonb)) li;

    -- offer if the PROPOSER holds the catalogue (seller), else order (finer labelling parked)
    v_type := case
      when exists (select 1 from public.product
                   where company_id = v_proposer and deleted_at is null)
      then 'offer' else 'order' end;

    v_card := public.create_deal_draft(
      v_rel, v_type, null, coalesce(v_meta->'draft'->>'currency', 'EUR'),
      nullif(v_meta->'draft'->>'due_date', '')::timestamptz,           -- null for detection
      nullif(v_meta->'draft'->>'payment_terms_code', ''),              -- null for detection
      coalesce((v_meta->'draft'->>'free_delivery')::boolean, false),   -- false for detection
      v_lines,
      null,                                                            -- private box NEVER carried (privacy)
      coalesce(nullif(v_meta->'draft'->>'note', ''), 'Born from Sella detection'),
      v_cp);

    -- proposer-as-initiator: create_deal_draft set initiating_company_id to the
    -- confirmer (auth.uid()); correct it to the proposer so the offer/order
    -- direction reflects who SENT the deal, not who accepted last.
    update public.deal_card set initiating_company_id = v_proposer where id = v_card;

    -- D-07: a deal born from double-accept is delivered by construction - both
    -- sides just said yes. The slim birth RPC (this wave) births 'unsent' and
    -- no longer adds the counterparty co-owner, so this door does BOTH itself,
    -- in this same transaction. It must NEVER route through the send RPC: the
    -- caller HERE is the confirmer, not the initiator - the initiator guard
    -- there would reject it (the correction above is exactly why).
    update public.deal_card set status = 'negotiation' where id = v_card;

    if v_cp is not null then
      -- the counterparty co-owner joins the born workspace (mirrors what the
      -- OLD birth RPC did and the slim one no longer does) - idempotent on the
      -- ACTIVE row, matching uq_deal_member_active
      select id into v_ws
      from public.deal_workspace
      where deal_card_id = v_card and deleted_at is null;
      insert into public.deal_member (deal_workspace_id, person_id, role, added_by_person_id)
      select v_ws, v_cp, 'owner', v_uid
      where not exists (
        select 1 from public.deal_member
        where deal_workspace_id = v_ws and person_id = v_cp and removed_at is null);
    else
      -- belt (research A3): person unknown -> a company-target detected deal
      -- still gets its claimable inbox ticket
      perform public.deliver_deal(v_card);
    end if;

    v_meta := jsonb_set(v_meta, '{born_deal_card_id}', to_jsonb(v_card::text));

    -- AUDIT-01: the card is born on THIS call -> the action stamps deal.created once.
    born_now := true;
  end if;

  update public.chat_message set metadata = v_meta where id = p_message_id;
  deal_card_id := v_card;   -- null until both have accepted
  return;
end;
$function$;

grant execute on function public.confirm_detected_deal(uuid, text) to authenticated;
