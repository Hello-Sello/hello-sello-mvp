# 0023 T03 / HEL-65 — the walk, end to end · PLAN rev 2

> rev 1 written at `/build` step 2, 2026-08-25. **rev 2 folds `plan-checker`'s REVISE —
> 6 blocking + 8 notes, ALL FOURTEEN verified true against the real files before folding
> ([[L-003]]), all accepted, none argued down.**
> Budgets this round: `tests 0/2` · `blocking-findings 0/2` · `G4 rounds 1`.

---

## §0 · Base, and what moved under this ticket

`git pull --rebase` clean. **dev was 3 real commits ahead** — `6710f3a` (HEL-70,
`20260825110000_deactivated_company_gate.sql`, 499 lines + its suite) and two ledger
commits. Session 88 skipped its rebase because dev's tree diff was empty; **that is no
longer true**, so the base was updated before any work.

**Merged, not rebased** (`992f05b`). The two local commits were already pushed to
`origin/claude/muskan/work` and a parallel session is active on this repo; rebasing would
have required a force-push on a shared branch for no gain. Base is **frozen from here**.

**T01 is LIVE ON PRODUCTION** (parallel session `security_tickets`, 2026-08-25). Pre-flight
diffed prod's `send_deal` on `prosrc` — `md5 = b52ea5dfddd626afc3074acd2615b48d`, byte-identical
to `20260724120300`, zero drift. Production tip is `20260825110000`; **the pending cloud batch
is empty**. T03 adds no migration, so it opens no batch.

**Same-deploy hazard checked, not assumed** (DECISIONS 2026-08-24's `git show origin/main:<file>`
pre-check). The DB is ahead of `dev`/`main`, and that is benign **in this direction**:

| checked **on `origin/main`**, not on HEAD | result |
|---|---|
| `origin/main:MessageBubble.tsx:20-42` | `DEAL_SIGNAL_TYPES` already holds `deal_card`, **no thread-type gate** → prod's deployed UI renders the new c2c pill today |
| `origin/main:deals/actions.ts:367` `sendDeal` | returns `{threadId}`; **never reads `pending_inbox_item`** → no consumer to break |
| `origin/main:connect/lib/lenses.ts:38-40` | the deal-tickets lens is a filter; zero rows renders the existing empty state, and `inbox.ts`'s `dealPreviewOf` null-guards |

⚠️ **The tree is named deliberately** (`plan-checker` N4): `sendDeal` is at **`:367` on
`origin/main`** and **`:369` on HEAD** — T01 rewrote that docstring. A bare line number on a
file this slug itself edited is ambiguous.

The 0022 outage shape was old code **writing** through an already-revoked grant. Nothing was
revoked here and no grant or RLS changed — only which row `send_deal` writes.

---

## §1 · What is RED right now — measured, not predicted

Local DB carries T01. Verified against `pg_proc`, **not** against the migration file:

```
select case when prosrc ~* 'perform[[:space:]]+public\.deliver_deal' then 'OLD' else 'T01 applied' end
  from pg_proc where proname='send_deal';           -->  T01 applied
```

⚠️ **A plain `grep deliver_deal` on `prosrc` returns a HIT and is a false positive** — the
only match is a comment at body line 37 explaining why the call was removed. That is
[[L-041]]'s shape exactly. Recorded so the next reader does not "discover" that the migration
failed to apply.

**Therefore `e2e/deal-c2c-create.spec.ts:141-191` is red**: it drives `createC2cDealAsAlice`
(which sends), then expects a claimable ticket in Bob's Deal-tickets lens; `:167-168` times
out. This is the ticket's AC 4, and it is a real failing test.

---

## §2 · Files

| file | change | shared? |
|---|---|---|
| `e2e/deal-lands-in-c2c-chat.spec.ts` | **new** — the buyer walk (AC 1, 2, 3, 6) | no |
| `e2e/deal-c2c-create.spec.ts` | the `:141-191` case's premise reversed and rewritten; the file header's stale "inbox ticket → claim" spine corrected | no |
| `e2e/fixtures/two-company.ts` | **4 stale docstrings** + 1 new helper (below) | 🔒 **YES — sync lock taken + pushed alone** |
| `e2e/inbox-accept.spec.ts` | **run and judged, no edit expected** (AC 5) | no |

**The fixture edit is in scope deliberately, and is not drive-by.** Four docstrings assert
behaviour T01 falsified — `:284`, `:321-323` (`countTicketsForCard`), `:746`, `:888`
(`createC2cDealAsAlice`). **`:888` is the docstring of the very helper this ticket's rewritten
case calls**, so leaving it is [[L-028]]'s shape. Stale citations have been caught **seven
times on this slug**; two more of mine are corrected in this very revision (§6).

**New helper, one only:**

```ts
/** Live `deal_card` pills on ONE thread type of the GreenLeaf<->StonePharm relationship. */
export function countDealPillsOnThread(threadType: 'c2c' | 'p2p'): number
```

Filters `m.deleted_at is null` **and** `t.deleted_at is null`, keyed by company name at
runtime like every sibling. Justified because "the pill landed in the c2c thread and **not**
in the p2p one" is a row fact, and [[L-019]] says prove the row.

---

## §3 · The criteria — five from TICKETS.md, plus one added by ruling

| # | criterion | how it is proven |
|---|---|---|
| **1** | pill appears in the seller's c2c conversation, and the deal opens from it | new spec, **test 2** |
| **2** | recipient reaches the deal from chat **without visiting `/connect/inbox`** | **implied, not independently asserted — see below** |
| **3** | the Deal-tickets lens shows **no NEW entry** | new spec, **test 2** — DB count **and** the lens |
| **4** | `deal-c2c-create.spec.ts:141-191` reversed and rewritten, **not deleted** | §4 step 5 |
| **5** | `inbox-accept.spec.ts` run **deliberately and judged** | §4 step 7 |
| **6** | 🔴 **the call-site wiring is asserted, not just the selector** | new spec, **test 1** |

**AC 2 is implied by AC 1 + AC 3, and is NOT separately proven** (`plan-checker` N6). rev 1
claimed it was proven by *"the walk never navigates to `/connect/inbox`"* — that is a property
of the script, not a check; a script proves nothing by omission. What actually establishes it
is the pair: the deal **is** reachable from chat (AC 1) and **is not** in the inbox (AC 3).
Stated rather than double-counted.

### AC 6 is real scope, and here is its provenance — [[L-051]] applied to myself

TICKETS.md's five ACs **do not mention the picker at all.** AC 6 comes from T02's G4
**ruling 2** (`critic` N1): *"Accept, or ask T03 to assert the wiring."* Muskan's handoff
resolved it toward T03 (CLAUDE.md § What's next, item 2, marked 🔴).

So before naming this ticket as the owner I **opened this ticket and found no criterion** —
precisely the failure L-051 records from T02. The honest disposition is not "defer": it is
**add the criterion here**. ⚠️ **TICKETS.md's T03 AC list is therefore stale by one row**,
booked as **T04/HEL-66's SIXTH doc edit**. Not silently absorbed.

**What AC 6 must discriminate — traced by `plan-checker` and confirmed red.** Swapping
`BasketDrawer.tsx:361` to `relationshipId={group.sellerCompanyId}` leaves both operands
`string`, `tsc` green, and **all seven unit cases green**. The chain is
`CounterpartyPersonSelect.tsx:87` → `peopleForRelationship` → `:27`
`view.companies.find(c => c.relationshipId === id)`; `getMyConnections` sets
`companies[].relationshipId = rel.id` (`connections.ts:143-154`), so a `companyId` matches
nothing → `?? []` → the select renders **only `Whole company`**.

So asserting "the control renders" or "Whole company is default" proves **nothing** — both
pass under the bug. The assertion must be that the select offers **named GreenLeaf people**.
Reachability confirmed: `can_see_person` reduces to `shares_connection_with_company`
(`20260609183000:33-39`), relationship-level, so Bob sees both. Names verified in the DB, and
`display_name` is unset (`seed.sql:51,59,132`) so `first_name last_name` is the rendered
string ([[L-020]]):

```
GreenLeaf Cultivation | Alice Green | 1111…      StonePharm | Bob Stone | 2222…
GreenLeaf Cultivation | Carla Klein | 3333…
```

⚠️ **Option ORDER is unstable between loads** (T02 G4, observation 1). Assert **membership**,
never index. "Whole company" is always first and may be asserted positionally.

---

## §4 · Runnable order

**Step 0 — sync lock.** ✅ Done: `e2e/fixtures/two-company.ts` locked, sync committed + pushed
alone. The parallel session has been told its docstrings are stale.

### Step 1 — the fixture: own rows, zero seed mutation, and a delete order that actually works

Handed-forward item 4 forbids this becoming the fourth seed-mutating spec (**HEL-73**). The
clean pattern is `e2e/discover-shop.spec.ts` T05 — create at `:566-584`, **hard**-delete at
`:586-594`. ⚠️ **rev 1 called that pair an `afterAll`; it is a `beforeEach`/`afterEach`**
(`plan-checker` N3). Corrected.

**Not pinning to a seed row is evidence-backed, not preference.** The only two GreenLeaf
products a connected buyer can basket are **AUR-1B and AUR-1E** (`profile_visible` AND
`price_public`, measured) — and both are mutated by committed specs:
`discover-shop.spec.ts:392` writes AUR-1B's spec columns, `present-card-edit.spec.ts:162-176`
builds price ladders on it, and `basket_admission_test.sql:95` states outright that *"AUR-1B
does carry two OTHER persistent e2e"* mutations. Pinning to either is [[L-033]] with the trap
already sprung.

`beforeAll` mints **one** GreenLeaf product via the service-role client, plus its
`pricelist_item`:

```ts
{ company_id: GREENLEAF_ID, name: "T03 Chat Landing Product",
  supplier_product_code: "T03-TMP",
  profile_visible: true, price_public: true,
  location: "Toronto Warehouse",   // B5 — an EXISTING GreenLeaf location
  pack_size_grams: 100 }           // N5 — the precedent sets it
```

🔴 **B5 — the location must be an existing one.** `discover-shop.spec.ts:170` asserts the
buyer sees **exactly 3** `location-option`s on GreenLeaf's shop, and `discover-shop.spec.ts`
sorts *after* this file under one worker. A new location string makes that 4. GreenLeaf's
real locations are **`Toronto Warehouse`** and `Montreal Warehouse` (measured); the cited
precedent uses `Toronto Warehouse` at `:687` for the same reason.

🔴 **N5 — `pack_size_grams: 100` is not optional.** Without it `resolveBasketLine` yields
`grams == null`, so `toDraftLines.ts:28` writes `unit: "unit"` and a raw pack count — a
different born line than the one the walk describes.

🔴 **B1 — the `afterAll` delete order in rev 1 WAS BROKEN and would have leaked the fixture
into the seed permanently.** `deal_line_item.product_id → product(id)` has **no `ON DELETE`
action** (`20260607090005:22-24`, verified — the constraint carries no clause), and the birth
RPC writes that row (`20260724120200:128-132` via `toDraftLines.ts:20`). Test 2 births a draft
from `T03-TMP`, so `delete from product` raises **`23503`**. rev 1 copied the order from
`discover-shop.spec.ts:713-715`, where the product is never drafted onto a deal. **That is the
exact HEL-73 outcome this plan claims to avoid.** Corrected order:

```
afterAll:  resetDealData()                    // clears deal_line_item + deal_card for the relationship
           delete product_basket_line  where product_id = fixture
           delete pricelist_item       where product_id = fixture
           delete product              where id         = fixture
```

**Every delete checks its `error`** rather than fire-and-forget — a silent 23503 is how the
leak becomes invisible.

**`AUR-1A`–`AUR-1F` are never written** (pinned by `basket_admission_test.sql` and
`seed_visibility_matrix_test.sql`).

### Step 2 — the file's shape, which B2/B3 make load-bearing

```ts
test.describe.configure({ mode: 'serial' })   // one worker, one shared relationship
beforeAll   → mint the fixture product + pricelist_item
beforeEach  → resetDealData()                 // B2: a deterministic start, stated not assumed
afterAll    → the four deletes above, in order
```

🔴 **B2 — rev 1's `countDealPillsOnThread` expectations were false before the spec's first
line ran.** Under `playwright.config.ts:26` (`workers: 1`) files run in path order:
`deal-c2c-create` → `deal-change` → `deal-lands-in-c2c-chat` → `deal-p2p-send`.
`deal-c2c-create` resets in `beforeEach` **only**, so its last test's card survives — and
since T01 that card's send posts a `deal_card` pill into the **c2c** thread, so `c2c` starts at
**1, not 0**. `deal-change` drives `createDraftDealAsAlice`, whose send posts a pill into the
**p2p** thread (`two-company.ts:767`), so `p2p` starts at **≥1, not 0**.

Worse, and the reason this is blocking rather than a note: `resolveDealCardIdForRelationship()`
is `select id … limit 1` with **no `ORDER BY`** (`two-company.ts:228`), and its own docstring
(`:216-218`) claims safety only *"after a birth [when] exactly one card exists"* — i.e. only
after a reset. With a leftover card present, **`countTicketsForCard(cardId) === 0` can pass
against the wrong card** — a false green on the half this plan calls authoritative.

🔴 **B3 — A and B are ONE test, not two.** rev 1 said case B reads "the same state" case A
produced, while also implying a reset. Those are incompatible: a `beforeEach` reset wipes A's
card before B runs, and a `beforeAll`-only reset makes B silently depend on A in a way
`mode: 'serial'` permits but nothing enforces. **Merged**, because the walk is one story
anyway. Test 1 (AC 6) needs no deal and stays separate.

### Step 3 — test 1: the call-site wiring (AC 6)

Bob signs in → `/discover/aaaaaaaa-…` → Add to basket → the TopBar `Basket` button
(`TopBar.tsx:65`, `aria-label="Basket"`) → the GreenLeaf group's
`aria-label="Address this deal to"` select.

Assert option 0 is exactly **`Whole company`**, and that the options **contain "Alice Green"
and "Carla Klein"**.

⚠️ **N1 — must be an auto-retrying matcher.** `people` arrives from an async
`getMyConnections()` **after first paint** (`CounterpartyPersonSelect.tsx:83-96`), so a
one-shot `allTextContents()` races the fetch and reads `['Whole company']` — flaky-red, and it
would burn the `tests 0/2` budget. Use `expect(options).toContainText([...])` / `expect.poll`.

### Step 4 — test 2: the walk and its negative space (AC 1, 3; AC 2 implied)

Same drawer, addressee left at **Whole company** → "Create a draft deal" → the born card panel
→ `Send deal` → wait for *"Waiting for the other side to sign."* (the negotiation-unique
DecisionBar signal every existing fixture waits on). Capture `cardId` **after** the birth, on
the reset state, so `limit 1` is unambiguous (B2).

Then **Alice** in a second context: `/connect/chat` → the `Company chat (C2C)` row → the pill.

⚠️ **N2 — the pill selector is named here, not left to the builder.** `MessageBubble.tsx:56-61`
puts the body **and** `· Click to open the deal card · <time>` inside one `<button>`, so the
accessible name is the concatenation. The repo's idiom is
`getByRole('button', { name: /click to open the deal card/i })`
(`deal-p2p-send.spec.ts:69`). Also assert the body text **`Bob Stone has sent a deal`** — Bob
is the sender and the body is built from `person.first_name`/`last_name`
(`20260825090000:222-229`), the field the code writes ([[L-020]]).

Click it; assert the card panel opens. Then the negative space, on that one state ([[L-021]]):

- `countTicketsForCard(cardId) === 0` — card-scoped, so immune to the pre-existing production
  tickets the criterion says survive. The authoritative half.
- `countDealPillsOnThread('c2c') === 1` and `('p2p') === 0`.
- Alice's `/connect/inbox` Deal-tickets lens.

🔴 **B4 — the lens assertion must not be pure absence.** `InboxView.tsx:130` renders
`LensTabs` **unconditionally, above** the `loading` ternary at `:131`, so the tab is clickable
while the list is still loading and *"the lens does not list `T03-TMP`"* passes on a loading
page, a blank page, and a crashed `InboxView`. That is [[L-021]]'s class, and rev 1 invoked
L-021 for the pill counts and then not here. **Copy the shape already in the file being
edited:** `deal-c2c-create.spec.ts:155` (`expect(getByText('Loading inbox…')).toBeHidden()`),
then the **positive** empty-state string at `:159-161` (*"No deal tickets waiting to be picked
up."*), **then** the absence.

### Step 5 — the rewrite (AC 4)

`deal-c2c-create.spec.ts:141-191`. Premise inverts: after `createC2cDealAsAlice` (Alice→Bob
through the **c2c chat** door, the other door from the basket), **Bob's Deal-tickets lens is
empty** (same B4 shape), the pill is in **Bob's** c2c chat, and the deal opens from it **with
no claim**.

**[[L-044]] check — run, and it passes.** No later assertion depends on this case: it is the
file's last test and `:53-55` is `beforeEach(resetDealData)`. Within the case,
`countDealMembersForCard(cardId)` must go **`2` → `1`**: birth inserts only the creator
(`20260724120200:160-172`), `send_deal` skips the member insert when `v_cp` is null
(`20260825090000:105-117`), and the claim was the only other writer.

⚠️ **N7 — cite, do not re-derive.** ADR **§4.1 `:307`** already records this consequence *and*
its safety analysis (workspace born `company_wide` so `can_access_workspace` passes;
`sign_deal` gates on relationship membership only, `20260724120500:73-82`) — and ends with the
words *"Recorded so it is not re-derived."* rev 1 re-derived it. The test cites the ADR row.

**One consequence named nowhere yet** (N7): `deals/components/PeopleTab.tsx` is the only
reader of `deal_member` in `src/`, so a company-addressed deal's People tab now shows **the
sender alone**. Not a defect and not this ticket's to fix — recorded so G4 does not meet it cold.

The file header (`:2-24`) describes the spine as *"birth → SEND → inbox ticket → claim"*, and
is rewritten in the same edit.

### Step 6 — the four fixture docstrings (§2)

### Step 7 — the run set (AC 5), stated rather than left open

⚠️ **N8 — rev 1 named only `inbox-accept.spec.ts`.** The run set is:

| spec | why |
|---|---|
| `deal-lands-in-c2c-chat.spec.ts` | new — must be green |
| `deal-c2c-create.spec.ts` | rewritten — must go red→green |
| `inbox-accept.spec.ts` | **AC 5**, deliberate |
| `deal-change.spec.ts` · `chat-phase7.spec.ts` · `deal-p2p-send.spec.ts` | ADR §4.3 rates all three SAFE **by reading**. This is the one ticket that can convert those readings into runs cheaply |

**AC 5 pre-judged, so the run confirms rather than discovers:** the handed-forward worry was
that `:157-158`'s `countThreadsForPair("c2c") === 1` could miscount once T01's heal path can
leave a soft-deleted thread beside a live one. **It cannot.** `countThreadsForPair`
(`two-company.ts:532-552` — ⚠️ rev 1 said `:532-556`, which overshoots into the next
docstring; `plan-checker` N3) already filters `t.deleted_at is null` **and**
`r.deleted_at is null`, and a repo-wide grep finds **no other c2c thread counter**. The spec
also never calls `send_deal` (it drives `pricelist_request` accept), so the heal path never
fires in it. **Concern closed by construction — the run is still owed and will still be run.**

---

## §5 · Declared uncovered — every owner OPENED, per [[L-051]]

| gap | owner | verified how |
|---|---|---|
| 🔴 **the claim path loses its only e2e** — "Pick up deal", `claim_deal_ticket`, the Deal-tickets claim flow | **residual cover is the RPC ONLY.** The browser rollout is now uncovered at EVERY level: `inbox.ts:265-300` (`acceptItem`'s `deal_card` branch → `acceptInbox` → `store.ts:573`), `InboxDetail.tsx:78` (the "Pick up deal" label), and `inbox.ts:201` (`viewerIsReceiver`'s derivation from real rows) | **B6.** Grep confirms `deal-c2c-create.spec.ts:22` is the **only** e2e mention of "Pick up deal" repo-wide. The path is still LIVE: STATE.md's G1 ruling keeps `claim_deal_ticket` (`:516`), and Risk #2 (`:530-534`) records `confirm_detected_deal_births_negotiation.sql:176` as a live writer into that lens. **rev 1 recorded none of this** — the rewrite would have silently dropped browser-level cover for a shipped path |
| **T02 AC 3** — "Whole company shows immediately, people arrive on resolve" | **NOBODY. Open ruling for Muskan at G4.** | T02's G4 ruling 3 offered *"accept the contract as cover, or send it to T03 with a throttled fetch."* The gate log records rulings 1 and 4; **it does not record 3**, and CLAUDE.md's T03 brief does not carry it. A throttled-fetch test needs network interception this repo has never used. **Stated, not deferred to nothing** |
| the **seller**-side call site (`RecipientPicker.tsx:59` → `chosen.companyId`) | **not covered here** | `critic` N1 names both call sites. AC 6 closes the **buyer** one; the seller path is reachable only through the own-company group and is on no T03 criterion — **named, not implied** ([[L-050]]'s own lesson) |
| 🔴 **the slug's HEADLINE SEAM — buyer picks a person → pill lands in the p2p thread** | **NOBODY end-to-end.** Covered as three halves that never meet: AC 6 proves the options render · T01's M3 proves the RPC routes · T02's G4 proved `metadata.counterparty_person_id` at the DB. **No test joins them.** `critic` N8 — and §5 named the *seller*-side call site while omitting this |
| **N8** — suspended relationship renders an empty people list, indistinguishable from the legitimate zero-people case | **unfiled, deliberately** (Muskan declined at T02's G4) | unreachable in the seed; no e2e can stage it without a suspended fixture |

---

## §6 · Traps carried in, so they are not rediscovered

1. **Do not `db reset`. There are now TWO independent reasons, and the second is new.**

   **(a) Auth-key rotation.** Every `db reset` rotates the stack secret;
   `fixtures/local-supabase.ts:20-35` resolves it **once**, at module load (`:38`). A reset
   immediately before an e2e run manufactures `cannot resolve the local Supabase secret key`
   failures that look like real regressions and cascade into `waitForURL` timeouts.
   SQL runners are immune (`psql`, not the JS fixtures).

   **(b) 🔴 A `db reset` from THIS tree would silently revert another branch's live schema.**
   Found by the parallel session `security_tickets`, 2026-08-25, and **verified independently
   by me** on this stack:

   | fact | measured |
   |---|---|
   | `msg_all`'s WITH CHECK carries HEL-67's gate **right now** | `(can_access_thread(thread_id) AND ((type)::text <> 'deal_detected'::text))` |
   | stamp | tip is `20260825120000` |
   | can this branch see that migration file? | **NO** — `git show claude/muskan/work:supabase/migrations/20260825120000_…` fails |

   A reset rebuilds from **the migration files this branch can see**, which stop at
   `20260825110000`. The policy and its stamp would both vanish, with no conflict, no warning,
   and no file collision to detect it. **A worktree isolates the tree; it does not isolate the
   database** — and migration files are per-branch while the local Postgres is not.

   **Consequence T03 must report honestly, not hide:** this ticket's green will be measured on
   a stack whose schema **this branch cannot reproduce**. For T03 the extra policy term is
   **inert** — grepped: the only `authenticated` `chat_message` insert in `e2e/` is
   `chat-phase7.spec.ts:273` with `type: 'message'`, and `two-company.ts:119`'s `deal_detected`
   is a superuser `DELETE` inside `RESET_SQL`. So the results stand. **But "green" is a claim
   about a database state** ([[L-033]]), and that state is currently one no `db reset` here
   would rebuild. Said in the gate report, not left implicit.
2. **`npm test` is PLAYWRIGHT here, not vitest** ([[L-022]]) — `package.json:10`, and it sets
   `PLAYWRIGHT_FORCE_ASYNC_LOADER=1`, **which is mandatory**: without it Playwright 1.61 on
   Node 22+ crashes in its sync ESM resolve hook the moment a spec imports `e2e/fixtures/*`.
   Unit tests are `npm run test:unit`.
3. **One worker, always** (`playwright.config.ts:26`) — and **file order is path order**, which
   is what makes B2 real rather than theoretical.
4. **Selector collision.** The c2c pill is a `<button title="Open the deal card">` whose
   accessible name comes from its **text content** (`MessageBubble.tsx:56-61`), while the
   strip's icon button carries `aria-label="Open the deal card"`.
   `{ name: 'Open the deal card', exact: true }` hits only the strip button — **a loose regex
   would match both.** For the pill, use `/click to open the deal card/i` (N2).
5. **`rtk` collapses vitest to `PASS (n) FAIL (n)` and will hide a suite that never ran.** Use
   `rtk proxy npx vitest run`; treat the **FILE** count as load-bearing.
6. **Two T02 selectors are contract, not incidental:** `aria-label="Address this deal to"` and
   the option string **`Whole company`** (exactly). `CounterpartyPersonSelect.tsx:55-56` says
   so in the component itself.

### Citations corrected in this revision — this slug's tally is now nine

| rev 1 said | truth |
|---|---|
| `countThreadsForPair` at `two-company.ts:532-556` | ends at **`:552`**; `:554-560` is the next docstring |
| `discover-shop.spec.ts:586-594` is "hard-delete in `afterAll`" | it is an **`afterEach`**, and the create is `:566-584` |
| `deals/actions.ts:367` for `sendDeal` | `:367` on **`origin/main`**, `:369` on **HEAD** — the tree must be named |
