# 0027 — retire connect/inbox's ticket machinery; deals and connected-pricing post straight to chat

**Status:** drafted 2026-09-01, from `RESEARCH.md` + interview (`docs/muskan-build/0027-retire-connect-inbox/STATE.md`). Supersedes the original 2026-08-31 decision's framing per the 2026-09-01 correction, `docs/decisions/DECISIONS.md`.

## Problem

Two things were wrong, not one. First, Discover's Requests list only handles `connect`/`connect_message`, while `pricelist_request` and `deal_card` only surface via `/connect/inbox` — a full ticket-inbox page built for a multi-person-per-company team model this MVP doesn't have. Second, and found during this spec's interview: `deal_card` tickets and same-company-pair pricing tickets were never true "unconnected sends" in the first place. `confirm_detected_deal` only ever fires inside a chat thread on an *existing* relationship — the company pair is already connected by construction. Pricing requests already had this exact fix ("post into the existing thread when connected") named and deliberately deferred in ADR-0005 (2026-08-19), for lack of a messaging mechanism that has since been built (the August direct-to-chat work for deals).

So the real fix isn't "give the old page's two remaining types a new home in Discover" — it's "stop ticketing things that were never waiting on consent to begin with," and only keep the accept gate for what's actually an unconnected send: a pricing ask to a company you've never talked to. This deliberately supersedes the locked inbox prototype (`prototypes/inbox-prototype/NOTES.md`, Variant A, 2026-06-06) — that UI retires, not reuses.

## In / Out for v1

**In:**
- `confirm_detected_deal`'s "person unknown" branch resolves the receiving company's one person directly and adds them as deal co-owner in the same transaction — mirrors the existing "person known" branch exactly. No `pending_inbox_item` row, no ticket, ever again for this path.
- `requestProductPricing` branches on relationship status: an already-connected pair posts the ask straight into the existing company chat thread; a genuinely unconnected pair keeps today's ticket behavior.
- Discover's Requests list widens to include `pricelist_request` (the only type that still needs it) alongside `connect`/`connect_message`, with a visible type label per row.
- A one-time backfill for any `deal_card` tickets already pending in `pending_inbox_item` at deploy time — resolved the same way the fixed code would resolve a new one (receiving company's person added as co-owner), so nothing is orphaned by the deletions below.
- `deliver_deal` and `claim_deal_ticket` are deleted (not deprecated) — no caller remains once the above ships. This discharges ADR 0006 §7.2/J4's "kept alive for Sella's future traffic" note.
- `/connect/inbox`'s route and module retire: `InboxView`, `LensTabs`, `InboxList`, `InboxDetail`, `AssignMenu`, `lib/lenses.ts`, `inbox.ts`'s claim/assign functions. Keep `requestActionError.ts` (shared) and `acceptItem`/`declineItem` (still used by the widened Discover list).
- Remove the sidebar's "Connection Request" nav entry and the two "wants to connect → open inbox" CTAs in Discover.
- Update the three e2e specs that navigate to `/connect/inbox`.

**Out:**
- Claim/assign/reassign/history — retiring, not migrating. MVP is one person per company per side.
- Home's proposed deal-claim board (2026-07-23) — dropped, moot.
- `connect`/`connect_message` behavior — untouched; these are genuinely pre-relationship asks.
- Any change to `accept_connection_request`'s own body — reused as-is for the remaining ticket type.
- Multi-person-per-company visibility rules — deferred (Path B).

## Functional requirements

1. `confirm_detected_deal`'s `else` branch (currently `perform public.deliver_deal(v_card)`) instead resolves the receiving company's one active person (via `person.company_id`) and inserts them as `deal_member` owner on the born workspace, matching the `v_cp is not null` branch's own insert shape (lines 167-181 of the live function) — same transaction, same idempotency guard.
2. `requestProductPricing` checks whether an active `relationship` already exists between sender and receiver company before calling `createPairInboxItem`. If yes, it posts the pricing ask into the existing company chat thread instead (mechanism mirrors `send_deal`'s company-arm resolve-or-create-thread pattern). If no, unchanged — creates the `pricelist_request` ticket.
3. `companyRequests.ts`'s filter widens from `["connect","connect_message"]` to add `"pricelist_request"` — `deal_card` is deliberately NOT added, since it should never reach this table again after (1) ships.
4. Discover's Requests list gets a visible type label per row (existing `REQUEST_TYPE_META` label set relocates out of the retiring module — new home decided at `/design`).
5. One-time backfill migration: for every `pending_inbox_item` row where `type = 'deal_card' and status = 'pending'`, resolve it the same way (1) would — add the receiving company's person as `deal_member` owner, mark the ticket `accepted`. Must run before or in the same deploy as the deletions in (6)/(7).
6. Delete `deliver_deal` and `claim_deal_ticket` — verify no other caller exists at `/design` time (research found none) before dropping.
7. `/connect/inbox`'s route and module retire — file set as listed in the In list above.
8. Remove the "Connection Request" nav entry (`surfaces.ts:54-55`) and the two CTA links (`ConnectActions.tsx:44`, `CompaniesSection.tsx:100`).
9. Update `e2e/inbox-accept.spec.ts`, `e2e/deal-lands-in-c2c-chat.spec.ts`, `e2e/deal-c2c-create.spec.ts`.

## I/O

- No new tables. `pending_inbox_item` stops receiving `deal_card` rows going forward; existing ones are backfilled away, not left in place.
- No new RPCs for the accept path — `accept_connection_request` is the only one Discover's list calls after this ships.
- `confirm_detected_deal` and `requestProductPricing` both gain new internal branches — exact SQL/function shape decided at `/design`.
- No client-facing API changes to the accept/decline surface itself — same `acceptItem`/`declineItem` functions, one fewer type to branch on.

## Constraints

- Must not change what counts as "connected" — reuses the existing `relationship` table/status, no new definition.
- Must preserve company-wide receiver visibility for anything still ticketed (`pricelist_request` to an unconnected company) — unchanged from today.
- Sequencing, strict: (1) confirm_detected_deal fix and (2) requestProductPricing split can ship independently and first. (5) the backfill must run before (6)/(7). (3)/(4) Discover's list widening can ship anytime but the module deletion (7) cannot ship before the backfill (5) is done and (3) is live — otherwise a stale or newly-unconnected pricing ticket has nowhere to be seen.
- Must not touch `send_deal` — already fixed in August, out of scope here.

## Edge cases

| Case | Behavior |
|---|---|
| The receiving company has zero active people at the moment Sella's fix tries to resolve one | Cannot happen under the one-person-per-company MVP invariant for any company that can receive deals; if it's ever violated, the function should raise rather than silently drop the deal — exact error text decided at `/design`. |
| A `deal_card` ticket is mid-backfill when a new detection fires | Backfill runs once, at deploy, before the fixed `confirm_detected_deal` is live — no overlap window by construction of the deploy order. |
| A pricing ask is sent the instant a connection is accepted (race) | Whichever transaction commits first decides the path; not a new race class beyond what `relationship` status checks already have elsewhere in this codebase. |
| User hits the deleted `/connect/inbox` URL | TBD at `/design` — 404 vs redirect to `/discover`. |
| Two people at the same receiving company, future multi-person state | Out of scope — Path B. |

## Acceptance criteria

- **AC1:** Given Sella detects a deal in a company-wide (not person-tagged) thread and both sides accept, when the deal is born, then it appears directly in that existing chat thread with the receiving company's person as a co-owner — no ticket is created, nothing to accept separately.
- **AC2:** Given a pricing ask to a company I'm already connected to, when I send it, then it posts into our existing chat thread — no ticket, no separate accept step.
- **AC3:** Given a pricing ask to a company I'm NOT connected to, when I send it, then it appears in their Discover Requests list labeled "Pricelist request," and accepting it creates the relationship/thread as today.
- **AC4:** Given any `deal_card` tickets existed in the table before this shipped, when the deploy completes, then each one has been resolved (its company's person added as co-owner) — none are stuck, unreachable, or still show `pending`.
- **AC5:** Given the module is deleted, when I navigate the app, then no sidebar entry reads "Connection Request," no Discover company row/page shows a "wants to connect → open inbox" link, and `/connect/inbox` no longer serves the old page.
- **AC6:** Given `deliver_deal` and `claim_deal_ticket` are deleted, when the full test suite runs, then nothing references them — confirms no live caller was missed.
