-- ============================================================================
-- Migration — connections and verification must be SERVER-GRANTED, not
-- self-declared
-- ----------------------------------------------------------------------------
-- THE HOLE (two of them, both reproduced end-to-end and rolled back):
--
--   1. SELF-DECLARED CONNECTIONS. `authenticated` holds a table-wide
--      INSERT/UPDATE/DELETE/TRUNCATE grant on `relationship`, and the only
--      policy (`rel_all`) has WITH CHECK
--        current_company_id() = company_a_id OR current_company_id() = company_b_id
--      — it requires the CALLER's own company to be one side of the pair and
--      never consults the counterparty. So any signed-in user can
--      `INSERT INTO relationship (…, status) VALUES (me, anyone, 'active')`
--      through a direct PostgREST call and be "connected" to a company that
--      never agreed. Since the buyer-shop work, that row is the confidentiality
--      gate for hidden catalogue data: one forged row and a stranger reads
--      every hidden product. The attacker never has to defeat the status
--      logic — they write 'active'.
--
--   1b. THE CONSENT EVIDENCE WAS ITSELF FORGEABLE. Routing the mint through an
--      RPC that reads consent from `pending_inbox_item` is not enough on its
--      own, because that row is writable by the attacker on BOTH sides:
--        • UPDATE side — `inbox_update`'s WITH CHECK pins only the receiver_*
--          columns and never re-checks who SENT the request, so after a legal
--          self-addressed insert one UPDATE rewrites `sender_company_id` (and
--          `type`) into "GreenLeaf asked to connect to me".
--        • INSERT side — `inbox_insert`'s WITH CHECK pins `sender_company_id`
--          but NOTHING anywhere constrains `sender_person_id`, so a request can
--          be attributed to a person at any company who never asked. Proven
--          live against the SHIPPED `accept_person_connection` RPC: it minted a
--          non-consensual person_connection edge whose `initiated_by_person_id`
--          named the victim.
--      A permission gate is only as strong as the write path to its input, so
--      that write path is closed here too.
--
--   2. SELF-VERIFICATION. `authenticated` holds column UPDATE on all 23
--      `company` columns, and `company_update` is USING/WITH CHECK
--      (id = current_company_id() OR is_hs_team()) — so any member of a company
--      can `UPDATE company SET verification_status = 'verified'` on their own
--      row and clear every `is_caller_verified()` gate in the product, plus
--      forge the `verified_by`/`verified_at` audit trail.
--
-- Proven by supabase/tests/connection_consent_lockdown_test.sql (blocks 1, 3,
-- 3b, 3c and 7 are RED against the pre-fix schema — those direct writes and
-- forgeries currently SUCCEED, and that success IS the hole each proves).
--
-- WHY A COLUMN-LEVEL REVOKE ALONE DOES NOT WORK: Supabase grants
-- `authenticated` TABLE-level UPDATE on these tables. A
-- `REVOKE UPDATE (verification_status)` cannot override a table-level grant —
-- the broader grant still admits the column. (We hit exactly this on the deal
-- tables: a column REVOKE was applied and tested, and the direct write still
-- succeeded.) So for `company` and `pending_inbox_item` we REVOKE the
-- whole-table UPDATE and re-GRANT UPDATE on an explicit column ALLOWLIST that
-- omits the identity/verification columns — the DEV-88 pattern
-- (20260710120000_person_company_id_lockdown.sql), statement for statement.
-- For `relationship` there is no legitimate direct write at all (exactly one
-- call site in src/, and no function writes the table), so the whole DML grant
-- goes and the one legitimate writer moves into a SECURITY DEFINER RPC.
--
-- WHY `anon` IS REVOKED TOO: `anon` holds the same table-wide grants, and the
-- policy expression does not cover all of them. It blocks INSERT/UPDATE/DELETE
-- only — `current_company_id()` is NULL for a signed-out visitor, so every
-- USING/WITH CHECK evaluates false. It does NOT block TRUNCATE: RLS never
-- applies to TRUNCATE, so that verb was reachable for exactly as long as the
-- grant existed. Proven with real rows on a table carrying the identical
-- `anon` grant shape — 3 rows seeded, `SET ROLE anon; TRUNCATE …;` → 0 rows.
-- Nothing but a REVOKE can close TRUNCATE, which is why these statements are
-- grant changes and not policy changes. Revoking from PUBLIC alone does NOT
-- revoke `anon`; both must be named (the 2026-08-17 rule).
--
-- ⚠️  MAINTENANCE CAVEAT: because the `company` and `pending_inbox_item` grants
-- are now per-column allowlists, a FUTURE `ALTER TABLE … ADD COLUMN` on either
-- table will NOT be updatable by `authenticated` until it is added to the
-- re-GRANT below. This is the documented trade-off of the column-grant
-- approach, and it now applies to `company` and `pending_inbox_item` as well as
-- `person`. If you add a column the app writes directly (not via a definer
-- RPC), extend the GRANT.
--
-- Base RLS (20260607170000_rls_policies.sql) is the shared lane.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. `relationship`: no direct write door at all.
--    SELECT for `authenticated` is untouched — every read stays on `rel_all`.
--    Nothing in the application can now suspend, end or soft-delete a
--    relationship either: no disconnect surface exists today, and re-opening
--    that door belongs to whichever ticket builds one.
-- ----------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.relationship FROM authenticated;
REVOKE ALL ON public.relationship FROM anon;

-- ----------------------------------------------------------------------------
-- 2. The ONE legitimate relationship write, as a consent-checking RPC.
--    The caller supplies ONLY the inbox item id. The counterparty, the caller's
--    own company and the canonical (a < b) ordering are all DERIVED — the
--    counterparty can never be a free parameter.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_connection_request(p_inbox_item_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_own        uuid := public.current_company_id();
  v_item       public.pending_inbox_item%ROWTYPE;
  v_a          uuid;
  v_b          uuid;
  v_rel_id     uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'accept_connection_request: not_authenticated';
  END IF;
  IF v_own IS NULL THEN
    RAISE EXCEPTION 'accept_connection_request: caller has no company';
  END IF;

  -- Serialises two accepts of the SAME item. It does NOT serialise two
  -- different pending items on the same pair — that guarantee comes from
  -- uq_relationship_pair_active, which is why the insert below is
  -- ON CONFLICT DO NOTHING + re-SELECT rather than a bare INSERT.
  SELECT * INTO v_item
    FROM public.pending_inbox_item
   WHERE id = p_inbox_item_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'accept_connection_request: no request % exists', p_inbox_item_id;
  END IF;
  IF v_item.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'accept_connection_request: request % is deleted', p_inbox_item_id;
  END IF;
  IF v_item.status <> 'pending' THEN
    RAISE EXCEPTION 'accept_connection_request: request % is % (not pending)', p_inbox_item_id, v_item.status;
  END IF;
  -- IS DISTINCT FROM, not <>: a connect_person row has receiver_company_id NULL
  -- by CHECK, and `<>` would evaluate to NULL there and the guard would not fire.
  IF v_item.receiver_company_id IS DISTINCT FROM v_own THEN
    RAISE EXCEPTION 'accept_connection_request: request % is not addressed to your company', p_inbox_item_id;
  END IF;
  IF v_item.sender_company_id = v_own THEN
    RAISE EXCEPTION 'accept_connection_request: request % came from your own company', p_inbox_item_id;
  END IF;
  -- Stated, not accidental: this RPC mints a COMPANY relationship, so the item
  -- must be one of the company-request types. connect_person is accepted by
  -- accept_person_connection; deal_card is claimed by claim_deal_ticket.
  IF v_item.type NOT IN ('connect', 'connect_message', 'pricelist_request') THEN
    RAISE EXCEPTION 'accept_connection_request: request % is of type % — not a company connection request', p_inbox_item_id, v_item.type;
  END IF;

  -- Canonical order (CHECK relationship_canonical_order: company_a_id < company_b_id)
  v_a := least(v_own, v_item.sender_company_id);
  v_b := greatest(v_own, v_item.sender_company_id);

  -- ENSURE, not insert. Two companies can already be connected when a request
  -- arrives (the normal case for a pricing ask), so adopt the live pair row if
  -- there is one; uq_relationship_pair_active is what makes that exactly one.
  SELECT id INTO v_rel_id
    FROM public.relationship
   WHERE company_a_id = v_a AND company_b_id = v_b AND deleted_at IS NULL;

  IF v_rel_id IS NULL THEN
    INSERT INTO public.relationship (
      company_a_id, company_b_id, initiated_by_company_id, inbox_item_id,
      status, created_by, updated_by
    )
    VALUES (
      v_a, v_b, v_item.sender_company_id, p_inbox_item_id,
      'active', v_uid, v_uid            -- both nullable with no default and no
                                        -- BEFORE INSERT trigger: omit them and
                                        -- the row silently records no author.
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_rel_id;

    -- Lost the race: another accept minted the pair row between the SELECT and
    -- the INSERT. Adopt the winner rather than surfacing a raw 23505.
    IF v_rel_id IS NULL THEN
      SELECT id INTO v_rel_id
        FROM public.relationship
       WHERE company_a_id = v_a AND company_b_id = v_b AND deleted_at IS NULL;
    END IF;
  END IF;

  -- This function deliberately does NOT flip the inbox item's status —
  -- connect.acceptItem owns that table and flips it after the rollout returns.
  RETURN v_rel_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_connection_request(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.accept_connection_request(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. `company` column allowlist — every column EXCEPT the verification triple.
--    verification_status / verified_at / verified_by are one fact: WHO decided
--    this company is real, and when. Locking the status while leaving the other
--    two writable would just move the forgery to the audit trail.
--    approve_company / reject_company are SECURITY DEFINER and are unaffected.
-- ----------------------------------------------------------------------------
REVOKE UPDATE ON public.company FROM authenticated;

GRANT UPDATE (
  id,
  name,
  country,
  address,
  description,
  primary_products,
  website,
  metadata,
  created_by,
  updated_by,
  created_at,
  updated_at,
  deleted_by,
  deleted_at,
  tagline,
  cover_path,
  logo_path,
  warehouse_location,
  city,
  deactivated_at
) ON public.company TO authenticated;

-- `anon`'s SELECT is left alone — get_public_profile is a deliberate public read.
REVOKE UPDATE ON public.company FROM anon;

-- ----------------------------------------------------------------------------
-- 4. The ONE legitimate verification_status write a member may perform.
--    The `rejected` predicate lives INSIDE the function: resubmitting after a
--    rejection is the only transition this RPC can make, so no caller can turn
--    it into a self-verify by passing a different state.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resubmit_company_verification()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_company uuid := public.current_company_id();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'resubmit_company_verification: not_authenticated';
  END IF;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'resubmit_company_verification: caller has no company';
  END IF;

  UPDATE public.company
     SET verification_status = 'pending',
         updated_at = now()
   WHERE id = v_company
     AND verification_status = 'rejected';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'resubmit_company_verification: company % is not in the rejected state', v_company;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.resubmit_company_verification() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.resubmit_company_verification() TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. `pending_inbox_item` identity lockdown — UPDATE side (hole 1b).
--    9 columns kept + 6 identity columns omitted + `id` = the table's 16.
--    `id` is NOT re-granted: DEV-88 re-granted person.id, but there the row is
--    keyed to auth.uid(); here inbox_update's WITH CHECK inspects only the
--    receiver_* columns, so a writable `id` really is mutable. Every client
--    UPDATE on this table writes only status / assigned_to / assigned_by /
--    assigned_at (7 call sites, all read), so the allowlist costs nothing.
-- ----------------------------------------------------------------------------
REVOKE UPDATE ON public.pending_inbox_item FROM authenticated, anon;

GRANT UPDATE (
  note,
  status,
  assigned_to,
  assigned_at,
  assigned_by,
  metadata,
  created_at,
  updated_at,
  deleted_at
) ON public.pending_inbox_item TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. `pending_inbox_item` identity lockdown — INSERT side (hole 1b).
--    Adds `sender_person_id = auth.uid()`: a request may no longer be
--    attributed to someone who never asked.
--    The role list is carried deliberately. The live policy is
--      inbox_insert | INSERT | {authenticated} | with_check: (sender_company_id = current_company_id())
--    (pg_policies, 20260607170000_rls_policies.sql:233). Re-creating it without
--    `TO authenticated` would silently widen it to {public}.
--    Both client inserts already satisfy the new clause (discover/actions.ts:77
--    and discover/personActions.ts:57 both write sender_person_id: uid), and
--    the only function inserting here is `deliver_deal`, SECURITY DEFINER owned
--    by postgres (rolbypassrls), so policies do not apply to its legitimate
--    colleague-attributed write.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS inbox_insert ON public.pending_inbox_item;
CREATE POLICY inbox_insert ON public.pending_inbox_item
  FOR INSERT TO authenticated
  WITH CHECK (sender_company_id = public.current_company_id()
              AND sender_person_id = auth.uid());
