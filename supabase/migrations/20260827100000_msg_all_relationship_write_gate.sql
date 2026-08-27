-- ============================================================================
-- HEL-84 (0026-relationship-write-gate) · msg_all gains the write-gate term
-- ----------------------------------------------------------------------------
-- `msg_all`'s WITH CHECK (20260825120000) already refuses type = 'deal_detected'
-- for `authenticated`, but has no relationship-status term at all — an ordinary
-- chat message still lands on a suspended/ended relationship. This adds
-- `assert_relationship_writable` as the new gate, with a carve-out: the four
-- `announceDealEvent` types (deal_signed, deal_cancelled, deal_change_proposed,
-- deal_negotiation_requested) must still post even on a suspended relationship,
-- because that function's own catch is fail-soft (console.error only, never
-- surfaced) — without the exemption, declining/signing/proposing a deal on a
-- suspended relationship would succeed with no chat record of it.
--
-- `case`, not `or`: assert_relationship_writable never returns false, it
-- raises — the exemption only works if the right-hand side is never evaluated
-- for the four exempt types. Postgres does not guarantee `or`'s evaluation
-- order (§4.2.14 of the docs warns against relying on it for functions with
-- side effects, and a raise counts), but a `case` IS a defined-order
-- construct — only the matching branch's `then`/`else` runs.
--
-- Known, accepted limitation: the outer `and` chain (can_access_thread(...)
-- and type <> 'deal_detected' and case ... end) has the same unguaranteed-
-- order property, unfixed here — no security consequence (a refusal is a
-- refusal either way, and 'relationship not found' is already the same text
-- for "doesn't exist" and "not yours" by design), but the exact error a caller
-- sees for a given refusal is not strictly pinned to which predicate "really"
-- failed first.
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
    and case
          when type in ('deal_signed', 'deal_cancelled', 'deal_change_proposed',
                         'deal_negotiation_requested')
          then true
          else public.assert_relationship_writable(
                 (select relationship_id from public.chat_thread where id = thread_id)
               )
        end
  );

comment on policy msg_all on public.chat_message is
  'Thread members read and write their own threads. WITH CHECK additionally '
  'refuses type = ''deal_detected'' (HEL-67 Gap 1): that message drives '
  'confirm_detected_deal into birthing a real deal and is written only by '
  'SECURITY DEFINER functions, which bypass RLS. The SENDER of a message is '
  'still forgeable — HEL-67 Gap 2, blocked on HEL-68. HEL-84: an ordinary '
  'write is also refused when the thread''s relationship is suspended/ended '
  '(assert_relationship_writable), except the four announceDealEvent types '
  '(deal_signed/deal_cancelled/deal_change_proposed/deal_negotiation_requested), '
  'which stay exempt because that function''s own failure handling is fail-soft.';
