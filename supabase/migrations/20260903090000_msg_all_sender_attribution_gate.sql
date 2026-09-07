-- ============================================================================
-- The SENDER of a chat message becomes un-forgeable (HEL-67, Gap 2)
-- ----------------------------------------------------------------------------
-- `msg_all` has never carried a sender predicate. Any authenticated member of
-- a thread could insert a row with `sender_person_id` set to ANY other person
-- — or dressed in `system`/`sella` voice — and the product would render it as
-- that person's (or the platform's) words. Since slug 0023 the deal-arrival
-- pill rides on this same table, so the hole now sits under something
-- load-bearing: a forged `type='deal_card'` row reading "<victim> has sent a
-- deal", attributed to the victim.
--
-- ── WHY THIS COULD NOT BE BUILT IN AUGUST, AND CAN BE NOW ──
-- HEL-67 shipped Gap 1 (the `type` term) on 2026-08-25 and left Gap 2 BLOCKED,
-- deliberately. The blocker was real: three `authenticated` write paths
-- legitimately wrote in someone else's name, so `sender_person_id = auth.uid()`
-- would have broken connection-accept outright. The August census recorded them:
--
--   sender   sender_person_id   type                      written by
--   ------   ----------------   -----------------------   ------------------------
--   system   NULL               connection_established    store.ts:646 (rollout)
--   sella    NULL               intro                     store.ts:646 (rollout)
--   person   ANOTHER PERSON'S   message                   store.ts:646 (rollout)
--                                                          "the requester wrote the
--                                                           note" — rollout.ts:179
--
-- ALL THREE ARE GONE. HEL-68 (`20260826100000`) moved c2c/p2p thread creation
-- into `accept_connection_request` and DELETED `rollout.ts` entirely; HEL-84
-- (`20260827150000`) moved the four Sella-voiced lifecycle pills into
-- `announce_deal_event`, a SECURITY DEFINER RPC. Both are live on production.
-- The predicate this ticket wanted in August is writable today because those
-- two slugs shipped — not because the rule changed.
--
-- ── THE CENSUS, RE-PROVEN 2026-09-03, NOT INHERITED ──
-- Every `chat_message` write reachable as role `authenticated`:
--
--   sender   sender_person_id   type       written by
--   ------   ----------------   --------   ----------------------------------
--   person   auth.uid()         message    store.ts:484  (postMessage)
--   person   auth.uid()         deal_card  store.ts:518  (postDealMessage)
--   person   own id             message    e2e/chat-phase7.spec.ts:273
--
-- That is the whole list. Everything else bypasses RLS and is untouched by
-- this policy: five SECURITY DEFINER functions (`accept_connection_request`,
-- `accept_person_connection`, `announce_deal_event`, `confirm_deal_change`,
-- `send_deal`), and `supabase/functions/sella-summarize` which runs on
-- SUPABASE_SERVICE_ROLE_KEY (role `service_role`, not `authenticated`).
-- There is no authenticated UPDATE or DELETE path — the four other
-- `.from("chat_message")` call sites in `src/` and `e2e/` are all `.select()`.
--
-- Production data corroborates the census independently. `sender` x
-- `sender_person_id IS NULL` over the live table is a clean three-way split:
--   person -> id set (104 rows) | sella -> NULL (22) | system -> NULL (33)
-- Not one `person` row with a NULL author; not one `sella`/`system` row
-- carrying one. So the predicate can be EXACT rather than defensive.
--
-- ── WHY `sender = 'person'` AND NOT JUST THE ID TERM ──
-- The id term alone would still let a client write `sender='system'` with a
-- NULL author — the platform's own voice, in a thread the user belongs to.
-- The census says no legitimate authenticated writer ever needs a non-person
-- voice: every system/sella line in the product is written by a definer or by
-- service_role. Pinning `sender = 'person'` costs nothing today and closes the
-- borrowed-voice half of the forgery. A future feature that genuinely needs a
-- client to speak in another voice should go through a definer, which is where
-- every other such writer already lives.
--
-- ── WHY BARE `auth.uid()` AND NOT `(select auth.uid())` ──
-- Supabase's RLS performance guidance recommends wrapping a row-independent
-- function as `(select auth.uid())` so the planner builds one initPlan instead
-- of re-evaluating per row (their own advisor lint 0003_auth_rls_initplan).
-- This repo has already considered and declined that, on the record:
-- `docs/muskan-build/0026-relationship-write-gate/RESEARCH.md:103-109` —
-- "consistency with the existing unwrapped style is the safer default unless a
-- measured perf problem shows up". Every shipped policy here uses bare
-- `auth.uid()`. Following the local ruling; if the wrapping is ever adopted it
-- should be adopted everywhere in one deliberate pass, not introduced here as
-- a one-off inconsistency.
--
-- ── L-037: `ALTER POLICY ... WITH CHECK` ONLY. `USING` IS NOT RESTATED. ──
-- `msg_all` is `FOR ALL` and is the ONLY policy on `chat_message`, so retyping
-- the `USING` half would silently change who can READ every message in the
-- product. The three pre-existing WITH CHECK terms below were diffed out of
-- PRODUCTION's live `pg_policy` on 2026-09-03, not copied from a local file
-- (the rule that Discover lost its verified-caller gate to). Live pre-image:
--
--   can_access_thread(thread_id)
--   AND ((type)::text <> 'deal_detected'::text)
--   AND assert_relationship_writable((SELECT chat_thread.relationship_id
--                                       FROM chat_thread
--                                      WHERE chat_thread.id = chat_message.thread_id))
--
-- ── ORDERING NOTE, DELIBERATE ──
-- The two new terms are appended LAST, after `assert_relationship_writable`.
-- Postgres does not guarantee AND evaluation order and will happily hoist a
-- cheap column comparison above an expensive function call, so this ordering
-- is documentation of intent, NOT a guarantee about which error surfaces
-- first. Callers must not depend on getting the suspended-relationship P0001
-- raise rather than a plain RLS refusal: a row that violates both terms may
-- report either. The suites cover each term with a row that violates only it.
--
-- ── SEVERITY, HONESTLY ──
-- Still confined to threads the actor already belongs to — `can_access_thread`
-- survives, so this was never cross-tenant. Low today at one user per company
-- in the MVP; it rises with team size, which is exactly when "who said this"
-- starts carrying weight. The forged pill also confers no new READ rights.
-- ============================================================================

alter policy msg_all on public.chat_message
  with check (
    public.can_access_thread(thread_id)
    and type <> 'deal_detected'
    and public.assert_relationship_writable(
          (select relationship_id
             from public.chat_thread
            where id = chat_message.thread_id))
    and sender = 'person'
    and sender_person_id = auth.uid()
  );

comment on policy msg_all on public.chat_message is
  'FOR ALL, the only policy on chat_message. USING gates reads by thread '
  'membership. WITH CHECK additionally pins: no client-minted deal_detected '
  '(HEL-67 Gap 1), no write onto a suspended/ended relationship (HEL-84), and '
  'person-voice-only, self-attributed authorship (HEL-67 Gap 2). Every '
  'system/sella-voiced line is written by a SECURITY DEFINER function or by '
  'service_role, both of which bypass this policy.';
