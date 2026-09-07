-- ============================================================================
-- HEL-84 §12 addendum (0026-relationship-write-gate) · announce_deal_event —
-- moves the four announceDealEvent chat-pill types server-side, SECURITY
-- DEFINER, closing a live-proven bypass.
-- ----------------------------------------------------------------------------
-- §2/§12.4's msg_all exemption keyed on `type IN (...)` was itself a
-- client-writable column: `chat_message.type` has no CHECK constraint,
-- `authenticated` holds table-wide INSERT with no column-level restriction,
-- so a browser session could set `type: 'deal_signed'` on an ORDINARY insert
-- and ride straight through the write-gate on a suspended relationship —
-- and, since `msg_all` is FOR ALL, retype an existing message the same way.
-- Tightening the carve-out (e.g. also requiring sender = 'sella') doesn't
-- close it — `sender` is exactly as forgeable as `type`. This repo has
-- already solved the identical shape twice (HEL-67 Gap 1's deal_detected
-- refusal, HEL-68/0024's send_deal chat-pill move into the RPC itself) — the
-- fix here is the same move: the four types are now written ONLY by this
-- SECURITY DEFINER function, which composes its own body server-side and
-- bypasses msg_all entirely. `msg_all` no longer carries any type-keyed
-- carve-out at all (§12.4).
-- ============================================================================

create or replace function public.announce_deal_event(
  p_deal_card_id uuid,
  p_type text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_company uuid;
  v_card   record;
  v_rel    record;
  v_name   text;
  v_body   text;
  v_deal_thread    uuid;
  v_visible_thread uuid;
begin
  if v_uid is null then
    raise exception 'announce_deal_event: not authenticated';
  end if;

  -- The type allow-list lives HERE, not on a client-writable column — this is
  -- the actual fix. A caller cannot pass an arbitrary type; the function's own
  -- CASE below is the only thing that ever writes one of these four values.
  if p_type not in ('deal_signed', 'deal_cancelled', 'deal_change_proposed',
                     'deal_negotiation_requested') then
    raise exception 'announce_deal_event: unsupported type %', p_type;
  end if;

  select company_id into v_company from public.person where id = v_uid;

  select * into v_card from public.deal_card
  where id = p_deal_card_id and deleted_at is null;
  if v_card.id is null then
    raise exception 'announce_deal_event: deal not found';
  end if;

  -- Membership, not liveness: this is deliberately NOT a call to
  -- assert_relationship_writable. ADR 0008 Invariant 16 rules these four
  -- announcements exempt from the suspension gate (an event already in
  -- motion is not a "new" write) — moving the insert server-side must NOT
  -- silently re-impose the gate this addendum exists to keep exempt. The
  -- check below is authorization (is the caller a real party to this deal),
  -- which a SECURITY DEFINER function must still perform itself since it
  -- bypasses RLS entirely and inherits no predicate from msg_all.
  select * into v_rel from public.relationship
  where id = v_card.relationship_id and deleted_at is null;
  -- v_company IS NULL is checked as its own disjunct, not folded into the
  -- IN() term (round-checker N1 — NULL NOT IN (a,b) evaluates to NULL, not
  -- true; an IF treats NULL as false, so that term ALONE would silently
  -- fail OPEN rather than refuse a company-less caller). This mirrors §1's
  -- own function, which hit and fixed the identical bug in round 3.
  if v_rel.id is null or v_company is null
     or v_company not in (v_rel.company_a_id, v_rel.company_b_id) then
    raise exception 'announce_deal_event: caller is not a party to this deal''s relationship';
  end if;
  -- Deliberately NOT collapsed with the "deal not found" raise above into
  -- one message, unlike §1's Invariant-9 (round-2 checker N5 asked why).
  -- The probe §1 protects against needs only a relationship id, which is
  -- effectively guessable (existing rows, sequential exposure elsewhere).
  -- This function's first gate is `p_deal_card_id`, a `deal_card` UUID —
  -- an attacker needs one already valid before the party-check message
  -- becomes reachable at all, at which point they already know the deal
  -- exists. The two-message split costs nothing extra here because the
  -- UUID itself is the higher bar, not the message text.

  select nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
    into v_name
  from public.person where id = v_uid;

  v_body := case p_type
    when 'deal_change_proposed'       then coalesce(v_name, 'A teammate') || ' proposed a change'
    when 'deal_negotiation_requested' then coalesce(v_name, 'A teammate') || ' wants to negotiate'
    when 'deal_cancelled'             then 'Deal declined - the deal is closed.'
    when 'deal_signed'                then 'Deal signed - the deal is confirmed.'
  end;

  -- Both targets are READ, not resolve-or-create. CORRECTED (round-2
  -- checker N4 — an earlier draft claimed "create_deal_draft mints the
  -- deal thread," which is false and this plan's own §10 already
  -- established the opposite: 20260724120200_create_deal_draft_private_
  -- birth.sql:16-22 DELETED that insert, "the birth-created deal chat is
  -- a RETIRED concept (D-05)"). Consequence, stated rather than hidden:
  -- v_deal_thread is NULL for every card born since that migration —
  -- meaning in production this RPC usually posts to ONE thread (the
  -- visible p2p/c2c one) and `returns uuid` is near-always NULL. Not a
  -- bug — announceDealEvent's own original code was identically
  -- NULL-safe for a missing deal thread (`if (dealThread)
  -- targets.push(...)`), and the seeded test fixtures DO have `deal`
  -- threads (seed.sql's own inserts), so §12.5's cells still exercise
  -- both arms — just don't read the comment as claiming a guarantee
  -- production doesn't actually have. The relationship's own accept
  -- flow (HEL-68) does mint c2c/p2p, which is why THAT arm is reliably
  -- non-NULL. A NULL find on either arm is silently skipped.
  -- FIXED (security re-check, post-build — a real, live-proven gap, not a
  -- style note): the party check above re-imported msg_all's relationship
  -- clause but dropped can_access_thread's `deal` arm, which is workspace-
  -- scoped, not relationship-scoped — a private deal_workspace restricts
  -- to its own members regardless of relationship membership. Without this,
  -- any relationship member (not just deal participants) could write into
  -- a PRIVATE deal thread via this RPC, proven live: a second person at
  -- the same company, not a deal_member, posted into a workspace she
  -- cannot even read. `can_access_workspace` is itself SECURITY DEFINER
  -- (20260607170000_rls_policies.sql:117-124) — called directly, not
  -- reimplemented, per this repo's own "import the predicate, don't
  -- restate it" rule (L-057).
  select id into v_deal_thread
  from public.chat_thread t
  where t.relationship_id = v_card.relationship_id
    and t.type = 'deal'
    and t.deal_card_id = p_deal_card_id
    and t.deleted_at is null
    and exists (
      select 1 from public.deal_workspace w
      where w.deal_card_id = t.deal_card_id
        and w.deleted_at is null
        and public.can_access_workspace(w.id)
    );

  -- FIXED (plan-checker B2 — the original draft matched ANY p2p thread on
  -- the relationship, not the actor's own. The old app-side code ran as the
  -- authenticated actor, so thread_all's own USING clause
  -- (auth.uid() IN (person_a_id, person_b_id)) had already filtered the
  -- list down to threads the actor participates in — a SECURITY DEFINER
  -- function sees every p2p thread on the relationship, and
  -- uq_chat_thread_p2p is keyed per PERSON PAIR, so a relationship with
  -- ≥2 pairs has ≥2 distinct p2p threads. Without this filter, the
  -- announcement could land in a private 1:1 between two OTHER people
  -- while the actor's own channel gets nothing — silent in every existing
  -- test because the seeded fixtures only ever have one p2p thread per
  -- relationship. Restricting to v_uid's own pair reproduces the pre-fix
  -- behavior exactly — round-2 checker (N1) corrected an overclaim here:
  -- this is NOT as precise as send_deal's own precedent
  -- (20260825090000_send_deal_c2c_announce.sql:132-144), which keys on
  -- BOTH ends (v_uid AND v_card.metadata->>'counterparty_person_id').
  -- This filter keys on v_uid alone with an unordered `limit 1` — if the
  -- caller belongs to TWO p2p pairs on the same relationship, the target
  -- is arbitrary among them. NOT a regression (the old app-side code was
  -- equally arbitrary in that case — `list.find(t => t.type === "p2p")`
  -- with no tiebreak either), and no current call site can construct that
  -- state, but it is not the deterministic guarantee the wording used to
  -- claim. If this ever needs to be exact, `v_card.metadata` already
  -- carries `counterparty_person_id` the same way send_deal reads it.
  select id into v_visible_thread
  from public.chat_thread
  where relationship_id = v_card.relationship_id
    and (
      (type = 'p2p' and v_uid in (person_a_id, person_b_id))
      or type = 'c2c'
    )
    and deleted_at is null
  order by (type = 'p2p') desc  -- p2p preferred over c2c, matching the app's `??` fallback
  limit 1;

  if v_deal_thread is not null then
    insert into public.chat_message (thread_id, sender, type, body, metadata)
    values (v_deal_thread, 'sella', p_type, v_body,
            jsonb_build_object('deal_card_id', p_deal_card_id));
  end if;
  if v_visible_thread is not null and v_visible_thread is distinct from v_deal_thread then
    insert into public.chat_message (thread_id, sender, type, body, metadata)
    values (v_visible_thread, 'sella', p_type, v_body,
            jsonb_build_object('deal_card_id', p_deal_card_id));
  end if;

  return v_deal_thread;
end;
$$;

comment on function public.announce_deal_event(uuid, text) is
  'HEL-84 §12: SECURITY DEFINER replacement for the client-writable four-type '
  'msg_all exemption. Composes the body server-side and posts into the deal '
  'thread + the caller''s own visible (p2p/c2c) thread. Deliberately does NOT '
  'call assert_relationship_writable — ADR 0008 Invariant 16 keeps these four '
  'announcement types exempt from the suspension gate; re-adding that call '
  'would silently re-break the ruling this function exists to preserve.';

revoke execute on function public.announce_deal_event(uuid, text) from public, anon;
grant  execute on function public.announce_deal_event(uuid, text) to authenticated;
