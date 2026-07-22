-- =====================================================================
-- D-05 REVERSED: drop the external two-approver gate on group chats
-- (Ayush, 2026-07-20)
-- =====================================================================
-- WHY: product call - adding a company outside a deal to its group chat
-- should need no confirmation at all, on either side. The client-side
-- two-click self-consent AND the server-side pending_external + two-
-- distinct-approver flow were both extra friction nobody wanted; this
-- removes the server half. `create_group_thread` now bootstraps every
-- invited member (deal party or not) straight to 'active', matching the
-- non-deal path's existing "any HelloSello user is active immediately"
-- behavior (D-04) - deal-born and plain groups now share one rule.
--
-- `approve_group_member` has no remaining caller (its only purpose was
-- flipping a pending_external row to active) and is dropped outright
-- rather than left as dead SECURITY DEFINER surface. The 'pending_external'
-- value stays in chat_thread_member's CHECK constraint (harmless, unused -
-- narrowing it is not worth a constraint migration for a value nothing
-- writes anymore).
-- =====================================================================

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
  -- caller is one of them (D-07). This authorization check is unchanged -
  -- only the invited-member gate below is removed.
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

  -- 3 · every invited member goes straight to 'active' - no external gate,
  -- deal-born or not (reverses D-05).
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

      insert into public.chat_thread_member (thread_id, person_id, state, added_by)
      values (v_thread, v_member, 'active', v_uid)
      on conflict (thread_id, person_id) do nothing;
    end loop;
  end if;

  return v_thread;
end;
$$;

grant execute on function public.create_group_thread(text, uuid[], uuid) to authenticated;

-- No remaining caller once the external gate is gone.
drop function if exists public.approve_group_member(uuid, uuid);
