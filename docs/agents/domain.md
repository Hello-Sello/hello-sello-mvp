# Domain Docs

This project is **single-context** — one domain glossary, one ADR folder. The paths differ from Matt Pocock's defaults; the skills should look in these locations.

## Paths

| Doc | Path | Purpose |
|---|---|---|
| Domain glossary | `docs/architecture/CONTEXT.md` | Ubiquitous language. Read this before naming anything new. |
| Architecture Decision Records | `docs/architecture/adr/0001-*.md` (and counting) | Full writeups of load-bearing decisions: context, decision, consequences. Created by `grill-with-docs` only when a decision is hard-to-reverse + surprising + a real trade-off. |
| One-line decision log | `docs/decisions/DECISIONS.md` | Existing project convention. One line per locked decision with rationale. Coexists with ADRs — an ADR is for the full writeup, DECISIONS.md is the index. |

## How skills should treat these files

- **`grill-with-docs`** — update `CONTEXT.md` inline as terms crystallize. Propose ADRs sparingly. New ADRs go in `docs/architecture/adr/`.
- **`improve-codebase-architecture`** — read `CONTEXT.md` for domain vocabulary. Read `docs/architecture/adr/` to avoid re-suggesting refactors that contradict existing ADRs.
- **`tdd`, `diagnose`** — use `CONTEXT.md` vocabulary in test names and bug descriptions.

## Relationship to `track-doubt`

`/track-doubt` writes inline markers in `LAYER-*.md` (`docs/product/`) and creates Linear issues. It does NOT touch `CONTEXT.md` or ADRs. A doubt resolved later may produce an ADR — but only when the resolution meets the three criteria above.
