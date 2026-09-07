-- ============================================================================
-- HEL-82 (closing the gap `security` found) · accept_connection_request
-- refuses to adopt a non-active relationship.
-- ----------------------------------------------------------------------------
-- 20260823090000's own header (:85-87) already named this exact gap before it
-- was reachable: "Nothing in the application can now suspend, end or
-- soft-delete a relationship either... re-opening that door belongs to
-- whichever ticket builds one." This is that ticket.
--
-- Without this guard, once a relationship is suspended or ended:
--   1. list_discoverable_companies (20260825110000:167, requires status =
--      'active') stops showing the pair as connected — the Connect button
--      reappears for both sides.
--   2. A fresh connection/pricing request reaches the OTHER side's inbox
--      (inbox_insert has no relationship-status predicate — that is HEL-82's
--      documented, ticketed follow-up, not this fix).
--   3. That side accepts. `accept_connection_request`'s "ENSURE, not insert"
--      branch (:159-161) finds the existing non-active row and — before this
--      migration — silently adopted it, returned success, and left status
--      untouched. The app-side rollout then mints a fresh chat thread and
--      intro messages on a relationship an operator deliberately took
--      offline, while every status-aware reader still says "not connected" —
--      a permanent Connect loop with a live side effect each time through it.
--
-- Re-emits the FULL live accept_connection_request body VERBATIM (from
-- 20260823090000_connection_consent_and_verification_lockdown.sql — the
-- current live definition; NOT any earlier body) with ONE delta: after the
-- adopt-branch SELECT, refuse when the found row is not 'active'. Reopening
-- the pair is the HS-operator's call (reactivate_relationship), not something
-- an ordinary accept can do implicitly.
-- ============================================================================

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
  v_rel_status text;
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
  SELECT id, status INTO v_rel_id, v_rel_status
    FROM public.relationship
   WHERE company_a_id = v_a AND company_b_id = v_b AND deleted_at IS NULL;

  -- HEL-82: an existing pair can now be 'suspended' or 'ended', not just
  -- 'active'. Adopting it silently here would "reconnect" a relationship an
  -- HS operator deliberately took offline — refuse instead. Reactivating it
  -- is the operator's call, not an ordinary accept's.
  IF v_rel_id IS NOT NULL AND v_rel_status <> 'active' THEN
    RAISE EXCEPTION 'accept_connection_request: relationship % is % — cannot accept a new request onto it', v_rel_id, v_rel_status;
  END IF;

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
