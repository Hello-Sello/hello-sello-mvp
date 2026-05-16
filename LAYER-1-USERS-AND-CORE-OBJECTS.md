# Hello Sello — Layer 1: Users and Core Objects

**Purpose of this document:** Capture everything we agreed on in Layer 1 so we are aligned on the same design scope before moving to Layer 2.

**Layer 1 covers:**
- Who uses Hello Sello (company types + roles)
- The core objects that exist on the platform (Relationship, Deal Card, Deal Workspace)
- How a deal comes into existence (the birth lifecycle)
- How negotiation works
- The multi-Sella agent architecture

**Layer 1 does NOT cover:** the product surfaces (Connect / Present / Sell / Buy / Trade pages), inputs/outputs (chat, email, fax, ERP), or Sella's specific behaviors. Those come later.

---

## 1. Companies on the platform

**Two types only (for MVP):**

- **Distributors / wholesalers** — companies that sell products.
- **Pharmacies** — companies that buy products.

**A single company can play both roles.** Some companies only sell. Some only buy. Some do both. The platform is symmetric — every company has access to both Sell and Buy capabilities; they choose how much to use each.

**Future (not MVP):**
- Logistics partners as their own company type.
- Adjacent businesses: packaging suppliers, lab supplies, raw materials, Food & Beverage distributors.

---

## 2. People (roles) inside a company

> **⚠️ OPEN [DEV-6]** — Needs research: org-to-org permission architecture (10-20 people per company, multiple concurrent deals, org-to-org chat visibility, non-deal-specific content visibility). See [DEV-6](https://linear.app/hellosello/issue/DEV-6/how-should-org-to-org-permissions-and-chat-visibility-work-between-two).

**Permission model = GitHub-style.**

**Two layers of permissions:**

**Layer A — Organization-level:**
- **Admin / Superadmin** — sets up the company account, invites the team, manages permissions, gates incoming company-to-company connections.
- **Members** — regular employees with org access.

We use industry-standard role names (admin, superadmin), not titles like "CEO."

**Layer B — Deal-level (collaborators):**
- Each deal has its own collaborator list, like a GitHub repo.
- Each side manages their own collaborators on a deal (the seller's admin cannot add buyer-side people).
- A collaborator can be **scoped to specific stages** of a deal (e.g., a regulatory consultant only joins for stage 3-4).

**Typical roles inside a company (illustrative, not enforced):**
- CEO / product manager / project manager (joins big deals, gets the high-level Sella view).
- Salesperson and sales team (seller side — handles outgoing offers).
- Procurement person and procurement team (buyer side — handles incoming offers).
- **Procurement team on the seller side** — special case: this team manages inventory/batches, feeds batch information to the salesperson for FIFO allocation. (Different from buyer-side procurement.)

**Rule for MVP:** one person belongs to exactly one company. May change in future.

**External experts** = invited to a single deal via a time-limited share link. Free for now. (Post-MVP feature.)

---

## 3. Identity layers

> **⚠️ OPEN [DEV-7]** — Person-to-Company chat: flow unresolved. Who's involved on the receiving company side, what's the intended purpose, how does it convert to other chat types? See [DEV-7](https://linear.app/hellosello/issue/DEV-7/what-is-the-purpose-of-person-to-company-chat-and-who-is-involved-in).

A user has two identities at once:
- **Personal identity** (their own profile)
- **Company identity** (the company they belong to)

**Three kinds of conversations:**

| Conversation type | Who sees it | When it's used |
|---|---|---|
| **Person ↔ Person** | Only the two people | Informal talk, including casual messages that may turn into deal talk |
| **Person ↔ Company** | The person + invited people on the company side | One human talks to a company entity |
| **Company ↔ Company** | Only people invited to that specific deal | **Only exists inside a deal workspace.** Created when the workspace is created (at deal-card birth). Tied to ONE specific deal. There is no general C↔C chat outside a deal. |

**Important correction we locked in:** company-to-company chat is **NOT** broadcast to all colleagues. It is scoped to **only the people invited to that specific deal**.

---

## 4. Core objects

### 4.1 The Relationship (Company ↔ Company)

> **⚠️ OPEN [DEV-8]** — Relationship page: what content is shown (company-to-company and person-to-person), and what's the per-user permission rule (e.g., visibility scoped to deals the user participated in vs. full org visibility)? See [DEV-8](https://linear.app/hellosello/issue/DEV-8/what-is-shown-on-the-relationship-page-company-to-company-and-person).

A real, first-class object. Persistent. Once two companies have done business, the Relationship exists forever.

**What lives on the Relationship:**
- Shared notes between the companies
- Agreed terms
- Custom pricelist (the seller's pricelist customized for this buyer)
- Full history of all deals between the two companies
- Sella's insights about the relationship

**Why it matters:** when person X from Company A approaches Company B 9 months later about a different product, the Relationship already exists. The chat room is already there. They reuse the existing relationship.

### 4.2 The Deal Card

The **visual** of a deal. Think Pokémon card.

- **Front of the card:** the deal facts. Products, volumes, prices, discounts, free delivery, payment terms, notes, etc.
- **Back of the card (flip):** Sella's summary of the deal. *(Content of the summary is still to be brainstormed.)*

> **⚠️ OPEN [DEV-5]** — Back-of-card content TBD: plain-English summary, risk flags, past-deal comparison, predicted outcome, or some combination? See [DEV-5](https://linear.app/hellosello/issue/DEV-5/what-content-should-appear-on-the-back-of-the-deal-card-the-flip-side).

The deal card has **Git-style version history.** Every edit is logged. Every negotiation round produces a new version. The full history is preserved as an audit/evidence trail.

### 4.3 The Deal Workspace

> **⚠️ OPEN [DEV-9]** — Deal Workspace contents and layout are early ideas, not finalized. What's the full component list, how is it laid out visually, what's surfaced first? See [DEV-9](https://linear.app/hellosello/issue/DEV-9/what-exactly-gets-created-inside-a-deal-workspace-and-how-should-it).

The **container** of a deal. Auto-scaffolded the moment a deal card is born.

**What auto-creates inside the workspace:**
- A chat thread (scoped to invited participants only)
- An artifacts folder (documents, COAs, contracts, etc.)
- A members list (default: the two people chatting + super admins of both companies, for now)
- Stages (custom per deal, defined by the participants with Sella's help)
- The deal card itself

The deal card lives inside the workspace. The card is what people see; the workspace is what holds everything.

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

### 5.2 Three ways a deal card can be born (1 → 2 transition)

> **⚠️ OPEN [DEV-10]** — Edge case: what can two Hello Sello users do when one imports the other as a contact but their companies are not yet connected? P↔P chat? P↔C? Deal initiation? Retroactive connection? See [DEV-10](https://linear.app/hellosello/issue/DEV-10/how-should-communication-work-between-two-hello-sello-users-when-their).

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

## 7. The Inbound Offer Ticket Flow (Jira-style)

When an offer card arrives from another company:

```
Sender builds offer card → Sends to receiving company
        |
        v
Lands at receiver's ADMIN (connection gate)
        |
        |--- REJECT → end
        |
        v
ACCEPT → ticket enters receiver's queue
        |
        v
Queue is visible to the responsible role only
   (seller side → sales team)
   (buyer side → procurement team)
        |
        v
Team member picks up the ticket → BIRTH → workspace spawns
        |
   If nobody picks up:
   - Superadmin can manually assign
   - Sender sees "Your offer is being reviewed"
```

**Admin role clarification:**
- Admin gates the **company connection**, not the deal terms.
- Admin is **NOT** the default approver of every new deal.
- Future (post-MVP): threshold-based approvals (e.g., selling below floor price requires senior manager approval).

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

## 11. Visibility and privacy summary

| Surface | Visible to |
|---|---|
| Personal chat content | Only the two people in the chat. Never company-wide. |
| Sella system message in workspace ("Deal card updated") | All deal participants |
| Inbound ticket queue | Role-scoped (sales team or procurement team, per industry best practices) |
| Deal workspace (chat + artifacts) | Only invited participants |
| Relationship-level data (notes, terms, pricelist) | Per relationship permissions |
| Shop prices | **Company-configurable.** Each shop can choose: (a) show all prices publicly, (b) hide all prices, or (c) show a single default pricelist publicly. For connected buyers in an established relationship, a custom pricelist applies on top (per Section 4.1). |

> **⚠️ OPEN [DEV-12]** — Sub-questions on shop price visibility: per-product granularity? Different rules for connected vs. non-connected? Is the public default pricelist the same object as the relationship custom pricelist? See [DEV-12](https://linear.app/hellosello/issue/DEV-12/how-granular-is-company-configurable-shop-price-visibility-per-product).

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

- **Section 4.2** — What content should appear on the back of the Deal Card (the flip side)? — [DEV-5](https://linear.app/hellosello/issue/DEV-5/what-content-should-appear-on-the-back-of-the-deal-card-the-flip-side)
- **Section 2** — How should org-to-org permissions and chat visibility work between two connected companies? — [DEV-6](https://linear.app/hellosello/issue/DEV-6/how-should-org-to-org-permissions-and-chat-visibility-work-between-two)
- **Section 3** — What is the purpose of Person-to-Company chat and who is involved in this conversation? — [DEV-7](https://linear.app/hellosello/issue/DEV-7/what-is-the-purpose-of-person-to-company-chat-and-who-is-involved-in)
- **Section 4.1** — What is shown on the Relationship page (company-to-company and person-to-person), and what are the permission rules? — [DEV-8](https://linear.app/hellosello/issue/DEV-8/what-is-shown-on-the-relationship-page-company-to-company-and-person)
- **Section 4.3** — What exactly gets created inside a Deal Workspace, and how should it look? — [DEV-9](https://linear.app/hellosello/issue/DEV-9/what-exactly-gets-created-inside-a-deal-workspace-and-how-should-it)
- **Section 5.2** — How should communication work between two Hello Sello users when their companies are not yet connected? — [DEV-10](https://linear.app/hellosello/issue/DEV-10/how-should-communication-work-between-two-hello-sello-users-when-their)
- **Section 10** — How should the multi-Sella architecture be designed: orchestrator pattern, tool use, agent framework, or direct SDK? — [DEV-11](https://linear.app/hellosello/issue/DEV-11/how-should-the-multi-sella-architecture-be-designed-orchestrator)
- **Section 11** — How granular is company-configurable shop price visibility — per-product, per-buyer, single vs. relationship pricelist? — [DEV-12](https://linear.app/hellosello/issue/DEV-12/how-granular-is-company-configurable-shop-price-visibility-per-product)
- **Detection precision for Sella's deal-forming signals.** (How sensitive should she be? Tunable thresholds?)
- **Pricing model** (fixed tiers vs. usage-based vs. hybrid).
- **In-product action that grows the network** (what does a new joiner do to pull the other side in?).

---

## 14. Quick glossary

| Term | Meaning |
|---|---|
| **Relationship** | Persistent company-to-company object. Holds notes, terms, custom pricelist, deal history. |
| **Deal Card** | Visual artifact showing the deal facts (front) and Sella's summary (back). Has version history. |
| **Deal Workspace** | Container that auto-spawns when a card is born. Holds chat, artifacts, members, stages. |
| **Birth** | The moment a deal card is created and a workspace spawns. Three paths: ticket pickup, Sella detection, manual trigger. |
| **Confirmation** | The moment both sides accept the final card version. Deal moves from negotiation to execution. |
| **Sella** | The unified user-facing AI agent. Underneath, a router that delegates to specialized sub-agents. |
| **Deal-Sella** | The neutral per-deal Sella that lives inside the workspace. Mediates negotiation. |
| **Evidence log** | Append-only record of all deal card edits + the text-box confirmations from personal-chat negotiations. |
| **Ticket queue** | The role-scoped list of incoming offer cards waiting to be picked up. |

---

*End of Layer 1. Ready to move to Layer 2: the product surfaces (Connect / Present / Sell / Buy / Trade) and how they map to this lifecycle.*
