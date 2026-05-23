# Team Workflow — Muskan & Ayush

How we work together on this repo without stepping on each other's files or tasks.

**Current team:** 2 developers — Muskan (mostly backend) and Ayush (mostly frontend). Roles are loose; either of us can pick up frontend or backend work when the issue calls for it.

This workflow is for Muskan + Ayush. Other teammates (Marcel, Victor) have their own setups and Linear assignments — coordination with them stays through Linear and Slack as usual.

---

## Branching

We use **persistent per-person branches**, not a single shared branch.

| Branch | Owner | Purpose |
|---|---|---|
| `main` | Shared. Source of truth. Never push directly. | Production-bound code |
| `claude/muskan/work` | Muskan | Muskan's working branch — Claude resumes context here |
| `claude/ayush/work` | Ayush | Ayush's working branch |

**Daily flow per person:**

1. Start session → `git pull origin main` → rebase your branch onto main
2. Work, commit on your own branch
3. Open a PR (your branch → `main`) when a batch is ready
4. After your PR merges → reset your branch from new main and continue

---

## Task ownership — Linear is the source of truth

**Rules:**

1. Don't start work on an issue without **assigning it to yourself** in Linear
2. Move the issue to **`In Progress`** when you actually start
3. If an issue is already `In Progress` for the other person, don't touch it without asking
4. Move to **`In Review`** when the PR is up
5. Move to **`Done`** when merged

**Default routing (not rules, just heuristics):**

- Frontend-leaning issue → Ayush
- Backend-leaning → Muskan
- Cross-cutting → discuss before starting

Either of us can pick up either area when the queue calls for it.

---

## Shared files — fast PR culture

Some files are co-owned. They conflict if we both edit them at the same time.

**Shared files (treat with care):**

- `AGENTS.md`, `SKILLS.md`
- `docs/architecture/CONTEXT.md`
- `docs/decisions/DECISIONS.md`
- `docs/architecture/adr/*.md`
- `docs/agents/*.md`
- All `docs/product/LAYER-*.md`

**Rules:**

1. **Pull before editing.** `git pull origin main` and rebase. Always.
2. **Commit + push fast.** Don't sit on shared-file changes overnight.
3. **PR immediately.** Shared-file PRs jump the queue — review and merge within hours, not days.
4. **Tell the other person.** A quick chat ping ("editing CONTEXT.md now") prevents the worst conflicts.

Existing propose-mode protocols (DECISIONS.md edits, `/track-doubt` for Linear writes) still apply on top of this.

---

## Owned areas — light touch

We have a natural-but-flexible split:

| Area | Default owner | Other person can touch? |
|---|---|---|
| `frontend/` | Ayush | Yes, with a heads-up |
| `backend/` | Muskan | Yes, with a heads-up |
| `infra/` | Either | Yes — usually low-conflict |
| `docs/` | Either | Yes — but follow shared-file rules above |

"Heads-up" = a quick chat message before starting. Not a formal sign-off.

---

## AI agent hygiene

Both of us run Claude Code with the same skills. Two agents can plausibly edit the same file within the same hour if we're not careful.

**Rules:**

1. **Before any Claude Code session that might touch shared files** — `git pull` first. Don't let Claude work off stale state.
2. **AFK loops stay inside owned areas.** Long autonomous runs (`/triage`, future Ralph loops) should operate on `frontend/` (Ayush) or `backend/` (Muskan), not cross-area shared files.
3. **`grill-with-docs` updates to `CONTEXT.md` → commit + push immediately.** Don't let it sit uncommitted across other work — that's how the file ends up in two places at once.

---

## PR review

- **Default reviewer is the other person.**
- Title + 3-5 bullets in the body. Reviewers read the diff, not the prose.
- Approval can be informal (thumbs up, "lgtm").
- Big architectural or cross-area changes: ask for a quick voice/video sync before approving.

---

## WIP visibility — Linear is enough

We don't keep a separate WIP doc. **Linear's `In Progress` column shows who's doing what.** Check it before picking up a new task.

If something blocks you and the other person doesn't know — chat first, then add a comment to the Linear issue.
