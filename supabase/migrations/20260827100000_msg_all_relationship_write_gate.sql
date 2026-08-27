-- ============================================================================
-- HEL-84 (0026-relationship-write-gate) · msg_all gains the write-gate term
-- ----------------------------------------------------------------------------
-- `msg_all`'s WITH CHECK (20260825120000) already refuses type = 'deal_detected'
-- for `authenticated`, but had no relationship-status term at all — an ordinary
-- chat message still landed on a suspended/ended relationship. This adds
-- `assert_relationship_writable` as the new gate, applied UNIFORMLY to every
-- `type` value — no carve-out.
--
-- HEL-84 §12 (post-build): an earlier version of this migration carved out
-- the four `announceDealEvent` types (deal_signed, deal_cancelled,
-- deal_change_proposed, deal_negotiation_requested) via a `CASE WHEN type IN
-- (...)` branch, on the theory that only a SECURITY DEFINER function would
-- ever write them. That theory was wrong: `chat_message.type` carries no
-- CHECK constraint and `authenticated` holds table-wide INSERT with no
-- column-level restriction, so a live-proven exploit showed an ordinary
-- client insert with `type: 'deal_signed'` (instead of `'message'`) rode
-- straight through the exemption on a SUSPENDED relationship — and, since
-- `msg_all` is FOR ALL, an existing message could be retyped to bypass the
-- gate retroactively too.
--
-- The fix moves the four announcement types into `announce_deal_event`, a
-- new SECURITY DEFINER RPC (§12.2) that composes its own body server-side
-- and bypasses this policy entirely, the same way `deal_detected`/
-- `deal_card`/every other system-authored type already does. With that
-- write path off the client, this policy needs no type-keyed term at all —
-- the plain check below applies to every insert/update uniformly. ADR 0008
-- Invariant 16 (the four types stay exempt from the suspension gate) still
-- holds — `announce_deal_event` deliberately does not call
-- `assert_relationship_writable`, proven by announce_deal_event_test.sql §F.
--
-- RLS-context caveat: the chat_thread subquery below runs in the CALLING
-- user's own RLS context (a WITH CHECK subquery is not SECURITY DEFINER). If
-- it returns NULL because the caller can't see the thread row,
-- assert_relationship_writable(NULL) passes as allowed — safe only because
-- `thread_all` has no status filter of its own; re-check this if `thread_all`
-- is ever narrowed.
-- ============================================================================

alter policy msg_all on public.chat_message
  with check (
    public.can_access_thread(thread_id)
    and type <> 'deal_detected'
    and public.assert_relationship_writable(
      (select relationship_id from public.chat_thread where id = thread_id)
    )
  );

comment on policy msg_all on public.chat_message is
  'Thread members read and write their own threads. WITH CHECK additionally '
  'refuses type = ''deal_detected'' (HEL-67 Gap 1): that message drives '
  'confirm_detected_deal into birthing a real deal and is written only by '
  'SECURITY DEFINER functions, which bypass RLS. The SENDER of a message is '
  'still forgeable — HEL-67 Gap 2, blocked on HEL-68. HEL-84: every write is '
  'also refused when the thread''s relationship is suspended/ended '
  '(assert_relationship_writable), with no type-keyed carve-out — the four '
  'former announceDealEvent types now write exclusively through '
  'announce_deal_event, a SECURITY DEFINER RPC that bypasses this policy '
  '(HEL-84 §12).';
