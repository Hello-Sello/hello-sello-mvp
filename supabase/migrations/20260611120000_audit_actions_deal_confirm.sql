-- =====================================================================
-- 3d · audit action codes for the confirmation gate
-- (Ayush, 2026-06-11): the four lifecycle events the confirm gate emits.
-- Content type `deal_card` already exists (lookups_and_seeds). These are
-- the first real `writeAudit` callers in the app (3a-3c wired none).
-- =====================================================================
INSERT INTO audit_action_type (code, description, category) VALUES
  ('deal.party_confirmed', 'One party confirmed a deal (one side of the two-sided gate)', 'lifecycle'),
  ('deal.confirmed',       'A deal became Confirmed (both sides confirmed)',              'lifecycle'),
  ('deal.declined',        'A party declined a draft, sending it back to negotiation',    'lifecycle'),
  ('deal.withdrawn',       'The initiator withdrew a draft before the other side confirmed', 'lifecycle')
ON CONFLICT (code) DO NOTHING;
