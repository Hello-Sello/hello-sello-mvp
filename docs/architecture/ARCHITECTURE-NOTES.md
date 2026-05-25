# Engineering Architecture Notes

Running scratchpad of engineering implications surfaced as Layer-doc decisions get locked. **Not** the formal architecture doc — this is the precursor that keeps the implications visible session-to-session. Each entry: one self-contained sentence + source.

When the formal Architecture doc is written (post Layer 4 + 5), these become its input.

---

## Core entities

- Basket and Deal Card are the **same DB record** with a lifecycle state field (cart-style → Pokémon-card-style), not two tables. *(DEV-22.)*
- Deal Room is its **own persistent record per Basket**, with product-media references reused across rooms and an optional off-platform temporary share link. *(DEV-22 + DEV-52.)*
- Deal Workspace is a **separate container record** spawned at Deal Card birth, holding chat thread / artifacts / members / stages / the card itself. *(Layer 1 §4.3.)*
- The Relationship is **created at first P↔C pickup**; pre-pickup activity (docs, messages) lives in a temporary per-company pending inbox that migrates onto the Relationship on creation. *(DEV-7, DEV-8.)*
- A confirmed deal carries **three IDs + a QR code**: Buyer's PO # (buyer field), Seller's SO # (seller field), and a Hello Sello Deal Number (auto-generated, pattern `HS-AAA##-BBB##-NNNNNNNN`) encoded in a QR. Order form is XML-readable for ERP / accounting / logistics. Short-code derivation rule TBD at build phase. *(DEV-26.)*
- Deal birth is **directional**: OFFER (seller-initiated, sales order) or ORDER (buyer-initiated, purchase order); both need the other party's approval to confirm. *(DEV-26.)*

## Permissions / RBAC

- The platform fixes **one role only — Superadmin** (per company, at least one, transferable); every other role is a **company-defined custom Group**. *(DEV-40.)*
- Groups are **many-to-many with persons**; effective permissions = union of group permissions. *(DEV-40.)*
- The permission matrix is **Action × Group**, set per company at registration via green/red drag-drop UI. *(DEV-40.)*
- The **approval workflow primitive** (Proposed → Approver sign-off → Applied) gates sensitive actions; first user is pricelist edits; single-approver for MVP. *(DEV-41.)*
- The **change-log primitive** (content_type / content_id / user / timestamp / before-after diff) records every edit and delete on supported entities. *(DEV-41.)*
- Approval-type Things capture **person + 2FA-authenticated login + name/email/account + acceptance + timestamp** as a legally binding e-signature record (DocuSign-in-a-nutshell); no third-party integration. *(DEV-29.)*

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
- Deal-Sella exists in two modes — **detection** (per P↔P chat, listening) and **mediation** (per workspace, post-birth) — but same agent identity; storage layer must persist the mode transition on workspace spawn. *(Layer 4 §3, 2026-05-21.)*
- Deal-Sella's pricelist visibility is enforced at the **data layer** — she sees relationship pricelist + public shop pricelist, never the seller's master pricelist with margins. Asymmetric data access kept structural, not prompt-level. *(Layer 4 §8, 2026-05-21.)*
- Right-panel Sella routing is automatic per-context (surface × sub-context × deal-direction); routing logic lives at the **interface layer** so Deal-Sella stays out of the panel structurally. *(Layer 4 §2 + §5, 2026-05-21/22.)*
- Side-Sellas (Seller, Buyer) use **hybrid retrieval**: vector RAG for unstructured content (chat, evidence, notes), direct DB queries for structured records (pricelists, batches, deals), in-memory for live state. *(Layer 4 §7, 2026-05-22.)*
- Sella's **autonomy ladder (5 levels)** requires per-user × per-action-type trust state — climb/drop based on approve-rate over rolling N actions. Storage: feedback log + ladder state. *(Layer 4 §4, 2026-05-22.)*
- Sella's **learning loop (MVP)** = feedback log (thumbs + reject-reason + approve-rate per action type). No active retraining. *(Layer 4 §7, 2026-05-22.)*
- Translation engine (MVP) is **chat-only** with per-chat toggle; broader translation across cards/docs/UI is post-MVP. *(Layer 4 §6, 2026-05-22.)*
- GDPR right-to-be-forgotten applies to **all Sella memory layers** — per-user delete, per-relationship reset (admin-driven), full memory reset. *(Layer 4 §7, 2026-05-22.)*
- Every Sella write must be **reversible** — undo affordance + audit trail per action. Storage / state design needs to support reversibility per action type. *(Layer 4 §9, 2026-05-22.)*
- **Material-error escalation:** wrong card terms, OCR amendments, mistranslated regulated content → notify both deal participants + audit-log flag + require user review before re-apply. Implementation: error-class taxonomy + escalation routing. *(Layer 4 §9, 2026-05-22.)*

## Pricing

- Outbound offer pricelist cascade resolves **per recipient**: customer-specific → STANDARD CSV → manual prompt. *(DEV-1.)*
- Shop price visibility is **per-viewer and company-configurable** (show all / hide all / show one default; connected buyers get a custom pricelist on top). *(DEV-12 + 2026-05-14 lock.)*

## State machines

- Deal lifecycle: **Chat → Draft → Confirmed → Done**, with a Cancelled side-path post-confirmation; **Done fires when delivery note + invoice are both attached** (document-driven, no explicit click). *(Layer 1 §5 + Layer 3 §1 + DEV-25.)*
- **Stages = template scaffolding only** (organize work by domain, provide default assignees for THINGS); not a UI primitive, no per-stage state column. *(DEV-24/30, supersedes prior stage-lifecycle entry.)*
- **Milestones unify into THINGS** — one entity type. Pre-confirmation gates use a `blocks_confirmation` flag (the only blocking behavior in execution). *(DEV-24/30/28.)*
- **No post-confirmation blocking** — open THINGS sit until done; urgency drivers (deadline on THING, deal priority, deal creation date, delivery date) are sort signals, not gates. *(DEV-24/30, supersedes prior "Required Milestones gate stage closure" entry.)*
- **Deal ownership does not transfer** between stage-responsible people — deal is visible + actionable for the whole company; stage-responsibility is the default-assignee mechanism only. *(DEV-24.)*
- **Post-confirmation has two flows: Amendment** (one side flags, other approves; audit-logged) and **Cancellation** (MVP = delete the deal; post-MVP = ERP cancel-if-possible via Odoo / CanCraft). Seller can always cancel unilaterally; buyer can only request a change with seller approval. *(DEV-23.)*
- Thing lifecycle: **Open → Done** (side path: Dismissed); supports redirect/reassign and threaded discussion. *(Layer 3 §7.)*
- Tickable only by assignee or creator; every tick logged for audit. *(Layer 3 §7.)*
- Documents attached to a deal (delivery notes, invoices) **can amend deal data** (volumes, prices, names) — Sella OCR / AI extracts and writes the amendment. *(DEV-25 + DEV-36.)*
- **Stage template** stored as data/config with schema `{id, industry, stages[], default_things_per_stage{}}`; MVP ships one row (`cannabis_wholesale_v1`); selection logic `getTemplate(deal) → template_id` exists for extension; company-override extension point present in data model (`company.template_overrides`) without admin UI in MVP. *(DEV-31.)*

## Notifications

- Post-confirmation deal-data changes (e.g., DEV-36 OCR auto-amendments) appear as a **passive thin status line** in both the P↔P chat where the change was processed and the C↔C workspace chat — no push notification. *Stage-closure half of original DEV-33 lock is superseded under flat-THINGS doctrine: stages have no closure UI events.* *(DEV-33, partially superseded 2026-05-22 by DEV-24/30.)*

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

- Big 7 framework: **six navigable surfaces** (Connect / Buy / Sell / Present / Grow / Discover) + **Sella as a right-side panel pillar** (not a sidebar item) + **Home as the public landing page** outside the Big 7. *(2026-05-18.)*
- Every user sees all 6 surfaces; each surface renders in one of **two UI states** — **blank** (not activated) or **populated** (active use). No hiding, no role gating. *(DEV-14, 2026-05-20.)*
- Shop prices have **three configurable viewer modes** (show all / hide all with "request pricing" button / show one STANDARD); connected buyers can additionally get an **individual custom pricelist per company**. *(DEV-12, 2026-05-20.)*

## Onboarding / data import

- **Contact import — metadata-only scope.** Pipeline restricted to Gmail `gmail.metadata` (no body access) and Outlook equivalent restricted scope. Per-contact record schema: `{email, display_name, first_seen, last_seen, email_count}`. No subject lines, no body content, no third-party enrichment vendor. App verification required pre-launch (~2-4 weeks for Google review). Options B (+ subject + vendor enrichment) and C (+ email bodies) deferred post-MVP; both require explicit user consent + schema extension. *(DEV-3.)*
- **Contact categorization — schema fields on contact record.** `role` enum (default `unknown`; suggested values supplier / customer / partner / other / unknown, final at build phase); `activity_bucket` derived from `email_count` + `last_seen` (computed live or cached — design choice at build). Extension hooks present in schema for post-MVP: `tags[]` (free-text user tags), `sella_suggested_role` (nullable enum for AI suggestions). No auto-inference in MVP; Sella suggestions deferred. *(DEV-17.)*

## Safety / compliance

- **MVP posture = minimum-viable safety** — KYC at onboarding (license cert upload + HS team manual review), audit log (LAYER-3 §233), HS-admin-only suspension. **No platform-side automated detection** in MVP. *(DEV-38, LOCKED 2026-05-24.)*
- **License verification** — company uploads license / pharmacy cert at account setup; HS team manually reviews; pre-verification accounts locked out with wait dialog; **one-time at MVP**. *(DEV-38.)*
- **Platform-side actor: Hello Sello platform admin** — not a company role; powers = verify onboarding, suspend verified companies, view cross-company audit log. *(DEV-38.)*
- **Phase 2 roadmap (post-MVP):** Sella flags off-platform-deal language + missing-license attempts; manual HS-admin review queue; annual license re-upload. *(DEV-38.)*
- **Phase 3 roadmap (post-MVP):** sanctions screening, license-license matching at deal birth, cross-deal pattern detection, Compliance-Sella specialist activated. *(DEV-38; pairs with LAYER-1 §10 multi-Sella.)*
