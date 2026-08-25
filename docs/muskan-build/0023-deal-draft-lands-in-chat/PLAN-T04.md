# 0023 T04 / HEL-66 — record the decision where the next person will look · PLAN rev 1

> Written at `/build` step 2, 2026-08-25. **The last ticket of slug 0023.**
> Budgets this round: `tests 0/2` · `blocking-findings 0/2` · `G4 rounds 1`.

---

## §0 · Why this ticket is load-bearing, not paperwork

Until it lands, **the PRD contradicts the shipped code** and the ADR under-discloses a security
finding. `TICKETS.md` calls it XS; that is its size, not its weight. The ADR is what the next
person reads before touching `send_deal`, and **§4.1's citations are systematically wrong while
every claim they support is true** — the worst possible combination, because a reader who spot-checks
one citation and finds it wrong learns to distrust the claims, and a reader who trusts the claims
follows the citations to the wrong code.

**Base:** clean, `origin/dev` 0 behind, nothing pending on cloud. **No migration.** T03's fix-round
commit (`e2e` corrections) had been left uncommitted at T03's close and was committed before this
ticket started — caught by `git pull --rebase` refusing to run.

---

## §1 · The truth table — every target opened and measured BEFORE writing

This is the whole ticket. **Fourteen stale citations have been caught on this slug**; the way T04
becomes the fifteenth is by copying line numbers out of the ADR instead of out of the files.

| # | claim in the doc | doc says | **TRUTH (measured)** |
|---|---|---|---|
| 6a | `msg_all` policy — ADR `:306`, `:411`, `:506` | `20260607170000:288-290` | **`:300-302`** (`:298` is a `);`, `:299` blank) |
| 6b | `deal_line_item`/`deal_card_log`/`deal_change_input` gate on `card_relationship_member` — ADR §4.1 `:307` | `20260607170000:300-311` | **`:312-322`** (`:300-302` is `msg_all`, `:304-306` is `card_all`, `:308-310` is `conf_all`) |
| 6c | `can_access_workspace` — ADR §4.1 `:307` | `20260607170000:105-113` | **`:117-125`**. 🔴 `:105-113` is **`is_workspace_member`** — a *different* function |
| 5 | the `on conflict` precedent — ADR `:225` and `:623` | `20260823090000:162-183` | **`:159-184`** (`:162` opens mid-comment; the `SELECT` starts `:159`, the block closes `:184`) |
| 9 | the pill's construction — PRD AC2 | `send_deal:131-140` | **`20260825090000:222-230`** — the line numbers are from the **superseded** migration |

🔴 **6c is the sharpest and is not a typo.** The ADR's claim — *"`deal_workspace` is born
`company_wide` so `can_access_workspace` passes"* — is **TRUE**: `:123` reads
`w.visibility = 'company_wide' OR public.is_workspace_member(w.id)`. But the citation points at
`is_workspace_member`, **the function the `OR` branch exists to bypass.** A reader following it
concludes membership is required — the exact opposite of what the sentence argues, and the
opposite of what T03 relies on to assert `deal_member === 1`.

---

## §2 · The edits — EIGHT owed, and the count itself has a history

`TICKETS.md` cut T04 with **three** ACs. It has grown by ruling four times since, each recorded at
the gate that made it: §8.9/§8.7 at G3 · ADR **J1** (`security` B1, T01's G4) · **AC 5's wording**
(Muskan, T02's G4) · **`TICKETS.md`'s own T03 AC list** (this session — AC 6 exists by ruling and
was never written down). **The ticket's own criteria are the thing most out of date**, which is the
same defect it exists to fix, one level up.

| # | file | edit | authority |
|---|---|---|---|
| 1 | `docs/architecture/CONTEXT.md:31` | "A Deal Card sitting inside **a P2P chat**" → **"a chat"** | §8.4 |
| 2 | `docs/decisions/DECISIONS.md` | dated entry: `:1013` is **PARTIALLY** superseded — **the `deal_card` arm ONLY**; the other three CTAs still route to the inbox. Plus the ADR-0003:48-49 correction as worded in ADR 0006's frontmatter | §8.5 |
| 3 | `docs/PRD/…:131` | the edge-case row *"the c2c conversation cannot be found → Send must not report success"* is **amended out** — the shipped behaviour is resolve-**or-create** | §8.9 ruling (a) |
| 4 | `docs/PRD/…:145-156` | AC1/AC2 wording, **and** AC2's `send_deal:131-140` → the shipped location | §8.7 + truth-table row 9 |
| 5 | ADR `:408` **J1** | must name **sender-identity forgery**; it currently discloses only the arbitrary-`deal_card_id` half | `security` B1, T01 G4 |
| 6 | ADR `:225`, `:623`, `:306`, `:411`, `:506`, `:307` | the five citation corrections in §1 | `security` N3 + `adr-checker` |
| 7 | `TICKETS.md` T02 **AC 5** | the literal `counterpartyPersonId: null` **stays** (`BasketDrawer.tsx:216`) — it is the effective "Whole company" default and **deleting it ships a dead Create button on every buyer group.** The code is right; the criterion's wording was stale | Muskan, T02 G4 ruling 1 |
| 8 | `TICKETS.md` T03 AC list | add **AC 6** (the call-site wiring), which exists by ruling and is proven | T02 G4 ruling 2 |

**Not in scope:** `ADR-INDEX.md`'s index line (that is `/design` step 5, not this ticket, per
`TICKETS.md`). No source, no migration, no test.

---

## §3 · Runnable order

1. **Sync lock** — `DECISIONS.md` and `CONTEXT.md` are shared files. The parallel session
   `security_tickets` **closed** and confirmed it wrote `DECISIONS.md` + `ARCHITECTURE-NOTES.md`
   and never touched `docs/team/sync/muskan.md`. Lock both, commit + push the sync file **alone**.
2. Edits 6 + 5 first (**ADR citations and J1**) — the highest-value, lowest-ambiguity changes, and
   the ones a later edit could accidentally renumber.
3. Edits 3 + 4 (**PRD**) — these are the two that make the PRD stop contradicting the code.
4. Edits 1 + 2 (**CONTEXT.md, DECISIONS.md**).
5. Edits 7 + 8 (**TICKETS.md**).
6. **Verify by re-grep, not by memory** — re-open every corrected citation and confirm it resolves,
   the same way §1 was built. A citation fixed from a stale note is still stale.
7. `tsc` + `eslint` are **not** meaningful here (no code changes) — say so rather than running them
   for the appearance of a gate. The honest gate is step 6.

---

## §4 · Declared uncovered, per [[L-051]]

| gap | owner |
|---|---|
| **No test can hold any of this.** Docs are not executable; the only guard is the re-grep in step 6 | **nobody, structurally** — stated because a "declared uncovered" table that omits the obvious is worse than none ([[L-050]]) |
| The **other** direction of edit 2 — whether `DECISIONS.md:961` (`pricelist_request` → inbox) should also move | **out of scope, deliberately.** STATE.md's `Supersede — CORRECTED` section rules it **still true** and not superseded |
| ADR-INDEX.md's line | `/design` step 5, not this ticket |
