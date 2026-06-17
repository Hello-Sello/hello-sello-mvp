-- ============================================================================
-- 4.5.4 / T1+T2 · confirm_deal_change + withdraw_deal_change - the BACK half
-- (Ayush, 2026-06-16)
-- ----------------------------------------------------------------------------
-- The held change resolves here. confirm_deal_change is the two-vote skeleton of
-- confirm_detected_deal wrapping the version-build commit body of edit_deal_draft.
-- The OUTER flow (lock the row, record this side's vote, commit on both-accept,
-- idempotent re-press) mirrors confirm_detected_deal. The INNER commit body
-- (build base+1, snapshot lines, carry BOTH private boxes, log + reason) is
-- lifted from edit_deal_draft:75-146, but it reads the new terms/lines from the
-- pending row's `draft` snapshot, NOT from RPC arguments.
--
-- THE D-02 GATE (load-bearing): the commit fires only when BOTH distinct company
-- keys read 'accept'. The proposer's vote was seeded 'accept' at propose; the
-- proposer casting again only re-sets THEIR OWN key, so both-keys-accept can
-- never be reached by the proposer alone - only the OTHER company's accept flips
-- the second key. The gate reads (votes->>v_ca) AND (votes->>v_cb), never a
-- generic "all votes accept", so one side can NEVER move the shared deal alone.
--
-- THE COMMIT KEEPS status='draft' (D-06): the golden seal is out of scope; a
-- change commits to a new draft version, not a sealed one.
--
-- TRANSIENT ROW (D-05, Pitfall 4): EVERY exit (accept-commit, decline, withdraw)
-- DELETEs the pending row inside the same transaction - that is what unlocks the
-- Edit pencil. Forgetting this on any branch locks the deal forever.
--
-- IDEMPOTENT (Pitfall 6): the row is locked FOR UPDATE; a second press finds no
-- active row (it was deleted on the first resolve) and returns a no-op.
--
-- REASONS (D-07 / REAS-02): on commit we write ONE deal_card_log line and TWO
-- deal_change_input rows - the proposer's reason (from the pending row) and the
-- accepter's (from p_reason). deal_change_input is the CANONICAL durable store;
-- deal_confirmation.note is a best-effort secondary copy for the accepter's row.
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

  -- ...and TWO reason rows: the proposer's (from the pending row) + the accepter's (REAS-02)
  insert into public.deal_change_input (
    deal_card_id, log_id, party_person_id, note, submitted_at)
  values (p_deal_card_id, v_log, v_proposer_pn, v_proposer_rsn, now());

  insert into public.deal_change_input (
    deal_card_id, log_id, party_person_id, note, submitted_at)
  values (p_deal_card_id, v_log, v_uid, btrim(p_reason), now());

  -- D-07 secondary copy: wire the unused deal_confirmation.note for the accepter's
  -- row at the new version (best-effort; canonical store is deal_change_input above).
  insert into public.deal_confirmation (
    deal_card_id, version, company_id, responding_person_id, status, responded_at, note)
  values (p_deal_card_id, v_new, v_company, v_uid, 'confirmed', now(), btrim(p_reason))  -- 'confirmed' is the valid deal_confirmation_status code (not 'accepted')
  on conflict (deal_card_id, version, company_id)
    do update set note = excluded.note,
                  responding_person_id = excluded.responding_person_id,
                  responded_at = excluded.responded_at;

  -- EVERY exit deletes the pending row (Pitfall 4 - this unlocks editing)
  delete from public.deal_pending_change where deal_card_id = p_deal_card_id;

  return v_new;
end;
$$;

grant execute on function public.confirm_deal_change(uuid, text, text) to authenticated;

-- ============================================================================
-- withdraw_deal_change - the proposer's take-back (DCHG-06)
-- ----------------------------------------------------------------------------
-- Proposer-only, NO reason, NO card change: just discard the held row and unlock.
-- This is the pending-change take-back, distinct from the seal Withdraw (Phase 2).
-- ============================================================================
create or replace function public.withdraw_deal_change(
  p_deal_card_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := auth.uid();
  v_company      uuid;
  v_proposer_co  uuid;
begin
  if v_uid is null then
    raise exception 'withdraw_deal_change: not authenticated';
  end if;

  select company_id into v_company from public.person where id = v_uid;
  if v_company is null then
    raise exception 'withdraw_deal_change: caller has no company';
  end if;

  -- lock the held row; a missing row is an idempotent no-op
  select proposed_by_company into v_proposer_co
  from public.deal_pending_change
  where deal_card_id = p_deal_card_id
  for update;
  if not found then
    return;                      -- already resolved -> nothing to withdraw
  end if;

  -- proposer-only (DCHG-06): only the side that proposed may take it back
  if v_proposer_co <> v_company then
    raise exception 'withdraw_deal_change: only the proposer may withdraw this change';
  end if;

  -- discard the held row + unlock; no card change, no reason required
  delete from public.deal_pending_change where deal_card_id = p_deal_card_id;
end;
$$;

grant execute on function public.withdraw_deal_change(uuid) to authenticated;
