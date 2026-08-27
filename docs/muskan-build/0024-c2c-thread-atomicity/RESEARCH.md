# 0024 c2c-thread-atomicity — prior-art sweep

> Written by `researcher`, 2026-08-26, step 1 of `/spec`. Two housekeeping notes from the
> agent: it had no Write tool and this file was saved by the orchestrator from its
> verbatim output; and it flags one correction to the ticket's own citations up front —
> the migration HEL-68 points to for `accept_connection_request`
> (`20260823090000...:160-190`) is **not the live body**, a later migration replaced it.
> That matters for `/design` and is covered inline below.

## What exists (spec)

### 1. Product surface docs
`docs/product/surfaces/CONNECT.md` is still a **stub** — `Depth: stub (awaiting Connect
deep grill...)` (`CONNECT.md:9`), and grepping the whole file for "accept" (case-
insensitive) returns nothing. There is no product-level description of the accept flow
anywhere in the surfaces layer. Everything governing this area lives in ADR-0006,
`DECISIONS.md`, and `CONTEXT.md`'s glossary.

### 2. PRD
`docs/PRD/0023-deal-draft-lands-in-chat.md:133` already carries a row directly adjacent
to this bug, amended 2026-08-25: *"The company-to-company conversation cannot be found |
**The send creates it; the deal still lands.**"* — this is the send-side twin of the fix
HEL-68 proposes on the accept-side, and establishes "repair, not refusal" as the locked
product philosophy for a missing c2c thread. No PRD exists yet for 0024 itself (expected
— this is step 1 of `/spec`).

### 3. `docs/decisions/DECISIONS.md`
The 2026-08-25 entry *"a company-addressed deal is announced in the company's chat"*
(`DECISIONS.md:1914-1941`) records that `send_deal` now resolves-or-creates the c2c
thread in production, and explicitly notes the accept-path race is **survived, not
closed** — i.e. this repo has already ruled once that "self-heal on next write" is an
acceptable interim state, which is direct precedent for how conservative/aggressive 0024
needs to be.

### 4. Architecture notes / ADRs
- **ADR-0006** (`docs/architecture/adr/0006-deal-draft-lands-in-chat.md`) is the origin
  document — this is where the bug was found (§8.10, lines 657-671) and **explicitly
  deferred to its own slug**: *"The interrupted-accept state exists only because thread
  creation lives in the browser... The fix that genuinely removes a mechanism is to move
  the c2c insert into `accept_connection_request` and delete the browser insert...
  Recommended: file it as its own slug."* Muskan ruled yes 2026-08-25.
  `ADR-INDEX.md:14` lists it.
- `ARCHITECTURE-NOTES.md:81,192-194` locks the 3-type chat model (c2c/p2p/deal) this fix
  must not alter.
- `ARCHITECTURE-NOTES.md:28` (2026-06-17, DEV-83) already flagged that accept needs a
  "reuse-and-open vs create-and-connect" branch for an already-connected pair —
  foreshadowed this exact area three months early; current `accept_connection_request`
  already implements that branch (see §8 below).

### 5. Linear — the vocabulary sweep found more than the ticket alone shows
- **HEL-68** (this ticket) — Backlog, Medium, assigned Muskan. Description text matches
  `STATE.md` closely.
- **HEL-67** ("[Security] `msg_all` is missing TWO predicates") — In Progress, High. Gap 1
  (forgeable `type`) shipped 2026-08-25. **Gap 2 (forgeable sender) is explicitly blocked
  on HEL-68**, and — this is not in `STATE.md` — HEL-67's own text says Gap 2 needs
  **all three** of the rollout's client-side `chat_message` inserts off the
  `authenticated` write path: the c2c `connection_established` line, the p2p `intro`
  line, **and** the requester's own note (`sender_person_id` set to *another* person,
  deliberately). HEL-68's own ticket text only describes moving the c2c half. **This is a
  real scope gap between the two tickets — see Open Questions #1.**
- **0026-relationship-write-gate / HEL-84** (High, Backlog) — its census
  (`docs/muskan-build/0026-relationship-write-gate/STATE.md`) names `store.ts:646` — the
  exact insert loop HEL-68 is about to move — as one of four `chat_message` writers under
  `msg_all` it was about to gate, and says so explicitly: *"the same code region HEL-68
  is about to move."* Sequencing these two slugs matters: if 0024 ships first, this write
  leaves the client path entirely and 0026's census shrinks by one item.
- **DEV-83** ("accepting a request from an already-connected company crashes") — still
  shows **In Progress** in Linear but looks superseded by the ENSURE-not-insert branch
  already live in `accept_connection_request`. Not blocking, but worth a look.

### 6. `.planning/session-log.md`
No direct 0024 entries yet — this is the first `/spec` pass.

### 7. `prototypes/`
Triage already ruled no new screen (`STATE.md`, item 1: NO). Confirmed — nothing in
`prototypes/` needs touching; this fix changes no UI.

### 8. Code — verified against the LIVE bodies, not the cited ones

**`accept_connection_request`'s live body is not what the ticket cites.**
`20260823090000_connection_consent_and_verification_lockdown.sql:98-190` is superseded
by **`20260825200000_accept_connection_request_status_guard.sql`** (HEL-82, 2026-08-25),
which re-emits the full function and adds: after adopting an existing pair,
`IF v_rel_id IS NOT NULL AND v_rel_status <> 'active' THEN RAISE EXCEPTION ...`
(`:99-105`). **Any 0024 migration must build on this body.** Practically this is good
news for the fix: by the time the RPC would create/resolve a c2c thread, the relationship
is guaranteed `'active'` — no extra liveness check is needed in the new thread-insert
code.

**The browser write path** (`src/modules/messaging/supabase/store.ts`):
- `acceptInbox` (`:542-652`) — RPC call to `accept_connection_request` (`:588-592`,
  returns only `relationshipId`), then a loop (`:601-649`) inserting `chat_thread` +
  `chat_message` rows.
- `planRollout` (`src/modules/messaging/lib/rollout.ts:62-85`) returns a c2c
  `ThreadSpec` (seed: `connection_established`) **and**, for
  `connect_message`/`pricelist_request`/`deal_card`, a **p2p** `ThreadSpec` (seed: Sella
  `intro`, plus the requester's own note for `connect_message`) — both executed in the
  same loop. **Confirms claim 5:** p2p thread creation shares the identical two-round-trip
  race for 3 of 4 request types, not just c2c.
- The `already`/`continue` gate at `store.ts:620-622` confirms **claim 4**: seed lines are
  inserted only inside the branch that creates a brand-new thread row; an adopted thread
  gets no seed line, ever. This is the exact mechanism ADR-0006 §9 already documents as a
  live, related consequence for `send_deal`'s heal path — still accurate at current line
  numbers.

**`resolveC2cThread` and `ChatView` — confirmed, plus one extra call site not in the
ticket:**
- `resolveC2cThread` (`store.ts:358-372`) is resolve-only: `if (!data) throw new
  Error(...)`. Its docstring (`:352-356`) **still asserts** *"The C2C is minted on EVERY
  accept (`planRollout`), so it always exists"* — this is the exact claim L-042
  disproved during ADR-0006's own drafting, and the comment was never corrected.
- `ChatView.tsx:101` — confirmed, inside the `?relationship=` deep-link effect; failure
  only `.catch`es to `console.error` (`:123`), no user-facing fallback.
- `ChatView.tsx:187` — a **second** call site (new-chat picker, company-mode selection)
  also calls `resolveC2cThread` and is not mentioned anywhere in the ticket or
  `STATE.md`. Same throw-on-missing exposure.

**`send_deal` already ships resolve-or-create for c2c (and p2p) — 0023 shipped this.**
Live body: `20260825180000_send_deal_relationship_liveness_guard.sql` (re-emitting
`20260825090000_send_deal_c2c_announce.sql`'s body verbatim plus a liveness guard),
lines 159-189: the exact `INSERT ... ON CONFLICT DO NOTHING ... RETURNING` +
re-select idiom the ticket wants moved into `accept_connection_request`.
**Consequence for scoping:** the worst case in HEL-68's own description ("permanently
unable to send") is **no longer true in production** — a connected pair missing a c2c
thread self-heals the moment either side sends any deal. What 0024 actually buys today
is (a) the chat conversation existing and visible *before* any deal is sent (right now a
freshly-connected, tab-closed-mid-accept pair shows nothing anywhere until a deal
happens to be sent), and (b) unblocking HEL-67 Gap 2. **Worth naming explicitly in the
PRD's motivation.**

**RLS predicates governing the two writes being moved (the L-057 question):**
- `thread_all` — **live** version is `20260707120100_group_thread_rls.sql:28-43`
  (supersedes `20260607170000` and `20260609193000`). `WITH CHECK`: `(type='p2p' AND
  auth.uid() IN (person_a_id, person_b_id)) OR (type IN ('c2c','deal') AND
  is_relationship_member(relationship_id)) OR (type='group' AND is_group_member(...))`.
- `is_relationship_member(p_rel_id)` (`20260607170000_rls_policies.sql:91-98`, unchanged)
  — `EXISTS (SELECT 1 FROM relationship r WHERE r.id=p_rel_id AND current_company_id() IN
  (r.company_a_id, r.company_b_id))`. **Membership only — no status term.** `SECURITY
  DEFINER`/`STABLE`.
- `msg_all` — **live** `USING`/base from `20260607170000_rls_policies.sql:300-302`,
  `WITH CHECK` narrowed by `20260825120000_msg_all_deal_detected_gate.sql:77-83` to
  `can_access_thread(thread_id) AND type <> 'deal_detected'`. **No sender predicate
  exists, anywhere, today.**
- `can_access_thread` (live: `20260707120100_group_thread_rls.sql:52-68`) mirrors
  `thread_all`'s c2c branch: `is_relationship_member(t.relationship_id)`.

**L-057 verdict:** every clause `thread_all`/`msg_all` currently check for these two
writes (relationship membership; `type <> 'deal_detected'`, trivially satisfied by
`connection_established`) is **already independently verified, more strictly, inside
`accept_connection_request`'s own body** before it ever reaches the relationship
insert/adopt step (`:64-105` of the live migration — pending-item state, addressee,
sender company, type, and now relationship liveness). So membership is a **strict
superset**, not a narrower door — nothing needs re-importing on that axis. The one
clause that is **not** verified anywhere, before or after the move, is sender/type
integrity for the `intro` and note lines — but those are written by client code under
RLS today and would be written by the definer tomorrow either way; moving them
server-side is what *unblocks* closing HEL-67 Gap 2, it doesn't weaken anything that
currently holds.

**Test coverage — thinner than `STATE.md`'s framing suggests.**
`e2e/inbox-accept.spec.ts` has exactly two tests (`:76`, `:111`). Only the second
(`:111-171`) touches `countThreadsForPair`/`countConnectionEstablishedLines`, and it
exercises the **adopt** path (pair already connected) — proving accept doesn't duplicate
an existing c2c thread — **not** the fresh-mint path this ticket's actual failure mode
lives in. There is currently **zero e2e coverage of a first-time accept's thread
creation being interrupted or even just counted.** `STATE.md`'s "the only guard" claim
is true but should be read as "the only guard, and it doesn't test this ticket's own
bug."

---

## Open questions for Muskan

1. **Scope gap between HEL-68 and HEL-67 Gap 2.** HEL-67's blocking text needs *all
   three* client-side inserts (c2c's `connection_established`, p2p's Sella `intro`, and
   the requester's attributed-to-another-person note) off the `authenticated` write path
   before a real sender predicate can exist — not just the c2c thread + its seed line,
   which is all HEL-68's own ticket text describes. Does 0024 need to move the **whole**
   `acceptInbox` rollout (c2c + p2p + all three seed-line shapes) into
   `accept_connection_request`, or is the c2c half enough for now and HEL-67 Gap 2 waits
   on a follow-up?

2. **p2p thread parity** (already flagged in `STATE.md` as open) — same two-round-trip
   race, same code path, same loop. Move it in the same migration as c2c, or defer?

3. **Return contract.** Should `accept_connection_request` start returning thread ids
   (mirroring `send_deal`'s precedent, ADR-0006 §8.3), or stay `relationshipId`-only? Is
   there any caller that would use them, or does the browser just stop inserting and
   start reading?

4. **Re-frame the motivation.** `send_deal` already heals a missing c2c thread on first
   send (shipped in 0023) — the "permanently stuck" framing in HEL-68's own ticket text
   is no longer accurate. The real value now is "the chat exists at accept time, not
   lazily at first send" plus unblocking HEL-67 Gap 2. Worth confirming this is the
   framing you want in the PRD, since it changes which acceptance criteria matter
   (atomicity for its own sake vs. atomicity as a security prerequisite).

5. **Stale docstring.** `store.ts:352-356` (`resolveC2cThread`) still claims the c2c
   thread "is minted on EVERY accept... so it always exists" — the exact claim L-042
   disproved. Should 0024 fix this comment too, or leave it for a separate pass?

6. **DEV-83** (Linear, still "In Progress") looks superseded by the ENSURE-not-insert
   branch already shipped in `accept_connection_request`. Not blocking this spec —
   flagging since it surfaced during the sweep and nobody seems to have closed the loop
   on it. **Resolved 2026-08-26** — verified stale and closed in Linear (comment on
   the issue cites the exact fixed code).

---

## Approaches (design)

> Written by `researcher`, 2026-08-26, step 1 of `/design`. Appended below the existing
> `## What exists (spec)` section, which is untouched.

### 1. Single RPC, or a shared resolve-or-create helper?

**The duplication that would be created if this ships inline.** `send_deal`'s live body
already contains two independent copies of the resolve-or-create idiom — one for c2c
(`20260825180000_send_deal_relationship_liveness_guard.sql:165-188`) and one for p2p
(`:120-158`). `accept_connection_request`'s own live body already contains a third
instance, for `relationship` rather than `chat_thread`
(`20260825200000_accept_connection_request_status_guard.sql:107-127`). Doing 0024 by
direct copy would add a fourth and fifth copy of a pattern that already exists three
times.

**What L-038 and L-057 actually say, and whether they apply.** Neither is a direct
verdict on "duplicate SQL vs. shared function" — L-038 warns that calling something
"the single owner" is a claim about agreement with every sibling door, not file count;
L-057 (already applied to 0024 and found satisfied — membership is a strict superset,
nothing to reimport) is about reimporting RLS clauses into a definer RPC. But **the
repo's own most recent decision on this exact question is on record**: 0026's locked
interview answer #2 chose "ONE shared check function, called from all ~12 write sites"
citing L-057's "import the predicate, don't restate it" as grounds — the team's most
recent considered answer to "duplicate vs. share" in this codebase, for a structurally
similar problem.

**Recommendation: extract two internal helpers, used by `accept_connection_request`
only, in this migration** — `_resolve_or_create_c2c_thread(p_relationship_id) RETURNS
(thread_id uuid, created boolean)` and `_resolve_or_create_p2p_thread(p_relationship_id,
p_person_x, p_person_y) RETURNS (thread_id uuid, created boolean)`, each a direct SQL
port of `send_deal`'s proven block, with a `created` OUT flag added — FR4 needs
"created vs. resolved" to decide whether to write a seed line, which `send_deal` never
needed (it always announces, resolved or not). `REVOKE ALL ... FROM public, anon,
authenticated` on both — internal-only, callable only from another definer body, never
reachable by name from PostgREST.

**Explicitly do NOT touch `send_deal` in this migration** — the PRD's own Out list
already says so, and re-emitting `send_deal`'s full live body carries real, avoidable
risk (this repo's own `supabase.md` rule: diff `create or replace` against the LIVE
body, never a stale copy). Migrating `send_deal` onto the two new helpers is a clean,
low-risk follow-up once they're proven via `accept_connection_request` — name it as a
follow-up, don't bundle it.

### 2. Concurrency safety of the resolve-or-create idiom

**Published guidance, checked before recommending.** Postgres's own docs confirm a bare
`ON CONFLICT DO NOTHING` (no target) handles conflicts against ALL usable constraints,
matching `send_deal`'s own comment reasoning for why it's untargeted (its two `chat_thread`
uniques are partial indexes). Under Read Committed (this repo's default — no
`SET TRANSACTION ISOLATION` appears anywhere in the migrations), each statement takes a
fresh snapshot, and `ON CONFLICT` waits on a conflicting in-flight transaction's outcome
— the re-SELECT after a NULL `RETURNING` sees the winning row once that transaction
resolves. Sources:
[PostgreSQL — Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html),
[PostgreSQL — INSERT](https://www.postgresql.org/docs/current/sql-insert.html). **Flagged
as moderate-not-full confidence** — the exact two-statement interaction isn't stated in
one authoritative sentence anywhere I could fetch directly (one relevant third-party
article 403'd), but the idiom is already proven correct in this codebase's own
production use (`send_deal`, shipped 2026-08-25; `accept_connection_request`'s
relationship mint, whose own comment names the identical reasoning).

**`chat_thread`'s unique-constraint shape is already sufficient for both paths** — two
partial unique indexes (`20260607090003_phase2_deal.sql:139-143`), both already
exercised by `send_deal`. A third constraint, `CHECK (type <> 'p2p' OR person_a_id <
person_b_id)`, means the new p2p helper must canonicalize the two person ids the same
way `send_deal` and the browser's `canonicalPair` already do — worth naming as the
**third** independent implementation of the identical ordering rule, mild L-038-flavored
risk, not avoidable without deleting `planRollout` (out of scope).

**Postgres property for the ADR to state explicitly, not assume:** a PL/pgSQL function
body runs inside its caller's transaction; an uncaught exception aborts the whole thing.
`accept_connection_request`'s live body has no `EXCEPTION` block — verified by reading
it in full — so a failure partway through (say the p2p insert fails after c2c
succeeded) rolls back everything: relationship mint, c2c thread, its seed line, all of
it. Nothing partial survives. This is the actual mechanism that closes the gap the
PRD's Problem section names, not just relocates it.

### 3. Should seed-line inserts route through a shared `chat_message` helper too?

**No — stay independent from 0026.** 0026's own census confirms no such helper exists
today and its locked shape is a **check function every RPC calls before its own
insert**, not an insert wrapper — every existing `chat_message` writer in this codebase
writes its own plain inline `INSERT`. Inventing an insert helper here would preempt a
shape 0026 has already deliberated and rejected. **The one real coordination point:**
0026's census names `store.ts:646` (the insert loop 0024 deletes) as a write site it
planned to gate — once 0024 ships, that census entry is stale and needs re-targeting to
wherever `accept_connection_request`'s new seed-line inserts land. Sequence 0024 before
0026 (already the plan); hand 0026's author the new line numbers once this migration is
drafted.

### 4. Return-value shape

**`confirm_detected_deal` is the closest true precedent for a mutating RPC returning
multiple named values, and should be the template**
(`20260707130200_confirm_detected_deal_born_now.sql:32-38`, `OUT deal_card_id uuid, OUT
born_now boolean`). Three facts carry directly into 0024's migration:
1. A return-type change forces `DROP FUNCTION` + `CREATE FUNCTION` — Postgres forbids
   adding OUT params via `CREATE OR REPLACE`. Verified safe to drop: a repo-wide grep
   for `accept_connection_request` finds it only in comments in three other migrations,
   never as an actual SQL call.
2. The DROP must be re-followed by the same GRANT/REVOKE tail every prior migration of
   this function carries — a DROP silently takes grants with it.
3. The TS consumer must defensively unwrap the record — PostgREST returns an OUT-param
   result as either a bare object or a one-element array depending on version;
   `confirmDetectedDeal`'s own caller already handles both (`Array.isArray(data) ?
   data[0] : data`). Carry this exact pattern into `acceptInbox`'s rewrite.

**Recommendation:** `OUT relationship_id uuid, OUT c2c_thread_id uuid, OUT
p2p_thread_id uuid` (nullable), `RETURNS record`. Reject `RETURNS TABLE` (signals a
row-set everywhere else it's used in this schema — wrong signal for one mutating call).
Reject `jsonb` (used elsewhere for genuinely variable-shaped payloads; this result is a
small fixed set of typed uuids, and OUT params buy static typing for free).

## Recommendation

Extend `accept_connection_request`'s signature with OUT params (`relationship_id`,
`c2c_thread_id`, `p2p_thread_id` nullable) — forces `DROP` + `CREATE`, full GRANT/REVOKE
tail re-emitted. Factor the two resolve-or-create blocks into two new
`REVOKE ALL ... FROM public, anon, authenticated`-only internal helpers it calls; seed-line
inserts stay inline, matching every other `chat_message` writer. `send_deal` untouched
in this migration — its own migration onto the shared helpers is a named follow-up.
Browser: `acceptInbox` becomes RPC-call-then-defensive-unwrap, deletes the entire
insert loop (`store.ts:601-649`).

**Explicitly deferred, not forgotten:** (a) migrating `send_deal` onto the two new
helpers; (b) 0026's gate re-targeting once this migration's line numbers exist; (c)
`resolveC2cThread`'s stale docstring fix (PRD AC5, unrelated to the SQL work above).
</content>
