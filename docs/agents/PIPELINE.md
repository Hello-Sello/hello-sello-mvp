# Build Pipeline — how work gets done

> **Status: DESIGN FINAL (2026-08-14) · DRY-RUN COMPLETE (2026-08-16) · verdict GO — what remains is building the Tier 1 files.**
>
> Four rounds of CTO critique + a research-conformance pass, and then the whole pipeline was
> run **manually, by hand, on one real feature** — the tier ladder (`0021`), triage through
> live contract migration on production. Every stage and every gate was exercised. It beat
> the unaided baseline, so the design stands, with the amendments the run forced written
> into §5, §9, §10, §11 and §13 below.
>
> Record: [`DRY-RUN-tier-ladder.md`](./DRY-RUN-tier-ladder.md) — per-stage keep/cut/change
> table, the seven checker rounds, the predictions-vs-outcome comparison.
>
> Diagram: [`pipeline.svg`](./pipeline.svg) — two levels: the five blocks, then what runs
> inside each.
> Owner: Muskan.

Idea → **live and verified**. Five commands, five gates. Everything between a gate and the
next one runs without you.

---

## 1. The rule the whole design hangs on

> **A skill is the orchestrator. Agents are the workers.**

Autonomy is not a setting. It is **fewer commands, each doing more steps internally.**

Gates are the only place a human belongs. So **one skill per gate** — the skill covers the
distance from one gate to the next and does not stop in between.

| You type | Runs internally, without pausing | Stops at |
|---|---|---|
| `/triage <seed>` | six questions → lane → opens `STATE.md` | *no gate — it routes* |
| `/spec <slug>` | `researcher` (prior-art sweep) → interview → write the spec | 🚦 **G1** |
| `/prototype <slug>` | read the spec → build 2–3 variants → you pick | 🚦 **G2** *(frontend only)* |
| `/design <slug>` | `researcher` (approaches) → ADR + invariants → `adr-checker` → breakdown → tickets | 🚦 **G3** |
| `/build <ticket>` | plan → `plan-checker` → `test-writer` → `builder` → `test-runner` → reviewers → `visual-verifier` | 🚦 **G4** |
| `/ship <slug>` | **rebase onto `dev`** → re-run the suite → PR → merge → deploy → walk the criteria on the live URL · **stops for a human-granted allow rule when the wave writes prod data** (§9) | 🚦 **G5** |
| `/diagnose <bug>` | reproduce → write the failing regression test | *hands to `/build`* |

A FULL feature is **five or six things you type**, not eight. `/build` alone replaces four
separate invocations.

### Named decision — this is less autonomous than the insights report asked for

The insights report said: *pause at the end of Stage 1 and before merging; run Stages 2–6
without stopping.* **This design does not do that, and the reversal is deliberate.**

Session 69 is why — and it is not a one-off. R7 documents the same failure class in
Muskan's own words: *"build was very different from the prototype and features we
discussed."* Every automated gate went green on a page that looked nothing like the
prototype. The lesson wasn't "add more automation between the stops" — it was that the
stops were in the wrong places and one of them was missing entirely.

So: **gates stay human, plumbing chains.** Five stops, and the mechanical block between
them is one command.

**The collapse path is real, but it runs on evidence.** After ~10 clean features, G1 and
G3 may merge toward R5's 2-gate model (approve after the design interview, approve before
merge) — if the gate log shows those gates catching nothing. G4 never collapses: visual
fidelity cannot be self-certified, per Muskan's explicit call — the agent stages, she
passes.

---

## 2. Triage — four lanes

Six questions. **Any YES pushes the lane up.**

| # | Question | Lane |
|---|---|---|
| 0 | **Is something broken that used to work, or never worked as specified?** | **BUG** |
| 1 | A screen, section, or surface that does not exist yet? | FULL |
| 2 | Touches a migration, RLS, an RPC, or auth? | FULL |
| 3 | Introduces a concept not already in `CONTEXT.md`? | FULL |
| 4 | **Changes what the product *does*** — a rule, a condition, who sees what? | STANDARD |
| 5 | Touches a file another active session has locked? | STANDARD + sync ritual |
| 6 | More than one ticket of work? | STANDARD |

All NO → **TRIVIAL**.

| Lane | Path |
|---|---|
| **FULL** | `/spec` → `/prototype` *(if frontend)* → `/design` → `/build` ×N → `/ship` |
| **STANDARD** | `/spec --amend` *(one paragraph)* → `/build` ×N → `/ship` |
| **TRIVIAL** | `/build` → `/ship` |
| **BUG** | `/diagnose` → `/build` → `/ship` |

**Diff size is not the ruler.** A one-line change to a visibility condition can leak
another company's data. A 200-line CSS refactor cannot.

### Triage guesses. A hook checks its work.

Triage classifies from **one line, before anything has been investigated.** *"Fix the
pricelist visibility"* reads TRIVIAL and is actually Q2 — it touches RLS. This document
says a one-line visibility change can leak another company's data, and then routes on a
one-line description. That is a real hole.

The fix is not a better question. It is **checking the guess against the diff**:

> **Hook — lane vs. diff.** If the diff touches `supabase/migrations/`, an RLS policy,
> auth, or a server action while `lane: TRIVIAL`, **block and force a re-triage.**

Deterministic, costs nothing, and catches the only misroute that is genuinely dangerous.
Triage stays a 60-second guess — it just stops being the last word.

### The BUG lane

Most weeks are bugs. A bug's workflow is not a feature's, and running one through the
feature path produces a fix with no proof it fixed anything.

`/diagnose` already exists as a skill. It slots in unchanged, with one addition made
mandatory: **the reproduction becomes a permanent regression test before the fix is
written.** Not "a test" — *the* test that fails for the reported reason and passes after.

That test is what `/build` then implements against, and what stops the bug coming back.

---

## 3. G4 is routed by the diff, not by the lane

The v3 draft defined TRIVIAL as *"presentation only"* and then gave it one gate at ship —
so **the only lane that contains nothing but visual changes was the only lane that never
looked at anything.** That is session 69 with a smaller diff.

Same rule we already use for reviewers, applied to the visual gate:

| Diff touches | G4 |
|---|---|
| **anything rendered** — a component, a template, CSS, copy | **mandatory, every lane** |
| backend only — migration, RPC, action, job | acceptance criteria replayed on real data |

For a spacing fix that's one screenshot. It costs nothing, and it is the cheapest
insurance in the system.

---

## 4. Spec first, then prototype. Always.

An earlier draft allowed prototype-first for new UI, on the argument that Variant D was
discovered rather than specced. **Muskan's call, and it overrides that:**

> "I always prototyped a lot without scoping, which created a lot of leakage, and one
> thing led to another."

A prototype with no scope cut **becomes a scope generator.** You draw something, it
suggests two more things, and the feature is three times the size of the problem.

The spec's **In / Out for v1** section is a fence. Put the fence up first, then prototype
*inside* it. Discovery still happens — it just cannot wander.

**One order only: `/spec` → `/prototype`.** And you never reach `/design` without a spec
and — for frontend — an approved prototype.

---

## 5. Spec ≠ ADR ≠ Plan

| | Answers | Lives | Lifetime |
|---|---|---|---|
| **SPEC** | WHY + WHAT | `docs/PRD/` | Permanent — cited by later features |
| **ADR** | Which approach, and what must never break | `docs/architecture/adr/` | Permanent — cited by later ADRs |
| **PLAN** | For *this* ticket: which files, which signatures, which steps | `docs/muskan-build/<slug>/` | Disposable — dies with the ticket |

**Spec sections:** problem · **In / Out for v1** *(the scope cut, first)* · functional
requirements · I/O · constraints · edge cases · **acceptance criteria**.

### What a spec may and may not name

"No technology named" breaks immediately here — half your specs are about RLS and RPCs.
The workable rule:

> A spec names **capabilities and constraints**. It never names **implementations**.

| ✅ Allowed | ❌ Not |
|---|---|
| "must be enforced server-side, not in the client" | "use a `SECURITY DEFINER` RPC" |
| "a buyer must never see another buyer's pricelist" | "add an RLS policy on `pricelist`" |
| "the seller sees the approval within a second, without refreshing" | "use a Supabase realtime publication" |

The left column survives a stack change and is testable at G4. The right column belongs in
the ADR.

**Every acceptance criterion must be checkable on a running page.** "Pricelist approval
works" fails that test. "Seller sends → buyer sees Pending on the relationship page →
buyer approves → seller sees Approved" passes it. If `/spec` won't accept the vague one,
G4 has something real to walk.

### Invariants — sort them when you write them

`critic` checks an ADR's invariants against **that ticket's diff**. So ticket T05, built
next month from a different ADR, can break ADR-003's invariant and nobody looks. The
invariant was permanent; the check was not.

This repo already demonstrates it. *"Modules talk only through `index.ts`"* is a permanent
rule written in prose — and there is **one violation in the tree right now**
(messaging → relationship). Prose invariants decay exactly the way this document says
prose decays.

So `/design` sorts each invariant as it writes it:

| Invariant | Goes to |
|---|---|
| **A machine can check it** — import boundaries, "no direct table write", required column, naming | **a lint rule or a test.** It leaves the document |
| **Only judgment can check it** — "the buyer's mental model must stay X", "this stays one round-trip" | ADR prose + `critic`'s brief |

The rule: **if a machine could check it, writing it in prose is a decision to let it rot.**
`/design` cannot finish until every invariant it wrote is in one bucket or the other.

### Every ADR opens in plain English

G3 is the one gate where the design was quietly assuming knowledge Muskan has said she
does not have — industry practice, what an approach costs in a year, why one option beats
another. **A gate the gatekeeper cannot operate is not a gate.**

Two fixes, because they solve different problems. Presentation cannot catch a wrong
decision; a checker cannot make a decision legible. We need both.

**Fix one — the ADR opens with a plain-English section, before any technical body:**

| Must say | Why |
|---|---|
| What each option means **for the product**, not the code — *"with A, adding a buyer later needs a migration; with B it's a row"* | This is the part you can actually judge |
| What it costs **later** — how hard is this to undo in six months | Reversibility is the real cost |
| What breaks if we picked wrong | Names the risk instead of hiding it |
| **How this is normally done in the industry, and why** | Your stated gap. Stated explicitly, never assumed |
| One recommendation, with a reason in one sentence | A comparison, not a done deal |

**If you cannot tell from that section why the winner won, the ADR is not finished** — and
that is `/design`'s failure, not yours.

**Two more required sections — Muskan's own inventions, kept verbatim from her July docs
(R7: "keep her section set; it's good"):**

| Section | Says | Who reads it |
|---|---|---|
| **Reused** | *Already built — we feed it, don't touch.* What this work builds on and must not modify | `consistency` checks the diff against it; `builder` gets it as a fence |
| **Blast-radius** | What else this could break, traced — every caller, every cross-surface dependency, **every RPC and base table you did not write** | `security` + the reviewers; it is the risk map for the whole ticket set |

**Fix two — `adr-checker`.** Read-only, runs after the ADR is drafted and before G3. It
asks three things nothing else asks:

1. Does this approach satisfy **every constraint the spec set**?
2. Was a materially better option missed, or dismissed too fast?
3. **Does it contradict an invariant from an earlier ADR?** — nothing checks this today,
   and ADRs accumulate. ADR-014 can quietly break ADR-006 and no one would know.

Its output is short — *agree / disagree / what I would push back on* — in plain English, on
top of the ADR. **It does not replace your gate. It feeds it.**

**The nine categories it must sweep — derived from the dry-run, not invented.** The three
questions above are the *shape* of the review; these are its *surface*. One pass is not one
perspective, so the agent's prompt enumerates them as an explicit checklist:

| # | Category | What it actually catches |
|---|---|---|
| 1 | **Citation truth** | A claim attributed to a file or line that the file does not say |
| 2 | **Security doors** | RLS enabled · policies present · grants · `anon` · `SECURITY DEFINER` re-grants |
| 3 | **Postgres semantics** | Every statement quoted verbatim actually does what the ADR claims it does |
| 4 | **Deploy-window + ops-ritual reality** | Migration order, same-deploy rules, what is live versus local |
| 5 | **Call-site truth** | **Writers, not just readers** — and quantities actually present in the code |
| 6 | **Cross-ADR contradictions** | Via `ADR-INDEX.md` — the accumulating-corpus problem |
| 7 | **Data loss at migrations** | What a `DROP` / `UPDATE` / backfill destroys that nothing restores |
| 8 | **Enforceability of every invariant** | An invariant nothing can enforce is a wish, not an invariant |
| 9 | **Unit / null contracts** | Grams versus packs, nullable versus absent — where two functions disagree |

Category 2 has the best observed record: it produced the reinstated `is_caller_verified()`
arm *and* surfaced a live production defect (`list_discoverable_companies` had lost its
verified gate). Category 5 is why reader-only reviews miss writers.

> **Dry-run verdict (2026-08-16): `adr-checker` is promoted Tier 2 → Tier 1.** On the
> tier-ladder ADR (0021) it ran 7 genuinely fresh separate-context rounds and caught ~70
> findings across security / schema / deploy-ordering / cross-ADR classes — never
> converging to zero (11+15+15+14+15+14+12), including a live security hole that one of
> the fix revisions itself introduced. Full trail: `docs/agents/DRY-RUN-tier-ladder.md`.

**Three operating rules, locked by the dry-run:**

1. **Fresh context, every round.** The checker must be a genuinely fresh separate-context
   agent — never the ADR's author re-checking their own work. The author defends; only a
   stranger attacks. (Every one of the 7 rounds that caught something was a stranger.)
2. **The loop is budgeted: 2 rounds, stop on zero NEW blockers.** Stop at the first round
   that raises no *new blocking* findings — never wait for zero findings total, which the
   dry-run showed does not converge (7 rounds, never zero). More rounds are Muskan's
   explicit call per ADR, not the default.
3. **Fixes carry a simplification bias.** Prefer removing a mechanism over adding one. The
   single round that made the ADR *worse* was the one revision that answered a finding by
   adding a new RPC instead of deleting the problem (rev 6's hole, removed in rev 7).
4. **Its output is claims to spot-verify, not verdicts.** Round 5 overturned two of the
   checker's own earlier findings — the round-2 *"policies silently inert"* rationale was
   wrong (an `rls_auto_enable` event trigger exists, `ARCHITECTURE-NOTES:231`), and a rev-4
   blast-radius flag described a change that could not happen. **Checkers err; only repo
   evidence settles it.** Tier 1 buys this agent a seat at the gate, not the last word.

**It reads an index, not every ADR.** "Read every ADR we have ever written" is fine at 3 and
useless at 40 — and question 3 gets *harder* as the corpus grows, which is backwards. So
`/design` maintains one line per ADR:

```
| ADR | Decision, in one line                          | Touches                    |
|-----|------------------------------------------------|----------------------------|
| 006 | Deal visibility is one flag, not two layers    | deals · RLS · chat         |
| 014 | Pricelists bind to a relationship, not a buyer  | pricing · relationship · RLS |
```

`adr-checker` reads the index, then opens **only the ADRs whose areas overlap this one.**
Same question, bounded cost. Writing that line is the last step of `/design` — an ADR that
is not in the index does not exist.

> Why an ADR-checker but no spec-checker: at G1 you are judging **product**, which is your
> domain and where you are the best judge in the room. At G3 you are judging
> **engineering**. The asymmetry is real.

### Tickets are sized and checked before G3 — the Ready checkpoint

R6 ranked this the #2 highest-value build, aimed at one named habit: **building a whole
page in one go.** A page is an epic, not a ticket. And R7 found Muskan already sizes tasks
S / M / XS by hand — so this keeps her vocabulary and makes it a gate instead of a memory.

Before `/design` can finish, every ticket must pass three checks:

| Check | Rule |
|---|---|
| **INVEST** | Independent · Negotiable · Valuable · Estimable · Small · Testable. Fails any one → reshape it |
| **Size** | Labelled **S / M / XS**. Bigger than M → split it. No exceptions |
| **EARS criteria** | Each acceptance criterion reads *"When ⟨trigger⟩, the system shall ⟨response⟩"* — which is what lets `test-writer` turn criteria into tests mechanically |

The breakdown does not emit a flat list. Every ticket declares what it **depends on**, so
the order is explicit rather than remembered.

```
T01  pricelist bound to a relationship        S   depends on: —
T02  seller builds a list in the shop         M   depends on: T01
T03  send + approve state machine             M   depends on: T01
T04  buyer's view on the relationship page    S   depends on: T02, T03
```

T02 and T03 can run at the same time. T04 cannot start until both land.

**Hard rule: anything running in parallel must touch different files.** Two builders
editing one file concurrently produces a merge to untangle, not speed — which is a cost,
not a saving.

---

## 6. STATE.md — the work order

**Where:** `docs/muskan-build/<slug>/STATE.md` — one folder per work item, **committed to git.**

**Committed, not gitignored.** Your own `CLAUDE.md` documents the trap: `.planning/` is
gitignored, copied one-way into a worktree at creation, and getting it back is a manual
`cp`. A state file that cannot survive a worktree is not a handoff contract. Because it is
scoped per-slug, two people on different features never touch the same file.

**Who writes it:** every skill, as its last step. **A hook enforces it** — if `stage` did
not advance, the skill cannot finish. Without that hook it rots into a stale document and
the pipeline quietly moves back into conversation, which is the thing it exists to prevent.

**Why it exists, in one sentence:** when you type `/design` tomorrow, that skill has **no
memory of today's `/spec` conversation** — new session, cleared context, maybe a different
machine. It opens this file and picks up exactly where you left off.

It is not documentation. **It is the argument list for the next command.**

```markdown
# pricelist — work order
lane:   FULL
stage:  spec ✅  →  prototype (next)
branch: feature/pricelist
seed:   "Per-customer pricelists a seller sends to one buyer, that the buyer approves."

## Files so far
| stage      | wrote                                |
|------------|--------------------------------------|
| triage     | this file                            |
| spec       | docs/research/pricelist-existing.md  |
|            | docs/PRD/pricelist.md                |

## Locked            (empty until G3 — the ADR fills this)

## Deferred — must NOT be built
- cascade repricing when a base price changes (DEV-1) → v2
- multi-currency

## Attempts          three separate budgets — see §10
T01  tests 0/2 · blocking-findings 0/2 · G4 rounds 0

## Gate log
- G1 spec — passed 2026-08-09

## For Muskan
- Prior-art sweep found Phase 15 already assumes `pricelist.relationship_id`.
  The spec matches it. Nothing blocked.
```

---

## 6b. Where every file lands

**No new tree. The pipeline maps onto the folders that already exist** — R7's finding is
explicit: *"the `_workshop/`, `prototypes/`, `docs/muskan-build/`, `.planning/` split is
real and works — the framework should fit it, not replace it."* An earlier draft proposed
`docs/specs/` + `docs/adr/` + `docs/build/`; that would have renamed a working taxonomy
and created a second ADR home beside the real one.

**One honest exception:** `docs/muskan-build/` does change shape — today it is one *file*
per feature; the pipeline makes it one *folder* per feature (a feature now produces
several artifacts, not one). No existing file moves or renames; new work just gets a
folder instead of a file.

**Numbering — every permanent artifact gets a sequential number:**

| Artifact | Pattern | Example |
|---|---|---|
| Spec | `docs/PRD/NNNN-<slug>.md` | `0007-pricelist.md` |
| ADR | `docs/architecture/adr/ADR-NNN-<slug>.md` | already the convention — keep it |
| Build folder | `docs/muskan-build/NNNN-<slug>/` | `0007-pricelist/` — same number as its spec |
| Prototype | `prototypes/NNNN-<slug>-prototype/` | `0007-pricelist-prototype/` — same number (added 2026-08-14, dry-run) |

Zero-padded, sequential, **never reused** — a number is an identity, not a position. The
spec and its build folder share one number, so you can walk from either to the other.
Existing unnumbered files get numbers during the docs cleanup (open decision #7), not
retroactively today.

**One slug ties it all together.** A *slug* is a short lowercase nickname for the thing —
no spaces. "Per-customer pricelists" → `pricelist`. You type `/spec pricelist` once, and
every file below is named from it, including the git branch.

```
docs/
├─ research/
│    pricelist-existing.md        ← Research A · what already exists
│    pricelist-approach.md        ← Research B · the options + trade-offs
├─ PRD/
│    0007-pricelist.md            ← the WHAT.  permanent.  ("design contracts /
│                                    the what" — this folder's declared purpose)
├─ architecture/adr/
│    ADR-INDEX.md                 ← one line per ADR + areas it touches
│    ADR-014-pricelist.md         ← the DECISION + invariants.  permanent.
│                                    (the 3 existing ADRs already live here)
└─ muskan-build/
     0007-pricelist/              ← everything disposable, one folder
       STATE.md                   ← the work order.  committed
       TICKETS.md                 ← tickets · S/M/XS · dependency order
       plan-T01.md                ← one per ticket
       review-T01.md              ← findings: blocking / note / rejected
       visual-T01.md              ← G4 screenshots + criteria walk
       blocked.md                 ← only exists if a retry budget blew
                                    ("the how, one file per item" — this
                                    folder's declared purpose, now a folder
                                    per item.  The earlier parallel lane,
                                    _workshop/build-plans/, is history now)

prototypes/
└─ pricelist-prototype/
     index.html                   ← the approved variant.  the G4 contract

.claude/
├─ skills/<name>/SKILL.md         ← the 7 things you type
├─ agents/<name>.md               ← the 10 workers
└─ settings.json                  ← the hooks

supabase/migrations/              ← unchanged, existing convention
src/                              ← unchanged
```

**Permanent vs disposable is the whole organising idea.** `PRD/` and `architecture/adr/`
are cited by features that do not exist yet — they never get deleted.
`muskan-build/<slug>/` is scaffolding for one piece of work — archived whole once the work
ships.

---

## 7. Agents — ten workers

`.claude/agents/<name>.md`. Fresh context, returns one artifact, then dies.

| Agent | Asks | Tools |
|---|---|---|
| `researcher` | What exists? What are the approaches? | read + web, no write |
| `adr-checker` | Does this decision hold up? Does it break an older one? | read-only |
| `plan-checker` | Will this plan reach the goal? | read-only |
| `test-writer` | What does the spec say correct looks like? | read + write tests |
| `builder` | Implement until green | **full write** |
| `test-runner` | Run and report | read + bash, **no edit** |
| `critic` | Correct? Scope creep? Breaks an invariant? | read-only |
| `consistency` | Reused ours, or invented and patched? | read-only |
| `security` | RLS · tenant isolation · exposed data | read-only |
| `visual-verifier` | Does it match what we approved? | browser + screenshots |

**Exactly one of the ten can write source code: `builder`.** Everything else is scoped by
its `tools:` line — structurally, not by asking nicely.

### Why ten is not GSD's thirty-three

R6 explicitly rejected "a separate agent per SDLC role (8 agents) — that's GSD's mistake."
Ten is more than eight, so the tension has to be answered, not ignored.

The difference is **shape, not count.** GSD's fleet was writers and orchestrators — a
planner writing plans, executors writing code, coordinators coordinating — each adding its
own output to the pile. Ours is **one writer and nine read-only checkers**, which is the
shape note 09 endorses: *"built-ins already cover explore and plan; our custom agents
should be the checker roles."* A checker runs once, returns a verdict, and dies. It cannot
compound.

But the count still gets earned, not assumed: **the agents are tiered in §13.** Tier 1 has
independent observed evidence. Tier 2 started as hypothesis — an argument rather than an
observed catch. **The manual dry-run was the trial, and it has run:** any Tier 2 agent that
catches nothing a Tier 1 agent or Muskan would have caught gets cut before it is ever built.
Two are still on watch rather than cut — see the tiering table in §13.

> **Dry-run result (2026-08-16):** `adr-checker` passed the trial and is **Tier 1** — ~70
> observed catches across 7 fresh-context rounds on the tier-ladder ADR, including classes
> (cross-ADR contradiction, deploy-ordering, a fix-introduced security hole) that neither
> Muskan nor a Tier 1 agent had caught. Its operating rules are locked in the `/design`
> section above. `plan-checker`'s headline predicted catch (missed call sites —
> `template.ts`, `get_discoverable_shop`) was pre-empted at design time: the ADR already
> carried both re-declares before any plan existed. No decisive independent catch was
> recorded in the T01–T08 sprint — it stays **Tier 2, on watch** for the next slugs
> rather than cut outright.

`researcher` is custom rather than the built-in Explore because it needs to know *your*
corpus: `docs/product/surfaces/`, PRDs, `DECISIONS.md`, `ARCHITECTURE-NOTES.md`, Linear,
session logs, prototypes — then the code. Built-in Explore only knows the repo.

**No planner agent.** Plan mode already does it. The gap was never planning; it was that
nobody checked the plan. We build the checker.

**No spec-checker.** You read the spec at G1. If that proves leaky after a few features,
build one then.

### Models are unpinned

Earlier drafts asserted Opus here, Sonnet there. That was a guess dressed as a finding —
the exact habit worth avoiding. **Everything inherits the session model until we have
measured a reason to pin it.** Revisit after the manual dry-run.

### Review routing

| Diff touches | Reviewers |
|---|---|
| migration · RLS · RPC · auth · server action · cross-company reads | critic + **security** |
| a new component or a new pattern | critic + **consistency** |
| CSS / copy only | **critic alone** |

Spawned in **one message** so they run in parallel — they are independent, and serialising
them is fake waiting.

### Findings have severity, and the builder may say no

Two things were missing, and both cause real bugs.

**Severity.** A finding is `blocking` (wrong, unsafe, breaks an invariant) or `note`
(naming, style, a nicer way). **Only `blocking` findings are fixed and retried.** Notes are
written into `REVIEW.md` and surfaced at the gate. Otherwise `/build` stops and escalates
to you over a variable name.

**The right to reject.** Findings currently flow straight into "builder fixes it" — so a
confidently wrong `critic` makes `builder` introduce a real bug to satisfy it.

> The builder **may reject a blocking finding**, in writing, in `REVIEW.md`, with its
> reasoning. A rejection does not consume an attempt. Every rejection surfaces at G4 for
> **you** to adjudicate.

Never silent compliance. Never silent dismissal. Both are how a review theatre forms.

---

## 8. Two mechanics that make the chain actually run

**`allowed-tools:` in the skill frontmatter** pre-approves what that skill may do, so the
run does not stall on a permission prompt mid-chain. It is also a real safety boundary —
`/ship` gets a tight scope.

**The skill body says STOP at the end.** That stop *is* the gate. Everything before it says
"do not pause, do not ask for confirmation between steps."

⚠️ **Do not put `context: fork` on the orchestrator skills.** A forked skill becomes a
subagent itself — and a subagent cannot spawn its own subagents. `/build` would lose the
ability to call any of the nine.

### `/build` in full

```markdown
---
name: build
description: Build one ticket end to end — plan, test, implement, review, verify.
argument-hint: <ticket-id>
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task
---

Build ticket $1. Read `docs/muskan-build/$1/STATE.md` first.
Run every step below WITHOUT pausing. Do not ask for confirmation between steps.

Budgets are SEPARATE. Never share one counter across steps 5 and 6.

1. Plan — plan mode. Exact files, interfaces with signatures, real test code.
2. Check — spawn `plan-checker`. If the plan misses the goal, revise once, then STOP.
3. Failing tests — spawn `test-writer`. From the SPEC, never the code.
4. Implement — spawn `builder`. Only the files named in the plan.
5. Run — spawn `test-runner`. Red? Back to 4. TWO attempts on `tests`, then STOP.
6. Review — spawn in ONE message so they run in parallel:
   critic (always) · security (if migrations/RLS/auth/RPCs) · consistency (if new pattern)
   Each finding is `blocking` or `note`.
   - `note` → write it to REVIEW.md. Do NOT fix. Do NOT spend an attempt.
   - `blocking` → back to 4. TWO attempts on `blocking-findings`, then STOP.
   - builder may REJECT a blocking finding in writing in REVIEW.md, with reasoning.
     A rejection costs no attempt and is surfaced to Muskan at the gate.
7. Verify — if the diff touches anything rendered, spawn `visual-verifier`:
   drive the real page, capture every screen the prototype shows side by side,
   walk each acceptance criterion live. Backend-only: replay criteria on real data.

Re-entry after a failed G4: this is a NEW round. Reset `tests` and `blocking-findings`
to 0/2 and increment `G4 rounds`. Never refuse to start because a prior round is spent.

Write REVIEW.md, update Attempts and Gate log in STATE.md, then STOP.
Report: what changed · blocking vs notes · anything the builder rejected, and why.
```

### `test-runner` — why the tool line is the whole point

```markdown
---
name: test-runner
description: Runs the test suite and reports. Cannot edit anything.
tools: Read, Grep, Glob, Bash
---

Run the suite. Report: pass/fail table · per-failure breakdown · root cause · verdict.

You CANNOT edit files. This is structural, not a guideline.
Never suggest changing a test to make it pass. If a test fails, the code is
suspect — not the test. The test came from the spec. The spec is right.
```

Bash but no Edit or Write — so it structurally cannot "fix" the test instead of the code.

---

## 9. Gates — priced by what a "no" costs

| Gate | Where | Cost of a no |
|---|---|---|
| **G1** | Spec (or prototype-first) | Minutes. The cheapest place to be slow |
| **G2** | Prototype | An hour |
| **G3** | ADR | A day |
| **G4** | **Visual + acceptance** | **A rebuild** |
| **G5** | Live | A hotfix, in front of users |

### G4 approves your branch. Something else deploys.

G4 passes on `feature/pricelist`. Then `/ship` opens a PR, merges to `dev`, and deploys.
**Between those two, `dev` can move.** The thing G4 approved is not necessarily the thing
that ships.

The original cause was a second engineer's branch landing in that window. With a single
owner the window is narrower but **not closed** — parallel worktree sessions merge into the
same `dev`, and the repo still carries plenty of code you did not write. The failure mode
does not need a second person; it only needs `dev` to change after you verified.

This is not hypothetical — it is most of the session log: migration timestamp collisions,
RPCs rebuilt from live because the local base was stale, *"diffed every `create or replace`
against the LIVE cloud body first (no stale-base drift)."* Work that passed every gate on a
branch and was still wrong in production.

The obvious fix — re-verify after every merge — chases a moving target. The better one is
to **stop the target moving first:**

```
rebase onto dev  →  re-run the suite on the rebased code
     │                   ├─ red, or it touched a tested/rendered file → back to G4
     │                   └─ clean
     └────────────▶  PR → merge PROMPTLY → deploy → walk the criteria live → G5
```

**Rebase first, verify that, then merge quickly.** What you verified is then what merges,
instead of verifying your branch and hoping the world stays still. The window where someone
else's work can slip in shrinks from "however long the PR sits" to "however long the merge
takes".

### G5 has a hard stop the design did not predict: prod data-writes

Found in the dry-run. Additive DDL applied autonomously without friction. The vocab
migration — which `UPDATE`s production rows and `DELETE`s lookup rows — was **blocked by the
permission classifier**, and self-editing `settings.local.json` to unblock it was blocked
too. **Both refusals were correct.**

> **A wave that writes production data cannot be applied autonomously.** `/ship` classifies
> the wave first — additive DDL versus data-write — and where it writes data it stops and
> asks Muskan to grant the `apply_migration` allow rule, or to run the SQL herself.

Budget this as a **scheduled stop, not a failure.** The dry-run's 13-migration wave paused
here for one session and then finished in a single pass once the rule was granted.

If the merge still lands on something tested — it happens — G4 fires again, **capped at 2
rounds.** Then it stops and escalates rather than looping.

Otherwise G4 certifies a version that never shipped.

**G4 is the gate that did not exist.** Discover session 69: 10/10 pgTAP, 225 unit tests,
tsc and eslint clean, verified on a fresh `db reset` — and the page looked nothing like the
Variant D prototype. Every other gate went green.

The agent **stages** the comparison. **You pass it.** An agent grading its own visual work
is the same failure that produced session 69.

---

## 10. Failure paths

**Three separate budgets. Never one shared counter** — a single budget of 2 means tests
going red once will make `/build` escalate to you over a naming nit.

| Trigger | Goes to | Budget |
|---|---|---|
| Tests stay red | builder retries | **`tests` 2/2**, then STOP |
| Finding marked `blocking` | builder fixes | **`blocking-findings` 2/2**, then STOP |
| Finding marked `note` | written to `REVIEW.md`, surfaced at G4 | **never retried** |
| Builder rejects a finding | written to `REVIEW.md`, **you** adjudicate at G4 | **costs no attempt** |
| Either budget blown | **you**, with the disagreement in `blocked.md` | — |
| G4 says it does not match | back into `/build` — **a new round: both counters reset**, `G4 rounds` +1 | **`G4 rounds` 2**, then STOP — *one named exception below* |
| The approach itself was wrong | re-open G3, rewrite the ADR | — |

`G4 rounds` was a counter with no limit, which is how `/ship` could bounce forever: merge →
back to G4 → fix → merge → `dev` moved again → back to G4. **Two rounds, then stop
and escalate**, same as everything else.

Two attempts, not five. When a budget blows, the agent does not try harder — it writes
down *what it thinks is wrong with the instruction* and hands it over.

`/build` must never refuse to start because a previous round's counters are spent. A
re-entry after G4 is new work, not a continuation.

### The one named exception — redesign at the gate

The cap counts **iterative fixing.** It does not count the human deciding the approach
itself is wrong.

On the tier ladder, G4 ran **three** rounds and that was correct. Rounds 1–2 were fixes.
Round 3 established that three successive in-card fitting attempts — row cap plus scroll,
hiding buy rows while open, shrinking the photo — had each failed or been rejected on the
walk: the fixed-height card cannot host the ladder in flow. Muskan designed the replacement
herself, a floating popover portaled to body, recorded as a prototype DEVIATION in
`REVIEW.md`.

> **G4 is where the human redesigns, not just approves.** When a round produces a *new
> design* rather than another fix, it does not consume the budget — log it as a DEVIATION
> and continue. The cap exists to stop a fix-loop spinning, not to stop Muskan changing the
> design.

The counter lives in `STATE.md`. In conversation it is worthless: one context reset and it
silently returns to zero, which is the exact loop it exists to stop.

---

## 11. Hooks — deterministic, 100% not 98%

| Hook | Guards |
|---|---|
| **Lane vs. diff** | `lane: TRIVIAL` while the diff touches `supabase/migrations/`, RLS, auth, or a server action → **block, force re-triage** |
| **STATE.md advance** | A skill finishing without advancing `stage` |
| **Shared-file lock** | Editing a file locked in another active session's sync file — **own parallel worktrees included** |
| **Invariant lint rules** | Whatever `/design` sorted into the mechanical bucket — import boundaries first |
| Supabase MCP schema guard | DDL via MCP with no committed `.sql` — already happened once (`get_public_profile`, R8) |
| **Prod data-write gate** | `apply_migration` carrying `UPDATE` / `DELETE` / `INSERT` against production → **block, require a human-granted allow rule.** Observed in the dry-run; a skill may **not** self-grant it by editing `settings.local.json` |
| Destructive command guard | `reset --hard`, `checkout .`, `clean -fd`, `git add -u/.`, `rm -rf` |
| Module boundary | `@/modules/X/internals` imported from module Y |
| **Stale-map** | A new directory in `src/modules/` absent from `src/README.md` → flag. **Six modules documented, twelve exist today** (R8) — docs drifting from code is observed, not hypothetical |
| Read-before-edit | Editing a file not yet read |
| Conventional commits | Non-conforming commit messages |
| Main-branch write block | Writes on `main`/`master` — ✅ already installed |

The **shared-file lock** is now a *dormant* guard rather than a daily one — with a single
owner there is no second engineer's sync file to collide with. Keep it built anyway: it is
cheap, it still catches **your own parallel worktree sessions** editing one file, and it
reactivates unchanged the day the team grows again. Your sync ritual, as a hook, not a
memory.

---

## 12. Where this will jam

| Jam | What helps |
|---|---|
| **G4 — serialised on you being at a screen** | The agent hands you **one page** with everything on it, never a conversation |
| **G1 — the spec interview is human-paced** | Accept it. Cheapest place to be slow |
| **Prod data-write waves stop for a human** | Observed, not hypothetical: the classifier blocks `apply_migration` on data writes, and blocks self-granting the rule. Plan it into `/ship` as a scheduled stop (§9) |
| **Review throughput, not build throughput** | Batch G4 across tickets |

---

## 13. Build order

1. **Hooks** — independent of everything, some already exist. `STATE.md`-advance and
   shared-file-lock first.
2. **The reviewers** — `critic`, `security`, `consistency`. Highest evidence of any piece
   here: a reviewer agent has already been observed catching an implementer breaking a rule
   that was written in `CLAUDE.md`, and `consistency` is R7's #6 — the blind spot Muskan
   cannot self-serve, with its inputs already written (`.planning/codebase/`, R8).
   **The dry-run split them:** `security` won its headline bet (the verified-gate class,
   including a live production defect); `consistency` recorded no catch on that slug. Build
   `critic` + `security` first, `consistency` on watch.
3. **`test-writer` + `test-runner`** — spec-not-code is the second-highest-value idea.
4. **`visual-verifier` + G4** — the gate that would have caught session 69, and R5's
   "self-verifying visual prototype loop" (high value, low cost — Playwright is already in
   the repo).
5. **`/triage` + `STATE.md`** — cheap, and everything reads it.
6. **`/spec`, `/design`, `/build`, `plan-checker`, `adr-checker`** — the front half.
   Slowest to get right.
7. **`/ship`** deploy + live verify — closes the loop.

**Tiering after the dry-run — this is now results, not hypotheses.**

| Piece | Tier | Evidence |
|---|---|---|
| Steps 1–5 — hooks · reviewers · `test-writer`/`test-runner` · `visual-verifier` + G4 · `/triage` | **Tier 1** | Evidence-backed before the dry-run, unchanged by it |
| `adr-checker` | **Tier 1 — promoted** | ~70 catches over 7 fresh-context rounds, in classes nothing else caught |
| `researcher` | **Tier 1 — kept, humbled** | Its headline prediction was a wrong target and Muskan overruled it. The human-overrule path is part of the design, and it worked |
| `plan-checker` | **Tier 2 — on watch** | Its predicted catch was pre-empted at design time; no decisive independent catch across T01–T08. Not cut — watched on the next slugs |
| `consistency` | **Tier 2 — watch** | Its evidence is R7, not this slug: no separately recorded catch (the tier editor grew inside `ProductCard`'s existing patterns). No evidence either way |

The rule that produced this table still governs the next slug: **an agent that catches
nothing Muskan or a Tier 1 agent would have caught gets cut before it is built.** That is
the "smallest graph" rule applied to our own roster, not just to GSD's.

**The manual dry-run is DONE — 2026-08-16. Verdict: GO.** It ran on the **tier ladder
(`0021`)**, not the Discover batch: a real feature carried triage → spec → prototype →
design → eight tickets built → ship → live contract migration on production. Predictions
were written down before the run and compared afterwards, per the rule that governed it:

> **Write down what you expect the pipeline to catch — before you start.** Then compare.
> If it catches nothing you would not have caught yourself, that is the signal to **cut
> stages, not add them.**

That comparison exists now — [`DRY-RUN-tier-ladder.md`](./DRY-RUN-tier-ladder.md) — and two
of its findings changed this document: the prod data-write gate (§9, §11) and the G4
redesign exception (§10).

**What is actually next: build the Tier 1 set as real skill, agent and hook files.**

1. `/triage` + `STATE.md`
2. `/spec` and `/design`, with `adr-checker` under its **four** locked rules and the
   nine-category checklist (§5)
3. `test-writer` + `test-runner`
4. `visual-verifier` + G4
5. `/ship` — carrying the diff-against-live protocol **and** the prod data-write
   permission stop

**Do not build `plan-checker` or `consistency` as agents yet.** Both are Tier 2 on watch;
they earn a build on the next slugs or they get cut.

---

## 14. Open decisions

| # | Question |
|---|---|
| 1 | **Authenticate Linear MCP — blocks `researcher`.** Its prior-art sweep is specified to read Linear and `/design`'s breakdown writes tickets there. Until this is done, that agent cannot do half its stated job. Highest-priority open item |
| 2 | ~~Collapse into new `specs/` + `adr/` + `build/` tree?~~ **Answered — no.** The pipeline maps onto the existing taxonomy (§6b, per R7): `docs/PRD/` = specs, `docs/architecture/adr/` = ADRs, `docs/muskan-build/<slug>/` = build workspace. Only residue: whether `docs/superpowers/` folds away |
| 3 | `SCHEMA.md` vs `SCHEMA-DRAFT.md` — one must die |
| 4 | **`CLAUDE.md` 32 KB + `AGENTS.md` 39 KB load in full every session.** Only a skill's *name and description* load until it is used — so most of this belongs in skills. Biggest context win available, and cheap |
| 5 | ~~Does Ayush adopt this?~~ **Moot — single owner.** The shared-file-lock hook stays built but dormant: it guards parallel worktree sessions today, and reactivates unchanged if the team grows |
| 6 | ~~Have commands and skills merged?~~ **Answered — yes.** Current docs: *"Custom commands have been merged into skills."* We build `.claude/skills/<name>/SKILL.md` only |
| 7 | **Docs cleanup (Muskan, own session):** number the existing `docs/muskan-build/` files, tidy the scattered `docs/architecture/` root (loose files beside `adr/` + `diagrams/`), apply the NNNN scheme going forward |

---

## 15. The rules underneath

- **A skill orchestrates; agents work.** Autonomy is fewer commands, not fewer checks.
- **The writer is never the checker.** Enforced by `tools:`, not by asking.
- **Every step writes a file.** Artifacts survive compaction; conversations do not.
- **Tests come from the spec, not the code.** The code may be wrong. The spec is right.
- **Gates go where mistakes get expensive**, and each is priced so you know what a no costs.
- **Prompts are 98%, hooks are 100%.**
- **Smallest graph that improves quality.** Draw it before automating it.
