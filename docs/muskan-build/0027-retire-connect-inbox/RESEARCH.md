# 0027 retire-connect-inbox — research

## What exists (spec)

Prior-art sweep by `researcher`, 2026-08-31. Citations are file:line. Organized by the
question asked, not chronologically.

### 1. `RequestsSection` — current accept/decline surface

- `src/app/discover/sections/RequestsSection.tsx:1-185` — client component rendering ONE
  list with two independently-typed sub-groups: company requests (`acceptItem`/
  `declineItem` from `@/modules/connect/supabase/inbox`, :17,101-113) and person requests
  (`acceptPersonRequest`/`declinePersonRequest` from `../personActions`, :19,115-127).
  Header comment (:3-13) documents "two kinds, one visual list," cites `DISC-12`.
- Props: `companyRequests: DiscoverCompanyRequest[]`, `personRequests:
  DiscoverPersonRequest[]` (:82-88) — server-fetched, passed down, not fetched by this
  component itself.
- The "out of scope" note the decision references lives in the DATA source, not this
  component: `src/app/discover/companyRequests.ts:9-10` — "No deal_card join (that's the
  deal-ticket path, out of scope here)."
- Composed at `src/app/discover/DiscoverShell.tsx:56` beside `MyNetworkSection`, fed by
  `src/app/discover/page.tsx:4-5,18-19` calling `getIncomingConnectionRequests()` and
  `getIncomingPersonRequests()` only — no pricelist_request or deal_card reader anywhere
  on that page today.
- No separate "pricing requests" reader exists in Discover. `src/app/discover/
  pricingRequest.ts:1-47` is **send-side only** (builds the outgoing pricing-ask note/
  metadata) — no read/accept path.

### 2. `companyRequests.ts` — the filter to widen

- `src/app/discover/companyRequests.ts:62-71` — actual filter: `.eq("receiver_company_id",
  companyId).eq("status","pending").in("type", ["connect", "connect_message"]).is
  ("deleted_at", null)`. **Confirmed: exactly 2 types today**, not 3 — `pricelist_request`
  is excluded here too, despite the file's own comment (:9-10) only naming `deal_card` as
  excluded. Minor discrepancy: comment names one exclusion, code enforces two. Matches the
  decision's claim that both `pricelist_request` and `deal_card` are "currently excluded on
  purpose" — just clarifies the exclusion is enforced in the query, not only the comment.
- Backing RLS: `inbox_select`, live definition `supabase/migrations/
  20260724100200_inbox_person_rls.sql:20-26` — `USING (receiver_company_id =
  current_company_id() OR sender_company_id = current_company_id() OR receiver_person_id =
  auth.uid())`. Confirms triage's citation.

### 3. `inbox.ts` — the `acceptItem` / `claim_deal_ticket` branch

- `src/modules/connect/supabase/inbox.ts:265-347` is `acceptItem`. The comment triage cited
  (`:287-290`) is a comment, not the branch itself — the actual `if (type === "deal_card")`
  branch is one level deeper, inside `acceptInbox` in `src/modules/messaging/supabase/
  store.ts:574-586`.
- `acceptInbox` needs `AcceptInput` (`store.ts:550`); for `deal_card` it needs
  `input.dealCardId` specifically (`store.ts:575-576`, throws if missing) — **confirms the
  decision's claim: `type` alone is not enough, the caller must also carry a `dealCardId`.**
- `deal_card` arm → `supabase.rpc("claim_deal_ticket", { p_deal_card_id })` (`store.ts:
  580-585`). RPC body `supabase/migrations/20260720110000_claim_deal_ticket.sql:23-73` —
  gates on a live `pending_inbox_item` row (`type='deal_card'`, receiver = caller's
  company, `status='pending'`), inserts caller as `deal_member` owner on the **existing**
  `deal_workspace`. No relationship, no thread created — both already exist since birth.
- The other three arms (`connect`, `connect_message`, `pricelist_request`) →
  `supabase.rpc("accept_connection_request", { p_inbox_item_id })` (`store.ts:610-613`).
  Live body `supabase/migrations/20260826100000_accept_connection_request_atomic_
  threads.sql:120` gates `IF v_item.type NOT IN ('connect','connect_message',
  'pricelist_request')`. Mints/adopts the `relationship` and resolves-or-creates the
  c2c/p2p thread(s) + seed lines, atomically.
- `inbox.ts`'s `acceptItem` (:315-322) has a **second, separate** `deal_card` branch after
  `acceptInbox` returns — skips the Sella-intro call, returns early, only flips
  `pending_inbox_item.status` to `accepted`. The type-branch is genuinely two-level: once
  inside `store.ts`'s `acceptInbox`, again inside `inbox.ts`'s `acceptItem` for
  post-processing.

### 4. `pending_inbox_item` schema

- Original table: `supabase/migrations/20260607090002_phase1_core.sql:191-209`. Columns:
  `id, type (FK inbox_request_type.code), sender_person_id, sender_company_id,
  receiver_company_id, note, deal_card_id, status (FK inbox_status.code), assigned_to,
  assigned_at, assigned_by, metadata jsonb, created_at, updated_at, deleted_at`. Check
  constraint `inbox_deal_card_only_for_deal_card_type` (:207-208).
- `receiver_person_id` added later: `supabase/migrations/20260724100100_inbox_person_
  target.sql:25-42` — nullable, mutually exclusive with `receiver_company_id` via 4 named
  CHECK constraints (:34-42), for `connect_person` only.
- `inbox_request_type` seed: `supabase/migrations/20260607090001_lookups_and_seeds.sql:
  35-39` — `connect`, `connect_message`, `pricelist_request`, `deal_card` (the decision's
  "four types"). `connect_person` added separately (`20260724100100_inbox_person_
  target.sql:22`). **The table actually carries 5 request types**; the decision's "four"
  deliberately excludes `connect_person`, handled entirely outside this scope (Discover
  person path, `personActions`).
- Live `inbox_select` RLS: `20260724100200_inbox_person_rls.sql:20-26` (supersedes
  `20260607170000_rls_policies.sql:243`).

### 5. The four request types — creation/routing today

- `connect` / `connect_message`: created via `src/app/discover/actions.ts` — land in
  `pending_inbox_item`, routed to `/connect/inbox` AND already surfaced in
  `RequestsSection` (company path, `companyRequests.ts:69`).
- `pricelist_request`: built by `src/app/discover/pricingRequest.ts` (send side only) —
  inserted into `pending_inbox_item`, currently **only** surfaced in `/connect/inbox` (via
  `getInbox()`'s `COMPANY_INBOX_TYPES` filter, see §7) — **not yet in `RequestsSection`.**
- `deal_card`: sole writer is `deliver_deal()` — see §6. Not reachable via the ordinary
  send-a-deal flow at all today.

### 6. `deliver_deal` / Sella's door — ⚠️ the decision's retirement gate is NOT yet met

- **Confirmed: `confirm_detected_deal` is the sole live caller of `deliver_deal` today.**
  Original site `supabase/migrations/20260724120400_confirm_detected_deal_births_
  negotiation.sql:176` (`perform public.deliver_deal(v_card);`, inside the "person unknown
  → company-target detected deal still gets its claimable inbox ticket" branch, :173-177).
  `CREATE OR REPLACE`d twice since (`20260825190000_confirm_detected_deal_liveness_
  guard.sql:193`, then `20260827130000_confirm_detected_deal_relationship_write_gate_
  refactor.sql:185`) — same call, later line as the header comment grew. **Citation drift**:
  the decision's `:176` pointer is to a migration that is no longer the live definition;
  the live body is the 2026-08-27 refactor, same call at `:185`.
- `deliver_deal()`: `supabase/migrations/20260720095000_deliver_deal.sql:30-59`. No-ops if
  the card has a person co-owner; otherwise inserts one `pending_inbox_item` row of type
  `deal_card`.
- **`send_deal`'s BOTH arms (person and company) do NOT write to `pending_inbox_item`** —
  refines the decision's phrasing, which only asked to "verify person-arm status." Per
  `supabase/migrations/20260825090000_send_deal_c2c_announce.sql:5-20`: the person arm
  never wrote to `pending_inbox_item` (always posted directly to chat); only the company
  arm ever did, via `deliver_deal`, and this same migration **deleted** that call
  (:15 — "DELETED, not guarded"). Current live `send_deal` body (`supabase/migrations/
  20260827120000_send_deal_relationship_write_gate_refactor.sql:31-221`) contains no
  `deliver_deal` call anywhere.
- Corroborated by `supabase/migrations/20260827140000_deliver_deal_relationship_write_
  gate.sql:9-16`: "send_deal stopped calling deliver_deal entirely ... the ONLY live
  caller is `confirm_detected_deal`."
- **Net finding: the precondition in the locked decision — "Sella's `deliver_deal`
  confirmed off `/connect/inbox` writes" — is NOT met as of this sweep.** `deliver_deal`
  is still live, still the sole and unconditional writer of `deal_card` tickets, still
  reachable through Sella's detection path. Ticket (b)'s gate is currently a live blocker,
  not a formality already cleared.

### 7. `/connect/inbox` module — file-by-file

- `src/app/connect/inbox/page.tsx:1-6` — thin route, mounts `InboxView` from the barrel.
- `src/modules/connect/index.ts:1-9` — module's ONLY public export is `InboxView` (+
  types). No other route imports `InboxView` (grep-confirmed) — deleting the module's UI
  has exactly one app-level blast site.
- `InboxView.tsx:1-178` — stateful orchestrator: viewer/team/queue load, active
  lens + selection, wires claim/assign/accept/decline (imports directly from
  `@/modules/connect/supabase/inbox`, not the barrel — :13-21).
- `LensTabs.tsx:1-47` — presentational tab bar over `LENSES` from `lib/lenses.ts`.
- `InboxList.tsx:1-48` — presentational scroll list, `InboxRow` per item + empty state.
- `InboxRow.tsx:1-121` — one row: avatar, company name, time-ago, type badge
  (`inbox-display.ts`), preview text, assignee chip.
- `InboxDetail.tsx:1-233` — detail panel; computes `DetailMode` (`accepted|rejected|
  unassigned|mine|others-admin|others-locked`, :40-54) driving which action buttons show.
- `AssignMenu.tsx:1-85` — reassign dropdown, used by `InboxDetail` for `mine`/
  `others-admin`.
- `lib/lenses.ts:1-77` — `matchesLens`/`filterByLens`/`lensCounts`, single source of truth
  for the 5 lenses (`unassigned, mine, all, deal_tickets, history`).
- `lib/inbox-display.ts:1-69` — `REQUEST_TYPE_META` (labels/icons/colors per type) and
  `COMPANY_INBOX_TYPES = Object.keys(REQUEST_TYPE_META)` = `["connect","connect_message",
  "pricelist_request","deal_card"]` — the exact 4-type filter `getInbox()` uses
  (`inbox.ts:159`), and the source the decision's "four request types" phrase traces to.
- `supabase/inbox.ts:1-359` — `getInbox`, `getViewerContext`, `getAssignableMembers`,
  `claimItem`, `assignItem`, `acceptItem`, `declineItem` — the module's entire data layer.
- `types.ts:1-117` — `InboxRequestType` union (4 values, comment :20-33 documents
  `connect_person`'s deliberate exclusion), `InboxItemView`, `LensKey`.
- **Shared, NOT module-owned — survives retirement**: `lib/requestActionError.ts:1-92`.
  Own header (:6-9): used by "the two surfaces that call accept (the Connect inbox and the
  Discover requests list)" — confirmed imported by both `InboxView.tsx:12` and
  `RequestsSection.tsx:18`. Cannot be deleted with the rest of the module.
- Other external importers of `@/modules/connect/*` besides the inbox route:
  `RequestsSection.tsx:17-18`, `discover/personActions.ts:6`, `discover/actions.ts:6` —
  all three import only `requestActionError` and/or `acceptItem`/`declineItem`, not any UI
  component.

### 8. `CONTEXT.md`

- Confirmed zero hits for `pending_inbox_item`, `RequestsSection`, `InboxView`,
  `claim_deal_ticket`, "connection request", "accept gate" (case-insensitive).
- "Discover"/"Connect" vocabulary that DOES exist is unrelated to inbox mechanics:
  `docs/architecture/CONTEXT.md:25` (Big-7 surface naming), `:63-73` (C2C/P2P/Deal chat
  definitions), `:167-169` (Buyer Shop View / catalogue openness / connection override —
  Discover-shop concepts, not request/accept-gate concepts).

### 9. `/connect/inbox` as a route — blast radius beyond the module

- **Nav rail**: `src/shared/ui/surfaces.ts:54-55` — `{ key: "inbox", label: "Connection
  Request", href: "/connect/inbox", icon: Inbox, state: "active" }`, child of the Connect
  surface. Comment: "'Connection Request' is the renamed old 'Inbox' — route stays
  /connect/inbox." **Not mentioned in the decision or triage** — needs explicit handling.
- **Discover deep-links directly to `/connect/inbox`** in two places not covered by the
  decision/triage text: `src/app/discover/[companyId]/ConnectActions.tsx:44`
  ("`{companyName} wants to connect — open inbox →`") and `src/app/discover/sections/
  CompaniesSection.tsx:100` ("Wants to connect →") — both render for `state ===
  "incoming"` and link straight to the page being retired, **bypassing `RequestsSection`
  entirely.**
- **e2e tests**: `e2e/inbox-accept.spec.ts` — dedicated spec, navigates to `/connect/inbox`
  at :83,139; header (:1-34) carries the DEV-83 regression history, naming both
  `InboxView.tsx:137` and `RequestsSection.tsx:98` as two call sites that shared one bug
  (swallowed accept-failure) — direct evidence the two surfaces already share
  failure-mode coupling. `e2e/deal-lands-in-c2c-chat.spec.ts:10,283` and
  `e2e/deal-c2c-create.spec.ts:164` also navigate to `/connect/inbox` in assertions.

### Additional prior art (architecture/product locks)

- **ADR 0006** (`docs/architecture/adr/0006-deal-draft-lands-in-chat.md`) is this slug's
  direct architectural ancestor and imposes a standing obligation:
  - §7.2 (:528-536): "the correct reason to keep [`claim_deal_ticket`] is that Sella's door
    still produces `deal_card` tickets ... the claim primitive keeps exactly one producer,
    dormant until Sella ships. This strengthens rather than weakens **the PRD's obligation
    on the page-deletion slug**."
  - J4 invariant (:458-459): "`deliver_deal` and `claim_deal_ticket` are kept alive for a
    door that has no traffic yet. They will read as dead code. §7.2 is the reason they are
    not dropped."
  - Deferred-work list (:722-724) names "deleting the Connection Requests page (now
    carrying the §7.2 obligation)" as future work — **this is 0027**, named in advance.
  - This confirms rather than conflicts with the decision and STATE.md's gating — but §6
    above shows the gate is **not yet satisfied**, so ADR 0006's obligation is a live
    blocker today, not a formality.
- **`docs/product/surfaces/CONNECT.md`** is a stub (:7-10, "Depth: stub," last updated
  2026-05-23) — predates the entire inbox/RequestsSection build (June–August 2026), no
  content on request types, accept flow, or lenses.
- **Locked prototype**: `prototypes/inbox-prototype/NOTES.md:52-61` — "LOCKED: Variant A
  (shared inbox — master/detail + lenses)," 2026-06-06, Ayush. This is the UI contract
  `/connect/inbox` implements today. Per project rule ("the locked screens are the spec"),
  0027 deliberately supersedes this lock — worth naming explicitly rather than silently
  walking away from it.
- **Superseded decision**: `docs/decisions/DECISIONS.md:1931-1936` (2026-08-25 entry) —
  at that point stated explicitly "`connect`, `connect_message` and `pricelist_request`
  ... still route to `/connect/inbox` ... the page is not being retired." The 2026-08-31
  entry (:2124-2149) supersedes this by name.
- **Linear**: `HEL-77` (Backlog) tracks that ADR 0006's rewrite of
  `claim_deal_ticket_test.sql`/`e2e/deal-c2c-create.spec.ts:141-191` left
  `claim_deal_ticket` without live e2e cover — directly relevant blast radius, since
  0027's retirement of `/connect/inbox`'s Claim UI would compound it. `DEV-83` (Done) is
  the closed bug behind the shared failure-mode noted in `inbox-accept.spec.ts`'s header.
  No open Linear issue yet exists for either ticket (a) or (b) — triage is done, nothing
  filed.

## Conflicts / gaps flagged for the interview

1. **Ticket (b)'s gate is not met.** `deliver_deal` is still Sella's only live write path
   for `deal_card` tickets. Is ticket (b) — the actual deletion of `/connect/inbox` — in
   scope for this PRD at all, or does this PRD cover ticket (a) only, with (b) deferred to
   a future slug once Sella's door moves?
2. **Nav rail entry** (`surfaces.ts:54-55`, "Connection Request") is not addressed by the
   decision or triage. If ticket (a) ships without touching it, users get two live paths to
   accept the same four request types (nav → `/connect/inbox`, Discover →
   `RequestsSection`) until (b) ships.
3. **Two Discover deep-links** (`ConnectActions.tsx:44`, `CompaniesSection.tsx:100`) send
   users straight to `/connect/inbox` for incoming `connect` requests, bypassing
   `RequestsSection` — unaddressed by the decision.
4. **Locked prototype supersession** — `inbox-prototype/NOTES.md`'s "Variant A" lock is
   being walked away from; should the PRD name this explicitly per the "locked screens are
   the spec" rule, rather than let it happen silently.

---

## Approaches (design)

Sweep for `/design`, 2026-09-03, by `researcher`. Not prior art (see above) — this answers
how each open question is normally solved and what each option costs in six months.
**Spot-verified by the orchestrator** where marked ✅ (per PIPELINE: agent findings are
claims, not facts).

### Q1 — Where does the "already connected?" branch for `requestProductPricing` belong?

**The two existing predicates, checked against this question directly:**
- ✅ `is_connected_to_company(uuid)` — `supabase/migrations/20260822100000_connection_visibility_override.sql:86-107`.
  `SECURITY INVOKER`, `STABLE`, answers exactly "is there an active `relationship` row between
  me and this company" — the ADR-0005 predicate. Granted to `authenticated`, revoked from
  `anon` (`:105-107`). **This is the right predicate for "already connected?"**
- `assert_relationship_writable(uuid)` — ADR-0008,
  `supabase/migrations/20260827090000_assert_relationship_writable.sql`. Answers a *different*
  question: "is this write allowed on this specific relationship" — and its NULL-passthrough
  deliberately treats "no relationship exists" as writable (its own header; ADR-0008
  Invariant 8). **It cannot substitute for the connected-check** — a not-yet-connected pair
  passes it too, by design.

**Is this ADR-0005's eighth gate?** No. ADR-0005 §3's inventory (`0005:327-351`) is a closed
list of seven *read-visibility* enforcement points. `requestProductPricing`'s branch is a
*write-routing* decision (ticket vs. chat post), not a visibility gate — structurally
different, so it does not extend that table. But it should **reuse** `is_connected_to_company`
rather than inline the query again — ADR-0005's own thesis ("editing copies by hand is how
this project lost Discover's security gate once already," `0005:180-182`) applies even though
the enforcement context differs.

**Does ADR-0008 already answer it?** No — see above. Once the connected arm actually writes to
`chat_message`, that write does need `assert_relationship_writable` — but that's the
write-gate question, not the branch question.

| Option | Shape | Six-month cost |
|---|---|---|
| **A — TS branches, calls one of two paths** | `requestProductPricing` (`src/app/discover/actions.ts`) calls `is_connected_to_company` via `supabase.rpc`, then either `createPairInboxItem` or a "post to chat" call | Matches FR2's own sentence structure. Splits routing across two round trips (read-then-write) — the same race the PRD already rules acceptable (`PRD:62`). Cheap; risk contained by that existing ruling. |
| **B — single SECURITY DEFINER RPC branches internally** | A new RPC (mirroring `send_deal`, `20260827120000:31-221`) does the check and either inserts the ticket or resolves-or-creates the c2c thread + posts, atomically | Matches this codebase's convention — every other write-routing decision (`send_deal`, `confirm_detected_deal`, `accept_connection_request`) is a server-side branch in one definer transaction, not a TS `if`. Removes the race. Costs one RPC + migration + suite; `_resolve_or_create_c2c_thread` (`20260826090000:28-54`) exists as precedent, but is marked "Internal-only… Do not GRANT" (`:91-93`) so a caller must itself be `SECURITY DEFINER` owned by `postgres`. |
| **C — A, but the connected arm's write is a definer RPC** | TS decides routing (matches FR2's wording); the chat-post itself is a small `SECURITY DEFINER` RPC, never a raw client insert | Combines A and B. A raw client insert would duplicate c2c thread resolve-or-create logic client-side — re-litigating exactly the mistake ADR-0006/0007 already fixed (`0006:149-157`). |

**Recommendation: C.** Reuse the predicate that already answers "connected," and reuse the
pattern that already answers "how do I safely post to a c2c thread" — build neither a second
time.

### Q2 — The `confirm_detected_deal` person-resolve branch

**Current `else` branch** (`20260827130000_confirm_detected_deal_relationship_write_gate_refactor.sql:182-186`)
is `perform public.deliver_deal(v_card);`. Must become an insert mirroring the
`v_cp is not null` branch (same file, `:167-181`).

✅ **The schema does not enforce "one person per company."** `person`
(`20260607090002_phase1_core.sql:22-63`) has `company_id UUID REFERENCES company(id)` with
**no unique constraint and no partial unique index** — verified by catalog grep, zero hits.
The invariant is convention only.

**The plpgsql mechanism matters and is not obvious.** A plain `select … into v_person` does
**not** raise on multiple matches — bare `SELECT INTO` silently takes the first row. Only
`SELECT INTO STRICT` raises `no_data_found` (0 rows) and `too_many_rows` (2+).

| Option | Behavior | Cost when Path B lands |
|---|---|---|
| **(a) raise, via `select into strict`** ← recommended | Raises uniformly on 0 or 2+ rows | One line, clearly flagged — the exact spot Path B's person-selection replaces. The PRD already locks this for the zero case (`PRD:60`); this closes the two-person case the PRD left silent, same mechanism. |
| **(b) pick-one-deterministically** | Silently resolves to "first person," masking a violated invariant | Dangerous *because* nothing enforces the invariant — any future invite/admin flow could add a second `person` row without reading this function, and deals would misattribute co-ownership by insertion order, with no signal, indefinitely. |
| **(c) insert company-wide, no person co-owner** | Skip the `deal_member` insert on ambiguity | **Contradicts FR1** and AC1's wording. Would work for *visibility* (ADR-0006 §4.1: `deal_workspace` is born `company_wide`) but that is a different guarantee than FR1 asks for. |

**Recommendation: (a), `SELECT … INTO STRICT`.**

### Q3 — Backfill + drop sequencing

**Industry pattern:** expand → backfill → contract treats backfill and the destructive
contract step as **separate migrations, typically separate deploys**, so a backfill bug can be
fixed forward without the destructive change already being irreversible.

**This repo's precedent for a pure destructive drop:**
`20260724120800_drop_propose_edit_rpcs.sql` — two `DROP FUNCTION IF EXISTS` in one file,
because both belonged to a retired lifecycle and their callers died "in the same wave/PR —
never deployed apart" (`:1-16`). It bundles two drops; it does **not** show DML and DDL
sharing a file. No such precedent exists here.

**Stated convention:** ADR-0008 — "One migration per unit of change… each RPC re-emit in its
own file" (`0008:313-315`).

**Recommendation: two separate files.** (1) DML-only backfill; (2) DDL-only `DROP FUNCTION`
following the `20260724120800` shape. Mixing them makes an isolated revert of just the drop
impossible; and a backfill `UPDATE` behaves differently on `db reset` replay than an
idempotent `DROP … IF EXISTS` does (L-034) — worth isolating.

**Same deploy?** Not for correctness — FR5's backfill resolves rows directly and never calls
either doomed function, so it has no runtime dependency on them. `PRD:53`'s ordering
constraint is about not orphaning rows, not transactional coupling. Ship as separate pushes
with a checkpoint between:
`select count(*) from pending_inbox_item where type='deal_card' and status='pending'` must
return 0 before the drop.

✅ **Cloud drift — RESOLVED by the orchestrator.** The researcher flagged that
`docs/deploy/cloud-migrations-pending.md` still lists the HEL-84 batch
(`20260827090000`–`150000`) as `⚠️ PENDING` while `CLAUDE.md` says it shipped. Queried the
live project (`byipusuthdlskdxoexkt`) via `list_migrations`: **the cloud tip is
`20260827150000_announce_deal_event`** — the whole batch IS deployed. **The ledger is stale;
`CLAUDE.md` is right.** Consequence for 0027: any migration timestamped today (2026-09-03)
sorts cleanly after the tip. No `--include-all`. Separately: the stale ledger is record debt
worth a follow-up.

### Q4 — Dependency census before the DROP

`pg_depend` only records dependencies Postgres binds at DDL time; it does **not** parse a
plpgsql body to find a call by name — that call is opaque text in `prosrc` until executed.
The correct technique is a text search over `pg_proc.prosrc`:

```sql
select n.nspname, p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosrc ~ 'deliver_deal|claim_deal_ticket'
  and p.proname not in ('deliver_deal', 'claim_deal_ticket');
```

This misses RLS policies (`pg_policy.polqual`/`polwithcheck`) and dynamic SQL — both checked
separately below.

| Location | `deliver_deal` | `claim_deal_ticket` |
|---|---|---|
| Other SQL function bodies | **One caller**: `confirm_detected_deal`, `20260827130000:185` — the call FR1 removes | **Zero.** Its only caller is client-side TS |
| `pg_policy` (RLS) | `returns void` — structurally cannot appear in a predicate | `returns uuid` — same exclusion |
| `supabase/functions/` (Edge) | Zero hits | Zero hits |
| `src/` (TypeScript) | **Zero calls.** Only `database.types.ts:4735` (a type entry). EXECUTE already revoked from `authenticated`/`anon` by `20260724121000` — structurally uncallable from the client | ✅ **One live caller**: `src/modules/messaging/supabase/store.ts:580-583`, in `acceptInbox`'s `deal_card` branch, reached from `inbox.ts`'s `acceptItem`. Comment-only refs at `inbox.ts:289`, `types.ts:329` |
| `e2e/` | Zero direct calls — transitive only | Transitive via `deal-c2c-create.spec.ts:141-191`, `fixtures/two-company.ts`, `deal-p2p-send.spec.ts`. All on FR9's list **except `two-company.ts`** |
| `supabase/tests/` | `deliver_deal_test.sql` + `run_deliver_deal_test.sh` | `claim_deal_ticket_test.sql` + `run_claim_deal_ticket_test.sh` |

✅ **A gap the PRD's file list does not name.** Those four `supabase/tests/` files exist solely
to test the two functions FR6 deletes — verified present. ADR-0006 rewrote them once already
(flipping them to the chat-announce behavior while keeping the functions alive for Sella,
`0006 §6`). 0027 deletes the functions outright, so the four have nothing left to test and
must be **deleted**, not rewritten. **Add them to FR6's scope.** Same for `e2e/fixtures/two-company.ts`,
missing from FR9.

### Q5 — Deleting `/connect/inbox`: 404 or redirect

Because the PRD already deletes the route folder (`PRD:18-19`), a hard 404 is **structurally
free** — the absence of a `page.tsx` is itself the 404. A redirect costs one declarative entry
in `next.config.ts` and does not resurrect any page component, so "the module retires" stays
true.

After FR8 removes the nav entry and both CTAs, **no in-app path to `/connect/inbox` remains** —
only stale bookmarks and back-navigation can reach it. AC5 ("no longer serves the old page") is
satisfied identically by either.

**Recommendation: a `next.config.ts` permanent redirect `/connect/inbox → /discover`.** Same
build cost, strictly kinder to the only remaining audience. "Redirect + toast" is
disproportionate for stale-bookmark visitors.

### Q6 — Where does `REQUEST_TYPE_META` live after the module dies

**Current home:** `src/modules/connect/lib/inbox-display.ts:38-43`, alongside
`REQUEST_TYPE_BLURB` (`:63-68`), `COMPANY_INBOX_TYPES` (`:58-60`, derived from the same map),
and `formatTimeAgo` (`:16-26`).

✅ **Every current reader** is inside the retiring module: `inbox.ts`, `inbox-display.ts`
itself, `types.ts`, `InboxRow.tsx`, `InboxDetail.tsx`. `RequestsSection.tsx` — the file that
needs it for Variant C's badge — does **not** import it today.

**Narrowing that falls out of FR3:** after FR1, `deal_card` never reaches
`pending_inbox_item` again, so that entry becomes permanently dead weight if carried forward.

| Option | Cost |
|---|---|
| **A — new `src/app/discover/requestTypeMeta.ts`**, narrowed to 3 types ← recommended | Scoped to the one remaining consumer. Matches ADR-0005's colocation principle. |
| **B — leave it in `connect/lib/inbox-display.ts`** (not on the PRD's deletion list, survives by omission) | Legal, but leaves Discover importing from a module whose route, page and orchestrator are gone — a stray file, and a plausible casualty next time someone deletes `src/modules/connect/` wholesale. |
| **C — fold into `companyRequests.ts`** | Same scoping benefit; less discoverable once it carries icon/accent/blurb alongside a fetching file. |

### Invariants this work depends on that nothing currently enforces

1. ✅ **"One active person per company."** No unique constraint or partial unique index on
   `person.company_id`. FR1/AC1 and `PRD:60` both assume it; nothing makes it true. Q2's
   `INTO STRICT` is a *mitigation* (fail loudly), not enforcement.
2. **"No `deal_card` row reaches `pending_inbox_item` after FR1."** FR3 depends on this to
   justify permanently excluding `deal_card` from the filter. True only because
   `deliver_deal`'s sole caller stops calling it — but `deliver_deal` is not dropped until
   FR6, and nothing but Q4's census stops a future migration adding a second caller. A
   `deal_card` row created between FR1 and FR6 would be **invisible** (FR3 excludes it) *and*
   **unclaimable** (FR7 deletes the claim UI) — an orphan with no product-facing repair path.
   Worth a comment at the drop site.
3. **The connection-status branch has no test today.**
   `src/app/discover/requestProductPricing.gate.test.ts` is green but covers only the *price*
   gate (public vs. hidden), not connection status. After Q1 ships, its green state will not
   indicate the new branch is covered — a reader could mistake one for the other.

### Sources

- [PostgreSQL function dependencies — Redrock Postgres](https://www.rockdata.net/blog/func-depends/)
- [Schema changes and the power of expand-contract with pgroll — Xata](https://xata.io/blog/pgroll-expand-contract)
- [Database Migrations Without Drama: Expand/Contract in Practice](https://blogs.reliablepenguin.com/2025/11/16/database-migrations-without-drama-expand-contract-in-practice)
- [Backward-Compatible Database Migrations: The Expand-Contract Pattern](https://tech-champion.com/database/backward-compatible-database-migrations-the-expand-contract-pattern-for-zero-downtime-releases/)
- [[App Route] How can I redirect to 404 or not-found — Next.js Discussion](https://github.com/vercel/next.js/discussions/52233)
