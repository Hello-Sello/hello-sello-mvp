# Deal Creation & Delivery (Lane A) — create from any chat, delivered to company or person
**Status:** ✅ Built 2026-07-20 (A1–A5 + A7 + A8; A6 dissolved as planned) · **Size:** L (8 slices) · **Owner:** Muskan
**Gate:** fresh `db reset` → pgTAP probes (`deliver_deal_test.sql`, `claim_deal_ticket_test.sql`) green · 23 e2e passed / 5 pre-existing skips · tsc + eslint clean · 251/251 unit. **Cloud:** 4 migrations PENDING (ledger) — needs Ayush's review (`create_deal_draft` re-emit + `deal_member` write are his lane). Playwright now `workers: 1` (shared-relationship collision across spec files — see ARCHITECTURE-NOTES 2026-07-20).

## Goal
A user can create a deal from **any** chat, and it reliably reaches its recipient:
- Sent to a **company** (c2c chat) → lands as a **claimable ticket** in that company's inbox (any team member picks it up).
- Sent to a **person** (p2p) → lands as a **"[Sender] has sent a deal" message in that person's chat** (opens a new chat if none exists); clicking it opens the deal card in the side preview.

Today the "+→Create a deal" button in a company chat fires an event **nobody listens to** — so no deal is created. This lane fixes that and builds the delivery both ways.

## Architecture — one spine, three producers
```
PRODUCERS                     SPINE (shared)
1. Manual · company chat ─┐
2. Manual · person chat  ─┼──▶ BIRTH ──▶ DELIVER ──▶ PICK UP
3. Sella (later)         ─┘   create_deal_draft   │
                                                   ├─ no counterparty person → COMPANY inbox ticket
                                                   └─ counterparty person set → PERSON chat message
```
**Routing key = one fact:** does the born deal have a counterparty co-owner person?
- **No** → company-target → `deliver_deal` writes an inbox ticket (in the DB, at birth).
- **Yes** → person-target → the send layer posts a chat message (in the app, after birth).

`confirm_detected_deal` (the Sella/proposal door) **reuses** `create_deal_draft` (verified: [confirm_detected_deal:135](../../supabase/migrations/20260707130200_confirm_detected_deal_born_now.sql)), so the company path is delivered for **all three producers** by a single call inside the birth RPC.

## Invariants — never break these (the anti-deviation guardrails)
1. **One birth path.** Deals are born only by `create_deal_draft`. Producers assemble inputs; never `insert into deal_card/deal_workspace/...` directly.
2. **One company-delivery path.** The inbox ticket is written only in `deliver_deal` — never inline in a button handler or `createDeal`.
3. **Routing key = counterparty person.** A born deal with a second `deal_member` owner (≠ creator) is person-target; otherwise company-target. No other signal decides routing.
4. **`deals/` must not import `messaging/`.** `messaging` already renders `DealPin` (from `deals`), so a back-import is a **module cycle**. All deal↔chat coupling goes through **window events** (`hs:create-deal-card`, `hs:open-deal-card`, `hs:deal-updated`) or the **send/composition layer** (basket / app), never `deals/actions.ts`.
5. **Person delivery is NOT in `deliver_deal` (SQL) and NOT in `deals/`.** It lives in the send/composition layer. (In SQL it would double-deliver Sella detection, which already posts its own message; in `deals/` it would cycle — see #4.)
6. **Session-derived identity.** Company/person come from `auth.uid()` inside SECURITY DEFINER RPCs, never from client input. The relationship-membership check is the guardrail.
7. **Additive migrations only.** New file per change; `create or replace function` on the **same signature**. Base every function replacement on the **currently live body** (see Research notes — the live `create_deal_draft` is `20260618140000`, NOT `20260618130200`).
8. **No p2p regression.** Existing propose/accept (State B) and p2p create behave exactly as today.
9. **The AI fence stays.** Sella never writes a deal; it proposes, a human confirms, birth uses the same path.

## Scope — in / out
**In:**
- Enable + display deal creation in the c2c (company) chat (A1).
- Company-target delivery = inbox ticket, via a reusable `deliver_deal` primitive (A2).
- Deal-ticket pickup: a `claim_deal_ticket` RPC + the accept branch + the inbox preview (A3).
- A distinct "Deal tickets" inbox lens (A4).
- Person-target delivery = a "[Sender] has sent a deal" chat message + clickable side-preview (A5).
- c2c live-refresh (A7) + e2e for the whole flow (A8).

**Out (deferred / other lanes):**
- Sella detection extended to c2c (Lane C).
- A persistent/cross-session unread store (today unread is client-only — see Research). Not blocking; flagged.
- Any change to the deal card's internal edit/confirm engine.

## Research notes — verified against LIVE code (this session, 6 sub-agent traces + direct reads)

### Birth
- **Live `create_deal_draft` = [20260618140000_deal_line_item_batch.sql:59](../../supabase/migrations/20260618140000_deal_line_item_batch.sql)** (a `create or replace` ~1h after `20260618130200`, adding the batch snapshot into real line columns). `return v_card;` at **:209**; counterparty co-owner insert at **:181-184**. ⚠️ **Base A2's replacement on THIS file, not `20260618130200`** (that one is open in the IDE but is superseded — using it would revert batch work).
- **11-arg signature, SECURITY DEFINER, `set search_path=''`.** Gates on relationship membership ([:74-83 of 20260618130200](../../supabase/migrations/20260618130200_create_deal_draft_retire_private_box.sql), same in live). Counterparty co-owner inserted only when `p_counterparty_person_id` is a real person on the other side.
- **`confirm_detected_deal` (Sella/proposal) REUSES it** — calls `create_deal_draft(...)` at [20260707130200:135](../../supabase/migrations/20260707130200_confirm_detected_deal_born_now.sql), no inline card insert. It always passes a counterparty person (the other p2p participant, `:104`) → always person-target → `deliver_deal` no-ops the company branch for it. **Only ONE deal_card birth function exists** (`create_deal_draft`), reached through two doors.

### Company delivery (inbox ticket)
- **`pending_inbox_item`** has everything needed: `type` (FK → `inbox_request_type`, `deal_card` seeded), `deal_card_id` (FK added [20260607090005:14-19](../../supabase/migrations/20260607090005_fk_alters_triggers.sql)), CHECK `inbox_deal_card_only_for_deal_card_type` ([phase1_core:207-208](../../supabase/migrations/20260607090002_phase1_core.sql)), `receiver_company_id`, `sender_company_id`, `sender_person_id`, `status`, claim/assign columns. RLS: `inbox_insert` requires `sender_company_id = current_company_id()` ([rls_policies:233](../../supabase/migrations/20260607170000_rls_policies.sql)) — **but `deliver_deal` is SECURITY DEFINER so it bypasses this.**
- **Born deals create NO ticket today** — `createDeal` / `create_deal_draft` never touch `pending_inbox_item`. Greenfield producer.

### Pickup
- **`getInbox` hardcodes `dealCard: null`** ([inbox.ts:121](../../src/modules/connect/supabase/inbox.ts)); it already selects `deal_card_id`. `InboxDealCardPreview = { product, quantity, unitPrice, total, delivery }` (all strings) ([connect/types.ts:64-70](../../src/modules/connect/types.ts)). Fill it by joining `deal_card` + `deal_line_item`.
- **`deal_card` accept is a dead stub** — `acceptInbox` ([store.ts:525](../../src/modules/messaging/supabase/store.ts)) **always mints a new relationship** (:550-563) + `planRollout` threads; for `deal_card` it opens c2c+p2p+a Sella intro and **births nothing** ([rollout.ts:16-18,98,133](../../src/modules/messaging/lib/rollout.ts)). Branch point: inside `acceptInbox`, **after the idempotency early-return, before the relationship insert (~store.ts:545)**.
- **Adding a `deal_member` needs a SECURITY DEFINER RPC.** `member_all` RLS → `can_access_workspace` ([rls_policies:105-113,317-319](../../supabase/migrations/20260607170000_rls_policies.sql)) either blocks the insert (relationship-member bootstrap) or is too permissive (any company member could self-add). So `claim_deal_ticket()` must be a definer RPC, matching `create_deal_draft`'s pattern.
- **`AcceptInput` carries no `deal_card_id`** ([messaging/types.ts:300-315](../../src/modules/messaging/types.ts)) — must be threaded through from `acceptItem` ([inbox.ts:185-224](../../src/modules/connect/supabase/inbox.ts), which has `item.deal_card_id`).

### Person delivery (chat message) — all reusable EXCEPT the bubble + type
- **`openOrCreateP2pThread(relationshipId, otherPersonId)`** EXISTS ([store.ts:361](../../src/modules/messaging/supabase/store.ts)) — get-or-create the p2p thread (canonical order handled). **Requires a `relationshipId`** (p2p thread's is NOT NULL) — fine, the target person is at a connected company (`ConnectedPerson.relationshipId`).
- **`postMessage(threadId, body)`** EXISTS ([store.ts:500](../../src/modules/messaging/supabase/store.ts)) but **hardcodes `type:"message"` + no metadata** → add a sibling `postDealMessage` that sets `type` + `metadata.deal_card_id`.
- **`chat_message.type` is a FK lookup** ([phase2_deal:194](../../supabase/migrations/20260607090003_phase2_deal.sql) → `chat_message_type`). A new `deal_card` message type needs a **one-row seed migration** (copy [20260617140100_chat_message_type_declined_seed.sql](../../supabase/migrations/20260617140100_chat_message_type_declined_seed.sql)) + adding it to the `MessageType` union ([messaging/types.ts:53-62](../../src/modules/messaging/types.ts)).
- **`MessageBubble` branches on `sender`, never `type`** ([MessageBubble.tsx:19](../../src/modules/messaging/components/MessageBubble.tsx)); `ChatMessageView` already carries `type` + `metadata`. Add a branch for the deal bubble → click dispatches `hs:open-deal-card`.
- **Side-preview `hs:open-deal-card` → `DealCardPanelHost`** confirmed window-level, click-dispatchable from a bubble ([DealCardPanelHost.tsx:121](../../src/app/connect/DealCardPanelHost.tsx); existing emit pattern [ThreadView.tsx:339-345](../../src/modules/messaging/components/ThreadView.tsx)).
- **Conversation list shows p2p** (only `deal`-type threads hidden, [store.ts:155](../../src/modules/messaging/supabase/store.ts)); a new message bumps + fires the unread badge via realtime ([use-chat-realtime.ts:54-66](../../src/modules/messaging/lib/use-chat-realtime.ts), [ChatView.tsx:247-259](../../src/modules/messaging/components/ChatView.tsx)). **Caveat:** unread is **client-only** (server `unreadCount` hardcoded 0, `markRead` a no-op — [store.ts:171,297](../../src/modules/messaging/supabase/store.ts)); the live badge works but doesn't persist across reload. A persistent store is a deferred follow-up, not part of this lane.

### A1 UI reality
- `ThreadView` passes `relationshipId` + `threadId={isC2C ? undefined : conversation.threadId}` to `DealPin` ([ThreadView.tsx:198-209](../../src/modules/messaging/components/ThreadView.tsx)). So in c2c, `relationshipId` is present, `threadId` is undefined.
- **The deal picker + open-card chip live INSIDE the `threadId`-gated top bar** ([DealPin.tsx:445,472](../../src/modules/deals/components/DealPin.tsx)) → a c2c chat has no visible deal surface even after birth. A1 must add a c2c deal-display row (reuse `DealChip` + `dealCardChip`, already defined).

## Task checklist (build — after scope-lock). Ordered; each ends testable.

### A1 — Enable + display deal creation in the c2c chat · **S · no migration**
Files: [DealPin.tsx](../../src/modules/deals/components/DealPin.tsx). Test: `e2e/deal-c2c-create.spec.ts`.
- [x] After DealPin.tsx:182 add `const canCreate = variant === "chat" && !!relationshipId;`
- [x] :368 `if (!canPropose) return;` → `if (!canCreate) return;` (the `hs:create-deal` listener).
- [x] :704 `{canPropose && (` → `{canCreate && (` (the "Start a deal" button).
- [x] Add a c2c deal-display row after the State-A block (~:715):
  ```tsx
  {/* c2c has no threadId, so the p2p top-bar (picker + open-card) never renders;
      give a born c2c deal its own minimal surface. */}
  {variant === "chat" && !threadId && hasDeal && (
    <div className={rowCls}>
      <DealChip status={chipStatus} selectable={false} />
      {dealCardChip}
    </div>
  )}
  ```
- [x] **Do NOT touch `canPropose` elsewhere** (State B, the proposal reads/realtime at :257/:274 genuinely need a thread).
- **Accept:** c2c chat shows "Start a deal"; clicking births a draft (creator = sole owner); the born deal shows as a c2c row that opens the card; **p2p unchanged**; tsc + eslint clean.

### A2 — `deliver_deal`: the routing primitive + company ticket · **M · ⚠️ Ayush's RPC lane**
Files: two new migrations. Test: `supabase/tests/deliver_deal_test.sql` (pgTAP).
- [x] **Migration 1 — `deliver_deal`** (person branch is a no-op until A5):
  ```sql
  create or replace function public.deliver_deal(p_deal_card_id uuid)
  returns void language plpgsql security definer set search_path = '' as $$
  declare v_rel uuid; v_initiator uuid; v_creator uuid;
          v_a uuid; v_b uuid; v_receiver uuid; v_has_coowner boolean;
  begin
    select relationship_id, initiating_company_id, created_by
      into v_rel, v_initiator, v_creator from public.deal_card where id = p_deal_card_id;
    if v_rel is null then return; end if;

    -- person-target iff a second owner (not the creator) exists (side-agnostic;
    -- avoids the initiating_company_id timing gap on the detection path)
    select exists (
      select 1 from public.deal_member dm
      join public.deal_workspace dw on dw.id = dm.deal_workspace_id
      where dw.deal_card_id = p_deal_card_id and dm.person_id <> v_creator
    ) into v_has_coowner;
    if v_has_coowner then return; end if;  -- PERSON delivery handled by the send layer (A5)

    -- COMPANY delivery: one claimable ticket, idempotent
    select company_a_id, company_b_id into v_a, v_b from public.relationship where id = v_rel;
    v_receiver := case when v_initiator = v_a then v_b else v_a end;
    if not exists (select 1 from public.pending_inbox_item
                   where deal_card_id = p_deal_card_id and deleted_at is null) then
      insert into public.pending_inbox_item
        (type, sender_person_id, sender_company_id, receiver_company_id, deal_card_id, status)
      values ('deal_card', v_creator, v_initiator, v_receiver, p_deal_card_id, 'pending');
    end if;
  end; $$;
  grant execute on function public.deliver_deal(uuid) to authenticated;
  ```
- [x] **Migration 2 — wire birth → deliver.** `create or replace` the LIVE `create_deal_draft` body (**copy [20260618140000_deal_line_item_batch.sql](../../supabase/migrations/20260618140000_deal_line_item_batch.sql) verbatim**), adding one line before `return v_card;` (:209): `perform public.deliver_deal(v_card);`
- [x] **Do NOT** add a `deliver_deal` call in `confirm_detected_deal` — it reuses `create_deal_draft`, so it's covered (adding it = double-delivery).
- **Accept (pgTAP):** a c2c birth (no counterparty person) creates exactly one `deal_card` ticket for the *other* company; a second birth on the same card creates none (idempotent); a p2p birth (counterparty set) creates **zero** tickets; a Sella-detected birth creates zero tickets.

### A3 — Deal-ticket pickup · **M**
Files: new migration `claim_deal_ticket.sql`; [inbox.ts](../../src/modules/connect/supabase/inbox.ts), [messaging/types.ts](../../src/modules/messaging/types.ts) (`AcceptInput` + `deal_card_id`). Test: pgTAP + unit.
- [x] **`claim_deal_ticket(p_deal_card_id uuid)`** — `security definer set search_path=''`: (a) derive caller company from session; (b) assert a `pending_inbox_item` exists with this `deal_card_id`, `type='deal_card'`, `receiver_company_id = caller company`; (c) `insert into deal_member (deal_workspace_id, person_id=auth.uid(), role='owner', added_by_person_id=auth.uid())` for that card's workspace. `grant execute ... to authenticated`.
- [x] **`getInbox`** (inbox.ts:121): replace `dealCard: null` — join `deal_card` + `deal_line_item` (via `row.deal_card_id`) → build `InboxDealCardPreview {product, quantity, unitPrice, total, delivery}`.
- [x] **`acceptItem`/`acceptInbox`**: branch on `type === "deal_card"` at the point before the relationship insert (store.ts ~:545). For a deal ticket: call `claim_deal_ticket(deal_card_id)`, then flip ticket `status='accepted'` — **skip** `planRollout` / new-relationship / thread births. Thread `deal_card_id` through `AcceptInput`.
- **Accept:** accepting a deal ticket adds the claimer as a `deal_member` owner on the existing deal + marks the ticket accepted; **no new relationship/threads**; the deal opens for the claimer; connection-request accepts unchanged.

### A4 — "Deal tickets" inbox lens · **S**
Files: [connect/types.ts](../../src/modules/connect/types.ts), [connect/lib/lenses.ts](../../src/modules/connect/lib/lenses.ts), [InboxView.tsx](../../src/modules/connect/components/InboxView.tsx). Test: unit/e2e.
- [x] types.ts:95 — add `"deal_tickets"` to `LensKey`.
- [x] lenses.ts:11-16 — add `{ key: "deal_tickets", label: "Deal tickets" }` to `LENSES`.
- [x] lenses.ts `matchesLens` — add `case "deal_tickets": return item.type === "deal_card" && item.status === "pending";` (the `never` guard forces this).
- [x] InboxView.tsx — add the key to `EMPTY_HINT` (:35-40) + `ZERO_COUNTS` (:42-47) (both `Record<LensKey,…>`).
- **Accept:** deal tickets render in their own lens with preview + claim/assign/accept; connection requests stay in theirs; counts correct.

### A5 — Person delivery = a chat message · **M · send/composition layer only**
Files: new seed migration; [messaging/types.ts](../../src/modules/messaging/types.ts), [store.ts](../../src/modules/messaging/supabase/store.ts), [MessageBubble.tsx](../../src/modules/messaging/components/MessageBubble.tsx); the send composition site (basket send + create-card host). Test: unit + e2e.
- [x] **Seed migration** — add `deal_card` to `chat_message_type` (copy [20260617140100_chat_message_type_declined_seed.sql](../../supabase/migrations/20260617140100_chat_message_type_declined_seed.sql)); add `"deal_card"` to the `MessageType` union.
- [x] **`postDealMessage(threadId, dealCardId, senderName)`** in store.ts (sibling of `postMessage`): inserts `type:"deal_card"`, `body:"<senderName> has sent a deal"`, `metadata:{ deal_card_id: dealCardId }` (sender `sella`/`system`).
- [x] **`MessageBubble`** branch: `if (message.type === "deal_card")` render a clickable bubble → `window.dispatchEvent(new CustomEvent("hs:open-deal-card", { detail: { dealCardId: message.metadata?.deal_card_id } }))`.
- [x] **Wire it in the SEND/COMPOSITION layer** (basket send action + the create-card host — both already bridge deals+messaging). After `createDeal` returns *with a counterparty person*: `const tid = await openOrCreateP2pThread(relationshipId, personId); await postDealMessage(tid, dealCardId, senderName);` **Never in `deals/actions.ts` (cycle) and never in `deliver_deal` (double-delivers detection).**
- **Accept:** sending a deal to a person you've chatted with drops the bubble in that chat (unread badge fires); sending to a new person opens a new p2p conversation with the bubble; clicking the bubble opens the card in the side preview; **detection deals are not doubled** (they keep their own `deal_detected` message).

### A6 — (dissolved) · **XS**
No separate "deals addressed to me" list — the conversation list + unread IS the surface. Keep only an e2e assertion that A5's message reaches the recipient's conversation list.

### A7 — c2c live-refresh · **S**
Files: [DealPin.tsx](../../src/modules/deals/components/DealPin.tsx). The realtime channel is gated on `canPropose && threadId` (:274); c2c has no thread. Add a relationship-scoped refresh listening for `hs:deal-updated` (already dispatched by the panel host after `createDeal`). Test: e2e.

### A8 — e2e + fixtures · **S–M**
Extend the deal-birth fixture for: c2c create → ticket → claim; p2p create → chat message. Depends on A1–A5.

## Cross-lane / risks
- **A2 + A3 touch Ayush's deal-RPC lane** (`create_deal_draft`, `deal_member` RLS). Run the sync ritual (`docs/team/sync/muskan.md` lock) + his review before cloud.
- **Migrations are local-first** (cloud-pending ledger). New: `deliver_deal`, `create_deal_draft` re-emit, `claim_deal_ticket`, `chat_message_type` seed.
- **Unread persistence** is out of scope (client-only today) — flagged, not fixed.

## Done criteria
- Create a deal from a c2c chat → a `deal_card` ticket appears in the other company's inbox (own lens), a teammate claims it (becomes a `deal_member`), no new relationship/threads created.
- Create a deal for a person → a "[Sender] has sent a deal" message lands in their chat (new chat if none), clicking opens the card in the side preview; detection deals not doubled.
- pgTAP (deliver_deal, claim_deal_ticket) + unit + e2e green; tsc + eslint clean; live-verified on a fresh `supabase db reset`.
- ARCHITECTURE-NOTES entry for the birth→deliver→pickup spine + the routing key. Status → ✅.

## Follow-ups (after this lane)
- **Lane C:** extend Sella detection from p2p → c2c (rides this lane's `deliver_deal` company ticket for free).
- Persistent/cross-session unread store (server last-seen) — replaces the client-only badge.
- Board: add a Deal-creation row to [BUILD-PLAN.md](../PRD/BUILD-PLAN.md) (shared → sync-lock first).
