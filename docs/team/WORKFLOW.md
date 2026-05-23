# Team Workflow — Muskan & Ayush

How we work together on this repo without stepping on each other's files or tasks.

**Current team:** 2 developers — Muskan (mostly backend) and Ayush (mostly frontend). Roles are loose; either of us can pick up frontend or backend work when the issue calls for it.

This workflow is for Muskan + Ayush. Other teammates (Marcel, Victor) have their own setups and Linear assignments — coordination with them stays through Linear and Slack as usual.

---

## Branching

Three-tier branch hierarchy.

| Tier | Branch | Purpose | Who pushes |
|---|---|---|---|
| Production | `main` | Deployed code. Receives merges only from `dev`, on a release cadence. | Nobody directly — only via PR from `dev` |
| Integration | `dev` | Where personal work converges. CI/CD will run here once code exists. Default branch for PRs. | Nobody directly — only via PR from a personal branch |
| Personal | `claude/muskan/work` (Muskan), `claude/ayush/work` (Ayush) | Where each of us works day-to-day. Claude resumes context here. | The owner only |

**Daily flow per person:**

1. Start session → `git fetch` → rebase your branch onto `origin/dev`
2. Work, commit on your own branch
3. When a batch is ready → PR your branch → `dev`
4. After PR merges → reset your branch from new `dev` and continue

**Release flow (continuous, current phase):**

- When `dev` is green and a meaningful chunk has landed → open PR `dev` → `main`
- Default cadence: end of every working week, or whenever a milestone lands
- Once we have CI/CD set up: `dev` → `main` only merges when GitHub Actions tests pass (configured later, when code exists)
- Once we have real users: switch to explicit release tags instead of continuous merges

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

- `AGENTS.md`
- `docs/team/WORKFLOW.md`, `docs/team/SKILLS.md`
- `docs/architecture/CONTEXT.md`
- `docs/decisions/DECISIONS.md`
- `docs/architecture/adr/*.md`
- `docs/agents/*.md`
- All `docs/product/LAYER-*.md`

(The per-person sync files `docs/team/sync/ayush.md` and `docs/team/sync/muskan.md` are NOT in this list - each is owned by exactly one agent, no possibility of conflict.)

**Rules:**

1. **Pull before editing.** `git fetch origin && git pull origin <your-branch> --rebase`. Always.
2. **Run the sync ritual first** (see next section). Shared-file edits never start without it.
3. **Commit + push fast.** Don't sit on shared-file changes overnight.
4. **PR immediately.** Shared-file PRs jump the queue — review and merge within hours, not days.
5. **Tell the other person.** A quick chat ping ("editing CONTEXT.md now") prevents the worst conflicts.

Existing propose-mode protocols (DECISIONS.md edits, `/track-doubt` for Linear writes) still apply on top of this.

---

## Sync ritual — per-agent state files

Two AI agents working in parallel can step on each other's edits faster than chat or Linear can catch up. The sync files close that gap by publishing each agent's live state via git.

**How it works:**

- Each agent owns ONE file: Ayush's agent writes only to [`docs/team/sync/ayush.md`](sync/ayush.md), Muskan's agent writes only to [`docs/team/sync/muskan.md`](sync/muskan.md). Zero merge conflicts possible by design - separate file paths, no overlap.
- Both agents READ both files before editing any shared file.
- State publishes via normal git push.

**Schema (kept tight - 6 structured fields + free-form note):**

| Field | Example |
|---|---|
| Last updated | `2026-05-23 14:32 UTC` |
| Branch | `claude/ayush/work` |
| Status | `offline` \| `idle` \| `active` |
| Linear issue in progress | `DEV-63` or `none` |
| Shared files locked | `docs/architecture/CONTEXT.md` or `none` |
| PR open | `#42 + link` or `none` |
| Notes for the other agent | Free-form 1-2 lines |

**Ritual (before editing any shared file):**

1. `git fetch origin && git pull origin <your-branch> --rebase` - get latest sync files.
2. Read the OTHER person's sync file. Is the file you want to edit in their `Shared files locked` list?
   - **Yes** → don't edit. Tell the user "the other agent is in this file. Wait, or message them."
   - **No** → continue.
3. Update YOUR sync file: add the file to `Shared files locked`, bump `Last updated`. **Commit + push the sync file alone** (one-line commit, no other changes batched in).
4. Make the actual edit. Commit + push as usual.
5. Update YOUR sync file: remove the file from `Shared files locked`, bump `Last updated`. Commit + push.

**For non-shared files** (your own area: `frontend/` for Ayush, `backend/` for Muskan, your personal `CLAUDE.md`): no sync ritual needed. Just work.

**For Linear task tracking,** Linear's "In Progress" column is still the source of truth at the task level. The sync files cover the more granular file-level coordination.

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

1. **Before any Claude Code session that might touch shared files** — `git fetch` and rebase off `origin/dev` first. Don't let Claude work off stale state.
2. **Run the sync ritual** (see above) for every shared-file edit. The sync files are designed for exactly this risk.
3. **AFK loops stay inside owned areas.** Long autonomous runs (`/triage`, future Ralph loops) should operate on `frontend/` (Ayush) or `backend/` (Muskan), not cross-area shared files.
4. **`grill-with-docs` and similar tools touch shared files** — they must run the sync ritual too. Don't let edits sit uncommitted across other work.

---

## PR review

- **Default reviewer is the other person.**
- Title + 3-5 bullets in the body. Reviewers read the diff, not the prose.
- Approval can be informal (thumbs up, "lgtm").
- Big architectural or cross-area changes: ask for a quick voice/video sync before approving.

---

## WIP visibility — two layers

- **Task level:** Linear's `In Progress` column. Check before picking up a new issue.
- **File level:** `docs/team/sync/*.md`. Check before editing any shared file (see sync ritual above).

If something blocks you and the other person doesn't know — chat first, then add a comment to the Linear issue.
