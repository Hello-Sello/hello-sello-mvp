-- ============================================================================
-- accept_person_connection(uuid) — accept a person↔person request (PG-7)
-- ----------------------------------------------------------------------------
-- The social-graph counterpart to acceptInbox — but it creates NO company
-- `relationship` and never runs planRollout (which would post a "companies are
-- now connected" c2c line). Given a pending connect_person request addressed to
-- the caller, it:
--   1. creates the person_connection edge (canonical order),
--   2. creates a company-less p2p chat_thread (relationship_id NULL) via the
--      person slots — access flows through the existing p2p person-slot RLS, not
--      chat_thread_member (copying only the NULL-relationship insert idea from
--      create_group_thread),
--   3. seeds ONE person-framed intro line,
--   4. flips the item to accepted (last, so a failure above leaves it retryable).
-- Idempotent: a re-accept returns the existing thread and creates nothing new
-- (the two partial unique indexes back the ON CONFLICT DO NOTHING).
--
-- SECURITY DEFINER: the edge/thread/message writes must bypass the tables' RLS,
-- but the caller identity gate is explicit — the row must be addressed to
-- auth.uid() (receiver_person_id), so no one can accept a request not theirs.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.accept_person_connection(p_item_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_sender uuid;
  v_status text;
  v_type   text;
  v_a uuid;
  v_b uuid;
  v_thread uuid;
  v_sender_name text;
  v_caller_name text;
BEGIN
  SELECT sender_person_id, status, type
    INTO v_sender, v_status, v_type
    FROM public.pending_inbox_item
   WHERE id = p_item_id AND receiver_person_id = v_caller
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'accept_person_connection: no connect_person request % addressed to you', p_item_id;
  END IF;
  IF v_type <> 'connect_person' THEN
    RAISE EXCEPTION 'accept_person_connection: % is not a connect_person request', p_item_id;
  END IF;

  v_a := least(v_sender, v_caller);
  v_b := greatest(v_sender, v_caller);

  -- Idempotent: already accepted → return the existing thread, change nothing.
  IF v_status = 'accepted' THEN
    SELECT id INTO v_thread FROM public.chat_thread
     WHERE type = 'p2p' AND relationship_id IS NULL
       AND person_a_id = v_a AND person_b_id = v_b AND deleted_at IS NULL;
    RETURN v_thread;
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'accept_person_connection: % is % (not pending)', p_item_id, v_status;
  END IF;

  -- 1) the edge (idempotent via uq_person_connection_active)
  INSERT INTO public.person_connection (person_a_id, person_b_id, initiated_by_person_id)
  VALUES (v_a, v_b, v_sender)
  ON CONFLICT DO NOTHING;

  -- 2) the company-less p2p thread (idempotent via uq_chat_thread_p2p_companyless)
  INSERT INTO public.chat_thread (relationship_id, type, person_a_id, person_b_id)
  VALUES (NULL, 'p2p', v_a, v_b)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_thread FROM public.chat_thread
   WHERE type = 'p2p' AND relationship_id IS NULL
     AND person_a_id = v_a AND person_b_id = v_b AND deleted_at IS NULL;

  -- 3) one person-framed intro line (facilitator voice; no company framing)
  SELECT coalesce(p.display_name, nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Someone')
    INTO v_sender_name FROM public.person p WHERE p.id = v_sender;
  SELECT coalesce(p.display_name, nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), 'you')
    INTO v_caller_name FROM public.person p WHERE p.id = v_caller;

  INSERT INTO public.chat_message (thread_id, sender_person_id, sender, type, body)
  VALUES (v_thread, NULL, 'sella', 'intro',
          v_sender_name || ' and ' || v_caller_name || ' are now connected. Say hello!');

  -- 4) flip the item last (retryable if anything above failed)
  UPDATE public.pending_inbox_item
     SET status = 'accepted', updated_at = now()
   WHERE id = p_item_id;

  RETURN v_thread;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_person_connection(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.accept_person_connection(uuid) TO authenticated;
