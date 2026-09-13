-- New companies start verified.
--
-- For the MVP pharmacy push a signup reaches Discover and Connect straight away:
-- no licence upload, no Hello Sello review queue. onboard_company never sets
-- verification_status, so this column default is the one place that decides a
-- new company's starting state. Existing companies keep their current status.
-- No app path moves a company OUT of verified (approve/reject act only on
-- pending), so removing a bad signup takes a direct SQL update.
--
-- To restore manual verification: set the default back to 'pending'.

ALTER TABLE public.company ALTER COLUMN verification_status SET DEFAULT 'verified';
