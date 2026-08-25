# 0023 T04 / HEL-66 — record the decision where the next person will look · PLAN rev 2

> rev 1 written at `/build` step 2, 2026-08-25. **rev 2 folds `plan-checker`'s REVISE — 5 blocking
> + 7 notes, all verified true by me before folding ([[L-003]]), all accepted, none argued down.**
> **The truth table survived intact** — it re-derived all five rows from the files and every
> replacement range is exact. **What failed was COVERAGE:** I measured five citations and walked
> past three more defect sites *inside my own declared files*, plus ten this slug broke itself.
> **The ticket is now TWELVE edits, not eight.**
> Budgets: `tests 0/2` · `blocking-findings 0/2` · `G4 rounds 1`. **The last ticket of slug 0023.**

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
| 5 | the `on conflict` precedent — ADR `:225` and `:623` | `20260823090000:162-183` | **`:159-184`** (the `SELECT` starts `:159`, the block closes `:184`. ⚠️ `:162` is a **BLANK LINE** — rev 1 said "mid-comment" and `STATE.md:791` says "mid-SELECT"; the shipped migration `20260825090000:205-206` has it right. Three renderings of one fact — carry the migration's) |
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


---

# rev 2 — what `plan-checker` found, and the four additions

## B1 · Edit 3 was a DELETION; the ruling said REWRITE

ADR `:607-608` records §8.9 verbatim: *"`PRD:131`'s edge-case row **becomes** 'the send creates
it; the deal still lands'"*. rev 1 said "amended out" — inherited from `TICKETS.md:171-172`, which
is **pre-ruling traceability prose**. Deleting it also loses a still-real case: a pair with no c2c
thread. **Use the ruled replacement text verbatim.**

That is [[L-039]] pointed at myself: I took scope from the ticket's struck-through prose instead of
from the gate's output.

## B2 · 🔴 The approved PRD says "Verified safe" about a hole this slug filed as HEL-67

`PRD:52` — *"Verified safe: `deal_detected` messages can only be written by Sella/service-role
(`20260614121000_propose_deal_rpc.sql:12`)"*.

ADR §7.4 `:503-509` refutes it in this slug's own design round: **"That line is a code comment."**
`msg_all` is `FOR ALL TO authenticated` with **no `type` predicate**, so an authenticated p2p member
can insert a `deal_detected` row today. That is HEL-67. **An approved PRD asserting "verified safe"
about a live, ticketed hole — in T04's declared file, and not in rev 1's eight.** → **EDIT 9.**

## B3 · Two more wrong citations in the PRD, never opened

`PRD:117-119` claims `inbox_select` and the company-thread policy are *"both plain
`current_company_id()` checks (`20260607170000:79-86, :231-232`)"*. Measured:

| claim | truth |
|---|---|
| `inbox_select` at `:79-86` | **`:243-244`**. `:79-86` is `is_hs_team()`'s tail + `owns_group()`'s head |
| company-thread policy at `:231-232` | **`thread_all` `:293-298`**, resolving via `can_access_thread`'s c2c arm `:136`. `:231-232` is **`person_group_all`** |

**§4.1's defect one file over** — every claim true, every citation wrong. → **EDIT 10.**

## B4 · 🔴 This slug's own diff falsified ~10 ADR citations. The principle, not a sweep.

rev 1 edited the ADR at six sites while ten of its other citations had been broken **by T01 and
T02** — `BasketDrawer.tsx:213-215`→`:215-216`, the picker slot `:311`→`:321-325`, the split
`:319`→`:329`, connect-first `:320-331`→`:329-348`, "Create a draft deal" `:345`→**`:373`**,
`RecipientPicker.tsx:26-27`→`:32-33`, the company select `:32-46`→`:38-52`, and the option string
`:56` **which no longer exists in that file at all**. Shipping an ADR that advertises corrected
citations while carrying ten it just broke is this plan's own §0 argument, inverted.

**The resolution is a distinction, not a sweep — and it is the useful output of this finding:**

> **An ADR is a decision record, not a maintained index.** Its design-time citations were true at
> rev 3 and re-pointing them every time code moves would falsify the record of what was known when
> the decision was made. But **§4.1 and the J-invariants are not design-time — they are
> currently-asserted guidance about what the system does now**, and a reader acts on them.

So, three buckets:

| bucket | action |
|---|---|
| design-time citations in §2/§3/§6/§8 | **frozen at rev 3**, declared in a dated banner. Not swept |
| **§4.1 + J1** — currently-asserted guidance | **corrected** (edits 5 + 6, already in scope) |
| statements now **FALSE in substance**, not merely drifted | **corrected regardless of bucket** |

**One qualifies for bucket 3 and it is not a line number.** ADR `:551` says the docstring *"already
claims the host navigates, and no host does."* **T01 rewrote that docstring** — it now reads *"No
caller navigates on it today — `DecisionBar.tsx:161` discards it"* (`actions.ts:365-367`). The
ADR's sentence about it is now **false in content**. → **EDIT 11** (banner + this one correction).

## B5 · 🔴 Edit 2 as written does not satisfy the ticket's own AC 2 — and the obvious fix breaks five citations

`TICKETS.md:141-143`: *"When a reader **reaches `DECISIONS.md:1013`**, a dated entry shall record
the partial supersede."* `DECISIONS.md` is append-at-tail chronological (last section `:1823`), so
a tail entry sits ~810 lines from where the AC sends the reader.

**And inserting above `:1013` is worse.** That line is cited by **five places** — ADR `:47`,
ADR `:563`, `PRD:6`, `STATE.md:54`, `STATE.md:68` (plus CLAUDE.md) — all of which survive only if
the line does not move.

**So: an inline marker IMMEDIATELY AFTER the `:1013` bullet, plus the dated tail entry.** The
marker satisfies the AC; the tail entry preserves the file's chronology. rev 1's §3 anticipated
renumbering *inside* the ADR and missed it *across files*. → **EDIT 12.**

## Notes accepted

**N1** — my "`:162` opens mid-comment" is **false**; `:162` is a **blank line**. The shipped
migration already says so correctly (`20260825090000:205-206`) while `STATE.md:791` says
"mid-SELECT" — **three renderings of one fact.** Carry the migration's wording.
**N2** — `is_workspace_member` is `:108-115`; `:105-113` straddles two functions. The substantive
point stands.
**N3** — measure J1's own `MessageBubble.tsx:43-45` while rewriting that paragraph (the id is read
at `:43`; "opens whatever id it carries" is `:46-53`).
**N4** — `PRD:154-155` contradicts the code beyond its citation: it states a `||` concatenation
falling back to `Someone`; shipped is `nullif(btrim(coalesce(...)))`. **For a person with a NULL
last name the PRD gives `Someone` and the code gives the first name** — and AC2 says *"assert the
constructed value"*. Named inside edit 4.
**N5** — `docs/muskan-build/deal-creation-and-delivery.md:66` has the same `:105-113` error.
**Recorded, NOT edited** — outside the declared file set, and widening scope at a checker's note is
how a docs ticket becomes unbounded.
**N6** — **`TICKETS.md`'s T04 Files list names neither the ADR nor `TICKETS.md` itself**, both of
which this ticket edits. §2's defect one level further up. Folded into edit 8.

## N7 — verified and CLEARED by `plan-checker`. Do NOT reopen.

`DECISIONS.md:961` correctly untouched · `ADR-INDEX.md:14` already carries 0006, so §4's deferral
is real and not an [[L-051]] hand-off · `ADR-0003:48-49` matches the frontmatter quote verbatim ·
§4.1 `:307`'s **other two** citations (`claim_deal_ticket:62-68`, `20260724120500:73-82`) are
**correct — do not "fix" them** · and the PRD keeping **Aurora / Canadian Craft** as actors is
**correct per §8.8** (ADR `:642-644`, production names kept for the eventual G5) — **do not** amend
them to GreenLeaf/StonePharm.

## Revised order

1. Sync lock (`DECISIONS.md`, `CONTEXT.md`) — commit + push alone.
2. **ADR**: edits 5, 6, 11 (J1 + §4.1 citations + the banner and the one false statement).
3. **PRD**: edits 3 (ruled text verbatim), 4 (+N4), 9, 10.
4. `CONTEXT.md` edit 1 · `DECISIONS.md` edit 12 (marker after `:1013`, never above) .
5. `TICKETS.md` edits 7, 8 (+N6).
6. **Re-grep every corrected citation**, and **re-confirm `DECISIONS.md:1013` is still line 1013.**
