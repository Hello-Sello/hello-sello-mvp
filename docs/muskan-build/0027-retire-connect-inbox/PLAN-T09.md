# T09 · Update the e2e specs — PLAN

ADR 0009, FR9. TICKETS.md T09. Depends on T06 (live) + T07 (live) — both closed. Last ticket in
the slug's original nine.

**Revised after `plan-checker` round 2: REVISE, 1 blocking, 6 notes — all held and folded in
below.** Round 2 independently re-verified round 1's fixes hold (the new SQL is valid and
correctly scoped against the live schema, N1's restoration is correct and citation-accurate, G4
routing confirmed) and caught one new issue of the same class as round 1's B3: the plan called for
asserting `buildPricingRequestNote(...)`'s output, but that function lives in `src/` and no e2e
spec ever imports across that boundary — fixed by using the literal string (already computed and
quoted in this plan) directly, never the function call. The rest are completeness/wording notes,
folded in at their sections.

**Revised after `plan-checker` round 1: REVISE, 3 blocking, 5 notes.** All held, spot-verified,
and folded in below. B1 (rung 2 — the rewritten Test 2 as first drafted was vacuous: the RPC's
dedup guard is permanent and `discover-shop.spec.ts` already fires the identical ask earlier in
file order, so the message would pre-exist and my assertions would pass on someone else's write)
required a new fixture helper, added below. B2 (rung 3 — T09's own EARS is literally
unsatisfiable without also touching `discover-shop.spec.ts`, a file TICKETS.md doesn't name) was
put to Muskan directly rather than resolved unilaterally — **ruled: widen T09 to include it**,
recorded below. B3 (rung 3 — a dangling import left after deleting the export it names, a
straightforward miss) fixed. N1 (rung 4 — I was wrong to drop two assertions that ADR 0006:381
names as the *only* test coverage anywhere for a live invariant; restored) is the most material
note. N2/N3/N4/N5 all folded in at their sections below.

## ⚠️ This is not a mechanical navigation-target swap

TICKETS.md names three files and warns about one specific block in one of them
(`deal-c2c-create.spec.ts:158-170`). Tracing all three files by hand surfaces a bigger problem:
`inbox-accept.spec.ts`'s second test doesn't just navigate to a deleted page — its entire premise
was obsoleted by **T02** (an earlier, already-closed ticket), independent of T06/T07. And that
same T02-caused break exists a second time, in a file TICKETS.md never named at all.

Verified directly against the live RPC and its own doc comment
(`src/app/discover/actions.ts:120-127`, `requestProductPricing`; re-confirmed independently by
`plan-checker` against `supabase/migrations/20260903130000_request_product_pricing_c2c.sql`):
when the asking company is **already connected** to the seller, pricing requests create zero
`pending_inbox_item` rows — `is_connected_to_company` routes straight to
`request_product_pricing_c2c`, which posts a person-voiced chat message and "cuts no ticket at
all — there is nothing left to accept between two companies already talking" (the function's own
words). Any test asserting a `pending_inbox_item` row (or an accept flow) for an already-connected
asker is now testing something that cannot happen.

**Two files carry this exact bug**, both traced and confirmed:
- `e2e/inbox-accept.spec.ts`'s Test 2 — TICKETS.md's own declared file, must be fixed here.
- `e2e/discover-shop.spec.ts`'s Test #2 (`:230-247`) — NOT TICKETS.md's declared file. Its own
  gate log entry (`STATE.md`, T02's 2026-09-04 G4) already flagged this exact gap and left it
  open: *"will read red the next e2e run… Either widen T09 or open a sibling ticket."* **Put to
  Muskan directly** (not resolved unilaterally) — **ruled: widen T09.** Fixed here, in File 4
  below, using the same pattern as `inbox-accept.spec.ts`'s Test 2.

## File 1 — edit `e2e/deal-lands-in-c2c-chat.spec.ts`

Unchanged from round 1 — `plan-checker` verified this fix independently and it holds. Test 2
(`:230-300`) already carries a DB-level proof immediately adjacent to the UI block that needs
removing: `expect(countTicketsForCard(cardId)).toBe(0)` at `:275`. The block at `:282-295`
(navigate to `/connect/inbox`, wait for load, click the "Deal tickets" lens, assert its
empty-state string and the product name's absence) proves nothing the DB assertion four lines
earlier doesn't already prove, more precisely.

**Delete `:282-295` outright.** Nothing replaces it. Update the module-header comment — **both**
`:10-13` (AC 2's "implied by" clause, `plan-checker` N5a: it currently says "absent from the
inbox lens," which is no longer true — the absence is now a DB fact) **and** `:14-15` (the
criteria table) to note AC 3 is proven at `:275` alone.

Tests 1 and 3 (`:201-228`, `:312-347`) never touch `/connect/inbox` — untouched.

## File 2 — edit `e2e/deal-c2c-create.spec.ts`

Unchanged from round 1, independently verified. `:158-170` is immediately followed by `:171-173`'s
own DB assertion (`countTicketsForCard(cardId)).toBe(0)`) with a comment already saying it's "the
row fact behind the UI check above." Same redundancy TICKETS.md itself named.

**Delete `:158-170`.** Keep `:171-173` as the sole proof; reword its comment since "the UI check
above" no longer exists — it becomes the primary assertion, not corroboration.

## File 3 — new/extended fixture helpers in `e2e/fixtures/two-company.ts` (`plan-checker` B1)

**The bug B1 caught:** the RPC's dedup guard (`request_product_pricing_c2c.sql:190-200`) is
**permanent** — no expiry, scoped to `(thread, sender's company, product)` — and nothing in `e2e/`
clears a `type='message'` `chat_message` row (`resetPricingRequests()`'s own doc comment: "Deletes
the inbox rows ONLY"; `resetDealData()`'s `RESET_SQL` clears eight deal-pill message types,
`'message'` is not among them). `playwright.config.ts:26` pins `workers: 1`, file order = path
order, so `discover-shop.spec.ts` runs BEFORE `inbox-accept.spec.ts` and already fires this exact
ask (Bob/StonePharm asking GreenLeaf about AUR-1A) in its own Test #2 — by the time either
rewritten test runs, the message may already exist from a DIFFERENT file's test, the RPC dedupes
silently, and an assertion that only checks "the message is visible" passes on someone else's
write, proving nothing about the ask this test just made.

**Fix: a reset helper that clears the specific (company, product) message pair before each test
that needs one, plus a count helper for the file that has no open counterparty page to read the
message off of.** Same idiom as every existing helper here — product resolved by
`supplier_product_code`, company by name, both interpolated raw (same CALLER CONTRACT as
`countPricingRequests`: literal constants only, never runtime-derived strings):

```ts
/**
 * Clear any live c2c pricing-ask message a company already sent GreenLeaf about
 * one product (by supplier_product_code) — the message-layer equivalent of
 * resetPricingRequests(), needed because T02's connected-company path (0027)
 * writes a chat_message instead of a pending_inbox_item, and that message has
 * no existing teardown anywhere in this fixture file. Without this, the RPC's
 * permanent (thread, company, product) dedup guard makes a re-run — or a
 * different spec file asking about the same product first, in a single-worker
 * path-ordered suite — pass vacuously on a message this test never sent.
 * Deletes ONLY this (company, product) message pair on the c2c thread; never
 * touches pending_inbox_item (resetPricingRequests's job) or the thread itself.
 */
export function resetPricingRequestMessage(senderCompanyName: string, productCode: string): void {
  const bin = psqlBin()
  execFileSync(
    bin,
    [
      DB_URL,
      '-v', 'ON_ERROR_STOP=1',
      '-c',
      `delete from public.chat_message cm ` +
        `using public.person p, public.company sc, public.company gl, public.product pr, ` +
        `public.chat_thread t, public.relationship r ` +
        `where cm.sender_person_id = p.id and p.company_id = sc.id and sc.name = '${senderCompanyName}' ` +
        `and gl.name = 'GreenLeaf Cultivation' and pr.company_id = gl.id ` +
        `and pr.supplier_product_code = '${productCode}' ` +
        `and cm.thread_id = t.id and t.type = 'c2c' and t.deleted_at is null ` +
        `and t.relationship_id = r.id and r.deleted_at is null ` +
        `and (r.company_a_id, r.company_b_id) in ((sc.id, gl.id), (gl.id, sc.id)) ` +
        `and cm.type = 'message' and cm.metadata->>'product_id' = pr.id::text`,
    ],
    { encoding: 'utf8' },
  )
}

/**
 * Count the live c2c pricing-ask messages a company sent GreenLeaf about one
 * product — the message-layer equivalent of countPricingRequests(), for a
 * caller with no open counterparty page to read the message off of (e.g.
 * discover-shop.spec.ts, a single-page buyer-only test). Same scoping and the
 * same CALLER CONTRACT (literal constants only).
 */
export function countPricingRequestMessages(senderCompanyName: string, productCode: string): number {
  const bin = psqlBin()
  const out = execFileSync(
    bin,
    [
      DB_URL, '-At', '-c',
      `select count(*) from public.chat_message cm ` +
        `join public.person p on p.id = cm.sender_person_id ` +
        `join public.company sc on sc.id = p.company_id ` +
        `join public.company gl on gl.name = 'GreenLeaf Cultivation' ` +
        `join public.product pr on pr.company_id = gl.id and pr.supplier_product_code = '${productCode}' ` +
        `join public.chat_thread t on t.id = cm.thread_id and t.type = 'c2c' and t.deleted_at is null ` +
        `join public.relationship r on r.id = t.relationship_id and r.deleted_at is null ` +
        `and (r.company_a_id, r.company_b_id) in ((sc.id, gl.id), (gl.id, sc.id)) ` +
        `where sc.name = '${senderCompanyName}' and cm.type = 'message' ` +
        `and cm.metadata->>'product_id' = pr.id::text and cm.deleted_at is null`,
    ],
    { encoding: 'utf8' },
  ).trim()
  return Number(out)
}
```

## File 4 (widened, per Muskan's ruling above) — edit `e2e/discover-shop.spec.ts`

Test #2 (`:230-247`, "criterion 2: a CONNECTED buyer's ask lands as a pricelist_request naming
the product") — Bob/StonePharm is connected to GreenLeaf, so its core assertion
(`countPricingRequests("StonePharm", "AUR-1A")).toBe(1)`) now reads 0, and `pricingRequestNote`
returns `null`. Test #1 (`:217-228`, the UI confirmation only) and Test #3 (`:249-289`, Eva/Bavaria
— NOT connected, still ticket-based) are both unaffected — verified: neither asserts a ticket row
for a connected asker.

**Fix Test #2 only.** Add `resetPricingRequestMessage("StonePharm", "AUR-1A")` at the test's start
(this `describe` runs `serial`, and Test #1 may have already fired the same ask — the reset makes
Test #2 deterministic regardless of Test #1's own side effect, matching this file's existing
comment at `:238-240` acknowledging "Test #1 may already have created it"). Replace the
ticket-row/note assertions with the message-layer equivalents:

```ts
test("#2 — criterion 2: a CONNECTED buyer's ask posts directly to the c2c chat, no ticket (Bob, AUR-1A)", async ({ page }) => {
  resetPricingRequestMessage("StonePharm", "AUR-1A");
  await signInBuyer(page);
  await page.goto(`/discover/${GREENLEAF_ID}`);

  const card = page.getByTestId("product-card").filter({ hasText: "Pedanios 31/1 COS-CA" });
  await card.getByTestId("request-pricing").click();
  await expect(card.getByText(/pricing requested/i)).toBeVisible({ timeout: 15000 });

  // The write proof, now at the message layer (T02, 0027): connected buyers
  // never cut a ticket — exactly one live pricing-ask message, naming the
  // product, posted to the existing c2c thread instead.
  expect(countPricingRequestMessages("StonePharm", "AUR-1A")).toBe(1);
  expect(countPricingRequests("StonePharm", "AUR-1A")).toBe(0);
});
```

**Final import list for `discover-shop.spec.ts`, stated explicitly (corrected after `plan-checker`
N-R2-1):** add `resetPricingRequestMessage`, `countPricingRequestMessages`; **drop
`pricingRequestNote`** — its only call site (old `:245`) is deleted by this fix and nothing else
in the file uses it (`plan-checker` N-R2-1, the mirror image of round 1's B3 in the file B2
widened into). `countPricingRequests` stays (Test #2's new second assertion still uses it; Test
#3 uses it independently). Final line at `:48`:
`import { countPricingRequests, resetPricingRequestMessage, countPricingRequestMessages } from
"./fixtures/two-company";`

Update the `describe` block's own header comment (`:199-213`) to note criterion 2 now proves the
message path, not the ticket path, for a connected asker — the ticket path stays proven for Test
#3's unconnected asker. **Also name the coverage move (`plan-checker` N-R2-4):** the old Test #2
proved D3's note names the product ("true to the seller's eye") via `pricingRequestNote`; that
specific proof no longer exists in this file — it moved to `inbox-accept.spec.ts`'s rewritten
Test 2 (item 2 below), which asserts the exact message text. Not lost, relocated — say so in the
comment rather than leaving a silent gap between the two files' coverage.

## File 5 — edit `e2e/inbox-accept.spec.ts` — the substantial rewrite

### 5a. Delete Test 1 entirely — **range corrected after `plan-checker` N3: `:59-109`, not `:76-109`**

Its standalone doc comment (`:59-75`) is a separate JSDoc block above the test, not part of it —
missing it from the deletion range would leave a comment describing a page that no longer exists
sitting directly above the rewritten Test 2 (the documented-lie class, L-045).

This test's whole purpose was proving `/connect/inbox` doesn't crash on an unhandled
`pending_inbox_item.type` (`connect_person`). That failure mode is now unreachable through any
surviving surface: Discover's `RequestsSection` (`companyRequests.ts:90`) queries with an explicit
allowlist (`.in("type", COMPANY_REQUEST_TYPES)`) that already excludes `connect_person`, and its
own receiver-scoped filter (`:88`) can never match a `connect_person` row regardless — the row
can never reach that surface to crash it in the first place. The equivalent regression for the
surviving badge-lookup mechanism is already covered at the unit level:
`src/app/discover/requestTypeMeta.test.ts:30-40` casts the literal `'connect_person'` and asserts
no throw — `plan-checker` confirmed this test exists and covers the exact class.

**Consequences, traced and handled (corrected after `plan-checker` B3 — the import was missed the
first time):**
- `countPersonRequestsForAlice()` (`two-company.ts:633`) has no other caller anywhere in `e2e/`
  (confirmed via grep, twice — once in round 1, once independently by `plan-checker`). Delete the
  export, including its doc comment (`:627-632`).
- **`inbox-accept.spec.ts:40`'s import of `countPersonRequestsForAlice` must also be removed.**

**Final import list for `inbox-accept.spec.ts`, stated explicitly (corrected after `plan-checker`
round-2 B-R2-1 — round 1 promised this "below" and never delivered it, leaving `countPerson
RequestsForAlice`'s import un-removed and the new helpers un-added).** Replaces the current
`:36-44` block in full:

```ts
import {
  openTwoContexts,
  countActiveRelationshipsForPair,
  countConnectionEstablishedLines,
  countThreadsForPair,
  pricingRequestStatus,
  resetPricingRequests,
  resetPricingRequestMessage,
  countPricingRequestMessages,
} from "./fixtures/two-company";
```

`countPersonRequestsForAlice` out; `resetPricingRequestMessage`/`countPricingRequestMessages` in
(File 3's new helpers); everything else unchanged from the current file.

`plan-checker` weighed a cheaper alternative — leave the unused export in place, since an unused
export is not a compile error and TICKETS.md's "Not in scope" note for this file is narrow. Judged
and rejected: dead code with zero callers is exactly what this project's own rules say to remove
outright once certain, and certainty is established here (two independent greps, zero hits).

### 5b. Rewrite Test 2 (`:111-171`) — a premise swap, not a navigation swap

**Old premise (DEV-83):** an accept between already-connected companies used to silently roll
back. **Unreachable now for pricing specifically** — there is no accept step in this path at all.

**New premise:** a connected buyer's pricing ask posts directly to the c2c chat — no ticket,
nothing to accept — proving T02's actual shipped behavior (previously uncovered by any e2e test,
per T02's own gate log).

**Kept unchanged:** the setup (`resetPricingRequests()`, the connected-pair precondition
`countActiveRelationshipsForPair() === 1`) — **including, explicitly (`plan-checker` N-R2-3),
`relationshipsBefore` (`:123-124`) and `c2cLinesBefore` (`:125`, `countConnectionEstablishedLines()`
captured right there) — both snapshots run BEFORE Bob's ask, exactly where the current file
already has them. The restored assertions in item 4 below compare against these two
pre-ask snapshots, never against a value re-derived after the ask** — re-deriving either would
make N1's restored guard tautological (comparing a post-ask count to itself), silently proving
nothing, which is exactly what N1 was raised to prevent. Also kept: Bob's UI action (find the price-hidden product, click
"Request pricing"), and the UI confirmation (`card.getByText(/pricing requested/i)` — both
branches return `{ ok: true }`, verified, so this doesn't discriminate connected vs. unconnected;
**`plan-checker` N2: name that explicitly in a comment**, since post-T02 this assertion is
satisfied equally by a real write or a silent dedup — it no longer proves what it used to).

**New setup line:** `resetPricingRequestMessage("StonePharm", "AUR-1A")` — File 3's new helper,
same reasoning as File 4's fix. Without it this test is the exact vacuous-pass B1 described.

**Two more stale comments, outside the module-header rewrite already planned (`plan-checker`
N-R2-5):** `:48-53` (the file-level comment above `test.afterEach(resetPricingRequests)`) reads
*"this file is the only place that ACCEPTS one [a `pricelist_request`]… Teardown, not setup, is
what makes the suite repeatable."* After this rewrite, Bob's ask never creates a
`pricelist_request` at all (the RPC path) — the sentence describes a flow this file no longer
exercises, the same documented-lie class (L-045) already named for Test 1's comment. Reword to
state plainly that `resetPricingRequests()` is now a defensive no-op for this file's own tests
(nothing here creates a ticket-type row anymore) but is kept because a *different* spec running
earlier in path order could still leave one, and because `resetPricingRequestMessage` (the new
setup line) is this file's own equivalent for the message-layer row it now creates instead.
**Teardown for the message itself:** `plan-checker` confirmed no spec after this one in path order
reads c2c message counts, so leaving the message live between runs is harmless today — not adding
it to `afterEach`, but naming this explicitly rather than leaving it to be rediscovered.

**Replaced, verified against the live migration:**
1. `pricingRequestStatus("StonePharm", "AUR-1A")` returns `null` (not `"pending"` — no row exists
   to have a status).
2. The message landed where a human would see it: navigate `alicePage` to the GreenLeaf↔StonePharm
   c2c chat (idiom named explicitly per `plan-checker` N5b, since this file has no shared
   `openC2cChat` export — copy the pattern used in `deal-c2c-create.spec.ts:54-58` /
   `deal-lands-in-c2c-chat.spec.ts:252-254`: `goto('/connect/chat')` →
   `getByPlaceholder('Search conversations…').fill('StonePharm')` →
   `getByText('Company chat (C2C)', { exact: true }).first().click()`), assert the exact text is
   visible: **`'Pricing request for "Pedanios 31/1 COS-CA".'` as a hardcoded string literal in the
   test file — corrected after `plan-checker` round-2 B-R2-1: NOT a call to
   `buildPricingRequestNote(...)`.** That function lives in `src/app/discover/pricingRequest.ts`;
   grepped every import in `e2e/` and confirmed no spec imports across the `e2e/`↔`src/` boundary
   (the complete import surface is `@playwright/test`, `@supabase/supabase-js`, `node:*`, and
   `./fixtures/*` — this suite has never crossed that line, and `playwright.config.ts:7-15`
   already needs `PLAYWRIGHT_FORCE_ASYNC_LOADER=1` just to resolve a relative fixture, an untested
   loader path for a cross-boundary `src/` import). The literal was already independently
   confirmed byte-identical to the RPC's `v_body` (`request_product_pricing_c2c.sql:202-207`,
   "mirroring buildPricingRequestNote exactly") — that verification stands; only the assertion's
   *mechanism* changes, from a function call to the same string written by hand.
3. `countPricingRequestMessages("StonePharm", "AUR-1A")).toBe(1)` — File 3's new count helper, the
   DB-level twin of the UI check above (not just one or the other — `plan-checker`'s B1 fix needs
   the reset either way, and having both a UI proof and a DB proof matches this suite's own
   established double-proof idiom, e.g. `deal-lands-in-c2c-chat.spec.ts`'s pill + row-count pair).
4. **Restored, corrected after `plan-checker` N1 (held — the round-1 draft was wrong to drop
   these):** `countActiveRelationshipsForPair() === 1` (unchanged from `relationshipsBefore`) —
   proves no re-mint — **and, restored:** `countThreadsForPair("c2c") === 1` and
   `countConnectionEstablishedLines() === c2cLinesBefore`. The round-1 draft dropped these two
   reasoning "there's no accept anymore, so nothing to check" — **wrong**: the RPC still calls
   `_resolve_or_create_c2c_thread` (`request_product_pricing_c2c.sql:171-186`) and still
   conditionally posts a `connection_established` intro if a NEW thread got created. An
   already-connected pair getting a SECOND c2c thread, or being told "now connected" a second
   time, is a live risk in the NEW mechanism, not a residue of the old one —
   `docs/architecture/adr/0006-deal-draft-lands-in-chat.md:381` names this exact test file as
   *"the only guard on the invariant this slug now writes against."* Removing these two lines
   would have deleted the only test coverage anywhere for a real invariant. Both helpers are
   already imported; restoring them costs two lines.

**Not proven here, not this ticket's job to add:** the c2c thread's dup-guard under CONCURRENT
asks (I-M13) — HEL-90's own tracked gap (filed during T05's build, 2026-09-06), separate and
already recorded. This test proves the single-ask path only, matching what it replaces.

**Module header comment (`:1-34`) rewritten** to state plainly: the DEV-83 regression this file
was built to guard is unreachable for pricing requests as of T02 (an already-connected company
can no longer even attempt the accept path DEV-83 broke); the remaining test proves T02's
replacement behavior directly. The general DEV-83 principle isn't retested here because no live
path still exercises an accept between two already-connected companies for ANY request type —
`connect`/`connect_message` sends are hidden by `ConnectActions`'s own UI once connected, and
`pricelist_request` no longer reaches an accept step either. Named, not silently dropped.

## Not in scope

- Anything about `discover-shop.spec.ts` beyond its Test #2 fix (File 4) — Tests #1/#3 verified
  unaffected, not touched.
- `e2e/fixtures/two-company.ts`'s other exports — only `countPersonRequestsForAlice` (deleted) and
  the two new helpers (added) are touched. Every other helper stays exactly as-is.
- HEL-90 (the pricing-ask dup-guard race under concurrency) — pre-existing, tracked, not this
  ticket's to close.

## EARS criteria — how it's now verified

1. **"When the e2e suite runs after W4, every spec shall pass without navigating to
   `/connect/inbox`."** **Corrected after `plan-checker` N-R2-2 — a plain grep can't return
   zero.** `deal-lands-in-c2c-chat.spec.ts:10`'s own AC-2 criteria-table prose ("the recipient
   reaches it without visiting `/connect/inbox`") legitimately still names the route in an
   English sentence describing what's proven, not a navigation call. Verify with
   `grep -rn "goto(.\+/connect/inbox\|page\.goto('/connect/inbox')" e2e/` (or equivalent, scoped
   to actual navigation calls) — zero hits. Full Playwright run of at least the four touched
   files, plus a broader run to confirm no other spec regressed — now genuinely achievable, since
   `discover-shop.spec.ts`'s own break is fixed too (per Muskan's ruling on B2), not left as a
   known exception the criterion's literal wording couldn't tolerate.

## G4 routing — corrected after `plan-checker` N4

**Round 1 leaned auto-close on file-type grounds (no `.tsx` touched) — that reasoning was right
for PIPELINE §3's carve-outs 1-2, but the applicable carve-out here is #3: "behaviour the written
criteria do not cover."** This plan states outright that TICKETS.md doesn't anticipate the Test-1
deletion or the Test-2 premise swap, widens into a file TICKETS.md doesn't name, and required a
direct ruling from Muskan mid-build (B2) rather than resolving on its own authority. **Routes to
G4, human stop** — not because anything renders (nothing does), but because the scope and
judgment calls in this ticket exceed what an auto-close is meant to wave through.
