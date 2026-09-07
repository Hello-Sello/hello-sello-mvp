# ADR 0009 — Stop ticketing what was never waiting for consent

**Status:** Proposed (G3, 2026-09-03) · **Slug:** `0027-retire-connect-inbox`
**Spec:** `docs/PRD/0027-retire-connect-inbox.md` · **Research:** `docs/muskan-build/0027-retire-connect-inbox/RESEARCH.md`
**Revision:** rev 2 — rewritten after `adr-checker` round 1. Rev 1's central factual claim was
wrong; see §9.
**Supersedes in part:** ADR 0006 §7.2/J4 · **Completes:** ADR 0005's deferred pricing fix ·
**Amends the spec:** FR1, AC1, AC4 (see §9) · **Walks away from:**
`prototypes/inbox-prototype/NOTES.md` Variant A (locked 2026-06-06)

---

## 1. In plain English — read this part first

### What the product does today, and why it is wrong

When someone sends you something in Hello Sello, it lands in one of two places. A request to
connect shows on **Discover**, in a box with Accept and Decline. Everything else lands on a
separate page, **Connection Request** (`/connect/inbox`) — a full inbox with tabs, a claim
button, and an assign-to-a-colleague menu.

That page was built for a company with a team: several people share one inbox, so somebody has to
*claim* a request before working it. **We do not have that product.** One person per company per
side is the MVP, so the claim and assign machinery is ceremony with nobody to perform it for.

But the deeper problem is not the page. It is *what we put on it*. Two of the four things that
land there were never waiting for anyone's permission:

- **A pricing ask to a company you are already connected to.** You are already in a chat with
  them, and we still make them accept a ticket before they can answer. **This one is real and
  happens today.**
- **A deal Sella detects in a chat.** The code contains a branch that cuts a deal ticket when it
  cannot tell which person the deal belongs to. ⚠️ **That branch is dead** — see below. It is
  worth deleting, but deleting it fixes no live behaviour.

So the question is not "where should the old page's contents go." It is **"which of these is
actually a request at all?"** Only one: a pricing ask to a company you have never spoken to. That
is a genuine knock on the door. Everything else should just appear in the chat you already share.

### One honest correction about the deals half

Rev 1 and rev 2 of this ADR both described deal tickets as something users hit today. **Two
independent checker rounds found that they cannot be.** `confirm_detected_deal` derives the
counterparty from the thread's two people, and `chat_thread_p2p_has_both_people`
(`20260607090003_phase2_deal.sql:132`) forces both non-null on a `p2p` thread. Detection only
ever reaches a p2p thread: `sella_enqueue_detection` enqueues only for `type = 'p2p'`, and
`msg_all`'s WITH CHECK blocks `authenticated` from minting a `deal_detected` message anywhere.
So the counterparty is never unknown, the ticket branch never runs, and no deal ticket has ever
been cut through a sanctioned route.

**This does not change the decision, but it changes the honest justification.** Option B still
wins — on the pricing half, which is real, and on deleting a whole page and its claim/assign
machinery, which is real. The deals half is a **dead-code deletion**, and this ADR now says so
rather than claiming a user-facing fix it cannot deliver. It matters practically: a test written
against the story ("Sella cuts a ticket, we stop it") would pass identically with and without the
change, and a G5 walker cannot reproduce the before-state at all.

### The correction that shaped this revision

Rev 1 of this ADR claimed a leftover ticket meant "a deal nobody can reach," and built an
elaborate mechanism to rescue those deals — resolve the receiving company's one person, add them
as a co-owner, and back-fill every historical ticket the same way.

**That was false, and the false part was the expensive part.** A deal workspace is born
`company_wide` (`20260607090003_phase2_deal.sql:286`), and `can_access_workspace`
(`20260607170000_rls_policies.sql:117-125`) grants access to *any* member of either company on a
company-wide workspace — **no co-owner row needed**. The deal has always been fully visible and
signable to the receiving company. Only the *ticket* was stuck. ADR 0006 §4.1 had already
recorded this; rev 1 re-derived the opposite from scratch.

Worse, the rescue mechanism could not have run. It depended on resolving exactly one person per
company, and **GreenLeaf Cultivation has two** in our own seed data
(`supabase/seed/seed.sql:114` — *"Carla — a SECOND member of GreenLeaf"*). `person.company_id`
has no unique constraint; nothing ever made that invariant true.

So rev 2 deletes the mechanism instead of fixing it. `confirm_detected_deal` simply stops cutting
the ticket — one line removed, nothing added. The backfill marks old tickets resolved and
resolves no people at all. **This is the whole point of the change:** the deals were never
unreachable, so nothing needs rescuing.

### The three options

**Option A — Move the page's contents into Discover.** Add the two orphaned types to Discover's
list; the old page dies, nothing else changes.
*Cost later:* we carry the actual bug forward, dressed better. Users keep accepting deals that
are already theirs. Every future feature inheriting a phantom "pending" state that means nothing.

**Option B — Fix it at the source, keep the gate only for genuine strangers.** Sella's deal path
stops cutting tickets entirely. A pricing ask checks whether you are already connected: if yes it
posts into your existing company chat; if no it stays a ticket. Discover's list widens by exactly
one type. The page and its claim/assign machinery are deleted.
*Cost later:* one line removed from one function, one branch added to another, and a one-time
cleanup of stale tickets. Small, and the irreversible part (the backfill) now only flips a status
column rather than inventing memberships.

**Option C — Keep the page, hide the claim/assign buttons.** Least work today.
*Cost later:* the worst of both. Two inboxes stay in the product, dead machinery stays in the
codebase looking alive, and "accept a deal that is already yours" survives untouched.

### What breaks if we pick wrong

The dangerous mistake is not A or C — those are just slow. It is picking B and getting the
**ordering** wrong. Until Discover's list carries `pricelist_request`, the retiring page is the
only surface where an unconnected pricing ticket is visible at all. Delete the page first and
those asks go dark with no screen showing them. That is why §6 sequences the widening *before*
the deletion and puts a counting query between the backfill and the drop, rather than trusting
one confident deploy.

The second risk is the new write door. D2 introduces the only new RPC in this slug, and Postgres
grants `EXECUTE TO PUBLIC` on every new function by default — so an RPC that posts into a company
chat thread is an unauthenticated write door unless its grants are revoked explicitly. That is
not hypothetical here: `assert_relationship_writable` deliberately short-circuits its
caller-is-party check when `auth.uid()` is NULL, so the gate this design leans on does **not**
stop an anonymous caller. §2 D2 therefore carries a grant contract, and §5 asserts it.

### How the industry does this

Two established patterns, both pointing the same way. For the data change this is textbook
**expand → backfill → contract**: add the new behavior, migrate the rows living under the old
one, then remove the machinery — with the backfill and the destructive step as *separate*
migrations, so a backfill bug can be fixed forward while the drop is still ahead of you.

For "is this dead code?", the rule is **inbound imports, not test coverage**. This project
learned it the hard way — L-061 records two modules that survived several reviews because 23
green tests pointed at them and nothing else did. A test file is not a user.

### Recommendation

**Option B.** It is the only one that deletes a wrong idea rather than relocating it: after this
change, a ticket means exactly one thing — someone is waiting for consent from a company they
have not spoken to.

---

## 2. The decisions

| # | Decision | Source |
|---|---|---|
| **D1** | `confirm_detected_deal` **stops cutting the ticket** — delete `:182-185` (`perform public.deliver_deal(v_card);` and its comment), **keeping `:186`'s `end if;`**. Nothing replaces it. No person resolve, no `deal_member` insert, no `INTO STRICT`. ⚠️ **This is a dead-code deletion, not a live-bug fix** — the branch is unreachable through every sanctioned route (§1). | Q2 + checker N2/N3/B1 · **amends FR1/AC1** |
| **D2** | `requestProductPricing` branches in TypeScript on `is_connected_to_company(receiver)`. Unconnected → today's ticket, unchanged. Connected → a **new `SECURITY DEFINER` RPC** resolves-or-creates the c2c thread and inserts a **person-voiced `message`** attributed to the asking person, body = the existing `buildPricingRequestNote(...)` sentence. **Grant contract is mandatory** (below). | Q1 + Muskan at G3 |
| **D3** | `companyRequests.ts`'s type filter widens to `["connect","connect_message","pricelist_request"]`. `deal_card` is **deliberately never added**. | FR3 |
| **D4** | The request row gains a type badge — **prototype Variant C**, stacked above Accept/Decline. `REQUEST_TYPE_META`/`REQUEST_TYPE_BLURB` move to a new `src/app/discover/requestTypeMeta.ts`, keyed on a **presentation** union (D10), not on `InboxRequestType`. | Q6 + prototype + D10 |
| **D5** | The backfill and the drop are **two separate migrations**, and may ship as separate pushes. The backfill sets `status = 'accepted'` **only** where `type = 'deal_card' and status = 'pending' and deleted_at is null` — it inserts no memberships. ⚠️ `'resolved'` is **not** a valid code; `inbox_status` seeds exactly `pending | accepted | rejected` (`20260607090001:337-340`). Both checkpoints in I-M5 must pass between the two migrations. | Q3 + checker N6/N7 |
| **D6** | `/connect/inbox` gets a **permanent redirect to `/discover`** in `next.config.ts`. The route folder is still deleted. | Q5 |
| **D7** | `supabase/tests/{deliver_deal,claim_deal_ticket}_test.sql` + their two runners are **deleted**. The **C9 block at `send_deal_c2c_announce_test.sql:391-412` must also be deleted** — it asserts `deliver_deal`'s body via `::regprocedure` and will hard-error after the DROP. | Q4 + checker B3 |
| **D8** | A `pricelist_request` row stays **product-blind at the query layer**: `companyRequests.ts` gains `type` but **not** `metadata`, and no product join. It needs none — the product name is already in `note`. | OQ1 (corrected) |
| **D9** | Discover's Requests box is retitled from **"Connection requests" to "Requests"** (`RequestsSection.tsx:134`). | OQ2 |
| **D10** | **Every row carries a type badge, person rows included** — a person request is badged "Person". | OQ3 |
| **D11** | `acceptItem`/`declineItem` **change return type to `Promise<void>`**; `getInbox`, `getViewerContext`, `getAssignableMembers` are deleted with the module. Their sole caller already discards the return value (`RequestsSection.tsx:105`). | checker B2 |

### D2's grant contract — not optional, not a build detail

```sql
REVOKE EXECUTE ON FUNCTION public.<new_rpc>(...) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.<new_rpc>(...) TO authenticated;
```

The form `docs/agents/SECURITY-CHECKLIST.md:73` mandates. The `FROM PUBLIC` is the load-bearing
half — a direct `FROM anon` alone leaves `anon` inheriting through PUBLIC, which this repo
documents at `20260724121000_revoke_deliver_deal_execute.sql:23-28`. Asserted by I-M12.

The RPC must also call `assert_relationship_writable` before posting (ADR-0008's gate) — but that
call is **not** a substitute for the grant contract; see §1.

**And its signature is part of the contract.** A `SECURITY DEFINER` RPC bypasses RLS entirely,
including `20260903090000`'s new `sender = 'person' AND sender_person_id = auth.uid()` attribution
gate — which shipped one day before this ADR. So the RPC must take **no author parameter, no
thread id, and no arbitrary body**: `sender_person_id` is set from `auth.uid()` internally, and
the thread is derived from `current_company_id()` + the receiver company. A `p_sender_person_id`
parameter would re-open message forgery a day after it was closed. Asserted by I-M15.

### Rejected, with reasons

- **Resolving a person and adding a co-owner** (rev 1's D1, and FR1 as written). Rejected on
  evidence: co-ownership is not what makes the deal reachable, and the resolution it requires
  raises `TOO_MANY_ROWS` against our own seed data. See §9.
- **A system- or Sella-voiced pricing line.** Rejected by Muskan at G3: the ask reads better as a
  message the person actually sent. Also the cheaper option under the new `msg_all` attribution
  gate (see §3).
- **A raw client-side insert for D2's connected arm.** Rejected even though the new `msg_all`
  would now permit a person-voiced self-attributed insert: the c2c thread is not guaranteed to
  exist for relationships minted before ADR-0007, and `_resolve_or_create_c2c_thread` is not
  grantable. A client insert would have to refuse rather than repair — L-042's exact trap.
- **A single definer RPC owning the whole pricing branch.** Cleaner (it removes the read-then-write
  race) but FR2's approved wording puts the branch in the caller and `PRD:62` already rules that
  race acceptable. Noted as the fix if the race ever bites.
- **A bare 404 on `/connect/inbox`.** A redirect costs the same one line and is kinder.
- **Leaving `REQUEST_TYPE_META` in `connect/lib/`.** Would leave Discover importing from a module
  whose route, page and orchestrator are gone.

---

## 3. Reused — already built, we feed it, we do not touch it

The builder's fence. Changing anything here is out of scope for slug 0027.

| Thing | Where | Why it is already correct |
|---|---|---|
| `accept_connection_request` | `20260826100000_…_atomic_threads.sql` | **Already accepts `pricelist_request`** (`:120`) and already mints a p2p thread + dedicated Sella intro copy for it (`:215`, `:237-239`). D3 opens a door that was built and never fed. **Do not edit this function.** |
| `is_connected_to_company(uuid)` | `20260822100000:86-107` | The ADR-0005 connection predicate. `STABLE`, granted to `authenticated`. D2 calls it; D2 does not reimplement it. |
| `assert_relationship_writable(uuid)` | `20260827090000` | ADR-0008's write gate. D2's RPC calls it. It must **not** be used as the connected-check — its NULL-passthrough treats "no relationship" as writable (`:31-33`), by design. |
| `buildPricingRequestNote` / `PRODUCT_ID_KEY` | `src/app/discover/pricingRequest.ts` | Already produces `Pricing request for "<name>".` and owns the metadata key. D2's connected arm reuses the same sentence; D8 relies on it. |
| `acceptItem` / `declineItem` | `inbox.ts:265`, `:350` | Survive the module deletion — `RequestsSection` is their live caller. **Their return type changes** (D11); their behavior does not. |
| `requestActionError` | `connect/lib/requestActionError.ts` | Three external readers. Untouched. |
| `send_deal` | ticket removal in `20260825090000_send_deal_c2c_announce.sql` | Fixed in August. `PRD:54` scopes it out. |
| `connect` / `connect_message` | throughout | Genuine pre-relationship asks. Untouched. |

### One fence line this ADR knowingly breaches

`_resolve_or_create_c2c_thread`'s own `COMMENT ON FUNCTION` reads *"Callable only from
`accept_connection_request`'s own definer body… Do not GRANT"*
(`20260826090000__resolve_or_create_c2c_p2p_thread.sql:91-93`). **D2 creates a second caller**,
so that comment becomes false on ship. The comment must be updated in the same migration —
otherwise the database carries a documented lie, which is how the next reader gets misled
(L-045). The "Do not GRANT" half still holds and must survive: D2's RPC calls it from inside its
own definer body; the helper itself stays ungranted.

### An external change that lands mid-flight

A parallel session added `20260903090000_msg_all_sender_attribution_gate.sql` (local only,
commit `fc0f7da`): `msg_all`'s WITH CHECK now also requires `sender = 'person'` and
`sender_person_id = auth.uid()`. **Consequence for D2:** a system/Sella voice would now *require*
a definer; a person voice would not. D2 uses a definer regardless, for the thread resolve-or-create
(see Rejected). The gate is therefore compatible with D2 either way — but the build must not read
"person-voiced" as licence to drop the RPC.

---

## 4. Blast radius

Everything below is a caller, dependency or base table this slug did **not** write.

### Database

| Object | Effect |
|---|---|
| `confirm_detected_deal` | **Edited** (D1). Live def `20260827130000…`. Delete `:182-185`; **`:186`'s `end if;` must survive** — `:182-186` is a five-line range, not one line. |
| `deliver_deal` | **Dropped.** One SQL caller (`confirm_detected_deal`, removed by D1); zero TS callers — EXECUTE already revoked from `authenticated`/`anon` by `20260724121000`. |
| `claim_deal_ticket` | **Dropped.** Zero SQL callers; **one live TS caller at `store.ts:580-583`**, inside `acceptInbox`'s `deal_card` branch. Same wave. |
| `_resolve_or_create_c2c_thread` | Gains a second caller (D2). Comment updated; grants unchanged. See §3. |
| *new RPC* (D2) | **Created**, with the §2 grant contract. |
| `pending_inbox_item` | Stops receiving `deal_card` rows. Existing pending ones are marked resolved by the backfill. |
| `chat_message` | Receives D2's person-voiced line. Subject to the new `msg_all` attribution gate. |
| `deal_member` | **No longer touched by this slug** (D1 rev 2). |

### Application

| File | Effect |
|---|---|
| `src/app/discover/actions.ts` | `requestProductPricing` gains the D2 branch. **The per-product dup-guard (`:56-72`, "FAIL CLOSED") lives inside `createPairInboxItem` — the connected arm bypasses it.** See I-M13. |
| `src/app/discover/companyRequests.ts` | Filter widens (D3); `type` added to the `.select()` and to `DiscoverCompanyRequest` — selects **neither today**. `metadata` deliberately not added (D8). |
| `src/app/discover/sections/RequestsSection.tsx` | Badge on every row (D4/D10); title → "Requests" (D9, `:134`). |
| `src/app/discover/requestTypeMeta.ts` | **New** (D4). Keyed on `DiscoverRequestKind`. Owns no filtering (I-M11). |
| `src/app/discover/incomingPersonRequests.ts` | Source of the person rows D10 badges — confirm `DiscoverPersonRequest` carries enough to pick a badge without a new fetch. |
| `src/modules/messaging/supabase/store.ts` | `acceptInbox`'s `deal_card` branch deleted — **`:574-586`** (the `if` opens at `:574` and closes at `:586`; deleting `:577-585` leaves an unbalanced brace). |
| `src/modules/connect/supabase/inbox.ts` | `deal_card` branch at `:315` deleted; claim/assign + `getInbox`/`getViewerContext`/`getAssignableMembers` deleted; `acceptItem`/`declineItem` kept, returning `void` (D11). **Its imports at `:15` and `:16-23` point at files being deleted — resolving them is part of the ticket, not an afterthought.** |
| `src/modules/connect/{index.ts,types.ts,lib/inbox-display.ts,lib/lenses.ts}` + `components/{InboxView,LensTabs,InboxList,InboxRow,InboxDetail,AssignMenu}.tsx` | Deleted. Inbound-import census: after `src/app/connect/inbox/page.tsx` goes, the chain has zero external importers. |
| `src/modules/connect/lib/lenses.test.ts` | Deleted with its subject. L-061: vitest count must fall by **exactly** the tests it owned. |
| `src/types/database.types.ts` | **Must be regenerated** — carries `deliver_deal`/`claim_deal_ticket` signatures at `:4685`, `:4735`, and will gain D2's RPC. |
| `next.config.ts` | Redirect entry (D6). |
| `surfaces.ts:54-55`, `ConnectActions.tsx:44`, `CompaniesSection.tsx:100` | Nav entry + two CTAs removed (FR8). |

### Tests

| File | Effect |
|---|---|
| `supabase/tests/deliver_deal_test.sql` + runner | **Deleted** (D7) — not on the PRD's list. |
| `supabase/tests/claim_deal_ticket_test.sql` + runner | **Deleted** (D7) — not on the PRD's list. |
| `supabase/tests/send_deal_c2c_announce_test.sql:391-412` | ⚠️ **The C9 block must be deleted.** It asserts `deliver_deal` still inserts into `pending_inbox_item`, resolved via `pg_get_functiondef('public.deliver_deal(uuid)'::regprocedure)`. After the DROP that cast raises `undefined_function`, and with `ON_ERROR_STOP=1` the whole suite goes red. It has a live runner. **Rev 1 described this file backwards.** |
| `e2e/inbox-accept.spec.ts`, `deal-lands-in-c2c-chat.spec.ts`, `deal-c2c-create.spec.ts` | Updated (FR9). ⚠️ `deal-c2c-create.spec.ts:141-191` is **not** "the claim flow" as rev 2 stated — `:150` is titled *"…lands in the recipient's c2c chat directly — no ticket, no claim"*, and `:158-170` asserts the Deal-tickets lens shows its **empty state**. When the lens dies, that assertion has no surface left. FR9's "update" is not mechanical here: re-express it as a DB assertion or delete it. |
| `src/app/discover/requestProductPricing.gate.test.ts` | Green today, covers only the *price* gate. Its green state will **not** mean D2's branch is covered. |

**Dropped from rev 1's list:** `e2e/fixtures/two-company.ts`. Rev 1 claimed it reaches
`claim_deal_ticket` transitively; it contains no such reference — its `deliver_deal` mentions are
comments saying the call was *removed*, and `:940` states the fixture creates zero
`pending_inbox_item` rows. The claim was inherited from research and never verified.

### Not touched, deliberately

`connect_person` and the person-request path. `send_deal`. `accept_connection_request`'s body.

---

## 5. Invariants

**[M]** a machine can check it → becomes a test and leaves this document.
**[J]** only judgment can check it → stays here, goes into `critic`'s brief.

### [M]

- **I-M1.** After D1, `confirm_detected_deal` creates **zero** `pending_inbox_item` rows.
  ⚠️ **The fixture must be a `deal_detected` message on a `c2c` thread**, inserted as a role that
  bypasses `msg_all`. On a p2p fixture — the obvious one to reach for — this assertion is green
  *before and after* D1, because the ticket branch never runs there. A p2p fixture proves nothing.
- **I-M2.** After D1, the born workspace is reachable by a member of the receiving company who
  holds **no `deal_member` row** — `can_access_workspace` returns true. ⚠️ **Same fixture
  constraint, plus:** the asserting member must be someone *other* than the resolved counterparty,
  who does hold a `deal_member` row on the live path. Pick the wrong member and this too is green
  either way.
- **I-M3.** `requestProductPricing` to a **connected** company creates zero `pending_inbox_item`
  rows and one `chat_message` in the c2c thread; to an **unconnected** company it creates exactly
  one `pricelist_request` row and no message. *(Must be a new assertion —
  `requestProductPricing.gate.test.ts` does not cover this axis.)*
- **I-M4.** D2's RPC refuses to post onto a suspended or ended relationship. *(SQL suite —
  inherits ADR-0008's gate; assert it, do not assume it.)*
- **I-M5.** Two checkpoints, both required. *(Deploy gate AND tests.)*
  **(a)** `select count(*) from pending_inbox_item where type='deal_card' and status='pending' and deleted_at is null`
  returns **0**. `deleted_at is null` matters — both `deliver_deal:59` and `claim_deal_ticket:51`
  filter on it, so without it the checkpoint and the code disagree about what a live ticket is.
  **(b)** the count of **pending non-`deal_card` rows is unchanged** across the migration.
  ⚠️ (a) alone passes whether the backfill touched only `deal_card` rows or flipped *every*
  pending row — which would silently accept live `connect`/`connect_message`/`pricelist_request`
  tickets that nothing restores, and Discover's widened list would simply look empty. A
  one-directional checkpoint cannot see an over-broad `UPDATE`.
- **I-M6.** No **call site** for `deliver_deal` or `claim_deal_ticket` remains in `src/`, `e2e/`
  or `supabase/` after the drop. *(Narrowed from rev 1's "zero references", which could never
  pass — comments and historical migrations legitimately survive. Assert call sites, and
  regenerate `database.types.ts`.)*
- **I-M7.** The `pg_proc.prosrc` census returns zero **call sites** before the DROP migration is
  written — matched on the call shape, not the string:
  `prosrc ~* '(perform|select)\s+public\.(deliver_deal|claim_deal_ticket)\s*\('`.
  ⚠️ **A plain `prosrc ILIKE '%deliver_deal%'` can never return zero** and would be an
  unsatisfiable deploy gate: `accept_connection_request` and `send_deal` both mention the names in
  **comments inside their bodies**, and `prosrc` includes comments. (Verified: the naive query
  returns four rows today.) *(A `pg_depend` check is still not a substitute — it cannot see a call
  inside a plpgsql body at all.)*
- **I-M8.** Total vitest count falls by **exactly** the number of tests `lenses.test.ts` owns.
  *(L-061's own proof technique.)*
- **I-M9.** A `pricelist_request` row rendered in Discover's list is accepted by
  `accept_connection_request` without error, producing a c2c thread, a p2p thread and the
  pricelist intro message. *(Closes the loop between D3 and the fence.)*
- **I-M10.** Every row the Requests list renders — three company types **and** person rows —
  resolves to a badge label; no badge lookup returns `undefined`. *(This failure took the page
  down once before, `inbox-display.ts:51-56`; `tsc` could not catch it because the union itself
  was the stale thing.)*
- **I-M11.** `requestTypeMeta.ts` owns **no** filtering — nothing derives a type filter from its
  keys. *(Guards against re-creating `COMPANY_INBOX_TYPES`'s coupling in the new home.)*
- **I-M12.** `has_function_privilege('anon', '<D2 rpc>', 'EXECUTE')` is **false**, and the same
  for `PUBLIC`. *(The only assertion covering both grant paths. SECURITY-CHECKLIST S1.)*
- **I-M13.** Sending the same pricing ask twice to the same connected company for the same
  product does not produce two chat messages. *(ADR-0005 §8 made per-product dup-guarding a
  signed G3 decision; the connected arm bypasses `createPairInboxItem` where that guard lives.)*
- **I-M14.** After FR8, no route in the app links to `/connect/inbox`, and the URL redirects to
  `/discover`. *(AC5 had no cover of any kind in rev 1.)*
- **I-M15.** D2's RPC exposes **no** author, thread-id, or free-body parameter — `sender_person_id`
  is set from `auth.uid()` inside the function, and the thread is derived from
  `current_company_id()` + the receiver company. *(Signature assertion. A definer bypasses
  `msg_all` entirely, so this is the only thing carrying `20260903090000`'s attribution guarantee
  through it. Promoted from a judgment note — it is trivially machine-checkable.)*
- **I-M16.** Discover's list renders the literal label **"Pricelist request"** on a
  `pricelist_request` row. *(AC3 names the string; I-M10 only asserts no lookup returns
  `undefined`, which is a weaker claim.)*

### [J]

- **I-J1.** *No dark window.* At no point may a `pricelist_request` be excluded from the retiring
  page while Discover's widened list is not yet live. §6's ordering is the mitigation; a reviewer
  must confirm the deploy followed it, because no test can observe a window that already closed.
- **I-J2.** *A ticket means consent is pending.* After this ADR the only reason a row exists in
  `pending_inbox_item` is that someone awaits permission from a company they have not spoken to.
  Any future change adding a type must justify itself against that sentence.
- **I-J3.** *The fence held.* `accept_connection_request`'s body is unchanged. If a build ticket
  edits it, the design was wrong, not the function.
- **I-J4.** *`deal_card`'s absence from D3's filter is deliberate.* A comment at the filter site
  owes the next reader that sentence.
- **I-J5.** *The drop site carries its own warning.* Nothing but a one-time census stops a future
  migration re-introducing a `deliver_deal` caller. The DROP migration's header must name that
  risk — it is the only place a future author will look.
- **I-J6.** *D2's message reads as the asker's own.* Person voice, attributed to the asking
  person, body = the existing note sentence. If it starts reading like a system announcement, the
  decision drifted.

---

## 6. Ordering — the part that must not be improvised

```
  W1  D1 (confirm_detected_deal stops ticketing)   ← must precede W3
      D2 (pricing split + new RPC)                    independent

  W2  D3 + D4 + D9 + D10 (Discover widens, badges, title)   ← must be LIVE before W4

  W3  Backfill migration (DML only — status flip, no memberships)
      ↓  checkpoint: I-M5 must return 0, run for real
  W4  DROP migration (DDL only) + module/route deletion + D6 redirect
      + D7 test deletions (incl. the C9 block)
```

Three rules:

1. **W1 before W3.** If the backfill runs while `confirm_detected_deal` still cuts tickets, a
   detection between the two creates a fresh `deal_card` row after the sweep has passed.
   ⚠️ **`PRD:61` states the reverse** — *"Backfill runs once, at deploy, before the fixed
   `confirm_detected_deal` is live"* — and following the spec produces exactly the orphan §1
   calls the dangerous mistake. **The diagram is right; `PRD:61` is superseded by this ADR.**
2. **W3 before W4**, with the counting query actually run in between — not assumed.
3. **W2 before W4**, because until Discover's list carries `pricelist_request`, the retiring page
   is the only surface where an unconnected pricing ticket is visible.
4. **D2's migration before D2's app code.** D2 is "independent" of the other waves but is itself
   two halves. Ship the TypeScript first and every connected-pair pricing ask throws on a missing
   RPC.

⚠️ **The first 0027 push carries someone else's security change with it.** A parallel session
added `20260903090000_msg_all_sender_attribution_gate.sql` **local-only**; production's tip is
still `20260827150000`. So whichever 0027 migration pushes first will carry that attribution gate
to production in the same batch. That is desirable — it is a security fix — but it must be a
decision, not a surprise: verify it in the same pre-push check, and do not treat a 0027 rollback
as rolling back only 0027.

Migration timestamps: the live cloud tip is **`20260827150000_announce_deal_event`** (queried
2026-09-03 against project `byipusuthdlskdxoexkt`, and independently re-verified by a parallel
session). The ledger's `⚠️ PENDING` headings were stale. Any 2026-09-03 timestamp sorts cleanly
after the tip; no `--include-all`. **Note the parallel session's `20260903090000` already occupies
that morning slot.**

---

## 7. Product rulings — closed at G3, 2026-09-03

- **OQ1 → D8. Product-blind at the query layer, because it needs nothing more.**
  ⚠️ **This question was put to Muskan on a false premise and the record must say so.** I claimed
  the row would read "Acme GmbH · Pricelist request" with no product name. It will not:
  `requestProductPricing` already writes `buildPricingRequestNote(product.name)` →
  `Pricing request for "CBD Blossom 10g".` into `note` (`pricingRequest.ts:38-41`,
  `actions.ts:165-170`), `companyRequests.ts:39` already maps `note`, and `RequestsSection.tsx:75`
  already renders it. The ruling ("ship product-blind") produces the correct code — change
  nothing — but the reason is the opposite of the one given: not *the receiver cannot see the
  product*, but *they already can*. A `metadata` + product join would have built a second path to
  a fact the row already displays.
- **OQ2 → D9. Retitle to "Requests".** The box holds three company types plus person requests;
  the old title described one of them.
- **OQ3 → D10. Badge every row**, person rows included, rather than a gap where the badge falls.

  **This is why D4 changed.** `REQUEST_TYPE_META` is keyed on `InboxRequestType`, and
  `connect_person` is *deliberately excluded* from that union (`connect/types.ts:24-29`) because
  a person request is answered by a different RPC on a different graph. Person rows also arrive
  via a different fetch. Crucially, `COMPANY_INBOX_TYPES` is **derived from that map's keys**
  (`inbox-display.ts:58-60`) — so bolting a fourth key on to get a badge label would silently
  widen a *data filter*. Therefore `requestTypeMeta.ts` is keyed on
  `DiscoverRequestKind = "connect" | "connect_message" | "pricelist_request" | "person"`, which
  describes what the badge *says*, not what the inbox *admits*, and owns no filtering (I-M11).
- **Message shape → D2.** Ruled by Muskan at G3: the connected pricing ask appears as a **normal
  chat message from the person who sent it**, not a system pill or a Sella intro.

---

## 8. Consequences

**Good.** One inbox instead of two. A ticket regains a single meaning. Roughly 800 lines of
component and lens code leave the tree, along with a claim/assign model for a team structure this
product does not have. ADR 0005's deferred pricing fix lands; ADR 0006 §7.2/J4 is discharged. And
rev 2 is *smaller* than rev 1: the person-resolve, the `INTO STRICT`, and the membership backfill
are all gone.

**Accepted costs.**
- `requestProductPricing` keeps a read-then-write race, ruled acceptable at `PRD:62`.
- **The two arms differ in room *and* in content.** D2's connected ask posts to the **c2c** thread
  (per FR2's wording); the unconnected path's accept posts its intro to the **p2p** thread
  (`20260826100000:215-217`). Worse, `accept_connection_request` posts the sender's note into p2p
  **only for `connect_message`** (`:253`) — a `pricelist_request` gets only the Sella intro
  sentence, which does **not** name the product. So the connected arm shows
  `Pricing request for "X".` in chat and the unconnected arm names the product nowhere in chat at
  all. Named, not fixed — FR2 decided the room and the PRD is source of truth. *(This also
  qualifies §7's OQ1 correction: the receiver can see the product **on the pending row**, up until
  they accept it.)*
- **The reachability argument rests on a mutable column.** `ws_all` on `deal_workspace` is
  `FOR ALL TO authenticated` with `WITH CHECK card_relationship_member(deal_card_id)`, and
  `authenticated` holds table UPDATE — so a party can flip `visibility` to `'private'` through
  PostgREST, at which point `can_access_workspace` falls through to `is_workspace_member` and the
  counterparty is locked out. Today `claim_deal_ticket` is a recovery path; after the DROP there
  is none. Narrow (no UI writes that column, and all live data is `company_wide`) but real, and it
  is the one place D1's simplification costs something.
- The one-person-per-company invariant remains unenforced by the schema. Rev 2 no longer depends
  on it at all, which is the point.

**Deferred.** Claim/assign/reassign (retired, not migrated). Home's deal-claim board (moot).
Multi-person visibility (Path B). A single-RPC version of D2, if the race bites.

**Filed separately, found during this design:**
- `supabase/functions/sella-detect/index.ts:91-96` does not filter `chat_thread.type`, so a direct
  POST with a c2c thread id can reach a detection path every sanctioned route gates to `p2p`.
  Out of scope here; worth a doubt.
- `docs/deploy/cloud-migrations-pending.md` carried stale `⚠️ PENDING` headings for an
  already-live batch. A parallel session has struck them.

---

## 9. What changed in rev 2, and what it means for the spec

`adr-checker` round 1 raised four findings on rungs 1-3. All four were spot-verified against the
repo and all four held.

| Finding | Rev 1 said | Truth | Fix |
|---|---|---|---|
| **B2** rung 3 | The delete list compiles | `inbox.ts:15,16-23` import two "deleted" files; `acceptItem` returns `getInbox()` at `:346` | D11 |
| **B3** rung 3 | `send_deal_c2c_announce_test.sql:405` asserts `send_deal` has no ticket insert; "still valid" | It is about **`deliver_deal`**, asserts the insert **is present**, and hard-errors after the DROP | D7 extended |
| **B4** rung 2 | Checkpoint counts pending tickets | A backfill inserting zero memberships would still pass | Moot under rev 2's D1 (no memberships); query gains `deleted_at is null` |
| **B1** rung 1 | D2's RPC "must call `assert_relationship_writable`" | That gate short-circuits when `auth.uid()` is NULL; no grant assertion existed | D2 grant contract + I-M12 |

Plus **N2/N3**, which reshaped the ADR: co-ownership is not what makes a deal reachable, and the
mechanism rev 1 proposed could not run against our own seed data.

### Round 2 — two further findings, both folded in

Round 2 ran against rev 2 with no knowledge of round 1. It raised **new** rung 1-3 findings, so
the 2-round budget closed without converging; a third round is Muskan's explicit call, not a
default (PIPELINE §10).

| Finding | Rev 2 said | Truth | Fix |
|---|---|---|---|
| **B1** rung 2 | I-M1/I-M2 prove D1 shipped | Both are green *before and after* D1 on the obvious p2p fixture — the ticket branch is unreachable there, and the counterparty *does* get a `deal_member` row | §1 reframed as dead-code deletion; I-M1/I-M2 now pin the fixture (c2c thread, non-counterparty member) |
| **B2** rung 3 | I-M7's census returns zero rows | It never can — `accept_connection_request` and `send_deal` carry the names in **body comments**, and `prosrc` includes comments (naive query returns 4 rows today) | I-M7 narrowed to call-site shape, mirroring I-M6 |

Round 2 also independently re-verified rev 2's load-bearing claim (`can_access_workspace` passes
on `company_wide` without a `deal_member` row), censused every consumer of `deal_member` — RPCs,
policies, app reads — and found D1 breaks none of them. The one real edge it surfaced is the
mutable-`visibility` case now recorded in §8.

### Spec amendments this ADR makes — Muskan's to approve at G3

1. **FR1 and AC1** — drop *"and adds them as deal co-owner in the same transaction"* / *"with the
   receiving company's person as a co-owner"*. Replaced by: the deal appears in the existing
   thread and is reachable company-wide, no ticket. **Rationale:** the co-owner row was believed
   to be what made the deal reachable; it is not, and requiring it breaks against real data.
2. **AC4** — drop *"(its company's person added as co-owner)"*. Backfill resolves the ticket's
   status only. *"none are stuck, unreachable, or still show `pending`"* stands.
3. **`PRD:61`** — superseded. Its stated deploy order (backfill before the `confirm_detected_deal`
   fix) is the reverse of the safe one. See §6 rule 1.
4. **FR6/FR9 scope** — extended to four `supabase/tests/` files and the C9 block; `two-company.ts`
   removed from the list.
5. **`PRD:60`** — void. Its edge-case row ("the receiving company has zero active people at the
   moment Sella's fix tries to resolve one") describes a resolve that rev 2 deleted.
6. **`AC1`'s "appears directly in that existing chat thread"** — satisfied by the **existing**
   `deal_detected` pill and its `born_deal_card_id` metadata write (`20260827130000…:187`), which
   D1 does not touch. Stated rather than newly asserted: this ADR adds no announcement, so the
   clause is inherited, not delivered.
7. **`docs/architecture/adr/0007-c2c-thread-atomicity.md:272`** — superseded in one sentence. It
   says both thread helpers are "only ever called from inside `accept_connection_request`'s own
   SECURITY DEFINER body". D2 adds a second definer caller. 0007's safety *argument* survives
   intact (still definer-internal, still ungranted); only that sentence goes stale.

### A note on scope consistency, raised by the checker and worth answering

The checker observed that "the spec did not authorize it" was used to *reject* the single-RPC
version of D2, while D6, D7 and extra test files were *added* on the same reasoning. The rule
this ADR actually applies: **scope may grow to keep the shipped system correct and buildable
(a test that would go red, a file that would not compile, a URL that would dead-end), but not to
adopt a better design the spec did not ask for.** D7 and D11 are the first kind. The single-RPC
D2 is the second. Stated here so the next reader sees one rule rather than two.
