-- ============================================================================
-- 4.5.4 / T1 · propose_deal_change RPC - the FRONT half of the held change
-- (Ayush, 2026-06-16)
-- ----------------------------------------------------------------------------
-- This is propose_deal applied to an EDIT of an existing card instead of a
-- birth. It seeds the proposer's vote to 'accept' (sending IS their yes),
-- leaves the other side pending, and INSERTs ONE held deal_pending_change row.
-- It deliberately DOES NOT touch deal_card - that instant mutation is the exact
-- bug being fixed (old edit_deal_draft bumped the live card at Send). The card
-- is only built later, on the second yes, in confirm_deal_change.
--
-- AI fence / trust boundary: the caller's company is derived from the SESSION
-- (auth.uid() -> person.company_id), NEVER trusted from input. The card +
-- relationship pair (and the base version) are read inside the RPC. A non-member
-- of the card's relationship is rejected.
--
-- THE LOCK (DCHG-03): a second concurrent propose hits the unique index
-- uq_deal_pending_change_active and raises 23505. We catch that and re-raise a
-- friendly message so the form's error banner can show it.
--
-- PRIVACY (D-09): p_draft carries SHARED facts ONLY. The proposer's private box
-- is written separately + ungated by the server action; it never reaches here.
-- ============================================================================

create or replace function public.propose_deal_change(
  p_deal_card_id uuid,
  p_draft        jsonb,
  p_reason       text
) returns uuid                 -- the new deal_pending_change id
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_company uuid;
  v_rel     uuid;
  v_old     int;
  v_ca      uuid;  v_cb uuid;   -- the two companies of the card's relationship
  v_votes   jsonb;
  v_pending uuid;
begin
  if v_uid is null then
    raise exception 'propose_deal_change: not authenticated';
  end if;

  -- D-07: a change reason is required at Send (mirror edit_deal_draft:54-56)
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'propose_deal_change: a change reason is required';
  end if;

  select company_id into v_company from public.person where id = v_uid;
  if v_company is null then
    raise exception 'propose_deal_change: caller has no company';
  end if;

  -- the card + its relationship pair + the live base version (lift edit_deal_draft:63-73)
  select dc.relationship_id, dc.version, r.company_a_id, r.company_b_id
    into v_rel, v_old, v_ca, v_cb
  from public.deal_card dc
  join public.relationship r on r.id = dc.relationship_id
  where dc.id = p_deal_card_id and dc.deleted_at is null;
  if v_rel is null then
    raise exception 'propose_deal_change: card not found';
  end if;
  if v_company <> v_ca and v_company <> v_cb then
    raise exception 'propose_deal_change: caller is not a member of this relationship';
  end if;

  -- votes by company: the proposer's side ACCEPT (D-02, sending = yes), other pending
  v_votes := jsonb_build_object(v_ca::text, null, v_cb::text, null);
  v_votes := jsonb_set(v_votes, array[v_company::text], to_jsonb('accept'::text));

  -- INSERT the held row. NOTE: we do NOT update deal_card here (D-01 anti-pattern).
  -- The unique index makes a concurrent second Send fail; we translate it below.
  begin
    insert into public.deal_pending_change (
      deal_card_id, base_version, source, proposed_by_company, proposed_by_person,
      proposer_reason, draft, votes)
    values (
      p_deal_card_id, v_old, 'manual', v_company, v_uid,
      btrim(p_reason), p_draft, v_votes)
    returning id into v_pending;
  exception when unique_violation then           -- sqlstate 23505 on uq_deal_pending_change_active
    raise exception 'This deal already has a pending change. Refresh to see it.';
  end;

  return v_pending;
end;
$$;

grant execute on function public.propose_deal_change(uuid, jsonb, text) to authenticated;
