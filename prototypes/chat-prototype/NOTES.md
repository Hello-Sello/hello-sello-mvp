# Connect · Chat + connect->chat rollout (screen ②) - prototype notes

**Throwaway prototype. LOCKED 2026-06-06 (Ayush).** Light theme, slate + pink-600, decided Connect shell.
Look + behaviour are locked; future tweaks are on-the-fly. Full decision narrative + reasoning: see `CONTEXT.md` (next to this file).
**Post-acceptance only** - the Pending/accept step is the **Inbox's** job (inbox-prototype, already done); you only reach
this screen after a request is accepted there.
Run: Claude Preview config `chat-prototype` (port 8770), or `python3 -m http.server 8770 --directory prototypes/chat-prototype`.

## Question this answers

After accept, **which system message lands in which chat, for each inbound request type** - and how a deal is born.
UI-shaped (decided Connect shell) but the real question is the rollout LOGIC, surfaced through the mock-DB drawer.

## Model (Ayush, 2026-06-06 - LOCKED)

Two voices, separated by an `actor` field; every line is mirrored into the **audit log**.

- **C2C = company notice board / AUDIT LOG.** `actor=system`, neutral, durable record between two companies.
- **P2P / Deal = Sella FACILITATES.** `actor=sella`, neutral + action-oriented. (Sella introduces + asks; it never
  writes the business message for a party. Humans speak business.)

### Rollout per inbound request type

| Request | C2C (`actor=system`) | P2P opened? | P2P (`actor=sella`) | Seed (human) |
|---|---|---|---|---|
| Plain connect | `connection_established` | No | - | - |
| + Message | `connection_established` | Yes | `intro` | the note -> `chat_message` |
| Price-list ask (buyer->supplier only) | `connection_established` | Yes | `intro` | the ask + "Share price list" |
| + Deal-card | `connection_established`, then `deal_started` once BOTH confirm | Yes | `deal_detected`, then `workspace_created` (both yes) **or** `deal_cancelled` (either no) | deal-draft card -> Deal chat |

### The deal-card flow = a two-party confirmation GATE (key mechanic)

A deal card is sent -> Sella posts `deal_detected`: *"both of you, want me to start drafting it?"* **BOTH parties must
confirm** (per-party Yes/No; the prototype shows You ✓ / other ⏳ waiting):
- **both Yes** -> C2C `deal_started`; P2P `workspace_created`; a **Deal chat spawns** (`deal_opened`, `deal_id=dc_01`,
  the same entity as dealcard-prototype). Audit records `Kim:confirm_deal` + `Thomas:confirm_deal`.
- **either No** -> `deal_cancelled`, the deal is **archived**, no workspace. Audit records the decline + `deal_archived`.
  (They stay connected - they can start a new one.)

## Full-chat sync model (Ayush, 2026-06-06 - LOCKED)

**Deal chat = ground truth / official record** (all deal participants; membership grows later - groups are future).
**P2P = where people actually talk** (mixed life + the occasional deal-affecting line). **Messages are NOT synced.**
**The deal card is the single shared truth**, shown identically (pinned) in both chats, versioned v1 -> v2 -> …

- **Change detected in P2P** -> Sella **TAKES INPUT** (not suggests): a suggested delta + **a NOTE each user writes**
  (Sella = scribe, humans = authors). Both submit (tolerates waiting) -> card v2 in both chats -> a **per-user
  `deal_card_updated` system message into the Deal chat** (each person's note shown individually; everyone sees) ->
  a **`deal_card_log`** entry + per-user **`deal_change_input`** evidence rows. Raw P2P messages stay in `thr_p2p`.
- **Change detected in Deal chat** -> card v2 + log + per-user evidence, but **no broadcast system message** (everyone
  there already saw it). The broadcast is conditional on `origin != deal_chat` - a de-dup, one rule.
- **Deal card = an openable flip dialog.** Thin pinned card -> click -> dialog: **FRONT** = facts + scrollable products
  (reflect the version: v2 shows the swapped product); **BACK** = a **filter** (`Signals | Logs`, extensible) that swaps
  the back view. Logs = version / what / who / when / why; feeds `audit_log`. The `deal_card_updated` bubble is a
  projection of a log entry, not an independent message.

## Data model (DECIDED spine - connect/inbox prototypes)

`relationship -> chat_thread (type: c2c|p2p|deal) -> chat_message (sender, type, body)`, plus **`deal_card`** (mutable
current state: version, value_net, status), **`deal_card_log`** (append-only version history), **`deal_change_input`**
(per-user evidence: each party's note on a change - the "individual for individual user" record), and **`audit_log`**.
System/Sella lines are `chat_message` rows with `sender ∈ {system, sella}` and a `type` discriminator
(`connection_established`, `deal_started`, `intro`, `deal_detected`, `workspace_created`, `deal_cancelled`, `deal_opened`).
`scope` (company/person/deal) is derivable from `chat_thread.type`. Every such line ALSO writes an `audit_log` row
(auditing + an incident log; the C2C chat *is* the record). Hand this shape to Muskan for the `messaging` module.

## Shell (DECIDED - reused from connect/inbox prototypes)

5 panels: icon rail (Home/Connect/Discover/Present/Buy·Sell·Trade-soon + account dot) · Connect sub-nav
(Chat/Inbox/Relationship/Deals) · **chat list** (+New Chat, search, `All · Unread · Companies`; person-centric rows;
the **Companies** filter nests the C2C company chat + people + deal threads under the company) · main chat · Sella rail.

## Verified (2026-06-06, via preview - logic read from the state fns; render + DOM confirmed)

- 4 request types roll out the right C2C / P2P system lines; plain opens no P2P.
- Deal gate: pending -> partial (one ✓, other waiting) -> both ✓ spawns Deal thread; either ✗ -> cancelled + archived.
- `audit_log` captures the full lifecycle incl. who confirmed / who declined. No console errors.
- **Sync:** P2P change -> Sella takes both users' notes -> card v2 + per-user `deal_card_updated` broadcast in Deal chat +
  log entry + 2 `deal_change_input` rows; Deal-chat change -> card v2 + log + evidence, NO broadcast. Raw trigger messages
  stay in their origin thread (never copied). `deal_card`/`deal_card_log` reflect v1->v2.
- **Openable card:** thin pin -> dialog; FRONT reflects the version (v2 shows Amnesia Haze swapped in); BACK filter swaps
  `Signals | Logs`. Verified front product, flip, both back tabs, per-user notes in the log. No console errors.
- Companies filter nests the company chat inside the company. (Coordinate-clicks on the fixed DEMO bar are flaky in
  the test driver - irrelevant to a human; logic verified via the state functions.)

## Resolved (Ayush, 2026-06-06)

- **Who confirms the deal?** BOTH parties. Decline -> cancelled + archived.
- **`deal_started` actor / copy** - fine; Sella copy is placeholder, to be polished later.
- **Pending phase** - removed; it lives in the Inbox.

## Parked / next

- **Multi-deal in one P2P (DEV-37)** - several deals between the same two companies; the "Talking about:" selector
  switches which deal's card is pinned. Prototype shows a single deal; the selector is stubbed. Future.
- **Membership growth / temporary groups** - more people join a Deal chat later; groups are future, not this demo.
- **Doc drift:** LAYER-1 §3 still says "C↔C only inside a deal workspace" - superseded by the 2026-06-06 C2C lock. Docs pass.
- On wrap-up: decisions -> DECISIONS.md (`## 2026-06-06`), data model (`deal_card` + `deal_card_log` + sync) ->
  ARCHITECTURE-NOTES.md, terms -> CONTEXT.md; hand the messaging + deal-card-versioning shape to Muskan.
