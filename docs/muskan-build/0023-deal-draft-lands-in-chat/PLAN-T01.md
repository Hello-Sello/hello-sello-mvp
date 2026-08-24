# PLAN — T01 (HEL-63) · `send_deal` announces a company-addressed deal in the company chat

Slug `0023-deal-draft-lands-in-chat` · lane FULL · branch `claude/muskan/work`
Source of truth: ADR 0006 rev 3 (accepted G3, 2026-08-25) §2, §3, §5, §6.
Budgets this round: `tests 0/2`, `blocking-findings 0/2`, `G4 rounds 1`.

**Revision 2** — `plan-checker` returned **REVISE**: 3 blocking + 6 notes. **All nine verified
true against the real files before folding (L-003)**, and all nine accepted — none were
argued down. The three blocking ones were about what the tests *prove*, not about what the
plan says about the code:
1. **AC 9 (M8) had no home** anywhere in the plan → now C9 + a repo-level check.
2. **Case ordering would have gutted C6/C7**, the two cases this plan calls the ones that
   matter → C4/C5 moved last, and C6/C7 pinned with `deleted_at is null`.
3. **Two suites that execute the rewritten body were not being run** → step 6 now runs five
   runners, not three.
The checker also verified clean: the ADR §3 fence, the `STATE.md` Deferred list, the
agent split, C4's mechanics, and C6/C7's expected RLS outcomes.

---

## 0 · The mandated first step — DONE, and the ADR's table was incomplete

ADR §4.3 orders the affected-suite list regenerated **by grep**, not copied. Run:

```
grep -rln "send_deal\|deliver_deal\|pending_inbox_item\|chat_message\|chat_thread" \
     supabase/tests/ e2e/
```

⚠️ **`chat_thread` was added to the grep after `plan-checker` finding 4.** The ticket's
mandated term list omitted it — and `chat_thread` is the one table this migration **newly
writes** (ADR §9: *"a thread-create arrives"*). Omitting it reproduced the exact method
defect ADR §4.3 says was the defect twice.

**21 SQL files + 6 e2e files.** ADR §4.3 listed 12. The 11 SQL suites it omitted are all
**SAFE** — verified by opening each, not by name (L-009):

| omitted suite | why safe |
|---|---|
| `accept_person_connection_test` `:48,:93` | `connect_person` inbox rows + a p2p thread count on the person-connection path. No `send_deal`, no `deliver_deal` |
| `basket_admission_test` `:320` | reads `pending_inbox_item` as connection evidence |
| `chat_message_type_pills_seed_test` `:23` | asserts lookup rows exist; no message rows |
| `connection_consent_lockdown_test` | `connect_company`/`connect_person` forgery cases only |
| `connection_visibility_override_test` `:475` | pending connect request as visibility evidence |
| `discoverable_shop_spec_columns_test` `:423` | a comment |
| `inbox_person_rls_test`, `inbox_person_target_test` | `connect_person` target columns |
| `list_discoverable_people_test`, `list_incoming_person_requests_test` | `connect_person` fixtures |
| `seed_visibility_matrix_test` `:232` | joins the inbox for connect-request state |

**Two more found by the widened grep — both SAFE, both opened myself:**

| suite | why safe |
|---|---|
| `p2p_companyless_dedup_test` `:37-51` | inserts into `chat_thread` **directly**; never calls `send_deal`. It pins `uq_chat_thread_p2p`'s behaviour when `relationship_id IS NULL` — **the very index §8.11's `on conflict` relies on**, so it is a friend of this change, not a casualty |
| `list_my_person_connections_test` `:53-54` | a p2p fixture insert |

**Nothing changes the ADR's three BREAKS-BY-DESIGN verdicts.** The omissions were all
inert. Table reconciled over **five** grep terms, not four.

**Runner census (L-013).** 41 runners / 46 suites. Six suites have no runner and can
never go red: `announcement_projection`, `auth_gate`, `change_reason_log`,
`onboard_company_categories`, `pending_change_lock`, `rls_isolation`. Two of those
(`announcement_projection`, `rls_isolation`) are in this slug's blast radius — rating
them SAFE is right; **counting them as cover is not.** T01's new suite ships **with** its
runner, in the same commit.

**Third-caller check (L-041, shape not spelling).** `grep -rn deliver_deal
supabase/migrations/` returns 7 files. Only **two** are live `perform` calls:
`send_deal.sql:107` (deleted here) and `confirm_detected_deal…:176` (untouched).
`create_deal_draft_delivers.sql:179` was superseded by
`create_deal_draft_private_birth.sql:23`. `20260823090000:301` is a **comment** inside
`inbox_insert`'s rationale — it says *"the only function inserting here is `deliver_deal`"*,
which **stays true** (we remove a caller, not the function). ADR §7.1 confirmed.

---

## 1 · Files

| file | action |
|---|---|
| `supabase/migrations/20260825090000_send_deal_c2c_announce.sql` | **new** |
| `supabase/tests/send_deal_c2c_announce_test.sql` | **new** |
| `supabase/tests/run_send_deal_c2c_announce_test.sh` | **new** |
| `supabase/tests/deliver_deal_test.sql` | rewrite cases (1b) + (2a) |
| `supabase/tests/claim_deal_ticket_test.sql` | rewrite the fixture at `:79-100` |
| `src/modules/deals/actions.ts` `:357-366` | docstring only, no code |

**Stamp.** Local tip and production tip are **both `20260824100000`** (verified: last local
file; ADR §4.2 verified cloud via `list_migrations`). `20260825090000` sorts after both →
**plain `supabase db push`, NOT `--include-all`** (L-034's trap does not apply here).

**Out of scope, per ADR §3's fence:** `deliver_deal`'s body · `confirm_detected_deal…:176` ·
any RLS / grant / schema change · the frontend (T02) · e2e (T03) · docs (T04).

---

## 2 · The migration — `create or replace`, three changes and nothing else

### 2.1 Header comment — rewritten, NOT copied forward

ADR §6.4: `20260724120300:14-17` and `:83-85` justify the co-owner insert's **position** as
*"BEFORE `deliver_deal` reads its routing key."* With `:107` deleted that reason is
**vacuous**. Copying the old header forward ships a rationale for a call that no longer
exists — the same stale-citation class as the `actions.ts` docstring. The insert still
belongs before the status flip; **the reason changes** to: the flip is the moment the
counterparty's RLS starts seeing the card, so co-ownership must precede it.

### 2.2 Body — the diff, exactly

1. **DELETE `perform public.deliver_deal(v_card.id);`** (old `:107`) and its comment
   `:105-106`. Deleted, not guarded (ADR §2.1).
2. **The `if v_cp is not null` block at `:111-141` becomes an `if/else` that computes
   `v_thread` ONLY.** ADR §2 rev-3 ruling: *hoisted is the decision.*
   - `v_cp not null` → p2p, canonical pair `v_a < v_b`, **resolve-or-create with
     `on conflict do nothing` + re-select** (§8.11 — this is the p2p race fix; today
     `:118-130` is a bare select-then-insert).
   - `v_cp null` → c2c, keyed on `relationship_id`, `type = 'c2c'`, `deleted_at is null`,
     same `on conflict` shape.
3. **The name lookup and the single `chat_message` insert move BELOW the branch**, outside
   it, written exactly once (J2). Body, sender, type, metadata all unchanged from `:136-140`.

**The `on conflict` idiom is copied from `20260823090000:162-183`, comment included** — not
re-spelled (ADR §2). Shape:

```sql
select id into v_thread
  from public.chat_thread
 where <keys> and deleted_at is null;

if v_thread is null then
  insert into public.chat_thread (<cols>) values (<vals>)
  on conflict do nothing
  returning id into v_thread;

  -- Lost the race: a concurrent send on ANOTHER card of the same relationship
  -- minted the thread between the SELECT and the INSERT. The card lock at the
  -- top of this function does NOT serialise that. Adopt the winner rather than
  -- surfacing a raw 23505.
  if v_thread is null then
    select id into v_thread from public.chat_thread where <keys> and deleted_at is null;
  end if;
end if;
```

Bare `on conflict do nothing` (no target) is deliberate: `uq_chat_thread_c2c` and
`uq_chat_thread_p2p` are **partial** indexes (`20260607090003:139-143`), and an untargeted
`do nothing` covers any unique violation without naming a partial index in an inference
clause.

### 2.3 What must survive verbatim

Guards `:62-78` (authenticated · card exists · `status='unsent'` · caller company =
`initiating_company_id`) — **M6 / AC7 / AC8 rest on these.**
The co-owner insert `:86-98`. The flip `:101-103`. The log line `:144-146`.
`return v_thread` `:148` — now non-null for company deals too (§8.3: return it, **do not
wire navigation**).

### 2.4 The grant — re-emitted unconditionally

`grant execute on function public.send_deal(uuid) to authenticated;`

Separate statement at old `:152`, **not part of the function body**. This is `create or
replace`, so it is preserved anyway — the re-emit is belt-and-braces against a future
`drop`+`create` (B7: the failure mode is total, Send dies for every user). **M11 asserts it.**

---

## 3 · The new suite — `send_deal_c2c_announce_test.sql`

Fixture: **Alice (GreenLeaf) → Bob (StonePharm)**, the seeded `demo-2d` relationship, which
has a seeded c2c thread (`seed/seed.sql:321`) and a seeded p2p thread (`:324`). Third party
for M10: **Clara (Rheinland)** — connected to GreenLeaf (`:349`) but a stranger to the
GreenLeaf↔StonePharm card. Pattern copied from `deliver_deal_test.sql:1-96`.

⚠️ **`seed.sql:321` is now a fixture dependency this ADR created** (M4 in §4.3). The suite
header states it, so the next person editing the seed sees why the row matters (L-033).

| # | case | invariant | assertion |
|---|---|---|---|
| 1 | **C1** | **M1** | company-addressed send → exactly **1** `chat_message`, `type='deal_card'`, in the **live** c2c thread of the card's `relationship_id`, `sender_person_id = alice`, body = Alice's name + `' has sent a deal'`, `metadata->>'deal_card_id'` = the card |
| 2 | **C2** | **M2** | same send → **0** `pending_inbox_item` rows for that card |
| 3 | **C3** | **M3** | person-addressed send (`counterparty_person_id = bob`) → **1** pill in the **p2p** thread, **0** new rows in the c2c thread |
| 4 | **C6** | **M9** | `SET LOCAL ROLE authenticated` **as Bob** → C1's pill is SELECT-able, and `deal_card` + `deal_line_item` for its `deal_card_id` are SELECT-able |
| 5 | **C7** | **M10** | the same three reads **as Clara (Rheinland)** → **0** rows each |
| 6 | **C8** | **M11** | `has_function_privilege('authenticated','public.send_deal(uuid)','EXECUTE')` is true |
| 7 | **C9** | **M8** | `pg_get_functiondef('public.deliver_deal(uuid)'::regprocedure)` still contains its `pending_inbox_item` insert **and** its `if not exists` dedupe guard |
| 8 | **C4** | **M4′ (a)** | soft-delete the live c2c thread (`deleted_at = now()`), send → a **new** c2c thread exists and carries the pill |
| 9 | **C5** | **M4′ (b)** | send a **second** company-addressed card → still exactly **1** thread with `deleted_at is null`, and **2** pills **in that live thread** |

### ⚠️ The order in that table is load-bearing — `plan-checker` finding 2

**C4/C5 run LAST, after C6/C7.** The first draft ran them at positions 4-5, and that would
have quietly gutted the two cases this plan itself calls the ones that matter.

`can_access_thread` (`20260607170000:117-132`) has **no `deleted_at` predicate** — its c2c
branch is bare `is_relationship_member(t.relationship_id)` — and `msg_all` (`:288-290`)
gates on nothing else. **So a message in a soft-deleted thread still passes RLS.** Had C4
soft-deleted the thread before C6 ran, C6 would have proved the recipient can read a pill in
a conversation the app never shows (`store.ts:363` filters `deleted_at is null`) — and gone
green doing it. M9 *is* the slug; asserting it against a dead thread asserts nothing.

Belt and braces, because ordering alone is a fact about the file that a later edit can undo
(L-044's exact class): **C6/C7 resolve their thread with an explicit `deleted_at is null`
filter and select the pill by C1's captured `chat_message.id`.** Ordering plus pinning, not
either alone.

**C5's count is scoped, and the scope is stated** (finding 5). After C4 there are two c2c
threads on the relationship: the dead one holding C1's pill, and the live one holding C4's.
`2` is the count **in the live thread**; scoped to the relationship it is 3. The assertion
names `deleted_at is null` in its own predicate.

### Fixtures — one fresh card per sending case (finding 7)

`send_deal:73-75` refuses any card whose status is not `unsent`, so **C1, C3, C4 and C5 each
need their own freshly born card.** They are born with `create_deal_draft` as Alice, the
shape at `claim_deal_ticket_test.sql:188-191`. C3's carries
`counterparty_person_id = bob`; the rest carry null.

Temp fixtures follow `deliver_deal_test.sql:52-54` — **`GRANT SELECT ON _fix, _rel TO
authenticated`** (plus `SELECT, INSERT` on any table a definer-less case writes). Without
those grants C6/C7 fail at the fixture read rather than at the assertion, and the failure
reads like a policy bug (finding 8).

**Identity switching (L-019).** Each switch is `set_config('request.jwt.claim.sub', …)` +
`set_config('request.jwt.claims', …)` + `SET LOCAL ROLE authenticated`, and **every block
ends `RESET ROLE` before the next `set_config`** — the shape at
`deliver_deal_test.sql:100-105,:150-153`. Without the reset the next privileged step runs as
the wrong role and the failure reads as a permissions bug.

### ⚠️ What this suite does NOT cover — stated, not papered over (finding 6)

**§8.11's `on conflict do nothing` + re-select path is NOT exercised by any case here.** It
is reachable only when a *concurrent session* inserts between the SELECT and the INSERT;
C4/C5 both go through the SELECT branch and never attempt the INSERT. ADR §5 claims M4′
"covers the `on conflict` path" — **it does not.**

Two honest options, and this plan takes the second:
- a two-session proof (two `psql` connections, an advisory lock, interleaved) — real cover,
  but a new harness shape this repo has nowhere else;
- **declare it review-only and hand it to `critic` explicitly**, which is what §6 step 7
  does. The code is four lines copied from a shipped precedent
  (`20260823090000:162-183`); the risk is a mis-transcription, which reading catches.

**This is a deliberate gap with a named owner, not an oversight.** Recording it because
"M4′ covers it" was already written into an accepted ADR and is false — a silent cap is
what makes a green suite read as complete cover.

**Runner** `run_send_deal_c2c_announce_test.sh` — copied verbatim from
`run_deliver_deal_test.sh` (host-psql branch with `-f -` on stdin, docker fallback), only
`TEST_FILE` changed. The stdin form is load-bearing on this machine: `psql` is a shim that
execs inside the container, where a host-relative path does not exist.

---

### AC → case map (finding 1: AC 9 had no home)

| ticket AC | invariant | proved by |
|---|---|---|
| 1 | M1 | C1 |
| 2 | M2 | C2 |
| 3 | M3 | C3 |
| 4 | M4′ | C4 + C5 |
| 5 | M9 | C6 |
| 6 | M10 | C7 |
| 7 | M11 | C8 |
| 8 | — | §4.1's rewritten `deliver_deal_test` (2a), double call |
| 9 | M8 | **C9 + the repo check below** |

**AC 9 was homeless in the first draft.** It is trivially true — no file in §1 touches
`20260720095000_deliver_deal.sql` — but *"trivially true"* is not evidence, and `/build`
step 10 has to replay every AC into REVIEW.md. Two cheap proofs, because they fail
differently:

- **repo level** — `git diff --name-only <base>..HEAD -- supabase/migrations/` must not list
  `20260720095000_deliver_deal.sql`, **and** `grep -l "function public.deliver_deal"
  supabase/migrations/2026082*.sql` must return nothing. This catches a *new* migration
  redefining the function, which a diff of the old file cannot see.
- **runtime — C9** — `pg_get_functiondef` still shows the insert and the `if not exists`
  guard after `db reset`. This catches the case where the definition changed by some route
  the file check missed.

## 4 · The two deliberate breaks

### 4.1 `deliver_deal_test.sql` — case (1b) inverts, and (2a) MUST be repaired with it

**(1b) `:107-128`** — after `send_deal` on the c2c card, assert **0** tickets (was 1) and
**1** c2c pill. The `status='negotiation'` assertion `:123-127` is untouched.

**(2a) `:130-144` — the L-044 trap, and it is live here.** Today (2a) is an idempotency
proof *only because (1b)'s `send_deal` already wrote the ticket*: the `:134` call is the
**second** insert. Once (1b) asserts zero, `:134` becomes the **first** insert, `v_n = 1`
passes trivially, and `deliver_deal`'s `if not exists` guard (`20260720095000:51-56`) is
left **uncovered anywhere in the repo** — a green test proving nothing, protecting a
function whose only behavioural guarantee (M8) would then be untested.

**Fix: call `deliver_deal` TWICE** (privileged, `RESET ROLE`) and assert **1** ticket after
the second. ADR §6.1.

**(2c / WR-01) `:146-160` is preserved verbatim** — invariant M5, `authenticated` may not
EXECUTE `deliver_deal`. Verified real: `20260724121000:30` revokes it from
`public, authenticated, anon`, overriding the original grant at `20260720095000:59`. The
guard's reason was checked, not assumed (L-026).

### 4.2 `claim_deal_ticket_test.sql` — the fixture loses its producer

`:83`'s `send_deal` (company-target) stops manufacturing a ticket, so `:86-100`'s
"expected exactly 1 claimable ticket" goes red. **Replace the producer, keep every claim
assertion:** insert the `pending_inbox_item` **directly** (privileged, mirroring
`deliver_deal:53-55` — `type='deal_card'`, `sender_person_id=alice`,
`sender_company_id=greenleaf`, `receiver_company_id=stonepharm`, `deal_card_id`,
`status='pending'`). The claim gate is what this file tests; its producer is not.

`:70-77`'s "birth writes no ticket" assertion **stays** — still true.
⚠️ **`:193`'s `send_deal` is the PERSON-target call and is untouched** (ADR §6.2). A rewrite
that reads only `:83` misjudges the file. Its A3-4 case asserts a ticketless deal is not
claimable — still true, and now true by a second route.

Header comment updated: the file's own `:13-15` says *"the fixture births, proves the
ticket is absent, then SENDS … and proves the ticket appears."* That sentence becomes false
and must be rewritten, not left (the §6.4 class).

---

## 5 · `actions.ts` — docstring only

`:357-366` documents the RPC as doing *"deliver_deal's company-ticket half"* (false after
this migration) and claims the return exists *"so the host can navigate to the
conversation"* — no host does; `DecisionBar.tsx:161` discards it (ADR §8.3). Rewrite both
sentences. **No signature change**: `Promise<{ threadId: string | null }>` is already
nullable; the company arm returning a real id instead of `null` is inert at every caller.

---

## 6 · Runnable order

1. Regenerate the affected-suite table by grep · runner census · third-caller check — **done, §0.**
2. ~~Sync ritual~~ — **already discharged** (`c60ba69`, pushed alone before planning).
3. `test-writer` → `send_deal_c2c_announce_test.sql` + its runner + the two rewrites. **Test files only.**
4. Orchestrator verifies **RED** by running the runners (L-023: `test-writer` cannot run anything; the RED proof is mine).
5. `builder` → the migration + the `actions.ts` docstring. **Source only — never a file under `supabase/tests/**`** (L-035).
6. `supabase db reset` → `test-runner`, running **FIVE** SQL runners, then `npm run test:unit` + `tsc`:
   - `run_send_deal_c2c_announce_test.sh` (new)
   - `run_deliver_deal_test.sh`, `run_claim_deal_ticket_test.sh` (the two rewrites)
   - **`run_decline_deal_test.sh`, `run_update_deal_draft_test.sh`** — added after
     `plan-checker` finding 3. `decline_deal_test.sql:110,:143` and
     `update_deal_draft_test.sql:145` both `PERFORM public.send_deal(...)`, so they are the
     only other suites that **execute the rewritten body**. Their SAFE rating is a *reading*;
     both runners exist, so it costs two commands to make it a *result*. This repo's standing
     record is four consecutive divergences that reading missed.
7. `critic` + `security` (migration · RPC · SECURITY DEFINER · cross-company reads).
8. No render in this diff → **no `visual-verifier`, and G4 is `auto`** unless a carve-out fires.

---

## 7 · G4 routing — decided up front, not at step 10

T01's diff is **SQL + one docstring**. Nothing renders. Per `/build` step 10 the ticket
closes on green tests + `critic` + `security`, with the acceptance criteria replayed on
real data and appended to REVIEW.md — **no human stop.**

**It escalates to Muskan anyway if any of these fire (not optional):**
- a `builder` REJECTION is outstanding;
- `security` raises a **blocking** finding;
- the ticket changes behaviour its written criteria do not cover.

⚠️ **The slug's G4 is still a human stop** — T02 renders. This is T01's gate only.

---

## 8 · Known risks, stated before the build

1. **ADR rev 3 was never seen by a fresh checker** (the loop closed non-converged at its
   2-round budget, by Muskan's ruling). `critic` + `security` are the carriers, against
   real code rather than prose. Step 7 is not a formality on this ticket.
2. **This is the 9th consecutive ticket-or-ADR** whose round 2 found defects inside round
   1's own fixes. The `blocking-findings 2/2` budget was set assuming convergence.
3. **A new `chat_thread` INSERT is genuinely new** (ADR §4.2 B3). A send racing an accept
   can surface a raw `23505` in the **accept** flow, whose browser insert
   (`store.ts:624-634`) is bare with `if (tErr) throw tErr`. Accepted cost of §8.9(a);
   closing it properly is HEL-68's slug.
4. **A c2c thread healed by `send_deal` permanently loses its `connection_established`
   seed line** — a later accept retry sees the thread present and skips both
   (`store.ts:620-622`). Counted by `e2e/inbox-accept.spec.ts:125`. Booked in ADR §9;
   T03 judges that spec deliberately.
5. **`deliver_deal` and `claim_deal_ticket` become dormant** with one dormant producer
   (Sella). They will read as dead code. §7.2/J4 is why they are not dropped.
