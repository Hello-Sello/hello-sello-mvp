-- ============================================================================
-- Phase 13 — SET-02 (async half): erasure sweep — pg_cron day-30 → edge worker
-- ----------------------------------------------------------------------------
-- The asynchronous companion to 20260706090000_account_lifecycle.sql. That
-- migration opened the 30-day runway (person.deletion_scheduled_for); THIS one
-- CLOSES it: a daily pg_cron job POSTs to the erase-expired-accounts edge worker,
-- which GDPR-pseudonymizes every account whose runway has elapsed.
--
-- NON-DESTRUCTIVE BY CONSTRUCTION (honor exactly):
--   • NEVER hard-remove a person or auth.users row. person.id REFERENCES
--     auth.users(id) ON DELETE CASCADE and audit_log.actor_person_id REFERENCES
--     person(id) (phase1_core.sql:23,262) — removing either row cascades into the
--     append-only audit chain and corrupts it. Erasure = scrub person PII IN PLACE
--     + set anonymized_at; the worker tombstones auth.users.email + soft-deletes
--     (login disabled, row KEPT).
--   • The audit hash chain (20260607090005_fk_alters_triggers.sql:117-135)
--     serializes UUIDs + diffs, NOT person names — so scrubbing PII leaves every
--     prior entry_hash intact (proven by supabase/tests/erasure_chain_test.sql).
--
-- REUSES the sella-detect chain verbatim (20260612130000_sella_detect_trigger.sql):
--   pg_cron → net.http_post → /functions/v1/<fn>, with Vault-stored project_url +
--   edge_anon_key. Those two secrets are ALREADY seeded (project_url by the sella
--   migration :27-32; edge_anon_key out-of-band) — REUSE, do NOT vault.create_secret
--   them again.
--
-- COMPANY-LESS AUDIT (Open-Q #2, same discipline as 13-02): audit_log.company_id is
-- NOT NULL (phase1_core.sql:261). A half-onboarded person's company_id is NULL → the
-- gdpr_scrubbed audit is SKIPPED (audit_person_scrub guards on a non-null company_id)
-- rather than tripping the constraint.
--
-- SECURITY: the two scrub primitives are SECURITY DEFINER and granted to service_role
-- ONLY — never to authenticated. They are the automated sweep's tools, not user
-- actions, and every person write stays in a definer RPC (the DEV-88 discipline).
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ----------------------------------------------------------------------------
-- (1) scrub_person_pii(p_id) — pseudonymize ONE expired person IN PLACE.
--     Empties the six PII columns (first/last name, display_name, avatar_path,
--     preferences, metadata) + sets anonymized_at. The tenant link (company_id)
--     is RETAINED so the append-only audit trail keeps its company scope.
--     Idempotent: the `anonymized_at is null` guard makes a re-run a no-op, so a
--     raced double-run never double-scrubs. Row KEPT (update, never delete).
-- ----------------------------------------------------------------------------
create or replace function public.scrub_person_pii(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.person
     set first_name    = '',
         last_name     = '',
         display_name  = null,
         avatar_path   = null,
         preferences   = '{}'::jsonb,
         metadata      = '{}'::jsonb,
         anonymized_at = now()
   where id = p_id
     and anonymized_at is null;   -- idempotency guard: a re-run is a no-op
end;
$$;
-- Lock to service_role ONLY. Supabase default privileges grant EXECUTE on new
-- public functions to anon+authenticated, and `revoke from public` does NOT remove
-- those explicit role grants — so revoke them by name. Without this, any logged-in
-- user could scrub another person's PII (a DEV-88-class destruction vector).
revoke all on function public.scrub_person_pii(uuid) from public, anon, authenticated;
grant execute on function public.scrub_person_pii(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- (2) audit_person_scrub(p_person_id) — write the person.gdpr_scrubbed audit for a
--     just-scrubbed account. Self-contained + defensive:
--       • looks up the RETAINED company_id (not part of the PII scrub);
--       • company-less guard — a NULL company_id has nowhere to log (audit_log
--         .company_id is NOT NULL), so it SKIPS rather than raising (Open-Q #2);
--       • idempotent — never writes a second gdpr_scrubbed row for the same person
--         (a raced re-run of the daily sweep must not duplicate the record).
--     actor_type 'system' (an automated process), actor_person_id NULL — the sweep
--     is not a human actor. The BEFORE INSERT trigger fills the hash chain.
-- ----------------------------------------------------------------------------
create or replace function public.audit_person_scrub(p_person_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
begin
  select company_id into v_company_id from public.person where id = p_person_id;

  -- Company-less (half-onboarded) erasure: nothing to scope the audit to → skip.
  if v_company_id is null then
    return;
  end if;

  -- Idempotent: one gdpr_scrubbed row per person, ever.
  if exists (
    select 1 from public.audit_log
     where content_type = 'person'
       and content_id   = p_person_id
       and action       = 'person.gdpr_scrubbed'
  ) then
    return;
  end if;

  insert into public.audit_log
    (company_id, actor_person_id, actor_type, action, content_type, content_id, metadata)
  values
    (v_company_id, null, 'system', 'person.gdpr_scrubbed', 'person', p_person_id,
     jsonb_build_object('source', 'erase-expired-accounts'));
end;
$$;
revoke all on function public.audit_person_scrub(uuid) from public, anon, authenticated;
grant execute on function public.audit_person_scrub(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- (3) run_scheduled_erasures() — the pg_cron entry point. Reads the REUSED Vault
--     secrets and POSTs to the erase-expired-accounts edge worker (which performs
--     the auth.admin scrub the DB itself cannot). Fire-soft: a missing secret warns
--     + returns (no crash), and the next daily run retries. Mirrors the
--     sella_detect_worker POST shape (sella_detect_trigger.sql:77-99).
-- ----------------------------------------------------------------------------
create or replace function public.run_scheduled_erasures()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'edge_anon_key';
  if v_url is null or v_key is null then
    raise warning 'run_scheduled_erasures: missing vault secret(s) project_url/edge_anon_key — skipping';
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/functions/v1/erase-expired-accounts',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
end;
$$;
-- pg_cron runs jobs as the scheduling (superuser/owner) role, so no grant is needed
-- for the schedule to fire. Revoke anon+authenticated (default-granted) so no client
-- can trigger the sweep — it is a scheduler-only entry point.
revoke all on function public.run_scheduled_erasures() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- (4) SCHEDULE — daily at 03:00 UTC. Idempotent unschedule-then-schedule so a
--     `db reset` (or a re-apply) never double-schedules (mirror sella :110-115).
--     Self-healing: the worker only touches rows still past-due, so a missed day
--     catches up on the next run.
-- ----------------------------------------------------------------------------
do $$
begin
  perform cron.unschedule('erase-expired-accounts');
exception when others then null;  -- not scheduled yet
end $$;
select cron.schedule('erase-expired-accounts', '0 3 * * *', $$select public.run_scheduled_erasures();$$);
