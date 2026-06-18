-- ============================================================================
-- Phase 2 · confirm_deal_change ANNOUNCES the resolution into both chats (Ayush, 2026-06-17)
-- ----------------------------------------------------------------------------
-- WHY (the trigger point lives in the RPC, not the server action):
-- Phase 1 already writes the durable facts on resolution -- the deal_card_log
-- row + the deal_change_input reasons -- but it resolves SILENTLY: nothing
-- appears as a message bubble in either chat. Phase 2 adds a human-visible
-- PROJECTION of that log line: a sender='sella' system message into BOTH the
-- deal thread AND the p2p thread, on the two RESOLUTION events only --
--   • DECLINE        (HOOK A): the card did NOT move; the message carries the reason.
--   • BOTH-ACCEPTED  (HOOK B): the card moved to v_new; the message announces it.
-- The FIRST accept (still waiting) and withdraw_deal_change announce NOTHING.
--
-- The announcement MUST live inside this RPC, not in the confirmDealChange
-- server action: the action only sees `int | null`, and `null` is BOTH a
-- decline AND a first-accept-still-waiting -- it cannot tell them apart, so it
-- cannot decide what (or whether) to announce. Only the RPC knows the branch.
-- Inserting here is also atomic with the log write (the message can never drift
-- from the log) and SECURITY DEFINER bypasses the chat_message sender restriction
-- (a person may never directly insert a sender='sella' row).
--
-- sender='sella' is deliberate: the sella_detect trigger fires
-- `after insert on chat_message` ONLY `if NEW.sender = 'person'`
-- (20260612130000_sella_detect_trigger.sql), so a 'sella' announcement does NOT
-- re-trigger detection -- no loop.
--
-- This is a create-or-replace of the FUNCTION BODY ONLY. It re-emits the entire
-- 20260617120000_confirm_deal_change_no_seal_write.sql verbatim (the D-02 two-key
-- gate, the decline branch, the version-build commit, the private-box
-- carry-forward, the deal_card_log line, the two deal_change_input rows, and the
-- delete-on-every-exit) and adds ONLY: three thread locals, a one-time thread
-- resolve, and the two announcement inserts. This SUPERSEDES the function body of
-- 20260617120000. withdraw_deal_change is UNCHANGED (not redefined here) -- a
-- withdraw stays silent (ANNC-03).
-- ============================================================================

create or replace function public.confirm_deal_change(
  p_deal_card_id uuid,
  p_decision     text,          -- 'accept' | 'decline'
  p_reason       text
) returns int                   -- the new version on commit, else null (no-op / decline)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := auth.uid();
  v_company      uuid;
  v_base         int;
  v_new          int;
  v_votes        jsonb;
  v_draft        jsonb;
  v_proposer_co  uuid;
  v_proposer_pn  uuid;
  v_proposer_rsn text;
  v_ca           uuid;  v_cb uuid;   -- the two DISTINCT company keys for the gate
  v_log          uuid;
  v_line         jsonb;
  v_i            int := 0;
  -- NEW (Phase 2): the two threads the announcement is projected into
  v_rel          uuid;
  v_deal_thread  uuid;
  v_p2p_thread   uuid;
begin
  if v_uid is null then
    raise exception 'confirm_deal_change: not authenticated';
  end if;
  if p_decision not in ('accept', 'decline') then
    raise exception 'confirm_deal_change: decision must be accept or decline';
  end if;

  select company_id into v_company from public.person where id = v_uid;
  if v_company is null then
    raise exception 'confirm_deal_change: caller has no company';
  end if;

  -- lock the held row (Pitfall 6: prevents a double-commit to base+2)
  select base_version, votes, draft, proposed_by_company, proposed_by_person, proposer_reason
    into v_base, v_votes, v_draft, v_proposer_co, v_proposer_pn, v_proposer_rsn
  from public.deal_pending_change
  where deal_card_id = p_deal_card_id
  for update;
  if not found then
    return null;                 -- already resolved (deleted) -> idempotent no-op
  end if;

  -- REAS-01: a reason is required on every accept AND every decline (server-side,
  -- cannot be skipped by bypassing the UI)
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'confirm_deal_change: a change reason is required';
  end if;

  -- record THIS side's vote (mirror confirm_detected_deal:67)
  v_votes := jsonb_set(v_votes, array[v_company::text], to_jsonb(p_decision));

  -- the TWO DISTINCT company keys of the card's relationship (confirm_detected_deal:60)
  select r.company_a_id, r.company_b_id
    into v_ca, v_cb
  from public.relationship r
  join public.deal_card dc on dc.relationship_id = r.id
  where dc.id = p_deal_card_id;

  -- NEW (Phase 2): resolve the card's relationship + its two chat threads ONCE,
  -- so both the decline and commit branches can announce into them. (Ports the
  -- two-thread resolve from sella-summarize/index.ts:127-132 into plpgsql.) The
  -- deal thread is keyed by the card; the p2p thread by the relationship.
  select dc.relationship_id into v_rel
  from public.deal_card dc where dc.id = p_deal_card_id;

  select t.id into v_deal_thread
  from public.chat_thread t
  where t.deal_card_id = p_deal_card_id and t.type = 'deal' and t.deleted_at is null
  limit 1;

  select t.id into v_p2p_thread
  from public.chat_thread t
  where t.relationship_id = v_rel and t.type = 'p2p' and t.deleted_at is null
  limit 1;

  -- ===================================================================
  -- DECLINE: log the reason, discard the change, leave the card untouched.
  -- ===================================================================
  if p_decision = 'decline' then
    insert into public.deal_card_log (
      deal_card_id, version, change_summary, origin, changed_by, changed_by_person_id)
    values (p_deal_card_id, v_base, 'Proposed change declined.', 'deal_chat', 'person', v_uid)
    returning id into v_log;

    insert into public.deal_change_input (
      deal_card_id, log_id, party_person_id, note, submitted_at)
    values (p_deal_card_id, v_log, v_uid, btrim(p_reason), now());

    -- HOOK A (ANNC-02): announce the decline into BOTH threads, carrying the
    -- reason inline. The card did NOT move, so the version is the unchanged
    -- base. sender='sella' (skips the sella_detect trigger); guarded so a
    -- missing thread is simply skipped (mirrors sella-summarize's .filter(Boolean)).
    if v_deal_thread is not null then
      insert into public.chat_message (thread_id, sender, sender_person_id, type, body, metadata)
      values (v_deal_thread, 'sella', null, 'deal_change_declined',
              'Change declined - ' || btrim(p_reason),
              jsonb_build_object('deal_card_id', p_deal_card_id, 'version', v_base));
    end if;
    if v_p2p_thread is not null then
      insert into public.chat_message (thread_id, sender, sender_person_id, type, body, metadata)
      values (v_p2p_thread, 'sella', null, 'deal_change_declined',
              'Change declined - ' || btrim(p_reason),
              jsonb_build_object('deal_card_id', p_deal_card_id, 'version', v_base));
    end if;

    -- EVERY exit deletes the pending row (Pitfall 4 - this unlocks editing)
    delete from public.deal_pending_change where deal_card_id = p_deal_card_id;
    return null;                 -- the card did not move
  end if;

  -- ===================================================================
  -- ACCEPT but NOT yet both sides: just record the vote, wait for the other.
  -- THE D-02 GATE: commit only when BOTH distinct company keys read 'accept'.
  -- (The proposer alone can never satisfy this - their accept sets one key only.)
  -- ===================================================================
  if not ((v_votes->>v_ca::text) = 'accept' and (v_votes->>v_cb::text) = 'accept') then
    -- persist the recorded vote so a later read sees this side accepted; do NOT
    -- delete the pending row (the change is still live, waiting on the other side).
    -- ANNC-03 / no first-accept announce: the FIRST yes posts NOTHING here.
    update public.deal_pending_change
      set votes = v_votes
    where deal_card_id = p_deal_card_id;
    return null;                 -- still pending - no commit yet
  end if;

  -- ===================================================================
  -- BOTH ACCEPTED: commit. Lift the edit_deal_draft version-build block, but
  -- read every shared term/line from the pending snapshot v_draft (NOT args).
  -- ===================================================================
  v_new := v_base + 1;

  update public.deal_card
  set version = v_new,
      status = 'draft',                                  -- D-06: status STAYS draft
      value_net = (v_draft->>'value_net')::numeric,
      currency = coalesce(v_draft->>'currency', currency),
      delivery_date_target = (v_draft->>'due_date')::timestamptz,
      payment_terms_code = v_draft->>'payment_terms_code',
      metadata = case when (v_draft->>'free_delivery')::boolean
                   then '{"free_delivery":true}'::jsonb else '{}'::jsonb end,
      updated_by = v_uid,
      updated_at = now()
  where id = p_deal_card_id;

  -- snapshot the new shared line items at v_new (old version stays frozen).
  -- keys {name, quantity, unit, unit_price, cultivar, pzn} match propose_deal's draft.
  for v_line in select * from jsonb_array_elements(coalesce(v_draft->'line_items', '[]'::jsonb))
  loop
    insert into public.deal_line_item (
      deal_card_id, version, product_id, product_name, quantity, unit,
      unit_price, currency, sort_order, metadata)
    values (
      p_deal_card_id, v_new,
      nullif(v_line->>'productId', '')::uuid,
      v_line->>'name',
      (v_line->>'quantity')::numeric,
      coalesce(v_line->>'unit', 'g'),
      nullif(v_line->>'unit_price', '')::numeric,
      coalesce(v_draft->>'currency', 'EUR'),
      v_i,
      jsonb_build_object(
        'cultivar', v_line->'cultivar',
        'pzn',      v_line->'pzn'));
    v_i := v_i + 1;
  end loop;

  -- carry ALL private boxes forward (BOTH sides - Pitfall 3, D-06). The base
  -- version's deal_party_field includes the proposer's immediate ungated write.
  insert into public.deal_party_field (
    deal_card_id, version, owner_company_id, party_side, field_key, field_label,
    value_text, sort_order, created_by)
  select deal_card_id, v_new, owner_company_id, party_side, field_key, field_label,
         value_text, sort_order, created_by
  from public.deal_party_field
  where deal_card_id = p_deal_card_id and version = v_base;

  -- ONE log line for the resolved change...
  insert into public.deal_card_log (
    deal_card_id, version, change_summary, origin, changed_by, changed_by_person_id)
  values (p_deal_card_id, v_new, 'Deal updated to v' || v_new || '.', 'deal_chat', 'person', v_uid)
  returning id into v_log;

  -- ...and TWO reason rows: the proposer's (from the pending row) + the accepter's (REAS-02).
  -- deal_change_input is the CANONICAL, durable change-reason store. (We intentionally do
  -- NOT also write deal_confirmation here - that leaked into the Seal gate; see header.)
  insert into public.deal_change_input (
    deal_card_id, log_id, party_person_id, note, submitted_at)
  values (p_deal_card_id, v_log, v_proposer_pn, v_proposer_rsn, now());

  insert into public.deal_change_input (
    deal_card_id, log_id, party_person_id, note, submitted_at)
  values (p_deal_card_id, v_log, v_uid, btrim(p_reason), now());

  -- HOOK B (ANNC-01): announce the commit into BOTH threads (the move to v_new).
  -- This is the SECOND yes (both-accepted) -- the only accept event that announces.
  -- sender='sella' (skips the sella_detect trigger); guarded per missing thread.
  if v_deal_thread is not null then
    insert into public.chat_message (thread_id, sender, sender_person_id, type, body, metadata)
    values (v_deal_thread, 'sella', null, 'deal_card_updated',
            'Change accepted - the deal moved to v' || v_new || '.',
            jsonb_build_object('deal_card_id', p_deal_card_id, 'version', v_new));
  end if;
  if v_p2p_thread is not null then
    insert into public.chat_message (thread_id, sender, sender_person_id, type, body, metadata)
    values (v_p2p_thread, 'sella', null, 'deal_card_updated',
            'Change accepted - the deal moved to v' || v_new || '.',
            jsonb_build_object('deal_card_id', p_deal_card_id, 'version', v_new));
  end if;

  -- EVERY exit deletes the pending row (Pitfall 4 - this unlocks editing)
  delete from public.deal_pending_change where deal_card_id = p_deal_card_id;

  return v_new;
end;
$$;

grant execute on function public.confirm_deal_change(uuid, text, text) to authenticated;
