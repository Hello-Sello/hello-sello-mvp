# 0026 relationship-write-gate — work order

lane:   FULL
branch: claude/muskan/work
stage:  triage ✅ → census ✅ → interview ✅ → PRD ✅ → approaches research ✅ → ADR drafted ✅ → adr-checker round 1 (next)

## Seed
Muskan, 2026-08-26. Origin: HEL-84 (Linear), High priority. Found by `security` review
during HEL-82's build, 2026-08-25. Deliberately NOT fixed as part of HEL-82 — that
ticket's build was already large, and this needs its own careful pass.

**The problem, in one sentence:** HEL-82's acceptance criteria promised that suspending a
relationship blocks new deals, new messages, AND new pricing asks — only the "new deals"
half shipped (`send_deal` + `confirm_detected_deal` + `accept_connection_request` all
gained relationship-liveness checks). Chat messages and pricing asks have **zero**
relationship-status check anywhere, and `authenticated` holds `INSERT` on both
`chat_message` and `pending_inbox_item` directly — reachable via a direct PostgREST call,
not only through the app.

**Why now, not later:** suspension was unreachable before HEL-82 — this exact gap
couldn't be exploited because nothing could ever put a relationship in a non-active
state. HEL-82 makes `suspended`/`ended` real, so the gap is live today, not latent.

## Triage — the YES answer
| # | | | evidence |
|---|---|---|---|
| 0 | broken / never worked as specified? | NO | HEL-82 (which created the exploitable state) is the sibling ticket, not this one — this is a design-completeness gap, not a regression |
| 1 | new screen or surface? | NO | |
| 2 | migration / RLS / RPC / auth? | **YES** | `msg_all` `WITH CHECK`, and `createPairInboxItem`/`requestProductPricing`/`inbox_insert` `WITH CHECK` |
| 3 | concept not in CONTEXT.md? | NO | relationship status already documented |
| 4 | changes what the product does? | **YES** | who can write, not just who can read |
| 5 | file locked elsewhere? | NO | both sync files clean |
| 6 | more than one ticket? | possible | two independent doors (chat insert, pricing-ask insert) — `/design` to confirm |

## What needs deciding — NOT an engineering call (per the ticket itself)
1. `is_relationship_member()` is shared by reads that must stay open (historical records
   readable) and the one write path that shouldn't (`msg_all`, `FOR ALL`). A status
   predicate needs to land on the `WITH CHECK` only, not the shared function — mirrors
   `20260825120000_msg_all_deal_detected_gate.sql`'s precedent.
2. Whether "new pricing ask" also covers an existing pricelist becoming
   visible/orderable, or just the initial connection/pricing REQUEST. **This is a product
   read of the AC's intent — yours.**

## Census (L-037), done 2026-08-26 — read-only, no code touched

**`pending_inbox_item` INSERT — two client-side writers, both under ONE policy.**
`createPairInboxItem` (`discover/actions.ts:35`, called by `sendConnectRequest` and
`requestProductPricing`) and `sendPersonConnectRequest`
(`discover/personActions.ts:22`) both write through the same `inbox_insert` RLS policy
(`20260607170000` + narrowed by `20260823090000:306`) — one predicate change covers
both callers. **Precedent already exists**: HEL-75 added a deactivation/deletion check
to this exact policy (`actions.ts:90-93`'s comment cites it), so a status predicate
follows an established pattern, not a new one.
Server-side: `deliver_deal.sql:53` (Sella's delivery door) also inserts here, and its own
comment (`:20`) says it's `SECURITY DEFINER` **because** the RLS-based sender check
doesn't fit its caller shape — meaning **this one insert bypasses `inbox_insert`
entirely** and needs its own explicit check, not the shared predicate.

**`chat_message` INSERT — four client-side writers, all under ONE policy (`msg_all`,
`FOR ALL`).** `postMessage` (`store.ts:470`, the actual user-composed message door),
`postDealMessage` (`store.ts:500`), the accept-flow bulk seed-line insert
(`store.ts:646`, inside `acceptInbox` — the same code region HEL-68 is about to move),
and `announceDealEvent` (`deals/actions.ts:683`, called by decline/sign/propose/confirm/
withdraw/negotiation/promotion). One `WITH CHECK` predicate on `msg_all` would cover all
four.

**🔴 The finding that changes the fix's shape: most `chat_message` writers are NOT
client-side at all.** At least a dozen migrations define `SECURITY DEFINER` RPCs that
insert into `chat_message` directly in SQL — `send_deal`, `propose_deal_rpc`,
`confirm_deal_change_announce` (+ its notes/margin-carry/negotiation-membership
siblings), `create_deal_draft_rpc` (+ its notes/delivers/retire-private-box/two-owner
variants), `deal_line_item_batch`, `deal_event_system_voice`. **The repo's own migration
comments confirm RLS does not reach these**: `confirm_deal_change_announce.sql:19` says
outright *"SECURITY DEFINER bypasses the chat_message sender restriction"*, and
`propose_deal_rpc.sql:13` says the RPC's own thread-membership check exists **because**
RLS can't do that job for it. **Only two of these are known-gated today**: `send_deal`
(HEL-74's `20260825180000_send_deal_relationship_liveness_guard.sql`) and its 0023
rewrite (`20260825090000_send_deal_c2c_announce.sql`).
So: **a `WITH CHECK` predicate on `msg_all` alone would gate `postMessage` and nothing
else that matters** — every deal-lifecycle chat write goes through an RPC that bypasses
it. The fix needs a per-RPC liveness check (HEL-74's pattern, repeated), not one shared
predicate — or a shared internal function every RPC routes through, which doesn't
currently exist (checked: no `insert_chat_message`/`_post_message` helper found).
**Not yet done, and it's real `/design` work, not census:** deduplicating that RPC list
down to the currently-live function bodies (several of those files are historical
`create or replace` layers on the same function name, not 12 distinct live writers) and
confirming each one's actual reachability.

## Files so far
(none yet)

## Locked
(none yet)

## Deferred
(none yet)

## Attempts
(none yet)

## Gate log
(none yet)

## Interview — decisions locked 2026-08-26 (all three answered)
1. **Pricing-ask scope → NEW requests only.** Suspending a relationship blocks new
   connect/pricing requests; pricing the buyer already had access to keeps working
   unchanged. Not a read/visibility change — insert-gate only.
2. **RPC gate shape → ONE shared check function, called from all ~12 write sites** —
   not 12 independent inline checks, and not a hunt for a different mechanism. Grounds:
   general data-layer security guidance (single validation point in the data-access
   tier) + this repo's own L-057 ("import the predicate, don't restate it"). `/design`
   writes the function once, wires it into every call site.
3. **Sella's `deliver_deal` → gets the same check, no exemption.** A suspended
   relationship is frozen for automated delivery the same as for a human send.

Next: hand to `/design` — which now has a concrete target shape (one shared assertion
function) rather than an open architecture question. G3 (your real approval gate)
still applies once the ADR is drafted.

## Files so far (added)
- `docs/PRD/0026-relationship-write-gate.md` — written 2026-08-26, from the census +
  the three locked interview answers above. **Corrected 2026-08-26** after approaches
  research: the function returns `boolean`, not `void` (a `void` function can't
  appear in an RLS `WITH CHECK`), and `pending_inbox_item` has no `relationship_id`
  column — the `inbox_insert` policy must derive it from the company pair.
- `docs/muskan-build/0026-relationship-write-gate/RESEARCH.md` — approaches research,
  2026-08-26. Deduplicated the census's ~12 flagged migrations down to real call
  sites: 2 RLS policies, 2 functions to REFACTOR (extract their already-duplicated
  inline check into the new shared function), 2 functions to newly gate
  (`deliver_deal`, `propose_deal`), 1 excluded (`create_deal_draft` no longer
  touches `chat_message` at all, confirmed live), 1 flagged open below.

## New open question from research — not covered by the original 3
`confirm_deal_change` inserts NEW `chat_message` rows when a held pricing/quantity
change is accepted or declined — literally covered by the PRD's letter, but that
insert happens on a deal that was ALREADY active when it was sent; HEL-74's own
header explicitly punted this exact question as "a genuine product call, not an
engineering one" and it's still unanswered. Does suspending a relationship also
freeze resolution of an in-flight held change on it, or does that need to complete
regardless of a suspension that happened mid-negotiation?
