-- ============================================================================
-- Internal thread resolve-or-create helpers, for atomic thread creation at
-- connection accept
-- ----------------------------------------------------------------------------
-- Two new internal-only functions that `accept_connection_request` (next
-- migration in this pair) calls to mint/adopt its c2c and p2p chat_thread
-- rows atomically, inside its own transaction, instead of the browser doing
-- it afterwards via `rollout.ts` (deleted in this diff — see
-- src/modules/messaging/supabase/store.ts).
--
-- Ported from `send_deal`'s own resolve-or-create precedent
-- (20260825180000_send_deal_relationship_liveness_guard.sql:120-194): SELECT
-- first, bare `ON CONFLICT DO NOTHING ... RETURNING`, re-SELECT only if
-- RETURNING was NULL (the race-loser path). The `deleted_at IS NULL` clause
-- on both is load-bearing (it is what the partial unique indexes
-- `uq_chat_thread_c2c` / `uq_chat_thread_p2p` also filter on): a
-- soft-deleted thread must be healed with a new row, not silently block the
-- INSERT while the re-SELECT (which already filters `deleted_at is null`)
-- finds nothing.
--
-- Deliberately NOT `security definer` (ADR Locked #2) — these are only ever
-- called from inside `accept_connection_request`'s own definer body, so they
-- already execute as that function's owner; a plain function closes the "if
-- the REVOKE is ever undone" risk for free, since neither helper checks
-- caller authorization on its own.
-- ============================================================================

create function public._resolve_or_create_c2c_thread(
  p_relationship_id uuid,
  out thread_id uuid,
  out created   boolean
) returns record language plpgsql set search_path = '' as $$
begin
  created := false;
  select id into thread_id
  from public.chat_thread
  where relationship_id = p_relationship_id and type = 'c2c' and deleted_at is null;

  if thread_id is null then
    insert into public.chat_thread (relationship_id, type)
    values (p_relationship_id, 'c2c')
    on conflict do nothing
    returning id into thread_id;

    if thread_id is null then
      select id into thread_id
      from public.chat_thread
      where relationship_id = p_relationship_id and type = 'c2c' and deleted_at is null;
    else
      created := true;
    end if;
  end if;
end;
$$;

create function public._resolve_or_create_p2p_thread(
  p_relationship_id uuid, p_person_x uuid, p_person_y uuid,
  out thread_id uuid,
  out created   boolean
) returns record language plpgsql set search_path = '' as $$
declare
  v_a uuid; v_b uuid;
begin
  created := false;
  if p_person_x < p_person_y then v_a := p_person_x; v_b := p_person_y;
  else v_a := p_person_y; v_b := p_person_x; end if;

  select id into thread_id
  from public.chat_thread
  where relationship_id = p_relationship_id and type = 'p2p'
    and person_a_id = v_a and person_b_id = v_b and deleted_at is null;

  if thread_id is null then
    insert into public.chat_thread (relationship_id, type, person_a_id, person_b_id)
    values (p_relationship_id, 'p2p', v_a, v_b)
    on conflict do nothing
    returning id into thread_id;

    if thread_id is null then
      select id into thread_id
      from public.chat_thread
      where relationship_id = p_relationship_id and type = 'p2p'
        and person_a_id = v_a and person_b_id = v_b and deleted_at is null;
    else
      created := true;
    end if;
  end if;
end;
$$;

comment on function public._resolve_or_create_c2c_thread(uuid) is
  'Internal-only. Callable only from accept_connection_request''s '
  'own definer body — no caller-authorization check of its own. Do not GRANT.';
comment on function public._resolve_or_create_p2p_thread(uuid, uuid, uuid) is
  'Internal-only. Callable only from accept_connection_request''s '
  'own definer body — no caller-authorization check of its own. Do not GRANT.';

revoke all on function public._resolve_or_create_c2c_thread(uuid)
  from public, anon, authenticated;
revoke all on function public._resolve_or_create_p2p_thread(uuid, uuid, uuid)
  from public, anon, authenticated;
