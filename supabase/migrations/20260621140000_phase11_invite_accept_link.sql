-- ============================================================================
-- Phase 11 (11-06) — Invite-accept linking  (RBAC-02, D-06/D-07; RESEARCH §7, risk #1)
-- ----------------------------------------------------------------------------
-- Resolves integration-risk #1: the existing Phase 06.1 signup trigger
-- (20260619162618_oauth_person_trigger_fix.sql) ONLY sets first_name/last_name
-- and leaves person.company_id NULL. So an invited colleague who accepts their
-- invite would land company-less — the invite would NOT link them to the
-- inviting company. This migration extends handle_new_user() to consume the
-- invite metadata that auth.admin.inviteUserByEmail(email, { data }) writes to
-- auth.users.raw_user_meta_data ({ company_id, role }; src/app/team/actions.ts):
--
--   • company_id present (the INVITE path) → set person.company_id at creation
--     so the invitee is an ACTIVE member of the inviting company on first
--     sign-in (D-07 auto-active; "pending" was just invited-not-yet-accepted).
--   • role = 'superadmin' AND the company already has a 'Superadmin' group
--     (it always does post-onboarding/backfill, plan 03) → add the invitee to
--     THAT existing group via person_group, so they accept as a Superadmin.
--     role = 'member' (or absent) → company_id only, no group = Member.
--
-- Why this is safe to do INSIDE the trigger (not a separate post-accept step):
--   • The trigger is already SECURITY DEFINER, so it can write person_group even
--     though §9 (plan 02) made person_group SELECT-only for `authenticated`. We
--     do NOT relax that lockdown — the definer trigger is the privileged path.
--   • We add membership to the EXISTING Superadmin group only (never create one
--     here) so a malformed/stale company_id can never mint a group owned by the
--     invitee. seed_company_superadmin() owns group CREATION (onboarding/backfill).
--
-- Threat model (11-06 register):
--   T-11-11 (EoP — user self-sets company_id/role): mitigated. This metadata is
--     written ONLY by the service-role inviteUserByEmail (plan 05); normal app
--     signup never sets company_id in metadata, so the invite branch is inert for
--     ordinary signups. We additionally guard on the company actually existing,
--     so even a forged value can only point at a real company (and the invite
--     token itself is the authorization — GoTrue issues it only to the invitee).
--
-- Design preserved from 20260619162618 (no regression to password/Google/Outlook):
--   • CREATE OR REPLACE FUNCTION only — the on_auth_user_created trigger is NOT
--     dropped/recreated. The name-resolution chain is copied VERBATIM; the only
--     net-new behaviour is the additive company_id/role block, gated on
--     company_id being present in metadata. Every existing signup path is
--     unchanged (no company_id in metadata → the new block is skipped entirely).
--   • SECURITY DEFINER + SET search_path = public (definer-function hardening,
--     unchanged from the trigger it replaces).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta       jsonb := NEW.raw_user_meta_data;
  full_nm    text  := COALESCE(meta ->> 'full_name', meta ->> 'name', '');
  first_nm   text;
  last_nm    text;
  -- Invite linking (additive; NULL for every non-invite signup)
  v_company  uuid;
  v_role     text  := meta ->> 'role';
  v_group_id uuid;
BEGIN
  -- ── Name resolution (UNCHANGED from 20260619162618) ──────────────────────
  -- 1) Explicit fields: password (first_name/last_name) OR Google (given/family).
  first_nm := COALESCE(NULLIF(meta ->> 'first_name', ''), NULLIF(meta ->> 'given_name', ''));
  last_nm  := COALESCE(NULLIF(meta ->> 'last_name', ''),  NULLIF(meta ->> 'family_name', ''));

  -- 2) Fall back to splitting a combined name (Outlook/azure).
  IF first_nm IS NULL AND full_nm <> '' THEN
    first_nm := split_part(full_nm, ' ', 1);
    IF last_nm IS NULL AND position(' ' IN full_nm) > 0 THEN
      last_nm := NULLIF(substring(full_nm FROM position(' ' IN full_nm) + 1), '');
    END IF;
  END IF;

  -- 3) Last-resort defaults so the NOT NULL columns are always satisfied.
  first_nm := COALESCE(NULLIF(first_nm, ''), NULLIF(split_part(NEW.email, '@', 1), ''), 'Member');
  last_nm  := COALESCE(NULLIF(last_nm, ''), '');

  -- ── Invite linking (NET-NEW; runs ONLY on the invite path) ───────────────
  -- Resolve company_id from invite metadata, accepting it only when it points at
  -- a real company (a malformed/forged value falls through to a company-less
  -- person, i.e. the existing safe "no company yet" state — never a broken row).
  IF (meta ->> 'company_id') IS NOT NULL THEN
    SELECT c.id INTO v_company
      FROM public.company c
     WHERE c.id = (meta ->> 'company_id')::uuid;
  END IF;

  -- Create the person row, linking company_id from a valid invite (else NULL).
  INSERT INTO public.person (id, first_name, last_name, company_id)
  VALUES (NEW.id, left(first_nm, 100), left(last_nm, 100), v_company);

  -- Superadmin invite → join the company's EXISTING Superadmin group (never
  -- create one here — group creation belongs to seed_company_superadmin()).
  IF v_company IS NOT NULL AND v_role = 'superadmin' THEN
    SELECT g.id INTO v_group_id
      FROM public."group" g
     WHERE g.company_id = v_company
       AND g.name = 'Superadmin'
       AND g.deleted_at IS NULL
     LIMIT 1;

    IF v_group_id IS NOT NULL THEN
      INSERT INTO public.person_group (person_id, group_id)
      VALUES (NEW.id, v_group_id)
      ON CONFLICT DO NOTHING;  -- idempotent vs uq_person_group_group_active
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Auto-creates a public.person row when an auth.users row is inserted. Resolves '
  'first/last names across password, Google, and Outlook/azure metadata shapes. '
  'On the INVITE path (inviteUserByEmail data carries company_id + role), links '
  'the new person to the inviting company (company_id) and, when role=superadmin, '
  'adds them to that company''s existing Superadmin group (D-06/D-07). Ordinary '
  'signups have no company_id in metadata, so the link block is skipped and '
  'company_id stays NULL (set later at company setup; Path-B invariant).';
