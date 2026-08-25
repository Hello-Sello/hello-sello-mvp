-- ============================================================================
-- DEV-159 — the counterparty can no longer rewrite a deal's line items by a
--           direct PostgREST write. `authenticated` loses UPDATE and DELETE on
--           `deal_line_item`.
-- ----------------------------------------------------------------------------
-- THE HOLE, live on production until this lands (verified 2026-08-25 against
-- `information_schema.role_table_grants`: `authenticated` held
-- DELETE, INSERT, REFERENCES, SELECT, UPDATE).
--
-- `line_all` is the ONLY policy on this table, `FOR ALL`, with both USING and
-- WITH CHECK equal to `card_relationship_member(deal_card_id)` — which is TRUE
-- for BOTH sides of the relationship. Combined with Supabase's default
-- table-level UPDATE grant, a member of either company could skip the
-- allocation RPCs entirely:
--
--     await supabase.from('deal_line_item')
--       .update({ allocation_status: 'supply', allocation_locked_at: new Date() })
--       .eq('id', theirOrderLineId);
--
-- That forges the seller's "confirm & send" state, and the same door rewrites
-- `unit_price`, `quantity`, `batch_id`/`batch_number` and
-- `substituted_from_product_id` — the money and the audit trail, not just a
-- worklist flag. Reproduced on the seeded stack before this was written: as
-- Clara (Rheinland, the BUYER side), the update above succeeded on a GreenLeaf
-- line. That is §B1 of the suite.
--
-- ⚠️ WHY A GRANT AND NOT A POLICY, A TRIGGER, OR A COLUMN ALLOWLIST.
-- DEV-159 proposed three fixes and a census killed the need for all three.
-- Across the whole of `src/`, client code performs exactly ONE write to this
-- table:
--
--     deals/actions.ts:991   INSERT   acceptPromotion — the buyer accepting the
--                                     SELLER's pending promotion; the values
--                                     come from `deal_promotion.line_deltas`,
--                                     not from buyer input, and the action
--                                     re-derives the company from the session.
--
-- ZERO client UPDATEs. ZERO client DELETEs. Every legitimate mutation already
-- runs through a SECURITY DEFINER function owned by postgres, which bypasses
-- grants entirely — `create_deal_draft`, `update_deal_draft`,
-- `confirm_deal_change`, `set_line_allocation`, `substitute_line_product`,
-- `cancel_line_substitution`, `confirm_line_allocations`.
--
-- So the privilege is not fenced, it is REMOVED. Rejected on purpose:
--   * a column-allowlist re-GRANT (DEV-159 option 1) — breaks silently every
--     time a column is added to this table, and this table gains columns;
--   * a BEFORE UPDATE trigger (option 2) — sits on the hot deal write path and
--     must enumerate the protected columns, which is the same drift by another
--     route;
--   * splitting `line_all` into seller-only write (option 3) — leaves a client
--     write path open, just a narrower one, and the seller does not need one.
-- Removing an unused privilege is smaller than all three and cannot drift.
--
-- ⚠️ THE COLUMN-LEVEL REVOKE IN DEV-159's HISTORY DID NOT WORK, AND THIS IS WHY.
-- A previous attempt did `REVOKE UPDATE (allocation_status, …) FROM authenticated`
-- and the write still succeeded. That is correct Postgres behaviour, not a bug:
-- a table-level UPDATE grant already covers every column, and a column-level
-- REVOKE cannot subtract from it. The table-level grant must go first. It does,
-- here — and nothing re-grants UPDATE afterwards.
--
-- ⚠️ SELECT AND INSERT ARE DELIBERATELY KEPT.
--   SELECT — this is an integrity fix, not a confidentiality one. The
--            counterparty must still SEE the deal it is negotiating.
--   INSERT — `acceptPromotion` above. Note this leaves a NARROWER open surface:
--            `line_all`'s WITH CHECK is still only relationship membership, so a
--            member can still INSERT an arbitrary extra line into a shared deal.
--            That is a real gap, it is NOT what DEV-159 describes, and closing
--            it means moving `acceptPromotion` behind a definer RPC. Filed
--            separately rather than smuggled in here.
--
-- The `anon` revoke is defence in depth, and both halves are named because a
-- bare `REVOKE … FROM PUBLIC` leaves a role's own grant standing (session-77).
--
-- `deal_card` — the other half of DEV-159's title — is ALREADY closed:
-- `authenticated` holds only REFERENCES + SELECT on it (verified on production),
-- shut by `20260724120900_revoke_deal_card_status_writes.sql`. Nothing to do.
-- ============================================================================

REVOKE UPDATE, DELETE ON public.deal_line_item FROM authenticated;
REVOKE ALL ON public.deal_line_item FROM PUBLIC, anon;

-- Say it in the schema, so the next person reading grants knows it is a decision
-- and not an omission.
COMMENT ON TABLE public.deal_line_item IS
  'Deal line items. `authenticated` intentionally holds SELECT + INSERT only: '
  'UPDATE and DELETE were removed by DEV-159 because line_all is symmetric '
  '(card_relationship_member is true for BOTH sides) and could not tell buyer '
  'from seller. Every legitimate mutation goes through one of the seven '
  'SECURITY DEFINER deal RPCs. Do not re-grant UPDATE to add a feature — add a '
  'definer function, or the counterparty can forge allocation state and prices.';
