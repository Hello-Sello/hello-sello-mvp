# Build Plan - 3b: Deal Workspace (screen ④)

**Status:** 🟢 **LOCKED by Ayush** (2026-06-10; all §6 decisions resolved, see §6). Ready to build phase by phase.
**Author:** Claude + Ayush · **Created:** 2026-06-10 · **Live project:** `byipusuthdlskdxoexkt`.
**Prototype:** `prototypes/deal-workspace-prototype/` (locked 2026-06-07) - `index.html`, `CONTEXT.md`, `NOTES.md`.
**Builds on:** 3a (deal card, read side, DONE). **Test card:** `04695a2d-668d-40b4-bfa8-55b0fe306018`
(GreenLeaf/Alice ↔ StonePharm/Bob, relationship `5e64f146-7015-4061-a9ac-e98a0684c062`, `deal_type=offer`,
seller-initiated by GreenLeaf `aaaa…`, status `confirmed`, v1). **Resolves [DEV-9].**

---

## 0. What 3b is (and is NOT)

**3b IS:** the **Deal Workspace** - the *container* for one deal, built for real. It is the fourth and last
Connect atom (① card → ② chat → ③ relationship page → **④ workspace**). It is **born when a deal is born**:
a `deal_workspace` row + its `deal_member` rows + a per-deal **deal chat** (`chat_thread type='deal'`).
The screen is the **A&C mix** layout: a top **header band** (deal facts + lifecycle pill + a one-line Deal-Sella),
a narrow **left tabbed panel** (`Things · People · Documents`), and the **deal chat as the wide hero** on the
right, carrying the same pinned deal-card pill we built in 3a. 3b makes the **container, the membership, and the
deal chat real**; the **People** tab is real (reads `deal_member`).

**3b is NOT:** the stage pipeline + the Things checklist (that is **3c** - in 3b the Things tab is a visual stub),
the two-sided confirm gate (**3d**), deal creation/editing (**3.5**), or Sella writing into the chat (**4x** - in
3b Deal-Sella is a static one-liner). The **Documents** tab is also a stub in 3b (real `deal_artifact` upload
comes later). We build 3b **on the seeded card `04695a2d`** - we do not create new deals here (that is 3.5).

**The look is already decided.** The prototype fixes the layout (header band, left tabs, chat hero, card-as-pill).
3b is "port the locked prototype into the real React app + real data," not "decide what it looks like." Same rule
as 3a: **port the elements + layout from the prototype, take the styling from the real app.**

---

## 1. Prototype ⇄ live DB reconciliation (READ THIS - it prevents build-time surprises)

The prototype was a paper sketch made before parts of the DB settled. Here is where the prototype's words differ
from the **live schema** (the live DB wins, same as 3a). The big news: **almost nothing needs a migration** - the
whole workspace backend already exists and is RLS-correct.

| # | Prototype / CONTEXT said | Live DB reality | What 3b does | Major? |
|---|---|---|---|---|
| 1 | "Layer B: **invited participants only**" | `deal_workspace.visibility` **defaults to `company_wide`**; RLS `can_access_workspace` = relationship-member **AND** (`company_wide` **OR** `is_workspace_member`) | Workspace is **company_wide by default** (whole company of each side can see+act). `deal_member` rows are for the **People tab + ownership**, and only **gate visibility when `visibility='private'`**. This already matches CONTEXT §9 ("whole company can see+act unless PRIVATE"). | **MAJOR (mental model)** |
| 2 | "one deal owner" (single column) | `deal_workspace.owner_person_id` exists + `NOT NULL`, **but** a deal has **two owners (one per company)** - one column can't hold two | **DROP the column** (table empty, 0 code deps, RLS ignores it - safe). **Ownership = `deal_member.role='owner'`** (a list, holds N owners). Seed **two owners**: Alice (GreenLeaf) + Bob (StonePharm). `created_by` still records who made the workspace. **LOCKED, see §6 D-OWNER.** | **MAJOR (resolved)** |
| 3 | "deal chat" is a new concept | `chat_thread` already supports it: a **`type='deal'`** branch exists in the table CHECK (`deal` requires `deal_card_id`), in the RLS `thread_all` policy (deal threads visible via the workspace), and `deal_card_id` column exists | **No migration for the chat.** The deal chat is a `chat_thread` row `type='deal'`, `deal_card_id=<card>`, `relationship_id=<rel>`. The existing messaging `ThreadView` renders it. | minor (it's free) |
| 4 | (not noticed) | the inbox query `listConversations` selects **all** `chat_thread` rows with **no type filter** (`store.ts:82`) | A `type='deal'` thread would **leak into the P2P/C2C inbox**. 3b must filter it out (`.in("type", ["p2p","c2c"])` or `.neq("type","deal")`). See Phase 6. | minor (but must-do) |
| 5 | tables: `member · thing · artifact · stage · audit_log` | live names: **`deal_member · thing · deal_artifact · deal_stage · audit_log`**; `thing.stage_code` (text FK to `deal_stage.code`), `deal_artifact.deal_workspace_id` | Use the live names. 3b only touches `deal_workspace`, `deal_member`, `chat_thread` (+ optional seed `chat_message`). `thing`/`deal_artifact`/`deal_stage` are **3c/later**. | minor |

★ **IMPORTANT insight - why this matters.** The single biggest risk in 3b was the `owner_person_id` mismatch:
the design said "the column is gone, read ownership from members," but the **live table still demands it
(not-null)**. If we had built trusting the design, every workspace insert would have failed. By checking the live
DB first, we turn a build-time crash into a one-line decision (§6 D-OWNER). This is the same lesson as 3a:
**when the design doc and the live DB disagree, the live DB is the truth - reconcile on paper before you code.**

---

## 2. What is already done (the foundation 3b rides on) - VERIFIED on live `byipusuthdlskdxoexkt`

This is why 3b is **mostly UI + a seed** (likely **zero schema migrations**). The whole workspace backend exists.

| Thing | State | Notes |
|---|---|---|
| `deal_workspace` | **migrated** | `deal_card_id` (NN), **`owner_person_id` (NN)**, `visibility` (def `company_wide`), `metadata`, audit + `deleted_at` |
| `deal_member` | **migrated** | `deal_workspace_id`, `person_id`, `role` (def `member`), `added_by_person_id` (NN), `added_at`, `removed_at`, `removed_by_person_id`, `metadata` |
| `chat_thread type='deal'` | **migrated** | CHECK `chat_thread_deal_has_card` (deal ⇒ `deal_card_id` set); `deal_card_id` column present; RLS `thread_all` already routes `deal` threads through `can_access_workspace` |
| `chat_message` | **migrated** | the deal chat reuses the same message table as P2P/C2C (`thread_id`, `sender`, `body`, …) |
| RLS + helpers | **correct** | `can_access_workspace(ws)`, `card_relationship_member(card)`, `is_relationship_member(rel)`, `is_workspace_member(ws)`, `current_company_id()`. Policies: `ws_all`, `member_all`, `dealart_all`, `thing_all`, `conf_all` all `ALL` + side-aware |
| `deal_stage` lookup | **migrated** (seeded in 3a era) | 5 stages - **3c** uses these, not 3b |
| `thing` / `deal_artifact` / `deal_confirmation` | **migrated** | the Things / Documents / confirm backends - **3c / 3d / later**, not 3b |
| The deal card (3a) | **DONE** | `DealCard`, `DealPin`, `getDealCard`, derive helpers - **reuse as-is** for the in-chat pill |
| messaging `ThreadView` + `chat_message` reads/realtime | **DONE (2d)** | reuse to render the deal chat hero |

**The one thing missing for the demo:** there is **no workspace/member/deal-thread row for the test card yet**
(`deal_workspace` count for `04695a2d` = **0**). 3b seeds them (Phase 1). No new tables, no new RLS - unless the
§6 decisions say otherwise.

---

## 3. What 3b adds (mapped to phases)

| Gap | Plain words | Phase |
|---|---|---|
| **Schema fix** | migration: drop `deal_workspace.owner_person_id` + add `deal_member.role` guard; regenerate types | Phase 0 |
| **Types + reads** | extend `deals/` with workspace types bound to `database.types.ts`; `getWorkspace(dealCardId)` → workspace row + members (with people, grouped by side) + the deal-thread id; `ownersOf` helper | Phase 0 |
| **Seed the container** | one **seed** (idempotent, delete-by-tag): `deal_workspace` (company_wide) + **two owner members** (Alice GreenLeaf + Bob StonePharm) + `chat_thread type='deal'` + 2-3 seed `chat_message`s | Phase 1 |
| **Route + header band** | new route `src/app/connect/deal/[dealCardId]/page.tsx`; the top header (title · HS# · parties · owner · net · lifecycle pill) + static Deal-Sella one-liner | Phase 2 |
| **Left tabbed panel** | `Things · People · Documents` tabs (C-style). **People = real** (`deal_member` + person names + "(you)"). **Things / Documents = visual stubs** ("+ Add…", empty state) filled by 3c / later | Phase 3 |
| **Deal chat hero** | mount the existing messaging `ThreadView` on the deal thread (right, wide); place the 3a deal-card **pill** ("Talking about: HS-…") that opens the same flip card | Phase 4 |
| **Entry points + inbox fix** | "Open workspace →" from the relationship deals list; **⤢** button on the deal card chrome; **filter `type='deal'` out of the inbox** (`store.ts`) | Phase 5 |
| **Verify both sides** | end-to-end walk on the seeded card, Alice and Bob: header, People "(you)", deal chat + pill, company_wide visibility, no console errors, `tsc` + eslint clean | Phase 6 |

---

## 4. Design language - port elements, not pixels (same LOCKED rule as 2e/3a)

Take the **layout + elements** from `prototypes/deal-workspace-prototype/index.html`; take the **styling** from the
real app (brand tokens, `lucide-react`, the glass/ink system already used in messaging/relationship/dealcard).

**Keep from the prototype exactly:** the A&C mix shape (header band on top · narrow left tabs · wide chat hero on
the right), the three tab names (`Things · People · Documents`), the lifecycle pill (`Draft → Confirmed → Done`),
the card living **in the chat as a pill** (not a separate box), and "(you)" following the viewer's side.
**Drop:** the prototype's bottom DEMO bar (Lifecycle / Seeing-as toggles) - the real app derives side from login and
lifecycle from data. **Stub (not build) in 3b:** the Things content (3c), the Documents upload (later), Deal-Sella's
real text (4x).

---

## 5. Module shape (extend `deals/`, mirror messaging/relationship)

3b extends the **existing** `src/modules/deals/` module (do not make a new module). The deal chat **reuses
messaging** - we do not rebuild a chat.

```
src/modules/deals/
  index.ts                 barrel - add the workspace exports
  types.ts                 + DealWorkspaceView, MemberView, (reuse DealCardView from 3a)
  lib/
    derive.ts              + resolveOwner(members), isViewer(personId, viewerId)  (pure, testable)
  supabase/
    reads.ts               + getWorkspace(dealCardId) → { workspace, members, dealThreadId }
  components/
    DealWorkspace.tsx      the screen: header band + left tabs + chat hero (composition root)
    WorkspaceHeader.tsx    title · HS# · parties · owner · net · lifecycle pill · static Sella line
    WorkPanel.tsx          the tabbed left panel (Things | People | Documents)
    PeopleTab.tsx          real: deal_member + names + role + "(you)"
    ThingsTab.tsx          stub now (3c fills it) · DocumentsTab.tsx stub now (later)
```

App route: `src/app/connect/deal/[dealCardId]/page.tsx` (route by **deal card id** - both entry points know it:
the relationship deals list and the ⤢ on the card). The deal chat hero mounts messaging's `ThreadView` with the
`dealThreadId` from `getWorkspace`.

---

## 6. Decisions - ✅ ALL LOCKED (Ayush, 2026-06-10)

All resolved with Ayush (Muskan present + agreed on the schema change).

**D-OWNER ✅ - ownership is a ROLE, not a single column.** A deal has **two owners, one per company** (a list, not
a box). So: **drop `deal_workspace.owner_person_id`** (and its FK) - safe because the table is empty (0 rows),
**no real code uses it** (only the auto-generated `database.types.ts`, which regenerates), and **RLS never
references it**. Ownership lives in **`deal_member.role='owner'`**, which holds any number of owners. `created_by`
still records who created the workspace, so no fact is lost. *Why:* one-to-many facts need rows, not a column;
this is the single source of truth and it scales (more owners per side - super-admin + handler - or new roles like
compliance/logistics need **zero** schema change later). A company super-admin sees all company deals already via
`visibility='company_wide'`; acting-as-owner is just another `owner` row - no separate modeling needed.

**D-ROLE-GUARD ✅ - constrain `deal_member.role` now.** Mirror how `visibility` already uses the
`workspace_visibility` lookup: add a guard (CHECK or a small `deal_member_role` lookup) so `role` can only be a
valid value (`owner`/`member`, room for more). Prevents silent typos. "Make it right once."

**D-VISIBILITY ✅ - `company_wide`.** Seed the workspace `company_wide` (the live default; CONTEXT §9: "whole
company unless PRIVATE"). `private` (invited-only via `is_workspace_member`) is a later toggle, not 3b.

**D-SEED-MEMBERS ✅ - two owners.** Seed **Alice (GreenLeaf, `role='owner'`) + Bob (StonePharm, `role='owner'`)** -
one owner per company, each able to add people from their own company. (Demo collapses each company's super-admin +
deal-handler into one person.)

**D-DEALCHAT-SEED ✅ - seed 2-3 messages.** Seed a short Sella birth note + one line each side, tagged
`metadata.seed='demo-world'`, so the chat hero isn't blank in the demo.

**D-ROUTE ✅ - `/connect/deal/[dealCardId]`** (route by card id - both doors know it). The deal chat is *inside*
this screen, not a separate inbox conversation.

**D-LIFECYCLE-PILL ✅ - display-only in 3b.** Derive the pill from the card/workspace status we already have
(seeded card shows "Confirmed"). The *gate* that flips Draft→Confirmed is **3d**.

---

## 7. Phase-by-phase build order (each phase: build → verify in Claude Preview → `tsc` + eslint clean → commit)

- **Phase 0 - schema migration + types + reads.** **(a) Migration:** `DROP COLUMN deal_workspace.owner_person_id`
  (FK drops with it; table empty so no data loss) + add the `deal_member.role` guard (CHECK or `deal_member_role`
  lookup, allow `owner`/`member`). **(b)** regenerate `database.types.ts`. **(c)** add `DealWorkspaceView` /
  `MemberView` types + `getWorkspace(dealCardId)` (workspace + members+people grouped by side + dealThreadId) and
  pure helpers (`ownersOf(members)`, `sideOf(person)`, `isViewer`). *Verify:* `tsc` clean; a temp proof logs the
  shape for `04695a2d` both sides.
- **Phase 1 - seed the container (the only data write).** One idempotent seed (delete-by-tag like 3a):
  `deal_workspace` (company_wide) + **two `deal_member` owners** (Alice GreenLeaf + Bob StonePharm, `role='owner'`)
  + `chat_thread type='deal'` + 2-3 seed `chat_message`s. *Verify (SQL):* one workspace, two owner members, one
  deal thread for the card; both Alice and Bob can `select` it.
- **Phase 2 - route + header band.** `/connect/deal/[dealCardId]` shell + `WorkspaceHeader` (real facts from
  `getWorkspace` + the 3a card read) + static Deal-Sella line + display-only lifecycle pill. *Verify:* header renders
  both sides, owner + net + parties correct, no console errors.
- **Phase 3 - left tabbed panel.** `WorkPanel` tabs; **People real** ("(you)" follows login); Things/Docs stubs with
  empty states. *Verify:* tab switching works; People shows Alice (owner) + Bob; "(you)" flips per login.
- **Phase 4 - deal chat hero.** Mount messaging `ThreadView` on `dealThreadId`; place the 3a card **pill** that opens
  the flip card. *Verify:* messages render + realtime works (reuse 2d); the pill opens the same card front/back/logs;
  margin still seller-only.
- **Phase 5 - entry points + inbox leak fix.** "Open workspace →" on the relationship deals list; **⤢** on the card
  chrome → route here. **Filter `type='deal'` out of `listConversations`.** *Verify:* both doors land on the
  workspace; the deal thread does **not** appear in the P2P/C2C inbox.
- **Phase 6 - verify both sides + wrap.** Full walk Alice ↔ Bob; `tsc` + eslint clean; update sync file, this log,
  CLAUDE.md Last-session / What's-next.

---

## 8. Out of scope / parked (so 3b stays small)

- **Things content + stages** → 3c (the `thing` + `deal_stage` backend is migrated; 3b only stubs the tab).
- **Documents upload** → later (`deal_artifact` migrated; 3b stubs the tab).
- **Two-sided confirm gate (Draft→Confirmed)** → 3d (`deal_confirmation` migrated; 3b pill is display-only).
- **Deal creation / editing** → 3.5 (3b builds on the seeded card, never creates one).
- **Sella writing in the deal chat** → 4x (3b's Deal-Sella line is static).
- **Deal Room** → NOT screen ④; it's a Present-surface tool (CONTEXT §8).
- Parked Linear: THINGS inbox across deals [DEV-27], multi-deal per P2P [DEV-37], partial/multi-delivery close
  [DEV-53], confirmation output doc [DEV-61].

---

## Process for 3b (same as every unit)

1. Write this plan. **Lock it with Ayush** (the §6 decisions especially) before any code.
2. Build phase by phase, in order. Verify each phase in Claude Preview, no console errors, `tsc` + eslint clean.
3. Keep everything behind the module barrel (`deals/index.ts`), like messaging / relationship.
4. Wrap: update sync file, this build log, and CLAUDE.md Last-session / What's-next.
