# Build Plan - 2b + 2c: Accept -> Chat (one slice)

**Workshop file. Gitignored. Internal build reference, not a team doc.**
**Purpose:** the concrete pattern we follow to build 2b + 2c together. We write this first, then code against it.
**Ground truth:** the **prototypes** (`prototypes/chat-prototype/`, `prototypes/inbox-prototype/`) + the **PRD / layer docs** + the **live schema** (`src/types/database.types.ts`). Where they disagree, prototype + PRD win.

## 2026-06-08 01:23 CEST - Plan **LOCKED** by Ayush. Ready to build (step 1 = messaging/types.ts).

### Build log
- **SESSION WRAPPED (2026-06-08 21:36 CEST) - 2b + 2c DONE.** All steps (1-13) built + verified live, zero console errors. Three feedback rounds shipped on top (Sella centered; composer matched to prototype; 5-panel resize; Sella panel + "Ask Sella" input; C2C writable; Wordmark `//` lint fix). Code committed + pushed to `claude/ayush/work` (not PR'd to dev yet). Docs updated: DECISIONS.md (C2C-as-ticket decision + 4 open problems), AGENTS.md checkpoint, CLAUDE.md (Last session / What's next), sync file. **C2C-as-ticket = decided + PARKED** (see DECISIONS.md 2026-06-08) - not building now; demo keeps the current C2C chat. **Next session = 2d (realtime feel), then 2e (relationship page + chat top bar).**
- **C2C made writable + Wordmark lint fixed DONE (2026-06-08) - Ayush feedback round 3.** Typecheck + lint clean; verified live (posted a message in MedicoPharmaX C2C, zero console errors).
  - **C2C is now writable** (was read-only "system notice board"). **Not a lock reversal - a drift fix:** `DECISIONS.md:515` already defines C2C as "messaging on behalf of your company, visible to the whole company"; the prototype CONTEXT/NOTES narrowed it to "audit log / `actor=system` only" and I'd coded that. Ayush's correction snaps it back to the authority. Changes: `store.postMessage` no longer throws on c2c; `ThreadView` always renders the Composer (placeholder `Message {company}…` for c2c vs `Message to {name} from {company}…` for p2p); dropped the read-only hint + unused `Info` import; `SellaPanel` c2c copy "system updates only" -> "messaging on behalf of your company". C2C still carries the `connection_established` system line (it's now both a channel *and* the audit record). **Doc drift to clear (not blocking):** `prototypes/chat-prototype/CONTEXT.md`+`NOTES.md` still say c2c = system-only - flag for a docs pass; DECISIONS needs no change.
  - **Sync deferred (Ayush's call):** a company-visible C2C raises real multi-user read-model/ordering/author questions - parked until Supabase. Mock posts as the viewer-on-behalf-of-their-company; single viewer makes sync moot.
  - **Wordmark lint fixed in-place** (`src/shared/ui/Wordmark.tsx`): bare `//` text node -> `{"//"}` string child. Silences `react/jsx-no-comment-textnodes` while keeping the `He//o Se//o` brand mark (no double-L needed). Background-task chip dismissed.
- **Panel resize + Sella human input DONE (2026-06-08) - Ayush feedback round 2.** Typecheck + lint clean on touched files; verified live at 1440px, zero console errors.
  - **5-panel rebalance** - trimmed the left chrome, fed the space to chat + Sella: rail `w-[84px]→w-[76px]` (`IconRail`, global - confirmed code files aren't on the shared-*doc* list + Muskan's sync = "locked: none"), Connect sub-nav `w-48→w-44` (`ConnectSubNav`), chat list `w-80→w-64` (ChatView panel 3). Thread stays `flex-1` so it absorbs ~+56px; Sella `w-72→w-80` (+32). Both windows grow, exactly the ask. Rail labels (`text-[10px]`) still fit at 76px.
  - **Sella human input added** - `SellaComposer` in `SellaPanel`: a single quiet "Ask Sella anything…" input + brand send (no formatting toolbar - it's a copilot quick-ask, not a peer message). Clears on send; the reply path is the Sella runtime (4a+), so it does **not** fake a response (TODO marked in code). Verified type+send clears.
  - **Pre-existing lint (not mine):** `src/shared/ui/Wordmark.tsx` fails `react/jsx-no-comment-textnodes` (the `He//o` wordmark's `//` reads as a JSX comment) - from Task 1A (`bf776a5`), flagged as a separate background task.
- **Design refinements DONE (2026-06-08) - Ayush feedback after the first live walk.** Typecheck + eslint clean; verified live wide (1512px, all 5 panels), zero console errors.
  - **Sella in-chat message -> centered** (was a left card). Now reads like a system line but keeps its Sella mark + brand tint: system = platform narrating a fact, Sella = an agent intervening; neither is a party, so both sit centered. Verified `justify-content: center` on the Sella row. The two *party* voices still take sides via `isMine` (mine right/brand, theirs left/glass) - confirmed a freshly-sent line renders `align-items: flex-end`.
  - **Composer rebuilt to match the chat prototype screenshot.** Now: dynamic placeholder `Message to {name} from {company}…`; expand/collapse toggle (rows 2<->6); full formatting toolbar as **design chrome** (`+ Aa 😀 @ | B I U S | link, numbered, bulleted` + mic, right) - icons are tooltip'd stubs, rich-text is a later pass; Enter sends (Shift+Enter newline), clears on send. Above it, the **pre-written Sella suggestion chips** (brand-soft pink): "Sella recommendations and pre-written answers…" (drops bulleted pre-written lines + auto-expands), "What's new in stock?", "Create offer for new products…" - clicking drops the draft into the box.
  - **Sella panel (panel 5) built** - `SellaPanel.tsx`, the copilot's *persistent* presence beside the thread (vs the centered in-chat *intervention*). Per-conversation: a Context card (who you're talking to) + "Suggested next steps" cards (Draft a reply / Start a deal / Share a price list / Summarize - P2P; Summarize / View relationship - C2C). Stubs until the deal+draft flows (3a+). Wired into ChatView as the third panel; empty-state when nothing selected.
  - **Lint fix in ChatView (carried from step 10):** removed the synchronous `setMessages([])` inside the load effect (react-hooks/set-state-in-effect). The clear-on-switch now lives in `handleSelect` (an event handler), so the effect only ever syncs *from* the store.
  - **Env:** created `.env.local` from the live `hello-sello-design` Supabase project (URL + publishable key, via Supabase MCP) - the 1b auth proxy crashes without it. Log in as `alice@greenleaf.test` / `password123`.
  - **Known gap (not a bug):** P2P shows the *company* name where the *person* name should be ("StonePharm from StonePharm") because `InboxItemView.sender` carries only `companyName` - the accept wiring passes it as the person-name fallback. Resolves cleanly once real Supabase joins (or sender person names in connect's seed) land.
- **Steps 10-13 DONE (2026-06-08) - orchestrator, surface, wiring, live verify.** `ChatView.tsx` (the one stateful piece: conversations + filter + selected thread + stream; mirrors InboxView). `index.ts` public surface (`ChatView` / `acceptInbox` / `AcceptInput` + view types). Wired 2b: connect's `acceptItem` calls `messaging.acceptInbox(input)`; Chat tab flipped `soon -> active`; `/connect/chat` route mounts `<ChatView />`. Verified live: accept (pricelist) -> C2C (read-only, system line) + P2P (Sella intro) both appear in chat; sent a P2P line (right/brand); C2C has no composer; filters work.
- **Steps 5-9 DONE (2026-06-08) - the presentational components.** Typecheck + eslint clean. Built against the store's view shapes; none render until step 10 mounts them (same as 2a). Inherit 1a/2a design language exactly (glass, brand tokens, lucide, short dashes); `"use client"` deferred to the ChatView boundary (step 10) - leaves stay directive-free.
  - **`ConversationRow.tsx`** (5): pure row - c2c reads as the company (Building2 avatar + "Company chat (C2C)"), p2p as the person (initials + company subtitle); preview + brand unread chip; selected = brand-soft fill + left bar (reuses InboxRow idiom).
  - **`ConversationList.tsx`** (6): the `All / Unread / Companies` filter chips + stubbed New-chat/search; one row-set projected three ways (all = flat newest-first; unread = filtered; companies = grouped under a company heading, order preserved); per-filter empty copy. Exports `ChatFilter`.
  - **`MessageBubble.tsx`** (7): three voices by `sender` - system = centered quiet notice; sella = left assistant card w/ Sparkles mark; person = mine (right, brand) / theirs (left glass + avatar + name·time).
  - **`Composer.tsx`** (8): local text state, trims + submits via `onSend`, clears; disabled when empty. P2P-only (ThreadView gates it).
  - **`ThreadView.tsx`** (9): header (avatar + name + C2C/P2P tag + subtitle) + ordered stream (auto-scrolls to newest via a bottom ref) + composer **or** the c2c read-only hint.
- **Steps 3 + 4 DONE (2026-06-08) - reordered (4 before 3: the store depends on `previewOf`).** Typecheck + eslint clean on `src/modules/messaging/`.
  - **`lib/chat-display.ts` (step 4, pulled forward):** `formatTimeAgo` (just now/Nm/Nh/Nd/short-date) + `previewOf` (whitespace-collapse + ellipsis). Intentional small re-impl of connect's formatter - each module owns its display (no cross-import).
  - **`mock/store.ts` (step 3) - the ONLY throwaway:** in-memory `relationships/threads/messages` + `unreadByThread` + two join directories (`companies`/`people`) standing in for the joins a real select resolves. Anchored on GreenLeaf `aaaa…` / Alice `1111…` (matches connect's VIEWER); pre-seed 2 existing conversations (MedicoPharmaX/Anna 2-unread, Apo Berlin/Petra 1-unread) so the list isn't empty cold. **`acceptInbox(input)` (2b):** idempotent on `inbox_item_id`; mints `relationship` (status `active`, `initiated_by`=sender, `created_by`=viewer) + runs `planRollout` to create the c2c (+`connection_established`) and, for substantive types, the p2p (Sella intro + note); unread = seed lines not authored by me. **Reads (2c):** `getConversations` (newest-first, resolves c2c->other company / p2p->other person via directories), `getMessages` (ordered stream, `isMine`/author derived), `markRead`, `postMessage` (person line; **throws on a c2c thread** - read-only; ignores empty). All async + return cloned view shapes -> real-data swap is a body rewrite. Client module singleton: accept on /connect/inbox is visible after navigating to /connect/chat (note: full reload resets to pre-seed).
  - **Contract tweak:** added `initials` to `PartyCompany` in `types.ts` (symmetry with `PartyPerson`) so inbox + chat show the same company initials.
- **Step 2 DONE (2026-06-08).** `src/modules/messaging/lib/rollout.ts` - the §2 table as a **pure** function (`planRollout(AcceptInput) -> RolloutPlan`), typechecks clean. No ids/timestamps/I/O - returns plain `ThreadSpec[]` + `SeedMessageSpec[]` the store executes, so the rule survives the Supabase swap unchanged. C2C always (+ `connection_established` system line); P2P only for substantive types via `opensP2P` (exhaustive switch + `never` guard); `p2pSeed` exhaustive too (connect_message -> Sella `intro` + the note *if non-empty*; pricelist -> Sella intro; deal_card -> Sella intro **only**, gate deferred). P2P participants sorted by `canonicalPair` to satisfy the DB `person_a_id < person_b_id` CHECK. Sella copy = placeholder voice; sender = requester, viewer = recipient. Output spec types (`ThreadSpec`/`SeedMessageSpec`/`RolloutPlan`) live here (real logic, not throwaway), consumed by the step-3 store.
- **Step 1 DONE (2026-06-08).** `src/modules/messaging/types.ts` written + typechecks clean (`tsc --noEmit` exit 0). Binds to the generated `chat_thread` / `chat_message` / `relationship` Rows via `Database["public"]["Tables"][...]["Row"]` so it can't drift. Narrowed the four lookup `string` columns to their **seeded** code unions: `ThreadType = c2c|p2p|deal`, `MessageSender = person|system|sella` (human = `person`, not `user`), `MessageType` = the full seeded `chat_message_type` set (slice emits only `message`/`connection_established`/`intro`), `RelationshipStatus = active|suspended|ended`. Added narrowed rows (`ChatThread`/`ChatMessage`/`Relationship`), the UI projections (`ConversationListItem`, `ChatMessageView`), and the **accept contract** (`AcceptInput` + `AcceptRequestType`/`PartyCompany`/`PartyPerson`) - a plain DTO messaging owns so it never imports connect (one-directional dep). `AcceptRequestType` is a deliberate local copy of connect's `InboxRequestType` (bounded-context translation, not drift).

---

## Process for 2b+2c (same as every unit)

1. Write this plan (this file).
2. Ayush reviews + locks it. **No build until locked.**
3. Build per §5-§6 (UI-first, mock data).
4. Verify live (preview, zero console errors, screenshot).
5. **Ayush writes test cases + tests it.**
6. Pass -> next unit (2d realtime, 2e relationship page, then Deal 3a).

---

## 0. What this slice is (and is NOT)

**This slice = the demo's core loop: connect -> accept -> CHAT.** 2a built the Inbox (panels 2-4) and renders the *accepted state* but Accept does nothing real. This slice makes Accept **do** something and gives the conversation a home.

- **2b = what Accept actually does (the side-effects).** Accepting a ticket mints a **`relationship`** between the two companies, spawns a C2C **`chat_thread`** + its `connection_established` system line, and - for substantive requests - opens a **P2P** thread seeded by Sella.
- **2c = the chat surface.** `/connect/chat` lights up the **Chat** tab (greyed "soon" today). Conversation list (with `All / Unread / Companies` filters) -> a thread view (system / Sella / person bubbles) -> a composer that posts real messages into the P2P.

**The rollout model - LOCKED (2026-06-08, Ayush; = chat-prototype 2026-06-06 lock).** C2C fires on **every** accept; P2P fires only when the request carries substance:

| Accepted request | C2C thread | C2C seed (`sender=system`) | P2P thread | P2P seed |
|---|---|---|---|---|
| `connect` (bare) | always | `connection_established` | **no** | - |
| `connect_message` | always | `connection_established` | **yes** | Sella `intro` + the sender's note (`sender=person`) |
| `pricelist_request` | always | `connection_established` | **yes** | Sella `intro` (body carries the price-list ask) |
| `deal_card` | always | `connection_established` | **yes** | Sella `intro` only (**deal gate deferred - see §8**) |

**This slice is NOT:**
- **NOT the deal-card gate.** No `deal_detected` -> two-party confirm, no Deal chat (`deal` thread), no deal-card pin/flip/version/sync. A `deal_card` accept here just opens a P2P with a Sella intro. All of that is **3a+** (§8).
- **NOT realtime.** New messages appear via local state on send; cross-client realtime is **2d**.
- **NOT the relationship page.** Clicking a company deep-link is **2e**. CTAs may render but don't navigate.
- **NOT the Sella vetting rail wiring (panel 5).** Static stub only; AI is **4x**.
- **No Supabase, no auth, no real data.** Mock-first; mock types mirror the schema so mock -> real is a swap (same discipline as 2a).

> Reference: locked 5-panel Connect shell (`_workshop/pov/connect.md`): `1 global rail | 2 Connect sub-nav | 3 list | 4 detail/thread | 5 Sella rail`. Chat reuses the SAME shell; only panels 3-4 change content.

---

## 1. Design language

**Inherit 1a + 2a wholesale.** Same palette, glass recipe, tokens, `lucide-react` icons, short dashes, light-only. No new design language - the chat is new *content* in the locked shell, not a new shell.

- **Prototype = layout + behaviour reference only**, never visual quality. The prototype uses flat colors + emoji (🏢 👤 📄 🔍); we ship the pink/white/glass tool from 1a. **No emoji.**
- **Conversation list (panel 3)** mirrors the inbox list visual family - glass rows, avatar initials, selected = cotton-candy fill + left brand bar. Filter chips reuse the LensTabs visual idiom (pill chips, active = brand).
- **Message bubbles (panel 4)** split by `sender`:
  - `person` (a human) -> standard bubble; **mine** right-aligned brand-tinted, **theirs** left-aligned glass.
  - `sella` -> distinct "assistant" treatment (subtle brand-soft card + a small Sella mark), left-aligned, full width-ish. Neutral, facilitative voice.
  - `system` -> centered, quiet, non-bubble "notice" line (e.g. "GreenLeaf and StonePharm are now connected."). This is the C2C audit voice.
- **Composer** = glass input + brand send button. **Present only in P2P.** In a C2C thread the composer is replaced by a quiet hint: "This is the company channel - system updates only."

---

## 2. The rollout model - the heart of 2b (LOCKED)

Restated as rules (the table in §0 is the summary):

- **C2C = company notice board / audit log.** `sender=system`, neutral, durable. Created on **every** accept. Always gets `connection_established`. **Read-only** (no human composer). Purpose: the company-to-company connection is the durable, company-visible fact; anyone in the company can read it, and later message the company here without knowing a specific person.
- **P2P = where humans talk; Sella facilitates.** Opens only for the 3 substantive request types. Sella posts an `intro` (who's who + what they want); she **never** writes the business message for a party. The human's own note (for `connect_message`) lands as a `message` from `sender=person`. After that, humans type in the composer.
- **Bare `connect`** = a connection with nothing to say yet -> C2C only. You can open + read it, but there's no P2P and no composer until someone messages.

**Why this shape (bounded contexts):** C2C is the *shared/company* context (system voice, durable record); P2P is the *private/person* context (human voice, Sella as facilitator). One `chat_message` table carries both - discriminated by `sender` + `type` - so "system message" and "Sella message" are field values, not separate tables.

---

## 3. Chat surface anatomy (from chat-prototype - LOCKED)

### Conversation list (panel 3) - filter-driven, ONE list projected two ways
Top: `+ New Chat` (visual only this slice) + a search stub. Filter chips: **`All` · `Unread` · `Companies`** (default `All`). Source: `prototypes/chat-prototype/index.html` `chatList()`.

- **All** (default) = **person-centric flat list.** Every live thread + contact as its own row, newest first. A P2P row reads `Bob · StonePharm` (person first; company is the subtitle). A C2C row reads `StonePharm · Company chat`.
- **Companies** = **same rows regrouped under a company heading.** This is where the **C2C company channel** steps forward - the "message the whole company, not one person" path. Threads + contacts nest under each company name.
- **Unread** = only rows with `unread > 0`.

### Conversation row (panel 3)
avatar initials · name (person or company) · subtitle (`Company chat (C2C)` / `<Company>` for a P2P) · last-message preview · unread count chip (brand pill) · time-ago. Selected = cotton-candy glass fill + left brand bar.

### Thread view (panel 4) - header + stream + composer
- **Header:** avatar + name + a small type tag (`C2C` / `P2P`). (The prototype's "Talking about: deal-card pill" is **deferred** - no pinned card this slice.)
- **Message stream:** ordered by `created_at` asc. Bubbles by `sender` (§1). System lines centered; Sella lines as assistant cards; person lines as left/right bubbles.
- **Composer:** P2P only. Text input + Send -> appends a `message` (`sender=person`, `sender_person_id=viewer`). C2C -> read-only hint, no input.

### Empty / first-run states
- **No conversations yet** (before any accept, if we don't pre-seed) -> centered glass card "No conversations yet. Accept a request in your Inbox to start one." We **will pre-seed** 1-2 existing relationships+threads (like the prototype's `OTHERS`) so the list isn't empty on a cold open and the demo has texture.
- **C2C thread selected** -> stream of system line(s) + the read-only hint instead of a composer.
- **Filter with no rows** (e.g. `Unread` when all read) -> "Nothing unread."

---

## 4. Mock types -> schema map (mock-first, schema-shaped)

Module `messaging/types.ts` mirrors `chat_thread` / `chat_message` columns **exactly** (bind to the generated `Row` types, narrow the lookup-`code` columns to their seeded unions) so mock -> real Supabase is a swap, not a rewrite. Same discipline as `connect/types.ts` in 2a.

**Seeded code unions to encode verbatim** (from `supabase/migrations/20260607090001_lookups_and_seeds.sql` + `...090003_phase2_deal.sql`):
- `chat_thread.type` -> **`c2c | p2p | deal`** (this slice creates `c2c` + `p2p`; `deal` is 3a).
- `chat_message.sender` (FK `content_author.code`) -> **`person | system | sella`** (NOT `user` - the human code is `person`).
- `chat_message.type` (FK `chat_message_type.code`) -> seeded set; this slice uses **`message`, `connection_established`, `intro`**. (`deal_detected / deal_started / workspace_created / deal_opened / deal_cancelled / deal_card_updated` exist but are **3a+**.)

| Concept | `messaging/types.ts` | Real column / source |
|---|---|---|
| thread kind | `ThreadType` (`c2c`/`p2p`/`deal`) | `chat_thread.type` |
| which relationship | `relationshipId` | `chat_thread.relationship_id` (**NOT NULL**) |
| P2P participants | `personAId` / `personBId` | `chat_thread.person_a_id` / `person_b_id` (p2p only; **both required; canonical `person_a_id < person_b_id`** - sort the pair when minting) |
| message author class | `MessageSender` (`person`/`system`/`sella`) | `chat_message.sender` |
| which human | `senderPersonId` (null for system/sella) | `chat_message.sender_person_id` |
| message discriminator | `MessageType` | `chat_message.type` (default `message`) |
| body | `body` | `chat_message.body` |
| connection lifecycle | `RelationshipStatus` (`active`/`suspended`/`ended`) | `relationship.status` (this slice writes `active`) |
| ties back to the ticket | `inboxItemId` | `relationship.inbox_item_id` |

**UI projections** (the joined shapes the list + thread need - one Supabase select-with-joins in real land; the mock returns the same shape):
- `ConversationListItem` = thread + display fields (name, subtitle, initials, lastMessagePreview, unreadCount, company grouping key).
- `ChatMessageView` = message + derived `isMine` (sender_person_id === viewer) + display name/initials for the author.

**The accept contract (published language between `connect` and `messaging`):**
`messaging` defines `AcceptInput` (plain DTO: `inboxItemId`, `requestType`, `note`, the two companies' `{id,name}`, the viewer person `{id}`, the sender's contact person `{id, name}`). `connect.acceptItem` maps its `InboxItemView` -> `AcceptInput` and calls `messaging.acceptInbox(input)`. **`messaging` never imports `connect`'s row type** - the DTO is the seam, so the dependency is one-directional (`connect -> messaging`) with no cycle.

---

## 5. Files this slice creates / touches

A new `messaging` domain module (reached only via its `index.ts`), plus a tiny `connect` change + a new chat route.

```
src/
├── app/
│   └── connect/
│       └── chat/
│           ├── page.tsx              mounts <ChatView/> from the messaging module
│           └── (layout inherited from app/connect/layout.tsx - sub-nav already there)
└── modules/
    ├── messaging/                    NEW MODULE (mine)
    │   ├── index.ts                  PUBLIC surface: ChatView, acceptInbox, AcceptInput, view types
    │   ├── types.ts                  schema-shaped (§4): thread/message/relationship unions + Row binds + UI projections + AcceptInput
    │   ├── mock/
    │   │   └── store.ts              the ONE throwaway: in-memory relationships[]/threads[]/messages[]; pre-seed; getConversations / getMessages / postMessage (async) + acceptInbox side-effect (mints relationship + threads + seed lines)
    │   ├── lib/
    │   │   ├── rollout.ts            pure: requestType -> which threads + which seed lines (the §2 table as code; exhaustive switch w/ never-guard)
    │   │   └── chat-display.ts       formatTimeAgo (reuse pattern), initials, last-message preview, grouping key for "Companies"
    │   └── components/
    │       ├── ChatView.tsx          orchestrator (only stateful piece): selected thread id + active filter; loads store; lays out list (3) + thread (4) in the glass shell
    │       ├── ConversationList.tsx  panel 3: filter chips (All/Unread/Companies) + rows; flat vs grouped by filter
    │       ├── ConversationRow.tsx   one presentational row (avatar, name, sub, preview, unread, time)
    │       ├── ThreadView.tsx        panel 4: header + message stream + composer (composer hidden for c2c)
    │       ├── MessageBubble.tsx     one message, styled by sender (person mine/theirs · sella card · system notice)
    │       └── Composer.tsx          text input + Send; posts a person `message`; disabled/absent for c2c
    └── connect/
        ├── index.ts                  unchanged surface (still exports InboxView/types)
        └── mock/inbox.mock.ts        acceptItem now ALSO calls messaging.acceptInbox(input) (the only 2b edit on the connect side)
```

- **`ChatView` is the only client component holding state** (selected thread, active filter, the in-memory message list it mutates on send). List/rows/thread/bubbles/composer are presentational.
- **Shared mock store lives in `messaging`** so accept (connect) writes the thread that chat (messaging) reads - one source of truth. `connect` reaches it only through `messaging.acceptInbox`; it never touches the store directly.
- **`connect/layout.tsx` already renders the sub-nav** (built in 2a) - `/connect/chat` just slots in as a sibling of `/connect/inbox`; ConnectSubNav flips Chat from "soon" to active.

---

## 6. Build steps (in order) - run AFTER Ayush locks this plan

1. **`messaging/types.ts`** - encode the schema-shaped thread/message/relationship unions + `Row` binds + UI projections (`ConversationListItem`, `ChatMessageView`) + the `AcceptInput` DTO (§4). The contract everything else builds on.
2. **`messaging/lib/rollout.ts`** - pure function: `requestType -> { createP2P: boolean, c2cSeed, p2pSeed[] }` encoding the §2 table (exhaustive switch, `never` guard). No I/O - this is the rule, tested in isolation.
3. **`messaging/mock/store.ts`** - in-memory `relationships/threads/messages`; **pre-seed** 1-2 existing relationships + threads (a couple of read C2C + an active P2P) so the list is non-empty cold. Async accessors `getConversations()` / `getMessages(threadId)` / `postMessage(threadId, body)` returning the real view shapes + the **`acceptInbox(input)`** side-effect that calls `rollout`, mints the `relationship` + `c2c` thread (+ `p2p` when substantive, canonical-ordered people), and inserts the seed `chat_message`s. The ONLY throwaway file.
4. **`messaging/lib/chat-display.ts`** - `formatTimeAgo`, `initials`, `lastMessagePreview`, company grouping key (shared by list + thread; no dup).
5. **`ConversationRow.tsx`** - one presentational row (full anatomy §3). Build against one mock conversation.
6. **`ConversationList.tsx`** - filter chips (All/Unread/Companies) + the two projections (flat / grouped) + empty states (§3).
7. **`MessageBubble.tsx`** - render each `sender` correctly: person mine/theirs, sella assistant card, system centered notice.
8. **`Composer.tsx`** - input + Send -> `postMessage` (person `message`). Absent for c2c (read-only hint instead).
9. **`ThreadView.tsx`** - header (name + C2C/P2P tag) + ordered stream + composer slot. Drives off the selected thread.
10. **`ChatView.tsx`** - wire it: selected-thread + active-filter state, load store, lay out list (panel 3) + thread (panel 4) in the glass shell. Optional panel-5 Sella stub.
11. **`messaging/index.ts`** - export `ChatView`, `acceptInbox`, `AcceptInput`, view types (the module's only public surface).
12. **Wire 2b into connect** - `connect/mock/inbox.mock.ts` `acceptItem` maps `InboxItemView -> AcceptInput` and calls `messaging.acceptInbox` after flipping status. Flip ConnectSubNav `chat` state `soon -> active`; add `app/connect/chat/page.tsx` mounting `ChatView`.
13. **Verify** - preview on :3000 (log in as `alice@greenleaf.test` / `password123` first; **bounce the dev server** `rm -rf .next` + restart if rebased). Walk: accept a bare `connect` -> a C2C appears in Chat, read-only, `connection_established` line; accept a `connect_message` -> C2C + a P2P with Sella intro + the note; type in the P2P composer -> the message appears; C2C shows no composer; switch All/Unread/Companies and confirm the projections. Zero console errors. Screenshot.

---

## 7. Done when (slice acceptance)

- [ ] **2b - Accept side-effects (mock):** accepting mints a `relationship` (`status=active`, `inbox_item_id` set) + a `c2c` thread with a `connection_established` system line. Substantive types also open a `p2p` thread seeded with a Sella `intro` (+ the note for `connect_message`). Bare `connect` = C2C only.
- [ ] **2c - Chat surface:** `/connect/chat` shows the Chat tab active inside the 2a shell; list with `All / Unread / Companies` filters (default All); thread view renders system / Sella / person messages correctly.
- [ ] **Composer:** posts a real `person` `message` into a P2P and it appears; **C2C has no composer** (read-only hint).
- [ ] **Filters:** All = person-centric flat; Companies = grouped, C2C surfaces; Unread = unread-only + empty copy.
- [ ] **Schema fidelity:** mock types mirror `chat_thread` / `chat_message` / `relationship` columns; `sender` uses `person|system|sella`; P2P people canonical-ordered; modules reached only via their `index.ts`; `connect -> messaging` dependency is one-directional via `AcceptInput`.
- [ ] Pink/white/glass, professional, **zero console errors**, screenshot captured. Typecheck + eslint clean.

## 8. Deliberately deferred (NOT this slice)

- **The deal-card gate (3a+):** `deal_detected` -> two-party confirm, Deal chat (`deal` thread), `workspace_created` / `deal_cancelled`, the pinned deal-card pill + flip dialog + version/log, and the P2P<->Deal **card sync**. A `deal_card` accept here is just a P2P + Sella intro.
- **2d - realtime:** cross-client live updates / subscriptions. This slice updates via local state on send only.
- **2e - relationship page:** the company deep-link / relationship detail. CTAs may render but don't navigate.
- **Real Supabase + auth + RLS-scoped reads.** Mock store only; swap behind `messaging/index.ts` later.
- **Sella rail (panel 5) wiring** = 4x; static stub at most.
- **`+ New Chat`, functional search, DE/EN i18n** - visual stubs only.
