# Hello Sello — Project Context

This file is auto-loaded by Claude Code at every session start. It gives Claude the context to pick up where the team left off, without re-explaining everything.

---

## What this project is

Hello Sello is an **AI-native deal room for B2B** — a shared chat space between seller (distributor) and buyer (pharmacy), with an AI agent named **Sella** that processes deal conversations end-to-end (extracts offers, drafts confirmations, surfaces product documents, mediates negotiation).

**Beachhead market:** German medical cannabis — 50 licensed wholesalers, ~2,500 dispensing pharmacies. Tightly bounded, regulated, named universe.

**Lead customer:** Canadian Craft (cannabis distributor) — launches fully on Hello Sello with 25 pharmacy partners. ~€150k GMV from month one.

**Stage:** building MVP. The product is ~25 days into design.

**Category claim:** not a CRM, not a marketplace, not an ERP. A **Superspace** — an intelligent layer above whatever ERP/email/fax systems each company already runs. The moat is **neutrality** — the platform serves both sides of every deal from one shared room.

---

## Where the design lives

**Read these at the start of every brainstorm session for full context:**

- **[PITCH.md](PITCH.md)** — investor + customer pitches. Defines voice, framing, positioning.
- **[LAYER-1-USERS-AND-CORE-OBJECTS.md](LAYER-1-USERS-AND-CORE-OBJECTS.md)** — Layer 1. **LOCKED.**
- **[LAYER-2-SURFACES.md](LAYER-2-SURFACES.md)** — Layer 2. **IN PROGRESS.**
- **[LAYER-3-DEAL-EXECUTION.md](LAYER-3-DEAL-EXECUTION.md)** — Layer 3. **IN PROGRESS.**
- **[LAYER-4-SELLA-BEHAVIOR.md](LAYER-4-SELLA-BEHAVIOR.md)** — Layer 4. **IN PROGRESS.**
- *(Future)* LAYER-5. See **"The 5-Layer Roadmap"** below for what each layer covers.
- **[DECISIONS.md](DECISIONS.md)** — locked decisions with reasoning. One-line per decision.
- **[ARCHITECTURE-NOTES.md](ARCHITECTURE-NOTES.md)** — running engineering scratchpad. One-sentence implications from each lock, grouped by topic. Precursor to the formal Architecture doc.

---

## The 5-Layer Roadmap

The brainstorm is structured in 5 layers. Each builds on the previous. Don't jump ahead.

```
Layer 1 — Users and Core Objects   ✅ LOCKED
  • Who uses Hello Sello (companies, people, permissions)
  • Core objects (Relationship, Deal Card, Deal Workspace)
  • Deal lifecycle STATES (Chat → Draft → Confirmed) and birth paths
  • Multi-Sella architecture (structural overview)
  • Privacy / visibility rules
  → LAYER-1-USERS-AND-CORE-OBJECTS.md

Layer 2 — Product Surfaces   ⏳ IN PROGRESS
  • The Big 7 pillars (locked 2026-05-18): Connect / Buy / Sell / Present / Trade / Discover
    (six navigable surfaces) + Sella (always-available AI in right-side panel, not a sidebar item)
  • Home = landing page outside the Big 7
  • Navigation model and home / landing view
  • What lives on each surface
  • How surfaces map to the Layer 1 deal lifecycle
  → LAYER-2-SURFACES.md (filled in live as brainstorm progresses)

Layer 3 — The Deal (deeply)   ⏳ IN PROGRESS
  • What's inside a deal, who owns it
  • How a deal moves from "offer" → "order" → "done"
  • Execution side: stages in action, milestones, document approvals
  • Payment terms, delivery tracking, completion
  • Order generation (PO)
  Note: Layer 1 covered the structural side (objects, lifecycle states,
  birth paths). Layer 3 picks up the execution side.

Layer 4 — Sella's Behavior   ⏳ IN PROGRESS (started 2026-05-19)
  • What Sella DOES (not architecture — that's in Layer 1)
  • When she shows up across the 5 surfaces
  • Detection rules (deal-forming signals, casual-chat boundary)
  • Autonomy vs. human-approval matrix per action
  • Per-Sella behaviors (Seller / Buyer / Deal / Personal / Company)
  • Context, memory, learning loop

Layer 5 — Inputs and Outputs   ⏸ TBD
  • Inputs: chat, email, fax, attachments, ERP data
  • Outputs: offers, purchase orders, confirmations, forecasts
  • Translation (DE↔EN, demand→offer, mail→deal, tables→forecasts)
  • Third-party integrations (Isilocity COA, FLOWZ pre-population, ERP, etc.)
  • Fax pipeline (post-MVP)

—— Separate workstream, NOT a Layer ——
  • Engineering architecture: tech stack, data model, auth, storage,
    encryption, hosting. Discussed later as its own area.
```

---

## Session Checkpoint

*Updated at the end of every brainstorm session. This is the "you are here" marker for the next session — always read this first.*

**Last updated:** 2026-05-21

**Layer status:**
- Layer 1 — ✅ LOCKED. Walkthrough this session closed 9 doubts (DEV-1, DEV-5, DEV-6, DEV-7, DEV-8, DEV-10, DEV-12, DEV-22, plus DEV-40 + DEV-41 spun out of DEV-6). Two-layer visibility model, P↔C → P↔P flow, Basket = Deal Card + Deal Room, 16-combo access matrix lifted to §11.1 as canonical, Superadmin + custom Groups RBAC, Relationship-page permissions. Foundation solid for engineering.
- Layer 2 — ⏳ Big 7 framework locked 2026-05-18. Cluster C closed DEV-12 (shop pricing), DEV-14 (blank vs populated states), DEV-18 (Presentation Mode concept). 7 surface drill-down doubts still open: DEV-13 / 15 / 16 / 17 / 19 / 20 / 21.
- Layer 3 — ⏳ Cluster D closed DEV-25 (Done = delivery note + invoice attached), DEV-33 (stages don't reopen; passive thin-line notifications), DEV-35 (no payment for cannabis MVP; Stripe Phase 2; factoring Phase 3), DEV-36 (Sella OCR/AI on delivery note + invoice auto-amends deal). Open: DEV-23, DEV-26, DEV-29 (parked Marcel); plus DEV-24, 27, 28, 30, 31, 32, 34 (smaller stage/milestone/thing nuances).
- Layer 4 — ⏳ §1 (identity + Schranner mediator voice) + §2 (persona consistency) locked 2026-05-19/20. Session 2026-05-21 added: right-panel = side-specific Sella always; Deal-Sella never in right panel; Deal-Sella detection↔mediation continuity; Deal-Sella sees only common-knowledge/symmetric pricelist data. §3–§10 continues next session.
- Layer 5 — ⏸ Not started.

**Just completed (session 2026-05-21):**
Two batches landed.

**Batch 1** (commit 7257b19, on main directly): right-panel always = side-specific Sella; Deal-Sella never in right panel — she speaks only via system voice; Deal-Sella detection ↔ mediation continuity (same agent, two modes); Deal-Sella sees only common-knowledge / symmetric pricelist data.

**Batch 2** (current branch `claude/layer-4-detection-locks`, PR opened):
- §2: Personal Sella owns proactive user-level nudges (digest, stale-deal alerts, "what's on your plate"). Personal vs Seller/Buyer Sella behavioral overlap **flagged in §2** for later /track-doubt + Linear issue.
- §3: Detection model locked as **hybrid** — strict signal gates user-facing prompts; lenient LLM monitoring captures context for v0.1 pre-fill; rejection stops the prompt, not the monitoring. Interactive UI placement = component above the chat, middle-aligned in P↔P chats (distinct from DEV-33 passive thin-status-line). No formal cooldown on deal-forming prompts.

Source of batch 1 preserved on branch `backup/layer4-local-2026-05-21`.

**Next session:** Layer 4 §3 leftover items (full trigger event coverage; first-contact Sella trigger spec); then §4 Autonomy ladder. Run `/track-doubt` to spawn a Linear issue for the Personal vs Seller/Buyer behavioral-overlap question. Then §5 per-surface behavior (Big 7 routing table).

**Parallel / blocked:**
- **Marcel:** DEV-23 (cancellation/dispute), DEV-26 (PO generation), DEV-29 (approval signatures), DEV-53 (split shipments confirmation), DEV-37/38/39/42/43/44/45 (his backlog items)
- **Ayush:** DEV-9 (Deal Workspace UI sketches)
- **Victor:** leading Buy-side build (Margin & Pricing, Deal Engine, Cash-Flow Calc, Product Data Bank, Exclusivity Deals)
- **Engineering follow-ups parked (need research/design):** DEV-11 (multi-Sella architecture pattern), DEV-48/49/50 (signals compute/storage/personalization), DEV-51 (access matrix encoding), DEV-52 (Deal Room object/render), DEV-54 (Presentation Mode UI), DEV-55 (Sella voice samples)
- **Open follow-ups without owners:** Exclusivity Deals label (Buy vs Sell vs Discover — your call), Product Data Bank scope (R&D vs Discover vs Buy — your call)

**Convention:** at the end of each session, update "Last updated" + "Layer status" + "Just completed" + "Next" + "Parallel." Keep it tight — this is the handoff signal, not a journal.

---

## Linear conventions

- **Workspace:** hellosello.
- **Team:** Development.
- **Labels** (each maps to a topic + a set of projects):
  - **Connect** — relationship, chat, deal cards, offers, requests
  - **Sella** — agent design (per-seller, per-buyer, per-deal, per-CEO)
  - **Authentication** — accounts, signup, roles, portfolio
  - **R&D** — model selection, GDPR, encryption, pricing model, architecture
  - **Present** — shop, basket, COA, presentation mode
  - **Sell** — pricelist, batch allocation, batch upload, deal engine
  - **Buy** — buyer-side views, margin & pricing tool, cash-flow calc, product data bank
  - **Trade** — analysis, partner maps
  - **Discover** — pre-populated companies, supplier discovery, legal advertising
- **All issue creation goes through the `track-doubt` skill.** Do not create Linear issues directly.

To look up projects/labels live, use:
- `mcp__224a1bd7-7c59-4cb2-a35c-35a4a6596f13__list_projects`
- `mcp__224a1bd7-7c59-4cb2-a35c-35a4a6596f13__list_issue_labels`

---

## How we work together

### Brainstorming protocol

1. **One layer at a time.** Don't jump ahead. Layer 1 is locked; Layer 2 is next.
2. **State your understanding in tight bullets.** The user corrects or confirms.
3. **Once a layer is locked, write the Layer doc.** Use clear sections, simple language, ASCII diagrams where they help.

### Doubt tracking — Propose mode

When a doubt, open question, or unresolved design choice surfaces during conversation:
1. Say: *"This sounds like a doubt — want me to track it via `/track-doubt`?"*
2. If user says yes, invoke the **`track-doubt` skill** (lives at `.claude/skills/track-doubt/`).
3. The skill has its own permission gate at preview time — respect it.
4. **Never create a Linear issue directly. Always go through the skill.**

### Decision logging — Propose mode

When a decision is being locked during conversation:
1. Say: *"This sounds like a locked decision — want me to add it to DECISIONS.md?"*
2. Show a one-line preview with rationale.
3. If user confirms, append to DECISIONS.md.
4. **Never write to DECISIONS.md without explicit confirmation.**

### Writes always preview first

For any file edit, new file, or Linear write:
1. Show the user a preview of what will change.
2. Ask explicitly for permission.
3. Wait for confirmation. Loop on revisions.
4. Only then execute.

This applies to LAYER docs, DECISIONS.md, PITCH.md, CLAUDE.md, and every Linear write.

### Language

- **Simple. Plain English.** No technical jargon when ordinary words work.
- The team uses English as a working language but it's not everyone's first language.
- The pitches contain German — preserve German verbatim where it appears.

### Git workflow

- **Commit to a `claude/*` branch, not directly to main.** Open a PR for review.
- **Keep commit messages and PR bodies short.** Title + a few bullets, not essays. Reviewers read the diff, not the prose.

### What NOT to do

- Don't make up Linear projects, labels, or issue IDs — always verify via the MCP.
- Don't paraphrase the pitches — they're the founders' voice.
- Don't expand scope beyond the current Layer.
- Don't write decisions or doubts without going through the agreed protocol (Propose mode + permission gate).
- Don't create new docs unless asked. Prefer editing existing ones.

---

## Project skills

Skills available at `.claude/skills/`:

- **`track-doubt`** — captures a design doubt as (a) an inline marker in the relevant Layer doc, and (b) a Linear issue framed as a self-explanatory question. Has a permission gate before any write.

Skills are project-scoped (lives in `.claude/skills/`), so all teammates working from this folder get them automatically.

---

## Quick orientation for a fresh session

If you're Claude and you just woke up in this folder, here's the 30-second briefing:

1. The user (and any teammates) are designing a B2B AI deal-room product called Hello Sello.
2. We brainstorm **layer by layer**. Layer 1 is locked. Layer 2 is next.
3. Doubts go through `/track-doubt`. Decisions go to DECISIONS.md. Both require explicit permission before writing.
4. Read [LAYER-1-USERS-AND-CORE-OBJECTS.md](LAYER-1-USERS-AND-CORE-OBJECTS.md) and [PITCH.md](PITCH.md) before discussing design. Skim [DECISIONS.md](DECISIONS.md) for the locked decisions.
5. Keep language simple. Show previews. Ask permission.
