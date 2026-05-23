# Hello Sello — Layer 3: The Deal (Execution)

**Status:** ⏳ IN PROGRESS. Working draft — decisions captured live during brainstorm sessions. Sections marked *(TBD)* are still being discussed.

**Builds on:** [LAYER-1-USERS-AND-CORE-OBJECTS.md](LAYER-1-USERS-AND-CORE-OBJECTS.md) (locked) and [LAYER-2-SURFACES.md](LAYER-2-SURFACES.md) (in progress).

---

## Purpose of this document

The journey from **"order" → "done"** — what happens after both parties confirm a deal card (Layer 1 state 3: Confirmed). The operational guts of running a deal.

## Layer 3 covers

- Execution state machine (Confirmed → In progress → Done)
- Stages in action (custom phases like finance, logistics, delivery)
- Milestones (checkboxes / gates, pre- or post-confirmation)
- PO generation
- Payment terms tracking
- Delivery tracking (without logistics partners in MVP)
- "Things" (action items assigned to people)
- Completion / closing
- Cancellation / disputes after confirmation

## Layer 3 does NOT cover

- Pre-confirmation deal flows → **Layer 1**
- Sella's specific execution behaviors → **Layer 4**
- PDF / ERP output formats → **Layer 5**
- Visual surfaces where execution lives → **Layer 2**

---

## 1. Execution state machine

**State sequence:**

```
[Confirmed]   ← from Layer 1 (both sides accepted deal card)
      |
      v
[In Progress]  — THINGS being actioned by their assignees (stage-default-assignees or user-picked)
      |
      v
[Done]   — delivery note + invoice both attached (per §8)

(Side path)
[Confirmed] / [In Progress]  →  [Cancelled]   (post-confirmation cancellation, see Section 9)
```

> **DEV-25 — closed (2026-05-20).** Done = delivery note + invoice **both attached** (document-driven trigger; no explicit click). See §8 for the full completion model.
>
> **DEV-23 — closed (2026-05-22).** Post-confirmation cancellation/amendment flows locked — see §9.

---

## 2. Stages

*Stages exist as conceptual scaffolding — they organize work by domain (finance, logistics, delivery) and provide default assignees for THINGS. **Stages are NOT surfaced as a UI primitive** — no Kanban / timeline / per-stage lifecycle UI. Users see THINGS (§7), not stages.*

> **DEV-24 — closed (2026-05-22).** Deal ownership does NOT pass between stage-responsible people. Stage-responsibility survives as the default-assignee mechanism for THINGS; stages themselves are scaffolding, not UI. See Locked below.
>
> **DEV-31 — closed (2026-05-23).** MVP ships a single hardcoded platform-default template (`cannabis_wholesale_v1`: finance/logistics/delivery + default THINGS per stage). Fully per-deal editable. Multi-template / company-curation / Sella-learns-templates deferred to post-MVP. See Locked below.
>
> **DEV-32 — closed (2026-05-23).** Re-framed under DEV-24/30 doctrine as "adding a THING in a domain not previously represented." Lock: notification-only, no confirmation required. Inline notification to deal workspace per DEV-30 in-app model. See Locked below.
>
> **DEV-33 — closed (2026-05-20, partially superseded 2026-05-22).** The original lock had two halves: **(a) stage closure mechanics** (no-reopen + passive thin status line on stage close) — **superseded by DEV-24/DEV-30**: stages have no closure UI event anymore. **(b) Post-confirmation deal-data-change status-line pattern** (e.g., DEV-36 delivery-note OCR auto-amendments) — **still applies**: passive thin status line in both P↔P and C↔C chats, no push.
>
> **DEV-34 — closed (2026-05-22).** Stages are not visually presented at all — no Kanban / timeline / checklist / hybrid. Resolved by the stages-not-surfaced doctrine.

**Locked:**
- **Stages = macro phases AFTER confirmation.** Custom per deal. Examples: finance, logistics, delivery.
- **Deals are born with a default set of stages, fully customizable.** MVP default = hardcoded template `cannabis_wholesale_v1` (finance/logistics/delivery + default THINGS per stage). *(Resolved by DEV-31, 2026-05-23.)*
- **The deal has a deal owner** who stays accountable throughout. The deal owner manually picks the responsible team/person for each stage at deal birth.
- **(2026-05-22, DEV-24) Stages are NOT a UI primitive** — only conceptual scaffolding for organizing work and providing default assignees. No per-stage Kanban / timeline / lifecycle UI. *(Supersedes the 2026-05-20 DEV-33 per-stage lifecycle lock and the parallel-vs-sequential lock.)*
- **(2026-05-22, DEV-24) Stage-responsibility = default-assignee mechanism.** Each stage's responsible person/team is the default assignee for THINGS in that stage (overridable per-THING). Stage-responsible people don't "close/tick the stage" — stages have no closure UI event.
- **(2026-05-22, DEV-24) Deal ownership does NOT pass between stage-responsible people.** The deal is visible + actionable for the whole company; stage-responsible people work on their THINGS without taking over the deal.
- **(2026-05-23, DEV-31) MVP stage template = `cannabis_wholesale_v1` (single hardcoded platform default).** Stages: finance, logistics, delivery. Each stage ships with default THINGS pre-loaded at deal birth (finance: "Send invoice", "Confirm payment terms"; logistics: "Confirm pickup date", "Verify COA matches batch", "BfArM import authorization on file (if cross-border)", "Confirm narcotic-grade transport carrier"; delivery: "Upload delivery note", "Upload final invoice"). Fully per-deal editable. Template stored as data/config — schema supports multiple templates even though MVP ships one. **Compliance-as-stage rejected for MVP** — distributed across existing stages (mostly Logistics) for simplicity. Multi-template library, company curation, Sella-learns-templates → post-MVP roadmap.
- **(2026-05-23, DEV-32) Mid-deal THING-add → inline notification only, no confirmation.** Under DEV-24/30 doctrine, "adding a stage mid-deal" re-frames as "adding a THING in a domain not previously represented." Notification routed to deal workspace per DEV-30 in-app notification model; aligns with DEV-30 "any-party-can-add" THINGS lock; audit trail logged. If THING lands in a domain with no stage-responsible person yet, deal owner picks the responsible at that moment (same mechanism as deal-birth assignment).

---

## 3. Pre-confirmation gates

> **DEV-28 — closed (2026-05-22).** Milestones-vs-THINGS dissolves under the flat-THINGS doctrine: they are the same primitive. Post-confirmation milestones = THINGS (§7). Pre-confirmation milestones = pre-confirmation gates (a specialized THING — see below).
>
> **DEV-29 — closed (2026-05-22).** Approval signatures = the APPROVE button itself. No third-party e-signature integration. See Locked below.
>
> **DEV-30 — closed (2026-05-22).** No milestone dependencies / chains. All THINGS are independent and always visible — see §7.

Under the flat-THINGS doctrine (§7), milestones and THINGS are the same primitive — approvals, document uploads, generic checkboxes all live in the THINGS system. **Pre-confirmation gates** are a specialized subset of THINGS that block deal-card confirmation.

**Locked:**
- **Pre-confirmation gates block deal-card movement to Confirmed.** Examples: manager approval for an off-price discount; COA upload before commit. **This is the only "blocking" behavior in execution** — see §7 for why nothing blocks post-confirmation.
- **Same primitive as THINGS** (§7) — assignee, no enforced types, categories, audit trail, templates per deal, redirect/reassign, threaded discussion, in-app notifications — but with a `blocks_confirmation` attribute set.
- **Tickable only by the responsible person (assignee) OR the creator.** No one else.
- **(2026-05-22, DEV-29) Approval signatures = the APPROVE button itself, DocuSign-style.** No third-party e-signature integration. Capturing: person + 2FA-authenticated login + name/email/account + the acceptance action + timestamp. This bundle = the legally binding signature. *Why:* same logic as DocuSign — strong identity + intentional action + immutable timestamp. No external dependency, full UX control, regulated-pharma audit ready.
- **Audit trail required** — who cleared the gate, when, on what (GDPR + regulated cannabis-pharma).

**Post-confirmation:** all execution happens via THINGS — see §7.

*(Pre-confirmation gating UI inside the deal-card flow: covered under [DEV-9](https://linear.app/hellosello/issue/DEV-9/what-exactly-gets-created-inside-a-deal-workspace-and-how-should-it).)*

---

## 4. Order generation (PO / SO / Hello Sello Deal Number)

**Locked (2026-05-22, DEV-26).**

**Deal birth = directional intent.** Two birth modes:
- **OFFER** — seller-initiated (the seller sends a sales order). Awaits buyer approval.
- **ORDER** — buyer-initiated (the buyer sends a purchase order). Awaits seller approval.

Both require approval from the other party to move from negotiation to a confirmed deal.

**On mutual acceptance**, the deal becomes a confirmed **order** carrying three identifiers + a QR code:

| ID | Owner | Purpose |
|---|---|---|
| **Buyer's Purchase Order Number (PO #)** | Buyer | Buyer's own internal reference. Field on the order form, filled by the buyer. |
| **Seller's Sales Order Number (SO #)** | Seller | Seller's own internal reference. Field on the order form, filled by the seller. |
| **Hello Sello Deal Number** | Hello Sello | Auto-generated. Format pattern: `HS-AAA##-BBB##-NNNNNNNN` (e.g., `HS-AUR01-CCR01-00058632`). Two company short-codes + sequential deal number. |
| **QR code** | Hello Sello | Encodes the Hello Sello Deal Number for cross-system tracking. Scannable from any printed / forwarded artifact. |

**Order form requirements:**
- **XML-readable** for downstream system integration (ERP, accounting, logistics).
- All three IDs + QR are **generated at the moment of mutual acceptance** (deal confirmation), not later.
- The form serves as the canonical record of what was agreed — the artifact that survives outside Hello Sello.

*Why:* every counterparty system speaks its own ID. Hello Sello adds a third ID (the Deal Number) as the source-of-truth tracker across both sides; the QR makes paper / forwarded copies still traceable. XML readability ensures the form drops cleanly into ERPs and accounting systems without manual re-entry.

*(Connects to: DEV-23 amendments / cancellations rewrite this artifact; DEV-25 / DEV-36 delivery-note + invoice attach to it for the Done trigger.)*

> **⚠️ Open** — Exact derivation rule for the two short-codes in `HS-AAA##-BBB##-NNNNNNNN` is not yet locked. Marcel showed the *shape* (`HS-AUR01-CCR01-…`) but not the *rule that produces it*. Open sub-questions: which side first (seller vs buyer), where the 3 letters come from (first-3-of-company-name vs custom self-picked vs auto-with-collision-handling), what the 2 digits mean (branch index vs region vs HS-account increment), and whether short-codes are immutable. Implementation detail; decide during DEV-26 build phase.

---

## 5. Payment terms tracking

> **DEV-35 — closed (2026-05-20).** MVP scope locked — see below.

**Locked 2026-05-20 (DEV-35):**
- **MVP:** no payment tracking inside Hello Sello for medical cannabis. Cannabis deals operate on **40-90 day payment windows handled externally** between the two companies. The deal card still carries payment **terms** (e.g., "Net 60") as metadata, but no payment state machine.
- **Phase 2:** **Stripe integration** for packaging-material / non-cannabis suppliers — payment-in-platform for those flows.
- **Phase 3 / future:** **factoring integration** — suppliers can route invoices to partner factoring companies, with Hello Sello taking a small fee. *(Marcel DEV-35 comment 2026-05-19.)*

---

## 6. Delivery tracking

> **DEV-36 — closed (2026-05-20).** MVP scope locked — see below.

**Locked 2026-05-20 (DEV-36):**
- **MVP:** delivery is tracked by **uploading the delivery note + invoice** as attachments to the deal. **Sella OCR / AI** extracts the data (volumes, prices, final product names) and **auto-amends the deal card** to reflect what was actually shipped. Both parties see the amendment as a passive thin status line in the workspace chat (no push notification).
- **Phase 2:** logistics companies as workspace actors — they receive pickup notifications and add tracking information into the same portal.
- **Phase 3 / future:** customer ERP integration for end-to-end automatic delivery tracking.
- *Open follow-up:* partial / split shipments — when one deal has multiple deliveries, does Done fire only after all delivery notes + invoices are uploaded? Working assumption: yes (one deal, N deliveries, Done on final). To confirm with Marcel — see [DEV-53](https://linear.app/hellosello/issue/DEV-53/multiple-deliveries-on-one-deal-does-done-require-all-delivery-notes).

---

## 7. THINGS (the universal execution primitive)

> **⚠️ OPEN [DEV-27]** — Things UI surface: dedicated page, sidebar widget, inside Sella's panel, or something else? Marcel's "Allocate/Buy overview" + "Execute section" ideas (DEV-30) hint at it but don't fully resolve. See [DEV-27](https://linear.app/hellosello/issue/DEV-27/whats-the-ui-surface-for-a-users-things-inbox-page-sidebar-widget-or).

**Locked:**
- **THINGS = the single primitive for everything that needs to be done.** Replaces the prior milestone concept for post-confirmation work (milestones are THINGS). Pre-confirmation gates (§3) are a specialized THING with a `blocks_confirmation` attribute.
- **Always assigned to someone.** Created from chat / screenshot / deal context, OR standalone.
- **Scope:** standalone OR deal-scoped. Anyone can assign to anyone.
- **(2026-05-22, DEV-24) Default assignee from stage-responsibility** — when a THING is spawned by a deal template, the stage-responsible person (assigned by the deal owner at deal birth, §2) is the default assignee. Overridable per-THING.
- **No enforced types** — approval request, issue/blocker, question, FYI/inform, document upload, customer-side upload, generic checkbox, anything else. Drives filtering, not behavior.
- **Filters** on the inbox: by assignee, by category, by deal context, by status.
- **Tickable only by the responsible person (assignee) OR the creator.** No one else.
- **In-app notifications** when a new THING is assigned. No email for MVP.
- **Redirect / reassign** — recipient can bump to someone else ("not me, ask Anna").
- **Threaded / discussed** — creator + assignee can chat on a THING until resolved.
- **Audit trail required** — who ticked, when, on what (GDPR + regulated cannabis-pharma).
- **Lifecycle:** Open → Done (side path: Dismissed).
- **Templates per deal + flexible add-anytime by any party** (same pattern as stages).

**(2026-05-22, DEV-24/DEV-30) Sandwich-execution model:**
- **All open THINGS visible at all times.** Visibility = availability. No hidden phases.
- **Nothing blocks post-confirmation progression.** No required-halts-stage. No dependency chains. (Pre-confirmation gates remain — see §3.)
- **Urgency drivers** (visible to the user, none enforced as gates):
  - **Deadline on the THING** — when it's needed by.
  - **Priority on the DEAL** — high/medium/low. Cascades urgency to all THINGS on that deal.
  - **Deal creation date** — chronological context for "how long has this been around".
  - **Delivery date on the deal** — natural closeness signal.
- **Visibility scope:** a deal is visible + actionable for the whole company. A user sees their assigned THINGS plus their company's open THINGS. Deal ownership doesn't pass (§2) — stage-responsible people work on their THINGS without taking over the deal.
- **Where the user works with THINGS:** inside a deal workspace (alongside deal card + chat), AND across deals in an overview surface (Marcel's "Allocate/Buy" idea, DEV-30; full UI surface still open under DEV-27).

**Post-MVP capability:**
- **Sella-detects-THINGS** — Sella reads chat context and proposes THINGS automatically (e.g., "this looks like an approval request — want me to make it a THING?"). Deferred from MVP. Manual creation always available.

> **Out-of-scope idea (track separately via `/track-doubt`):** Marcel proposed an **"Execute" surface** that summarizes open THINGS across all deals + a notepad board for working in Hello Sello. This is a Layer 2 surface question, bigger than DEV-30 — not folded into this lock.

---

## 8. Completion

**Locked (2026-05-20, DEV-25):**
- A deal moves to **Done** when the **delivery note + invoice are both attached** to the deal. These documents prove the deal content is correct and final.
- **No explicit "Done" click is required** — the documents are the trigger.
- **Sella OCR / AI extracts the document data** and amends the deal card to reflect actual volumes / prices / final names shipped (see §6 for delivery tracking).
- For deals with **multiple deliveries**, the deal stays in-flight until **all delivery notes + invoices are uploaded** — see [DEV-53](https://linear.app/hellosello/issue/DEV-53/multiple-deliveries-on-one-deal-does-done-require-all-delivery-notes) (partial-shipments confirmation with Marcel).

*(Supersedes the earlier "all stages closed AND product reaches the customer" wording — document attachment is now the canonical trigger.)*

*(Post-Done: archival, accessibility, audit trail — TBD.)*

---

## 9. Cancellation / disputes (after confirmation)

**Locked (2026-05-22, DEV-23).**

Two distinct flows after confirmation:

**Flow A — Amendment** (partial issue, e.g., under-delivery on volume):
- One side flags the issue (e.g., "20% of volume can't be delivered").
- Requires the other side's approval to apply the change.
- Captured as a deal amendment with audit trail — same primitive as Sella's auto-amend from delivery-note OCR (see §6, §8).

**Flow B — Cancellation** (deal cannot proceed):
- **MVP (non-ERP-connected):** simply cancel the deal so wrong documents don't surface in-system. **No cancellation-fee mechanism** — in real life, fees exist contractually but are rarely applied.
- **Post-MVP (ERP-connected, Odoo / CanCraft on the roadmap):** trigger cancel-if-possible behavior in the connected ERP to prevent real-world execution.

**Cancellation authority** (regardless of birth path):
- **SELLER can always cancel unilaterally.** Both paths: buyer-requested → seller-approved AND seller-offered → buyer-accepted.
- **BUYER cannot unilaterally cancel** post-confirmation. The buyer can **request a change** (an amendment), which requires SELLER approval to apply.

*Why:* mirrors real-world commercial practice — SELLER controls inventory commitment, BUYER controls demand. Once accepted by both sides, only the SELLER can release the commitment unilaterally. Hello Sello gives loose email-based ordering a contractual spirit while accepting industry reality that inventory + orders never match perfectly at year-end (Marcel's note).

**Audit trail:** every amendment + cancellation logged with who, when, reason. GDPR + regulated cannabis-pharma compliance (same audit primitive as milestones, §3).

> **⚠️ Open UX nuance** — amendment-request UI, cancellation confirmation flow, and post-cancellation read-only state of the deal workspace are not yet specced. Folded into [DEV-9](https://linear.app/hellosello/issue/DEV-9/what-exactly-gets-created-inside-a-deal-workspace-and-how-should-it) (workspace contents) and [DEV-27](https://linear.app/hellosello/issue/DEV-27/whats-the-ui-surface-for-a-users-things-inbox-page-sidebar-widget-or) (Things UI).

---

## Locked decisions in Layer 3

*(Mirrors what's added to [DECISIONS.md](DECISIONS.md) under Layer 3.)*

- **Deals are born with a default set of stages, fully customizable.** MVP default = hardcoded template `cannabis_wholesale_v1` (finance/logistics/delivery + default THINGS per stage). Deal owner stays accountable throughout; manually assigns stage-responsible people at deal birth (resolves DEV-24). *(Default-set question resolved by DEV-31, 2026-05-23.)*
- **(2026-05-22, DEV-24) Stages are NOT a UI primitive — only conceptual scaffolding.** Organize work by domain (finance, logistics, delivery), provide default assignees. No per-stage Kanban / timeline / lifecycle UI. *(Supersedes the 2026-05-20 DEV-33 per-stage lifecycle lock and the parallel-vs-sequential lock.)*
- **(2026-05-22, DEV-24) Stage-responsibility = default-assignee mechanism for THINGS in that stage** (overridable per-THING). Stage-responsible people don't "close/tick the stage" — stages have no closure UI event.
- **(2026-05-22, DEV-24) Deal ownership does NOT pass between stage-responsible people.** Deal is visible + actionable for the whole company; stage-responsible people work on their THINGS without taking over the deal.
- **(2026-05-22, DEV-30) THINGS = the universal execution primitive.** Replaces post-confirmation milestones (they're one entity now). Properties: always assigned, no enforced types, optional by default, tickable by assignee/creator, audit trail, redirect/reassign, threaded discussion, Open→Done lifecycle. Templates per deal + any-party-can-add. *(Supersedes the 2026-05-16 milestones-halt-the-stage and milestones-as-separate-primitive locks.)*
- **(2026-05-22, DEV-30) Pre-confirmation gates retained as the only blocking behavior.** Specialized THINGS with `blocks_confirmation` attribute (e.g., manager approval, COA upload before deal-card confirmation).
- **(2026-05-22, DEV-24/DEV-30) Sandwich-execution model.** All open THINGS visible at all times; nothing blocks post-confirmation progression. Urgency drivers (visible, not gating): deadline on THING, priority on DEAL, deal creation date, delivery date on deal.
- **(2026-05-20, DEV-33; partially superseded 2026-05-22) Post-confirmation deal-data-change status-line pattern.** Deal amendments (e.g., delivery-note OCR auto-amendments per DEV-36) appear as a passive thin status line in both P↔P chat where processed AND C↔C workspace chat — WhatsApp-style artifact (date + timestamp), no push. *Why:* Marcel wants to save people from notification overload. *(The stage-closure half of the original 2026-05-20 DEV-33 lock is superseded under DEV-24/30 doctrine — stages don't close as UI events anymore. The post-confirmation deal-data-change half survives as documented here.)*
- **(2026-05-20, DEV-25) Deal moves to Done when the delivery note + invoice are both attached.** Document-driven trigger — no explicit click. Sella OCR / AI extracts and amends the deal card with actual volumes / prices / names. For multi-delivery deals, Done waits until all delivery-note + invoice pairs are uploaded (DEV-53 to confirm).
- **(2026-05-20, DEV-35) Payment tracking:** MVP no in-platform tracking for cannabis (40-90 day windows handled externally); Phase 2 Stripe for materials; Phase 3 factoring partnership.
- **(2026-05-20, DEV-36) Delivery tracking:** MVP = manual delivery-note + invoice upload with Sella OCR / AI extraction; Phase 2 logistics-company integration; Phase 3 ERP integration.
- **(2026-05-22, DEV-29) Approval signatures = the APPROVE button.** Captures 2FA-authenticated user + name/email/account + acceptance + timestamp. No third-party e-sig integration; this bundle is the legally binding signature (DocuSign-in-a-nutshell logic).
- **(2026-05-22, DEV-23) Post-confirmation cancellation/amendment.** Two flows: (a) **Amendment** for partial issues (e.g., 20% under-delivery) — flagged by one side, requires the other's approval. (b) **Cancellation** for full non-delivery — MVP just deletes the deal so wrong docs don't surface; post-MVP triggers ERP cancel-if-possible (Odoo / CanCraft). **Authority:** SELLER can always cancel unilaterally (both birth paths); BUYER cannot — BUYER can only request a change with SELLER approval. Audit trail logged.
- **(2026-05-22, DEV-26) Order generation — PO / SO / Hello Sello Deal Number + QR.** Deal birth is directional: **OFFER** (seller-initiated, sales order) or **ORDER** (buyer-initiated, purchase order). On mutual acceptance, the deal becomes an **order** with three IDs + QR: Buyer's PO # (buyer field), Seller's SO # (seller field), Hello Sello Deal Number (auto-generated, pattern `HS-AAA##-BBB##-NNNNNNNN`), QR code (encodes Deal Number). Order form is **XML-readable** for ERP/accounting/logistics. All IDs + QR generated at the moment of confirmation. Short-code derivation rule deferred (open flag in §4).
- **(2026-05-23, DEV-31) MVP stage template = `cannabis_wholesale_v1` (single hardcoded platform default).** Stages: finance, logistics, delivery. Each stage ships with default THINGS pre-loaded at deal birth (finance: "Send invoice", "Confirm payment terms"; logistics: "Confirm pickup date", "Verify COA matches batch", "BfArM import authorization on file (if cross-border)", "Confirm narcotic-grade transport carrier"; delivery: "Upload delivery note", "Upload final invoice"). Fully per-deal editable. Template stored as data/config — schema supports multiple templates even though MVP ships one. **Compliance-as-stage rejected for MVP** — distributed across existing stages (mostly Logistics) for simplicity. Multi-template library, company curation, Sella-learns-templates → post-MVP roadmap.
- **(2026-05-23, DEV-32) Mid-deal THING-add → inline notification only, no confirmation.** Under DEV-24/30 doctrine, "adding a stage mid-deal" re-frames as "adding a THING in a domain not previously represented." Notification routed to deal workspace per DEV-30 in-app notification model; aligns with DEV-30 "any-party-can-add" THINGS lock; audit trail logged. If THING lands in a domain with no stage-responsible person yet, deal owner picks the responsible at that moment (same mechanism as deal-birth assignment).

---

## Post-MVP (Layer 3 scope)

- **Sella-detects-Things** — Sella reads chat context and proposes Things automatically (e.g., "this looks like an approval request — want me to make it a Thing?"). Strong agent capability deferred from MVP. Manual Thing creation is the MVP behavior.

---

## Open Questions

- **Section 7 — Things UI** — Where do users see their Things inbox (page / widget / etc.)? — [DEV-27](https://linear.app/hellosello/issue/DEV-27/whats-the-ui-surface-for-a-users-things-inbox-page-sidebar-widget-or)

---

*End of Layer 3 stub. Will be expanded section by section as the brainstorm progresses.*
