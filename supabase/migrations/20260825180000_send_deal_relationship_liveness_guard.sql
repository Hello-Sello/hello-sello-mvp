-- ============================================================================
-- HEL-74 · send_deal gains a relationship-liveness guard
-- ----------------------------------------------------------------------------
-- send_deal never once queried `relationship` — it trusted `deal_card`'s own
-- stored `relationship_id`/`initiating_company_id` and moved straight to
-- flipping the card and announcing it in chat. That was harmless while nothing
-- could ever make a relationship non-active (HEL-82's own finding); the prior
-- migration in this pair makes 'suspended'/'ended' reachable, so this door has
-- to catch up or a suspended pair could still land a brand-new deal in chat —
-- exactly the "block new deals" half of HEL-82's acceptance criteria.
--
-- Re-emits the FULL live send_deal body VERBATIM (from
-- 20260825090000_send_deal_c2c_announce.sql — the current live definition,
-- the c2c-announce rewrite; NOT any earlier body) with ONE delta: a
-- relationship liveness check inserted right after the card lock, before any
-- write happens. Nothing else moves.
--
-- Scope, deliberately narrow: this migration gates `send_deal` only — the
-- literal HEL-74 title and its "new deals" wording. It does NOT touch
-- `create_deal_draft` (births a PRIVATE draft the counterparty can't see yet —
-- nothing has actually reached them), `confirm_deal_change`, or `sign_deal`
-- (both operate on a deal that was already sent while the relationship WAS
-- active — whether a mid-suspension negotiation should still be completable
-- is a genuine product call, not an engineering one, and is being left as a
-- follow-up rather than decided here, same shape as HEL-83 being spun out of
-- HEL-81 for the identical reason).
--
-- `create or replace`, NOT drop+create — same reason as the c2c-announce
-- migration's own header: a drop would silently take the EXECUTE grant with
-- it. The grant is re-emitted below regardless.
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
  v_rel_status text;
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

  -- HEL-74: the relationship must still be live. Membership was already fixed
  -- at birth (create_deal_draft) and cannot change, so this checks liveness
  -- only, not membership again. Historical reads stay untouched — this is a
  -- write-path check, same split HEL-82 draws everywhere else.
  select status into v_rel_status
  from public.relationship
  where id = v_card.relationship_id and deleted_at is null;
  if v_rel_status is null then
    raise exception 'send_deal: relationship not found';
  end if;
  if v_rel_status <> 'active' then
    raise exception 'send_deal: relationship is % — no new deals can be sent', v_rel_status;
  end if;

  -- the counterparty person picked at create time, persisted on the card (Open Q1)
  v_cp := nullif(v_card.metadata->>'counterparty_person_id', '')::uuid;

  -- 1 · counterparty co-owner member (idempotent on the ACTIVE row, matching
  --     uq_deal_member_active). It sits BEFORE the flip by CONVENTION, not by
  --     constraint - stated plainly because the reason the old body gave here
  --     ("BEFORE deliver_deal reads its routing key") died with that call, and
  --     replacing it with another reason that does not hold would repeat the
  --     mistake. It is true that the flip to 'negotiation' is what opens the
  --     card to the counterparty (card_all, 20260724120700:56-60). It does NOT
  --     follow that this ordering is enforced: both writes are one statement
  --     apart inside a single SECURITY DEFINER transaction, so no other session
  --     can observe the state between them and neither write is subject to that
  --     policy. Swapping them would change nothing observable. The order is
  --     kept because it reads in the sequence the domain happens in.
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

  -- 3 · WHICH THREAD the announcement lands in - this branch decides that and
  --     nothing else. Both arms resolve-or-create; the announcement itself is
  --     written once, below.
  if v_cp is not null then
    -- person-addressed: the p2p thread, canonical pair a < b per the DB CHECK
    -- (a direct plpgsql port of openOrCreateP2pThread, store.ts:383-410 - its
    -- select-then-insert is :391-409). NOT resolveC2cThread (:358-372), which
    -- is the OTHER arm's resolver.
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
      on conflict do nothing
      returning id into v_thread;

      -- Lost the race: a concurrent send on ANOTHER card of the same
      -- relationship minted the thread between the SELECT and the INSERT. The
      -- card lock at the top of this function does NOT serialise that. Adopt
      -- the winner rather than surfacing a raw 23505.
      if v_thread is null then
        select id into v_thread
        from public.chat_thread
        where relationship_id = v_card.relationship_id
          and type = 'p2p'
          and person_a_id = v_a
          and person_b_id = v_b
          and deleted_at is null;
      end if;
    end if;
  else
    -- company-addressed: the relationship's c2c thread, keyed on the
    -- relationship alone (uq_chat_thread_c2c, 20260607090003:139-140). The
    -- `deleted_at is null` filter is load-bearing twice: the unique index is
    -- partial, and resolveC2cThread filters it the same way (store.ts:365), so
    -- a soft-deleted thread must be healed with a new row rather than adopted.
    select id into v_thread
    from public.chat_thread
    where relationship_id = v_card.relationship_id
      and type = 'c2c'
      and deleted_at is null;

    if v_thread is null then
      insert into public.chat_thread (relationship_id, type)
      values (v_card.relationship_id, 'c2c')
      on conflict do nothing
      returning id into v_thread;

      -- Lost the race: a concurrent send on ANOTHER card of the same
      -- relationship minted the thread between the SELECT and the INSERT. The
      -- card lock at the top of this function does NOT serialise that. Adopt
      -- the winner rather than surfacing a raw 23505.
      if v_thread is null then
        select id into v_thread
        from public.chat_thread
        where relationship_id = v_card.relationship_id
          and type = 'c2c'
          and deleted_at is null;
      end if;
    end if;
  end if;

  -- Both INSERTs above use a BARE `on conflict do nothing`, with no inference
  -- clause, deliberately: uq_chat_thread_c2c and uq_chat_thread_p2p are PARTIAL
  -- indexes, and an untargeted DO NOTHING covers the unique violation without
  -- naming a partial index in an inference clause.

  -- The hoist moved the pill INSERT out of the branch and made it
  -- UNCONDITIONAL, which changes what a doubly-failed resolve costs. In the
  -- precedent (20260823090000:159-184 - the ADR and PLAN both cite :162-183,
  -- which opens on a blank line) a NULL return is harmless; here a NULL
  -- v_thread would hit chat_message.thread_id NOT NULL (20260607090003:191) and
  -- surface a raw 23502 - the mirror image of the 23505 the on-conflict idiom
  -- exists to prevent. Reachable only if the conflict winner is soft-deleted
  -- between the failed INSERT and the re-select (and, because the DO NOTHING is
  -- untargeted, on any other unique violation on this table). Believed
  -- unreachable, asserted rather than assumed: a named error beats a constraint
  -- violation, and this line records that the state was considered.
  if v_thread is null then
    raise exception 'send_deal: could not resolve or create the announcement thread';
  end if;

  -- 4 · the announcement - ONE insert, serving both arms. Do not fork it per
  --     arm: "the same signal in both places" is the whole point of this slug
  --     and no test can hold it (ADR 0006 J2). A port of postDealMessage,
  --     store.ts:500-521 (:489-499 is its JSDoc).
  select nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
    into v_name
  from public.person where id = v_uid;

  insert into public.chat_message (thread_id, sender, sender_person_id, type, body, metadata)
  values (
    v_thread, 'person', v_uid, 'deal_card',
    coalesce(v_name, 'Someone') || ' has sent a deal',
    jsonb_build_object('deal_card_id', p_deal_card_id));

  -- 5 · the log line
  insert into public.deal_card_log (
    deal_card_id, version, change_summary, origin, changed_by, changed_by_person_id)
  values (v_card.id, v_card.version, 'Deal sent.', 'deal_chat', 'person', v_uid);

  return v_thread;
end;
$$;

grant execute on function public.send_deal(uuid) to authenticated;
