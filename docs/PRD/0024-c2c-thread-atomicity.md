# 0024 — c2c/p2p thread atomicity at accept

**Status:** drafted 2026-08-26, from `researcher`'s sweep + Muskan's interview
(recorded in `docs/muskan-build/0024-c2c-thread-atomicity/STATE.md`). Origin: HEL-68,
found during `/design` of `0023-deal-draft-lands-in-chat` (ADR 0006 §8.10).

## Problem

Accepting a connection request is two network round trips today:
`accept_connection_request` mints the relationship (and, for a person-addressed
request, resolves/creates a p2p thread's counterpart data); the **browser** then
separately inserts the c2c and p2p `chat_thread` rows plus their seed lines
(`connection_established`, Sella's `intro`, the requester's own note) from a plan a
pure function computed (`planRollout`) but never wrote. If the tab closes between the
two round trips, the relationship exists with no chat thread and no seed line, and
nothing repairs it until — for c2c only, and only once a deal happens to be sent —
`send_deal`'s own resolve-or-create logic heals it (shipped in 0023).

**Corrected motivation** (the ticket's original "permanently stuck" framing is stale —
`send_deal` already self-heals a missing c2c thread since 0023): the real cost today is
that a freshly-connected pair sees **no conversation anywhere** until either side sends
a deal, and — separately — `msg_all`'s security hardening (HEL-67 Gap 2, a forgeable
sender on chat inserts) is blocked until these seed-line inserts move off the client
write path entirely.

## In / Out for v1

**In:**
- Move the c2c AND p2p thread-creation + all three seed-line shapes
  (`connection_established`, Sella `intro`, requester's own note) from the browser
  into `accept_connection_request` itself.
- `accept_connection_request` returns the created/resolved thread ids alongside the
  relationship id.
- Fix `resolveC2cThread`'s stale docstring (`store.ts`) — it currently asserts the
  disproven "minted on every accept" claim.

**Out:**
- Any change to how `send_deal` already heals a missing c2c thread (0023, untouched).
- A UI change to consume the newly-returned thread ids — no current caller needs them;
  they're exposed for the next caller that does, at near-zero cost, not built around a
  new feature.
- HEL-67 Gap 2 itself (the sender predicate) — this slug unblocks it, doesn't close it.

## Functional requirements

1. `accept_connection_request` creates or adopts the relationship exactly as it does
   today (unchanged: liveness guard from `20260825200000`, pending-item validation,
   sender/type checks).
2. In the same transaction, it creates or resolves the c2c `chat_thread` for the
   relationship, using resolve-or-create (never resolve-or-raise) — `INSERT ... ON
   CONFLICT DO NOTHING ... RETURNING` + re-select-on-null, the idiom already used
   elsewhere in this function.
3. For a person-addressed request, it also creates or resolves the p2p `chat_thread`
   the same way.
4. It writes the appropriate seed line(s) for whichever thread(s) it just created
   (never for one it merely resolved/adopted) — `connection_established` for c2c,
   Sella's `intro` and/or the requester's own note for p2p, matching
   `planRollout`'s current per-request-type mapping.
5. The browser's `acceptInbox` loop stops inserting `chat_thread`/`chat_message` rows
   entirely — it calls the RPC and reads the result.
6. `resolveC2cThread`'s docstring is corrected to describe the new (now genuinely
   true) invariant, not the disproven one.

## I/O

- **Input:** unchanged — `accept_connection_request(p_inbox_item_id uuid)`.
- **Output:** relationship id (unchanged) **plus** the c2c thread id and, when
  applicable, the p2p thread id.
- No new client-facing parameters.

## Constraints

- Every RLS clause `thread_all`/`msg_all` currently check for these writes
  (relationship membership; `type <> 'deal_detected'`) is already independently and
  more strictly verified earlier in `accept_connection_request`'s own body — L-057's
  audit found nothing that needs re-importing on the membership axis.
- Must not alter the 3-type chat model (c2c/p2p/deal) `ARCHITECTURE-NOTES.md` locks.
- `chat_thread`'s existing FK/uniqueness shape must be respected by the
  resolve-or-create idiom (matches the pattern already proven at
  `20260823090000...sql:162-183` and in `send_deal`'s own c2c resolve-or-create).

## Edge cases

| Case | Behavior |
|---|---|
| Accept adopts an existing (already-connected) pair | No new thread, no new seed line — matches today's `already`/`continue` gate exactly. |
| Tab closes after the RPC returns but before the browser does anything with the result | No longer a failure state — the thread and seed line already exist server-side. |
| A c2c thread was already healed by `send_deal` before this accept runs (should not be reachable in practice, but the resolve-or-create idiom handles it safely regardless) | Resolved, not duplicated; no seed line written a second time. |
| Person-addressed request where the person later gets removed from the company | Out of scope — unrelated to this slug's write path. |

## Acceptance criteria

- **AC1:** Given a fresh, never-before-connected pending connect request, when it is
  accepted, then a c2c `chat_thread` row exists for the relationship immediately after
  the RPC returns — checkable directly against the DB, no deal needs to be sent.
- **AC2:** Given the same setup but a person-addressed request, when it is accepted,
  then a p2p `chat_thread` row also exists immediately after, with the correct seed
  line(s) for that request type.
- **AC3:** Given an already-connected pair (adopt path), when a duplicate accept runs,
  then no second thread and no second seed line are created — thread/seed-line counts
  are unchanged.
- **AC4:** Given the browser's `acceptInbox` code path, after this change it issues
  zero `INSERT`s against `chat_thread` or `chat_message` — verified by removing the
  insert loop, not by a runtime guard.
- **AC5:** `resolveC2cThread`'s docstring no longer asserts the disproven "minted on
  every accept via planRollout" claim.
