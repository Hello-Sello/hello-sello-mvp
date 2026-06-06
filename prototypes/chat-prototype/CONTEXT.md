# Connect Chat (screen ②) — full context & decision narrative

> **Why this file exists:** `NOTES.md` is the spec (what the prototype does). This file is the **conversation log** —
> every decision we made building screen ②, *and the reasoning behind it*, captured so the whole story survives the
> session. LOCKED 2026-06-06 (Ayush + Claude). Prototype: `index.html` (port 8770).

This is the post-acceptance Connect chat. The Inbox owns the accept/decline step (see `inbox-prototype`); you only arrive
here **after** a connection is accepted. Screen ② is the second atom in the Connect build order:
① Deal card → **② Chat + connect→chat rollout + post-birth sync** → ③ Relationship page → ④ Deal Workspace.

---

## 1. The chat surface & shell

- **Reused the DECIDED Connect shell** (from `connect-prototype` / `inbox-prototype`), not a new one: icon rail
  (Home/Connect/Discover/Present/Buy·Sell·Trade-soon + account dot) · Connect sub-nav (Chat / Inbox / Relationship / Deals)
  · chat list · main chat · Sella right rail. **Why:** one system, not a second visual dialect — the screen should read
  as the same app the other prototypes established.
- **Chat list = `+ New Chat`, search, `All · Unread · Companies` filter; person-centric rows.** The **Companies** filter
  nests the C2C company chat + people (P2P) + deal threads under the company header. **Why:** this is the decided list
  pattern; a company's chats belong *inside* the company when you look at it that way.

## 2. The three chat types & the connect→chat rollout (locked 2026-06-06, reaffirmed here)

- **P2P / C2C / Deal chat.** C2C = company-level notice board; P2P = person-to-person; Deal chat = the workspace thread.
- On accept (in the Inbox): **C2C is created in all 4 request types**; a **P2P opens for the 3 substantive ones**
  (everything but a bare connect); a **deal-card** seeds a deal draft → confirm → Deal Workspace spawns.

## 3. System messages — two voices, split by `actor`

- **C2C = company notice board / AUDIT LOG.** `actor=system`, neutral. `connection_established` always; `deal_started`
  once a deal is confirmed. **Why:** the company connection is the durable, company-visible fact; this chat doubles as
  the record between the two companies.
- **P2P / Deal = Sella FACILITATES.** `actor=sella`, neutral + action-oriented. **Why — refines "v1 = no first-contact
  Sella":** Sella *introduces, flags, and asks*; she never writes the business message for a party. Humans speak business.
- **+Message / Price-list** → an `intro` (who's who + what they want), then the requester's own message. **Price-list is
  always buyer→supplier** (a seller never asks for a price list).

## 4. Deal birth = a TWO-PARTY confirmation gate (locked 2026-06-06)

- A deal card sent → Sella posts `deal_detected`: *"both of you, want me to start drafting it?"* **Both parties must
  confirm.** Both Yes → `workspace_created` + a **Deal chat spawns** (`deal_opened`). **Either declines → the deal is
  cancelled and archived** (no workspace; they stay connected, can start a new one).
- **Why both:** a deal is a mutual commitment; one-sided "start" would let a deal exist that the other side never agreed
  to. Modeling it as per-party votes (`null → yes/no`) lets the audit log answer *who agreed and who killed it*.
- **The waiting state is real:** not everyone is at the screen, so the prompt shows "You ✓ / them ⏳ waiting".

## 5. The P2P ↔ Deal-chat SYNC — the heart of screen ② (locked 2026-06-06)

The hard question: people talk in **both** the P2P and the Deal chat. How do they stay in sync?

- **Deal chat = ground truth / official record.** All participants; membership grows later (groups are future).
- **P2P = where people actually talk** — a mix of irrelevant life chatter and the occasional deal-affecting line. Most
  real conversation happens here, *not* in the formal Deal chat (human nature).
- **We do NOT sync messages. We sync the DEAL CARD.** The card is the single shared truth, shown identically (a thin
  pinned pill that opens the full card) in both chats, **versioned** v1 → v2 → …
- **Change detected in the P2P** → Sella **TAKES INPUT** (does not author): a *suggested* delta + **a note each user
  writes** (Sella = scribe, humans = authors). Both submit (tolerates waiting) → card v2 in both chats → a **per-user
  `deal_card_updated` system message into the Deal chat** (each person's note shown individually; everyone sees) →
  a `deal_card_log` entry + per-user `deal_change_input` evidence rows. Raw P2P messages **stay private** in the P2P.
- **Change detected in the Deal chat** → card v2 + log + evidence, **but no broadcast** system message — everyone there
  already saw the conversation. (Rule: broadcast only when `origin != deal_chat` — a one-line de-dup.)
- **Deal-card LOG** = version / what / by whom / when / why; lives on the **card back** behind a filter; feeds `audit_log`.

**Why this shape:** it's a clean bounded-context boundary — the P2P is a *private* context, the company/Deal-chat is a
*shared* context, and the **deal card is the published language** between them. Nothing crosses except a confirmed,
structured fact (the card delta) + its per-user evidence. The "card updated" message is a **projection** of a log entry,
not an independent message — which is exactly why "change in the Deal chat → no broadcast" costs nothing.

## 6. The Deal card in chat (refined this session)

- **Thin pinned pill, not a big card.** The chat top is one row: `Talking about: [HS-… ▾]` + a thin **pink** `Deal card ▸`
  pill. Click → the full card opens in a **dialog**. **Why progressive disclosure:** the header only needs to say "a deal
  lives here, tap to see it" — products/value/version/signals/logs are one click away, so the chat stays a chat.
- **The card is an openable flip dialog.** FRONT = facts + scrollable products (reflects the version — v2 shows the
  swapped product). BACK = a **filter** (`Signals | Logs`, extensible) that swaps the back view. **Why a filter:** the
  card back is a multi-view *surface*, not a fixed face — new back-views (Terms, Risk, …) drop in as tabs later.
- **No `v1` heading noise.** Front header is just the HS number; logs are chronological (order = version), so the version
  chips and the "change log · what/who/when/why" caption were removed — the entries already carry that.

## 7. Data model proposed to Muskan (`messaging` + `deals`)

Decided spine (matches connect/inbox prototypes): `relationship → chat_thread (type: c2c|p2p|deal) → chat_message
(sender, type, body)`, plus:
- **`deal_card`** — mutable current state (version, value_net, status).
- **`deal_card_log`** — append-only version history (the change story).
- **`deal_change_input`** — per-user evidence: each party's note on a change (the "individual for individual user" record).
- **`audit_log`** — every system/Sella line mirrors here (audit + incident log). System messages are projections of it.

`scope` (company/person/deal) is derivable from `chat_thread.type` — no separate column. `actor ∈ {system, sella}`.

## 8. Parked / out of scope (later, not now)

- **Multi-deal in one P2P** — the "Talking about:" selector switching between several deals between the same two
  companies. **Parked on Linear DEV-37** (yours, in progress, project "Chat"). Prototype shows a single deal.
- **Membership growth / temporary groups** in a Deal chat — future, not this demo.
- **Sella copy** — all placeholder; to be polished later.
- **`deal_started` actor** — modeled as `system`; confirmed fine.

## 9. Doc drift noticed (for a docs pass, not blocking)

`LAYER-1 §3` still says "C↔C only exists inside a deal workspace" — the **old** model. The 2026-06-06 lock redefined C2C
as a **company-level channel created at connection**. The newer lock wins (this prototype follows it); LAYER-1 §3 reads
stale and should be reconciled in a docs pass.

---

*Built across one session (2026-06-06) with Ayush. Verified in the Claude Preview (logic read from the state functions,
render + DOM confirmed, no console errors). Throwaway — the decisions above are the keep; the HTML is disposable.*
