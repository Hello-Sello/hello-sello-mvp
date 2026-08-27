# PLAN — HEL-84 / 0026-relationship-write-gate

Written 2026-08-26, `/build` step 2. Single ticket, no T-breakdown. Base sync: same
as HEL-68's — `origin/dev`'s 3 unique commits are stale merges of earlier branch
states; nothing dev has is new relative to this branch (verified with
`/usr/bin/git log --oneline origin/dev --not HEAD`, not `rtk`'s wrapper, which
silently truncates this exact query — see HEL-68's own base-sync note). No rebase;
base frozen from here.

## §0 — citations, verified live today, not inherited from the ADR

- `msg_all`'s live `WITH CHECK`: `20260825120000_msg_all_deal_detected_gate.sql:77-83`
  — `public.can_access_thread(thread_id) and type <> 'deal_detected'`.
- `inbox_insert`'s live `WITH CHECK`: `20260825130000_inbox_insert_receiver_gate.sql
  :114-123` — `sender_company_id = current_company_id() and sender_person_id =
  auth.uid() and (receiver_company_id is null or
  company_can_receive_requests(receiver_company_id))`.
- `send_deal`'s inline liveness check (to refactor):
  `20260825180000_send_deal_relationship_liveness_guard.sql:69-81`.
- `confirm_detected_deal`'s inline liveness check (to refactor, stays INSIDE the
  both-accepted branch — a decline must still succeed on a suspended
  relationship): `20260825190000_confirm_detected_deal_liveness_guard.sql:106-119`.
- `deliver_deal`'s live body: `20260720095000_deliver_deal.sql:30-57`. Insertion
  point confirmed: immediately after `:37` (`if v_rel is null then return; end
  if;`), before the co-owner probe at `:41`. `EXECUTE` already revoked from
  `authenticated`/`anon`/`public` (`20260724121000_revoke_deliver_deal_execute.sql`)
  — only reachable nested from `send_deal`/`confirm_detected_deal`.
- `propose_deal` — **excluded** (ADR 0008 Blast-radius, corrected round 2 F2, not
  re-derived here per L-063): `DROP FUNCTION`ed in
  `20260724120800_drop_propose_edit_rpcs.sql:18` — does not exist in the live
  catalog. Its replacement, `propose_deal_change`, writes only
  `deal_pending_change`, never `chat_message` — needs no gate. An earlier draft
  of this plan re-derived this citation from a fresh grep, found the `CREATE OR
  REPLACE`, missed the later `DROP`, and put it back in — the exact mistake the
  ADR's own text already names and explains the consequence of. Do not
  re-resurrect it.
- `create_deal_draft`'s live body writes neither `chat_message` nor
  `pending_inbox_item` — excluded, no migration touches it.
- `confirm_deal_change` — excluded, Muskan's ruling (PRD AC7).
- `announceDealEvent` (`src/modules/deals/actions.ts`) — excluded, Muskan's ruling
  (PRD AC8). No source change.
- `sella-detect/index.ts`: `thread` (with `relationship_id`) resolved at `:93-98`
  (`.select("id, relationship_id")`); the actual insert is `postDetectedMessage()`
  at `:223-253`, called from exactly two of the three `decision.kind` branches
  (`"post"` at `:260`, `"supersede"` at `:262`) — an earlier draft of this plan
  said three, `"suppress"` (`:258`) reuses an existing message id and never
  calls it.
- `sella-summarize/index.ts`: `card.relationship_id` already selected at `:63`
  (`.select("id, version, relationship_id")`), used at `:140`. The insert loop is
  `:144-154`, posting to up to two threads (`deal` + `p2p`) that share one
  relationship.
- `requestActionError.ts` — current shape read in full (58 lines, not 41 — an
  earlier draft of this plan undercounted). New raise text needs a matching
  branch; see §7.

## §1 — migration: `assert_relationship_writable`, the shared function

New file: `<ts>_assert_relationship_writable.sql`.

```sql
create function public.assert_relationship_writable(p_relationship_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  -- NULL means nothing to gate: no relationship exists yet (a first-contact
  -- pending_inbox_item), a company-less p2p chat_thread (accept_person_
  -- connection creates these with relationship_id NULL by design), or a
  -- `group` chat_thread (no relationship at all). None are suspendable.
  if p_relationship_id is null then
    return true;
  end if;

  -- Caller must be a party. Without this, ANY authenticated user could call
  -- this function directly (it must be EXECUTE-granted to `authenticated` for
  -- the RLS call sites) with an arbitrary id and read the relationship's
  -- status back out of the raised message. Same NOT FOUND message for "doesn't
  -- exist" and "not yours" — a probe can't tell them apart.
  --
  -- Deliberately does NOT restrict `service_role` (current_company_id() is
  -- NULL under service_role, since there is no end-user JWT) — service_role
  -- already bypasses RLS system-wide, it isn't a caller this check is FOR.
  select status into v_status
  from public.relationship
  where id = p_relationship_id
    and deleted_at is null
    and (public.current_company_id() is null
         or public.current_company_id() in (company_a_id, company_b_id));

  if v_status is null then
    raise exception 'assert_relationship_writable: relationship not found';
  end if;

  if v_status <> 'active' then
    raise exception 'assert_relationship_writable: relationship is % — no new writes', v_status;
  end if;

  return true;
end;
$$;

comment on function public.assert_relationship_writable(uuid) is
  'Single owner of "is this relationship open for NEW writes". Returns true or '
  'raises — usable both as a boolean WITH CHECK term and via perform in a '
  'definer RPC. Does not touch is_relationship_member() or any read-side rule; '
  'historical reads stay open regardless of status.';

revoke execute on function public.assert_relationship_writable(uuid) from public, anon;
grant  execute on function public.assert_relationship_writable(uuid) to authenticated;
grant  execute on function public.assert_relationship_writable(uuid) to service_role;
```

The `service_role` grant is explicit, not incidental: `authenticated` reaches this
function only nested (inside `msg_all`/`inbox_insert`'s `WITH CHECK`, or inside
another `SECURITY DEFINER` RPC's body), but `sella-detect` and `sella-summarize`
(§6) call it directly over `supabase.rpc(...)` using their `service_role` key —
the same explicit-grant pattern this repo already uses for
`scrub_person_pii`/`audit_person_scrub` (`20260706090200_erasure_cron.sql:71,118`),
not left to whatever the ambient default-privileges narrowing (`20260817120000`)
happens to leave in place for that role.

`RETURNS boolean`, not `void` — a `void`-typed function cannot appear inside an
RLS `WITH CHECK` boolean expression (verified: this is a hard Postgres type
constraint). `security definer` here IS correct (unlike HEL-68's two helpers) —
this function itself performs the authorization check inside its own body
(the membership predicate), so it needs definer privileges to read
`relationship` regardless of the caller's own RLS visibility into that table.

## §2 — migration: `msg_all` gains the write-gate term

New file: `<ts>_msg_all_relationship_write_gate.sql`.

```sql
alter policy msg_all on public.chat_message
  with check (
    public.can_access_thread(thread_id)
    and type <> 'deal_detected'
    and (
      type in ('deal_signed', 'deal_cancelled', 'deal_change_proposed',
                'deal_negotiation_requested')
      or public.assert_relationship_writable(
        (select relationship_id from public.chat_thread where id = thread_id)
      )
    )
  );
```

Re-emit the existing `comment on policy` too (append one sentence about the new
term), matching this repo's convention of keeping the policy comment in sync
with what it actually checks.

**Why this doesn't need a `deleted_at is null` filter on the `chat_thread`
subquery**: the subquery only needs `relationship_id`, not the thread's own
liveness — a deleted thread's relationship_id is still the right thing to gate
on if somehow reachable. `can_access_thread` already governs thread-level
access; this term is orthogonal.

**The four-type exemption is `announceDealEvent`'s carve-out (ADR Invariant
16, PRD AC8)** — `src/modules/deals/actions.ts:663-667`'s exact type union is
`"deal_cancelled" | "deal_signed" | "deal_change_proposed" |
"deal_negotiation_requested"` (four members, confirmed live; an earlier
description of this exemption named three). Without this OR-branch, every one
of `announceDealEvent`'s writes on a suspended relationship would start
raising — and because that function is fail-soft (catches its own error,
`console.error`s, never surfaces to the user — a pre-existing gap, not this
ADR's job to fix), the failure would be silent: declining/signing/proposing a
deal on a suspended relationship would succeed but leave no chat record of it.
This exemption is scoped to these four `type` values only — an ordinary
`postMessage`/`postDealMessage` write still goes through
`assert_relationship_writable` normally.

**`msg_all` is `FOR ALL`, not `FOR INSERT`** — this `WITH CHECK` term also
governs `UPDATE`/`DELETE` on `chat_message`, not just `INSERT`.
`authenticated` holds no client-side `UPDATE`/`DELETE` grant on this table
today (verified), so this is a wording correction, not a new behavior, but
worth stating so a future reader doesn't assume this term is INSERT-only.

**RLS-context caveat (ADR Invariant 15) — carried forward as a code comment,
not left implicit:** the `chat_thread` subquery above runs in the CALLING
user's own RLS context (a `WITH CHECK` subquery is not `SECURITY DEFINER`,
unlike `assert_relationship_writable` itself), per `.claude/rules/supabase.md`:
"a fact the caller can't read must come from a definer." If the subquery
returns NULL because the caller can't see the thread row, `p_relationship_id
IS NULL` passes through as *allowed* (Invariant 8's NULL-passthrough), which
fails OPEN. This is currently safe only because `thread_all` has no status
filter of its own — add a one-line SQL comment on this policy noting that
safety is load-bearing on `thread_all` staying that shape, and must be
re-checked if `thread_all` is ever narrowed.

## §3 — migration: `inbox_insert` gains the write-gate term

New file: `<ts>_inbox_insert_relationship_write_gate.sql`.

`pending_inbox_item` has NO `relationship_id` column (verified live schema) — the
relationship must be derived from the canonical company pair, matching
`accept_connection_request`'s own `least`/`greatest` idiom, and must be skipped
entirely for a `connect_person` row (`receiver_company_id IS NULL` by CHECK — no
company pair exists to derive).

```sql
alter policy inbox_insert on public.pending_inbox_item
  with check (
    sender_company_id = public.current_company_id()
    and sender_person_id = auth.uid()
    and (
      receiver_company_id is null
      or public.company_can_receive_requests(receiver_company_id)
    )
    and (
      receiver_company_id is null  -- connect_person: no company pair to gate
      or public.assert_relationship_writable((
        select id from public.relationship
        where company_a_id = least(sender_company_id, receiver_company_id)
          and company_b_id = greatest(sender_company_id, receiver_company_id)
          and deleted_at is null
      ))
    )
  );
```

`deleted_at is null` on this derivation IS required (unlike §2's chat_thread
subquery) — without it, a pair with both a soft-deleted and a live relationship
row is a legal state (`uq_relationship_pair_active` is partial), and a bare
scalar subquery would raise "more than one row returned by a subquery" for an
ordinary send, not a suspended one.

**Same RLS-context caveat as §2 (ADR Invariant 15)**: this `relationship`
lookup also runs in the calling `authenticated` user's own RLS context, not a
definer's — currently safe only because `rel_all` has no status filter of its
own (a caller who can't see the relationship row gets NULL, which
Invariant 8's NULL-passthrough lets through as allowed). Add the same one-line
SQL comment noting this is load-bearing on `rel_all` staying unfiltered.

## §4 — migrations: refactor `send_deal` and `confirm_detected_deal`

Two files, `create or replace` (their return signatures don't change — this is
NOT a repeat of HEL-68's `DROP`+`CREATE` situation), each re-emitting the FULL
live body verbatim except the one delta named:

**"Verbatim" means the `create or replace function ... as $$ ... $$` block
only** — never the source migration's own leading `drop function if exists`
(if either cited migration has one) or trailing `grant`/`revoke` statements.
Copying a source migration's own trailing grant would silently re-apply
whatever that migration granted at the time, which may since have been
narrowed by a later migration (this is exactly the failure class §5's
`deliver_deal` citation warns about below) — re-emit the function body, then
stop; do not append anything from below the cited body's closing `$$;`.

- `<ts>_send_deal_relationship_write_gate_refactor.sql` — re-emit
  `20260825180000`'s live body verbatim, replacing the inline block at `:69-81`
  (`select status into v_rel_status ... if v_rel_status <> 'active' then raise
  ...`) with `perform public.assert_relationship_writable(v_card.relationship_id);`.
  `v_rel_status` local can be deleted (no longer referenced anywhere else in
  this function — verify this by reading the full body, don't assume).
- `<ts>_confirm_detected_deal_relationship_write_gate_refactor.sql` — re-emit
  `20260825190000`'s live body verbatim, replacing the inline block at
  `:106-119` with `perform public.assert_relationship_writable(v_rel);`,
  **staying inside the both-accepted branch** (do not hoist — a decline on a
  suspended relationship must still succeed, per the existing behavior this
  refactor must not change).

**`create or replace`, never `drop`+`create`, for both** — a drop would
silently take the existing `authenticated` EXECUTE grant with it; this repo's
own HEL-68 build (`ADR 0007`, and ADR 0006 before it) already named this exact
failure mode by name for `send_deal` specifically. Neither function's grant
tail needs re-emitting since `create or replace` preserves existing grants —
confirm this Postgres behavior is actually being relied on correctly (it is:
grants attach to the object, not the `CREATE` statement, and survive a
`REPLACE`; they do NOT survive a `DROP`).

## §5 — migration: new gate on `deliver_deal`

One file, `create or replace` (no signature change):

- `<ts>_deliver_deal_relationship_write_gate.sql` — re-emit
  `20260720095000`'s live body verbatim (§4's "verbatim means the function
  body only" rule applies here too — **and matters concretely for this one**:
  `20260720095000_deliver_deal.sql` ends with a `grant execute ... to
  authenticated` that `20260724121000_revoke_deliver_deal_execute.sql` later
  revoked, on purpose, per Locked #3/ADR — re-emitting that trailing grant
  verbatim would silently undo the revoke and reopen `deliver_deal` to direct
  `authenticated` calls). Insert
  `perform public.assert_relationship_writable(v_rel);` immediately after
  `if v_rel is null then return; end if;` (old `:37`), before the co-owner
  probe (old `:41`). Do not re-emit the trailing grant line — the function
  stays `EXECUTE`-revoked from `authenticated`/`anon`/`public` exactly as it
  is today, reachable only nested from `send_deal`/`confirm_detected_deal`.

**No `propose_deal` gate** — excluded, see §0. There is no second file here;
an earlier draft of this plan included one, resurrecting a dropped function
(L-063). Do not re-add it.

## §6 — TypeScript: the two Sella edge functions

Neither file needs a schema change — both already select `relationship_id`
before their insert (§0). Add one RPC call each, checking the RPC's own
`error` return (edge functions call Postgres RPCs over the same client, so
this is a returned `{ data, error }`, not a thrown JS exception — do NOT wrap
in try/catch expecting a throw):

- `supabase/functions/sella-detect/index.ts` — call
  `supabase.rpc('assert_relationship_writable', { p_relationship_id:
  thread.relationship_id })` **right after `thread` is resolved (`:98`,
  immediately after `if (tErr || !thread) return json(...)`)** — NOT inside
  `postDetectedMessage()` as an earlier draft of this plan placed it. That
  placement was too late: it would let a suspended-relationship run still pay
  for the idempotency claim (`sella_detection` insert, `:199-212`) and the
  Bedrock call (`runDetection`, `:180`) before failing — a half-write, and
  wasted model spend, for a run that was always going to be refused. Gating
  immediately after `:98` fails before either happens. On error, return the
  same shape the function already uses for an early exit (e.g. `json({
  thread_id: threadId, skipped: "relationship not writable" }, 200)` — match
  the existing early-return shape at `:118`/`:129`, don't invent a new one).
  **`postDetectedMessage()` itself needs no change** — it has exactly two call
  sites, in the `"post"` (`:260`) and `"supersede"` (`:262`) branches of the
  `decision.kind` switch, not three as an earlier draft of this plan said; the
  third branch, `"suppress"` (`:258`), reuses `decision.keepMessageId` and
  never calls it.
- `supabase/functions/sella-summarize/index.ts` — call the same RPC **right
  after `card.relationship_id` is selected (`:63`), before the `deal_card_log`
  reads that follow**, using `card.relationship_id` (both `targets` share one
  relationship, so one call covers both potential posts). This is earlier than
  an earlier draft of this plan placed it (before `:135`'s thread resolution)
  — moving it ahead of `runSummary` (`:112`, the Bedrock call) and the
  `deal_card_log` insert (`:122`) avoids the same half-write/wasted-spend
  problem as `sella-detect`. On error, return early before either of those
  runs — matching this function's existing early-return shape (read the live
  file to confirm the exact JSON shape used elsewhere in it, don't assume it
  matches `sella-detect`'s).

`sella-intro` (a third Sella function) is confirmed OUT of scope — it only
`UPDATE`s an existing `sella`/`intro` row, never inserts (verified during
`/design`'s research).

## §7 — `requestActionError.ts`: the new raise needs a caller-facing message

Add a matching branch, following this file's existing pattern (a named regex
constant + one line in the exported function), for
`assert_relationship_writable`'s two raise texts:
- `relationship is % — no new writes` → something like "This relationship is
  suspended — new messages and requests aren't allowed until it's reactivated."
- `relationship not found` → same wording this file already uses for the
  identical "can't tell existence from access" shape — `INBOX_RLS`'s "This
  company is no longer available." is the closest existing precedent; reuse
  that phrasing rather than inventing new copy for the same user-facing
  situation.

## §8 — tests (closes B4: an earlier draft of this plan had zero)

ADR 0008's Invariants 1-10 are marked "machine-checkable" — this section maps
each to where it gets proven, per `test-writer`'s remit.

**Existing suites needing an assertion-text confirmation pass, not a
rewrite** — already re-verified during this plan's own citation pass (§0): the
new raise text from `assert_relationship_writable` (`relationship is % — no
new writes` / `relationship not found`) still satisfies these suites'
existing assertions unchanged, since none of them assert the OLD inline
check's exact wording:
- `supabase/tests/send_deal_relationship_liveness_test.sql`
- `supabase/tests/confirm_detected_deal_relationship_liveness_test.sql`
- `supabase/tests/deliver_deal_test.sql`

**New SQL suite: `supabase/tests/assert_relationship_writable_test.sql`** —
unit-level tests of the shared function itself, using the zero-mutation
`BEGIN … ROLLBACK` fixture pattern (`.claude/rules/supabase.md`):
- NULL `p_relationship_id` → returns `true` (Invariant 8).
- Active relationship, calling party → returns `true`.
- Suspended/ended relationship, calling party → raises `relationship is %`.
- Nonexistent id → raises `relationship not found`.
- Active relationship, `authenticated` caller who is NOT a party → raises the
  SAME `relationship not found` text as the nonexistent-id case (Invariant 9
  — assert the message strings are identical, not just that both raise).
- Active relationship, `service_role` (`set local role service_role`, no
  `sub` claim) → returns `true` without raising (Invariant 10 — reproduce
  live per the ADR's own instruction to re-prove this after the fix).

**New assertions in (or alongside) `msg_all`'s existing test coverage**
(check whether `chat_message` RLS already has a suite to extend before
creating a new one):
- `authenticated` app-path insert into a thread on a suspended relationship →
  refused (AC1).
- The same insert attempted as a direct PostgREST-shaped call (bypassing any
  app-level guard) → still refused — proves the gate is server-side, not
  UI-only (AC2).
- One insert per `announceDealEvent` type (`deal_signed`, `deal_cancelled`,
  `deal_change_proposed`, `deal_negotiation_requested`) on a suspended
  relationship → all four still succeed (the exemption, ADR Invariant 16).
- `type = 'deal_detected'` on an active relationship, as `authenticated` →
  still refused (pre-existing behavior, must not regress).

**New assertions in (or alongside) `inbox_insert`'s existing test
coverage**:
- A new connect/pricing request addressed to a company with a suspended
  relationship to the sender → refused (AC3).
- A `connect_person` row (`receiver_company_id IS NULL`) → unaffected by this
  gate entirely (Invariant 8's NULL-passthrough, exercised via the real
  no-company-pair path, not just the function's own NULL-arg test above).
- A company pair with both a soft-deleted and a live `relationship` row →
  ordinary send still succeeds, no "more than one row" error (Invariant 13 /
  round 2 F4 regression guard).

**Read-path regression guard (AC5/AC6)** — not a new suite: confirm the
existing read-side suites for `chat_message`/`pending_inbox_item`/pricing
visibility are unaffected by this diff (this gate only touches `WITH CHECK`,
never `USING`) by re-running them, not by re-deriving new assertions.

**Sella edge functions (`sella-detect`, `sella-summarize`) — declared gap,
not silently missed**: this repo has no existing TypeScript-level test
harness for edge functions (confirm this against the live repo structure
before writing anything — do not assume). AC4 (`deliver_deal` refusal) is
already covered transitively through `deliver_deal_test.sql` since both edge
functions call it only through `send_deal`/`confirm_detected_deal`. Direct
coverage of the two edge functions' own new RPC call is deferred to the
G4/G5 live walk (per PIPELINE §3, this diff's rendered-component-free
services still get exercised there), not built as an automated suite here —
name this explicitly at G4 so it isn't mistaken for silent coverage.

## §9 — the two things NOT built here (declared, not silently missed)

- `create_deal_draft`, `confirm_deal_change`, and `propose_deal` — excluded
  (§0). `propose_deal` no longer exists in the live catalog (dropped); do not
  write a migration for it.
- `announceDealEvent` — exempted via §2's four-type carve-out in `msg_all`'s
  `WITH CHECK`, not a separate gate — no source change to `actions.ts`, no
  separate migration beyond §2's.
- Any change to `is_relationship_member()`, `thread_all`, or any read-path RLS.
- 0024's own `store.ts:646` census entry — that write left the client path
  entirely once HEL-68 shipped (already merged); nothing to re-target, since
  it no longer exists as a write site at all.

## §10 — plan-checker's job

- Verify §2/§3's derivation subqueries actually compile and return the right
  shape (a scalar `uuid`, not a set) against the live schema.
- Verify §4's claim that `v_rel_status` becomes fully unused in both refactored
  functions — read each full body, not just the cited block.
- Verify the TS edge-function error-handling shapes in §6 by reading the
  ACTUAL current try/catch structure of both files before assuming the pattern
  described here is exactly right.
- Confirm `create or replace` genuinely preserves grants for `send_deal`/
  `confirm_detected_deal`/`deliver_deal` (no signature change on any of the
  three) — this is a real Postgres behavior, not an assumption, but verify no
  OTHER migration between the cited live bodies and now has changed any of
  these three signatures in a way this plan doesn't know about. Confirm §5's
  `deliver_deal` migration does NOT re-emit the trailing `grant` line from its
  cited source file (that grant was later revoked on purpose — re-emitting it
  would silently undo the revoke).
- Check whether `sella-summarize`'s single up-front gate call (§6) is correct
  given the loop posts to TWO threads that could, in principle, belong to
  different relationships if `dealThread` and `p2pThread` ever diverge — trace
  whether that's actually possible given `card.relationship_id`'s role in both
  lookups, or whether the single check is provably sufficient.

## §11 — acceptance criteria this plan closes

PRD AC1-AC6 (AC7/AC8 already closed by exclusion, no code needed — AC8's
exclusion is realized as §2's four-type carve-out, not a no-op). G4 routing:
backend-only (2 Postgres RLS policies, 3 RPC refactors/new-gates, 2 Edge
Functions, 1 client-side error-message map — no rendered component) → should
auto-close per PIPELINE §3 unless `security` (mandatory — migrations/RLS/RPC)
raises a blocking finding, or behavior diverges from AC1-AC6.
