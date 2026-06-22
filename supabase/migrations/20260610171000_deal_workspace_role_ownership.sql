-- =====================================================================
-- 3b · Ownership is a ROLE, not a column (LOCKED 2026-06-10, Ayush;
-- Muskan present + agreed - this touches her foundation tables)
-- =====================================================================
-- A deal has TWO owners - one per company side (the demo collapses each
-- side's super-admin + deal-handler into one person). A single column can
-- never hold two people, so ownership moves fully into deal_member:
--
--   ownership = deal_member.role = 'owner'   (N owners; one per side)
--
-- 1. DROP deal_workspace.owner_person_id - safe: table has 0 rows, no
--    code reads it (only the generated types, regenerated after this),
--    and no RLS policy references it. `created_by` still records who
--    created the workspace, so no fact is lost.
-- 2. DROP uq_deal_member_one_owner - it enforced ONE owner per WORKSPACE,
--    which contradicts one-owner-PER-SIDE. Per-side uniqueness needs
--    person -> company_id, which a partial index cannot reach; the
--    createDeal core (section 3.5) owns that rule at write time.
--    NOTE: uq_deal_member_one_side_lead has the same per-workspace shape;
--    left untouched (side_lead is unused in 3b) - revisit in the
--    membership pass.
--
-- The role guard asked for in the 3b plan ALREADY exists: deal_member.role
-- is FK-constrained to the deal_member_role lookup (owner/side_lead/member).
-- =====================================================================

ALTER TABLE public.deal_workspace DROP COLUMN IF EXISTS owner_person_id;

DROP INDEX IF EXISTS public.uq_deal_member_one_owner;
