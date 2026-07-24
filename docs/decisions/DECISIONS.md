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
- **Local-first DB development (2026-06-16).** Build + test every schema / RLS / migration change on the local Supabase stack first (`supabase db reset` to verify it builds from committed files), then apply to cloud — no direct-to-cloud MCP apply without a committed migration. *Why:* exactly the discipline that prevents F3-style migration drift (objects live on cloud but missing from the `.sql` files).
- **GSD drives Muskan's planning/execution; `.planning/` = execution state, `docs/` = source of truth (2026-06-16).** GSD's gitignored, per-engineer `.planning/` (PROJECT/REQUIREMENTS/ROADMAP/STATE) holds execution state only; durable knowledge (decisions, architecture, domain) still flows to `docs/` via the wrap ritual; GSD files point to `AGENTS.md` + `docs/`. *Why:* one source of truth, no redundancy between the two systems.
- **Schema drift gate bypassed for local-verified + cloud-deferred phases (2026-06-17).** When a phase's `supabase db reset` is GREEN locally and cloud apply is explicitly deferred (documented in a deploy ledger), the `GSD_SKIP_SCHEMA_CHECK=true` bypass is correct — the gate's false-positive risk (TypeScript types come from config, not the live DB) is already mitigated by the clean reset. *Why:* same pattern established in Phase 2; Phase 3 confirms it as the standard across phases where cloud push is gated behind policy reconciliation.
- **Onboarding-ready milestone = 8-phase GSD roadmap; Buy (DEV-77) + Sell→Allocate (DEV-76) deferred (2026-06-16).** Harden + UX Auth·Onboarding·Admin-verify·Discover·Present for real-world testing (test boundary = full deal loop to Done, joint w/ Ayush); Marcel's DEV-78/81/80/79/70/69/68 folded in as the UX phase; DEV-77/76, though Marcel-assigned to Muskan, deferred to a follow-up milestone. *Why:* sellable-first — onboard real companies on the built surfaces before expanding surface area.
- **Exclude Buy (Phase 18) from the `main` update; leave Allocate in place (2026-07-16).** Buy was rushed/prototype-quality (Muskan's call) — stripped its app code, e2e specs, and migration from the branch merged to `main`, nav restored to `state: "soon"`. Allocate, built in the same rushed window, was left alone: it had already shipped to `main` on 2026-07-07 with a deployed migration, and the Sales Calendar already depends on its `statusOf()` helper — reverting it is separate, costlier surgery than simply not merging further Buy work. *Why:* draw the "ready to ship" line by what's actually solid in production today, not by when the code was written.
- **Orphaned production tables get a cleanup migration, not left as drift (2026-07-16).** Buy's `buyer_resale_price` + `purchase_history_import` tables had already been applied to production independently of the git migration file; both were confirmed empty with zero audit_log references before being dropped via a new migration. *Why:* migrations in git should be the single source of truth for schema — orphaned tables with no matching file are exactly the F3-style drift the team has been burned by before.

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

- **(2026-06-19) Multi-user-per-company + Path B exercised now — pulled forward from post-v0 (supersedes the 2026-05-25 "v0 = one user per company" timing).** The Onboarding-Ready milestone now builds the full multi-user surface: company roles (Superadmin + team) wired to active permission-matrix checks, colleague invites with role assignment + clean deactivation (kills sessions), and Path B (join-existing-company) fully exercised — the onboarding "do you have a company?" fork, request-to-join, the company-Superadmin approval queue, and the pending/no-company-yet state. The Path A/B *design* locked 2026-05-25 is unchanged; only its timing moves to the current milestone. *Why:* "user-ready now" — real companies bring colleagues and join existing companies from day one; the schema (`join_request`, `person_group`, nullable `company_id` invariants) already exists, so this is activation, not redesign. Roadmap: Phases 9–13 (Track A landing/legal + Track B foundations); see `.planning/ROADMAP.md` and `docs/research/platform-foundations-research.md`.

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

## 2026-06-07 (session 8) — Phase 2 schema: 4 screen ④ tables locked (`deal_workspace` / `deal_member` / `thing` / `deal_artifact`)

Ayush's screen ④ lock + PR #40 merge unblocked the four Deal-Workspace tables. Walked through one at a time, research-first; reshaped his `deal_workspace` / `member` / `thing` / `artifact` sketches against schema conventions.

- **`deal_workspace` — separate container table (Option B), not columns on `deal_card`.** The workspace is the **Layer B invited-only container**; the card is the **cross-company versioned agreement**. Two altitudes, two tables. *Why separate over adding columns to `deal_card`:* Salesforce/HubSpot conflate workspace-into-deal because their deal lives in ONE org's CRM — Hello-Sello's deal is **shared state across two companies** + **versioned** + **regulated-industry audit-grade**. Container concerns (owner, privacy, membership) don't belong on the agreement record — they'd pollute `deal_card_log`, force awkward versioning questions (does owner-change bump card version?), and conflate "what we agreed" with "who can see/work on it." Separate workspace stays semantically pure + future-proofs DEV-37 (multi-deal-per-workspace, parked but realistic v1) at near-zero cost (one extra row + one JOIN). 1:1 with `deal_card` in v0.

- **Visibility model flipped — `company_wide` is the new default; supersedes ARCHITECTURE-NOTES line 54 "always invited-only" two-layer-independent model.** New `workspace_visibility` lookup (`company_wide` / `private`). Default `company_wide` = deal listed on Relationship deals page (Layer A) AND workspace contents are **visible + actionable** to both companies' employees. `private` collapses both — deal hidden from Layer A listing AND workspace contents restricted to active `deal_member` rows only. *Why one flag drives both layers (not two independent layers):* simpler mental model, matches industry default (Salesforce/HubSpot opportunity is visible to whole org by default + sharing rules tighten), `deal_member` becomes lighter (organizing list in default mode; access gate only in private mode), and the user explicitly accepted that strict-hide RLS can be added later if a need emerges. **Memory note `project_deal_visibility_two_layers.md` is now stale** — flagged for review.

- **3-layer owner-handoff enforcement (defense-in-depth).** Owner can be handed off **within the same company only** (Kim → Marcel, both seller; cross-company is blocked). Enforced at 3 layers: (1) **RLS** UPDATE policy — only current owner can change the column; (2) **DB trigger** `enforce_owner_same_company` BEFORE UPDATE OF `owner_person_id` — new owner's company_id must equal old owner's company_id; (3) **app-layer** validation in the workspace update API for user-friendly error messages. *Why all three over app-layer-only:* this is **the** trust boundary in our cross-company model; regulated-industry compliance + a single code bug shouldn't break it. Industry consensus (Postgres docs + Supabase + OWASP Multi-Tenant) for security-critical cross-table invariants is **both layers, not either/or**. The same 3-layer enforcement extends to `deal_member.role='side_lead'` handoff.

- **Workspace audit goes to `audit_log` (NOT `deal_card_log`) — A2 lock.** Owner change, privacy toggle, member add/remove are **container** events, not agreement amendments. Putting them in `deal_card_log` would pollute version history, force fake `version` values on container changes, and trigger spurious "deal updated" chat broadcasts. *Why:* same "altitudes" rule we applied to the workspace-vs-card split; container concerns ride the compliance-grade `audit_log` (cross-system event journal), agreement amendments ride the deal-scoped `deal_card_log`. New `auditable_content_type` codes added: `deal_workspace`, `deal_member`, `thing`, `deal_artifact`.

- **`deal_member` — junction with three-role enum (`owner` / `side_lead` / `member`); each side controls own-side member adds.** v0 deferred: `access_level` column (read-only/observer pattern not needed yet). Workspace birth auto-inserts 2 rows: initiating dealmaker as `owner`, counterparty dealmaker as `side_lead`. *Why three roles (vs flat membership + owner_person_id only):* the cross-company shape means the OTHER side also needs a "lead" who can add their own teammates — owner alone can't add buyer-side logistics person without violating side-sovereignty. Side_lead is that role. Plain `member` has no add permission. *Why owner stays as `member` after handoff (not removed):* she's still a colleague who knows the deal — explicit removal is a separate action. Sync invariant: `deal_member.role='owner'` person_id must equal `deal_workspace.owner_person_id` (maintained app-layer + cascaded by the same trigger that enforces the 3-layer same-company rule).

- **`thing` — single table with `type` discriminator (Asana subtype pattern).** Type enum: `task` / `approval` / `document_upload`. Two nullable FKs link `approval` things → `deal_confirmation` rows and `document_upload` things → `deal_artifact` rows (real FK integrity, no polymorphic anti-pattern). Status v0 = `open` / `done` only. **Stages = scaffolding only** (NULL FK to `deal_stage` lookup; seeds TBD per DEV-24/34) — they group THINGS + set default assignees but are NOT a UI element (reaffirms DEV-24/34). Behavioral rules in app-layer: both `deal_confirmation` rows for a version → `confirmed` auto-marks linked approval THINGS done; new `deal_artifact` upload auto-marks linked document_upload THING done. *Why single table over per-type tables:* Asana's `resource_subtype` pattern — same base behavior (title, status, assignee, completion), different rendering by type. Per-type tables would duplicate audit columns, RLS rules, and assignee logic for no gain. Custom type-specific data lives in `metadata JSONB` (signature method, file hints).

- **`deal_artifact` — clones `relationship_artifact` Storage pattern; 9 category seeds; PDF-only v0; app-layer done-flip.** Categories: `delivery_note`, `invoice`, `proforma_invoice`, `contract`, `co_a` (Certificate of Analysis), `packing_list`, `certificate_of_origin`, `phytosanitary_cert`, `other`. *Why these 9 (not just the prototype's 4):* EU regulated cannabis B2B requires phytosanitary_cert (plant-import for hemp), certificate_of_origin (customs/tariff), packing_list (customs match), proforma_invoice (pre-deal financing). Lookup INSERT extends later at zero migration cost. Allow multiple per category (soft-delete + reupload pattern for corrections; UI shows latest). PDF-only + 20 MB cap (matches `relationship_artifact`).

- **`done`-flip lifecycle trigger lives in app-layer Edge Function — NOT DB trigger.** When `delivery_note` + `invoice` artifacts both present (non-deleted) on the workspace AND `deal_card.status = 'confirmed'`, the upload Edge Function flips `deal_card.status` → `done`. New `done` value added to `deal_card_status` lookup. *Why app-layer over DB trigger* (the opposite call from the owner-handoff 3-layer decision): this is **correctness logic, not a security/trust boundary**. Single write path (one Edge Function), better debuggability (visible trace logs vs hidden trigger), no per-write overhead (trigger would fire on every artifact write — contracts, CoAs — just to check if it's delivery_note/invoice), reversible if rule changes (Phase 3 multi-delivery: "all deliveries have both"). Different rule for different concerns: owner-handoff = defense-in-depth (security); done-flip = domain state computation (correctness). Industry treats these differently (Postgres docs + the Status Machina state-machine pattern). Belt-and-suspenders DB trigger can be added later if support sees drift.

- **`deal_workspace` + `thing` promoted from Phase 3 to Phase 2.** `deal_room` (customer-presentation surface) stays Phase 3 — Connect ④ is execution-container only.

- **Pricelist scope (re-clarified 2026-06-07 session 8 after Marcel's WhatsApp updates):** Marcel sent updated info confirming **(a)** structured rows in DB + CSV blueprint (input) + manual entry; PDF dropped; **(b)** relationship-level **custom pricelist** to override the company-wide default IS conceptually needed but explicitly **deferred post-v0** (Marcel: *"we are not doing this in v0"*); **(c)** he added a "Pricelist" spreadsheet to Drive with proposed columns + flagged the multi-pricelist case for UX review. v0 scope re-confirmed: **one standard company-wide pricelist** + DEV-41 Proposed→Applied workflow build deferred (the DEV-41 *decision* is locked 2026-05-20 — single-approver MVP — but the *implementation* sits behind v0). Exact column list pending — read Marcel's Drive blueprint next session.

*Why record:* closes the 4 Phase 2 open schema questions for screen ④ (`deal_workspace`, `deal_member`, `thing`, `deal_artifact`). With these locked, the only remaining open items before writing Phase 1 + Phase 2 migrations are (1) the pricelist column list (Marcel's blueprint pending) and (2) the `buyer_metric` rename (non-blocking — placeholder ships v0). Visibility model flip is the load-bearing change here: it simplifies RLS, aligns with industry default, and supersedes the old two-layer-independent ARCHITECTURE-NOTES line 54. *Full table shapes in `docs/architecture/SCHEMA-DRAFT.md` → Phase 2 tables.*

## 2026-06-07 (session 9) — Phase 2 schema review: stage-over-domain, workspace-at-Draft, DEV-37 correction, log-everything

Holistic review of all 15 Phase 2 tables before writing migrations (checks R1–R6 + O6). PRD (`docs/PRD/`) is the source of truth; reconciled the session-8 schema against it.

- **`thing` groups by `stage`, not `domain` — `domain` dropped.** The PRD organizes deal work by a 5-stage pipeline, never by domain. Session 8 had carried both a `domain` column (finance/logistics/delivery) and an empty `stage` — two grouping columns for one job. Resolution: keep `stage` (now NOT NULL, the real grouping), drop `domain` + `thing_domain` lookup. *Why:* one grouping concept, not two; the PRD's pipeline is the canonical organizer. (The review's earlier R3 instinct — "carry one grouping column, not two" — held; only the surviving column flipped once the PRD's stage definition replaced the stale DEV-31 "stages = finance/logistics/delivery".) The screen-④ prototype's domain-grouping is a superseded name-mismatch; PRD wins.

- **`deal_stage` seeds locked (Ayush's research, DEV-24/34):** `negotiation` · `compliance_quality` · `agreement` · `payment` · `fulfilment_delivery` (sort 1–5). Status flips Draft→Confirmed at stage 3 (`agreement`); stages 4–5 are post-confirmation (Phase 3).

- **Stages are now a visible UI element — supersedes DEV-24/34 "stages = invisible scaffolding".** The PRD shows the pipeline across the top of the workspace. *Why recorded:* a prior locked decision is reversed by the PRD; docs must agree.

- **Deal Workspace + deal chat are born at Draft (resolves O6).** Negotiation happens inside the deal chat before confirmation, so the container must exist at Draft. Already consistent with session 8 ("auto-created at deal_card birth"); only the stale `deal_card.thread_id` note ("set when both confirm") was corrected to "set at Draft".

- **DEV-37 correction — it's chat-organization, NOT workspace structure.** Session 8 misread DEV-37 as "multi-deal-per-workspace, relax the 1:1 later". The actual Linear issue (verified) is "create organized chat windows and logs for multiple deals" (a P2P/c2c chat concern, Chat project). Workspace↔deal is a **permanent 1:1**, not a v0 simplification. Removed the "relaxes later" language + the false rationale from the session-8 `deal_workspace` decision (the separate-table decision itself stands on its real reasons — container vs versioned-agreement separation).

- **Audit: log everything from day one.** Comprehensive audit logging is mandatory in the first build (not "added per feature as they ship"). Full action-verb vocabulary seeded up front. *Why:* regulated industry; a missed event is unrecoverable, while an over-logged one is filterable (every action carries a `category`).

- **Deal visibility moves in lockstep.** A deal's chat, to-dos, and documents all follow that deal's `workspace_visibility` flag (company_wide default / private = invited-only). Explicit RLS rule written for `thing` + the deal `chat_thread` (was unstated). Applies to the deal thread only; c2c/p2p threads keep their own scope.

- **Migration notes (R6):** soft-cycle FKs (`chat_thread.deal_card_id` ↔ `deal_card.thread_id`) created post-table via ALTER; `deal_line_item.product_id` ships as nullable UUID without FK constraint until `catalog_product`/`product` lands in Phase 3.

*Net schema change from the whole review: one column swap on `thing` (drop `domain`, require `stage`) + two stale-note fixes. No structural churn — the session-7/8 tables held up. Source of truth = PRD (`docs/PRD/`).*

## 2026-06-07 (session 10) — Phase 2 schema: Product Catalog & Pricelist tables (from Marcel's blueprint CSVs)

Designed the last open Phase-2 schema item from Marcel's two blueprint CSVs (`docs/product/blueprint/`), research-first (cannabis seed-to-sale + Certificate-of-Analysis practice). 7 tables + 4 lookups.

- **One product → many batches; label value ≠ measured value.** `product` carries the **label/advertised** cannabinoids (the "28" in "STR 28/1"); `product_batch` carries the **measured** CoA values per lot. *Why split:* cannabis is a plant — every batch varies in THC/CBD/terpenes even for the same cultivar (industry research: lab results deviate up to ~50% off label; Canada forces a single label value per batch that the plant doesn't actually honor). This is exactly why Marcel's CSV shows THC twice on the product *and* again on the batch. A flat single-level "product" would either lie about potency or lose lot traceability.

- **Terpenes = lookup + child table, not fixed columns.** `terpene` (controlled vocab, 23 seeds from the CSV reference list) + `batch_terpene` (one row per terpene per batch). *Why over the CSV's "Terpene #1/#2/#3" columns:* GC×GC profiling routinely finds far more than 3; a child table is unbounded and matches the controlled-vocab → lookup+child pattern. Fixed columns would cap the profile and force a migration the first time a 4th terpene appears.

- **`buyer_product_code` → `product_buyer_code` map table, not a column on `product`.** The buyer's own internal code is **per-buyer** (Pharmacy Berlin and Pharmacy Potsdam each have their own for the same product). *Why a relationship-scoped table over a column:* one product has many buyer codes; a single column works for a one-buyer demo then forces a painful extract-column-to-rows migration the moment a 2nd buyer appears — the exact failure the migration-avoidance checklist exists to prevent. It stores an **identifier, not a price**, so it does not breach the "no per-buyer pricing in v0" rule. Scoped to `relationship` (the natural grain).

- **Prices: one source of truth.** Sell + bundle prices live on `pricelist_item` (`price_per_gram`, `bundle_threshold_grams`, `bundle_price_per_gram`). `product` holds only the **intrinsic** money facts: `cogs` (🔒 seller-only — RLS + app-layer policy, same pattern as `deal_line_item.seller_margin`) + `rrp_per_gram` (recommended-retail reference). *Why:* avoids duplicating a sell price in two places; the price a buyer pays is a list concern, not a product property. `deal_line_item.unit_price` remains a frozen snapshot of `pricelist_item.price_per_gram` at deal time (changing the list never rewrites past deals).

- **`pricelist` + `pricelist_item` (header + rows).** v0 = **one standard company-wide list per company**. Per-customer "Customer Price / g" override (present in the Pricelist CSV) stays **deferred post-v0** per Marcel; DEV-41 Proposed→Applied workflow implementation also deferred (the decision is locked, the build isn't).

- **Naming locked: `product`** (not `catalog_product` — both appeared in earlier notes). Because `product` now lands in v0, **`deal_line_item.product_id` becomes a real FK in Phase 2**: create `product` before `deal_line_item` (was previously a deferred nullable-without-FK to a Phase-3 table).

- **4 new lookups:** `product_unit` (g/mL/pack) · `strain_dominance` · `irradiation_type` (beta/gamma/un_irradiated) · `pricelist_status` (draft/published). **Audit seeds** added: `product`, `product_batch`, `product_buyer_code`, `pricelist_item` → `auditable_content_type`; `product.created/amended` + `product_batch.created` → `audit_action_type`.

- **`metadata JSONB` on `product`** is load-bearing here — the CSV literally says "more columns should be able to be created flexibly per company." Per-company custom attributes go to JSONB, not per-company ALTERs.

*Why record:* closes the last open Phase-2 schema question. With the catalog locked, **no open schema items remain** before writing Phase 1 + Phase 2 migrations (the `buyer_metric` rename is non-blocking — placeholder ships v0). Full table shapes in `docs/architecture/SCHEMA-DRAFT.md` → "Phase 2 tables — Product Catalog & Pricelist".

Research sources: CT.gov seed-to-sale; GrowerIQ ALCOA batch lineage; Leafwell / NJ.gov "how to read a CoA"; Nature/Scientific Reports + PLOS One on batch THC variability; AWS / Citus on JSONB-vs-columns.

## 2026-06-07 (session 12) — Foundation build: schema migrations applied + RLS (F1–F4)

Wrote + applied the locked v0 schema to Supabase (71 tables), then the RLS privacy spine, the auth→person trigger, and the dev seed. Mostly executing decisions locked in sessions 1–10; the genuinely new calls made during the build:

- **13 inline "Lookup:" columns formalized as real lookup tables.** The draft left ~13 enum-ish columns as bare `VARCHAR` with a `Lookup: a/b/c` comment (`chat_thread.type`, `chat_message.sender`, `deal_card.deal_type`, `deal_line_item.unit`, `relationship.status`, `deal_card_log.origin`/`changed_by`, `contact_record.role`/`provider`, `note_scope`, `chat_message_type`, `payment_terms`, `incoterms`). Per the "enums = lookup tables" convention all became real tables + FKs. *Why:* add values without a migration (the convention's whole point) + typo-proof. **`content_author`** is a single shared lookup for both `chat_message.sender` and `deal_card_log.changed_by` (identical `person`/`system`/`sella` set — DRY).
- **Seller-only columns hidden via TABLE SPLIT (Option B), not a masking view.** RLS is row-level only — a counterparty who can legitimately see a shared row reads every column of it, leaking the 🔒 seller-only numbers. Split them out: `product.cogs` → **`product_cost`**; `deal_line_item.seller_margin`/`buyer_metric` → **`deal_line_item_private`** (one row per side, RLS by owning company). *Why table-split over a view:* pure row-RLS (consistent, testable, no view/privilege traps) and free now (empty DB, no data migration). The masking-view path also had a privilege contradiction (`REVOKE` base + `security_invoker` can't coexist). Proven by the isolation test — buyer sees 0 `product_cost` rows; neither side sees the other's metric.
- **RLS ships as a tracked migration**, not an untracked `supabase/policies/*.sql` seed script. *Lesson:* the first RLS draft was untracked and got discarded when a parallel session was stopped — security-critical SQL must be a committed migration.
- **`audit_log` hash trigger made `SECURITY DEFINER`.** Under RLS its "read previous hash" `SELECT` was filtered per-tenant → forked the global tamper-evident chain. DEFINER bypasses RLS so the chain stays global. (The separate concurrency fork — advisory lock taken after the `BIGSERIAL` is drawn — remains a build-phase hardening note.)
- **Deal chat-thread visibility follows the workspace lockstep.** `can_access_thread()` resolves deal-type threads through `deal_workspace.visibility` (private = active members only), matching `thing`/`deal_artifact` — not plain relationship scope.
- **Minor locks:** `deal_artifact_category.code` widened to `VARCHAR(30)` (`certificate_of_origin` = 21 chars > the 20-char status shape); `payment_terms` + `incoterms` seeded (draft gave only examples → common B2B set / Incoterms 2020 standard); `permission_action` table created but unseeded (vocabulary built with the permission-matrix UI); `company_insert` RLS tightened from `WITH CHECK (true)` to own-company-at-onboarding.

*Why record:* F1–F4 are applied + isolation-tested on Supabase (impersonation test proves GreenLeaf ↮ StonePharm, private-deal lockstep, and seller-only column hiding). This is the executed reality behind `SCHEMA-DRAFT.md`. Open follow-ups: move RLS helpers to a private schema (advisor noise — they're RPC-exposed); audit JCS canonicalization + concurrency hardening; **F5** shared modules (`shared/db`, `shared/auth`, audit write helper); `buyer_metric` rename; verify Supabase Auth email provider enabled.

## 2026-06-07 (session 13) — Discover: visibility model LOCKED; page structure + scope OPEN

Explored the Discover surface (stub) via a throwaway prototype with a mock DB (`prototypes/discover-prototype/`, 3 combination variants). One product rule came out clear and is locked; the page design itself is **not** locked — paused for more thinking.

- **LOCKED — Discover visibility is asymmetric ("Instagram model").** Listed-in-Discover = a company with a **public shop** (the selling side). Buyers (no shop, e.g. pharmacies acting purely as buyers) are **not listed** anywhere — reachable only by **exact-name search**, and only if they're on the platform. *Why:* sellers want to be found; buyers don't want to be cold-listed. The listing key is **"has a public shop", not a buy/sell role** — role is per-deal (consistent with the Layer-1 symmetric-company lock). Marcel's design arrived at the same rule independently ("list suppliers by category… no pharmacies shown first").
- **CONFIRMED — Discover does two jobs** (both in Marcel's designs): a **supplier directory** (sellers → their products, grouped, with a demand/supply toggle) and an **ad / social feed** (campaign calendar + ad posts = "B2B social network").
- **OPEN (explored, not locked):** (a) **page structure** — how directory + feed coexist (prototype mocks tabs / feed-first / unified-scroll; undecided); (b) is **demand-side** (companies posting what they want to buy) in MVP; (c) is the **ad/social feed** demo-scope or a fast-follow (it's the heavier half to build).

*Why record:* the visibility rule is load-bearing for whoever builds Discover (it's a directory-listing + search-access rule → affects the data model and RLS). The open items are parked in `docs/product/surfaces/DISCOVER.md`. Next Discover session resumes from the prototype.

## 2026-06-07 (Task 1A) — UI design system: palette, glassmorphism, surface nav

The app's visual language, locked while standing up the app shell (1A). Source of truth for tokens = `src/app/globals.css` `@theme`.

- **Look = pink + white, light, glassmorphic.** Translucent white surfaces (`backdrop-blur`) over a faint cotton-candy-washed background; pink as the accent. *Why:* distinctive and professional; a dark full-height rail was tried and rejected as heavier and less clean than the light glass capsule.
- **Palette (locked):** raspberry `#E30B5D` (brand/primary), cotton-candy `#FFB7D5` (light fills), red-pink `#76002D` (deep accent), white `#FFFFFF`, ink `#1F2020` (text/icons), green `#34B233` (success), periwinkle `#6C7BD9` (info), alert red `#DC2626` (danger/destructive). *Why the splits:* raspberry is the brand, so it can't double as "error" — a dedicated alert red keeps destructive actions unambiguous; the source swatch's "Electric Periwinkle Blue" was mislabeled (its hex was green), replaced with a true periwinkle for info.
- **Light-only for the demo; dark deferred post-demo.** Tokens are CSS vars in `@theme`, so dark mode is later a second `:root` block, not a rewrite. *Why:* one theme to polish before June 11; the structure keeps dark cheap.
- **Icons = `lucide-react` (monochrome), never emoji.** *Why:* emoji render differently per OS (a client's Windows machine ≠ macOS on stage); icon components render identically and inherit the brand tokens.
- **Font = Geist** (ships with Next 16), via `next/font`.
- **Wordmark = `He//o se//o`** — the `ll` in each word rendered as `//` (a Sella brand sign); deep-maroon letters + raspberry slashes. A text placeholder for a real logo image.
- **7 global surfaces (locked):** Home · Connect · Discover · Present · Buy · Sell · Trade, in a thin left rail. *Why "Trade" not "Grow":* matches the home/connect prototypes; the earlier "Grow" label is superseded.
- **Shell layout:** light glass capsule rail (Hello Sello logo top · surface pills · user-photo slot bottom) + a glass search top bar carrying the logged-in company's logo/name. Active surface = cotton-candy pill + raspberry; `soon` surfaces (Buy/Sell/Trade) are greyed and non-clickable until built.

*Why record:* shared decision — Muskan builds Present + Discover against the same palette, tokens, icon set, and shell, so the design system must be team-visible, not buried in Ayush's workshop. Full build narrative: `_workshop/build-plans/1a-app-shell.md` (Ayush-local).

## 2026-06-07 (session 14) — F5 shared modules built + merged to dev (PR #60)

Built the app-layer foundation modules on top of Ayush's Task-1A scaffold. These are the contracts every feature module imports. PR [#60](https://github.com/HelloSello/hello-sello-mvp/pull/60) → `dev`.

- **Publishable key (modern) over legacy anon key.** Env var = `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`). Supabase docs recommend it; independent rotation, same RLS enforcement. Legacy JWT anon key still works but is the deprecated path.
- **`shared/db` cannot barrel browser + server clients into one `index.ts`.** `server.ts` imports `next/headers` (server-only); exporting it from a shared barrel breaks Client Components at build time. Surface: types from `@/shared/db`, browser client from `@/shared/db/client`, server client from `@/shared/db/server`.
- **`writeAudit()` is intentionally thin — DB trigger owns the hash-chain.** The helper just INSERTs; `sequence_number`, `prev_entry_hash`, and `entry_hash` are computed by the `trg_audit_log_hash` BEFORE INSERT trigger (advisory-lock serialized). The generated TS type demands `entry_hash` (can't see the trigger); the helper casts around it.
- **`getCurrentCompanyId()` = the single Path-B accessor.** Returns `null` when the user has no company yet. RLS fails safe on null (matches nothing). One accessor, one place to change if Path B adds complexity.
- **`getUser()` over `getSession()` for server-side auth.** `getUser()` revalidates the JWT with the Supabase auth server; `getSession()` trusts the cookie as-is. On the server (where we resolve person/company), revalidation is the safer default.

*Why record:* F5 is consumed by every module Ayush builds; the barrel-split and thin-audit decisions are the kind of thing a future developer would violate without knowing why (e.g. "why not just export everything from index.ts?" or "let me compute the hash in the helper for safety"). These locks prevent that drift.

---

## 2026-06-07 (session 15) — Auth screens (1b): theme resolution + build locks

- **Auth-screen theme — LIGHT wins; the 2026-05-25 "dark auth" intent is superseded.** The onboarding prototype HANDOFF lock #2 (*"dark theme for auth screens, light in-app"*, 2026-05-25) **conflicted** with Task-1A's *"light-only for the demo; dark deferred"* (2026-06-07, this DECISIONS.md). **Muskan's call: light wins** — `/login`, `/signup`, `/onboarding` render on the light glass system like the rest of the app. *Why:* one theme to polish before June 11; the `@theme` token structure keeps dark a cheap post-demo add. Revisit dark (incl. the dark-auth idea) post-demo. *(Recorded so the conflict doesn't resurface — a dark mock for signup is **not** the current target.)*
- **Auth chrome = conditional, not a route-group split.** `AppShell` renders bare (no rail / top-bar) on `/login` + `/signup` via a `usePathname` check (it is now a client component). Chose this over the canonical `(app)`/`(auth)` route-group split because the split would move Ayush's 8 surface pages mid-Connect-build (collision risk). The route-group split is the cleaner refactor for later.
- **Post-signup landing = `/onboarding` placeholder (Path-B gate).** A fresh signup is authenticated but has `company_id = NULL`, so it lands on `/onboarding` (not the app). 1c (company setup) replaces the placeholder. Industry pattern: gated onboarding (Slack/Notion/Linear).
- **Session proxy uses `getClaims()`, not `getSession()`.** The Next-16 `proxy.ts` refresh + route gate verifies the JWT signature (safe server-side); `getSession()` trusts the cookie and must not gate routes. (Consistent with the F5 `getUser()`-over-`getSession()` lock.)
- **`signOut` uses `scope: 'local'`.** The button always clears the local session even if the remote revoke would fail (expired/invalid session); the redirect never waits on a network call that can error.
- **Dropped the `/logout` GET route.** A GET that mutates is a smell; sign-out is a `<form>` server action. Placed in the rail's user-avatar menu.

---

## 2026-06-07 (Sella design) — Deal-Sella detection: runtime placement, tool contract, proposal flow

Design session on how Deal-Sella's detection actually *runs* at build time. Layer 4 locks Sella's **behavior**; this locks the **build mechanics**. Build itself handed to Ayush / the F5 build session. All captured in `ARCHITECTURE-NOTES.md` "Sella runtime placement"; mirrored here as the load-bearing locks.

- **Placement rule — data-triggered → background, person-waiting → app.** A Sella task kicked off by a DB change (new message, card version bump, doc upload) runs in a background runtime and must never sit in the user's request path (keeps Sella a non-blocking leaf). A task a user waits on-screen for (side-panel reply, "what's on my plate") runs in the Next.js app. **Tasks live in different homes; one choice does not bind the others.** *Why:* "where Sella lives" is really "where each *task's* trigger lives" — the model (Bedrock) is one shared brain; only the trigger code's home varies.
- **Detection lives in a Supabase Edge Function.** Flow: new `chat_message` → DB webhook (async `pg_net`, non-blocking) → Edge Function → Claude Haiku with one `propose_deal_draft` tool over a rolling ~15–20-message window → writes a Draft suggestion → Supabase Realtime shows it live. Chosen over an in-Next.js background job because Vercel serverless can freeze post-response (unreliable for fire-and-forget).
- **Suggest-only is structural, not a promise.** Sella is handed only *propose* tools — there is no `confirm`/`send` tool — so it cannot commit a deal by construction. Resolves the "Sella suggests, humans decide" guarantee at the tool layer.
- **`propose_deal_draft` contract (S2):** `line_items[]` {name → `deal_line_item.name`, quantity+unit → `.volume`, unit_price, cultivar?, pzn?}, `currency` → `deal_card.currency`, one-line `summary` → `deal_card_log`. Required: name, quantity, unit_price, currency. `deal_type` not extracted (initiator-set; seller = OFFER per O4); `value_net` computed (qty × price). Maps 1:1 to schema columns — no glue layer.
- **Proposal + both-sides votes live in the `deal_detected` message `metadata`** (the column is documented "Sella context, confirmation state") — **no new table**. Not `deal_confirmation` (that's the heavier final two-party *card* confirm). Promote to a `deal_proposal` table post-MVP only if the proposal grows a real lifecycle.
- **Workspace birth = one atomic app-side transaction.** On both-accept, a single all-or-nothing transaction creates `deal_card` (Draft) + `deal_line_item` rows + `deal_workspace` + `deal` thread + `deal_member` rows + `workspace_created` system line + audit. The `deal_detected` message persists as the "proposed → both accepted" record.
- **No detection cost gate for MVP.** Per-message Haiku ≈ $0.001 + prompt caching → the cheap rule/embedding pre-filter is a post-MVP scale optimization, not needed for the demo.

**Open (build-phase) — RESOLVED 2026-06-08 (see next entry):** spawn-transaction internals (`deal_member` owner/side_lead auto-insert, the `thread_id`-nullable create-order cycle); Bedrock-from-Deno credential setup (`aws4fetch` SigV4 + Supabase Edge secrets, *not* the Vercel env keys).

*Why record:* this is the design Ayush builds Sella against; the placement rule and the structural suggest-only guarantee are the kind of thing that gets violated silently (e.g. "let me just call Bedrock in the message handler" → chat blocks on AI). Grounded in research 2026-06-07 (function-calling extraction, Haiku pricing/caching, Supabase DB webhooks) + Layer 4 §3/§5. Also closes O6 in the connect-demo PRD.

---

## 2026-06-08 (Sella design) — Workspace-spawn transaction + Bedrock creds (closes the build-phase opens above)

Follow-on session settling the two items the detection entry left open. Mirrored in `ARCHITECTURE-NOTES.md` ("Sella runtime placement") and the schema change in `SCHEMA.md` §8.

- **Create-order is acyclic — no `thread_id` backfill.** The feared "thread_id-nullable cycle" does not exist: the FK is one-directional (`chat_thread.deal_card_id → deal_card`; `deal_card` carries no thread column). Fixed order, one all-or-nothing transaction: (1) `deal_card` → (2) `deal_line_item` → (3) `deal_workspace` → (4) `deal_member` → (5) `chat_thread` (type `deal`) → (6) `chat_message` `workspace_created` → (7) audit.
- **Both founders become `owner` (one per side).** The two P2P chatters each get a `deal_member` row with `role = owner` — co-ownership, one per company side. `side_lead` stays in the enum but is NOT auto-assigned at birth (reserved for later delegation: a side's lead who isn't a full owner). `member` = colleagues added later.
- **`deal_workspace.owner_person_id` REMOVED — ownership lives in `deal_member`.** A deal can have several owners (two leads + more), so a single-owner column can't hold the truth. Ownership = `deal_member` rows with `role = owner`; one source, unbounded count. *(Amends the locked Phase-2 `deal_workspace` table — see SCHEMA.md §8.)*
- **Superadmin access = platform-wide RLS bypass, not a membership row.** The HS superadmin manages any deal via a bypass policy, never inserted as a `deal_member` on each deal (keeps every deal's people-list clean).
- **P2P→deal continuity signpost.** On birth, the `deal_detected` message in the P2P thread updates to a "Deal created → open workspace" link into the new deal thread, so the two people don't lose the deal when it moves rooms.
- **Bedrock-from-Deno creds = permanent key, least-privilege.** The detection Edge Function authenticates to Bedrock with a permanent IAM/Bedrock key in **Supabase Edge secrets** (not the Vercel env keys), scoped to **Bedrock-invoke on the `eu.` EU Claude models only**. Auto-expiring (12hr) keys + refresh machinery = post-MVP hardening. *(Build = Ayush.)*

*Why record:* the owner-column removal changes a locked schema table; the co-owner + superadmin-via-RLS choices drive both the spawn transaction and the deal RLS policy. Grounded in SCHEMA.md §7/§8 (`deal_card` / `deal_workspace` / `deal_member`) + the placement rule from the entry above.

---

## 2026-06-08 (Sella design) — Multi-Sella architecture (DEV-11): MVP scope locked, orchestration deferred

DEV-11 asks "are Personal / Seller / Buyer Sella distinct agents or one with context flavors?" + the framework choice. Split into what MVP actually needs vs what's deferred. Most of the §2 framing was already answered by locks scattered across Layer 4 + ARCHITECTURE-NOTES; this collects them into one architecture statement.

- **The "5 Sellas" = ONE agent runtime, parameterized** by (data scope · persona shift · tool set + memory namespace) — not 5 services or codebases. Forced by already-locked facts: one base voice with role-fitted shifts (DEV-46), one Bedrock provider wrapper (4a), routing at the **interface layer** (§2/§5), and the side-Sella **reads** Deal-Sella's scope rather than two agents conversing (§2). Industry-aligned (2026 consensus: single-agent + tools is the default; add tools before agents; graduate to multi-agent only at clear limits — multi-agent helps parallel tasks but degrades sequential ones).
- **MVP needs no agent architecture.** All 4 MVP Sella tasks (BUILD-PLAN Unit 4: 4a wrapper · 4b detect · 4c draft · 4d summarize) are **stateless single-shot Bedrock calls** behind the 4a provider wrapper, each with ≤1 structured-output tool. **No agentic loop, no orchestrator, no graph, no agent framework** (LangGraph / Bedrock Agents), **no RAG, no persistent memory.** Detection (built) is the reference shape.
- **Deferred to post-MVP** (decide when the task is built, not now): multi-step agentic loops, multi-Sella co-activation runtime, RAG-backed Side-Sellas + memory/retention ([DEV-59](https://linear.app/hellosello/issue/DEV-59)), autonomy-ladder trust state (§4), any agent framework adoption. The locked *direction* to graduate from = **single-agent + function-calling tools**.

*Why record:* retires the "5 agents?" framing of DEV-11 **for MVP** and prevents over-building (no one reaches for LangGraph / an orchestrator to run 4 stateless calls). DEV-11 itself stays **open** for post-MVP orchestration. Grounded in BUILD-PLAN Unit 4 (4a–4d all single-shot) + the locked detection design (2026-06-07/08 entries above) + the 2026 single-vs-multi-agent consensus.

---

## 2026-06-08 (Sella 4a) — Bedrock auth method + shared-helper placement (smoke-test verified)

Settling *how* the 4a Bedrock wrapper authenticates and *where* it lives, before building it. Both decisions were verified by a live throwaway smoke test (`bedrock-smoke` Edge Function), not just chosen on paper. Mirrored in `ARCHITECTURE-NOTES.md` ("Sella runtime placement").

- **Auth = Bedrock API key (bearer token) + plain `fetch`. SigV4 / AWS SDK NOT used.** Supersedes the earlier "permanent IAM key + `aws4fetch` SigV4" assumption. A long-term **Bedrock API key** sits in Supabase Edge secrets as `AWS_BEARER_TOKEN_BEDROCK`; the function POSTs to the EU Converse endpoint with `Authorization: Bearer <key>` — no signing, no SDK to bundle. *Verified:* live call to `eu.anthropic.claude-haiku-4-5-20251001-v1:0` in `eu-central-1` returned "pong". 12hr short-term keys + refresh = post-MVP hardening.
- **Shared Bedrock helper lives in `supabase/functions/_shared/sella/`, not `src/shared/`.** The heaviest model-calling tasks (detect / draft / summarize) run in the Edge Function (Deno); the Deno bundler can't cleanly import from the Next `src/` tree, but the Next app *can* import a pure helper from the functions dir. So the helper sits with its heaviest consumer + the stricter bundler. Refines (doesn't contradict) the "F5 / shared infra" framing — still shared, just physically beside the Edge Functions.

*Why record:* both supersede prior paper assumptions (SigV4; "F5 territory" implying `src/shared`), and the auth one was the single biggest unknown in the whole Sella unit — now closed by a real call. The next builder should not re-introduce the AWS SDK or SigV4, and should not place the helper in `src/`. Grounded in the live smoke test + Supabase monorepo bundling friction ([CLI #1303](https://github.com/supabase/cli/issues/1303)) + research on Bedrock API keys (bearer tokens).

---

## 2026-06-08 (Ayush) — C2C = a ticket channel, not a free chat (direction DECIDED; NOT building now)

A message into a company-to-company (C2C) channel should behave like a **ticket**, not a back-and-forth chat. The three chat types keep clear, separate jobs: **P2P** is where people actually talk, **Deal chat** is the deal-workspace thread, and **C2C** is for reaching a company when you don't know which person to ask, plus the durable connection/info record.

*Why:* a company can have many people, and only some P2P pairs are connected; some people are connected to no one. A company needs a "knock on the door" that does not name a person (the classic sales problem: "who is their procurement person? their finance person?"). Framing C2C as a ticket keeps it from becoming a noisy second chat that fills with irrelevant text.

**This resolves the prototype-vs-DECISIONS drift.** The prototype called C2C an "audit log / `actor=system` only"; DECISIONS:515 called it "messaging on behalf of your company". Both are true once "messaging the company" means "raise a ticket", not "free chat".

**Agreed shape (for the future build):**
- Sending stays as easy as typing a message (no form to fill). The C2C box just *looks* different — a different skin/framing, maybe one **optional** category tag — so it reads as a deliberate, different kind of message.
- A C2C message becomes a ticket that enters the **same Inbox** (the 2a machinery), shown in a **different view** from new connect requests. Anyone in the company may raise one (relaxed permissions for MVP).
- On pickup (same first-come claim rule as 2a): if the two people have no chat, a natural new **P2P** starts; if they already have a P2P, the pickup drops a **Sella** system message into that existing P2P (reuse, don't duplicate). Deal-card changes flow through the existing deal-card update mechanism.
- The conversation happens privately in the **P2P**; the **outcome** is posted publicly back to C2C ("handled by Jonas"); significant changes are surfaced in C2C. The other company sees the result in C2C, not the private P2P words.
- The sender sees a status: **open / claimed / answered**.

**NOT building now (parked).** For the June 11 demo we keep the current C2C chat as-is, and keep Sella as the mediator through the existing flow. Deal-card changes use the older method, and since no deal card is attached yet there is nothing to change now. Build the ticket system as its own slice after the core demo path (2d/2e + the deal flow).

**Open problems to solve when we build (from the 2026-06-08 brainstorm — recorded so we don't lose them):**
1. *Easy vs deliberate (the core tension).* The box must be as easy as a chat (so people adopt it) yet feel different (so they don't dump irrelevant text). Likely fix: same typing ease, different framing + one optional category tag — no form.
2. *P2P topic-mixing.* Reusing an existing P2P for a new ticket can mix unrelated topics in one thread. Likely fix: a clear Sella divider line ("New from the company channel: …"); switch to one-thread-per-ticket only if it gets messy.
3. *Publishing the outcome to C2C.* Need a rule for what counts as "significant" and who posts it. Likely fix: auto for deal-card changes (existing flow) + a manual "Share update to the company channel" button. Confirm the privacy model (company sees the result, not the private P2P).
4. *Inbox data model.* Decide whether a company ticket is the same Inbox item with a new "type" or a new concept. Defer to build time.

*Status of the 2b/2c code today:* C2C is currently a writable chat (the earlier drift-fix). That stays for the demo; it becomes the ticket box when this slice is built.

---

## 2026-06-12 (Sella 4b) — Detection → Dealcard journey (Option B, grounded) + the 4b build decisions

The full chat→card journey, settled while building 4b. **Sella only ever DRAFTS; she never finalizes** — a card born on day 1 may not finish until day 50, so Sella can never know a deal is "done." Detection posts a read-only `deal_detected` suggestion → **both owners confirm it (Stage 1, Birth)** → the two-owner `create_deal_draft` opens a **Draft** card (always Draft, regardless of `forming`/`firm`) → negotiation → **both owners confirm the 3d gate (Stage 2, Seal)** → Confirmed.

- **Two stages, two meanings: OPEN (birth) vs CLOSE (seal).** Each needs both sides. The verdict (`forming`/`firm`) **never skips a stage** — even a fully-agreed-in-chat deal is born as a Draft and sealed later. *Why:* the two confirmations answer different questions ("is this a real deal worth a card?" vs "do we agree the final terms?"), and a deal lives and changes for weeks between them. This resolves the half-open tension between POV §6 ("Option B") and the 3.5 note ("one human click") — toward **both-click birth**.
- **Confirmer-as-initiator.** Whoever clicks the final accept births the card as the initiating side; the other p2p person becomes co-owner; **both are equal owners**. *Why:* it reuses the existing `create_deal_draft` (which keys the creator off `auth.uid()`) with zero refactor; forcing seller-always-initiates would need duplicating the birth logic. Deal type derived from who holds the catalogue (offer/order) — **precise offer/order labelling stays parked**.
- **`deal_detected` metadata shape (resolves POV §8 open item):** `{ detection_id, verdict, confidence, draft{line_items,currency,summary}, evidence[], votes{<companyId>: null|accept|reject}, product_key, superseded_by, ai:true }`. Votes are by **company** (either colleague on a side can confirm for that side). `ai:true` = EU AI Act Art. 50 machine-readable tag.
- **Sella's memory is a separate table, not the chat rows.** `sella_detection` (one row per run) carries idempotency + dedup + supersession; the visible `deal_detected` message is the human view. *Why:* a `no_deal` run must be REMEMBERED for dedup but must NOT spam the chat, and **GDPR** — verbatim evidence quotes are kept only on `forming|firm` rows (enforced by a DB check), never on `no_deal`.
- **Auto-trigger = pgmq + pg_cron + pg_net, scoped to `p2p` threads.** A person message enqueues a job; a 10s cron worker dispatches it to `sella-detect`; durability via the queue + the idempotency guard (at-least-once, self-healing). The fence holds throughout: **Sella only suggests + pre-fills; a human's click is the only write path.**

*Why record:* this is the load-bearing Sella product decision (it overturns nothing but grounds Option B with the "Sella only drafts" principle) + the four engineering decisions that fell out of it. Built + verified live 2026-06-12 (post / idempotent / supersede / birth on thread `91b6f4b8`). Code: `supabase/functions/_shared/sella/{dedup,detect,tools,context,prompts,bedrock}.ts` + `sella-detect/` + migrations `…120000`/`…130000`/`…140000`. Engineering detail in ARCHITECTURE-NOTES 2026-06-12.

---

## 2026-06-12 (Sella 4d) — Version-change summaries + AI first-contact intro; "narration follows the card"

The last Sella piece. Two jobs, both single-shot Haiku, both PERSON-WAITING so they run INLINE (the placement rule), both fail-soft, both fence-safe (Sella narrates; she changes nothing).

- **Version-change summary.** On a card edit, Sella reads the line diff + the human's mandatory note and writes one neutral "why it changed" sentence into `deal_card_log` (`changed_by='sella'`, shows in the Logs tab) AND a `deal_card_updated` chat message.
- **Sella's narration follows the CARD, not a single thread.** The `deal_card_updated` summary is posted to EVERY chat the card lives in — the deal workspace chat AND the relationship's P2P chat — each linked via `metadata.deal_card_id` (a P2P chat can host several deals over its life). *Why:* the P2P chat is the people's durable home base; after a deal is born the negotiation moves into the workspace, but the people must stay aware in P2P without walking into the workspace. Supersedes the original 4d spec's "post to the deal workspace chat" (Ayush, 2026-06-12).
- **First-contact intro = AI-written.** On accept, `sella-intro` rewrites the rollout's static seeded `intro` line into a warm, context-aware opener (the two people, companies, request kind, note), AI-origin tagged. Fail-soft: the static intro stays if Sella is down.
- **Sella's voice uses short dashes only** (a prompt rule, matches the house style). **`tsconfig` excludes `supabase/functions/**`** from the Next typecheck (the Deno edge files were never meant for it; tsc is now clean).

*Why record:* completes Chapter 4 (Sella). No migrations — all engine + inline wiring on `edit_deal_draft` / `acceptItem`. Verified live incl. a browser edit→summary end-to-end. Engine detail in ARCHITECTURE-NOTES 2026-06-12.

---

## 2026-06-14 (Waypoint 4.5) — Deal birth + acceptance redesign: proposal-in-chat + the Sella strip

Resolves a tangle found while opening 5A.4: the card is born too early and acceptance lives ON the card, which (1) makes a person "accept their own deal", (2) leaves orphan workspaces when no one confirms, and (3) gives Sella nowhere to ask (she may suggest but not make a card — the AI fence). The fix realigns the code to the already-locked two-confirmation journey (2026-06-12 Sella 4b), not a new flow.

- **One birth path, two doors.** Manual-create AND Sella-detection both produce a **proposal** = a `deal_detected`-shaped chat message carrying the draft + per-company votes (NOT a card, NO new deal status). *Why:* detection already proves "a message is the pre-card object"; making manual-create produce the same message unifies birth and reuses `confirm_detected_deal` + `create_deal_draft` untouched.
- **Sending = accepting (manual).** The proposer's company vote is pre-set `accept`; only the other side is pending. Detection: both votes start null. Kills "accept your own deal".
- **Birth (card + workspace) only on both-accept, atomically. Supersedes 3.5a D5** ("workspace at Draft"): no card and no workspace exist until both accept → no orphan. The proposer is the initiating side (offer/order reads from `metadata.proposed_by_company`, not whoever accepts last).
- **The card becomes pure display; the Sella strip owns all actions.** The deal bar (`DealPin`) becomes the **Sella strip** — one shared, neutral, system-voice surface for birth-accept, the change-note ask, and the **Seal gate** (the 3d `ConfirmBar` moves OFF the card). Private "ask Sella" stays in the right panel. One selected deal at a time; cross-deal asks collect in a chat-header notification.
- **Privacy:** the proposal is a shared message, so the proposer's own-side private box is NOT carried in it (would leak to the counterparty) — added after birth via edit.

*Why record:* revises shipped Chapter-4 behaviour (where acceptance lived) and supersedes 3.5a D5, so it is load-bearing. The AI fence still holds — Sella only suggests the proposal; a human's Accept click is the only write that births a card. Build plan: `_workshop/build-plans/4.5-deal-birth-acceptance.md`. **4.5.1 (engine) built + held (not applied to any DB); next = 4.5.2 (the strip UI).** Scope: connected-P2P only — not-connected→inbox, C2C ticketing, the shop/offer path, and global notifications are parked.

---

## Layer 2 — Present surface (storefront)

### 2026-06-10 — Present storefront v0 (design + build, session 16)

- **Present = the seller's shop.** Layout follows Marcel's screenshot: a LinkedIn-style **cover banner** + logo, three glass profile cards (about / tags+HQ+warehouse / links), **dominance filter pills**, and a product card grid. **One `/present` page, two roles** (owner edit vs visitor) — reuses the locked "seller-view = buyer-view = same object" doctrine. *Why:* matches Marcel's design and the existing role-based model; one surface, not two.
- **Products enter via a seller-defined CSV template, not fuzzy parsing.** We own the columns/order → ingest is **validate-against-template**. The template carries **product + its current batch** (lab THC/CBD + terpenes). v0 = single image per product, one company-wide pricelist. *Why:* defining the contract removes the messy multi-table / duplicate-THC / header-less problems the prototype found — a far smaller, more reliable build. Off-template uploads (fuzzy parser) **parked post-v0**.
- **Price visibility = per-product `price_public`** (default OFF → buyer sees **"Request pricing"**; seller opts each product in). Request-pricing routes to **Connect's inbox** (type `pricelist_request`, 2a machinery). *Why:* DEV-12 — prices aren't public by default; per-product matches "control what to show and what not". Per-connected-company custom pricelists stay deferred.
- **Company profile fields:** fixed identity as **real columns** (`tagline`, `cover_path`, `logo_path`, `warehouse_location`); **social links in `company.metadata`** (jsonb list); tags reuse `company_type`. *Why:* match storage shape to data shape — fixed = columns, variable-length list = jsonb.
- **Import is atomic** via the `import_products(jsonb)` RPC (SECURITY INVOKER, RLS-scoped to caller's company). One CSV row fans out → `product` + `pricelist_item` + `product_batch` + `batch_terpene` + `product_cost`. *Why:* a half-imported catalog is worse than none; mirrors `onboard_company`.
- **Deferred (post-v0):** Deal Room (separate Present tool), per-customer pricelists, multi-image galleries, off-template/fuzzy CSV import, in-app template-download button.

### 2026-06-10 — Present product image gallery (build, session 18)

*Lifts the "multi-image galleries" deferral from the session-16 entry above.*

- **A product has MANY images, stored in a `product_image` table (1:many), not a column.** Replaced the single `product.image_path` with `product_image (product_id, company_id, image_path, position)`; `position 0` = cover. *Why:* researched — Medusa/Saleor/Spree/Vendure and Supabase guidance all model galleries as a separate ordered table; a JSON/array column is the documented anti-pattern (reorder/delete become whole-document rewrites, no per-image RLS). Old `image_path` backfilled → `position 0`, then dropped; `import_products` RPC updated to write a `product_image` row. *(migrations `20260610150000`, `…160000`.)*
- **Image bytes upload browser → storage directly; the server only stores paths.** *Why:* routing files through a Server Action hits Next's 1 MB limit AND Vercel's **4.5 MB platform body cap (not raisable)** — it would break in production. Client uploads via supabase-js to `shop-media` (Storage RLS scopes to the company folder); a tiny server action records the paths. Remove is symmetric (server deletes row, client deletes file). **Reusable for any future file upload.**
- **Owner-management of a storage bucket needs a company-scoped SELECT policy.** `shop-media` had INSERT/UPDATE/DELETE but no SELECT, so `remove()` (which does select-then-delete) silently orphaned files. Added `shop_media_select` scoped to own-folder only — no anon/cross-company listing reopened. *(migration `20260610170000`; root-caused via live testing.)*
- **Reorder + set-as-cover included (not deferred).** One authoritative `position` writer (`setProductImageOrder` takes the full ordered id list); "make cover" / move-left-right resolve to it client-side. Carousel = **Embla** (~7 KB, zero-dep); frame `aspect-[4/3]` to stay proportionate in the grid.
- **Shipped to production** (PR #85→dev, #86→main). Engineering detail in `ARCHITECTURE-NOTES.md` ("Present product gallery", 2026-06-10).

### 2026-06-10 — Profile & QR business card (design + build, session 19)

Full design contract in [PRD/profile-and-qr-card.md](../PRD/profile-and-qr-card.md) (decisions D1–D13). Load-bearing locks:

- **QR → public profile page** (`/c/<handle>`), not vCard-only or connection-only. The page is the deliverable (info + Save-contact, works for any scanner); the connect-action is progressive enhancement. *Why:* dissolves the "scanner may not be on HS" break — the page renders for everyone, signed in or not.
- **Card identity = person, connects to company** (matches the company↔company model, DEV-7). The personal card is the entry point; a logged-in scanner's "Connect" routes to the company.
- **Public page exposes ONLY a curated projection** via a `get_public_profile` `SECURITY DEFINER` RPC — anon never gets SELECT on `person`. Email IS public (business-card intent); per-field public toggles deferred.
- **Profile fields promoted to typed `person` columns** (`display_name/title/phone/language/links/avatar_path/public_handle`), not `preferences` JSONB — one authoritative source for onboarding + account + card + page.
- **Readable `public_handle`** (name slug + numeric suffix), permanent once shared; generated on first profile save for new users.
- **Card placement = bottom-left avatar popover** (card + QR + My Profile/Company/Settings/Sign out); account screens = sidebar-settings layout; public page = light business-hero.
- **Back button only for signed-in viewers** on the public page (an outsider scanning the QR has no app to return to).
- **Licence env-gated** (`NEXT_PUBLIC_REQUIRE_LICENSE`): required in prod, optional in local/preview.
- **Connect button = deliberate stub** — real P↔C wiring is the Connect surface (Ayush).
- **Shipped to production** (PR #88→dev, #89→main admin override). Engineering in `ARCHITECTURE-NOTES.md` ("Profile & QR business card", 2026-06-10).

---

## Layer 2 — Discover surface

### 2026-06-11 (session 20) — Discover: closed + tagged directory (NON-marketplace) — supersedes session-13 browse-depth

Marcel's directive (2026-06-10): *"Discover closed to not see shit, but a line with the company logo and a request to enter… It needs to be a NON-Marketplace."* This resolves the page structure + scope that session 13 left open, and **changes the browse-depth** of the session-13 visibility lock.

- **LOCKED — Discover is a CLOSED, TAGGED directory, not a marketplace.** Each company shows as a brand line (**logo · name · category · country**), filterable by category/country/name. The company's **shop / products / prices stay hidden** until you **"Request to enter"** and are accepted. No open catalog, no prices, no feed. *Why:* Marcel's NON-marketplace directive — stays discoverable while never exposing a catalog to strangers in a sensitive industry.
- **Supersedes the session-13 "browsable public shop" depth.** *Who is listed* is unchanged (the "has a public shop" key still decides listing; buyers are exact-search only). What changed: a listed company's shop is **no longer browsable on sight** — it's gated behind request-to-enter. The asymmetric *listing* rule survives; the open *catalog* does not.
- **Page structure DECIDED = search-first lobby** (centred search + category pills + single-column company list). Chosen from a 3-variant throwaway prototype (registry table / filter-rail grid / search-first lobby). *Why:* search-first sells "ask to come in," not "scroll a feed" — truest to NON-marketplace. The "Tagged" line (vs bare logo / vs teaser) is the minimum needed to *find* who to request without *browsing* a catalog.
- **Ad / social feed = CUT** (was the heavier half of the session-13 "two jobs" confirmation). A campaign/ad feed contradicts a closed non-marketplace; dropped from scope.
- **"Request to enter" wiring = OPEN** — entering = *unlock-shop* (Discover owns the access grant) **vs** = *a Connect request* (one door, reuses Connect's plumbing; gate state lives in Connect). Leaning the latter; **deferred until Connect's request/accept flow is ready**. Button stays stubbed until then.
- **First slice = UI only** (search-first directory, placeholder data, stubbed button). Real `list_discoverable_companies()` `SECURITY DEFINER` RPC (same anon-safe projection pattern as `get_public_profile`) + the gate are the next slices. Build plan: [`docs/muskan-build/discover-directory.md`](../muskan-build/discover-directory.md).

### 2026-06-14 — Discover & public profile: soft openness model (supersedes "closed + tagged" 2026-06-11)

The "closed by default" lock above was a demo simplification (Marcel: build closed *for the demo*). Building the real product now — for onboarding + testing — we move to a **company-curated profile, LinkedIn-style**.

- **Public profile is company-curated (soft), not closed-by-default.** Openness = two per-product dials: visible-on-profile (`product.profile_visible`, **new**) × price-visible (`product.price_public`, exists). Levels emerge: **L0** bare card → **L1** products/no price → **L4** full priced shop. *Why:* the soft model is a **superset** of "closed" — a company that wants closed just stays at L0; gives each company go-to-market flexibility; matches B2B norm (LinkedIn / Alibaba / Faire).
- **Audience-scoped for compliance.** Products/prices show to logged-in **verified members** only; the anonymous public card (`/c/<handle>`) stays **bare**. *Why:* contains German **HWG** public-advertising risk for prescription cannabis — showing to verified members ≠ showing to the open internet.
- **Discover directory stays minimal** (brand line: logo · name · category · country); the chosen openness shows on the company's **profile** after click. *Why:* listing ≠ browsing — reconciles the closed directory with the soft profile.
- **Connect CTAs map to the 4 existing inbox types**, surfaced contextually on the profile: Connect (`connect`) · Connect + note (`connect_message`) · Request pricing (`pricelist_request`) · Offer card (`deal_card`). A note is optional on every connect. *Why:* reuse locked inbox machinery; **no new request types**.
- **Two-track build.** **Track 1 (now)** = the real connect loop between two onboarded companies (Discover real data → profile → connect/note/request-pricing → accept → C2C/P2P chat), buildable on existing schema + one `profile_visible` column. **Track 2 (later)** = the FLOWZ growth engine — already documented (LAYER-1 §13, LAYER-5, [`research/dev-62-dev-44-flowzz-mirror-shop.md`](../research/dev-62-dev-44-flowzz-mirror-shop.md)); its **outbound offer/inquiry email is legally RED** (UWG §7(2) per-se rule), deferred behind consent/partnership. The shadow-profile + claim-on-signup part is the defensible half. *Why:* ship the testable loop first; don't build the RED outbound until consent exists. Build plan: [`docs/muskan-build/discover-connect-loop.md`](../muskan-build/discover-connect-loop.md).

---

## Cross-cutting — Storage uploads

### 2026-06-11 (session 21) — Single-slot uploads: client-direct + stable filename (Option B)

Hardening for avatar / cover / logo. The storefront gallery already did client-direct (session 18); this finishes the pattern for single-slot media and fixes orphaning. Full plan in [PRD/storage-uploads.md](../PRD/storage-uploads.md); engineering in `ARCHITECTURE-NOTES.md` (2026-06-11). Research-grounded (Supabase storage best-practice + Smart CDN docs).

- **Single-slot media (avatar, cover, logo) uploads client-direct to storage; the server stores only the path string.** Dodges the Next/Vercel Server-Action body limit (1 MB / 4.5 MB). Avatar was already client-direct; **cover/logo migrated off the server path** (`updateShopProfile` no longer touches bytes).
- **Stable filename + `upsert` = orphan-proof by construction.** Single-slot assets use a fixed path (`{id}/avatar`, `{companyId}/cover|logo`, **no extension**) so a re-upload overwrites the one file in place. Supersedes the prior UUID-per-upload naming, which made `upsert` dead (a random name never collides) and orphaned the old file on every replace. *Why no extension:* a path carrying the extension would change on a format switch (png→jpg) and re-orphan. **Collections (the product gallery) keep unique filenames + explicit delete-on-remove — a different rule, because 1:many genuinely needs unique paths.**
- **Cache = `?v=updated_at` nonce on read.** Stable filename ⇒ stable URL, so a `?v=<row.updated_at>` nonce busts the browser cache after a swap (Supabase Smart CDN already auto-invalidates the object on overwrite, ≤60s). Filename-versioning — the "stronger" cache-buster — is **rejected**: it's the opposite of stable-filename and re-creates orphans.
- **Orphan cleanup = Storage API, not SQL.** A raw `delete from storage.objects` can leave the backing file billed; the Storage API delete (RLS-scoped) removes both. Cleaned 3 legacy orphans this way.
- **Deferred (own task): parent-delete file cascade across ALL buckets** — deleting a `product`/`company`/`deal` row leaves its storage files (a DB cascade removes rows, not storage objects). Needs a trigger/app-layer cleanup + isolation test.
- **Shipped to dev (#98); dev→main HELD** (a promotion would also ship Ayush's offline 3c/3d — joint call).

## 2026-06-15 — Discover soft-openness catalogue BUILT (slices 4–6)

- **Built per the 2026-06-14 L0→L4 lock.** A seller opts each product onto their public profile via `profile_visible` (Dial A) × `price_public` (Dial B); the **L0/L1/L2 level is derived at render** (no stored level column). A verified member sees another company's catalogue before connecting through the `get_discoverable_shop` SECURITY DEFINER RPC (safe projection, gated prices, never `cogs`); the RLS **"dial floor"** — `product` / `product_image` / `pricelist_item` public-reads all gate on `profile_visible` — is the backstop for direct reads. **Request pricing** = a `pricelist_request` inbox item; viewer state separates connect-pending from pricing-pending. Engineering in ARCHITECTURE-NOTES (2026-06-15); build + follow-ups (F1–F13) in `docs/muskan-build/discover-connect-loop.md`. PR [#104](https://github.com/HelloSello/hello-sello-mvp/pull/104) → dev **merged**.

---

## 2026-06-16 - Deal CHANGE flow: an edit is a HELD two-sided proposal (pending change + full lock), not an instant version bump

Extends the 2026-06-14 Waypoint 4.5 birth/acceptance work to the deal-CHANGE flow (4.5.4 = the backbone). Full design + the built/missing/wrong map: `_workshop/build-plans/6-pending-map.md` (§1, §2, §3A). ADR: `docs/architecture/adr/0001-held-deal-change.md`.

- **An edit is HELD until both companies accept (supersedes 2026-06-11 "edit_deal_draft commits a new version immediately").** Editing no longer touches the live card; the change waits as a **pending change** and the card keeps showing the last agreed version, changing ONLY on both-accept. A decline or a proposer withdraw discards it. *Why:* the card is the one honest signal the deal moved, and a human confirms every move (guards a Sella/system mistake).
- **The pending change is the strip's data, stored on the deal - not the card, not a chat message.** A `deal_pending_change` record, one active row per deal (DB-unique), holds the new SHARED terms + base version + proposer + source + the proposer's Change reason + votes. Transient (deleted on every exit); permanent history stays in `deal_card_log` + `deal_change_input`. Both the p2p strip and the deal-chat strip read this one row, so they stay synced (card displays, strip decides - confirms D5/D6).
- **Full lock while pending (pessimistic, on purpose).** While a pending change exists the Edit pencil is disabled for everyone; the DB-unique row enforces it under races, not just the button. *Why:* a two-company negotiation edits rarely and serially, so locking removes all version-clash code (chosen over optimistic concurrency).
- **Three exits, per company:** the OTHER company Accepts (+ Change reason) -> commit; the OTHER company Declines (+ Change reason) -> discard; the PROPOSER Withdraws (no reason) -> discard. Any person in the responding company, from either chat, decides for the company; the proposer cannot self-accept; anyone in the deal workspace (either company) may propose. **This pending-change Withdraw is NOT the seal Withdraw removed by D16** - the seal gate stays Accept/Decline only.
- **Change reason is captured in the strip, never a buried form field (confirms D8).** Edit pencil -> form (shared + the editor's own private items) -> Done -> strip pop-up collects the Change reason + Send. SHARED terms -> the pending change; PRIVATE numbers (buying price / COGS) -> written to the editor's own side immediately, NEVER in the pending change (privacy - both companies read the strip in the deal chat).
- **Announcements: both chats, both outcomes (supersedes the 2026-06-15 D18 accept->deal / decline->p2p split).** Accept and Decline each post a uniform system message to BOTH the deal chat and the p2p chat; Withdraw = a quiet notice. (Exact wording = 4.5.5 / T3.)
- **Commit reuses today's version-build logic, run later.** On the second yes, the existing `edit_deal_draft` body builds version base+1 (snapshot shared lines, carry both sides' private boxes forward), status stays `draft` (the final golden seal is end-of-lifecycle, out of scope now), writes the log line + BOTH Change reasons, fires the announcement, deletes the pending row, unlocks.
- **Parked:** the final golden seal (end stage); per-product private cost -> margin + edit-form redesign (map T5b); Sella detecting changes (map T6); C2C ticketing (map T7/T8).

*Why record:* changes a locked decision (the 2026-06-11 instant edit) and is the backbone the rest of 4.5.4-4.5.6 hangs off. **Status: design locked 2026-06-16; 4.5.4 build not started.** (Sources: 2026-06-16 grill-with-docs session; `6-pending-map.md`; ADR-0001.)

## 2026-06-17 - Phase 1 (4.5.4) BUILT; the golden Seal is REMOVED from the strip (deferred to the deal's final stage)

The 4.5.4 held-change backbone above is now built, verified, and GSD-complete (e2e green, 8 passed; 5 deal-domain migrations, LOCAL only - cloud apply pending: `docs/deploy/cloud-migrations-pending.md`). Two decisions emerged while building:

- **The two-seat golden Seal control is removed from the deal strip and deferred to the deal's FINAL stage (design TBD).** *Why:* accepting a *change* was leaking into the *seal* state - `confirm_deal_change` wrote a `deal_confirmation` row with `status='confirmed'`, which the Seal gate reads as "this side has sealed", so after a change the strip showed a false "Awaiting <company>" pill and the card could turn golden. Shared table, two meanings → one feature corrupting the other. Fix is two-part: (1) `confirm_deal_change` no longer writes `deal_confirmation` at all - the canonical change-reason store is `deal_change_input` (this supersedes the D-07 "wire `deal_confirmation.note`" sub-decision, which is dropped); (2) the Seal control (`sealControl` + its popover) is removed from `DealPin`. The `ConfirmBar` component and the `confirmDeal` action are KEPT (unused by the strip) for the future final-stage seal. This also aligns with the existing "final golden seal = out of scope now, deals stay `draft`" parking.
- **`deal_pending_change` must be in the `supabase_realtime` publication.** The strip subscribes to `postgres_changes` on that table so the lock + the "Review change" pill appear/clear LIVE on both screens; the table was missing from the publication, so it only updated after a manual refresh. Added via migration `20260617130000`. RLS still scopes realtime events to relationship members.

**Reconcile in Phase 2:** because the whole Seal control is already gone from the strip, the planned "remove the seal Withdraw from the gate" (D16 / map T4) may already be moot - Phase 2 planning must check what is actually left of the seal/gate before planning that task.

*Why record:* removes a shipped UI surface (the strip Seal) and drops a sub-decision (D-07's `deal_confirmation.note`), so it is load-bearing for anyone touching the strip or the final-stage seal. **Status: built + verified 2026-06-17; cloud apply deferred.** (Sources: this build session; memories `seal-deferred-to-final-stage`, `e2e-deal-setup-needs-birth-and-open`.)

## 2026-06-17 - Deal Card & Form overhaul: card data-model rule locked; margin (T5b) pulled into v1; the card Note is HELD

A long card/form grill-with-docs session (grounded against the live code + DB) widened the tiny "Phase 3 = Card Note" into a proper **Deal Card & Form** milestone, built for real (backend + data); visual polish deferred to the UI phase. Source of truth: `_workshop/build-plans/7-dealcard-form-overhaul.md`; data-model decision: ADR-0002.

- **One rule for the card:** a field shown on the shared card (both see it) is HELD - a change needs the other side's Accept/Decline; a field private to its owner is IMMEDIATE (own-side, ungated). Derived totals (value net/gross) follow their inputs.
- **The card Note is HELD, not immediate** (reverses the plan-phase working guess "D-34"). Per-company authored, both-visible; the other side Accepts/Declines a note change but cannot rewrite it; a Decline discards it. Reuses the edit-form note box; shows on the card face from birth; **removed from the log** (the create note lands in `deal_card_log.change_summary` today). Needs NEW storage that versions with the card.
- **Margin (T5b) moves from out-of-scope into v1, PER PRODUCT, shown as a percentage, owner-only.** Seller margin = (unit_price - cost) / unit_price; buyer margin = (resale - unit_price) / resale; per line + a deal average. Store the input (cost / resale), compute the margin. Wired through the EXISTING dormant tables `deal_line_item_private` (per-line, owner-only RLS) + `product_cost` (COGS) - not new schema, and not the public `deal_line_item`. Replaces today's single, mislabeled `deal_party_field` box (it hardcodes the seller label + `party_side='seller'`, so the buyer's number renders under the wrong label).
- **The card shows** batch number + measured THC/CBD (per line), payment terms, free delivery, and the per-side margin %. A deal line **belongs to a batch** (`product_batch`); measured values are snapshotted at deal time (frozen pattern). `deal_line_item` needs a `batch_id`; demo batches must be seeded.
- **Two value bugs fixed in the same area:** the card value must SUM the line totals (OBS-1: it can read 0 because `value_net` is stored, not recomputed live); the unit/price math must normalize kg vs g (OBS-2: prices are per-gram but the unit dropdown changes g->kg without converting the price).
- **Parked:** incoterms on the card (dormant column - never written, never shown; revisit with the team); the clickable product card + full detail/terpenes (reads the deal-time snapshot, ~1 week out); a configurable "pick what shows" display panel; SIGNALS stay per-company.
- **Re-scoped into phases 3a-3e** (display correctness -> held Note -> margin -> form UX -> batches); old Phase 4/5/6 shift after, and Phase 6's UI scope is re-checked once this lands.

*Why record:* supersedes the card-Note "immediate" assumption, un-parks T5b into v1, and locks the card data-model rule the rest of the milestone hangs off. **Status: design locked 2026-06-17; build not started; LOCAL-only, cloud push deferred + coordinated with Muskan** (she holds the `product`/`pricelist_item`/`product_image` RLS surface + a `supabase/migrations/` lock until her own push). (Sources: 2026-06-17 grill-with-docs session; `7-dealcard-form-overhaul.md`; ADR-0002.)

## 2026-06-17 - The deal form becomes a reusable "Deal Basket" (Option A) + a recipient field

A post-commit continuation of the Deal Card & Form session. Decision + detail: ADR-0003; design note `7-dealcard-form-overhaul.md` section 10.

- **The deal form is promoted to a reusable "Deal Basket"** - one model + form holding a deal's editable content + a recipient, fed by every trigger (human / Sella / shop); on send it becomes a Deal Card. The existing `DealForm` is already this ("dumb + fed", reused by create/edit) - we name it, and let Sella + the shop feed the same shape.
- **Option A chosen (transient):** the Basket lives only while the form is open and materialises into a Deal Card on send; nothing persisted. Option B (a saved/shareable Basket record) is deferred.
- **Rename** `DealForm` -> Deal Basket if convenient; keeping "Deal Form" is acceptable (the concept matters more).
- **New recipient field:** company mandatory, person optional; no person -> the deal addresses the company. Defaults from the trigger (p2p chat -> that person; C2C -> that company); panel/shop -> chosen from CONNECTED companies/people only.
- **Now vs future:** the Basket name + recipient field + the p2p-chat default are buildable now (foundational to the form work). Creating from Sella's panel / the shop, and company-only sending (no person), are FUTURE - the last needs the parked C2C ticketing. New req BSKT-01.

*Why record:* a reusable input model that unifies how every trigger creates a deal, and adds explicit deal addressing. **Status: design locked 2026-06-17 (Option A); build folds into the Deal Card & Form milestone; LOCAL-only.** (Sources: 2026-06-17 post-commit session; ADR-0003; `7-dealcard-form-overhaul.md` section 10.)

## 2026-06-18 - Phase 3e (Form product UX, FORM-01/02) built: pack-based basket quantity + the recipient row shown on create AND edit

Phase 3e shipped the Deal Basket's product-adding UX (built directly for speed + a frontend-design polish pass; backend untouched - no DB/RPC/migration). Code on `claude/ayush/work`, LOCAL only.

- **FORM-01 - increment, never duplicate:** re-adding a product that is already on the deal adds to its line instead of making a second row. Matched by `productId`; a custom line (`productId: null`) never merges. Pure rule in `src/modules/deals/lib/lineEditing.ts` (`addOrIncrement`), unit-tested.
- **FORM-02 - add by name + custom:** one search box over the in-memory own catalogue (`getOwnCatalog`) auto-fills a picked product; typing a name not in the catalogue offers "Add '<name>' as a custom product" (`emptyCustomLine`, `productId: null`). Custom productId-null lines were research-confirmed safe through create + held change + card read; the `confirm_deal_change` margin carry-forward deliberately skips null-product lines (documented limitation, left untouched).
- **Quantity is by PACK, not raw grams (grounded in the product table).** Each product has `pack_size_grams`; the basket steps quantity by one pack (+/- buttons), shows "N packs", and the grid shows a "selected" badge + the pack label ("10 g pack" / "1 kg pack"). The line still STORES grams and is still priced per gram, so the card money math (CARD-01/02) is unchanged. `getOwnCatalog` now also reads `pack_size_grams`. Fallback step = 1000 g when a product has no pack size (and for custom/edit lines).
- **The locked "To" (recipient/assignee) row now shows on BOTH the create form ("From chat") and the edit form ("Assigned").** This is the universal Deal Basket assignee field, **locked in p2p** (auto from the relationship). On edit it is company-level (the person needs the p2p chat thread, which the deal workspace does not carry yet - a small future add).

**Still future (the next-stage shop/Sella work, confirmed NOT built):** the editable recipient PICKER (a dropdown of connected companies -> their people), the shop/Sella basket entry points that would produce `source` 'shop'/'sella', and company-only sending via C2C chat. The recipient data model + `source` union already exist; the picker UI, the "list connected companies/people" read, and the C2C routing do not.

*Why record:* locks how basket quantity works (packs over a per-gram price) and that the assignee is now visible-but-locked everywhere, and states precisely what of the recipient-picker is built vs deferred so the shop/Sella stage starts from truth. **Status: built + verified locally 2026-06-18 (36 unit green, tsc+eslint clean, deal-change e2e green); LOCAL-only, no cloud changes (no migrations this phase).** (Sources: this build session; `7-dealcard-form-overhaul.md` §3/§10; ADR-0003; the live `product` table.)
## 2026-06-17 — Phase 4 plan: a REVOKED company is a new verification status, not an overloaded `rejected`

- **`company.verification_status` gains a fourth value `revoked` (additive lookup row, `is_terminal=TRUE`) rather than reusing `rejected` + a flag.** A *rejected* company never got in → routes to `/onboarding` to fix + resubmit (D-07); a *revoked* company was verified then HS-suspended → routes to `/home` with a hard-block "access suspended" banner (D-10), no resubmit. *Why:* two states with two pages and two copies — one status each keeps routing a single-field read; overloading `rejected` + a "was-verified" flag couples two unrelated UX flows onto one value and is easy to get wrong. **Status: planned (Phase 4, 04-01 migration `20260617140000`); not built.** (Source: Phase 4 plan-phase session; 04-RESEARCH.md.)

## 2026-06-17 — Phase 4 BUILT + code-review complete; `createCompany` revoked guard is a direct DB check, not `requireVerified()`

- **Phase 4 (auth-gate hardening) is fully executed and code-reviewed** (follows from the `revoked` status plan above — now built and green). 04-01–04-04 all complete; code review (04-REVIEW.md) found 1 critical + 4 warnings, all 5 fixed.
- **The `createCompany` Server Action guards against revoked users with a targeted `verification_status === 'revoked'` check + early `{ error }` return, NOT `requireVerified()`.** *Why:* `requireVerified()` calls `redirect()`, which is incompatible with a Server Action that must return an `ActionResult` object. The onboarding flow uses `createCompany` to build the company record during signup; revoked users reaching it directly via POST must get an error response, not a redirect. The layout's Bouncer 1 handles redirects; the action-level guard handles direct POST. *(WR-01, Phase 4 code review — `src/app/onboarding/actions.ts`.)*

## 2026-06-18 - Phase 3f (Batches end-to-end, BTCH-01) built: a deal line points at one batch with frozen measured values; product+batch is one entity; margin carry-forward keyed on product+batch

Phase 3f wired the dormant batch layer end-to-end (deal-domain only). A deal line now references one `product_batch` (the chosen lot); the batch's MEASURED THC/CBD + batch number are snapshotted (frozen) onto the line at deal time and shown on the card. Design: `_workshop/build-plans/7-dealcard-form-overhaul.md` §5; ADR-0002 (snapshot/frozen rule).

- **D-06 - product + batch is ONE entity.** Picking a catalogue product does NOT create a line by itself; it opens a MANDATORY batch dropdown, and the line is born only once a batch is chosen - so a catalogue line can never exist without a batch (enforced at add-time; `canSubmit` is the backstop). An off-catalogue custom product (`productId: null`) is exempt - no batch.
- **D-09 - the per-line margin carry-forward keys on `product_id` + `batch_id`** (supersedes the earlier "known limitation" that joined on `product_id` alone). Because the merge key lets the same product sit on two lines (batch 4 vs batch 5), a product-only join would land a margin on the wrong line on a version bump. The `confirm_deal_change` private carry-forward now adds `and new_line.batch_id is not distinct from old_line.batch_id` (`is not distinct from` keeps legacy null-batch lines matching). The only case left ambiguous - two custom lines (null product + null batch) carrying a margin across an edit - is a deferred recorded fix (the existing `product_id is not null` guard already skips custom lines).
- **Snapshot storage:** the batch's measured THC/CBD is written into the line's EXISTING (empty) `thc_percent`/`cbd_percent` columns; only `batch_id` + `batch_number` are new columns. The freeze rides on the held draft (snapshot-through-draft), carried verbatim across version bumps - never re-read from the live batch. This also fixed a latent bug where measured values were written to dead `metadata` on birth and dropped on a version bump, across all three birth doors (`createDeal`, the proposal path `confirm_detected_deal`, and the version rebuild `confirm_deal_change`).
- **RLS:** `product_batch` stays seller-private (`batch_all`); the buyer only ever sees the frozen public snapshot on the line. 2 migrations (`20260618140000_deal_line_item_batch`, `20260618150000_confirm_detected_deal_batch`); 8 demo batches seeded.

*Why record:* locks the batch data path (one line = one chosen lot, frozen) and the two refinements Ayush drove - product+batch as one entity (D-06) and the margin join now batch-aware (D-09, which removes the prior limitation). **Status: built + verified 2026-06-18 (7/7 must-haves; unit 41/41; deal-change e2e 20/20; full 75-migration `supabase db reset` green after merging Muskan's dev work). LOCAL - cloud push deferred + coordinated with Muskan (15-migration batch).** (Sources: this build session; the `03F-*` planning artifacts; ADR-0002.)

## 2026-06-20 — Person name is a single canonical `display_name`, set by every signup path; onboarding gates on it (not first/last)

The split `first_name`/`last_name` model couldn't represent mononyms / single-name social logins — the first real Google signup ("Muskan", no surname) got `last_name = ''` and could never complete the "Your profile" onboarding step (which required `last_name`). Root cause: two competing name representations (the UI edits `display_name`; the check read first/last) that disagreed.

- **`display_name` is the canonical name.** Every signup path populates it: the `handle_new_user` trigger now sets it (provider `full_name`/`name`, else a compose from the resolved first/last), and the email signup form sends a single `full_name`. `first_name`/`last_name` stay only as DERIVED values for the QR vCard — no longer the source of truth for "the name".
- **Onboarding "Your profile" completeness is a pure, unit-tested rule** (`profile.isProfileComplete()` — single source of truth), NOT an inline first/last check. Research-backed (W3C personal-names; single-full-name-field UX): never require a surname; one field absorbs mononyms, middle names, reordered names. No academic-title / middle-name field (the single field covers them).
- **One-time backfill** filled `display_name` for existing rows from first+last (idempotent), in the SAME migration as the trigger change — data and rule migrate together, so pre-change accounts aren't broken by the new rule.

*Why record:* locks the canonical-name model and that the completeness rule lives in one tested function. **Status: built + verified 2026-06-20 (46 unit green, tsc clean; trigger + backfill verified on local `db reset` and applied to cloud `20260620120000_canonical_display_name`; auth-trigger e2e written but blocked by pre-existing local fixture-key rot).** (Sources: this session; W3C Personal Names; SaaS onboarding research.)

## 2026-06-20 — Onboarding profile completion = name + title only; profile photo is OPTIONAL (not a completion gate)

Surfaced during 6.1 UAT: the home checklist sends an unfinished "Your profile" to the onboarding stepper, which collects name + title but NO photo — yet completion required a photo, so the step could never tick it (you had to detour to `/account`).

- **Decision: drop the photo from the required completion check** → profile complete = `display_name && title`. Photo stays available (and can be nudged) but never blocks. Resolves the stepper-vs-settings disparity (the step now collects enough) AND follows industry practice.
- **Why (researched, per the "research common patterns first" rule):** SaaS onboarding best practice — only require a field if the product can't function without it; every extra required field ≈ 7% conversion drop; request photos AFTER first value (progressive profiling), not during setup. (ProductLed, Candu, DesignRevision, 2025.)

*Why record:* locks that onboarding completion is name+title and photo is optional, with the reasoning. **Status: DECIDED 2026-06-20, NOT yet built — implement next session (small change to `isProfileComplete` + its unit tests + the home comment).** (Sources: this session UAT; SaaS onboarding research.)

## 2026-06-20 — E2E fixtures derive the local Supabase key from the running stack; never hardcode

The 3 auth specs hardcoded the legacy demo service-role JWT. The local stack (Supabase CLI 2.75) now uses asymmetric **ES256 JWT signing** (CLI default) + the new **`sb_secret_`** API-key format, so the hardcoded HS256 JWT no longer authenticates → every auth E2E failed ("key rot").

- **One source of truth: `e2e/fixtures/local-supabase.ts`.** Resolves `LOCAL_SERVICE_KEY` in order: `SUPABASE_SECRET_KEY` env override → parse `supabase status -o env` (`SECRET_KEY`) → throw a clear "is the stack up?" error. The running stack OWNS its keys; tests derive from it. Deletes the 3 duplicated hardcoded copies. Fail-loud beats a cryptic 401.
- **`auth-trigger` is deferred, not fixed.** It calls `auth.admin.createUser`, which needs an **ES256 `service_role` JWT**; the new stack 403s `sb_secret_` on GoTrue admin endpoints (works for PostgREST/DB, not admin auth). The clean fix needs a direct-DB insert into `auth.users` (a `pg` dev-dependency) — deferred since signup was manually verified end-to-end (session 33).

*Why record:* locks the "never hardcode a rotating local key" rule and the single-source-of-truth fixture. **Status: built + pushed 2026-06-20 (commit `f42f04b`) — `admin-verification` green, `auth-gate` 5/6 (1 fail = known append-only `audit_log` DELETE bug, unrelated), `auth-trigger` deferred.** (Sources: this session.)

## 2026-06-20 — Parallel work uses git worktrees + `.worktreeinclude`; `.planning` coordination is git-tracked only

A single engineer now runs several sessions at once (one per phase) to work in parallel. Settled how those sessions isolate and coordinate.

- **Isolation:** each parallel session runs in its **own git worktree on its own branch** (`claude --worktree <name>`). Code edits never collide; sessions meet only through git (push → PR → merge).
- **GSD planning inside worktrees:** a personal (gitignored) **`.worktreeinclude`** auto-copies `.planning/`, `CLAUDE.md`, and a personal `SessionStart` hook into every new worktree. Because it *copies*, each worktree keeps its OWN `STATE.md`/session-log (no clobbering); `ROADMAP.md`/`REQUIREMENTS.md` are read-mostly and edited in ONE place (the main checkout) — new worktrees inherit the latest at creation time.
- **Coordination channel = git-tracked files only** (code + `docs/team/sync/*`). `.planning/` is per-worktree/gitignored and is never used to coordinate. Ownership-first (split work into disjoint files); lock genuinely-shared files via the sync ritual.
- **Industry-validated:** git worktrees are the consensus mechanism for parallel coding agents; Claude Code ships native `--worktree` + `.worktreeinclude`. Agent-teams (shared task list + mailbox) exists but is for one-session multi-teammate work, not N independent long-running phase sessions, and still requires ownership boundaries.

*Why record:* locks the team's parallel-execution model so future sessions don't re-derive it, and documents why neither GSD workspaces (start empty) nor workstreams (don't isolate code) fit "parallel phases of one roadmap." **Status: setup DONE 2026-06-20 — personal gitignored `.worktreeinclude` + `.claude/hooks/session-start-coord.sh` + settings; general protocol added to `docs/team/WORKFLOW.md` "Parallel worktree sessions".** (Sources: this session; Claude Code worktrees + agent-teams docs; 2026 parallel-agent coordination research.)

## 2026-06-19 - Recategorisation + decision sweep (UI-first reorder, notification, message-voice, pack model, Deal Room rename)

A working session that re-sorted all open/not-done work into categories and closed the small open decisions. Working scratch (categorised board): `_workshop/notes/2026-06-19-recategorise-roadmap.html`. No code this session - decisions + doc updates only.

**Build order / prioritisation**

- **The UI pass (old Phase 6) moves to the FRONT - build it next, before notification + Sella.** *Why:* the notification bell, the Deals pop-up, and Sella's "proposed change" renderer all need a settled chat header + chat-top section; building them first then reshaping the chat in the UI pass means touching `ThreadView` / `DealPin` / `MessageBubble` twice. Settle the container first; inside the UI pass settle the deal-card layout early so the deal-card *content* work is not redone on a changing shape.
- **Suggested order after UI:** Notification (as part of global notifications) → Sella change-detection → Deal Basket / Deal-form flexibility. Ops (the cloud migration push) runs alongside, not far down.

**Notification**

- **The cross-deal alert ("another of your deals changed") is a SUBSET of the global app-wide notification feature - build it once, inside global notifications, not as a standalone piece.** *Why:* a separate bell + dot + read/unread just for deals would be rebuilt when global notifications land.
- **The unread dot must PERSIST across refresh until opened.** *Why:* a live-only ping cannot answer "what happened that I have not seen yet" - that needs a stored notification + a per-person seen flag; this is the design driver that gives the global feature its own small table.
- **Direction:** a bell in the chat + a bell in the global header (same data, two places); reuse the existing RLS-scoped realtime (`use-chat-realtime.ts`) as the live "re-check" signal and derive the actionable badge from the authoritative `deal_pending_change` row (do not store a second copy of that fact). Exact shape decided when built.

**Message-voice model (NEW discussion - belongs to Sella)**

- **Open topic: define the difference between a System message and a Sella message, and which voice narrates a deal event in the deal/p2p thread.** The three voices are `person`, `system`, `sella` (`MessageBubble.tsx`); the intended rule (`types.ts`) is `system` = the C2C audit voice, `sella` = the narrator in p2p/deal threads. But there is DRIFT: "Deal draft created" posts as `system` into the deal thread (`create_deal_draft`), while accept/decline announcements post as `sella` into the deal + p2p threads. *Why record:* this drift is the root of OBS-3; the fix is one rule ("a deal-lifecycle event in the deal/p2p thread always speaks in voice X"), decided in the Sella discussion. Until then OBS-3's voice is open.

**OBS decisions (deal card / form)**

- **OBS-3 - the first proposal SHOULD post a quiet notice (option three), not a person-style chat bubble.** The VOICE (System vs Sella) is deferred to the message-voice discussion above. *Why:* a "Deal proposed" person-bubble competes with the rule that the card/strip is the one signal a deal moved; a quiet notice matches how resolutions are announced. (Today's person-style bubble comes from the pre-Phase-2 `propose_deal_rpc.sql:69`.)
- **OBS-1 - picking a product defaults its line to quantity `1`, in the product's own natural unit.** *Why:* removes the misleading `0 €` card (value = price x quantity, so quantity 0 reads 0) without forcing a mandatory-quantity rule; the user types the real quantity over the default.
- **OBS-2 - the card display follows the already-built pack model; drop the free g/kg line unit so a per-gram price can never sit against a kg quantity.** The pack-count model already exists for input (2026-06-18 / Phase 3e: the basket counts packs of `product.pack_size_grams`; the line stores grams + is priced per gram). OBS-2 extends it to the card display: every product is a fixed pack, quantity is a COUNT of packs, weight = count x `pack_size_grams`, the user picks counts and sees grams, and the free g/kg `unit` choice is removed so the `8 EUR/g`-against-`1.0 kg` mismatch cannot be expressed. *Why:* fewer independent inputs (unit fixed by the product, weight derived) makes the bad state impossible by construction. **Implementation lands in the deal-form / Deal Basket phase.**

**Deal Room rename (DEV-66) - supersedes the 2026-05-19 "Deal Room" (DEV-22) + "Deal Workspace" naming**

- **The internal deal container is renamed "Deal Workspace" -> "Deal Room"; the customer-presentation surface is renamed "Deal Room" -> "Presentation mode".** One name = one surface. *Why:* Marcel's DEV-66 wants the friendlier "Deal Room" for the working container, but "Deal Room" was already the presentation surface - the swap frees the name and removes the clash. "Presentation mode" also aligns with the existing DEV-18 "Presentation Mode" concept (turning a product selection into a customer presentation), so it unifies rather than adds a term. The DB table stays `deal_workspace` (internal); the user-facing + docs sweep happens in the UI phase. **Watch:** "Presentation mode" sits near the surface name "Present" - confirm final wording at the UI-phase kickoff. CONTEXT.md term rows updated 2026-06-19.

**Triage of the not-a-phase backlog (parked / folded)**

- **Per-side owner / side_lead DB enforcement - PARKED until multi-person-per-company is real.** *Why:* with one person/owner per company today the invariant cannot be broken; triggers/indexes now are speculative.
- **Manual-create counterparty-person threading - FOLDED into C2C ticketing (T7).** A deal addressed to a company with no contact person only makes sense once a queue-and-claim flow can catch it. C2C routing: select a person -> routes like today's p2p but lands in the connected company's inbox; not a mandatory claim - pick up or reassign. Connected vs not-connected companies (T8) is built first and gates inbox-vs-p2p.
- **Audit-chain "born_now" flag fix - FOLDED into the Sella phase (P5).** RPC-born (Sella-detected / proposed) deals miss their `deal.created` audit entry because the idempotent RPC cannot tell "born now" from "already born" (`actions.ts:381`); fix when P5 reworks the detect/propose RPCs (touch the hash-chained log once). *Why:* the missing trace is exactly on AI-detected deals, where the audit trail matters most.
- **Access-matrix encoding (16-combo, DEV-51) - PARKED as post-MVP research.** Keep RLS as the floor + the app-layer policy module (locked 2026-05-29, B7); revisit a DSL/engine only when the hand-written matrix gets hard to verify.
- **Home / landing view (DEV-13) - PARKED (not for now);** revisit in the UI/nav work, leaning chat-first (the product is conversation-centric).
- **Deal origins beyond P2P (Shop + Sella) - land as part of the Deal Basket work** (the Basket, 3b, was built reusable for Sella/shop), not a separate task.
- **File uploads in the `+` menu - PARKED as a separate backend slice** (storage bucket + RLS).
- **The top-bar "Aurora Deutschland" placeholder is Muskan's** (wire to the real logged-in company) - removed from Ayush's list.

*Why record:* closes the small open product decisions (OBS-1/2/3, DEV-66), sets the UI-first build order, frames the notification + message-voice work, and parks/folds the backlog so the roadmap reflects one agreed plan. **Status: decisions locked 2026-06-19; no code this session; OBS-2 + the rename + notification + message-voice are to-build / to-discuss in their phases.** (Sources: 2026-06-19 recategorisation session; scratch `_workshop/notes/2026-06-19-recategorise-roadmap.html`; `MessageBubble.tsx` / `types.ts` voices; `product.pack_size_grams`.)

## 2026-06-19 (later) - Build order FINALISED (supersedes the "suggested order" above)

Ayush set the build order for the remaining work: **1. UI & chat -> 2. Deal Basket / Deal form (NEW phase) -> 3. Sella -> 4. C2C chat (NEW phase) -> 5. Notification -> 6. Other items (parked).** This supersedes the "suggested order" in the entry above (which had Notification at #2 and no separate Deal Basket / C2C phases).

- **The UI pass moves to the FRONT** (old Phase 6, built first); inside it, settle the deal-card layout early so the next phase's content work is not redone.
- **Deal Basket / Deal form becomes its own NEW phase** (#2): the OBS-2 count-of-pack display, card flexibility (text + link cards, pre-sell non-catalogue), clickable detail, configurable display panel, Shop + Sella origins, persistent Basket. Needs a `/gsd:phase add`.
- **C2C chat is promoted to a NEW phase** (#4): T7 ticketing + T8 connected/not-connected, absorbing manual-create person-threading. Needs a `/gsd:phase add`.
- **Notification drops to #5** (still built as a subset of global notifications).
- **Everything else parks** until 1-5 are done.

*Why:* one agreed sequence so the next session starts on UI & chat immediately (`/gsd:plan-phase 6`), with the heavier card-content + C2C work sequenced behind the surface they sit on. **Status: order locked 2026-06-19; the UI phase (P6) is next; the two NEW phases need `/gsd:phase add` before planning.** (Source: 2026-06-19 prioritisation session; `.planning/ROADMAP.md`.)

## 2026-06-20 - Connect/Chat F2 navigation BUILT: one accordion rail, full-width glass TopBar

F2 (global chrome) of the Connect/Chat UI overhaul: the two old nav bars merge into ONE rail and the chrome settles before the card/strip/form content work lands on it. Source plan: `_workshop/build-plans/2026-06-19-chat-ui-overhaul.html` (slice F2); the three nav models were built as throwaway prototypes in `prototypes/rail-prototype/` and compared before locking the accordion.

- **D-11 - one-rail ACCORDION navigation (supersedes the two-nav-bar layout).** The two old nav bars merge into a single rail (`IconRail`). Connect is an accordion: clicking it expands its sub-items IN PLACE as an indented tree and the other surfaces STAY visible; collapsed, the rail shrinks to a 64px icon strip with hover tooltips and a flyout popover for Connect's children. *Why:* chosen over a "replace / drill-down" model (where the other surfaces disappear while you are inside Connect) after building all three models as prototypes and comparing them - the accordion never hides the other surfaces, so a user can never feel lost about where they are, and it matches the reference apps Ayush supplied. The drill machinery is written generic, so any future surface can carry sub-items without new plumbing.
- **D-12 - "Inbox" is relabelled "Connection Request"** (label only; the route stays `/connect/inbox`). *Why:* the word names what the item actually is (an incoming request to connect), with zero routing change.
- **D-13 - Connect sub-item order is Chat, Connection Request, Relationship** (Relationship still disabled / "soon"). *Why:* Chat is the daily surface so it sits first; the dormant Relationship item stays last and visibly disabled.
- **D-14 - the TopBar is a full-width glass bar, not a floating slim pill; the search field lives in the TopBar, NOT in the rail.** *Why:* a full-width bar gives the search a stable home and keeps the rail purely navigational (icons + accordion), so search and navigation do not compete for the same edge.

*Why record:* locks the global chrome shape (one accordion rail + full-width glass TopBar + search location) that the rest of the Connect/Chat overhaul - the deal card, strip, and form - will sit inside, so later content work starts from a settled container. **Status: built + verified 2026-06-20 (prod build green; unit 41/41; tsc + eslint clean; adversarial 3-lens review - 1 real bug found + fixed). LOCAL only (branch `claude/ayush/work`, not pushed).** (Sources: this session; `_workshop/build-plans/2026-06-19-chat-ui-overhaul.html` slice F2; the rail prototypes in `prototypes/rail-prototype/`.)

## 2026-06-21 - Phase 04C (Card + Form UI touch) BUILT: slim shaded card header, card-as-leaflet over the conversation rail, one-tap Deal Form pick, Damson deep-pink recolor

The light "UI touch" on the deal card + deal form, so the final Agentation polish stays light. Decided SEE-FIRST: a parallel design workflow (8 agents = maroon recolor + 3 card + 3 form variants + a design critique) produced a throwaway glass prototype (`prototypes/04c-touch-prototype/`); Ayush approved it, then the winners were ported directly to the app (no GSD ceremony - Ayush said apply it fast).

- **D-15 - the brand deep-pink recolors `#76002d` → `#7a1638` (Damson), app-wide.** *Why:* the old maroon was dark but 100%-saturated, so against the cotton-candy pinks + white glass it read "too bright"/harsh. Damson keeps the depth (AAA white-text contrast) but drops saturation to ~69% and nudges the hue toward raspberry, so it reads as the same berry family. `--glass-shadow` now DERIVES from `--color-brand-deep` via `color-mix` (single source of truth), so the recolor re-tints the whole glass language in one place. All hardcoded deep-pink hexes (`#76002d` / `#8c0036` / `#3a0016`) removed.
- **D-16 - the Deal Card opens as a LEAFLET over the conversation rail, not floating in the chat thread.** `DealPin` (chat variant) portals the card into a `hs-deal-card-slot` in `ConversationList`; the rail widened `w-64`→`w-72`. The Deal Room (workspace) variant keeps the inline card. *Why:* the card floating inside the thread was disturbing (Ayush); the rail is the same place/shape the New chat picker already uses, so it reuses a known surface and gets the card out of the message stream.
- **D-17 - the card header is a SLIM SHADED band, not the old tall solid maroon block.** A soft deep-pink glass wash holds a calm ink value hero + a deep-pink hairline underline; the offered-story line moved below it. *Why:* the old ~118px solid band dominated the card (worse in the narrow rail); a slim shaded header reads professional AND gives the Damson accent a surface so the colour is actually visible (a plain white header made the recolor invisible).
- **D-18 - the Deal Form picks product + batch in ONE tap (a batch rail), no modal popup.** Each search result shows its batches as tap-to-add chips carrying that batch's measured THC/CBD; batches are preloaded. *Why:* the old click-product → modal-batch-picker → add was a two-step interruption; one inline tap preserves the batch-level truth (BTCH-01 / D-06) while removing the popup.

*Why record:* these are the visual-language + card-placement decisions the Deal Room build (next) and the final Agentation polish will sit on top of. **Status: built + gate-green 2026-06-21 (tsc 0 + eslint 0 + 62/62 unit + next build ok); COMPILE/BUILD verified only - the card was not seen live (needs a minted deal), so a human visual UAT is owed. LOCAL only (branch `claude/ayush/work`, commits `c29ea4c` + `37ec4e8`, not pushed).** (Sources: this session; `prototypes/04c-touch-prototype/NOTES.md`.)

---

## RBAC / permissions

- **Configurable RBAC matrix approved as Phase 14 (post-v1.0), reversing the v1 two-role-only scope (2026-06-21).** Phase 11 shipped two fixed company roles (Superadmin / Member) on top of the flexible `permission_matrix_entry` tables — only two actions (`team.manage`, `company.edit_profile`) seeded + enforced. Product now wants the full configurable matrix: a Superadmin defines custom roles, grants/revokes individual actions per role through a matrix UI, and assigns people to roles. **Scoped as its own Phase 14 (NOT folded into Phase 13)** because the real cost is enumerating a gated-action catalogue across the app + wiring `has_permission()` enforcement at each call site — the UI is the small part. **Post-v1.0:** does not gate the Phase 8 capstone (the live walk runs on the two-role model); the two-role default stays until Phase 14 lands. *Why:* makes the dormant matrix a real product surface, but honestly sized — the value is in enforced-action coverage, not the screen; deferring keeps the onboarding-ready milestone shippable. (Req IDs RBAC-05–08; ROADMAP Phase 14.)

---

## 2026-06-22 — Products are location-scoped (one product = one location)

A product belongs to **exactly one shop location**; there are **no multi-location products**. A company has many locations (e.g. Berlin DE, Manchester UK); each location has its own product list. Same-named products across locations are **separate** entries because they genuinely differ — German vs UK **packaging, labelling, regulatory** (Marcel). Model: **Company → many Locations → each Location's own Products → each Product's Batches**.

*Why:* matches reality (a German product carries German packaging and differs from its UK equivalent) and keeps the model simple — no product↔location many-to-many. *Schema implication:* a `location` entity per company + `product.location_id` — a **Phase-7 build, not yet in the schema** (verified: `product` has no location column today). (Source: 2026-06-22 Present / Manage-shop design session with Muskan; Marcel's packaging rationale.)

---

## 2026-06-23 — Price-list home + custom-pricing phasing (Present / DEV-1 / DEV-41)

The **Standard** company-wide price list lives in the **shop**: born on first CSV import, managed / edited / sent from Manage shop. This is **Phase 7's** scope — one list per company.

**Per-customer custom lists are a dedicated future phase (Phase 15), not Phase 7.** Model: **born in the shop** (seller overrides prices while building an offer) → **persist on the Relationship page** (DEV-41 Proposed→Approved→Applied) → resolve **per-recipient via the DEV-1 cascade** on outgoing offers. Requires new schema (`pricelist.relationship_id`, NULL = standard / set = customer-specific) + the DEV-41 approval primitive — **neither built today** (verified: `pricelist` is company-scoped only; no approval state machine in code). In **Phase 7** the seller send step **picks the Standard list**, and any per-line edit is a **one-off snapshot onto the deal** (`deal_line_item.unit_price`), never a saved list — so the prototype's `customLists` persistence is dropped.

**Folds into Phase 7 (no migration — schema already stores it):** the dropped **batch-detail CSV columns** (`shelf_life_months`, `loss_on_drying_percent`, `water_activity`, batch `cbg/cbn_percent`, `description`, `bundle_description`) go back into the template + parser + import RPC fan-out; **CSV upsert by Supplier Product Code** + an **export-catalog** button become the no-ERP update path. The unique key `uq_product_supplier_code_active` already exists, so upsert needs no migration.

*Why:* custom pricing is cross-cutting — 4 surfaces (Present + Relationship + deal + a new approval primitive), both engineers' lanes, schema change + a state machine — so sequencing it as its own slice (Phase 15) keeps the Standard path a clean tracer bullet and removes the prototype's half-built `customLists` inconsistency. Batch detail and the update path are pure Present-lane and storage already exists, so they belong in Phase 7. **Industry-confirmed** (Shopify / WooCommerce / Magento: one combined product+price CSV; bulk update = re-import-with-overwrite keyed on SKU; per-customer/tiered prices = a separate price-list import). (Sources: 2026-06-23 design session with Muskan; Marcel's Product-list + Pricelist CSVs in `docs/CSV's/`; web research on B2B catalog/price CSV practice.)

---

## 2026-06-26 — Location/warehouse model: structured addresses are their own phase (Phase 16), not Phase 7

Marcel confirmed (DEV-80 thread) the warehouse model: **(1)** each location has its **own** warehouse address(es) buyers see (Germany view → German address); **(2)** a location can hold **more than one** address; **(3)** location naming is **free-form** (e.g. "Germany North", "Germany South"); **(4)** addresses must be entered correctly because they **populate the Sales Order / Purchase Order documents** (Ayush's deal docs, `src/modules/deals/lib/derive.ts`) — structured order data, not display text.

**Decision: the structured location→multi-address registry is its own future phase (Phase 16 — Locations & Warehouses), NOT Phase 7 and NOT Phase 15 (pricing).**
- **Phase 7 keeps location as a free-text label only** (`product.location varchar(80)`, D-07): it drives the grid tabs + the existing **single** `company.warehouse_location` line. Delivers Marcel's "different products/packaging per location" (each product sits in one location) — the part the shop needs. No registry, no multi-address, no structured fields.
- **Phase 16 owns** the location entity (name + structured address fields), multiple addresses per location, a "Manage locations" in-platform form, and wiring addresses into the Sales/Purchase Order docs.

**Input model (researched — hybrid, industry-standard):** warehouse **addresses are entered in-platform** via a structured, validated form (set up once); **products reference a location by name** via a CSV column + an in-app dropdown (name-matched like terpenes, warn on unknowns). Rationale: addresses feed order documents → they need validated structured fields a spreadsheet cell can't enforce; locations are few + stable (form), products are many + churny (CSV). (Source: Shopify "set up locations before assigning inventory" — Locations in Settings + a separate location-referencing inventory CSV; B2B platforms add address validation because the address drives shipping/order docs.)

**Cross-lane + sequencing:** Phase 16 **depends on Phase 7** (the shop must exist) and **touches Ayush's deal/order-doc lane** — design the address fields *with* him against what the Sales/Purchase Order docs need; do not design the schema before that.

*Refines the 2026-06-22 "location entity + `product.location_id` = Phase-7 build" note:* the **entity/registry moves to Phase 16**; Phase 7 ships the lighter free-text label (D-07). (Sources: 2026-06-26 session with Muskan; Marcel's DEV-80 answers; web research on B2B multi-warehouse data entry.)

---

## 2026-06-29 — Persistent shared basket + seller-owned deal pricing (Phase 7 absorbs Phase 6 Deal Basket)

**Basket is now persistent and app-wide (reverses ADR-0003 "Option A / transient" and Phase 7 D-12).** A user's basket survives across sessions (saved, not in-memory). It is the shared **Product Basket** layer of the locked 4-layer model (Product Card → Product Basket → Deal Basket → Deal Card), built **once** and reused by both the shop and the deal flow.

**Both sides build baskets (symmetric):** a **buyer** fills a basket from *other* companies' shops; a **seller** fills a basket from *their own* shop to send to buyers. Same component, two entry points.

**Cross-company basket, per-seller offer:** one basket may hold products from several companies, **grouped by seller**; turning it into a deal produces **one deal card per seller** (two shops in-basket → two offers).

**Deal pricing is seller-owned ("Model B" — answers the open Phase-6A question):** the buyer offers a card with products + quantities (+ delivery) but **no price** — "I want these, send me your price." The **seller fills unit prices**, sends back; **both confirm** to close. Each side keeps its own private number (seller cost / buyer resale → own margin %), never shared.

**Phase 6 (Deal Basket) folds into Muskan's expanded Phase 7.** Ayush handed Phase 6 over (2026-06-23, `_workshop/handoff/phase-6-context.md`) as "almost the same work as the Product Basket Muskan already owns"; no Phase 6 code existed. The Deal Card terminus (`src/modules/deals/`: DealCard, DealForm, held two-sided change, `buildCreateBasket`, recipient resolution) already exists and is reused as-is.

*Why:* the locked 4-layer model already intends one shared Product Basket; making it persistent + symmetric removes the "build throwaway, rebuild later" risk and merges Phase 7's cart with Phase 6's deal basket into one piece. Persistence (Option B) was deferred "until after Notifications" — reopened deliberately as the core buyer experience (DEV-95). *Open:* whether a seller's self-shop basket also persists across sessions. *Schema:* a persisted basket + basket-line store (new), keyed by owner + seller company — not built today. **Supersedes** ADR-0003's Option-A clause + Phase 7 D-12. (Sources: 2026-06-29 session with Muskan; `_workshop/handoff/phase-6-context.md`; Linear DEV-95/DEV-81.)

**Refinements (same session):**

- **Buyer's offer is a normal deal card; price follows the seller's *public* price** — if the seller published that product's price, the offer carries it; if not, the offer is sent **price-less** and the seller fills it. The **buyer can add a free note**.
- **Missing/unavailable batches never block a deal card** — a product can be added and a card **sent + received with no batch**; the batch is attached later. Relaxes the current batch-coupled flow. **Resolves Linear HEL-20 + HEL-17.**
- **Pre-sell = a real "Coming soon" shop product, not a throwaway line (DEV-84, in expanded Phase 7).** Seller creates a not-yet-stocked product with only the basics (name, optional price; **no batch / COA / lab values required**), status **"Coming soon"**, **visible in the public shop with a badge**. It behaves like any product (basket, deal card) and **graduates to live** when it arrives (seller fills batch/COA; existing deal references stay intact). Industry-standard: status-flag not a separate placeholder, "TBD" price allowed (Salesforce / Magento / BigCommerce / Shopify).
- **Seller's basket persists too — it is the *same* app-level basket** (one reusable component), filled from the seller's own shop instead of another's; it feeds the deal card. Persistence + symmetry apply to both roles.
- **Deal notes are per-side:** deal-level, **visible to both** parties, **editable only by their owner**, and they **save immediately** — no two-sided held-change accept (each edits only its own, so there is no conflict). A third field category beyond *shared+held* and *private+immediate*: **visible-to-both, owned-by-one, instant**.

---

## 2026-07-01 — Verify-email waiting screen: no cross-tab auto-advance

**The post-signup "check your inbox" screen does not promise the original tab will auto-advance.** The inbox confirmation link opens `/auth/confirm` in a **new tab**, which sets the session and lands the user on onboarding *there*. The original `/verify-email` tab cannot self-advance because Supabase `onAuthStateChange` **does not fire across browser tabs** — so the screen keeps its spinner but reworded to tell the user the link continues in a new tab and this one can be closed. This matches the Clerk/Okta industry standard (auto-advancing the original tab is the pattern most auth providers dropped; the alternative is to poll `getSession()`, which we chose not to do).

*Why:* the old copy ("This page continues automatically once you click the link") was a promise the code never implemented — pure UX debt, not a logic bug. *Follow-up:* the `Resend email` control still only runs a cooldown countdown — no server re-send is wired yet ([DEV-129](https://linear.app/hellosello/issue/DEV-129)). (Sources: 2026-07-01 session with Muskan; `src/app/(auth)/verify-email/VerifyEmailCard.tsx` @165f8f1; see ARCHITECTURE-NOTES cross-tab auth note.)

---

## 2026-07-02 — Shop ≡ Location is one entity; unlimited named shops + a GLOBAL default

A per-country/per-region **"shop"** (storefront: description + links, rendered on its Present page) and a **"location"** (warehouse address) are the **same entity** — reaffirming + extending the 2026-06-22 lock. A company creates **unlimited free-form named shops** — **not** strictly per-country (sub-country is fine, e.g. "North Germany", "South Germany") — with exactly one flagged **GLOBAL** (the default). Each shop carries **storefront presentation** (a description + a structured **links table**: shop × platform × name → rendered "**LinkedIn** name") **on the same object** as its warehouse address. Model: **Company → many Shops/Locations → each one's own products + address + storefront** — no parallel storefront entity.

*Why:* per-shop links/descriptions and the warehouse address describe the same real thing (a company's presence in a region), so a second storefront concept would duplicate knowledge and split the schema change. Keeps the location model in one place. **Cross-lane** — this is the Phase 16 data model, feeds Ayush's Sales/Purchase-Order docs; design the fields with him before schema. (Source: 2026-07-02 design session with Muskan; Marcel's Present-page batch DEV-111/112.)

---

## 2026-07-02 — Auth + onboarding quick wins (Outlook OAuth fixed; QR = vCard; photo optional; resend; 2FA deferred)

Batch of Marcel's auth/onboarding tickets (DEV-99, DEV-102, DEV-129), built + merged (PR #133 → dev; Outlook fix PR #130 → #131 → main).

- **Outlook/Azure OAuth fixed (DEV-99 #2).** `signInWithOAuth('azure')` sent no scopes → the default `openid` returns no email → GoTrue's code-exchange fails "Error getting user email from external provider" → the callback bounced to /login (Google worked because its default scope includes email). Fix = request `scopes: 'email profile'` for azure + the callback now logs the real exchange/provider error. **Azure app-registration config (done in the portal):** Supported accounts = "Any Entra tenant + personal"; Graph delegated `email`/`openid`/`profile` + admin consent; **`email` optional claim on the ID token**; redirect URI type = Web. Both personal + org accounts need this. Verified via the cloud auth log (successful `provider:"azure"` login).
- **Same-email identities auto-link.** Google then Outlook on the same verified email collapse into ONE Supabase user (providers "Azure, Google") — no duplicate accounts (a duplicate-account worry was raised, then retracted after checking the users table).
- **QR encodes the vCard directly (DEV-99 #5).** Scanning the profile/account QR now yields "Add Contact" (encodes `buildVCard`), not the web profile page — per Marcel. Digital-only use (no printing), so the live server-rendered QR always reflects current data; no frozen-data concern. `buildVCard` extracted to a pure `src/modules/profile/vcard.ts` with RFC-2426 escaping (`; , \` + CR/CRLF/LF) and omits an empty ORG.
- **Profile photo optional (DEV-99 #4).** `isProfileComplete()` no longer requires a photo (display name + title only); `AvatarUpload` added to the onboarding profile step as optional/skippable.
- **Resend confirmation = anti-enumeration (DEV-129, Done).** The wired resend returns a neutral result (errors logged server-side only) and always cools down — mirroring `requestPasswordReset` so it can't probe which addresses have pending signups.
- **2FA deferred (DEV-102 #1).** No login 2FA today; Supabase MFA (TOTP) can be added later — not MVP.
- **Approval sends no email (DEV-102 #2).** Company verification is a manual admin action in `/admin/verifications` (`approve_company` flips `verification_status`); no email to the user or the team. An "approved" email / "needs approval" alert would be a new feature.

*Still open in the batch:* DEV-99 #1 (Google consent shows the raw Supabase URL — needs a **paid Supabase custom domain**; Marcel/infra, not code) and DEV-99 #3 (business-category taxonomy → two levels, **both multiple-choice**; a DB-lookup migration, cross-lane with Ayush; prototype the onboarding UI first). (Source: 2026-07-02 auth/onboarding session with Muskan; Marcel's DEV-99/102/129.)

---

## 2026-07-03 — Catalogue ingestion architecture: DESIGNED + PARKED for post-demo (shared-Sheet pull + system-of-record reconciliation)

Deep design session (Muskan + two deep-research passes) on how sellers get products/batches/prices into their shop and keep it current. **Decision: the full ingestion system is DESIGNED but PARKED — not built for the 8 Jul demo.** For the demo, Present ships as a **visual redesign** (the existing Phase-7 six criteria) and Marcel populates his shop **manually** (manual-add already exists). Ingestion becomes its own phase built right after the visual lands. **Full design:** `docs/architecture/catalogue-ingestion-DESIGN.md`.

Locked design (to build later):
- **Four objects, kept separate, linked by keys** — Product · Batch · Standard price · Per-customer price. They change at different speeds → separate tables/uploads, not one glued sheet (also matches Marcel's 3 spreadsheet tabs; ERP feeds batches independently — SAP B1 `Items` vs `BatchNumbers`).
- **Keys:** the seller's **`supplier_product_code`** is the match key — **NOT an industry standard**, unique only within one company's own catalogue. A **hidden system UUID** is the real permanent link (survives renames). **PZN + GTIN** stored alongside as the real external standards (optional). Each table carries its own key (batch = `supplier_code + batch_number`).
- **3 fixed seller templates** mirroring Marcel's tabs: **A Products** (incl. standard price) · **B Batches** · **C Per-customer prices** (Phase 15). Buyer Product Code dropped. Research: template-first beats accept-messy-formats (the latter refuted for a lean startup).
- **Bud-size grades priced separately** — Tinies/Smalls/Mids/Larges are categories, each with its own quantity + price → a `batch_grade` sub-table under batch (new from Marcel's 07-03 sheet, with `harvest_date`).
- **Delivery = shared Google Sheet pull** (primary — Marcel already lives in a logistics-fed Sheet); file upload as fallback; both feed the SAME validation + upsert engine; ERP delta-API is the end-state on the SAME tables.
- **Reconciliation over a system-of-record:** Hello Sello keeps its own durable master of every product ever seen. Each pull DIFFs the Sheet vs the master → new / matched / **missing → auto-unavailable (soft)** / **returned → auto-restore**. Availability is DERIVED from presence-in-the-Sheet → **zero seller discipline** needed. Explicit `Status` column (Active/Discontinued/Coming soon/Hidden) is an optional override.
- **Safe reversible deletion:** soft-archive never hard-delete; snapshot every sync; **big-change guard** (a pull removing >~25% pauses + alerts = "wiped the Sheet" accident); import ledger + undo + notify. Products persist forever; a deleted row = hidden, returns when the row returns.
- **Availability status ≠ marketing badge** (New/Launch) — separate fields. Pre-selling unavailable/coming-soon items = Phase 17.

*Why parked:* demo is 8 Jul (5 days); a beautiful shop Marcel can populate by hand is the lean demo win, and the pipeline is invisible to the demo. Build the visual **on this model** (cards already show availability badges + grade pricing) so the ingestion phase later just adds an input pipe — no repaint. (Source: 2026-07-03 design session with Muskan; deep-research on 3PL/ERP feeds + B2B catalogue onboarding; Marcel's shared-Sheet idea + his updated Product-list sheet.)
---

## 2026-07-05 — Two-level business taxonomy: independent Category + Activity, two lookup tables, Custom free-text (DEV-99 #3)

A company is classified on **two INDEPENDENT, both-multi-select** axes — **Business Category** (sector: Pharma / Food / FMCG-CPG / Automotive / Services **+ Custom**) and **Business Activity** (supply-chain role: Marcel's 8 — Pharmacy / Wholesaler / Importer / GACP- · EU-GMP- · TGA-GMP-Cultivator / Manufacturer-Pharma / Other). Independent, **not nested**; **both required** at onboarding. *Why:* the two axes are orthogonal (a wholesaler can be Food or Pharma) and independence lets the platform expand past cannabis to other sectors without re-modelling — nesting would hard-code cannabis-era parent→child assumptions.

- **Schema = two separate lookup tables** (`business_category` + `company_business_category`), reusing existing `company_type`(+assignment) for Activity — *not* one table with a discriminator column. *Why:* web research on lookup-table design — dumping all codes into one table is the OTLT / "MUCK" anti-pattern; separate tables give normalization + DB-enforced domain integrity (an activity code can't masquerade as a category) + cleaner extension. (Reversed the initial single-table instinct after research.) Sources: ITPro Today + TDAN lookup-table articles.
- **Custom category = one `custom` lookup code + free-text `custom_label` on the assignment row** (CHECK: label present iff code = 'custom'), NOT user-inserted lookup rows. *Why:* keeps the shared lookup clean (no dedup / moderation / RLS-on-shared-writes); each company's custom text is private to it. ⚠️ Extends beyond Marcel's fixed 5 categories — **flag to Marcel (DEV-99).**
- **Legacy data:** the generic `cultivator` activity code → remapped to `eu_gmp_cultivator` (EU/German medical-cannabis default) then dropped; every existing (cannabis-medical) company backfilled with the **Pharma** category. Migration is additive + idempotent.
- **UI (prototype-decided):** two **dropdown multiselects** (not always-visible chips), MVP `Field` styling; **Custom reveals an inline free-text box inside the dropdown panel** (no closing to type); validate on submit.
- **Show-password eye:** reusable client `PasswordField` (eye inside the box) with a **stable `aria-label` + `aria-pressed`** for state (a11y best practice — don't swap the accessible name on toggle).

## 2026-07-06 — Present (Phase 7) fidelity re-plan after a post-build sync

The Phase-7 execution shipped a working structural redesign (grid, cards, media manager, banner, present mode) but **under-delivered vs the prototype** (`prototypes/present-redesign-prototype/index.html`). A reconciliation sync with Muskan (15-item feedback batch) locked a **fidelity re-plan** (plans F-01/F-02/F-03; full detail in the gitignored `.planning/phases/07-present-catalogue-ux/07-FIDELITY-CONTEXT.md`). *Why re-plan not patch:* most feedback was "the prototype has X, the build doesn't" — a scope-reconciliation, not bugs.

- **Unified edit mode** (adopt the prototype contract, supersedes the built separate-buttons approach): ONE small "Manage shop" button → the **whole** Present page enters edit mode (calm grey wash) + a floating pink Save bar (✕ discards); logo / banner / name / info boxes / links / cards all edit **inline**; **"Add product" lives inside edit mode**. *Why:* the prototype's iPhone-widget edit model is one coherent mode; the build's three separate buttons (Add products / Manage shop / Edit logo & branding) fragmented it.
- **Manual product + batch input** writes to the **existing** `product` / `product_batch` columns (~24 already exist) — **the same tables the parked CSV ingestion targets**, so manual entry = a subset of the CSV target (no divergent schema). Field set = core. *Why:* the schema was already built anticipating ingestion; manual entry now pressure-tests the CSV target.
- **Terp% = one headline "total terpenes" value** → new additive `product.terpene_percent` column (the **only** migration in the whole fidelity pass), editable inline like THC/CBD/CBG/CBN. *Why:* a COA "total terpenes" is a single aggregate (the sum of many individual terpenes, each ~0.2–0.5%); the rich per-terpene/aroma profile stays a later batch pass (`batch_terpene`/`terpene`). (Web-researched terpene reporting practice.)
- **Media persistence:** media (images/videos/COA/docs) uploads **immediately** to the `shop-media` bucket + creates its DB row; the Save bar governs only text fields; ✕ discards text, not media. *Why:* heavy files upload once; every file always has a row → orphan-safe (delete removes the object; insert-failure removes the upload).
- **Documents popup (prototype-locked):** the card back consolidates to **[Upload document] + [Download all]**; Upload opens a modal with a **Document type** select {COA, Custom document}; Custom reveals a **Name** field. Replaces the separate Upload-COA / Upload-document buttons.
- **Shop ≡ location — two-speed:** free-text "add location" **now** (a label on `product.location`; exists once ≥1 product carries it — empty locations don't persist); the **structured location+address module = Phase 16**, co-designed with Ayush. *Why:* his order docs carry **no address today** (confirmed in `src/modules/deals/types.ts`) — nothing to integrate yet; solo-building the shared schema risks rework. (Reaffirms the 2026-06-26 + 2026-07-02 location decisions.)
- **Deal basket → create → send, and the buyer offer card = Phase 17, OUT of demo scope.** The card's "Add to basket" is only the Present entry point. *Why:* reaffirms the session-48 demo-scope decision; the deal flow is the next phase.
- **Present mode (07-06) shipped as-is and is KEPT** — an in-app `presenting` chrome-hide UI state (NOT the OS Fullscreen API, so it's Zoom-window-shareable) + company chip → own shop. Not part of the re-plan.

## 2026-07-07 — Multi pack-size: v0 stopgap in `product.metadata`, proper table deferred

Buyer feedback: a product needs several discrete pack sizes (10g/20g/50g), picked like a T-shirt size before Add-to-basket. Decision (Muskan, for the imminent demo): ship lightweight now — extra sizes as a number array in `product.metadata.pack_sizes`, no migration — treat a real `product_pack_size` table (own pricing, CSV template, Deal Basket/Phase 17 integration) as its own planned phase. The required "Pack size (g)" field in the add-product form stays single-value/unchanged; extras are added via the card's "Edit details" dialog. *Why defer:* likely intersects Ayush's Deal Basket + per-customer pricing work — designing solo now risks rework.

## 2026-07-08 — Allocate opens the Deal Card, not a Deal Room

Following Ayush's Phase-7 retirement of the Deal Room/Stages container (D-15/D-17, PR #139), Sell/Allocate's order-row click now opens the real `DealCard` as a right-side panel beside the page content (mirrors Connect's `DealCardPanelHost`), not a duplicated Deal Room overlay. The old `AllocateDealRoomHost` (session 53, a deliberate duplicate of the now-retired `DealRoomOverlayHost`) is deleted; replaced by `AllocateDealCardHost`, sharing the `hs:open-deal-card` event contract and fetch shape his host uses. *Why:* the Deal Room/Stages model it depended on no longer exists, and a flip card was the right level of detail for "preview an order" anyway — no reason to rebuild the retired container.

## 2026-07-08 — Sales/Purchase calendar: one shared `DealCalendar`

Grill-with-docs design lock for the deal-timeline surface (SELL.md §3 was "deferred to Ayush's Buy component"; no such component ever landed — this lane now owns it).

- **One side-agnostic `DealCalendar`** serves both surfaces: **Sales calendar** (Sell, rows = Customers) / **Purchase calendar** (Buy, rows = Suppliers), flipped by a `side` prop. Neutral row term = **Counterparty**.
- **Pill = one Deal Card**, shown from **birth** (an offer/order exists; a grey Product-Basket draft is pre-birth, not a pill). Positioned by **`delivery_date_target ?? created_at`**.
- **Pill colour = deal display stage** ([DEV-151](https://linear.app/hellosello/issue/DEV-151)), reusing allocate's `statusOf` (no re-map): pink offer/order · yellow accepted · green executed · orange update (*Marcel left this colour unset — orange is a placeholder*) · blue ticket-open · dark-green ticket-closed.
- **Money = Σ `line_total`** (not `deal_card.value_net`, which is often null).
- Full contract: [`docs/muskan-build/deal-calendar.md`](../muskan-build/deal-calendar.md). Built + verified live on Sell (Timeline view; the Year aggregate view is deferred).

---

## 2026-07-08 — Buy (Phase 18) v0 scope locks

Buy shipped end-to-end this session. Four scope decisions got locked during the build, all reversible later:

- **Buyer resale price schema:** `buyer_company_id` (RLS owner) + nullable `supplier_company_id` FK + always-populated `supplier_name` text + nullable `product_id`/`product_name` — supports both connected and CSV-only suppliers from day one. *Why:* CONTEXT.md's Partner definition requires unconnected suppliers to show up too; a bare company FK couldn't represent that.
- **No fuzzy CSV-supplier matching in v0.** Every CSV-imported supplier name is its own partner row unless the buyer explicitly links it later. *Why:* keeps the "minimal CSV backfill" boundary honest — full reconciliation is the parked `catalogue-ingestion-DESIGN.md`'s job, not this phase's.
- **Analytics/Sheet's degenerate category-per-product.** No real `product.category` field exists; each product renders as its own single-item "category" until real taxonomy data lands. *Why:* the 3-level tree structure stays intact without fabricating data the system doesn't have.
- **Analytics Time filter counts future-dated (scheduled-but-undelivered) deals** (confirmed by Muskan), matching the KPI strip's own inclusive `sameMonth()` treatment. Made as a judgment call during verification after finding the initial implementation silently hid 3 of 4 real deals under every filter option — Muskan confirmed the direction is correct during wrap-up, so this is locked, not provisional.

## 2026-07-10 — Product Basket "Draft deal": birth via the existing `createDeal()`, no schema change

Live feedback on `BasketDrawer` (round 1: replace the full-height drawer with a compact popover anchored to the TopBar icon, grouped by seller, note field dropped) surfaced a bigger question: should picking a customer happen inside the popover, or inside the Deal Card itself, with the card opening customer-less first?

Researched first (CRM Lead→Opportunity is the standard pattern for "I don't know the account yet"): rejected making `deal_card.relationship_id` nullable — RLS on the whole deal object graph derives from that column, so a customer-less draft would need a real schema + RLS rework, is Ayush's owned domain, and buys nothing over the simpler option. **Locked instead:** both entry points (Present basket, chat) call the existing, unchanged `createDeal()` — a real `deal_card` is born in the already-existing `draft` status the instant a customer is known (chosen in the popover for basket-originated deals; already known from the chat's relationship for chat-originated ones) — then the result opens inside that relationship's real chat. No "unassigned draft" concept was invented; "draft" was never a new status.

**Chat's "Create Deal" consent gate removed as part of this**, Muskan's explicit call: the old flow required the other party to Accept before any `deal_card` existed (`CreateDealForm` → `proposeDeal` → `confirmDetectedDeal`); the new one births immediately since the relationship is already known. `CreateDealForm`/`proposeDeal`/`confirmDetectedDeal` were deliberately left in place, not deleted, at ship time (the plan's own "don't over-engineer" guardrail) — `proposeDeal` was later confirmed fully dead and removed once Ayush's parallel "living deal card" rework (see ARCHITECTURE-NOTES 2026-07-10) independently retired the same UI more completely.

---

## 2026-07-20 → 2026-07-22 (Lane A + deal-card live-feedback arc)

- **Deal delivery spine: one birth path, one routing key.** Every deal producer converges on `create_deal_draft`, which now delivers at birth via `deliver_deal`: no counterparty co-owner → a claimable company inbox ticket; co-owner set → a chat message posted by the app's send layer. Pickup = `claim_deal_ticket` (definer RPC; receiver-company member becomes a deal owner, no new relationship). *Why:* the c2c "Create a deal" button fired an event nobody listened to; one spine covers all producers by construction (full trace: ARCHITECTURE-NOTES 2026-07-20).
- **Every deal signal in chat is ONE centered, clickable WhatsApp-style pill** — sent / declined / signed / change committed / change declined; each opens the deal card. *Why:* the DEV-33 doctrine (chat = the activity feed, thin status artifacts) applied uniformly; mixed bubble styles read as noise (Muskan, Agentation feedback 2026-07-22).
- **Decline + Sign project into the chat** (fail-soft app-side announcements; new `deal_signed` message type — a distinct code, same rationale as `deal_change_declined`). *Why:* they were the only silent lifecycle events; the chat must tell the deal's whole story.
- **The held-change diff renders as an in-table REDLINE** — struck red old row → green new row with a CHANGE tag, Total row = struck old · delta pill · green new. The separate boxed "Proposed change" section is retired. *Why:* match the chosen chat-flipdoc prototype (Muskan's explicit call).
- **The card's header ✓ SENDS unsent edits** (nothing changed → plain exit; send failure → stays in edit mode). *Why:* the ✓ was the only visible control and silently discarded added products (Muskan hit it live); this restores `doSendChange`'s own documented intent that had drifted.
- **Deal tickets are receiver-only in every actionable inbox lens; receiver-side visibility stays company-wide.** *Why:* the DB deliberately shows a ticket to both companies, but only the receiver can act — the sender saw phantom claimables; company-wide receiver visibility is the designed pickup model (any teammate claims, or the super admin assigns).
- **A chat hosts many deals — the "Start a deal" door stays visible after the first birth** (strip button + composer "+" both work). *Why:* Muskan's call; the old State-A gate hid the door once one deal existed.
- **Playwright runs `workers: 1`.** *Why:* every deal spec resets + mints deals on the ONE seeded GreenLeaf↔StonePharm relationship in ONE local Supabase — parallel workers provably wipe each other mid-test; per-file serial cannot protect across files.

---

## 2026-07-23 - Deal card single-sign lifecycle LOCKED: private Draft → Send → Negotiation → Sign by the FIXED receiver; Negotiate = talk; buyer door decided

Locked with Ayush 2026-07-22 in the deal-card problem-board session (21 code-verified open items; the build runs step-by-step from this model, status machine first). Recorded BEFORE any code moves so nobody plans against the old assumptions. ⚠️ Muskan: the `order` deal_type derivation and the buyer create-door (bullet 5) plus the calendar/basket touchpoints with timing (last bullet) land in your lanes - please read those three.

- **The lifecycle becomes Draft (unsent, private) → Send → Negotiation → Confirmed → Done / Cancelled.** A card is born as a DB-persisted **Draft** visible ONLY to the creator's side (RLS-private; survives closing the panel/app; the workspace exists from draft-birth, so Open Items work pre-send). **Send delivers** - the one-spine `deliver_deal` routing (chat pill / claimable inbox ticket) survives, re-timed from birth to Send via a new `sendDeal` (partial supersede of the 2026-07-20→22 "delivers at birth" bullet above) - and flips the card to a NEW **`negotiation`** status: the status the DB calls `draft` today (birth→sign) is renamed, so "draft was never a new status" (2026-07-10) no longer holds. The exact enum values (does `draft` survive meaning "unsent", or does the private state get a fresh value?) are settled by the status-machine migration - either way every status consumer must expect the rename. The whole Draft/Send/`negotiation` machinery is built DIRECTION-NEUTRAL from day one, so the buyer door plugs in without rework. `confirmed` / `done` / `cancelled` stay as built; the ticket reopen path stays too (one small decided addition: a close-ticket UI button, missing today). The dead statuses `withdrawn` + `amended` and the dead two-sided path (`confirmDeal`, `ConfirmBar`, `propose_deal` RPC, DealPin State B for manual proposals, dormant `edit_deal_draft`) are REMOVED - this settles the 2026-06-07 Q3 `deal_confirmation` two-row model and the 2026-06-17 "ConfirmBar kept for the future seal" note: the final-stage seal design is now decided and it is NOT two-seat. *Why:* today the create-mode card is browser-only - closing the panel silently destroys work; and a status named `draft` that actually means "already sent" misleads every reader of the schema.
- **Sign is FIXED to the deal, not the version: the deal receiver is the signer for the deal's whole life.** Seller sent → buyer signs; buyer sent → seller signs; changes during negotiation NEVER flip the sign right (replaces the built "who sent the latest version" rule; supersedes the Layer-1 Negotiation "Accept / Counter / Reject on any version" model and the 2026-05-22 "both need the other party's approval" lock). **Send = the implicit yes at BOTH levels** - sending the deal and sending a change - so no party ever accepts or signs their own submission. Stored as one fact from birth and enforced server-side in the RPCs, not UI-only. Sign keeps the DEV-29 e-signature identity bundle. *Why:* a moving sign right makes "who closes this deal" unanswerable mid-negotiation; one fixed signer keeps the flow predictable in both deal directions.
- **Counter-changes stay two-sided but asymmetric: the deal sender gets "Accept changes" - commit WITHOUT signing.** When the signer proposes a change, the sender's accept commits the new version (no signature); the signer then signs the updated card. **The signer never signs their own unaccepted proposal** - their Sign stays visible but DISABLED ("Waiting for [name]'s acceptance") until the sender accepts. Consequence: whenever the signer has changed the card, closing takes one extra step; in the normal buyer-sent flow that is always the case - prices are seller-owned, so the seller (the signer) answers with their priced version → buyer accepts → seller signs - while a seller-sent deal signs directly (the buyer's Sign = accept + sign in one) (partially supersedes 2026-06-29 "seller fills prices, both confirm to close": seller-fills-prices survives, the both-confirm clause is gone). **Product reality (Ayush):** buyers will mostly NOT edit the card - most edit features are seller-only anyway; buyers negotiate through chat and the seller makes the versions, in BOTH deal directions.
- **Negotiate = talk, NEVER delete.** Pressing Negotiate jumps to the chat, posts a "[Name] wants to negotiate" pill (extends the one-pill signal pattern; a "change proposed" pill is also added), and shows an "In negotiation" strip at the top of the card. A held proposal STAYS on the table - it leaves only when the proposer withdraws it (button label becomes **"Withdraw changes"**), replaces it (the proposer edits + re-submits the updated change; the 2026-06-16 "pencil disabled for everyone" lock relaxes: the proposer keeps their pencil, the non-proposer's stays disabled), or it is accepted. The non-proposer's Decline-discard exit on a change is GONE (partial supersede of the 2026-06-16 three-exits rule; the held `deal_pending_change` backbone itself stays the mechanism). The fixed signer always sees three options - Negotiate / Sign / Decline - from the very first version; Decline (the deal) stays available to both sides and closes to `cancelled`. *Why:* negotiation is conversation; today's Negotiate deletes the very proposal the two sides want to talk about.
- **A buyer create-door WILL be built; deal direction derives from PRODUCT OWNERSHIP, never from who creates the card.** The owner of the products on the card = the seller - always code-derivable (supersedes 2026-05-22 "OFFER = seller-initiated / ORDER = buyer-initiated" and the 2026-06-06 Deal-card lock "the type = who authored it" - PO card buyer→seller / SO card seller→buyer; today's Start-a-deal hardcodes creator = seller, silently casting a buyer as seller - that bug dies with this rule). For the basket lane this means: a basket-born buyer deal gets `order` DERIVED from product ownership, not from who created the card. The door: an empty paper opens; Send stays dead until ≥1 product; an empty card discards on close, with content it becomes a Draft. Picker by shop presence: only my shop has products → my catalogue (offer), automatic; only theirs → their catalogue (order), automatic; both → ONE choice ("Your products or [X]'s?"); neither → the door is HIDDEN. "Has products" is a system-level fact via a tiny SECURITY DEFINER yes/no fn - private catalogues stay private. When the counterparty's products are not visible to the viewer (or none exist), show a POSITIVE message ("Request [supplier] for their products"), never a dead end. Free-text product lines are SELLER-only; one seller per card - no catalogue mixing; the buyer may fill public prices, else leaves them empty - the seller prices the card in their first version (reaffirms seller-owned pricing, 2026-06-29). *Why:* a buyer silently cast as seller corrupts direction, PO/SO numbering, and pricing ownership at birth.
- **⚠️ Muskan - calendar + basket touchpoints, with timing.** The DealCalendar's "pill = one Deal Card, shown from birth" (2026-07-08) must become "shown from Send": that entry's own "a pre-birth basket draft is not a pill" logic now carries over to the private Draft - it must never appear on a counterparty-facing surface - and the `draft`→`negotiation` rename hits every `statusOf`-keyed pill colour. The rename migration ships in the status-machine step (the third build step, right after docs + card-shell polish), so let's sync before that step starts: the calendar/allocate `statusOf` update should land in the same deploy as the migration, and it is your file - coordinate via the sync ritual, Ayush won't touch it silently. The Product-Basket direct-birth (2026-07-10) now births a private Draft instead of a delivered card; its known-customer + non-nullable `relationship_id` reasoning survives unchanged. *Why record:* both live in your lane; this entry is the agreed warning before any code moves.

(Source: the 2026-07-22 problem-board session with Ayush; per-item file:line evidence in Ayush's local `_workshop/notes/2026-07-22-deal-card-problems.md` - ask if you want the full board. Build order locked there too: docs first, then card shell + button labels, then the status machine (persisted private Draft, `negotiation` rename, `sendDeal`, RLS draft privacy, server-side fixed signer, pre-send Open Items - board codes A1-A3 + C2), then the decision bar, then diff/payload coverage, then the buyer door; the chat-module track runs parallel.)

---

## 2026-07-24 - Wave 3 built: decline only from `negotiation`; `deliver_deal` revoke must include `PUBLIC`

Board Wave 3 (DecisionBar fixed roles B6/B1/B3/E1 + the Phase-12 review fixes CR-01/CR-02/WR-01..04/WR-06 + Infos) built and green on `claude/ayush/work` (all 8 backend SQL suites green from a clean `db reset`; 221/221 unit; deal e2e 19 pass / 5 skip; `next build` clean). Built test-first through a plan -> adversarial-verify -> build -> verify loop. Two decisions worth recording:

- **A deal can be DECLINED only while in `negotiation`.** `decline_deal` now raises on an `unsent` private draft (declining it would flip it to `cancelled`, and the D-08 privacy predicate `status <> 'unsent'` would then un-hide it to the counterparty - a private draft is discarded, never declined) and rejects `confirmed`/`ticket_*` (a signed deal is not declinable); `cancelled`/`done` stay idempotent no-ops. *Why:* WR-02 - the guard ported byte-for-byte from the old action let a private draft OR a signed deal be cancelled via a direct PostgREST call; the state machine only intends decline from negotiation.
- **Revoking `deliver_deal` EXECUTE must include `PUBLIC`, not just `authenticated`/`anon`.** Postgres grants function EXECUTE to `PUBLIC` by default, so a plain `REVOKE ... FROM authenticated, anon` leaves the client roles inheriting it through PUBLIC. The migration revokes `FROM public, authenticated, anon` (`service_role` keeps its own direct grant; nested SECURITY DEFINER callers run as owner and are unaffected). *Why:* WR-01 - red-first testing caught that the naive revoke did NOT close the door.

Known residual (deferred, low impact): the replace-a-proposal path reverts a changed *term* (payment/delivery/free-delivery/note) to base because `getPendingChange` does not yet surface held terms - a `reads.ts` follow-up; the called-out LINE data-loss is fixed. IN-04 (the `unsent` label in `allocate/status.ts`) is parked for Muskan's vocab call.

