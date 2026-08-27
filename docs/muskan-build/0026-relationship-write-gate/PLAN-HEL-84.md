# PLAN — HEL-84 / 0026-relationship-write-gate

Written 2026-08-26, `/build` step 2. Single ticket, no T-breakdown. Base sync: same
as HEL-68's — `origin/dev`'s 3 unique commits are stale merges of earlier branch
states; nothing dev has is new relative to this branch (verified with
`/usr/bin/git log --oneline origin/dev --not HEAD`, not `rtk`'s wrapper, which
silently truncates this exact query — see HEL-68's own base-sync note). No rebase;
base frozen from here.

**Migration timestamp floor (round 4, N4) — every `<ts>` placeholder in §1-§5
below must sort after `20260826100000`** (0024's own
`accept_connection_request_atomic_threads.sql`, shipped to production
2026-08-27, after this plan was first written). Per `.claude/rules/
supabase.md`, verify the actual local tip at build time
(`supabase migration list --linked` or the newest file in
`supabase/migrations/`) rather than assuming `20260826100000` is still
current — the tip can move again between this plan being checked and
`builder` actually writing the files.

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
  `authenticated`/`anon`/`public` (`20260724121000_revoke_deliver_deal_execute.sql`).
  **Reachability, corrected (plan-checker round 2, N1 — an earlier draft of this
  plan said "nested from `send_deal`/`confirm_detected_deal`", which is only
  half true and the false half is the reachable one):** `send_deal` stopped
  calling `deliver_deal` entirely in `20260825090000_send_deal_c2c_announce.sql`
  (the company arm now posts its own chat pill directly) — grepped, zero hits.
  The ONLY live caller is `confirm_detected_deal`
  (`20260825190000_confirm_detected_deal_liveness_guard.sql:193`), inside the
  both-accepted branch — **after** §4's own
  `assert_relationship_writable(v_rel)` call on the identical relationship
  already ran. So §5's gate on `deliver_deal` is currently unreachable through
  the product — this is still the right thing to build (ADR 0008's own
  Blast-radius names it explicitly, "so a third future caller can't reopen the
  gap silently"), but the plan must say that reason, not the false
  "send_deal calls it too" one that led directly to B1.
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
  at `:223-253`, called from exactly two of the FOUR `decision.kind` branches —
  `"post"` (condition `:259`, call `:260`) and `"supersede"` (condition `:261`,
  call `:262`) — corrected count (round 3, N6; an earlier draft said three,
  then two-of-three): the branches are `"suppress"` (`:256`, reuses an
  existing message id, never calls it), `"post"`, `"supersede"`, and `"none"`
  (`:274`, the implicit fall-through — no chat write at all). The placement
  decision in §6 is unaffected by the count itself.
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
  -- Deliberately does NOT restrict `service_role` (no end-user JWT at all, so
  -- auth.uid() is NULL) — service_role already bypasses RLS system-wide, it
  -- isn't a caller this check is FOR. Discriminated on auth.uid(), NOT
  -- current_company_id(): the latter is ALSO NULL for a real, reachable
  -- authenticated state this repo deliberately supports — a signed-in person
  -- between signup and company onboarding (person.company_id is nullable by
  -- design, per the v0 invariant). Checking current_company_id() IS NULL
  -- would let any company-less signed-in user pass this branch unconditionally
  -- and probe any relationship id's existence/status through the raised
  -- message — the exact leak this comment says it prevents, just for a
  -- different population than service_role.
  select status into v_status
  from public.relationship
  where id = p_relationship_id
    and deleted_at is null
    and (auth.uid() is null
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

The `service_role` grant is explicit, belt-and-braces, not a repair of a real
gap (round 2, N8 corrected the REASON — the grant itself was already right):
`20260817120000_anon_execute_lockdown.sql` narrows default privileges for
`anon` only (`REVOKE EXECUTE ON FUNCTIONS FROM anon`, scoped to that role); it
never touches `service_role`, which keeps Supabase's own default EXECUTE
grant on new `public` functions (stated directly in
`20260706090200_erasure_cron.sql:66`). So `service_role` would already reach
this function without the explicit line. It's added anyway, matching this
repo's own `scrub_person_pii`/`audit_person_scrub` precedent
(`20260706090200_erasure_cron.sql:71,118`), so the grant is stated rather than
inherited — a future narrowing of `service_role`'s defaults (there is none
today) wouldn't silently break `sella-detect`/`sella-summarize`.

`RETURNS boolean`, not `void` — a `void`-typed function cannot appear inside an
RLS `WITH CHECK` boolean expression (verified: this is a hard Postgres type
constraint). `security definer` here IS correct (unlike HEL-68's two helpers) —
this function itself performs the authorization check inside its own body
(the membership predicate), so it needs definer privileges to read
`relationship` regardless of the caller's own RLS visibility into that table.

**The membership check discriminates on `auth.uid()`, not
`current_company_id()` (round 3, B1 — a real fail-open, not just a wording
issue):** an earlier draft used `current_company_id() is null` to detect "no
caller context" (meant for `service_role`), but `current_company_id()`
resolves to NULL for a SECOND, fully reachable population — a signed-in
person with no company yet (`person.company_id` is nullable by this repo's own
v0 design, true of every user between signup and onboarding). A company-less
signed-in caller would have passed that branch unconditionally and could
enumerate any relationship's existence and status by id, through the raised
message — exactly the probe this function's own comment says it closes.
`auth.uid()` is NULL only when there is no end-user JWT at all — true for
`service_role`, false for every authenticated caller regardless of company
state — so it's the correct discriminator. Verified against both real
call paths: `sella-detect`/`sella-summarize` call this under `service_role`
with no JWT (`createClient(url, serviceKey)`), and the nested-RPC path
(`send_deal`/`confirm_detected_deal`/`deliver_deal`) always carries the real
user's JWT, and that user is always a party by the time it's reached.

## §2 — migration: `msg_all` gains the write-gate term

New file: `<ts>_msg_all_relationship_write_gate.sql`.

```sql
alter policy msg_all on public.chat_message
  with check (
    public.can_access_thread(thread_id)
    and type <> 'deal_detected'
    and case
          when type in ('deal_signed', 'deal_cancelled', 'deal_change_proposed',
                         'deal_negotiation_requested')
          then true
          else public.assert_relationship_writable(
                 (select relationship_id from public.chat_thread where id = thread_id)
               )
        end
  );
```

**`case`, not `or` (closes N3 — round 2)**: `assert_relationship_writable`
never returns `false`, it raises — the exemption only works if the right-hand
side is never evaluated for the four exempt types. `or`'s short-circuit is
NOT guaranteed evaluation order in Postgres: the docs (§4.2.14, *Expression
Evaluation Rules*) say plainly that "the order of evaluation of subexpressions
is not defined" and warn against relying on it for functions with side
effects (a `raise` counts). A `case` expression IS a defined evaluation-order
construct — the `when` is evaluated first, and only the matching branch's
`then`/`else` runs. Relying on `or` here would occasionally (implementation-
and plan-dependent, not never) raise on a legitimate `announceDealEvent`
write on a suspended relationship — caught silently by that function's own
fail-soft `catch`/`console.error` (§8's four-type test cell would still catch
this in CI before it ships, but the SQL should be correct on its own terms,
not rely on the test to compensate for it).

**Known, accepted limitation (round 3, N1) — the outer `AND` chain has the
same unguaranteed-evaluation-order property the `CASE` fix above addresses,
and this one is NOT fixed, only named:** `can_access_thread(thread_id) and
type <> 'deal_detected' and case … end` — Postgres does not guarantee `AND`
evaluates left-to-right either, so the `CASE` (and therefore
`assert_relationship_writable`'s raise) could in principle run even when an
earlier term would have refused first. No security consequence — a refusal
is a refusal either way, and `relationship not found` is already the same
text for "doesn't exist" and "not yours" by design — but it means the exact
SQLSTATE/message a caller sees for a given refusal isn't strictly pinned to
which predicate "actually" failed. §7's user-facing mapping and §8's
`deal_detected` regression cell should assert "refused", not a specific
error shape, to stay correct regardless of which term Postgres evaluates
first.

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
governs `UPDATE`/`DELETE` on `chat_message`, not just `INSERT`. **Correction
(round 2, N2 — an earlier draft of this plan inverted this fact while calling
it "verified"):** `authenticated` DOES hold `UPDATE`/`DELETE` on
`chat_message` (`20260825120000_msg_all_deal_detected_gate.sql:72-74` says so
directly — the grant exists, no client or SQL path currently uses it). No
`GRANT`/`REVOKE` on `chat_message` exists anywhere else in
`supabase/migrations/` (grepped). So this IS a new behavior, not a wording
correction: an `authenticated` `UPDATE` of any `chat_message` row on a
suspended relationship becomes refused where it previously wasn't. Zero known
callers exercise this today, so the practical exposure is nil — but name the
real fact, not the safer-sounding wrong one.

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

**This section's `or` is safe, unlike the one §2 replaced with `case` (round
4, N1 — state why, don't leave the two sections reading as contradictory):**
for a `connect_person` row, `receiver_company_id IS NULL`, and `least`/
`greatest` ignore NULL arguments, so the derivation collapses to `company_a_id
= sender_company_id AND company_b_id = sender_company_id` — unsatisfiable
against the live `relationship_canonical_order` CHECK
(`company_a_id < company_b_id`, `20260607090003_phase2_deal.sql:31`). The
subquery always returns zero rows (NULL), so `assert_relationship_writable
(NULL)` always returns `true` regardless of evaluation order — there is no
side-effecting raise for `or` to short-circuit around here, unlike §2's
`type IN (...)` exemption. This safety is load-bearing on the derivation
never changing shape; if it ever stops collapsing to an unsatisfiable
predicate for the NULL case, revisit whether `or` is still safe.

## §4 — migrations: refactor `send_deal` and `confirm_detected_deal`

Two files, `create or replace` (their return signatures don't change — this is
NOT a repeat of HEL-68's `DROP`+`CREATE` situation), each re-emitting the FULL
live body verbatim except **three deltas** (round 2, N5 — an earlier draft of
this plan collapsed these to "one," which understated what changes even
though the substitution itself was already correctly specified below):
1. The inline check's block is replaced by the `perform` call (the delta
   named per-function below).
2. The raise's message PREFIX changes from `send_deal:`/
   `confirm_detected_deal:` to `assert_relationship_writable:` — it's now the
   shared function raising, not the caller.
3. `assert_relationship_writable` adds a membership predicate
   (`current_company_id() in (company_a_id, company_b_id)`) neither inline
   check had — redundant-but-harmless here (an RPC calling it has already
   established the caller is a legitimate party by the time it gets this far,
   per ADR 0008's own reasoning), but a real behavioral surface, not a no-op.

§8 already verified (not assumed) that none of `send_deal_relationship_
liveness_test.sql`/`confirm_detected_deal_relationship_liveness_test.sql`'s
existing assertions depend on the exact prefix — they match on
`%relationship is suspended%`/`%relationship is ended%` — so deltas 2 and 3
need no test-suite change, only naming here so a future reader doesn't
mistake "one delta" for "nothing else moved."

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
  is today, reachable only nested from `confirm_detected_deal` (§0 — `send_deal`
  stopped calling it in `20260825090000`, and that call site is currently the
  ONLY one, arriving after `confirm_detected_deal`'s own gate already ran on
  the same relationship). This gate is built anyway, unreachable through the
  product today, so a third future caller into `deliver_deal` can't reopen the
  gap silently (ADR 0008 Blast-radius) — not because `send_deal` needs it too.

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
  **Named consequence of this placement, not just "no chat write" (round 4,
  N3):** gating this early also means NO `sella_detection` memory row is
  written for a suspended-relationship run — where today, on every
  non-idempotent run regardless of outcome, one always is. This is the
  correct trade-off (the alternative pays the idempotency-claim cost and the
  Bedrock call for a run that was always going to be refused), but it's a
  distinct fact from "the chat post is refused," worth its own line so a
  future reader checking `sella_detection` history for a suspended
  relationship's thread doesn't read a gap there as a bug.
  **`postDetectedMessage()` itself needs no change** — it has exactly two call
  sites, in the `"post"` (`:260`) and `"supersede"` (`:262`) branches, out of
  FOUR total `decision.kind` branches (round 3, N6 corrected the count again
  — `"suppress"` at `:256`, not `:258`; `"none"` at `:274` is the fourth,
  the implicit fall-through). `"suppress"` reuses `decision.keepMessageId`
  and never calls it; `"none"` writes nothing at all.
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

File: `src/modules/connect/lib/requestActionError.ts` (round 3, N5 — path
stated explicitly; not under `discover/`). Callers: `src/app/discover/
actions.ts:94`, `src/app/discover/personActions.ts:66,90,117`,
`InboxView.tsx:115`, `RequestsSection.tsx:109`. **This file has a co-located
unit suite, `requestActionError.test.ts`, that covers every existing branch
today — the two new branches below need matching cases added there, not just
the source change** (an earlier draft of this plan named only the source
edit and left the test file unmentioned).

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

**Declared gap, not silently missed (round 2, N4):** this covers the
connect/pricing door only (`requestActionError.ts` is called from
`discover/actions.ts`/`personActions.ts`). The chat door has no equivalent —
`postMessage` (`store.ts:484-491`) and `postDealMessage` (`:518-526`) both
`if (error) throw error;` with no message mapping, so a suspended-relationship
chat post surfaces `assert_relationship_writable`'s raw raise text (or
nothing coherent) in the UI — the exact T10 shape this file's own docstring
says it exists to prevent, just on a door this file doesn't cover. PRD AC1
only requires the write be refused, not that it read well, so this is NOT
blocking — naming it here so it isn't mistaken for closed. Worth its own
follow-up if the suspended-relationship chat-refusal UX matters at G4/G5.

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

**`supabase/tests/deliver_deal_test.sql` needs a NEW cell, not just a
confirmation pass (closes B1 — round 2 found the plan claimed this suite
already covers AC4/Invariant 4 transitively, which is false on every count:
no existing cell uses a suspended/ended relationship, and neither Sella edge
function nor `send_deal` calls `deliver_deal` any more, so there was never a
transitive path to inherit coverage from).** Round 3 (B2) found the original
placement instructions didn't match this file's actual structure — corrected:

1. **Position: LAST cell, immediately before the file's own `ROLLBACK` at
   `:360`** — the file is one single transaction (`BEGIN` at `:37`), so a
   `status = 'suspended'` flip anywhere earlier persists for every cell after
   it and turns the suite red (case (3)'s `send_deal` call at `:248` and case
   (4)'s `confirm_detected_deal` calls at `:321`/`:335` both raise on a
   suspended relationship). If it can't be made the true last cell, wrap the
   flip in `SAVEPOINT before_suspend; …; ROLLBACK TO SAVEPOINT
   before_suspend;` instead of relying on file-end position.
2. **Use the file's OWN exception-catching shape (`:183-190`/`:199-207`),
   NOT the bare statement at `:160-162`.** `:160-162` is a top-level
   `SELECT public.deliver_deal(...)` with no exception handler — under
   `ON_ERROR_STOP=1` (mandatory, `.claude/rules/supabase.md`) a raise there
   aborts the entire psql run, not just the cell. Use:
   ```sql
   DO $$ BEGIN BEGIN
     PERFORM public.deliver_deal(<card>);
     RAISE EXCEPTION 'FAIL: deliver_deal accepted a suspended relationship';
   EXCEPTION WHEN raise_exception THEN
     IF SQLERRM NOT LIKE '%relationship is suspended%' THEN RAISE; END IF;
   END; END $$;
   ```
3. **State, don't inherit, two preconditions.** The status flip must run as
   `postgres` (or whatever privileged role/RESET ROLE state the file is in
   at that point) — `authenticated` has `UPDATE` revoked on `relationship`
   (`20260823090000_connection_consent_and_verification_lockdown.sql:89`), a
   plain `UPDATE` as `authenticated` would itself raise before ever reaching
   `deliver_deal`. And whatever `request.jwt.claims` the immediately-prior
   cell left set carries forward (this file's fixtures are cumulative, not
   reset between cells) — name explicitly which caller's claims are active
   for this new cell rather than silently inheriting whatever the previous
   cell happened to leave.
4. **Add an explicit "fixture is active at start" assertion (round 3, N3 —
   the plan's earlier citation of `:67-69` for this was wrong: that block
   only asserts the fixture ROW EXISTS, not that its status is `'active'`).**
   `send_deal_relationship_liveness_test.sql:55` and
   `confirm_detected_deal_relationship_liveness_test.sql:44` both assert
   this explicitly for their own fixtures — add the matching assertion here
   too, so a future change to the seed can't silently start this suite on an
   already-non-active relationship.

**New SQL suite: `supabase/tests/assert_relationship_writable_test.sql`, WITH
its runner `supabase/tests/run_assert_relationship_writable_test.sh`** (closes
B2 — round 2 found an earlier draft of this plan named the suite and never its
runner; every one of the five existing suites this plan touches has a
`run_*.sh` sibling, and `.claude/rules/supabase.md` is explicit that "a suite
with no runner is not coverage" — six suites in this repo silently rotted for
weeks that way). Model the new runner on an existing one of the same shape
(e.g. `run_send_deal_relationship_liveness_test.sh`) — stdin, not `-f <path>`
(the sandbox can't open files that way), `ON_ERROR_STOP=1` always. Unit-level
tests of the shared function itself, using the zero-mutation `BEGIN …
ROLLBACK` fixture pattern (`.claude/rules/supabase.md`):
- NULL `p_relationship_id` → returns `true` (Invariant 8).
- Active relationship, calling party → returns `true`.
- Suspended/ended relationship, calling party → raises `relationship is %`.
- Nonexistent id → raises `relationship not found`.
- Active relationship, `authenticated` caller who is NOT a party (a real
  person, member of a THIRD company) → raises the SAME `relationship not
  found` text as the nonexistent-id case (Invariant 9 — assert the message
  strings are identical, not just that both raise).
- **Second, DISTINCT cell (round 3, B1 — this population is not covered by
  the cell above and the fix specifically targets it):** active relationship,
  `authenticated` caller with `person.company_id IS NULL` (company-less —
  seed or insert a person with no company, matching the reachable v0 state)
  → raises the SAME `relationship not found` text, not a silent pass. This is
  the exact population B1's fix (discriminating on `auth.uid()` rather than
  `current_company_id()`) exists to close — a THIRD-company cell alone would
  stay green even if that fix were reverted, because `current_company_id()`
  is non-NULL for a real third-company member.
- Active relationship, `service_role`, no `sub` claim → returns `true` without
  raising (Invariant 10 — reproduce live per the ADR's own instruction to
  re-prove this after the fix). **Must explicitly clear the JWT claims before
  the role switch, not just `set local role service_role` (round 2, N6):**
  `set_config('request.jwt.claims', …, true)` is transaction-local and
  survives a bare role switch — `deliver_deal_test.sql:160`'s own fixture
  proves this live (a `RESET ROLE` there leaves a prior `set_config` claim in
  place). Without `select set_config('request.jwt.claims', '', true);` (and
  `request.jwt.claim.sub` too) run first, this cell would silently exercise
  the membership branch with a leftover `sub` from an earlier fixture in the
  same file, not the `service_role`-with-no-context path Invariant 10 is
  actually about — passing for the wrong reason.

**New assertions in `supabase/tests/msg_all_deal_detected_gate_test.sql`,
already has a runner (`run_msg_all_deal_detected_gate_test.sh`) — extend, do
not create a new suite (round 3, N4). Round 4 (B1) found this block missing
the SAME four structural requirements deliver_deal_test.sql's new cell above
needed — all four apply here too, made concrete against this file:**
1. **Position: last cell, immediately before the file's own `ROLLBACK`
   (`:239`)** — the file is one transaction (`BEGIN` at `:47`), and its §A
   controls (`:83-110`) insert into the SAME seeded Alice↔Bob p2p thread this
   new cell must suspend. A flip anywhere earlier aborts the rest of the
   suite under `ON_ERROR_STOP=1`.
2. **The relationship id is NOT in `_t` today — derive it, don't hardcode:**
   `_t` carries `thread_id` (the seeded p2p thread) but no `relationship_id`.
   Add `(select relationship_id from public.chat_thread where id = (select
   thread_id from _t))` at the point of use, or extend `_t`'s own `SELECT` to
   include it — matching the file's existing convention of looking values up
   dynamically rather than hardcoding (its own fixture comment says exactly
   this, for `thread_id`/`carol`).
3. **`RESET ROLE` before the flip** — `authenticated` has `UPDATE` revoked on
   `relationship` (`20260823090000:89`); the flip must run privileged, then
   `SET LOCAL ROLE authenticated` again (with `_t`'s Alice claims) before the
   refusal cells.
4. **New refusal cells must NOT copy this file's neighboring
   `insufficient_privilege` idiom (`:134-139`)** — that idiom is for a
   table/RLS-privilege denial (42501). `assert_relationship_writable`'s raise
   is `raise_exception` (P0001) — a `WITH CHECK` term raising propagates as
   itself. Catch `raise_exception`, or assert "refused" generically without
   pinning the SQLSTATE, or AC1/AC2's cells go red for the wrong reason (the
   exact failure mode round 4 also names in §2's own `case`/`and`-order N1 —
   the error a caller sees for a refusal isn't guaranteed to be one specific
   shape).
5. **The exemption cell needs a real "did the flip take" assertion, not just
   a positive "all four succeed" claim** — as written it would pass
   vacuously if the derived relationship id in point 2 were wrong (e.g. NULL
   from a bad lookup) or the flip silently no-opped. Assert
   `relationship.status = 'suspended'` for the derived id before asserting
   the four `announceDealEvent`-type inserts succeed.

Cells, once the above is in place:
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

**New assertions in `supabase/tests/inbox_insert_receiver_gate_test.sql`,
already has a runner (`run_inbox_insert_receiver_gate_test.sh`) — extend, do
not create a new suite (round 3, N4). Same four requirements (round 4, B1):**
1. **Position: last cell, before the file's own `ROLLBACK`** — `BEGIN` at
   `:47`; its §A controls (`:96-97`, `:100-105`) send between the SAME
   GreenLeaf↔StonePharm and GreenLeaf↔Rheinland pairs this cell would
   suspend. Insert after the file's existing D1 cell, immediately before
   `ROLLBACK`.
2. **Derive the relationship id, don't hardcode:** `_t` carries
   `greenleaf`/`stonepharm`/`rheinland` company ids but no `relationship_id`.
   Use this suite's own canonical-pair idiom (matching
   `accept_connection_request`'s `least`/`greatest`): `(select id from
   public.relationship where company_a_id = least(v.greenleaf, v.stonepharm)
   and company_b_id = greatest(v.greenleaf, v.stonepharm) and deleted_at is
   null)` — GreenLeaf↔StonePharm is one of the two seeded active
   relationships (`seed.sql:316`), confirmed live by round 4.
3. **`RESET ROLE` before the flip** — same `authenticated`-lacks-UPDATE
   constraint as `msg_all`'s cell above; flip privileged, re-establish
   Alice's claims and role after.
4. **New refusal cells must NOT copy this file's neighboring
   `insufficient_privilege` idiom either** — same P0001-vs-42501 distinction
   as `msg_all`'s cell.
5. **Assert the flip took** before asserting AC3's refusal — same vacuous-
   pass risk as `msg_all`'s cell if the derived id in point 2 is wrong.

Cells, once the above is in place:
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
before writing anything — do not assume). **Neither edge function calls
`deliver_deal`** (grepped, zero hits in `supabase/functions/`) — an earlier
draft of this plan claimed their own `assert_relationship_writable` RPC call
was transitively proven by `deliver_deal_test.sql`, which was false on two
independent counts (round 2, closes B1): wrong call chain (fixed above, §0),
and that suite had no suspended-relationship cell at all until this fix.
The two edge functions' OWN new RPC call — the one this diff actually adds to
them — has no automated coverage anywhere; it is deferred to the G4/G5 live
walk (per PIPELINE §3, this diff's rendered-component-free services still get
exercised there), not built as an automated suite here — name this
explicitly at G4 so it isn't mistaken for silent coverage.

## §9 — the two things NOT built here (declared, not silently missed)

- `create_deal_draft`, `confirm_deal_change`, and `propose_deal` — excluded
  (§0). `propose_deal` no longer exists in the live catalog (dropped); do not
  write a migration for it.
- **Chosen divergence, not an inconsistency (round 3, N8):** `confirm_deal_
  change`'s exclusion (above) means it still resolves a held pricing change
  on a suspended relationship, and its own SQL-side announcement
  (`deal_card_updated`, `20260707130300_deal_event_system_voice.sql:285-296`,
  `SECURITY DEFINER`, bypasses RLS) still lands in both threads. §6 gates
  `sella-summarize`'s PARALLEL summary of the same edit — so on a suspended
  relationship, the SQL announcement posts and Sella's own summary silently
  does not. This is a real, visible asymmetry between two write paths for the
  same event, not a bug in either — the SQL announcement is a system-of-
  record entry `confirm_deal_change`'s own exclusion (PRD AC7) protects,
  Sella's summary is new automated content generation this ADR's Locked #3
  ("no exemption for automated writes") deliberately does gate. Named here so
  it reads as a decision, not an oversight, if noticed at G4/G5.
- `announceDealEvent` — exempted via §2's four-type carve-out in `msg_all`'s
  `WITH CHECK`, not a separate gate — no source change to `actions.ts`, no
  separate migration beyond §2's.
- Any change to `is_relationship_member()`, `thread_all`, or any read-path RLS.
- 0024's own `store.ts:646` census entry — that write left the client path
  entirely once HEL-68 shipped (already merged); nothing to re-target, since
  it no longer exists as a write site at all.
- **0024's `accept_connection_request` (round 3, N7 — a new `chat_message`
  writer that landed after this plan's census, needs naming, not gating):**
  `20260826100000_accept_connection_request_atomic_threads.sql:209-257`
  inserts three `chat_message` rows (`connection_established`, `intro`, the
  requester's note) as part of HEL-68, shipped to production 2026-08-27. It
  needs no gate from this ADR — it already carries its own refusal at
  `:139-141` (`relationship % is % — cannot accept a new request onto it`),
  so a suspended/ended relationship can't reach these inserts through this
  RPC at all.
- **`deal_line_item_batch` and `deal_event_system_voice` — the PRD's census
  named these as if distinct from `confirm_deal_change` (round 3, N7); they
  are `create or replace` layers ON `confirm_deal_change`, not separate write
  sites** (`20260707130300_deal_event_system_voice.sql:25` re-emits
  `confirm_deal_change` itself). Already excluded under the same ruling
  (PRD AC7) as `confirm_deal_change` — no separate exclusion needed, naming
  here so the PRD's census and this plan's don't read as disagreeing.

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
- **Resolved (round 2, N7 — traced, not left open; citation corrected round
  3, N2):** `sella-summarize`'s single up-front gate call IS provably
  sufficient. `dealThread` is resolved by `deal_card_id` (`:135-137`);
  `p2pThread` is resolved by `card.relationship_id` directly (`:138-140`).
  The evidence that both are the SAME relationship is not the migration this
  plan originally cited (`20260618130200_create_deal_draft_retire_private_
  box.sql:155` — superseded; the live `create_deal_draft` is
  `20260724120200_create_deal_draft_private_birth.sql`, whose own `:16-22`
  DELETES the deal-thread insert entirely, "the birth-created deal chat is a
  RETIRED concept (D-05)"). The conclusion still holds, on different
  evidence: every surviving `deal`-thread producer is a seed row
  (`supabase/seed/seed.sql:656,724,788,856,921,989,1053`, all
  `select ids.rel_id, 'deal', card.id`) or a legacy row — every one keyed off
  the card's own relationship id. Both threads are provably the card's one
  relationship; they cannot diverge. No second call needed.

## §11 — acceptance criteria this plan closes

PRD AC1-AC6 (AC7/AC8 already closed by exclusion, no code needed — AC8's
exclusion is realized as §2's four-type carve-out, not a no-op). G4 routing:
backend-only (2 Postgres RLS policies, 3 RPC refactors/new-gates, 2 Edge
Functions, 1 client-side error-message map — no rendered component) → should
auto-close per PIPELINE §3 unless `security` (mandatory — migrations/RLS/RPC)
raises a blocking finding, or behavior diverges from AC1-AC6.
