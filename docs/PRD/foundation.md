# Connect Demo - PRD: Foundation Spec

**Covers blocks:** 1 Identity & Access · 2 Connections · 6 Audit.
**Parent:** [`connect-demo.md`](connect-demo.md) (overview + acceptance script).
**Created:** 2026-06-07 13:44 CEST.

> These three blocks are the plumbing the deal stands on. They do not appear as flashy moments in the demo - but if any one fails, the demo fails. Identity decides *who you are and what you may see*. Connections turns two strangers into a relationship. Audit makes every step provable.
>
> Each requirement is tagged (`FR-I`, `FR-C`, `FR-A`) and referenced from the acceptance script. Data shapes are **not** restated here - each block links to its tables in [`../architecture/SCHEMA-DRAFT.md`](../architecture/SCHEMA-DRAFT.md).

---

## Block 1 - Identity & Access

**Purpose:** know who the user is, which company they belong to, and make sure each company sees only its own data. This is the privacy guarantee the whole demo rests on.

**Owns / reads:** `person`, `company`, `person_group`, `permission_matrix_entry` (auth via Supabase `auth.users`). RLS on every company-scoped table.

### Requirements

| Tag | Requirement | How we know it's met |
|---|---|---|
| **FR-I1** | A user signs in and the app knows their `person` and their `company_id`. | After sign-in the app shows the user's own company context; no company picker, no cross-company view. |
| **FR-I2** | Every user belongs to exactly one company (v0: one user per company). | Each demo account resolves to a single company; the two demo users belong to different companies. |
| **FR-I3** | A company can read **only** its own rows. Privacy is enforced in the database (RLS on `company_id`), not only in the UI. | Attempting to read Company B's data while signed in as Company A returns nothing - proven at the data layer, not just hidden in the UI. |
| **FR-I4** | Within a shared relationship, both companies see the **shared** thread and the deal, but neither sees the other's private notes or internal data. | In the shared chat both see the messages; outside it, each side's private space stays private. |

### Out of scope for the demo
- The permission matrix and custom Groups exist in the schema but are **not exercised** - one user per company means one implicit role.
- Join-requests, HS-team verification, and onboarding flows are Phase 1, assumed already complete.

---

## Block 2 - Connections

**Purpose:** let two companies connect. One sends a request; the other accepts. Acceptance creates the **relationship** that every later thread and deal hangs from.

**Owns / reads:** `pending_inbox_item` (the inbound request), `relationship` (born on accept). On accept, triggers the company-to-company chat (see Messaging FR-M1).

### The flow, in product terms

1. Company A's user sends a connect request to Company B.
2. The request lands in Company B's **Connect inbox** as a pending item (type `connect`, optionally `connect_message` if it carries a note).
3. Company B's user accepts (or rejects).
4. On accept, a `relationship` is created between the two companies, and the company-to-company chat opens for both.

### Requirements

| Tag | Requirement | How we know it's met |
|---|---|---|
| **FR-C1** | Company A can send a connect request to Company B. It appears in B's inbox as **pending**, visible only to B (and as "sent" to A). | A sends; B sees one pending item; no third company sees it. |
| **FR-C2** | A request can carry a short note. | A request sent with a note shows that note to B. |
| **FR-C3** | Company B can **accept**. Acceptance creates exactly **one** `relationship` for the pair, regardless of who initiated. | After accept, one relationship row exists; re-running does not create a second. |
| **FR-C4** | Company B can **reject**. No relationship is created; A is not told more than "not accepted". | Reject leaves no relationship; the item moves to a terminal state. |
| **FR-C5** | A duplicate pending request is prevented at the UI (button disabled while one is pending). | Sending twice does not stack two open requests in the demo. |
| **FR-C6** | The **Relationship page** (reached from a chat top bar) shows the connected company + status and the shared relationship content: **notes / agreed terms / artifacts**. Team-scope notes are shared within a company; **personal-scope notes stay author-only**; the other company never sees either. | Opening the page shows the connection and shared content; private notes are not exposed across the boundary. *(Data: `relationship_note` / `relationship_term` / `relationship_artifact`, locked schema session 7.)* |

### Demo simplification (explicit)
- The connection is a **simple handshake**. The full First-contact Sella that greets and screens new contacts is a fast-follow, **not** in this demo (overview §5).
- The inbox's four-lens ownership model (Unassigned / Mine / All / My-history) exists in the schema but with one user per company it collapses to "my company's items" - we do not demo claim/assign.

---

## Block 6 - Audit

**Purpose:** keep a permanent, tamper-evident record of every meaningful change - including Sella's. In a regulated market this is not a nice-to-have; it is the reason a buyer can trust what happened.

**Owns:** `audit_log` (append-only, hash-chained) + its lookup tables (`audit_actor_type`, `audit_action_type`, `auditable_content_type`).

### Requirements

| Tag | Requirement | How we know it's met |
|---|---|---|
| **FR-A1** | Every audited action in the demo writes an `audit_log` row: connection accepted, deal drafted, each card version, each side's confirmation, and the deal reaching Confirmed. | Walking the script, each named step produces a matching log row. |
| **FR-A2** | The log is **append-only** - rows cannot be edited or deleted. | An attempted UPDATE or DELETE on `audit_log` is rejected by the database. |
| **FR-A3** | Each row records **who** acted, including when the actor is **Sella** (not a person). | Sella's draft shows actor type `sella`; the human who triggered it is recorded too. |
| **FR-A4** | The log is **ordered and gap-evident** (monotonic sequence + hash chain), so tampering is detectable. | Rows carry an increasing sequence; the chain verifies. |

### What "shown in the demo" means
- We need a simple **view** of the trail for a company or a deal - enough to point at the room and say "every step is here, and none of it can be changed."
- Full GDPR scrub, partitioning, and the reversibility-tier taxonomy are **deferred** (build-phase / post-MVP per SCHEMA-DRAFT) - not demo requirements.

### Action codes the demo needs
The demo exercises these `audit_action_type` codes (most already seeded; add deal-flow codes as those features land):
- `relationship` created (on connect accept), `deal_card` drafted / confirmed, and each party's confirmation (`deal_confirmation` per party). Confirm the exact codes against the seed list when wiring; add missing ones as INSERTs, not migrations.

---

## Cross-block invariant (the privacy spine)

All three blocks enforce the same two filters, end to end:

- **`company_id`** - a company sees only its own rows.
- **`relationship_id` / `deal_id`** - one deal cannot leak into another.

These are applied in the database (RLS), so the guarantee holds even if a UI bug would otherwise expose data. This is the single most important thing the foundation blocks deliver, and the thing to be most careful about while building.

---

*Spec for the foundation blocks. Deal-flow blocks (Messaging, Deal Workspace, Sella) are in [`deal-flow.md`](deal-flow.md). The end-to-end acceptance script lives in [`connect-demo.md`](connect-demo.md) §6.*
