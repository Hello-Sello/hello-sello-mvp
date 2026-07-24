-- ============================================================================
-- Phase 12 / 12-01 · confirm_deal_change: commit writes 'negotiation' + the
-- missing relationship-membership guard (D-03)
-- (Ayush, 2026-07-24)
-- ----------------------------------------------------------------------------
-- WHY: the previous migration (20260724120000) retires the status code 'draft'
-- from deal_card_status. This function's commit branch wrote status='draft' -
-- after the lookup delete that write HARD-FAILS the FK, breaking every
-- change-accept and every sign-with-held-change (RESEARCH Pitfall 1). The
-- re-emit MUST ride the same migration wave as the vocabulary change.
--
-- This migration re-emits the FULL live confirm_deal_change body VERBATIM
-- (copied from 20260707130300_deal_event_system_voice.sql - the current live
-- definition, 7 re-emits deep, carrying the system-voice announcements, the
-- note slots, the 3f batch snapshot carry, and the D-09 margin carry-forward;
-- NOT any earlier body). Exactly TWO deltas:
--
--   (a) the commit's `status = 'draft'` write becomes `status = 'negotiation'`
--       (D-03: post-send bargaining state; 'draft' is a deleted code now);
--   (b) a relationship-membership guard after the company-pair resolve
--       (T-12-01: before this, ANY authenticated user could decline - or vote
--       on - a FOREIGN relationship's held change; guard shape copied from
--       create_deal_draft's membership block, 20260720100100:72-74).
--
-- Nothing else moves: decline HOOK A, commit HOOK B, both-chats announce
-- bodies, note slots, batch carry, and the private carry-forward are
-- byte-for-byte the live behaviour. The v_deal_thread resolve + the 4
-- null-guarded announce inserts carry over UNCHANGED - new post-split cards
-- have no 'deal' thread, so they resolve null -> guarded skip, by design
-- (D-05 keeps legacy birth threads readable and announced).
--
-- The return type is unchanged (int), so this rides CREATE OR REPLACE.
--
-- NOT ADDED (deliberate): no deal_confirmation write - the golden Seal is
-- deferred to the deal's final stage (locked project memory; writing
-- deal_confirmation here previously leaked into the Seal gate).
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
  -- (Phase 2): the two threads the announcement is projected into
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

  -- D-03 delta (b) / T-12-01: the missing membership gate. Before this re-emit
  -- ANY authenticated user could resolve a foreign relationship's held change.
  -- Guard shape mirrors create_deal_draft's membership block (20260720100100).
  if v_company <> v_ca and v_company <> v_cb then
    raise exception 'confirm_deal_change: caller is not a member of this relationship';
  end if;

  -- (Phase 2): resolve the card's relationship + its two chat threads ONCE,
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
    -- base. OBS-3/D-10: sender='system' (neutral audit voice while Sella is a
    -- placeholder); still skips the sella_detect trigger (fires only on
    -- sender='person'); guarded so a missing thread is simply skipped
    -- (mirrors sella-summarize's .filter(Boolean)).
    if v_deal_thread is not null then
      insert into public.chat_message (thread_id, sender, sender_person_id, type, body, metadata)
      values (v_deal_thread, 'system', null, 'deal_change_declined',
              'Change declined - ' || btrim(p_reason),
              jsonb_build_object('deal_card_id', p_deal_card_id, 'version', v_base));
    end if;
    if v_p2p_thread is not null then
      insert into public.chat_message (thread_id, sender, sender_person_id, type, body, metadata)
      values (v_p2p_thread, 'system', null, 'deal_change_declined',
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
      status = 'negotiation',                            -- D-03 delta (a): was 'draft' (code retired in 20260724120000)
      value_net = (v_draft->>'value_net')::numeric,
      currency = coalesce(v_draft->>'currency', currency),
      delivery_date_target = (v_draft->>'due_date')::timestamptz,
      payment_terms_code = v_draft->>'payment_terms_code',
      -- NOTE-01 / D-02 / D-04: commit the PROPOSER's note to THEIR slot only.
      -- v_proposer_co is structurally one of v_ca/v_cb (never both); the else
      -- branch keeps each column's existing value, so the other side's note
      -- is never touched by this commit.
      note_company_a = case when v_proposer_co = v_ca then v_draft->>'note' else note_company_a end,
      note_company_b = case when v_proposer_co = v_cb then v_draft->>'note' else note_company_b end,
      metadata = case when (v_draft->>'free_delivery')::boolean
                   then '{"free_delivery":true}'::jsonb else '{}'::jsonb end,
      updated_by = v_uid,
      updated_at = now()
  where id = p_deal_card_id;

  -- snapshot the new shared line items at v_new (old version stays frozen).
  -- keys {name, quantity, unit, unit_price, cultivar, pzn} match propose_deal's draft.
  -- 3f (D-04): carry the batch snapshot FORWARD verbatim from the held draft -
  -- batch_id, batch_number, thc_percent, cbd_percent ride ON the draft line
  -- (snapshot-through-draft), so the rebuild inserts them directly with NO
  -- product_id JOIN. This also fixes the latent bug where the rebuild DROPPED
  -- thc/cbd + batch on every version bump. Custom lines carry nulls naturally.
  for v_line in select * from jsonb_array_elements(coalesce(v_draft->'line_items', '[]'::jsonb))
  loop
    insert into public.deal_line_item (
      deal_card_id, version, product_id, product_name, quantity, unit,
      unit_price, currency, sort_order,
      batch_id, batch_number, thc_percent, cbd_percent, metadata)
    values (
      p_deal_card_id, v_new,
      nullif(v_line->>'productId', '')::uuid,
      v_line->>'name',
      (v_line->>'quantity')::numeric,
      coalesce(v_line->>'unit', 'g'),
      nullif(v_line->>'unit_price', '')::numeric,
      coalesce(v_draft->>'currency', 'EUR'),
      v_i,
      nullif(v_line->>'batchId', '')::uuid,
      nullif(v_line->>'batchNumber', ''),
      nullif(v_line->>'thcPercent', '')::numeric,
      nullif(v_line->>'cbdPercent', '')::numeric,
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

  -- MRGN-01 / D-08 / D-09 (3f UPGRADE): carry the per-line PRIVATE input
  -- (deal_line_item_private) forward to the new version, mirroring the
  -- deal_party_field carry-forward above. deal_line_item.id is regenerated every
  -- version (the snapshot loop just above), so the FK is NOT stable across
  -- versions - join OLD line to NEW line and copy each side's private row onto
  -- the new line's id, preserving company_id ownership so dli_private_all RLS
  -- still scopes reads per company.
  --
  -- D-09: the join keys on product_id AND batch_id (NOT product_id alone). D-05
  -- makes two lines share a product (batch 4 vs batch 5 = two distinct lines), so
  -- product_id alone is no longer a unique cross-version key; adding
  -- `new_line.batch_id is not distinct from old_line.batch_id` keeps each batch's
  -- margin following the right line. `is not distinct from` (not `=`) so legacy
  -- null-batch lines still match safely. D-06 makes every catalogue line born
  -- with a batch, so the (product_id, batch_id) match is unique in practice.
  --
  -- The `old_line.product_id is not null` guard (A2) skips free-typed/custom
  -- lines, which have no catalogue key to carry forward by. The ONLY ambiguous
  -- case left is two custom lines (null product_id + null batch) carrying margin
  -- across an edit - already side-stepped by this guard, and deferred as a
  -- recorded future fix (custom-product margin is out of scope this phase).
  insert into public.deal_line_item_private (
    deal_line_item_id, company_id, seller_margin, buyer_metric, created_by)
  select new_line.id, old_priv.company_id, old_priv.seller_margin, old_priv.buyer_metric, old_priv.created_by
  from public.deal_line_item_private old_priv
  join public.deal_line_item old_line
    on old_line.id = old_priv.deal_line_item_id
   and old_line.deal_card_id = p_deal_card_id
   and old_line.version = v_base
  join public.deal_line_item new_line
    on new_line.deal_card_id = p_deal_card_id
   and new_line.version = v_new
   and new_line.product_id = old_line.product_id
   and new_line.batch_id is not distinct from old_line.batch_id
   and old_line.product_id is not null;

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
  -- OBS-3/D-10: sender='system' (neutral audit voice while Sella is a placeholder);
  -- still skips the sella_detect trigger (fires only on sender='person'); guarded
  -- per missing thread.
  if v_deal_thread is not null then
    insert into public.chat_message (thread_id, sender, sender_person_id, type, body, metadata)
    values (v_deal_thread, 'system', null, 'deal_card_updated',
            'Change accepted - the deal moved to v' || v_new || '.',
            jsonb_build_object('deal_card_id', p_deal_card_id, 'version', v_new));
  end if;
  if v_p2p_thread is not null then
    insert into public.chat_message (thread_id, sender, sender_person_id, type, body, metadata)
    values (v_p2p_thread, 'system', null, 'deal_card_updated',
            'Change accepted - the deal moved to v' || v_new || '.',
            jsonb_build_object('deal_card_id', p_deal_card_id, 'version', v_new));
  end if;

  -- EVERY exit deletes the pending row (Pitfall 4 - this unlocks editing)
  delete from public.deal_pending_change where deal_card_id = p_deal_card_id;

  return v_new;
end;
$$;

grant execute on function public.confirm_deal_change(uuid, text, text) to authenticated;
