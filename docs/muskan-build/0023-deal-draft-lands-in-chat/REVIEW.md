# 0023 deal-draft-lands-in-chat — REVIEW

One file per slug. Every finding attributed to the agent that raised it, with the
evidence that makes it true. Appended to, never rewritten.

---

# T01 (HEL-63) — `send_deal` announces a company-addressed deal in the company chat

## Round 1 — `plan-checker`, on PLAN-T01.md rev 1

**Verdict: REVISE — 3 blocking, 6 notes. All nine verified true by me against the real
files before folding (L-003); all nine accepted, none argued down.** Plan is now rev 2.

| # | finding | disposition |
|---|---|---|
| B1 | **AC 9 (M8) has no home** anywhere in the plan — not in the file list, the case table, or the runnable order (`plan-checker`, `TICKETS.md:71`) | **FIXED** — added case C9 (`pg_get_functiondef` still shows the insert + `if not exists` guard) **plus a repo-level check** that also greps for a NEW migration redefining `deliver_deal`, which a diff of the old file cannot see |
| B2 | 🔴 **Case ordering guts C6/C7.** C4 soft-deletes the c2c thread and sat BEFORE the recipient-read cases. `can_access_thread` has **no `deleted_at` predicate** (`20260607170000:117-132`), so a pill in a soft-deleted thread still passes RLS — C6 would have proved the recipient can read a pill in a conversation the app never shows, and gone GREEN (`plan-checker`) | **FIXED** — C4/C5 moved LAST **and** C6/C7 pinned with an explicit `deleted_at is null` + C1's captured message id. Ordering alone is a fact a later edit can silently undo (L-044's class), so both |
| B3 | **Two suites that EXECUTE the rewritten body were not being run** — `decline_deal_test.sql:110,:143` and `update_deal_draft_test.sql:145` both `PERFORM public.send_deal(...)`; their SAFE rating was a *reading* and both runners exist (`plan-checker`) | **FIXED** — step 6 now runs **five** runners, not three |
| N4 | The mandated grep omitted **`chat_thread`** — the one table the migration newly writes. Two more suites surfaced (`p2p_companyless_dedup_test`, `list_my_person_connections_test`) (`plan-checker`) | **FIXED** — grep widened to five terms; both opened by me, both SAFE |
| N5 | C5's count is order-dependent and unscoped (`plan-checker`) | **FIXED** — scoped to the live thread, and the scope stated |
| N6 | **§8.11's `on conflict` path ships uncovered**; ADR §5's claim that "M4′ covers the `on conflict` path" is **false** (`plan-checker`) | **ACCEPTED AS A GAP, NOT PAPERED OVER** — declared review-only and handed to `critic` by name. Corrects an accepted ADR |
| N7 | No per-case card fixtures; `send_deal:73-75` refuses a non-`unsent` card (`plan-checker`) | **FIXED** — one freshly born card per sending case |
| N8 | C6/C7 need the temp-table grants at `deliver_deal_test.sql:52-54`, not just role discipline (`plan-checker`) | **FIXED** |
| N9 | The plan's sync-ritual step was already discharged (`plan-checker`) | **FIXED** — struck, `c60ba69` |

**Verified clean by `plan-checker`:** the ADR §3 Reused fence, STATE.md's Deferred list, the
agent split (`test-writer` owns all `supabase/tests/**`; builder owns source only), C4's
soft-delete mechanics against the partial index, and C6/C7's expected RLS outcomes.

## Round 2 — my own review of `test-writer`'s output

| # | finding | disposition |
|---|---|---|
| M1 | `claim_deal_ticket_test.sql:3` — the file's **TITLE** line still asserted *"the ticket is written by send_deal"*. Found by reading the top of the file, **not** the diff (orchestrator) | **FIXED**, and sent back for a whole-file sweep rather than a one-line patch |
| M2 | The sweep found **two more**: `deliver_deal_test.sql:1-27`'s header bullet (1), and `:174-178`'s WR-01 comment naming `send_deal` as a live `deliver_deal` caller when T01 deletes that call entirely (`test-writer`, on re-scan) | **FIXED** |

**Three stale lines: one visible in the diff, two only by reading whole files.** This is
`L-045`'s class, inside the session that wrote `L-045`.

## Round 3 — `builder`'s report on the pre-written suite (it refused to edit tests)

`builder` correctly reported rather than edited (L-035). **Both claims verified by me
against the live DB before acting.**

| # | finding | disposition |
|---|---|---|
| D1 | C3 counted **all** undeleted c2c rows and expected 1, forgetting the seeded `connection_established` message (`seed/seed.sql:322-323`). True count is 2 (`builder`) | **FIXED — but NOT by builder's proposed `<> 2`.** That hard-codes today's seed into the assertion. Replaced with a **delta**: capture the count before C3's send, assert unchanged after. Immune to seed content and a tighter match to M3's actual wording |
| D2 | C4 `:410` / C5 `:472` use `max(uuid)`, which **does not exist on PostgreSQL 17.6** (it arrived in PG 18). A hard error before any assertion runs, so **C4/C5 had never executed** (`builder`) | **FIXED** — plain `SELECT … INTO` after the count assertion, no aggregate, no cast; PG-version boundary noted in a comment so it is not reintroduced |

## Round 4 — `critic`, on the built diff

**1 blocking, 8 notes.** ⚠️ `critic` reports it had **no shell** in this environment, so every
"unchanged/verbatim" claim is from reading the new file against the old migration text, **not**
against the git index. Two claims it could not mechanically verify: that `actions.ts` changed
only in the docstring, and that WR-01's assertion body is byte-identical. **Both independently
confirmed by me** — `git diff` shows `actions.ts` touching only `:356-366`.

| # | finding | disposition |
|---|---|---|
| **B1** | 🔴 **The header cites the wrong function.** `:120-121` says the p2p arm is *"a direct plpgsql port of `openOrCreateP2pThread`, `store.ts:361-388`"*. **Verified by me: that function is at `store.ts:383`**; the cited range is mostly **`resolveC2cThread`** (`:358`) — the **other arm's** resolver, in the one migration whose whole subject is that the two arms differ (`critic`) | **SENT BACK to builder.** All five header citations were copied forward from `20260724120300:23-24` unverified and `store.ts` has shifted since. ADR §6.4 / PLAN §2.1 made header accuracy an explicit obligation of THIS ticket — **the rationale was rewritten, the citations rode along unchecked.** `L-045`'s class, in the file told to police it |
| N1 | `:195-196` cites `postDealMessage, store.ts:478-499`; it is at **`:500`** — the cited range is its JSDoc (`critic`) | **SENT BACK** |
| N2 | Three more off by 1-2 lines: `:26-27` (insert is `:624-633`, throw at `:634`), `:160` (filter at `:365`, not `:363`), `:42` (predicate runs `:42-48`) (`critic`) | **SENT BACK**, same pass |
| N3 | The replacement rationale at `:93-96` is **true but does not support its conclusion** — both writes are in one definer transaction, so no session observes the intermediate state and RLS never applies to either write (`critic`) | **SENT BACK** — to be restated honestly as conventional ordering, not an RLS-enforced constraint. *A comment claiming a constraint that does not exist is worse than one admitting there is none* |
| N4 | **The `on conflict` transcription is CLEAN** — read character-by-character against `20260823090000:162-183`; both arms' re-select predicates term-for-term identical to their initial selects; bare `DO NOTHING` correct for the partial indexes (`critic`) | **NO ACTION — this was the review-only assignment from N6 above, and it came back clean** |
| N5 | The hoist changed a failure mode: a NULL `v_thread` now hits `chat_message.thread_id NOT NULL` and surfaces a raw `23502` — the opposite of the `23505` the idiom prevents (`critic`) | **SENT BACK** — add a named `raise` after the branch. Documents the state as believed-unreachable rather than ignored |
| N6 | **§8.3's ruling has no assertion** — every company-arm `send_deal` call in the new suite discards the return, so a silent revert to `null` would pass the whole suite. The person arm IS covered (`critic`) | **FIXED by `test-writer`** — C1 now asserts non-null **and** equal to the thread it announced into |
| N7 | WR-01's *comment* changed, which reads against ADR §6.1's "preserved verbatim" — the assertion body is verbatim and M5 holds (`critic`) | **NOTE ONLY** — deliberate, from round 2's sweep. Recorded so the G4 replay of AC 8 does not read it as a violation |
| N8 | `claim_deal_ticket`'s only remaining producer is now untested end to end; `confirm_detected_deal…:173-176`'s company branch is not exercised by any suite (`critic`, pre-existing, widened here) | **NOTE** — J4's "kept alive for a door with no traffic" is now true of the test suite too. Carry to the page-deletion slug |
| N9 | 🔴 **`can_access_thread` has no `deleted_at` predicate** (`20260607170000:129-144`), so pills in a soft-deleted thread stay readable by relationship members while `resolveC2cThread` hides that thread from the app. **Pre-existing — but this diff makes a second c2c thread reachable for the first time** (`critic`) | **FOR MUSKAN — nothing currently files this.** The new suite defends against it by ordering + pinning, which is right for the test and does nothing for the policy |

**Verified clean by `critic` (so it is not re-derived):** the three changes and nothing else,
with old `:62-78` guards / `:86-98` co-owner insert / `:101-103` flip / `:132-140` name+pill /
`:144-146` log line character-identical in the new body · J2 — exactly one `chat_message`
insert, outside the branch · M11 — grant present as a separate statement, `create or replace` ·
M8 — `deliver_deal` untouched, grant intact, Sella's caller intact · AC 8 — the double
`deliver_deal` call genuinely exercises the `if not exists` guard · `claim_deal_ticket_test`'s
person-target call untouched · **no scope creep** (`BasketDrawer.tsx:215` still hardcodes
`counterpartyPersonId: null`, no `CounterpartyPersonSelect.tsx` exists, no e2e, no docs, no RLS
or schema change) · nothing on the Deferred list built · ADR §3 fence untouched · `actions.ts`
signature unchanged and both false claims genuinely replaced.

## Round 4b — `security`

⚠️ **First attempt STALLED** (watchdog, no progress for 600s) at the point it turned to the
catalog. Read-only, so nothing was left half-done — **but a stalled agent is not a pass and is
not recorded as one** (L-001/L-008). Respawned with an explicit caveat: **the local DB is in a
PARALLEL SESSION's shape and `20260825090000` is NOT applied to it**, so a catalog query about
`send_deal`'s current definition would answer from the wrong database. Verdict pending.

---

## Gate evidence gathered so far — run by me, exit codes captured from the runners themselves

| check | result |
|---|---|
| `tsc --noEmit` | **exit 0** |
| `npm run test:unit` (vitest) | **490 passed / 490**, 67 files |
| **AC 9 / M8 (a)** — is `20260720095000_deliver_deal.sql` modified? | **untouched** |
| **AC 9 / M8 (b)** — does any new migration redefine `deliver_deal`? | **none** |
| RED baseline (pre-migration) | `send_deal_c2c_announce` **exit 3** · `deliver_deal` **exit 3** · `claim_deal_ticket` **exit 0** (green by design) |
| **five-runner SQL gate (post-migration)** | ⏳ **NOT YET RUN** — blocked on the shared local DB, held by the parallel session |

⚠️ **A measurement trap worth recording.** My first RED pass piped each runner into `tail -6`
and read `$?` — which reports **tail's** status, not the runner's. All three read as `0` while
two had actually failed. The failure text on screen meant it did not fool me, but a script
branching on it would have called a red suite green. `L-024`'s class, one tool over. **Every
exit code in this file was captured from the runner directly.**

⚠️ **One gate run was DISCARDED, not recorded as a failure.** A five-runner attempt died with
`DatabaseSchemaMismatch` and then five `FATAL: Peer authentication failed` — the parallel
session reset the DB mid-run. **That is an environment collision, not a result.** Cause: an
idle notice fired while this session was idle *between subagent calls*, and was read as
"finished with the shared resource". **Agent-idle is not resource-free.**

## Round 5 — `security` (respawn), S1-S8 against the built diff

⚠️ **Method, stated by the agent itself:** verified **entirely from migration files**, not the
catalog, because the local stack was in the parallel session's shape and `20260825090000` was not
applied to it. **Three checklist items are NOT RUN and are listed as such rather than guessed.**

### 🔴 B1 — BLOCKING (S2). The announcement's write path lost its identity guard.

**Verified by me, live, before escalating.** This diff swaps the company-arm signal from a
`pending_inbox_item` row to a `chat_message` row. **The two tables have different INSERT
integrity, and the swap goes the weaker way:**

| | policy | identity guard |
|---|---|---|
| `pending_inbox_item` — the signal **removed** | `inbox_insert` (`20260823090000:306-309`) | ✅ `sender_company_id = current_company_id() AND sender_person_id = auth.uid()` |
| `chat_message` — the signal **added** | `msg_all` (`20260607170000:300-302`) | ❌ `USING/WITH CHECK (can_access_thread(thread_id))` — **no sender predicate, no type predicate** |

`pending_inbox_item` was identity-hardened one slug ago, and `20260823090000:293` states the
intent: *"a request may no longer be attributed to someone who never asked."*

**Live confirmation (mine, not the agent's):** `authenticated` holds `INSERT` on `chat_message`
(`information_schema.role_table_grants`), and `20260824100000_table_privilege_lockdown.sql`
does not mention the table — it revoked only `truncate, trigger` elsewhere. So **any member of
either company can insert a `type='deal_card'` pill with `sender_person_id` set to any other
person and a body reading "<victim's name> has sent a deal"**, pointing at an arbitrary card.

**ADR J1 (`:412-418`) discloses HALF of this** — the arbitrary `metadata.deal_card_id` — and
explicitly says what it does not buy. **It does not mention sender attribution.** And §4.1:306
records `chat_message` RLS as *"unchanged … no policy is widened"*, which is **true and not the
question**: the policy did not widen, **the signal migrated onto a weaker policy.**

**Blocking on DISCLOSURE, not on code.** The migration is correct. What is missing is (a) J1
amended to name sender-identity forgery, and (b) a ticket. The proper fix — `WITH CHECK (… AND
sender_person_id = auth.uid())` plus a type restriction — **is an RLS change, which ADR §4.2
forbids for this slug.** → **ESCALATED TO MUSKAN** (a blocking `security` finding is one of the
three `/build` step-10 carve-outs).

### Notes

| # | finding | disposition |
|---|---|---|
| N1 | **`send_deal` never checks the relationship is still live.** `:162-186` routes on `relationship_id` with no `deleted_at`/`status` predicate, and `is_relationship_member` has none either. `rel_all` is `FOR ALL TO authenticated` and `authenticated` holds UPDATE on `relationship`, so a member can soft-delete it by direct write (DEV-159 class). After a disconnect the initiator can still Send an old `unsent` draft — now **minting a c2c thread on a soft-deleted relationship and landing a message in it**. Before this diff that produced an inbox ticket. **CLAUDE.md carries the T09 invariant "an unconnected buyer must not land a message in a seller's thread" — a formerly-connected one now can** (`security`) | **FOR MUSKAN** — one predicate in the resolve step. Same escalation |
| N2 | The new suite asserts the `authenticated` grant (C8) but never the `anon` non-grant (`security`) | **NOTE** — the class IS machine-held: `anon_execute_lockdown_test.sql:44-60` sweeps `pg_proc` dynamically with a one-function allowlist that excludes `send_deal`; and `create or replace` preserves the ACL. One line would make it local |
| N3 | **ADR §4.1's evidence line numbers are systematically wrong, though every claim they support is TRUE.** `card_relationship_member` policies are at `:312-322` not `:300-311`; `can_access_workspace` at `:117-125` not `:105-113`; `msg_all` at `:300-302` not `:288-290` (`:288-290` is `relart_all` on a different table); `sign_deal` at `20260724120500:75-81` not `:73-82` (`security`) | **NOTE — all four §4.1 claims about the removed `claim_deal_ticket` path HOLD.** But a reviewer following the citations lands on the wrong policies. **`L-045`'s class AGAIN — fourth instance this ticket.** T04 owns the upstream fix |
| N4 | `claim_deal_ticket_test.sql` now hand-copies `deliver_deal`'s insert shape; if that shape changes the test passes against one that no longer exists (`security`) | **NOTE** — the `L-047`-candidate class, borrowed truth |

### Attacks 2, 3, 7 — REFUTED / CONFIRMED, and the refutations are load-bearing

- **#2 REFUTED — no card state lets `relationship_id` and `initiating_company_id` disagree.** Every
  birth path sets the latter from the session *after* asserting the caller is in the relationship
  (`20260724120200:84-86`, and identically in three legacy bodies the agent checked **because
  `20260724120000` backfills old `draft` rows to `unsent`, making them sendable**). No RPC updates
  either column; `20260724120900:33` revokes INSERT/UPDATE/DELETE on `deal_card` from both client roles.
- **#3 REFUTED — both ADR §3 citations verify**, and the agent closed a gap the ADR does not
  mention: `update_deal_draft` merges metadata as `(metadata - 'free_delivery') || {…}`
  (`20260724121100:104-105`), so `counterparty_person_id` survives and is not client-settable there;
  and no RPC returns a card to `unsent`. **`v_cp` is only ever read while still birth-validated.**
- **#7 CONFIRMED — all four claims true** (see N3 for the wrong line numbers).
- **M9/M10 CONFIRMED, with a refinement:** the pill confers **no new read rights** — it adds
  discoverability to rows already readable post-flip. But *the announcement's audience did widen*:
  the sender's own colleagues now see a pill they never saw, among people who could already read
  the card.

### The known pre-existing gap — CONFIRMED as described, REFUTED as exploitable

`can_access_thread`'s c2c branch has no `deleted_at` predicate, so a healed relationship can carry
two c2c rows and both stay readable. **Not a confidentiality bug:** both rows share the same
`relationship_id` and the branch keys on relationship membership alone, so the healed thread's
audience is byte-identical. **The real cost is assumption integrity** — *"one c2c thread per
relationship"* stops being true of the row set. `resolveC2cThread` is safe (filters `deleted_at`),
but `e2e/inbox-accept.spec.ts:157-158` asserts `countThreadsForPair("c2c") === 1`. **T03 must grep
the counting helpers.**

### Checklist disposition — three items NOT RUN, listed rather than guessed

| | verdict |
|---|---|
| S1 | PASS via `anon_execute_lockdown_test.sql:44-60`; N2 on local coverage |
| S2 | 🔴 **B1** |
| S3 | **NOT RUN** — needs a throwaway function on a live DB |
| S4 | PASS, vacuous — this diff contains no revoke |
| S5 | PASS **against files**; see the /ship residual below |
| S6 | **NOT RUN** — `supabase db diff --linked` |
| S7 | Partial — RED was recorded by me (`exit 3` ×2), but the agent could not execute it |
| S8 | **NOT RUN** — `get_advisors` before/after |

⚠️ **CARRY TO `/ship` — the S5 residual.** A file-only diff cannot see production drift. **This
repo has been bitten by exactly this** (`ensure_rls` lived on prod and in no migration). Before
pushing, run `pg_get_functiondef('public.send_deal(uuid)')` **against production** and diff it
against `20260724120300`. If prod's body has ever diverged from the file, this `create or replace`
**silently overwrites the divergence.**
