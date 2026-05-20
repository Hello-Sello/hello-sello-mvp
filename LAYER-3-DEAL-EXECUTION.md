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
[In Progress]  — stages running, milestones being ticked, "things" being assigned
      |
      v
[Done]   — all stages closed by responsible people + product reached customer

(Side path)
[Confirmed] / [In Progress]  →  [Cancelled]   (post-confirmation cancellation, see Section 9)
```

> **DEV-25 — closed (2026-05-20).** Done = delivery note + invoice **both attached** (document-driven trigger; no explicit click). See §8 for the full completion model.
>
> **⚠️ OPEN [DEV-23]** — Cancellation / dispute flow after confirmation. See [DEV-23](https://linear.app/hellosello/issue/DEV-23/how-should-cancellation-and-dispute-resolution-work-after-deal).

---

## 2. Stages (operational view)

> **⚠️ OPEN [DEV-24]** — Ownership during execution: partially resolved (deal owner stays accountable; see Locked below). Remaining nuances open — e.g., Things-list placement per phase. See [DEV-24](https://linear.app/hellosello/issue/DEV-24/does-deal-ownership-pass-between-collaborators-as-stages-advance-or).
>
> **⚠️ OPEN [DEV-31]** — Stage template library scope: platform / company / per-deal / all three? (Post-MVP.) See [DEV-31](https://linear.app/hellosello/issue/DEV-31/stage-template-library-platform-wide-company-wide-per-deal-or-all).
>
> **⚠️ OPEN [DEV-32]** — When a stage is added mid-deal, both-side confirm vs notification? See [DEV-32](https://linear.app/hellosello/issue/DEV-32/when-a-stage-is-added-mid-deal-does-the-other-party-need-to-confirm-or).
>
> **DEV-33 — closed (2026-05-20).** **Closed stages do not reopen.** Post-close work happens via appendices — documents (attached to deal), Things (clarification tickets, see §7), and approvals (approval workflow from DEV-41). The "Reopened" state from the 2026-05-16 lock is removed. Stage-closure and post-close deal-data-change notifications downgraded to **passive thin status line** (no push) per Marcel's notification-overload concern.
>
> **⚠️ OPEN [DEV-34]** — Stage UI: Kanban, timeline, checklist, or hybrid? See [DEV-34](https://linear.app/hellosello/issue/DEV-34/how-are-stages-presented-visually-in-the-deal-workspace-kanban).

**Locked:**
- **Stages = macro phases AFTER confirmation.** Custom per deal.
- Examples: finance, logistics, delivery.
- **Lifecycle: Pending → In Progress → Closed.** Three states. Closed = final; post-close work uses appendices (documents, Things, approvals), not a state transition. *(DEV-33, 2026-05-20 — supersedes the 2026-05-16 four-state "Reopened" lock.)*
- **Parallel stages allowed; sequential-vs-parallel is user-configurable per deal.**
- **A stage closes when all required milestones in it are completed.** Optional milestones carry over (don't block closure).
- **Deals are born with a default set of stages, fully customizable.** (Default set TBD — tied to template scope, DEV-31.)
- **The deal has a deal owner** who stays accountable throughout. The deal owner manually picks the responsible team/person for each stage.
- Each stage has a responsible person/team. When their part is done, they close/tick the stage.
- **Closing a stage shows a passive thin status line** in both the P↔P chat where the change was processed AND the C↔C workspace chat — WhatsApp-style artifact with date + timestamp, no push notification. *(DEV-33, 2026-05-20 — supersedes the 2026-05-16 active-notification lock; Marcel wants to save people from notification overload.)*

---

## 3. Milestones

> **⚠️ OPEN [DEV-28]** — Milestones ↔ Things integration: do assignee-milestones spawn Things under the hood? See [DEV-28](https://linear.app/hellosello/issue/DEV-28/how-exactly-do-milestones-and-things-integrate-do-milestones-with).
>
> **⚠️ OPEN [DEV-29]** — Approval signature mechanics: click-to-approve vs legally binding e-signature? Needs Marcel. See [DEV-29](https://linear.app/hellosello/issue/DEV-29/for-approval-milestones-is-a-click-to-approve-enough-or-do-we-need).
>
> **⚠️ OPEN [DEV-30]** — Milestone dependencies (chain) vs independent? See [DEV-30](https://linear.app/hellosello/issue/DEV-30/can-a-milestone-depend-on-another-milestone-being-done-first-chain-or).

**Locked:**
- **Milestones = checkboxes / gates that must be ticked.** **No enforced types** — user-defined per deal: document upload, approval-from-person, generic checkbox, customer-side upload, anything else.
- **Pre-confirmation milestones:** gates BEFORE the deal moves to Confirmed. Example: manager approval for an off-price discount; COA upload before commit.
- **Post-confirmation milestones:** checkboxes WITHIN a stage during execution. Example: doc upload during finance stage; DocuSign-style approval-from-person.
- **Optional by default (MVP).** No ERP integration yet — users tick when they know it's done.
- **Required milestones halt the stage** until completed. UX must clearly show *why* halted (e.g., "Halted because approval from X is needed").
- **Templates per deal + flexible add-anytime by any party** (same pattern as stages).
- **Tickable only by the responsible person (assignee) OR the creator.** No one else.
- **Notifications: same in-app mechanism as Things.**
- **Audit trail required** — who ticked, when, on what (GDPR + regulated cannabis-pharma).

*(Milestone UI placement inside the deal workspace: covered under [DEV-9](https://linear.app/hellosello/issue/DEV-9/what-exactly-gets-created-inside-a-deal-workspace-and-how-should-it).)*

---

## 4. PO generation

> **⚠️ OPEN [DEV-26]** — PO generation scope is unclear at the product level. Pitch promises "PO automatisch generiert" but Linear has no dedicated project. Marcel needs to weigh in before we design this. See [DEV-26](https://linear.app/hellosello/issue/DEV-26/what-does-po-automatisch-generiert-actually-mean-in-the-product-scope).

*(Section parked until customer-side conversation with Marcel. Brainstorm-ahead removed to avoid inventing scope.)*

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

## 7. "Things"

> **⚠️ OPEN [DEV-27]** — Things UI surface: dedicated page, sidebar widget, inside Sella's panel, or something else? See [DEV-27](https://linear.app/hellosello/issue/DEV-27/whats-the-ui-surface-for-a-users-things-inbox-page-sidebar-widget-or).

**Locked:**
- **Things = action items always assigned to someone.** Created from chat / screenshot / deal context, OR standalone.
- **Scope:** standalone OR deal-scoped. Anyone can assign to anyone.
- **Categories:** approval request, issue/blocker, question, FYI/inform (extensible). Drive filtering.
- **Filters** on the inbox: by assignee, by category, by deal context, by status.
- **In-app notifications** when a new Thing is assigned. No email for MVP.
- **Redirect / reassign** — recipient can bump to someone else ("not me, ask Anna").
- **Threaded / discussed** — creator + assignee can chat on a Thing until resolved.
- **Lifecycle:** Open → Done (side path: Dismissed).

**Post-MVP capability:**
- **Sella-detects-Things** — Sella reads chat context and proposes Things automatically (e.g., "this looks like an approval request — want me to make it a Thing?"). Deferred from MVP. Manual creation always available.

*(How Things relate to stage / milestone ownership — see [DEV-24](https://linear.app/hellosello/issue/DEV-24/does-deal-ownership-pass-between-collaborators-as-stages-advance-or).)*

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

*(TBD.)*

> **⚠️ OPEN [DEV-23]** — Cancellation/dispute resolution flow after confirmation. Rough idea: both parties talk + mutual agreement. Edge cases (unilateral cancel, partial delivery, refunds, audit trail) are open. See [DEV-23](https://linear.app/hellosello/issue/DEV-23/how-should-cancellation-and-dispute-resolution-work-after-deal).

---

## Locked decisions in Layer 3

*(Mirrors what's added to [DECISIONS.md](DECISIONS.md) under Layer 3.)*

- **Stages and Milestones are distinct concepts.** Stages = post-confirmation macro phases (custom templates). Milestones = checkboxes / gates (pre- or post-confirmation, required or optional).
- **Milestones can be pre-confirmation OR post-confirmation.** Same primitive, different placement in the lifecycle.
- **Milestones are flexible (no enforced types), optional by default, ticked only by assignee or creator.** Required ones halt the stage with clear "why halted" UX. Templates per deal + any-party-can-add. In-app notifications, audit trail required for GDPR.
- **(2026-05-20, DEV-33) Stage lifecycle: Pending → In Progress → Closed.** Three states — no Reopened. Closed = final; post-close work happens via appendices (documents, Things, approvals). Parallel stages allowed; sequential-vs-parallel user-configurable per deal. *(Supersedes the 2026-05-16 four-state lifecycle lock.)*
- **A stage closes when all required milestones are complete** (optional ones carry over).
- **Deals are born with default stages, customizable.** Deal owner stays accountable throughout; manually assigns stage-responsible people (partially resolves DEV-24).
- **(2026-05-20, DEV-33) Stage closure + post-close deal-data changes use a passive thin status line** — visible in both the P↔P chat where the change was processed AND the C↔C workspace chat. WhatsApp-style artifact (date + timestamp), no push notification. *Why:* Marcel wants to save people from notification overload. *(Supersedes the 2026-05-16 active-notification lock.)*
- **"Things" = action items always assigned to someone.** Standalone OR deal-scoped. With categories, filters, in-app notifications, redirect/reassign, threaded discussion. Lifecycle: Open → Done (side: Dismissed).
- **(2026-05-20, DEV-25) Deal moves to Done when the delivery note + invoice are both attached.** Document-driven trigger — no explicit click. Sella OCR / AI extracts and amends the deal card with actual volumes / prices / names. For multi-delivery deals, Done waits until all delivery-note + invoice pairs are uploaded (DEV-53 to confirm).
- **(2026-05-20, DEV-35) Payment tracking:** MVP no in-platform tracking for cannabis (40-90 day windows handled externally); Phase 2 Stripe for materials; Phase 3 factoring partnership.
- **(2026-05-20, DEV-36) Delivery tracking:** MVP = manual delivery-note + invoice upload with Sella OCR / AI extraction; Phase 2 logistics-company integration; Phase 3 ERP integration.

---

## Post-MVP (Layer 3 scope)

- **Sella-detects-Things** — Sella reads chat context and proposes Things automatically (e.g., "this looks like an approval request — want me to make it a Thing?"). Strong agent capability deferred from MVP. Manual Thing creation is the MVP behavior.

---

## Open Questions

- **Section 2 — Stage ownership** — Does ownership pass between stage-responsible people as stages advance? — [DEV-24](https://linear.app/hellosello/issue/DEV-24/does-deal-ownership-pass-between-collaborators-as-stages-advance-or)
- **Section 9 — Cancellation flow** — How does post-confirmation cancellation/dispute work? — [DEV-23](https://linear.app/hellosello/issue/DEV-23/how-should-cancellation-and-dispute-resolution-work-after-deal)
- **Section 4 — PO generation** — What does "PO automatisch generiert" actually mean? Marcel input needed. — [DEV-26](https://linear.app/hellosello/issue/DEV-26/what-does-po-automatisch-generiert-actually-mean-in-the-product-scope)
- **Section 7 — Things UI** — Where do users see their Things inbox (page / widget / etc.)? — [DEV-27](https://linear.app/hellosello/issue/DEV-27/whats-the-ui-surface-for-a-users-things-inbox-page-sidebar-widget-or)
- **Section 3 — Milestones ↔ Things** — Do milestones with assignees spawn Things under the hood? — [DEV-28](https://linear.app/hellosello/issue/DEV-28/how-exactly-do-milestones-and-things-integrate-do-milestones-with)
- **Section 3 — Approval signatures** — Click-to-approve vs legally binding e-signature? Needs Marcel. — [DEV-29](https://linear.app/hellosello/issue/DEV-29/for-approval-milestones-is-a-click-to-approve-enough-or-do-we-need)
- **Section 3 — Milestone dependencies** — Chain vs flat/independent? — [DEV-30](https://linear.app/hellosello/issue/DEV-30/can-a-milestone-depend-on-another-milestone-being-done-first-chain-or)
- **Section 2 — Stage templates** — Platform / company / per-deal scope? (Post-MVP.) — [DEV-31](https://linear.app/hellosello/issue/DEV-31/stage-template-library-platform-wide-company-wide-per-deal-or-all)
- **Section 2 — Adding stages mid-deal** — Both-side confirm vs notification only? — [DEV-32](https://linear.app/hellosello/issue/DEV-32/when-a-stage-is-added-mid-deal-does-the-other-party-need-to-confirm-or)
- **Section 2 — Stage UI** — Kanban, timeline, checklist, hybrid? — [DEV-34](https://linear.app/hellosello/issue/DEV-34/how-are-stages-presented-visually-in-the-deal-workspace-kanban)

---

*End of Layer 3 stub. Will be expanded section by section as the brainstorm progresses.*
