# ADR 0007 — c2c/p2p thread atomicity at accept

**Status:** Proposed — awaiting G3 (Muskan)
**Slug:** 0024-c2c-thread-atomicity · **Ticket:** HEL-68
**Date:** 2026-08-26

## In plain English

Right now, accepting a connection request happens in two separate steps that aren't
protected together: the database records "these two companies are now connected,"
and then — as a second, later step — your browser tells the database to create the
actual chat conversation. If your tab closes, your wifi drops, or you navigate away
in the half-second between those two steps, you end up connected to someone with no
way to talk to them. Nothing tells you this happened, and nothing fixes it
automatically until (for company-chats specifically) someone eventually sends a deal
through that connection.

**What each option costs later:**
- **Do nothing** (leave the two steps separate): cheapest today, but every future
  security hardening on chat messages (a currently-open ticket, HEL-67, wants to stop
  people from forging who a message is "from") is blocked, because it can't tell the
  difference between a legitimate system-authored welcome message and a forged one
  as long as the browser is the one deciding to write it.
- **Add a "repair" job that periodically checks for connections with no chat and
  fixes them:** more moving parts (a cron job or a check-on-every-page-load), more
  code to maintain, and it's still not atomic — there's still a window where the gap
  exists, just a shorter one.
- **Make the one database operation that connects two companies ALSO be the one that
  creates their chat** (this ADR's recommendation): the two things become
  impossible to separate, because they're now one database transaction.
- **A database trigger on the `relationship` table instead** (raised by
  `adr-checker` round 1, genuinely considered, not chosen): fires automatically
  whenever a relationship row is inserted, with no change to
  `accept_connection_request`'s signature at all — no `DROP`+`CREATE`, no new
  TypeScript return-value bridge, and it would catch a relationship insert from any
  *future* code path too, not just this one function. Rejected for one reason:
  it's invisible from the place a reader would look. Someone reading
  `accept_connection_request` to understand "what happens when I accept" would see
  none of this — they'd have to already know a trigger exists and go find it
  separately. This codebase's own convention favors that tradeoff going the other
  way (`send_deal`'s resolve-or-create lives directly in `send_deal`, not behind a
  trigger on `deal_card`) — consistency with an established local pattern beats a
  smaller diff here.

**How the industry normally does this:** this is the standard "make the invariant
true by construction" pattern — instead of writing code that checks for and repairs
a broken state, redesign the write so the broken state can't be reached. This
codebase already reached the identical conclusion for a related case: when a deal is
sent to a company that's missing its chat thread for any reason, `send_deal` (shipped
2026-08-25) creates the thread as part of sending the deal, rather than requiring the
thread to already exist. This ADR does the same move one step earlier, at accept
time.

**Recommendation: make `accept_connection_request` create the chat thread(s) and
their opening message(s) itself, in the same database transaction that creates the
relationship. Delete the browser code that does this today.** One sentence why: the
two things can never happen out of step with each other if they're the same
operation. **One honest limit, corrected from an earlier overclaim (`adr-checker`
round 1):** the relationship and the chat can no longer be separated, but the inbox
item's status flip to "accepted" is still a separate step after this RPC returns
(`connect.acceptItem` owns that, by the live code's own comment) — so the *original*
failure class (tab closes mid-accept) still has one later place it can recur, just
narrower and self-healing (a retried accept adopts the now-existing relationship and
resolves the existing thread, writing no duplicate). This ADR closes the thread/chat
half of the gap, not every round trip in the accept flow.

## Locked (from Muskan's interview, `STATE.md`)

1. Move the **whole** rollout — both the company-chat (c2c) and person-chat (p2p)
   thread creation — into this one migration, not c2c alone. (Research + this repo's
   own recent incident — HEL-84 exists because a sibling ticket shipped only part of
   a promised guarantee — both point the same way.)
2. The function returns the ids of what it created/resolved (relationship, c2c
   thread, p2p thread), matching this repo's existing `send_deal` precedent.
3. The PRD's motivation is written around the accurate framing: this is not "fixing a
   permanently broken state" (that's already false — `send_deal` self-heals it since
   2026-08-25) — it's "the chat exists at connect time instead of appearing lazily,"
   plus unblocking HEL-67's security work.
4. A stale code comment that asserts the disproven old behavior gets corrected in the
   same diff.

## Reused — already built, this ADR feeds it, does not touch it

- `accept_connection_request`'s existing relationship-mint/adopt logic, its pending-
  item validation, and HEL-82's relationship-liveness guard — all unchanged, this ADR
  extends the same function.
- `send_deal`'s resolve-or-create SQL block — read as the proven template for the two
  new internal helpers this ADR adds, copied and adapted, not called directly.
  `send_deal` itself is **not modified** by this ADR (see Invariant 6).
- `chat_thread`'s existing unique constraints (`uq_chat_thread_c2c`,
  `uq_chat_thread_p2p`) and the ordering `CHECK` on p2p — unchanged, just exercised by
  new callers.
- `planRollout` — read as the SOURCE OF TRUTH for every message body/type this
  migration's SQL must reproduce (the exact `connection_established` text, the
  `intro` text, the note-trim check). **Not reused after that** — see Blast-radius:
  its only remaining caller is the insert loop this ADR deletes, so it and its test
  are deleted in this same diff, not left as dead code (correction, `adr-checker`
  round 1 — an earlier draft deferred this).

## Blast-radius

- **`accept_connection_request`'s signature changes** (adds OUT params — a
  return-type change, so this is a `DROP` + `CREATE`, not `CREATE OR REPLACE`).
  **Correction (`adr-checker` round 1): it IS called from SQL, in two live test
  suites, at five call sites that break on this exact signature change** — a repo-wide
  grep for the function name found only comments, but a grep for actual call syntax
  finds real callers the first grep missed. Both break, reproduced against the local
  DB before writing this:
  - `supabase/tests/connection_consent_lockdown_test.sql:512,574,581` —
    `v_rel_id := public.accept_connection_request(...)`. Assigning a `record` to a
    `uuid` variable raises `invalid input syntax for type uuid` — confirmed live.
  - `supabase/tests/accept_connection_request_status_guard_test.sql:127,132` —
    `SELECT public.accept_connection_request(...) AS rel_id` compared with `<>`
    against a plain uuid. A `record <> uuid` comparison raises "no operator matches"
    — confirmed live.
  - The `PERFORM public.accept_connection_request(...)` call sites in the same two
    files (which don't use the return value) are unaffected.
  **`test-writer` must update all five, and they are not the same shape** (round 2's
  N2 — an earlier draft here offered "either form" as interchangeable; it isn't).
  `connection_consent_lockdown_test.sql:512,574,581` are plain plpgsql assignments
  (`v_rel_id := public.accept_connection_request(...)`) — rewrite as
  `SELECT relationship_id INTO v_rel_id FROM public.accept_connection_request(...)`,
  the same `SELECT ... INTO` idiom this file already uses elsewhere, and the safer
  form generally: `(fn(x)).field` re-evaluates the (now data-modifying) call once
  per field referenced, and at least one of these sites feeds the result into a
  later comparison where a second field reference is one edit away from silently
  re-running the accept.
  `accept_connection_request_status_guard_test.sql:127` is NOT an assignment, it's a
  `CREATE TEMP TABLE ... AS SELECT` (CTAS) — `SELECT ... INTO` doesn't apply there;
  rewrite as `CREATE TEMP TABLE _accepted ON COMMIT DROP AS SELECT relationship_id
  AS rel_id FROM public.accept_connection_request(...)`. Its `:132` comparison
  (`<>` against the captured `rel_id`) needs no change once the table's column is
  correctly named.
  This is now an explicit item in `TICKETS.md`, not an incidental fix `/build`
  discovers on its own.
  `connection_consent_lockdown_test.sql:727-732` also asserts `anon` cannot call the
  function — that assertion is load-bearing on this ADR's re-emitted
  `REVOKE`/`GRANT` (below), and must still pass.
- **`acceptInbox`** (`src/modules/messaging/supabase/store.ts`) loses its entire
  thread/message insert loop (`:601-649`) — becomes call-the-RPC-then-read-the-result.
- **`resolveC2cThread`**'s docstring (`store.ts:352-356`) is corrected.
- **HEL-67 Gap 2** (a separate, currently-blocked ticket) becomes unblockable once
  this ships — not touched here, just no longer stuck.
- **0026-relationship-write-gate**'s census names the exact code region this ADR
  deletes (`store.ts:646`) as a write site it planned to gate. Sequencing: 0024 ships
  first; 0026's `/design` re-targets to this ADR's new insert lines once they exist.
- **No RLS policy is touched, and RLS does not actually apply to these writes at
  all** (correction, `adr-checker` round 1) — `accept_connection_request` is
  `SECURITY DEFINER`, so it bypasses `thread_all`/`msg_all` regardless of what their
  predicates check. The prior research pass's framing ("every clause is already
  verified more strictly in the body") answers a question that doesn't apply here;
  the real question, per L-057, is which clause is deliberately NOT re-checked and
  why — and the honest answer is `msg_all`'s `type <> 'deal_detected'` clause is
  satisfied trivially, by construction, because every `type` literal this migration
  writes is hardcoded (`connection_established`, `intro`, `message`), never a value
  a caller can influence.
- **`sella_enqueue_detection_after_insert`** (an `AFTER INSERT` trigger on
  `chat_message`, fires on `sender='person' AND type='message'` in a `p2p` thread —
  exactly the requester's-note insert this migration adds) is now part of the same
  transaction as the accept, where today it runs in the browser's own later
  statement. Not currently reachable as a failure in practice, named here because
  ADR 0006 named the identical trigger for its own insert and the same discipline
  applies.
- **The generated TypeScript type is not absent, it's WRONG** (correction, round 2's
  N8): `src/types/database.types.ts:4643-4646` still declares
  `accept_connection_request: { Returns: string }`, and the live browser call
  (`store.ts:588-591`) has no cast. Reading `.relationship_id` off a `string` is a
  `tsc` error — the rewrite must add the `"..." as never` cast bridge (matching
  `create_group_thread`'s and `confirm_detected_deal`'s own equivalent OUT-param
  calls) or regenerate types before `tsc` is expected to pass.
- **`docs/PRD/0024-c2c-thread-atomicity.md`'s I/O section names the wrong
  parameter** (`p_pending_item_id`, corrected here to the live
  `p_inbox_item_id` — `adr-checker` round 1, fixed in the PRD directly).
- **Stale comments to correct in the same diff, beyond `resolveC2cThread`'s (PRD
  AC5)** — round 2 corrected round 1's list, two entries were already accurate and
  two more were missed:
  `store.ts:15` (module docstring), `store.ts:376` (`planRollout`'s own comment,
  moot once the file is deleted — see below), `src/modules/messaging/types.ts:264`
  and `:306` ("which rollout to run" — goes stale with `planRollout`, not on round
  1's list). **NOT stale, leave as-is**: `store.ts:525-540`'s "does NOT touch the
  inbox item status" line (still true), `inbox.ts:260-262` ("creates the
  relationship + chat FIRST... THEN flips the inbox item" — still true), and
  `sella-intro/index.ts:8` (only the word "rollout" is dated, not worth a diff on
  its own).
- **`planRollout` has no separate test file to delete** (correction, round 2's N4 —
  round 1 assumed one existed). A repo-wide grep for
  `planRollout|RolloutPlan|SeedMessageSpec|ThreadSpec` returns exactly
  `src/modules/messaging/lib/rollout.ts` and `store.ts` (its one caller) — deleting
  `rollout.ts` itself is the whole of this cleanup.
- **`e2e/inbox-accept.spec.ts`** is the one existing e2e guard on this exact
  invariant (ADR 0006 §4.3 already named it as such) — `/build` must run it
  deliberately, not incidentally, the same discipline 0006's own build applied.
- **`planRollout` and its test become genuinely dead code once `acceptInbox`'s
  insert loop is deleted** (its only remaining caller) — deleted in this diff, not
  deferred. Keeping a function alive that no longer has a caller, while also being
  the thing this migration's SQL bodies must match, is the exact "single owner who
  isn't actually the owner" shape L-038 warns about.

## Invariants

**Machine-checkable (become a test, not just prose):**

1. Given a fresh, never-before-connected accept, a c2c `chat_thread` row exists for
   the relationship immediately after the RPC returns — checkable directly against
   the DB, no deal needs to be sent. *(PRD AC1)*
2. Given a person-addressed accept, a p2p `chat_thread` row also exists immediately
   after, with the correct seed line for that request type. *(PRD AC2)*
3. Given an already-connected pair (the adopt path), a duplicate accept creates no
   second thread and no second seed line — thread/seed-line counts unchanged.
   *(PRD AC3)*
4. After this ships, `acceptInbox` issues zero `INSERT`s against `chat_thread` or
   `chat_message` — verified by the loop's removal, not a runtime guard. *(PRD AC4)*
5. `resolveC2cThread`'s docstring no longer asserts the disproven "minted on every
   accept" claim. *(PRD AC5)*

**Judgment-only (ADR prose + `critic`'s brief, not independently testable):**

6. **`send_deal` is deliberately not touched by this migration**, even though it
   contains a near-identical resolve-or-create block that could, in principle, be
   refactored onto the same two new helpers this ADR adds. Re-emitting `send_deal`'s
   full live body carries its own risk (this repo's own rule: diff a replacement
   against the LIVE body, never a stale copy) that this ADR doesn't need to take on
   to close HEL-68. Migrating `send_deal` onto the shared helpers is a named,
   low-risk follow-up, not bundled here.
7. **A PL/pgSQL function body runs inside its caller's transaction**; an uncaught
   exception rolls back everything the call did. `accept_connection_request`'s live
   body has no `EXCEPTION` handler, so a failure partway through (e.g. the p2p insert
   fails after c2c succeeded) undoes the whole accept — relationship, c2c thread, its
   seed line, all of it. This is the actual mechanism that closes the gap this ADR
   exists for; it is stated here explicitly rather than left as an assumption.
8. **New, from `adr-checker` round 1 (a real ordering guarantee, not style):** for a
   `connect_message` accept, two p2p seed lines are written — Sella's `intro`
   ("Their note is below - take it from here") followed by the requester's own note.
   The BROWSER code this ADR deletes deliberately staggers each line's `created_at`
   by milliseconds precisely so a reader sorted by `created_at` shows them in the
   right order (`store.ts:637-644`). `now()` is transaction-start time and identical
   for every row this migration inserts in one transaction — verified live (two
   `select now()` calls inside one `BEGIN` return the same value to the
   microsecond). Without an explicit ordering, the note can render ABOVE the line
   that says "take it from here," pointing at nothing. **The two seed-line inserts
   must use `clock_timestamp()` (which advances within a transaction, unlike `now()`)
   or an explicit offset, not the column default** — this is stated as its own
   invariant because nothing in the acceptance criteria would catch its absence
   (AC2 only checks the lines exist, not their order), so it must be checked by name
   at G4/review, not assumed from a green suite.

## The design

**Two new internal helper functions**, called only from `accept_connection_request`
(and, in a later separate migration, potentially from `send_deal`):

```sql
create function public._resolve_or_create_c2c_thread(
  p_relationship_id uuid,
  out thread_id uuid,
  out created   boolean
) returns record language plpgsql set search_path = '' as $$ ... $$;

create function public._resolve_or_create_p2p_thread(
  p_relationship_id uuid, p_person_x uuid, p_person_y uuid,
  out thread_id uuid,
  out created   boolean
) returns record language plpgsql set search_path = '' as $$ ... $$;

revoke all on function public._resolve_or_create_c2c_thread(uuid)
  from public, anon, authenticated;
revoke all on function public._resolve_or_create_p2p_thread(uuid, uuid, uuid)
  from public, anon, authenticated;
```

**Deliberately NOT `security definer`** (correction, `adr-checker` round 2's N5):
both helpers are only ever called from inside `accept_connection_request`'s own
`SECURITY DEFINER` body, so they already execute as that function's owner — marking
them definer too adds nothing while their body runs, but it WOULD matter if the
`REVOKE` above were ever accidentally undone (a blanket re-grant, a regen script):
neither helper checks that its caller owns `p_relationship_id` or is one of
`p_person_x`/`p_person_y`, so a definer version reachable by name would let any
caller mint a thread and inject a message on an arbitrary relationship, bypassing
`thread_all`/`msg_all` entirely. Plain (invoker) functions close that door for free
— if the grant is ever restored by mistake, a caller runs the body as themselves
and RLS still applies underneath.

`test-writer` must add a deny-test for both helpers (round 2's N6) — call each
directly as `anon` and as `authenticated` and assert `42501`, the same shape
`connection_consent_lockdown_test.sql:727-732` already uses for
`accept_connection_request` itself.

Each is a direct SQL port of `send_deal`'s proven resolve-or-create block — **its
live body runs SELECT first, then the `INSERT ... ON CONFLICT DO NOTHING ...
RETURNING`, then a re-SELECT only if that RETURNING was NULL** (corrected order,
`adr-checker` round 2's N9 — get this from `pg_get_functiondef`, not a paraphrase,
when porting it), a bare, untargeted `ON CONFLICT DO NOTHING` since both
`chat_thread` uniques are partial indexes — with a `created` OUT flag added: this
ADR's functional requirement 4 needs "created vs. resolved" to decide whether to
write a seed line, which `send_deal` never needed. `REVOKE ALL ... FROM public,
anon, authenticated` on both: they are internal-only, callable exclusively from
another function's body, never reachable by name from PostgREST.

The p2p helper canonicalizes its two person ids (`<` ordering) before both the
SELECT and the INSERT, matching `chat_thread`'s own `CHECK` constraint and the same
rule `send_deal` and the browser's `canonicalPair` already implement — the third
independent implementation of this ordering rule in the codebase, named here as a
known, accepted, mild drift risk (not avoidable without deleting `planRollout`,
out of scope).

**`accept_connection_request` — signature change, `DROP` + `CREATE`:**

```sql
drop function if exists public.accept_connection_request(uuid);
create function public.accept_connection_request(
  p_inbox_item_id uuid,
  out relationship_id uuid,
  out c2c_thread_id   uuid,
  out p2p_thread_id   uuid   -- null unless the request type addresses a person
) returns record language plpgsql security definer set search_path = '' as $$
  -- Base is the LIVE 20260825200000_accept_connection_request_status_guard.sql body
  -- (Invariant 6a) — re-emitted verbatim through the relationship mint/adopt branch,
  -- writing into `relationship_id` instead of the current local `v_rel_id`. HEL-82's
  -- liveness guard (its ':99-105') is part of that base and MUST survive the re-emit.
  ...

  -- Name composition, needed by both bodies below — the ONLY place these joins
  -- happen once rollout.ts is deleted (round 2's B1: the earlier draft elided this
  -- with `...` and it never actually got written).
  select (p.first_name || ' ' || p.last_name), c.name
    into v_sender_person_name, v_sender_company_name
  from public.person p join public.company c on c.id = p.company_id
  where p.id = v_item.sender_person_id;
  select name into v_own_company_name from public.company where id = v_own;

  select thread_id, created into c2c_thread_id, v_created
    from public._resolve_or_create_c2c_thread(relationship_id);
  if v_created then
    -- Matches rollout.ts's connectionEstablished() body exactly:
    -- `${ownCompany.name} and ${senderCompany.name} are now connected.`
    insert into public.chat_message (thread_id, sender, sender_person_id, type, body, created_at)
    values (c2c_thread_id, 'system', null, 'connection_established',
            v_own_company_name || ' and ' || v_sender_company_name || ' are now connected.',
            clock_timestamp());
  end if;

  if v_item.type in ('connect_message', 'pricelist_request') then
    select thread_id, created into p2p_thread_id, v_created
      from public._resolve_or_create_p2p_thread(relationship_id, v_uid, v_item.sender_person_id);
    if v_created then
      select (p.first_name || ' ' || p.last_name) into v_viewer_person_name
      from public.person p where p.id = v_uid;

      -- clock_timestamp() advances within a transaction (now() does not) — required
      -- so the intro line sorts BEFORE the note it refers to (Invariant 8; the
      -- browser code this replaces staggered timestamps for the identical reason).
      -- The two request types have DIFFERENT intro bodies (round 2's B1 — an
      -- earlier draft hardcoded one for both, silently mismatching pricelist_request
      -- to a note-referring line no note ever accompanies). Matches
      -- rollout.ts's sellaIntroConnect()/sellaIntroPricelist() exactly.
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
        clock_timestamp());
      -- v_note is `trim(v_item.note)`, computed once above this block — a
      -- whitespace-only note must be skipped, matching rollout.ts's
      -- `input.note?.trim()` check exactly, not just a null check.
      if v_item.type = 'connect_message' and v_note is not null and v_note <> '' then
        insert into public.chat_message (thread_id, sender, sender_person_id, type, body, created_at)
        values (p2p_thread_id, 'person', v_item.sender_person_id, 'message', v_note, clock_timestamp());
      end if;
    end if;
  end if;
$$;

revoke all on function public.accept_connection_request(uuid) from public, anon;
grant execute on function public.accept_connection_request(uuid) to authenticated;
```

Seed-line inserts stay plain, inline `INSERT`s — matching every other
`chat_message` writer in this schema. Deliberately **not** a shared insert helper:
0026-relationship-write-gate already deliberated and locked a different shared-piece
shape (a check function every writer calls before its own insert, not an insert
wrapper) — inventing a second shared mechanism here would conflict with that design,
not complement it.

**Return type: `record` with named OUT params**, matching `confirm_detected_deal`'s
established precedent in this codebase (not `TABLE`, which signals a row-set
everywhere else it's used in this schema; not `jsonb`, used elsewhere only for
genuinely variable-shaped payloads). The browser consumer defensively unwraps
PostgREST's result the same way `confirmDetectedDeal`'s own caller already does
(`Array.isArray(data) ? data[0] : data`).

## Deferred — must NOT be built here

- Migrating `send_deal` onto the two new helper functions (Invariant 6).
- The database-trigger alternative (considered and rejected above, not a fallback).
- Any UI change that consumes the newly-returned thread ids — none exists today.
- 0026's own gate-check work — coordinated by line-number handoff once this
  migration lands, not built here.
