# Hello Sello — always-on project rules

Loaded every session. Source of truth for the long-form versions is `AGENTS.md`
(human doc) and the files named below. Keep this file short.

## What this is

An **AI-native deal room for B2B** — a shared chat space between seller
(distributor) and buyer (pharmacy), with an AI agent, **Sella**, that processes
deal conversations end to end. Beachhead: German medical cannabis. Lead customer:
Canadian Craft. Not a CRM, not a marketplace, not an ERP — a **Superspace** above
whatever ERP/email/fax each company already runs. **The moat is neutrality:** one
shared room serving both sides of every deal.

## Core rules

- **Research before recommending.** On any security fix, schema/RLS change, or
  design decision: web-search current published guidance FIRST (Postgres/Supabase
  docs, the vendor's own linter rules, OWASP), state what it says **with the
  source**, then recommend. Never lead with your own reasoning. Never propose the
  smaller fix because it feels safer without naming the correct one — Muskan
  decides the trade-off, you supply the researched options.
  **Then check our own ADRs and `ARCHITECTURE-NOTES.md`** — a documented local
  exception outranks generic advice, and whether it still holds is a query, not a
  reading. Both halves failed on HEL-69; `docs/agents/SECURITY-CHECKLIST.md`
  records how.
- **Writes always preview first** — file edits, new files, Linear writes, anything
  external. Not on implied consent.
- **Doubts** via the `/track-doubt` skill — never create Linear issues directly.
- **Decisions** via propose-mode → preview the one-liner, ask, then write to
  `docs/decisions/DECISIONS.md`.
- **Plain English** — preserve German verbatim where it appears in pitches.
- **Linear** is the issue tracker (workspace `hellosello`, team `Development`).
- **Never substitute machinery silently.** A named agent, skill, or script that
  does not resolve is a blocker to surface, not a gap to fill with a similar name.

## Git

Three-tier: `main` ← `dev` ← `claude/{name}/work` (personal). Auto-push personal
branch after any commit; **never** auto-push `main` or `dev`. Opening a PR needs an
explicit ask. Full protocol: `docs/team/WORKFLOW.md`.

## Where to look when you hit a doubt

| Doubt | Go to |
|---|---|
| File naming / where code lives | `docs/architecture/CODEBASE.md` · `src/README.md` |
| What a term means (P2P, Deal, Artifact…) | `docs/architecture/CONTEXT.md` |
| Why a decision was made | `docs/decisions/DECISIONS.md` · `docs/architecture/adr/` |
| What tables / fields exist | `supabase/` · `docs/architecture/SCHEMA-DRAFT.md` |
| What a screen should look like | `prototypes/` — the locked screens are the spec |
| Product rules for a flow | `docs/product/layers/LAYER-*.md` · `docs/product/surfaces/<NAME>.md` |
| How the build pipeline works | `docs/agents/PIPELINE.md` |
| What we already got wrong | `docs/agents/LEARNINGS.md` — **read before `/spec` `/design` `/build` `/ship`** |
| Current focus / what's next | the gitignored root `CLAUDE.md` |
