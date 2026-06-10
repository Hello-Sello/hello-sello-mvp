# Build Plan - 2d: Realtime + go-real (Connect chat on Supabase)

**Status: ✅ 2d COMPLETE (all 7 phases done + verified, 2026-06-09). Uncommitted on `claude/ayush/work` - awaiting Ayush's go to commit/push.**
**Created:** 2026-06-09 17:15 CEST (Ayush). **Owner:** Ayush. **Demo:** 2026-06-11.
**Unit:** Connect 2d (`docs/PRD/BUILD-PLAN.md:83`). Follows 2a (inbox) + 2b/2c (accept -> chat).

> This is our build doc ("PRD for 2d"). It does not re-decide product. The product
> PRD is `docs/PRD/connect-demo.md` (O3 = "chat is real-time, Supabase Realtime").
> This doc says HOW we make the Connect backend real, in phases and tasks we run one by one.

---

## Build log

*(append as we go - one line per step, like 2a/2b-2c)*

- 2026-06-09 17:15 CEST - Plan drafted from the backend research pass (see below). Awaiting lock.
- 2026-06-09 17:33 CEST - Seed strategy decided with Ayush. **Real logins, not C2C-only.** 5 companies, one login person each (Alice + Bob exist; 3 new created via SQL). Two connected with C2C + P2P + messages; two left unconnected as pending inbox requests so the accept->chat->realtime loop is testable. Realistic-fictional names; every seeded row tagged `metadata.seed = "demo-2d"` for one-command cleanup. **Canadian Craft / Marcel excluded** (real customer). Scope now includes flipping the **inbox read (2a)** to real.
- 2026-06-09 18:00 CEST - Phases expanded to full build-level detail (§6.0 reference facts: confirmed columns, lookup codes, the 3-step login recipe, cleanup). Schema checked live against `byipusuthdlskdxoexkt`. Still awaiting lock.
- 2026-06-09 18:18 CEST - **LOCKED by Ayush. Phase 1 started.** pgcrypto confirmed in `extensions` schema (use `extensions.crypt`/`gen_salt`). Creating Clara's login first to prove the recipe before the other two.
- 2026-06-09 18:29 CEST - **Phase 1 DONE + verified live.** 3 logins (Clara/David/Eva) created - all 3 authenticate against the auth endpoint. 3 companies; 2 relationships (GreenLeaf<->StonePharm rich = c2c + p2p + 5 msgs; GreenLeaf<->Rheinland medium = c2c + p2p + 3 msgs); 2 pending to GreenLeaf (NordCanna `connect_message`, Bavaria `connect`). **RLS proof (real tokens):** Alice sees 2 rel / 10 msgs / 2 pending; Eva (unconnected) sees 0 rel / 0 msgs / 1 own pending. **Learned:** `relationship` enforces canonical order `company_a_id < company_b_id` (use `least`/`greatest`). Canonical file: `supabase/migrations/20260609180000_seed_demo_world.sql` (idempotent). Data is in the DB; the APP still shows the mock until Phase 3.
- 2026-06-09 20:13 CEST - **Phase 7 (e2e verify + wrap) DONE - 2d COMPLETE.** Final `tsc` clean; no console errors across inbox + chat. Deleted the replaced mocks (`messaging/mock/store.ts`, `connect/mock/inbox.mock.ts` - confirmed only comment refs remained). Restored the DB to the pristine seed (undid the live-test NordCanna accept → back to pending; removed the 4 test lines): relationships=2, threads=4, messages=10, pending=2. Flipped `docs/PRD/BUILD-PLAN.md` 2b/2c/2d → ✅ done (status-cell, lock-exempt). Updated `CLAUDE.md` (Last session / What's next → 2e) + `docs/team/sync/ayush.md` (incl. a Muskan note on the 3 RLS migrations). **Not committed/PR'd yet - awaiting Ayush.** Outstanding for commit: tell Muskan via AGENTS.md checkpoint / her sync (the RLS changes touch her area) - needs the shared-file sync ritual on push.
- 2026-06-09 20:02 CEST - **Phase 6 (optimistic + unread) DONE + verified live.** All in `ChatView`. **Optimistic send:** append a temp `ChatMessageView` (isMine, temp id) instantly; the canonical refetch from `postMessage` (and the realtime echo) replace the whole list, so the temp is swapped for the real row - no client-id dedupe needed (whole-list replace). **Unread:** in-memory `Record<threadId, count>` in ChatView (localStorage persistence deferred - not needed for the demo); realtime increments it for any non-open thread, opening a thread clears it; overlaid onto the list rows (`listConversations`) so the badge + the "Unread" filter both reflect it. **Scroll-to-latest** already existed in `ThreadView` (scrolls on `messages.length`). `tsc` clean. **Verified (preview as Alice):** typed a message -> shows instantly (1 bubble at 120ms) and stays exactly once (a first "2 copies" reading was a miscount - it counted the conversation-list preview + the thread bubble; confirmed inThread=1, inList=1); inserted a message as Clara into a non-open thread -> her row showed unread "1" and the Unread filter showed only her; opening her thread cleared it ("Nothing unread"); no console errors. **Test lines to trim at wrap:** "Thanks David…", "Realtime check from Bob…", "Optimistic test…", "Unread test from Clara…".
- 2026-06-09 19:50 CEST - **Phase 5 (realtime) DONE + verified live.** Migration `20260609194500_realtime_chat_publication.sql` adds `chat_message` + `chat_thread` to the `supabase_realtime` publication. New hook `messaging/lib/use-chat-realtime.ts`: sets the session token via `realtime.setAuth` (required, else anon → no events), subscribes ONCE to `postgres_changes` INSERT on both tables, handlers kept in a ref so the open-thread closure stays current; `ChatView` mounts it (message in open thread → refetch stream; any message / new thread → refetch list). Confirmed via Supabase docs: Postgres Changes is GA + delivers each row only to subscribers whose RLS SELECT policy allows it. `tsc` clean. **Verified (preview as Alice, no reload):** inserted a message as Bob (SQL) → it appeared live in the open thread (Bob markers 3→4) AND bumped the conversation list to top with the new preview; path never changed; no console errors. **Privacy:** enforced by the SAME SELECT policy proven in Phase 1 (Eva sees 0 messages → 0 events); a literal third-subscriber test is left for the two-window demo. **Note:** two test lines remain in the DB ("Thanks David…" from Alice, "Realtime check from Bob…") - harmless demo content; can be trimmed at wrap.
- 2026-06-09 19:41 CEST - **Phase 4 DONE + verified live.** Real writes: `postMessage` + `acceptInbox` (messaging/supabase/store) and `claimItem`/`assignItem`/`acceptItem`/`declineItem` (connect/supabase/inbox); `messaging/index.ts` re-points `acceptInbox` to the real store; `ChatView` send + `InboxView` action handlers wired. Module boundary kept: connect flips the inbox-item status, messaging creates the relationship+threads (creation first, status flip second, so a failure stays retryable). **Verified:** accepted NordCanna -> real relationship + c2c + p2p + 3 seed lines (system/sella/person) -> appears live in chat; typed a message -> persists across a full reload (real DB row); `tsc` clean; no console errors. **Two bugs found + fixed during verify:** (1) ambiguous embed - `person`<->`company` have several FKs, so `company:company(...)` returned `300`; fixed with explicit hint `company:company!person_company_id_fkey`. (2) **ROOT-CAUSE RLS fix** - `chat_thread`'s SELECT policy was `can_access_thread(id)`, which re-queries the table for the row's own id, so any `INSERT ... RETURNING` (`.select()`) by a normal user was denied (42501); the seed only worked because the service role bypasses RLS. Rewrote `thread_all` USING to check the row's OWN columns directly (migration `20260609193000_rls_thread_select_inline.sql`) - now insert+read works for any user/any code; `can_access_thread` stays for `chat_message` (points at an existing thread). **State:** NordCanna is now accepted (real chat + an Alice test line); Bavaria stays pending for a live-accept demo. **Cleanup note:** accept-created relationships aren't seed-tagged; they link via `inbox_item_id` to a `demo-2d` pending item - clean them with `delete from relationship where inbox_item_id in (select id from pending_inbox_item where metadata->>'seed'='demo-2d')`.
- 2026-06-09 19:05 CEST - **Phase 3 DONE + verified live.** New `messaging/supabase/store.ts` (real `getViewerPersonId` / `getConversations` / `getMessages` / `markRead`, browser client, RLS-scoped; viewer from session). `getConversations` uses **flat queries + JS stitch** (threads/relationships/companies/people/messages) to avoid fragile 2-level nested joins; `getMessages` uses a single-level author embed. `ChatView` re-pointed to the real store; send is an inert refetch until Phase 4. `markRead` is a server no-op (client unread = Phase 6). `tsc` clean. **Verified (preview as Alice):** list shows the 4 real threads (Clara/Bob P2P + 2 C2C) with real names + previews, newest-first; Clara thread (3 msgs) and Bob thread (5 msgs) both render with correct mine/theirs sides; Sella context reads the real counterpart; no console errors. The counterparty-name RLS fix from Phase 2 carried the chat (no new RLS needed).
- 2026-06-09 18:56 CEST - **Phase 2 DONE + verified live.** New `connect/supabase/inbox.ts` (real `getInbox` / `getViewerContext` / `getAssignableMembers`, browser client, RLS-scoped); `InboxView` now loads viewer (session) + team + items async; inbox WRITES still stub (refetch) until Phase 4. `tsc` clean; inbox renders the 2 real pending requests, no console errors. **Foundation RLS gap found + fixed (Muskan's area, approved by Ayush):** base `company_select`/`person_select` allowed reading ONLY your own company/people, so counterparties showed "Unknown company". Added WhatsApp-style counterparty visibility (name only, when a relationship or pending link exists) via SECURITY DEFINER helpers `shares_connection_with_company` / `can_see_person` - migration `supabase/migrations/20260609183000_rls_connect_counterparty_visibility.sql`. **Re-proof:** Alice now sees 5 company names + 5 people; Eva still sees only GreenLeaf+Bavaria names, 0 rel / 0 msgs (isolation holds). **TODO (note):** the top-bar account chip is hardcoded "Aurora Deutschland GmbH" (1a placeholder) - wire to the real session in a later polish pass.

---

## Process for 2d (same as every unit)

1. Ayush locks this plan (propose-mode - nothing is built before the lock).
2. Build **phase by phase, task by task, in order**. One atomic commit per task (or small group).
3. **Verify live after each phase** before moving on (preview as Alice; DB checks via Supabase MCP).
4. Wrap: flip the 2d status in `docs/PRD/BUILD-PLAN.md` (status-cell = lock-exempt), update `CLAUDE.md` (Last session / What's next), sync file, commit + push.

---

## 0. What 2d is (and is NOT)

**2d IS:** make the Connect chat *real*, end to end. It closes the three gaps the research found, and (because the loop needs it) also flips the inbox read to real:

- **Seed a real test world (Gap 3):** 5 companies, one login each, with connected relationships (C2C + P2P + messages) and pending inbox requests - so we can test P2P chat, realtime, and later the deal chat, not just the company notice board.
- **Go real (Gap 2):** swap the messaging data layer (and the inbox read) from the in-memory mock to Supabase. Same function names behind `index.ts`, same view shapes - so **no UI redesign**. The viewer's identity comes from the logged-in session, not a hardcoded constant.
- **Realtime (Gap 1):** a new message (or thread) appears on the *other* person's screen live, no refresh.

**2d is NOT:** a UI redesign (the 2a/2b/2c components stay); **not 2e** (relationship page + chat top bar); **not 3a** (deal card - the seed leaves a `relationship_id` ready for it); **not audit wiring** (own pass right after); **not** multi-user-per-company / presence / typing.

---

## 1. What is already done (the foundation we ride on)

Checked live against project `byipusuthdlskdxoexkt` on 2026-06-09. This is why 2d is small.

| Foundation | State | Evidence |
|---|---|---|
| Chat tables exist | ✅ | `relationship`, `chat_thread`, `chat_message`, `pending_inbox_item`; RLS on |
| RLS allows BOTH parties | ✅ | `can_access_thread` (`rls_policies.sql:117`): C2C = both companies, P2P = both people; `inbox_select` = sender + receiver |
| Auth + login recipe known | ✅ | `handle_new_user` trigger auto-creates `person`; login = `auth.users` + `auth.identities` (email) |
| Demo accounts seeded | ✅ | `alice@greenleaf.test` (GreenLeaf) + `bob@stonepharm.test` (StonePharm), `password123` |
| `person.id == auth.uid()` | ✅ | true for all users - the key the RLS rules depend on (Alice's id = `11111111-...`) |
| `metadata` JSON on company + person | ✅ | lets us tag every seeded row `seed=demo-2d` for exact cleanup |

**Consequence:** we do NOT write RLS, touch auth design, or take over Muskan's security work. We add data, swap the data layer, and turn realtime on.

---

## 2. The three gaps 2d closes (mapped to phases)

| Gap | What is wrong today | Closed in |
|---|---|---|
| **Gap 3** - empty world | 0 relationships / threads / messages / pending in the real DB | Phase 1 |
| **Gap 2** - code on mock | inbox read + `getConversations / getMessages / postMessage / acceptInbox / markRead` read in-memory arrays; viewer id hardcoded | Phases 2 (inbox) + 3 (chat reads) + 4 (writes) |
| **Gap 1** - realtime off | no table in `supabase_realtime`; no client subscription | Phase 5 |

> **Order note (the WHY):** realtime comes *last of the three*, because it has nothing to broadcast until writes are real, and reads have nothing to show until data exists. Dependency order: **seed -> reads -> writes -> realtime -> polish**.

---

## 3. Architecture - how the swap works (the model)

- **Only the data layer changes.** `index.ts` re-points from the `mock/` store to a real `supabase/` store. Components, `types.ts`, and `lib/rollout.ts` (the C2C-always / P2P-for-substantive **logic**) are untouched. Mock files stay as reference until wrap. Same in the `connect` module for the inbox read.
- **Client-side via the browser client** (`shared/db/client.ts`), keeping the same `async` signatures the components already call - because realtime must run client-side anyway, one RLS-scoped browser client keeps it simple.
- **Viewer identity from the session** (`auth.uid()`), replacing the hardcoded `VIEWER_PERSON_ID`.
- **Realtime is additive** - a small client hook; no visual redesign.
- **Optimistic send** - show the message instantly, reconcile on the realtime echo (dedupe by a client id).

`★ The swap-to-real principle:` the mock returns the *same shape* a real `select`-with-joins returns, so going real is a body rewrite behind one file boundary, not a rebuild.

---

## 4. The seed design (Gap 3) - 5 companies, real logins, reusable

A **committed, idempotent seed SQL** (in `supabase/migrations`, team-shared). **Every seeded row carries `metadata.seed = "demo-2d"`** so cleanup is one delete-by-tag - real rows (Canadian Craft / Marcel) are **never** referenced.

| Company | Person | Login (all `password123`) | Role | Connected? |
|---|---|---|---|---|
| GreenLeaf Cultivation *(exists)* | Alice Green | `alice@greenleaf.test` | seller / cultivator | home / viewer |
| StonePharm *(exists)* | Bob Stone | `bob@stonepharm.test` | buyer / pharmacy | ↔ GreenLeaf - **rich** (C2C + P2P + ~5 msgs) |
| Rheinland Apotheke GmbH *(new)* | Clara Vogt | `clara@rheinland.test` | buyer / pharmacy | ↔ GreenLeaf - medium (C2C + P2P + ~3 msgs) |
| NordCanna Distribution GmbH *(new)* | David Berg | `david@nordcanna.test` | buyer / distributor | **not connected** - pending `connect_message` to GreenLeaf |
| Bavaria Medical Cannabis GmbH *(new)* | Eva Klein | `eva@bavaria.test` | buyer / distributor | **not connected** - pending bare `connect` to GreenLeaf |

**Why this shape:** real logins let us test C2C, **P2P**, realtime now and the **deal chat** later (3a); the two pending requests give a live "accept and watch the chat be born" moment; the connected `relationship.id`s are exactly what 3a + 2e attach to (seed the substrate once, reuse it).

---

## 5. Files 2d creates / touches

**Creates:** `supabase/migrations/<ts>_seed_demo_world.sql` (Phase 1) · `supabase/migrations/<ts>_realtime_chat_publication.sql` (Phase 5) · `src/modules/messaging/supabase/store.ts` (Ph 3-4) · `src/modules/connect/supabase/inbox.ts` (Ph 2,4) · `src/modules/messaging/lib/use-chat-realtime.ts` (Ph 5).

**Touches:** `messaging/index.ts` + `connect/index.ts` (re-point to real) · `messaging/components/ChatView.tsx` (realtime hook + optimistic send) · `app/connect/chat/page.tsx` + `app/connect/inbox/page.tsx` (pass session person id if needed). No `database.types.ts` regen (no column changes).

---

## 6. Phases & tasks (in order) - run AFTER Ayush locks

Each task = one atomic commit (or a tight group). Each phase ends with a live verify before the next. **§6.0 holds the confirmed facts so building needs no re-research.**

### 6.0 Reference - confirmed schema facts (checked 2026-06-09, `byipusuthdlskdxoexkt`)

**Lookup codes - use these exact strings:**

| Column | Allowed codes |
|---|---|
| `pending_inbox_item.type` (`inbox_request_type`) | `connect`, `connect_message`, `pricelist_request`, `deal_card` |
| `pending_inbox_item.status` | `pending`, `accepted`, `rejected` |
| `company.verification_status` | `pending`, `verified`, `rejected` |
| `relationship.status` | `active`, `suspended`, `ended` |
| `chat_thread.type` | `c2c`, `p2p`, `deal` |
| `chat_message.sender` (`content_author`) | `person`, `system`, `sella` |
| `chat_message.type` | `message`, `connection_established`, `intro`, `deal_detected`, `deal_started`, `workspace_created`, `deal_opened`, `deal_cancelled`, `deal_card_updated` |

**Columns you must supply (the rest default):**

- `company`: `name`, `country` (char(2) e.g. `'DE'`), `verification_status` (`'verified'`).
- `relationship`: `company_a_id`, `company_b_id`, `initiated_by_company_id` (status defaults `active`; `inbox_item_id` null for pre-seeded). **Canonical-order CHECK: `company_a_id < company_b_id` - use `least()`/`greatest()`, never assume company_a = home.**
- `chat_thread`: `relationship_id`, `type` (person_a/b null for c2c; **no `metadata` column** - clean up via `relationship_id`).
- `chat_message`: `thread_id`, `sender`, `body` (type defaults `message`; metadata defaults `{}`).
- `pending_inbox_item`: `type`, `sender_person_id` (NOT NULL), `sender_company_id`, `receiver_company_id` (status defaults `pending`; `note` nullable).
- `person`: trigger sets `id`/`first_name`/`last_name`; we `UPDATE company_id` + `metadata` tag after.

**Login recipe (per new user) - the confirmed 3 steps:**

```sql
-- (a) auth user — the on_auth_user_created trigger auto-inserts public.person(id, first_name, last_name)
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','clara@rheinland.test',
  crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  jsonb_build_object('first_name','Clara','last_name','Vogt'), now(), now());
-- (b) email identity — login SILENTLY FAILS without this
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select id, id, jsonb_build_object('sub',id::text,'email',email,'email_verified',true,'phone_verified',false),
  'email', now(), now(), now() from auth.users where email='clara@rheinland.test';
-- (c) attach company + tag
update public.person set company_id=(select id from company where name='Rheinland Apotheke GmbH'),
  metadata=jsonb_build_object('seed','demo-2d')
where id=(select id from auth.users where email='clara@rheinland.test');
```

> - Confirm `crypt`/`gen_salt` schema (likely `extensions.`) when writing.
> - If a login errors on null tokens, set `confirmation_token`/`recovery_token`/`email_change`/`email_change_token_new = ''` (known GoTrue quirk).
> - **Test one real login via preview before trusting all three.**
> - Resolve existing ids (GreenLeaf, StonePharm, Alice, Bob) by `name`/`email` lookup - never hardcode uuids.

**Cleanup (anytime, safe):** `delete from relationship where metadata->>'seed'='demo-2d';` · `delete from pending_inbox_item where metadata->>'seed'='demo-2d';` · `delete from auth.users where email in ('clara@rheinland.test','david@nordcanna.test','eva@bavaria.test');` (cascades person + identity). Untagged real rows are never hit.

---

### Phase 1 - Seed the demo world (Gap 3)

One idempotent file `supabase/migrations/<ts>_seed_demo_world.sql`:

1. **3 logins** (recipe §6.0) - Clara, David, Eva. Guard: skip if the email exists.
2. **3 companies** - Rheinland Apotheke GmbH, NordCanna Distribution GmbH, Bavaria Medical Cannabis GmbH (`'DE'`, `'verified'`, tagged); then set each new person's `company_id`.
3. **GreenLeaf <-> StonePharm (rich):** relationship (a=GreenLeaf, b=StonePharm, initiated_by=StonePharm, created_by=Alice, tagged); c2c thread + `connection_established` ("GreenLeaf Cultivation and StonePharm are now connected."); p2p thread (canonical Alice/Bob order) + ~5 `message` lines alternating Bob (buyer) / Alice (seller) about an indica-flower order (qty / price / delivery).
4. **GreenLeaf <-> Rheinland (medium):** same shape; p2p Alice<->Clara; ~3 lines.
5. **Pending:** NordCanna -> GreenLeaf (`connect_message` + note) and Bavaria -> GreenLeaf (bare `connect`). Both `pending`, tagged. (Two branches: `connect_message` opens a P2P on accept; bare `connect` = C2C only.)
6. Apply via Supabase MCP.
7. **Verify:** (a) the 3 logins authenticate - **log in as Clara via preview once** to prove it; (b) counts: relationship +2, pending +2, +3 companies/persons; (c) RLS - as Alice, exactly 2 relationships + 2 pending; as Clara, only Rheinland's; a third party none.

### Phase 2 - Inbox read go-real (2a)

Mirror `connect/mock/inbox.mock.ts`'s `InboxItemView` shape (already schema-shaped).

1. Add `connect/supabase/inbox.ts`: `getInbox()` -> `select pending_inbox_item` (RLS auto-scopes to the viewer's company) join `company` (sender name/initials/verified) + `person` (assignee); `mutualCount` 0 for now; map to `InboxItemView[]`, newest first. `getAssignableMembers()` -> `select person where company_id = current company`.
2. Re-point `connect/index.ts` read exports to the real file (keep mock writes for now).
3. **Verify (preview as Alice):** inbox shows NordCanna + Bavaria pending; lenses/counts right; no console errors.

### Phase 3 - Chat reads go-real + session identity (2c read)

Mirror `messaging/types.ts` view shapes.

1. Add `messaging/supabase/store.ts` (browser client): `getViewerPersonId()` (from `auth.getUser()`); `getConversations()` (`select chat_thread` RLS-scoped, join `relationship` -> other company (c2c) / other person+company (p2p); last message via ordered subquery; `unreadCount` baseline 0); `getMessages(threadId)` (ordered, join `person`, `isMine = sender_person_id === viewer`); `markRead(threadId)` (client-side last-seen; server no-op - no read-receipt table in scope).
2. Re-point `messaging/index.ts` reads; replace hardcoded `VIEWER_PERSON_ID` with `getViewerPersonId()`.
3. **Verify (preview as Alice):** list shows StonePharm + Rheinland; threads render with correct sides; log in as Bob -> he sees the StonePharm side; no console errors.

### Phase 4 - Writes go-real (2b accept + 2c send + inbox actions)

1. `postMessage(threadId, body)` -> insert `chat_message` (`sender='person'`, `sender_person_id`=viewer, body); return refreshed stream.
2. Real `acceptInbox(input)` -> one logical unit: `update pending_inbox_item set status='accepted'`; insert `relationship` (inbox_item_id=item); run `planRollout(input)` (unchanged) and insert each thread + seed lines. Idempotent on `inbox_item_id`.
3. Real inbox writes in `connect/supabase/inbox.ts`: `claimItem`/`assignItem` (`update assigned_*`), `acceptItem` (build `AcceptInput` from the joined row + session, call `acceptInbox`), `declineItem` (`update status='rejected'`). Re-point the write exports.
4. **Verify:** send a message -> survives a full reload; accept NordCanna -> a real relationship + new chat (C2C + P2P + Sella intro) appears.

### Phase 5 - Realtime (Gap 1)

1. Migration `<ts>_realtime_chat_publication.sql`: `alter publication supabase_realtime add table chat_message, chat_thread;`. **First** confirm via Supabase docs that Postgres Changes respects the `SELECT` RLS; then verify a third company gets no events.
2. Add `messaging/lib/use-chat-realtime.ts` (browser client): one channel, `.on('postgres_changes', {event:'INSERT', schema:'public', table:'chat_message'}, ...)`; event in the open thread -> append (dedupe vs optimistic by `client_id` in `metadata`); else bump that conversation row + unread. Also subscribe to `chat_thread` INSERT so a freshly-accepted relationship appears live. Clean up the channel on unmount.
3. Mount the hook in `ChatView`.
4. **Verify (core 2d proof):** preview as Alice on the Alice<->Bob thread; insert a message as Bob (SQL-as-Bob, or 2nd login) -> appears with no reload. Accept on the other side -> new thread shows live.

### Phase 6 - Optimistic send + unread polish (the "feel")

1. Optimistic send: render immediately with a `client_id` in `metadata`; insert with the same `client_id`; on the realtime echo, replace the temp row (dedupe by `client_id`).
2. Unread: client-tracked (localStorage last-seen per thread); realtime insert in a non-open thread -> increment; opening -> `markRead` clears.
3. Polish: scroll-to-latest on a new message.
4. **Verify:** send feels instant; no duplicate when the echo lands; unread increments + clears.

### Phase 7 - End-to-end verify + wrap

1. Full two-screen walk (Alice + Bob): live message both ways; accept a pending -> chat born; privacy (a non-member cannot read).
2. `tsc` clean (`node node_modules/typescript/bin/tsc`); no console errors.
3. Flip 2d status in `docs/PRD/BUILD-PLAN.md` to done (status-cell, lock-exempt). Update `CLAUDE.md` (Last session / What's next), sync file. Delete the mock stores if fully replaced. Commit + push.

---

## 7. Done when (2d acceptance)

- [ ] Seed: 5 companies, 3 new logins that authenticate, 2 connected relationships (C2C + P2P + messages), 2 pending requests - all tagged `demo-2d`.
- [ ] Inbox shows the seeded pending requests (real read), as Alice.
- [ ] Chat renders from Supabase as Alice (list + threads), correct sides, no console errors.
- [ ] Bob (and Clara) see their shared threads; a third company sees nothing (RLS holds).
- [ ] Send persists across a full reload.
- [ ] Accept a pending request -> real relationship + chat appears.
- [ ] A message inserted as Bob appears on Alice's screen **live, no reload**.
- [ ] Optimistic send feels instant; no duplicate when the echo lands; unread increments + clears.
- [ ] `tsc` clean.

---

## 8. Deliberately deferred (NOT 2d)

- **2e** - relationship page + the "My Relationship with ..." chat top bar.
- **3a** - deal card / deal thread (seed leaves the `relationship_id`s ready).
- **Audit wiring** - `audit_log` rows for system/Sella lines; own small pass right after 2d.
- **`REPLICA IDENTITY FULL`** - only for broadcasting UPDATE/DELETE later; INSERTs broadcast fine on default.
- **Presence / typing indicators**, multi-user-per-company.
- **Security advisor hardening** (SECURITY DEFINER helpers callable by anon; leaked-password protection off) - pre-existing foundation warnings, a later cleanup with Muskan.

---

## 9. Open risks / things to confirm during build

- **Realtime + RLS for Postgres Changes** - confirm the `SELECT` policy gates who receives events (privacy). Check docs in Phase 5; verify a third company gets nothing.
- **Login creation via SQL** - recipe confirmed; verify `crypt`/`gen_salt` schema + the GoTrue null-token quirk; test one login via preview before trusting all three.
- **Unread model** - no read-receipt table in scope; derive client-side (localStorage last-seen). Decide details in Phase 6.
- **Two-screen verify limit** - the preview is one session; during build prove realtime by "preview as Alice + insert as Bob via SQL". Real two-window steps go to Ayush for June 11.
