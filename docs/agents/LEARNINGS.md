# Pipeline learnings — the self-correction log

**What this is:** one entry per mistake *I* made running the pipeline, written as a rule I
can apply next time. Not a diary and not a changelog — if an entry doesn't change a future
decision, it doesn't belong here.

**Read this when:** starting any `/spec`, `/design`, `/build` or `/ship` run. Scan the
**Trigger** lines only; open the entry when one matches what you're about to do.

**Write here when:** a checker, a test, or Muskan catches something I authored or asserted.
The entry is written at the moment of the catch, not at wrap — by then the root cause has
been rationalised away.

**Entry rule:** *Why it was wrong* must name the reasoning error, not restate the mistake.
"I used the wrong agent" is a restatement. "I treated a similar name as satisfying an
instruction that named a ruleset" is a root cause.

---

## L-001 · A named agent that doesn't resolve is a blocker, not a gap to fill

**2026-08-19 · slug 0022 · `/build` step 3 · caught by Muskan, mid-run**

**Trigger** — a skill names a specific agent / script / skill / MCP server, and it isn't in
the available list, but something *similar* is.

**What I did** — `/build` step 3 says spawn `plan-checker`. It wasn't registered. I saw
`gsd-plan-checker` in the list, used it, and said nothing. Muskan asked why. It turned out
`.claude/agents/plan-checker.md` exists, is committed (`e0c6217`), and has frontmatter
byte-identical in shape to `critic` and `adr-checker` — both of which *do* resolve. It is
the only one of our 11 agents that doesn't.

**Why it was wrong** — two compounding errors:
1. I treated **name similarity as ruleset equivalence.** The skill named `plan-checker`
   because of what its ruleset does (NULL truth tables, call-site truth, "keeps behavior"
   is banned, out-of-scope files are automatically a finding). `gsd-plan-checker` shares a
   noun, not a ruleset.
2. The deeper one: `/build` says *"no stops between G3 and G4"*, and I let that pressure me
   into not surfacing a blocker. **"No stops" governs decisions, not missing machinery.**
   A skill that can't run its own step has failed, and silently degrading it hides that
   failure exactly where it costs most — on the run meant to prove the pipeline works.

**The rule** — if a named piece of machinery doesn't resolve: say so in one line, state the
substitute and what it costs, then proceed. Never substitute silently. If a substitute is
needed, prefer **running the real ruleset in a generic agent** (paste the agent file's
instructions into a `general-purpose` prompt) over using a different agent's ruleset — the
ruleset is the thing being invoked; the agent name is just the address.

**Still open** — root cause of the non-registration is unconfirmed. Prime suspect: a name
collision with the globally-installed `~/.claude/agents/gsd-plan-checker.md`; every other
pipeline agent has a name with no GSD twin. Not chased mid-build.

---

## L-002 · Grep the reader's vocabulary, not the writer's

**2026-08-19 · slug 0022 · `/build` T00 plan rev 1 · caught by the plan-checker**

**Trigger** — changing **seed or fixture data**, and building the "what depends on this?" list.

**What I did** — my blast-radius table was built from `grep "profile_visible|price_public"`
across `e2e/`, `supabase/tests/` and `src/`. It found the SQL-layer consumers and I called
the sweep complete. It missed `e2e/present-card-edit.spec.ts:239`, which asserts the string
`"See all prices"` is absent from a specific card *because* seed ships that product
`price_public = false` — then drives the dial on itself. My matrix set that product's price
public. The file is `mode: "serial"`, so it would have cascaded through the rest of the file.

**Why it was wrong** — I searched using **the writer's vocabulary** (the column names I was
changing). Tests don't mention columns. They mention **the reader's vocabulary**: product
names, button labels, aria-labels, visible copy. The two vocabularies never intersect, so a
column-name grep returns a confident, empty, wrong answer.

**The rule** — when changing data, grep for the row's *user-visible identifiers* as well as
its column names: the product name, the label, the button text, the test-id. For a seeded
row, grep its natural key (`AUR-1B`) **and** its display name (`Pedanios 31/1 PND-CA`) —
tests select by one and comment by the other.

---

## L-003 · Verify the checker's remedy, not just its finding

**2026-08-19 · slug 0022 · `/build` T00 plan rev 2 · caught by our own re-grep**

**Trigger** — a checker returns REVISE **and** proposes a specific fix.

**What I did** — the checker found pin 1 (AUR-1A must stay `price_public = false`) and
offered two remedies, the first being "re-point the corners: AUR-1A → L1, AUR-1B → L2".
I started folding it in. Running L-002's rule on the *remedy* first surfaced a **second**
pin the checker never looked for: `e2e/present-card-edit.spec.ts:162,176` uses AUR-1B as
"the blank slate — no seeded rungs" and asserts zero tiers on it. The proposed fix needed
AUR-1B to carry a ladder. Both offered remedies broke one pin or the other.

**Why it was wrong** — I was treating the checker's finding and the checker's fix as one
verified unit. They aren't. A checker that stops at the first blocker has, by construction,
**stopped looking** — so its remedy is drafted against an incomplete picture of the
constraints. The finding is evidence; the remedy is a hypothesis.

**The rule** — spot-verify a proposed remedy with the same rigour as the finding, and
specifically re-run the search that produced the finding *against the remedy's new targets*.
The fix lands in code; the finding doesn't.

---

## L-004 · "Parallel-safe" is a computed intersection plus a shared-resource check

**2026-08-19 · slug 0022 · authored at `/design`, caught at `/build`**

**Trigger** — writing or trusting a "these tickets can run in parallel / in worktrees" claim.

**What I did** — `TICKETS.md` shipped `**Parallel-safe pairs** (no shared files): … T06 ∥ T01`.
Both tickets declare `src/types/database.types.ts` in their own Files lists, as does T05.
I'd derived the pairs by reading the file lists as prose instead of intersecting them as sets,
and I never considered resources outside the file system at all.

**Why it was wrong** — two blind spots:
1. **Generated files are shared state.** `database.types.ts` is regenerated wholesale, so two
   tickets that are logically independent still collide there. Logical independence ≠ file
   independence.
2. **The file system isn't the only shared resource.** `supabase/config.toml` pins
   `project_id = "hello-sello-design"` on fixed ports, so *every worktree shares one Docker
   Supabase stack* — a `db reset` in one wipes the other's data mid-run. That makes most of
   this slug's tickets un-parallelisable no matter how disjoint their files are.

**The rule** — a parallel-safety claim needs three passes, in order: (a) intersect the declared
Files as sets, mechanically; (b) add generated/derived artifacts as implicit members of every
set that regenerates them; (c) check shared *resources* — the local DB, fixed ports, seed
state, any singleton the tests touch. Only what survives all three is worktree-safe. State the
DB constraint explicitly whenever worktrees are proposed; it is the binding one here.

---

## L-005 · Sweep once per field the diff writes, not once per ticket

**2026-08-19 · slug 0022 · `/build` T00 plan rev 2 · caught by `plan-checker`**

**Trigger** — a change writes **more than one** field, column or flag, especially when one of
them was added late in planning.

**What I did** — rev 2 changed two things: the visibility/price dials, and two tier rungs added
to AUR-1C. I ran a consumer sweep for the dials (twice, after L-002) and **zero** sweeps for
`tiers`. Adding rungs to AUR-1C would have silently moved the seller's deal-line prefill from
4.00 to 3.20 — `CardFront.tsx:483` seeds quantity from `packSizeGrams` (1000 for AUR-1C) and
`:494-496` resolves it through `resolveTierPrice`, which picks the highest reached rung
(`pricing.ts:47-54`). It also adds a rung chip, an "apply" button, and a `500g+` pack option.
Two deal fixtures use AUR-1C and were never examined.

**Why it was wrong** — I scoped the sweep to the ticket's **headline** ("the visibility × price
matrix") instead of to the **diff**. The rungs entered as a step-3 afterthought to close an
acceptance-criteria gap, and an afterthought never gets its own sweep — it inherits the sweep
done before it existed.

**The rule** — before verification, list the fields the diff actually writes and run a separate
consumer sweep per field. The field added last in planning is the one most likely to have been
swept **zero** times. And prefer a **new** row over mutating a row that fixtures already use:
a new row has no dependents by construction, which is why rev 3 moved the ladder onto a fifth
product instead.

---

## L-006 · A comment on the read path is not a contract for the write path

**2026-08-19 · slug 0022 · `/build` T00 plan rev 2 · caught by `plan-checker`**

**Trigger** — citing a comment, docstring or existing behaviour as licence for a change, when
the change is on the **other** side of the read/write boundary.

**What I did** — rev 2 deleted a seeded price row, justified by
`src/modules/deals/supabase/reads.ts:531`: *"A product with no current price comes back with
`unitPrice = null` (a price-less line is allowed, D3)."* That is a **reader's** tolerance.
The write path is `deal_line_item.unit_price NUMERIC(15,4) **NOT NULL**`
(`20260607090003_phase2_deal.sql:235`), reached through `create_deal_draft`'s
`nullif(v_line->>'unitPrice','')::numeric` with Save-draft gated only on `lines.length === 0`.
Adding that product from the shop dropdown and saving raises `23502` — on the demo path. A
seed-only ticket would have shipped a live break.

**Why it was wrong** — "the system tolerates null here" is a statement about **one direction**.
I read a reader's null-tolerance as a system-wide invariant, which is the same error as reading
a nullable column as an unconstrained one.

**The rule** — when a claim licenses a **write**, verify it at the **constraint** — the DDL, the
`NOT NULL`, the CHECK, the trigger — never at a comment on a reader. Comments describe intent
at one call site; constraints describe what the database will actually accept.

---

## L-007 · "The tool lied" is the last hypothesis, not the first

**2026-08-19 · slug 0022 · `/build` T00 step 6 · caught by the orchestrator re-running it**

**Trigger** — an agent reports that a tool, hook, reporter or harness gave a **wrong result** —
especially a false GREEN.

**What happened** — `test-runner` reported that the `rtk` hook summarised a Playwright run as
`PASS (14) FAIL (0)` while a real failure existed, and classified it *"tooling bug in the rtk
hook's summarizer — do not trust rtk-filtered playwright summaries"*. Re-running the same spec
twice on one DB state, once through the hook and once through `rtk proxy`, gave `PASS (2)` and
`2 passed` — agreement. The summarizer was fine.

The real mechanism was in the agent's **own report**: `e2e/present-card-edit.spec.ts` mutates
seed data, so its first run polluted the DB and the second run failed legitimately. It
discovered that pollution mechanism itself, wrote it up correctly as a separate finding — and
still left the tooling-bug attribution standing next to it.

**Why it was wrong** — between the two runs, **the agent had changed the database** by running
a seed-mutating spec. That is the variable that moved. Blaming the reporter requires inventing
a new defect; blaming the state it just mutated explains everything with defects already known.
Preferring the former is picking the explanation with the larger surface area.

**The rule** — when two runs disagree, name what changed between them **before** blaming the
observer. A tooling-defect claim needs a same-state A/B: run the tool and its bypass against an
identical starting state and diff the output. Until that exists, it is a hypothesis, not a
finding. This matters beyond correctness — a false "don't trust the test output" alarm
discredits the whole gate, and everything a green run is supposed to license goes with it.

**Corollary for relaying** — do not pass an agent's tooling-defect claim up to Muskan
unverified. It is the single least verifiable thing an agent reports and the most expensive to
be wrong about.

---

## L-008 · A stalled builder leaves the tree mid-implementation, and nothing announces it

**2026-08-19 · slug 0022 · `/build` T03 step 5 · caught by inspecting the tree after the failure**

**Trigger** — any agent that writes source dies without returning: watchdog stall, terminal API
error, user skip.

**What happened** — `builder` was killed by the stream watchdog after 600s with no output, its
last line *"Now the footer slot: swap the buy-row gate and add the ask branch."* It had completed
4 of 5 plan steps — `shop.ts`, the props, the gate group, the buy-row swap, the badge guard — and
left the fifth unwritten. The working tree held a **half-implemented component**: new props
accepted, one gate wired, the other gate computed but never rendered. The failure notification
says only that the agent stalled; it says nothing about what landed.

**Why it matters** — this is the most dangerous state in the pipeline. The diff looks like work.
It type-checks. `tsc` passes, most tests pass, and the only thing standing between it and a
"green" claim is a test suite that happened to be written first. **On a ticket with weaker tests
it would have read as complete.** The `/build` skill has no recovery step for a dead writer — it
budgets `tests` and `blocking-findings` retries, but assumes agents return.

**The rule** — when a source-writing agent dies, the first move is **never** to respawn it and
never to assume nothing landed. Diff the tree against the plan's step list and establish exactly
which steps completed, then decide: finish the remainder directly if it is small and
well-specified (one JSX block, one guard), or respawn with an explicit "steps 1-4 are already
applied, verify then do step 5" brief. Respawning a fresh agent on the original prompt invites it
to redo completed work — and to make different choices than its predecessor in the parts it
redoes, which is how a file ends up with two half-designs in it.

**Corollary** — this is the case tests-first actually pays for. The red contract was written
before any source existed, so recovery was a matter of reading `3 failed / 29 passed` and finding
the one gate with no render site. Without it, "what did the dead agent finish?" has no cheap
answer.

---

## The loop — and its weak link

The honest limit: **a log nobody reads is not a loop.** Three hooks make it one, in
descending reliability:

| hook | status | reliability |
|---|---|---|
| memory pointer (auto-loads every session) | ✅ wired 2026-08-19 | high — no discipline required |
| `/build` `/design` `/spec` `/ship` step 0 scans the Trigger lines | ✅ wired 2026-08-19 | high — fires on the runs that matter |
| "I'll remember to check it" | — | zero |

Both hooks read; both also carry the **write** half — an entry is written at the catch, not
at wrap. That ordering is the load-bearing part: by wrap the root cause has been rationalised
into "a small mix-up", which is exactly the entry that teaches nothing.

If a hook is ever removed, this file is documentation, not a mechanism. Say so rather than
assuming it still works.

---

## L-009 · Grep the existing suites for the symbol before planning a new one

**2026-08-20 · slug 0022 · `/build` T01 plan rev 1 · caught by `plan-checker` (B3)**

**Trigger** — planning a new test file, suite, or assertion for a function, RPC, policy or
route. Before writing it: grep the *existing* suites for that symbol's name.

**What I did** — PLAN-T01 rev 1 proposed a new SQL suite whose assertions included "an
unverified caller gets zero rows" and "`anon` cannot execute". Both already ship in
`supabase/tests/cross_tenant_lockdown_test.sql` — `:111-113` and `:92-93` — naming
`get_discoverable_company` explicitly, with `ON_ERROR_STOP=1` in its runner so they are not
false-green. The plan then did not run that suite in its verification step. So rev 1 would have
**rewritten the guard it needed while leaving the real one untriggered.**

**Why it was wrong** — I searched the *migrations* for prior art on the function and never
searched the *tests*. A migration search answers "what does this do"; only a test search answers
"what already protects this". Duplicated assertions are worse than missing ones: two guards drift,
and the stale one gets trusted.

**The rule** — `grep -rn "<symbol>" supabase/tests/ src/**/*.test.ts` is part of writing the plan,
not part of reviewing it. Any new suite must state what the existing ones *don't* cover.

---

## L-010 · A security mechanism you changed recently is the one you are most likely to mis-cite

**2026-08-20 · slug 0022 · `/build` T01 plan rev 1 · caught by `plan-checker` (N1)**

**Trigger** — writing a rationale that says "without X, `anon`/PUBLIC would regain Y" or any
claim about what the database does *by default*.

**What I did** — rev 1 justified the grant ritual with: "without it the function returns to
PUBLIC-executable default and `anon` regains it." That was true until **three days earlier**.
`20260817120000_anon_execute_lockdown.sql` — written in this project, by me, in session 77 —
set `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM anon` (`:8-9`) and installed the
`revoke_anon_execute_on_new_function` event trigger firing at `ddl_command_end` (`:46,:57`). A
newly created function is now *born* correctly. The consequence was not cosmetic: rev 1's
verification step grepped `proacl` to prove criterion 3, and under the new default that grep
passes **whether or not the ritual is in the file**. A real false-green, in the verification of a
grant.

**Why it was wrong** — recent work is recalled as intent ("I hardened anon execute") rather than
as mechanism ("a default-privileges narrowing plus an event trigger, which changes what a fresh
`CREATE FUNCTION` inherits"). Intent doesn't tell you which downstream assumptions it invalidated.

**The rule** — when a plan's rationale rests on default/inherited behaviour, verify it against the
**current** DDL, not memory — and check whether the check you planned still *distinguishes* pass
from fail once that default changed. A verification step that passes unconditionally is not a
verification step.

---

## L-011 · When enumerating invariants, you will remember the security ones and drop the functional ones

**2026-08-20 · slug 0022 · `/build` T01 plan rev 2 · caught by `plan-checker` round 2 (B3, B4)**

**Trigger** — writing a "these must survive" checklist for a re-created function, policy, or
migration — especially when the ticket's *risk* is framed as security.

**What I did** — PLAN-T01's invariant table listed seven items: the verified-caller gate, the
`verification_status` check, the soft-delete check, the header flags, the join's `deleted_at`, the
connection-state arms, and the ACL. Every one a **security** predicate. It omitted
`where c.id = p_company_id` — the function's **primary filter**. Lose that line and a
`SECURITY DEFINER` function grouped on `c.id` returns *every verified company, one row each*, to
any verified caller. Step 2's "grep I1–I7 individually" would have passed. The shipped guard would
have passed too — it asserts row-count for an **unverified** caller only. Also missed: the
`left join`'s LEFT-ness (an inner join returns zero rows for a company with no type assignment)
and the `coalesce(… filter (where … is not null), '{}')` that a deviation had just promoted to the
source of a user-visible field.

**Why it was wrong** — the ticket's framing was "don't lose the security gate", so I enumerated
against that frame. An invariant list built from the *risk narrative* inherits the narrative's
blind spots. The correct frame is the **body**: every clause in it is an invariant until proven
otherwise.

**The rule** — enumerate invariants by walking the actual statement clause by clause — `select`
list, `from`, every `join` and its type, every `where` conjunct, `group by`, the signature — not
by recalling what the ticket said was risky. Then ask of each: *would any planned check notice if
this vanished?* A check that passes under the failure is not a check.

---

## L-012 · "As seeded" is a claim about data — grep the seed before asserting against it

**2026-08-20 · slug 0022 · `/build` T01 plan rev 2 · caught by `plan-checker` round 2 (B2)**

**Trigger** — planning any assertion phrased "returns X as seeded / as fixtured / as configured".

**What I did** — rev 2's SQL suite asserted a verified buyer "gets all five new columns populated
as seeded". The seed populates **none** of them: zero `warehouse_location`, zero `links`; company
`metadata` is only `jsonb_build_object('seed','demo-2d')`. Four of five return NULL on a fresh
`db reset`. So the assertion was unsatisfiable — and worse, **the failure it existed to catch was
invisible to every planned check**: transpose `address` and `warehouse_location` in the projection
and `tsc` can't see it (both typed `string`), the SQL suite can't see it (NULL = NULL), the unit
test can't see it (hand-typed fixture). The plan's stated purpose — "join the two halves of
criterion 1" — was defeated by data I never looked at.

**Why it was wrong** — I wrote T00, which *is* the seed ticket, and carried an impression of the
seed as "rich now" into a claim about columns T00 never touched. Recency of authorship is not
knowledge of content.

**The rule** — a test that asserts against fixture data must either grep the fixture and cite the
line, or **plant its own row with distinct sentinel values per column**. Distinct is the point:
identical sentinels pass a transposition, which is the commonest projection bug.

---

## L-013 · Run the runner, not just the test — a green suite proves nothing if its harness never fired

**2026-08-20 · slug 0022 · `/build` T01 step 4 · caught by the orchestrator executing what `test-writer` had only inspected**

**Trigger** — accepting any "the tests fail correctly / pass correctly" claim that was reached by
**reading** rather than **running**; and writing or copying a shell runner for a test suite.

**What happened** — `test-writer` reported the RED state "confirmed by inspection rather than
execution (per my no-run mandate)". Executing it surfaced a defect its inspection could not:
`run_discoverable_company_chrome_test.sh` — copied from T00's shipped
`run_seed_visibility_matrix_test.sh`, which **I** wrote — invokes `psql … -f "$TEST_FILE"`. On this
machine `psql` is a shim (`~/.local/bin/psql`) that `exec docker exec`s psql **inside** the
`supabase_db_*` container, where a host-relative path does not exist. The primary branch therefore
fails with `No such file or directory` **whenever `command -v psql` succeeds — which is always**.
The fallback branch (`-f -` on stdin) was the only one that ever worked, and it is unreachable.
Fixed both runners to feed the file on stdin, which is correct for a real psql and for the shim.

**Why it matters beyond the bug** — this is the *third* harness defect in one slug, after the
`ON_ERROR_STOP` false-green and the seed-pollution trap. The pattern: **test infrastructure is
written once, glanced at, and then trusted forever**, while the tests it runs get reviewed line by
line. A broken runner is strictly worse than no runner — it occupies the slot where a check should be.

**The rule** — a test artifact is not delivered until its **runner** has been executed and shown to
(a) fail on the unbuilt feature, with the *expected message*, and (b) pass on something known-good.
Both halves. An agent forbidden from running tests can write them but cannot verify them; the
orchestrator owes that execution and must not relay an inspection as a result.

---

## L-014 · Before believing a sweep, prove the sweep works on a known-good case

**2026-08-20 · slug 0022 · `/build` T01 · caught by the orchestrator's own sanity check**

**Trigger** — running a loop/sweep over many targets and getting a **uniform** result, especially
uniform failure. Also: any `wc -l` on a filtered command's output.

**What I did** — swept all SQL runners with `for r in …; do out=$(timeout 90 bash "$r"); done` and
got **35/35 FAIL, exit 127**. Two of those runners I had personally watched pass minutes earlier.
`timeout` is GNU coreutils and **does not exist on macOS** — every invocation was
"command not found". Nothing was wrong with any runner. Separately, `ls … | wc -l` reported 37
runners where the shell glob reports 35: `ls` is rewritten by the rtk hook, which appends summary
lines that `wc` happily counted. I had published "22 of 37" on that basis.

**Why it was wrong** — a uniform result is evidence about the *harness*, not the targets. Real
defects are lumpy. And a count taken through a filtering wrapper is a count of the wrapper's
output, not of the thing.

**The rule** — every sweep needs a **control**: include at least one target known to pass and one
known to fail, and if the control comes back wrong, disbelieve the sweep before disbelieving the
targets. Count files with a shell glob (`printf '%s\n' pat*`), never through a wrapped `ls`. This is
L-007 ("the tool lied is the last hypothesis") pointed at my own scaffolding rather than an agent's.

---

## L-015 · Two representations of one thing, both `string | null` — the compiler cannot help you

**2026-08-21 · slug 0022 · `/build` T02 plan rev 1 · caught by `plan-checker` (B2)**

**Trigger** — feeding one module's output into another module's input where the two describe the
*same concept* in different representations: a storage **path** vs a resolved **URL**, an id vs a
slug, cents vs euros, UTC vs local. Especially when both sides type as `string`.

**What I did** — planned to hand T01's `DiscoverCompanyProfile` to `ShopView`. T01's mapper returns
`logoUrl`/`coverUrl` — **resolved public URLs**. `ShopView` expects `Shop["company"].logo_path` /
`cover_path` — **storage paths** — and builds the src itself via
`mediaUrl(path) = ${SUPABASE_URL}/storage/v1/object/public/shop-media/${path}`
(`ShopView.tsx:57-60,512-520`). The result would have been
`…/shop-media/https://…` — **a broken banner and logo on the ticket's headline surface** — and
because both sides are `string | null`, `tsc` is green and every unit test passes. Rev 1 had no
mapper between them at all; **no ticket in the slug owned one.**

**Why it was wrong** — I checked that the *types* lined up and concluded the *values* did. A type
name describes a shape, not a unit or an encoding. Where a concept has two representations, the
type system is exactly as blind as it is for `string` money or `string` dates.

**The rule** — whenever data crosses a module boundary, ask what the receiving side will **do**
with the value, not just what it is typed as. If either side transforms it (prefixes, parses,
formats, resolves), the boundary needs a **named mapper and a unit test asserting the
representation** — e.g. `expect(out.cover_path).not.toMatch(/^https?:/)`. Cheap, and it is the only
thing that catches this class.

---

## L-016 · When a mapper is unimplementable, look one layer up before adding a layer

**2026-08-21 · slug 0022 · `/build` T02 plan rev 1 · caught by `plan-checker` (B3)**

**Trigger** — a planned mapper cannot produce a required field because the source type has already
discarded the data.

**What I did** — planned `DiscoverProduct → ShopProduct`. `ShopProduct.images` needs `{id, path}`;
`DiscoverProduct.images` is `string[]` of resolved URLs with id and path **already thrown away**
(`companies.ts:253-257`). The mapper was unimplementable as specified. The instinct is to widen
`DiscoverProduct` — add the ids back, keep both shapes, map downstream.

**What was right instead** — `DiscoverProduct` had **exactly one consumer**: the very file this
ticket rewrites. So the fix was to **delete the type** and map from the row (`ShopRow`, which still
carries `{id, path, position}`) straight to `ShopProduct`. One type gone, one layer gone, bug fixed
at source instead of patched downstream.

**The rule** — when a mapper can't be written because its input is already lossy, the question is
not "what do I add to the input?" but **"who else actually uses this input?"** Run the grep first.
A type with one consumer is not an interface, it is an intermediate — and an intermediate that
loses data has earned deletion. *(This is the simplification bias made concrete: the round that
made things worse in the last slug was the one that added a mechanism instead of removing the
problem.)*

---

## L-017 · An exception added to a criterion is a deviation — never a "correct reading"

**2026-08-21 · slug 0022 · `/build` T02 plan rev 2 · caught by `plan-checker` round 2 (B1)**

**Trigger** — you are about to widen, soften, or add an "unless…" to an acceptance criterion,
a fence, or a locked decision, because implementing it literally looks like it would break
something.

**What I did** — the criterion: *"When a single **named** location is the active filter, the
per-location group header shall not render."* No exception. I wrote
`showHeader={loc === "All" || editing}` and justified it: suppressing the header while editing
would cost the seller the drag-to-regroup affordance.

**The justification was false, and one grep would have shown it.** Under a named filter
`filterByLocation` returns only products whose `location === loc`, so there is exactly **one**
group; `handleDrop` early-returns when `from === targetLocation`, so every visible card is already
in that group and no drop can do anything; and the drop target is the `<section>`, not the header,
so it survives `showHeader={false}` anyway. Nothing functional was at stake — a label, a count
badge, and a hint for an impossible drop.

**Why it was wrong, twice over.** First: I reasoned about the affordance from the component's
*shape* (a draggable header exists → suppressing it must cost something) instead of tracing whether
the path was reachable in that state. Second, and worse: I wrote the exception into the plan as
though it were what the criterion meant. A reviewer skimming rev 2 would have seen a considered
reading, not a change. **Presenting a deviation as an interpretation is more dangerous than the
deviation** — it removes the human's chance to rule on it.

**The rule** — when literal compliance looks wrong: (1) prove the harm is *reachable* before
believing it; (2) if it is real, file it as an explicit deviation for the gate, in the deviations
table, in the requester's words — never by re-describing what the criterion "really" says.

---

## L-018 · Plan the test surface against the runner that exists, not the one you assume

**2026-08-21 · slug 0022 · `/build` T04 plan rev 1 · caught by `plan-checker` round 1 (B1)**

**Trigger** — you are about to specify a test that asserts an interaction or a state *change*
(a click, a re-render, "after X the button becomes Y"), in any repo whose test setup you have
not just read.

**What I did** — the plan asked for three assertions in `ProductCard.gate.test.tsx`: clicking
fires the handler, a resolved `{ok:true}` swaps the button for a confirmation, an `{error}` leaves
it clickable. All three are unwritable here. `vitest.config.ts:34` is `environment: "node"`, and
`package.json` has no jsdom, no happy-dom, no testing-library. Every card suite renders through
`renderToStaticMarkup` — an HTML **string**. There is no DOM, no event dispatch, no second render.

**The file I told the agent to extend says so in its own header** (`:18-20`): *"no jsdom, initial
paint only — `pricesOpen` etc. are local state and out of scope here."* I had read that file to
find the helper I wanted to reuse and did not read its preamble.

**Why it matters more than a wasted test** — `test-writer` reads the plan, not the runner config.
Three tests that can never go green would have gone into the tree, and the pressure at that point
is to add jsdom mid-ticket (a real dependency decision) or to quietly delete the criterion they
were protecting. Both are worse than planning honestly: the plan now states that the behaviour is
proven by e2e alone, and says why.

**The rule** — before writing any test into a plan, open the runner config and one existing suite
for the same file. Ask what the harness can physically express. If it cannot express the assertion,
say so **in the plan** and name where the proof actually lives — do not let the gap surface as a
red test someone will "fix" by weakening the criterion.

---

## L-019 · A test that changes identity needs a way OUT of the first one

**2026-08-21 · slug 0022 · `/build` T04 plan rev 2 · caught by `plan-checker` round 2 (B2/B3)**

**Trigger** — designing any test where actor A does something and actor B must then observe it:
"then sign in as the seller and check her inbox."

**What I did** — rev 2's proof for three of the four criteria was: buyer clicks, then sign in as
the seller and count the rows in her inbox UI. Not executable. `proxy.ts:77-82` redirects a
signed-in user away from `/login`, and there is **no sign-out helper anywhere in `e2e/`** — so the
switch hangs on a `page.fill` against a page that never rendered a form. It was also unsound:
`playwright.config.ts` runs one worker against one database, so an earlier test's row lands in the
same inbox and a bare count reads high.

**The repo already had the answer, one file away.** `chat-phase7.spec.ts:99-101` shells out to
`psql` as superuser precisely for *"the assertions a tenant-scoped client can NOT see"*, and
`e2e/fixtures/two-company.ts` exports a whole `countX()` family built on it. Asserting the row
directly is strictly stronger than the UI route — it can see `metadata->>'product_id'`, which no
screen renders — and it made the identity switch unnecessary.

**Two rules.** (1) Before designing a cross-actor test, grep for the mechanism that switches actors
and confirm it exists; "sign in as someone else" is an assumption, not a primitive. (2) When the
thing you want to prove is a **row**, prove the row. Reaching for the UI to observe a database fact
adds an identity problem, a rendering problem and a cross-test-pollution problem to a question SQL
answers directly.

---

## L-020 · Assert the field the code writes, not the label a human reads

**2026-08-21 · slug 0022 · `/build` T04 plan rev 3 · caught by `test-writer`, which refused the instruction**

**Trigger** — writing an expected string into a plan or a test ("the note will contain X") where
X is something you read off a screen, a prototype, or a seed row.

**What I did** — the plan said the inbox note would contain *"Cosmic Cream"*. That is AUR-1A's
**`cultivar`**. Its `name` is `Pedanios 31/1 COS-CA` (`seed.sql:391`), the two are separate columns
kept separate by `mapDiscoverShopRow` (`companies.ts:292`), and the note is built from `name` —
which is also what the shipped `aria-label` uses (`ProductCard.tsx:824`). The assertion would have
been **permanently red against a correct implementation**.

**Both fields render on the card** (`:541` name headline, `:543` cultivar subtitle), which is
exactly why reading the label off a screenshot is unsafe: two different columns are both visible
and either looks like "the product name".

**The catch is the lesson.** `test-writer` was told to assert *"Cosmic Cream"*, traced it to the
wrong column, and **flagged it instead of complying** — L-001's disposition applied to a spec
rather than to a missing agent. An agent that quietly obeys a wrong instruction produces a red test
and an hour of debugging; one that refuses produces a one-line correction.

**The rule** — when a plan names an expected value, cite the column and the line that produces it,
not the rendering. If you cannot name the field, you are guessing at a label.

---

## L-021 · A test for a crash must wait for the crash's own trigger

**2026-08-22 · slug 0022 · the `/connect/inbox` `connect_person` fix · caught by my own A/B, not by a reviewer**

**Trigger** — writing a regression test for a client-side crash, an error boundary, or anything
that appears only *after* data arrives.

**What I did** — asserted that the inbox rendered by waiting for its lens tab bar, then that the
error text was absent. Both passed **against the broken code**. `InboxView` renders `LensTabs`
immediately and fetches in a `useEffect`, so the tab bar exists during the entire in-flight
window; the crashing row had not arrived yet. The "absence" assertion then confirmed the absence
of an error that had not happened *yet*, and `toHaveCount(0)` on the offending row passed for the
same reason a blank page would have passed it.

**Why it nearly shipped** — the test was green, the fix was real, and the two facts together look
like proof. Only stashing the fix and re-running exposed that the test never had an opinion.

**Two rules.** (1) Anchor on a **positive post-condition that only exists after the load** — a row
that must be present — before asserting anything about a row that must not be. (2) An assertion
of ABSENCE is worthless without a paired assertion of PRESENCE in the same state: on a blank page,
everything is absent. This is L-019's "prove the row" turned around: prove the page, too.

**Corollary that paid out immediately** — a crash that blanks a page makes every downstream
assertion vacuous, which is how `deal-c2c-create.spec.ts` sat in the "pre-existing failures"
column. When a suite has a long-standing failure list, check whether one of them is a *cause*
rather than a peer.

---

## L-022 · Read the script before running "the tests"

**2026-08-22 · slug 0022 · post-G4 gate run · self-inflicted, twice**

**Trigger** — reaching for `npm run test` / `npm test` in a repo whose scripts you have not read
this session.

**What I did** — ran `npm run test` expecting vitest. In this repo `test` is **Playwright**
(`test:unit` is vitest). It launched a second full e2e run against the same dev server and the
same database as one already running in the background, and I did it twice. Both runs' results
were unusable, and the ~13 minutes spent were worse than wasted because the numbers looked real.

**The second-order damage is the point.** A contaminated green is more expensive than a red: I
briefly recorded a failure count from a run that had two Playwright workers fighting over one DB.

**Two rules.** (1) `cat package.json` scripts before the first test invocation of a session — the
name `test` carries no guarantee. (2) One suite against one database at a time. Before starting a
run, confirm nothing else is already running against it, and never edit source mid-run — the Next
dev server hot-reloads underneath, which silently changes what the remaining tests are testing
(this is what made `deal-p2p-send` look like a new failure until the A/B settled it).

---

## L-023 · `test-writer` cannot run anything — the RED verification is the orchestrator's job, always

**2026-08-22 · slug 0022 · `/build` T05 step 4 · caught by running what `test-writer` had to leave unrun**

**Trigger** — reading any `test-writer` return, or planning a step that assumes the agent which
wrote a test also proved it fails.

**What happened** — `test-writer` delivered four files and reported, correctly, that it could not
execute them: its tool grant is `Read, Grep, Glob, Write, Edit` (`.claude/agents/test-writer.md:6`)
— **no Bash**. It cited L-013 and declined to paste a run it had not performed. That is the right
call and the second time on this slug an agent has been right to refuse an instruction.

**But the gap is structural, not incidental.** L-013 says "run the runner, not just the test", and
the agent the pipeline assigns to write tests is *constitutionally incapable* of doing so. So the
step silently degrades to "RED by inspection" unless the orchestrator picks it up.

**What inspection could not have found.** Running the new SQL suite failed immediately — not on the
missing columns, but on `ERROR: column "company_id" is of type uuid but expression is of type text`.
**37** bare `'aaaaaaaa-…'` literals needed `::uuid`. The suite could not reach a single assertion.
Had the orchestrator trusted the reasoning ("the columns don't exist, therefore RED"), the builder
would have been handed a suite that errors in its fixture, and "green" would have meant nothing.
The reasoning was even correct — the columns really are missing — and still the suite was broken.

**The rule** — after `test-writer` returns, the orchestrator RUNS every suite it wrote and pastes
the real output before spawning `builder`. A RED that is the *wrong* red (fixture error, syntax
error, unreachable assertion) is indistinguishable from the right one in any report written by
reading. Verify the failure message names the thing under test — here,
`record "r" has no field "cbg_percent"`, not a type-cast error three sections earlier.

**Corollary** — the same check catches the opposite: after the builder, a suite that goes green
without ever having been able to fail is a false green. Both directions need the runner.

---

## L-024 · `diff` exits 0 on differing files here — never branch on it

**2026-08-22 · slug 0022 · T05 G4 staging · caught by `visual-verifier` cross-checking a DB restore with md5**

**Trigger** — any script, agent or verification step that decides something from `diff`'s **exit
status**: `if diff a b; then echo "identical"`, `diff … && …`, or a runner that treats a zero exit
as "no change". Also any "I restored the database / the file is unchanged" claim.

**What happened** — `visual-verifier` restored seeded rows after a plant-and-photograph cycle and
verified with `diff` on two CSV dumps. It printed a clean-looking summary. The files were **not**
identical: `AUR-1B.updated_at` had been bumped by `trg_product_set_updated_at`. Only an md5
cross-check, then a column-by-column compare in Python, surfaced it.

**Reproduced directly.** Two one-line CSVs differing in a single character:

```
$ diff /tmp/a.csv /tmp/b.csv
   +1 added, -1 removed, ~0 modified
$ echo $?
0                      # ← real diff(1) returns 1 when files differ
$ md5 -q /tmp/a.csv /tmp/b.csv
e5ebd4c02cefbe7955977c67ada242b7
1919efab7e3f5c4cc7e9e96f26663db9
```

The rtk filter rewrites `diff` and does not preserve its exit contract. The **text** was right
here; the **status** was wrong. An agent that read the output would have caught it; an agent that
branched on the status would not — and branching is what scripts do.

**Two rules.** (1) Verify byte-identity with a **hash** (`md5`, `sha256sum`), never with `diff`'s
exit code. (2) When restoring database state, compare content AND the columns a trigger can touch
— `updated_at` is invisible to a row-count check and to a column list that omits it. Restoring
under `set local session_replication_role = replica` avoids re-firing the trigger at all.

**Why this belongs next to L-013 and L-023.** Same family: a tool reporting success it did not
verify. L-013 was a runner that printed PASSED while failing; L-023 was an agent that could not run
its own suite; this is a shell builtin whose exit code lies. In each case the fix is the same —
make the check name the thing it checked, and confirm it can fail.

## L-025 · A CSS fix can be cancelled by a sibling property — measure it, don't read it

**2026-08-22 · slug 0022 · T05 G4 item D · caught by probing the DOM instead of trusting the screenshot**

**Trigger** — any styling change whose effect is "an element now behaves differently" rather than
"a colour changed": scrollbars, `scroll-snap`, `scrollbar-gutter`, `overscroll-behavior`,
`content-visibility`, container queries. Also any change verified only by looking at a screenshot.

**What happened** — the spec list was given `::-webkit-scrollbar { width: 6px }` to force an
always-visible scrollbar, alongside `scrollbar-width: thin` "for Firefox". The CSS was correct in
isolation and looked plausible in review. It did nothing: **Chromium ignores every
`::-webkit-scrollbar` rule the moment `scrollbar-width` or `scrollbar-color` is set on the same
element**, and falls back to the macOS overlay scrollbar — zero width, invisible until you scroll,
which was the exact defect being fixed. Scoping the two standard properties to
`@supports (-moz-appearance: none)` restored the intent.

Measured, not eyeballed:

```
scrollbar-width: thin  present →  offsetWidth - clientWidth = 0
scoped to Firefox      →  offsetWidth - clientWidth = 6
```

**Two more traps in the same hour, same class.** (1) The whole CSS class was **absent from
`document.styleSheets`** — a stale `.next` cache. The styling looked broken when it had simply
never loaded; `rm -rf .next` and restart fixed it. Check the rule is *loaded* before debugging what
it does. (2) **Headless Chromium does not paint scrollbars**, so the first screenshots showed no
thumb even though the geometry was already correct. A visual claim about scrollbars needs
`headless: false`.

**Rule.** For behavioural CSS, assert a **number** from the live DOM (`offsetWidth - clientWidth`,
`getComputedStyle(el).scrollSnapType`, `scrollHeight > clientHeight`) and put that number in a test.
"I wrote the rule" and "the screenshot looks right" are both weaker than one measurement — and the
measurement is what makes the regression detectable later.

## L-026 · Verify the REASON for a guard as hard as the guard itself

**2026-08-22 · slug 0022 · T05 G4 item E · caught by Muskan questioning an unrelated premise**

**Trigger** — writing the justification for a clause, exception, or special case into a comment, an
ADR, or DECISIONS. Especially the word "otherwise" — "otherwise X would break", "otherwise these
rows are stranded", "otherwise the caller can't recover".

**What happened** — an owner exception was added to a visibility clause and justified as: *unfiled
rows are filed by dragging them out of the `Unassigned` pile, so withholding them from the owner
would strand them permanently.* Plausible, specific, and **wrong**: the filing surface `/present`
reads `getMyShop`, which queries `product` directly with no location filter, and never touches the
RPC being changed. Nothing could ever have been stranded. The real reason was consistency with a
PRD edge-case row — a weaker, but true, reason. It survived a whole build and landed in four files
because it *sounded* load-bearing.

**Why it matters more than a wrong comment normally would** — the next person deciding whether to
delete that exception reads the reason, not the code path. A false "otherwise this breaks" makes a
removable clause look untouchable, and a true-but-modest reason gets it deleted for the right
reasons. Both outcomes depend on the sentence being accurate.

**Rule.** Before writing "otherwise X", **trace X**. Name the file and the read path that would
actually break, the same way you would prove the guard itself — and if you cannot name it, the
reason is a guess. When a wrong reason is found after the fact, **record the correction** next to
the entry rather than silently swapping it: the fact that a justification was wrong once is itself
information for whoever revisits the clause.

## L-027 · A permission gate is only as strong as the write path to its input

**2026-08-22 · slug 0022 · T06 G4 · caught by `security`, reproduced by the orchestrator**

**Trigger** — any change that makes an existing column, row or table *mean something new*: a status
field that starts gating reads, a join table that becomes a permission edge, a boolean that starts
deciding visibility. Also any migration whose comments argue carefully about the **values** a gate
column can hold.

**What happened** — T06 made `relationship` the confidentiality gate for hidden catalogue data, and
the migration reasoned at length about `status = 'active'`, `deleted_at is null`, and why a *pending*
connection must not count. All correct. All irrelevant: `authenticated` holds a direct INSERT grant
on `relationship`, and the policy's `WITH CHECK` only requires the caller's **own** company be one
side of the pair. Nobody has to consent to being connected to.

```
BEFORE  connected=false  hidden_products_visible=0
INSERT 0 1                          ← one row, the other company never agreed
AFTER   connected=true   hidden_products_visible=2
```

The attacker never has to defeat the `status` logic. They write `'active'`.

**The tell:** the plan, two checker rounds, the builder and I all analysed the gate's **read** side
exhaustively — predicates, NULL semantics, which door each mutation reddens — and not one of us
asked *who can write the row it reads*. The question never appeared because the table already
existed and looked like settled infrastructure.

**Rule.** When a change gives an existing table a new job as a permission input, run one query
before anything else:

```sql
select grantee, privilege_type from information_schema.role_table_grants where table_name = '<t>';
select policyname, with_check from pg_policies where tablename = '<t>';
```

If `authenticated` can write it and the `WITH CHECK` does not require the *counterparty's* consent,
the gate is ornamental no matter how precise its read predicate is. Same finding shape as DEV-88
(`person.company_id`) and ADR-0005 round 5 (basket `product_id` — *"the admission policy was
ornamental"*). Remedy is the same each time: revoke the direct grant, re-grant every other column,
route the one legitimate writer through a `SECURITY DEFINER` RPC that checks consent.

## L-028 · A declared Files list can hide a defect from the agent best placed to find it

**2026-08-22 · slug 0022 · T06 · caught by `test-runner`, missed by the builder**

**Trigger** — any ticket with a declared file list, at the moment a fix is applied to one file for a
reason that is about **data or behaviour**, not about that file.

**What happened** — T06 changes what a *connected* buyer sees. The plan correctly predicted this
breaks T05's SQL suite, because the seeded buyer's company is actively connected to the seller, and
the builder fixed it there. The **identical assumption**, using the same two seeded companies, sat in
`e2e/discover-shop.spec.ts` — and was missed, because that file was not in T06's declared Files
list. The builder had already understood the bug class and still did not look, since looking meant
leaving its declared scope.

Cost: the builder reported "everything green" and it was not. `test-runner` caught it only because
it re-ran independently and **A/B-proved** the failure (24/24 without the diff, 23/24 with) instead
of accepting the summary.

**Rule.** When a fix is applied because *the data now means something different*, grep the whole
repo for the other places that encode the old meaning — before declaring the ticket's files. Search
by the **fixture** (`StonePharm`, `AUR-1C`), not by the module. A scope boundary is a review aid, not
evidence of where a defect lives; the fixture travels further than the ticket does.

**Corollary, worth its own line:** a builder's green claim is not verification. This one was sincere,
tested, and wrong. `test-runner` exists because the agent that wrote the change is the worst-placed
agent to bound it.

## L-029 · A remediation verb in REVIEW.md is a claim about the tree, not about your intent

**2026-08-23 · slug 0022 · T09 · caught by `security`, authored by the orchestrator**

**Trigger** — writing any finding's disposition into REVIEW.md while the fix is still ahead of you:
"fixed", "→ fixed in the fix pass", "resolved", "handled". Also any status table written *before*
the pass it describes.

**What I did** — recorded two of `critic`'s notes as **"→ fixed in the fix pass"** at the moment I
decided to fix them, hours before the fix pass ran. `security` then grepped the tree:

```
$ grep -n "inbox_item_id" supabase/tests/connection_consent_lockdown_test.sql
(no output)
```

and returned both as **blocking**, with the right ruling: *"a claimed fix that is absent from the
tree is worse than an open finding."* It is worse because an open finding is still on someone's
list, while a fixed one is off everyone's — the reviewer stops looking, and the gate page inherits
the claim.

**Why it was wrong** — REVIEW.md is read as a record of what the tree contains, by agents and by
Muskan at the gate. I was using it as a to-do list. The two uses look identical in prose and are
opposite in meaning: one says *this is done*, the other says *I mean to do this*.

**The rule.** In REVIEW.md, past tense describes the tree and nothing else. Until the change is
written and verified, the only legal dispositions are **`→ owed`**, `→ escalated`, or
`→ not fixed, reason`. Write "fixed" in the same pass that makes it true, never before — and if a
fix pass is planned, name it as `owed` and let the pass itself flip the word.

**Corollary:** the same applies to STATE.md's gate log and to any handoff. A verb in a record is a
verifiable claim; a checker will verify it.

---

## L-030 · A line range read from a file is not a line range until something compiles it

**2026-08-23 · slug 0022 · T09 · caught by `builder`, survived two plan-checker rounds**

**Trigger** — writing "delete lines N-M" / "replace lines N-M" into a plan, or accepting a checker's
correction to such a range. Also any instruction that identifies code by position rather than by
what it is.

**What happened** — PLAN-T09 told the builder to delete `store.ts:583-620`. `plan-checker` round 2
corrected it to **581**-620, with evidence (the `const [companyA, companyB] =` line, and a grep
showing where the two variables occur). Both were wrong: the block to remove runs **580-622**,
because 581-620 strips the `let relationshipId: string;` declaration while leaving
`relationshipId = rel.id;` and its closing brace behind. **It does not compile.** The builder found
it in seconds — by trying it.

**Why it was wrong** — a range derived by reading is a hypothesis about scope. Two careful readers
narrowed it and both stopped one line short of a brace, because reading finds the *statements* you
are thinking about and not the *syntax* holding them. The compiler is the only thing that knows
where a block ends.

**The rule.** Describe the edit by its boundaries in the language — "the pair probe through the
closing brace of the `if (pairRel)` block" — and let the implementer resolve it to numbers. If a
plan must carry numbers, they are provisional by definition: say so, and expect the builder to
correct them. **A builder correcting a plan's line range is the system working, not a deviation.**

---

## L-031 · "The other copy is right" is a claim about the other copy, and it was never opened

**2026-08-23 · slug 0022 · T06 G4 follow-through · caught while executing the fix**

**Trigger** — recording a discrepancy between two copies of the same fact and naming a winner:
"the migration and the ledger disagree, the ledger is right."

**What happened** — STATE.md carried that exact sentence about the site-1 cascade list, as an owed
T06 fix. Executing it meant opening `docs/deploy/cloud-migrations-pending.md` — which carries the
**same** over-count, listing `plit_public_select` as a fourth cascade beneficiary when it already
inlines `is_caller_verified()` itself. The two copies never disagreed. Had the fix been applied as
written, the migration would have been corrected to match a ledger that was equally wrong, and a
freshly-written comment would have cited it as authority.

**Why it was wrong** — the finding was real (the count *is* one too high); the attribution was
invented. The reviewer read one copy, reasoned out the correct answer, and then assumed the other
copy already held it. Naming a winner feels like extra rigour and is actually an extra unverified
claim riding on a verified one.

**The rule.** When you record that two sources disagree, you owe **both** line references. If you
have only opened one, write "X is wrong; check whether Y repeats it" — and treat the second copy as
part of the fix, not as the thing being fixed against. Same shape as L-029: a fix is not allowed to
cite as evidence something nobody has read.

**Re-offended the same day, by the same author, in the file that cites this entry.** PLAN-T07 rev 1
§6 wrote *"Read `actions.ts` first: if a refusal path already exists, reuse it (L-031 — do not assume
the other copy; open it)"* — and its own Files table had already listed `actions.ts` as *"caller
passes the refusal up"*. `actions.ts` is **not a caller of `addToBasket`**; `grep -rn addToBasket
src/ e2e/` returns four hits and none is in that file. `plan-checker` caught it.

**What that adds to the rule:** *citing* the discipline is not *doing* it, and citing it reads
enough like doing it to fool the author and a reviewer skimming for the reference. The check is
mechanical and costs one command — **run the grep in the same edit that names the file.** If a plan
names a file as playing a role, the evidence for that role belongs in the plan next to the name.

---

## L-032 · A file has more than one fence around it, and clearing one is not clearing the others

**2026-08-23 · slug 0022 · T07 · caught TWICE on one ticket — by `plan-checker` round 2, then by `critic`**

**Trigger** — adding a file to a plan's `Files` list, or concluding that an edit is permitted. Also
any sentence of the form "the fence allows this" / "fence intact".

**What happened, twice.**
1. PLAN rev 2 argued a `ShopView` edit was permitted, quoting ADR-0005's `Reused` fence — and
   concluded **"Fence intact."** It had never opened `STATE.md`'s `Locked` entry, which was
   *stricter*: **no new state, exactly one new branch**, and the one branch was already spent.
   Two different documents fence the same file, and the plan checked one.
2. Fixing that finding, the same plan added `BasketDrawer.tsx` to `Files`. `BasketDrawer` is
   **named in ADR-0005's `Reused — already built; we feed it, don't touch` list** (`:828`).
   `addToBasket`, one line above it, has an explicit carve-out (`:659-660`); `BasketDrawer` has
   none. So the fix for a fence miss crossed a second fence, in the same list the first finding
   had just made the author read.

**Why it kept happening** — fences here live in at least three places: the ADR's `Reused` list,
the ADR's per-component caps, and the slug's `STATE.md` § `Locked` (which accumulates *amendments*
from every prior G4). Reading one and finding no prohibition feels like clearance. It is not; it is
one of three lookups. And the second miss shows the first lesson does not generalise on its own —
having been burned on `ShopView` did nothing for `BasketDrawer` ten lines later.

**The rule.** Before writing any file into a `Files` list, grep that filename across **all three**:
the ADR's `Reused` list, the ADR body, and `STATE.md` § `Locked`. Cite what you found — including
"absent from all three" — next to the filename. **"The fence permits this" is a claim about every
fence, so it needs every fence checked**; if you have checked one, write "ADR §X permits this; I
have not checked `Locked`." A carve-out for a *neighbouring* symbol is evidence the list is
enforced at symbol granularity, not evidence that your symbol is covered.

---

## L-033 · A seed row is not a stable fixture until you grep what mutates it

**2026-08-23 · slug 0022 · T07 · caught by `security`; two agents reported opposite results on the same suite**

**Trigger** — choosing a seed row as the fixture for a new assertion. Also: reading a green suite
result, when anything else has run against that database since the last reset.

**What happened** — cell 4 of a new pgTAP suite asserted on `AUR-1A`, whose seed comment pins it
`price_public = false`. `builder` ran the suite on a fresh `db reset` → **PASSED end to end**. It
then ran `e2e/present-card-edit.spec.ts` (12 pass) as its own verification. That spec checks *"Show
price to buyers"* and saves — **flipping `AUR-1A.price_public` to `true` and committing it.**
`security` then ran the same suite against the same stack and it **aborted at cell 4**. With
`ON_ERROR_STOP=1`, cells 5–13 and the whole grant block never executed — including the shape guard
that the migration header and the ledger pre-flight both name as *the* proof of the no-`USING`
decision. Both agents reported honestly. Both were right. The stack changed underneath.

**Why it was wrong** — "the seed pins this value" is a claim about `seed.sql`, not about the
database at the moment your test runs. A committed e2e that mutates a row makes that row a *moving*
fixture forever after, and the seed comment saying otherwise is exactly what stops anyone checking.
The same seed file already designated `AUR-1F` as the stable price-hidden fixture; the suite reached
for the mutated one.

**The rule.** Before pinning an assertion to a seed row, **grep the e2e and test suites for that
identifier** and read what they do to it — `grep -rn "AUR-1A" e2e/ supabase/tests/` costs one
command. Prefer a fixture the suite creates and tears down itself; where a seed row must be used,
cite in the test *why that row is safe* ("no committed test mutates it"). And **a green suite result
is only evidence for the database state it ran against** — when a report says "passed after a
reset", ask what ran between the reset and the claim.

---

## L-034 · A migration's end state on REPLAY is not its end state on PUSH

**2026-08-23 · slug 0022 · T08 · caught by `plan-checker` round 2 — after the plan had explicitly ruled it out**

**Trigger** — any migration whose correctness depends on **another migration running after it**:
`ALTER DEFAULT PRIVILEGES`, a grant later revoked, a permissive policy later narrowed, a column
later dropped. Also: **any migration whose filename timestamp is older than the date it was
authored.**

**What happened** — `20260607090000_stack_default_privileges.sql` issues
`alter default privileges … grant execute on functions to anon, authenticated, service_role`. Its
own header reasoned the dependency through and cleared it: *"anon EXECUTE on functions — revoked by
20260817120000 §3 … Granted below, revoked there; **end state = prod**."*

**True locally, false on cloud.** `db reset` replays every file in timestamp order, so `090000` runs
first and the revoke runs later and wins. But the file is *named* 2026-06-07 and was **authored
2026-08-22** — while the revoke went live on production on **2026-08-17**. A cloud push therefore
applies `090000` **last**, the revoke never re-runs, and the grant re-widens production's default
with nothing left to narrow it. The measured local end state — `f | {postgres=X, authenticated=X,
service_role=X}` — is an artifact of replay order, and every local test agreed with it.

**Two things made it invisible.** The header's production check recorded privilege **letters**
(*"functions `X`"*) and **not grantees** — so it structurally could not tell whether `anon` was among
them. And a back-dated filename makes "runs first" read as a property of the file when it is only a
property of `db reset`.

**The rule.** A migration is only safe if it asserts the same end state **whether it replays first
or pushes last** — write it order-independently rather than relying on a later file to correct it.
Before pushing any batch, **diff the filename timestamps against the authoring dates** (`git log
--diff-filter=A --format='%ad %s' -- <file>`); where they disagree, that file's ordering assumptions
are wrong on cloud. And **any `pg_default_acl` or grant verification must name the ROLES**, never
just the privilege letters. Fixing it costs one edit while the file is unpushed, and a compensating
migration plus a live window afterwards.

---

## L-035 · The builder never edits tests — not even when the orchestrator tells it to

**2026-08-23 · slug 0022 · T07 · ruled by Muskan after the builder flagged it, then refused it itself**

**Trigger** — writing a fix instruction that names a file under `supabase/tests/**`, `e2e/**`, or any
`*.test.ts`, and addressing it to `builder`.

**What happened** — a review round produced findings inside test files (a mutation matrix that
under-listed, a cell whose stated preconditions were false, an assertion that only checked a
negative). The orchestrator put them in `builder`'s fix list, because that is where the findings
were. `builder` did them and **declared it**: *"I edited test files against the standing fence,
because the fix items name those files. Flagging, not assuming."* On the next round, given the same
shape of instruction, it **refused** — and dispatched `test-writer` instead.

**Why the fence exists** — the builder's job is "make the failing test pass". Give it write access to
the test and the cheapest way to finish is to change the assertion. Nothing catches that: the suite
goes green, the diff looks like a fix, and the guarantee the test was protecting is gone. The fence
is what makes "the tests are green" mean something.

**Why an orchestrator instruction does not lift it** — the fence is not about *intent*, it is about
*capability*. "Only edits tests when told to" is not a safeguard when the telling is routine; it
just moves the decision to whoever writes the fix list, who is usually working under momentum at the
end of a long round. Muskan's ruling: **absolute, costs one extra step, keeps the guarantee real.**

**The rule.** Findings in test files go to `test-writer`, always — including when the orchestrator
has already written them into a fix list, and including when the change is obviously correct and one
line long. If a fix list mixes source and test findings, **split it and dispatch two agents.**
**An agent refusing an instruction on fence grounds is the system working** — the same shape as a
builder correcting a plan's line range (L-030).

---

## L-036 · RLS filters ROWS; it does not filter COLUMNS — a policy is not a projection

**2026-08-23 · slug 0022 · `/ship` step 3 · caught by the `security` agent, reproduced twice**

**Trigger** — writing or widening a `for select` RLS policy on a base table that carries any column
a curated door deliberately withholds. Also: any design that says "the rule is enforced at all three
sites" where the sites are a policy, a view and a function.

**What I authored.** T06's override widened `product_public_select` to
`profile_visible = true or is_connected_to_company(company_id)`, so a connected buyer could see a
seller's hidden products. The ADR called this one of "three sites" enforcing one rule, alongside the
`current_pricelist_item` view and the `get_discoverable_shop` RPC.

**Why it was wrong — the reasoning error.** I treated three enforcement sites as three instances of
the same kind of thing, and checked them for *predicate* agreement. They are not the same kind of
thing. The view and the RPC are **projections**: they name an explicit column list, and
`get_discoverable_shop` deliberately omits `rrp_per_gram`, `supplier_product_code` and raw
`metadata`. A base-table `for select` policy is **not** a projection — it decides rows, and every
admitted row is handed over whole. So predicate agreement across the three sites was the wrong
check, and passing it proved nothing about what the widest door actually returns.

The consequence was not abstract: a product with `price_public = false` surrendered a per-gram price
through `rrp_per_gram`, defeating the ticket's own headline invariant — *connection reveals the
product, never the price* — through a column the price gate never covered. The tests all passed
because every one of them asked the sanctioned door.

**The rule.** Before widening any base-table SELECT policy, list the table's columns and ask which
of them the narrowest sanctioned door refuses to return. If that set is non-empty, the policy is the
wrong place for the rule: move it behind a `security definer` predicate that returns a boolean, and
keep the base-table policy at the narrowest thing every caller genuinely needs. **"Which rows" and
"which columns" are enforced by different mechanisms; a design that conflates them cannot be audited
by comparing predicates.**

**Corollary — the test that would have caught it.** Every visibility assertion in the suite probed
the intended door. Not one asked *"what else can this identity reach?"* A capability test proves the
feature works; only a negative-space test over the **other** doors proves the feature is contained.
When a ticket's invariant is about withholding something, assert the withholding through every path
that returns the row, not through the path the feature uses.

---

## L-037 · Narrowing a door needs a reader census — and a hand-written cast will hide the breakage from `tsc`

**2026-08-23 · slug 0022 · `/ship` step 3, round 2 · caught by the `security` agent re-checking my own fix**

**Trigger** — removing or narrowing any RLS policy, grant, or view predicate. Also: reading a
PostgREST embed (`select("a, b, rel:fk(...)")`) whose row type is asserted with `as unknown as`.

**What I did.** L-036's fix narrowed `product_public_select` back to `profile_visible = true`. It
closed the leak exactly as intended and every SQL suite stayed green. What I never asked was **who
was still reading through the door I had just narrowed.**

`getMyBasket()` renders each line via a PostgREST **embed** off `public.product` — and an embed is
filtered by that policy. T07 deliberately admits a connected seller's HIDDEN product to the basket
when it carries a public price, so after my change that line could be **written but not read back**:
the embed returned `product: null`, the mapper did `r.product.id`, and `BasketProvider`'s bare
`.catch(() => setView(EMPTY))` blanked **the entire basket** — other sellers' lines included. No
error surfaced, because the *write* had succeeded. The rows stayed in the database where the UI
could no longer render them, so the user could not even delete them.

**Why it was wrong — the reasoning error.** I scoped the blast radius of a narrowing to the thing I
was narrowing it *for*. A policy is an interface with an unknown number of callers; tightening it is
a breaking change to every one of them, and the ones that break are the ones I did not enumerate.
The checklist already has this step — S4, "dependency scan before revoking" — and I ran it against
*policies* (does any policy depend on this?) while skipping the **application** readers entirely.

**Why nothing caught it.** `tsc` was blind because the row type is asserted with
`as unknown as Array<{… product: {id: string …}}>`, which declares `product` non-nullable — a cast
is a promise the compiler stops checking, and PostgREST embeds are exactly where that promise is
least safe. The SQL suites assert **admission** and never read a line back. The e2e basket spec is
three `test.fixme()` stubs that never execute. Every layer tested the write; none tested the
round-trip.

**The rule.** Before narrowing any read door, `grep` for its readers — `.from("<table>")`, embeds
naming it via a foreign key, and views/policies whose `EXISTS` resolves through it — and state what
each one does after the change. **A capability that can be written must be provable readable in the
same test**; assert the round-trip, not the write. And treat `as unknown as` over a query result as
a place where nullability has been asserted rather than checked — the widening of a policy is what
makes it true, so the narrowing is what makes it a lie.

---

## L-038 · A "single owner" of a rule is a claim about AGREEMENT, not about file count

**2026-08-24 · slug 0022 · `/ship` step 3 · caught by the `security` agent, round 4 of 4**

**Trigger** — extracting a rule into one function/module and describing it as "the single owner",
"the one place", or "so they cannot drift". Also: any fix whose justification is that two sites now
call the same helper.

**What I authored.** Round 3 pulled the product-visibility rule out of two drifting sites into
`product_visible_to_caller()`, consulted by both the basket write gate and the basket read
projection. The comment calls it "the single owner of the visibility rule for basket write AND
read." Round 4 proved it disagreed with `get_discoverable_shop` — the sanctioned door it was
supposed to be consistent with — on a predicate it never carried at all: the **seller company's**
`deleted_at` and `verification_status`. With the seller soft-deleted, the shop door returned zero
rows while the basket door returned the hidden product's current name, cultivar, PZN and price.

**Why it was wrong — the reasoning error.** I proved the two *callers* agreed with each other and
stopped. That is the cheap half of the claim. "Single owner" asserts something stronger: that this
function is now the authority for a rule that other doors also enforce — so the audit is a
**term-by-term diff against every other door that answers the same question**, not a check that the
new callers share a helper. Two sites agreeing is not correctness; it is only the absence of drift
*between those two*. A catalog query over which functions check `c.deleted_at` would have shown the
split in one line: three discovery functions `t`, all three new basket functions `f`.

**The rule.** When you extract a rule and call the result its single owner, enumerate every OTHER
site in the schema that answers the same question and diff the predicate lists. Any term present
there and absent here is a finding until ruled otherwise. **The extraction fixes drift between the
callers you moved; it silently creates drift with every door you did not.**

**Corollary — fixing under momentum at the tail of a run.** Rounds 1, 2 and 3 each introduced the
defect the next round found; round 4 found a fourth in round 3's fix. Every one was a *narrower*
version of the same question ("who may see this product"), answered one predicate at a time as each
round surfaced one. The budget assumed convergence. It did not converge — and it was round 4, run
only because STATE.md insisted on it against three green suites, that caught a live exposure. **Do
not treat consecutive green rounds as evidence the next round is unnecessary; treat a fix authored
at the tail of a long run as the most likely source of the next finding.**


---

## L-039 · The spec's acceptance criteria are not the slug's scope — scope is §8 MINUS what the gates removed

**2026-08-24 · slug 0022 · `/ship` step 7 · caught by `rollup`, against the G5 sheet I had just written**

**Trigger** — copying a criteria list, a requirements table, or an AC set out of a PRD/spec into any
downstream artifact: a walk sheet, a test matrix, a traceability table, a verification checklist.
Also: any sentence of the form "walk the spec's acceptance criteria".

**What I authored.** `/ship` step 6 says *"walk the spec's acceptance criteria on the LIVE URL."* I
took PRD §8's eleven criteria verbatim into `G5-WALK.md` as eleven tick-or-fail rows. **AC 9 was
split to its own slug at G3** and sits in STATE.md under *Deferred — must NOT be built*, with
`TICKETS.md`'s traceability row saying the same. The sheet would have failed the slug on a criterion
the slug deliberately does not own — and worse, it would have looked like a genuine regression on a
production walk.

**Why it was wrong — the reasoning error.** I treated the PRD as the current statement of scope. It
is the **original** statement of scope. Every gate between G1 and G5 can *remove* things from it —
G3 split AC 9 out, and that decision is recorded in STATE.md and TICKETS.md, not back-propagated
into the PRD. So the PRD stayed literally true as a spec and stopped being true as a work order. I
read one document where the fact lived in three, and the two I skipped were the two that had moved.

The instruction *"walk the spec's acceptance criteria"* is what made this feel safe: I was following
the skill verbatim, and verbatim was wrong. **A step that names one source document is telling you
where to start, not that the list is complete.**

**The rule.** Scope is the spec's criteria **minus what the gates removed**. Before copying any
criteria list downstream, reconcile it against the slug's deferral list and its traceability
table, and carry the reconciliation *into* the copy — strike the removed rows through with the
reason inline, never silently drop them, or the next person re-adds them from the same PRD.

**Corollary — the artifact staged for a human is the one to double-check.** Every other error this
session was caught by an agent before it reached anyone. This one was aimed directly at Muskan, on
production, where a false failure costs her a debugging session on a feature that works. **Staging
work for a human removes the reviewer; it does not remove the need for one.**
