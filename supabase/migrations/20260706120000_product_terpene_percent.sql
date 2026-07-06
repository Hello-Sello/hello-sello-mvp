-- ============================================================================
-- Migration — product.terpene_percent (Present surface, Phase 7 fidelity pass)
-- ----------------------------------------------------------------------------
-- ONE headline "total terpenes" value for a product — the sum a COA reports over
-- its individual terpene rows (each ~0.2–0.5%). Editable inline on the card like
-- THC/CBD/CBG/CBN. Nullable, additive, NO backfill: existing products read NULL
-- and fall back to the derived batch-terpene sum (shopMap.deriveTerpPercent) until
-- the seller sets a manual value.
--
-- This is the ONLY schema change of the whole fidelity pass. The per-terpene
-- aroma profile (batch_terpene / terpene / aroma_description) stays a later pass.
-- ============================================================================

alter table public.product
  add column if not exists terpene_percent numeric;
