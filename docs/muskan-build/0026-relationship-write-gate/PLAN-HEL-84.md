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

**Unlike §4's delta 3, this predicate is NOT redundant-but-harmless for
`deliver_deal` — name the real behavior change (round 6, N4):** §4 argues
`assert_relationship_writable`'s membership check is inert on `send_deal`/
`confirm_detected_deal` because the caller's party-status is already
established earlier in each function's own body. That argument does NOT
transfer here. `deliver_deal`'s own header
(`20260720095000_deliver_deal.sql:20-22`) states it "derives every id from
the card row — no client input is trusted" and performs no caller-is-party
check of its own; it is invoked nested, privileged. After this migration, it
refuses whenever the session's active JWT claims belong to a non-party —
a real new behavior, not a no-op, even though it's currently unreachable
(its one live caller, `confirm_detected_deal`, already gates on the same
relationship first) and `service_role` is exempt via `auth.uid() IS NULL`.

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

**`supabase/tests/accept_connection_request_status_guard_test.sql` needs a
REORDER, lands in the same commit as §3 (round 5, B1 — a real blast-radius
miss: this file was never censused against §3's new gate, and it breaks).**
Its §A (`:88-104`) mints a `pricelist_request` onto the Rheinland↔GreenLeaf
pair as `authenticated` (Clara) — the RLS-legitimate path — AFTER the fixture
already suspends that same pair at `:85`. Once §3 lands, that mint is exactly
what `inbox_insert`'s new gate refuses: `:99`'s `INSERT` is a bare top-level
statement with no exception handler, so under `ON_ERROR_STOP=1` the raise
aborts the entire suite, and §§B-E never run. **Fix: swap the order — mint
the `pending_inbox_item` first (Clara, while the pair is still active), THEN
suspend the relationship (HS team), THEN attempt to accept it.** This is not
a workaround, it's the MORE correct test of what this suite actually exists
to prove: `accept_connection_request`'s own guard
(`20260825200000_accept_connection_request_status_guard.sql`) is for a
request that predates a suspension and must still be refused at accept
time — not for a request minted after suspension, which after this ticket
can't be minted through the RLS path at all. The reorder needs no privileged
role and doesn't touch what §§B-E test. **Census performed independently by
`plan-checker` rounds 5 AND 6 (round 6 re-derived it from scratch rather than
trusting round 5, and confirmed the same conclusion, correcting one
misclassification) — trust it, don't re-derive a third time**: of the
suites touching `chat_message`/`pending_inbox_item` writes, this is the ONLY
one that breaks (the rest either write through a definer, write
pre-suspension, target a pair the gate doesn't reach, or collapse to the
unsatisfiable canonical-order NULL case the same way §3's own
`connect_person` exemption does — including two suites round 6 specifically
verified are safe for reasons stronger than short-circuit luck: `msg_all_
deal_detected_gate_test.sql`'s §D1 non-member cell is safe because
`thread_all`'s own `USING` clause excludes the non-member from ever seeing
the thread row at all, independent of evaluation order; `inbox_insert_
receiver_gate_test.sql`'s §B cells target companies with no relationship row
to begin with).

**The reorder also needs its own comments updated (round 6, N3) — five
places in `accept_connection_request_status_guard_test.sql` state the OLD
semantics and would mislead a future reader into re-swapping the order
back:** the file's top docstring, the `-- HS team suspends the pair first`
comment, §A's own header (`"a fresh request onto the now-suspended pair"`),
the two comments immediately around Clara's insert, and the note literal
itself (`'A2/suite: pricing ask on a suspended pair'`) all need to say the
new thing this cell actually tests — a request that predates a suspension.

**`send_deal_c2c_announce_test.sql` is a DIFFERENT blast-radius class, not a
write site (round 6, N5 — round 5's census listed it among the 12 as if it
inserts; it does not):** its only match is a string probe against
`pg_get_functiondef('public.deliver_deal(uuid)')`, asserting the TEXT of
that function still contains `insert into public.pending_inbox_item` and a
matching `if not exists` guard. §5's verbatim re-emit (the function body
copied unchanged plus one inserted `perform` line) preserves both needles,
so this suite is safe as specified — but name it explicitly in §5 as a
"text-assertion" dependent, not a data-write dependent, so a future edit
that reformats or restructures `deliver_deal`'s body (even while preserving
behavior) doesn't turn this suite red for a reason nothing else in this plan
would predict.

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
   `deliver_deal`. **The claims active at this point are Bob's (round 6, N2
   — named, not left implicit): `:325-327` sets them last, and `:341`'s
   `RESET ROLE` clears only the role, not the transaction-local
   `set_config`** (this file's fixtures are cumulative, not reset between
   cells). This matters more after §4/§5 than it did before: `deliver_deal`
   never had a caller-is-party check of its own — `assert_relationship_
   writable` adds one, so the active claims at this cell must belong to an
   actual party to GL↔StonePharm, which Bob is.
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
   (`:229` — round 5, N1 corrected a stale `:239`, past this file's actual
   237 lines)** — the file is one transaction (`BEGIN` at `:47`), and its §A
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
3. **`RESET ROLE` before the flip, AND name whose claims are active
   afterward (round 5, N2 — a previous draft said "re-establish `_t`'s Alice
   claims" without saying what was active before that):** `authenticated`
   has `UPDATE` revoked on `relationship` (`20260823090000:89`), so the flip
   must run privileged first. The claims in effect immediately before this
   new cell are Carol's (§D's deliberate non-member, set at `:182-183`) —
   §D's own `RESET ROLE` (`:198`) resets the ROLE but does NOT clear the
   `set_config` claims. After the privileged flip, explicitly
   `set_config('request.jwt.claims', …)` back to Alice's (`_t.alice`) before
   `SET LOCAL ROLE authenticated` — do not assume Alice's claims are still
   active just because an earlier cell set them once.
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
- **AC1 and AC2 are ONE cell, not two (round 6, N1 — in a `psql` SQL suite,
  "app path" and "a direct PostgREST-shaped call" are indistinguishable:
  both are a bare `INSERT` under `SET LOCAL ROLE authenticated`, exactly
  what this suite already does everywhere and what its own header states
  outright — `msg_all_deal_detected_gate_test.sql:34-36`, "covers FROM
  `authenticated`, NOT through a definer").** `authenticated` insert into a
  thread on a suspended relationship → refused. This ONE cell discharges
  both AC1 (the app can't do it) and AC2 (neither can a direct API call,
  since there is no separate "app" code path at this layer to bypass) —
  do not write two cells expecting them to differ.
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
  relationship to the sender → refused (AC3). This cell suspends
  GreenLeaf↔StonePharm.
- A `connect_person` row (`receiver_company_id IS NULL`) → unaffected by this
  gate entirely (Invariant 8's NULL-passthrough, exercised via the real
  no-company-pair path, not just the function's own NULL-arg test above).
- **A company pair with both a soft-deleted and a live `relationship` row →
  ordinary send still succeeds, no "more than one row" error (Invariant 13 /
  round 2 F4 regression guard). Must use GreenLeaf↔Rheinland
  (`seed.sql:344`), NOT GreenLeaf↔StonePharm (round 5, N3 — the AC3 cell
  above already suspends that pair; this cell needs a genuinely `active`
  pair or it's testing the wrong thing).** The extra soft-deleted
  `relationship` row this cell inserts must be inserted privileged —
  `authenticated` has `INSERT` revoked on `relationship` too, same
  constraint point 3 above already names for `UPDATE`
  (`20260823090000:89`).

**Both extended suites' PASSED banners need updating (round 5, N4)** —
`msg_all_deal_detected_gate_test.sql:237` and
`inbox_insert_receiver_gate_test.sql:248` each `\echo`/`RAISE NOTICE` an
explicit cell-by-cell enumeration (e.g. "A control x6/9 rows, B gate x2, C
definer x1..."); both go stale the moment §8's new cells land and are the
only thing either runner prints — update both to name the new cells.

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

---

## §12 — ADDENDUM (post-build): the §2 four-type exemption is a client-
reachable bypass, closed by moving `announceDealEvent` into a definer RPC

Written 2026-08-27, after `builder`'s implementation of §1-§7 passed full
gate (59/59 SQL, 479/479 vitest, tsc clean, e2e clean, `critic` clean) and
`security`'s pre-G4 pass found a real, live-proven exploit — not a plan
error, an implementation of §2 exactly as designed that turned out to be
attacker-reachable. Muskan's ruling (2026-08-27): fix it properly, matching
this repo's own established precedent for the identical shape, rather than
downgrading the AC.

### The finding

§2's `msg_all` `WITH CHECK` exempts 4 `announceDealEvent` message types
(`deal_signed`, `deal_cancelled`, `deal_change_proposed`,
`deal_negotiation_requested`) from the relationship-writable gate via a
`CASE WHEN type IN (...) THEN true ELSE assert_relationship_writable(...)
END`. The `CASE` logic itself is correct — `security` confirmed it doesn't
over-exempt by type and fails closed on `NULL`. The problem is one layer
down: `chat_message.type` has no CHECK constraint, `authenticated` holds
table-wide INSERT with no column-level restriction, and this suite's own §A3
already proved a browser session can set arbitrary `sender`/`type` values.
**Live-proven exploit**: a thread member on a SUSPENDED relationship, doing
an ordinary client insert with `type: 'deal_signed'` instead of `'message'`,
gets the write through — same for `UPDATE` (`msg_all` is `FOR ALL`), so an
existing message can be retyped to bypass the gate retroactively too.

**Why this is the right fix, not a smaller patch on the same mechanism.**
Tightening the carve-out (e.g. also requiring `sender = 'sella'`) does not
close it — `sender` is exactly as client-forgeable as `type` (proven by the
same §A3 cell). Any predicate keyed on columns `authenticated` can write is
the same hole with a longer key. This repo has already solved the identical
shape twice: HEL-67 Gap 1 refused `type = 'deal_detected'` from
`authenticated` entirely rather than trying to distinguish "real" Sella rows
from forged ones by column value; HEL-68/0024's `send_deal` refactor
(`20260825090000_send_deal_c2c_announce.sql`) moved its own chat pill insert
into the RPC itself, `SECURITY DEFINER`, so it bypasses RLS and needs no
carve-out from a client-facing policy at all. This addendum applies the same
move to `announceDealEvent`.

### §12.1 — what `announceDealEvent` currently does (read fresh, cited exactly)

`src/modules/deals/actions.ts:659-695`. Four call sites, unchanged in
purpose by this addendum:
- `proposeDealChange` (`:558-564`) — `deal_change_proposed`, body
  `` `${actorName} proposed a change` ``, ONLY when `cardRow.status ===
  "negotiation"` (a still-private draft's edit must never leak, D-08).
- `declineDeal` (`:771-777`) — `deal_cancelled`, fixed body `"Deal declined
  - the deal is closed."`.
- `signDeal` (`:823-829`) — `deal_signed`, fixed body `"Deal signed - the
  deal is confirmed."`.
- `requestNegotiation` (`:860-866`) — `deal_negotiation_requested`, body
  `` `${actorName} wants to negotiate` ``.

Current body (`:669-695`): fetches every live `chat_thread` for the card's
`relationship_id`, targets the `deal` thread (matched by `deal_card_id`) AND
the "visible" thread (`p2p` preferred, else `c2c`), inserts `sender: 'sella'`
per target, catches its own errors per-insert and logs (fail-soft — "the
deal action has already committed by the time this runs... it never
surfaces as a failed decline/sign", `:651-655`).

`resolveActorName` (`:703-714`) composes the display name for the two
call sites that need it; used ONLY by `announceDealEvent`'s callers.

### §12.2 — new migration: `announce_deal_event`, a `SECURITY DEFINER` RPC

New file, timestamp after `20260827140000` (verify the actual tip at build
time, same rule as §0's floor).

```sql
create or replace function public.announce_deal_event(
  p_deal_card_id uuid,
  p_type text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_company uuid;
  v_card   record;
  v_rel    record;
  v_name   text;
  v_body   text;
  v_deal_thread    uuid;
  v_visible_thread uuid;
begin
  if v_uid is null then
    raise exception 'announce_deal_event: not authenticated';
  end if;

  -- The type allow-list lives HERE, not on a client-writable column — this is
  -- the actual fix. A caller cannot pass an arbitrary type; the function's own
  -- CASE below is the only thing that ever writes one of these four values.
  if p_type not in ('deal_signed', 'deal_cancelled', 'deal_change_proposed',
                     'deal_negotiation_requested') then
    raise exception 'announce_deal_event: unsupported type %', p_type;
  end if;

  select company_id into v_company from public.person where id = v_uid;

  select * into v_card from public.deal_card
  where id = p_deal_card_id and deleted_at is null;
  if v_card.id is null then
    raise exception 'announce_deal_event: deal not found';
  end if;

  -- Membership, not liveness: this is deliberately NOT a call to
  -- assert_relationship_writable. ADR 0008 Invariant 16 rules these four
  -- announcements exempt from the suspension gate (an event already in
  -- motion is not a "new" write) — moving the insert server-side must NOT
  -- silently re-impose the gate this addendum exists to keep exempt. The
  -- check below is authorization (is the caller a real party to this deal),
  -- which a SECURITY DEFINER function must still perform itself since it
  -- bypasses RLS entirely and inherits no predicate from msg_all.
  select * into v_rel from public.relationship
  where id = v_card.relationship_id and deleted_at is null;
  -- v_company IS NULL is checked as its own disjunct, not folded into the
  -- IN() term (round-checker N1 — NULL NOT IN (a,b) evaluates to NULL, not
  -- true; an IF treats NULL as false, so that term ALONE would silently
  -- fail OPEN rather than refuse a company-less caller). This mirrors §1's
  -- own function, which hit and fixed the identical bug in round 3.
  if v_rel.id is null or v_company is null
     or v_company not in (v_rel.company_a_id, v_rel.company_b_id) then
    raise exception 'announce_deal_event: caller is not a party to this deal''s relationship';
  end if;

  select nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
    into v_name
  from public.person where id = v_uid;

  v_body := case p_type
    when 'deal_change_proposed'       then coalesce(v_name, 'A teammate') || ' proposed a change'
    when 'deal_negotiation_requested' then coalesce(v_name, 'A teammate') || ' wants to negotiate'
    when 'deal_cancelled'             then 'Deal declined - the deal is closed.'
    when 'deal_signed'                then 'Deal signed - the deal is confirmed.'
  end;

  -- Both targets are READ, not resolve-or-create: unlike send_deal's c2c
  -- pill (which can fire before any message has ever been sent), every one
  -- of these four events happens well into a deal's lifecycle — the deal
  -- thread and the visible p2p/c2c thread both already exist by construction
  -- (create_deal_draft mints the deal thread; the relationship's own accept
  -- flow, HEL-68, mints c2c/p2p). A NULL find is silently skipped, matching
  -- announceDealEvent's own `if (dealThread) targets.push(...)` shape — not
  -- an error, since a thread genuinely may not exist for one arm (e.g. no
  -- p2p thread yet for a company-only relationship).
  select id into v_deal_thread
  from public.chat_thread
  where relationship_id = v_card.relationship_id
    and type = 'deal'
    and deal_card_id = p_deal_card_id
    and deleted_at is null;

  -- FIXED (plan-checker B2 — the original draft matched ANY p2p thread on
  -- the relationship, not the actor's own. The old app-side code ran as the
  -- authenticated actor, so thread_all's own USING clause
  -- (auth.uid() IN (person_a_id, person_b_id)) had already filtered the
  -- list down to threads the actor participates in — a SECURITY DEFINER
  -- function sees every p2p thread on the relationship, and
  -- uq_chat_thread_p2p is keyed per PERSON PAIR, so a relationship with
  -- ≥2 pairs has ≥2 distinct p2p threads. Without this filter, the
  -- announcement could land in a private 1:1 between two OTHER people
  -- while the actor's own channel gets nothing — silent in every existing
  -- test because the seeded fixtures only ever have one p2p thread per
  -- relationship. Restricting to v_uid's own pair reproduces the pre-fix
  -- behavior exactly, matching send_deal's own precedent
  -- (20260825090000_send_deal_c2c_announce.sql:132-144, keyed on
  -- (v_uid, counterparty) the same way).
  select id into v_visible_thread
  from public.chat_thread
  where relationship_id = v_card.relationship_id
    and (
      (type = 'p2p' and v_uid in (person_a_id, person_b_id))
      or type = 'c2c'
    )
    and deleted_at is null
  order by (type = 'p2p') desc  -- p2p preferred over c2c, matching the app's `??` fallback
  limit 1;

  if v_deal_thread is not null then
    insert into public.chat_message (thread_id, sender, type, body, metadata)
    values (v_deal_thread, 'sella', p_type, v_body,
            jsonb_build_object('deal_card_id', p_deal_card_id));
  end if;
  if v_visible_thread is not null and v_visible_thread is distinct from v_deal_thread then
    insert into public.chat_message (thread_id, sender, type, body, metadata)
    values (v_visible_thread, 'sella', p_type, v_body,
            jsonb_build_object('deal_card_id', p_deal_card_id));
  end if;

  return v_deal_thread;
end;
$$;

revoke execute on function public.announce_deal_event(uuid, text) from public, anon;
grant  execute on function public.announce_deal_event(uuid, text) to authenticated;
```

**Behavior change, named not hidden:** the original per-thread fail-soft
(one thread's insert failure never blocks the other, `:656-657`,
`:682-691`) becomes per-CALL fail-soft — both inserts happen in one
transaction, so a failure on either aborts both and the RPC raises. This is
MORE consistent than today (today, a partial post to only one of two
threads is a silent, unlogged inconsistency) — but it is a real behavior
change, so §12.3 below preserves the OUTER fail-soft contract (a failed
announcement still never blocks the parent decline/sign/propose/negotiate)
at the call site instead of inside the SQL.

### §12.3 — TypeScript: `actions.ts`'s four call sites, `announceDealEvent`
and `resolveActorName` deleted

**`announce_deal_event` is a new RPC, not in `database.types.ts` (not
regenerated by this build) — use this file's own documented cast pattern
(plan-checker B3: a plain `supabase.rpc("announce_deal_event", ...)` call
will not compile, `rpc()`'s first argument is constrained to `keyof
Database["public"]["Functions"]`), matching the existing precedent at
`actions.ts:529-536` for `propose_deal_change`, itself also uncast:**

```ts
const { error: announceErr } = await supabase.rpc("announce_deal_event" as never, {
  p_deal_card_id: dealCardId,
  p_type: "deal_signed",
} as never);
if (announceErr) console.error("deal event announcement failed", announceErr);
```

Replace each `await announceDealEvent(supabase, <id>, <relationshipId>,
'<type>', <body>)` call with this shape, wrapped to preserve the existing
fail-soft contract exactly (log, never throw):

- `proposeDealChange` (`:556-565`) — same `cardRow.status === "negotiation"`
  guard stays; drop the `actorName`/`resolveActorName` call (the RPC composes
  the name-including body itself now), drop the `body` argument.
- `declineDeal` (`:770-777`) — same shape, `p_type: "deal_cancelled"`.
- `signDeal` (`:822-829`) — same shape, `p_type: "deal_signed"`.
- `requestNegotiation` (`:859-866`) — same shape, `p_type:
  "deal_negotiation_requested"`, drop `resolveActorName`.

**Delete `announceDealEvent` (`:659-695`) and `resolveActorName`
(`:703-714`) entirely** — both become dead code once all four call sites
route through the RPC; `resolveActorName`'s docstring already says it's
"shared by the two projection-only actions," both of which no longer need
it.

**Keep `signDeal`'s and `requestNegotiation`'s `deal_card` reads
(plan-checker N4 — they become dead round-trips whose only purpose was
fetching `relationship_id` for the now-deleted client-side announce call,
but deleting them changes behavior):** both comments say outright "the
relationship id feeds the fail-soft announcement" — true no longer, since
the RPC re-derives `relationship_id` from `deal_card_id` itself. Removing
the reads would also remove today's "a missing card throws before the
announcement" check. Leave them in this pass (harmless — `no-unused-vars`
is warn-level here, no build break) rather than changing behavior as a
side effect of an unrelated security fix; note them as a named cleanup
opportunity for a future pass, not silently dead.

**The `cardRow.status === "negotiation"` guard in `proposeDealChange`
stays purely client-side (plan-checker N5) — named, not silently
inconsistent with this addendum's own doctrine.** D-08 requires a
still-private `unsent` draft's edit never leak to the counterparty as a
chat pill. `announce_deal_event` has no `deal_card.status` check of its
own — the guard that decides whether to call it at all lives entirely in
`proposeDealChange`, the client-controlled caller. This is NOT a new hole
(the pre-fix direct-insert path was equally unguarded server-side), and
this addendum's own scope is the type-forgery bypass, not a general
audit of every announcement's authorization surface — but leaving a
client-only gate unmentioned right after arguing "any predicate keyed on
client-controllable input is the hole" would read as inconsistent, so it's
named here rather than left implicit.

### §12.4 — migration: `msg_all` loses the exemption

Edit the ALREADY-COMMITTED (never shipped to production)
`supabase/migrations/20260827100000_msg_all_relationship_write_gate.sql`
directly, in place — safe to rewrite before first deploy, not
history-rewriting of shipped state. **Evidence, corrected (plan-checker
N6 — "the ledger has it nowhere" proves nothing on its own; the whole
0026 batch has no PENDING ledger entry yet regardless, and
`docs/deploy/cloud-migrations-pending.md` itself records this exact
failure mode as a known trap, "a migration nobody entered, found later by
someone reading the push line rather than the table"):** the real evidence
is the production migration tip, verified `20260826100000` against
`supabase_migrations.schema_migrations` — every `20260827*` file, this one
included, is local-only. The whole 0026 batch still owes its own PENDING
ledger entry (not written here — that's a `/ship`-time step, matching how
0024's was written only once its build was ship-ready). Replace the `CASE`
with a plain check:

```sql
alter policy msg_all on public.chat_message
  with check (
    public.can_access_thread(thread_id)
    and type <> 'deal_detected'
    and public.assert_relationship_writable(
      (select relationship_id from public.chat_thread where id = thread_id)
    )
  );
```

Re-emit the `comment on policy` to drop the now-false claim about a
four-type exemption. **Precisely what this closes, not overstated
(plan-checker N7 — "no longer written by ANY client-facing path" is false:
`authenticated` can still `INSERT type='deal_signed', sender='sella'`
directly on an ACTIVE relationship today, HEL-67 Gap 2's still-open class,
unaffected by this addendum).** What changes is narrower and is the actual
AC: on a SUSPENDED relationship, arbitrary body text can no longer be
laundered through one of the four types — the write-gate now applies to
`type` uniformly, with no carve-out. `announce_deal_event`'s own
`SECURITY DEFINER` body bypasses `msg_all` entirely regardless of
relationship status, same as `deal_detected`/`deal_card`/every other
system-authored type already does — that mechanism was never in question.

### §12.5 — tests

- **`msg_all_deal_detected_gate_test.sql` §F5 (the exemption cell) is now
  WRONG and must be replaced, not kept — corrected scope (plan-checker B1:
  an earlier draft of this addendum said "refused on ANY relationship
  (active or suspended)", which is FALSE and self-contradicts this exact
  file's own §A3 control, `:90-95`/`:114`, which deliberately asserts these
  four types DO succeed as a direct `authenticated` insert on the ACTIVE
  seeded relationship — "if any cell here fails, the predicate is too wide
  and would break production," `:74-76`).** After §12.4, the four types
  carry no special meaning to `msg_all` at all — on an ACTIVE relationship
  they insert exactly like `'message'` does (§A3 stays correct, unedited).
  **F5's corrected scope: refused ONLY on the SUSPENDED relationship**
  (same position it already occupies, after F2's suspend flip) — for each
  of the four types, as a direct `authenticated` client insert, catch
  `raise_exception`/P0001 (§8's own point 4 pattern), not
  `insufficient_privilege`. This is the regression guard that would have
  caught the vulnerability `security` found. **Also update, beyond F5 itself
  (plan-checker N3):** §A3's own inline rationale comment (`:90-92`,
  currently reads "a type predicate that caught any of them would break a
  shipped action" — becomes misleading once no path reaches these types via
  `announceDealEvent` any more, though the CONTROL assertion itself stays
  correct and unedited), the §F section header (`:238-239`), F1's inline
  comment (`:260-262`), and the pass banner (`:355`, "F5 exemption x4") —
  all currently describe the old exemption-by-type design.
- **New SQL suite** `supabase/tests/announce_deal_event_test.sql`, WITH its
  runner `supabase/tests/run_announce_deal_event_test.sh` (plan-checker
  B4 — same class as §8's own B2: a suite with no runner is not coverage,
  and this is a brand-new attack surface, so its regression guard must
  actually execute in CI). `security`-review shaped since this is new
  attack surface: a non-party calling it (any relationship, active or
  suspended) → refused, message names "not a party" not a raw error; a
  company-less caller (distinct cell, same reasoning as §8's own Invariant-9
  test) → refused, not a silent pass; a genuine party calling it with each
  of the 4 valid types → both threads (where they exist) receive a
  `sender = 'sella'` row with the correct server-composed body; **a
  relationship with TWO p2p threads (two distinct person pairs) → the
  announcement lands in the CALLING person's own pair, never the other one**
  (the regression guard for plan-checker's B2 finding — the original draft
  would have silently posted into an arbitrary p2p thread on a
  multi-pair relationship); an invalid `p_type` value → refused (proves the
  allow-list is real, not decorative); **on a SUSPENDED relationship, a
  genuine party calling it with a valid type → STILL SUCCEEDS** (this is the
  one cell that proves ADR Invariant 16's exemption survived the move —
  without it, a future reader could "fix" this RPC by adding an
  `assert_relationship_writable` call and silently re-break the ruling this
  whole addendum protects).
- `src/modules/deals/actions.test.ts` (or wherever this module's existing
  unit tests live — check before assuming a new file) — the four call
  sites' fail-soft wrapping (`announceErr` logged, never thrown) needs a
  regression test per call site, since this is now hand-written glue code
  instead of a shared function with one try/catch.

### §12.6 — plan-checker's job for this addendum specifically

- Verify `v_visible_thread is distinct from v_deal_thread` actually
  prevents a double-insert in the case where a `deal` thread and the
  "visible" thread could ever be the SAME row (trace whether that's
  possible given the schema, or provably isn't).
- Verify the membership check's `v_company not in (...)` correctly denies a
  company-less caller (same class of bug §1's own membership check had
  before its round-3 fix) — does `v_company is null` genuinely short-circuit
  to refusal here, or does `NULL NOT IN (a, b)` evaluate to `NULL` (falsy in
  an `if`, so it DOES refuse) — confirm this is actually safe Postgres
  semantics, not assumed.
- Verify `deal_card`'s live schema actually has a `relationship_id` column
  reachable the way this addendum assumes (read the live table, don't
  inherit from `send_deal`'s usage of the same column).
- Verify no OTHER caller of `announceDealEvent`/`resolveActorName` exists
  beyond the four named (a fresh grep, not inherited from this addendum's
  own count).
- Confirm deleting `announceDealEvent`/`resolveActorName` doesn't break
  anything else in the file — re-check for any other reference.
