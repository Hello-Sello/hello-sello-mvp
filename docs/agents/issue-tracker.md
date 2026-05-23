# Issue Tracker — Hello Sello

This project uses **Linear** as the canonical issue tracker for engineering work. Agents interact with Linear via the Linear MCP (`mcp__224a1bd7-7c59-4cb2-a35c-35a4a6596f13__*`).

**Workspace:** `hellosello`
**Team:** `Development`

## Two issue types coexist in Linear — keep them distinct

| Type | Created by | Purpose |
|---|---|---|
| **Design doubt** | `/track-doubt` skill (existing) | Captures open design questions from `LAYER-*.md` docs |
| **PRD / engineering task** | `/to-prd`, `/to-issues` | Engineering work — features, bugs, refactors |

**Critical:** Matt Pocock's coding skills (`to-prd`, `to-issues`, `triage`, etc.) MUST NOT create doubt-style issues. Doubts always go through `/track-doubt`.

## What each skill does

### `/to-prd`

- Creates **one Linear issue** with label `prd`
- Title: short PRD name
- Description: full PRD body (per `to-prd` skill template — problem, solution, user stories, implementation decisions, out of scope)
- Initial state: `needs-triage` label + Linear's `Triage` workflow state
- Tool: `mcp__224a1bd7-7c59-4cb2-a35c-35a4a6596f13__save_issue`

### `/to-issues`

- Creates **one Linear sub-issue per vertical slice**
- Parent: the PRD issue (set via `parentId`)
- Description: per `to-issues` template (What to build / Acceptance criteria / Blocked by)
- Initial labels: `ready-for-agent` (AFK) or `ready-for-human` (HITL), plus topic label if relevant
- Order: publish in dependency order so "Blocked by" references real Linear IDs

### `/triage`

- Reads issues with `needs-triage` label
- Moves them through state via labels — see `docs/agents/triage-labels.md`
- Linear's workflow states (Triage / Backlog / Todo / In Progress / In Review / Done) are orthogonal — both can apply

## Linear-native concepts to use

- **Parent / sub-issue relationship** for PRD → vertical slices (not "blocks" relationships between standalone issues)
- **Built-in workflow states** for lifecycle: Triage, Backlog, Todo, In Progress, In Review, Done, Canceled
- **Labels — two families coexist**:
  - Triage state (this skill's concern): `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`
  - Topic (existing): `Connect`, `Sella`, `Authentication`, `R&D`, `Present`, `Sell`, `Buy`, `Trade`, `Discover`
  - An issue can have one from each family.

## Discovery tools — call before writing

- `list_projects` — list Linear projects
- `list_issue_labels` — list current label vocabulary
- `list_issue_statuses` — list workflow states
- `list_issues` — search existing issues

(All under the `mcp__224a1bd7-7c59-4cb2-a35c-35a4a6596f13__*` prefix.)

**Always verify labels and project IDs via MCP before writing** — don't hardcode strings that may have changed.

## Do NOT

- Create Linear issues for design doubts — use `/track-doubt`
- Create GitHub Issues for engineering work — everything goes in Linear
- Invent label names — use the canonical 5 from `triage-labels.md`, or existing topic labels verified via MCP
- Delete or rename labels without team agreement
