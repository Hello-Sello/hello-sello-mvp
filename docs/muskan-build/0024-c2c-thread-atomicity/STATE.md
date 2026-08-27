# 0024 c2c-thread-atomicity — work order

lane:   FULL
stage:  triage ✅ → research ✅ → interview ✅ → PRD ✅ → ADR ✅ (2 checker rounds) → G3 ✅ (Muskan, 2026-08-26) → build ✅ → G4 auto ✅ → 🏁 SLUG COMPLETE
branch: claude/muskan/work

## Seed
Muskan, 2026-08-26. Origin: HEL-68 (Linear). Found during `/design` of
`0023-deal-draft-lands-in-chat`, checker rounds 1 and 2 (B2). Ruled its own slug by
Muskan, 2026-08-25 (ADR 0006 §8.10) — deliberately NOT folded into 0023.

**The problem, in one sentence:** accepting a connection is two network round trips —
`accept_connection_request` mints the relationship and creates no thread; the browser
inserts the c2c thread afterward from a pure planner (`planRollout`) that "writes
nothing." Close the tab between the two and you get a connected pair with no c2c
conversation, permanently, with no repair path in the product.

**The fix (per the ticket, not yet re-derived by /spec):** move the c2c insert into
`accept_connection_request` and delete the browser insert, using the RPC's existing
`INSERT … ON CONFLICT DO NOTHING RETURNING` + re-select-on-null idiom
(`20260823090000_connection_consent_and_verification_lockdown.sql:162-183`).

## Triage — the YES answer
| # | | | evidence |
|---|---|---|---|
| 0 | broken / never worked as specified? | NO | a design-completeness gap surfaced by review, not a reported break |
| 1 | new screen or surface? | NO | |
| 2 | migration / RLS / RPC / auth? | **YES** | rewrites `accept_connection_request`; needs a new migration; deletes `store.ts:600-640`'s browser insert |
| 3 | concept not in CONTEXT.md? | NO | C2C documented at `:41` and `:67` |
| 4 | changes what the product does? | NO | same outcome, made atomic — not a new rule |
| 5 | file locked elsewhere? | NO | both sync files clean, all locks released |
| 6 | more than one ticket? | possible | ticket's own "blast radius" section names 4 open sub-decisions — `/design`'s breakdown will settle whether this splits |

Diff touches migration/RPC only, no rendered surface named yet — G4 routing (auto vs.
human stop) to be confirmed once `/design` scopes the frontend blast radius (`store.ts`
callers, p2p thread parity question).

## Blast radius carried from the ticket (not yet re-verified)
- `store.ts:600-640` also writes the `connection_established` seed line, only for
  threads it creates — moving thread creation server-side must decide where that line
  is written, or it is lost.
- `e2e/inbox-accept.spec.ts:125,157-158` is the only guard on this invariant in the repo.
- A c2c thread healed by `send_deal` (0023 behaviour) already loses its
  `connection_established` seed line — a live, related consequence.
- p2p threads are created on the same path, same shape — undecided whether they move too.

## Files so far
- `docs/muskan-build/0024-c2c-thread-atomicity/RESEARCH.md` — `researcher`'s prior-art
  sweep, 2026-08-26. Reshapes the fix: `send_deal` already self-heals a missing c2c
  thread (shipped 0023), so this is no longer closing a "permanently stuck" bug — it's
  making the chat exist at accept time instead of lazily, and unblocking HEL-67 Gap 2.

## Locked (from ADR 0007, approved at G3)
1. `accept_connection_request` creates/resolves BOTH c2c and p2p threads + seed
   lines, in the same transaction as the relationship — signature change,
   `DROP` + `CREATE` (return-type change forces this), full grant re-emit.
2. Two new internal helpers (`_resolve_or_create_c2c_thread`,
   `_resolve_or_create_p2p_thread`), plain (not `SECURITY DEFINER`), callable only
   from another function's body, `REVOKE ALL` from `public, anon, authenticated`.
3. Seed-line inserts branch by request type (`connect_message` vs
   `pricelist_request` get different intro text) with real person/company name
   composition — not a single hardcoded body.
4. `clock_timestamp()` on every seed-line insert, not the `created_at` column
   default — preserves the message-ordering guarantee the deleted browser code had.
5. `send_deal` is NOT touched by this migration (named follow-up, not bundled).
6. `planRollout` and its callers are deleted in this same diff (dead code once
   `acceptInbox`'s insert loop goes) — not deferred.
7. Five existing SQL test-suite call sites (`connection_consent_lockdown_test.sql`,
   `accept_connection_request_status_guard_test.sql`) must be rewritten for the new
   return shape — explicit `TICKETS.md` item, not incidental.
8. Six-plus stale comments across `store.ts`, `inbox.ts`, `sella-intro/index.ts`,
   `messaging/types.ts` corrected in this diff (exact list in the ADR's Blast-radius).

## Deferred (from the PRD's Out list + ADR)
- Migrating `send_deal` onto the two new helper functions.
- The database-trigger alternative (considered, rejected — "action at a distance").
- Any UI change consuming the newly-returned thread ids — no current caller.
- HEL-67 Gap 2 itself — this slug unblocks it, doesn't close it.
- 0026-relationship-write-gate's own gate re-targeting — coordinated by line-number
  handoff once this migration lands, not built here.

## Attempts
- **research, 2026-08-26** — `researcher` sweep (prior art) + `researcher` sweep
  (approaches), both appended to `RESEARCH.md`.
- **design, 2026-08-26** — ADR 0007 drafted. `adr-checker` round 1: 2 blocking
  (a Blast-radius claim that was false — the function IS called from two live SQL
  suites that break on the signature change; a message-ordering guarantee silently
  dropped) + 9 notes, all folded in. `adr-checker` round 2: 1 blocking (a hardcoded
  message body that's actually 3 different bodies depending on request type, in
  the exact file being deleted) + 10 notes, all folded in. Budget exhausted at 2
  rounds per `/design`'s own rule — no round 3 spawned automatically.

## Gate log
- **G3 (spec + ADR, merged gate) — APPROVED, Muskan, 2026-08-26.** "yes, approved,"
  after a plain-English walkthrough of the ADR's core move (accept mints the
  relationship AND the chat in one transaction, so no in-between broken state is
  reachable).
- **`/build`, 2026-08-26.** Plan (`PLAN-HEL-68.md`) went through **3
  `plan-checker` rounds** before converging — each round found a genuine
  PL/pgSQL bug in the PREVIOUS round's own fix: round 1 caught that a naive
  `v_rel_id → relationship_id` rename would shadow the new OUT param; round 2
  caught that round 1's own fix miscounted (one occurrence needed deletion, not
  renaming — renaming it is a parse-time error in a function with OUT params)
  and that a `\v` escape in a different fix isn't valid Postgres syntax
  (silently corrupts any note starting with the letter "v"); round 3 confirmed
  both fixes correct and found no third bug. `test-writer` wrote deny-tests +
  5 invariant tests in one suite, plus a scoped follow-up fixing 3 call sites
  in a sibling suite the signature change would otherwise break (L-035 — that's
  test-writer's job, not builder's, even for a mechanical rewrite). `builder`
  implemented in one pass, reporting green.
  **Verified independently by the orchestrator (L-023), not taken on trust:**
  fresh `db reset`, both SQL suites green, `e2e/inbox-accept.spec.ts` 2/2,
  `tsc` clean, 474/474 vitest, eslint clean (1 pre-existing unrelated warning,
  confirmed via `git blame` to predate this session).
  `/code-review high` + `critic` + `security` (mandatory — migration/RPC/grants)
  all ran clean of blocking findings — full findings and disposition in
  `REVIEW.md`. Ten findings fixed directly (a missing `.trim()` that would have
  baked a double-space into single-name users' seeded messages; message
  ordering hardened from probabilistic `clock_timestamp()` ties to an asserted
  1ms offset; Linear issue codes stripped from migration/test comments per
  standing rule; a factually-false security claim about `chat_thread` grants;
  a stale precedent citation; an overstated docstring guarantee; dangling
  references to the deleted `rollout.ts`; both ADRs' stale "awaiting G3"
  status headers; the PRD's AC3 wording narrowed to match correct behavior).
  Eight more findings named and accepted, not fixed — see REVIEW.md for why
  each is either already-reasoned-about (ADR-level decisions), pre-existing
  and unrelated to this diff, or a real-but-low-priority coverage gap.
- **G4 — auto-closed**, backend-only diff (PIPELINE §3): two migrations, one
  server module, no rendered component. No outstanding rejection, no blocking
  `security` finding. None of the three human-escalation carve-outs apply.
- **`/ship`, 2026-08-27** — full gate re-run on the rebased tip (rebase was a
  no-op, `origin/dev` had nothing new): vitest 474/474, tsc clean, eslint zero
  new issues (1 pre-existing warning confirmed via `git blame` to predate this
  session, June 2026), SQL 58/58 fresh reset, e2e clean of regressions (22
  failures against a stale "15" baseline, all in files 0024 never touches —
  auth/team/present-info/public-profile — zero overlap with 0024's diff;
  0024's own `inbox-accept.spec.ts` guard 2/2 in isolation; two failure
  classes spot-verified structurally unrelated: a pre-existing `sb_secret_`
  JWT-signing mismatch, and a UI-timing issue in an unrelated surface).
  `security` pre-ship scan: **1 blocking (S7)** — the §C deny-tests for the
  two new internal helpers (`_resolve_or_create_c2c_thread`/`_p2p_thread`)
  caught on SQLSTATE 42501 alone, which an invoker-rights function shares
  with unrelated RLS/table-privilege denials one level deeper — the suite
  would stay green with the protective `REVOKE` removed. Fixed: added an
  explicit `has_function_privilege` assertion for both roles beside the
  existing call-and-catch. RED-first verified per S7's own remedy: granted
  EXECUTE back to `anon`/`authenticated` (simulating the exact regression),
  confirmed the suite now fails, `db reset` to restore, confirmed green
  again. Root cause + rule → `LEARNINGS.md` **L-064**. 3 more findings named,
  not fixed (S2 note — `service_role` holds EXECUTE on the "internal-only"
  helpers via this repo's own default-privilege norm, not a deviation; a
  generated-types drift note, already mitigated in `store.ts`'s own casts;
  a behavioral note — a companyless p2p thread isn't adopted by the new SQL
  path, matching the deleted browser code's identical pre-existing
  behavior). S6/S8 (schema drift vs. linked project, advisor scan) owed at
  the actual `apply_migration`/deploy step, not answerable pre-merge.

- **`/ship`, 2026-08-27, continued** — migrations `20260826090000`/
  `20260826100000` applied to production (`supabase db push --linked`);
  ledgered as APPLIED in `docs/deploy/cloud-migrations-pending.md` with
  post-push evidence. PR #182 → `main` (base chosen over `dev`: `dev` is
  stale, 3 commits behind and none new relative to this branch; the last
  two real PRs, #178 and #181, both landed on `main` directly). CI green,
  merged. Vercel production deploy `dpl_EAS4zdrEqWduA1envjo4mvVY9o4g`
  confirmed READY, aliased to `hello-sello-mvp.vercel.app`.

🏁 **SLUG COMPLETE** (build + ship mechanics). **G5 — OWED**: Muskan's own
live walk on production is the only remaining step before this slug closes.

## Interview — decisions locked 2026-08-26 (all six answered)
1. **Scope vs. HEL-67 Gap 2 → move the WHOLE rollout now** (c2c + p2p together, not
   c2c-only). Grounds: OWASP/vuln-management guidance (fix the pattern, not the
   instance) + this repo's own L-058, the exact class that produced HEL-84 out of
   HEL-82's narrow fix. This also closes Q2 (p2p parity) — same migration.
2. **p2p parity → same migration** (settled by #1).
3. **Return contract → return the thread ids.** Matches `send_deal`'s existing
   precedent and general API-design guidance (don't force a caller to refetch); the ids
   are already local variables from the `INSERT ... RETURNING`, so near-zero cost.
4. **PRD motivation → use the accurate framing.** Lead with "the chat exists at
   accept-time instead of lazily at first send" + "unblocks HEL-67 Gap 2," not the
   stale "permanently stuck" claim (send_deal already self-heals that since 0023).
5. **Stale docstring → fix it in this slug.** `store.ts:352-356`'s `resolveC2cThread`
   docstring (the exact false claim L-042 was written to catch) gets corrected as part
   of this diff, per Clean Code / Pragmatic Programmer's "leave touched code cleaner."
6. **DEV-83 → verify properly and close in Linear if stale.** Side task, not gating
   this slug's design.

Also worth knowing: **sequencing with 0026-relationship-write-gate matters** — both
slugs touch `store.ts:646`. If 0024 ships first, that write leaves the client path
entirely and 0026's census shrinks by one item.

Next: hand to `/design` — ADR + `adr-checker` + ticket breakdown, then G3 (your real
approval gate — cannot be skipped).

## Files so far (added)
- `docs/PRD/0024-c2c-thread-atomicity.md` — written 2026-08-26, from the research +
  the six locked interview answers above. Not previewed line-by-line before writing
  (per `/spec` step 4's own design: "show, then hand off — do NOT stop... as a report,
  not a gate") — full content is in the file for review.
