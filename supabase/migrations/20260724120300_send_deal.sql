-- ============================================================================
-- Phase 12 · send_deal - the ONE delivery writer (A1 / D-06)
-- (Ayush, 2026-07-24)
-- ----------------------------------------------------------------------------
-- Splitting birth from delivery (previous migration) needs a single owner for
-- the delivery moment. send_deal is it: EVERYTHING in ONE definer transaction,
-- closing both the born-but-undelivered gap and the sent-but-no-bubble gap
-- atomically (the old shape delivered at birth plus duplicated fail-soft app
-- blocks that could each half-fail):
--
--   1 · lock the card (FOR UPDATE) - a double-send race serializes here and
--       the loser fails the status guard;
--   2 · guards: status must be 'unsent'; the caller's company must equal
--       initiating_company_id - the stored from-birth fact (T-12-04, D-06);
--   3 · counterparty co-owner deal_member insert (idempotent), BEFORE
--       deliver_deal reads its routing key (a second owner <> creator means
--       person-target, so the primitive no-ops);
--   4 · the flip 'unsent' -> 'negotiation' - the exact moment the
--       counterparty's RLS starts showing the card (T-12-06);
--   5 · perform public.deliver_deal(..) - the unchanged idempotent primitive:
--       co-owner present -> no-op; else the company-target inbox ticket;
--   6 · person half: resolve-or-create the p2p thread (canonical pair
--       person_a < person_b per the DB CHECK - a direct plpgsql port of
--       openOrCreateP2pThread, store.ts:361-388) + the clickable 'deal_card'
--       pill ("<First Last> has sent a deal" - a port of postDealMessage,
--       store.ts:478-499). This insert CANNOT trip the sella_detect trigger:
--       it fires only on sender='person' AND type='message' AND a p2p thread
--       (20260612130000:42-47); this row is type='deal_card'. The 'deal_card'
--       chat_message_type lookup row already exists (20260720130000);
--   7 · the 'Deal sent.' log line.
--
-- Zero extra args (Open Q2 locked): the card knows its recipient -
-- metadata.counterparty_person_id, written at birth by the slim
-- create_deal_draft (previous migration). No client input at send (T-12-07:
-- identity always from auth.uid() -> person.company_id).
-- Returns the p2p thread id when person-target (the app navigates), else null.
--
-- The old app-side warning "never deliver from SQL - it would double-deliver
-- the Sella-detection door" (store.ts:474-477) dies with this wave:
-- confirm_detected_deal births straight into 'negotiation' (next migration,
-- D-07) and never calls send_deal - the status='unsent' guard here makes that
-- structural. Additive migration; no existing object is altered.
-- ============================================================================

create or replace function public.send_deal(p_deal_card_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_company uuid;
  v_card    record;
  v_cp      uuid;
  v_ws      uuid;
  v_thread  uuid;
  v_a       uuid;
  v_b       uuid;
  v_name    text;
begin
  if v_uid is null then
    raise exception 'send_deal: not authenticated';
  end if;
  select company_id into v_company from public.person where id = v_uid;

  -- lock the card row: a concurrent double-send serializes on this lock; the
  -- loser then fails the status guard below (T-12-05)
  select * into v_card from public.deal_card where id = p_deal_card_id for update;
  if v_card.id is null then
    raise exception 'send_deal: deal not found';
  end if;
  if v_card.status <> 'unsent' then
    raise exception 'send_deal: only an unsent draft can be sent';
  end if;
  if v_company is null or v_company <> v_card.initiating_company_id then
    raise exception 'send_deal: only the creating company can send this deal';
  end if;

  -- the counterparty person picked at create time, persisted on the card (Open Q1)
  v_cp := nullif(v_card.metadata->>'counterparty_person_id', '')::uuid;

  -- 1 · counterparty co-owner member (idempotent on the ACTIVE row, matching
  --     uq_deal_member_active), BEFORE the delivery primitive reads its
  --     routing key (a second owner <> creator => person-target no-op)
  if v_cp is not null then
    select id into v_ws
    from public.deal_workspace
    where deal_card_id = v_card.id and deleted_at is null;
    if v_ws is null then
      raise exception 'send_deal: deal workspace not found';
    end if;
    insert into public.deal_member (deal_workspace_id, person_id, role, added_by_person_id)
    select v_ws, v_cp, 'owner', v_uid
    where not exists (
      select 1 from public.deal_member
      where deal_workspace_id = v_ws and person_id = v_cp and removed_at is null);
  end if;

  -- 2 · the flip: the moment the counterparty's RLS starts seeing the card
  update public.deal_card
  set status = 'negotiation', updated_by = v_uid, updated_at = now()
  where id = v_card.id;

  -- 3 · company half: the unchanged idempotent primitive (co-owner present ->
  --     no-op; else one claimable inbox ticket)
  perform public.deliver_deal(v_card.id);

  -- 4 · person half: the p2p thread (resolve-or-create, canonical pair a < b
  --     per the DB CHECK) + the clickable deal pill
  if v_cp is not null then
    if v_uid < v_cp then
      v_a := v_uid; v_b := v_cp;
    else
      v_a := v_cp; v_b := v_uid;
    end if;

    select id into v_thread
    from public.chat_thread
    where relationship_id = v_card.relationship_id
      and type = 'p2p'
      and person_a_id = v_a
      and person_b_id = v_b
      and deleted_at is null;

    if v_thread is null then
      insert into public.chat_thread (relationship_id, type, person_a_id, person_b_id)
      values (v_card.relationship_id, 'p2p', v_a, v_b)
      returning id into v_thread;
    end if;

    select nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
      into v_name
    from public.person where id = v_uid;

    insert into public.chat_message (thread_id, sender, sender_person_id, type, body, metadata)
    values (
      v_thread, 'person', v_uid, 'deal_card',
      coalesce(v_name, 'Someone') || ' has sent a deal',
      jsonb_build_object('deal_card_id', p_deal_card_id));
  end if;

  -- 5 · the log line
  insert into public.deal_card_log (
    deal_card_id, version, change_summary, origin, changed_by, changed_by_person_id)
  values (v_card.id, v_card.version, 'Deal sent.', 'deal_chat', 'person', v_uid);

  return v_thread;
end;
$$;

grant execute on function public.send_deal(uuid) to authenticated;
