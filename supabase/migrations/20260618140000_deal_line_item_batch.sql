-- ============================================================================
-- Phase 3f · the batch snapshot schema + the DB half of the freeze
-- (Ayush, 2026-06-18) - BTCH-01 / D-01..D-04 / D-09
-- ----------------------------------------------------------------------------
-- Three additive things, all deal-domain (nothing of Muskan's catalogue/RLS):
--
-- (1) ALTER deal_line_item: add batch_id (FK -> product_batch) + batch_number
--     (frozen snapshot text). NULLABLE in the DB (D-01/D-02) so custom lines
--     (product_id null) and legacy/seeded lines stay valid; the REQUIRED rule is
--     enforced at the form, not by a NOT NULL constraint. thc_percent/cbd_percent
--     already exist on deal_line_item, so we do NOT add them (D-03) - the chosen
--     batch's MEASURED values are written into those existing columns.
--
-- (2) create or replace create_deal_draft: re-emit the FULL current body of
--     20260618130200_create_deal_draft_retire_private_box.sql VERBATIM, changing
--     ONLY the section-2 line insert - add batch_id, batch_number, thc_percent,
--     cbd_percent to the INSERT column list and read them from v_line into the
--     REAL columns. This is the birth half of D-04 AND it fixes a latent bug:
--     today thc/cbd are written only into dead metadata; now they land in the
--     real columns (cultivar/pzn stay in metadata).
--
-- (3) create or replace confirm_deal_change: re-emit the FULL current body of
--     20260618130100_confirm_deal_change_margin_carry.sql VERBATIM (the D-02
--     two-key gate, the decline branch, the Phase 2 announce inserts, the 3c
--     note-slot CASE writes, the deal_party_field carry-forward, the log + reason
--     rows), with TWO changes:
--       (3a) the snapshot insert loop - add the same four columns
--            (batch_id, batch_number, thc_percent, cbd_percent), reading from
--            v_draft->'line_items' (snapshot-through-draft per D-04; the values
--            ride on the held draft line, so NO product_id JOIN for the snapshot).
--            This also fixes the latent bug where confirm_deal_change DROPPED
--            thc/cbd + batch on every version bump.
--       (3b) UPGRADE the 3d deal_line_item_private margin carry-forward join
--            (D-09): the existing join matched only new_line.product_id =
--            old_line.product_id; we ADD
--            `and new_line.batch_id is not distinct from old_line.batch_id` so
--            product X batch 4 and batch 5 keep their OWN margins across a bump
--            (they are distinct lines per D-05). `is not distinct from` keeps
--            legacy null-batch lines matching. The existing
--            `old_line.product_id is not null` guard is kept (it already skips
--            custom lines).
--
-- D-09 supersedes the earlier "known limitation" note in 03F-PATTERNS.md (which
-- said leave the carry-forward untouched); D-09 is the newer locked decision and
-- the plan frontmatter cites it. The only ambiguous case left is two custom lines
-- (null product_id + null batch) carrying margin across an edit - already
-- side-stepped by the product_id-not-null guard, deferred as a recorded future fix.
-- ============================================================================

-- (1) batch snapshot columns on the line --------------------------------------
alter table public.deal_line_item
  add column batch_id     uuid        null references public.product_batch(id),
  add column batch_number varchar(60) null;

create index if not exists idx_deal_line_item_batch
  on public.deal_line_item(batch_id);

-- (2) create_deal_draft: write the batch snapshot into the REAL columns on birth
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

  return v_card;
end;
$$;

grant execute on function public.create_deal_draft(
  uuid, text, numeric, text, timestamptz, text, boolean, jsonb, text, text, uuid
) to authenticated;

-- (3) confirm_deal_change: carry the batch snapshot forward verbatim on a bump,
--     and upgrade the 3d private carry-forward join to product_id + batch_id (D-09)
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
