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
| **five-runner SQL gate (post-migration)** | ⏳ **NOT YET RUN** — blocked on the shared local DB, held by the parallel session. ⚠️ **Superseded** — `STATE.md`'s later replay records all five runners at exit 0; this table was never reconciled after the block cleared |

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

---

## G4 — MUSKAN'S RULING, 2026-08-25: **file and ship**

The `security` B1 carve-out was escalated and **ruled**. Both findings are **filed, not fixed
here** — the fix is an RLS change and ADR §4.2 commits this slug to none, which is what makes its
migration safe to deploy alone.

| finding | filed as |
|---|---|
| **B1** — `msg_all` has no sender predicate; the deal signal moved onto a weaker policy | **HEL-67 WIDENED** — it already covered the *same policy* missing a `type` predicate. Two missing predicates on **one policy statement**, so one ticket: fixing them apart means rewriting `msg_all` twice. Retitled, **Medium → High** |
| **N1** — `send_deal` never checks the relationship is still live | **HEL-74** (new, High) — related to HEL-67 + HEL-63 |

**Honest scoping recorded in both tickets: neither hole was opened by this slug.** `msg_all` has
never had a sender predicate, and the relationship path produced an inbox ticket before rather than
a chat message. What changed is that **the deal signal now rides on guards that were never there.**

**Owed to T04 / HEL-66 (docs), and now written into HEL-67:** ADR J1 discloses only the arbitrary
`deal_card_id` half and must be amended to name **sender-identity forgery**.

### Acceptance-criteria replay — T01's nine EARS criteria, on real data

Replayed on a verified-clean reset (`20260825090000` at the tip **and** the new body confirmed
live by a shape-correct probe, not a substring match).

| AC | invariant | proved by | result |
|---|---|---|---|
| 1 | M1 | C1 | ✅ exactly 1 `deal_card` pill in the live c2c thread, right sender/body/metadata |
| 2 | M2 | C2 | ✅ zero `pending_inbox_item` rows |
| 3 | M3 | C3 | ✅ p2p only; c2c count **unchanged** (delta assertion, immune to seed content) |
| 4 | M4′ | C4 + C5 | ✅ missing thread healed; second send reuses it, mints no duplicate |
| 5 | M9 | C6 | ✅ recipient (`authenticated`, Bob's jwt) reads pill + card + line items |
| 6 | M10 | C7 | ✅ third company (Clara) gets zero rows on all three |
| 7 | M11 | C8 | ✅ `authenticated` still holds EXECUTE on `send_deal` |
| 8 | — | `deliver_deal_test` (2a), **two** direct calls | ✅ the dedupe guard is genuinely exercised |
| 9 | M8 | C9 + repo check | ✅ `deliver_deal` definition intact; no new migration redefines it |

**Plus, beyond the nine:** ADR §8.3's ruling is now asserted — C1 checks `send_deal` returns
**the thread it announced into**, not merely a non-null uuid.

### T01 — CLOSED

Backend-only diff, all nine ACs green on real data, `critic` clean after one fix round,
`security`'s blocking finding **ruled by Muskan and filed**. Budgets spent: `tests 0/2`,
`blocking-findings 1/2`, `G4 rounds 1`.

⚠️ **Two things this ticket hands forward, both already recorded above:**
1. **`/ship` must diff `pg_get_functiondef('public.send_deal(uuid)')` against PRODUCTION** before
   pushing (`security` S5 residual). A file-only diff cannot see prod drift, and this repo has been
   bitten by exactly that (`ensure_rls`).
2. **T03 must grep the c2c counting helpers.** `e2e/inbox-accept.spec.ts:157-158` asserts
   `countThreadsForPair("c2c") === 1`, and the heal path can now leave a soft-deleted row beside
   the live one.

---

# T02 / HEL-64 — the buyer can address a deal to a person at the seller's company

Session 90 `deal_land_t02`, 2026-08-25. Diff: `8d8d7c4` (source) + `7d2c0e2` (tests).
Budgets this round: `tests 0/2` · `blocking-findings 0/2` · `G4 rounds 1`.

## Gate — measured by me, not taken from an agent

| check | result |
|---|---|
| `npx tsc --noEmit` | **exit 0** |
| `npm run test:unit` | **494 / 494 across 68 / 68 files** |
| `npx eslint` (the three source files) | **exit 0** |

⚠️ **The file count was the load-bearing number, not the pass count.** T01's baseline was
**490 / 67**. A run still reporting 67 would have meant `CounterpartyPersonSelect.test.tsx`
never executed and its four cases were green for the wrong reason. **`rtk` collapses vitest
to `PASS (n) FAIL (n)` and would have hidden exactly that** — the real numbers came from
`rtk proxy npx vitest run`, and the new suite is confirmed by name with its 4 tests.

## `consistency` — CLEAN, zero blocking

Four checks, all reuse-positive, and **one of them corrected a claim of mine**:

- **No duplication of `NewChatDropdown`** (consistency). That component flattens *all*
  connections with search and sections, for starting a chat from the whole directory. This
  one resolves people for **one known `relationshipId`**. The only shared resource is
  `getMyConnections()`, which is reused verbatim — an ADR §3 fenced item.
- **The fetch idiom matches** `BasketDrawer.tsx:43-57` and the old `RecipientPicker`.
  On the accepted duplicate read: **there is no shared-fetch primitive in this repo to have
  skipped** — zero hits for `useSWR`/`react-query`/`useQuery`, and the single `createContext`
  (`BasketProvider`) is basket-domain state, not a directory cache. A stated tradeoff, not a
  silent one.
- 🔴 **The render-phase state adjustment is NOT a first — my plan implied it was.**
  `consistency` found it already established at **`IconRail.tsx:200-205`**
  (`prevOnRoute`/`onSurfaceRoute`) and **`OpenItems.tsx:115-120`** (`prevThings`/`things`),
  same shape, same `prev<X>` naming. **Verified by me by opening both** — and `IconRail`'s
  own comment names the reason: *"conditional setState in render, NOT an effect … so it never
  reads as a setState-in-effect."* So builder's D1 deviation did not merely dodge a lint
  rule; **it landed on the convention this repo had already chosen for exactly this problem,
  for exactly this reason.**
- **Styling byte-identical** to the sibling company select (`RecipientPicker.tsx:40`), and
  `aria-label="Address this deal to"` matches the repo's short-descriptive convention
  (`"Member role"`, `"Link type"`, `"Document type"`).
- **`peopleForRelationship`'s placement upheld**, and not as post-hoc rationalisation:
  `basket/lib/group.ts` and `pack.ts` operate on `BasketLine`/`BasketGroup` — basket math.
  This function operates on `MyConnectionsView`, a messaging type. The distinction is real.

## `critic` — 2 blocking + 7 notes. **All nine verified true by me before folding** (L-003)

⚠️ **`critic` ran with NO SHELL — the second time on this slug**, and its agent definition
grants `Bash`. It said so up front and substituted line-offset arithmetic, so **its
"unchanged/verbatim" claims are readings, not diffs.** I diffed the fenced items myself.
**This is broken machinery, not a checker quirk** — surfaced to Muskan at G4, not worked
around silently.

### Blocking — both FIXED, one round (`blocking-findings 1/2`)

Both are the same defect twice: **this diff falsified two docstrings in the module it was
editing.**

- **B1 — `basket/actions.ts:9-11`** said the buyer's recipient is *"implicit = the seller
  company via the relationship"*. **Eleven lines below, `:29` forwards the person the buyer
  just picked.** Rewritten to name what actually still differs: the buyer never chooses the
  counterparty *company* (the group's relationship fixes it), but since T02 **the addressee
  is symmetric** — either door may name a person, null meaning the whole company.
- **B2 — `basket/types.ts:41`** labelled `counterpartyPersonId` as the *"own-company offer
  path"*; the buyer's foreign `dealType: "order"` path now supplies it too. **Comment only —
  the type is byte-identical and PLAN §7's no-signature-change fence holds.**

### 🔴 N1 — the finding that cannot be fixed by code, and goes to G4

**C7's decoy closes the `relationshipId`-vs-`companyId` swap INSIDE THE SELECTOR ONLY.**
Change `BasketDrawer.tsx:361` to `relationshipId={group.sellerCompanyId}` — both are
`string`, `tsc` passes, `useEffect` never fires under `renderToStaticMarkup`, and **C1, C2,
C4, C5, C6 and C7 all still pass** while the shipped control's people list is empty forever.
That is precisely the M7 state the ticket forbids. Same for `RecipientPicker.tsx:59` →
`chosen.companyId`.

**My PLAN §5 "declared uncovered" table did not list this**, and a reader who accepts C7's
rationale would reasonably believe the class is closed one level up. **It is not, it is not
unit-coverable under this env, and it belongs on the G4 sheet beside AC 2.**

### Notes — DEFERRED, not fixed. Each is pre-existing and none is opened by this diff

| # | finding | why not fixed here |
|---|---|---|
| **N4** | `RecipientPicker.tsx:26-28`'s fetch has **no `.catch` and no `alive` guard**. On failure a **connected** seller is shown *"Connect with a company first to send an offer."* — a false message — plus an unhandled rejection. The sibling written in this diff has both guards | pre-existing; changes behaviour no AC covers. **~4 lines.** A ticket to file |
| **N5** | `RecipientPicker.tsx:42-46` only re-reports `onPick` when a company is found. Choosing *"Select a customer…"* (value `""`) never calls it, so the parent **keeps the previous recipient** while the control unmounts | pre-existing. The controlled select closes the A→B divergence; **the B→none half is untouched and reachable in one click** |
| **N6** | `BasketDrawer.tsx:215-217` is a `useState` initialiser on a prop that can change. A group going stranger → connected while the drawer is open leaves `recipient` null and renders a dead Create button | pre-existing, low reachability. **This diff improves it** (the select now gives the buyer a way to fill `recipient`) without closing it |
| **N7** | The **seller** path now fetches the directory **twice, fully redundantly** — `RecipientPicker` already holds `chosen.people` and the child re-fetches the same view (~4 round trips). PLAN's accepted cost declared the buyer's 1+N; **it did not declare this** | the shape is what G3 §8.1 chose. Correcting the *record*, not the code |

### N2 / N3 — corrected in the test files (`test-writer`, round 2)

- **N2** — C1's title claimed *"first, SELECTED"*; the assertion proves **preselection only**,
  and order is vacuous under an always-empty `people` fixture. **Renamed rather than padded
  with an assertion that would pass for free.**
- **N3 — three stale citations, and `test-writer` found a fourth I had not asked for.**
  `BasketDrawer.tsx:231` → **`:232`** (×2) and `RecipientPicker :26-28` → **`:32-34`** (×2)
  were **all broken BY this diff** (the new import at `:15` shifted everything by one).
  `BasketDrawer.tsx:187` → **`:202`** was pre-existing, from the 0022 pass.
  ⚠️ **The `:26-28` one was not an off-by-N — it pointed at entirely the wrong code** (the
  `useEffect` fetch, not the early return). **Verified by me by opening the file.**

### 📌 `builder` raised something worth more than the fix it was doing

The basket module's `D-xx` decision IDs **have no canonical home**. `D-12` currently means
four different things across the corpus — *"Inbox relabelled Connection Request"*
(`DECISIONS.md:1219`), *"one active pending join request"* (`cloud-migrations-pending.md:1366`),
*"price is seller-only"* (`0021-tier-ladder/PLAN-T07.md:108`), and *"delivery is `send_deal`'s
alone"* in `basket/actions.ts`. **Verified by grep.**

**A citation nobody can look up cannot go stale visibly — it just quietly stops being true.**
That is `L-038`'s shape one level up, and it is the seventh stale-citation finding on this
slug. A ticket is **offered at G4, not filed unilaterally.**

---

# G4 — staging table (T02 / HEL-64)

> Staged 2026-08-25 by `stage-visual-comparison`. Screenshots:
> `docs/muskan-build/0023-deal-draft-lands-in-chat/g4/`.
> **This is evidence, not a verdict. The gate is Muskan's.**

## How this was staged, and what is different about it

**There is no approved prototype.** G2 `/prototype` was skipped by Muskan's ruling (2026-08-25)
— the control is an existing component rendered in one more place. So every row below compares
the **live page against the ticket's acceptance criteria and the existing seller-side control**,
never against a mockup. No row can say "matches the prototype", because there is nothing to match.

**Driver:** Playwright (`@playwright/test`, chromium, 1440×900 unless stated) against
`http://localhost:3000`, signed in as the real seeded users. **The Chrome extension was not
connected**, so this was scripted rather than hand-driven; every shot is a real browser against
the real dev server and the real local DB.

**No `supabase db reset` was run** — the DB was already at the seeded baseline and a reset would
have rotated the stack auth key mid-run. Baseline was verified before and after
(6 companies · 2 relationships · 7 deal cards · 0 basket lines · 6 products · 1 pricelist · 7 people).

**⚠️ Schema moved mid-session.** Migrations `20260825100000` (HEL-69) and `20260825110000`
(HEL-70) were applied by a parallel session partway through. **Every screenshot in the folder was
re-taken AFTER those migrations** — the pre-migration set was deleted, so the record is uniform.
Nothing attributable to those two migrations was observed: the GreenLeaf shop rendered
**6 product cards / 3 add-to-basket buttons** both before and after, and no price rendered
differently. Reported for completeness, not as a finding.

**Fixtures created and hard-deleted.** The local seed has **no verified company that Bob is not
connected to**, and **no company with zero connected people** — so two rows below could not be
walked on seed data alone. A throwaway company (`G4 Staging Seller (temp)`, zero people), its
pricelist, one product, two relationships and one born draft card were created and **hard-deleted
after**; baseline was re-verified row-for-row. **`AUR-1A`–`AUR-1F` were never touched** —
their `profile_visible` / `price_public` flags were confirmed identical afterwards.

## The table

| # | Shot(s) | What it shows | Criterion | Verdict | What Muskan should look for |
|---|---|---|---|---|---|
| 1 | `02-buyer-addressee-closed-whole-company.png`, `01-buyer-basket-in-page-1440x900.png` | Bob (StonePharm) with 2 GreenLeaf products in the basket. The GreenLeaf group carries a select reading **"Whole company"** | **T02 AC 1** (FR1/FR2, PRD AC1) | **present, as specified** | The control exists, is on the buyer's side, and defaults to the whole company with no interaction. This is the ticket's whole point |
| 2 | `03-buyer-addressee-expanded.png` | The same control expanded: **Whole company · Carla Klein · Alice Green** — GreenLeaf's two people | **T02 AC 1**, PRD AC1 | **present** | Both GreenLeaf people are offered, and "Whole company" is the preselected first option. ⚠️ **The expansion is a capture aid** — a native `<select>` popup is drawn by the OS and does not appear in a screenshot, so `size` was set on the element for this frame only. The option *list* is real; the *layout* of the open list is not what a user sees |
| 3 | `02-…png`, `01-…png` | The connected group's vertical order: **2 lines → addressee control → "Create a draft deal"** | **T02 AC 4** (placement; the control belongs in the `needsConnection` ELSE branch) | **matches the ticket** | This is the row the unit tests cannot decide. The guard suppresses the control for a stranger wherever it sits, so correct and incorrect placement emit identical markup. **The screenshot is the only evidence.** Read the order top-to-bottom and judge whether the control reads as configuring the button beneath it |
| 4 | `05-stranger-arm-no-addressee-control.png`, `06-stranger-arm-in-page.png` | One drawer, **two groups**: connected GreenLeaf (control + Create button) above, and a seller Bob is **not** connected to below — connect-first copy + "Connect with …" link, **no addressee control** | **T02 AC 4** (PRD AC7) | **unchanged** | Both arms in one frame. Confirm the stranger arm is byte-for-byte the old behaviour and gained nothing. Counted programmatically: **1 addressee control across 2 groups** |
| 5 | `04-option-label-whole-company.png` | The option string, legible at full size | §8.7 wording (was *"Whole company (optional person)"*) | **reads exactly "Whole company"** | Just the words. This is the string T03's e2e will select on |
| 6 | `12-seller-before-company-chosen.png`, `13-seller-company-chosen-addressee-appears.png`, `14-seller-addressee-expanded.png` | Alice's own-company group. `RecipientPicker` still shows **"Select a customer…"**; picking StonePharm makes the addressee select appear reading **"Whole company"**, offering **Bob Stone** | **T02 AC 6** (§8.2), and that the seller door still works | **works; behaviour deliberately changed** | The seller path is unbroken and now has a second control it did not have. Note the sequencing: **no addressee control exists until a company is chosen** (measured: 0 controls before the pick) |
| 7 | `15-seller-zero-people-company-control-shown.png` | The seller picks a customer company with **zero** connected people — the addressee control still renders, offering "Whole company" only | **T02 AC 6** (§8.2 — the ruled-accepted change: this used to be **hidden**) | **the change is real and visible** | This is the deliberate deviation G3 accepted as scope. Muskan is looking at a control that, before this ticket, would not have been on screen at all. **Walked only because a zero-people fixture company was created for it** |
| 8 | `08-zero-connected-people-live-control.png` | The **buyer** side of the same case: a connected seller with zero people still gets a live control ("Whole company") **and an enabled** "Create a draft deal" | **T02 AC 2** (M7 — "never a dead control") | **walkable after all, and it passes** | The brief expected this to be **not walkable locally**, because the seed has no zero-people company. It became walkable by creating one and connecting Bob to it (both rows deleted after). Measured: options `["Whole company"]`, default "Whole company", Create button **not** disabled |
| 9 | `09-buyer-person-chosen-carla.png`, `10-draft-born-lands-in-chat.png` | "Carla Klein" chosen, then "Create a draft deal" clicked. The born card's `metadata.counterparty_person_id` = `33333333-…` = **Carla Klein**; card is `unsent` / `order` | **T02 AC 5** (the pick replaces the hardcoded `null`) | **wired, proven at the DB** | The control is not decorative — the picked person reaches the draft. Verified by SQL against the born row, not by reading the UI back |
| 10 | `07-narrow-900x700.png` | **Fit check** — the drawer inside its real container at a narrow width | container fit / overflow | **fits; no clipping** | Measured at 1440×900: drawer 320×350, sits **484px above** the viewport bottom, addressee select 124px wide, `scrollWidth === clientWidth` (no text clipping). At 900×700: 178px clear of the right edge, 179px clear of the bottom. With two groups the drawer's inner scroller (`max-h-[360px] overflow-y-auto`) does scroll — **the second group's control is reachable only by scrolling**, which is the pre-existing drawer behaviour, not something this ticket introduced |

## Criteria these shots do NOT cover

| Criterion | Why not |
|---|---|
| **T02 AC 3** — "shows *Whole company* immediately and adds people when the fetch resolves" | **cannot-verify visually.** The pre-fetch frame lasts a few milliseconds against a local Supabase; no screenshot can honestly claim to have caught it. The *contract* is in the code (`people` starts `[]`, the `<select>` returns unconditionally) and row 8 proves the empty-people render, but **the transition itself is unwitnessed** |
| **All of T01 (HEL-63)** — the c2c pill, zero inbox tickets, p2p-only routing, the grant | out of scope for this staging pass; T01 is backend-only and was gated on SQL suites |
| **T03 (HEL-65), T04 (HEL-66)** | not built yet |

## Three things worth Muskan's eye that are not verdicts

1. **The option order is not stable between loads.** Two runs of the identical flow produced
   `["Whole company","Alice Green","Carla Klein"]` and `["Whole company","Carla Klein","Alice Green"]`.
   "Whole company" is always first, so **no acceptance criterion is broken** — but a buyer who
   learns the position of a name will be wrong half the time. `getMyConnections()` imposes no
   ordering. **Not filed; offered.**

2. **Choosing a person does not change where the buyer is landed after birth.** In shot 10 the
   draft is addressed to **Carla Klein**, yet `dealChatUrl(relationshipId, dealCardId)` lands Bob
   in the **Company chat (C2C)** with GreenLeaf. That may well be correct — birth is not send, and
   the pill routing is `send_deal`'s job (T01) — but **the first thing the buyer sees after picking
   a person is a company chat**, and no AC says which it should be. Flagging because it is
   exactly the kind of thing G5 discovers late.

3. **The zero-people case became walkable, so the brief's expected gap closed.** It cost one
   throwaway company plus two relationship rows, all deleted. If Muskan wants this walked again
   in future without hand-built fixtures, **the seed has no company with zero people** — that is
   a seed gap, and T03's e2e will hit the same wall.

---

# 🛑 G4 — T02 / HEL-64 · THE SHEET. This gate is Muskan's; nothing below is passed.

The diff renders, so `/build` step 10 makes this a **human stop**. Budgets spent:
`tests 0/2` · `blocking-findings 1/2` · `G4 rounds 1`.

## The gate, in one line

`tsc` **0** · unit **494/494 across 68/68 files** · `eslint` **0** · **`critic` clean after one
fix round** · **`consistency` clean, zero blocking** · **no builder REJECTION outstanding** ·
**15 screenshots staged**, and **the criterion I had written off as unwalkable was walked and
passed**.

## The six acceptance criteria, walked

| AC | what it demands | verdict | evidence |
|---|---|---|---|
| **1** | a connected seller's group renders an addressee control defaulting to the whole company | ✅ | shots 1-2; C1/C4 |
| **2** | **zero connected people → still renders. Never a dead control** | ✅ **walked live** | shot 8 — options `["Whole company"]`, Create button **enabled** |
| **3** | "Whole company" shows immediately; people arrive when the fetch resolves | ⚠️ **contract only** | see ruling 3 |
| **4** | a stranger's group renders the connect-first block and **no** control | ✅ | shot 4 — **both arms in one frame**, 1 control across 2 groups |
| **5** | the chosen person replaces the hardcoded null | ✅ **proven at the DB** | shot 9 — the born card's `counterparty_person_id` **is Carla Klein**. See ruling 1 |
| **6** | the seller's picker shows the control on a person-less company | ✅ **the §8.2 change is visible** | shots 6-7 |

## ⚠️ FOUR RULINGS OWED — none taken by me

**1 — AC 5's wording.** The ticket says *"instead of the hardcoded null at `BasketDrawer.tsx:215`"*.
The literal is **still there** (now `:216`) and was deliberately kept: it is what makes "Whole
company" the effective default and keeps Create enabled. **Deleting it ships a dead Create button
on every buyer group**, contradicting FR2. The behaviour is proven correct (shot 9). **§8.7 set
this slug's precedent that criterion wording is yours and lands in a doc** — so this is a ruling,
not a fix. **Rule the wording, or T04 amends the AC.**

**2 — 🔴 A COVERAGE CLAIM OF MINE THAT DOES NOT HOLD ONE LEVEL UP.** `critic` N1. C7's decoy
proves `peopleForRelationship` keys on `relationshipId` not `companyId` — **inside the selector
only.** Wire `relationshipId={group.sellerCompanyId}` at the **call site** and both are `string`,
`tsc` passes, and **all seven unit cases still go green** while the shipped control's people list
is empty forever — the exact M7 state AC 2 forbids. **My PLAN §5 "declared uncovered" table did
not list this.** It is not unit-coverable under a jsdom-less env. Shot 3 and shot 8 are the only
things standing between that swap and production. **Accept, or ask T03 to assert the wiring.**

**3 — AC 3 cannot be witnessed.** The pre-fetch frame lasts milliseconds against a local
Supabase; no screenshot honestly catches it. What exists: the code contract (`people` starts `[]`,
the `<select>` returns unconditionally) and shot 8, which proves the empty-people render is live
and usable. **Accept that as cover, or send it to T03 with a throttled fetch.**

**4 — the four pre-existing defects, and whether they become tickets.** None was opened by this
diff; all four were left untouched deliberately.

| # | what | size |
|---|---|---|
| N4 | `RecipientPicker`'s own fetch has **no `.catch`, no cancel guard**. On a failed read a **connected** seller is told *"Connect with a company first to send an offer."* — **a false statement** — plus an unhandled rejection. The sibling written in this diff has both guards | **~4 lines** |
| N5 | choosing *"Select a customer…"* never re-reports upward, so the parent **keeps the previous recipient** while the control unmounts. Reachable in one click | small |
| N6 | `BasketDrawer.tsx:216` is a `useState` initialiser on a prop that can change; a group going stranger → connected mid-drawer leaves a dead Create button. **This diff improves it without closing it** | small |
| N8 | 🔴 **the basket and the connections directory disagree about which relationships exist.** The basket filters `deleted_at` only; `getMyConnections` also requires `status = 'active'`. On a **suspended** relationship the control renders with a **permanently empty** people list — **indistinguishable from the legitimate AC 2 case.** Not reachable in the seed, so nothing in this slug will ever show it. **L-038's class** | needs a decision, not a patch |

## Three observations from the walk — offered, not filed

1. **The option order is not stable between loads.** Two identical runs gave
   `[Whole company, Alice, Carla]` and `[Whole company, Carla, Alice]`. "Whole company" is always
   first so **no AC breaks** — but a buyer who learns a name's position is wrong half the time.
   `getMyConnections()` imposes no ordering.
2. **Choosing a person does not change where the buyer lands after birth.** Shot 10: the draft is
   addressed to **Carla**, and Bob is landed in the **company** chat. That may be right — birth is
   not send, and pill routing is T01's job — but **the first thing a buyer sees after picking a
   person is a company conversation**, and no AC says which it should be. *This is the shape of
   thing G5 finds late.*
3. **The seed has no company with zero connected people.** AC 2 was walked only by building one
   and deleting it. **T03's e2e will hit the same wall.**

## Machinery, and one thing bigger than this ticket

- 🔴 **`critic` ran with NO SHELL — the second time on this slug**, though its definition grants
  `Bash`. It declared the limit and substituted line arithmetic rather than hiding it; **I diffed
  the fenced items myself.** Broken machinery, not a checker quirk.
- 📌 **The basket module's `D-xx` decision IDs have no canonical home.** `D-12` currently means
  **four** different things across the corpus. **A citation nobody can look up cannot go stale
  visibly — it just quietly stops being true.** Seventh stale-citation finding on this slug.

## What a green run here is NOT cover for

**AC 3** (the transition), **the call-site wiring** (ruling 2), and **T03's e2e** — the interaction
path, the c2c counting helpers, and `inbox-accept.spec.ts`. Stated in these words because PLAN §5
already got this wrong once by handing AC 2 to a ticket that had no criterion for it.

## ✅ T02 / HEL-64 IS CLOSED — G4 PASSED 2026-08-25 (HUMAN)

**Muskan's ruling: pass, with T04 amending AC 5's wording.** The code is right; the criterion's
wording is stale. That amendment is now **T04's fifth required doc edit**, not a note.

**The four pre-existing side-findings were OFFERED AND DECLINED** — the "file them too" option was
on the table and not taken. **N4** (unguarded fetch → a connected seller told *"Connect with a
company first"*) · **N5** (no re-report on *"Select a customer…"*) · **N6** (the initialiser) ·
**N8** (the suspended-relationship empty list, indistinguishable from the legitimate AC 2 case —
the L-038-class one). **They stay unfiled deliberately and are recorded here so that stays visible.**

Budgets spent: `tests 0/2` · `blocking-findings 1/2` · `G4 rounds 1`.

---

# T03 / HEL-65 — the walk, end to end

## Round 1 — `plan-checker`, on PLAN-T03.md rev 1

**Verdict: REVISE — 6 blocking + 8 notes. ALL FOURTEEN verified true by me against the real
files before folding ([[L-003]]); all fourteen accepted; none argued down.** Plan is at rev 2.

**The plan's headline claim survived.** `plan-checker` traced AC 6 and confirmed it goes red
under the named sabotage: `CounterpartyPersonSelect.tsx:87` → `peopleForRelationship` → `:27`
`find(c => c.relationshipId === id)`, against `getMyConnections`'s
`companies[].relationshipId = rel.id` (`connections.ts:143-154`). A `companyId` matches nothing
→ `?? []` → only `Whole company` renders. It also confirmed Bob can see both GreenLeaf people
(`can_see_person` → `shares_connection_with_company`, `20260609183000:33-39`) and that
`display_name` is unset so `first_name last_name` is the rendered string.

**What did NOT hold was the fixture lifecycle.** Three of my own assertions were false by
construction against the suite that actually runs, and my `afterAll` could not have executed.

### Blocking — all six FOLDED (`blocking-findings` is a build budget; a plan round does not spend it)

| # | finding | verified how |
|---|---|---|
| **B1** | 🔴 **my `afterAll` delete order would have raised `23503` and leaked the fixture into the seed permanently.** `deal_line_item.product_id → product(id)` has **no `ON DELETE`** (`20260607090005:22-24`) and the birth RPC writes that row, so a drafted product cannot be deleted. I copied the order from `discover-shop.spec.ts:713-715`, where the product is never drafted onto a deal. **This is the exact HEL-73 outcome the plan claimed to avoid** | opened the migration — the constraint carries no clause |
| **B2** | 🔴 **`countDealPillsOnThread('c2c') === 1` / `('p2p') === 0` were false before the spec's first line.** One worker, path order: `deal-c2c-create` leaves a card (it resets in `beforeEach` only) whose send now posts a c2c pill; `deal-change` posts a p2p one. Worse — **`resolveDealCardIdForRelationship` is `limit 1` with no `ORDER BY`** (`two-company.ts:228`) and its own docstring claims safety only after a reset, so `countTicketsForCard(cardId) === 0` could pass **against the wrong card** — a false green on the half I called authoritative | read the function; read its docstring `:216-218` |
| **B3** | my cases A and B were "the same state" **and** implied a reset — incompatible. **Merged into one test** | — |
| **B4** | 🔴 **both lens assertions were pure ABSENCE** — [[L-021]]'s class, which I invoked for the pill counts and then not here. `InboxView.tsx:130` renders `LensTabs` **unconditionally, above** the `loading` ternary at `:131`, so the assertion passes on a loading page, a blank page, and a crashed view | opened `InboxView.tsx` — confirmed the render order |
| **B5** | the fixture's `location` was unspecified; **a new value breaks a neighbour.** `discover-shop.spec.ts:170` asserts **exactly 3** `location-option`s and sorts after this file. Pinned to `Toronto Warehouse` | queried the DB: GreenLeaf has exactly `Toronto Warehouse` + `Montreal Warehouse` |
| **B6** | 🔴 **the rewrite deletes the ONLY browser-level cover for a still-live path** — "Pick up deal" / `claim_deal_ticket`. My §5 recorded none of it. Residual cover is `supabase/tests/claim_deal_ticket_test.sql` | grep: `deal-c2c-create.spec.ts:22` is the only e2e mention repo-wide |

### Notes — all eight accepted

**N1** the people list arrives after first paint → an auto-retrying matcher, never a one-shot
`allTextContents()` (flaky-red, and it would burn the `tests 0/2` budget) · **N2** name the pill
selector (`/click to open the deal card/i`, `deal-p2p-send.spec.ts:69`) rather than leave "assert
the body" to the builder · **N3** two stale ranges of mine · **N4** `sendDeal` is `:367` on
`origin/main` and `:369` on HEAD — name the tree · **N5** `pack_size_grams: 100` is not optional
(without it `toDraftLines.ts:28` writes `unit: "unit"`) · **N6** AC 2 has no independent
assertion; it is implied by AC 1 + AC 3, and "the walk never navigates there" is a property of
the script, not a check · **N7** **ADR §4.1 `:307` already recorded the `deal_member` consequence
and its safety analysis, ending with the words "Recorded so it is not re-derived" — and I
re-derived it.** It also names a consequence recorded nowhere: `PeopleTab.tsx` is the only reader
of `deal_member` in `src/`, so a company-addressed deal's People tab now shows the sender alone ·
**N8** my run set named only `inbox-accept.spec.ts`; it now names six specs.

### 🔴 THREE MORE STALE CITATIONS OF MINE — this slug's tally is NINE

| I wrote | truth |
|---|---|
| `countThreadsForPair` at `two-company.ts:532-556` | ends at **`:552`**; `:554-560` is the next docstring |
| `discover-shop.spec.ts:586-594` is "hard-delete in `afterAll`" | it is an **`afterEach`**; the create is `:566-584` |
| `deals/actions.ts:367` for `sendDeal` | `:367` on `origin/main`, **`:369` on HEAD** |

### What `plan-checker` verified as TRUE, so the fold-in did not re-check it

The RED claim (`deal-c2c-create.spec.ts:167-168` times out — real, not hypothetical) · all four
fixture-docstring targets land exactly on the falsified sentences · the [[L-044]] check (the
rewritten case is the file's last and `beforeEach` resets, so no later assertion depends on it) ·
the `2 → 1` `deal_member` drop · the `countThreadsForPair` pre-judgement · trap #4's `exact: true`
reasoning · and `local-supabase.ts:38` resolving the key once at module load.

### 📌 Machinery — `plan-checker` RESOLVED this time

`ROLLUP.md` §C records that `plan-checker` errored `Agent type 'plan-checker' not found` for ten
consecutive tickets on slug 0022 and was worked around with a `general-purpose` substitute. **It
is registered in this session and ran as itself.** Its Tier 1 no longer rests on another agent's
work — recorded because §C's first owed ruling was exactly *"does the tier attach to the ruleset,
or is it inherited?"*, and that question is now moot going forward.

## Round 2 — `test-writer`, and the gate

Three files, no source touched. It **flagged** one edit beyond the plan's literal wording — a
two-line comment in `deal-c2c-create.spec.ts`'s FIRST test repeating the same `deliver_deal`
claim T01 falsified — rather than doing it silently. **Accepted**, and `critic` independently
agreed (N9).

**Gate — exit codes captured from each command DIRECTLY, never through a pipe.** My first
attempt piped into `tail` and returned **empty** exit codes; redone. `tsc` **0** · `eslint` **0**.

**`test-runner` — six e2e specs, all green:**

| spec | result |
|---|---|
| `deal-lands-in-c2c-chat.spec.ts` (new) | 2/2 |
| `deal-c2c-create.spec.ts` (rewritten case) | 5/5 |
| **`inbox-accept.spec.ts` — AC 5, run deliberately** | 2/2, incl. `countThreadsForPair("c2c")===1` |
| `deal-change.spec.ts` | 19/19 substantive + 5 pre-existing skips |
| `chat-phase7.spec.ts` | 4/4 |
| `deal-p2p-send.spec.ts` | 6/6 |

**ADR §4.3 rated the last three SAFE *by reading*. They are now RUN** — a reading converted into
a result, which is what L-013 asks for.

## 🔴 The A/B — this ticket's entire justification, measured rather than argued

Controlled, both arms on the same DB state ([[L-048]]). Source verified **byte-identical to
committed** after revert (`git status` clean, `git diff` empty).

| arm | tsc | basket unit | AC 6 e2e |
|---|---|---|---|
| correct code | 0 | **41/41 across 9 files** | **PASS** |
| `relationshipId={group.sellerCompanyId}` | **0** | **41/41 GREEN** | **FAIL** — `Expected substring: "Alice Green"` / `Received string: "Whole company"` |
| reverted (control) | 0 | — | **PASS** |

The middle row is the finding: **the unit layer cannot see this class at all**, and neither can
the compiler. The failure also shows the matcher retried **14 times** before failing — so
`plan-checker` N1's auto-retrying-matcher fix is doing its job rather than racing the fetch.

**`critic` N1 from T02 is now closed on EVIDENCE, not a ruling** — the same disposition as T02's
AC 2, which also closed by building the thing rather than ruling about it.

## Round 3 — `consistency`: CLEAN, zero blocking

All four judged items are correct reuse, and one is worth keeping:

- **The repo has TWO id conventions, cleanly split by *why* an id is stable.** The relationship
  id is `gen_random_uuid()` per reset and MUST be resolved at runtime (`two-company.ts:60-63`);
  company and pricelist ids are **literal constants in `seed.sql`** and are hardcoded by
  `discover-shop.spec.ts:58` and `:665` — the same literal this spec reuses. **The diff applied
  the right rule to each.** Recorded so nobody later "fixes" it into a false consistency.
- `countDealPillsOnThread` is a genuine sibling of `countConnectionEstablishedLines`, not a
  duplicate — no existing helper counted by message-type AND thread-type together.
- The local basket helper is right to stay local: **this is the FIRST e2e ever to drive the real
  `BasketDrawer`.**
- The lifecycle correctly merges its two nearest precedents, and the one divergence (teardown
  order) is documented in the file with its FK reason.

## Round 4 — `critic`: 2 blocking + 9 notes, ALL verified true by me before folding ([[L-003]])

Fix round 1 → **`blocking-findings 1/2`**. It also confirmed what *does* discriminate: the
empty-state assertions (`EMPTY_HINT.deal_tickets` renders only when the active lens filters to
zero, and the seed plants no `deal_card` inbox row), the pill counts (`RESET_SQL` clears
`type='deal_card'` from every thread, making both counts absolute), and the `cardId`-on-reset
capture that closes `plan-checker` B2's wrong-card hazard.

### Blocking — both FIXED in one round

**B1 — a FIFTH stale claim, and my plan counted four.** `two-company.ts:963-964` still read
*"this is the moment the StonePharm inbox ticket mints"* — **twenty lines below the docstring
this very ticket corrected to say the opposite.** Self-contradictory inside one function.
Now `STALE-CORRECTED` in place.

**B2 — my §5's residual-cover claim was true of the RPC and FALSE of the browser.** §5 said the
claim path's residual cover is `claim_deal_ticket_test.sql`. That covers **the RPC**. The
TypeScript rollout the deleted e2e was the only thing exercising has **nothing, at any level**:
`inbox.ts:265-300` (`acceptItem`'s `deal_card` branch → `acceptInbox` → `store.ts:573`),
`InboxDetail.tsx:78` (the "Pick up deal" label), and `inbox.ts:201`'s `viewerIsReceiver`
derivation. `src/modules/connect/` holds exactly two unit files, neither touching them.
**Corrected in §5.**

### 🔴 N8 — §5 omitted the slug's HEADLINE SEAM, and this is the third instance of one shape

Nothing end-to-end proves **buyer picks a person → the pill lands in the p2p thread.** It exists
as three halves that never meet: AC 6 proves the options render · T01's M3 proves the RPC routes
· T02's G4 proved `metadata.counterparty_person_id` reaches the DB. My §5 named the *seller*-side
call site as uncovered and **missed this one.**

**The COMPANY arm — the defect this slug exists to fix — IS proven end to end.** It is the person
arm that is covered only in pieces. Recorded in §5 as a row with no owner.

That is [[L-050]]'s and [[L-051]]'s shape committed a **third** time, in the document that cites
both. Worth stating plainly rather than filing quietly: the lesson has not transferred by being
written down.

### N6 — a teardown failure leaked PERMANENTLY. Fixed.

Deletes threw immediately, so a failure at the first delete skipped the rest — and
`uq_product_supplier_code_active` (`20260607090004:52-53`) would then make **every future run of
the spec fail in `beforeAll` with 23505** until a human deleted the row. Now: all deletes run,
errors collected, thrown once; plus an **idempotent pre-clean** in `beforeAll`.
`critic` confirmed a *test* failure was always safe (Playwright runs `afterAll` for a group whose
`beforeAll` ran; `resetDealData()`-first genuinely avoids the 23503).

⚠️ **Residual, named rather than hidden:** the pre-clean does not itself call `resetDealData()`,
so if a prior `afterAll` threw *at* `resetDealData()` — before any delete — a leaked product could
still hold `deal_line_item` rows and the pre-clean's product delete would 23503. **It then fails
loudly with a named error**, which is the property that matters; the permanent-silent-block is
gone. Not fixed, because the remaining window is narrow and legible.

### N1-N4 — four more citation drifts. **Slug tally: fourteen.**

Two are mine: the **L-044 misattribution** (my plan cited it for "cite, don't re-derive"; L-044 is
*"inverting a test's setup can gut a later assertion"* — a different lesson that does apply to the
rewrite, just not to that sentence), and **the diff breaking its own cross-file citation** by
rewriting the very block it pointed at (`:152-161` → `:164-169`). Also `InboxView.tsx:130-131` →
`:130`/`:132` (claim true, range wrong), and a comment naming `group.relationshipId` where
`:361` literally reads `counterpartyRelationshipId`.

### N5, N7 — accepted, no change

**N5** — `countDealMembersForCard(cardId) === 1` discriminates nothing *this slug* changed (the
test performs no claim, and `send_deal` skips the insert when `v_cp` is null). Kept as a cheap
guard; **not counted as T01 cover.** **N7** — AC 6's locator is scoped to the drawer, not the
GreenLeaf group; true today (Bob has one relationship) and the `Group` div has no role or testid
to scope to. `critic` itself rated it a note.

## Re-run after the fix round — the teardown change is behavioural, so the earlier green does not carry

`tsc` **0** · `eslint` **0** · **7/7 e2e** (`deal-c2c-create` 5 + `deal-lands-in-c2c-chat` 2) in 20.6s.

**The seed is exactly as found — measured, not asserted** (the HEL-73 property):

| check | before | after |
|---|---|---|
| `T03-TMP` rows | 0 | **0** |
| GreenLeaf products | 6 | **6** |
| `AUR-1A`..`1F` `profile_visible`/`price_public` | t/f · t/t · f/t · f/f · t/t · t/f | **identical** |
| distinct GreenLeaf locations | 2 | **2** (so `discover-shop.spec.ts:170`'s count-of-3 holds) |

## G4 — T03 / HEL-65. Routing: **AUTO**, and why

`/build` step 10 routes the gate by the diff. **This diff is test-only** — three files under
`e2e/`, no source, no migration, no component. **Nothing renders**, so step 9's
`visual-verifier` does not fire and there is no visual staging table to hand over.

**All three carve-outs checked, none live:**

| carve-out | status |
|---|---|
| a `builder` REJECTION outstanding | **no** — no builder ran (test-only). `test-writer` raised one scope item; I accepted it and `critic` endorsed it (N9) |
| `security` raised a blocking finding | **no** — `security` was not routed, and correctly: the diff touches no migration, RLS, RPC, auth, server action, or cross-company read. The tests *exercise* cross-company reads; they do not change them |
| behaviour changed that the criteria do not cover | **no** — the diff changes **no behaviour at all** |

**Closed as `G4 auto`.** Budgets: `tests 0/2` · `blocking-findings 1/2` · `G4 rounds 1`.

### The six criteria, replayed on real data

| AC | demand | verdict | evidence |
|---|---|---|---|
| **1** | the pill appears in the seller's c2c conversation and the deal opens from it | ✅ | `deal-lands-in-c2c-chat` test 2 — pill found by `/click to open the deal card/i`, body asserted **`Bob Stone has sent a deal`** (the field `send_deal:222-229` writes), clicked, card panel opened |
| **2** | reachable **without** visiting `/connect/inbox` | ✅ **implied, and stated as such** | not separately asserted — established by the pair AC 1 (reachable from chat) + AC 3 (absent from the lens). rev 1 claimed "the walk never navigates there", which is a property of the script, not a check |
| **3** | the Deal-tickets lens shows **no NEW entry** | ✅ | `countTicketsForCard(cardId) === 0` (card-scoped, so pre-existing tickets may survive) · `countDealPillsOnThread('c2c') === 1`, `('p2p') === 0` · the lens's **positive** empty-state string after load, then absence |
| **4** | `deal-c2c-create.spec.ts:141-191` **reversed and rewritten, not deleted** | ✅ | the case survives with its premise inverted; **it was genuinely red before** (measured at `/build` §1, not predicted) and is green now |
| **5** | `inbox-accept.spec.ts` **run deliberately and judged** | ✅ | 2/2, incl. `:157-158`'s `countThreadsForPair("c2c")===1`. **Pre-judged and confirmed:** that helper already filters `t.deleted_at is null`, no other c2c counter exists repo-wide, and the spec never calls `send_deal`, so T01's heal path cannot fire in it |
| **6** | the **call-site wiring** is asserted, not just the selector | ✅ **proven by A/B** | red under the swap while tsc **0** and units **41/41 green**; green reverted |

### Owed to Muskan — NOT blocking this ticket, but on the table

1. **T02's G4 ruling 3 was never recorded, and I did not adopt it silently.** It offered *"accept
   the code contract as cover for AC 3, or send it to T03 with a throttled fetch."* The gate log
   carries rulings 1 and 4 only. A throttled-fetch test needs network interception this repo has
   never used. **Still open.**
2. **`TICKETS.md`'s T03 AC list is stale by one row** — AC 6 exists by ruling and is not written
   there. Booked as **T04/HEL-66's SIXTH doc edit**.
3. **The claim rollout is now uncovered at every level** (B2) — RPC covered, browser not.
4. **The person arm has no end-to-end proof** (N8). The company arm does.
5. **OFFER — `e2e/present-basket.spec.ts` is dead scaffolding.** Verified: **3 `test.fixme`, 0
   live tests**, asserting `basket-panel`/`basket-line` while the shipped `BasketDrawer.tsx` has
   **zero** `data-testid` attributes. Pre-existing, not opened here. File or delete?
6. **MACHINERY — `rtk` rewrote a PLAYWRIGHT invocation** and collapsed it to `PASS (2) FAIL (0)`.
   CLAUDE.md records this trap for **vitest only; it hits Playwright too.** A collapsed reporter
   can hide a spec that never ran.
7. **`deal-change.spec.ts` has a load-correlated flake** in the shared `openTwoContexts`/`loginAs`
   fixture — `beforeEach` timeout, 4 of 5 attempts, **a different test position each run**, every
   affected test passing in isolation. **Distinct from the known `sb_secret_` baseline**; not this
   diff (that path is untouched). All 19 confirmed by targeted re-runs, not written off.

---

# T04 / HEL-66 — record the decision where the next person will look

## Round 1 — `plan-checker`: REVISE, 5 blocking + 7 notes. **The truth table survived; COVERAGE failed.**

It re-derived all five truth-table rows from the files — **every replacement range exact**. What
failed is that I measured five citations and walked past **three more defect sites inside my own
declared files**, plus ten this slug broke itself. **Eight edits became twelve.**

| # | finding |
|---|---|
| **B1** | I planned a **DELETION** where §8.9 ruled a **REWRITE** (ADR `:607-608`: the row *becomes* "the send creates it; the deal still lands"). I took scope from `TICKETS.md`'s **pre-ruling** prose — [[L-039]] pointed at myself |
| **B2** | 🔴 **`PRD:52` said "Verified safe"** about `deal_detected`, citing `20260614121000:12`. **This slug's own ADR §7.4 had already established that line is a CODE COMMENT, not a gate.** The hole is live and is HEL-67 — an approved spec asserting safety about a ticketed vulnerability |
| **B3** | two more wrong PRD citations — `inbox_select` is `:243-244` not `:79-86`; the company-thread policy is `thread_all` `:293-298`, while `:231-232` is `person_group_all` |
| **B4** | 🔴 **this slug's own T01/T02 diffs falsified ~10 ADR citations**, and T04 was about to ship an ADR advertising corrected citations while carrying ten it broke |
| **B5** | 🔴 my edit 2 **did not satisfy the ticket's own AC 2**, and the obvious fix was worse: inserting above `DECISIONS.md:1013` moves it, breaking five citations at once |

### The useful output of B4 — a distinction, not a sweep

Now a banner in the ADR: **an ADR is a decision record, not a maintained index.** Design-time
citations (§2/§3/§6/§8) are **frozen at rev 3** — re-pointing them as code moves falsifies the
record of what was known when the decision was made. **§4.1 and the J-invariants are NOT
design-time**: they assert what the system does *now*, a reader acts on them, so they are
**maintained**. Third rule cutting across both: anything **false in SUBSTANCE**, not merely
drifted, is corrected regardless.

## Round 2 — `critic` on the built diff: 2 blocking + 10 notes. Both blocking verified before fixing.

### 🔴 B2 — I protected the line I was warned about and broke every line beneath it

`plan-checker` B5 told me `DECISIONS.md:1013` must not move; I placed the marker **below** it,
correctly — and the **10-line insert shifted everything under it by ten.** `D-12` went `:1219` →
`:1229`, and **three live citations broke**: `ARCHITECTURE-NOTES.md:765`, `STATE.md:443`, and
`REVIEW.md:371` — the last two being **this slug's own finding that "`D-12` means four different
things", one of whose four citations the fix falsified.**

**Fixed with `critic`'s remedy: a zero-line-cost marker appended to the `:1013` bullet itself.**
`D-12` is back at `:1219`; `:1013` unmoved. **The lesson is not "insert below" — it is that any
insert into a cited file is a write to every line number beneath it.**

### 🔴 B1 — and then the correction itself went stale, twice, inside one ticket

The marker's own citation of the ADR's §8.5 reference was `:563` (blank). Corrected to `:598` —
which my J1/N2/N3 edits then pushed to **`:604`** *in the same ticket*. **It now cites the SECTION
(§8.5), not a line.** A line number into a file you are concurrently editing is not a citation.

### N1-N4 — the banner's principle was applied to the frozen half and not the maintained half

Four live stale citations **inside the buckets the banner declares maintained**: §4.1's
`actions.ts:367`→`:369` · §4.1's docstring row, still saying it "becomes false" when **T01 already
rewrote it** (the twin in §8.3 *was* corrected — the frozen half got the treatment the maintained
half needed) · **J6**, still saying "if §8.7 is taken" when it was taken and built · **J7**'s
`ADR-0003:30`→`:32`. All four fixed.

### N5-N7, N9 — accepted and fixed

`TICKETS.md`'s own T02 AC 4 citation, two lines above the AC this ticket amended · **T04's criteria
covered 3 of its 12 edits**, so a G4 walk would have replayed a quarter of the ticket — a fourth
criterion now enumerates the other nine and names that **this ticket grew by ruling five times
after its cut** · the PRD's AC2 note implied the pill text changed, when the expression is
**byte-identical** to the superseded migration and only the PRD's paraphrase was wrong · and the
sweep's *"zero live stale citations remain"* narrowed to what it actually queried — **a sweep's
claim is only as wide as its query.**

### N8, N10 — recorded, NOT fixed

`20260823090000:297` cites `rls_policies:233` for `inbox_insert` (truth `:245-246`), and
`STATE.md:92`'s `Locked` list still carries `:162-183`. **Both outside T04's declared file set** —
widening scope at a checker's note is how a docs ticket becomes unbounded.

## G4 — T04 / HEL-66. Routing: **AUTO**

Docs-only; nothing renders, no code, no migration, no test. All three carve-outs checked and none
live (no builder REJECTION — no builder ran; `security` not routed and correctly so; no behaviour
changed). Budgets: `tests 0/2` · `blocking-findings 1/2` · `G4 rounds 1`.

**The gate is the re-grep, and `tsc`/`eslint` were deliberately NOT run** — there is no code in
this diff and running them for the appearance of a gate would be theatre.

| criterion | verdict | evidence |
|---|---|---|
| **1** CONTEXT.md says "a chat", not "a P2P chat" | ✅ | `:31`, with the §8.4 reason inline |
| **2** a dated entry at `DECISIONS.md:1013` records the **partial** supersede + the ADR-0003 correction | ✅ | in-place marker on `:1013` itself (zero lines added) + the chronological tail entry |
| **3** the PRD's edge-case row and ACs match the built behaviour | ✅ | `:131` rewritten to the **ruled text verbatim**; AC1 §8.7 wording; AC2's citation and formula |
| **4** *(added by `critic` N6)* the other nine edits | ✅ | J1 · §4.1 · `PRD:52` · `PRD:117-121` · the banner · J6/J7 · T02 AC 5 · T03 AC 6 · this ticket's own Files list |

**Every corrected citation re-opened and confirmed after the fix round:** `actions.ts:369` ·
`:357-368` · `ADR-0003:32` · `CounterpartyPersonSelect.tsx:108` · `BasketDrawer.tsx:321`/`:329` ·
and `DECISIONS.md` `:1013`/`:1219` line integrity restored.

### Correction owed to a ticket this slug FILED

**HEL-74's stated exploit is dead.** It was filed from T01's G4 (`security` N1): *soft-delete the
relationship by direct write, then Send an old draft onto it.* The parallel session verified on
production that **`relationship` is SELECT-only for `authenticated`** and no `public` function
updates or deletes it — so that path is unreachable. **The gap is not dead:** `send_deal` still
never checks the relationship is live, which is harmless only because of the current grant surface,
**and it re-arms silently the day a disconnect feature exists.** Agreed with that session that the
ticket is **corrected, not closed**. Separately: **"there is currently no way to disconnect at
all" is a product gap, bigger than HEL-74, and unowned.**
