# Triage Labels

The five canonical triage state labels used by `/triage`. They live in Linear (workspace `hellosello`).

| Label | Meaning | Applied when |
|---|---|---|
| `needs-triage` | Human needs to evaluate | New issue lands; before any other state |
| `needs-info` | Waiting on the reporter / requester | Triage finds the issue under-specified |
| `ready-for-agent` | Fully specified — AFK agent can pick it up with no human context | Triage confirms scope, acceptance criteria, modules touched |
| `ready-for-human` | Needs human implementation (design decision, complex judgment) | Triage decides it's not AFK-grade |
| `wontfix` | Will not be actioned | Closed-out reason |

These are **triage state labels** — orthogonal to:

- Linear's built-in workflow states (Triage / Backlog / Todo / In Progress / In Review / Done / Canceled)
- Topic labels (`Connect`, `Sella`, `Authentication`, etc.)

An issue can have one label from each family simultaneously.

**Before applying any of these**: verify they exist via `mcp__224a1bd7-7c59-4cb2-a35c-35a4a6596f13__list_issue_labels`. Create them in Linear's settings if missing.
