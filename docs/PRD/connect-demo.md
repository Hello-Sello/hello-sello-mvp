# Connect Demo - PRD (Overview)

**Status:** Draft for build. The June 11 Connect-demo slice.
**Owner:** Ayush. **Reviewer:** Muskan.
**Created:** 2026-06-07 13:44 CEST.
**Demo date:** 2026-06-11.

> **What this doc is.** The product requirements for the Connect demo - *what a user can do and how we know it works*. It sits on top of locked canon and does not re-decide anything. The architecture (the 6 blocks) lives in [`../architecture/connect-demo.md`](../architecture/connect-demo.md); the data model lives in [`../architecture/SCHEMA-DRAFT.md`](../architecture/SCHEMA-DRAFT.md); the locked product decisions live in [`../decisions/DECISIONS.md`](../decisions/DECISIONS.md). This PRD links down to those; it never copies their rules.
>
> **The set:** this overview + two grouped specs. [`foundation.md`](foundation.md) = Identity & Access, Connections, Audit. [`deal-flow.md`](deal-flow.md) = Messaging, Deal Workspace, Sella.

---

## 1. Why this demo exists

Hello Sello is a B2B trading platform for the regulated cannabis market. The whole product is large - seven surfaces, a multi-Sella AI family, full deal execution. We cannot show all of that on June 11, and we should not try.

The demo proves **one claim**: *two companies can meet on the platform, talk, and let Sella turn their conversation into a real, two-sided deal - with every step kept private and permanently recorded.*

If a person in the room believes that claim after watching the demo, the demo worked.

---

## 2. The spine - the one path the demo walks

This is the happy path, in plain words. Everything in the two spec files exists to make this path real and trustworthy.

```
Two companies, not connected
        │  one sends a connect request
        ▼
The other accepts  →  they are now connected (a relationship is born)
        │  they chat, person to person
        ▼
Sella notices a deal forming  →  asks both sides "shall I draft this?"
        │  both say yes
        ▼
Sella drafts a Deal Card  →  the Deal Workspace (deal chat) is born right here
        │  they negotiate inside the deal chat - over days or weeks, through stages;
        │  the card versions, both sides see each change
        ▼
Both sides CONFIRM the card  (two-sided - one yes is not enough)
        ▼
Deal status:  Draft  →  Confirmed
```

**The Deal Workspace is born when the card is drafted, not when it's confirmed.** The instant Sella drafts the card, the deal chat opens and the two sides start negotiating *inside* it - this can run for days or weeks, with different people joining. **Deal status** is `Draft → Confirmed` (the schema's vocabulary - we follow the team's terms). On top of status, the workspace shows the deal moving through **stages** - the negotiation pipeline (see [deal-flow.md](deal-flow.md) Block 4). Status (is it confirmed?) and stage (where in our process?) are two different layers.

The numbered, checkable version of this path is the **acceptance script** in section 6.

---

## 3. Who is in the demo

v0 is **one user per company** (locked - no multi-user editing yet, so no write conflicts). The demo therefore has two people, one on each side.

| Persona | Who they are | What they want from the demo |
|---|---|---|
| **Initiator** | The single user of Company A (say, a seller). Already onboarded and verified. | Reach a new counterparty, talk, and close a deal without leaving the platform. |
| **Receiver** | The single user of Company B (say, a buyer). Already onboarded and verified. | Be reachable, vet who is reaching out, and agree to a deal only when both sides are ready. |
| **Sella (Deal-Sella)** | The AI assistant in the chat. Not a user - a participant that only suggests. | Spot the deal forming, draft the card, write summaries. Never acts on its own. |

**Assumed already done before the demo starts** (Phase 1 onboarding, out of this PRD's scope): both companies exist, are verified, and each has its one user signed in.

---

## 4. Scope - the 6 blocks

The demo is built as a modular monolith (lite): one Next.js app, six clean modules that become **the six code folders**. Each block's requirements live in a spec file.

| # | Block | One line | Spec |
|---|---|---|---|
| 1 | **Identity & Access** | Knows who the user is, which company they belong to, and keeps each company's data private. | [foundation.md](foundation.md) |
| 2 | **Connections** | One company requests, the other accepts - a relationship is born. | [foundation.md](foundation.md) |
| 3 | **Messaging** | The chat: person-to-person threads and the deal thread, with system and Sella lines. | [deal-flow.md](deal-flow.md) |
| 4 | **Deal Workspace** | The deal card, its versions, its life (Draft → Confirmed), and the workspace born with it. | [deal-flow.md](deal-flow.md) |
| 5 | **Sella (AI)** | Spots a deal forming, drafts the card, writes summaries. Suggests only. | [deal-flow.md](deal-flow.md) |
| 6 | **Audit** | A permanent, tamper-evident record of every change, including Sella's. | [foundation.md](foundation.md) |

---

## 5. Out of scope - not building for this demo (on purpose)

Pulled straight from the architecture's non-goals. Saying "no" here keeps June 11 reachable.

- **Pricelist management.** The price lives on the deal card, taken from the chat. (Pricelists are canon Phase 2.)
- **Full First-contact Sella intake.** A connection is a simple handshake. The AI receptionist that greets and screens new contacts is a fast-follow.
- **Delivery / fulfilment.** "What was shipped" (batches, CoA, delivered quantities) is Phase 3. The demo stops at an agreed deal, not a shipped one.
- **The other surfaces** (Buy, Sell, Grow, Discover, Present), **Things**, and the **full multi-Sella specialists** - later.
- **Multi-user-per-company editing**, optimistic locking, and the permission matrix exercised by real teams - v0 is one user per company, so these are present in the schema but not demonstrated.
- **Relationship-level extras** built in the schema (notes, agreed terms, artifacts) are **not required** for the demo path. If time allows they are a stretch; the spine does not depend on them.
- **The Things engine and stage/Thing customization.** The demo ships the fixed 5-stage cannabis pipeline with **manual** advancement and a read-only Things checklist. Auto-advance-when-Things-done, and companies creating their own stages or Things, are the next layer (see §9 O5 + [deal-flow.md](deal-flow.md) Block 4). Stages **4-5 (Payment, Fulfilment & Delivery)** are shown greyed but not built - delivery is Phase 3.

---

## 6. Acceptance script - the demo is "done" when this passes

Each step is a checkable requirement. The `FR-` and `SR-` tags point into the spec files. This script *is* the test plan.

| Step | What happens | Must be true | Block |
|---|---|---|---|
| 1 | Company A's user opens the app and sends a connect request to Company B. | Request lands in B's Connect inbox as a pending item. Only B sees it. | Connections (FR-C1) |
| 2 | Company B's user opens their inbox and accepts. | A **relationship** is created between A and B. A company-to-company chat opens for both. Both see "you are connected". | Connections (FR-C3), Messaging (FR-M1) |
| 3 | The two users chat person-to-person about a possible order. | Messages are delivered both ways, in order, and stored. Neither company can read the other's private data - only this shared thread. | Messaging (FR-M2), Identity (FR-I3) |
| 4 | Sella, reading the thread, notices a deal forming and asks **both** sides: "Looks like a deal - shall I draft it?" | Sella posts a suggestion into the chat. Nothing is created yet. If Sella is slow or down, the chat still works. | Sella (SR-1, SR-5) |
| 5 | Both users say yes. Sella drafts a **Deal Card**. | A deal card exists in **Draft**, and the **Deal Workspace (deal chat) is born with it**. It carries the products, quantities, and price pulled from the chat. A system line announces the workspace. Sella did not send or confirm anything - it only drafted. | Sella (SR-2), Deal Workspace (FR-D1, FR-D3), Messaging (FR-M3) |
| 6 | They negotiate **inside the deal chat** (e.g. change a quantity) and **advance the deal through the stage pipeline** (Negotiation → Compliance & Quality → Agreement). The card versions. | The card bumps a version; the old version is still readable; **both sides see the change** (they are all in the deal chat); the stage marker moves 1→2→3; Sella writes a one-line summary of what changed. | Deal Workspace (FR-D4, FR-D7, FR-D8), Sella (SR-3) |
| 7 | Each side **confirms** the card. | The deal is gated **two-sided**: it only advances when **both** parties confirm. One side confirming is not enough; either side can still decline back to negotiation. | Deal Workspace (FR-D2) |
| 8 | Both have confirmed. | Deal status moves **Draft → Confirmed**. | Deal Workspace (FR-D2) |
| 9 | Anywhere in steps 1-8, open the audit trail. | Every change - including Sella's draft, the versions, and each side's confirmation - is recorded, in order, and cannot be edited or deleted. | Audit (FR-A1, FR-A2) |

**Pass = all nine rows true on the live app, walked end to end without a code change mid-demo.**

---

## 7. Success criteria

- **Primary:** the acceptance script (section 6) passes end to end in front of the room.
- **Trust:** at no point can one company see another's private data; the audit trail is visibly complete and append-only.
- **Resilience (shown, not just claimed):** with Sella turned off, steps 1-3 and 6-8 still work - chat and deals do not depend on the AI. Sella adds; it is never load-bearing.
- **Honesty of state:** what the UI shows always matches what the database holds (no faked screens).

---

## 8. Constraints & assumptions

- **Stack:** Next.js on Vercel; Supabase (Postgres) for data, auth, storage; Claude on **AWS Bedrock, EU / Frankfurt** for Sella. (Architecture doc + root README.)
- **Privacy by build, not by promise:** each company sees only its own data, filtered by `company_id` (Row-Level Security). One deal cannot leak into another, filtered by `deal_id` / `relationship_id`.
- **Languages:** DE and EN (locked). User-facing labels are translated off stable codes, so wording can change without touching stored data.
- **Sella is a leaf:** nothing depends on it. The dependency arrows point *into* Sella, never out. If Bedrock is slow or down, chat and deals still work.
- **One user per company (v0):** no concurrent editing in the demo.
- **Data model is locked:** every table the demo touches is already specified in SCHEMA-DRAFT.md. This PRD does not introduce new tables.

---

## 9. Open questions

### Resolved (2026-06-07)

| # | Question | Decision |
|---|---|---|
| O1 | What is the deal lifecycle? | **Resolved.** The demo walks deal **status** `Draft → Confirmed`. The schema's `deal_card_status` also has a **`done`** terminal (Muskan added it session 8) = the deal fully fulfilled (post-delivery, Phase 3) - **out of demo scope**; the demo stops at `Confirmed` (reached at stage 3, Agreement). The **workspace is born at Draft**, and all negotiation happens inside the deal chat until both sides confirm. |
| O2 | During negotiation, where do version-changes show? | **Resolved by O1.** Because the workspace is born at Draft, **all negotiation happens inside the deal chat** - everyone is already there, so changes are seen directly (no `deal_card_updated` broadcast needed; `origin = deal_chat` is silent). The earlier broadcast puzzle was based on the wrong assumption that the deal chat appeared only after confirmation. |
| O3 | Is the chat real-time or refresh-to-see? | **Resolved: real-time** (Supabase Realtime) for the chat. |
| O4 | Which side initiates (seller = OFFER vs buyer = ORDER)? | **Resolved: seller-initiated OFFER** for the demo narrative (sets the `deal_type` label). |
| O5 | Deal-workspace stages - count, customization, advancement, and how stages complete. | **Resolved.** Fixed **5-stage cannabis template**: Negotiation → Compliance & Quality → Agreement → Payment → Fulfilment & Delivery (researched from the German/EU medical-cannabis deal journey). Demo **builds + walks stages 1-3** with a **manual** advance marker; status flips **Draft → Confirmed at stage 3 (Agreement)**; stages 4-5 shown **greyed** (Phase 3). **Things** (per-stage work items) shown as a checklist, **not user-creatable**. The 5-stage list is the **template shared with Muskan** for the schema table. See [deal-flow.md](deal-flow.md) Block 4. |

### Open - needs Muskan (schema owner)

| # | Question | Why it matters |
|---|---|---|
| O6 | **When is the `deal_workspace` born - at Draft or at Confirmation?** This PRD says **at Draft** (the deal chat must exist for the two sides to negotiate before they confirm - this is what resolved O2). The earlier `deal_card.thread_id` note said "set when both confirm"; Muskan's session-8 `deal_workspace` table did not pin the birth trigger. | The whole negotiation-in-the-deal-chat flow (steps 5-7) depends on the workspace existing during Draft. If the schema births it only at confirmation, either the schema moves the trigger to Draft, or the demo negotiates in the c2c/p2p chat instead. Needs one decision with Muskan. |

### Deferred (post-demo, documented for direction)

- **Things drive stage completion** - the engine where a stage auto-completes once all its Things are done. Demo advances stages manually instead.
- **User-defined stages and Things** - companies creating/naming their own pipeline and work items. Demo ships the fixed 5-stage template only.

---

## 10. References

| Need | Doc |
|---|---|
| The 6 blocks, dependency arrows, diagrams | [`../architecture/connect-demo.md`](../architecture/connect-demo.md) |
| Every table the demo touches | [`../architecture/SCHEMA-DRAFT.md`](../architecture/SCHEMA-DRAFT.md) |
| Locked product decisions | [`../decisions/DECISIONS.md`](../decisions/DECISIONS.md) |
| Domain language / term definitions | [`../architecture/CONTEXT.md`](../architecture/CONTEXT.md) |
| Engineering implications | [`../architecture/ARCHITECTURE-NOTES.md`](../architecture/ARCHITECTURE-NOTES.md) |
| Connect surface deep dive (stub) | [`../product/surfaces/CONNECT.md`](../product/surfaces/CONNECT.md) |
| Deal lifecycle layer | [`../product/layers/LAYER-3-DEAL-EXECUTION.md`](../product/layers/LAYER-3-DEAL-EXECUTION.md) |
| Sella behaviour layer | [`../product/layers/LAYER-4-SELLA-BEHAVIOR.md`](../product/layers/LAYER-4-SELLA-BEHAVIOR.md) |

---

*Draft. The two spec files carry the per-block functional requirements. When the demo path changes, update the acceptance script here first - it is the single source of truth for "what the demo proves".*
