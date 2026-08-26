# 0024 c2c-thread-atomicity — work order

lane:   FULL
stage:  triage ✅ → research ✅ → interview ✅ → PRD ✅ → approaches research ✅ → ADR drafted ✅ → adr-checker round 1 (next)
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

## Locked
(none yet)

## Deferred
(none yet)

## Attempts
- **research, 2026-08-26** — `researcher` sweep, no revisions requested yet. Six open
  questions carried below, unresolved.

## Gate log
(none yet)

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
