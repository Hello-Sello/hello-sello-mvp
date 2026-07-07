-- =====================================================================
-- Phase 7 · Group chat foundation (3/3): create_group_thread +
-- approve_group_member SECURITY DEFINER RPCs  (Ayush, 2026-07-07)
-- =====================================================================
-- WHY: creating a group is a multi-row atomic write (thread + creator
-- membership + N invited members) with an RLS chicken-and-egg -- the
-- creator is not yet a member when the thread is born, so the creator's
-- own active row must be bootstrapped by a SECURITY DEFINER function that
-- bypasses the chat_thread_member policy. This mirrors create_deal_draft
-- (20260612011145): derive the caller from auth.uid() (NEVER trust a
-- client company id), then insert the parent + child rows in one
-- transaction and RETURN the id.
--
-- The D-05 external gate is server-enforced: an invited person whose
-- company is NOT one of the 2 deal parties (for a deal-card-born group)
-- starts 'pending_external' and only approve_group_member -- after TWO
-- DISTINCT active-member approvals -- flips it to 'active'. A client can
-- never set state directly (the table's writes go through these RPCs; the
-- RLS WITH CHECK guards any stray direct write).
-- =====================================================================

-- ---------------------------------------------------------------------
-- create_group_thread: atomic group birth.
--   p_name              optional; a blank name gets a D-06 default.
--   p_member_person_ids the invited people (creator is added automatically).
--   p_deal_card_id      non-null => deal-card-born group (filed under Deals,
--                       D-07; external companies gated per D-05). NULL =>
--                       a free new-chat group (any HelloSello user, D-04).
-- ---------------------------------------------------------------------
create or replace function public.create_group_thread(
  p_name              text,
  p_member_person_ids uuid[],
  p_deal_card_id      uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid            uuid := auth.uid();
  v_company        uuid;
  v_a              uuid;    -- deal party company A (deal-card groups only)
  v_b              uuid;    -- deal party company B
  v_thread         uuid;
  v_name           text;
  v_member         uuid;
  v_member_company uuid;
  v_state          text;
begin
  if v_uid is null then
    raise exception 'create_group_thread: not authenticated';
  end if;

  -- creator identity is session-derived; the client never passes a company id
  select company_id into v_company from public.person where id = v_uid;
  if v_company is null then
    raise exception 'create_group_thread: caller has no company';
  end if;

  -- deal-card-born group: resolve the 2 deal-party companies and confirm the
  -- caller is one of them (D-05/D-07).
  if p_deal_card_id is not null then
    select r.company_a_id, r.company_b_id
      into v_a, v_b
    from public.deal_card dc
    join public.relationship r on r.id = dc.relationship_id
    where dc.id = p_deal_card_id and dc.deleted_at is null;
    if v_a is null then
      raise exception 'create_group_thread: deal card not found';
    end if;
    if v_company <> v_a and v_company <> v_b then
      raise exception 'create_group_thread: caller is not a party of this deal';
    end if;
  end if;

  -- D-06 default name: deal code for deal groups, first names for new-chat.
  v_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_name is null then
    if p_deal_card_id is not null then
      select coalesce(nullif(btrim(coalesce(dc.hs_deal_number, '')), ''), 'Deal')
        into v_name
      from public.deal_card dc where dc.id = p_deal_card_id;
    else
      select nullif(string_agg(pp.first_name, ', ' order by pp.first_name), '')
        into v_name
      from public.person pp
      where pp.id = any(coalesce(p_member_person_ids, array[]::uuid[]));
      v_name := coalesce(v_name, 'Group');
    end if;
  end if;

  -- 1 · the group thread (no relationship anchor; access via membership)
  insert into public.chat_thread (type, deal_card_id, relationship_id, name)
  values ('group', p_deal_card_id, null, v_name)
  returning id into v_thread;

  -- 2 · bootstrap the creator's OWN active membership FIRST (RLS chicken-and-egg)
  insert into public.chat_thread_member (thread_id, person_id, state, added_by)
  values (v_thread, v_uid, 'active', v_uid);

  -- 3 · each invited member, with the D-05 external state decided server-side
  if p_member_person_ids is not null then
    foreach v_member in array p_member_person_ids
    loop
      -- skip nulls and the creator (already bootstrapped)
      if v_member is null or v_member = v_uid then
        continue;
      end if;

      if not exists (select 1 from public.person where id = v_member) then
        raise exception 'create_group_thread: invited person % not found', v_member;
      end if;
      select company_id into v_member_company from public.person where id = v_member;

      -- D-05: for a deal-card group, a company that is NEITHER deal party is
      -- EXTERNAL -> pending_external (needs 2 approvals). For a new-chat group
      -- (D-04), any HelloSello user is active immediately.
      if p_deal_card_id is not null
         and v_member_company is distinct from v_a
         and v_member_company is distinct from v_b then
        v_state := 'pending_external';
      else
        v_state := 'active';
      end if;

      insert into public.chat_thread_member (thread_id, person_id, state, added_by)
      values (v_thread, v_member, v_state, v_uid)
      on conflict (thread_id, person_id) do nothing;
    end loop;
  end if;

  return v_thread;
end;
$$;

grant execute on function public.create_group_thread(text, uuid[], uuid) to authenticated;

-- ---------------------------------------------------------------------
-- approve_group_member: the D-05 two-distinct-approver external gate.
--   The caller MUST be an active member; they append their own person id to
--   the target's `approvals`; once TWO DISTINCT approver ids are recorded the
--   target flips 'pending_external' -> 'active'. No client can set state
--   directly -- only this RPC transitions it. Returns the resulting state.
-- ---------------------------------------------------------------------
create or replace function public.approve_group_member(
  p_thread_id uuid,
  p_person_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_state     text;
  v_approvals jsonb;
  v_count     int;
  v_new_state text;
begin
  if v_uid is null then
    raise exception 'approve_group_member: not authenticated';
  end if;

  -- only an ACTIVE member of this thread may approve
  if not exists (
    select 1 from public.chat_thread_member
    where thread_id = p_thread_id and person_id = v_uid and state = 'active'
  ) then
    raise exception 'approve_group_member: caller is not an active member';
  end if;

  -- an approver cannot approve themselves (also naturally excluded: a
  -- pending_external target fails the active-member gate above)
  if p_person_id = v_uid then
    raise exception 'approve_group_member: cannot approve yourself';
  end if;

  -- lock the target membership row
  select state, approvals into v_state, v_approvals
  from public.chat_thread_member
  where thread_id = p_thread_id and person_id = p_person_id
  for update;

  if v_state is null then
    raise exception 'approve_group_member: target is not a member of this group';
  end if;

  -- already active -> idempotent no-op
  if v_state = 'active' then
    return 'active';
  end if;

  -- record this approver (dedup on person id)
  if not (v_approvals @> to_jsonb(v_uid::text)) then
    v_approvals := v_approvals || to_jsonb(v_uid::text);
  end if;

  -- TWO DISTINCT active-member approvals flip pending_external -> active
  select count(distinct e) into v_count
  from jsonb_array_elements_text(v_approvals) e;

  if v_count >= 2 then
    v_new_state := 'active';
  else
    v_new_state := 'pending_external';
  end if;

  update public.chat_thread_member
  set approvals = v_approvals, state = v_new_state
  where thread_id = p_thread_id and person_id = p_person_id;

  return v_new_state;
end;
$$;

grant execute on function public.approve_group_member(uuid, uuid) to authenticated;
