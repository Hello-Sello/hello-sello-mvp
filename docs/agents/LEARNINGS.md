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

---

## L-040 · `git add -A <dir>` in a repo with parallel sessions commits someone else's work

**2026-08-24 · session 84 · T16 + T11 commits · caught by my own wrap, after both were pushed**

**Trigger** — reaching for `git add -A`, `git add .`, or `git add <dir>` in this repo. Also: any
commit made after a `git status` that showed files you did not touch.

**What I did** — staged with `git add -A src/` and `git add -A supabase/ docs/`. Two commits
swallowed a parallel session's in-flight work: `a50c318` ("T16: … types tell the truth about nulls")
carries **359 lines of the F-03 seller-visibility fix** — `visibility.ts`, `visibility.test.ts`,
`ProductCard.tsx`, `BuyerShopView.tsx`, `shop.ts` — and `97a9312` ("T11 …") carries the G5 walk's
`G5-WALK.md` and `STATE.md`. All pushed.

**What makes it worse than untidy** — I had ALREADY noticed those files. Earlier in the same session
I checked their mtimes, established they were written minutes before I started, said out loud that
they belonged to another session, and deliberately committed only my own paths. Then, four commits
later, a habit reached for `-A` and undid that decision silently. **A conclusion you reached about
the working tree expires the moment you stop naming files explicitly.**

**Why it is not fixable by rewriting** — both commits are pushed, and the parallel session may have
pulled. Rewriting history to tidy the record would risk the very work that got swept. The commits
stay; the record is corrected in the sync file and the session log instead.

**The rule** — in this repo, stage by explicit path, always: `git add <file> <file>`. `-A` and `.`
are banned. If a commit needs more than a handful of paths, that is a signal the commit is too big,
not a reason to widen the pattern.

**Second-order** — a swept file can also be silently invalidated by your own work. `visibility.ts`'s
header cites `product_public_select` as one of the two authoritative rules, and the T13 migration in
the commit two before it **deleted that policy**. Neither session has seen that yet.

---

## L-041 · A dependency scan must match the shape, not the common spelling of it

**2026-08-24 · session 84 · T13 · caught by re-running my own scan before revoking**

**Trigger** — writing any catalog query that answers "what depends on X?" before a REVOKE, a DROP,
or a policy narrowing. Especially one whose pattern encodes how the dependency is usually *written*.

**What I did** — to find every policy that would break when `product_public_select` was dropped, I
scanned `pg_policies` for `qual ILIKE '%from product%'`. Three hits, all re-pointed, suite green.
The scan was wrong: `plit_public_select` reaches product as
`FROM (pricelist_item pli JOIN product p ON …)` — a **join**, not a `FROM product`. A fourth policy
depended on the buyer's base-table read and my pattern could not see it.

**What made it visible** — not the pattern, and not the test suite. Re-running the scan with the
question widened to `ILIKE '%product%'` across every policy, because the first result (exactly three,
tidily matching the migration comment I had just read) felt too agreeable. The migration comment
said three; the database had four; the comment was written by someone with the same blind spot.

**Why it would have hurt** — `pricelist_item_tier` would have gone silently blank for every buyer.
Silently: RLS returns zero rows, not an error.

**The rule** — write the dependency scan against the *widest* form of the relationship and read the
extra hits, rather than the narrow form and trusting the count. A catalog scan is cheap; being
wrong about it is a production outage. And when a scan's result exactly matches a prose comment you
just read, that is a reason to re-run it differently, not to feel confirmed (L-014's neighbour: the
sweep that agrees with your expectation is the one to prove).

---

## L-042 · A pure planner is not a writer — "the code creates it" needs the INSERT, not the plan

**2026-08-25 · slug 0023 · `/design` ADR 0006 rev 1 · caught by `adr-checker` round 1 (B2)**

**Trigger** — writing any sentence of the form *"X always exists"*, *"X is created on every Y"*, or
*"a missing X is a broken invariant"* as the justification for code that **refuses** rather than
repairs. Also: citing a module named `plan*`, `derive*`, `build*`, `spec*` or `*Rollout` as evidence
that a row exists.

**What I authored.** ADR 0006 rev 1 had `send_deal` **raise** when a relationship had no c2c thread,
justified by: *"`rollout.ts:63-84` puts a c2c thread in **every** connection rollout. A missing c2c
thread is therefore a broken invariant, not a normal state."* I had grepped `rollout.ts`, seen `c2c`
in every returned spec, and read that as minting.

**`rollout.ts` writes nothing.** Its own header, at `:1-8`, says *"**Pure**: no ids, no timestamps,
no I/O — it returns a plain spec the store executes."* The actual `chat_thread` INSERT is issued
**by the browser** at `store.ts:623-633`, in a **second round trip** after
`accept_connection_request` returns (`store.ts:588-592`) — and that RPC mints the relationship and
no thread. So relationship-without-c2c-thread is reachable by closing a tab mid-accept, and rev 1
would have made that pair **permanently unable to send**, with no repair path in the product.

**Why it was wrong — and this is the uncomfortable part.** Two paragraphs *earlier in the same
document* I had refused `resolveC2cThread`'s docstring as evidence, citing L-006 (*a comment on the
read path is not a contract for the write path*), and then leaned on an even purer artifact: a
planner that returns a data structure. **Naming a rule does not mean you applied it.** I checked the
docstring's authority and never checked my own replacement's.

**The rule.** "This data always exists" is a claim about an **INSERT**. Find the statement that
writes the row — `insert into`, `.insert(`, `upsert` — and confirm it runs in the same transaction
as the thing that makes it required. A plan, a spec, a type, a config, or a returned array is not a
write. **And when the answer is "two round trips", the correct design is repair, not refusal**: the
fix that deletes a failure mode beats the fix that adds a test for one.

---

## L-043 · Changing a design decision can silently overrule an approved spec row

**2026-08-25 · slug 0023 · `/design` ADR 0006 rev 2 · caught by `adr-checker` round 2 (B1)**

**Trigger** — any fold-in that changes what the system **does** in a case the approved spec already
ruled on, especially an edge case. Also: writing a G3/G4 sign-off list, at the moment you notice it
contains only wording, naming, or cosmetic items.

**What I authored.** Round 1 proved rev 1's refusal was unsafe (L-042). Rev 2 replaced it with
resolve-or-create — the right call, and Muskan later ruled for it. **But `PRD:131` says, in an
approved spec:** *"The company-to-company conversation cannot be found | **Send must not report
success.** FR7 governs."* I changed that behaviour on engineering grounds and **did not put it to
Muskan.** Meanwhile §8 asked for her explicit yes on two things: an option's label string, and
whether an AC should say "Send" or "Create a draft deal".

**Why it was wrong.** I was following the fold-in rules correctly — verify the finding, prefer the
fix that removes a mechanism — and those rules are silent on *whose decision it is*. A checker
finding felt like a bug report, so the fix felt like a correction. It was not: it was a **product
behaviour change in a case the spec had already decided**, which makes it a deviation. That is
L-017's class (*an exception added to a criterion is a deviation, never a "correct reading"*), and
L-017 is written about criteria — I did not think of an **edge-case table row** as a criterion.
It is one.

**The tell, and it is a good one.** My sign-off list was all cosmetics. **If the only things you are
escalating are wordings, you have almost certainly absorbed a real decision** — a design pass that
changes behaviour and asks permission for nothing but labels has mis-sorted something.

**The rule.** After folding in checker findings, diff the ADR's behaviour against **every row of the
spec** — edge cases and constraints, not just FRs and ACs. Any row whose stated outcome changed goes
to the human as a **spec amendment**, named as such, before the cosmetic items. Then the amendment
gets a ticket: the spec must be edited, or G4 walks a document that contradicts the code (L-039).

---

## L-044 · Inverting a test's setup can gut a later assertion in the same file

**2026-08-25 · slug 0023 · `/design` ADR 0006 rev 1 §6.1 · caught by `adr-checker` round 2 (B3)**

**Trigger** — planning to **invert, remove or weaken** an assertion in an existing test file, and
writing that the file's *other* cases are "unchanged", "preserved verbatim", or "still valid".

**What I authored.** ADR 0006 §6.1 said `deliver_deal_test.sql`'s c2c case inverts (assert **zero**
tickets after `send_deal`), and that *"its idempotency case (`:130-144`) and its `WR-01`
execute-revoke case (`:146-158`) are about `deliver_deal` itself and **must be preserved
verbatim**."*

**The idempotency case has no setup of its own.** It calls `deliver_deal` **once** and asserts
exactly one ticket — which proves idempotency *only because* the earlier case's `send_deal` already
wrote that ticket. Invert the earlier case to zero and the single call becomes the **first** insert:
`v_n = 1` passes trivially, the test stays green, and `deliver_deal`'s `if not exists` guard
(`20260720095000:51-56`) is left **uncovered anywhere in the repo**. The rewrite must call
`deliver_deal` **twice**.

**Why it was wrong.** I read the file as a list of independent cases because it is written as one —
separate `DO $$` blocks with their own headers. But they share a transaction and a fixture, so an
earlier case is **later cases' setup**. "Preserved verbatim" is a claim about the *text*; what
matters is whether the assertion still *discriminates*. Worse, the failure is silent and in the
safest-looking direction: a green suite that proves nothing reads exactly like a green suite that
proves something.

**The rule.** When changing one case in a shared-fixture suite, trace **what every later assertion
depends on** — not just what it asserts. For each surviving case ask: *would this still fail if the
behaviour it names were broken?* If the answer needs the case you just inverted, the case needs its
own setup. **Copying an assertion forward unchanged is not preserving its coverage.**

---

## L-045 · A TODO listing what a migration does NOT do becomes a lie the moment someone does it

**2026-08-25 · slug 0023 · `/build` T01 · caught by the parallel security session, on a claim I
volunteered to it**

**Trigger** — citing a migration comment as evidence about **current** schema, grants or policy.
Especially one phrased as a follow-up: *"not in this migration"*, *"tracked follow-ups"*,
*"needs a view or table split"*, *"design decision pending"*, *"TODO"*, *"deferred"*.

**What I asserted.** Flagging a neighbouring risk to the security session, I wrote that
`line_all` is `FOR ALL TO authenticated` on a table carrying `seller_margin`/`buyer_metric`, with
column-hiding done by grant rather than policy — the L-036 class. My source was
`20260607170000_rls_policies.sql:20-21`:

    -- NOT in this migration (tracked follow-ups):
    --   * Seller-only COLUMN hiding (deal_line_item.seller_margin/buyer_metric,
    --     product.cogs) — needs a view or table split; design decision pending.

**All three clauses are false today.** `seller_margin` and `buyer_metric` are not on
`deal_line_item` — `information_schema.columns` returns exactly two rows for those names, both
`deal_line_item_private` (rls on, one policy `dli_private_all`, `company_id =
current_company_id()`). `cogs` is not on `product` — it is on `product_cost`, same shape. And
`product` itself now carries exactly one policy, `product_all`, owner-only. **The table split the
comment asks for was built; the comment was never retired.**

**Why it was wrong.** I know that a comment is not a contract (L-006) and I still read this one as
a fact, because of its grammar. A comment describing what code **does** is falsified loudly — the
behaviour changes, someone reads the comment beside the code, the mismatch is visible in one
screen. A comment describing what a migration **does not do yet** is falsified **elsewhere and
later**, by a different migration, in a different file, by a person who has no reason to open this
one. Nothing in the workflow ever routes back to it. So the two kinds of comment do not decay at
the same rate, and I treated them as if they did: a to-do that has been discharged reads exactly
like a to-do that is still outstanding, and the more confidently it is worded the more it reads
like a description.

**The rule.** A follow-up comment is evidence of **intent at authoring time**, never of present
state — and it is the single most stale-prone thing in a migration, because discharging it happens
somewhere else. Before citing one, resolve the object against the catalog
(`information_schema.columns`, `pg_policies`, `pg_class.relrowsecurity`), not against the prose.
**One catalog query outranks every comment in the repo.** Corollary for the writing side: when a
slug discharges a to-do that another file records, retiring that record is part of the work — the
alternative is a comment that will mislead every future reader with no failing test to stop it.

---

## L-046 · A generic best practice does not outrank an ADR that already rejected it by name

**2026-08-25 · slug 0023 · `/build` T01 · caught by the parallel security session, on an aside I
volunteered about THEIR ticket**

**Trigger** — about to recommend a security or schema default: `security_invoker`, RLS on,
`WITH CHECK`, a constraint, an index, "this should be a view", "this should be definer". Also:
adding any second claim to a message whose first claim you verified.

**What I asserted.** Reviewing nothing, holding no ticket, I closed a message with *"`security_invoker
= true` on that view is the right call, incidentally."*

**`docs/architecture/adr/0004…:239` had already rejected it, naming my exact failure mode:**
*"`security_invoker` on would zero out every buyer read (the `pricelist` owner-policy…)"*. `:236`
knowingly accepts the `security_definer_view` advisor finding that owner-rights produces; `:401-403`
books it as a deliberate consequence. Verified against the catalog, not the ADR text: `pricelist`
carries exactly one policy, `pricelist_all`, `USING (company_id = current_company_id())`, owner-only;
the view joins it. Under caller-rights every buyer read returns zero rows and the buyer price
surface goes dark. The view's actual `reloptions` is `security_barrier=true` — **the option I named
was not even present.**

**Why it was wrong — three mechanisms, and the third is the general one.**

1. **It was an aside, and it rode on a correct claim.** The same message correctly said to assert
   `reloptions`, because `create or replace view` silently drops the `WITH` clause — I had queried
   that. The unqueried second half inherited the first half's authority. **That is how a good
   message smuggles a bad claim**, and an aside carries no evidentiary burden in the writer's head
   and full authority in the reader's.
2. **Being outside my fence lowered my bar instead of raising it.** A bystander suggestion feels
   cheap to offer; it is not cheap to receive.
3. ⚠️ **But "outside my fence" is NOT the root cause** — the peer made the *identical* mistake
   **inside** their own fence, with the ADR sitting in their repo, while writing a rule about
   researching first. **The common factor was not whose ticket it was. It was that neither of us
   ran a query before recommending.** Ownership is no protection; familiarity is no protection.

**The rule.** A recorded decision in this repo outranks vendor guidance and general best practice,
and *"does it still hold?"* is a **query, not a reading** — `pg_policies`, `pg_class.reloptions`,
`information_schema`. Before recommending any default, grep the ADRs for the option name: an ADR
that rejected it will usually name it. **Corollary: an unresearched aside on someone else's ticket
is a recommendation. Research it or do not send it.** And when a message carries two claims, the
verified one does not vouch for the other — say which is which.

---

## L-047 · A test that goes red on a security fix may be asserting the bug

**2026-08-24 · HEL-69 · `/build` · caught in the neighbouring-suite regression run**

**Trigger** — a test goes red on a security or visibility fix, and the fix looks like the thing to
soften.

**What happened.** `current_pricelist_item` was changed to call `product_price_visible_to_caller()`
instead of reprinting the visibility rule inline. `pricelist_item_tier_test.sql` then failed:
*"public arm — verified Bob cannot see a fully public priced product."* Read from inside the suite,
that is a security fix breaking a legitimate buyer read — and the obvious move is to relax the fix.

**It was not.** The fixture inserted its product with `company_id`, `name` and
`supplier_product_code` only — **no `location`** — so the product was *unfiled*, and unfiled is
withheld from buyers. The cell called it "a fully public priced product"; the fixture never made it
one.

**What settled it was a door outside the suite.** `get_discoverable_shop` returns **0 rows** for that
product and always has. So before the fix the price view returned a row the shop refused: the suite
was green *because the two doors disagreed*, and what it was pinning was the divergence. Softening
the migration would have preserved the bug and the green tick together, and the next reader would
have found a test apparently blessing the behaviour.

**The rule.** When a test goes red on a visibility fix, do not decide from inside the suite which
side is wrong — **it cannot tell you.** Find an independent door onto the same question and ask it.
If the doors already disagree, the test is pinning the more permissive one; fix the fixture so it is
what the assertion says it is. Only weaken the fix once an outside oracle agrees the fix is wrong.

**Related.** L-044 is the same symptom by a different mechanism — there an earlier case was a later
case's setup; here a second door was more permissive than the one under test. Both are assertions
borrowing their truth from outside themselves. See also L-048, which is this failure one level up,
in the measurement rather than the assertion.

---

## L-048 · An A/B whose arms start from different states is not a weak experiment — it is not an experiment

**2026-08-24 · HEL-69 · `/build` · caught while trying to prove the e2e result**

**Trigger** — about to compare a before-run against an after-run: A/B-ing a test suite, benchmarking,
or proving a failure is pre-existing.

**What I did.** To show the view change broke no e2e, I ran `discover-shop.spec.ts` with the
migration applied, then removed the migration and ran it again. The two arms failed on **different
lines** — 195/222 versus 49/368 — and I came close to reading that as a real behavioural difference
worth investigating.

**It was not data at all.** The "after" arm ran on a database the full e2e suite had already mutated
(committed specs edit seed rows and never restore them — L-033), while the "before" arm ran on a
fresh `supabase db reset`. Two arms, two different starting databases. The comparison measured the
pollution, not the migration. Redone with a reset before **each** arm, the real result was the
opposite of what the first attempt suggested: 0 failures with the migration, and the baseline's
failures turned out to be stack-key rotation, not behaviour.

**Why it is seductive.** A confounded A/B does not look broken. Both arms ran to completion, both
printed output, both produced line numbers, and neither errored. There is no failure signal to
notice — the output has exactly the shape of a result, which is why it invites interpretation
instead of suspicion.

**The rule.** Before comparing two runs, state what is held constant and **verify it**, don't assume
it — here, one query (`pg_get_viewdef(...) LIKE '%product_price_visible_to_caller%'`) confirmed each
arm was genuinely in the state it claimed. Reset before **every** arm, never once at the start. And
when two arms differ in a way you did not predict, suspect the setup before the subject: an
unexplained difference is more often a confound than a finding.

**Related.** L-047 and L-044 are this same shape in assertions — a signal true only because of
something outside the thing measured. This one generalises furthest, because it applies to every
before/after comparison, not only to tests.


---

## L-050 · A coverage claim can be true inside a unit and false at its caller

**2026-08-25 · T02 / HEL-64 · `/build` · caught by `critic` (N1) after the test was already green**

**Trigger** — writing a test that proves a function picks the right one of two same-typed inputs,
and then describing that test as closing the class. Also: any sentence of the form *"case X closes
the Y confusion"* where Y can also occur in the code that CALLS the function.

**What I did.** `ConnectedCompany` carries both `companyId` and `relationshipId`. Both are `string`,
both compile, and a lookup keyed on the wrong one renders **identically green** in every render test
while shipping a control whose people list is empty forever. I extracted the mapping into a pure
`peopleForRelationship()` and gave it a **decoy fixture** — company A's `companyId` IS the target
`relationshipId` — so a `companyId`-keyed implementation goes red. That was a good test and it did
what it claimed.

**What it did not do.** `critic` pointed at the **call site**: change
`relationshipId={group.sellerCompanyId}` in the component that renders the control and *both* are
still `string`, `tsc` still passes, and **all seven unit cases still pass** — including the decoy,
because the pure function it tests is untouched. The shipped control's people list is empty forever,
which is exactly the state the ticket's headline invariant forbids.

**The shape.** Extracting a confusable choice into a tested function moves the confusion **up one
level**; it does not delete it. The test proves the callee. Nothing proves the caller passed the
right thing, and under a jsdom-less render env nothing can.

**What to do instead.** When you extract-and-test a same-typed choice, say in the plan **which level
the test closes** and put the caller on the uncovered list explicitly. If the caller is not
unit-reachable, it belongs in the e2e or on the human gate sheet — named, not implied. A "declared
uncovered" table that omits the level you did not close is worse than no table, because a reader who
accepts the decoy's rationale reasonably believes the whole class is shut.

**See also** [[L-038]] (a single owner is a claim about agreement, not file count) and
[[L-021]] (assert presence and absence on the same state).

---

## L-051 · Handing a gap to another ticket is a claim about that ticket's criteria — open it

**2026-08-25 · T02 / HEL-64 · `/build` · caught by `plan-checker` (B2) before any code was written**

**Trigger** — writing "covered by T0X", "already declared e2e by the ticket", "the walk will catch
it", or any deferral naming an owner. Also: a "declared uncovered" table with an `owner` column.

**What I did.** My plan declared the ticket's **headline invariant** — *"the control is never a dead
control"* — not unit-testable, and routed it to the e2e ticket with the words *"already declared
e2e by the ticket."* I had read that ticket earlier in the same session.

**It was false.** The e2e ticket's five acceptance criteria are entirely about a chat pill, an inbox
route and two existing specs. **None mentions a company with zero connected people.** And the local
seed has no such company either, while the human gate walk is locked to two companies that both have
people. So the invariant was declared uncovered, deferred, **and landed nowhere** — three separate
places each assuming one of the others held it.

**The shape.** A deferral reads like bookkeeping and is actually an assertion about a *different
artifact*, made from memory. It is the [[L-031]] shape ("the other copy is right" — and the other
copy was never opened) pointed at a ticket instead of a file. It survives review easily because the
sentence is about somewhere else, so nobody checks it where it is written.

**What to do instead.** Before naming an owner, **open that owner and find the criterion**. If there
is no criterion, you have three honest options and "defer" is not one of them: add the criterion to
that ticket, close it here, or put it to the human as an open ruling. Say which. And check the
**fixture** as well as the criterion — a criterion nobody can stage is not covered either.

**Ending worth recording:** the gap closed on **evidence, not a ruling** — `visual-verifier` built
the missing fixture (a throwaway zero-people company, hard-deleted after) and walked it live. The
correct deferral would have been "no owner, needs a fixture", which is exactly what got built.

**See also** [[L-039]] (scope is the gates' output, not the spec's AC list) and [[L-050]].

---

## L-052 · A ticket's own suggested fix is a hypothesis, and a security ticket's is the one most likely to be believed

**2026-08-25 · HEL-67 / HEL-70 · `security_tickets` session · caught by a write-path census, before any code**

> **Numbering note:** this is **L-052**, not L-049. **L-049 is an unclaimed hole** — session 89 wrote
> "L-049 is next free", nobody took it, and session 90 then wrote L-050 and L-051. The gap is left
> **deliberately**: back-filling it would make the sequence non-chronological and erase the evidence
> that this file has a monotonic key and no allocator. That gap is the open convention question,
> made visible instead of tidied away.

**Trigger** — a ticket containing a fenced `sql` block, a "suggested fix", or a predicate sketch,
*especially* one written by a previous careful session that already listed the traps. Also: any
ticket phrase of the form "X is service-role only" or "only the system writes X".

**What happened, twice in one session.**

**HEL-70** said four discovery doors. There were **five** — `list_discoverable_people` gated on the
same two terms and had never been redefined, so a deactivated company's *people* stayed discoverable.
Building the ticket as written would have shipped a "single owner" that four of five doors agreed
with, which is the exact defect the ticket existed to fix.

**HEL-67** sketched `type NOT IN ('deal_detected', ...)` with the gloss *"Sella-authored types,
service-role only"*, and separately `sender_person_id = auth.uid()`. A census of every
`chat_message` INSERT reachable as `authenticated` killed **both**:

- Five of six Sella-or-system-voiced types are written **by an ordinary browser session**
  (`intro`, and four deal-lifecycle pills from `announceDealEvent`). Banning "Sella-authored types"
  would have broken the deal pills and connection-accept outright.
- The ticket flagged that `sender_person_id` is nullable for system lines and said the predicate must
  be "conditional on `sender`". True, and **not enough**: the accept rollout inserts a
  `sender = 'person'` message whose author is the **requester, not the caller** (`rollout.ts:179`).
  So the sketch breaks connection-accept even in the case it was scoped to.

**The shape.** A ticket's suggested fix is written from the *reading* side — someone traced how a
value is consumed, then inferred who must produce it. The inference is from **naming and intent**
("Sella-authored", "system message"), not from the write path. Naming describes a *voice*; RLS
governs a *writer*; the product routinely has one identity speak in another's voice. On a security
ticket this is more dangerous than elsewhere, because the sketch arrives pre-justified — it was
written by a session that had just done real work, it names real traps, and it makes the fix look
like transcription rather than design.

**What to do instead.** Before implementing any suggested predicate, **enumerate every write site
that reaches the table as the role being narrowed**, from source, and tabulate the actual column
values — not the ones the type names imply. Then check the sketch against the table. If the sketch
survives, you have lost twenty minutes; if it does not, you have avoided shipping a gate that breaks
production or a fix that half-closes a class while reading as closed.

**And when the census kills half the ticket, say which half and why it is BLOCKED rather than
deferred.** HEL-67 Gap 2 is not "not done yet" — it is unbuildable until [[L-037]]'s reader census
has somewhere to move those writes ( HEL-68 ). Recording it as blocked, with the counterexample line
number, is what stops the next session re-deriving the same dead end.

**See also** [[L-038]] (a single owner is a claim about agreement with the other doors),
[[L-006]] (a comment on the read path is not a contract for the write path), [[L-026]] (verify the
REASON for a guard as hard as the guard), [[L-051]] (a deferral naming an owner is a claim about that
owner) and [[L-031]].

---

## L-053 · A teardown copied from a precedent inherits that precedent's REFERENCES, not just its shape

**2026-08-25 · slug 0023 · T03 / HEL-65 · `/build` step 3 · caught by `plan-checker` (B1) before any code was written**

**Trigger** — copying a fixture's `afterAll`/`afterEach` teardown from another spec, or writing
any hard-delete order for rows you created. Also: the phrase "the clean pattern is `<file>:<lines>`"
appearing in a plan.

**What I did.** T03 must not become the fourth seed-mutating spec (HEL-73), so the plan created its
own product and hard-deleted it after, citing `e2e/discover-shop.spec.ts` as the clean pattern and
copying its delete order verbatim: `product_basket_line` → `pricelist_item` → `product`.

**It cannot execute.** `deal_line_item.product_id → product(id)` carries **no `ON DELETE` action**
(`20260607090005_fk_alters_triggers.sql:22-24` — the constraint has no clause at all, so it is
`NO ACTION`). My walk *drafts the fixture product onto a deal*, so at teardown a live
`deal_line_item` still references it and `delete from product` raises **`23503`**. The precedent's
product is only ever added to a basket and viewed — **it is never drafted onto a deal**, so its
three-step order is complete *for its lifecycle* and incomplete for mine.

**Why it matters more than a failed delete.** The delete was fire-and-forget, with no `error`
check — the shape the precedent also uses, because there it never fails. So the throw would have
been swallowed, the product would have survived every subsequent run, and the spec would have
become **exactly the seed-mutating spec the plan opened by promising not to write.** The failure
mode is silent and lands in the safest-looking direction: a passing suite that is quietly
corrupting the shared seed for every later file.

**The shape.** A teardown is not a reusable snippet. It is a claim about **the full set of rows
that now reference your fixture**, and that set is determined by *what your test does to the
fixture*, not by what the file you copied from does to its own. Two fixtures of the same table can
need different teardowns.

**What to do instead.** Before copying a delete order, enumerate the FKs pointing at your
fixture's table and ask **which of them your test causes to be written** — the precedent can only
tell you about the ones *its* test writes. Delete children the test creates before the parent, and
**check every delete's error**: an unchecked delete in a teardown is an assertion you never make.

**See also** [[L-033]] (a seed row is not a stable fixture until you grep what mutates it) — this
is its mirror image: a fixture *you* create is not clean until you grep what references it.

---

## L-054 · "Built and green" names a database state — say which stack, and whether another branch can reproduce it

**2026-08-25 · HEL-67 · `security_tickets` · caught by `deal_land_t02` cross-checking the claim, after I had already reported it to Muskan**

> **Numbering:** L-054. L-053 was taken by the parallel session in the same hour, announced before
> writing. [[L-049]] remains a deliberate hole — see [[L-052]].

**Trigger** — writing "built", "green", "N/N passing", or "applied" about anything that lives in the
local database rather than in a file: a migration, a policy, a grant, a seeded fixture. Also: any
handover between parallel sessions that says a suite passes.

**What I did.** I reported HEL-67 as built and green, with a full-suite A/B (45/0 applied, 44/1
reverted). All of that was true. The parallel session then said its stack's tip was `20260825110000`
with no `20260825120000`, and asked which database my green came from — declining to theorise past
its own measurement.

**Both measurements were correct, and that is the finding.** The *policy* was live on the shared
stack; the *migration row* had never been stamped, because I applied the SQL with `psql` and skipped
the `schema_migrations` insert I had correctly done for the two migrations before it. So *"is it
applied?"* answered **yes** against `pg_policy` and **no** against `schema_migrations` — one database,
two facts, and the peer had queried the one I left inconsistent.

**Chasing the discrepancy found the real hazard, which was not the stamp.** The migration *file*
exists only on my branch. A `db reset` from the other tree would silently revert the gate; and until
then, that branch was running its tests against a policy its own tree does not contain. Neither
direction produces a conflict, a warning, or a file collision — every detection mechanism this repo
has is file-level, and a shared Postgres is not a file. See `ARCHITECTURE-NOTES.md` 2026-08-25.

**The part I want the next session to sit with.** The hazard surfaced **only because I skipped a
step**. Had I stamped correctly, both sessions would have seen agreement, and the divergence would
have stayed armed and silent. **A detection mechanism that depends on someone forgetting something is
not a detection mechanism.** The lesson is emphatically *not* "skip the stamp" — it is that we had no
real mechanism here at all, and got lucky.

**What to do instead.** Two habits, both cheap:

1. **Stamp at apply time**, every time, so the database is self-consistent — then the ledger table is
   worth querying and disagreement means something.
2. **Qualify every green with its stack.** "45/0 on the shared local stack, which carries a migration
   that only branch X contains" is a different and more honest claim than "45/0". If another branch
   cannot reproduce it, that belongs in the same sentence as the number — not in a footnote, and not
   left for a peer to discover.

And when a peer reports a measurement that contradicts yours, **measure again before explaining**.
The explanation here would have been right and would still have missed the hazard; only the second
query — *does the other branch even have this file?* — found it.

**See also** [[L-033]] (a green run is only evidence for the DB state it ran against — this is that
sentence at the schema level), [[L-048]] (an A/B whose arms start from different states is not an
experiment), [[L-040]] (parallel sessions on one branch) and [[L-052]].

---

## L-055 · A subquery inside an RLS policy runs as the CALLING role — so a liveness check written that way is silently a visibility check

**2026-08-25 · HEL-75 · `security_tickets` session · caught by measuring the policy before trusting it, after the code was written and before it was committed**

> **Numbering:** L-055, announced to the parallel session before writing. [[L-049]] is still a
> deliberate hole — see [[L-052]].

**Trigger** — writing or reviewing any RLS policy whose `USING` or `WITH CHECK` contains a subquery,
`EXISTS`, or `IN` against **another table**. Also: any ticket that proposes one, and any sentence of
the form *"just add an `EXISTS` on `<other table>`"*.

**The mechanism, which is not obvious and is not what most people assume.** A policy expression is
evaluated with the privileges and the **row-level security context of the caller**, not of the table
owner. So when policy `A` on table `A` contains `EXISTS (SELECT 1 FROM B …)`, table `B`'s own RLS
applies to that subquery. The predicate does not ask *"does this row of B exist?"* — it asks
**"does this row of B exist AND may the caller see it?"** Those two questions are different, and the
gap between them is invisible in the SQL.

**What happened.** HEL-75 needed `inbox_insert` to refuse a connection request addressed to a
soft-deleted or deactivated company. The ticket sketched the obvious thing:

```sql
AND EXISTS (SELECT 1 FROM public.company c
             WHERE c.id = receiver_company_id
               AND c.deleted_at IS NULL AND c.deactivated_at IS NULL)
```

`company` has RLS, and `company_select` shows `authenticated` only its own company, HS-team rows, and
companies it already `shares_connection_with_company()`. **A company you have never met is
invisible.** So the predicate collapsed into *"may I already see this company?"* — which, for a
connection request, is precisely backwards: **the entire point is that you have not met them yet.**

Measured, on the seeded stack, as Alice @ GreenLeaf — the numbers are the finding:

| probe | result |
| -- | -- |
| direct `SELECT` on `company` | **5 of 6 rows**; PendingCo absent |
| inline `EXISTS`, connect → PendingCo (live, unverified) | **REFUSED** — a legitimate request |
| inline `EXISTS`, connect → NordCanna (deactivated) | refused — **but by the wrong term** |

**The second row is the bug and the third row is why it would have shipped.** Against the seed, the
sketch *looks* correct: the deactivated company is refused, every control the author thinks to try is
a company they already share a connection with, and those all pass. The failing case only appears for
a receiver the sender has never met — which no existing suite had a fixture for, and which is the
product's primary flow.

**The fix is a SECURITY DEFINER helper**, which is also the shape this repo had already converged on
for the same problem (`product_visible_to_caller`, `product_price_visible_to_caller`). Stated as a
rule: **if a policy needs a fact about a row the caller is not entitled to read, that fact must come
from a definer function.** Inline `EXISTS` is only safe against a table with no RLS, or when you
positively intend the caller's visibility to be part of the predicate.

**Why this is not just [[L-052]] again.** L-052 says a ticket's suggested fix is a hypothesis; that is
about *provenance*. This is about a **mechanism** that makes a whole class of suggested fixes wrong in
a way that reads correct, passes review, and passes any suite whose fixtures are all already-connected
pairs. Two independent sessions wrote this same predicate shape from two different directions.

**The test discipline that caught it, and the part worth copying.** The suite is red-first in *both*
directions: one cell (`B1`) reproduces the original bug against the pre-fix policy, and a second cell
(`A4`) fails against **the fix the ticket proposed**. A suite that only proves the bug is gone cannot
tell you that you closed it with the wrong instrument. **When a ticket ships a suggested predicate,
add the cell that kills the suggestion** — otherwise the only evidence against it is the reasoning of
whoever happened to look.

**See also** [[L-052]] (a ticket's suggested fix is a hypothesis — same ticket family, same hour),
[[L-038]] (a single owner is a claim about agreement with the other doors), [[L-027]] (a gate is only
as strong as the write path to its input), [[L-026]] (verify the REASON for a guard as hard as the
guard) and [[L-006]].

---

## L-056 · A fixture that hardcodes a seed-generated id passes by accident on the day it's written, then goes red-for-the-wrong-reason forever after

**2026-08-25 · `/ship 0023` gate · caught by `test-runner` running the full suite before a production push**

**Trigger** — writing (or reviewing) any SQL test fixture that embeds a literal UUID for a seeded
person or company, and any ship/gate run comparing SQL suite results against a "known baseline"
count.

**What happened.** Three brand-new suites — `deal_line_item_write_lockdown_test.sql` (DEV-159),
`inbox_insert_receiver_gate_test.sql` (HEL-75), `msg_all_deal_detected_gate_test.sql` (HEL-67) —
each hardcoded a literal UUID for Clara Vogt / Rheinland Apotheke / NordCanna / Bavaria / the
Alice↔Bob p2p thread. `seed.sql`'s fixed-UUID block (the header comment listing Alice, Bob,
GreenLeaf, StonePharm) only covers those four; everything seeded later — Clara's `auth.users` row,
the three "5b" companies, every `chat_thread` — is `gen_random_uuid()`, different on every single
`db reset`. Two of the three suites aborted at their own fixture guard before running a single real
assertion; the third (HEL-75) didn't abort, proceeded to INSERT against a UUID matching no real
company, and got a spurious RLS-violation "pass" on a control cell for the wrong reason. **The
consequence that matters: DEV-159's suite — the one meant to prove a live production security hole
was closed — never ran its actual assertions.** The REVOKE it was shipping alongside had zero
automated verification at the moment it was about to go to prod.

**Why it looked fine for a while.** Whoever wrote each suite ran it once, against whatever the DB
happened to contain at that moment (a prior reset, mid-session state, or literally copy-pasted a UUID
off a screen) — RED-then-GREEN, looks done. The fixture only breaks on the *next* `db reset`, which
is exactly the gate step that runs right before a production push, and by then the author's session
had usually already closed. Nothing about a passing suite at authoring time proves it survives a
reset; a suite result is only as good as the reset regime it was measured under.

**The fix, and why it's the right shape.** Replace the literal with a lookup against the identifying
fact that IS stable — email for a person, `name` for a company, membership for a thread — matching
the pattern the same files already used correctly for their JOIN/WHERE clauses on `company.name`.
Not just in the fixture's own CTE: all three files also had the SAME stale literal repeated in
`set_config('request.jwt.claims', ...)` calls lower down, setting the RLS-impersonated identity to a
person who doesn't exist — a literal that compiles and runs without error, so it does not announce
itself as wrong the way a JOIN-based miss does.

**The rule** — a fixture identifier is only safe to hardcode if `seed.sql`'s own fixed-UUID block
(check the header, don't assume) assigns it explicitly; anything created later via a bare `INSERT`
or `SELECT … gen_random_uuid()` must be looked up by name/email at suite-run time, in EVERY place
the suite uses that identity — not just the first.

**See also** [[L-012]] ("as seeded" is a claim about data — grep the seed before asserting against
it, same family: unverified assumptions about fixture state), [[L-013]] (a green suite proves
nothing if its harness never fired — same family: a suite that "passes" without exercising its real
assertions), [[L-034]] (a migration's end state on replay is not its end state on push — same
lesson, different layer: state that's true today is not a proof about state after the next reset).

---

## L-057 · Moving a write behind a SECURITY DEFINER RPC must re-import everything the RLS policy was checking, not just the one thing the ticket is about

**2026-08-25 · HEL-81 · caught by a second adversarial review round, independently by both `critic` and `security`**

**Trigger** — replacing a client write path that was governed by an RLS policy with a
SECURITY DEFINER RPC, for ANY reason (closing a hole, adding atomicity, adding a business
rule). The RPC bypasses RLS entirely — it doesn't inherit the policy's predicate, it replaces
it with whatever the function body happens to check.

**What happened.** HEL-81 moved `deal_line_item`'s one remaining client INSERT behind
`accept_promotion`, gated on "is the caller the buyer." That's the property the ticket was
about, and it was correct. But `line_all`'s real predicate,
`card_relationship_member(deal_card_id)`, was never *just* membership — it was membership
AND `(status <> 'unsent' OR initiating_company_id = current_company_id())`, a second clause
letting a card's own initiator act on their private draft while blocking the counterparty
from a card they can't even read yet. `accept_promotion` (and, once written, `offer_promotion`
/`decline_promotion`) checked buyer/seller equality only — narrower than the RLS predicate it
replaced, silently. Verified live: the second review round constructed an unsent card and
had the non-initiator buyer successfully accept a promotion on it, landing a line in a deal
it has no read access to.

**Why it looked fine.** The ticket's own probe (a rolled-back reproduction of the forgery)
only exercised the *buyer/seller* dimension, because that's the dimension the ticket is
about. Nothing in that probe, or in a first read of the new function body, would surface a
guard the OLD policy had that the NEW code doesn't — you have to go looking for what else
the policy checked, not just confirm the new code checks what you meant it to.

**The fix, and why it's the right shape.** Call the original policy's own predicate function
from inside the definer (`IF NOT card_relationship_member(p_deal_card_id) THEN RAISE ...`)
as an explicit, separate gate alongside the buyer/seller check — don't re-derive or re-type
the `unsent` clause a second time (that's the same drift risk a column-allowlist re-GRANT
has, [[L-027]]'s family). The predicate has one owner; import it, don't restate it.

**The rule** — before retiring an RLS policy in favor of a definer function, read the
policy's FULL expression, not just the clause the current ticket cares about, and account
for every clause in the replacement — either by calling the same helper the policy called,
or by naming explicitly, in the migration's own comment, which clause was deliberately
dropped and why. A definer that only re-implements the part you were thinking about is a
narrower door than the one it replaced, and nothing will fail loudly to tell you.

**A second, smaller catch from the same review round, same family.** Round 1's own fix added
an `ORDER BY created_at DESC, id DESC` tiebreak to the RPCs reading "the pending promotion" —
correct in isolation, but it left the READ side (`getPromotion`, no state filter, no
tiebreak) newly disagreeing with the WRITE side about which row is "the" one on a tie, a
mismatch that didn't exist before because neither side had a tiebreak. The fix that
actually closed it wasn't a matching tiebreak on the reader — it was a partial unique index
(`(deal_card_id) WHERE state = 'pending'`) making "which pending promotion" a question with
only one possible answer, so neither side needs a convention to agree on. When two readers
of the same "current X" concept can disagree, prefer a constraint that makes X unique over
a matching tiebreak rule on both sides — a rule that must be kept in sync in two places will
eventually only be updated in one.

**See also** [[L-052]] (a policy predicate is a question about what the caller can see —
same family: don't assume a security-relevant predicate does only the obvious thing),
[[L-055]] (a subquery in an RLS policy runs as the calling role — same family: RLS mechanics
are easy to mismodel when you're not looking directly at them), [[L-027]] (a gate is only as
strong as the write path to its input — the confused-deputy half of this same ticket).

---

## L-058 · Closing a delivery gap on the function the ticket names doesn't close it on every function with the same effect

**2026-08-25 · HEL-74 · caught by `critic`, first review round**

**Trigger** — a ticket names one RPC as "the door that delivers X" and you gate that RPC. Before
declaring the gap closed, ask: does anything ELSE in the codebase produce the same effect?

**What happened.** HEL-74 asked for `send_deal` to refuse delivering a new deal onto a
suspended/ended relationship — a straightforward re-emit with one added check, and it worked. But
`confirm_detected_deal` (Sella's double-accept path) also births a card straight into
`negotiation` — by design it must NEVER call `send_deal` (its own header says so: the caller is
the confirmer, not the initiator, and `send_deal`'s initiator guard would reject it). The first
draft's migration header scoped OUT `create_deal_draft`/`confirm_deal_change`/`sign_deal`
deliberately and by name — and simply never considered that a second, independent delivery path
existed at all. Nothing in the ticket's own text or the `send_deal` diff would have surfaced this;
it only came up because a reviewer asked "what else in this codebase delivers a deal" as a
question, not as a check against the diff.

**The rule** — when a ticket gates one function against an effect ("deliver a deal," "grant a
promotion," "mint a relationship"), grep for every OTHER function that produces the SAME effect
before writing the migration header's scope paragraph. A scope paragraph that lists what it
deliberately excludes is only trustworthy if it was built from a census of doors, not from the
ticket's own vocabulary — the ticket names the door it found, not the doors it didn't know about.

**See also** [[L-037]] (narrowing a read door needs a reader census first — same shape, applied to
delivery/write effects instead of reads), [[L-057]] (a definer replacing a policy must re-import
every clause, not just the one the ticket is about — same family: the diff you wrote is not the
same question as "is the thing actually closed").

---

## L-059 · Reusing an existing page for a new caller class is only safe if you check what ELSE reads that same table without an explicit membership check

**2026-08-25 · HEL-82 · caught by `critic` + `security`, both independently, first review round**

**Trigger** — adding `OR is_hs_team()` (or any similar `OR <new-caller-check>`) to an existing
RLS policy's `USING` clause, to let a new caller class reach an existing page/table.

**What happened.** The first draft of HEL-82 needed an HS-team operator to view a relationship
they aren't a party to. The instinct — reuse the existing `/connect/relationship/[id]` page rather
than build a new one — was right (and came from direct feedback: don't build new UI when an
existing page can absorb the change). The mechanism chosen to make that page work for HS staff —
broadening `rel_all`'s `USING` with `OR is_hs_team()` — was wrong, for two independent reasons
review found: (1) the page was unreachable anyway, since the whole `/connect` tree sits behind
`requireVerified()`, which the seeded companyless HS account never passes; (2) even if reachability
were fixed by giving HS staff a company, three OTHER relationship readers
(`messaging/supabase/store.ts`, `messaging/supabase/connections.ts`,
`basket/supabase/reads.ts`) have no explicit membership check of their own — they rely entirely on
RLS scoping the row down to "my company's relationships" for them. Broadening the shared RLS
predicate for one new caller class would have silently broadened what ALL THREE of those readers
return, none of which expected a non-member row to ever appear.

**Why it looked fine.** `rel_all` is the only policy on `relationship`, so broadening it looked
self-contained — it changes what one table's RLS returns, full stop. The blast radius isn't in
`relationship`'s own policy; it's in every OTHER query that trusts RLS on that table to imply
"caller is a real member," which is a fact those queries never verify themselves.

**The rule** — before broadening a shared RLS predicate to admit a new caller class, census every
reader of that table for an implicit "RLS already proved membership" assumption, the same way
[[L-037]] asks for a reader census before narrowing. When the new caller class doesn't belong in
the general population the table's OTHER readers assume (an HS operator among ordinary company
members), prefer a dedicated SECURITY DEFINER read (here, `list_relationships_admin()`, same shape
as the existing `list_pending_verifications()`) scoped to exactly the new caller, over widening a
policy every unrelated reader also depends on.

**See also** [[L-037]] (the read-side twin of this — narrowing needs a census, broadening needs one
too), [[L-038]] (a "single owner" of a rule is a claim about agreement with the other doors — this
is that claim failing in the opposite direction, an addition rather than a narrowing).

---

## L-060 · A live smoke test against a real authenticated client is stronger evidence than SQL impersonation — and a real committed side effect, not a rollback

**2026-08-25 · HEL-82 · self-caught, by the suite's own exact-count assertion on the next run**

**Trigger** — verifying a built feature works by signing in as a real seeded user through the
actual client library (not `SET LOCAL ROLE` + `set_config('request.jwt.claims', …)` inside a SQL
transaction) against the local dev stack.

**What happened.** Every SQL suite in this repo runs inside `BEGIN…ROLLBACK` — zero net seed
mutation is the house discipline (L-033). A quick Node script using `@supabase/supabase-js` to
sign in as the seeded HS reviewer and call `suspend_relationship`/`reactivate_relationship`
directly was genuinely useful — it proved the real auth+JWT path reaches `is_hs_team()` and the
RPCs correctly, which a SQL suite's `set_config` impersonation can approximate but never fully
prove. But that script talks to the local Postgres/PostgREST stack over the network, as a real
client — there is no transaction wrapping it, and nothing rolled it back. It left 4 real,
committed `audit_log` rows behind. The very next run of `relationship_admin_suspend_end_test.sql`
failed its own `B3/audit: expected 2 audit_log rows` assertion — count 4, from the suite's own 2
rows plus the smoke test's leftover 2.

**Why it wasn't obviously wrong at the time.** The script's whole job was to prove a real
end-to-end path works, which by construction means it isn't sandboxed in a rollback the way the
SQL suites are — that's the exact thing that makes it more convincing than a SQL suite. It's easy
to reach for it as "just another verification step" and forget it carries a real side effect the
SQL suites don't.

**The rule** — a script that authenticates as a real user through the actual client library and
calls real RPCs over the network is not covered by "the test suites already roll back." Either
wrap it in the same discipline (open a transaction and roll it back — awkward across a network
client, but not impossible for local Postgres) or, simpler on a local dev stack, run
`supabase db reset` immediately after and re-verify the SQL suites before treating the branch as
clean. Don't assume a passing SQL suite run AFTER a manual client-side probe is telling the truth
about a fresh baseline — it might be counting the probe's own leftovers.

**See also** [[L-033]] (zero net seed mutation is the suite discipline this script fell outside
of).

---

## L-061 · Tests are what make dead code look alive

**2026-08-25 · session `workflow_retro` · found by an inbound-import census, not by review**

**Trigger** — before concluding a module is in use, or before a cleanup pass decides what to
keep. Check **inbound imports**, not test coverage.

**What I did** — audited `src/` for unreferenced files and found eight, totalling 1,111 lines.
Two of them — `deals/lib/finalize.ts` and `deals/lib/lineEditing.ts` — were imported by
**nothing except their own test files**, and those tests carried **23 passing assertions** that
ran on every `vitest` invocation. They had survived several review passes and a slug rollup.

**Why it wasn't obviously wrong at the time.** A file with no importer and no test reads as
suspicious — someone deletes it. A file with 17 green tests reads as load-bearing, because green
tests are the signal we are trained to trust. The tests didn't cause the rot; they **camouflaged**
it. `DocumentsTab.tsx` and `ProductList.tsx` compounded it differently: their only surviving
mentions were *stale comments in live files* (`deals/actions.ts:68`, `CardFront.tsx:14`), which a
grep for the name finds and a human reads as evidence of use.

**The rule** — "is this used?" is answered by inbound imports, and only by inbound imports. A test
file is not an importer; a comment is not an importer. Verify a static scan is authoritative first
(this repo has **zero** dynamic imports in `src/`, so a grep is), then delete and let the suite
adjudicate: the unit count must fall by **exactly** the number of tests the deleted modules owned.
497 → 474 = exactly 6 + 17 was the proof the cut was surgical; any other number means something
live was touched.

**The counter-case, which matters as much.** `getProductBatches()` also had zero callers and was
**kept**. It is the real batch reader for a picker currently faking its options
(`CardFront.tsx:224` — *"FRONTEND-ONLY mock option lists"*). Unreferenced code is either
**superseded by something that shipped** (delete) or **the correct implementation of something
currently faked** (keep, and file the wire-up). Deleting the second kind removes the good version
and leaves the mock.

**See also** [[L-013]] (a green suite proves nothing if it never runs), [[L-062]].

---

## L-062 · A severity word with four authors and no owner is not a severity word

**2026-08-25 · session `workflow_retro` · found by mapping the term before changing the rule**

**Trigger** — before tuning any rule that counts a term (`blocking`, `critical`, `ready`,
`done`), find every place that term is *produced*, not just where it is consumed.

**What I did** — the checker loop had failed to converge on eight consecutive tickets, and the
dry-run's own series showed why the stopping rule could never fire: findings 11·15·15·14·15·14·12,
blockers 5·8·4·6·6·8·4, over seven rounds. I diagnosed it as *"`adr-checker` doesn't define
`blocking`"* and was about to fix that one file. Mapping the term first showed **four** agents
emit `blocking` — `adr-checker`, `plan-checker`, `security`, `critic` — and **only `critic`
defined it**, and only because it had been rewritten hours earlier the same day.

**Why it wasn't obviously wrong at the time.** Every agent file looked complete on its own. Each
said `Severity: blocking | note` and moved on, which reads as a convention being referenced rather
than a definition being omitted. The gap is only visible when you line all four up. Meanwhile the
orchestrator's rule — *"stop at the first round with zero NEW blocking findings"* — looked precise,
because it named a specific severity. It was counting a word with four private meanings, and had
never once been satisfied in roughly fifteen attempts.

**Why the rule was unfixable without the definition.** With no threshold, anything a checker felt
strongly about became `blocking`, so the count could not decay. The dry-run had already measured
the real signal — *find-rate is flat, **severity** decays: leaks → silent failures → won't-run →
behavioural edges → contracts/wording* — but the rule read the axis that does not move.

**The rule** — a rule that counts a term owns that term. Give it exactly one definition, in one
place, and **name the mirrors**. Here: a five-rung ladder owned by `PIPELINE.md` §10 and copied
verbatim into all four agents, with each copy carrying a line saying where the owner is. The
duplication is deliberate and declared, because an agent file is a system prompt and a threshold
the checker does not hold in context is a threshold it will not apply — four *undeclared* copies
is what that replaces, not what it creates.

**See also** [[L-038]] (a "single owner" is a claim about agreement, not about file count),
[[L-061]].

---

## L-063 · An approved ADR's own findings are authoritative — re-deriving a build plan's citations from scratch can silently undo them

**2026-08-27 · slug 0026-relationship-write-gate · `/build` step 2/3 · caught by `plan-checker` round 1**

**Trigger** — writing a `/build` plan that implements an already-approved ADR, and citing a
function/table/policy the plan-writer re-verified independently rather than copying forward
from the ADR's own Blast-radius / call-site table.

**What I did** — ADR 0008's Blast-radius section, written and reviewed two rounds earlier
in this same session, says explicitly: *"`propose_deal` was in an earlier draft of this
list and is removed... the function was `DROP FUNCTION`ed in
`20260724120800_drop_propose_edit_rpcs.sql`... Named here so `/build` doesn't write
`create or replace function public.propose_deal(...)`, which would silently resurrect a
`SECURITY DEFINER` door around `msg_all`'s own gate."* Writing the build plan minutes
later, I re-grepped for `propose_deal` myself, found its `CREATE OR REPLACE` (real), did
not check for a *later* `DROP`, and put it back in the plan's call-site table — the exact
mistake the ADR's own text names by filename and explains the consequence of.

**Why it was wrong** — I treated "cite the live files" as meaning "re-derive every fact
from scratch," when the ADR had already done that derivation, been checked twice, and
recorded the corrected answer with its reasoning. Re-deriving instead of copying forward
doesn't add rigor — it discards a correction that already cost two review rounds and
reintroduces the exact defect those rounds exist to prevent. A fresh grep is not automatically
more reliable than a prior verified one; it's just a chance to repeat the same incomplete
check (this time: "does the CREATE exist" without "does a later DROP exist").

**The rule** — when a build plan implements an approved ADR, the ADR's Blast-radius / Locked
/ call-site sections are the source of truth for "which functions/tables does this touch,"
not a citation to re-verify from zero. Read them, copy the conclusion forward, and cite the
ADR itself as the reason. Only re-derive when something has changed since the ADR was
approved (a new commit landed, time has passed) — and even then, re-derive by checking
whether the ADR's *specific claim* still holds, not by repeating the same search from
scratch and hoping it's more careful this time.

**See also** [[L-041]] (a dependency scan must match the widest shape of the relationship,
not the common spelling — the same root cause: checking for existence and not for the thing
that would invalidate it), [[L-045]] (a comment claiming what a migration does NOT do
becomes a lie the moment a later migration does it — `propose_deal`'s drop is the mirror
case: a citation claiming a function DOES exist becomes a lie the moment a later migration
removes it).

---

## L-064 · A deny-test that catches on SQLSTATE alone can pass for the wrong reason — an invoker-rights function's 42501 is not proof of its own GRANT

**2026-08-27 · slug 0024-c2c-thread-atomicity · `/ship` step 3 · caught by `security`**

**Trigger** — writing a deny-test for a function that is deliberately NOT `SECURITY DEFINER`
(runs with the caller's own privileges), where the test's pass condition is "the call raised
`insufficient_privilege` (42501)."

**What I did** — `accept_connection_request_status_guard_test.sql` §C proved
`_resolve_or_create_c2c_thread`/`_resolve_or_create_p2p_thread` (both invoker-rights, both
`REVOKE ALL FROM public, anon, authenticated`) are unreachable directly, by calling each as
`anon` and as `authenticated` and catching `WHEN insufficient_privilege THEN v_denied :=
true`. The comment even named the right precedent (`connection_consent_lockdown_test.sql`
block 11) and the right anti-pattern to avoid (L-010's "a function born without a grant reads
the same as one revoked, so don't grep `proacl`") — and still shipped a test that proves
nothing, because it fixed the wrong half of that precedent.

**Why it was wrong** — 42501 is a SQLSTATE, not a cause. `connection_consent_lockdown_test.sql`'s
idiom is sound there because `accept_connection_request` is `SECURITY DEFINER`: a regressed
grant runs the whole body as the owner and raises a *different* code (`P0001
not_authenticated`, from the function's own internal check), so catching 42501 specifically
proves the GRANT layer stopped the call before the body ever ran. Neither helper here is
`SECURITY DEFINER` — each runs as the caller. Pull the REVOKE and the call does not succeed;
it fails one level deeper, for an unrelated reason, at the identical SQLSTATE: `anon` has no
`SELECT` on `chat_thread` (permission denied for table → 42501); `authenticated` passes the
table check but fails `thread_all`'s RLS `WITH CHECK` on a bogus id (row-level security
violation → 42501). Same exception class, same `v_denied := true`, same green. I copied the
SQLSTATE half of a working idiom without re-deriving whether the *reason* it's sound
transfers to a function with different privilege semantics — it doesn't, silently.

**The rule** — a deny-test's pass condition must be tied to the specific mechanism it claims
to guard, not to whatever exception class that mechanism happens to share with other,
unrelated denial paths. For a `SECURITY DEFINER` function, catching a body-raised SQLSTATE
that only the intact function's own logic produces is sound. For an invoker-rights function
(or anything else where the exception a broken guard raises and the exception a working guard
raises are the same code), add a privilege-level assertion beside the call —
`has_function_privilege(role, function, 'EXECUTE')` for a GRANT, the RLS-policy equivalent for
a `WITH CHECK` — so the test goes red on the actual regression, not on some other check that
happens to fail first. Keep the call-and-catch too; it proves the end-to-end behavior the
privilege check alone can't. RED-first this class of test specifically by removing the exact
guard it claims to protect and confirming the suite actually fails — a passing suite that has
never been run against its own absence is an assumption, not a result ([[L-013]]).

**See also** [[L-010]] (the sibling half of this same idiom — a `proacl` grep is the wrong
check because a never-granted function and a revoked one are indistinguishable; this entry is
the wrong check on the OTHER side, an exception class that under-discriminates instead of a
grep that over-trusts), [[L-013]] (run the runner, not just the test — the same root cause:
a green result was trusted without being run against the failure it exists to catch).

---

## L-065 · A ticket parked as "blocked" is a claim with an expiry date, and nothing in this pipeline re-checks it — the blocker cleared a week ago and no one noticed

**2026-09-03 · session 101 · HEL-67 Gap 2 · caught by reading the ticket, not by any tool**

**Trigger** — any ticket deliberately left open with a recorded reason it cannot be built
yet ("blocked on X", "needs a product ruling", "do not force"), where X is another ticket in
the same backlog.

**What happened** — HEL-67 Gap 2 (chat-message sender forgery) was ruled un-buildable on
2026-08-25 for a genuinely good reason: three `authenticated` write paths legitimately wrote
in someone else's name, so `sender_person_id = auth.uid()` would have broken connection-accept
outright. The ticket said so precisely, named its blocker (HEL-68), and Muskan ruled "ship
Gap 1 now, do not force Gap 2." All correct.

**HEL-68 shipped on 2026-08-27. HEL-84 shipped the same day and removed the fourth path.**
Between them they deleted `rollout.ts` entirely and moved the Sella-voiced pills into
`announce_deal_event`. Every one of Gap 2's blockers was gone — and neither slug's `/ship`
noticed, because neither was built with HEL-67 in mind. The unblocking was a side effect.
`CLAUDE.md`'s security backlog listed six items and **did not list HEL-67 at all**; it was
found only by pulling the full Linear team list and reading a High-priority ticket sitting in
`In Progress` that the personal notes had dropped.

**Why the existing machinery missed it** — the pipeline records a blocker in the BLOCKED
ticket ("Gap 2 is blocked on HEL-68") and never in the BLOCKING one. HEL-68's own STATE, ADR
and ship notes say nothing about what closing it releases, so nothing at ship time prompts
the question. The dependency is written down exactly once, in the file that only gets read
when someone already suspects the work is doable. That is backwards: the moment the fact
becomes actionable is the moment the blocker closes.

**The rule** — when a ticket is parked with a named blocker, write the reverse edge too: add
a line to the BLOCKING ticket saying what unblocks when it closes, and use Linear's real
`blocks`/`blockedBy` relation rather than prose so it shows up on the blocker's own page.
At `/ship`, before a slug closes, ask one question — *what did this release?* — and check the
backlog for tickets naming it. A "blocked" note with no reverse edge decays into a "wontfix"
that nobody ever revisits; this one cost a week on a High-priority security item, and it was
only luck that the next session read the ticket rather than trusting the summary in
`CLAUDE.md`.

**Corollary, learned the same session** — the personal `CLAUDE.md` backlog is a *summary*,
and it had drifted twice: it omitted HEL-67 entirely and mis-described HEL-73 as "the e2e half
of HEL-68" when HEL-73 is the shared-seed mutation ticket ([[L-033]]), already complete in the
repo and stale-Backlog in Linear. Read the tracker, not the note about the tracker
([[L-030]]'s shape, applied to issues instead of line numbers).

**See also** [[L-030]] (a written pointer goes stale and must be re-derived, never trusted),
[[L-033]] (the HEL-73 subject this entry's corollary corrects), [[L-013]] (a claim that has
never been re-run against reality is an assumption, not a result).

---

## L-066 · An RLS bypass cannot be measured from inside the role being bypassed — the boundary under test also hides the evidence that it failed

**2026-09-03 · session 101 · HEL-85 · caught by a guard cell, one iteration before it would have shipped green**

**Trigger** — any test that proves a `SECURITY DEFINER` function does NOT write somewhere, by
counting rows before and after a call. Especially when the thing being protected is a row the
probe user is not allowed to read.

**What I did** — the HEL-85 suite mints a private `deal_workspace` and has Dana (a relationship
member, deliberately not a `deal_member`) call `confirm_deal_change`. §B counted
`chat_message` rows in the deal thread before and after, from inside Dana's own session:

```sql
SET LOCAL ROLE authenticated;   -- Dana
SELECT count(*) INTO v_before FROM public.chat_message WHERE thread_id = ...;
PERFORM public.confirm_deal_change(...);
SELECT count(*) INTO v_after  FROM public.chat_message WHERE thread_id = ...;
IF v_after > v_before THEN RAISE EXCEPTION 'exploit'; END IF;
```

It reported `before=0, after=0` and passed. A privileged count on the same thread, in the same
transaction, showed **2**. The write had landed. The suite was green on a live exploit.

**Why it was wrong** — `can_access_thread` gates SELECT on `chat_message`. Dana cannot read that
thread; that is the entire premise of the test. So she cannot see the row she just wrote either.
The definer bypassed RLS to insert; RLS then hid the result from her. Both counts were `0` for the
same reason the test existed: **the boundary being violated is also the boundary that reports on
it.** A `0 → 0` delta was indistinguishable from a working gate, and would have stayed
indistinguishable forever — the cell could never have gone red, for any regression, ever.

**The rule** — split the actor from the observer. The probe user makes the call and nothing else;
every count, every assertion, every read of what happened runs **privileged, outside the role
under test** (in this repo: `RESET ROLE`, or a `pg_temp` helper invoked before the `SET LOCAL
ROLE`). If the probe user must carry something out of her own block — a `SQLERRM`, a returned id —
write it to a scratch table she has `INSERT` on and read it back from outside. Concretely: never
put a `SELECT count(*)` that decides a security verdict inside a `SET LOCAL ROLE authenticated`
block.

**What actually saved it** — not review, and not the assertion itself. A separate `silent-pass`
cell, added because [[L-064]] says a deny-test must prove WHY it passed:

> *nothing landed AND nothing raised. The RPC neither wrote nor refused, so this cell is not
> evidence of a gate.*

That fired, and it was the only signal anything was wrong. The lesson generalises past this bug:
a negative assertion needs a companion cell proving the mechanism was actually exercised, because
"nothing happened" is what both success and total non-execution look like.

**See also** [[L-064]] (a deny-test that catches on SQLSTATE alone can pass for the wrong reason —
the same family: a pass condition that under-discriminates), [[L-013]] (a green never run against
its own failure is an assumption), [[L-033]] (measure the fixture, don't assume it).
