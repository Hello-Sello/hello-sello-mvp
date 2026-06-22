-- =====================================================================
-- 3.5a Phase 0 · create-deal foundation  (Ayush, 2026-06-11)
--   REFERENCE DATA ONLY. The audit action code `deal.created` is the first
--   create-side `writeAudit` caller (3d added the confirm-side codes).
--
--   NOTE (2026-06-16, Option B): the Aurora demo CATALOGUE (4 products +
--   pricelist items) that used to live here was MOVED to
--   supabase/seed/seed.sql (section 6). It is demo data and it referenced
--   company aaaaaaaa-… (GreenLeaf/Aurora) + pricelist 3fe179d5-…, which
--   seed.sql creates AFTER migrations — so it could never run at migration
--   time on a fresh DB. Only the reference audit code stays here.
-- =====================================================================

-- audit action code (reference; idempotent) ---------------------------
INSERT INTO audit_action_type (code, description, category) VALUES
  ('deal.created', 'A draft deal card was created (manual, from chat)', 'lifecycle')
ON CONFLICT (code) DO NOTHING;
