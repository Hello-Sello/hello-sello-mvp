# Hello Sello — Layer 1: Users and Core Objects

**Purpose of this document:** Capture everything we agreed on in Layer 1 so we are aligned on the same design scope before moving to Layer 2.

**Layer 1 covers:**
- Who uses Hello Sello (company types + roles)
- The core objects that exist on the platform (Relationship, Deal Card, Deal Workspace)
- How a deal comes into existence (the birth lifecycle)
- How negotiation works
- The multi-Sella agent architecture

**Layer 1 does NOT cover:** the product surfaces (Connect / Present / Sell / Buy / Grow pages), inputs/outputs (chat, email, fax, ERP), or Sella's specific behaviors. Those come later.

---

## 1. Companies on the platform

**Two types only (for MVP):**

- **Distributors / wholesalers** — companies that sell products.
- **Pharmacies** — companies that buy products.

**A single company can play both roles.** Some companies only sell. Some only buy. Some do both. The platform is symmetric — every company has access to both Sell and Buy capabilities; they choose how much to use each.

**Future (not MVP):**
- Logistics partners as their own company type.
- Adjacent businesses: packaging suppliers, lab supplies, raw materials, Food & Beverage distributors.

> **DEV-3 — closed (2026-05-24).** Contact-import GDPR scope at account setup: **Option A — metadata only** (sender / recipient / timestamp / frequency). No subject lines, no email bodies, no third-party enrichment vendor. See DECISIONS.md Layer 1 walkthrough locks 2026-05-24 for full rationale; ARCHITECTURE-NOTES.md "Onboarding / data import" for engineering constraints.

---

## 2. People (roles) inside a company

> **DEV-6, DEV-40 — closed.** DEV-6 (deal-record visibility) closed 2026-05-18 via the two-layer visibility model (Section 11.2). DEV-40 (org-level role architecture) closed 2026-05-20 with the Superadmin + custom Groups model — see below. (DEV-41 — non-deal content permissions — closed 2026-05-20 in Section 4.1.) Multiple concurrent deals organization remains tracked as [DEV-37](https://linear.app/hellosello/issue/DEV-37/create-organized-chat-windows-and-logs-for-multiple-deals).

**Two layers of permissions: organization-level and deal-level.**

**Layer A — Organization-level (locked 2026-05-20, DEV-40):**

- **Superadmin** — the only platform-fixed role. **At least one per company** (created at account setup, transferable). System-level powers: accept incoming company-connection requests, manage billing, add/remove other Superadmins.
- **Groups** — every other role is a **custom Group**, defined per company. Each Group carries a permission set, configured at setup using a green/red **Action × Group matrix**. Drag-and-drop UI to assign people to Groups.
- **Members** — every signed-in user belongs to the company and to **N Groups simultaneously** (many-to-many). Effective permissions = union of group permissions.

Industry CRM pattern (Notion / Slack / Linear style) — sensible defaults at registration + full customization.

**Examples of Groups a company might create** (illustrative; names and permissions are fully company-defined):
- VP / Sales Manager / Junior Manager — hierarchical tiers
- Sales team (seller side) / Procurement team (buyer side) — functional groupings
- Procurement team on the seller side — inventory / batch management, feeds FIFO allocation
- Cannabis Compliance / QA — regulated-industry-specific
- **Approver** — group flagged with approval rights for gated actions (e.g., pricelist sign-off — see §4.1)

**Layer B — Deal-level (collaborators):**
- Each deal has its own collaborator list, like a GitHub repo.
- Each side manages their own collaborators on a deal (the seller's Superadmin cannot add buyer-side people).
- A collaborator can be **scoped to specific stages** of a deal (e.g., a regulatory consultant only joins for stage 3-4).

**Rule for MVP:** one person belongs to exactly one company. May change in future.

**External experts** = invited to a single deal via a time-limited share link. Free for now. (Post-MVP feature.)

---

## 3. Identity layers

> **DEV-7 — closed (2026-05-19).** P↔C contact lands on super-admin + designated salespeople as a ticket; first-contact Sella greets, qualifies, and requests docs (pre-pickup docs sit in a "pending inbox"); pickup formalizes the connection, activates the Relationship page, archives the P↔C, and opens a new P↔P chat. See Section 7 for the full flow.

A user has two identities at once:
- **Personal identity** (their own profile)
- **Company identity** (the company they belong to)

**Three kinds of conversations:**

| Conversation type | Who sees it | When it's used |
|---|---|---|
| **Person ↔ Person** | Only the two people | Informal talk, including casual messages that may turn into deal talk |
| **Person ↔ Company** | Super-admin + designated salespeople of the receiving company | First contact from outside (pricing request, connection request, or deal card). First-contact Sella greets and collects docs. On pickup, converts to a P↔P chat. See Section 7. |
| **Company ↔ Company** | Only people invited to that specific deal | **Only exists inside a deal workspace.** Created when the workspace is created (at deal-card birth). Tied to ONE specific deal. There is no general C↔C chat outside a deal. |

**Important correction we locked in:** company-to-company chat is **NOT** broadcast to all colleagues. It is scoped to **only the people invited to that specific deal**.

---

## 4. Core objects

### 4.1 The Relationship (Company ↔ Company)

> **DEV-8 — closed (2026-05-19).** Page contents listed below. Visibility resolved via the DEV-6 two-layer model (see Section 11). PRIVATE deals stay scoped until accepted, then flip to company-wide — **no separate "private group" tier**.
>
> **DEV-41 — closed (2026-05-20).** Permissions on each content type locked — see the Permissions table below.

A real, first-class object. **Created the moment a P↔C ticket is picked up** (= the moment two companies first connect — see Section 7). Once created, persistent forever.

**Pre-pickup activity** (initial P↔C messages + docs that first-contact Sella collected) lives in a temporary **pending inbox** tied to the receiving company. On pickup, the pending inbox **migrates onto the freshly-created Relationship page**.

**What lives on the Relationship page:**
- **Notes** — **per-side, not shared**. CoA has their own notes about CoB; CoB has their own notes about CoA. Each side's notes are visible only to that side.
- **Agreed terms** — visible to both sides (mutually-agreed; edit workflow deferred)
- **Custom pricelist** — the seller's pricelist customized for this buyer; visible to both sides
- **Full history of all deals** between the two companies (governed by §11.2 visibility model)
- **Sella's insights** about the relationship (system-generated by Deal-Sella)

**Permissions on Relationship-page content (locked 2026-05-20, DEV-41):**

| Content | Read | Write |
|---|---|---|
| **Notes** (per-side) | Owning side only — everyone in CoA sees CoA's notes; everyone in CoB sees CoB's notes. | CRM-style — everyone in the owning side can edit or delete. Every change (edit + delete) is logged with user + timestamp + before/after diff. |
| **Agreed terms** | Both sides | TBD (mutually-agreed; edit workflow deferred) |
| **Custom pricelist** | Both sides | Seller-side only; edits gated by **approval workflow** — Proposed → Approver sign-off → Applied. Approver = anyone in an Approver-flagged Group. **Single-approver for MVP**; multi-approver post-MVP if regulated use cases demand it. |
| **Deal history** | Per §11.2 visibility model | System-generated |
| **Sella insights** | Both sides | System-generated (Deal-Sella) |

**Why it matters:** when person X from Company A approaches Company B 9 months later about a different product, the Relationship already exists. The chat room is already there. They reuse the existing relationship.

### 4.2 The Basket / Deal Card

The **product carrier** of a deal — **one entity, two visual representations across its lifecycle:**

- **Cart-style (Basket)** — while the seller is assembling products from their shop for a customer presentation. Same as a shopping cart.
- **Pokémon-card-style (Deal Card)** — once the deal starts to form (signals detected, offer sent and accepted/countered, basket confirmed in a Deal Room, or manual trigger).

The same underlying record carries products / volumes / prices / discounts / payment terms / delivery terms / notes through both stages.

**Front of the card:** the deal facts. Products, volumes, prices, discounts, free delivery, payment terms, notes.

**Back of the card (flip):** **SIGNALS** — Deal-Sella-generated insights about the deal. Starting MVP set (extensible):

1. When was the deal created
2. Typical close time between these two companies (fallback to platform-wide benchmark if no A↔B history yet)
3. Product expiry risk
4. Repeat buy/sell pattern (suggest stocking / re-ordering for business continuity)
5. Low product availability (suggest stocking more)
6. Logistics-cost bundling opportunity
7. Collaborative business insight (Choco-AI-inspired)
8. Other AI suggestions (extensible)

**UI controls on the card:**
- **Flip** button (top-left) → turn to back (SIGNALS).
- **Expand** button (top-right) → open the **Deal Room** (full-page floating customer-presentation view — see Section 4.4).

**Compute model and storage model** of SIGNALS are open engineering questions — tracked as [DEV-48](https://linear.app/hellosello/issue/DEV-48), [DEV-49](https://linear.app/hellosello/issue/DEV-49).

**Per-viewer personalization (LOCKED 2026-05-23, [DEV-50](https://linear.app/hellosello/issue/DEV-50/personalize-back-of-card-signals-per-viewer-premium-feature)):** MVP = one neutral insight per Deal Card, always filled (Deal-Sella generates per deal), shown identically to both buyer and seller — no personalization, no premium gating. Post-MVP = two viewer-aware slots (buyer-flavored + seller-flavored), premium-tier feature; free users see a locked placeholder. How Deal-Sella infers viewer role is deferred (separate follow-up issue).

**Git-style version history.** Every edit is logged. Every negotiation round produces a new version. The full history is preserved as an audit / evidence trail.

### 4.3 The Deal Workspace

> **⚠️ OPEN [DEV-9]** — Deal Workspace contents and layout are early ideas, not finalized. What's the full component list, how is it laid out visually, what's surfaced first? See [DEV-9](https://linear.app/hellosello/issue/DEV-9/what-exactly-gets-created-inside-a-deal-workspace-and-how-should-it).

The **container** of a deal. Auto-scaffolded the moment a deal card is born.

**What auto-creates inside the workspace:**
- A chat thread (scoped to invited participants only)
- An artifacts folder (documents, COAs, contracts, etc.)
- A members list (initial: the two dealmakers; more people can be added as needed)
- Stages (custom per deal, defined by the participants with Sella's help)
- The deal card itself

The deal card lives inside the workspace. The card is what people see; the workspace is what holds everything.

### 4.4 The Deal Room

The **customer-presentation surface** of the platform — opened by expanding either a **Basket** or a **Deal Card** (see Section 4.2). Floating, full-page.

**Purpose:** salesperson tool. Like a seller laying out products in person, but on-platform — with videos, photos, and Loom-style salesperson recordings to bring the products alive for the customer.

**What lives inside:**
- The Basket / Deal Card it was opened from (product list, volumes, indicative prices)
- Media tied to each product (videos, photos) — **reused across all Deal Rooms** that include the product, not duplicated
- Optional per-room additions: Loom video from the salesperson, presentation notes, special offers

**Locked properties:**
- **1 Deal Room per Basket / Deal Card** (1-to-1 mapping).
- **Re-presentable** — the same Deal Room can be re-opened and presented to multiple customers if the seller wants.
- **Persistent** (engineering choice between persistent object vs transient render tracked as [DEV-52](https://linear.app/hellosello/issue/DEV-52)).
- **Off-platform sharing via temporary link** — for customers not yet on Hello Sello. Doubles as a marketing surface to bring them onto the platform.

**Why it matters:** the Deal Room is how a seller "sells" pre-deal — Sella's job here is to make the presentation feel as good as a salesperson sitting across the table.

---

## 5. The Deal Lifecycle (State Machine)

### 5.1 Three states

```
[1] CHAT (pre-deal)
        |
        | Birth event
        v
[2] DRAFT DEAL (born, in negotiation)
        |
        | Both sides accept final terms
        v
[3] CONFIRMED DEAL (in execution)
        |
        | All stages completed
        v
    DONE / ARCHIVED
```

| State | Card exists? | Workspace exists? | Description |
|---|---|---|---|
| **Chat** | No | No | Informal talk, price inquiries, casual messaging |
| **Draft deal** | Yes (v0.1 → v_n) | Yes | Deal card born, terms partial, negotiation happening |
| **Confirmed deal** | Yes (locked) | Yes | Both sides accepted final terms, deal in execution |

### 5.2 How a deal card is born (Basket → Deal Card transition)

> **DEV-10 — closed (2026-05-19).** The full access model for two HS users across all connection states is the 16-combo matrix — see Section 11.1. The matrix is the master answer for "what can these two users do right now?"

A Basket becomes a Deal Card (= the deal forms) by one of these triggers:
- **Basket / offer confirmed in a Deal Room** during a customer presentation
- **Sella detects deal-forming signals** in chat (see Path B below)
- **An offer is sent** and the receiver **accepts** or **counters** (see Path A below)
- **Manual trigger** (`//deal` or `+` button — see Path C below)

The three classic birth paths below describe the canonical flows; the Deal-Room-confirmation path is a fourth variation that fits Path A's spirit (a sent offer becomes a deal on acceptance).

**Path A — Pickup of an inbound offer ticket (automatic birth)**

```
Buyer builds an offer card on seller's shop
        |
        v
Sends to seller company
        |
        v
Lands at seller's ADMIN (connection gate)
        |
        v
Admin accepts the connection → ticket enters seller's queue (role-scoped)
        |
        v
Salesperson PICKS UP the ticket
        |
        v
*** BIRTH *** → Deal Workspace spawns → Card = v0.1
```

The buyer's act of sending the proposal is already a declaration that this is deal-shaped. Pickup confirms intent on the seller side. Together = birth.

**This path is symmetric.** The seller can also initiate: build an offer card from their own shop → send to a buyer company → buyer's admin gate → buyer-side queue → procurement team member picks up → birth. Same flow, opposite direction.

**Path B — Sella detects from chat → both confirm**

Two people are chatting — in a **Person↔Person** or **Person↔Company** chat. (C↔C chats don't exist outside a deal workspace, so Path B can't fire there — Path B is what *creates* the workspace.) Sella watches for **deal-forming signals:**

- A specific **product + a specific quantity** ("200 kg of OG Kush" — not just "do you have OG Kush?")
- A **price proposal** ("I can do €5/g," "what about €4.80?")
- **Terms language** ("free delivery," "Net 30," "milestones")
- **Affirmation patterns** ("let's do this," "we agree")

**Minimum signal to act:** product + quantity OR product + price. Product alone = inquiry, no birth.

When Sella sees the signal, she pops a system message in both users' views:

> *"I think a deal is forming here. Open a deal room?"*  [Accept] [Reject]

Both Accept → birth. Otherwise Sella waits.

**Path C — Manual trigger**

- Type `//deal` in any chat or Sella window
- Or click the `+` button in a chat window
- Or ask Sella directly

Sella creates a draft card with whatever context she has. The other party gets a prompt: *"Your colleague is starting a deal — accept?"* [Accept] [Reject]

Both Accept → birth.

### 5.3 What the card looks like at birth

Sella pre-fills the card with what she has seen so far: product names, quantities mentioned, any price hints, any terms language. Blank fields stay blank. The card is a **starting point**, not a final.

---

## 6. Negotiation (state 2 — draft deal)

### 6.1 Three actions on any deal card version

- **Accept** — agree to the current version.
- **Counter** — propose a change.
- **Reject** — kill the deal.

### 6.2 The counter flow

When someone clicks Counter:
1. Sella pops up and asks: *"What's your counter?"*
2. The user provides the change (price, volume, terms, etc.).
3. Sella creates a **new version** of the card with the counter applied.
4. The new version is sent to the other party.
5. The other party can Accept / Counter / Reject.
6. Loop until Accept or Reject.

Every version is logged in Git-style history.

### 6.3 Two valid negotiation venues (both supported)

| Venue | Where it lives | Sella's behavior |
|---|---|---|
| **Personal chat** (informal) | Between two people | Detects card-relevant changes, pops a text-box prompt asking both users to confirm the change. Personal chat content stays private. |
| **Workspace chat thread** (formal) | Inside the deal workspace, visible to all deal participants | Sees edits directly, writes evidence from context. No text-box prompt needed. |

**Key privacy rule:** personal chat content is **never** visible company-wide. Only Sella's system messages ("Deal card updated to X") reach the company room.

**Key visibility rule:** the company only "wakes up" when the deal card itself changes. Casual chatter is invisible to the company.

**Evidence log:** when Sella prompts in a personal chat, the text-box inputs from both users go into the deal's evidence log. This captures the human intent without exposing the underlying chat.

---

## 7. The Inbound Contact Flow (P↔C → P↔P conversion)

The receiving end of cross-company contact. A person in Company A can initiate contact with Company B through three channels:

1. **Requesting pricing** (from a seller's shop)
2. **Sending a connection request** with a note
3. **Sending or offering a Deal Card** (from a Basket they already assembled)

All three land as a **P↔C ticket** on Company B.

```
Person from CoA initiates P↔C contact to CoB
        |
        v
Lands on CoB's super-admin + designated salespeople
(notifications fire on both)
        |
        v
First-contact Sella greets the person:
   • Asks qualifying questions (configurable per company)
   • Requests docs upfront (e.g., pharmacy license)
   • Docs uploaded → "pending inbox" tied to CoB
     (no Relationship page exists yet)
        |
        v
A salesperson (or super-admin) picks up the ticket
   • First-clicker wins
   • Super-admin can manually assign at their discretion
        |
        |--- REJECT (super-admin) → ticket closed
        |
        v
PICKUP →
   • Connection between CoA and CoB is formalized
   • Relationship page is CREATED
   • Pending-inbox docs migrate onto the Relationship page
   • P↔C chat is archived (log preserved)
   • A new P↔P chat opens between the two people
   • Initial P↔C messages logged as a system entry on the
     Relationship page ("originated from buyer X via P↔C contact on date Y")
   • Sella writes a summary first message into the new P↔P chat
     (salesperson can edit before sending — agent should be good
     enough that editing isn't usually needed)
```

**Why the P↔C → P↔P conversion:** every cross-company first contact becomes structured intake — Sella does the work of qualification + doc collection so by the time a human picks up, the deal is closer to ready and the salesperson can focus on closing rather than gathering basics.

**The "first-contact Sella" config:**
- **Platform-wide workflow framework** — Sella always greets, qualifies, and requests docs.
- **Per-company customization** — each company can configure their specific qualifying questions and their list of requested docs (e.g., Canadian Craft may ask about preferred batch sizes; a different distributor may ask about shipping address).

**Admin role clarification:**
- Super-admin gates the company connection (via pickup), not the deal terms.
- Super-admin is NOT the default approver of every new deal.
- Future (post-MVP): threshold-based approvals (e.g., selling below floor price requires senior-manager approval).

**Note:** the access matrix in Section 11.1 governs what each of the three contact channels can do at any given platform / connection state — including off-platform parties via temp link.

---

## 8. Deal stages (inside the workspace)

- **Custom per deal**, not fixed templates.
- Sella asks initial questions at workspace creation to propose stages.
- Both parties can add or edit stages mid-deal — they agree, tell Sella, Sella updates.
- Each collaborator can be scoped to specific stages.

**Template system (predefined templates + custom + customize-a-template) = post-MVP.**

---

## 9. Special cases

### 9.1 Off-platform counterparty

When one side is on Hello Sello and the other side is outside:

- The off-platform person receives **email notifications with a Hello Sello banner** (marketing surface).
- The on-platform person works inside Hello Sello.
- When a deal is accepted, the **company-to-company connection forms retroactively**.
- Idea (TBD, possibly post-MVP): a **magic link** valid until the product is delivered / deal is over, so the off-platform person can view the deal without signing up.
- Fallback: pure email until they sign up.

### 9.2 Person leaves the company

- The deal stays with the company (deal = company asset).
- The person loses **all access immediately** — to the deal, to the chat history, to the artifacts.
- Follow industry best practices.

### 9.3 Dead / inactive deals (reversibility)

- Either party can mark the deal "not happening" → workspace archives.
- After 30 days of inactivity, Sella nudges: *"This deal hasn't moved in a month. Park or close it?"*
- Parked deals stay searchable but don't clutter active views.

---

## 10. The multi-Sella architecture

> **⚠️ OPEN [DEV-11]** — Multi-Sella architecture is conceptual, not yet engineered. Open: orchestrator vs tool-use pattern, event-driven vs state-driven vs graph agents, agent framework vs direct SDK, inter-agent communication. Needs deep architectural research. See [DEV-11](https://linear.app/hellosello/issue/DEV-11/how-should-the-multi-sella-architecture-be-designed-orchestrator).

### 10.1 The principle

Architecturally, there are many specialized Sella agents. **The user always sees ONE Sella face.** The routing happens underneath.

### 10.2 The agents

```
User-facing: "Sella" (one face)
                |
                v
       Router / Orchestrator
                |
        +-------+-------+-------+-------+
        |       |       |       |       |
        v       v       v       v       v
     Seller- Buyer-   Deal-  Personal- Company-
     Sella   Sella   Sella   Sella    Sella
```

| Sella | Lives where | Knows what |
|---|---|---|
| **Seller-Sella** | On the seller's side | Seller's full history, all their deals, margin floors, inventory |
| **Buyer-Sella** | On the buyer's side | Buyer's full history, past prices paid, suppliers, stock |
| **Deal-Sella** | Inside one deal workspace | Only this deal — neutral, mediates the negotiation, writes system messages |
| **Personal Sella** | Per user | What THIS user has done, their preferences |
| **Company Sella** | Per company (cross-side) | Both sell + buy sides of the company — for admin/CEO view |

### 10.3 Routing rules

The user never picks which Sella. The system routes by context:

- Inside Deal X, user is the seller → Seller-Sella + Deal-Sella(X) activate together.
- Inside Deal X, user is the buyer → Buyer-Sella + Deal-Sella(X) activate together.
- On the admin/CEO dashboard → Company Sella speaks.
- General question (no specific deal) → Personal Sella answers.

### 10.4 For companies that do both buy and sell

No special handling needed. Each deal has a direction (this company is the seller in that deal, the buyer in another). The routing is **per-deal, not per-company.** A dual-role company sees one Sella face; she changes hat based on which deal you're in.

### 10.5 Scaling the pattern

The same pattern accommodates future specialists without changing the user-facing face:
- Analytics-Sella
- Marketing-Sella
- Compliance-Sella (important early for cannabis pharma)
- Forecasting-Sella

### 10.6 Aspirational

Sella should **learn from her own mistakes** (e.g., when she misreads a casual chat line as a deal change and both users reject the prompt, she should not repeat that pattern). Design TBD — this is a direction, not a built mechanism.

---

## 11. Visibility, privacy, and access

### 11.1 The 16-combo access matrix (master access model)

Below is the canonical access matrix — sourced from the Chat project description and locked here as the **master access rule for the platform**. Whenever a question arises about "can these two parties do X right now?", this matrix is the answer. It overrides any narrower rule earlier in this doc that conflicts.

**Legend:**
- **HS** = on Hello Sello platform
- **Connected** = active connection established (friend / company request accepted)
- **N/A** = connection not applicable (prerequisite not met)

| # | People on HS | P↔P connected | Companies on HS | Co↔Co connected | Free tier | Premium |
|---|---|---|---|---|---|---|
| 1 | Both | Connected | Both | Connected | Full access to Relationship page | — |
| 2 | Both | Connected | Both | Not connected | Chat access, Relationship page (unverified), Deals (unverified) | — |
| 3 | Both | Connected | One | N/A | Chat access, Relationship page (unverified), Deals (unverified) | — |
| 4 | Both | Connected | Neither | N/A | Chat access, Relationship page (unverified), Deals (unverified) | — |
| 5 | Both | Not connected | Both | Connected | Send "connect" request with message; Relationship page visible | — |
| 6 | Both | Not connected | Both | Not connected | Send connect request | — |
| 7 | Both | Not connected | One | N/A | Send "connect" request; Relationship page visible (unverified) | — |
| 8 | Both | Not connected | Neither | N/A | Send "connect" request; Relationship page visible (unverified) | — |
| 11 | One | N/A | One | N/A | Chat access, Relationship page (unverified), Deals (unverified) — sent as a table in email with temporary link to Deal Room | — |
| **12** | **One** | **N/A** | **Neither** | **N/A** | **Start of every account setup — important for buyers to simply request deals. Send chat messages as emails.** | — |
| 13 | Neither | N/A | Both | Connected | Receive mails with information from Hello Sello conversations | — |
| 15 | Neither | N/A | One | N/A | Receive mails with information from Hello Sello conversations | — |

**Cases 9, 10, 14 are intentionally absent** — they represent state combinations that are impossible / forbidden / no-access on the platform.

**How the matrix is encoded in the codebase** is open (policy DSL / RLS / OPA / hardcoded) — see [DEV-51](https://linear.app/hellosello/issue/DEV-51).

### 11.2 Surface-level visibility table

| Surface | Visible to |
|---|---|
| Personal chat content | Only the two people in the chat. Never company-wide. |
| Sella system message in workspace ("Deal card updated") | All deal participants |
| Inbound ticket queue | Role-scoped (sales team or procurement team, per industry best practices) |
| Deal workspace (chat + artifacts) | Only invited participants |
| Deal record on Relationship page (Layer A) | **Default:** all colleagues in both companies. **PRIVATE override:** each side's dealmaker can independently hide the deal from their own org. Once both sides accept the deal, Layer A flips back to company-wide on both sides. |
| Relationship-level data (notes, terms, pricelist) | Per relationship permissions |
| Shop prices | **Company-configurable per viewer**, three modes: (a) show all publicly, (b) hide all — buyer sees a **"request pricing" button** to ask, (c) show one default **STANDARD** pricelist publicly. For connected companies, an **individual custom pricelist** applies on top — **different per connected company**. *(2026-05-14 lock + DEV-12 refinement 2026-05-20.)* |

**Two-layer visibility:** the Relationship page (Layer A — deal records) and the Deal Workspace (Layer B — chat + artifacts) are independent. PRIVATE only affects Layer A. Layer B always stays scoped to invited participants.

> **DEV-12 — closed (2026-05-20).** 3-mode model refined with the "request pricing" UX (hide-all mode) and **per-connected-company custom pricing** (different pricelist per connected buyer). See the Shop prices row above.

---

## 12. What is deferred (post-MVP)

1. **Logistics partners** as their own company type.
2. **Temporary view link** for outsiders (time-limited, scoped to one deal).
3. **Magic link** for off-platform counterparty (valid until deal completes).
4. **Threshold-based admin approvals** (e.g., selling below floor price).
5. **Deal stage template library** (platform-wide + company-wide + custom templates).
6. **Long-press message → Sella action** (WhatsApp-style menu).
7. **Sella self-learning from mistakes** (mechanism TBD).
8. **Fax pipeline** (OCR + extraction + identity routing).
9. **External expert paid features** (Pro mode unlocks ability to invite experts).
10. **Sella for CEO** as a distinct surface (covered structurally by Company Sella for now).
11. **Person belonging to multiple companies** (one person = one company in MVP).
12. **FLOWZ pre-population.** Use the FLOWZ platform to scrape companies and their products, pre-populating Hello Sello so new buyers don't see an empty platform on first load. Pre-seeded shops are platform-managed (not tied to a Hello Sello company account) until that company actually joins.

---

## 13. Open questions still to brainstorm (not blockers for Layer 1)

- **Section 4.3** — What exactly gets created inside a Deal Workspace, and how should it look? — [DEV-9](https://linear.app/hellosello/issue/DEV-9/what-exactly-gets-created-inside-a-deal-workspace-and-how-should-it)
- **Section 10** — How should the multi-Sella architecture be designed: orchestrator pattern, tool use, agent framework, or direct SDK? — [DEV-11](https://linear.app/hellosello/issue/DEV-11/how-should-the-multi-sella-architecture-be-designed-orchestrator)
- **Detection precision for Sella's deal-forming signals.** (How sensitive should she be? Tunable thresholds?)
- **Pricing model** (fixed tiers vs. usage-based vs. hybrid).
- **In-product action that grows the network** (what does a new joiner do to pull the other side in?).

---

## 14. Quick glossary

| Term | Meaning |
|---|---|
| **Relationship** | Persistent company-to-company object. Created at first P↔C pickup. Holds notes, terms, custom pricelist, deal history. |
| **Basket** | Cart-style visual of the Deal Card while the seller is assembling products. Same underlying record. |
| **Deal Card** | Pokémon-card-style visual once the deal forms. Same entity as Basket — just a later lifecycle visual. SIGNALS on the back. Has version history. |
| **Deal Room** | Customer-presentation surface. Opens by expanding a Basket or Deal Card. Holds product media + optional salesperson Loom. Re-presentable across customers. Sharable off-platform via temp link. |
| **Deal Workspace** | Container that auto-spawns when a Deal Card is born. Holds chat, artifacts, members, stages, the card itself. |
| **Birth** | The moment a deal card is created and a workspace spawns. Three paths: ticket pickup, Sella detection, manual trigger. |
| **Confirmation** | The moment both sides accept the final card version. Deal moves from negotiation to execution. |
| **Sella** | The unified user-facing AI agent. Underneath, a router that delegates to specialized sub-agents. |
| **Deal-Sella** | The neutral per-deal Sella that lives inside the workspace. Mediates negotiation. |
| **Evidence log** | Append-only record of all deal card edits + the text-box confirmations from personal-chat negotiations. |
| **Ticket queue** | The role-scoped list of incoming offer cards waiting to be picked up. |

---

*End of Layer 1. Ready to move to Layer 2: the product surfaces (Connect / Present / Sell / Buy / Grow) and how they map to this lifecycle.*
