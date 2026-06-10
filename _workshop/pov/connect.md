# Connect - working POV

**Workshop file. Gitignored. Working understanding, not finished docs.**
**Source of truth = whatever is in `docs/` once a piece migrates out.**

## Status

- **Phase:** Idea (top-down design - overview first, then drill down).
- **Scope rule:** Connect only. No moving to the next surface until Connect is resolved through Idea → Research → Prototype.

## Workflow (Ayush's stated framework)

For each surface, we follow: **Idea → Research → Prototype.**

- **Idea** (now): top-down POV. Start with the overview. Then drill into Chat, Deals, Deal Room, Deal Workspace, Relationships.
- **Research:** interviews, surveys, secondary research into actual user behavior.
- **Prototype:** invoked via the `prototype` skill when Idea + Research justify committing.

We do not jump surfaces mid-cycle. Connect goes through all three stages before we touch Present.

## Approved directions (what Ayush likes / has locked)

This section is the running log of preferences and approved directions. When Ayush says "I like that" or "yes, go with that" during the brainstorm, the call moves here with a one-line "why."

Mockups Ayush liked are copied from `.superpowers/brainstorm/<session>/` into `_workshop/inspiration/connect/` so we have permanent references.

### 2026-05-24

- **5-panel layout for Connect chat view (LOCKED).** Earlier I described 4 panels; the real shape (per Ayush's correction) is 5:
  1. Thin nav (global - Home, Connect, etc.)
  2. Connect sub-nav (categories - contents TBD, see Open Questions)
  3. List panel (depends on selected category)
  4. Detail panel (when an item is clicked)
  5. Sella rail (always)

**Rolled back (2026-05-24):**
- ~~Option B sub-nav locked~~ - I locked "Chats / Deals / Relationships" prematurely. Ayush only confirmed Chat is in the sub-nav; the other categories need research before locking.
- ~~Navigation pattern locked~~ - I locked "sub-nav → list → detail → Sella" prematurely. That pattern depends on sub-nav contents and default state, neither of which is settled. Pulled back.

**Connect default state (LOCKED 2026-05-24):**
- **Option A:** when user first clicks Connect, the Chats tab is auto-selected and the most recent chat thread opens. *Why:* matches industry-standard for communication-first tools (Slack, WhatsApp, Front, Intercom all do this); reduces clicks for the common case; low scope-creep for MVP. *Reversible:* if user data post-launch shows people want a dashboard instead, we revisit. *Ayush:* "since this is the very first time for us and we have to launch fast... over time when we learn from a user, we can always change that."

## Deal anatomy (Ayush's POV, captured 2026-05-24)

### Reframing

Deals don't get "created" - they get **initiated.** Lifecycle: communication → initiation → process → done. The **initialization moment = digital card creation.**

### Path A - Inbound contact (two-tier handling)

**Forms of inbound** (symmetric across both sides):

- From seller → buyer: deal basket, sales offer, connection (with or without note)
- From buyer → seller: connection (with or without note), offer card, pricelist request

**Two tiers of handling:**

- **Simple connection** (no substance) → just accept it, no ticket, just become connected. Optional: Sella sends a system message announcing the new connection (TBD).
- **Substantive contact** (connection + note asking for pricelist, sales offer, deal card, basket) → becomes a **ticket** → role-scoped queue → human pickup → conversation begins.

**Open (N3):** Where does the conversation appear when a ticket is picked up? Workspace immediately? Salesperson's existing chat with the customer? Some new construct?

### Path B - Sella detects from chat

Conversation has already begun (P↔P or P↔C). No card or workspace yet. Sella detects deal-forming signals and sends a **human-in-the-loop** confirmation prompt.

- **P↔P case:** central system message visible to both users mid-chat. Both confirm → card + workspace born.
- **P↔C case:** Sella asks the seller side directly. On confirmation → card + workspace born.

### Path C - Manual trigger

User types `//deal` (or equivalent). Sella may ask clarifying questions before forming the card if context is incomplete. Then card + workspace born.

### Path D - REMOVED for MVP

Deal Room is post-MVP. The "basket confirmed in Deal Room" birth path doesn't apply for MVP. **Three paths only for MVP: A, B, C.**

### Deal Workspace contents (Ayush's POV)

Born with the card. Contains:

- Contacts list (deal participants)
- Deal info
- Chat thread - the **"Deal Chat"** (new explicit vocabulary)
- Sella content (insights, summaries)
- **Multiple group flexibility** (NEW) - ability to create sub-groups inside the workspace for involving specific people. Still refining.

### Deal Card (Ayush's POV)

- **Front = AI-generated summary** of the deal (so anyone can read it and understand what's happening). *Diverges from docs - see D2.*
- Back = SIGNALS (per docs).
- Git-style version history (per docs).

### Relationship page (Ayush's POV)

- Accessed from the C↔C chat's top-middle info area (WhatsApp-style).
- Shows:
  - List of all deals between the two companies (click → workspace)
  - Sella-written insights about the relationship
  - **Per-user notes** (NEW addition - isolated to each individual, in addition to docs' per-side notes)

### Three chat types (Ayush's labeling)

1. **P↔P** - person to person
2. **C↔C** - group chat between people from Co A and Co B (NEW: can exist standalone, not only inside a workspace)
3. **Deal Chat** - the chat inside each deal workspace

P↔C is missing from Ayush's list - status unclear. *See D3.*

## Divergences from docs (to resolve)

Real contradictions between the layer docs and Ayush's current POV. Each one needs explicit confirmation. When resolved: Ayush's call wins, docs get updated post-session (DECISIONS.md propose-mode).

- **D1. Simple connection bypasses ticket flow.** *Docs (Layer 1 §7):* all first cross-company contacts (pricing request, connection request with note, deal card) → P↔C ticket → admin gate → pickup → Relationship page created. *Ayush:* simple connection (no substance) just gets accepted, no ticket; substance still becomes a ticket. *Implication if Ayush wins:* P↔C ticket flow narrows to "contact with intent" only. Plain connection becomes a lighter primitive.
- **D2. Front of deal card.** *Docs (Layer 1 §4.2):* front = facts (products, volumes, prices, discounts, terms, notes); back = SIGNALS. *Ayush:* front = AI-generated summary. *Implication:* where do facts go? Smaller section on the front? Behind a second flip? Inside the summary? Different visual hierarchy from what's documented.
- **D3. Chat types model.** *Docs (Layer 1 §3):* three types are P↔P / P↔C / C↔C (where C↔C exists ONLY inside deal workspaces). *Ayush:* three types are P↔P / C↔C-as-group-chat / Deal Chat. Two real changes:
  - (a) **C↔C as a standalone group chat** (between companies, not inside a workspace) doesn't exist in docs - new concept.
  - (b) **P↔C is missing from Ayush's list.** Did P↔C disappear entirely (first contact goes straight to C↔C?), or is it just unstated?
- **D4. C↔C chat before any deal exists.** *Docs:* C↔C only inside workspaces. *Ayush (mid-dump):* "if the companies are not yet connected, they can land directly onto the company-to-company chat." Direct contradiction with the docs' rule. Could be a real product change or just an idea; needs clarification.

## New additions (not in docs, no doc conflict)

- **N1. Multiple groups within a deal workspace** - sub-groups for involving specific people on parts of the deal. Refining pending.
- **N2. Sella system message on simple connection acceptance** - TBD whether Sella greets/announces when a connection forms without substance.
- **N3. Conversation placement when a ticket is picked up** - open question (workspace immediately? salesperson's existing chat?).
- **N4. Sella may ask clarifying questions on Path C** before forming the card if context is incomplete.
- **N5. Vocabulary: "Deal Chat"** - the explicit name for the in-workspace chat thread.
- **N6. Per-user notes on Relationship page** - individual scratchpad isolated per user. In ADDITION to docs' per-side (per-company team-visible) notes, not replacing them.

## Resolutions (2026-05-24 batch 1)

Ayush walked through all 4 divergences + 6 additions. Final state:

### Divergences resolved

- **D1 ✅ RESOLVED.** Simple connection bypasses the ticket flow. **Substantive contact** (note + ask, offer, basket, pricelist request) still becomes a ticket. **Plain connection** just gets accepted. *New question this opens:* **O1** below.
- **D2 ✅ RESOLVED.** Docs win. Front of card = facts (products, volumes, prices, terms). Back = SIGNALS. The "AI summary on front" was an aspirational thought Ayush is letting go.
- **D3 ✅ RESOLVED.** **New chat-types model:**
  - **P↔P** - two people communicating informally
  - **C↔C** - group chat between people from Co A and Co B (multi-person, both sides, standalone - not inside any workspace)
  - **Deal Chat** - chat inside each deal workspace, scoped to invited deal participants
  - **P↔C is REMOVED.** Subsumed into C↔C. *Reasoning:* if a person messages a company, the receiving company has the right to see what's being sent - which makes that a company-to-company communication by definition.
- **D4 ✅ RESOLVED.** C↔C requires both companies to be connected (no C↔C between unconnected companies). When a connection request is accepted, the C↔C chat opens automatically with a Sella system message ("these two companies have connected; person X from CoA will work on this"). *Important constraint:* all this assumes both users are in Hello Sello. Off-platform scenarios differ - see O3.

### Additions confirmed

- **N1 ✅ CONFIRMED.** Multiple temporary groups within a deal workspace. The 1:1 Deal Chat stays the ground truth; sub-groups handle side-conversations that shouldn't pollute it. Deletable.
- **N2 ✅ CONFIRMED in principle.** Sella system message on connection acceptance is good. Exact placement / flow still TBD.
- **N3 🔴 STILL OPEN.** Where does conversation appear when a ticket is picked up? Needs more discussion.
- **N4 ✅ CONFIRMED.** Sella may ask clarifying questions on Path C `//deal` trigger. Helps avoid wrong deals + teaches the user over time when / what triggers a deal.
- **N5 ✅ LOCKED.** Vocabulary: **"Deal Chat"** is the explicit name for the in-workspace chat thread.
- **N6 ✅ CONFIRMED.** Per-user notes on Relationship page are an individual mental-model / personalization tool, in addition to docs' per-side notes. Reasoning: each person needs personalization across the companies they're connected to.

### New OPEN questions surfaced from this resolution

- **O1. Connections-management surface placement.** Where do users see + manage their incoming/outgoing connection requests, accepted connections, pending ones? Ayush's candidates: LinkedIn-style separate page, a new tab inside Connect's second column (peer to Chats), or somewhere else. Live ticker for "who is operating which ticket" also flagged. Industry comparison needed (LinkedIn, HubSpot Conversations, etc.).
- **O2. The 3-chat-sync problem.** With P↔P + C↔C + Deal Chat all coexisting between the same two companies (sometimes simultaneously, often with overlap), how do they sync? When does a user know which chat to use? When does info flow from one to another? *Ayush:* "I have a rough idea, but how to do it in a cleaner way I'm still not clear in my head." **This is the most foundational design problem unique to Hello Sello.**
- **O3. Off-platform scenarios.** All current chat-type logic assumes both users are in Hello Sello. If one user is NOT, the scenario differs (email-only, Hello Sello banner, etc., per Layer 5 §3.3). Tracked here as a placeholder; deserves its own focused session.

## O2 deep dive - Ayush's mental model (2026-05-24)

Walkthrough of the 3-chat-sync model with Anna (buyer-side, CoA) and Marcel (seller-side, CoB).

### Pre-deal phase

1. Anna sends a pricelist request → lands in a "panel" / ticket queue on seller side.
2. Marcel picks up the ticket.
3. **P2P chat** opens between Anna and Marcel with a Sella system message ("Anna asked for a pricelist; Marcel is now helping").
4. They discuss pricing, terms, etc., in P2P.
5. Two scenarios from here:
   - **Scenario 1 - direct creation.** Marcel (or Anna) explicitly creates a deal card and sends it via chat.
   - **Scenario 2 - Sella detection.** Sella reads P2P, detects a deal-forming signal, pops a **dialog box on both users' screens** ("I'm sensing a deal. Should I create a deal card?"). Both confirm → birth.

### Deal birth

- Deal Card + Deal Workspace + Relationship Page all created together (if first deal between these companies).
- **Divergence flag:** docs (Layer 1 §7) say Relationship Page is created at PICKUP, not deal birth. See Concerns below.

### Negotiation phase

- Deal Chat opens inside the workspace with a Sella system message ("Marcel and Anna have begun a deal. Initial card attached.").
- Negotiation = card changes via Accept / Counter / Reject.
- On change → notification to the other party (same 3 options).
- On final acceptance → **dialog box** on both screens to write an evidence log ("Based on discussion, we agreed on X").
- On confirm → system message updates Deal Chat with the evidence log.

### Sync mechanism (Ayush's idea)

- **P2P → Deal Chat** sync via Sella system messages + evidence-log dialogs.
- **Deal Chat = ground truth.** Always.
- **C2C is de-prioritized.** Only for routing fallback (when you don't know who on the other side to send to) or team-coverage handoff.

### Open: Sella interactive UX

How does Sella pop a dialog on two screens at once? Ayush floated:
- Dialog box appears simultaneously for both
- Top-of-screen logo changes shape (Claude-like) to signal "Sella wants attention"
- Other?

## Critical concerns on the O2 model (2026-05-24)

### Concern 1 - P2P-as-primary breaks the team-visibility moat (BIG)

Docs (Layer 1 §11 + Layer 1 §6.3) lock: **"Personal chat content: never company-visible."** Sella's system messages reach the company room; the underlying P2P content does not.

If P2P is the primary venue for pre-deal substantive conversation (pricelist negotiation, terms discussion, intent signaling), then the seller's COMPANY has no visibility into what their salesperson is offering until Sella detects a deal forming.

This breaks:

- **Team coverage** - if Marcel is sick, no one else has context to pick up Anna's thread.
- **Manager oversight** - sales manager can't review what's being offered or correct mistakes.
- **Audit / compliance** - regulated cannabis-pharma needs paper trail of pre-deal terms (BfArM, GMP).
- **Onboarding** - new reps can't see precedent / learn from past conversations.

**Industry pattern (Front, Intercom):** the inverse. The CONVERSATION is the unit, team-visible by default. Private "internal notes" are SECONDARY, not primary. This is how shared inboxes work.

**Reconciliation options:**

- (a) **Flip to industry pattern.** C2C becomes primary for company-facing conversation; P2P only for genuinely personal asides between two humans.
- (b) **Keep Ayush's model + Sella as bridge.** P2P stays personal/private, but Sella auto-summarizes substantive content to a team-visible surface (Relationship page). Company gets the gist without seeing the raw chat. This preserves the personal feel AND gives team coverage.
- (c) **Per-message visibility opt-in.** Each P2P message can be marked "share with team" by the sender. Default = private.

### Concern 2 - Relationship page creation timing

Docs say PICKUP. Ayush says deal birth.

Pickup creates room for "we've connected but no deal yet" state - notes, prior P2P, pricelist requests can accumulate. Deal-birth creation makes the relationship purely deal-driven (no relationship without a deal).

**Recommend: stick with docs (pickup).** It's more flexible and matches reality - connections often exist before deals.

### Concern 3 - Multiple concurrent deals between same companies (DEV-37)

If Marcel-Anna have an active Deal Chat, AND a new deal-forming signal appears in their P2P, does:

- New deal extend the existing Deal Workspace?
- Or create a separate Deal Workspace?

Per docs: separate. But then P2P has to route info to the RIGHT Deal Chat - and Sella needs to disambiguate "which deal is this about?"

### Concern 4 - Sella dialog timing with offline users

If Anna is online + Marcel is offline, dialog appears for Anna instantly. Marcel sees it on next login. Does Anna wait indefinitely? Does Sella retry? What if Anna confirms but Marcel never responds?

### Concern 5 - Internal seller-side coordination

In real B2B, multiple seller-side people (manager + rep + finance + logistics) coordinate BEFORE responding to a buyer. In Ayush's model, this happens where?

- C2C? But C2C is now de-prioritized.
- Internal Slack? Off-platform - kills the "everything in HS" moat.
- Inside the workspace before deal birth? But workspace doesn't exist pre-birth.

**Need an answer.** This is where C2C might actually need to be primary, not fallback.

### Concern 6 - Chat surface count is creeping up

Surfaces active in the model: P2P, C2C, Deal Chat, sub-groups inside Deal Chat. That's 4 chat-like surfaces. Cognitive load on users is rising. "Where do I put this message?" friction is real.

### Concern 7 - Three deal-birth paths overlap unclearly

The model now has:
- Scenario 1: direct create (Marcel makes a card, sends)
- Scenario 2: Sella detection + both confirm
- Path C (from docs): manual `//deal` trigger

Where does Path A (ticket pickup → birth, from docs) fit in Ayush's new flow? Or does the "pickup → P2P → deal" sequence replace Path A?

## Resolutions (2026-05-24 batch 2 - O2 deep dive)

### Locked

- **D1 follow-up - notify on simple connection.** When a connection is accepted: (a) Relationship page is created (per docs, pickup-creation), (b) C2C chat opens with Sella system message ("CoA + CoB now connected"), (c) Relationship page shows "no deal yet" + a **"Start a deal" CTA** that lets either side initiate a basket / order / offer card directly. The "no deal yet" state subconsciously prompts users toward deal initiation.
- **Concern 1 - P2P privacy + team visibility.** Reconciliation accepted:
  - P2P content stays private to the two people (docs rule holds).
  - Sella auto-summarizes substantive P2P to the Relationship page (team-visible).
  - **Back of Deal Card** carries seller-side context once the deal exists - covers the "Marcel sick" scenario in the post-birth phase.
  - **New follow-up (open):** "attach observer / supervisor" feature, inspired by Front's follow/attach pattern. Lets a salesperson loop in a manager explicitly for visibility on a deal or chat. Pre-deal phase coverage.
- **Concern 2 - Relationship page timing.** Stick with docs (pickup-creation). Resolved.
- **Concern 7 - Birth path overlap.** Path A from docs = Scenario 1 (direct create) in Ayush's framing. If someone sends a deal card, that IS the deal card; recipient accepts / counters / rejects.

### Still open

- **Concern 3 - Multiple concurrent deals (DEV-37):** routing problem unresolved. If Anna and Marcel have an active deal AND a new deal-forming signal appears in P2P, Sella has to disambiguate which Deal Chat to sync to.
- **Concern 4 - Sella dialog timing:** proposed fix = soft notification card (not blocking dialog), no timeout, waits for both confirmations. Awaiting Ayush's response.
- **Concern 5 - Internal seller-side coordination:** **resolved via Things primitive.** Ayush surfaced the right pattern - when a salesperson asks a supervisor "what should I send?", that's a Thing-with-reply, not a new chat thread. Layer 3 Things primitive applies. **Implication:** Things primitive scope EXPANDS from "post-confirmation execution" (per docs) to "universal structured work mechanism, pre-deal AND post-deal, internal AND external."
- **Concern 6 - Chat surface organization:** addressed with the office-building mental model below.

### Office-building mental model (industry-aligned)

To reduce "where do I put this message?" friction, map each chat-like surface to a real-world room:

- **P2P** = hallway chat. Private, between two humans.
- **C2C** = meeting room with both companies' teams. Anyone on either side can hear.
- **Things (internal)** = clipboard system within one company. Structured ask + reply. Not a new chat surface.
- **Deal Chat** = the negotiation room for one specific deal. Invited participants only. **Ground truth.**
- **Sub-groups in Deal Chat** = a corner of the room for a side conversation. Ad-hoc, deleted when done.

3 chat surfaces + Things primitive + ad-hoc sub-groups. Each has one clear job.

### Industry comparison

- **Front** = 1 primary surface ("conversation with customer") + internal notes inside. Simple.
- **Intercom** = same shape as Front.
- **Slack** = team channels + personal DMs + Slack Connect for external. Simple separation.
- **Microsoft Teams** = team channels + 1:1 DMs + meeting chats. Closest to Hello Sello's multi-layer model.
- **Linear** = skips chat entirely. Issues + comments + assignees handle everything.

Hello Sello's model has more chat surfaces than any of these because the product has more relationship layers (person, company, deal, internal team). That's structural, not accidental. **Discipline going forward: every surface must justify why it exists distinct from its neighbors.**

### Things primitive scope expansion (proposed lock)

Layer 3 docs introduced Things as "post-confirmation universal execution primitive." Ayush's internal-coordination use case extends this:

> Things primitive is the universal structured-work mechanism. Applies pre-deal AND post-deal, internal AND external (across-company). Replaces the need for a separate "Internal Company Chat" surface.

Worth migrating to DECISIONS.md post-session.

## Resolutions (2026-05-24 batch 3 - session closing)

### Corrections / Unlocks

- **"Attach a supervisor" idea is NOT locked.** I had locked it prematurely. Status: IDEA, inspired by Front's follow/attach pattern, not baked. Open: is it actually a new feature, or just a Thing-with-assignee?

### Concern 3 RESOLVED - Multi-deal model (Ayush's POV)

- **Principle:** don't force people to work differently than the real world. People already work on multiple deals at once and know which is which.
- **Each new deal → its own Deal Workspace + Deal Chat.**
- **UI:** in P2P chat between two people who share multiple deals, show a **thin line / reference marker** in the chat stream for each deal (with deal number). Helps both humans keep context.
- **Sella:** knows which deals exist between Marcel and Anna; uses that for routing.
- **Backend:** each deal has a unique ID. Routing is by deal ID - clean.
- *Ayush:* "best I can come up with as of now." Direction locked; may refine.

### Concern 4 - needs simpler re-explanation

Carried to next session.

### Deal card visibility - extra context (for future deal-card deep dive)

- Whatever happens in a deal gets a **log inside the deal card** (audit trail).
- **Internal-only events** (within one company) → visible only to that company.
- **Shared events** (deal changes, agreements) → visible to both companies.
- Detail TBD when we deep-dive the deal card.

### Things primitive scope expansion - CONFIRMED

Things primitive applies pre-deal AND post-deal, internal AND external. Replaces need for a separate "Internal Company Chat" surface.

**TODO next session:** check Linear (DEV-27 + adjacent) for existing Things discussion that should feed this.

### Office building analogy - direction confirmed (NOT locked)

Ayush approves the model as a working mental scaffold. Direction; not a locked decision.

### Inspiration sources for next session

- **Use:** Front, Intercom, Microsoft Teams - chat-based platforms with relationship layers.
- **Don't compare for chat patterns:** Linear - it's a different shape (structured-work, not chat).
- **Use Linear** only as a Things primitive reference.

For overall workshop state at session boundaries, see `_workshop/SESSION-STATE.md`.

## Overview

*(To be filled - the top-down view of Connect: what it is, who uses it, what jobs it does, and how it relates to the rest of the product.)*

## Chat

*(Initial capture in session 1 summary. To be deepened here.)*

## Deals

*(Flagged by Ayush as having a lot more structure inside Connect. Deal cards, deal status, deal lifecycle - all to be defined here.)*

## Deal Room

*(Future feature - shareable external link version of a seller's shop, with Sella answering buyer questions inside. Initial capture in session 1 summary. Connection to Connect-as-a-surface to be clarified.)*

## Deal Workspace

*(New term, surfaced in turn 7. To be defined.)*

## Relationships

*(New term. Initial hint: possibly a partner-level view above per-conversation chats, possibly a side-panel entry inside Connect. To be defined.)*

## Open questions landscape (full map, mapped 2026-05-24)

Comprehensive list of everything still open for Connect. Grouped by area. Status legend:

- 🟢 **LOCKED** - decided (here or in shared docs)
- 🟡 **PARTIAL** - has direction in docs, needs UI confirmation or research
- 🔴 **OPEN** - genuinely undecided

### A. Sub-nav and IA (Information Architecture)

| ID | Question | Status |
|---|---|---|
| A1 | What categories are in Connect's sub-nav? Chat confirmed, others TBD. | 🔴 OPEN |
| A2 | Order of categories in the sub-nav | 🔴 OPEN |
| A3 | Are categories static, or dynamic based on user activity / role? | 🔴 OPEN |
| A4 | Connect default state when no tab selected | 🟢 LOCKED Option A |

### B. Chats tab

| ID | Question | Status |
|---|---|---|
| B1 | Which chat types appear in Chats tab? (P↔P, P↔C, C↔C-in-workspace) | 🟡 Docs define 3 types - placement TBD |
| B2 | Are C↔C workspace chats listed here, or only inside their workspace? | 🔴 OPEN |
| B3 | How are Outsiders surfaced? Filter, tab, mixed in? | 🔴 OPEN |
| B4 | What chat filters? (Person / Company / Outsiders / Unread / All / Deals) | 🔴 OPEN |
| B5 | Where do Connection Requests (P↔C tickets) appear? In Chats, or separate? | 🔴 OPEN |

### C. Deals tab (if it exists)

| ID | Question | Status |
|---|---|---|
| C1 | Is Deals a separate tab in Connect sub-nav, or accessed via chats only? | 🔴 OPEN |
| C2 | What shows in the Deals list? (Active / Draft / Confirmed / All) | 🔴 OPEN |
| C3 | Filters in the Deals tab? | 🔴 OPEN |
| C4 | Click a deal: opens Deal Workspace, or Deal Card alone? | 🔴 OPEN |
| C5 | Deal Workspace UI layout | 🔴 OPEN (DEV-9) |
| C6 | Deal Card front/back UI inside Connect | 🟡 Docs have model (Layer 1 §4.2) - UI partially via existing prototypes |

### D. Relationships tab (if it exists)

| ID | Question | Status |
|---|---|---|
| D1 | Is Relationships a separate tab in Connect sub-nav? | 🔴 OPEN |
| D2 | What's in the Relationships list? (Companies you have relationships with) | 🟡 Per Layer 1 §4.1 - confirm in UI |
| D3 | Relationship page UI layout | 🔴 OPEN (DEV-8 closed for contents, layout TBD) |
| D4 | How are Notes / Agreed terms / Pricelist / Deal history / Sella insights organized? | 🔴 OPEN |

### E. Connection Requests (inbound P↔C tickets)

| ID | Question | Status |
|---|---|---|
| E1 | Where do P↔C tickets appear in Connect? Chats / Inbox / Notification | 🔴 OPEN |
| E2 | Pickup flow in the UI | 🟡 Docs have process (Layer 1 §7) - UI TBD |
| E3 | First-contact Sella - where she lives in UI | 🟡 Layer 4 §5 - confirm |

### F. Things (universal action items, per Layer 3)

| ID | Question | Status |
|---|---|---|
| F1 | Does Connect have a Things tab/section? | 🔴 OPEN (DEV-27, Marcel proposed an "Execute" surface) |
| F2 | Where do Things live? Sub-nav tab? Right rail? Inside workspaces only? | 🔴 OPEN |

### G. Sella behavior in Connect

| ID | Question | Status |
|---|---|---|
| G1 | Personal Sella on no-selection, side-Sella on chat/relationship select | 🟢 Layer 4 §5 - locked, UI confirm |
| G2 | "What's on my plate" Sella overlay invocation mechanism | 🟡 Layer 4 §5 |
| G3 | Deal-Sella interactive prompts placement (above chat, middle-aligned) | 🟢 Layer 4 - locked |

### H. Deal Room (cross-cutting between Connect / Present)

| ID | Question | Status |
|---|---|---|
| H1 | Is Deal Room accessed from Connect, or only from Present? | 🟡 Layer 1 §4.4 says from Present (via Basket/Deal Card expand) - confirm with Ayush |
| H2 | If from Connect, how? | 🔴 Depends on H1 |

### I. Buyer-side symmetry (cross-cutting)

| ID | Question | Status |
|---|---|---|
| I1 | Do buyers see different content in Connect than sellers? | 🟡 ACTIVE RESEARCH (Ayush + Muskan interviewing) |
| I2 | Does buyer symmetry affect Connect's sub-nav structure? | 🔴 Depends on I1 |

### J. Multi-deal organization (DEV-37)

| ID | Question | Status |
|---|---|---|
| J1 | Multiple active deals with same company - how organized in Chats / Relationships? | 🔴 OPEN |
| J2 | Per-deal chat threads, vs single thread per company? | 🔴 OPEN |

### K. Visibility and permissions in UI

| ID | Question | Status |
|---|---|---|
| K1 | 16-combo access matrix - confirmed in Connect UI | 🟢 Layer 1 §11 - locked |
| K2 | PRIVATE deals on Relationship page - how shown in UI | 🟡 Layer 1 §11.2 - locked rule, UI TBD |
| K3 | Personal chat content never visible company-wide | 🟢 Layer 1 §11 - locked, UI enforces |

### Dependency map (what unlocks what)

The decisions cluster - some are upstream:

- **A1 (sub-nav categories) is the most upstream question.** It decides what tabs exist. Cascades to: B5 (where Connection Requests go), C1 (is Deals a tab?), D1 (is Relationships a tab?), F1/F2 (is Things in Connect?), B3 (where Outsiders go).
- **B3, B5, C1, D1, F1 are all "does this object get its own tab" questions.** Resolve them together with A1, not in isolation.
- **I1 (buyer-side symmetry) is parallel and could shift everything.** Pending Ayush + Muskan's research output - holds an exception card.
- **C5 (Deal Workspace UI) and D3 (Relationship page UI) are downstream deep-dives.** Solvable independently once A1 settles.
- **J1/J2 (multi-deal organization) depends on A1 + per-deal-vs-per-company chat structure.**
- **G/K (Sella + permissions) are mostly locked by docs.** Mostly UI confirmation, not redesign.

### What we know vs. what we don't (count)

- 🟢 LOCKED: 5 (A4, G1, G3, K1, K3)
- 🟡 PARTIAL (locked in docs, UI TBD or partial): 7 (B1, C6, D2, E2, E3, G2, K2, H1)
- 🔴 OPEN (genuinely undecided): 16

The OPEN cluster is concentrated in **A, B (chats), C (deals), D (relationships), F (things), J (multi-deal)**. That's where the design work actually lives.

## Research notes

### Connect default state - SaaS patterns (2026-05-24)

How comparable tools handle "first click on a navigation surface" default:

**Communication-first tools:**
- Slack → last channel viewed
- WhatsApp / Telegram Desktop → most recent chat
- Front / Intercom → inbox with most recent message
- Discord → last server / channel

**Workflow / CRM tools:**
- Linear → "Inbox" or "My Issues" (configurable)
- HubSpot / Salesforce → dashboard with key cards
- Asana → "My Tasks"

**Hybrid:**
- Microsoft Teams → "Activity" feed OR most recent chat (configurable)
- Notion → last-visited page

**Pattern:** Communication-first tools overwhelmingly default to "last / most-recent conversation." Workflow tools default to dashboards. Since Connect IS the chat surface for Hello Sello, the industry-standard fit is **Option A** (default to Chats tab + recent thread). Aligns with Ayush's intuition.

**Caveat:** Hello Sello differs because the platform's value prop is "deals get made here." A "needs attention" view (Option C/D) could be more valuable - but that's the scope creep Ayush flagged. For MVP, Option A is safe + industry-aligned. Revisit post-launch with usage data.

## Migration breadcrumbs

*(When pieces gel, what moves where. Maintained across turns.)*

- (Nothing migrated yet from this file.)

---

## Source links

- Session 1 summary: `../notes/2026-05-24-vision-dump-session-1.md`
- Inspiration images (to be persisted): `../inspiration/`
- Workshop README: `../README.md`
- Existing shared docs touching Connect:
  - `docs/product/surfaces/CONNECT.md`
  - `docs/product/layers/LAYER-1-USERS-AND-CORE-OBJECTS.md`
  - `docs/product/layers/LAYER-3-DEAL-EXECUTION.md`
  - `docs/product/layers/LAYER-5-INPUTS-AND-OUTPUTS.md`
