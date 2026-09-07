# REVIEW — 0024-c2c-thread-atomicity / HEL-68

Single ticket, no T-breakdown. `/code-review high`, `critic`, and `security` all
spawned in one round after `builder`'s implementation went green (see STATE.md's
Attempts for the independent orchestrator verification: both SQL suites green on a
fresh reset, e2e guard passing, `tsc` clean, 474/474 unit tests, eslint clean).

## Verdicts

- **`/code-review high`** — 10 findings, none blocking (rungs 1-3). Reported as a
  flat JSON list without this repo's severity ladder; re-rated below.
- **`critic`** — no blocking findings. All 5 PRD acceptance criteria walked against
  real code, ADR 0007's Reused fence confirmed intact. 7 notes.
- **`security`** — no blocking findings. SECURITY-CHECKLIST S1, S2, S4, S5 all PASS
  (live-catalog verified, not just SQL-file read). S3/S6/S8 correctly deferred to
  `/ship` (remote-only checks). 5 notes.

## Findings — fixed

1. **(code-review) Missing `.trim()` on composed sender/viewer names** —
   `20260826100000...sql:198,216` (pre-fix). The deleted JS path
   (`inbox.ts:283`) trimmed the composed `${first_name} ${last_name}`; the SQL
   port didn't, so a single-name signup (empty `last_name`, common on OAuth)
   would bake a literal trailing double space into the seeded message. Fixed:
   both SELECTs now wrap in `trim(...)`.
2. **(code-review + critic + security, independently, 3x) Message ordering
   relies on two bare `clock_timestamp()` calls, which can tie on a coarse
   clock** — the plan's own round-3 note (N6) already flagged this as weaker
   than the browser's deleted 100ms stagger; code-review's live-test framing
   ("the new test's own assertion would flake on exactly this tie") tipped it
   from "acceptable" to "fix." Fixed: the intro's `clock_timestamp()` is
   captured once into `v_intro_ts`; the note's `created_at` is
   `v_intro_ts + interval '1 millisecond'` — ordering is now asserted, not
   probabilistic.
3. **(code-review) Linear issue codes (`HEL-68`, `HEL-82`, `0024`,
   `PLAN-HEL-68`) embedded throughout both new migrations and the edited test
   file's comments** — direct violation of a standing project rule (codes
   belong in commits/PRs/docs, never migration/test comments, since they rot
   the moment the ticket closes or gets renumbered). Fixed: every occurrence
   introduced by this diff rewritten to describe the actual mechanism instead
   of citing a ticket number. One pre-existing occurrence (a HEL-82 reference
   predating this session, `accept_connection_request_status_guard_test.sql:4`)
   left untouched — out of this diff's scope.
4. **(critic, Note 3) A shipped test comment stated the OPPOSITE of what the
   diff actually does** — claimed the `connection_consent_lockdown_test.sql`
   rewrites were "NOT applied here... flagged, not fixed"; they were, in a
   separate `test-writer` pass, before this comment was ever read back.
   Fixed alongside the Linear-code cleanup in the same block.
5. **(critic, Note 4 + security, N1) A newly-introduced security claim in
   `store.ts` was factually false** — "`authenticated` has no write grant on
   `relationship` or `chat_thread` at all." True for `relationship`, false for
   `chat_thread` (the live `thread_all` policy grants it, and this same file's
   `postMessage`/`openOrCreateP2pThread` rely on that grant existing). Fixed:
   narrowed the claim to `relationship`, and named explicitly that HEL-68
   closes no new security boundary on `chat_thread` — that's the still-open
   HEL-84.
6. **(security, N3) A stale precedent citation** — `store.ts` cited
   `create_group_thread` as a second OUT-param-RPC-call precedent alongside
   `confirmDetectedDeal`; `create_group_thread` is `RETURNS uuid`, not an
   OUT-param function at all. Fixed: citation narrowed to the one real
   precedent.
7. **(critic, Note 6) AC5's replacement docstring overstated its own
   guarantee** — "so it always exists" doesn't hold for a relationship that
   predates this migration and never had a deal sent through it (the one path
   that self-heals a missing c2c thread pre-0024). Fixed: docstring now names
   that residual case explicitly rather than asserting a universal.
8. **(critic, Note 5) Three dangling references to the deleted `rollout.ts`**
   in `connections-shape.ts` — one a passing style citation (dropped), one the
   actual stated RATIONALE for `canonicalPair` existing as a separate export
   (rewritten to name the real, current reason: three independent SQL/JS
   implementations of the same ordering rule, not two).
9. **(critic, Note 7) Both ADRs' status headers still said "Proposed —
   awaiting G3"** despite Muskan's approval. Fixed in both `0007` and `0008`.
10. **(critic, Note 1) PRD AC3's wording was broader than the code's correct
    behavior** — as written, it read as forbidding ANY new thread on the
    adopt path, but a pricing ask from a NEW person at an already-connected
    company legitimately mints a new p2p thread there (correct AC2 behavior,
    not a duplicate accept). Fixed: AC3 now scopes "no second thread" to the
    same two people, with the legitimate case named explicitly.

**Re-verified after all ten fixes** (not re-trusted from the pre-fix pass): fresh
`db reset`, both SQL suites green, `e2e/inbox-accept.spec.ts` 2/2, `tsc` clean,
474/474 vitest.

## Findings — accepted, not fixed (named, not silently dropped)

- **(code-review) The `SECURITY DEFINER` write path forward-affects HEL-84.**
  Already reasoned about at design time — ADR 0008's own round-1 N9 covers
  exactly this: a freshly-minted relationship is `'active'` by construction
  and the adopt branch already refuses non-active relationships (HEL-82's
  guard, preserved verbatim in this migration), so this code path can never
  land on a suspended pair. Re-derived independently by code-review, which is
  a useful confirmation, not a new gap.
- **(code-review) `acceptInbox`'s idempotent-retry branch returns an
  unfiltered thread list, inconsistent with the fresh-RPC path's shape.** Real,
  pre-existing (that branch is untouched by this diff — the plan explicitly
  left it alone), and inert: `threadIds` has zero consumers anywhere in the
  repo (confirmed independently by two plan-checker rounds and `critic`).
- **(code-review) A receiver can edit `pending_inbox_item.note` before
  accepting, and the atomic migration seeds it as if the sender wrote it.**
  code-review's own framing: "pre-existing behavior, the deleted `rollout.ts`
  did the same." Not introduced by this diff.
- **(code-review) `sella-intro`'s fragile `.maybeSingle()` lookup wasn't
  upgraded to use the newly-available disambiguated `p2p_thread_id`.**
  Correctly out of scope — the ADR's own Deferred list says "any UI change
  consuming the newly-returned thread ids — none exists today," a decision
  made at G3, not an oversight now.
- **(code-review) `pgmq.send` failure now rolls back the whole accept, not
  just the note post.** Named and accepted at design time (ADR Invariant 7 /
  the plan's item 8): the transactional guarantee is the point of this
  migration, not a side effect to design around.
- **(code-review) The two new helpers duplicate `send_deal`'s resolve-or-create
  shape instead of `send_deal` being refactored onto them.** Exactly ADR 0007
  Invariant 6's deliberate choice — migrating `send_deal` is a named,
  low-risk follow-up, not bundled into this diff.
- **(code-review) Name-resolution SELECTs run even on the adopt path, where
  they're discarded.** Minor, unmeasured inefficiency (a few extra indexed
  point-reads per accept) — not worth the restructuring cost given
  correctness, not performance, was this ticket's job.
- **(critic, Note 2) The c2c `connection_established` seed line has no
  positive test assertion** — only existence-of-thread and count-unchanged are
  asserted; the exact body text is untested (unlike the p2p intro, which is
  asserted verbatim). Real coverage gap, left open — the c2c INSERT shares its
  shape with the already-tested p2p path and is exercised by the deny-tests'
  own fixture setup, so the risk is judged low enough not to warrant another
  `test-writer` round this session.

## G4

**Auto-closed** — backend-only diff (two migrations, one server module, no
rendered component), no outstanding builder rejection, no blocking `security`
finding, behavior matches the five written PRD acceptance criteria. Per PIPELINE
§3, none of the three human-escalation carve-outs apply.
