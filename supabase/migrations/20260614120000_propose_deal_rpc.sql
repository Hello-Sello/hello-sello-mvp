-- ============================================================================
-- 4.5.1 · propose_deal  (Ayush, 2026-06-14)  -- the "propose" path (manual door)
-- ----------------------------------------------------------------------------
-- Waypoint 4.5: the manual "+ Start a deal" door no longer BIRTHS a card. It
-- writes a PROPOSAL - a deal_detected-shaped chat_message in the p2p thread -
-- with the proposer's OWN company vote pre-set to 'accept' (sending IS the
-- proposer's yes) and the other side left pending. Birth happens later, ONLY
-- when the other side accepts, via the existing confirm_detected_deal ->
-- create_deal_draft (one atomic transaction). One birth path, two doors:
-- Sella detection and this manual propose both produce the SAME message.
--
-- Why an RPC: RLS lets only Sella / service-role insert a `deal_detected`
-- message; a person cannot. SECURITY DEFINER + a thread-membership gate is the
-- same guardrail pattern as create_deal_draft / confirm_detected_deal. The
-- caller's company is derived from the SESSION, never trusted from input.
--
-- PRIVACY: the proposal metadata is readable by BOTH p2p people, so `p_draft`
-- carries only SHARED deal facts - line items, currency, terms, note. The
-- proposer's own-side private box is deliberately NOT carried here (it would
-- leak to the other side); it is added after birth via edit. `p_draft` is shaped
-- by the proposeDeal server action; line_items use the same keys the
-- confirm_detected_deal birth reads (name, quantity, unit, unit_price, cultivar,
-- pzn).
-- ============================================================================

create or replace function public.propose_deal(
  p_thread_id uuid,
  p_draft     jsonb
) returns uuid                 -- the proposal chat_message id (the pre-card object)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_company uuid;
  v_rel     uuid;
  v_pa      uuid;  v_pb uuid;   -- the two p2p persons
  v_ca      uuid;  v_cb uuid;   -- the two companies
  v_votes   jsonb;
  v_msg     uuid;
begin
  if v_uid is null then
    raise exception 'propose_deal: not authenticated';
  end if;

  -- the target must be a p2p thread the caller is a participant in
  select relationship_id, person_a_id, person_b_id
    into v_rel, v_pa, v_pb
  from public.chat_thread
  where id = p_thread_id and type = 'p2p';
  if v_rel is null then
    raise exception 'propose_deal: p2p thread not found';
  end if;
  if v_uid <> v_pa and v_uid <> v_pb then
    raise exception 'propose_deal: caller is not a participant in this thread';
  end if;

  select company_id into v_company from public.person where id = v_uid;
  select company_a_id, company_b_id into v_ca, v_cb from public.relationship where id = v_rel;

  -- votes by company: the proposer's side ACCEPT (sending = yes), the other pending
  v_votes := jsonb_build_object(v_ca::text, null, v_cb::text, null);
  v_votes := jsonb_set(v_votes, array[v_company::text], to_jsonb('accept'::text));

  insert into public.chat_message (thread_id, sender, sender_person_id, type, body, metadata)
  values (
    p_thread_id, 'person', v_uid, 'deal_detected',
    'Deal proposed: ' || coalesce(p_draft->>'summary', 'see details'),
    jsonb_build_object(
      'source',              'manual',
      'proposed_by_company', v_company,
      'draft',               p_draft,
      'votes',               v_votes,
      'evidence',            '[]'::jsonb,
      'superseded_by',       null,
      'ai',                  false   -- human-originated; not a Sella suggestion
    ))
  returning id into v_msg;

  return v_msg;
end;
$$;

grant execute on function public.propose_deal(uuid, jsonb) to authenticated;
