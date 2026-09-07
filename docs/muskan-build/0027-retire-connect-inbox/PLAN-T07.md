# T07 · Retire the `/connect/inbox` route and module — PLAN

ADR 0009, D6, D11, I-M8, I-M14. TICKETS.md T07. Depends on T03 (live) + T05's checkpoint
(satisfied — see T06's own re-confirmation). Parallel-safe with T08 (verified disjoint below).

**Revised after `plan-checker` round 1: REVISE, 0 blocking, 7 notes, two of which contradicted
governing documents and are held below.** N2 (the ADR's own file-list table explicitly says
`inbox.ts`'s `deal_card` branch is deleted — my original plan wrongly left it, citing a
"file-list discipline" that doesn't exist for this file; spot-verified directly against
`adr/0009-retire-connect-inbox.md:256,278-280` before folding in) and N1 (this ticket touches
seven `.tsx` files — PIPELINE §3 routes by the diff, not by reachability, and this slug's own
gate log confirms it: T01/T02/T03/T05/T06 auto-closed and none touched a `.tsx`; T04 stopped at
G4 specifically because it did) are both held and change this plan materially — see File 8 and
"G4 routing" below. N3 (a wrong justification, right conclusion), N4/N5 (doc-comment/stale-prose
cleanup), N6/N7 (name the real changes, assign verification ownership) all held and folded in.

## What TICKETS.md names, and what it doesn't

TICKETS.md's own warning is accurate and worth taking literally: *"The delete list does not
compile as-is, and resolving that is this ticket's real work."* It names three specific traps
(the `COMPANY_INBOX_TYPES`/six-type imports at `inbox.ts:15-23`, `acceptItem`/`declineItem`'s
`getInbox()` returns, `acceptInbox`'s brace-unbalance risk at `store.ts:574-586`). Tracing the
full dependency graph by hand (every importer of every file on the delete list, read directly —
not assumed) surfaces **two more compile-breaking chains it does not mention**, both consequences
of files it DOES already name for deletion:

1. **`claimItem`/`assignItem` in `supabase/inbox.ts` become orphaned.** Both call `getInbox()`
   internally (`:242`, `:257`) and their ONLY caller anywhere in `src/`/`e2e/` is
   `InboxView.tsx:158,161` — a file already on TICKETS.md's own delete list. Once `InboxView.tsx`
   is gone, these two functions have zero callers and still reference the about-to-be-deleted
   `getInbox`. TICKETS.md's D11 note names `acceptItem`/`declineItem` explicitly but says nothing
   about `claimItem`/`assignItem` — confirmed via `grep`, not assumed.
2. **`dealPreviewOf`/`DealCardEmbed`/`money` in the same file become orphaned.** All three exist
   solely in service of `getInbox`'s display projection (`dealPreviewOf` is called only at
   `:200`, inside `getInbox`; `money` is called only inside `dealPreviewOf`). `dealPreviewOf`'s
   signature also returns `InboxDealCardPreview`, imported from `@/modules/connect/types` — a
   file on the delete list. Even "just leave it, it's harmless" doesn't compile: the import
   itself resolves to a deleted module.

Both are named here, not smuggled in — `plan-checker` and `critic` should verify the reasoning
independently, same discipline as T06's P1-P3 port.

## File 1 — delete `src/app/connect/inbox/page.tsx`

Only importer of `@/modules/connect` (the barrel) anywhere in `src/`/`e2e/` — confirmed via grep.
Deleting both together is self-contained.

## File 2 — delete `src/modules/connect/index.ts` (the barrel)

## File 3 — delete `src/modules/connect/types.ts`

Confirmed via grep: every remaining importer of this file (`InboxView.tsx`, `LensTabs.tsx`,
`InboxDetail.tsx`, `InboxRow.tsx`, `InboxList.tsx`, `AssignMenu.tsx`, `lenses.ts`,
`inbox-display.ts`) is itself on this ticket's delete list, **except** `supabase/inbox.ts` — see
File 8 below for exactly what that file needs trimmed as a result.

## File 4 — delete `src/modules/connect/lib/inbox-display.ts`

Its only importers (`supabase/inbox.ts`, `InboxDetail.tsx`, `InboxRow.tsx`) are covered: the
latter two are deleted outright (File 6), `supabase/inbox.ts` loses its one import of this file
(`COMPANY_INBOX_TYPES`) as part of File 8's trim.

## File 5 — delete `src/modules/connect/lib/lenses.ts` and `lib/lenses.test.ts`

**`lenses.test.ts`'s deletion is dispatched to `test-writer`, not `builder`** — per L-035, test
files are `test-writer`'s exclusive domain even for a pure, uncontested deletion tied to its
subject going away (same pattern as T06's four SQL test-file deletions). `builder` deletes
`lenses.ts` itself (a source file) in the same pass as the other module files.

`lenses.test.ts` currently holds **4 tests** — confirmed by running `vitest run` on the file
alone, not a grep heuristic (a `it(`/`test(` count can miss `.each` variants or match comments).
Current full-suite baseline is 514 (T01-T06 all independently confirmed this number) — EARS-3
expects exactly **510** post-T07.

## File 6 — delete the six components

`src/modules/connect/components/{InboxView,LensTabs,InboxList,InboxRow,InboxDetail,
AssignMenu}.tsx`. Confirmed via grep: nothing outside `src/modules/connect/` imports any of these
by path (only `page.tsx` reached `InboxView` via the barrel, already covered by File 1/2).

## File 7 — keep `lib/requestActionError.ts` + `lib/requestActionError.test.ts`

Three external readers confirmed via grep: `RequestsSection.tsx`, `discover/actions.ts`,
`discover/personActions.ts` (plus its own test and `InboxView.tsx`, which is being deleted —
losing that one caller is fine, the other three keep it alive).

**One stale comment to fix (`plan-checker` N5):** `:7` currently reads *"keeps the two surfaces
that call accept (the Connect inbox and the Discover requests list) from each inventing their own
wording"* — after this ticket there is exactly one surface. Reword to drop the now-false "two
surfaces" framing (e.g. "keeps Discover's requests list from inventing its own wording" — or note
in passing that this used to also cover the retired Connect inbox, if that history is worth
keeping for context). No other change to either file.

## File 8 — edit `src/modules/connect/supabase/inbox.ts`

**Delete, as a consequence of Files 1-6 (traced above, not separately declared by TICKETS.md) —
every range below includes its own doc comment, not just the code (`plan-checker` N4):**
- The `import { COMPANY_INBOX_TYPES } from "@/modules/connect/lib/inbox-display";` line (`:15`).
- The entire `import type { InboxDealCardPreview, InboxItemView, InboxRequestType, InboxStatus,
  TeamMember, ViewerContext } from "@/modules/connect/types";` block (`:16-23`) — every member is
  used only by functions this ticket deletes; confirmed member-by-member below.
- `getViewerContext`, including its doc comment (`:100-109`, uses `ViewerContext`).
- `getAssignableMembers`, including its doc comment (`:111-128`, uses `TeamMember`).
- `getInbox`, including its doc comment (`:130-204`, uses `InboxItemView`/`InboxRequestType`/
  `InboxStatus`/`COMPANY_INBOX_TYPES`/`dealPreviewOf`).
- `DealCardEmbed` type, including its doc comment (`:51-65`), and `dealPreviewOf`, including its
  doc comment (`:67-98`) — orphaned once `getInbox` is gone (only caller), and `dealPreviewOf`'s
  own signature returns the about-to-be-deleted `InboxDealCardPreview`.
- `money`, including its doc comment (`:45-49`) — orphaned once `dealPreviewOf` is gone (only
  caller).
- `claimItem`, including its doc comment (`:234-243`), and `assignItem`, including its doc
  comment (`:245-258`) — orphaned once `InboxView.tsx` (only caller, File 6) is gone; both also
  call the about-to-be-deleted `getInbox`.

**Keep, unchanged (still have live callers after the trim above):** `personInitials`,
`companyInitials`, `one<T>()` — all three are called from `getViewerIdentity` and/or `acceptItem`,
which stay. `getViewerIdentity` itself stays, untouched.

**Delete `acceptItem`'s `deal_card` early-return branch, `:313-322` (its two "skip Sella" comment
lines plus the whole `if` block) — corrected after `plan-checker` N2.** The original draft of
this plan left this branch in place, reasoning it wasn't named for removal — wrong: the ADR's own
file-list table (`0009-retire-connect-inbox.md:256`) explicitly instructs *"`deal_card` branch at
`:315` deleted"* in the same row as the D11 return-type change, and its "Not touched, deliberately"
list (`:278-280`) names only `connect_person`, `send_deal`, and `accept_connection_request`'s
body — not this. Delete lines `:313-322` (the "A deal-ticket accept opened NO new threads…skip
Sella entirely" comment plus the `if (item.type === "deal_card") { … return getInbox(); }` block)
outright; lines `:309-312` (the general Sella-rewrite context comment) stay and now flow directly
into the `try { await supabase.functions.invoke("sella-intro", …) }` block that follows.

**Modify per D11 — `acceptItem`/`declineItem` become `Promise<void>`:**
- `acceptItem`'s signature: `Promise<InboxItemView[]>` → `Promise<void>`. Its final
  `return getInbox();` (`:346`) becomes `return;` (or is simply dropped, since it's the last
  statement in an `async function ... : Promise<void>`).
- `declineItem`'s signature: same change. Its `return getInbox();` (`:357`) becomes `return;`.

Its only caller, `RequestsSection.tsx:122` (`await (action === "accept" ? acceptItem(id) :
declineItem(id))`), already discards the return value — confirmed via direct read, matches D11's
own claim.

**Fix two stale comments left behind by the trim (`plan-checker` N5):**
- `:5-9` (the file's own header doc comment) currently reads *"Returns the exact `InboxItemView`
  / `TeamMember` / `ViewerContext` shapes the components already consume, so the swap is just an
  import change in `InboxView`"* — three now-deleted types and a now-deleted component. Rewrite
  to describe what the file does post-trim: resolves the viewer's identity and runs the
  accept/decline writes against `pending_inbox_item`; no longer reads the inbox queue itself.
- `:287-289` (inside `acceptItem`, immediately above the `acceptInbox(...)` call) currently reads
  *"create relationship + threads + seed lines — EXCEPT for a deal ticket (type 'deal_card'),
  where acceptInbox instead claims the EXISTING deal via `claim_deal_ticket`"* — File 9 deletes
  that branch from `acceptInbox` and T06 already dropped `claim_deal_ticket` from the database;
  the sentence describes a path that no longer exists anywhere. Simplify to describe the one
  remaining path: create/adopt the relationship + threads + seed lines via `accept_connection_
  request`, unconditionally.

## File 9 — edit `src/modules/messaging/supabase/store.ts`

Delete the **full** `if (input.requestType === "deal_card") { ... }` block, lines **574-586
inclusive** — not just its body (`:577-585`), which is exactly the unbalanced-brace trap
TICKETS.md warns about. After deletion, every accept (including a hypothetical future
`deal_card`-typed one, which can no longer occur) falls straight into the general
relationship-mint path below it.

**Not touched, deliberately out of scope:** `messaging/types.ts`'s `AcceptRequestType` union
still lists `"deal_card"` as a literal, and `AcceptInput.dealCardId` still exists. Neither is
named in TICKETS.md's file list for T07. Leaving them is the same class of decision as T06 leaving
`database.types.ts`'s two stale RPC entries for a later ticket.

**Corrected reasoning after `plan-checker` N3 — the original justification was wrong, though the
conclusion holds.** The original draft claimed `connect/types.ts`'s `InboxRequestType` is "the
only producer" of the `"deal_card"` string, so deleting it closes off the type. False:
`messaging/types.ts:271-275` declares `AcceptRequestType` as its own **independent** local copy
that lists `"deal_card"` itself (the file's own docblock says so — "Deliberately a local copy of
connect's `InboxRequestType`" — precisely so messaging never imports connect's types), and
`acceptItem` builds the value via an unchecked cast, `item.type as AcceptRequestType`
(`inbox.ts:292`), not through anything `connect/types.ts` gates. Deleting `InboxRequestType`
changes nothing about what the type system permits here. **The real reason a
`"deal_card"`-typed `AcceptInput` can never be constructed again:** T01 removed the only producer
of a `deal_card`-type `pending_inbox_item` row, T05 backfilled every existing one to `accepted`,
T03's `COMPANY_REQUEST_TYPES` filter (`companyRequests.ts:28`) already excludes `deal_card` from
what Discover surfaces, and T06 dropped the RPC the (now-also-deleted) branch called. Four
independent facts, none of them `InboxRequestType`'s deletion.

## File 10 — edit `next.config.ts`

Add one entry to the existing `redirects()` array (do **not** create a second `redirects()`
function — there is already exactly one, holding the `/account`/`/team` SET-01 redirects):

```ts
async redirects() {
  return [
    { source: "/account", destination: "/settings/profile", permanent: true },
    { source: "/team", destination: "/settings/organization/team", permanent: true },
    // /connect/inbox retires with this route/module (0027, ADR 0009 D6) — the
    // page and every request type it handled now settle in Discover's own
    // Requests box (T03/T04).
    { source: "/connect/inbox", destination: "/discover", permanent: true },
  ];
},
```

## File 11 — regenerate `src/types/database.types.ts` — targeted edit, NOT a full `supabase gen types` run

⚠️ **This file is NOT reproducible from `supabase gen types typescript --local`** — a fact
recorded independently in three places from a prior slug (0022's `REVIEW.md`/`STATE.md`/
`TICKETS.md`): it carries an undocumented hand-edit on `update_deal_draft`'s `Args` (several
fields typed `| null` that the generator does not emit; confirmed present at this file's current
`:5134-5146`). Running the generator and overwriting the file would silently clobber that
hand-edit and break `updateDealDraft` — exactly the failure mode 0022 already hit once.

**The fix: delete exactly the two stale entries by hand, not a regeneration.** Both are
already-orphaned (T06 dropped both functions from the live schema):
- `:4702` — `claim_deal_ticket: { Args: { p_deal_card_id: string }; Returns: string }` (one line,
  delete outright).
- `:4756` — `deliver_deal: { Args: { p_deal_card_id: string }; Returns: undefined }` (one line,
  delete outright).

Both confirmed single-line, self-contained entries with unique surrounding context (`close_deal_
ticket` immediately follows the first — a genuinely different, still-live function, untouched).
No other line in this file changes.

## Not in scope

- `surfaces.ts`'s "Connection Request" nav entry, `ConnectActions.tsx`/`CompaniesSection.tsx`'s
  two `/connect/inbox` links — T08's declared scope, not this ticket's.
- `e2e/inbox-accept.spec.ts` — confirmed via grep to be the one e2e spec referencing
  `getInbox`/`claimItem`/`acceptItem`/etc. by name; it will fail once this ticket lands (it
  exercises UI this ticket deletes). This is T09's declared scope (T09 depends on **both** T06
  and T07), not a regression to fix here.
- `messaging/types.ts`'s `AcceptRequestType`/`AcceptInput.dealCardId` — see File 9's note.

## EARS criteria — how each is verified

1. **"Navigate to `/connect/inbox` → redirect to `/discover`."** No existing test covers
   `next.config.ts`'s redirects array (checked — the `/account`/`/team` pair went in without one
   either), and TICKETS.md names no new test file for T07. **Owner assigned (`plan-checker`
   N7):** the orchestrator verifies this live (dev server, request `/connect/inbox`, confirm a
   redirect response to `/discover`) as part of build verification, and the same result is staged
   as one of the G4 screenshots — not left to the human stop alone, and not left unowned.
2. **"`tsc` reports zero errors."** `test-runner`'s job, full independent run, not trusted from
   `builder`'s self-report (same discipline as every prior ticket this slug).
3. **"Unit suite total falls by exactly the number of tests `lenses.test.ts` owned."** 514 → 510,
   confirmed exact via `vitest run` before/after, not inferred.

## G4 routing — corrected after `plan-checker` N1: mandatory human stop, not auto-close

**The original draft of this plan argued auto-close** on a reachability basis (nothing on a
still-live surface visibly changes). **That reasoning is wrong and is withdrawn.** PIPELINE §3
routes by what the diff touches, not by whether the change looks significant: *"Diff touches
anything rendered — a component, a template, CSS, copy → mandatory, every lane — a human stop."*
This ticket deletes seven `.tsx` files (six components + `page.tsx`). This slug's own gate log
confirms the line is sharp, not a judgment call: T01/T02/T03/T05/T06 all auto-closed and none of
them touched a `.tsx` file (T03 was a query file, `companyRequests.ts`); T04 stopped at G4
specifically *because* it touched `.tsx`. T07 is the first ticket since T04 to touch one. **This
ticket routes to G4, human stop, `visual-verifier` staging, per PIPELINE §3 — same procedure as
T04, not T01/T02/T03/T05/T06.**

No migration/RLS/RPC/auth/server-action/cross-company-read surface, so `security` is still not
required (matches T03/T04's precedent: `/code-review` + `critic` only) — only the render-routing
question changes, not the reviewer set.

**What actually needs staging at G4 (`plan-checker` N6 — name the real changes instead of
asserting "no change"):**
- **The redirect itself** — `/connect/inbox` now serves `/discover`, not the old inbox UI.
- **A capability leaves the product, not merely relocates.** Claim, assign-to-teammate, the four
  lenses (Unassigned/Mine/All/Deal tickets/History), and the two-panel detail view all disappear.
  Discover's `RequestsSection` — the only remaining surface — offers Accept/Decline only, no
  claim/assign/lens equivalent. ADR-sanctioned (D6: MVP is one person per company per side, so
  claim/assign was already Deferred slug-wide), but it is a real product change worth Muskan
  actually seeing, not asserting away.
- **A temporary dead-end while T07 ships ahead of T08.** T07 and T08 are declared parallel
  (Ready checkpoint, disjoint files) with no ordering between them. Until T08 lands, three still-
  live entry points keep pointing at `/connect/inbox`: the "Connection Request" sidebar nav entry
  (`surfaces.ts:54-55`) and two "wants to connect → open inbox" links (`ConnectActions.tsx:44`,
  `CompaniesSection.tsx:100`). Post-T07, clicking any of them silently lands on Discover instead
  of the old inbox — not broken (the redirect is exactly what D6 wants), but a real, reachable,
  temporary UX rough edge in the branch between the two tickets. Worth one screenshot and one
  sentence at G4, not silent.
