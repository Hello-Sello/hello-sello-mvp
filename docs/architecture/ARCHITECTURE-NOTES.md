# Engineering Architecture Notes

Running scratchpad of engineering implications surfaced as Layer-doc decisions get locked. **Not** the formal architecture doc — this is the precursor that keeps the implications visible session-to-session. Each entry: one self-contained sentence + source.

When the formal Architecture doc is written (post Layer 4 + 5), these become its input.

---

## Core entities

- Basket and Deal Card are the **same DB record** with a lifecycle state field (cart-style → Pokémon-card-style), not two tables. *(DEV-22.)*
- Deal Room is its **own persistent record per Basket**, with product-media references reused across rooms and an optional off-platform temporary share link. *(DEV-22 + DEV-52.)*
- Deal Workspace is a **separate container record** spawned at Deal Card birth, holding chat thread / artifacts / members / stages / the card itself. *(Layer 1 §4.3.)*
- The Relationship is **created at first P↔C pickup**; pre-pickup activity (docs, messages) lives in a temporary per-company pending inbox that migrates onto the Relationship on creation. *(DEV-7, DEV-8.)*

## Permissions / RBAC

- The platform fixes **one role only — Superadmin** (per company, at least one, transferable); every other role is a **company-defined custom Group**. *(DEV-40.)*
- Groups are **many-to-many with persons**; effective permissions = union of group permissions. *(DEV-40.)*
- The permission matrix is **Action × Group**, set per company at registration via green/red drag-drop UI. *(DEV-40.)*
- The **approval workflow primitive** (Proposed → Approver sign-off → Applied) gates sensitive actions; first user is pricelist edits; single-approver for MVP. *(DEV-41.)*
- The **change-log primitive** (content_type / content_id / user / timestamp / before-after diff) records every edit and delete on supported entities. *(DEV-41.)*

## Access policy

- The 16-combo access matrix is the **master access policy** for cross-company interactions; encoding model (DB-level RLS / policy engine / hardcoded) is under research. *(Layer 1 §11.1 + DEV-51.)*
- Deal visibility has **two independent layers**: Layer A (deal records on the Relationship page, default company-wide with per-side PRIVATE override) and Layer B (Deal Workspace contents, always invited-only). *(DEV-6.)*
- Notes on the Relationship page are **per-side, not shared cross-company** — each company's notes are private to its own members. *(DEV-41.)*

## Chat / messaging

- P↔C is a **distinct chat-type entity** that archives on pickup and spawns a sibling P↔P chat; initial P↔C messages are also logged as a system entry on the new Relationship page. *(DEV-7.)*
- Personal-chat content is **never company-visible** — only Sella's system messages cross from personal chat into a workspace. *(Layer 1 §11.)*

## Sella behavior

- Deal-Sella **generates back-of-card SIGNALS**; compute model (on-demand vs precomputed) and storage model (derived view vs materialized) are open. *(DEV-5, DEV-48, DEV-49.)*
- First-contact Sella runs a **platform-wide workflow framework** with per-company customizable qualifying-questions and document-request lists. *(DEV-7.)*
- Multi-Sella architecture (orchestrator vs tool-use vs graph; framework choice) is **open and architecturally foundational**. *(Layer 1 §10 + DEV-11.)*
- Sella's base voice = **Schranner-inspired mediator style** (calm, structured, balanced, solution-oriented, collaborative); each specialist inherits the base with role-fitted shifts. *(DEV-46, 2026-05-20.)*

## Pricing

- Outbound offer pricelist cascade resolves **per recipient**: customer-specific → STANDARD CSV → manual prompt. *(DEV-1.)*
- Shop price visibility is **per-viewer and company-configurable** (show all / hide all / show one default; connected buyers get a custom pricelist on top). *(DEV-12 + 2026-05-14 lock.)*

## State machines

- Deal lifecycle: **Chat → Draft → Confirmed → Done**, with a Cancelled side-path post-confirmation; **Done fires when delivery note + invoice are both attached** (document-driven, no explicit click). *(Layer 1 §5 + Layer 3 §1 + DEV-25.)*
- Stage lifecycle: **Pending → In Progress → Closed** (no Reopened); post-close work happens via appendices (documents, Things, approvals). *(Layer 3 §2 + DEV-33.)*
- Thing lifecycle: **Open → Done** (side path: Dismissed); supports redirect/reassign and threaded discussion. *(Layer 3 §7.)*
- Required Milestones gate stage closure; tickable only by assignee or creator; every tick logged for audit. *(Layer 3 §3.)*
- Documents attached to a deal (delivery notes, invoices) **can amend deal data** (volumes, prices, names) — Sella OCR / AI extracts and writes the amendment. *(DEV-25 + DEV-36.)*

## Notifications

- Stage closures and post-close deal-data changes appear as a **passive thin status line** in both the P↔P chat where the change was processed and the C↔C workspace chat — no push notification. *(DEV-33, 2026-05-20.)*

## Payments

- No payment tracking in HS for medical cannabis MVP (40-90 day payment windows handled off-platform); deal card carries payment terms as metadata only. *(DEV-35.)*
- Phase 2: Stripe integration for non-cannabis material suppliers. *(DEV-35.)*
- Phase 3: factoring integration — suppliers route invoices to partner factoring companies, HS takes a small fee. *(DEV-35.)*

## Delivery

- MVP delivery tracking = delivery note + invoice uploaded manually; Sella OCR / AI extracts and amends the deal. *(DEV-36.)*
- Phase 2: logistics companies as workspace actors with their own notifications + tracking. *(DEV-36.)*
- Phase 3: customer ERP integration for end-to-end automatic delivery tracking. *(DEV-36.)*
- Partial / split shipments: working assumption is one deal with N deliveries (Done fires on final pair) — to confirm with Marcel (DEV-53).

## Surfaces

- Big 7 framework: **six navigable surfaces** (Connect / Buy / Sell / Present / Trade / Discover) + **Sella as a right-side panel pillar** (not a sidebar item) + **Home as the public landing page** outside the Big 7. *(2026-05-18.)*
- Every user sees all 6 surfaces; each surface renders in one of **two UI states** — **blank** (not activated) or **populated** (active use). No hiding, no role gating. *(DEV-14, 2026-05-20.)*
- Shop prices have **three configurable viewer modes** (show all / hide all with "request pricing" button / show one STANDARD); connected buyers can additionally get an **individual custom pricelist per company**. *(DEV-12, 2026-05-20.)*
