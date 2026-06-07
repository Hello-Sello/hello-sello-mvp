# Connect Demo - PRD: Deal-Flow Spec

**Covers blocks:** 3 Messaging · 4 Deal Workspace · 5 Sella.
**Parent:** [`connect-demo.md`](connect-demo.md) (overview + acceptance script).
**Created:** 2026-06-07 13:44 CEST.

> This is the part of the demo the room watches. A conversation becomes a deal. Messaging carries the talk, Sella spots the deal inside the talk and drafts it, and the Deal Workspace gives that deal a card, a version history, and a two-sided gate. Together they walk steps 3-8 of the acceptance script.
>
> Tags: `FR-M` (Messaging), `FR-D` (Deal Workspace), `SR` (Sella). Data shapes link to [`../architecture/SCHEMA-DRAFT.md`](../architecture/SCHEMA-DRAFT.md); they are not restated here.

---

## Block 3 - Messaging

**Purpose:** the chat. It carries the human conversation, the system announcements, and Sella's lines - all in one stream. Three kinds of thread: company-to-company (born at connect), person-to-person, and the deal thread (born when a deal is **drafted**).

**Owns / reads:** `chat_thread` (types `c2c` / `p2p` / `deal`), `chat_message` (sender `person` / `system` / `sella`). Threads hang off a `relationship`.

### Requirements

| Tag | Requirement | How we know it's met |
|---|---|---|
| **FR-M1** | When a connection is accepted, a **company-to-company** chat is created for the relationship, visible to both sides. | Right after accept, both users see a shared thread with a "you are connected" system line. |
| **FR-M2** | Two users can exchange **person-to-person** messages. Messages are delivered both ways, kept **in order**, and stored. | Messages sent each way appear on both screens in send order and survive a refresh. |
| **FR-M3** | When a deal is **drafted**, a **deal thread** is created and announced with a system line in the chat. | When Sella drafts the card, a deal thread appears and a "workspace created" line shows. |
| **FR-M4** | The stream carries **system** and **Sella** lines as first-class messages, not as a separate channel. | Connection, deal-detected, and workspace-created events appear inline in the same thread. |
| **FR-M5** | A change made **outside** the deal thread (a p2p change) broadcasts a `deal_card_updated` line **into** the deal thread; a change made **inside** the deal thread does **not** re-announce itself. | Per the broadcast rule: `origin != deal_chat` broadcasts; `origin = deal_chat` is silent (everyone there already saw it). |

### Notes
- Message **types** are a controlled list (`message`, `connection_established`, `deal_detected`, `workspace_created`, `deal_card_updated`, …). New types are INSERTs, not migrations.
- The `deal_card_updated` message is a **projection** of a `deal_card_log` entry - the log is truth, the message is display. Build them from the log, do not let them drift.

---

## Block 4 - Deal Workspace

**Purpose:** the deal itself - the card, its versions, the two-sided confirmation gate, and the workspace **born with the draft**. The price sits on the card, taken from the chat (no pricelist in this demo).

**Owns / reads:** `deal_card` (mutable current state, versioned), `deal_confirmation` (per-party confirmation gate), `deal_line_item` (versioned snapshots), `deal_card_log` (append-only history), `deal_change_input` (each party's note on a change), `deal_workspace` (the container), `deal_member` (who's in the deal: owner / side_lead / member), `thing` (per-stage work items), `deal_artifact` (deal documents). *(The container/member/thing/artifact tables + the `deal_stage` lookup were locked by Muskan in schema session 8, 2026-06-07 - this spec rides on them.)*

### Two layers, kept separate

- **Status** = the deal's life: **`Draft → Confirmed`** (the schema's vocabulary - the PRD follows the team's terms). The two-sided confirmation is what flips it, and it takes **both** sides.
- **Stage** = *your* workflow on top of the deal: a **5-stage pipeline** shown along the top of the workspace (the cannabis deal journey - see the template below). The deal moves along it as work gets done. The model holds N stages; the demo ships a fixed template of 5.
- **Things** = the work items inside a stage (e.g. "CoA uploaded", "license verified"). A stage is **complete when all its Things are done**. This is the intended engine; the demo shows Things but advances stages manually (see below).

Status answers "is it confirmed?"; stage answers "where in our process?"; Things answer "what's left in this stage?". A deal can sit in any stage while still Draft; it is Confirmed only when both sides confirm (which happens at stage 3).

### The lifecycle, in product terms

```
Sella drafts  →  deal_card (Draft)  +  Deal Workspace (deal chat) born at this moment
                     │  negotiate inside the deal chat - version bumps, old versions stay
                     │  readable, both sides see changes; the deal moves through stages
                     ▼
   each side CONFIRMS  (deal_confirmation, one row per party - both required)
                     ▼
   both confirmed  →  deal_card (Confirmed)
```

### Stages - the deal pipeline (locked template)

A deal moves through a **fixed 5-stage pipeline**, shown along the top of the workspace. The template is cannabis-B2B-specific, drawn from the German/EU medical-cannabis deal journey (licensing/GMP-GDP, CoA & THC/CBD lab results, agreement, payment terms, GDP logistics & chain-of-custody). **These 5 are the seeds for the `deal_stage` lookup** Muskan locked in schema session 8 (seeds were TBD, per DEV-24/34) - this PRD supplies them.

| # | Stage | Things done in it (examples) | Demo | Status here |
|---|---|---|---|---|
| 1 | **Negotiation** | Agree products, quantity, price, terms. The card versions here. | ✅ built + walked | Draft |
| 2 | **Compliance & Quality** | Verify licenses (GMP/GDP, narcotics); upload CoA / lab results (THC, CBD). | ✅ built + walked | Draft |
| 3 | **Agreement** | Both sides confirm; contract / PO-SO. **Status flips Draft → Confirmed here.** | ✅ built + walked | **Confirmed** |
| 4 | **Payment** | Invoice issued; payment per terms (NET30…). | shown, greyed | post-Confirmed |
| 5 | **Fulfilment & Delivery** | GDP transport; chain-of-custody manifest; delivery to pharmacy. | shown, greyed | post-Confirmed |

**Status vs stage.** Status flips `Draft → Confirmed` when the deal reaches **stage 3 (Agreement)**. Stages 4-5 are post-confirmation execution (locked Phase 3) - they appear in the pipeline as the journey ahead, but are **not built** for June 11.

**How a stage completes - Things.** The `thing` table already exists (Muskan, schema session 8, Phase 2): it has a `stage` FK to `deal_stage`, an `open`/`done` status, and a `type` (`task` / `approval` / `document_upload`). The intended model: each stage holds **Things**; when all a stage's Things are `done`, the deal advances. **For the demo:** advancement is a **manual** marker (move 1 → 2 → 3); Things show as a simple per-stage **checklist** over the existing table, but are **not user-creatable** yet. The auto-advance-when-Things-done engine and user-created Things/stages are the next layer, deferred post-demo.

### Requirements

| Tag | Requirement | How we know it's met |
|---|---|---|
| **FR-D1** | A deal card can exist in **Draft**, carrying products, quantities, and a price pulled from the chat. | After Sella drafts, a Draft card shows line items and a total, sourced from the conversation. |
| **FR-D2** | A deal becomes **Confirmed** only when **both** parties **confirm** (two-sided gate). One party confirming is **not** enough. Either party declining sends it back to negotiation. | One confirmation leaves the card in Draft; the second flips it to Confirmed; a decline returns it to negotiation. |
| **FR-D3** | The **Deal Workspace (deal chat) is born the moment the card is drafted** - not at confirmation. All negotiation happens inside it. A system line announces it. | A Draft card has a live deal chat from the start; both sides can talk in it before any confirmation. |
| **FR-D4** | A change to a draft **bumps a version**. The previous version stays **readable** (snapshots, not overwrites). Both sides see the change in the deal chat. | After a change, `version` increments; v1 is still reconstructable; both screens reflect the new state. |
| **FR-D5** | The card has a **back** showing its log (what changed, when, by whom - person or Sella). | The log lists each version with a one-line summary and the actor. |
| **FR-D6** | The initiator can **withdraw** a draft while the other side has not yet confirmed. | Withdraw is available only pre-confirmation and moves the card to a terminal `withdrawn` state. |
| **FR-D7** | The workspace shows the **5-stage pipeline** along the top (Negotiation → Compliance & Quality → Agreement → Payment → Fulfilment & Delivery). The demo **builds and walks stages 1-3** via a **manual** advance marker; stages 4-5 are shown **greyed** as the future journey. Status flips **Draft → Confirmed** when the deal reaches **stage 3 (Agreement)**. | The deal shows its current stage; advancing 1→2→3 works; status flips at stage 3; stages 4-5 are visible but inactive. |
| **FR-D8** | Each stage shows its **Things** - a per-stage checklist of work items (e.g. "License verified", "CoA uploaded"). Demo: shown as a checklist, **not user-creatable**. *(Intended next layer, documented not built: a stage completes when all its Things are done.)* | Each stage displays its Things; they can be ticked in the demo; there is no create-a-Thing UI yet. |

### Notes
- **Line items are immutable snapshots per version** (regulated industry needs read-only history). A new version copies unchanged lines and writes changed ones - no in-place edits.
- **OFFER vs ORDER** is set by who initiates (`deal_type`). Demo default: seller-initiated **OFFER** (overview O4).
- Seller-only and buyer-only fields on a line item (`seller_margin`, `buyer_metric`) are **never** cross-exposed - same privacy spine as the foundation blocks.

### Out of scope for the demo
- Delivery / fulfilment (`deal_delivery`, batches, CoA) - Phase 3.
- PO / SO / HS deal numbers are generated at confirmation; showing them is a **stretch**, not required for the spine.
- Relationship-level standing terms feeding the card as defaults - schema exists, not required for the demo path.

---

## Block 5 - Sella (Deal-Sella)

**Purpose:** turn conversation into a deal. Sella reads the chat, spots a deal forming, drafts the card, and writes summaries. It is the moment that makes the demo feel like magic - and it must stay a **suggestion engine**, never an actor.

**Reads / writes:** reads `chat_message`; proposes via chat lines and a drafted `deal_card`. Runs on **Claude via AWS Bedrock (EU / Frankfurt)**. In the dependency graph Sella is a **leaf** - arrows point into it, never out.

### The three jobs

1. **Detect** - notice a deal forming in the conversation.
2. **Draft** - turn the agreed shape (products, quantities, price) into a Deal Card.
3. **Summarize** - write the one-line "what changed" on each version, and short summaries.

### Requirements

| Tag | Requirement | How we know it's met |
|---|---|---|
| **SR-1** | Sella **detects** a deal forming in the p2p chat and posts a suggestion to **both** sides: "looks like a deal - shall I draft it?" Nothing is created at this point. | A `deal_detected` suggestion appears in the thread; no card exists yet. |
| **SR-2** | On both sides saying yes to letting Sella help, Sella **drafts** a Deal Card in Draft, populated from the conversation. Sella **does not** confirm it or send it. | A Draft card appears with chat-sourced contents; the two-sided confirmation still requires the humans (FR-D2). |
| **SR-3** | Sella **summarizes** each version change in one human line, written to the card log. | Each version in the log has a readable Sella-written summary. |
| **SR-4** | Every Sella action is **attributed to Sella** in the audit trail, with the triggering human recorded. | Audit rows for Sella show actor `sella` + the on-behalf-of person (foundation FR-A3). |
| **SR-5** | Sella is **non-blocking**. If Bedrock is slow or down, chat and deals **still work** - users can chat, draft manually is acceptable, and confirm. | With Sella disabled, acceptance-script steps 1-3 and 6-8 still pass. |

### The hard rule
**Sella suggests; humans decide.** It never sends a message on its own, never confirms a deal for a party, never advances a status. Every state change is a human action that Sella may *prepare* but never *commit*. This is both a product promise and the reason Sella can be a leaf the rest of the system never waits on.

### Out of scope for the demo
- The full multi-Sella family (First-contact Sella, surface specialists) - this demo is **Deal-Sella only**.
- The Sella tool layer, autonomy ladder, and reversibility tiers - post-MVP (LAYER-4 + DEV-11).

---

## How the three blocks walk the script

| Script step | Messaging | Sella | Deal Workspace |
|---|---|---|---|
| 3 - they chat | FR-M2 | (listening) | - |
| 4 - Sella spots it | FR-M4 | SR-1 | - |
| 5 - Sella drafts + workspace born | FR-M3 | SR-2 | FR-D1, FR-D3 |
| 6 - negotiate + advance stages | FR-M2 | SR-3 | FR-D4, FR-D5, FR-D7, FR-D8 |
| 7 - each confirms | - | - | FR-D2 |
| 8 - both confirmed → Confirmed | - | - | FR-D2 |

---

*Spec for the deal-flow blocks. Foundation blocks (Identity, Connections, Audit) are in [`foundation.md`](foundation.md). The end-to-end acceptance script lives in [`connect-demo.md`](connect-demo.md) §6.*
