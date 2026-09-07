-- ============================================================================
-- HEL-84 (0026-relationship-write-gate) · deliver_deal gains its own gate
-- ----------------------------------------------------------------------------
-- Re-emits the FULL live deliver_deal body (20260720095000_deliver_deal.sql)
-- VERBATIM, plus one inserted line: `perform public.assert_relationship_
-- writable(v_rel);` immediately after `if v_rel is null then return; end
-- if;`, before the co-owner probe.
--
-- Reachability, today: send_deal stopped calling deliver_deal entirely in
-- 20260825090000_send_deal_c2c_announce.sql (the company arm now posts its
-- own chat pill directly) — the ONLY live caller is confirm_detected_deal
-- (20260825190000, inside the both-accepted branch), which already calls
-- assert_relationship_writable on the identical relationship first (this
-- ticket's own refactor of that function). So this gate is currently
-- unreachable through the product — built anyway, per ADR 0008's own
-- Blast-radius, "so a third future caller can't reopen the gap silently".
--
-- Unlike send_deal's/confirm_detected_deal's own refactor, this membership
-- predicate is NOT redundant-but-harmless: deliver_deal's own header states
-- it "derives every id from the card row — no client input is trusted" and
-- performs no caller-is-party check of its own. After this migration it
-- refuses whenever the session's active JWT claims belong to a non-party — a
-- real new behavior, even though currently unreachable, and service_role is
-- exempt via auth.uid() IS NULL.
--
-- `create or replace`, no signature change. Do NOT re-emit the trailing
-- `grant execute ... to authenticated` line the source migration ends with —
-- 20260724121000_revoke_deliver_deal_execute.sql later revoked that grant on
-- purpose (Locked #3/ADR); re-emitting it here would silently undo the
-- revoke and reopen deliver_deal to direct authenticated calls. The function
-- stays EXECUTE-revoked from authenticated/anon/public exactly as it is
-- today.
-- ============================================================================

create or replace function public.deliver_deal(p_deal_card_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_rel uuid; v_initiator uuid; v_creator uuid;
        v_a uuid; v_b uuid; v_receiver uuid; v_has_coowner boolean;
begin
  select relationship_id, initiating_company_id, created_by
    into v_rel, v_initiator, v_creator from public.deal_card where id = p_deal_card_id;
  if v_rel is null then return; end if;

  perform public.assert_relationship_writable(v_rel);

  -- person-target iff a second owner (not the creator) exists (side-agnostic;
  -- avoids the initiating_company_id timing gap on the detection path)
  select exists (
    select 1 from public.deal_member dm
    join public.deal_workspace dw on dw.id = dm.deal_workspace_id
    where dw.deal_card_id = p_deal_card_id and dm.person_id <> v_creator
  ) into v_has_coowner;
  if v_has_coowner then return; end if;  -- PERSON delivery is the send layer's job

  -- COMPANY delivery: one claimable ticket, idempotent
  select company_a_id, company_b_id into v_a, v_b from public.relationship where id = v_rel;
  v_receiver := case when v_initiator = v_a then v_b else v_a end;
  if not exists (select 1 from public.pending_inbox_item
                 where deal_card_id = p_deal_card_id and deleted_at is null) then
    insert into public.pending_inbox_item
      (type, sender_person_id, sender_company_id, receiver_company_id, deal_card_id, status)
    values ('deal_card', v_creator, v_initiator, v_receiver, p_deal_card_id, 'pending');
  end if;
end; $$;
