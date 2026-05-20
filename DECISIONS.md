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
- **(2026-05-19) Back-of-card SIGNALS (DEV-5).** Back of the Deal Card = "SIGNALS" — Deal-Sella-generated insights about the deal. Starting MVP set is 8 examples (deal age / typical close time A↔B / product expiry risk / repeat buy-sell pattern / low product availability / logistics-cost bundling / collaborative business insight / extensible AI suggestion). Deal-Sella owns generation (neutral). UI: flip top-left (back), expand top-right (→ Deal Room, full-page floating). *Compute model* ([DEV-48](https://linear.app/hellosello/issue/DEV-48)), *storage model* ([DEV-49](https://linear.app/hellosello/issue/DEV-49)), and *per-viewer personalization* ([DEV-50](https://linear.app/hellosello/issue/DEV-50)) are tracked as engineering follow-ups.
- **(2026-05-19) P↔C → P↔P conversion flow (DEV-7).** Person initiates cross-company contact via one of three channels — requesting pricing, sending a connection request with a note, sending/offering a Deal Card. The contact lands on the receiving company's super-admin + designated salespeople as a P↔C ticket. **First-contact Sella** greets the person, asks qualifying questions, and requests docs upfront — pre-pickup docs sit in a temporary "pending inbox" tied to the receiving company. On pickup (first-clicker wins; super-admin can manually assign), the connection is formalized: the Relationship page is created (pending inbox migrates in), the P↔C chat is archived (log preserved), a new P↔P chat opens, initial messages are logged as a system entry on the Relationship page, and Sella writes a summary first message in the new P↔P chat (salesperson can edit). *First-contact Sella config:* platform-wide workflow framework, per-company customizable questions and document requests. *Why:* every cross-company first contact becomes structured intake — by the time a human picks up, the deal is closer to ready.
- **(2026-05-19) Relationship page is created at pickup** — not at first contact. Pre-pickup activity (initial P↔C messages, doc uploads to first-contact Sella) lives in a temporary pending inbox tied to the receiving company. On pickup, the pending inbox migrates onto the freshly-created Relationship page. *(Resolves part of DEV-7; supersedes any earlier ambiguity in Layer 1 §4.1 about Relationship-creation timing.)*
- **(2026-05-19) DEV-8 closed by reference.** Marcel's DEV-8 answer about deal-record visibility on the Relationship page is fully covered by the DEV-6 two-layer visibility lock (2026-05-18). There is **no separate "private group" tier** — just PRIVATE deals (which a user can set on any deal), with PRIVATE deals auto-flipping to company-wide on acceptance per the existing lock.
- **(2026-05-19) 16-combo access matrix lifted into Layer 1 as canonical (DEV-10 closed by reference to DEV-39).** The matrix now lives in Layer 1 §11.1 and is the **master access model** — it overrides any narrower rule earlier in Layer 1 that conflicts. Rows 9 / 10 / 14 are intentionally absent (impossible / forbidden / no-access combinations). How the matrix is encoded in code (policy DSL / RLS / OPA / hardcoded) is tracked as engineering follow-up [DEV-51](https://linear.app/hellosello/issue/DEV-51).

### Walkthrough locks 2026-05-20 — org-level permissions, Relationship content permissions

- **(2026-05-20) Org-level role model (DEV-40).** One platform-fixed role: **Superadmin** (account holder, at least one per company, transferable, holds system-level powers — accept connections, manage billing, add/remove other Superadmins). Everything else is **custom Groups** defined per company at registration, with a configurable Action × Group permission matrix (green/red UI, drag-drop to assign members). A person can be in **N Groups** simultaneously; effective permissions = union. Industry CRM pattern (Notion / Slack / Linear-style) — sensible defaults + full customization. *Why:* the platform needs one fixed anchor for system bootstrap; everything else is the company's hierarchy and varies too much to fix in code.
- **(2026-05-20) Relationship-page content permissions (DEV-41).** Notes are **per-side** (CoA's notes visible to CoA only; CoB's notes visible to CoB only) with CRM-style edit/delete by anyone in the owning side; every change (edit + delete) is recorded in a change log with user + timestamp + before/after diff. Pricelist edits are gated by an **approval workflow** (Proposed → Approver sign-off → Applied) with **single-approver for MVP** (any one person in an Approver-flagged Group); multi-approver deferred until regulated use cases demand it. Agreed terms are visible to both sides; edit workflow deferred. *Why:* notes are each side's working memory and shouldn't leak across companies; pricelist is commercially sensitive and needs sign-off for compliance; the approval primitive is generalizable to other gated actions later.

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

### Walkthrough locks 2026-05-20 — execution, delivery, payment, no-stage-reopen

- **(2026-05-20) Done trigger (DEV-25).** A deal moves to Done when the **delivery note + invoice are both attached** to the deal. The documents prove the deal content is correct and final — no explicit "Done" click required. **Sella OCR / AI** extracts the document data and amends the deal card to reflect actual volumes / prices / final names shipped. *(Supersedes the 2026-05-16 lock "Deal moves to Done when all stages are closed AND product reaches the customer" — document attachment is now the canonical trigger.)*
- **(2026-05-20) Stages don't reopen (DEV-33).** Stage lifecycle is **Pending → In Progress → Closed** — three states, no Reopened. Post-close work happens via existing primitives: documents (attachments), Things (clarification tickets, §7), and approvals (approval workflow from DEV-41). *(Supersedes the 2026-05-16 four-state lifecycle lock.)*
- **(2026-05-20) Stage closure + post-close deal-data changes use passive thin status line (DEV-33).** Stage closure and post-close deal amendments (e.g., delivery-note attachment amending volumes) appear as a thin status line in both the P↔P chat where the change was processed and the C↔C workspace chat — WhatsApp-style artifact (date + timestamp), no push notification. *Why:* Marcel wants to save people from notification overload. *(Supersedes the 2026-05-16 lock "Closing a stage triggers a visibility update — in-app notification, status change in the workspace, or both.")*
- **(2026-05-20) Payment tracking — MVP scope (DEV-35).** **No payment tracking in HS for medical cannabis** (40-90 day payment windows handled outside the platform). The deal card still carries payment terms (e.g., "Net 60") as metadata. **Phase 2:** Stripe integration for packaging-material / non-cannabis suppliers. **Phase 3 / future:** factoring integration — suppliers route invoices to partner factoring companies, HS takes a small fee.
- **(2026-05-20) Delivery tracking — MVP scope (DEV-36).** Delivery is tracked by uploading the delivery note + invoice; **Sella OCR / AI** extracts data and **auto-amends the deal**. **Phase 2:** logistics companies as workspace actors (pickup notifications + tracking info into the same portal). **Phase 3 / future:** customer ERP integration for end-to-end automatic delivery tracking. Partial / split shipments: working assumption is one deal with N deliveries (Done on final) — tracked as [DEV-53](https://linear.app/hellosello/issue/DEV-53/multiple-deliveries-on-one-deal-does-done-require-all-delivery-notes) for Marcel confirmation.

---

## Layer 4 — Sella's Behavior (IN PROGRESS)

### Identity & persona (locked 2026-05-19)

- **Sella's promise: a female-inspired caring AI for both sides, mediating for collaborative mutual benefits.** *(Inherited from Big 7 lock 2026-05-18; restated here as Layer 4's anchor.)*
- **Per-Sella persona consistency.** Each specialist Sella (Seller / Buyer / Deal / Personal / Company) has its own persona that differentiates it while preserving Sella's unified warmth. Differentiation by role is part of how the specialists work — e.g., Deal-Sella is more formal / auditable (she writes evidence + system messages), Personal Sella more casual / anticipatory (she's the user's wingmate), Company Sella more authoritative / synthetic (she briefs admins). *Why:* a single monolithic voice across roles would either feel wrong in formal contexts (audit messages) or wrong in casual contexts (personal nudges) — role-fitted tone preserves trust on both ends.
- **(2026-05-20) Voice tone: Schranner-inspired mediator style (DEV-46).** Sella's base voice is a **mediator** — calm, structured, balanced, solution-oriented. Inspired by Matthias Schranner and similar negotiation specialists who manage two parties toward mutually-best outcomes. Collaborative language ("we," "both sides"), structured questioning to surface needs, composed across all surfaces. Each specialist Sella inherits this base tone with role-fitted shifts (per the persona-consistency lock). *Why:* the platform's neutrality moat is reinforced by a voice that visibly takes both sides — a mediator's tone signals "I'm working for both of you" in every interaction. Concrete voice samples tracked as [DEV-55](https://linear.app/hellosello/issue/DEV-55/draft-sella-voice-samples-in-mediator-style-schranner-inspired).
