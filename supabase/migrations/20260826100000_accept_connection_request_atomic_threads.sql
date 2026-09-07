-- ============================================================================
-- accept_connection_request mints its own c2c/p2p chat_thread rows + seed
-- lines atomically, in the same transaction as the relationship.
-- ----------------------------------------------------------------------------
-- Before this migration, `accept_connection_request` only minted/adopted the
-- `relationship` row and returned its id; the browser (`acceptInbox`,
-- src/modules/messaging/supabase/store.ts) then ran `planRollout` and inserted
-- the c2c/p2p chat_thread rows + their seed messages itself, as a SEPARATE
-- later transaction. That left a window where the relationship existed with
-- no thread yet, and made the whole rollout non-atomic with the accept.
-- `rollout.ts` is deleted in this diff; its logic moves into this function via
-- the two new helpers `public._resolve_or_create_c2c_thread` /
-- `public._resolve_or_create_p2p_thread` (previous migration in this pair,
-- 20260826090000).
--
-- Re-emits the FULL live accept_connection_request body VERBATIM from
-- `20260825200000_accept_connection_request_status_guard.sql` (the current
-- live definition; NOT any earlier body) through its mint/adopt block (old
-- `:33-128`), with the local `v_rel_id` renamed to `relationship_id`
-- everywhere EXCEPT its own DECLARE (deleted — `relationship_id` is now the
-- OUT param, and a naive uniform rename would have shadowed it: a local
-- DECLARE of the same name as an OUT param wins, and the RPC would have
-- silently returned `relationship_id = NULL` while still succeeding). The
-- trailing `RETURN v_rel_id;` (old `:132`) is likewise deleted — a bare
-- `RETURN;` is required here (a function with OUT params cannot `RETURN
-- <expr>`, it is a parse-time error) — and replaced by the new block below,
-- which resolves/creates the c2c and (conditionally) p2p threads and their
-- seed lines, then returns via the three OUT params.
--
-- `DROP FUNCTION` first, not `CREATE OR REPLACE` — the return type changes
-- from `uuid` to `record` (a bare OUT-param signature change), which
-- `CREATE OR REPLACE FUNCTION` refuses. Confirmed safe to drop: one other
-- migration also carries a prior `CREATE OR REPLACE` + grants for this
-- function (`20260823090000_connection_consent_and_verification_lockdown.sql
-- :98,192-193`), but this migration's timestamp sorts after it, so replay
-- order is that v1 -> 20260825200000's v2 -> this drop+v3 — the evidence for
-- "safe to drop" is timestamp ordering, not absence of other definitions.
-- The `REVOKE`/`GRANT` tail is re-emitted below (a `DROP` takes grants with
-- it) — the OUT params are not part of the function's identity for
-- DROP/REVOKE/GRANT purposes, so `(uuid)` is still the correct signature.
--
-- Two behavioral notes, named here rather than silently inherited:
--   1. The `sella_enqueue_detection` trigger (matches `sender='person' AND
--      type='message'` on a p2p thread) now fires INSIDE this accept
--      transaction for a connect_message's note insert, not a separate later
--      browser statement. A `pgmq.send` failure there would now roll back the
--      ENTIRE accept, not just the note post — the transactional guarantee is
--      the point of this migration, not a side effect to work around. Applies
--      to the two EXISTING test suites too (their `connect_message` fixtures
--      with a note), not just the new one.
--   2. Message ordering (intro before the note it refers to) is asserted, not
--      left to `clock_timestamp()` chance: the note's `created_at` is the
--      intro's captured timestamp plus an explicit 1ms offset, so the two can
--      never tie regardless of clock resolution — see the note insert below.
-- ============================================================================

DROP FUNCTION public.accept_connection_request(uuid);

CREATE FUNCTION public.accept_connection_request(
  p_inbox_item_id uuid,
  OUT relationship_id uuid,
  OUT c2c_thread_id uuid,
  OUT p2p_thread_id uuid
) RETURNS record
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
  v_rel_status text;
  v_created              boolean;
  v_sender_person_name   text;
  v_sender_company_name  text;
  v_own_company_name     text;
  v_viewer_person_name   text;
  v_note                 text;
  v_intro_ts             timestamptz;
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
  SELECT id, status INTO relationship_id, v_rel_status
    FROM public.relationship
   WHERE company_a_id = v_a AND company_b_id = v_b AND deleted_at IS NULL;

  -- An existing pair can now be 'suspended' or 'ended', not just
  -- 'active'. Adopting it silently here would "reconnect" a relationship an
  -- HS operator deliberately took offline — refuse instead. Reactivating it
  -- is the operator's call, not an ordinary accept's.
  IF relationship_id IS NOT NULL AND v_rel_status <> 'active' THEN
    RAISE EXCEPTION 'accept_connection_request: relationship % is % — cannot accept a new request onto it', relationship_id, v_rel_status;
  END IF;

  IF relationship_id IS NULL THEN
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
    RETURNING id INTO relationship_id;

    -- Lost the race: another accept minted the pair row between the SELECT and
    -- the INSERT. Adopt the winner rather than surfacing a raw 23505.
    IF relationship_id IS NULL THEN
      SELECT id INTO relationship_id
        FROM public.relationship
       WHERE company_a_id = v_a AND company_b_id = v_b AND deleted_at IS NULL;
    END IF;
  END IF;

  -- This function deliberately does NOT flip the inbox item's status —
  -- connect.acceptItem owns that table and flips it after this call returns.

  -- Guard against a NULL OUT param reaching the helpers — the
  -- adopt branch's own double-failure path (INSERT conflicts AND the re-SELECT
  -- finds nothing) is the only way relationship_id can still be NULL here.
  -- chat_thread.relationship_id has no NOT NULL, so an unguarded call would
  -- mint an orphan thread with no error, rather than raising loudly.
  if relationship_id is null then
    raise exception 'accept_connection_request: relationship resolution failed';
  end if;

  -- Note (not guarded — near-unreachable, named not fixed): the
  -- SAME double-failure shape can happen one level down, inside either helper
  -- (its own SELECT misses, INSERT conflicts, re-SELECT also misses — needs a
  -- concurrent soft-delete of the thread mid-call). That returns
  -- thread_id = NULL, created = false; the `if v_created` gates below correctly
  -- skip the seed-line insert, so nothing raises — but c2c_thread_id/
  -- p2p_thread_id come back NULL and §3's `.filter(Boolean)` drops them
  -- silently: a successful accept with no thread and no error. send_deal
  -- reasons about this identical case by name (20260825180000:196-201);
  -- reachability here is near-zero (no app path soft-deletes a chat_thread),
  -- so this is accepted, not fixed.

  -- Name composition — the only place these joins happen once rollout.ts is
  -- deleted. v_own already resolved above (existing body). Sender company comes
  -- from the INBOX ITEM's sender_company_id (already loaded into v_item, NOT
  -- NULL on the table), matching inbox.ts:272-282's own source exactly — NOT
  -- from person.company_id (that column is nullable, and a NULL
  -- there would concatenate to a NULL body and hit chat_message.body's NOT NULL,
  -- rolling back the whole accept; it can also just be the wrong company if the
  -- sender has since changed employers).
  -- trim() matches inbox.ts:283's `${first_name} ${last_name}`.trim()` — a
  -- single-name signup (last_name = '', common on Google/Outlook OAuth) would
  -- otherwise bake a literal trailing double space into the seeded message.
  select trim(p.first_name || ' ' || p.last_name) into v_sender_person_name
  from public.person p where p.id = v_item.sender_person_id;
  select name into v_sender_company_name from public.company where id = v_item.sender_company_id;
  select name into v_own_company_name from public.company where id = v_own;

  select thread_id, created into c2c_thread_id, v_created
    from public._resolve_or_create_c2c_thread(relationship_id);
  if v_created then
    insert into public.chat_message (thread_id, sender, sender_person_id, type, body, created_at)
    values (c2c_thread_id, 'system', null, 'connection_established',
            v_own_company_name || ' and ' || v_sender_company_name || ' are now connected.',
            clock_timestamp());
  end if;

  if v_item.type in ('connect_message', 'pricelist_request') then
    select thread_id, created into p2p_thread_id, v_created
      from public._resolve_or_create_p2p_thread(relationship_id, v_uid, v_item.sender_person_id);
    if v_created then
      select trim(p.first_name || ' ' || p.last_name) into v_viewer_person_name
      from public.person p where p.id = v_uid;

      -- Ordering is asserted, not left to chance (independently flagged by
      -- three separate review passes): the note must sort strictly after the
      -- intro it refers to. Capturing clock_timestamp() once and adding an
      -- explicit 1ms offset for the note guarantees that regardless of clock
      -- resolution — two bare clock_timestamp() calls could tie on a coarse
      -- clock (virtualized/CI), which the old browser code's constructed
      -- 100ms stagger never risked.
      v_intro_ts := clock_timestamp();
      insert into public.chat_message (thread_id, sender, sender_person_id, type, body, created_at)
      values (
        p2p_thread_id, 'sella', null, 'intro',
        case v_item.type
          when 'connect_message' then
            v_sender_person_name || ' from ' || v_sender_company_name || ' wants to connect with ' ||
            v_viewer_person_name || ' from ' || v_own_company_name || '. Their note is below - take it from here.'
          when 'pricelist_request' then
            v_sender_person_name || ' from ' || v_sender_company_name || ' is asking ' ||
            v_viewer_person_name || ' (' || v_own_company_name || ') for a price list. Over to you both.'
        end,
        v_intro_ts);

      -- btrim over the ASCII whitespace set, not plain trim: SQL trim() strips
      -- SPACES only, JS .trim() strips all whitespace — a note of just "\n\t"
      -- is falsy in the original browser code's `input.note?.trim()` (skipped)
      -- but would be truthy under plain trim(). NOT full JS parity (JS also
      -- strips NBSP/BOM/Unicode separators; out of scope here).
      -- \x0B (not \v — \v is not a valid Postgres string escape; Postgres only
      -- recognizes \b\f\n\r\t + octal/hex/unicode, and an unrecognized escape
      -- is taken LITERALLY, so \v would silently put the LETTER "v" in the
      -- trim set) is the correct hex escape for vertical tab.
      v_note := btrim(v_item.note, E' \t\n\r\f\x0B');
      if v_item.type = 'connect_message' and v_note is not null and v_note <> '' then
        insert into public.chat_message (thread_id, sender, sender_person_id, type, body, created_at)
        values (p2p_thread_id, 'person', v_item.sender_person_id, 'message', v_note,
                v_intro_ts + interval '1 millisecond');
      end if;
    end if;
  end if;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_connection_request(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.accept_connection_request(uuid) TO authenticated;
