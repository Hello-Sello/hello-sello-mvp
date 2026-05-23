# Skills Dictionary

Custom skills and protocols for the Hello Sello project. Add new entries here whenever a skill is created.

---

## Skills

### `track-doubt`
**Invoke:** `/track-doubt`
**What it does:** Captures a design doubt as a Linear issue (Development team) + an inline marker in the relevant `LAYER-*.md`. Always previews before writing - nothing goes to Linear or the doc without your confirmation.
**Location:** `.claude/skills/track-doubt/SKILL.md`

---

## Protocols

### Decision logging
**Trigger:** Automatic - when a decision is being locked in conversation.
**What it does:** Claude proposes a one-liner for `DECISIONS.md`, shows a preview, waits for confirmation before writing. Engineering implications go to `ARCHITECTURE-NOTES.md`.

---

## Adding a new skill

Add a block under **Skills** (if it has a slash command + SKILL.md file) or under **Protocols** (if it's a workflow with no skill file).

---

*Last updated: 2026-05-23*

---

## External skills configured for this project

Matt Pocock's engineering skills are installed globally at `~/.claude/skills/` and configured for Hello Sello in `docs/agents/`.

Available skills:

- `grill-with-docs`, `to-prd`, `to-issues`, `triage`, `tdd`, `improve-codebase-architecture`, `prototype`, `diagnose`, `zoom-out`, `handoff`, `caveman`
- Rule books: `rules-refactoring`, `rules-legacy-code`, `rules-release-it`, `rules-ddd-distilled`, `rules-ddia`, `rules-clean-architecture` (pulled on-demand)

Per-project config:

- `docs/agents/issue-tracker.md` — Linear workflow
- `docs/agents/triage-labels.md` — label vocabulary
- `docs/agents/domain.md` — CONTEXT.md and ADR paths
