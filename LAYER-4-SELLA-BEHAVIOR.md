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

> **⚠️ OPEN [DEV-46]** — What should Sella's voice tone be? Soft / warm / confident / restrained / proactive — and how does this manifest in system messages, prompts, and replies? See [DEV-46](https://linear.app/hellosello/issue/DEV-46/what-should-sellas-voice-tone-be).

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

---

## 3. Triggers & detection

*(TBD.)*

**Carry-overs from Layer 1 (already locked Sella triggers — bring forward when this section is written):**
- Detect deal-forming signals: **product + quantity** OR **product + price** → pop "deal forming?" prompt to both users (Layer 1 §5.2 Path B).
- Detect card-relevant change in personal chat → text-box prompt to both users for evidence (Layer 1 §6.3).
- See workspace edits directly → write evidence + system message (Layer 1 §6.3).
- Counter flow: ask "what's your counter?" → create new card version (Layer 1 §6.2).
- 30-day inactivity → nudge "park or close?" (Layer 1 §9.3).

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

---

## Open Questions

- **Section 1 — Identity** — What should Sella's voice tone be? — [DEV-46](https://linear.app/hellosello/issue/DEV-46/what-should-sellas-voice-tone-be)

---

*End of Layer 4 stub. Will be expanded section by section as the brainstorm progresses.*
