# Engineering Architecture Notes

Running scratchpad of engineering implications surfaced as Layer-doc decisions get locked. **Not** the formal architecture doc — this is the precursor that keeps the implications visible session-to-session. Each entry: one self-contained sentence + source.

When the formal Architecture doc is written (post Layer 4 + 5), these become its input.

**See also:** [`SCHEMA-DRAFT.md`](./SCHEMA-DRAFT.md) — living draft of proposed table schemas; updated alongside each prototype phase.

---

## Core entities

- Basket and Deal Card are the **same DB record** with a lifecycle state field (cart-style → Pokémon-card-style), not two tables. *(DEV-22.)*
- Deal Room is its **own persistent record per Basket**, with product-media references reused across rooms and an optional off-platform temporary share link. *(DEV-22 + DEV-52.)*
- Deal Workspace is a **separate container record** spawned at Deal Card birth, holding chat thread / artifacts / members / stages / the card itself. *(Layer 1 §4.3.)*
- The Relationship is **created at first P↔C pickup**; pre-pickup activity (docs, messages) lives in a temporary per-company pending inbox that migrates onto the Relationship on creation. *(DEV-7, DEV-8.)*
- A confirmed deal carries **three IDs + a QR code**: Buyer's PO # (buyer field), Seller's SO # (seller field), and a Hello Sello Deal Number (auto-generated, pattern `HS-AAA##-BBB##-NNNNNNNN`) encoded in a QR. Order form is XML-readable for ERP / accounting / logistics. Short-code derivation rule TBD at build phase. *(DEV-26.)*
- Deal birth is **directional**: OFFER (seller-initiated, sales order) or ORDER (buyer-initiated, purchase order); both need the other party's approval to confirm. *(DEV-26.)*
- `deal_card` carries a **`doc_type` discriminator** (`purchase_order` | `sales_order`) — the two card types (PO card / SO card) from ONE entity, keyed on who authored it; `margin` is **seller-scoped via RLS** (the buyer's app never receives the value — role-based, enforced at the data layer, not a UI hide). *(2026-06-06.)*
- `deal_line_item` (products: name, cultivar, volume, unit_price, pzn) powers the Deal card's product line-item list. *(2026-06-06.)*
- `deal_card_version` = **git-style version history** of the Deal card. *(2026-06-06.)*
- `order` carries **PO# (buyer) / SO# (seller) / Hello-Sello deal number / QR**, generated at confirmation. *(2026-06-06; aligns with the three-IDs + QR lock above, DEV-26.)*
- `relationship` is created at **pickup / connect** (a person accepts an inbound request); `pending_inbox_item` carries the **4 request types + assignee + status**. *(2026-06-06; refines the DEV-7 "created at first pickup" entry under the new 3-type chat model.)*

## Permissions / RBAC

- The platform fixes **one role only — Superadmin** (per company, at least one, transferable); every other role is a **company-defined custom Group**. *(DEV-40.)*
- Groups are **many-to-many with persons**; effective permissions = union of group permissions. *(DEV-40.)*
- The permission matrix is **Action × Group**, set per company at registration via green/red drag-drop UI. *(DEV-40.)*
- The **approval workflow primitive** (Proposed → Approver sign-off → Applied) gates sensitive actions; first user is pricelist edits; single-approver for MVP. *(DEV-41.)*
- The **change-log primitive** (content_type / content_id / user / timestamp / before-after diff) records every edit and delete on supported entities. *(DEV-41.)*
- Approval-type Things capture **person + 2FA-authenticated login + name/email/account + acceptance + timestamp** as a legally binding e-signature record (DocuSign-in-a-nutshell); no third-party integration. *(DEV-29.)*

## Audit & immutability

- **Universal `audit_log` table** captures all auditable business actions across the platform. Polymorphic content reference (`content_type` + `content_id`) — single table covers companies, persons, pricelists, deals, permissions, e-signatures, Sella actions. JSONB `before_diff` / `after_diff` for change snapshots (diffs only, not full row snapshots). Complementary to Supabase `auth.audit_log_entries` (which covers auth events — login, signup, MFA — and is auto-populated by Supabase); UNION-for-queries pattern when cross-cutting needed. *(Locked 2026-05-25, full design in SCHEMA-DRAFT §A4.)*

- **Dual-identity actor model.** `actor_person_id` + `actor_type` (user/hs_team/sella/system/webhook) + `on_behalf_of_person_id` (triggering human when actor is agent/system). Captures both who executed and who caused — industry standard for AI agent audit per AWS CloudTrail `onBehalfOf`, Microsoft Entra Agent ID, LoginRadius/Scalekit guidance. *(Locked 2026-05-25.)*

- **Tamper-evidence via SHA-256 hash chain from day 1.** Columns `sequence_number` + `prev_entry_hash` + `entry_hash` + `hmac_schema_version`. Each row hashes its canonical bytes + the previous row's hash; any modification breaks the chain. Chosen over deferral to DEV-29 because SOC 2 is on the roadmap (SOC 2 2026 TSC CC7.3 requires tamper-evident logging with real-time integrity verification) and hash backfill is awkward. *(Locked 2026-05-25.)*

- **Immutability enforcement = triggers + role revoke (defense in depth).** Postgres BEFORE UPDATE / BEFORE DELETE triggers raise exception. Dedicated `app_writer` role granted INSERT/SELECT only; UPDATE/DELETE/TRUNCATE revoked. Bypass for legitimate GDPR scrub via SECURITY DEFINER function, EXECUTE restricted to HS team role. *(Locked 2026-05-25.)*

- **Compensating event pattern for undo.** Reversal is a NEW audit_log row with `reverses_audit_id` pointing back to original. Original row never modified (consistent with immutability — event sourcing + Saga pattern). Reversibility tier column on `audit_action_type` (nullable VARCHAR(15)) — taxonomy + per-action assignments deferred until Layer 1 §10 multi-Sella architecture + Layer 4 §4 autonomy ladder + DEV-29 e-signature semantics land. *(Locked 2026-05-25.)*

- **GDPR right-to-be-forgotten via pseudonymization** (not hard delete). Principle locked: scrub via `SECURITY DEFINER` function replaces PII fields with sentinel UUID / NULL while preserving structural audit history. Meta-audit: scrub itself logged as `person.gdpr_scrubbed` action. Recompute downstream hashes after scrub. Implementation details (function shape, scrub_pii_in_jsonb helper) deferred to build phase. *(Locked 2026-05-25.)*

## Access policy

- The 16-combo access matrix is the **master access policy** for cross-company interactions. **Enforcement model = layered (B7, locked 2026-05-29):** the matrix is encoded in a central app-layer policy module — not RLS, not hardcoded inline. *(Layer 1 §11.1 + DEV-51.)*
- **Authorization enforcement = layered / defense-in-depth (B7, 2026-05-29).** **RLS = security floor:** Postgres Row-Level Security owns tenant isolation (`company_id`) + basic row ownership, keyed on `auth.uid()`. The DB refuses cross-tenant rows regardless of how the query arrives — an app-code bug can't leak another company's data. **Central app-layer policy module = complex authorization:** the split-gate (verified/pending) + the DEV-51 16-combo cross-company matrix live in one authoritative module called by every protected action/RPC — not scattered inline checks. RLS deliberately not used for the complex matrix (context/workflow-state rules get slow + hard to test/debug in SQL). **Policy DSL/engine (OPA, Oso) deferred** until the hand-written matrix outgrows maintainable code. Consistent with the split-gate lock's "action-policy layer, not session/auth layer" — B7 adds the RLS floor beneath it. *(Locked 2026-05-29, resolves SCHEMA-DRAFT §B7.)*
- Deal visibility has **two independent layers**: Layer A (deal records on the Relationship page, default company-wide with per-side PRIVATE override) and Layer B (Deal Workspace contents, always invited-only). *(DEV-6.)*
- Notes on the Relationship page are **per-side, not shared cross-company** — each company's notes are private to its own members. *(DEV-41.)*

## Chat / messaging

- P↔C is a **distinct chat-type entity** that archives on pickup and spawns a sibling P↔P chat; initial P↔C messages are also logged as a system entry on the new Relationship page. *(DEV-7; superseded 2026-06-06 — P↔C is folded into C2C under the new 3-type model below.)*
- `chat_thread` has a **type = p2p / c2c / deal** (the locked 3-type chat model — P↔C removed, folded into C2C). On accept of an inbound request a **C2C** thread is created in all 4 request types; a **P2P** thread also opens for the 3 substantive types (note / price-list seeds it); the deal-card type seeds a **deal draft** in the P2P that, on confirm, spawns the Deal Workspace (`deal` thread). *(2026-06-06.)*
- Personal-chat content is **never company-visible** — only Sella's system messages cross from personal chat into a workspace. *(Layer 1 §11.)*

## Sella behavior

- Deal-Sella **generates back-of-card SIGNALS**. MVP signals (deal creation date, COA expiry math) computed **live from underlying tables — no materialized storage**. Phase 2 signals (relationship-history, cross-deal, ML) added as platform data accumulates; compute/storage model decided per-signal at that point. Signals table designed **signal-type-keyed (rows, not columns)** with compute origin hidden behind read interface — any signal can be promoted live → cached without migration. *(DEV-5, DEV-48, DEV-49; LOCKED 2026-05-24.)*
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

## Authentication & verification

- **Auth model = Supabase Auth + `person` profile extension.** Identity lives in `auth.users` / `auth.identities` / `auth.sessions` / `auth.mfa_factors` (Supabase-managed). Our `person` table FKs `id` to `auth.users(id)` ON DELETE CASCADE. **Email handling (revised 2026-05-27 via A2):** `auth.users.email` is the single source of truth (at-rest encrypted by Supabase + RLS). The `person.email_encrypted` pgsodium mirror was dropped because Supabase officially deprecated pgsodium. App code accesses email via a `SECURITY DEFINER` view (`person_with_email`) that joins `person` ⨝ `auth.users` and exposes email to authorized roles only. *(Locked 2026-05-25, resolves SCHEMA-DRAFT §A1. Email-mirror portion superseded 2026-05-27 by A2.)*

- **PII encryption strategy = hybrid by data class.** **Queryable PII** (email, name, phone): at-rest only (Supabase default) + RLS + encrypted backups — GDPR Art 32 satisfied without column encryption. **High-sensitivity stored PII** (license numbers, government IDs, sensitive freeform notes): pgcrypto column encryption with master key in Supabase Vault, accessed via `SECURITY DEFINER` functions. **Secrets** (API keys, OAuth tokens, webhook signatures): Supabase Vault (its actual use case). **GDPR right-to-erasure** handled via A4 audit_log pseudonymization (per-subject crypto-shred deferred unless regulator pressure). *Why this matters engineering-wise:* pgcrypto-encrypted columns cannot be queried with WHERE/JOIN — read access goes through SECURITY DEFINER functions exposing only what the caller needs. Email, name, phone stay queryable. *(Locked 2026-05-27 in DECISIONS.md walkthrough locks 2026-05-27 — A2.)*

- **Split-gate access model.** Action class drives gate state — external actions (cross-company: Connect, Discover, Receive P↔C, outbound-as-email, deal creation) are hard-locked until `company.verification_status = verified`; internal setup (profile, company details, team config, contact import, settings) is allowed in pending state. Enforcement: action-policy layer, not session/auth layer. Storage: `company.verification_status` enum (`pending` / `verified` / `rejected`). *(Locked 2026-05-25.)*
- **Two entry paths into the platform.** Path A (new company) → company row created with `verification_status: pending`, user becomes Superadmin, HS team review queue entry created. Path B (join existing verified company) → a **dedicated `join_request` entity** (B1, 2026-05-29 — NOT reused from `pending_inbox_item`; approval *grants membership*) routed to that company's Superadmin; no new company row, no HS team review for the joining user. At signup: `person.company_id` is nullable until path resolves. *(Locked 2026-05-25; join-request entity resolved 2026-05-29 via B1.)*
- **HS team review = in-HS admin route.** `/admin/verifications` gated by a hard-coded reviewer allowlist (v0: Marcel + Muskan + Ayush as `is_hs_team: true` on person). Each approve/reject writes an audit-log entry — reuse of the DEV-41 change-log primitive: `{actor, timestamp, content_type: "company", content_id, decision, reason}`. Reject email contains free-text reason + a resubmit link routing back to company setup with prior data + fresh upload slot. *(Locked 2026-05-25.)*
- **License files = Supabase Storage, private bucket, at-rest + RLS (A3, 2026-05-28).** Files are PII-bearing (business names, addresses, license numbers, responsible-person names). Stored in a Supabase Storage private bucket: AES-256 at rest (default) + RLS on `storage.objects` + short-lived signed URLs for HS-team download. No app-layer file encryption in v0 (files must be human-reviewed; deferred unless a regulator demands provider-blind storage). Virus scan via Edge Function at the upload boundary; format allowlist {PDF, JPG, PNG, HEIC} + server-side magic-byte check; 20 MB/file, max 5. Metadata + storage pointer live in the new `company_license_file` child table (`company.license_filename` dropped — single column couldn't hold multi-file + per-file scan status). Every view/download logged to `audit_log` (`license_viewed` / `license_downloaded`). *(Locked 2026-05-25; storage strategy resolved 2026-05-28 via A3.)*
- **Group seed at onboarding ≠ full matrix.** Onboarding step pre-loads 4 default Groups as checkbox-skip; full Action × Group toggle matrix lives in `Settings → Team & Permissions`. The matrix UI is one component used in two contexts (onboarding = read-only seed with skip; settings = full edit). Default Group seed itself is placeholder for v0; cannabis-pharma team-structure research deferred to v0.1. *(Locked 2026-05-25; refines DEV-40.)*
- **Domain-collision routing.** Soft auto-suggest on email-domain match; manual existing-or-new question always shown. Personal-email domains (gmail / outlook / gmx etc.) skip the match logic and ask directly. Domain match on a still-pending company queues the join request, auto-routed on Superadmin approval. Domain match overridden by user picking "new company" → silent flag on the HS team review queue entry. *(Locked 2026-05-25.)*
- **Access matrix audit (open).** Layer 1 §11.1 16-combo matrix assumes binary on-HS / off-HS state. Split-gate introduces an intermediate state (person on HS, company pending). Some combos (especially #4, #8) may be unreachable under the new model and others need clarification. Noted for a future audit pass; not blocking implementation.

## Safety / compliance

- **MVP posture = minimum-viable safety** — KYC at onboarding (license cert upload + HS team manual review), audit log (LAYER-3 §233), HS-admin-only suspension. **No platform-side automated detection** in MVP. *(DEV-38, LOCKED 2026-05-24.)*
- **License verification** — company uploads license / pharmacy cert at account setup; HS team manually reviews; pre-verification accounts locked out with wait dialog; **one-time at MVP**. *(DEV-38.)*
- **Platform-side actor: Hello Sello platform admin** — not a company role; powers = verify onboarding, suspend verified companies, view cross-company audit log. *(DEV-38.)*
- **Phase 2 roadmap (post-MVP):** Sella flags off-platform-deal language + missing-license attempts; manual HS-admin review queue; annual license re-upload. *(DEV-38.)*
- **Phase 3 roadmap (post-MVP):** sanctions screening, license-license matching at deal birth, cross-deal pattern detection, Compliance-Sella specialist activated. *(DEV-38; pairs with LAYER-1 §10 multi-Sella.)*

## Architecture / code structure (2026-06-04)

- **Code architecture = modular monolith (lite), domain-partitioned.** One deployable (Next.js App Router on Vercel + Supabase). Layout: `src/app/` = routing only (thin pages per surface); `src/modules/<domain>/` = domain modules (companies, connections, messaging, deals, catalog, sella), each `components/ · server/(actions+queries) · lib/ · types.ts · index.ts`; `src/shared/` = cross-cutting (auth, db, ui, utils, types). **Boundary rule:** a module imports another module only via its public `index.ts`, never into another module's `server/` or `lib/`. *Why:* concretizes the foundation/surfaces/Sella build strategy; a new surface = a new `app/` route + reuse of existing modules; deal logic written once, used by Connect/Buy/Sell. *(DECISIONS.md 2026-06-04; documented in README, not applied to the repo yet.)*
- **Auth placement.** Authentication is cross-cutting plumbing in `src/shared/auth/` (session + current user + company) - NOT a domain module. Supabase Auth is the engine; `companies` (the business org) is the domain module. Login/signup pages live in `src/app/(auth)/`. *(Consistent with the Auth model lock above.)*
- **Surfaces vs modules.** Surfaces (Connect, Present, Buy, Sell, Discover, Grow) are *windows* = routes in `src/app/`; modules are *workshops* = `src/modules/`. One surface composes one or more modules; one module is reused across surfaces.
- **Sella inference infrastructure = Claude on AWS Bedrock, EU/Frankfurt.** Model-per-job: Sonnet (drafting/detection) / Haiku (summarization); Opus deferred. Wrapped behind a swappable provider interface in the `sella` module. EU residency for GDPR + EU AI Act. *(DECISIONS.md 2026-06-04; fills DEV-11 tech half. Verify Sonnet EU-region availability before wiring.)*

## Schema engineering notes (2026-06-06)

- **COA / product documents reuse the `company_license_file` pattern.** When COA (Certificate of Analysis), COB, and other per-product documents land (Phase 2/3), they follow the same A3 primitive: metadata row + Supabase Storage pointer + `mime_type`/`size`/`scan_status` + `audit_log` + RLS / signed URLs. New table (e.g. `product_document`) links to a product/deal instead of a company. **Naming hazard:** "CoA" = *Company A* (deal side, CONTEXT.md); "COA" = *Certificate of Analysis* (LAYER-5). Schema table must be `certificate_of_analysis` or `product_document`, **never** `coa`. *(2026-06-06.)*
- **Bedrock EU inference profiles — Sella provider wrapper constraint.** `eu-central-1` Claude models invoke only via **EU cross-region inference-profile IDs** (prefix `eu.`, e.g. `eu.anthropic.claude-sonnet-4-5-…`), not bare `anthropic.claude-…` IDs. Sella's provider wrapper must use the `eu.` prefix or calls fail. Fills the "Verify Sonnet EU-region availability" gap noted above. *(2026-06-06.)*

## Connect chat model + Deal card — open / parked (2026-06-06)

- **Buyer-metric field name** — the buyer's counterpart to the seller's `margin` on the Deal card — is **TBD**. *(2026-06-06.)*
- **Clickable product thumbnail → product card** — each `deal_line_item` row's thumbnail will later open that product's own card; **not built yet**. *(2026-06-06.)*
- **Multi-deal context in a P2P chat** (deal selector spanning several deals on one P2P) is **parked on Linear DEV-37**. *(2026-06-06.)*

## Connect chat (screen ②): data model + P2P↔Deal sync (2026-06-06 later)

Prototyped in `prototypes/chat-prototype` (decisions: DECISIONS.md `## 2026-06-06 (later)`; narrative: that folder's `CONTEXT.md`). Engineering shape to hand the `messaging` + `deals` modules.

- **Chat spine (matches connect/inbox prototypes):** `relationship → chat_thread → chat_message`.
  - `chat_thread { id, relationship_id, type: c2c | p2p | deal }`. C2C created at connection (company-level); P2P for substantive requests; a `deal` thread per confirmed deal (lives in the Deal Workspace). `scope` (company/person/deal) is **derivable from `type`** — no separate column.
  - `chat_message { id, thread_id, sender, type, body }`. `sender ∈ {person, system, sella}`. System/Sella lines are `chat_message` rows with a `type` discriminator (`connection_established`, `deal_started`, `intro`, `deal_detected`, `workspace_created`, `deal_cancelled`, `deal_opened`, `deal_card_updated`). **No separate `system_message` table** — one vocabulary.
- **Deal-card state is versioned, not overwritten:**
  - `deal_card { id, version, value_net, status: confirmed|amended|cancelled, … }` — mutable current state.
  - `deal_card_log { id, deal_card_id, version, change, by, … }` — **append-only** version history (the change story; lives on the card back; feeds audit).
  - `deal_change_input { id, deal_card_id, version, party, note }` — **per-user evidence**: each party's own note on a change. This is the "individual for individual user" record; LAYER-1 §5's evidence-log made concrete.
- **`audit_log { id, actor, action, target }`** — every system/Sella line mirrors here. **A `deal_card_updated` chat message is a *projection* of a log/audit entry, not an independent fact** — which is why a change made in the Deal chat updates the log without a broadcast (no second source to reconcile).
- **Sync invariant:** chat messages are **never** copied between threads. The **`deal_card` is the only shared state** across P2P and Deal chat. A P2P (private) change crosses into the company-visible side **only** as a confirmed card delta + its per-user evidence + a system message; the deal card is the *published language* of that boundary.
- **Two-party gate:** deal birth and (by the same pattern) deal changes are gated on both parties' confirmation; model the decision as per-party state so the audit log attributes who agreed / declined.

## Phase 2 schema engineering notes (2026-06-07)

- **`deal_line_item` is a versioned snapshot table, not a mutable row.** Every `deal_card` version bump copies all line items with the new `version` integer. `SELECT … WHERE deal_card_id = X AND version = N` reconstructs any historical state without diff-replay — straightforward SQL, no logic. The `GENERATED ALWAYS AS (quantity * unit_price) STORED` `line_total` column means the DB always computes totals; no app-side calculation to keep in sync. *(DECISIONS.md 2026-06-07.)*
- **`deal_line_item` has no `deleted_at`.** Rows at a locked version are immutable — adding soft-delete would imply they can be removed, which contradicts the versioned-snapshot model. "Removing" a product between versions is modelled as: the new version simply omits that item (no row copied forward). *(2026-06-07.)*
- **`deal_delivery` is a separate child of `deal_card`, not of `deal_line_item`.** A delivery maps to the whole deal (all lines), not a single line — one delivery can fulfil multiple line items partially. Batch numbers, COA files, and actual quantities sit on the delivery record, not on the line item. One deal has N deliveries (DEV-53). *(DECISIONS.md 2026-06-07; Phase 3 build, DEV-36.)*
- **`relationship` row enforces canonical company-pair ordering.** `CHECK(company_a_id < company_b_id)` + `UNIQUE(company_a_id, company_b_id)` at the DB level. Application code must always insert with the lower UUID in `company_a_id`. Direction (who initiated) is preserved in `initiated_by_company_id` — a separate column, not encoded in the pair ordering. *(2026-06-07.)*
- **Open Q — two-party confirmation state (Q3):** where the per-party yes/no lives for deal birth and deal changes is undecided. Options: (a) dedicated `deal_confirmation` table — cleaner, audit-friendly, each confirmation event is its own row; (b) `metadata` JSONB on `deal_card` — simpler, harder to query. Decide before writing Phase 2 migrations. *(2026-06-07.)*
- **Open Q — P2P thread uniqueness (Q2):** canonical ordering for `(person_a_id, person_b_id)` in `chat_thread` — enforce at DB (`UNIQUE` with `CHECK person_a_id < person_b_id`) or at app layer only? Decide before writing Phase 2 migrations. *(2026-06-07.)*
