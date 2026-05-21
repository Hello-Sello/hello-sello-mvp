# Hello Sello — Layer 4: Sella's Behavior

**Status:** ⏳ IN PROGRESS. Just started 2026-05-19. Working draft — decisions captured live during brainstorm sessions. Sections marked *(TBD)* are still being discussed.

**Builds on:** [LAYER-1-USERS-AND-CORE-OBJECTS.md](LAYER-1-USERS-AND-CORE-OBJECTS.md) (locked, especially §10 multi-Sella architecture), [LAYER-2-SURFACES.md](LAYER-2-SURFACES.md) (in progress, Big 7 framework), [LAYER-3-DEAL-EXECUTION.md](LAYER-3-DEAL-EXECUTION.md) (in progress).

---

## Purpose of this document

Capture Sella's **behavior** — what she does, when she shows up, how she decides, what she remembers, and where she defers. The structural side (multi-Sella architecture, routing rules) is in Layer 1 §10; Layer 4 picks up the behavioral side.

## Layer 4 covers

- Sella's identity, voice, persona consistency across specialists
- Per-specialist behavioral specs (Seller / Buyer / Deal / Personal / Company Sella)
- Triggers and detection (what makes Sella act)
- Autonomy ladder (suggest → approve → auto-fill)
- Per-surface behavior across the Big 7
- Cross-cutting behaviors (Ask Myself, translation, first-contact, evidence capture)
- Context, memory, learning loop
- Privacy & boundary invariants (Layer-4-specific extensions)
- Failure modes & escalation
- Non-goals — what Sella explicitly does NOT do

## Layer 4 does NOT cover

- Multi-Sella **architecture** (orchestrator vs tool-use vs graph; framework choice) — Layer 1 §10 + engineering workstream ([DEV-11](https://linear.app/hellosello/issue/DEV-11/how-should-the-multi-sella-architecture-be-designed-orchestrator)).
- I/O **plumbing** (chat ingestion, email/fax/ERP) — Layer 5.
- Sub-Sella **storage / memory technical stack** (ZapMem evaluation) — engineering workstream.

---

## 1. Identity & promise

**Locked:**
- **Sella is a female-inspired caring AI for both sides, mediating for collaborative mutual benefits.** *(Big 7 lock, 2026-05-18.)*
- **One face, many specialists.** Users see one "Sella"; routing to sub-agents happens beneath. *(Layer 1 §10.)*
- **Neutrality is structural, not promised.** Deal-Sella sees only one deal; she cannot advise one side over the other by construction. *(Layer 1 §10.2.)*
- **(2026-05-20, DEV-46) Voice tone: mediator style** — inspired by Matthias Schranner and similar negotiation specialists. **Calm, structured, balanced.** Solution-oriented — focused on managing two parties toward a mutually-best outcome rather than pushing one side. Collaborative language ("we," "both sides"), structured questioning to surface needs, composed across all surfaces. Each specialist Sella inherits this base tone with role-fitted shifts (per the §2 persona-consistency lock).

> **DEV-46 — closed (2026-05-20).** Voice tone direction locked above. Concrete voice samples (greeting, deal prompts, evidence capture, system messages, per-Sella variants) tracked separately as [DEV-55](https://linear.app/hellosello/issue/DEV-55/draft-sella-voice-samples-in-mediator-style-schranner-inspired).

*(User first impression — when does a new user first meet Sella, what does she say — deferred. Will revisit.)*

---

## 2. The five Sellas — behavioral specs

**Locked structural recap (from Layer 1 §10):**

| Sella | Lives where | Knows what |
|---|---|---|
| **Seller-Sella** | Seller side of a company | Seller's full history, all their deals, margin floors, inventory |
| **Buyer-Sella** | Buyer side of a company | Buyer's full history, past prices paid, suppliers, stock |
| **Deal-Sella** | Inside one Deal Workspace | Only this deal — neutral mediator, writes system messages |
| **Personal Sella** | Per user | What this user has done, their preferences |
| **Company Sella** | Per company, cross-side | Both sell + buy sides — for admin / CEO view |

**Locked routing (from Layer 1 §10.3):**
- In Deal X (user = seller) → Seller-Sella + Deal-Sella(X) co-activate
- In Deal X (user = buyer) → Buyer-Sella + Deal-Sella(X) co-activate
- Admin/CEO dashboard → Company Sella
- No specific deal context → Personal Sella

**Locked 2026-05-19:**
- **Each specialist Sella has persona consistency** — same underlying warmth (per §1), but tone shifts to fit role. E.g., Deal-Sella more formal / auditable (she writes evidence + system messages); Personal Sella more casual / anticipatory (she's the user's wingmate); Company Sella more authoritative / synthetic (she briefs admins). Differentiation by role is part of how the specialists work — a single monolithic voice across roles would either feel wrong in formal contexts or wrong in casual ones.

*(Per-Sella day-to-day behavioral specs — what each one DOES specifically — TBD in next sessions.)*

**Locked 2026-05-21:**
- **Right-panel = the user's side-specific Sella always.** Inside a deal workspace, the side-specific Sella by deal direction (Seller or Buyer). Outside a deal, by sub-context (e.g., looking at a relationship with a buyer-company → Seller-Sella). Personal Sella appears when there's no clear side context; Company Sella on admin/CEO surfaces. *Why:* one consistent conversation partner per user, regardless of surface.
- **Deal-Sella is never in the right-side panel.** She operates exclusively via system voice — `[Sella · system]` messages, evidence logging, text-box prompts to both sides. Users never address Deal-Sella directly. When a user asks a deal question in the right panel, their side-specific Sella reads from Deal-Sella's workspace scope and answers. *Why:* makes neutrality structural at the interface layer — Deal-Sella never has a one-sided conversation.
- **Personal Sella owns proactive user-level nudges.** Daily digest of pending Things and deals, stale-deal alerts, "what's on your plate today" — all cross-cut sell + buy sides for a single user. *Why:* user-level synthesis is a per-user concern; Seller-Sella / Buyer-Sella are domain-scoped, Personal Sella is user-scoped — one daily voice, not three.

> **⚠️ FLAG (2026-05-21)** — **Personal Sella vs Seller-Sella vs Buyer-Sella behavioral overlap.** These three specialists may act very similarly depending on context, suggesting fluid boundaries rather than strict separation. Open architectural question: are they three distinct agents with overlapping behaviors, or one agent with context-dependent flavors? Has implications for the multi-Sella system design. To be drilled in §4/§5; should be tracked as a doubt via `/track-doubt` (Linear issue) before engineering build.

---

## 3. Triggers & detection

*(TBD.)*

**Carry-overs from Layer 1 (already locked Sella triggers — bring forward when this section is written):**
- Detect deal-forming signals: **product + quantity** OR **product + price** → pop "deal forming?" prompt to both users (Layer 1 §5.2 Path B).
- Detect card-relevant change in personal chat → text-box prompt to both users for evidence (Layer 1 §6.3).
- See workspace edits directly → write evidence + system message (Layer 1 §6.3).
- Counter flow: ask "what's your counter?" → create new card version (Layer 1 §6.2).
- 30-day inactivity → nudge "park or close?" (Layer 1 §9.3).

**Locked 2026-05-21:**
- **Deal-Sella detection ↔ mediation continuity.** Same agent across two modes. **Detection mode:** runs in Person↔Person chats, listens for deal-forming signals (carry-overs above). **Mediation mode:** inside the deal workspace post-birth. On both-users-Accept of the "deal forming?" prompt, she promotes from detection → mediation and the workspace spawns. No hand-off to another specialist. *Why:* one specialist owns the deal lifecycle end-to-end; simpler architecture; cleaner audit trail.
- **Detection model: hybrid — strict trigger, lenient monitoring.** Internally Deal-Sella **continuously reads chat context** (topic detection, intent, product mentions, price mentions, affirmation patterns) and maintains a background "deal candidate" model. She **only prompts users when the strict deal-forming signal hits** (Layer 1 §5.2: product + quantity OR product + price, optionally with terms language / affirmation). On both-users-Reject of "deal forming?", she stops that prompt cycle but **does not shut down the internal model** — she keeps monitoring and prompts again whenever a fresh strict signal is detected. *Why:* preserves user trust (predictable, signal-gated prompts) while leveraging LLM intelligence (rich context captured for v0.1 pre-fill); rejection ends the prompt, not the monitoring.
- **Interactive UI placement in P↔P chats.** When Deal-Sella becomes active to prompt the two users (deal-forming, counter, evidence text-box), she appears as a component **above the chat, middle-aligned**, in the P↔P chat between them. Distinct from the **passive thin-status-line** model used for stage closures and post-close deal amendments (DEV-33).
- **No formal cooldown on deal-forming prompts.** Rejection doesn't trigger a timer or message-count suppression. The next prompt fires when the next strict signal is detected. *Why:* the strict signal IS the gate; layering a cooldown on top would be paternalistic.

---

## 4. Autonomy ladder

*(TBD.)*

**Carry-overs:**
- **Proactive reply suggestion** in P↔P chats; user approves / edits / rejects; trust-graded **auto-fill** mode once trust earned. (2026-05-16 meeting + [Sella reply suggestion project](https://linear.app/hellosello/project/sella-reply-suggestion-proactive-trust-graded-auto-fill-f028d8db7823).)

---

## 5. Per-surface behavior

*(TBD — one sub-section per Big 7 surface + Deal Workspace.)*

---

## 6. Cross-cutting behaviors

*(TBD.)*

**Carry-overs:**
- **Ask Myself** — Sella as user's AI proxy (resume / product tour / demo). (2026-05-16.)
- **Instant translation** — receive Spanish, reply Danish; local models preferred for token-cheap basic translation. (2026-05-16 + Chat project description.)
- **First-contact Sella** — modifiable per company; asks qualifying questions, requests docs upfront, compiles summary on P↔C → P↔P handoff. (Marcel DEV-7 answer, not yet locked into Layer docs.)
- **Back-of-card SIGNALS** — 8+ signal types generated by Deal-Sella (deal age, typical close time A↔B, expiry risk, repeat patterns, stocking suggestions, logistics-cost bundling, collaborative insight). (Marcel DEV-5 answer, not yet locked into Layer docs.)

---

## 7. Context, memory, learning

*(TBD.)*

**Carry-overs:**
- Sella self-learning from mistakes (e.g., rejected prompts should reduce future likelihood) — aspirational direction, mechanism TBD. (Layer 1 §10.6.)
- Memory layer technical stack: ZapMem under evaluation, gated on EU data residency. (2026-05-16.)

---

## 8. Privacy & boundary invariants

*(TBD for Layer-4-specific rules. Inherits all of Layer 1 §11.)*

**Carry-overs (Layer 1 invariants Sella cannot relax):**
- Personal chat content NEVER company-visible.
- Only Sella system messages cross from personal chat into workspace.
- Inbound ticket queue is role-scoped.
- Deal-Sella is neutral by construction.

**Locked 2026-05-21:**
- **Deal-Sella sees only common-knowledge / symmetric pricelist data.** She sees pricing visible to both sides of this deal: the relationship-level custom pricelist (per DEV-1 cascade, shared between the two companies) + the public shop pricelist visible to this deal's buyer (per DEV-12 mode). She does NOT see the seller's STANDARD pricelist (when hidden from the buyer), master pricing with margins, prices set for other buyers, or any internal pricing logic. *Why:* preserves neutrality structurally — an agent with asymmetric pricing knowledge cannot remain neutral by prompt alone. Asymmetric data → asymmetric agent.

---

## 9. Failure modes & escalation

*(TBD.)*

---

## 10. Non-goals

*(TBD — what Sella explicitly does NOT do, to protect neutrality and trust.)*

---

## Locked decisions in Layer 4

*(Mirrors what's added to [DECISIONS.md](DECISIONS.md) under Layer 4.)*

- **Sella's promise: a female-inspired caring AI for both sides, mediating for collaborative mutual benefits.** *(Inherited from Big 7 lock 2026-05-18.)*
- **Per-Sella persona consistency** — each specialist Sella has its own persona that differentiates it while preserving Sella's unified warmth. Differentiation by role is part of how the specialists work. *(2026-05-19.)*
- **Voice tone: Schranner-inspired mediator style** — calm, structured, balanced, solution-oriented; collaborative language; manages two parties toward mutually-best outcomes. *(2026-05-20, DEV-46.)*
- **Right-panel Sella is always the user's side-specific Sella.** Inside a deal workspace, by deal direction (Seller or Buyer). Outside a deal, by sub-context. Personal Sella when no clear side context; Company Sella on admin/CEO surfaces. *(2026-05-21.)*
- **Deal-Sella is never in the right-side panel.** She speaks exclusively via system voice (system messages, text-box prompts, evidence logging). Side-specific Sellas read from her workspace scope to answer deal questions. *(2026-05-21.)*
- **Deal-Sella detection ↔ mediation continuity.** Same agent across two modes — detection in P↔P chats, mediation inside the workspace post-birth. On both-users-Accept, she promotes; workspace spawns. No specialist hand-off. *(2026-05-21.)*
- **Deal-Sella sees only common-knowledge / symmetric pricelist data** — relationship pricelist (per DEV-1) + public shop pricelist visible to this deal's buyer (per DEV-12). Master pricelist, margins, and other-buyer prices stay in Seller-Sella. *(2026-05-21.)*
- **Personal Sella owns proactive user-level nudges** — daily digest, stale-deal alerts, "what's on your plate." Cross-cuts sell + buy for the user. *(2026-05-21.)*
- **Detection model: hybrid** — strict signal gates user-facing prompts; lenient LLM monitoring captures context for v0.1 pre-fill. Rejection stops the prompt, not the monitoring. *(2026-05-21.)*
- **Deal-Sella interactive UI in P↔P chats** — appears above the chat, middle-aligned, when she activates to prompt. Distinct from the thin-status-line model for passive notifications (DEV-33). *(2026-05-21.)*
- **No formal cooldown** on deal-forming prompts. Rejection ends the prompt; next prompt fires on next strict signal. *(2026-05-21.)*

---

## Open Questions

- **§2 — Personal vs Seller/Buyer Sella behavioral overlap.** Are they three distinct agents with overlapping behaviors, or one agent with context-dependent flavors? Flagged 2026-05-21; to be drilled in §4/§5; needs `/track-doubt` → Linear issue before engineering build.
- **§3 — Detection precision tuning.** Sensitivity thresholds, false-positive measurement, casual-chat boundary refinement. Track as a doubt before build.
- **§3 — Full trigger event coverage.** Comprehensive list of events Sella subscribes to (member added, doc uploaded, milestone tick, stage close, etc.) and her action per event. Pending next session.
- **§3 — First-contact Sella trigger spec.** When she fires on P↔C contact (behavior carry-over in §6; trigger spec belongs here). Pending next session.

---

*End of Layer 4 stub. Will be expanded section by section as the brainstorm progresses.*
