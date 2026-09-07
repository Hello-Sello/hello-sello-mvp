# 0026 — block new writes on a suspended/ended relationship

**Status:** drafted 2026-08-26, from the L-037 census + Muskan's interview (recorded in
`docs/muskan-build/0026-relationship-write-gate/STATE.md`). Origin: HEL-84, found by
`security` review during HEL-82's build.

## Problem

HEL-82 shipped the ability to suspend/end a relationship and promised — in its own
acceptance criteria — that a suspended relationship blocks new deals, new messages,
and new pricing asks. Only "new deals" shipped. Chat messages and pricing/connect
requests have zero relationship-status check anywhere, and `authenticated` holds
`INSERT` on both `chat_message` and `pending_inbox_item` directly — reachable via a
direct PostgREST call, not only through the app.

The census (STATE.md) found the fix is bigger than it looks: most `chat_message`
writes go through `SECURITY DEFINER` RPCs (`send_deal`, `propose_deal_rpc`,
`confirm_deal_change_*`, `create_deal_draft_*`, `deal_line_item_batch`,
`deal_event_system_voice`, and others) that bypass RLS entirely — confirmed by this
repo's own migration comments (`confirm_deal_change_announce.sql:19`:
*"SECURITY DEFINER bypasses the chat_message sender restriction"*). A `WITH CHECK`
predicate on `msg_all` alone would only gate `postMessage`.

## In / Out for v1

**In:**
- One shared assertion function (e.g. `assert_relationship_writable(p_relationship_id
  uuid)`), single owner of the "is this relationship open for new writes" rule.
- Wired into every write path that creates a NEW chat message, a NEW pricing/connect
  request, or Sella's automated delivery (`deliver_deal`) — both the RLS-governed
  client paths (`msg_all`, `inbox_insert`) and the ~12 `SECURITY DEFINER` RPCs that
  bypass RLS.
- Historical reads (existing messages, threads, pricing history) stay fully readable
  regardless of relationship status — this ticket touches writes only.

**Out:**
- Any change to `is_relationship_member()` itself — it stays a pure membership check,
  shared by reads that must stay open. The status check is a separate, additive gate.
- Existing/already-shared pricing becoming unusable on suspension (ruled out in
  interview — suspension blocks NEW requests only).
- Any change to how a relationship is suspended/ended/reactivated (HEL-82, shipped,
  untouched).

## Functional requirements

1. `assert_relationship_writable(p_relationship_id)` — `SECURITY DEFINER`, `STABLE`,
   raises when the relationship's status is not `'active'` (mirrors the liveness guard
   pattern already shipped for `send_deal`/`confirm_detected_deal`, generalized into a
   single reusable function rather than repeated inline per RPC).
2. `msg_all`'s `WITH CHECK` gains a call to this function, alongside its existing
   `can_access_thread(thread_id) AND type <> 'deal_detected'` clause — narrows the
   client-side `postMessage`/`postDealMessage` write door, not the read side.
3. `inbox_insert`'s `WITH CHECK` gains the same call, alongside HEL-75's existing
   deactivation/deletion check — narrows `createPairInboxItem`/
   `sendPersonConnectRequest`'s shared write door.
4. Every `SECURITY DEFINER` RPC identified by the census as writing `chat_message` or
   `pending_inbox_item` for a NEW row (not a status update on an existing one) calls
   `assert_relationship_writable` explicitly, since RLS cannot reach them. Full,
   deduplicated list to be confirmed at `/design` (the census flagged ~12 migration
   files but noted several are historical `create or replace` layers on the same
   live function, not 12 distinct call sites).
5. `deliver_deal` (Sella's automated delivery door) gets the same check — no
   exemption.

## I/O

- New function: `assert_relationship_writable(p_relationship_id uuid) RETURNS boolean`
  — returns `true` on success, `RAISE EXCEPTION`s on violation, never returns
  `false`. **Corrected from an earlier `RETURNS void` draft** (`/design`'s
  approaches research, `RESEARCH.md`): a `void`-typed function cannot appear
  inside an RLS `WITH CHECK` boolean expression — Postgres rejects it at
  `ALTER POLICY` time, not at runtime. `boolean` serves both the two RLS
  policies (called as a term in `WITH CHECK`) and the RPC bodies (called via
  `perform`, which discards the return value either way) with one signature.
  Precedented by this repo's own `company_can_receive_requests`
  (`20260825130000_inbox_insert_receiver_gate.sql`), same shape.
- `pending_inbox_item` has no `relationship_id` column (verified live) — the
  `inbox_insert` policy's `WITH CHECK` must derive the relationship from the
  company pair (canonical `least`/`greatest` ordering, the same idiom
  `accept_connection_request` already uses) before calling the assertion.
- No client-facing API changes — this is entirely a server-side write-path narrowing.

## Constraints

- Must not weaken `is_relationship_member()` or any read-side RLS — reads stay exactly
  as open as today.
- Must follow L-057's rule: import the check via a function call from each site, never
  re-derive/re-type the predicate inline per RPC.
- Must not break existing tests that legitimately write on an `active` relationship —
  the new gate is additive, only fires on `suspended`/`ended`.

## Edge cases

| Case | Behavior |
|---|---|
| A relationship is reactivated after being suspended | Writes resume immediately — the check reads current status, no cached/stale state. |
| A message/pricing-ask write races a suspend happening concurrently | Whichever transaction commits first wins normally; no new race introduced beyond what any status check has. |
| Sella (`deliver_deal`) targets a suspended relationship | Refused, same as a human-initiated write — no exemption (locked in interview). |
| An RPC the census didn't find (a caller added after this census) | Out of this ticket's proof — `/design`'s dedup pass is the closing check, not a guarantee against future additions. |

## Acceptance criteria

- **AC1:** Given a suspended relationship, when a user attempts to post a chat message
  on it (via the app), then the write is refused.
- **AC2:** Given a suspended relationship, when a user attempts to post a chat message
  via a direct PostgREST call (bypassing the app), then the write is still refused —
  proves the gate is server-side, not just UI-side.
- **AC3:** Given a suspended relationship, when a user requests new pricing or sends a
  new connect/pricing request addressed to that pair, then the write is refused.
- **AC4:** Given a suspended relationship, when Sella's `deliver_deal` attempts to
  deliver onto it, then the write is refused.
- **AC5:** Given a suspended relationship, when any existing message, thread, or
  pricing history is read, then it remains fully visible — unchanged from today.
- **AC6:** Given a suspended relationship that already had a shared pricelist before
  suspension, when the buyer views that existing pricing, then it still displays as
  before — suspension does not retroactively hide it (interview ruling: new requests
  only, not existing access).
- **AC7:** Given a relationship with a held pricing/quantity change already pending
  when it is suspended, when either side accepts or declines that change, then the
  resolution succeeds — an in-flight change is not blocked by a suspension that
  happened after it was raised (interview ruling, 2026-08-26: `confirm_deal_change`
  is explicitly excluded from this gate).
- **AC8:** Given a deal event that occurs on a suspended relationship (signed,
  cancelled, a change proposed, negotiation requested), when the system posts its
  automatic announcement message, then the announcement still posts — same
  reasoning as AC7, an event already in motion is not a "new" write this gate cares
  about (ruling, 2026-08-26: these four system-authored types are explicitly
  exempt from this gate). Implemented via the `announce_deal_event` `SECURITY
  DEFINER` RPC (§12 addendum, post-ship correction) — the original client-side
  `announceDealEvent` helper is deleted; the RPC bypasses `msg_all` entirely
  rather than carrying a client-facing exemption.
