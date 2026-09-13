-- New companies start verified.
--
-- For the MVP pharmacy push a signup reaches Discover and Connect straight away:
-- no licence upload, no Hello Sello review queue. onboard_company never sets
-- verification_status, so this column default is the one place that decides a
-- new company's starting state. Existing companies keep their current status,
-- and rejected/revoked still work for any company an admin acts on later.
--
-- To restore manual verification: set the default back to 'pending'.

ALTER TABLE public.company ALTER COLUMN verification_status SET DEFAULT 'verified';
