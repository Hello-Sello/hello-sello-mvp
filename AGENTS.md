# Hello Sello — Project Context

This file is auto-loaded by Claude Code at every session start. It gives Claude the context to pick up where the team left off, without re-explaining everything.

**This is the shared team file.** Committed and co-owned by all engineers. Each engineer keeps their own personal `CLAUDE.md` locally - gitignored, never committed.

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

- **[PITCH.md](docs/product/PITCH.md)** — investor + customer pitches. Defines voice, framing, positioning.
- **[LAYER-1-USERS-AND-CORE-OBJECTS.md](docs/product/LAYER-1-USERS-AND-CORE-OBJECTS.md)** — Layer 1. **LOCKED.**
- **[LAYER-2-SURFACES.md](docs/product/LAYER-2-SURFACES.md)** — Layer 2. **IN PROGRESS.**
- **[LAYER-3-DEAL-EXECUTION.md](docs/product/LAYER-3-DEAL-EXECUTION.md)** — Layer 3. **IN PROGRESS.**
- **[LAYER-4-SELLA-BEHAVIOR.md](docs/product/LAYER-4-SELLA-BEHAVIOR.md)** — Layer 4. **IN PROGRESS.**
- **[LAYER-5-INPUTS-AND-OUTPUTS.md](docs/product/LAYER-5-INPUTS-AND-OUTPUTS.md)** — Layer 5. **IN PROGRESS.** (drafted 2026-05-22)
- **[DECISIONS.md](docs/decisions/DECISIONS.md)** — locked decisions with reasoning. One-line per decision.
- **[ARCHITECTURE-NOTES.md](docs/architecture/ARCHITECTURE-NOTES.md)** — running engineering scratchpad. One-sentence implications from each lock, grouped by topic. Precursor to the formal Architecture doc.

---

## Repo layout

```
hello-sello-design/
├── AGENTS.md                        # shared team context (this file)
├── README.md
├── SKILLS.md                        # team skill dictionary
├── .gitignore                       # CLAUDE.md is listed here
├── .claude/skills/                  # project-scoped agent skills
│
├── docs/
│   ├── product/                     # product design
│   │   ├── PITCH.md
│   │   ├── PRD.md                   # to be written
│   │   └── LAYER-1..5-*.md
│   ├── research/                    # persistent research: GDPR, tools, market, technical
│   ├── architecture/                # technical architecture
│   │   ├── ARCHITECTURE-NOTES.md
│   │   └── adr/                     # Architecture Decision Records
│   ├── decisions/                   # product/design decisions log
│   │   └── DECISIONS.md
│   └── agents/                      # agent config (issue tracker, labels, domain)
│
├── frontend/                        # frontend code
├── backend/                         # backend code
└── infra/                           # infrastructure / deploy / CI
```

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
  → docs/product/LAYER-1-USERS-AND-CORE-OBJECTS.md

Layer 2 — Product Surfaces   ⏳ IN PROGRESS
  • The Big 7 pillars (locked 2026-05-18): Connect / Buy / Sell / Present / Trade / Discover
    (six navigable surfaces) + Sella (always-available AI in right-side panel, not a sidebar item)
  • Home = landing page outside the Big 7
  • Navigation model and home / landing view
  • What lives on each surface
  • How surfaces map to the Layer 1 deal lifecycle
  → docs/product/LAYER-2-SURFACES.md (filled in live as brainstorm progresses)

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

Layer 5 — Inputs and Outputs   ⏳ IN PROGRESS (drafted 2026-05-22)
  • Inputs: chat (core), email (human-in-loop), attachments (store-only),
    FLOWZ scrape (pending GDPR)
  • Outputs: deal confirmation, PO (format open), PDF for off-platform buyers
  • Translation: DE↔EN chat translation (local models)
  • Integrations: FLOWZ (MVP), Isilocity ERP (post-MVP)
  • Non-goals MVP: fax, COA parsing, ERP sync, bulk import, programmatic API
  → docs/product/LAYER-5-INPUTS-AND-OUTPUTS.md
  Open: DEV-60 (email pipeline), DEV-61 (PO format), DEV-62 (FLOWZ GDPR)

—— Separate workstream, NOT a Layer ——
  • Engineering architecture: tech stack, data model, auth, storage,
    encryption, hosting. Discussed later as its own area.
```

---

## Session Checkpoint

*Updated at the end of every brainstorm session. This is the "you are here" marker for the next session — always read this first.*

**Last updated:** 2026-05-22

**Layer status:**
- Layer 1 — ✅ LOCKED.
- Layer 2 — ⏳ Big 7 framework locked. 7 surface drill-down doubts open: DEV-13 / 15 / 16 / 17 / 19 / 20 / 21.
- Layer 3 — ⏳ Cluster D closed (Done trigger / no stage reopen / passive notifications / no MVP payment / OCR delivery tracking). Open: DEV-23, 26, 29 (Marcel); plus DEV-24, 27, 28, 30, 31, 32, 34.
- Layer 4 — ⏳ Substantively drafted §1–§10. 26+ locks landed. Open Qs: DEV-11, 58, 59 + post-launch thresholds.
- Layer 5 — ⏳ Drafted 2026-05-22. Open: DEV-60 (email pipeline), DEV-61 (PO format), DEV-62 (FLOWZ GDPR).

**Just completed:** Layer 4 §9 (failure modes) + §10 (non-goals) — closes Layer 4 draft.

**Next:** Layer 5 (Inputs and Outputs) — chat ingestion, email/fax inputs, deal/offer/PO outputs, broader translation (beyond MVP chat-toggle), third-party integrations (Isilocity COA, FLOWZ, ERP).

**Parallel / blocked:**
- **Marcel:** DEV-23, 26, 29, 53 + backlog DEV-37/38/39/42/43/44/45.
- **Ayush:** DEV-9 (Deal Workspace UI).
- **Victor:** Buy-side build — Margin & Pricing, Deal Engine, Cash-Flow Calc, Product Data Bank, Exclusivity Deals.
- **Engineering parked:** DEV-11 (multi-Sella architecture), 48/49/50 (signals), 51 (access matrix), 52 (Deal Room), 54 (Presentation Mode UI), 55 (Sella voice).
- **Open owners:** Exclusivity Deals label, Product Data Bank scope.

**Convention:** Keep this block tight — bootstrap only. Detailed per-session detail lives in each engineer's personal `CLAUDE.md` (gitignored).

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
3. If user confirms, append to `docs/decisions/DECISIONS.md`.
4. **Never write to DECISIONS.md without explicit confirmation.**

### Writes always preview first

For any file edit, new file, or Linear write:
1. Show the user a preview of what will change.
2. Ask explicitly for permission.
3. Wait for confirmation. Loop on revisions.
4. Only then execute.

This applies to LAYER docs, DECISIONS.md, PITCH.md, AGENTS.md, and every Linear write.

### Language

- **Simple. Plain English.** No technical jargon when ordinary words work.
- The team uses English as a working language but it's not everyone's first language.
- The pitches contain German — preserve German verbatim where it appears.

### Git workflow

- **Persistent per-person branches:** `claude/muskan/work`, `claude/ayush/work`. After each PR merges, reset your branch from new main and continue.
- **Open a PR for review** for each batch; don't push to main directly. Default reviewer is the other developer.
- **Keep commit messages and PR bodies short.** Title + a few bullets, not essays. Reviewers read the diff, not the prose.
- **See [docs/WORKFLOW.md](docs/WORKFLOW.md)** for the full collaboration protocol — task ownership, shared-file rules, AI agent hygiene.

### What NOT to do

- Don't make up Linear projects, labels, or issue IDs — always verify via the MCP.
- Don't paraphrase the pitches — they're the founders' voice.
- Don't expand scope beyond the current Layer.
- Don't write decisions or doubts without going through the agreed protocol (Propose mode + permission gate).
- Don't create new docs unless asked. Prefer editing existing ones.

---

## Agent skills

### Issue tracker

Linear via MCP (workspace `hellosello`, team `Development`). See `docs/agents/issue-tracker.md`.

### Triage labels

Matt Pocock's 5 canonical state labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context. `CONTEXT.md` at `docs/architecture/CONTEXT.md`; ADRs at `docs/architecture/adr/`. See `docs/agents/domain.md`.

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
3. Doubts go through `/track-doubt`. Decisions go to `docs/decisions/DECISIONS.md`. Both require explicit permission before writing.
4. Read [LAYER-1-USERS-AND-CORE-OBJECTS.md](docs/product/LAYER-1-USERS-AND-CORE-OBJECTS.md) and [PITCH.md](docs/product/PITCH.md) before discussing design. Skim [DECISIONS.md](docs/decisions/DECISIONS.md) for the locked decisions.
5. Keep language simple. Show previews. Ask permission.
