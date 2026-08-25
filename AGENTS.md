# Hello Sello — Project Context

**Claude Code does NOT load this file.** It reads `CLAUDE.md` and `.claude/rules/`, never
`AGENTS.md` — so the rules Claude actually follows live in **`.claude/rules/`**:
`project.md` (always on), `supabase.md` and `product.md` (path-scoped, load only when the
matching files are touched). This file is the human-readable long form. **Change a rule in
both, or change it in `.claude/rules/` — never here alone**, or you will write a rule nobody
follows. That is exactly what happened between June and 2026-08-25.

**This is the shared team file.** Committed and co-owned by all engineers. Each engineer keeps their own personal `CLAUDE.md` locally — gitignored, never committed.

---

## What this project is

Hello Sello is an **AI-native deal room for B2B** — a shared chat space between seller (distributor) and buyer (pharmacy), with an AI agent named **Sella** that processes deal conversations end-to-end (extracts offers, drafts confirmations, surfaces product documents, mediates negotiation).

**Beachhead market:** German medical cannabis — 50 licensed wholesalers, ~2,500 dispensing pharmacies. Tightly bounded, regulated, named universe.

**Lead customer:** Canadian Craft (cannabis distributor) — launches fully on Hello Sello with 25 pharmacy partners. ~€150k GMV from month one.

**Stage:** design DONE. Build sprint active. Demo target: **June 11** (Canadian Craft, 25 pharmacies).

**Category claim:** not a CRM, not a marketplace, not an ERP. A **Superspace** — an intelligent layer above whatever ERP/email/fax systems each company already runs. The moat is **neutrality** — the platform serves both sides of every deal from one shared room.

---

## Product design - 5 layers + 7 surfaces

Two complementary views of the product:

**5 horizontal layers** - cross-cutting design across the whole product:

1. Users and Core Objects (`LAYER-1`)
2. Product Surfaces (`LAYER-2`)
3. Deal Execution (`LAYER-3`)
4. Sella Behavior (`LAYER-4`)
5. Inputs and Outputs (`LAYER-5`)

Files: `docs/product/layers/LAYER-*.md`

**7 vertical surfaces** - per-surface deep dives:

1. Connect (100% depth, built first)
2. Present (sketch)
3. Buy (sketch)
4. Sell (sketch)
5. Discover (sketch)
6. Grow (sketch)
7. Sella (cross-cutting AI agent - present in every surface, not a sibling surface)

Files: `docs/product/surfaces/<NAME>.md`. Build strategy locked in `docs/decisions/DECISIONS.md` "Build strategy" chapter.

---

## Where things live

| Need | Path |
|---|---|
| **Codebase reference (file structure, conventions, TDD)** | **`docs/architecture/CODEBASE.md`** |
| **Demo scope (6 blocks, in/out list, June 11)** | **`docs/architecture/connect-demo.md`** |
| Screen designs + interaction spec (prototypes are the spec) | `prototypes/` |
| Schema, tables, RLS | `supabase/` + `docs/architecture/SCHEMA-DRAFT.md` |
| Domain glossary (term definitions) | `docs/architecture/CONTEXT.md` |
| Why a decision was made | `docs/decisions/DECISIONS.md` |
| Product design layers (horizontal) | `docs/product/layers/LAYER-*.md` |
| Per-surface deep dives (vertical) | `docs/product/surfaces/<NAME>.md` |
| Investor + customer pitch | `docs/product/PITCH.md` |
| Engineering implications (running scratchpad) | `docs/architecture/ARCHITECTURE-NOTES.md` |
| ADRs (full writeups of load-bearing decisions) | `docs/architecture/adr/` |
| External research (GDPR, tools, market, technical) | `docs/research/` |
| How we work together (branching, sync ritual, hygiene) | `docs/team/WORKFLOW.md` |
| Team skill dictionary + protocols | `docs/team/SKILLS.md` |
| Live cross-agent sync state | `docs/team/sync/{muskan,ayush}.md` |
| App code structure (module boundaries, the one rule) | `src/README.md` |
| Meeting notes | `docs/meeting-notes/` |
| Personal session state | Each engineer's gitignored `CLAUDE.md` (at repo root) |

---

## Core rules

- **Research before recommending** — on any security fix, schema/RLS change, or design decision: web-search the current published guidance FIRST (Postgres/Supabase docs, the vendor's own linter rules, OWASP), state what best practice says with the source, and only then recommend. Never lead with your own reasoning. Never propose the smaller fix because it feels safer without first naming the correct one — Muskan decides the trade-off, you supply the researched options. **Then check our own ADRs and `ARCHITECTURE-NOTES.md` before applying that guidance** — a documented local exception outranks generic advice, and whether it still holds is a query, not a reading. Both halves failed on HEL-69; `docs/agents/SECURITY-CHECKLIST.md` records how.
- **Doubts** via `/track-doubt` skill — never create Linear issues directly
- **Decisions** via propose-mode → preview the one-liner, ask, then write to `docs/decisions/DECISIONS.md`
- **Writes always preview first** — file edits, new files, Linear writes, anything external
- **Plain English** — preserve German verbatim where it appears in pitches
- **Linear** is our issue tracker (workspace `hellosello`, team `Development`)

---

## Git workflow

Three-tier: `main` ← `dev` (default branch for PRs) ← `claude/{name}/work` (personal).

Personal work PRs to `dev`; `dev` merges to `main` on a cadence. Run the sync ritual before any shared-file edit. Full protocol: `docs/team/WORKFLOW.md`.

---

## Agent skills

- **Issue tracker** — Linear via MCP. See `docs/agents/issue-tracker.md`.
- **Triage labels** — 5 canonical state labels. See `docs/agents/triage-labels.md`.
- **Domain docs** — Single-context. See `docs/agents/domain.md`.

---

## When building - context routing

If you're building and hit a doubt, go here:

| Doubt | Go to |
|---|---|
| How should this file be named / where does it live? | `docs/architecture/CODEBASE.md` |
| What's in scope for the demo? | `docs/architecture/connect-demo.md` |
| What should this screen look like / how should it behave? | `prototypes/` — the locked screens are the spec |
| What tables / fields exist? | `supabase/` + `docs/architecture/SCHEMA-DRAFT.md` |
| What does a term mean (P2P, Deal, Artifact, etc.)? | `docs/architecture/CONTEXT.md` |
| Why was this decision made? | `docs/decisions/DECISIONS.md` |
| How does this module talk to another module? | `src/README.md` (the one rule: only through `index.ts`) |
| What are the product rules for this flow? | `docs/product/layers/LAYER-*.md` + `docs/product/surfaces/<NAME>.md` |

---

## Session Checkpoint — moved

Live state: `.planning/session-log.md` (newest first) + each engineer's gitignored root
`CLAUDE.md`. History through 2026-06-21: `docs/team/SESSION-CHECKPOINT-ARCHIVE.md`.

This section used to hold a running log. It went two months without an update while
nothing read it — a log with no reader is not a checkpoint.
## Quick orientation for a fresh session

1. Hello Sello = B2B AI deal room (German medical cannabis beachhead)
2. Read your personal `CLAUDE.md` for current focus / what's next
3. Current build state: `.planning/session-log.md` + your `CLAUDE.md`
4. Cross-agent state in `docs/team/sync/` — check before editing any shared file
5. Linear (workspace `hellosello`) for your assigned issues
