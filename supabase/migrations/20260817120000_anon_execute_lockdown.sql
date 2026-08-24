-- ============================================================================
-- Lock `anon` out of schema public — the whole class, not one batch
-- ----------------------------------------------------------------------------
-- `anon` can reach a function through TWO independent grants, and BOTH must be
-- revoked. Revoking either one alone silently leaves the function open:
--
--   1. PUBLIC  — Postgres's own built-in default. Every function is created
--                with EXECUTE granted to PUBLIC, and anon is part of PUBLIC.
--                Shows in proacl as a leading "=X/postgres" (empty grantee).
--   2. anon    — granted directly by Supabase's ALTER DEFAULT PRIVILEGES.
--
-- 20260816210000 revoked (2) on the 5 person-graph RPCs after finding that
-- `REVOKE ... FROM public` does not strip anon. The converse is equally true
-- and was NOT known then: `REVOKE ... FROM anon` does not strip PUBLIC. Proven
-- on a fresh local reset — revoking only anon left 39 functions still
-- anon-executable, all of them carrying "=X/postgres". Hence `FROM PUBLIC, anon`
-- on every line below.
--
-- 62 functions were reachable unauthenticated at /rest/v1/rpc/<name>. This
-- closes the 61 that should never have been, and removes the standing defaults
-- that keep re-opening the class.
--
-- get_public_profile is DELIBERATELY left anon-executable: /c/<handle> is a
-- public route (src/shared/db/proxy.ts) opened by QR scan, with no session.
--
-- Verified before writing:
--   * no RLS policy granted to anon/public calls any of these functions, so no
--     policy evaluation breaks (pg_policies scan over public + storage);
--   * trigger functions keep firing after the revoke — EXECUTE is checked at
--     CREATE TRIGGER time, not at fire time (proven locally on set_updated_at);
--   * every remaining caller is `authenticated` behind a gated route (the app
--     calls none of §2's functions at all).
--
-- Grants only — no function body is touched, so no stale-redeclare risk.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- § 1 — 61 legacy functions lose `anon`.
-- A closed set: §3 means no newly created function can join this list.
-- `authenticated` is intentionally untouched here — the RLS helper predicates
-- below (can_see_person, is_caller_verified, owns_*, ...) are evaluated inside
-- policies with the privileges of the CALLING role, so authenticated must keep
-- EXECUTE or every policy referencing them fails.
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.approve_join_request(p_request_id uuid, p_role text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.audit_log_compute_hash() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.audit_log_reject_mutation() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_thread(p_thread_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_workspace(p_ws_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_see_person(p_person_id uuid, p_company_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_account_deletion() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_line_substitution(p_line_item_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.card_relationship_member(p_card_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.change_member_role(p_person_id uuid, p_role text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_price_ladder_shape() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_deal_ticket(p_deal_card_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.close_deal_ticket(p_deal_card_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.confirm_deal_change(p_deal_card_id uuid, p_decision text, p_reason text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.confirm_detected_deal(p_message_id uuid, p_decision text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.confirm_line_allocations(p_line_item_ids uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_deal_draft(p_relationship_id uuid, p_deal_type text, p_value_net numeric, p_currency text, p_due_date timestamp with time zone, p_payment_terms_code text, p_free_delivery boolean, p_lines jsonb, p_private_value text, p_note text, p_counterparty_person_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_group_thread(p_name text, p_member_person_ids uuid[], p_deal_card_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_company_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_superadmin_group_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.deactivate_account() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.deactivate_company() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.decline_deal(p_deal_card_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.finalize_deal(p_deal_card_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(p_action text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.invite_member(p_email text, p_role text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_caller_verified() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_group_member(p_thread_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_hs_team() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_relationship_member(p_rel_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_workspace_member(p_ws_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.line_seller_company_id(p_line_item_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_company_members() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_pending_join_requests() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.onboard_company(p_name text, p_country text, p_type_codes text[], p_category_codes text[], p_custom_category text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.owns_group(p_group_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.owns_pricelist(p_pricelist_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.owns_product_batch(p_batch_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.propose_deal_change(p_deal_card_id uuid, p_draft jsonb, p_reason text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reactivate_account() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reactivate_company() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_invite_sent(p_email text, p_role text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_join_request(p_request_id uuid, p_reason text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_member(p_person_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reopen_deal_ticket(p_deal_card_id uuid, p_note text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.request_account_deletion() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.request_to_join(p_company_id uuid, p_note text) FROM PUBLIC, anon;
-- rls_auto_enable() is PRODUCTION-ONLY DRIFT: it exists on the cloud database
-- but no migration creates it (20260607170000_rls_policies.sql only refers to
-- it in a comment as "the project's rls_auto_enable"), so it is absent from a
-- fresh `supabase db reset`. Guarded rather than unconditional so this file
-- applies identically to both. Zero API surface either way — it returns
-- event_trigger, which PostgREST will not expose. Drift logged separately.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon';
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.search_joinable_companies(p_term text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sella_enqueue_detection() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.send_deal(p_deal_card_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_line_allocation(p_line_item_id uuid, p_decision text, p_batch_id uuid, p_batch_splits jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.shares_connection_with_company(p_company_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sign_deal(p_deal_card_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.substitute_line_product(p_line_item_id uuid, p_new_product_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_deal_draft(p_deal_card_id uuid, p_value_net numeric, p_currency text, p_due_date timestamp with time zone, p_payment_terms_code text, p_free_delivery boolean, p_lines jsonb, p_note text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.withdraw_deal_change(p_deal_card_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.withdraw_join_request(p_request_id uuid) FROM PUBLIC, anon;

-- ----------------------------------------------------------------------------
-- § 2 — two internal-only functions ALSO lose `authenticated`.
-- ----------------------------------------------------------------------------

-- seed_company_superadmin: SECURITY DEFINER, checks NOTHING about its caller,
-- and creates a 'Superadmin' group + grants team.manage / company.edit_profile
-- to whatever person_id it is handed. It was granted to `authenticated` by
-- 20260621100000_phase11_rbac_activation.sql. PROVEN exploitable locally: an
-- ordinary member calling
--     select seed_company_superadmin(current_company_id(), auth.uid())
-- goes from has_permission('team.manage') = false to true in a single call,
-- which then unlocks change_member_role / remove_member / invite_member /
-- deactivate_company. Same shape as the person.company_id self-write hole, but
-- through a function grant instead of a column grant.
--
-- Its only callers are onboard_company (SECURITY DEFINER) and the Phase-11
-- backfill, both executing as the owner `postgres`, so no legitimate caller
-- needs this grant.
REVOKE EXECUTE ON FUNCTION public.seed_company_superadmin(p_company_id uuid, p_founder_id uuid) FROM PUBLIC, anon, authenticated;

-- sella_detect_worker: the pg_cron worker (every 10s, scheduled as postgres).
-- Reads vault secrets and POSTs to the sella-detect edge function; any caller
-- could drain the pgmq queue out of band and drive edge-function invocations.
-- Nothing user-facing calls it.
REVOKE EXECUTE ON FUNCTION public.sella_detect_worker() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- § 3 — narrow the default. Read the limitation before relying on this.
--
-- This removes anon's DIRECT grant on functions created from here on (verified:
-- a newly created function is born with no anon entry in proacl). It does NOT
-- make new functions unreachable by anon, because Postgres merges its own
-- built-in "EXECUTE TO PUBLIC" for functions on top of any pg_default_acl entry,
-- and that PUBLIC grant cannot be revoked this way. Verified rather than
-- assumed: revoking `authenticated` via the same statement DID propagate to a
-- new function, so the stored default is honoured — PUBLIC specifically is not
-- removable. anon is a member of PUBLIC, so a new function is anon-reachable the
-- moment it is created.
--
-- So this statement is a narrowing, NOT the guard. The invariant is enforced by
-- supabase/tests/anon_execute_lockdown_test.sql, which fails and names any
-- function in schema public that becomes anon-executable. Every new RPC must
-- ship with `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon`.
--
-- Scoped to role `postgres` — the owner of every function in this schema.
-- `authenticated` is untouched: it legitimately needs EXECUTE by default.
-- ----------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- ----------------------------------------------------------------------------
-- § 4 — THE ACTUAL GUARD: auto-revoke on every newly created function.
--
-- §3 cannot deliver deny-by-default (see above), so enforce it with an event
-- trigger instead. Precedent in this same database: the `ensure_rls` event
-- trigger (owner postgres) does exactly this job for RLS. Confirmed that the
-- non-superuser `postgres` role may create event triggers on both local and
-- production.
--
-- Rule: any function created in schema public loses EXECUTE from PUBLIC and
-- anon immediately, in the same DDL command. A function that is DELIBERATELY
-- public must GRANT after creating it — the grant wins because it runs after
-- this trigger has already fired.
--
-- ⚠️  ONE FOOT-GUN, deliberately accepted: `CREATE OR REPLACE` on an existing
-- public function (today: get_public_profile) also fires this trigger and will
-- strip its anon grant. Re-GRANT in the same migration. Section (2) of
-- supabase/tests/anon_execute_lockdown_test.sql asserts get_public_profile is
-- still anon-callable, so this failure is caught rather than silent.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_anon_execute_on_new_function()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.object_identity
      FROM pg_event_trigger_ddl_commands() c
     WHERE c.command_tag = 'CREATE FUNCTION'
       AND c.schema_name = 'public'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.object_identity);
  END LOOP;
END;
$fn$;

-- The guard function is itself a new function in public; it is created before
-- the trigger exists, so it cannot self-revoke. Lock it by hand.
REVOKE EXECUTE ON FUNCTION public.revoke_anon_execute_on_new_function() FROM PUBLIC, anon;

DROP EVENT TRIGGER IF EXISTS revoke_anon_execute_on_new_function_trg;
CREATE EVENT TRIGGER revoke_anon_execute_on_new_function_trg
  ON ddl_command_end
  WHEN TAG IN ('CREATE FUNCTION')
  EXECUTE FUNCTION public.revoke_anon_execute_on_new_function();
