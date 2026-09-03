# 0027 retire-connect-inbox — work order

lane:   FULL
branch: claude/muskan/work
stage:  spec ✅ → prototype ✅ → design ✅ → build (next)

## Seed
Muskan, 2026-08-31, via `/triage`: "deletion of connection request page inside connect"

Scope is the decision locked the same session, before triage:
`docs/decisions/DECISIONS.md`, "2026-08-31 — Connection Request page retires; all four
request types settle in Discover's accept gate, no ticket/claim system for MVP." **Amended
2026-09-01** — same file, "Correction: Sella's detected deals were never an 'unconnected
send'" — the real scope is narrower and different: deals never go through an accept gate at
all (fixed at the source), pricing requests split on connection status, and only genuinely
unconnected pricing asks still need Discover's list. Read both entries; the PRD
(`docs/PRD/0027-retire-connect-inbox.md`) reflects the amended scope, not the original one.

## Triage — the YES answers
| # | | | evidence |
|---|---|---|---|
| 0 | broken / never worked as specified? | NO | deliberate retirement per a locked decision, not a regression |
| 1 | new screen or surface? | NO | `RequestsSection` (built 2026-07-23) and `/connect/inbox` both already exist |
| 2 | migration / RLS / RPC / auth? | NO | widens `companyRequests.ts`'s `.in("type", [...])` filter under existing RLS (`inbox_select`); accept-time branches to two existing RPCs (`acceptItem`, `claim_deal_ticket`), creates neither |
| 3 | concept not in CONTEXT.md? | **YES** | grepped `pending_inbox_item`, `RequestsSection`, `InboxView`, `claim_deal_ticket`, "connection request", "accept gate" — zero hits |
| 4 | changes what the product does? | **YES** | which request types Discover's accept gate covers, which RPC fires at accept time |
| 5 | file locked elsewhere? | NO | `ayush.md` offline since 2026-07-24; `muskan.md` fully released |
| 6 | more than one ticket? | **YES** | (a) extend `RequestsSection` for `pricelist_request` + `deal_card`, branching `acceptItem` vs `claim_deal_ticket` (`inbox.ts:287-290`); (b) retire `/connect/inbox`'s module (`InboxView`, `LensTabs`, `InboxList`, `InboxDetail`, `lenses.ts`, claim/assign) — explicitly gated on (a) shipping AND Sella's `deliver_deal` door moving off `/connect/inbox` writes |

**Lane: FULL.**

## Files so far
| stage  | wrote     |
|--------|-----------|
| triage | this file |
| spec   | `RESEARCH.md` (researcher prior-art sweep) |
| spec   | `docs/PRD/0027-retire-connect-inbox.md` |
| spec   | `docs/decisions/DECISIONS.md` — 2026-09-01 correction entry |
| spec   | `docs/architecture/CONTEXT.md` — "Accept gate" line added, then corrected |
| prototype | 3 row-label variants on live `/discover` (`?variant=`), thrown away after decision — see "For Muskan" |
| design | `RESEARCH.md` — `## Approaches (design)` section appended (Q1-Q6 + unenforced invariants) |
| design | `docs/architecture/adr/0009-retire-connect-inbox.md` — rev 2, after two checker rounds |
| design | `docs/architecture/adr/ADR-INDEX.md` — 0009's row |
| design | `TICKETS.md` — T01-T09 across four waves |

## Locked            (from ADR 0009, G3 approved 2026-09-03)

- **D1** — `confirm_detected_deal` stops cutting a deal ticket: delete `:182-185` of
  `20260827130000…`, **keep `:186`'s `end if;`**. Nothing replaces it. ⚠️ Dead-code deletion, not
  a live-bug fix — the branch is unreachable through every sanctioned route.
- **D2** — `requestProductPricing` branches on `is_connected_to_company`. Connected → a **new
  `SECURITY DEFINER` RPC** resolves-or-creates the c2c thread and posts a **person-voiced
  `message`** attributed to the asker, body = `buildPricingRequestNote(...)`. Grant contract
  (`REVOKE … FROM PUBLIC, anon` + `GRANT … TO authenticated`) and a parameter-free signature are
  both part of the contract, not build details.
- **D3** — filter widens to `["connect","connect_message","pricelist_request"]`. `deal_card`
  deliberately never added.
- **D4/D10** — prototype Variant C badge, on **every** row incl. person rows. New
  `src/app/discover/requestTypeMeta.ts` keyed on `DiscoverRequestKind`, **not** on
  `InboxRequestType`; owns no filtering.
- **D5** — backfill and drop are two separate migrations. Backfill sets `status = 'accepted'`
  (`'resolved'` is not a valid code) on `deal_card` + `pending` + `deleted_at is null` only.
- **D6** — `/connect/inbox` → permanent redirect to `/discover` in `next.config.ts`; folder still
  deleted.
- **D7** — the two SQL test files + runners deleted, **plus** the C9 block at
  `send_deal_c2c_announce_test.sql:391-412`.
- **D8** — rows stay product-blind at the query layer; the product name already rides in `note`.
- **D9** — box retitled "Connection requests" → "Requests".
- **D11** — `acceptItem`/`declineItem` return `Promise<void>`; `getInbox`/`getViewerContext`/
  `getAssignableMembers` deleted.

**Ordering is locked and not improvisable:** W1 → W3 → W4, W2 live before W4, D2's migration
before D2's app code. ADR §6 supersedes `PRD:61`, which states the reverse.

## Deferred — must NOT be built
- claim / assign / reassign / admin-reassign — MVP is one person per company per side
- Home's proposed deal-claim board (2026-07-23) — moot without multiple people per company
- `connect`/`connect_message` behaviour — untouched; genuine pre-relationship asks
- `accept_connection_request`'s body — reused as-is (it already accepts `pricelist_request`)
- multi-person-per-company visibility — Path B
- a single-RPC version of D2 — the fix if the read-then-write race ever bites, not now

## Attempts          three separate budgets — see PIPELINE.md §10
(none yet)

## Gate log
- 2026-09-02 — spec written (no gate — G1 merged into G3, PIPELINE §9a)
- 2026-09-03 — prototype decided (no gate): Variant C — type badge grouped above
  Accept/Decline — picked over inline-by-name (A) and eyebrow-above-name (B)
- 2026-09-03 — **G3 (spec + ADR, merged gate) — APPROVED.** ADR 0009 rev 2. Two checker
  rounds; round 1 raised 4 blockers (rungs 1/2/3/3), round 2 raised 2 NEW blockers (rungs 2/3).
  All six spot-verified against the repo, all six held, all folded in. ⚠️ **The loop did not
  converge** — round 2 still produced new rung 1-3 findings, so the 2-round budget closed
  without a clean round. A third round was offered and declined; recorded here because
  "approved" and "converged" are not the same state.
  Muskan also approved six spec amendments (FR1, AC1, AC4, PRD:60, PRD:61, FR6/FR9 scope)
  and three product rulings (product-blind rows, "Requests" title, badge every row), plus the
  message shape (person-voiced, from the asker).

## For Muskan

**All five `/spec` questions are closed — see `Locked` above. What follows is what `/design`
found that you did not already know.**

- ⚠️ **The deals half of this slug fixes nothing users hit.** Two independent checker rounds
  established that `confirm_detected_deal`'s ticket branch is unreachable: detection only lands
  on `p2p` threads, and `chat_thread_p2p_has_both_people` (`20260607090003:132`) forces both
  person ids non-null there, so the counterparty is never unknown. **No deal ticket has ever been
  cut through a sanctioned route.** D1 is a dead-code deletion. The slug still earns its keep on
  the pricing half and on deleting the page — but do not expect a G5 walk to show a
  before/after on deals, because the before-state is not reachable.
- ⚠️ **Two of my own claims were wrong and were caught, not by me.** (a) I described
  `send_deal_c2c_announce_test.sql:405` backwards — it is about `deliver_deal`, asserts the
  insert *is* present, and will hard-error after the DROP; I inferred it from a grep line without
  opening the block. (b) I claimed `e2e/fixtures/two-company.ts` reaches `claim_deal_ticket`; it
  does not — I inherited that from research and never verified it. Both are recorded in ADR §9.
- ⚠️ **OQ1 was put to you on a false premise.** I said the row would show no product name. It
  already does — `buildPricingRequestNote` writes `Pricing request for "X".` into `note`, which
  is already selected and already rendered. Your ruling produced the right code; the reason I
  gave was inverted.
- **The checker loop did not converge** (round 2 still raised new rung 1-3 findings). You
  approved anyway and declined a third round. If a build ticket surfaces something ugly in D2's
  RPC or the backfill, that is the likeliest place it hides.
- **A parallel session's `20260903090000_msg_all_sender_attribution_gate.sql` is local-only** and
  will ride to production on 0027's first `db push`. Desirable, but it must be a decision, not a
  surprise — and a "roll back 0027" is not a rollback of only 0027.
- **Two things found in passing, not filed:** `supabase/functions/sella-detect/index.ts:91-96`
  does not filter `chat_thread.type`, so a direct POST could reach a detection path every
  sanctioned route gates to p2p. And `deal_workspace.visibility` is client-updatable under
  `ws_all`, so a party can flip a workspace to `private` and lock the counterparty out — after
  the DROP there is no recovery path. Both belong in `/track-doubt`.
