-- ============================================================================
-- pending_inbox_item — a PERSON target for Discover person↔person connect (PG-4)
-- ----------------------------------------------------------------------------
-- The Connect inbox was company-addressed only. Discover's social graph needs a
-- request aimed at a PERSON (connect_person). To keep such a request STRICTLY
-- person-scoped — never surfaced to the target's colleagues through the existing
-- inbox_select company branch (receiver_company_id = current_company_id()) — a
-- person request carries NO company target. So receiver_company_id becomes
-- nullable and, per type, EXACTLY ONE of (receiver_person_id | receiver_company_id)
-- is populated:
--   • connect_person  → receiver_person_id set,  receiver_company_id NULL
--   • every other type → receiver_company_id set, receiver_person_id  NULL
--
-- Additive + back-compatible: every existing row is a company type with
-- receiver_company_id set and receiver_person_id absent, so all four CHECKs hold
-- for current data. Shared table (Ayush's lane) — sync-locked; new migration
-- only, no edits to his source files.
-- ============================================================================

-- The new request type.
INSERT INTO public.inbox_request_type (code, description, sort_order) VALUES
  ('connect_person', 'Person-to-person connection request (Discover social graph)', 5);

-- The person target.
ALTER TABLE public.pending_inbox_item
  ADD COLUMN receiver_person_id UUID NULL REFERENCES public.person(id);
CREATE INDEX idx_inbox_receiver_person ON public.pending_inbox_item(receiver_person_id);

-- A person request carries no company target → receiver_company_id no longer mandatory.
ALTER TABLE public.pending_inbox_item ALTER COLUMN receiver_company_id DROP NOT NULL;

-- Type/target invariants (each single-direction + named, matching the existing
-- inbox_deal_card_only_for_deal_card_type style).
ALTER TABLE public.pending_inbox_item
  ADD CONSTRAINT inbox_person_target_only_for_connect_person
    CHECK (receiver_person_id IS NULL OR type = 'connect_person'),
  ADD CONSTRAINT inbox_connect_person_requires_person
    CHECK (type <> 'connect_person' OR receiver_person_id IS NOT NULL),
  ADD CONSTRAINT inbox_connect_person_has_no_company
    CHECK (type <> 'connect_person' OR receiver_company_id IS NULL),
  ADD CONSTRAINT inbox_company_request_requires_company
    CHECK (type = 'connect_person' OR receiver_company_id IS NOT NULL);
