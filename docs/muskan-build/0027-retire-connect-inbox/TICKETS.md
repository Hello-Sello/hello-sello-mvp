# 0027 retire-connect-inbox — tickets

From ADR 0009 (`docs/architecture/adr/0009-retire-connect-inbox.md`), rev 2.
Every ticket passes the Ready checkpoint: INVEST · sized S/M/XS · EARS acceptance criteria.

**Wave order is a hard constraint, not a preference** — see ADR §6. Parallel tickets inside a
wave touch disjoint file sets; that is verified per pair below, not assumed.

```
W1  T01 ┐                 W2  T03 → T04          W3  T05          W4  T06 ┐
    T02 ┘                                             ↓                T07 ┼ T08
                                              checkpoint I-M5           T09 ┘
```

---

## W1 — fix the sources (no deletions yet)

### T01 · `confirm_detected_deal` stops cutting a deal ticket
**Size:** S · **depends on:** nothing · **ADR:** D1, I-M1, I-M2

Delete `:182-185` of
`20260827130000_confirm_detected_deal_relationship_write_gate_refactor.sql` — the
`perform public.deliver_deal(v_card);` and its comment. ⚠️ **Keep `:186`'s `end if;`**; the cited
range is five lines, not one. Add nothing. Re-emit the full function body per
`.claude/rules/supabase.md` (diff against the latest-timestamp definition, not a local copy).

⚠️ **This is a dead-code deletion, not a live-bug fix.** The branch is unreachable through every
sanctioned route: `chat_thread_p2p_has_both_people` (`20260607090003:132`) forces both person ids
non-null on p2p, and detection only reaches p2p threads. Do not write the ticket up, or test it,
as though it fixes something users hit.

**EARS**
- When a `deal_detected` message is confirmed **on a c2c thread**, the system shall create zero
  `pending_inbox_item` rows.
- When that deal's workspace is born, the system shall make it accessible to a member of the
  receiving company **who is not the resolved counterparty and holds no `deal_member` row** —
  `can_access_workspace` returns true.
- When the second confirmation is recorded, the system shall preserve the existing idempotency
  guard (`born_deal_card_id`) and the relationship-liveness check unchanged.

⚠️ **Fixture constraint — this is the whole difficulty of the ticket.** Both assertions are green
*before and after* this change on a p2p fixture, which is the obvious one to reach for. The
fixture must be a `deal_detected` message on a **c2c** thread, inserted as a role that bypasses
`msg_all`; and the second assertion must pick a member who is *not* the counterparty, since the
counterparty does hold a `deal_member` row on the live path. A p2p fixture proves nothing.

**Files:** one new migration under `supabase/migrations/`, one new/updated SQL suite + runner.
**Not in scope:** dropping `deliver_deal` (T06). It stays callable-but-uncalled through W1-W3.

---

### T02 · Pricing ask to a connected company posts to chat instead of cutting a ticket
**Size:** M · **depends on:** nothing · **ADR:** D2, I-M3, I-M4, I-M12, I-M13, I-J6

Two halves. (a) A new `SECURITY DEFINER` RPC that resolves-or-creates the c2c thread, calls
`assert_relationship_writable`, and inserts a **person-voiced** `chat_message`
(`sender = 'person'`, `sender_person_id` = the asking person) whose body is the existing
`buildPricingRequestNote(...)` sentence. (b) `requestProductPricing` calls
`is_connected_to_company(receiver)` and routes to that RPC when connected, to
`createPairInboxItem` when not.

**The grant contract is part of the ticket, not a follow-up:**
```sql
REVOKE EXECUTE ON FUNCTION public.<rpc>(...) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.<rpc>(...) TO authenticated;
```
`FROM PUBLIC` is load-bearing — a bare `FROM anon` leaves `anon` inheriting through PUBLIC
(`20260724121000:23-28`).

⚠️ **The signature is part of the contract.** The RPC takes **no author parameter, no thread id,
no free-form body**: `sender_person_id` comes from `auth.uid()` inside the function, and the
thread is derived from `current_company_id()` + the receiver company. A definer bypasses `msg_all`
entirely — including the `sender_person_id = auth.uid()` attribution gate that shipped in
`20260903090000` one day before this ticket. A `p_sender_person_id` parameter would re-open
message forgery a day after it was closed.

**Also in scope:** update `_resolve_or_create_c2c_thread`'s `COMMENT ON FUNCTION`
(`20260826090000:91-93`), which currently says it is callable only from
`accept_connection_request`. This ticket makes that false. Do not add a GRANT to the helper.

**EARS**
- When a pricing ask is sent to a company the sender is already connected to, the system shall
  post one person-voiced message into the existing c2c thread and create zero
  `pending_inbox_item` rows.
- When a pricing ask is sent to a company the sender is **not** connected to, the system shall
  create exactly one `pricelist_request` row and post no message.
- When the same ask is repeated for the same product to the same connected company, the system
  shall not produce a second chat message.
- When the relationship is suspended or ended, the system shall refuse the post.
- When `anon` attempts to execute the new RPC, the system shall refuse — asserted via
  `has_function_privilege`, for both `anon` and `PUBLIC`.

**Files:** new migration (RPC + grants + comment fix), `src/app/discover/actions.ts`, new SQL
suite + runner, new unit test.
⚠️ `requestProductPricing.gate.test.ts` is green today and covers only the *price* gate — it does
not cover this axis. A new assertion is required; do not read its green state as cover.

---

## W2 — widen Discover (must be live before W4)

### T03 · Discover's Requests list carries pricelist requests
**Size:** S · **depends on:** nothing (ships independently of W1) · **ADR:** D3, D8, I-J4

Widen `companyRequests.ts`'s filter to `["connect","connect_message","pricelist_request"]`. Add
`type` to the `.select()` and to `DiscoverCompanyRequest` — it selects **neither** today. Do
**not** add `metadata` or a product join (D8): the product name already rides in `note`, which is
already selected and already rendered.

Add a comment at the filter naming why `deal_card` is absent (I-J4) — the enum has more codes
than this list, and the next reader must find the reason without asking.

**EARS**
- When a pricing ask from an unconnected company is pending, the system shall show it in the
  viewer's Requests list.
- When that row is accepted, the system shall mint the relationship, both threads and the
  pricelist intro message — via the **existing** `accept_connection_request`, unmodified.
- When a `deal_card` or `connect_person` row exists, the system shall not show it in the company
  requests group.

**Files:** `src/app/discover/companyRequests.ts` (+ its test).
**Fence:** `accept_connection_request` already accepts `pricelist_request` (`20260826100000:120`)
and already writes its intro copy (`:237-239`). **Do not edit that function.**

---

### T04 · Every request row shows a type badge; the box is retitled
**Size:** M · **depends on:** T03 (needs the `type` field) · **ADR:** D4, D9, D10, I-M10, I-M11

New `src/app/discover/requestTypeMeta.ts`, keyed on
`DiscoverRequestKind = "connect" | "connect_message" | "pricelist_request" | "person"`.
**Do not key it on `InboxRequestType`** and do not import from `connect/lib/inbox-display.ts`:
`COMPANY_INBOX_TYPES` is derived from that map's keys (`inbox-display.ts:58-60`), so adding a
member there would silently widen a data filter. This map owns **no** filtering.

Render the badge per prototype Variant C — stacked above Accept/Decline, grouped with the
decision rather than the identity. Badge **every** row, person rows included ("Person"). Retitle
the box "Connection requests" → "Requests" (`RequestsSection.tsx:134`).

**EARS**
- When any request row renders, the system shall display a type badge for it.
- When a row of an unrecognised type is encountered, the system shall not throw — no badge
  lookup may return `undefined` (this exact failure took the page down once,
  `inbox-display.ts:51-56`).
- When the Requests box renders, its title shall read "Requests".

**Files:** `src/app/discover/sections/RequestsSection.tsx`, new
`src/app/discover/requestTypeMeta.ts` (+ tests).
**Parallel-safety vs T03:** disjoint files, but ordered — T04 consumes the `type` field T03 adds.

---

## W3 — clean the table

### T05 · Backfill: resolve every pending deal ticket
**Size:** S · **depends on:** T01 (must be live first) · **ADR:** D5, I-M5

One **DML-only** migration. For every `pending_inbox_item` where `type = 'deal_card'`,
`status = 'pending'`, `deleted_at is null`: set `status = 'accepted'`. **Insert no memberships** —
the deal is already reachable company-wide (T01's I-M2 is what proves this).

⚠️ **`'resolved'` is not a valid code.** `inbox_status` seeds exactly `pending | accepted |
rejected` (`20260607090001:337-340`) and `status` is FK'd to it, so a literal `'resolved'` will
not apply. Use `accepted`, per `PRD:36`.

⚠️ **The `WHERE` clause is the safety mechanism.** All three predicates are required. An
`UPDATE` missing the `type` filter would accept every pending ticket in the table — live
`connect`/`connect_message`/`pricelist_request` rows included — and nothing restores them.

⚠️ **Ordering, and the spec is wrong about it.** `PRD:61` says the backfill runs *before* the
`confirm_detected_deal` fix. That is backwards: a detection landing between the sweep and the fix
would cut a fresh ticket after the sweep passed. **T01 ships first.** ADR §6 rule 1 supersedes
`PRD:61`.

⚠️ **This migration is a no-op on `db reset`** — the seed contains no `deal_card` tickets
(`seed.sql` has only `connect`, `connect_message`, `connect_person`). A green local run proves
the migration *applies*, not that it *works*. Its real target is cloud rows only. Fixture the
test explicitly; do not rely on seed data.

**EARS**
- When the backfill has run, `select count(*) from pending_inbox_item where type='deal_card' and
  status='pending' and deleted_at is null` shall return 0.
- When the backfill has run, the count of **pending non-`deal_card` rows shall be unchanged**.
- When a `deal_card` ticket is accepted, the system shall leave its deal card, workspace and chat
  thread untouched.

**Files:** one migration, one SQL suite + runner.
**Checkpoint before W4 starts:** run **both** counts against the target environment for real. Not
assumed, not inferred from a green suite. The first count alone passes whether the backfill
touched only `deal_card` rows or flipped every pending row — it cannot see an over-broad `UPDATE`,
and the symptom would be Discover's list quietly looking empty.

---

## W4 — delete (nothing here ships before W2 is live and W3's checkpoint reads 0)

### T06 · Drop `deliver_deal` and `claim_deal_ticket`, and their tests
**Size:** S · **depends on:** T01, T05 · **ADR:** D7, I-M6, I-M7, I-J5

One **DDL-only** migration, following `20260724120800_drop_propose_edit_rpcs.sql`'s shape.
Run the `pg_proc.prosrc` census **matched on call shape** and confirm zero rows before writing it:
```sql
prosrc ~* '(perform|select)\s+public\.(deliver_deal|claim_deal_ticket)\s*\('
```
⚠️ **A plain `ILIKE '%deliver_deal%'` can never return zero** — `accept_connection_request` and
`send_deal` both name these functions in **comments inside their bodies**, and `prosrc` includes
comments. The naive query returns four rows today. `pg_depend` is not a substitute either: it
cannot see a call inside a plpgsql body at all.

Delete `supabase/tests/{deliver_deal,claim_deal_ticket}_test.sql` and their two runners.

⚠️ **Also delete the C9 block at `supabase/tests/send_deal_c2c_announce_test.sql:391-412`.** It
resolves `pg_get_functiondef('public.deliver_deal(uuid)'::regprocedure)` and asserts the ticket
insert is still present. After the DROP that cast raises `undefined_function`, and with
`ON_ERROR_STOP=1` the entire suite goes red. It has a live runner — this is real coverage, and
the block outlives its subject.

The migration header must name I-J5's risk: nothing but a one-time census stops a future
migration re-introducing a caller.

**EARS**
- When the migration has applied, no **call site** for either function shall remain in `src/`,
  `e2e/` or `supabase/`. *(Call sites — comments and historical migrations legitimately survive,
  so a bare reference-grep cannot pass.)*
- When the full SQL suite runs afterwards, every suite shall pass.

**Files:** one migration, four test-file deletions, one test-file edit.

---

### T07 · Retire the `/connect/inbox` route and module
**Size:** M · **depends on:** T03 live, T05 checkpoint · **ADR:** D6, D11, I-M8, I-M14

Delete `src/app/connect/inbox/page.tsx` and, from `src/modules/connect/`: `index.ts`, `types.ts`,
`lib/inbox-display.ts`, `lib/lenses.ts`, `lib/lenses.test.ts`, and
`components/{InboxView,LensTabs,InboxList,InboxRow,InboxDetail,AssignMenu}.tsx`.

**Keep** `lib/requestActionError.ts` (three external readers) and `acceptItem`/`declineItem`.

⚠️ **The delete list does not compile as-is, and resolving that is this ticket's real work.**
`inbox.ts:15` imports `COMPANY_INBOX_TYPES` from a deleted file; `:16-23` imports six types from
another. `acceptItem` returns `getInbox()` at `:346`, `declineItem` at `:357`. Per D11:
`acceptItem`/`declineItem` become `Promise<void>` — their only caller already discards the return
value (`RequestsSection.tsx:105`) — and `getInbox`/`getViewerContext`/`getAssignableMembers` are
deleted with the rest.

Also: `acceptInbox`'s `deal_card` branch in `src/modules/messaging/supabase/store.ts` — the
range is **`:574-586`** (the `if` opens at `:574`, closes at `:586`). Deleting `:577-585` leaves
an unbalanced brace.

Add the `next.config.ts` permanent redirect `/connect/inbox → /discover`.
Regenerate `src/types/database.types.ts`.

**EARS**
- When a user navigates to `/connect/inbox`, the system shall redirect to `/discover`.
- When the app builds, `tsc` shall report zero errors.
- When the unit suite runs, its total shall fall by **exactly** the number of tests
  `lenses.test.ts` owned — any other number means something live was cut (L-061).

**Parallel-safety vs T08:** disjoint file sets, no shared imports. Safe to run concurrently.

---

### T08 · Remove the nav entry and both Discover CTAs
**Size:** XS · **depends on:** T03 live · **ADR:** FR8, I-M14

Remove the "Connection Request" nav entry (`surfaces.ts:54-55`) and the two "wants to connect →
open inbox" links (`ConnectActions.tsx:44`, `CompaniesSection.tsx:100`).

**EARS**
- When the sidebar renders, no entry shall read "Connection Request".
- When a Discover company row or page renders, no link shall point at `/connect/inbox`.

**Files:** three, all disjoint from T07's set.

---

### T09 · Update the e2e specs
**Size:** S · **depends on:** T06, T07 · **ADR:** FR9

Update `e2e/inbox-accept.spec.ts`, `e2e/deal-lands-in-c2c-chat.spec.ts`,
`e2e/deal-c2c-create.spec.ts`.

⚠️ **`deal-c2c-create.spec.ts:141-191` is not "the claim flow"** — an earlier ADR draft said so
and it was wrong. `:150` is titled *"a c2c-chat-created deal lands in the recipient's c2c chat
directly — no ticket, no claim"*, and `:158-170` asserts the **Deal-tickets lens shows its empty
state**. When T07 deletes the lens, that assertion has no surface left to make. This is not a
mechanical update: re-express it as a DB assertion (no `pending_inbox_item` row exists) or delete
the block.

**Not in scope:** `e2e/fixtures/two-company.ts`. Rev 1 of the ADR listed it; verification found no
`claim_deal_ticket` reference — its `deliver_deal` mentions are comments saying the call was
removed, and `:940` states the fixture creates zero `pending_inbox_item` rows. Left alone
deliberately; do not "fix" it.

**EARS**
- When the e2e suite runs after W4, every spec shall pass without navigating to `/connect/inbox`.

---

## Ready checkpoint — recorded, not assumed

| Ticket | INVEST | Size | EARS | Parallel-safe with |
|---|---|---|---|---|
| T01 | ✅ | S | 3 criteria | T02 (disjoint) |
| T02 | ✅ | M | 5 criteria | T01 (disjoint) |
| T03 | ✅ | S | 3 criteria | — (T04 depends on it) |
| T04 | ✅ | M | 3 criteria | — |
| T05 | ✅ | S | 2 criteria | — (sequential by design) |
| T06 | ✅ | S | 2 criteria | T07/T08 (different layers) |
| T07 | ✅ | M | 3 criteria | T08 (verified disjoint) |
| T08 | ✅ | XS | 2 criteria | T07 (verified disjoint) |
| T09 | ✅ | S | 1 criterion | — |

Nothing is sized larger than M. No ticket splits a file with a concurrent sibling.

## Linear — created 2026-09-03, team `Development`

| Ticket | Issue | Blocked by (enforced in Linear) |
|---|---|---|
| T01 | DEV-169 | — |
| T02 | DEV-170 | — |
| T03 | DEV-171 | — |
| T04 | DEV-172 | DEV-171 |
| T05 | DEV-173 | DEV-169 |
| T06 | DEV-174 | DEV-169, DEV-173 |
| T07 | DEV-175 | DEV-171, DEV-173 |
| T08 | DEV-176 | DEV-171 |
| T09 | DEV-177 | DEV-174, DEV-175 |

The blocking graph encodes ADR §6's wave order, which is the one thing in this design that must
not be improvised. **It does not encode the two things Linear cannot hold:** D2's migration must
precede D2's app deploy (inside DEV-170), and T05's two checkpoint queries must be *run for real*
against the target environment before anything in W4 starts. Both are human steps.
