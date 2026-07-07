-- ============================================================================
-- erasure_chain_test.sql — Phase 13 SET-02 erasure hash-chain invariant proof
-- ----------------------------------------------------------------------------
-- Proves the load-bearing GDPR claim of the day-30 erasure sweep
-- (20260706090200_erasure_cron.sql + supabase/functions/erase-expired-accounts):
-- pseudonymizing an expired account is NON-DESTRUCTIVE to the append-only audit
-- hash chain, because both rows are KEPT and the canonical hash covers UUIDs +
-- diffs, NOT person PII.
--
--   • (A) BOTH ROWS SURVIVE — after the sweep the person row still exists (name /
--         photo / preferences / metadata scrubbed, anonymized_at set, company_id
--         RETAINED) AND the auth.users row still exists (email tombstoned,
--         soft-deleted → login disabled). Neither is hard-deleted.
--   • (B) CHAIN STILL VERIFIES — recomputing every entry_hash exactly as the
--         BEFORE INSERT trigger does (fk_alters_triggers.sql:117-135) succeeds
--         end-to-end AFTER the scrub, and prev_entry_hash linkage holds.
--   • (C) HISTORY IS IMMUTABLE — the pre-existing audit rows that reference the
--         erased person (as actor AND as content) keep BYTE-IDENTICAL entry_hashes
--         after the scrub — proof their hash never depended on the scrubbed PII.
--   • (D) IDEMPOTENT — a second sweep of the same row is a no-op: no re-scrub,
--         no duplicate gdpr_scrubbed audit, chain still valid.
--
-- The worker's two DB-side steps are the REAL RPCs the edge function calls
-- (scrub_person_pii + audit_person_scrub); its two auth.admin steps (email
-- tombstone + soft-delete) are simulated in SQL here, since the GoTrue admin API
-- cannot run inside a psql transaction (that path is a cloud-UAT item, RESEARCH A3).
--
-- Mirrors the account_lifecycle / RBAC harness: ONE BEGIN…ROLLBACK transaction
-- seeding EPHEMERAL f-space fixtures (unused by any seed) and leaving NO trace.
-- Any failed assertion RAISEs and aborts (psql -v ON_ERROR_STOP=1 → non-zero exit);
-- success prints the all-passed line at the very end.
--
-- Run:  bash supabase/tests/run_erasure_chain_test.sh
--       (after `supabase db reset` has applied 20260706090200_erasure_cron.sql)
-- ============================================================================

BEGIN;

-- ── A reusable end-to-end chain verifier (temp → dropped at ROLLBACK). Recomputes
-- each row's entry_hash EXACTLY as audit_log_compute_hash (fk_alters_triggers.sql)
-- and checks the prev_entry_hash linkage. RAISEs on the first break. ───────────────
CREATE FUNCTION pg_temp.verify_audit_chain() RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  r         record;
  v_canon   text;
  v_hash    bytea;
  v_prev    bytea := NULL;
  v_rows    int   := 0;
BEGIN
  FOR r IN SELECT * FROM public.audit_log ORDER BY sequence_number ASC LOOP
    v_rows := v_rows + 1;

    -- linkage: this row's stored prev_entry_hash must equal the previous entry_hash
    IF r.prev_entry_hash IS DISTINCT FROM v_prev THEN
      RAISE EXCEPTION 'CHAIN LINKAGE BROKEN at seq %: prev_entry_hash <> previous row entry_hash', r.sequence_number;
    END IF;

    -- canonical serialization — byte-for-byte identical to the insert trigger
    v_canon := concat_ws('|',
      r.id::text,
      r.sequence_number::text,
      r.company_id::text,
      coalesce(r.actor_person_id::text, ''),
      r.actor_type,
      coalesce(r.on_behalf_of_person_id::text, ''),
      r.action,
      r.content_type,
      r.content_id::text,
      coalesce(r.before_diff::text, ''),
      coalesce(r.after_diff::text, ''),
      coalesce(r.reason, ''),
      r.metadata::text,
      coalesce(r.reverses_audit_id::text, ''),
      to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    );
    v_hash := extensions.digest(coalesce(r.prev_entry_hash, ''::bytea) || convert_to(v_canon, 'UTF8'), 'sha256');

    IF v_hash IS DISTINCT FROM r.entry_hash THEN
      RAISE EXCEPTION 'CHAIN HASH BROKEN at seq %: recomputed entry_hash <> stored entry_hash', r.sequence_number;
    END IF;

    v_prev := r.entry_hash;
  END LOOP;

  IF v_rows = 0 THEN
    RAISE EXCEPTION 'CHAIN EMPTY: no audit rows to verify (fixture seeding failed)';
  END IF;
END;
$fn$;

-- ── Fixtures. Frank is the doomed (expired) account; Gwen is a not-due bystander.
-- auth.users inserts fire on_auth_user_created → a person row (company_id NULL);
-- we attach company + realistic PII below. Rolled back. ───────────────────────────
INSERT INTO auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'f1111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'erase-frank@example.test', '{"first_name":"Frank","last_name":"Doomed"}', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000000', 'f2222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'erase-gwen@example.test',  '{"first_name":"Gwen","last_name":"Bystander"}', NOW(), NOW());

INSERT INTO company (id, name, country, verification_status, verified_at, created_by) VALUES
  ('f0000000-0000-0000-0000-000000000000', 'Erasure Test Company', 'DE', 'verified', NOW(),
   'f1111111-1111-1111-1111-111111111111');

-- Frank: full PII + the tenant link. Gwen: tenant link only.
UPDATE person
   SET company_id   = 'f0000000-0000-0000-0000-000000000000',
       display_name = 'Frank Doomed',
       avatar_path  = 'avatars/frank.jpg',
       preferences  = '{"theme":"dark"}'::jsonb,
       metadata     = '{"note":"private"}'::jsonb
 WHERE id = 'f1111111-1111-1111-1111-111111111111';
UPDATE person
   SET company_id = 'f0000000-0000-0000-0000-000000000000'
 WHERE id = 'f2222222-2222-2222-2222-222222222222';

-- Frank is DUE: past his own 30-day runway, not yet anonymized.
UPDATE person
   SET deactivated_at         = now() - interval '31 days',
       deletion_scheduled_for = now() - interval '1 day'
 WHERE id = 'f1111111-1111-1111-1111-111111111111';

-- ── A real audit history that REFERENCES Frank (as actor AND as content). These
-- rows are hashed by the insert trigger; if erasure rewrote history their hashes
-- would drift. Codes all pre-exist (audit_actor_type 'user'; account.* seeded by
-- 13-02; content_type 'person'). ───────────────────────────────────────────────────
INSERT INTO audit_log
  (company_id, actor_person_id, actor_type, action, content_type, content_id, metadata)
VALUES
  ('f0000000-0000-0000-0000-000000000000', 'f1111111-1111-1111-1111-111111111111', 'user',
   'account.deactivated', 'person', 'f1111111-1111-1111-1111-111111111111', '{}'::jsonb),
  ('f0000000-0000-0000-0000-000000000000', 'f1111111-1111-1111-1111-111111111111', 'user',
   'account.deletion_requested', 'person', 'f1111111-1111-1111-1111-111111111111', '{}'::jsonb);

-- (A0) chain is valid BEFORE the erasure; snapshot every pre-existing entry_hash.
SELECT pg_temp.verify_audit_chain();
CREATE TEMP TABLE _pre AS
  SELECT sequence_number, entry_hash FROM public.audit_log;

-- ════════════════════════════════════════════════════════════════════════════
-- Run the sweep's DB-side steps the worker performs (auth.admin steps simulated).
-- ════════════════════════════════════════════════════════════════════════════
-- 1. scrub PII in place — the REAL RPC the edge worker calls.
SELECT public.scrub_person_pii('f1111111-1111-1111-1111-111111111111');
-- 2. tombstone the auth.users email + clear signup metadata (worker: updateUserById).
UPDATE auth.users
   SET email             = 'f1111111-1111-1111-1111-111111111111@deleted.hello-sello.invalid',
       raw_user_meta_data = '{}'::jsonb
 WHERE id = 'f1111111-1111-1111-1111-111111111111';
-- 3. soft-delete: disable login, row KEPT (worker: deleteUser shouldSoftDelete).
UPDATE auth.users
   SET deleted_at = now()
 WHERE id = 'f1111111-1111-1111-1111-111111111111';
-- 4. compliance audit — the REAL RPC the edge worker calls.
SELECT public.audit_person_scrub('f1111111-1111-1111-1111-111111111111');

-- ════════════════════════════════════════════════════════════════════════════
-- (A) BOTH ROWS SURVIVE + person pseudonymized + bystander untouched.
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.person WHERE id = 'f1111111-1111-1111-1111-111111111111') THEN
    RAISE EXCEPTION 'ERASE FAIL: person row was DELETED (must be KEPT + scrubbed)';
  END IF;
  IF (SELECT anonymized_at FROM public.person WHERE id = 'f1111111-1111-1111-1111-111111111111') IS NULL THEN
    RAISE EXCEPTION 'ERASE FAIL: anonymized_at was not set';
  END IF;
  IF (SELECT first_name FROM public.person WHERE id = 'f1111111-1111-1111-1111-111111111111') <> ''
     OR (SELECT last_name FROM public.person WHERE id = 'f1111111-1111-1111-1111-111111111111') <> '' THEN
    RAISE EXCEPTION 'ERASE FAIL: first_name/last_name not scrubbed';
  END IF;
  IF (SELECT display_name FROM public.person WHERE id = 'f1111111-1111-1111-1111-111111111111') IS NOT NULL
     OR (SELECT avatar_path FROM public.person WHERE id = 'f1111111-1111-1111-1111-111111111111') IS NOT NULL THEN
    RAISE EXCEPTION 'ERASE FAIL: display_name/avatar_path not cleared';
  END IF;
  IF (SELECT preferences FROM public.person WHERE id = 'f1111111-1111-1111-1111-111111111111') <> '{}'::jsonb
     OR (SELECT metadata FROM public.person WHERE id = 'f1111111-1111-1111-1111-111111111111') <> '{}'::jsonb THEN
    RAISE EXCEPTION 'ERASE FAIL: preferences/metadata not cleared';
  END IF;
  -- tenant link RETAINED (kept for the audit trail's company scope)
  IF (SELECT company_id FROM public.person WHERE id = 'f1111111-1111-1111-1111-111111111111') IS NULL THEN
    RAISE EXCEPTION 'ERASE FAIL: company_id was wiped (the tenant link must be retained)';
  END IF;
  -- auth.users row KEPT + email tombstoned + login disabled
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = 'f1111111-1111-1111-1111-111111111111') THEN
    RAISE EXCEPTION 'ERASE FAIL: auth.users row was DELETED (must be KEPT + soft-deleted)';
  END IF;
  IF (SELECT email FROM auth.users WHERE id = 'f1111111-1111-1111-1111-111111111111')
       NOT LIKE '%@deleted.hello-sello.invalid' THEN
    RAISE EXCEPTION 'ERASE FAIL: auth.users email was not tombstoned';
  END IF;
  IF (SELECT deleted_at FROM auth.users WHERE id = 'f1111111-1111-1111-1111-111111111111') IS NULL THEN
    RAISE EXCEPTION 'ERASE FAIL: auth.users not soft-deleted (login still enabled)';
  END IF;
  -- bystander untouched (not due)
  IF (SELECT anonymized_at FROM public.person WHERE id = 'f2222222-2222-2222-2222-222222222222') IS NOT NULL THEN
    RAISE EXCEPTION 'SCOPE LEAK: the sweep anonymized a not-due bystander';
  END IF;
  -- exactly one gdpr_scrubbed audit row for Frank
  IF (SELECT count(*) FROM public.audit_log
        WHERE content_type = 'person'
          AND content_id   = 'f1111111-1111-1111-1111-111111111111'
          AND action       = 'person.gdpr_scrubbed') <> 1 THEN
    RAISE EXCEPTION 'AUDIT FAIL: expected exactly one person.gdpr_scrubbed row';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- (B) THE CHAIN STILL VERIFIES end-to-end AFTER erasure — the core invariant.
-- ════════════════════════════════════════════════════════════════════════════
SELECT pg_temp.verify_audit_chain();

-- ════════════════════════════════════════════════════════════════════════════
-- (C) HISTORY IS IMMUTABLE — every pre-existing entry_hash is byte-identical, so
--     scrubbing Frank's PII did NOT rewrite the rows that reference him.
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_changed int;
BEGIN
  SELECT count(*) INTO v_changed
    FROM _pre p
    JOIN public.audit_log a USING (sequence_number)
   WHERE a.entry_hash IS DISTINCT FROM p.entry_hash;
  IF v_changed <> 0 THEN
    RAISE EXCEPTION 'IMMUTABILITY FAIL: % pre-existing audit entry_hash(es) changed after the PII scrub', v_changed;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- (D) IDEMPOTENT — a second sweep of the same row is a no-op (no re-scrub, no
--     duplicate audit); the chain stays valid.
-- ════════════════════════════════════════════════════════════════════════════
SELECT public.scrub_person_pii('f1111111-1111-1111-1111-111111111111');
SELECT public.audit_person_scrub('f1111111-1111-1111-1111-111111111111');
DO $$
BEGIN
  IF (SELECT count(*) FROM public.audit_log
        WHERE content_type = 'person'
          AND content_id   = 'f1111111-1111-1111-1111-111111111111'
          AND action       = 'person.gdpr_scrubbed') <> 1 THEN
    RAISE EXCEPTION 'IDEMPOTENCY FAIL: re-running the sweep duplicated the gdpr_scrubbed audit';
  END IF;
END $$;
SELECT pg_temp.verify_audit_chain();

ROLLBACK;
SELECT 'ALL ERASURE CHAIN TESTS PASSED' AS result;
