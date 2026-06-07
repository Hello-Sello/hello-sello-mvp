# Hello Sello — Decisions Log

Locked design decisions with reasoning. Append-only — we add new decisions as they get locked, we don't rewrite history.

Each entry: **What was decided** → **Why** (the reasoning at the time).

**Mode:** Propose mode (see [CLAUDE.md](CLAUDE.md)).
- When Claude notices a decision being locked in during conversation, Claude proposes adding it here with a preview.
- The user confirms or revises the wording.
- Only then is the entry appended.

---

## How to read this file

- Decisions are grouped by **Layer** (Layer 1, Layer 2, etc.) and by **topic**.
- Each decision is one line, with a short rationale.
- A decision being here means it's **locked**: the design has moved past it. To re-open a locked decision, write a new entry below that supersedes the old one — don't delete the old one.

---

## Workflow / process decisions

- **Brainstorm layer by layer; never jump ahead.** *Why:* each layer builds on the previous; jumping causes drift and rework.
- **Doubts go through the `track-doubt` skill (Propose mode).** *Why:* keeps Linear clean (only sharp questions), keeps the team in sync, never creates vague tickets.
- **Decisions go through DECISIONS.md (Propose mode).** *Why:* otherwise locked decisions get forgotten across sessions and the same ground gets covered twice.
- **All writes preview first; nothing written without explicit permission.** *Why:* the user is the final reviewer of every artifact.
- **Project-level skills live in `.claude/skills/` so teammates inherit them via the project folder.** *Why:* personal/global skills don't ship with the project; this keeps the team aligned.

---

## Layer 1 — Users and Core Objects (LOCKED 2026-05-13/14)

### Company model

- **Two company types for MVP: distributors/wholesalers and pharmacies.** *Why:* tight beachhead. Anything else is scope creep.
- **A single company can play both roles** (seller in some relationships, buyer in others). *Why:* the platform is symmetric by design; supports companies that buy and sell. Direction is per-deal, not per-company.
- **Logistics partners are deferred to post-MVP.** *Why:* not core to the seller↔buyer transaction. Re-evaluate after MVP traction.

### People and permissions

- **GitHub-style permission model.** *Why:* familiar mental model, well-understood by engineers.
  - **Org-level:** admin/superadmin + members.
  - **Deal-level:** collaborators added per deal, can be scoped to specific stages.
- **One person belongs to one company in MVP.** *Why:* keeps account model simple. May relax later for consultants/freelancers.
- **Admin gates the company connection, not the deal terms.** *Why:* don't bottleneck every deal on admin; admin focuses on letting the right counterparties in.
- **Each side manages its own collaborators on a deal** (seller's admin cannot add buyer's people). *Why:* sovereign companies; no cross-company permission grants.
- **Person leaves company → loses all access immediately; company keeps the deal.** *Why:* deals are company assets, not personal. Follow industry best practices.

### Identity and chat

- **Three chat types: Person↔Person, Person↔Company, Company↔Company.** *Why:* real-world conversations live at different levels of formality.
- **Company-to-company workspace is visible ONLY to invited deal participants** (not all colleagues). *Why:* deal-by-deal scoping is the right unit of privacy.
- **Personal chat content is NEVER visible company-wide.** Only Sella's system messages reach the company room. *Why:* trust — if Sella exposes personal chats, people will move negotiations off-platform back to WhatsApp.

### Core objects

- **The Relationship is a first-class persistent object** between two companies. Holds shared notes, agreed terms, custom pricelist, full deal history. *Why:* the relationship outlives any single deal — same counterparties keep coming back.
- **Deal Card = the visual artifact** of a deal (front: products/terms; back: Sella summary). *Why:* the card is the deal's face; flippable Pokémon-card metaphor makes negotiation tangible.
- **Deal Card has Git-style version history.** *Why:* needed for audit, dispute resolution, and Sella's pattern learning over time.
- **Deal Workspace = the container** for a deal (chat thread, artifacts folder, members, stages). Auto-scaffolded at deal birth. *Why:* deals need a scoped collaboration space; the card alone isn't enough.

### Deal lifecycle

- **Three states: Chat (pre-deal) → Draft (born) → Confirmed.** *Why:* clean state machine; transitions are unambiguous.
- **Workspace spawns at deal-card BIRTH, not at confirmation.** *Why:* negotiation needs a real workspace; the card lives through negotiation with version history.
- **Three birth paths: pickup of inbound ticket / Sella detects + both confirm / manual `//deal` trigger.** *Why:* covers structured offers (Path A), natural chat-driven (Path B), and explicit user intent (Path C).
- **Sella's minimum deal-forming signal: product + quantity OR product + price.** Just "product alone" = inquiry, no birth. *Why:* avoids false-positive deal cards from casual product mentions.
- **Both parties must confirm birth when Sella detects.** *Why:* neutrality — neither side can unilaterally force a card into existence.

### Inbound offer flow

- **Inbound offers = Jira-style tickets gated by admin, then picked up by the responsible role.** *Why:* maps onto real-world workflow; doesn't dump every incoming offer into one person's inbox.
- **Ticket queue visibility = role-scoped** (sales team sees seller-side, procurement sees buyer-side). *Why:* industry standard, separation of concerns.
- **If no one picks up a ticket, superadmin can manually assign.** *Why:* prevent orphaned tickets.

### Negotiation

- **Three actions on any deal-card version: Accept / Counter / Reject.** *Why:* standard negotiation primitives.
- **Counter opens a guided Sella prompt** ("what's your counter?") and creates a new version. *Why:* every change captured as a version for audit.
- **Two valid negotiation venues: personal chat OR workspace chat.** Both supported. *Why:* real life is messy; people negotiate informally and formally.
- **In personal chat, Sella detects card-relevant changes and prompts both users with a text box for evidence.** The text-box content goes into the deal's evidence log. *Why:* captures human intent without exposing the personal chat itself.

### Stages

- **Custom per deal, not fixed templates.** Both parties can edit mid-deal. *Why:* every deal is different; rigid stages break.
- **Template library is post-MVP.** *Why:* premature without volume data on common patterns.

### Multi-Sella architecture

- **One user-facing Sella + specialist sub-agents under the hood.** Routing is automatic from context. *Why:* if you differentiate by prompt alone, it's just one agent in costume. Each specialist Sella is a separately designed system.
- **The specialist Sellas:** Seller-Sella, Buyer-Sella, Deal-Sella, Personal Sella, Company Sella. *Why:* each has a different scope of knowledge and a different role.
- **Deal-Sella is neutral, per-deal, lives inside the workspace.** *Why:* the moat is neutrality — Deal-Sella enforces it structurally, not as a marketing claim.
- **For a company that does both buy and sell, no special handling needed** — direction is per-deal, so the right specialist activates per deal. *Why:* clean architecture, no special cases.

### Privacy / visibility summary

- **Personal chat content: never company-visible.**
- **Sella system messages in workspace: visible to deal participants.**
- **Inbound ticket queue: role-scoped.**
- **Deal workspace: invited participants only.**
- **Shop prices: visible only to connected companies.** Non-connected can see the shop but not prices.
- **(2026-05-14) Shop price visibility is company-configurable** — 3 modes: show all, hide all, or show one default pricelist publicly. For connected buyers in an established relationship, a custom pricelist applies on top. *Why:* sellers need control over what's public — competitive positioning, channel strategy, regulatory considerations. **Supersedes the previous "visible only to connected companies" rule above.**
- **(2026-05-16) Deal visibility has two independent layers.** *Layer A — Relationship page (deal records):* every deal between two companies is visible to all colleagues in both companies by **default**. **PRIVATE is a per-side, per-user control** — each side's dealmaker independently decides whether their own org colleagues can see the deal. So a deal can be: (a) public on both sides (default), (b) private on one side only (CoA's user hides it from CoA colleagues; CoB still sees it company-wide), or (c) private on both sides (visible only to the two dealmakers). *Lifecycle:* a deal can stay PRIVATE through birth and negotiation. **Once both sides accept the deal, Layer A visibility flips to company-wide on both sides** — the deal becomes a public record of completed business. (Source: Marcel comment on DEV-6, 2026-05-16.) *Layer B — Deal Workspace contents (chat + artifacts):* invited deal participants only. **Unchanged from the prior lock** — Layer B is independent of A and is never affected by the PRIVATE toggle. *Why:* the Relationship page is the shared business record between two companies; default-open builds trust and lets colleagues pick up context. PRIVATE handles the realistic case where a salesperson wants to keep an in-progress deal off their colleagues' radar (commission conflicts, partial info, competitive sensitivity) — but only until the deal is done.

### Reversibility

- **30-day inactivity nudge:** Sella asks "park or close?" *Why:* avoid accumulating dead workspaces.
- **Parked deals stay searchable but don't clutter active views.** *Why:* deals can come back to life months later.

### Deferred (post-MVP, captured here so we don't re-debate)

- Logistics partners as a company type.
- Temporary view link for outsiders.
- Magic link for off-platform users (valid until deal completes).
- Threshold-based admin approvals (e.g., sell-below-floor).
- Deal stage template library.
- Long-press → Sella WhatsApp-style menu.
- Sella self-learning from her own mistakes (direction, no mechanism).
- Fax pipeline (OCR + extraction).
- External expert paid features.
- Sella for CEO as a distinct surface.
- Person belonging to multiple companies.

### Walkthrough locks 2026-05-19 — core entities, P↔C flow, access matrix

- **(2026-05-19) Basket = Deal Card — one entity, two lifecycle visuals (DEV-22).** Cart-style while the seller assembles products in their shop; transitions to Pokémon-card-style once the deal forms (signals detected, offer sent + accepted/countered, basket confirmed in a Deal Room, or manual trigger). Same underlying record carries products / volumes / prices / discounts / terms / notes through both stages.
- **(2026-05-19) Deal Room is a distinct concept (DEV-22).** Customer-presentation surface, opened by expanding either a Basket or a Deal Card. Floating, full-page. Holds product info + media (videos, photos) tied to products + optional per-room Loom recording and presentation notes. 1 Deal Room per Basket. Re-presentable to multiple customers. Off-platform sharing via temporary link (also a marketing surface). Persistence model: persistent object vs transient render is open — see [DEV-52](https://linear.app/hellosello/issue/DEV-52).
- **(2026-05-19) Deal Workspace remains the deal container** — spawns at Deal Card birth, holds chat / artifacts / members / stages / the card itself. Initial members = the two dealmakers; more can be added later. *(Reaffirmed; Deal Workspace is NOT the same as Deal Room.)*
- **(2026-05-19) Back-of-card SIGNALS (DEV-5).** Back of the Deal Card = "SIGNALS" — Deal-Sella-generated insights about the deal. Starting MVP set is 8 examples (deal age / typical close time A↔B / product expiry risk / repeat buy-sell pattern / low product availability / logistics-cost bundling / collaborative business insight / extensible AI suggestion). Deal-Sella owns generation (neutral). UI: flip top-left (back), expand top-right (→ Deal Room, full-page floating). *Compute model* ([DEV-48](https://linear.app/hellosello/issue/DEV-48)) and *storage model* ([DEV-49](https://linear.app/hellosello/issue/DEV-49)) **locked 2026-05-24** — see Layer 1 walkthrough below. *Per-viewer personalization* ([DEV-50](https://linear.app/hellosello/issue/DEV-50)) **locked 2026-05-23**.
- **(2026-05-19) P↔C → P↔P conversion flow (DEV-7).** Person initiates cross-company contact via one of three channels — requesting pricing, sending a connection request with a note, sending/offering a Deal Card. The contact lands on the receiving company's super-admin + designated salespeople as a P↔C ticket. **First-contact Sella** greets the person, asks qualifying questions, and requests docs upfront — pre-pickup docs sit in a temporary "pending inbox" tied to the receiving company. On pickup (first-clicker wins; super-admin can manually assign), the connection is formalized: the Relationship page is created (pending inbox migrates in), the P↔C chat is archived (log preserved), a new P↔P chat opens, initial messages are logged as a system entry on the Relationship page, and Sella writes a summary first message in the new P↔P chat (salesperson can edit). *First-contact Sella config:* platform-wide workflow framework, per-company customizable questions and document requests. *Why:* every cross-company first contact becomes structured intake — by the time a human picks up, the deal is closer to ready.
- **(2026-05-19) Relationship page is created at pickup** — not at first contact. Pre-pickup activity (initial P↔C messages, doc uploads to first-contact Sella) lives in a temporary pending inbox tied to the receiving company. On pickup, the pending inbox migrates onto the freshly-created Relationship page. *(Resolves part of DEV-7; supersedes any earlier ambiguity in Layer 1 §4.1 about Relationship-creation timing.)*
- **(2026-05-19) DEV-8 closed by reference.** Marcel's DEV-8 answer about deal-record visibility on the Relationship page is fully covered by the DEV-6 two-layer visibility lock (2026-05-18). There is **no separate "private group" tier** — just PRIVATE deals (which a user can set on any deal), with PRIVATE deals auto-flipping to company-wide on acceptance per the existing lock.
- **(2026-05-19) 16-combo access matrix lifted into Layer 1 as canonical (DEV-10 closed by reference to DEV-39).** The matrix now lives in Layer 1 §11.1 and is the **master access model** — it overrides any narrower rule earlier in Layer 1 that conflicts. Rows 9 / 10 / 14 are intentionally absent (impossible / forbidden / no-access combinations). How the matrix is encoded in code (policy DSL / RLS / OPA / hardcoded) is tracked as engineering follow-up [DEV-51](https://linear.app/hellosello/issue/DEV-51).

### Walkthrough locks 2026-05-20 — org-level permissions, Relationship content permissions

- **(2026-05-20) Org-level role model (DEV-40).** One platform-fixed role: **Superadmin** (account holder, at least one per company, transferable, holds system-level powers — accept connections, manage billing, add/remove other Superadmins). Everything else is **custom Groups** defined per company at registration, with a configurable Action × Group permission matrix (green/red UI, drag-drop to assign members). A person can be in **N Groups** simultaneously; effective permissions = union. Industry CRM pattern (Notion / Slack / Linear-style) — sensible defaults + full customization. *Why:* the platform needs one fixed anchor for system bootstrap; everything else is the company's hierarchy and varies too much to fix in code.
- **(2026-05-20) Relationship-page content permissions (DEV-41).** Notes are **per-side** (CoA's notes visible to CoA only; CoB's notes visible to CoB only) with CRM-style edit/delete by anyone in the owning side; every change (edit + delete) is recorded in a change log with user + timestamp + before/after diff. Pricelist edits are gated by an **approval workflow** (Proposed → Approver sign-off → Applied) with **single-approver for MVP** (any one person in an Approver-flagged Group); multi-approver deferred until regulated use cases demand it. Agreed terms are visible to both sides; edit workflow deferred. *Why:* notes are each side's working memory and shouldn't leak across companies; pricelist is commercially sensitive and needs sign-off for compliance; the approval primitive is generalizable to other gated actions later.

### Walkthrough locks 2026-05-23 — back-of-card SIGNALS personalization

- **(2026-05-23) Back-of-card SIGNALS personalization (DEV-50).** MVP ships one neutral insight per Deal Card — always filled (Deal-Sella generates per deal), shown identically to both buyer and seller. No personalization, no premium gating in MVP. Post-MVP adds two viewer-aware slots (buyer-flavored + seller-flavored) as a premium-tier feature; free users see a locked placeholder ("Unlock by going premium"). How Deal-Sella infers viewer role (buyer vs seller) is deferred to a follow-up issue. *Why:* a single neutral insight aligns with Deal-Sella's structural neutrality (Layer 1 §10.2 / Layer 4 §3) and lets generation quality be validated before splitting per viewer. Post-MVP personalization is where the premium upsell lives because it's the variant that materially shifts utility per audience.

### Walkthrough locks 2026-05-24 — contact import GDPR (DEV-3)

- **(2026-05-24, DEV-3) Contact import GDPR scope = Option A (metadata only) for MVP.** The email-import pipeline reads ONLY: sender (contact's email + display name), recipient (the user themselves), timestamp (when emails were exchanged), and frequency (count of emails per contact). **No subject lines, no email bodies, no third-party enrichment vendor.** Per-contact storage schema: `{email, display_name, first_seen, last_seen, email_count}` — no conversation content stored. **API scope:** Gmail `gmail.metadata` (no body access); Outlook equivalent restricted scope; Google security review / app verification required pre-launch (~2-4 weeks). *Why:* lowest GDPR/DSGVO + ePrivacy risk surface. Cannabis-pharma is a regulated, lawyer-heavy vertical (German pharmacies, BfArM oversight) — Options B and C carry materially higher risk that isn't justified pre-evidence. Validate workflow on Option A first; expand later when phase, risk appetite, and customer evidence justify it. *Post-MVP roadmap:* **Option B** (+ subject line + EU enrichment vendor for title/phone/company per contact; requires explicit user consent); **Option C** (+ full email bodies for pre-populated chat history; requires explicit user consent + schema extension + heavier review). Unlikely to ship without strong customer-evidence-backed business case.

### Walkthrough locks 2026-05-24 — SIGNALS compute/storage + MVP safety posture (DEV-48, DEV-49, DEV-38)

- **(2026-05-24, DEV-48 + DEV-49) SIGNALS compute & storage model.** MVP signals (deal creation date, COA expiry math) computed **live from underlying tables** — no materialized storage, no cache infrastructure. Phase 2 signals (relationship-history, cross-deal, ML) layered in as platform data grows; per-signal compute/storage decided then. **Signals storage designed extensibly** — signal-type-keyed rows (not column-per-signal) and compute origin hidden behind a stable read interface, so any signal can be promoted live → cached later without schema migration. *Why:* premature optimization with no data; cheap signals (date math) are useful from day one, expensive signals (cross-platform aggregation, predictions) need real data to be meaningful at all; storage shape preserves extensibility without committing to cache infrastructure prematurely. See LAYER-1 §4.2 + ARCHITECTURE-NOTES.md "Sella behavior".

- **(2026-05-24, DEV-38) MVP safety / compliance posture.** Minimum-viable safety: **KYC at onboarding** (company uploads license / pharmacy certificate; Hello Sello team **manually verifies**; **one-time at MVP** — re-verification post-MVP), pre-verification accounts **fully locked out** with wait dialog ("Verification pending — please reach out to the Hello Sello team"), audit log (already locked, LAYER-3 §233), **Hello Sello platform admins as sole suspension authority**. **No platform-side automated detection** of illegal activity in MVP. New role: **Hello Sello platform admin** (platform-side actor, not a company role; powers = verify onboarding, suspend companies, view cross-company audit log). *Phase 2 (post-MVP):* Sella light detection (off-platform-deal language, missing-license attempts) + annual license re-upload. *Phase 3 (post-MVP):* sanctions screening (OFAC/EU), license-license matching at deal birth, cross-deal pattern detection (money laundering / structuring), Compliance-Sella specialist activated. *Why:* pre-real-users platform — build the gated door (verification) + audit trail; defer detection until we have data and real abuse patterns. Aligns with existing decisions: Sella ≠ legal advice (LAYER-4 §379), platform ≠ compliance validator (LAYER-5 §52). See LAYER-1 §12 + ARCHITECTURE-NOTES.md "Safety / compliance".

### Walkthrough locks 2026-05-25 — onboarding & authentication flow (Phase 1)

This subsection finalizes the authentication & onboarding flow for the Phase 1 production build. Some entries supersede or extend locks captured in the prototype's `HANDOFF.md`.

- **(2026-05-25) Split-gate access model.** Post-signup, a user enters the platform in a "verification pending" state. **Internal setup is allowed during pending** — user profile, company details, team config, contact import, settings. **External actions are hard-locked until HS team verifies the company** — Discover, Connect, Receive P↔C, outbound-as-email, deal creation, all Co↔Co interactions. *Why:* full hard gate (no access until verified) creates multi-day drop-off; pure soft entry breaks the regulatory legitimacy gate. Split gate captures both: legitimacy where it matters (cross-company actions) + setup velocity while waiting. *(Makes the prototype's "verification gates external actions only" framing explicit at the action-class level.)*

- **(2026-05-25) License upload required at company setup.** One file primary, multiple supported via "add another" affordance. Optional free-text description (helps HS team reviewer understand non-obvious docs). Re-upload allowed during pending review. Generic copy: *"Upload your license or certificate."* Format: PDF + image (JPG / PNG / HEIC). Size / count limits per industry best practices (TBD at build, ~10-25 MB per file, max 5-10 files, virus scan on upload). No fixed per-jurisdiction taxonomy — HS team reviewer applies judgment to whatever is uploaded. *Why:* license verification is the real legitimacy gate for a regulated B2B platform; making it optional (as the prototype did) breaks the gate model. Generic copy avoids per-jurisdiction taxonomy. *(Supersedes prototype `HANDOFF.md` lock #4 "License upload optional".)*

- **(2026-05-25) No company-type selection at signup.** Platform is neutral. A company can act as distributor OR pharmacy OR both — role is per-action, not per-company. *Why:* consistent with Layer 1 §1 (one company can play both roles) and prototype lock #3. Asking at signup creates a false fixed-role mental model that contradicts the platform's symmetric design.

- **(2026-05-25) Path A vs Path B routing via "Existing or new company?" question.** After sign-in (before company setup), every user — personal email and company email alike — sees a question: *"Do you have a company on Hello Sello already?"* → branches to **Path A** (new company → HS team review queue) or **Path B** (join existing → company Superadmin approval). For company-email signups where the domain matches an existing verified company, a soft auto-suggest banner appears above the question (*"Looks like you're from CanCraft — request to join?"*) — but the manual choice always remains visible. *Why:* the question is the universal branch; the soft suggest is a nudge, not a forced route. Personal email is allowed because license verification (Path A) + Superadmin approval (Path B) are the real legitimacy gates, not email domain.

- **(2026-05-25) Domain-collision edge cases.** **(a) Personal-email domains** (gmail.com, outlook.com, gmx.de, etc.) → no domain-match logic; ask the existing-or-new question directly. **(b) Domain matches a still-pending (not-yet-verified) company** → queue the join request; auto-route to that company's Superadmin once approved; show user: *"[X] is pending verification — your request will reach their admin once approved."* **(c) Domain matches but user picks "new company" anyway** → allow + silently flag for HS team review during license verification (catches potential duplicate registration / domain-spoofing).

- **(2026-05-25) Group setup in onboarding = lightweight template, not full matrix.** Onboarding step shows 4 templated default Groups (Sales / Procurement / Compliance-QA / Approver) with a prominent **Skip** CTA. **Full Action × Group toggle matrix lives in Settings → Team & Permissions**, NOT in onboarding. *Why:* DEV-40 locks "configured at setup," but a v0 solo Superadmin has no one to assign; surfacing the full matrix at onboarding adds friction without value. Templates educate; the deep config is a click away. *(Refines DEV-40's "at registration" → "templates at registration, full matrix in settings".)*

- **(2026-05-25) v0 scope = one user per company.** First test users (Marcel + Victor) each act as solo Superadmin for their test company. Multi-user-per-company lands post-v0. **Path B (join existing) is coded but unexercised by default in v0** — deliberately testable (e.g., a third tester joining one of the existing companies). *Why:* keeps v0 surface area minimal while preserving the multi-user design and the exercise path for early validation.

- **(2026-05-25) Default Group seed research deferred to v0.1.** Real cannabis-pharma team-structure research (distributor + pharmacy team taxonomies grounded in industry sources — career pages, ABDA, BfArM, BPC, trade associations) is not blocking v0 because solo Superadmins won't exercise the Group seed in practice. Research happens before multi-user lands in v0.1. v0 ships the prototype's current placeholder seed (Sales / Procurement / Compliance-QA / Approver).

- **(2026-05-25) HS team review surface = in-HS admin route.** `/admin/verifications` route gated by a hard-coded list of HS-team `person_id`s (v0: Marcel + Muskan + Ayush). Queue sorted oldest-first with row-level aging color (green <24h, amber 24-48h, red >48h). 12-hour SLA target per the prototype's "Application submitted" copy. Approve writes `company.verification_status: verified`. Reject requires free-text reason, emailed to user with a *"Update and resubmit documents"* link → user lands back on company setup screen with prior data + fresh upload slot. No appeal queue in v0 (Marcel reachable directly). *Why:* in-product admin is cheaper than a separate app, keeps reviewer + user state in one place, and matches the scale (single-digit reviews/day) of v0.

- **(2026-05-25) Cleanup flag — access matrix audit.** Layer 1 §11.1 was written assuming a binary "on HS" / "not on HS" state. Under split-gate, an intermediate state now exists (person signed up + email verified, company not yet verified). Some combos may need clarification or be unreachable under this new state. Noted for a future audit pass; not blocking implementation.

- **(2026-05-25) Engineering flags carried forward.** **(a)** License files are PII-bearing (real business names, addresses, license numbers, responsible-person names) → must follow SCHEMA-DRAFT.md's PII encryption principle. File-storage strategy (Supabase Storage / S3 + encryption at rest) is a build-time decision. **(b)** HS-team approve/reject is an audit-logged action → reuse DEV-41 change-log primitive (`{actor, timestamp, company_id, decision, reason}`).

- **(2026-05-25) Auth model — Supabase Auth + `person` profile extension (SCHEMA-DRAFT §A1).** Identity owned by Supabase Auth (`auth.users`, `auth.identities`, `auth.sessions`, `auth.mfa_factors`). Our `person` table becomes a profile extension: `person.id UUID PK REFERENCES auth.users(id) ON DELETE CASCADE`. **Dropped from `person`:** `password_hash`, `email_verified`, `verified_at` — all owned by `auth.users` now. **Email encryption via mirror pattern:** `person.email_encrypted` (pgsodium) populated via DB trigger on `auth.users` insert; `auth.users.email` stays plaintext for Supabase Auth's login lookup but is only touched by Supabase Auth code. App code always reads `person.email_encrypted`. The pgsodium-vs-Vault mechanism choice is settled in SCHEMA-DRAFT §A2 (PII encryption mechanism). **Signup wiring:** DB trigger on `auth.users` insert seeds the matching `person` row; Phase 1 will add a second trigger step to enqueue HS team verification (Path A). *Why:* every flow we need (email verify, password reset, magic link, OAuth, 2FA / TOTP) is Supabase Auth built-in. Rolling our own = 2-3 weeks of v0 time spent on auth plumbing for no product value. RLS uses `auth.uid()` natively, which matters for the 16-combo access matrix encoding (DEV-51). Mirror pattern keeps PII-encrypted email everywhere app code touches, satisfying GDPR Article 32 for our regulated cannabis-pharma posture. *(Resolves SCHEMA-DRAFT open Q A1; partially resolves B5 — `email_verification_token` table dropped; partially resolves B6 — `person_2fa` table replaced by `auth.mfa_factors`. The "when does 2FA become required" half of B6 stays open.)*

- **(2026-05-25) Audit log design — full table shape + 10 design decisions (SCHEMA-DRAFT §A4).** Universal `audit_log` table for all auditable business actions across the platform. **Q1 — Single polymorphic table** (`content_type` + `content_id`) over per-entity tables; industry-standard (Linear, GitHub, Notion, Sentry pattern). **Q2 — JSONB diffs** (`before_diff` + `after_diff`) storing only changed fields, not full row snapshots. **Q3 — Writes only in MVP**, plus targeted carve-out for HS team license view/download (`license_viewed`, `license_downloaded` action codes) — license docs are PII-bearing and audit value is high. **Q4 — Actor identity refined for AI agents:** `actor_person_id` + `actor_type` (user/hs_team/sella/system/webhook) + `on_behalf_of_person_id` capturing the triggering human when actor is an agent or system (per AI agent audit research consensus — dual identity for delegated actions). **Q5 — Immutability via triggers + role revoke + hash chain from day 1** (Path 2): BEFORE UPDATE/DELETE triggers raise exception; dedicated `app_writer` role with INSERT/SELECT only; SHA-256 hash chain with `sequence_number` + `prev_entry_hash` + `entry_hash` + `hmac_schema_version` for tamper-evidence. Path 2 chosen over Path 1 (defer hash chain to DEV-29) because SOC 2 is on the roadmap and backfilling hashes is awkward. **Q6 — Lookup table for action codes** (per SCHEMA-DRAFT convention) with `code` + `description` + `category` + `reversibility_tier` columns. Naming pattern: `resource.action_past_tense` (Stripe-style, e.g., `company.verify_approved`). **Q7 — Compensating event pattern for undo** (industry standard from event sourcing + Saga): reversal is a NEW audit_log row with `reverses_audit_id` pointing to the original. Reversibility tier column added to `audit_action_type` as nullable VARCHAR(15) — taxonomy + per-action assignments deferred until Layer 1 §10 multi-Sella architecture + Layer 4 §4 autonomy ladder + DEV-29 e-signature semantics land. **Q8 — GDPR right-to-be-forgotten via pseudonymization** (not hard delete) — principle locked; implementation details (SQL function shape, sentinel UUID approach, scrub_pii_in_jsonb helper) deferred to build phase. Meta-audit: the scrub itself logged as `person.gdpr_scrubbed` action. Recompute downstream hashes after scrub per Q5 chain integrity decision. **Q9 — Partitioning deferred to Phase 2.** MVP = single table. Design partition-friendly (index `(created_at DESC)`, queries default to bounded time ranges). Trigger/strategy/migration TBD. Skip TimescaleDB (deprecated on Supabase Postgres 17 — use native declarative partitioning + pg_partman when needed). **Q10 — Complementary to Supabase `auth.audit_log_entries`** (Supabase manages auth events; ours covers business events). UNION-for-queries pattern when cross-cutting needed. Selective mirror of business-relevant auth events (`person.created`, `person.email_verified`, `person.mfa_enabled`) deferred — added when SOC 2 prep wants single-table queries OR specific audit query needs it. **Planned columns deferred (industry-aligned forward-tracking):** `agent_id` as proper column (in `metadata.agent_id` JSONB until Sella taxonomy stabilizes); `tool_name` (when Sella tool layer ships, ties to DEV-11); `delegation_scope` (only if external-callable agents introduced, Phase 3+). **PGAudit complement** for security forensics (separate from business audit) deferred to Phase 2. *Why this combined lock:* the audit_log is foundational infrastructure — every regulated action lands here. Locking the full shape now avoids piecemeal additions creating schema drift. Hash chain + reversibility + dual identity from day 1 means our SOC 2 path is clear (industry research: SOC 2 2026 Trust Services Criteria CC7.3 requires tamper-evident logging with real-time integrity verification). *(Resolves SCHEMA-DRAFT open Q A4. Sources: AWS CloudTrail userIdentity reference, AI agent audit research [LoginRadius, Scalekit, Microsoft Entra Agent ID], event sourcing compensating event pattern [Azure Architecture Center], SHA-256 hash chain pattern [certificate transparency, blockchain ledgers], Postgres immutability triggers + SECURITY DEFINER pattern, GDPR Article 17 pseudonymization guidance.)*

### Walkthrough locks 2026-05-27 — PII encryption mechanism (A2)

- **(2026-05-27) PII encryption mechanism — hybrid; pgsodium dropped as deprecated (SCHEMA-DRAFT §A2; supersedes the `email_encrypted` portion of the 2026-05-25 Auth model lock).** Industry research before locking: **Supabase officially deprecated pgsodium** (docs state "DO NOT RECOMMEND any new usage") and pulled the TCE dashboard UI due to "sharp edges" causing unrecoverable issues. Vault remains supported but is **scoped to secrets** (API keys, OAuth tokens, webhook secrets) — not bulk PII columns. Industry guidance flags column-encrypting queryable fields like email as a common over-encryption mistake (perf hit on every login + breaks WHERE/JOIN). **Decision — hybrid per data class:** **(a) Queryable PII** (`email`, `name`, `phone`) → **at-rest only** (Supabase default filesystem encryption) + RLS + encrypted backups. No column-level encryption, no mirror column. Satisfies GDPR Art 32 "at rest" requirement. **(b) High-sensitivity stored PII** (license numbers, government IDs, sensitive freeform notes) → **pgcrypto column encryption** (mature Postgres extension, not deprecated) with master key in Supabase Vault. Encrypted columns are not queried directly; access via `SECURITY DEFINER` functions. **(c) Secrets** (API keys, OAuth tokens, webhook signatures) → **Supabase Vault** (its actual designed use case). **GDPR right-to-erasure:** rely on A4's pseudonymization principle (already locked) — per-subject crypto-shred deferred unless regulator pressure (avoids key-registry complexity in v0). **Supersedes A1 (2026-05-25) on email handling:** drop `person.email_encrypted` column + pgsodium INSERT trigger; `auth.users.email` becomes single source of truth; app code reads via `SECURITY DEFINER` view that joins `person` ⨝ `auth.users` and exposes email to authorized roles only. *Why:* building on pgsodium = building on a deprecated foundation Supabase is actively migrating users off. Hybrid matches industry consensus (EDB, Crunchy Data, Stormatics) — encrypt by risk class, not uniformly. Drops a pgsodium dependency from v0 with zero loss of compliance posture (at-rest + RLS + audit_log pseudonymization covers GDPR Art 32 + Art 17). *(Resolves SCHEMA-DRAFT open Q A2. Sources: Supabase pgsodium deprecation notice + Discussion #27109, Supabase Vault docs, EDB "PII Horror Story" Postgres best practices, Crunchy Data encryption guidebook, Stormatics PII protection, oneuptime crypto-shredding pattern.)*

### Walkthrough locks 2026-05-28 — License file storage backend (A3)

- **(2026-05-28) License file storage — Supabase Storage, private bucket, at-rest + RLS + signed URLs; new `company_license_file` child table (SCHEMA-DRAFT §A3).** Industry research before locking. **Backend = Supabase Storage** (S3-compatible, S3-backed) over direct AWS S3: access control reuses Postgres RLS + `auth.uid()` (same primitive as the split-gate + HS-team allowlist B2); direct S3 adds a second vendor + separate IAM + separate audit wiring for zero v0 benefit. **Encryption = at-rest (AES-256, Supabase default) + private bucket + RLS + short-lived signed URLs** for HS-team download. No app-layer (pre-upload) file encryption in v0 — license files exist *to be human-reviewed*, so app-layer encryption forces reviewers to download ciphertext + in-app decryption + self-managed key (lose-key = lose-files). At-rest + RLS + expiring signed URLs + A4 audit logging (`license_viewed` / `license_downloaded`) is the industry-standard KYC posture and satisfies GDPR Art 32 (license files carry responsible-person names = PII). Consistent with A2's trust model (Supabase holds the at-rest key) and A2's "defer heavier crypto unless regulator pressure." App-layer file encryption deferred — revisit only if a regulator demands provider-blind storage. **Virus scanning = Edge Function at the upload boundary** calling an external scan service (no Supabase built-in); synchronous for v0 (single-digit reviews/day makes the async quarantine-queue pattern unnecessary). Clean → accept; infected → reject + notify. **Validation = allowlist `{PDF, JPG, PNG, HEIC}` + server-side magic-byte check** (not just extension/MIME — prevents disguised-extension attacks) + size via Content-Length, authenticated uploads only. **Limits: 20 MB/file, max 5 files** (confirms the 2026-05-25 working numbers). **Schema = new `company_license_file` child table** (FK `company_id`, `storage_path`, `original_filename`, `mime_type`, `file_size_bytes`, `scan_status`, `description`, `created_by` = uploader, standard timestamps + soft delete); **drops `company.license_filename`** — a single column can't hold the locked product decision's multi-file + per-file scan-status + re-upload-during-pending requirements. *Why:* Supabase Storage gives S3 scale with RLS access control we already speak; at-rest is the right tier for files that must be viewable; boundary scanning beats post-upload trust; the child table matches the already-locked multi-file UX. *(Resolves SCHEMA-DRAFT open Q A3. Sources: Supabase Storage + Access Control docs, Supabase Security/SOC2/HIPAA pages, Supabase Discussion #23645 [no built-in scanning], OWASP/Glasswall file-upload validation guidance, Veriff KYC document practices.)*

### Walkthrough locks 2026-05-29 — Split-gate enforcement layer (B7)

- **(2026-05-29) Access-policy enforcement = layered / defense-in-depth (SCHEMA-DRAFT §B7; resolves the "encoding model under research" note on the DEV-51 access matrix).** Industry research before locking — consensus across Supabase docs, Bytebase, Permit.io, MakerKit, Mergify, and Oso is near-unanimous: enforce authorization in layers, not one place. **Decision:** **(a) Postgres RLS = the security floor.** Owns tenant isolation (every company-scoped table already carries `company_id`) + basic row ownership, keyed on `auth.uid()` (A1). Defense-in-depth: the database refuses to return another company's rows regardless of how the query arrives, so an app-code bug can't leak cross-tenant data. RLS deliberately NOT used to encode the complex matrix. **(b) A single central app-layer policy module = the complex action authorization.** The split-gate (external actions locked until `company.verification_status = verified`; internal setup allowed while pending) + the DEV-51 16-combo cross-company access matrix live here — one authoritative module called by every protected action / RPC, NOT copy-pasted inline checks. App layer is the right tool because RLS struggles with exactly this: context/workflow-state-dependent rules get slow (per-row subqueries, non-LEAKPROOF functions break index usage), hard to test, and hard to debug; the app layer also gives users clear "why you're blocked" messages. **(c) Policy DSL/engine (OPA, Oso) deferred** — revisit only if the hand-written matrix outgrows maintainable code. **Consistent with the 2026-05-25 split-gate lock** ("enforcement = action-policy layer, not session/auth layer") — B7 keeps the complex rules in that app-layer module and adds RLS beneath as the unbreakable floor. *Why:* RLS-only makes the 16-combo matrix a maintenance/performance nightmare; app-layer-only has no safety net (one forgotten check = leak). Layered gives a can't-bypass tenant-isolation floor + a maintainable, single-source-of-truth rulebook for the complex cross-company logic. *(Resolves SCHEMA-DRAFT open Q B7; unblocks DEV-51 matrix encoding. Sources: Supabase RLS + Custom-Claims/RBAC docs, Bytebase RLS limitations, Permit.io RLS guide, MakerKit multi-tenant RLS best practices, Mergify "where should permissions live", Oso enforcement best practices.)*

### Walkthrough locks 2026-05-29 — Path B join-request entity (B1)

- **(2026-05-29) Path B "join request" = dedicated `join_request` table, NOT a reuse of `pending_inbox_item` (SCHEMA-DRAFT §B1).** Domain-modeling decision (DDD aggregate-boundary lens). `pending_inbox_item` models **company↔company connection requests** (P↔C Connect surface): `sender_company_id` → `receiver_company_id`, status `pending_pickup → picked_up`. A Path B join request is a **different domain concept**: a *person* (who often has no company yet — `person.company_id` nullable until resolved) asks to join an *existing company*, routed to a Superadmin, and **approval has a side effect the connection flow lacks — it grants company membership** (sets the person's `company_id` + role). Different actors, different invariants, different ubiquitous language ("connect" vs "join"), different lifecycle. Reusing one table would force nullable/overloaded columns + a mixed status lookup + every reader disambiguating "connection or join?" — the shared-model-across-separate-concerns anti-pattern. The superficial similarity ("a pending thing awaiting approval") is shape, not meaning; DDD models by meaning. **Decision: new `join_request` aggregate.** **Sub-question (any Superadmin vs routed to one):** default = any Superadmin of the target company can approve (simplest; v0 is one-user-per-company so unexercised) — routing specifics are build/policy, deferred. *Why:* dedicated table keeps the Connect aggregate clean, encodes join-specific invariants + the membership-granting side effect honestly, and avoids a migration when the two concepts diverge further. *(Resolves SCHEMA-DRAFT open Q B1 — the LAST architecture-shaping open question; B2/B3/B4/B6 remain as build/mechanism. Sources: Vernon "DDD Distilled" aggregate-boundary + ubiquitous-language rules, Enterprise Craftsmanship "Modeling Relationships in DDD", James Hickey on DDD aggregates.)*

---

## Layer 2 — Surfaces (IN PROGRESS)

### Structural decisions (locked 2026-05-14)

- **Navigation = left sidebar; each of the 5 surfaces is a page/screen.** *Why:* familiar pattern, scales as we add more surfaces, leaves room for the right-side Sella panel.
- **The 5 surfaces are Connect / Present / Sell / Buy / Trade.** Sella is NOT a sidebar surface. *Why:* Sella is a layer over the whole app, not one feature among others.
- **Sella lives in a right-side panel across all 5 surfaces (Cursor-style).** *Why:* keeps her always-available without dominating navigation; matches the multi-Sella context-routing model from Layer 1 (she changes hat based on the surface you're on).
- **All users see all 5 surfaces**, regardless of whether their company buys, sells, or both. *Why:* keeps navigation consistent and predictable; supports companies that do both without conditional UI.
- **Deal workspaces live inside Connect.** *Why:* deals are born from connections (Layer 1); putting workspaces under Connect keeps the lifecycle co-located.
- **Deals are accessible from chat AND from Trade**, in addition to Connect. *Why:* chat is where deals form, Trade is the analytical view of the business — deals need to be reachable from both contexts.
- **Each surface's contents are defined by its Linear project-label.** Whatever projects live under the "Connect" label belong inside the Connect page; same for Present / Sell / Buy / Trade. *Why:* Linear becomes the single source of truth for surface scope; no drift between brainstorm decisions and the project tracker; new projects auto-belong to a surface via their label.

### Surface scoping (locked 2026-05-14)

- **Basket seller-view and buyer-view are the same object** — role-based visual perspectives. Buyers who don't have their own shop create baskets directly from the seller's shop. *Why:* simpler data model, fewer concepts to design.
- **Deal Basket and Deal Card are the same thing**, in different visual representations (cart-style vs. Pokémon-card-style). Both can open into a Deal Room. *Why:* aligns with the e-commerce cart-to-checkout mental model; cuts conceptual surface area.
- **Sell page = strictly seller-side ops** for the sales team. No cross-side analytics (those belong in Trade). *Why:* keep surfaces single-purpose; cross-side intelligence belongs in Trade.
- **Buy page = buyer-side analog of Sell** — dedicated page for buyer-side procurement workflows. *Why:* symmetry with Sell; supports buyers who run real procurement teams.
- **Trade page = C-suite analytics + business control center** (post-MVP). Initial scope: all deals across time with filters (1 month / 1 year / 2 years / custom). Future: map view. *Why:* C-suite needs a high-level operational dashboard distinct from day-to-day workflows on the other surfaces.
- **(2026-05-16) Pricelist cascade for outgoing offers (DEV-1).** When a seller sends an offer card to one or more buyers, the system picks the right pricelist **per recipient** by cascading priority (most-specific wins): (1) **customer-specific pricelist** if the receiving buyer is in Connect with a custom pricelist on their Relationship page; (2) **STANDARD pricelist** if no customer-specific pricelist exists but the seller has uploaded a STANDARD pricelist (CSV); (3) **manual prompt** if neither exists — Sella asks the seller to enter prices before the offer goes out. *Why:* customer-specific is the most trust-building (already-negotiated terms with that buyer); STANDARD is the sensible fallback; manual prompt prevents accidentally sending a no-price offer. Per-recipient evaluation lets a single multi-recipient offer attach the right pricelist to each buyer.

### Walkthrough locks 2026-05-20 — surfaces, shop pricing, blank/populated states

- **(2026-05-20) Surface UI states (DEV-14).** Every user sees all 6 navigable surfaces regardless of company role. Each surface has **two UI states: blank** (user / company hasn't activated this surface) **and populated** (active use). No hiding, no role gating — every surface stays reachable; the design pattern is just "show empty state vs live state." Platform encourages dual-role usage by keeping both Buy and Sell always accessible. *Why:* one consistent navigation model for all users; no conditional UI; empty-state UX is the only role-adaptive piece.
- **(2026-05-20) Shop pricing per viewer (DEV-12, refines 2026-05-14).** Three modes the seller chooses from: (a) show all prices publicly, (b) hide all — buyer sees a **"request pricing" button** to ask, (c) show one default **STANDARD** pricelist publicly. For connected companies, an **individual custom pricelist** applies on top, **different per connected company**. *(Adds the "request pricing" UX and per-connected-company custom-pricing detail to the 2026-05-14 lock.)*
- **(2026-05-20) Presentation Mode concept locked (DEV-18).** Seller goes to their Present screen → selects products from their shop → adds presentation media (videos / photos / Loom) → turns the selection into a Deal Room for the customer. Concept inherited from the DEV-22 lock (Basket → Deal Room expansion); DEV-18 closes by reference. UI / interaction design spun off as [DEV-54](https://linear.app/hellosello/issue/DEV-54).

### Big 7 framework (locked 2026-05-18 team meeting)

> *Note: the "Trade" surface was renamed to "Grow" on 2026-05-23 ([DEV-21](https://linear.app/hellosello/issue/DEV-21/whats-the-new-name-for-the-trade-page-verb-matching-the-surface-naming)). Historical entries in this and earlier sections retain the original "Trade" name. The Linear project label is still named "Trade" — rename pending team alignment.*

- **The product is organized around 7 pillars** — six navigable surfaces (Connect / Buy / Sell / Present / Trade / Discover) plus one always-available AI layer (Sella, right-side panel). *Why:* the Big 7 gives every user a clear mental map of platform value; surfaces own distinct user jobs while Sella stitches them together.
- **Sella as a Big 7 pillar does NOT change the 2026-05-14 UI lock.** She still lives in the right-side panel across all surfaces and is NOT a sidebar item. The Big 7 framing is conceptual (a value-pillar list), not navigation. Sella's role adapts to the user, surface, and task.
- **Discover is a new surface** for: (a) pre-populated companies (FLOWZ-style, see Layer 1 §12), (b) finding new suppliers globally as a network social feed, (c) legal advertising for brands to a verified audience (closed gang). *Why:* expands platform value from connected-only relationships to pre-registration discovery + brand promotion.
- **Home = landing page outside the Big 7.** Login portal top-right; UI base = the FIGMA design with pink replacing blue. *Why:* the Big 7 are signed-in surfaces; Home is the public front door + login flow.
- **Big 7 per-pillar value props (from the 2026-05-18 meeting table):**
  - **Connect** — chat with every partner inside or outside Hello Sello.
  - **Buy** — smart procurement decisions; visibility of all deals, prices, margins. **Led by Victor Diem.** Buy-side toolset = Margin & Pricing Tool / Deal Engine / Exclusivity Deals / Cash-Flow Calculator / Product Data Bank.
  - **Sell** — allocate batches with margin control.
  - **Present** — show what you've got, basket → deal(room). Online shop + best presentation.
  - **Trade** — command center for all deals.
  - **Discover** — find new interesting suppliers globally + legal advertising.
  - **Sella** — female-inspired caring AI mediating for collaborative mutual benefits on both sides.

### Build priority across the Big 7 (locked 2026-05-23)

- **Connect = build first.** Foundation surface - relationships, chat, connection requests, deal birth. Without Connect, no other surface has data to operate on. *Why:* every other surface (Buy, Sell, Present, Trade, Discover) depends on a real seller↔buyer relationship and a chat thread existing first.
- **Present = build second.** *Why:* once Connect works, sellers need a way to assemble products into shops/baskets and pitch via Deal Room. Present is the natural next dependency in the deal-formation flow.
- **Buy / Sell / Discover / Trade = build third through sixth, order TBD.** *Why:* none are foundational; their build order will be decided based on the lead customer's workflow (Canadian Craft) and what unlocks fastest value.
- **Sella = built alongside whichever surface is in scope.** Not a build-priority slot of her own. *Why:* Sella is an always-on layer across all surfaces, not a page; her behavior is built per-surface as that surface lands.

### Build approach across phases - "Approach C" hybrid (locked 2026-05-23)

The 9-phase development plan (Idea → Research → Prototype → PRD → Architecture → Implementation planning → PRD-to-issues → Execution → Q&A) does **not** run sequentially per surface. Instead:

- **Idea + Research:** deep for Connect; light for Present, Sell, Buy; 2-paragraph stubs for Trade and Discover. *Why:* Trade and Discover are far enough out that grilling their details now is wasted - they'll change before we touch them.
- **Prototype:** only Connect first. *Why:* validate the foundational interaction before committing.
- **PRD:** deep for Connect + Present; scoped (1-2 pages) for Sell + Buy; stubs for Trade + Discover. *Why:* PRD depth tracks build priority.
- **Architecture:** ONE pass covering the full Big 7 vision. Data model, schema, API designed so Connect + Present ship first, but the foundation already accommodates Sell, Buy, Trade, Discover when they get built. *Why:* Connect's data model (Relationship, Deal Card, Workspace, Chat) is shared across all surfaces. Designing it once = no refactor cost. Trade and Discover get "future entry points" in the schema, not full implementations.
- **Implementation:** vertical slice. Build Connect → ship → Present → ship → Sell/Buy → ship → others. Each subsequent surface drops into the pre-built foundation. *Why:* tight feedback loop (ship fast) without paying refactor cost.

*Net effect:* fast time to first ship (Connect), zero architecture rework when adding surfaces, deliberate scope discipline on Trade/Discover.

### Trade → Grow rename (locked 2026-05-23, DEV-21)

- **(2026-05-23) Trade surface renamed to Grow (DEV-21).** Single-word verb matching the surface naming convention (Connect / Present / Sell / Buy / Grow + Discover). Forward-looking docs updated (LAYER-1, LAYER-2 §5, LAYER-4 §5 routing + 2026-05-22 locked decision, CONTEXT.md, ARCHITECTURE-NOTES.md). DECISIONS.md historical entries above and meeting notes from 2026-05-18 retain "Trade" as the original name (annotation added at top of Big 7 framework section). Linear "Trade" project label kept as-is — rename pending team alignment. *Why:* "Trade" was a placeholder; "Grow" captures the surface's purpose — high-level analytics + business control + viewing all deals over time + future geographic ops — which together represent how the C-suite grows the business.

### Walkthrough locks 2026-05-24 — contact categorization (DEV-17)

- **(2026-05-24, DEV-17) Imported contact categorization scheme locked for MVP — Option A "minimal" (built on DEV-3 metadata-only constraint).**

  **MVP scheme:**

  1. **Manual role label per contact** (user-set; default `Unknown`). Suggested enum (FINAL AT BUILD PHASE):
     - `Supplier` — cultivators, manufacturers, upstream raw-material sources
     - `Customer` — pharmacies, downstream end-buyers
     - `Partner` — logistics (narcotic-grade carriers), lab/QA (COA providers), regulators (BfArM, customs, GACP/GMP auditors), compliance consultants — catch-all for service-side relationships
     - `Other` — anything not fitting (e.g., internal contacts that slipped through import)
     - `Unknown` — default until user labels

     No auto-inference. User confirms/adjusts per-contact.

  2. **Auto-derived activity bucket** (computed from DEV-3 metadata: `email_count` + `last_seen`). Thresholds suggested but tunable at build:
     - **Active** — last contact ≤ 30 days AND `email_count` > 5
     - **Occasional** — last contact ≤ 90 days
     - **Dormant** — last contact > 90 days

     Used for sort/filter in Connect surface; visible on contact card.

  3. **No free-text tags in MVP.**
  4. **No AI inference / Sella suggestions in MVP.**

  *Open at build phase (suggested, not locked):* whether to split `Partner` into Logistics / Lab / Regulator specifics; whether to add `Wholesaler` for peer-trading distributors distinct from `Supplier`; activity bucket thresholds may need real-usage tuning; whether `Distributor` itself is a separate role (MVP company types per Layer 1 §1 are Distributors + Pharmacies — overlap with `Supplier` vs `Customer` depends on user's own role).

  *Why minimal:* metadata-only signals (DEV-3) make confident AI inference unreliable; default-Unknown + lazy manual labeling avoids the wrong-label trust erosion. Activity bucket gives immediate value (sort by recency) without setup pressure. Cannabis B2B CRMs (Distru, LeafLink, Apex Trading) tend toward lifecycle categorization (Lead/Prospect/Customer); HS's role-type fits the "imported contact = known business relationship" framing better — these aren't sales-funnel leads.

  *Architecture — schema extension shape:* contact record gains `role` enum (default `unknown`) + `activity_bucket` derived (computed live or cached, build-phase decision). Extension hooks present for post-MVP: `tags[]` (array of free-text user tags) and `sella_suggested_role` (nullable enum for AI suggestions) — schemas in place, no UI/inference in MVP.

  *Post-MVP roadmap (in order):* (1) free-text tags UI exposure; (2) Sella-suggested-role inference with explicit confirm/dismiss (never auto-apply); (3) role enum expansion if usage shows need; (4) custom user-defined role enums per company.

---

## Layer 3 — The Deal (Execution) (IN PROGRESS)

### Execution model (locked 2026-05-16)

- **Stages and Milestones are distinct concepts.** Stages = post-confirmation macro phases (custom per deal, template-based, with flexibility to customize). Examples: finance, logistics, delivery. Milestones = checkboxes / gates that must be ticked (required or optional). *Why:* clean separation — stages structure the workflow, milestones provide granular gating that can sit anywhere in the lifecycle.
- **Milestones can be pre-confirmation OR post-confirmation.** Pre = gates before the deal moves to Confirmed (e.g., manager approval for a discount, COA upload before commit). Post = checkboxes within a stage during execution (e.g., doc upload during the finance stage, DocuSign-style approvals). *Why:* one primitive serves both gating needs; avoids inventing two parallel concepts.
- **Stage closure = signal of completion for that stage.** Each stage has a responsible person/team. When their part is done, they close/tick the stage. No notification required — closing is the signal. *Why:* lightweight handoff; reduces noise.
- **"Things" = action items always assigned to someone.** Created from chat / screenshot / deal context. Used to request approval, raise issues, ask questions, inform people. The recipient sees them in their "things to do" list. *Why:* gives the deal a workflow primitive for human escalation that's not tied to stages or milestones.
- **Deal moves to Done when:** (a) all stages are closed by their responsible people, AND (b) the product reaches the customer. *Why:* matches real-world close criteria (operational work done + delivery confirmed). The final trigger mechanism (explicit customer click vs. implicit) is tracked as an open question — see DEV-25.
- **(2026-05-16) Stage closure triggers a visibility update** that informs other deal participants. Can manifest as: (a) an in-app notification to relevant parties, (b) a visible status change in the deal workspace (anyone checking sees the stage is done), or both. Closing the stage IS the trigger — no separate "send notification" step. Specific mechanism (notification vs. status banner vs. both) is TBD. **Supersedes the earlier "no notification required" interpretation.**

### "Things" details (locked 2026-05-16)

- **Things can be standalone OR deal-scoped.** Anyone can assign to anyone. Always have an assignee, always have a purpose. *Why:* "Things" is the universal action-item primitive — not just deal-related — giving the system a unified place for asks and escalations.
- **Things have categories** — approval request, issue/blocker, question, FYI/inform (extensible). *Why:* enables filtering and triage in the inbox.
- **Filters on the Things inbox** — by assignee, by category, by deal context, by status. *Why:* a single user may have many Things; filtering is essential.
- **In-app notifications when a Thing is assigned.** No email for MVP. *Why:* recipient must be told they have something to act on; keep notification channels simple for MVP.
- **Things can be redirected / reassigned** — recipient can bump to someone else ("not me, ask Anna"). *Why:* matches real-world delegation; avoids dead-end Things.
- **Things can be threaded / discussed** — creator + assignee can chat on a Thing until resolved. *Why:* enables clarification without escalating to a full deal-room conversation.
- **Things lifecycle:** Open → Done (side path: Dismissed). *Why:* simple state machine, easy to reason about.

### Milestones details (locked 2026-05-16)

- **Milestones have no enforced types.** Flexible, user-defined per deal — can be document upload, approval-from-person, generic checkbox, customer-side upload, anything else. *Why:* prevents premature constraint; real-world deals vary widely in what gates make sense.
- **Milestones are optional by default (MVP).** Users tick them when they know it's done. *Why:* no ERP integration yet to auto-detect completion; user-driven ticking is the lightweight mechanism that works without machine signals.
- **Required milestones halt the stage** until completed. UX must clearly show *why* the stage is halted (e.g., "Halted because approval from X is needed"). *Why:* required gates must be visible and actionable; users should never wonder why progress stopped.
- **Templates provided per deal + full flexibility for any party to add milestones anytime.** *Why:* templates reduce setup friction; flexibility supports real-world variation (same pattern as stages).
- **Tickable by the person responsible (assignee) OR the creator only.** Nobody else can tick. *Why:* clean accountability; prevents bystanders from short-circuiting approvals.
- **Notifications use the same in-app mechanism as Things.** *Why:* unified notification model; reduces the number of channels users have to monitor.
- **Audit trail required** — every milestone tick is logged with who, when, and on what. Especially important for GDPR + regulated cannabis-pharma. *Why:* compliance + dispute resolution; closes the loop with Layer 1's evidence log.

### Stages details (locked 2026-05-16)

- **Stage lifecycle: Pending → In Progress → Closed → Reopened.** Four states. Reopened lets a closed stage come back if downstream issues surface. *Why:* real-world deals don't move strictly forward; the Reopened state preserves an audit trail of issues without losing the prior closure.
- **Stages can run in parallel; sequential-vs-parallel is user-configurable per deal.** The dealmakers decide which stages run concurrently. *Why:* not all deals are linear — finance and logistics can often run in parallel; rigidity would create artificial blockers.
- **A stage closes when all required milestones in it are completed.** Optional milestones are carried over and don't block closure. *Why:* required gates are the contract; optional items are nice-to-haves that shouldn't halt progress.
- **Deals are born with a default set of stages, fully customizable.** User can add, remove, reorder. MVP default = hardcoded template `cannabis_wholesale_v1` (finance/logistics/delivery + default THINGS per stage). *Why:* zero-state friction matters; users shouldn't face a blank canvas, but should be free to reshape. *(Default-set question resolved by DEV-31, 2026-05-23.)*
- **The deal has a "deal owner" who stays accountable throughout the deal.** The deal owner manually picks the responsible team/person for each stage. *Why:* clean accountability — one throat to choke; stage-responsible people act on their portion without taking over the deal. *(Partially resolves DEV-24: ownership doesn't pass between stages. DEV-24 stays open for remaining nuances — Things-list placement, etc.)*

### Walkthrough locks 2026-05-20 — execution, delivery, payment, no-stage-reopen

- **(2026-05-20) Done trigger (DEV-25).** A deal moves to Done when the **delivery note + invoice are both attached** to the deal. The documents prove the deal content is correct and final — no explicit "Done" click required. **Sella OCR / AI** extracts the document data and amends the deal card to reflect actual volumes / prices / final names shipped. *(Supersedes the 2026-05-16 lock "Deal moves to Done when all stages are closed AND product reaches the customer" — document attachment is now the canonical trigger.)*
- **(2026-05-20) Stages don't reopen (DEV-33).** Stage lifecycle is **Pending → In Progress → Closed** — three states, no Reopened. Post-close work happens via existing primitives: documents (attachments), Things (clarification tickets, §7), and approvals (approval workflow from DEV-41). *(Supersedes the 2026-05-16 four-state lifecycle lock.)*
- **(2026-05-20) Stage closure + post-close deal-data changes use passive thin status line (DEV-33).** Stage closure and post-close deal amendments (e.g., delivery-note attachment amending volumes) appear as a thin status line in both the P↔P chat where the change was processed and the C↔C workspace chat — WhatsApp-style artifact (date + timestamp), no push notification. *Why:* Marcel wants to save people from notification overload. *(Supersedes the 2026-05-16 lock "Closing a stage triggers a visibility update — in-app notification, status change in the workspace, or both.")*
- **(2026-05-20) Payment tracking — MVP scope (DEV-35).** **No payment tracking in HS for medical cannabis** (40-90 day payment windows handled outside the platform). The deal card still carries payment terms (e.g., "Net 60") as metadata. **Phase 2:** Stripe integration for packaging-material / non-cannabis suppliers. **Phase 3 / future:** factoring integration — suppliers route invoices to partner factoring companies, HS takes a small fee.
- **(2026-05-20) Delivery tracking — MVP scope (DEV-36).** Delivery is tracked by uploading the delivery note + invoice; **Sella OCR / AI** extracts data and **auto-amends the deal**. **Phase 2:** logistics companies as workspace actors (pickup notifications + tracking info into the same portal). **Phase 3 / future:** customer ERP integration for end-to-end automatic delivery tracking. Partial / split shipments: working assumption is one deal with N deliveries (Done on final) — tracked as [DEV-53](https://linear.app/hellosello/issue/DEV-53/multiple-deliveries-on-one-deal-does-done-require-all-delivery-notes) for Marcel confirmation.

### Walkthrough locks 2026-05-22 — approvals, cancellation, PO generation, flat-THINGS doctrine

- **(2026-05-22) Approval signatures — APPROVE button = e-signature (DEV-29).** No third-party e-signature integration. The APPROVE button captures: person + 2FA-authenticated login + name/email/account + the acceptance action + timestamp. This bundle is the legally binding signature — DocuSign logic in a nutshell. *Why:* same identity + intent + immutable-timestamp formula as DocuSign; no external dependency; full UX control; regulated-pharma audit ready.
- **(2026-05-22) Post-confirmation cancellation / amendment — two flows (DEV-23).** **(a) Amendment** for partial issues (e.g., 20% under-delivery) — one side flags, the other approves; audit trail logged. **(b) Cancellation** for full non-delivery — MVP simply deletes the deal so wrong documents don't surface in-system; post-MVP triggers ERP cancel-if-possible behavior (Odoo / CanCraft on the roadmap; no cancellation-fee mechanism in MVP). **Cancellation authority:** SELLER can always cancel unilaterally regardless of birth path; BUYER cannot — BUYER can only request a change, which needs SELLER approval. *Why:* mirrors real-world commercial asymmetry where SELLER controls inventory commitment; gives loose email-based ordering a contractual spirit while accepting industry reality that orders + inventory never match perfectly at year-end.
- **(2026-05-22) Order generation — PO / SO / Hello Sello Deal Number + QR (DEV-26).** Deal birth is directional: **OFFER** = seller-initiated (sales order); **ORDER** = buyer-initiated (purchase order). Both need the other party's approval. On mutual acceptance, the deal becomes an "order" with three identifiers + a QR code: (a) **Buyer's PO #** — buyer's own internal reference, field on the order form; (b) **Seller's SO #** — seller's own internal reference, field on the order form; (c) **Hello Sello Deal Number** — auto-generated, pattern `HS-AAA##-BBB##-NNNNNNNN` (e.g., `HS-AUR01-CCR01-00058632`); (d) **QR code** encoding the Deal Number for cross-system tracking. Order form is **XML-readable** for downstream ERP/accounting/logistics integration. All IDs + QR generated at the moment of confirmation, not later. Short-code derivation rule deferred to build phase (flagged in Layer 3 §4). *Why:* every counterparty system speaks its own ID; Hello Sello adds a third source-of-truth ID + QR so paper/forwarded copies stay traceable; XML readability prevents manual ERP re-entry.
- **(2026-05-22) Flat-THINGS doctrine + stages-not-surfaced (DEV-24, DEV-30, DEV-28, DEV-34).** Major Layer 3 doctrine shift. **Stages exist as conceptual scaffolding** — they organize work by domain (finance, logistics, delivery) and provide default assignees — but are **NOT a UI primitive.** No Kanban, no timeline, no per-stage lifecycle UI. **Stage-responsibility SURVIVES** as the default-assignee mechanism for THINGS in that stage (overridable per-THING). The deal owner picks stage-responsible people at deal birth. **Deal ownership does NOT pass** between stage-responsible people — the deal is visible + actionable for the whole company; stage-responsible people work on their THINGS without taking over the deal. **Milestones unify into THINGS** (post-confirmation) — single primitive for everything that needs to be done. Pre-confirmation gates remain as a specialized THING with `blocks_confirmation` (manager approval, COA upload before deal-card confirmation) — the only blocking behavior in execution. **No post-confirmation blocking** — all open THINGS visible at all times. **Urgency drivers (visible, not gating):** deadline on THING, priority on DEAL, deal creation date, delivery date on deal. "Sandwich-execution" model — user picks what to work on by urgency signals. *Why:* the prior stage + milestone-halt model added UI complexity without execution value; real-world workflow is a flat list of work items prioritized by urgency, not a phase-machine. Marcel: "Just a sandwich that needs to be executed."

  *Supersedes (2026-05-16):* "Required milestones halt the stage until completed"; "When the responsible person's part is done, they close/tick the stage"; the milestones-as-distinct-primitive framing for post-confirmation milestones.

  *Supersedes (2026-05-20, DEV-33):* "Stage lifecycle: Pending → In Progress → Closed" — stages have no UI lifecycle anymore. The "stage closure" half of the passive-thin-status-line lock is also superseded (stages don't close as UI events); the post-confirmation deal-data-change status-line pattern for DEV-36 OCR auto-amendments is unaffected and still applies.

  *Side-effect closures:* **DEV-34** (stage UI Kanban vs timeline) — no UI for stages, question dissolves. **DEV-28** (milestones ↔ THINGS) — they're the same primitive.

### Walkthrough locks 2026-05-23 — stage template + mid-deal THING-add (DEV-31, DEV-32)

- **(2026-05-23, DEV-31) MVP stage template = `cannabis_wholesale_v1` (single hardcoded platform default).** Stages: finance, logistics, delivery. Each stage ships with default THINGS pre-loaded at deal birth:
  - Finance: "Send invoice", "Confirm payment terms (e.g., Net 60)"
  - Logistics: "Confirm pickup date", "Verify COA matches batch", "BfArM import authorization on file (if cross-border)", "Confirm narcotic-grade transport carrier"
  - Delivery: "Upload delivery note", "Upload final invoice"

  Fully editable per-deal after birth (stages, THINGS, responsibles). No template-management UI in MVP.

  *Why default THINGS in MVP:* low effort (data structure, no new UI; reuses existing THINGS primitive from DEV-30), high value (day-1 deal populated not blank; demonstrates THINGS primitive immediately; Sella has mediation material from minute one).

  *Compliance-as-stage rejected for MVP* — distributed across existing stages (mostly Logistics) for simplicity. COA-batch verification stays prominent in Logistics (Marcel + Victor flagged COA as the cannabis-specific critical doc).

  *Architecture — build for extension:* template stored as data/config (not hardcoded in business logic); schema supports N templates (`{id, industry, stages[], default_things_per_stage{}}`) even though MVP ships one row; selection logic `getTemplate(deal)` exists with extension shape; company-override extension point present in data model (`company.template_overrides`) without admin UI in MVP.

  *Post-MVP roadmap (in order):* (1) multiple platform templates if HS expands beyond cannabis wholesale; (2) company-wide template curation UI (admin clones-and-tweaks default); (3) Sella-learns-templates — Sella proposes default-THING additions based on company's actual patterns over N deals.

- **(2026-05-23, DEV-32) Mid-deal THING-add → inline notification only, no confirmation.** Under DEV-24/30 doctrine (stages = scaffolding, not UI events), "adding a stage mid-deal" re-frames as "adding a THING in a domain not previously represented." Lock: when one party adds a THING (in any stage/domain) mid-deal, the other party receives the standard inline notification in the deal workspace (per DEV-30 in-app notification model); no confirmation required; aligns with DEV-30 "any-party-can-add" THINGS lock; audit trail logged per DEV-30 standard. If the THING falls in a domain with no stage-responsible person yet, deal owner picks the responsible at that moment (same mechanism as deal-birth assignment). *Why:* matches the existing flat-THINGS doctrine — THINGS are universally any-party-addable; new domain/stage emergence is absorbed via existing default-assignee mechanism.

---

## Layer 4 — Sella's Behavior (IN PROGRESS)

### Identity & persona (locked 2026-05-19)

- **Sella's promise: a female-inspired caring AI for both sides, mediating for collaborative mutual benefits.** *(Inherited from Big 7 lock 2026-05-18; restated here as Layer 4's anchor.)*
- **Per-Sella persona consistency.** Each specialist Sella (Seller / Buyer / Deal / Personal / Company) has its own persona that differentiates it while preserving Sella's unified warmth. Differentiation by role is part of how the specialists work — e.g., Deal-Sella is more formal / auditable (she writes evidence + system messages), Personal Sella more casual / anticipatory (she's the user's wingmate), Company Sella more authoritative / synthetic (she briefs admins). *Why:* a single monolithic voice across roles would either feel wrong in formal contexts (audit messages) or wrong in casual contexts (personal nudges) — role-fitted tone preserves trust on both ends.
- **(2026-05-20) Voice tone: Schranner-inspired mediator style (DEV-46).** Sella's base voice is a **mediator** — calm, structured, balanced, solution-oriented. Inspired by Matthias Schranner and similar negotiation specialists who manage two parties toward mutually-best outcomes. Collaborative language ("we," "both sides"), structured questioning to surface needs, composed across all surfaces. Each specialist Sella inherits this base tone with role-fitted shifts (per the persona-consistency lock). *Why:* the platform's neutrality moat is reinforced by a voice that visibly takes both sides — a mediator's tone signals "I'm working for both of you" in every interaction. Concrete voice samples tracked as [DEV-55](https://linear.app/hellosello/issue/DEV-55/draft-sella-voice-samples-in-mediator-style-schranner-inspired).

### Routing & interface (locked 2026-05-21)

- **Right-panel Sella is always the user's side-specific Sella.** Inside a deal workspace, by deal direction (Seller or Buyer). Outside a deal, by sub-context (e.g., looking at a relationship with a buyer-company → Seller-Sella). Personal Sella when no clear side context; Company Sella on admin/CEO surfaces. *Why:* one consistent conversation partner per user, regardless of surface.
- **Deal-Sella is never in the right-side panel.** She speaks exclusively via system voice (system messages, text-box prompts, evidence logging). Side-specific Sellas read from her workspace scope to answer deal questions. *Why:* neutrality is structural at the interface layer — Deal-Sella never has a one-sided conversation.
- **Deal-Sella detection ↔ mediation continuity.** Same agent across two modes — detection mode in P↔P chats, mediation mode inside the workspace post-birth. On both-users-Accept of "deal forming?", she promotes; workspace spawns. No specialist hand-off. *Why:* one owner of the deal lifecycle; cleaner audit.

### Deal-Sella data scope (locked 2026-05-21)

- **Deal-Sella sees only common-knowledge / symmetric pricelist data** — the relationship-level custom pricelist (per DEV-1 cascade) + the public shop pricelist visible to this deal's buyer (per DEV-12 mode). She does NOT see the seller's master pricelist, margins, prices for other buyers, or any internal pricing logic. *Why:* preserves neutrality structurally; asymmetric data → asymmetric agent.

### Detection model & Sella surfacing (locked 2026-05-21)

- **Detection model: hybrid — strict trigger, lenient monitoring.** Deal-Sella continuously reads chat context (topic detection, intent, product/price mentions) and maintains a "deal candidate" model in the background. She only prompts users when the strict deal-forming signal hits (product + quantity OR product + price, optionally with terms / affirmation). On both-users-Reject, she stops that prompt cycle but keeps monitoring — next prompt fires on next strict signal. *Why:* user trust requires predictable, signal-gated prompts; LLM intelligence is captured internally for rich v0.1 pre-fill; rejection ends prompt, not monitoring.
- **Deal-Sella interactive UI placement.** When she activates to prompt the two users (deal-forming, counter, evidence text-box), she appears as a component above the chat, middle-aligned, in the P↔P chat. Distinct from the passive thin-status-line model used for stage closures and post-close amendments (DEV-33). *Why:* interactive prompts need attention; passive notifications need to be ignorable.
- **No formal cooldown on deal-forming prompts.** Rejection does not trigger time-based or message-count-based suppression. Next prompt fires when the next strict signal is detected. *Why:* the strict signal IS the gate; layering a cooldown on top would be paternalistic.

### Proactive nudges (locked 2026-05-21)

- **Personal Sella owns proactive user-level nudges** — daily digest of pending Things and deals, stale-deal alerts, "what's on your plate today" synthesis. Cross-cuts sell + buy for the user. *Why:* user-level synthesis is a per-user concern; Seller-Sella and Buyer-Sella are domain-scoped, Personal Sella is user-scoped — one daily voice, not three.

### Flagged for later (2026-05-21)

- **Personal Sella vs Seller-Sella vs Buyer-Sella behavioral overlap.** These three specialists may act very similarly depending on context. Open: are they three distinct agents with overlapping behaviors, or one agent with context-dependent flavors? Has architectural implications for the multi-Sella system. To be drilled in §4/§5 of Layer 4. *(Update 2026-05-21: covered by existing DEV-11 — see LAYER-4 §2 marker.)*

### Trigger event coverage v1 (locked 2026-05-22)

- **Sella trigger events documented across five layers (non-exhaustive):** Deal-Sella detection mode (chat watching → strict-signal prompts), Deal-Sella mediation mode (workspace events, milestones, docs, 30-day nudge), Side-Sella in right panel (read from Deal scope on user open/Counter/question), Personal Sella (digest, Things, login summary), and First-contact Sella (per DEV-7 P↔C workflow). *Why:* explicit event list gives engineering a build-ready map; new triggers can be added with team discussion as the product evolves.

### Autonomy ladder (locked 2026-05-22)

- **5-level autonomy ladder: Off → Suggest → Pre-fill → Confirm-each → Auto.** Trust grading is per-action-type, not global. Climbs based on user approve-rate over N actions; resets on rejection streak. Threshold numbers TBD post-launch. *Why:* matches familiar tooling (Cursor / Copilot tiers); per-action-type granularity prevents premature trust collapse if one action type goes wrong.
- **Hard autonomy ceiling at L3 (Confirm-each)** for: counter-offers to the other side, accepting / confirming a deal, posting AS THE USER in workspace chat, financial / contractual obligations, any action affecting the other side without separate consent. *Why:* protects neutrality (Deal-Sella never auto-acts) and trust (no surprise commitments).
- **Ask Myself = pre-authorized auto-send of repetitive/specific assets.** User pre-uploads intro / pitch / product tour / demo / FAQ replies. Sella auto-sends contextually appropriate asset when asked a matching question. Not on the autonomy ladder — separate "pre-authorized static content" mode. *Why:* the ladder gates Sella-generated actions; Ask Myself sends user-curated content. Different trust model, separate primitive.

### Per-surface behavior (locked 2026-05-22)

- **Surface → Sella routing table (Big 7 + Home + Deal Workspace).** Each surface has a default right-panel Sella, optional background Sellas, and a primary capability set. Captured in LAYER-4 §5. *Why:* concrete map gives engineering build-ready routing rules and prevents drift between surfaces.
- **Connect overview default = Personal Sella.** No item selected → Personal Sella shows daily digest. Selecting a relationship/chat switches to the side-specific Sella by direction. *Why:* Personal Sella is the user's day-view agent; defaulting to her on overview surfaces matches the "what's on my plate" pattern.
- **Discover follows user intent.** Browsing for suppliers → Buyer-Sella; managing legal ads / brand presence → Seller-Sella; just exploring → Personal Sella. *Why:* Discover serves three distinct purposes (Big 7 lock); intent-driven switching means Sella adapts to the action, not the page.
- **Trade right-panel = Company Sella.** Trade is C-suite scope per L2; Company Sella is the only specialist with cross-side (sell + buy) visibility. *Why:* admin/CEO view needs both sides of the company.
- **Cross-surface "what's on my plate" overlay.** From any surface, asking Personal Sella surfaces the user's open Things, deals, and digest — regardless of which side-Sella is in the panel. *Why:* user-level synthesis is per-user and surface-independent.

### Translation MVP scope (locked 2026-05-22)

- **Chat messages: per-chat toggle.** User enables / disables translation per chat thread. Matches the current demo pattern; positive Marcel feedback. *Why:* gives users control without forcing always-on cost; familiar UX from messaging tools.
- **Everything else (deal cards, documents, system messages, side-Sella suggestions, shop content, public ads): English only for MVP.** *Why:* tight scope for first launch with English as the working language. Translation expansion is a deliberate post-MVP step.
- **Pitch's broader translation promise ("wir wandeln alles in die Sprache unserer Partner") = post-MVP scope.** *Why:* the value is real but the engineering + content QA burden is large; ship MVP first, expand based on real customer needs.

### Memory, retrieval, learning (locked 2026-05-22)

- **Per-specialist memory scope:** Deal-Sella = per-deal, life-of-deal; Seller-Sella / Buyer-Sella = per-company-side, persistent; Personal Sella = per-user, persistent; Company Sella = per-company cross-side, persistent; First-contact Sella = config-only. *Why:* each specialist's scope matches its routing (Layer 1 §10); memory model is a direct consequence.
- **Retrieval architecture: hybrid RAG.** Vector RAG for unstructured (chat, evidence, notes); direct DB queries for structured (pricelists, batches, deals); in-memory for live state. *Why:* company-wide scope of Side-Sellas would blow any context window; hybrid is the standard pattern (Notion AI / Slack AI / CRM AI agents).
- **Learning loop (MVP) = thumbs up/down + optional reject-reason + approve-rate telemetry.** Per action type. No active retraining in MVP — feedback logged for analytics + future training. *Why:* lightweight signal mechanism; active retraining requires infra + QA that's post-MVP scope.
- **User memory controls: view, delete, reset, per-relationship reset.** Honors GDPR right-to-be-forgotten via cross-reference to the GDPR / Authentication workstream. *Why:* regulated market (cannabis pharma + EU) demands explicit memory controls.

### Failure modes & escalation (locked 2026-05-22)

- **Every Sella write is reversible.** Undo affordance + full audit trail (per Layer 1 §11 + GDPR). *Why:* mistakes are inevitable; reversibility is the floor that keeps trust intact.
- **Quick user-correction flow drops her autonomy.** Marking a Sella message "this was wrong" → drops her autonomy level for that action type (§4 ladder). *Why:* combines feedback signal with immediate behavioral consequence.
- **Sella surfaces uncertainty** rather than asserting when low-confidence. Tentative labels ("I'm not sure, but...") on borderline suggestions. *Why:* preserves trust by being honest about what she doesn't know.
- **Material errors escalate to both deal participants + audit log,** requiring user review before re-application. *Why:* wrong card terms, OCR amendments, regulated translations have downstream impact; can't silently retry.
- **No silent failures.** Every Sella action is visible to the user. *Why:* the moat is trust; invisible mistakes destroy it.
- **Human override is always available** — user can pause / disable any Sella behavior per surface, action type, or entirely. *Why:* user is the principal; Sella is a tool, not an authority.

### Non-goals (locked 2026-05-22)

- **Sella does NOT** advocate for one side, auto-send without user consent, access counterparty internal data, learn across companies, replace human judgment on material commercial decisions, give legal/regulatory advice, surveil casual chat, retain memory beyond defined scope, or act as the legal record of an agreement. *Why:* explicit non-goals protect neutrality (Schweiz des B2B-Handels), trust, and the bounded scope of an AI-as-tool vs AI-as-authority.

---

## Layer 5 — Inputs and Outputs (drafted 2026-05-22)

### Inputs

- **Email = MVP, human-in-loop.** Sella reads incoming emails and pre-fills a Deal Card; salesperson reviews, edits, and acts. Sella never auto-sends or auto-finalizes from email. *Why:* email is the dominant external channel in German cannabis B2B; human-in-loop preserves trust on day one and lets us measure Sella's extraction quality before automating further.
- **Attachments (COA / COB) = MVP, store only.** Upload and link to product; no content parsing or compliance validation in MVP. *Why:* parsing introduces compliance liability and engineering scope we can't justify pre-launch. Storage alone unblocks the deal workflow.
- **FLOWZ scrape = MVP, contingent on GDPR check.** Pre-populate supplier profiles and product catalogs from FLOWZ public data so buyers don't land on a blank screen and suppliers can claim a pre-existing profile on signup. *Why:* cold-start advantage on both sides of the marketplace; treats the seeded data as a sales/marketing accelerator, not a product feature. Build gated on DEV-62.
- **Fax = POST-MVP.** Acknowledged as a real channel in German medical cannabis; deferred. *Why:* email + chat carry the MVP; fax adds OCR + delivery infrastructure overhead that doesn't pay back for first release.
- **ERP (Isilocity, others) = POST-MVP.** No ERP read/write in MVP. *Why:* MVP is a standalone tool; ERP sync is a per-customer engineering project that should follow validated demand.

### Outputs

- **Deal confirmation = MVP, auto-generated at Confirmed state.** Sent via email to both parties; visible in-platform. *Why:* the moment both parties accept is the moment that needs an audit-quality artifact.
- **Purchase Order = MVP, auto-generated from Confirmed Deal Card.** Structured PDF + machine-readable. *Why:* PO is the procurement system's source of truth; auto-generation eliminates double entry. Exact format spec open in DEV-61.
- **Off-platform buyers receive a regular email only - no Hello Sello UI.** Email contains: deal table + PDF attachment + Hello Sello banner ad. Buyer replies via email; Sella ingests via the standard email pipeline (§2.2). *Why:* keeps MVP simple; the Deal Room presentation flow (Present surface) handles richer link-based interaction post-MVP. (Corrected 2026-05-22 - earlier draft incorrectly mixed in the post-MVP Deal Room link flow.)
- **No auto-connect on signup. Smart suggestions instead.** When an off-platform recipient later signs up, they see "X companies already have you in their records" and manually pick who to connect to. *Why:* explicit consent. Email is an asymmetric one-direction interaction; signup converts it into a real two-sided platform relationship. UX details tracked in DEV-63.
- **Deal Room shareable link = POST-MVP.** *Why:* tied to the Deal Room presentation surface on the Present page, which is itself post-MVP scope.

### Translation

- **DE↔EN chat translation in MVP via local models.** Translation happens on-device where possible; remote model only when needed. *Why:* token cost at scale would be prohibitive for chat-volume translation; local models give the cross-language UX without the bill.

### Non-goals for MVP

- **Fax processing, COA/COB content parsing, ERP sync, bulk CSV import, and programmatic API access** are explicitly out of scope for first release. *Why:* keeps the MVP scoped to the dominant channels (chat + email) and the proven workflow (human reviews Sella's pre-fill). Each non-goal becomes a post-launch initiative tied to customer demand.

---

## Build strategy (drafted 2026-05-23)

Project-wide decisions about HOW we build, not WHAT we build. These apply across all Layers and all Surfaces.

### Walkthrough locks 2026-05-23 - product build strategy

- **(2026-05-23) Two-layer build strategy: foundation broad, surfaces vertical, Sella cross-cutting.** Foundation = shared concepts every surface needs (User, Brand, Auth, Notifications, Permissions, Event/Activity stream). Designed broadly to fit all 7 surfaces; built minimally to serve Connect first. Surfaces (Connect, Present, Buy, Sell, Discover, Grow) = each is built fully end-to-end before moving to the next. Sella = cross-cutting concern (shows up inside every surface, like authentication or analytics); NOT a 7th sibling surface. *Why:* avoids both "design everything upfront" (slow, speculative) and "design only for Connect" (rework hell when next surface arrives). Foundation design is cheap because we design borders, not internals. Sella as cross-cutting matches how she actually appears in the product.

- **(2026-05-23) Per-surface file depth: Connect 100%, others sketch, Sella overview.** CONNECT.md = full depth (built first, deepest design). PRESENT.md, BUY.md, SELL.md, DISCOVER.md, GROW.md = one-page sketches (definition, users, owned objects, core flows, what it shares, Sella's role). SELLA.md = cross-cutting overview + per-surface touchpoints (her full behavior rules stay in LAYER-4). All surface files follow the same template. *Why:* enough cross-surface context to design DB/architecture without missing things; no wasted effort on surfaces we won't build for months.

### Architecture + tech-stack locks 2026-06-04 (Ayush + Claude session)

- **(2026-06-04) Code architecture = modular monolith (lite), domain-partitioned.** One deployable: Next.js (App Router, TypeScript) on Vercel + Supabase (Postgres, Auth, Realtime, Storage), multi-tenant via RLS. Code organized by domain under `src/modules/` (companies, connections, messaging, deals, catalog, sella), thin routing in `src/app/`, cross-cutting in `src/shared/` (auth, db, ui, utils, types); modules communicate only through each module's public `index.ts`. *Why:* concretizes the "foundation broad / surfaces vertical / Sella cross-cutting" build strategy above into a code structure. Domains are already crisp (the surfaces), surfaces get added over time, and two engineers can own modules in parallel without collisions - modular-by-domain avoids the technically-layered monolith's domain "smear" and avoids premature microservices. Governance kept light for MVP (folder discipline + optional lint rule on cross-module imports; no per-module DB, no enforcement tooling). *(Target structure documented in README; scaffolded into `src/` + `supabase/`. App code is built in this repo, `hello-sello-mvp`.)*
- **(2026-06-04) Sella inference = Claude on AWS Bedrock, EU/Frankfurt residency.** Major work (deal-card drafting, chat deal-detection) → Claude **Sonnet**; light work (document / price summarization) → Claude **Haiku**; Opus deferred. The `sella` module wraps the provider behind a swappable, provider-agnostic interface (model-per-job is a parameter). *Why:* EU data residency is required for the regulated German cannabis market (GDPR Art 32 + EU AI Act full enforcement Aug 2026). Bedrock gives EU-region hosting plus Mistral / multi-model optionality (matches the sovereign-AI angle) and AWS Activate startup credits. Sonnet leads on the structured tool-use Sella needs; Haiku is cheap for summaries. Fills the technology half of the open multi-Sella framework question (DEV-11). *(Verify the chosen Sonnet version is available in eu-central-1 / via cross-region inference before wiring.)*

---

## 2026-06-06 - Connect chat model + Deal card

Locked the Connect post-acceptance experience (Ayush + Claude session): the chat-type model, the connect→chat rollout, the Inbox variant, and the Deal card design + behaviour. Designed with the prototype skill (Inbox + Deal card prototypes, promoted to `prototypes/`).

### Connect chat model + rollout

- **Chat-type model = P2P / C2C / Deal Chat (three types).** P↔C is removed (folded into C2C). **C2C** = a company-level channel (the "Company" filter - messaging on behalf of your company, visible to the whole company). **P2P** = person-to-person. **Deal Chat** = the chat inside a deal workspace. *Why:* once a company is involved it is genuinely company-to-company; a cleaner 3-type model than the old P↔P / P↔C / C↔C split.
- **Connect→chat rollout = 4 inbound request types, all create C2C.** The 4 types: plain `connect` / `connect + message` / `price-list` request (buyer→supplier only) / `connect + deal-card`. **On accept: a C2C is created in all 4 cases** (Sella system message: "the two companies are now connected"). **A P2P also opens for the 3 substantive ones** (Sella system message: "[person] will be working with you"; the note or price-list seeds the P2P). For the deal-card type, the card lands in the P2P as a **deal draft** → on confirm ("start a deal") → the **Deal Workspace spawns** (= deal birth). *Why:* the company connection is the durable fact (always C2C); the working conversation is between people (P2P); the deal-card path gives a clean draft → confirm → workspace birth flow.
- **v1 scope = NO first-contact Sella.** The MVP pipeline is fully human - a person accepts and handles everything. "Sella replies on our behalf" is pitched as the next step, added only if time allows. *Why:* ship the human pipeline first and measure; Sella-on-our-behalf is an enhancement, not a launch dependency.
- **Connect sub-nav: drop "Companies", add "Relationship".** The Relationship tab = a list of connected companies + status; opens the same relationship page reachable from a chat's top bar. A "Deals" sub-nav tab is **undecided** - deals are currently reached via the relationship page. *Why:* "Companies" was a flat directory; "Relationship" carries the actual business state and is the real hub. **— SUPERSEDED 2026-06-07:** no Relationship/Deals sub-nav tabs; the page is reached from a P2P or C2C chat (see the 2026-06-07 entry below).

### Connect Inbox

- **Inbox = Variant A (shared inbox - master/detail + lenses) LOCKED.** Lenses: Unassigned / Mine / All / My-history; claim-or-admin-assign; collision cue = assignee avatar + "handled by X"; live viewing/typing presence deferred to v2. Variants B (one-at-a-time screening) and C (ops/bulk table) are parked for v2. *Why:* read-then-act fits a team that handles each connect-request with care, and it drops into the existing Connect 5-panel shell so later screens inherit the pattern.

### Deal card

- **Deal card = one `deal_card` entity with a `doc_type` discriminator.** The type = who authored it: a **PO card** (buyer→seller) or an **SO card** (seller→buyer) - "two card types under one entity". *Why:* a purchase order and a sales order are the same artifact authored from opposite sides; one entity + a discriminator avoids two near-duplicate tables.
- **Role-based views, no toggle.** The seller sees a **Margin** field; the buyer sees a placeholder metric (name TBD). *Why:* margin is seller-only commercial data; serving each role its own view (rather than a hideable field) keeps the buyer's app from ever receiving it.
- **Front = facts, back = SIGNALS (per-viewer).** The front holds deal facts; the back holds Choco-AI-style insights, generated per viewer. **Half-card = a pre-connection gate** shown in the inbox only; in the chat the card is **always full**. Products render as a **line-item list with a small square thumbnail** on the left (the thumbnail will later open that product's card - not built yet). Git-style version history. Flip control = top-left. *Why:* facts up front for fast reading, signals behind for the per-side intelligence; the half-card gates pre-connection while the full card is the working object once you are connected.
- **Deal card placement in chat = deal selector + pinned deal box.** A **deal selector** ("Talking about: [current deal]", defaults to the current deal) + a **pinned deal box** at the top of the chat → click → the card opens (flip / close). **Sella stays in the right panel** - no swap, no floating card. *Why:* keeps the active deal one click away without crowding Sella out of her panel.
- **Deal Workspace spawns at deal-card birth** (= the moment the deal-draft is confirmed). *Why:* the workspace is the deal's container; it should not exist before there is a confirmed deal to contain.

### Sella + scope

- **Sella = multiple AI workflows under one face.** The UI may show distinct "Sellas" wherever it fits; internally they are just workflows - so UI placement is unconstrained by an "only system voice" rule. *Why:* "Sella" is a single product persona over many workflows; the UI is free to surface her wherever she helps.
- **Deal Room = CUT** (removed from scope). "Open full page" now points to the **Deal Workspace**. *Why:* the Deal Workspace already is the full deal surface; a separate Deal Room duplicated it.

## 2026-06-06 - Phase-1 schema gaps resolved + company category

Validated the Phase-1 schema against the `phase-1-onboarding` prototype and a Phase-2/3 cross-check; resolved the last open build-questions and added one new requirement (Marcel).

### Phase-1 schema gaps (resolved)

- **B2 — HS-team allowlist = new `hs_team_member` table** (platform-level, no `company_id`; FK to `person`, role reviewer/admin; grant/revoke audited). *Why:* a privilege boolean on the user's own row risks self-escalation; a table is auditable + listable. Rejected `person.is_hs_team` and env-var.
- **B3 — domain-collision override = `company.metadata.domain_collision`** (sparse, HS-only review flag). *Why:* rare, review-only signal → JSONB metadata, not a column.
- **B4 — rejection reason = derived from `audit_log`** (latest `company.verify_rejected`); resubmit is auth-gated, reuses `company_license_file`. *Why:* single source of truth; no `rejection_reason` column, no token table.
- **Cleanups:** onboarding checklist = derive "done", store only `dismissed` (in `person.metadata`), "skipped" → future `analytics_event`; **superadmin = `person_group` only** (`is_superadmin` boolean dropped); contact tags = customer/supplier/partner/prospect/other (NULL = unclassified); **enums store the `code`, not the display label** (EN/DE translated in app). *Why:* don't store what you can derive; one source of truth; codes decouple from display text.

### Company business category (Marcel)

- **Companies pick one or more business categories at setup** — `company_type` lookup (cultivator / wholesaler / importer / pharmacy …) + `company_type_assignment` junction (multi-select). **A stable "what the business is" attribute, NOT a buy/sell role** (buyer/seller stays per-deal, driven by actions). *Why:* supply-chain category drives matching/discovery; vertically-integrated cannabis firms commonly hold several licences (→ multi-select); deliberately kept distinct from the locked "no buy/sell type on company".

### Open (next session)

- ~~**`pending_inbox_item` needs `request_type` + `assigned_to`** before it locks~~ → **RESOLVED 2026-06-06** (Ayush's 5 answers). Added `type` → new `inbox_request_type` lookup (seed: connect / connect_message / pricelist_request / deal_card); **one owner field** `assigned_to` + `assigned_by` provenance (NULL = picked up, set = assigned) — replaces `picked_up_by`; status lookup → `pending` / `accepted` / `rejected` (**`picked_up` retired** — "assigned" is derived from `assigned_to`, not a status); nullable `deal_card_id` FK set only for the `deal_card` type (CHECK-guarded); lenses (Unassigned / Mine / All / My-history) + reassign rules (claim if unassigned; owner-or-Superadmin to reassign; every (re)assign → `audit_log`) recorded in `SCHEMA-DRAFT`. *Why:* a lookup makes a new request type an INSERT not a migration; one owner field matches Zendesk / Front / Intercom; a real `deal_card_id` column (not a metadata link) keeps the reference from getting lost.

## 2026-06-06 - Path B (join-existing-company) deferral — engineering posture

Path B (a person joins an existing company → request routes to that company's Superadmin → approval grants membership) is **locked in design** (B1, 2026-05-29) but **deferred in build**: v0 ships Path A only (one user per company, seeded test IDs). Recorded so the deferral is deliberate and v0 doesn't paint us into a corner.

- **Deferring Path B is low-cost because it adds no new data shape or security state — it extends one v0 already has.** A `person` is born with `company_id = NULL` at signup; the gap between sign-in and company-setup is already a "logged-in but company-less" user. Path B just makes that gap last until a Superadmin approves instead of seconds. Same state, longer duration.
- **What's deferred is all additive:** the `join_request` table, the approval side-effect (set `company_id` + role + audit), and the Path B screens (existing-or-new / pick-company / waiting / admin-approval surface). None alter an existing table — a later `CREATE TABLE` breaks nothing. No migration penalty for waiting; v0 omits the `join_request` table.
- **Two invariants v0 MUST honor now (free — the onboarding window needs them anyway):** (1) `person.company_id` stays **nullable** and is read through **one accessor** (e.g. `currentCompany()`), never scattered — so the company-less case is a one-place fix later, not a 50-file hunt. (2) **RLS must fail safe on a null `company_id`** — a company-less user sees only their own rows, nothing tenant-scoped (equality policies like `company_id = my_company()` return nothing when null = the safe default). Get this right for onboarding and Path B's pending-joiner inherits it for free.
- **Open (unspecified, not blocking):** *where* a Superadmin reviews pending join requests is not yet designed — the data + routing default ("any Superadmin of target company", B1) are locked, but the UI surface (Settings → Team? notification? badge?) is not. The Connect inbox does NOT cover it (that's company↔company connections, a separate aggregate).
- **Tie-in:** the company-category step (above) is **Path-A-only** — a Path B joiner inherits the company's existing categories, so onboarding forks after "existing or new?" and the multi-select lives only on the new-company branch.

*Why:* the expensive design (separate `join_request` aggregate, nullable membership) is already done; the only retrofit risk is the security boundary + scattered `company_id` reads, both required by v0's own onboarding window — so honoring them now makes "add Path B later" a purely additive feature, not a schema/RLS refactor.

## 2026-06-06 (later) — Connect chat (screen ②): two-party deal gate + P2P↔Deal sync

Prototyped + locked in `prototypes/chat-prototype` (full narrative: that folder's `CONTEXT.md`). Builds on `## 2026-06-06 - Connect chat model + Deal card` above.

- **The chat screen is POST-ACCEPTANCE only.** The Pending/accept step lives in the **Inbox** (already built); this screen begins after accept. *Why:* one responsibility per screen — the Inbox owns accept/decline, the chat owns post-connection life; no duplicated accept logic.
- **Deal birth = a TWO-PARTY confirmation gate.** A deal-card → Sella posts `deal_detected` ("both of you, want me to draft it?"). **Both** parties must confirm → `workspace_created` + Deal chat spawns. **Either declines → the deal is cancelled and archived** (no workspace; they stay connected). *Why:* a deal is a mutual commitment; per-party votes (`null→yes/no`) let the audit log record who agreed and who killed it. Refines the earlier "on confirm → workspace spawns".
- **P2P↔Deal-chat sync = via the DEAL CARD, not messages.** **Deal chat = ground truth** (official, all participants); **P2P = where people actually talk** (private, mixed chatter). **Messages are never synced.** The **deal card is the single shared truth**, shown identically in both chats and **versioned** (v1→v2→…). *Why:* a clean bounded-context boundary — P2P is private, the company/Deal-chat shared, the deal card the published language between them; only a confirmed structured fact crosses.
- **On a deal-affecting change, Sella TAKES INPUT (does not author).** A *suggested* delta + **a note each user writes** (Sella = scribe). **Change from the P2P** → card v2 in both chats + a **per-user `deal_card_updated` system message into the Deal chat** (each note shown individually; everyone sees) + a `deal_card_log` entry + per-user `deal_change_input` evidence. **Change from the Deal chat** → card v2 + log + evidence, **no broadcast** (broadcast fires only when `origin != deal_chat`). *Why:* humans stay the authors of business intent; the system message is a projection of a log entry, so de-duping the broadcast costs one rule.
- **Deal-card LOG** lives on the **card back** behind a filter (`Signals | Logs`, extensible); records version / what / who / when / why; feeds the **audit log**. *Why:* the card back is a multi-view surface; the change history is also the audit trail (one source).
- **Deal card in chat = a thin pinned pill** (`Deal card ▸`, pink) on the `Talking about:` row → click opens the full **flip-card dialog** (front = facts + scrollable products reflecting the version; back = the Signals/Logs filter). *Why:* progressive disclosure — the header says "a deal lives here," detail is one click away.
- **C2C clarification (supersedes LAYER-1 §3):** C2C is a **company-level channel created at connection** (the company notice board / audit log), not deal-scoped. LAYER-1 §3 still describes the old "C↔C only inside a deal workspace" model and is **stale** — flagged for a docs pass.
- **Multi-deal in one P2P stays parked on [DEV-37](https://linear.app/hellosello/issue/DEV-37)** — explicitly out of scope for now.
## 2026-06-06 - UUID primary keys = v4 for now (revisit on PG18 / audit_log growth)

Keep the locked convention — PKs stay **v4** (`gen_random_uuid()`, native, zero-dependency). Considered UUID **v7** (time-ordered) for better index locality on append-heavy tables; researched + discussed, decided to wait.

- **Why not v7 now:** Supabase is on **PG17** with **no native `uuidv7()`** (PG18-only) and **no `pg_uuidv7` extension** available (checked the live project — only `uuid-ossp`). v7 today would need a hand-rolled PL/pgSQL function or fragile app-side generation — not worth it at current scale.
- **Why staying on v4 is safe:** v4's index fragmentation only bites **large, high-write** tables (millions of rows + sustained inserts) — i.e. only `audit_log` here; low-volume tables (company / person / group / …) never feel it. v0 is 1–2 test users.
- **Switching later is cheap — NOT a re-key:** v4 and v7 are the same `uuid` type, so adopting v7 = changing a column's **default** for new rows (one line); old rows stay v4, mixing is fine, and it "stops the bleeding" for inserts going forward. The expensive full re-key (rewrite old rows + every FK) is "almost never worth it" and we'd skip it. *(Corrects an earlier overstatement that switching later meant a painful FK re-key.)*
- **Revisit triggers:** (1) Supabase ships native `uuidv7()` (PG18) → `SET DEFAULT uuidv7()` on new / high-write tables; (2) `audit_log` crosses ~1–5M rows → flip its default to v7 then (captures ~all the benefit, since it only grows).

*Why record:* makes the v4 choice deliberate (researched, not default-by-omission) and stops it being re-litigated; documents the cheap upgrade path. No convention change (staying = status quo) → no Ayush ack needed. (Sources: andyatkinson "Avoid UUIDv4 PKs", Scaling Postgres #368, dev.to "UUIDv7 is the 2026 default" + "UUID best practices".)

## 2026-06-07 — Relationship page (screen ③): nav, content, layout

Prototyped + locked in `prototypes/relationship-prototype` (full narrative: that folder's `CONTEXT.md`). The Relationship page is the persistent record between two companies — "the heart of the platform."

- **Reached from a chat, not a tab — one page, two doors.** The page opens from a **P2P** or a **C2C** chat; both land on the **same company↔company page**. **There is no person-level relationship page** — *this answers DEV-8's never-closed sub-question: there is none.* *Why:* a relationship exists with a person or a company, so you reach it through whoever you're already talking to — the chat is the index, the page is the detail. A flat "all relationships" list/filter is **future**.
- **No `Relationship` and no `Deals` sub-nav tabs** — **supersedes the 2026-06-06 "drop Companies, add Relationship" line above.** Deals live *inside* the relationship page; a cross-company Deals surface moves to a **future Grow/Trade** surface.
- **Two altitudes (the organizing rule).** Relationship-level content lives on the page (header, Sella insight, analytics, log, notes, terms, pricelist, artifacts); deal-level content lives on the deal card / inside the deal (per-deal SIGNALS, per-deal docs). One question — *relationship or one deal?* — decides where everything goes. *Why:* keeps a rich page from becoming a junk drawer; it's also what made the tabbed layout possible (stable top band + zoomed-in tabs).
- **Layout = tabbed.** Top band = header (the two company logos joined by a bridge mark — **no person names**, it's a company connection) + **Sella insight** and **Analytics** side by side; below, tabs: Overview · Deals · Notes · Terms & prices · Docs.
- **Deals = progressive disclosure, not an inline dump.** A peek on Overview + a **Deals tab** filterable `All / Active / Old / Cancelled` → each deal → its Deal Workspace.
- **Two kinds of note, both kept (different jobs):** a per-side **team note** (business, visible to your own company — "their next batch lands in ~4 months") and a per-user **personal note** (private to you, relationship upkeep — "their kid's birthday is in 4 days"). Resolves "which box?" by purpose.
- **Artifacts = shared company-wide documents** on the page (licenses, contracts, certs). **Deal-wise docs (COAs, badges) stay inside the deal** — the two-altitudes rule applied to documents.
- **Custom pricelist:** both sides read; **seller writes, gated by approval** (Proposed → sign-off → Applied, per DEV-41). **Agreed terms** visible to both sides (edit workflow deferred).
- **Box → dialog pattern.** The Sella insight and Analytics boxes show an overview + a "more" button that opens a **dialog with a blurred backdrop** (open → read → close). Sella dialog = what's-happening + how-to-grow (action cards); Analytics dialog = KPIs + bar charts + a pie. *Why:* keep the page calm, push depth one tap away — the same progressive-disclosure grammar used by the deal-card pill and the deals list.
- **Side-aware (a per-viewer projection):** per-side team notes hide across the boundary, PRIVATE deals hide from the other side, only the seller edits the pricelist. `note.side` + `note.scope` + `deal.private` drive it.
- **Deferred:** first-contact document collection (the old "pending inbox migrates onto the page" flow — built on the retired P↔C type); if built later it lives in the **Inbox**, and its docs land in **Artifacts**. Agreed-terms edit + multi-approver pricelist sign-off (per DEV-41).

*Why record:* screen ③ is the third Connect atom locked; this fixes the sub-nav model (correcting :518) and closes DEV-8's person↔person question. (Source: `prototypes/relationship-prototype/CONTEXT.md`.)

## 2026-06-07 — Phase 2 schema: deal_line_item, deal_card columns, deal_delivery separation

*(Discussed session 5. Full table shapes in `docs/architecture/SCHEMA-DRAFT.md` → "Phase 2 tables" section.)*

- **`deal_line_item` versioning = Option A (versioned snapshots, not mutable + diff-replay).** Each version bump of `deal_card` copies all line items with the new `version` number. Unchanged lines are duplicated; changed/added lines are new rows at the new version. Query current = `WHERE version = card.version`; reconstruct v1 = `WHERE version = 1`. *Why:* regulated industry (cannabis pharma) needs read-only historical snapshots — any diff-replay bug would corrupt audit reconstruction, which is unacceptable when a dispute arises. The cost (a few extra rows at ~3–15 line items × ~5–10 versions per deal) is negligible. Industry norm: Stripe freezes invoice line items per version; every B2B order system treats historical line items as immutable snapshots.

- **`deal_card` gets structured delivery/commercial columns — not metadata.** Added as first-class columns: `offer_expires_at` (B2B quotes always expire; Sella monitors), `delivery_date_target` (buyers filter + sort by it), `payment_terms_code` (NET30/NET60/COD — cannabis pharma uses 40–90 day windows, already noted as domain fact; lookup table), `incoterms_code` (EXW/DAP/DDP — determines who pays shipping/insurance in cross-border cannabis trade; lookup table). Also: `buyer_po_number`, `seller_so_number` (generated at confirmation per Layer 3 lock). *Why first-class over metadata:* columns that are filtered, sorted, or validated by Sella/app-layer policy earn a column; display-only or shape-unknown fields stay in `metadata JSONB`. Country of origin stays in `metadata` for now (not filtered in MVP).

- **`deal_line_item` gets cannabis-specific potency columns: `thc_percent`, `cbd_percent` (nullable).** *Why first-class:* regulatory-grade fields — Sella validates potency against license thresholds; buyers filter by potency range. These are not decorative metadata; they have invariants and will be queried. Nullable because non-cannabis products (material suppliers, Phase 2+) carry neither.

- **`deal_delivery` is a separate table, NOT part of `deal_line_item`.** `deal_line_item` answers *"what was agreed"* (versioned, immutable per version). `deal_delivery` (Phase 3, DEV-36) will answer *"what was shipped"* — batch numbers, Certificate of Analysis files, actual delivered quantities, delivery note + invoice uploads (Sella OCR amends the deal). One deal can have N deliveries (DEV-53 — "Done fires on final pair"). *Why the separation:* mixing "agreed terms" with "physical execution" in one table forces nullable columns on both sides and breaks the single-responsibility of line items as a versioned commercial record.

- **`relationship` canonical ordering: `CHECK(company_a_id < company_b_id)` + `UNIQUE(company_a_id, company_b_id)`.** Enforces exactly one `relationship` row per company pair regardless of who initiated. `initiated_by_company_id` records direction. *Why:* without canonical ordering, Company A↔B and Company B↔A are indistinguishable to the DB; the check + unique constraint makes the pair an unordered set at the storage layer while preserving direction in a separate column.

## 2026-06-07 — Q3: Two-party confirmation state = dedicated `deal_confirmation` table

Per-party yes/no for deal birth and amendments lives in a dedicated `deal_confirmation` table, not JSONB on `deal_card`. `deal_card.status` gains `'withdrawn'` as a terminal state.

- **`deal_confirmation` table:** one row per `(deal_card_id, version, company_id)`. Status: `pending` / `confirmed` / `rejected`. Two rows created when a version is proposed; each party updates their own row. Both `confirmed` → version accepted (workspace spawns on v1; version bumps on amendments). Either `rejected` → back to negotiation.
- **`withdrawn` on `deal_card.status`:** the initiating company pulls the offer back before the other party has responded (`deal_confirmation.status` still `pending`). Terminal. App-layer enforces: only `initiating_company_id` may set it, only while other party is pending.
- **Why a table over JSONB:** JSONB stores only current state — you lose "when did company_b change to confirmed" without a separate audit table, defeating the point. The `deal_confirmation` table gives indexed queries ("deals awaiting my company's confirmation"), per-event timestamps, a natural `audit_log` target, and clean versioning across amendments. Regulated environments (cannabis pharma) require per-event non-repudiation — a table is the natural fit.

*Full table shape in `docs/architecture/SCHEMA-DRAFT.md` → `deal_confirmation`.*

## 2026-06-07 — chat_thread P2P uniqueness: canonical ordering enforced at DB level (Q2)

`chat_thread` P2P threads store `person_a_id` + `person_b_id`. Without a rule, the same two people could get two thread rows if inserted in different order `(Alice, Bob)` vs `(Bob, Alice)` — the UNIQUE index alone doesn't catch this.

**Decision:** enforce `CHECK (person_a_id < person_b_id)` at DB level. App must sort the two person UUIDs before inserting — smaller UUID goes in `person_a_id`. Identical pattern to `relationship.company_a_id < company_b_id` (already locked).

*Why DB level, not just app:* the DB is the last line of defense — edge functions, scripts, and future code paths bypass the app. One bad insert = a duplicate private thread with split message history.

*Why this pattern works:* UUIDs are strings; `<` comparison is deterministic. The canonical ordering is arbitrary but consistent — what matters is there is exactly one rule, enforced everywhere.

**SCHEMA-DRAFT.md updated:** `chat_thread` constraints block now includes `CHECK (type != 'p2p' OR person_a_id < person_b_id)`.

## 2026-06-07 — Deal Workspace (screen ④): contents + layout (resolves DEV-9)

Prototyped + locked in `prototypes/deal-workspace-prototype` (full narrative: that folder's `CONTEXT.md`). The Deal Workspace is the deal **container** - **Layer B (invited participants only)**, auto-scaffolded at Deal Card birth. This closes the open **[DEV-9]** ("what's inside a deal workspace + how should it look").

- **Two entry points:** the Relationship page's deals list ("Open workspace →") and a **⤢ button on the Deal Card** itself. Inside, the card lives **in the deal chat** (a pinned pill), not as a separate box.
- **Layout = an A&C mix** (after comparing 3 layouts): header + a **shrunk one-line Deal-Sella** on top; **left = a tabbed panel** `Things · People · Documents`; **right = the Deal Chat as the wide hero**. *Why:* the workspace is an *operating* surface (work THINGS while watching the chat), so the chat leads - whereas the relationship page (③) is a *reading* surface, which is why its calm tabbed layout won there. The surface's job picks the layout.
- **The Deal Card is the canonical flip card everywhere** - the pinned `Deal card ▸` pill opens the same card as ①/② (FRONT = facts + products, margin seller-only; BACK = `Signals | Logs` filter). No workspace-special card.
- **Change history lives in the card's LOGS, not as chat messages.** Removed the "card amended to v2…" status line + in-chat update messages. *Why:* one source of truth for change history (the card log) - a chat copy would be a second source that drifts; same instinct as ②'s "only the card is synced."
- **THINGS are the visible work primitive, grouped by domain** (Finance / Logistics / Delivery), with a done-count + progress; any party adds; Open→Done; **approval THINGS = e-signature** (the Draft confirmation gate, both sides). **Stages are NOT a UI element** (scaffolding only - reaffirms DEV-24/34).
- **Lifecycle Draft → Confirmed → Done.** Draft = the e-sign confirmation gate (+ per-party `deal_confirmation`); **Done = delivery note + invoice both attached** (document-driven, no explicit Done click; Deal-Sella OCR-amends the card to actuals).
- **Documents are DEAL-level** (COA, contract, delivery note, invoice). Company-wide docs stay on the Relationship page (the two-altitudes rule).
- **Deal-Sella** is per-deal, **neutral**, one read; it speaks in the deal chat. **Side-aware:** margin seller-only, "(you)" + topbar follow the side.
- **Deal Room is OUT of screen ④** - it's the customer-*presentation* surface (product media, Loom, share link), a **Present-surface** tool distinct from the *execution* container. *Resolves the doc-vs-Linear divergence:* CLAUDE.md "Deal Room = CUT" vs Linear DEV-22/52 "Deal Room live & distinct" → the truth is **out of Connect ④, lives in Present**.

*Why record:* screen ④ is the **last Connect atom** locked; this closes DEV-9 and triggers the LAYER docs reconciliation pass (§3 / §4.1 / §4.3 / §4.4 + LAYER-3). (Source: `prototypes/deal-workspace-prototype/CONTEXT.md`.)

## 2026-06-07 — Phase 2 schema: 3 screen ③ tables locked (`relationship_note` / `_term` / `_artifact`)

Ayush's screen ③ lock + PR #39 merge unblocked the three Relationship-page tables. Walked through one at a time, research-first; reshaped his `note` / `agreed_term` / `artifact` sketches against schema conventions.

- **`relationship_note` — one table + `scope` column (`team` / `personal`).** Both kinds of note (team-visible business notes + personal relationship-upkeep notes) live in one table with a discriminator. *Why not two tables:* same fields either way (body, author, timestamp, FK to relationship); two tables = duplicated audit columns, duplicated RLS rules, duplicated query paths, for zero gain. One table + `scope` is the Salesforce/HubSpot pattern. *Personal scope = strictly author-only* — even teammates and Superadmins do NOT see another person's personal notes; matches the word "personal" and prevents self-censorship. Cost: if someone leaves, their personal notes are lost to the company — accepted (loosening later is additive; tightening would break trust).

- **`relationship_term` — proposal/accept flow with controlled vocabulary.** Standing agreed terms (payment terms, incoterms, MOQ, exclusivity, delivery lead time) live in `relationship_term` with a `pending` → `accepted` / `rejected` state machine mirroring `deal_confirmation`. One side proposes a row; the other side accepts (becomes in-force) or rejects. To change later, propose a new row; on accept, the old in-force row gets `superseded_at = NOW()` and `superseded_by_id = new.id`. *Why proposal/accept over either-side-edits-freely:* regulated industry — silent term changes ("wait, who changed our payment terms?") = real money. Audit log catches abuse after the fact, but a gate prevents it. *Why not pure key/value (Ayush's `agreed_term { key, value }` sketch):* EAV anti-pattern (Postgres community flags it strongly — typos become data, ugly queries, no per-type validation). **Mitigation:** new `agreed_term_type` lookup controls the key space — 5 seeds (`payment_terms`, `incoterms`, `min_order_qty`, `delivery_lead_time_days`, `exclusivity`) + `value_format` hint (`enum`/`number`/`text`/`boolean`) to drive UI. New term type = INSERT into lookup, no migration. *Not redundant with `deal_card.payment_terms_code` / `incoterms_code`:* the relationship-level row is the **standing agreement** (currently in force, mutable); the deal_card columns are a **frozen snapshot** of what was agreed for that specific deal — must stay independent so changing the standing agreement doesn't silently rewrite past deals. Same pattern as `pricelist` → `deal_line_item.unit_price` snapshot.

- **`relationship_artifact` — file metadata table; bytes in Supabase Storage.** Clones the `company_license_file` pattern (A3 lock 2026-05-28) — `storage_path` + scan_status + magic-byte validation; bytes live in a private bucket with RLS on `storage.objects`. New `artifact_category` lookup with 5 seeds (`contract`, `nda`, `certificate`, `marketing`, `other`) for grouping. *Visibility:* both sides of the relationship can READ (relationship-scoped = shared by definition); only the `uploaded_by_company_id` side can edit / soft-delete. No `personal` scope here — these are organizational documents. *v0 file constraints:* MIME allowlist = `application/pdf` only (contracts get exported to PDF anyway; keeps upload surface tight for security); size cap = 20 MB. Expand later if Marcel asks. *Deal docs (COA, contract for this deal) do NOT live here* — they live on the deal; this is the two-altitudes rule applied to documents (per screen ③ lock 2026-06-07 above).

- **Lookup rename: `license_scan_status` → `file_scan_status`.** The pending/clean/infected/scan_error values aren't license-specific — they're generic file-scan outcomes. Renamed now while it's free (no migrations written yet) so `company_license_file`, `relationship_artifact`, and the future `pricelist` table all reference one lookup.

- **`audit_log` seeds added (6 new action types + 3 new content types).** Action types: `relationship_term.proposed` / `.accepted` / `.rejected` + `relationship_artifact.uploaded` / `.downloaded` / `.deleted`. Content types: `relationship_note`, `relationship_term`, `relationship_artifact`. *Why upfront:* audit_log seeds are the same kind of work as schema seeds — easier to ship together than backfill later.

- **Deferred this session:**
  - **`buyer_metric` column rename on `deal_line_item`** — still TBD. Column ships as `buyer_metric` placeholder in the migration; rename later is a single `ALTER COLUMN`.
  - **`pricelist` table shape** — pending Marcel on PDF vs CSV vs structured. MVP scope confirmed: **one standard company-wide pricelist** (relationship-level custom pricelist + DEV-41 Proposed→Applied sign-off deferred post-v0). Researched B2B pricing patterns (Red Gate, BetterCommerce); concluded versioning isn't needed for MVP because `deal_line_item` already snapshots prices at deal time — the deal keeps its own receipt, so the pricelist table doesn't need to.

*Why record:* closes 3 of the 5 Phase 2 open schema questions (`relationship_note`, `relationship_term`, `relationship_artifact`) and absorbs the lookup-rename housekeeping into the canonical record. With these locked, the only remaining blockers before writing Phase 1 + Phase 2 migrations together are Marcel's pricelist format decision + the `buyer_metric` name (non-blocking — placeholder ships in v0). *Full table shapes in `docs/architecture/SCHEMA-DRAFT.md` → Phase 2 tables.*
