# Build files — per-item scope & plan

One short file per build-plan item I own (Group M), named `<item>-<slug>.md` (e.g. `1b-auth-screens.md`). These are **Muskan's files** — solo push, no sync-lock needed.

Source of truth for *what* to build is [`../PRD/BUILD-PLAN.md`](../PRD/BUILD-PLAN.md) (the board + status). These files are the *how* for a single item.

## The ritual (per item)

| Step | What | Gate |
|---|---|---|
| 1. Plan | Create the item file — Goal + Scope (in/out) + open questions | — |
| 2. Research | Fill Research notes (PRD/surface doc → codebase → web where it's a design call) | — |
| 3. **Scope lock** | Show scope + task checklist → **Muskan approves** | ← the one checkpoint |
| 4. Build | Build end-to-end. Atomic commits. Sync-lock any *shared* file. Status → 🔨 | — |
| 5. Verify | typecheck / lint / preview | — |
| 6. Done | PR/merge · Status → ✅ · architecture-notes check · update CLAUDE.md what's-next | — |

After scope-lock (step 3), I build the item autonomously through verify, then report.

## File template

```markdown
# <item> — <title>
**Status:** <status> · **Size:** <S/M/L> · **Owner:** Muskan

## Goal
## Scope — in / out
## Research notes
## Task checklist
## Done criteria
```
