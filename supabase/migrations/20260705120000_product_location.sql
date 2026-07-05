-- ============================================================================
-- Migration — product.location (Present surface, Phase 7)
-- ----------------------------------------------------------------------------
-- A nullable free-text label naming the shop/warehouse a product sits in. It
-- drives the Present "location groups" (thin divider header per location, D-04)
-- and migrates the old free-text location label. No backfill — existing products
-- read as NULL (the single default group) until the seller sets one.
--
-- Structured multi-warehouse addresses are Phase 16; this is the lightweight
-- grouping column the redesigned Present page needs now.
-- ============================================================================

alter table public.product
  add column if not exists location varchar(80);
