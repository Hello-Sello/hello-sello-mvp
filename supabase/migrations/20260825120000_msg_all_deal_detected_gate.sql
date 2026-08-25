-- ============================================================================
-- `deal_detected` becomes un-forgeable by a thread member (HEL-67, Gap 1)
-- ----------------------------------------------------------------------------
-- `20260614121000_propose_deal_rpc.sql:12` states: "RLS lets only Sella /
-- service-role insert a `deal_detected` message; a person cannot."
--
-- THAT WAS A CODE COMMENT, NOT A GATE. The governing policy is `msg_all`
-- (`20260607170000_rls_policies.sql:300`), the ONLY policy on `chat_message`:
--
--     USING      (can_access_thread(thread_id))
--     WITH CHECK (can_access_thread(thread_id))
--
-- No `type` predicate, and no migration has ever narrowed `chat_message` for
-- `authenticated`. So any authenticated member of a thread could insert a
-- `type = 'deal_detected'` row and thereby drive `confirm_detected_deal`
-- (`20260612140000_confirm_detected_deal_rpc.sql:43`), which births a real
-- deal. L-006: a comment on the read path is not a contract for the write path.
--
-- ── SEVERITY, HONESTLY ──
-- Confined to threads the actor ALREADY belongs to — `can_access_thread` still
-- gates the row, so this is not cross-tenant. It is a person manufacturing a
-- "Sella detected a deal" message inside their own conversation, where they
-- could have proposed a deal anyway. The reason to fix it is that a documented
-- invariant is cited as load-bearing in two places and was not enforced.
--
-- ── WHY ONLY ONE TYPE, WHEN THE TICKET SKETCHED A LIST ──
-- HEL-67 proposed `type NOT IN ('deal_detected', ...)` — "Sella-authored types,
-- service-role only". A census of every `chat_message` INSERT reachable as
-- `authenticated` (2026-08-25) shows that framing is FALSE for five of six:
--
--   sender   sender_person_id   type(s)                          written by
--   ------   ----------------   ------------------------------   ----------------
--   person   auth.uid()         message                          store.ts:478
--   person   auth.uid()         deal_card                        store.ts:512
--   sella    NULL               deal_cancelled · deal_signed ·   actions.ts:682
--                               deal_change_proposed ·           (announceDealEvent)
--                               deal_negotiation_requested
--   system   NULL               connection_established           store.ts:646 (rollout)
--   sella    NULL               intro                            store.ts:646 (rollout)
--   person   ANOTHER PERSON'S   message                          store.ts:646 (rollout)
--
-- Five of those carry a Sella or system voice and are written by an ordinary
-- browser session. Banning "Sella-authored types" would break the deal
-- lifecycle pills and connection-accept outright.
--
-- `deal_detected` is the ONE type no client writes. Verified: it appears in
-- `src/` only as a READ filter (`reads.ts:259`) and is inserted solely by
-- SECURITY DEFINER functions (`deliver_deal`, `confirm_detected_deal*`), which
-- bypass RLS and are therefore unaffected by this policy.
--
-- ── WHAT THIS DELIBERATELY DOES NOT FIX (HEL-67 Gap 2) ──
-- The SENDER of a chat message is still forgeable: `msg_all` has no
-- `sender_person_id` predicate, so a thread member can post as anyone. That is
-- NOT fixable here, and the obvious remedy is wrong. The ticket says the
-- predicate must be "conditional on `sender`" because system lines are NULL —
-- true but insufficient. The last row above is `sender = 'person'` with
-- `sender_person_id` set to the REQUESTER, not the caller (`rollout.ts:179`,
-- "the requester wrote the note"): the person ACCEPTING a connection inserts a
-- human message attributed to somebody else, deliberately and correctly.
-- A `sender_person_id = auth.uid()` predicate breaks connection-accept.
--
-- Gap 2 is therefore blocked on HEL-68 — move the rollout into
-- `accept_connection_request` as a definer, and those three inserts leave the
-- `authenticated` write path entirely; only then can a real sender predicate
-- exist. Ruled by Muskan 2026-08-25: ship Gap 1 now, do not force Gap 2.
--
-- ── WHY `ALTER POLICY ... WITH CHECK` AND NOT A RESTATE ──
-- `msg_all` is `FOR ALL`, so `USING` governs SELECT/UPDATE/DELETE and
-- `WITH CHECK` governs INSERT/UPDATE. Only the write half is narrowed, and
-- USING is left untouched rather than retyped — a careless restate here would
-- silently change who can READ every message in the product (L-037: narrowing
-- a door needs a reader census first; this avoids touching the read door at
-- all). `authenticated` does hold UPDATE and DELETE on `chat_message`, but no
-- client path and no SQL path uses either, so in practice this governs INSERT.
-- ============================================================================

alter policy msg_all on public.chat_message
  with check (
    public.can_access_thread(thread_id)
    -- Sella's detection door is service-role only. `type` is NOT NULL, so this
    -- cannot be bypassed by omitting it.
    and type <> 'deal_detected'
  );

comment on policy msg_all on public.chat_message is
  'Thread members read and write their own threads. WITH CHECK additionally '
  'refuses type = ''deal_detected'' (HEL-67 Gap 1): that message drives '
  'confirm_detected_deal into birthing a real deal and is written only by '
  'SECURITY DEFINER functions, which bypass RLS. The SENDER of a message is '
  'still forgeable — HEL-67 Gap 2, blocked on HEL-68.';
