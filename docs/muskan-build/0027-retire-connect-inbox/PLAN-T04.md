# T04 · Every request row shows a type badge; the box is retitled — PLAN

ADR 0009, D4, D9, D10, I-M10, I-M11, I-M16. TICKETS.md T04. Depends on T03 (live — `type` is on
`DiscoverCompanyRequest`).

**Revised after `plan-checker` round 1: REVISE, 3 blocking + 5 notes.** B1 and B2 spot-verified
and held — folded in as File 5 and File 6 below. B3 did **not** hold on spot-verification: it
claimed `"connect_person" as DiscoverRequestKind` raises `TS2352` and needs `as unknown as`
first. Tested directly against this repo's own `tsc --strict` (bypassing the `rtk` hook per
HEL-80 — `node node_modules/typescript/bin/tsc`, not `npx tsc`, which the hook silently rewrites
and which returned a fabricated "TypeScript compilation completed" with no diagnostics at all): a
direct literal-to-disjoint-literal cast within the same base type (`string`) compiles clean under
`--strict`, while a genuinely cross-type cast (`5 as string`) does raise `TS2352` in the same run
— confirming the test harness itself catches real errors. File 3's cast form is unchanged from the
original draft. N1, N2, N4, N5 held and are folded in; N3 is a "name it" note, folded into
Verification, not a code change.

## What changes

Two files. A new pure data module, `requestTypeMeta.ts`, maps a small presentation-only union to
a badge (label/icon/accent). `RequestsSection.tsx` renders that badge on every row — stacked above
Accept/Decline, not next to the avatar (D4: "grouped with the decision rather than the identity")
— and the box title changes from "Connection requests" to "Requests" (D9).

**Why a new union instead of reusing anything.** `DiscoverCompanyRequestKind` (T03) has 3 members
and no `"person"` — person rows need a badge too (D10), and person rows don't carry a DB `type` at
all (`DiscoverPersonRequest` has no `type` field; there's nothing to badge them BY except "this is
a person row"). `InboxRequestType` (the retired module's union) is out per the ticket text — it's a deliberate
4-member subset of the DB's `inbox_request_type` enum (`connect_person` excluded by design,
`src/modules/connect/types.ts:20-39`), and `COMPANY_INBOX_TYPES` derives a *filter* from its keys
(`inbox-display.ts:58-60`); importing it here would let a future edit to this file silently widen
a query filter it has no business touching (I-M11).

## File 1 — new `src/app/discover/requestTypeMeta.ts`

```ts
import { Link2, MessageSquare, ReceiptText, User, type LucideIcon } from "lucide-react";

export type DiscoverRequestKind = "connect" | "connect_message" | "pricelist_request" | "person";

export type RequestTypeBadge = { label: string; icon: LucideIcon; accent: string };

const REQUEST_TYPE_BADGE: Record<DiscoverRequestKind, RequestTypeBadge> = {
  connect: { label: "Connection", icon: Link2, accent: "text-ink/55" },
  connect_message: { label: "Message", icon: MessageSquare, accent: "text-info" },
  pricelist_request: { label: "Pricelist request", icon: ReceiptText, accent: "text-brand-deep" },
  person: { label: "Person", icon: User, accent: "text-info" },
};

const FALLBACK_BADGE: RequestTypeBadge = { label: "Request", icon: User, accent: "text-ink/55" };

export function requestTypeBadge(kind: DiscoverRequestKind): RequestTypeBadge {
  return REQUEST_TYPE_BADGE[kind] ?? FALLBACK_BADGE;
}
```

⚠️ **The `?? FALLBACK_BADGE` is not dead code, even though `tsc` proves `kind` can't be outside
the 4 members from any call site in this repo today.** I-M10 names the exact precedent:
`REQUEST_TYPE_META[item.type]` in the now-deleted `inbox-display.ts` was ALSO a closed `Record`
indexed by a closed union, and it still returned `undefined` and crashed the page — because the
value reaching it at runtime came from a DB row, and `tsc` cannot see that the DB's enum had grown
a member the union didn't. The union here is smaller and hand-picked rather than DB-sourced, which
makes that specific failure less likely, not impossible — a future ticket widening
`COMPANY_REQUEST_TYPES` (T03's constant) without updating this map is exactly the same shape of
drift. The fallback is what makes I-M10's "no badge lookup returns `undefined`" true regardless of
whether the two stay in sync; the `Record` type is a compile-time aid, not the thing the invariant
is actually about. **I-M11 check:** this file exports no list of keys and no filter constant —
nothing here can be used to derive a query filter, unlike `COMPANY_INBOX_TYPES`.

**Icon note:** all four icons already ship in `lucide-react` (`^1.17.0`, confirmed in
`node_modules/lucide-react/dist/lucide-react.d.ts`) — `Link2`/`MessageSquare`/`ReceiptText` are
carried over unchanged from the retired `inbox-display.ts` badge copy; `User` is new, for the
person kind D10 requires.

## File 2 — `src/app/discover/sections/RequestsSection.tsx`

1. **Line 134 (D9):** `title="Connection requests"` → `title="Requests"`.
2. Import `requestTypeBadge`, `type DiscoverRequestKind`, **and `type RequestTypeBadge`** (N1 —
   the original draft used `RequestTypeBadge` in the `Badge` component's prop type below without
   importing it, which does not compile) from `../requestTypeMeta`.
3. New presentational `Badge` component (colocated, this file is its only reader):
   ```tsx
   function Badge({ label, icon: Icon, accent }: RequestTypeBadge) {
     return (
       <span
         className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-black/[0.03] px-2 py-0.5 text-[10px] font-bold ${accent}`}
       >
         <Icon className="h-3 w-3" />
         {label}
       </span>
     );
   }
   ```
   Sizing/pill shape matches the existing badge convention already in this surface
   (`CompaniesSection.tsx:380`, `rounded-full … text-[10px] font-bold … ring-1`) — no new visual
   language introduced, one accent colour swaps by kind instead of a static one.
4. **`Row` gains a `kind: DiscoverRequestKind` prop.** Replace the current
   `<Actions busy={busy} onAccept={onAccept} onDecline={onDecline} />` (the entire right-hand
   block) with:
   ```tsx
   <div className="flex shrink-0 flex-col items-end gap-1.5">
     <Badge {...requestTypeBadge(kind)} />
     <Actions busy={busy} onAccept={onAccept} onDecline={onDecline} />
   </div>
   ```
   This is D4's "stacked above Accept/Decline" — the badge moves into the same right-hand column
   as the decision buttons, not beside the avatar/name on the left.
5. **Call sites.** Company row: `kind={c.type}` (`DiscoverCompanyRequestKind` is a structural
   subtype of `DiscoverRequestKind` — same 3 literal strings — so this passes `tsc` with no cast).
   Person row: `kind="person"` (constant; `DiscoverPersonRequest` needs no new field — confirmed
   per ADR's application table note, there is nothing row-specific to pick a badge FOR a person
   row, it is always "Person").

## File 3 — new `src/app/discover/requestTypeMeta.test.ts`

Pure-function unit tests, no rendering:
- All 4 kinds (`connect`, `connect_message`, `pricelist_request`, `person`) resolve to a badge
  with a non-empty `label` and a defined `icon`.
- **I-M16:** `requestTypeBadge("pricelist_request").label === "Pricelist request"` — the exact
  literal, asserted directly (the ADR calls this a stronger claim than I-M10's "not undefined").
- **I-M10, defense-in-depth case (mirrors the historical `connect_person` crash, L-050's
  decoy-fixture shape):** cast an out-of-union string through — e.g.
  `requestTypeBadge("connect_person" as DiscoverRequestKind)` — and assert the result is still
  defined with a non-empty `label`, never `undefined`. This is the one case `tsc` cannot prove
  either way; it is the actual regression test for the crash the ticket cites. (Cast form
  confirmed to compile as written under this repo's `tsc --strict` — see revision note at top.)
- **I-M11, made machine-checkable (N2):** assert this module's export surface directly —
  `expect(Object.keys(requestTypeMetaModule)).toEqual(['requestTypeBadge'])` (or equivalent,
  importing `* as requestTypeMetaModule`) — so a future edit that exports a keys-derived filter
  list (the exact `COMPANY_INBOX_TYPES` shape I-M11 exists to prevent) fails this test, not just
  a design-review read.

## File 4 — `src/app/discover/sections/RequestsSection.test.tsx`

1. Existing assertion `expect(html).toContain('Connection requests')` → `'Requests'` (D9).
2. Existing `companyReq` fixture is `type: 'connect_message'` already (T03 added this) — its badge
   label is "Message"; add `expect(html).toContain('Message')` to the existing render test.
3. **New case, proving D10 + I-M16 together:** a second company request of
   `type: 'pricelist_request'`, rendered alongside the existing fixtures. Assert
   `expect(html).toContain('Pricelist request')` (I-M16's literal) and
   `expect(html).toContain('Person')` (the existing `personReq` row's badge — D10, person rows
   badged too). One new `it()` block, not a rewrite of the existing smoke test — keeps the
   "renders + has Accept/Decline" test focused on what it already tests.
   ⚠️ **N4 — these are whole-document substring checks, not row-bound.** They would still pass if
   a badge rendered on the wrong row. Kept as page-wide checks (a stronger row-scoped assertion
   needs a DOM query library this test file doesn't otherwise use), but pin the new fixture's
   `note` so it cannot itself contain any badge label string — confirmed no collision today
   (`buildPricingRequestNote` emits `Pricing request for "X".`, `src/app/discover/
   pricingRequest.ts:42-46`) — so a `toContain('Pricelist request')` false-positive from the
   `note` text rather than the badge is not currently possible; note this constraint in the test
   file's own comment so it doesn't silently break later.

## File 5 — `src/app/discover/DiscoverShell.test.tsx` (B1, folded in — not in TICKETS.md's list)

⚠️ **`plan-checker` round 1 caught a compile-clean-but-red gap the original draft missed
entirely.** `DiscoverShell` renders `<RequestsSection>` and this file's one render test asserts
`expect(html).toContain('Connection requests')` (`:26`) — D9's retitle turns it red. Fix: change
the string to `'Requests'`. Same shape as T03's own round-1 finding (a file outside the ticket's
stated list, compile-passing but assertion-breaking) — folded in for the same reason (ADR §9:
"scope growth of the allowed kind... keeps the shipped system correct").

## File 6 — `e2e/discover.spec.ts` (B2, folded in — owned by neither T04 nor T09)

⚠️ **Two Playwright assertions hardcode the old title and are not in any ticket's named scope.**
T09 (`TICKETS.md`) names only `inbox-accept.spec.ts`, `deal-lands-in-c2c-chat.spec.ts`,
`deal-c2c-create.spec.ts` — `discover.spec.ts` is untouched by anything else in this slug.
`getByRole("heading", { level: 2, name: "Connection requests" })` (`:43`) is a **substring**
match against the rendered `<h2>` (`SectionCard.tsx`'s title, per Playwright's default
case-insensitive substring semantics for `name`) — once the title reads "Requests", the string no
longer contains "Connection requests" and the assertion fails outright.
`sectionByHeading(page, "Connection requests")` (`:53`) fails the same way, and the empty locator
that results makes `boundingBox()` return `null`, failing the same test's later assertions too.

**Why folded in rather than flagged for a ruling (unlike T02's `discover-shop.spec.ts` gap,
`STATE.md:193-198`):** that gap needed a judgment call — re-express a retired behavior as a new
assertion, or drop the block. This one is mechanical — the exact same one-word string swap this
ticket is already making at `RequestsSection.tsx:134` and `DiscoverShell.test.tsx:26`, just also
needed in the two e2e lines that hardcode the pre-D9 title. Change both string literals in
`e2e/discover.spec.ts` (`:43`, `:53`) from `"Connection requests"` to `"Requests"`. No other
change to this file — the layout/geometry assertions in the same tests are unaffected by a title
change.

## Not in scope

`RequestsSection.tsx`'s accept/decline wiring, `SectionCard`, `companyRequests.ts`,
`incomingPersonRequests.ts` — untouched. No migration, no RLS, no RPC — this ticket is TS + one
new pure module. **Correction after round 1:** the file set is TICKETS.md's own list
(`src/app/discover/sections/RequestsSection.tsx`, new `src/app/discover/requestTypeMeta.ts`,
"+ tests") **plus two title-string call sites `plan-checker` found that TICKETS.md's list
missed** (Files 5-6) — the same shape as T03's own round-1 finding, not a scope expansion beyond
D9's actual blast radius. `inbox-display.ts`
and the rest of the retired `/connect/inbox` module are T07's, not touched here — this ticket does
not delete anything, only adds a badge and retitles a box.

## Verification after builder runs

⚠️ **Run `tsc`/`vitest` via `node node_modules/<pkg>/bin/<bin>` or the project's own npm scripts,
not a bare `npx`/`tsc` invocation** — the `rtk` hook rewrites and collapses output for exactly
these commands (confirmed above, HEL-80) and can report a clean pass that isn't real.

- `tsc --noEmit` clean (real binary, not `npx`).
- `requestTypeMeta.test.ts` — all cases green, including the out-of-union cast case (I-M10) and
  the export-surface case (I-M11, N2).
- `RequestsSection.test.tsx` — all cases green, including the new pricelist/person badge case.
- `DiscoverShell.test.tsx` — green with the updated title string (File 5).
- Full unit suite — total test count should rise by exactly the new cases added here (no
  unrelated count drift, mirroring L-061's proof technique used in T07's own plan).
- `e2e/discover.spec.ts` — both title-bearing assertions and the geometry test still pass (File
  6); geometry itself is unaffected by the title-string change.
- **G4 human-look list (this ticket renders, so it stops at G4 per PIPELINE §3 — not an
  auto-close):**
  - confirm all three company kinds and a person row each show a distinct, correctly-labelled
    badge stacked above Accept/Decline in a real render;
  - **N3 — name, don't fix:** `SectionCard` pins the Requests|My Network duo to a fixed height
    (`md:h-[320px]`) with internal scroll. Stacking a badge above Accept/Decline makes every row
    taller, so fewer rows are visible before scrolling than before this ticket. No test breaks
    (the duo's equal-height e2e assertion holds regardless of row count), but it's a real,
    visible density change worth a look, not a silent side effect.
