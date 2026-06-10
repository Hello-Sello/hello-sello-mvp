# Build Plan - 2a: Connect Inbox

**Workshop file. Gitignored. Internal build reference, not a team doc.**
**Purpose:** the concrete pattern we follow to build 2a. We write this first, then code against it.
**Ground truth:** the **prototypes** (`prototypes/inbox-prototype/`, `prototypes/connect-prototype/`) + the **PRD / layer docs** + the **live schema** (`src/types/database.types.ts`). Where they disagree, prototype + PRD win.

## 2026-06-07 19:38 CEST - Plan written + **LOCKED** by Ayush. Ready to build (step 1 = types.ts).

### Build log
- **Steps 6-10 + 11 DONE (2026-06-07) - 2a inbox functionally complete, verified live, zero console errors.** Built as one batch (interdependent; orchestrator is the glue). Files: `InboxList.tsx` (lens-filtered rows + empty state), `InboxDetail.tsx` (state-driven via `detailMode` helper - accepted/rejected/unassigned/mine/others-admin/others-locked, deal-card mini, collision notice), `AssignMenu.tsx` (Claim/Reassign dropdown, candidates exclude current owner, opens upward), `InboxView.tsx` (the ONLY stateful piece - loads mock via async `getInbox`, holds lens+selection, computes counts, wires mutators), `index.ts` + `app/connect/inbox/page.tsx` mount. **Live walk verified all states:** every lens (counts match list), all 5 detail modes, and the mutators - Claim (Unassigned 3->2, Mine 1->2, detail flips unassigned->mine), Accept (->accepted green banner, History +1), Reassign (mine->others via dropdown, detail flips to others-admin). **§2 no-force-takeover confirmed:** others-locked shows no actions, others-admin shows Reassign only - never a take-over. Typecheck + eslint clean. **2 bugs found+fixed in verify:** (1) History lens count chip clipped at w-80 -> tightened `LensTabs` padding/gap; (2) Reassign menu opened below trigger -> off-screen at panel bottom -> changed to `bottom-full` (opens upward, measured fullyVisible). **Remaining for 2a close-out:** decline path is same plumbing as accept (rejected display already verified); PR to dev when ready.
- **Step 5 DONE (2026-06-07).** Lens logic + tabs. `lib/lenses.ts` is the **single source** for lens meaning: `LENSES` config + `matchesLens` predicate (exhaustive switch w/ `never` guard) + `filterByLens` + `lensCounts`. Both the tab counts and the step-6 list filter run through `matchesLens`, so counts can never disagree with list length. `components/LensTabs.tsx` is presentational + count-driven (props: `active`, `counts`, `onChange`); underline-style active tab + count chip, default `unassigned`. Lens rules: unassigned = pending & unowned; mine = pending & owned-by-viewer; all = pending; history = accepted|rejected. Typecheck + eslint clean.
- **Step 4 DONE (2026-06-07).** `components/InboxRow.tsx` (presentational, pure - renders an `InboxItemView`, reports clicks via `onSelect`; full row anatomy: avatar · company + verified · time-ago · type badge · note/deal/blurb preview · assignee chip · mutual count; selected/hover states reuse the brand-soft fill + left brand bar). Display helpers extracted to `lib/inbox-display.ts` (`formatTimeAgo`, `REQUEST_TYPE_META`, `REQUEST_TYPE_BLURB`) so InboxDetail (step 7) reuses them - no dup. Assignee chip = Unassigned / "You" / "<first> is on it". Type accents stay on-token (deal_card = brand, message = info, pricelist = brand-deep, connect = neutral; icon carries the type). Typecheck + eslint clean. **Visual verify deferred to step 6** (rows render in the list then; a one-row harness now would be throwaway).
- **Step 3 DONE (2026-06-07).** Connect sub-nav (panel 2) + routing live + verified on :3000, zero console errors. Files: `modules/connect/components/ConnectSubNav.tsx` (client, `usePathname` active tab; Inbox active, Chat + Relationships greyed "soon"), `modules/connect/index.ts` (module public barrel - app composes Connect only via this), `app/connect/layout.tsx` (sub-nav + content two-column inside the 1a shell), `app/connect/page.tsx` (`/connect` -> redirect `/connect/inbox`), `app/connect/inbox/page.tsx` (temp SurfacePlaceholder until step 10 mounts InboxView). Sub-nav styling reuses NavItem's active/soon treatment so rail + sub-nav read as one family. Typecheck + eslint clean.
- **Schema/F5 sync (2026-06-07).** Rebased onto dev: **F5 merged** (PR #60) - `src/shared/{db,auth,audit}` now real (db gives a `Tables<'person'>` shorthand). Verified via Supabase MCP that **`pending_inbox_item` exists live, RLS on, 0 rows** - table is NOT missing, only data is. Seed has just 2 companies (GreenLeaf seller, StonePharm buyer) + the `relationship` insert is commented out. **Decision (Ayush):** hardcoded mock now, swap to real in 2b; zero DB writes. Viewer = GreenLeaf (seller). `npm install` needed post-rebase (F5 added `@supabase/ssr` + `supabase-js` to package.json).
- **Step 2 DONE (2026-06-07).** `src/modules/connect/mock/inbox.mock.ts` written + typechecks clean. 8 seed `InboxItemView`s spanning all 4 types + all 3 statuses + every assignment state (Unassigned=3, Mine=1, All=6, History=2). Anchored on live seed UUIDs (GreenLeaf/Alice/StonePharm-Bob); extra senders + 2 GreenLeaf teammates invented with fake UUIDs for volume. Accessor + mutators are **async** (`getInbox`/`claimItem`/`assignItem`/`acceptItem`/`declineItem`) returning `InboxItemView[]` - same shape as the real query, so 2b swap = body rewrite only. `claimItem` throws if already owned (enforces §2 no-force-takeover at the data layer too). This is the ONLY throwaway file.
- **Step 1 DONE (2026-06-07).** `src/modules/connect/types.ts` written + typechecks clean (`tsc --noEmit` exit 0). Binds to Muskan's generated `pending_inbox_item` Row via `Database[...]["Row"]` so it can't drift from schema. Narrowed the two lookup `string` columns to their **seeded** code unions (verified in `supabase/migrations/20260607090001_lookups_and_seeds.sql`): `InboxStatus = pending|accepted|rejected`, `InboxRequestType = connect|connect_message|pricelist_request|deal_card`. Added the UI projection `InboxItemView` (row + joined display fields) + `TeamMember` / `ViewerContext` (drive the §2 assignment model) + `LensKey`. Env note: `tsc`/`npx` not on PATH - typecheck via `node node_modules/typescript/bin/tsc`.

---

## Process for 2a (same as every unit)

1. Write this plan (this file).
2. Ayush reviews + locks it. **No build until locked.**
3. Build per §5-§6 (UI-first, mock data).
4. Verify live (preview, zero console errors, screenshot).
5. **Ayush writes test cases + tests it.**
6. Pass -> next unit (2b accept flow, then 2c chat).

---

## 0. What 2a is (and is NOT)

**2a = the Connect Inbox: panels 2-4 of the locked 5-panel Connect layout.** 1a built panel 1 (global rail + top bar). 2a adds:

1. **Panel 2 - Connect sub-nav.** The tabs inside Connect (Inbox / Chat / ...). 2a lights up **Inbox**.
2. **Panel 3 - Inbox list.** Lens tabs + the queue of inbound items.
3. **Panel 4 - Inbox detail.** The selected item, state-driven (claim / assign / accept / decline).

**The job:** a company receives inbound *substantive* contact from other companies (a connection + note, a pricelist request, a deal card). Each lands as a ticket in a **shared, role-scoped queue**. A teammate **claims** it, works it, and (2b) **accepts** it - which formalizes the company-to-company connection.

**2a is NOT:**
- Not the chat thread / message composer - that's **2c** (panel 4 flips to a conversation once a ticket is picked up).
- Not the real Accept side-effects (spawning `relationship` + `chat_thread`) - that's **2b**. 2a renders the accepted *state*; 2b wires what Accept actually does.
- Not the Sella vetting rail (panel 5) - that's **4d**. 2a may stub it visually but wires no AI.
- **No Supabase, no auth, no real data.** Mock-first. The mock types mirror the schema so mock -> real is a swap.

> Reference: locked 5-panel Connect layout (`_workshop/pov/connect.md`, 2026-05-24):
> `1 global rail | 2 Connect sub-nav | 3 list | 4 detail | 5 Sella rail`.

---

## 1. Design language

**Inherit 1a wholesale.** Same palette, same glass recipe, same tokens in `globals.css`. No new design language - 2a is the first real surface *content* sitting inside the locked shell.

- **Prototype = layout + placement reference only**, never visual quality. The prototypes use flat colors + emoji; we ship the professional pink/white/glass tool from 1a.
- **List + detail** sit in the glass shell; rows + cards are glass surfaces (`.glass`, `rounded-2xl`, hairline border, soft shadow).
- **Accent usage:** raspberry `--color-brand` for primary actions (Accept, Claim) + selected row; cotton-candy for selected-row fill; `--color-success` for the accepted banner; amber-ish for the "someone is on it" collision cue; `--color-danger` for Decline only on confirm.
- **Icons:** `lucide-react`, monochrome. No emoji (prototype's 📥 etc. do not ship).
- Short dashes only. Light-only (dark deferred).

---

## 2. The assignment model - LOCKED (2026-06-07, Ayush)

This is the heart of 2a behavior. Get it exact.

| Ticket state | Who can act | Action |
|---|---|---|
| **Unassigned** (just arrived) | **Anyone** on the responsible team | **`Claim`** - first-come, first-served. Ticket -> assigned to the claimer. |
| **Assigned to me** | The owner (me) | Work it (Accept / Decline). **Reassign** it to another teammate. |
| **Assigned to someone else** | **Nobody can force-take it.** | No "Take over." Only the **current owner** can reassign, **or a head admin** can (re)assign it to anyone. |

**Rules:**
- **No forceful grab.** Once claimed, the item is the owner's until *they* hand it off or an **admin** reassigns it. A non-owner, non-admin teammate sees "X is on it" + a collision cue, and **cannot** take it.
- **Claim = self-assign** on an unassigned item (first-come-first-served).
- **Assign / reassign** is available to (a) the **current owner**, and (b) a **head admin** (admin can assign/reassign any ticket to anyone).
- Queue is **role-scoped**: sales team sees seller-side tickets, procurement sees buyer-side. (Modeled in mock via a `team` tag; full RBAC is post-2a.)

**Schema mapping** (`pending_inbox_item`): `assigned_to` = current owner (null = unassigned). `assigned_by` = null when self-claimed, set to the admin's id when admin-assigned. So Claim writes `assigned_to = me, assigned_by = null`; admin assign writes `assigned_to = X, assigned_by = admin`.

---

## 3. Inbox anatomy (from prototype Variant A - LOCKED 2026-06-06)

### Lens tabs (panel 3 top)
`Unassigned` · `Mine` · `All` · `History` - each with a live count. **Default = Unassigned.**
- `Unassigned` = `assigned_to == null && status == pending`
- `Mine` = `assigned_to == me && status == pending`
- `All` = every pending item (incl. others')
- `History` = `status in (accepted, rejected)`

### Inbox row (panel 3)
avatar initials · company name · time-ago · **type badge** · note preview (or type description) · **assignee chip** (You / "X is on it" / Unassigned) · mutual count · verified pill. Selected = cotton-candy glass fill.

Type badge values = `pending_inbox_item.type`: `connect` · `connect_message` · `pricelist_request` · `deal_card`.

### Detail panel (panel 4) - state-driven
- **pending + unassigned** -> `Accept & connect` (primary) · `Decline` · **`Claim`** (first-come-first-served)
- **pending + assigned to me** -> `Accept & connect` · `Decline` · **`Reassign`** (dropdown of teammates)
- **pending + assigned to someone else** -> amber collision cue "X is handling this"; **no action buttons** for a normal teammate. (Admin view shows a `Reassign` dropdown.)
- **accepted** -> green banner "Connected with X" + `Start a deal ->` (CTA only in 2a; wiring later)
- **rejected** -> grey "Declined. Moved to History"

### Empty state
Lens with no items -> centered glass card, "You're all caught up." (no emoji). Per-lens copy can vary later.

---

## 4. Mock types -> schema map (mock-first, schema-shaped)

Module `types.ts` mirrors `pending_inbox_item` columns **exactly** so mock -> real Supabase is a swap, not a rewrite.

| Prototype field | `types.ts` field | Real column / source |
|---|---|---|
| `from` / `init` | `senderCompanyName` / derived initials | join `sender_company_id` -> `company.name` |
| `kind` | `type` | `pending_inbox_item.type` (`connect` / `connect_message` / `pricelist_request` / `deal_card`) |
| `note` | `note` | `pending_inbox_item.note` |
| `deal` | `dealCardId` (+ mock card) | `pending_inbox_item.deal_card_id` |
| `assignee` | `assignedTo` | `pending_inbox_item.assigned_to` |
| (admin vs self) | `assignedBy` | `pending_inbox_item.assigned_by` (null = self-claim) |
| `status` | `status` | `pending_inbox_item.status` (`pending` / `accepted` / `rejected`) |
| `mutuals` | `mutualCount` | derived (mock constant for now) |
| `verified` | `senderVerified` | `company.verification_status == 'verified'` |
| `ago` | `createdAt` | `pending_inbox_item.created_at` (formatted client-side) |

Status unions to encode verbatim: `inbox_status` = `pending | accepted | rejected`; `inbox_request_type` = `connect | connect_message | pricelist_request | deal_card`. Keep them as string-literal unions matching the DB enum codes.

Mock seed: ~6-8 items spanning all 4 types + all 3 statuses + unassigned/mine/others'-assigned, so every lens and every detail state is reachable without a backend.

---

## 5. Files 2a creates

Domain module, per the one rule (a module is reached only through its `index.ts`).

```
src/
├── app/
│   └── connect/
│       ├── layout.tsx          Connect sub-nav (panel 2) wraps connect children
│       ├── page.tsx            "/connect" -> redirect to /connect/inbox
│       └── inbox/page.tsx      mounts <InboxView/> from the connect module
└── modules/
    └── connect/
        ├── index.ts            PUBLIC surface - re-exports InboxView, types
        ├── types.ts            schema-shaped TS (§4) - inbox item, status/type unions
        ├── mock/
        │   └── inbox.mock.ts    seed items + a getInbox() that mimics a query
        └── components/
            ├── ConnectSubNav.tsx   panel 2 - Inbox / Chat / ... tabs (Inbox active)
            ├── InboxView.tsx       orchestrator: holds selected id + active lens, lays out list + detail
            ├── LensTabs.tsx        Unassigned / Mine / All / History + counts
            ├── InboxList.tsx       panel 3 - maps filtered items to rows
            ├── InboxRow.tsx        one row (avatar, badge, preview, assignee chip)
            ├── InboxDetail.tsx     panel 4 - state-driven card (§3)
            ├── AssignMenu.tsx      Claim / Reassign control per the §2 model
            └── (SellaRailStub.tsx)  optional panel-5 placeholder, no wiring
```

- **`InboxView` is the only client component** that holds state (selected item, active lens, and the in-memory mock mutations for claim/assign/accept/decline). Rows/detail are presentational; sub-nav can be a server component using `usePathname` only if it needs active-tab highlight (then client).
- `connect/layout.tsx` renders the sub-nav + an outlet, so future Connect tabs (Chat = 2c) slot in without touching the inbox.
- State in 2a is **local + ephemeral** (claim/accept just mutate the in-memory list so the UI is exercisable). 2b/real-data replaces the mock store with Supabase calls behind the same module surface.

---

## 6. Build steps (in order) - run AFTER Ayush locks this plan

1. **`types.ts`** - encode the schema-shaped inbox item + the two string-literal unions (§4). This is the contract everything else builds on.
2. **`mock/inbox.mock.ts`** - seed 6-8 items covering all types/statuses/assignment states + a `getInbox()` accessor and mutators (`claim`, `assign`, `accept`, `decline`) operating on the in-memory array.
3. **`ConnectSubNav.tsx` + `connect/layout.tsx`** - panel 2 tabs (Inbox active, others "soon"); `/connect` redirects to `/connect/inbox`. Verify the shell still frames it.
4. **`InboxRow.tsx`** - one presentational row, all the §3 row anatomy + selected/hover states. Build it in isolation against one mock item.
5. **`LensTabs.tsx`** - the 4 lenses + counts, driven by the mock list. Default Unassigned.
6. **`InboxList.tsx`** - filter by active lens, map to rows, handle empty state.
7. **`InboxDetail.tsx`** - the state-driven card: render each of the 5 states (§3) correctly off the selected item.
8. **`AssignMenu.tsx`** - Claim (unassigned) / Reassign (owner + admin) per the §2 model. No "Take over" anywhere.
9. **`InboxView.tsx`** - wire it together: selected-id + active-lens state, pass mutators down, lay out list (panel 3) + detail (panel 4) in the glass shell.
10. **`index.ts`** - export `InboxView` + types as the module's only public surface; mount it from `connect/inbox/page.tsx`.
11. **Verify** - preview on :3000. Walk every lens, select items, claim an unassigned one (moves to Mine), confirm an others'-assigned item shows the collision cue + no take-over, accept -> green banner, decline -> History. Zero console errors. Screenshot.

---

## 7. Done when (2a acceptance)

- [ ] `/connect` redirects to `/connect/inbox`; Connect sub-nav shows Inbox active inside the 1a shell.
- [ ] Lens tabs (Unassigned / Mine / All / History) with correct counts; default Unassigned.
- [ ] Inbox rows show full anatomy (avatar, company, time-ago, type badge, preview, assignee chip, mutuals, verified).
- [ ] Detail panel renders all 5 states correctly (unassigned / mine / others' / accepted / rejected).
- [ ] **Assignment model exact:** Claim works on unassigned (first-come); no force "Take over"; owner + admin can reassign.
- [ ] Accept -> accepted state (green banner + Start-a-deal CTA, visual only). Decline -> History.
- [ ] Empty state per lens. Pink/white/glass, professional, zero console errors.
- [ ] Mock types mirror `pending_inbox_item` columns; module reached only via `index.ts`.

## 8. Deliberately deferred (NOT 2a)

- **2b:** real Accept side-effects - spawning `relationship` + `chat_thread` (c2c), Sella's first summary message.
- **2c:** the chat thread + composer (panel 4 becomes a conversation on pickup); the long-pole.
- Real Supabase data + auth + true role-scoped RBAC (waits on Muskan's F5 + the messaging `index.ts` contract).
- Sella vetting rail (panel 5) wiring - that's 4d. 2a may show a static placeholder only.
- First-contact Sella qualification / doc-request flow; DE/EN i18n; functional search.
