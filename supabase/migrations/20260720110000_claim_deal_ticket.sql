-- ============================================================================
-- Lane A · claim_deal_ticket — deal-ticket pickup (A3)
-- (Muskan, 2026-07-20)
-- ----------------------------------------------------------------------------
-- The pickup half of the company-delivery spine: any member of the RECEIVING
-- company claims a delivered 'deal_card' ticket and becomes a deal_member
-- OWNER on the already-existing deal. No new relationship, no new threads —
-- the deal (and its relationship) exist since birth.
--
-- WHY an RPC: deal_member's RLS (member_all → can_access_workspace) cannot
-- express this bootstrap — the claimer is not yet a workspace member, and a
-- broader policy would let ANY company member self-add to ANY workspace. The
-- definer function carries the precise gate instead: a live 'deal_card' ticket
-- addressed to the CALLER's session-derived company. Same pattern as
-- create_deal_draft (identity from auth.uid(), never client input).
--
-- Returns the deal's relationship id (the caller's UI needs it to open the
-- chat/deal after the claim). Idempotent: a re-claim adds no duplicate row.
-- The ticket's status flip to 'accepted' stays with connect (it owns
-- pending_inbox_item), exactly like the connection-request accept.
-- ============================================================================

create or replace function public.claim_deal_ticket(p_deal_card_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_company uuid;
  v_ws      uuid;
  v_rel     uuid;
begin
  if v_uid is null then
    raise exception 'claim_deal_ticket: not authenticated';
  end if;

  select company_id into v_company from public.person where id = v_uid;
  if v_company is null then
    raise exception 'claim_deal_ticket: caller has no company';
  end if;

  -- the gate: a live, claimable ticket addressed to the caller's company
  if not exists (
    select 1 from public.pending_inbox_item
    where deal_card_id = p_deal_card_id
      and type = 'deal_card'
      and receiver_company_id = v_company
      and status = 'pending'
      and deleted_at is null
  ) then
    raise exception 'claim_deal_ticket: no claimable ticket for this deal and company';
  end if;

  select id into v_ws from public.deal_workspace where deal_card_id = p_deal_card_id;
  if v_ws is null then
    raise exception 'claim_deal_ticket: deal workspace not found';
  end if;

  -- idempotent: an existing membership is left untouched
  if not exists (
    select 1 from public.deal_member
    where deal_workspace_id = v_ws and person_id = v_uid
  ) then
    insert into public.deal_member (deal_workspace_id, person_id, role, added_by_person_id)
    values (v_ws, v_uid, 'owner', v_uid);
  end if;

  select relationship_id into v_rel from public.deal_card where id = p_deal_card_id;
  return v_rel;
end;
$$;

grant execute on function public.claim_deal_ticket(uuid) to authenticated;
