# 0023 T03 / HEL-65 — the walk, end to end · PLAN rev 1

> Written at `/build` step 2, 2026-08-25. Consumes T01 (HEL-63, closed) and
> T02 (HEL-64, closed). Budgets for this round: `tests 0/2` ·
> `blocking-findings 0/2` · `G4 rounds 1`.

---

## §0 · Base, and what moved under this ticket

`git pull --rebase` clean. **dev was 3 real commits ahead** — `6710f3a` (HEL-70,
`20260825110000_deactivated_company_gate.sql`, 499 lines + its suite) and two ledger
commits. Session 88 skipped its rebase because dev's tree diff was empty; **that is no
longer true**, so the base was updated before any work.

**Merged, not rebased** (`992f05b`). The two local commits were already pushed to
`origin/claude/muskan/work` and a parallel session is active on this repo; rebasing would
have required a force-push on a shared branch for no gain. Base is **frozen from here** —
no rebasing mid-build (`/build` step 1).

**T01 is LIVE ON PRODUCTION** (parallel session `security_tickets`, 2026-08-25). Pre-flight
diffed prod's `send_deal` on `prosrc` — `md5 = b52ea5dfddd626afc3074acd2615b48d`, byte-identical
to `20260724120300`, zero drift. Production tip is `20260825110000`; **the pending cloud batch
is empty**. T03 adds no migration, so it opens no batch.

**Same-deploy hazard checked, not assumed** (DECISIONS 2026-08-24's `git show origin/main:<file>`
pre-check). The DB is ahead of `dev`/`main`, and that is benign **in this direction**:

| checked on `origin/main` | result |
|---|---|
| `MessageBubble.tsx:20-42` | `DEAL_SIGNAL_TYPES` already holds `deal_card`, **no thread-type gate** → prod's deployed UI renders the new c2c pill today |
| `deals/actions.ts:367` `sendDeal` | returns `{threadId}`; **never reads `pending_inbox_item`** → no consumer to break |
| `connect/lib/lenses.ts:38-40` | the deal-tickets lens is a filter; zero rows renders the existing empty state, and `inbox.ts`'s `dealPreviewOf` null-guards |

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
[[L-041]]'s shape exactly (match the shape, not the common spelling). Recorded so the next
reader does not "discover" that the migration failed to apply.

**Therefore `e2e/deal-c2c-create.spec.ts:141-191` is red**: it drives `createC2cDealAsAlice`
(which sends), then expects a claimable ticket in Bob's Deal-tickets lens. `send_deal` no
longer mints one. This is the ticket's AC 4, and it is a real failing test, not a
hypothetical.

---

## §2 · Files

| file | change | shared? |
|---|---|---|
| `e2e/deal-lands-in-c2c-chat.spec.ts` | **new** — the buyer walk (AC 1, 2, 3, 6) | no |
| `e2e/deal-c2c-create.spec.ts` | the `:141-191` case's premise reversed and rewritten; the file header's stale "inbox ticket → claim" spine corrected | no |
| `e2e/fixtures/two-company.ts` | **4 stale docstrings** + 1 new helper (below) | 🔒 **YES — sync lock required** |
| `e2e/inbox-accept.spec.ts` | **run and judged, no edit expected** (AC 5) | no |

**The fixture edit is in scope deliberately, and is not drive-by.** Four docstrings assert
behaviour T01 falsified — `:284` ("the delivery spine (deliver_deal) reads"), `:321-323`
(`countTicketsForCard`: "proves the ticket half stayed silent"), `:746` ("`send_deal` RPC
delivers the deal (p2p pill / inbox ticket)"), `:888` (`createC2cDealAsAlice`: "the claimable
inbox ticket for StonePharm now mints at SEND"). **`:888` is the docstring of the very helper
this ticket's rewritten case calls**, so leaving it is [[L-028]]'s shape — a Files list hiding
a defect from the agent best placed to find it. Stale citations have been caught **five times
on this slug already**; this is the cheapest possible round of that.

**New helper, one only:**

```ts
/** Live `deal_card` pills on ONE thread type of the GreenLeaf<->StonePharm relationship. */
export function countDealPillsOnThread(threadType: 'c2c' | 'p2p'): number
```

Filters `m.deleted_at is null` **and** `t.deleted_at is null`, keyed by company name at
runtime like every sibling. Justified because the assertion "the pill landed in the c2c thread
and **not** in the p2p one" is a row fact, and [[L-019]] says prove the row.

---

## §3 · The criteria — five from TICKETS.md, plus one added by ruling

| # | criterion | how it is proven |
|---|---|---|
| **1** | pill appears in the seller's c2c conversation, and the deal opens from it | new spec, case A |
| **2** | recipient reaches the deal from chat **without visiting `/connect/inbox`** | new spec, case A — the walk never navigates there, and case B proves the inbox is empty of it |
| **3** | the Deal-tickets lens shows **no NEW entry** | new spec, case B — DB count **and** the lens |
| **4** | `deal-c2c-create.spec.ts:141-191` reversed and rewritten, **not deleted** | the rewrite, §4 step 5 |
| **5** | `inbox-accept.spec.ts` run **deliberately and judged** | §4 step 7 |
| **6** | 🔴 **the call-site wiring is asserted, not just the selector** | new spec, case C |

### AC 6 is real scope, and here is its provenance — [[L-051]] applied to myself

TICKETS.md's five ACs **do not mention the picker at all.** AC 6 comes from T02's G4
**ruling 2** (`REVIEW.md`, `critic` N1): *"Accept, or ask T03 to assert the wiring."* Muskan's
handoff resolved it toward T03 — CLAUDE.md § What's next, item 2, marked 🔴: *"Only an e2e
catches it."*

So before naming this ticket as the owner I **opened this ticket and found no criterion** —
which is precisely the failure L-051 records from T02. The honest disposition is not "defer":
it is **add the criterion here**, which this plan does. ⚠️ **TICKETS.md's T03 AC list is
therefore stale by one row.** Recorded as a **sixth doc edit owed by T04/HEL-66**; it is not
silently absorbed.

**What AC 6 must actually discriminate.** Swapping `BasketDrawer.tsx:361` to
`relationshipId={group.sellerCompanyId}` leaves both operands `string`, `tsc` green, and **all
seven unit cases green**, while the shipped people list is empty forever. So asserting "the
control renders" or "Whole company is default" proves **nothing** — those pass under the bug.
The assertion must be that the select offers **a named GreenLeaf person**. Verified against the
DB, not the G4 screenshot:

```
GreenLeaf Cultivation | Alice Green | 1111...   |  StonePharm | Bob Stone | 2222...
GreenLeaf Cultivation | Carla Klein | 3333...
```

⚠️ **Option ORDER is not stable between loads** (T02 G4, observation 1 — two identical runs
gave `[Whole company, Alice, Carla]` and `[Whole company, Carla, Alice]`). Assert on
**membership**, never on index. "Whole company" is always first and may be asserted positionally.

### AC 3's cover is deliberately doubled

The criterion says *"the Deal-tickets **lens** shows no new entry"* — a UI claim. [[L-019]]
says prove the row. **Both**, because they answer different questions:

- `countTicketsForCard(cardId) === 0` — card-scoped, so it is immune to the pre-existing
  production tickets the criterion explicitly says survive. This is the authoritative half.
- Alice's Deal-tickets lens does not list the deal's product — this is what "lens" means, and
  it is nearly free because Alice is already signed in for AC 1.

---

## §4 · Runnable order

**Step 0 — sync lock.** Add `e2e/fixtures/two-company.ts` to `docs/team/sync/muskan.md`'s
locked list; **commit + push the sync file alone.** The parallel session has already been told
this ticket may touch that file and that its docstrings are stale.

**Step 1 — the fixture (own rows, zero seed mutation).**

Handed-forward item 4 forbids this becoming the fourth seed-mutating spec (**HEL-73**). The
clean pattern is `e2e/discover-shop.spec.ts:586-594` / `:690-716`: create, then **hard**-delete
in `afterAll`.

**This is now evidence-backed, not a preference.** The only two GreenLeaf products a connected
buyer can basket are **AUR-1B and AUR-1E** (`profile_visible` AND `price_public`, measured) —
and both are mutated by committed specs: `discover-shop.spec.ts:392` writes AUR-1B's spec
columns, `present-card-edit.spec.ts:162-176` builds price ladders on it, and
`basket_admission_test.sql:95` states outright that *"AUR-1B does carry two OTHER persistent
e2e"* mutations. Pinning to either is [[L-033]] with the trap already sprung.

So: `beforeAll` mints **one** GreenLeaf product via the service-role client
(`profile_visible: true`, `price_public: true`, a real `location`, a distinctive
`supplier_product_code` such as `T03-TMP`) plus its `pricelist_item`; `afterAll` hard-deletes
`product_basket_line` → `pricelist_item` → `product`, in FK order.
**`AUR-1A`–`AUR-1F` are never written** (pinned by `basket_admission_test.sql` and
`seed_visibility_matrix_test.sql`).

**Step 2 — case C (AC 6), cheapest and most likely to fail.** Bob signs in →
`/discover/aaaaaaaa-…` → Add to basket → the `Basket` button in TopBar
(`TopBar.tsx:65`, `aria-label="Basket"`) → the GreenLeaf group's
`aria-label="Address this deal to"` select. Assert its options **contain "Alice Green" and
"Carla Klein"**, and that option 0 is exactly **`Whole company`**.

**Step 3 — case A (AC 1, 2).** Same drawer, leave the addressee at **Whole company** →
"Create a draft deal" → the born card panel → `Send deal` → wait for
*"Waiting for the other side to sign."* (the negotiation-unique DecisionBar signal every
existing fixture waits on). Then **Alice** in a second context: `/connect/chat` → the
`Company chat (C2C)` row → the pill. Assert the pill body is
**`Bob Stone has sent a deal`** — Bob is the sender, and the body is built from `person`'s
`first_name`/`last_name` (`20260825090000:222-229`), which is the field the code writes
([[L-020]]). Click it, assert the card panel opens.

**Step 4 — case B (AC 3).** On the same state: `countTicketsForCard(cardId) === 0`, and
Alice's `/connect/inbox` Deal-tickets lens does not list `T03-TMP`'s name. Also
`countDealPillsOnThread('c2c') === 1` and `countDealPillsOnThread('p2p') === 0` — presence and
absence on one state ([[L-021]]).

**Step 5 — the rewrite (AC 4).** `deal-c2c-create.spec.ts:141-191`. Premise inverts: after
`createC2cDealAsAlice` (Alice→Bob through the **c2c chat** door, the other door from the
basket), **Bob's Deal-tickets lens is empty**, the pill is in **Bob's** c2c chat, and the deal
opens from it **with no claim**.

⚠️ **[[L-044]] check, run rather than assumed.** Does any later assertion depend on this case?
**No** — it is the file's last test and `beforeEach` calls `resetDealData()`, so cases share no
fixture. But *within* the case, `countDealMembersForCard(cardId)` must go **`2` → `1`**:
the claim step is gone, so **the receiving company now has no `deal_member` at all.** That is a
genuine behavioural consequence of T01 and gets its own assertion plus a comment, not a
silently-lowered number. It is safe because `sign_deal` (`20260724120500:73-82`) already lets
any company member sign without a claim (STATE.md, Risk #1) — cited, because a lowered count
that nobody explains is how a green suite stops proving anything.

The file header (`:2-24`) describes the spine as *"birth → SEND → inbox ticket → claim"*. It is
rewritten in the same edit.

**Step 6 — the four fixture docstrings** (§2).

**Step 7 — run and judge (AC 5).** `inbox-accept.spec.ts`, deliberately.

**Pre-judged, so the run confirms rather than discovers:** the handed-forward worry was that
`:157-158`'s `countThreadsForPair("c2c") === 1` could miscount once T01's heal path can leave a
soft-deleted thread beside a live one. **It cannot.** `countThreadsForPair`
(`two-company.ts:532-556`) already filters `t.deleted_at is null` **and** `r.deleted_at is
null`, and a repo-wide grep finds **no other c2c thread counter**. The spec also never calls
`send_deal` (it drives `pricelist_request` accept), so the heal path never fires in it.
**Concern closed by construction — the run is still owed and will still be run.**

---

## §5 · Declared uncovered — every owner OPENED, per [[L-051]]

| gap | owner | verified how |
|---|---|---|
| **T02 AC 3** — "Whole company shows immediately, people arrive on resolve" | **NOBODY. Open ruling.** | T02's G4 ruling 3 offered *"accept the contract as cover, or send it to T03 with a throttled fetch."* The gate log records rulings 1 and 4; **it does not record 3**, and CLAUDE.md's T03 brief does not carry it. I am **not** silently adopting it: a throttled-fetch test needs a network-interception harness this repo has never used. **Stated for Muskan at G4, not deferred to nothing.** |
| the **seller**-side call site (`RecipientPicker.tsx:59` → `chosen.companyId`) | **not covered here** | `critic` N1 names both call sites. AC 6 closes the **buyer** one. The seller path is reachable only through the own-company group and is not on any T03 criterion — **named, not implied** ([[L-050]]'s own lesson) |
| **N8** — suspended relationship renders an empty people list, indistinguishable from the legitimate zero-people case | **unfiled, deliberately** (Muskan declined at T02's G4) | unreachable in the seed; no e2e can stage it without a suspended fixture |

---

## §6 · Traps carried in, so they are not rediscovered

1. **Auth-key rotation.** Every `db reset` rotates the stack secret;
   `fixtures/local-supabase.ts:20-35` resolves it **once** per run. A reset immediately before
   an e2e run manufactures `cannot resolve the local Supabase secret key` failures that look
   like real regressions and cascade into `waitForURL` timeouts. **Do not reset before the
   run.** SQL runners are immune (`psql`, not the JS fixtures).
2. **`npm test` is PLAYWRIGHT here, not vitest** ([[L-022]]) — `package.json:10`, and it sets
   `PLAYWRIGHT_FORCE_ASYNC_LOADER=1`, **which is mandatory**: without it Playwright 1.61 on
   Node 22+ crashes in its sync ESM resolve hook the moment a spec imports `e2e/fixtures/*`.
   Unit tests are `npm run test:unit`.
3. **One worker, always** (`playwright.config.ts:24`). Every deal spec resets and mints on the
   **one** seeded GreenLeaf↔StonePharm relationship. The new spec must
   `test.describe.configure({ mode: 'serial' })` like its neighbour.
4. **Selector collision.** The c2c pill is a `<button title="Open the deal card">` whose
   accessible name comes from its **text content** (`MessageBubble.tsx:56-60`), while the
   strip's icon button carries `aria-label="Open the deal card"`. `{ name: 'Open the deal
   card', exact: true }` hits only the strip button — **a loose regex would match both.**
5. **`rtk` collapses vitest to `PASS (n) FAIL (n)` and hides a suite that never ran.** Use
   `rtk proxy npx vitest run`; treat the **FILE** count as load-bearing.
6. **Two T02 selectors are contract, not incidental:** `aria-label="Address this deal to"`
   and the option string **`Whole company`** (exactly — the "(optional person)" suffix is gone).
   `CounterpartyPersonSelect.tsx:55-56` says so in the component itself.
