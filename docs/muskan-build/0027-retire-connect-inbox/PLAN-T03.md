# T03 · Discover's Requests list carries pricelist requests — PLAN

ADR 0009, D3, D8, I-J4. TICKETS.md T03.
**Revised after `plan-checker` round 1: REVISE, 1 blocking + 5 notes, all folded in below.**

## What changes

`getIncomingConnectionRequests` (`src/app/discover/companyRequests.ts`)
widens its `pending_inbox_item.type` filter to include `pricelist_request`,
alongside `connect`/`connect_message`. TS-only — **no migration, no RLS, no
RPC change.** `accept_connection_request` (the Reused fence) already accepts
`pricelist_request` and already writes its intro copy
(`20260826100000:120,237-239`) — untouched here.

⚠️ **Correction after round 1: this is not purely a "backend/data-shape"
change with no visible effect.** `RequestsSection.tsx:146-160` renders
every element of `companyRequests` today — the moment this ships, pricing
asks appear in the still-"Connection requests"-titled box, unbadged,
visually indistinguishable from a connect request except by `note` text.
Real, if short-lived (same wave as T04, which adds the badge and retitles
the box days/hours later in build order, not calendar time).

## File 1 — `src/app/discover/companyRequests.ts`

1. **Hoist the filter to a named, directly-testable constant — added after
   round 1's note that the filter itself (the entire point of this ticket)
   had zero automated cover:**
   ```ts
   export const COMPANY_REQUEST_TYPES = ["connect", "connect_message", "pricelist_request"] as const;
   export type DiscoverCompanyRequestKind = (typeof COMPANY_REQUEST_TYPES)[number];
   ```
   Use `COMPANY_REQUEST_TYPES` in `.in("type", COMPANY_REQUEST_TYPES)`. A
   filter constant asserted directly (see File 2, new test) does not
   re-create the `COMPANY_INBOX_TYPES` coupling I-M11 warns about — this
   constant has one reader (the query) and one owner (this file), unlike
   the old `inbox-display.ts` map T04/T07 are retiring.

   **Note, not a change:** `src/app/discover/actions.ts:14` already
   declares `PairInboxType = "connect" | "connect_message" |
   "pricelist_request"` — the same three members, write side vs. this
   file's read side. Deliberately kept separate (different concerns, and
   `actions.ts`'s union also has to reject "which type does a given user
   action produce" logic this file has no reason to share) — noted so the
   next reader doesn't take the duplication for an oversight.
2. Add `type` to the `.select()` string (currently selects neither `type`
   nor anything naming it) and to both `Row` and `DiscoverCompanyRequest`
   (typed `DiscoverCompanyRequestKind`, not `T04`'s not-yet-built
   `DiscoverRequestKind` — TICKETS.md itself says T04 "depends on T03
   (needs the type field)").
3. **I-J4 comment — corrected after round 1 caught the plan's own draft
   citing the wrong count.** `inbox_request_type` seeds **five** codes, not
   four: `connect`, `connect_message`, `pricelist_request`, `deal_card`
   (`20260607090001:36-39`), **and `connect_person`**
   (`20260724100100_inbox_person_target.sql:22`, added later). The filter
   excludes two, for two different reasons — the comment must name both:
   - `deal_card` — a ticket of this type means something different (D1/T01
     already made it practically unreachable; this list is specifically
     "someone awaits consent from a company they haven't spoken to", ADR
     I-J2) and must never appear here even if a row existed.
   - `connect_person` — a different graph and a different accept RPC
     (`accept_person_connection`,
     `20260724100400_accept_person_connection.sql`), rendered by
     `incomingPersonRequests.ts`/`DiscoverPersonRequest` instead. **True by
     construction, doubly:** `20260724100100:29` made
     `receiver_company_id` nullable specifically because a `connect_person`
     row carries `receiver_person_id` instead, so this query's own
     `.eq("receiver_company_id", companyId)` can never match one regardless
     of the `.in("type", ...)` filter. No code change needed for this
     exclusion — the comment just owes the next reader the reason.
4. **D8 — do NOT add `metadata` to the select, do NOT join `product`.** The
   product name already rides in `note` (`buildPricingRequestNote`'s
   output) and is already rendered wherever this row's `note` is shown.
5. Update the function's docblock (`:3-11`) to name all three included
   types, not just `connect`/`connect_message`.

## File 2 — `src/app/discover/companyRequests.test.ts`

⚠️ **Round 1 caught a compile-breaking gap: adding `type` as a required
field breaks every existing call site that constructs a `Row` or
`DiscoverCompanyRequest` literal, not just the ones whose *expected output*
changes.** All three existing `mapCompanyRequestRow({...})` **input**
literals (`:17-20`, `:27-30`, `:36-39`) need `type` added — not just the
assertions on their output.

New cases:
- `pricelist_request` row maps `out.type === "pricelist_request"`.
- Existing `connect`/`connect_message`-shaped inputs (if the pure mapper
  test doesn't already vary `type`, add one case per value) map their type
  through unchanged.
- **Assert the filter constant directly**, per round 1's fix for the
  "zero automated cover on the actual change" note:
  ```ts
  expect(COMPANY_REQUEST_TYPES).toContain("pricelist_request");
  expect(COMPANY_REQUEST_TYPES).not.toContain("deal_card");
  expect(COMPANY_REQUEST_TYPES).not.toContain("connect_person");
  ```
  This is what actually proves the ticket's own point — the mapper-passthrough
  cases alone would stay green even if a builder forgot to widen the `.in(...)`
  filter at all.

## File 3 — `src/app/discover/sections/RequestsSection.test.tsx`

⚠️ **Blocking gap round 1 found, not in TICKETS.md's own file list —
adding this file to T03's scope is required to keep `tsc --noEmit` clean,
not optional polish.** `:15-18` constructs a `DiscoverCompanyRequest`
literal (`companyReq`) with no `type` field. Add
`type: "connect_message"` (matching its `note: 'Let us connect'` — a
connect_message shape) to that literal. No other change to this file — it
tests rendering, not filtering, and T03 adds no new render behavior (T04
does).

## File 4 — `supabase/tests/accept_connection_request_status_guard_test.sql`

⚠️ **I-M9's "already covered" claim was wrong on inspection — round 1
caught it.** The original plan cited case D3/AC2 (correct location:
`:455-486`, not `:346-484` as first drafted) as proving I-M9 ("producing a
c2c thread, a p2p thread and the pricelist intro message"). On re-check:
`:460-462` resolves `c2c_thread_id` into `_hel68_ac2pl` but **the DO block
never asserts it** — only the p2p thread (`:471-479`) and the intro body
(`:481-485`) are checked. The behavior is fine (`accept_connection_request`
resolves c2c unconditionally, `20260826100000:206-207`, outside the
type-conditional branch at `:215`) — this is a missing assertion, not a
bug — but I-M9 is a locked ADR invariant and deserves a real check, not a
citation that turns out to test something adjacent.

Fix: add a c2c-thread assertion to the existing D3/AC2 DO block (~3 lines,
mirroring the existing p2p assertion's shape at `:471-479`) — resolve one
live `type = 'c2c'` row on the relationship and assert it's non-null and
matches `_hel68_ac2pl`. This edits a test file, not the fenced function —
I-J3 ("the fence held... if a build ticket edits it, the design was wrong")
is untouched either way. Scope growth of the allowed kind (ADR §9: "keeps
the shipped system correct"), not a new-design addition.

**Not fixed, and explicitly out of scope:** the D3/AC2 fixture accepts
`pricelist_request` onto a pair that was **already connected** earlier in
the same transaction (a `connect` item accepted first, D1/AC1,
`:376-378`) — so this case exercises the **adopt** branch for both the
relationship and the c2c thread, not a genuinely never-connected pair.
Every `pricelist_request` case in this suite runs on that same seeded pair.
A pricelist_request accepted on a truly fresh pair is untested anywhere in
this repo. This is a real gap, but it is **not new to T03** (the suite
predates this ticket and the gap is in `accept_connection_request`'s own
test coverage, not in anything T03 touches) — flag it for Muskan, do not
expand this ticket to build a new fixture pair for it.

## Not in scope

`requestTypeMeta.ts`, the badge, the "Requests" retitle — D4/D9/D10, T04,
not this ticket. `accept_connection_request`'s own body — Reused, untouched.

## Verification after builder runs

- `npx tsc --noEmit` clean — **now genuinely provable**, with all three
  literal-construction sites (companyRequests.test.ts ×3,
  RequestsSection.test.tsx ×1) updated.
- `companyRequests.test.ts` — all cases green, including the new `type`
  passthrough cases and the `COMPANY_REQUEST_TYPES` membership assertions.
- `RequestsSection.test.tsx` — unaffected render assertions still pass.
- `bash supabase/tests/run_accept_connection_request_status_guard_test.sh` —
  PASS, including the new c2c-thread assertion in D3/AC2 (must be
  RED-first against the unmodified suite — the assertion should fail if
  temporarily reverted, proving it isn't vacuous).
- Manual/replay check: confirm a live `pricelist_request` row from an
  unconnected company appears in `getIncomingConnectionRequests`'s result
  with `type: "pricelist_request"`; confirm `deal_card`/`connect_person`
  rows (if any exist in fixture data — none do for `deal_card` per
  TICKETS.md, so this is a code-reading check for that type, a live check
  for `connect_person` if seed data has one) do not appear.
