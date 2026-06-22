-- ============================================================================
-- Phase 3d - resize deal_line_item_private price columns (Ayush, 2026-06-18)
-- ----------------------------------------------------------------------------
-- D-07 (LOCKED): both deal_line_item_private price columns now hold a FROZEN
-- per-line price INPUT - the seller's cost on the seller's row, the buyer's
-- resale on the buyer's row - typed fresh per deal line and frozen at entry.
-- They are NOT a ratio. The original NUMERIC(6,4) sizing (max 99.9999) was
-- meant for a ratio/margin number and is far too small for a raw price like
-- "5.50 EUR/g". This widens both to NUMERIC(15,4), which is the SAME precision
-- product_cost.cogs already uses for a money value - so the two cost-bearing
-- columns are consistent.
--
-- The displayed margin % is always COMPUTED LIVE from this input + the line's
-- unit_price (D-02), never stored - so widening the input column is the only
-- schema change the margin feature needs on this table.
--
-- Pitfall 4 (empty-table assumption): deal_line_item_private is a dormant table
-- created on 2026-06-07 that nothing has ever written to - it has 0 rows in
-- EVERY environment (local, and never deployed to cloud). A WIDENING ALTER
-- COLUMN TYPE on an empty table is instant and lossless. If this migration is
-- ever re-run against a populated table, re-confirm no existing value exceeds
-- the new precision before applying (a widening change cannot truncate, but the
-- empty-table assumption is what makes this risk-free and fast here).
--
-- Scope: ONLY the two price columns are touched. product_cost is NOT touched
-- (D-07: it is at most an optional pre-fill source, never a write target this
-- phase wires). No column is renamed (renaming was left to Claude's Discretion
-- in 03D-CONTEXT.md and deliberately skipped - the churn is not worth it here).
-- ============================================================================

alter table public.deal_line_item_private
  alter column seller_margin type numeric(15, 4);

alter table public.deal_line_item_private
  alter column buyer_metric type numeric(15, 4);
