-- ============================================================================
-- HEL-84 (0026-relationship-write-gate) · inbox_insert gains the write-gate
-- term
-- ----------------------------------------------------------------------------
-- `inbox_insert`'s WITH CHECK (20260825130000) already refuses a request onto
-- a deactivated/deleted receiver company, but has no relationship-status term
-- — a suspended/ended pair could still receive a brand-new connect/pricing
-- request. `pending_inbox_item` has NO relationship_id column, so the
-- relationship must be derived from the canonical company pair, matching
-- `accept_connection_request`'s own least/greatest idiom, and skipped
-- entirely for a `connect_person` row (receiver_company_id IS NULL by CHECK —
-- no company pair to derive).
--
-- `deleted_at is null` on the derivation IS required (unlike msg_all's
-- chat_thread subquery): a pair can legally have both a soft-deleted and a
-- live relationship row (uq_relationship_pair_active is partial), and a bare
-- scalar subquery would raise "more than one row returned by a subquery" for
-- an ordinary send otherwise.
--
-- RLS-context caveat, same shape as msg_all's: this relationship lookup also
-- runs in the calling `authenticated` user's own RLS context, not a
-- definer's — currently safe only because `rel_all` has no status filter of
-- its own (a caller who can't see the relationship row gets NULL, which
-- passes through as allowed). Re-check this if `rel_all` is ever narrowed.
--
-- This section's `or` (unlike msg_all's `case`) is safe: for a connect_person
-- row, receiver_company_id IS NULL, and least/greatest ignore NULL arguments,
-- so the derivation collapses to `company_a_id = sender_company_id AND
-- company_b_id = sender_company_id` — unsatisfiable against the live
-- relationship_canonical_order CHECK (company_a_id < company_b_id,
-- 20260607090003_phase2_deal.sql:31). The subquery always returns zero rows
-- (NULL), so assert_relationship_writable(NULL) always returns true
-- regardless of evaluation order — there is no side-effecting raise for `or`
-- to short-circuit around here. Load-bearing on the derivation never changing
-- shape.
-- ============================================================================

alter policy inbox_insert on public.pending_inbox_item
  with check (
    sender_company_id = public.current_company_id()
    and sender_person_id = auth.uid()
    and (
      -- connect_person: receiver is a PERSON, company is NULL by CHECK. Out of scope.
      receiver_company_id is null
      or public.company_can_receive_requests(receiver_company_id)
    )
    and (
      receiver_company_id is null  -- connect_person: no company pair to gate
      or public.assert_relationship_writable((
        select id from public.relationship
        where company_a_id = least(sender_company_id, receiver_company_id)
          and company_b_id = greatest(sender_company_id, receiver_company_id)
          and deleted_at is null
      ))
    )
  );
