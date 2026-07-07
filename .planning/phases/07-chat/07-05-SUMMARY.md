---
phase: 07-chat
plan: 05
subsystem: ui
tags: [messaging, react, next, supabase, rls, group-chat, filters]

# Dependency graph
requires:
  - phase: 07-02
    provides: create_group_thread / approve_group_member RPCs, chat_thread_member table + RLS, chat_thread.name + nullable relationship_id, the 'group' thread type
  - phase: 07-01
    provides: DealCardPanelHost (listens for hs:open-deal-card), the ThreadView stale-comment fix
provides:
  - Chat rail redesign - 3 primary chips (All / Unread / Deals) + a Group ▾ dropdown (Groups / Companies / Internal / External)
  - +New 2-item menu (New chat / New group) + a visible ✕ on the New-Chat picker
  - GroupPicker - multi-select member set, any-user name search, the external-party warning + a 2-approver step
  - store group support - getConversations group branch (membership-resolved), createGroupThread / approveGroupMember / renameGroupThread
  - in-chat group rename in ThreadView + the hs:new-group window-event contract (07-07 emits it)
affects: [07-07, 07-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Group rows resolve display + participants from chat_thread_member, never person_a/b (Pitfall 1)"
    - "New table/RPC/column reads use the as-never / select-string cast discipline (no database.types regen mid-phase)"
    - "Cross-module open via window event (hs:new-group), contract owned by the picker, listener in ChatView (acyclic)"

key-files:
  created:
    - src/modules/messaging/components/GroupPicker.tsx
  modified:
    - src/modules/messaging/components/ConversationList.tsx
    - src/modules/messaging/components/NewChatDropdown.tsx
    - src/modules/messaging/components/ThreadView.tsx
    - src/modules/messaging/components/ChatView.tsx
    - src/modules/messaging/supabase/store.ts
    - src/modules/messaging/supabase/connections.ts
    - src/modules/messaging/types.ts
    - src/modules/messaging/index.ts

key-decisions:
  - "Internal/External derived from member companies (groups) - p2p/c2c/deal are always external; internal is genuinely empty until own-company chats exist (no faked rows)"
  - "The D-05 2-approver step lives in the GroupPicker after create; each approval is one member's click, the second comes from another session (the server enforces two-distinct)"
  - "searchPeople widens the New-Group source but stays RLS-scoped + sanitizes PostgREST filter input (Rule 2)"

patterns-established:
  - "Pattern 1: GroupHeader keyed by threadId to reset the rename buffer on thread switch (no setState-in-effect)"
  - "Pattern 2: deal-born groups file under Deals (companyId 'deal-groups' bucket); plain groups under Groups"

requirements-completed: [CHAT-01, GRP-02]

# Metrics
duration: 60min
completed: 2026-07-07
---

# Phase 7 Plan 05: Connect chat rail + group creation Summary

**Reworked the chat rail to 3 primary chips + a Group ▾ dropdown, added the +New two-item menu and a new GroupPicker that searches any user and enforces the external-party 2-approver gate, plus store group resolution/creation/rename over the 07-02 membership backend.**

## Performance

- **Duration:** ~60 min
- **Completed:** 2026-07-07T08:15:14Z
- **Tasks:** 3
- **Files modified:** 8 (+1 created)

## Accomplishments
- Chat rail now shows exactly `All / Unread / Deals` up front, with `Groups / Companies / Internal / External` folded into a `Group ▾` dropdown (D-01); the retired `hs-deal-card-slot` portal target is gone.
- `+ New` became a 2-item menu (New chat / New group, D-02); the New-Chat picker got a discoverable ✕ (D-03).
- New `GroupPicker`: multi-select members, a name search widened to any HelloSello user (D-04), the "EXTERNAL PARTY IS BEING ADDRESSED" warning, and a post-create step that drives `approve_group_member` (D-05). It opens in deal mode via the `hs:new-group` window event (07-07 emits it).
- Store now resolves group rows from `chat_thread_member` (never person_a/b, Pitfall 1), and exposes `createGroupThread` / `approveGroupMember` / `renameGroupThread`; deal-born groups file under Deals (D-07).
- `ThreadView` renders a group header with an in-chat rename (Enter saves / Esc cancels, D-06) and a Deal chip; groups skip `DealPin` (they have no relationship anchor).

## Task Commits

Each task was committed atomically (committed in dependency order so each commit compiles in isolation):

1. **Task 1: 3 primary chips + Group ▾ dropdown + group filters (D-01)** - `f3b295c` (feat)
2. **Task 3: store group resolution + create/approve/rename + in-chat rename (D-06/D-07)** - `946571c` (feat)
3. **Task 2: +New 2-item menu + picker ✕ + GroupPicker external gate (D-02/D-03/D-04/D-05)** - `0dccad6` (feat)

_Task 3 (store + ThreadView) was committed before Task 2 (UI) because the UI depends on the store functions; this keeps every commit independently compilable._

## Files Created/Modified
- `src/modules/messaging/components/GroupPicker.tsx` - NEW: group-creation picker (multi-select, any-user search, external-gate warning + 2-approver step, `hs:new-group` contract)
- `src/modules/messaging/components/ConversationList.tsx` - 3 primary chips + `Group ▾` dropdown, the `NewMenu` 2-item trigger, group/internal/external filter cases, portal slot removed
- `src/modules/messaging/components/NewChatDropdown.tsx` - visible ✕ close in the header (D-03)
- `src/modules/messaging/components/ThreadView.tsx` - group header with in-chat rename + Deal chip; groups routed away from `DealPin`
- `src/modules/messaging/components/ChatView.tsx` - picker mode state, group create/approve/done handlers, the `hs:new-group` listener
- `src/modules/messaging/supabase/store.ts` - getConversations group branch + `createGroupThread` / `approveGroupMember` / `renameGroupThread`
- `src/modules/messaging/supabase/connections.ts` - `searchPeople` (widened, RLS-scoped, sanitized)
- `src/modules/messaging/types.ts` - `'group'` in ThreadType, `isExternal` on the list item, `PeopleSearchResult` / `GroupCreationResult` / `PendingExternalMember`
- `src/modules/messaging/index.ts` - barrel exports for the new picker, store fns, search read, and types

## Decisions Made
- **Internal vs External without new backend data:** p2p/c2c/deal are always cross-company, so they are marked external; a group computes it from its active members' companies. Internal shows the empty state honestly (no own-company chat data exists yet) rather than faking rows.
- **Where the 2-approver gate lives:** the GroupPicker surfaces the warning and, after create, lists the server-gated externals with an Approve button. Each click is one member's approval; the second distinct approval comes from another user's session. The UI can never activate an external party - `approve_group_member` enforces the two-distinct rule server-side (T-07-05-01).
- **searchPeople stays RLS-scoped:** D-04's "any user" is bounded by the existing person-visibility RLS; the read never bypasses it, and user input is sanitized before the `.or(...ilike...)` filter to prevent PostgREST filter injection.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `'group'` to `ThreadType` + supporting types in `types.ts`**
- **Found during:** Task 1 (filter split)
- **Issue:** `types.ts` was not in the plan's `files_modified`, but the group filter compares `threadType === "group"`, which TypeScript rejects unless `'group'` is in the `ThreadType` union. `isExternal`, `PeopleSearchResult`, `GroupCreationResult`, and `PendingExternalMember` were likewise required by the store/picker.
- **Fix:** Extended `ThreadType`, added the four supporting types.
- **Files modified:** src/modules/messaging/types.ts
- **Verification:** `npx tsc --noEmit` exits 0.
- **Committed in:** f3b295c / 0dccad6

**2. [Rule 3 - Blocking] Added `searchPeople` read to `connections.ts`**
- **Found during:** Task 2 (GroupPicker)
- **Issue:** D-04 widens the New-Group source beyond the connected directory to any user by name; the plan notes "you may need a broader people search read". `connections.ts` was not in `files_modified`, but the widening needs a real read.
- **Fix:** Added a RLS-scoped, input-sanitized `searchPeople(query)` next to `getMyConnections`; exported via the barrel.
- **Files modified:** src/modules/messaging/supabase/connections.ts, src/modules/messaging/index.ts
- **Verification:** tsc 0, eslint 0 errors, build 0.
- **Committed in:** 0dccad6

**3. [Rule 3 - Blocking] `"use client"` on GroupPicker**
- **Found during:** post-Task-2 build
- **Issue:** GroupPicker is barrel-exported, so `next build` pulled it into a Server Component graph via `chat/page.tsx`; a hooks-using component there errors without the directive.
- **Fix:** Added `"use client"` to GroupPicker.tsx.
- **Files modified:** src/modules/messaging/components/GroupPicker.tsx
- **Verification:** `npm run build` exits 0.
- **Committed in:** 0dccad6

---

**Total deviations:** 3 auto-fixed (3 blocking type/read/build necessities)
**Impact on plan:** All three were required to make the specified UI compile and build. No scope creep - each is the minimal addition the plan's own decisions (D-01/D-04) implied.

## Issues Encountered
- **eslint `set-state-in-effect`:** the codebase forbids synchronous `setState` inside effects. The group-name reset (ThreadView) was reworked to a `key`-based remount, and the GroupPicker search-clear was reworked to tag results with their query instead of clearing synchronously. Both now pass eslint with 0 errors.

## Threat Flags

The plan's threat register (T-07-05-01/02/03) is mitigated server-side (07-02) and this UI honors it: the picker only triggers `approve_group_member` (never sets state), group rows resolve under `is_group_member` RLS, and `createGroupThread` passes only member ids (creator derived from `auth.uid()`). `searchPeople` is a new people-search read but introduces no new trust boundary - it is RLS-scoped by the existing person-visibility policy and sanitizes filter input. No new unmitigated surface.

## Known limitations (by design, not stubs)
- The 07-02 migrations (`chat_thread_member`, `chat_thread.name`, the two RPCs, the group RLS branch) are NOT applied to the local DB yet - **07-08 applies them + runs the e2e 3-party fixture.** So runtime group behavior (create a plain group, create a deal-born group under Deals, external gate blocks until 2 approvals, non-member sees nothing) is verified in 07-08, not here. Per the plan I did NOT run `supabase db reset`; all new columns/tables/RPCs use the documented as-never / select-string cast discipline.
- Pre-existing eslint warning `'_threadId' is defined but never used` in `markRead` is out of scope (untouched no-op).

## Next Phase Readiness
- 07-07 (deal-card "Talk about this deal") can dispatch `hs:new-group` with `{ dealCardId }` to open the GroupPicker in deal mode - contract exported as `NEW_GROUP_EVENT` / `NewGroupEventDetail`.
- 07-08 must apply the 07-02 migrations (local db reset) and exercise the group flows e2e with a 3-party fixture.

## Self-Check: PASSED

- Created file present: `src/modules/messaging/components/GroupPicker.tsx`, `.planning/phases/07-chat/07-05-SUMMARY.md`
- Commits present: `f3b295c` (Task 1), `946571c` (Task 3 store), `0dccad6` (Task 2 UI), `6998b39` (docs)
- tsc 0, eslint 0 errors, `npm run build` exit 0
- STATE.md / ROADMAP.md untouched (orchestrator owns those)

---
*Phase: 07-chat*
*Completed: 2026-07-07*
