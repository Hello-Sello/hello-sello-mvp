-- ============================================================================
-- Phase 3f · carry the batch snapshot through the PROPOSAL birth path
-- (Ayush, 2026-06-18) - BTCH-01 / D-04
-- ----------------------------------------------------------------------------
-- The 3f freeze (D-04) was wired through create_deal_draft + confirm_deal_change
-- in Plans 03/04, which covers the DIRECT createDeal path and every version bump.
-- But the demo's main birth door is the PROPOSAL path: proposeDeal writes a
-- `deal_detected` message holding the draft, and confirm_detected_deal births the
-- card by calling create_deal_draft. That RPC mapped the message draft's
-- line_items into create_deal_draft's p_lines but DROPPED the four batch snapshot
-- keys (batchId / batchNumber / thcPercent / cbdPercent) - so a batch picked in
-- the Basket vanished the moment the other side accepted the proposal.
--
-- The Plan 05 e2e (batch-snapshot) drives exactly this proposal->accept->birth
-- door and caught the gap: the card line showed no GL-24- number. This is a
-- Rule 1 bug (BTCH-01's snapshot lost on the main birth path), fixed here +
-- in proposeDeal (actions.ts, which now puts the four keys onto the draft line).
--
-- This migration re-emits the FULL live confirm_detected_deal body VERBATIM,
-- changing ONLY the jsonb_build_object that maps the draft line_items into
-- v_lines: add batchId / batchNumber / thcPercent / cbdPercent, reading them from
-- the draft line with the SAME key names create_deal_draft already reads
-- (v_line->>'batchId' etc.). Custom lines carry nulls naturally; the proposer's
-- private box is still NEVER carried (privacy - unchanged). No other behaviour
-- changes. Additive/deal-domain; nothing of Muskan's catalogue/RLS is touched.
-- ============================================================================

create or replace function public.confirm_detected_deal(p_message_id uuid, p_decision text)
returns uuid
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
begin
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

  -- already born -> idempotent: hand back the existing card
  if v_meta ? 'born_deal_card_id' and v_meta->>'born_deal_card_id' is not null then
    return (v_meta->>'born_deal_card_id')::uuid;
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

  -- a reject just records the vote - no birth
  if p_decision = 'reject' then
    update public.chat_message set metadata = v_meta where id = p_message_id;
    return null;
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

    v_meta := jsonb_set(v_meta, '{born_deal_card_id}', to_jsonb(v_card::text));
  end if;

  update public.chat_message set metadata = v_meta where id = p_message_id;
  return v_card;   -- null until both have accepted
end;
$function$;

grant execute on function public.confirm_detected_deal(uuid, text) to authenticated;
