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
- **Deals are born with a default set of stages, fully customizable.** User can add, remove, reorder. (Default set TBD — tied to template scope question, DEV-31.) *Why:* zero-state friction matters; users shouldn't face a blank canvas, but should be free to reshape.
- **The deal has a "deal owner" who stays accountable throughout the deal.** The deal owner manually picks the responsible team/person for each stage. *Why:* clean accountability — one throat to choke; stage-responsible people act on their portion without taking over the deal. *(Partially resolves DEV-24: ownership doesn't pass between stages. DEV-24 stays open for remaining nuances — Things-list placement, etc.)*
