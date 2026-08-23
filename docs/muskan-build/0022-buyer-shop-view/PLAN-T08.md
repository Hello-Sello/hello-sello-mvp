# PLAN — T08 · Ops housekeeping the ADR surfaced · rev 1

**Ticket:** `TICKETS.md` § T08 (HEL-62) · **XS** · depends on: — · the slug's **last** ticket.
**Base:** `claude/muskan/work` @ `0094f5d` — 0 behind `origin/dev`, frozen.
**Doc-only. No migration, no source, no schema change.** Nothing to test-write; reviewer routing
is therefore `critic` alone (the `/build` rule for copy-only diffs).

---

## 0. ⚠️ The ticket's own line numbers are stale — L-030, again

Criterion 1 cites *"its `## PENDING (local only — NOT on cloud yet)` header at `:320` … followed by
a `✅ APPLIED 2026-08-16` subsection at `:322`"*.

**Measured today:** `:320` is inside the Phase-12 APPLIED block; the `## PENDING (local only …)`
header is at **`:498`**. The ledger has grown by ~180 lines since the ticket was written.

**The defect is real — and worse than the ticket describes.** It is not *one* APPLIED subsection
under the PENDING header. It is **all of them**:

| line | subsection | actual status |
|---|---|---|
| `:500` | 2026-07-24 Discover person↔person graph | **✅ APPLIED 2026-08-16 (Release 2)** |
| `:528` | 2026-07-07 Allocate/Sell schema | **✅ APPLIED 2026-07-07** |
| `:539` | 2026-07-06 Phase 7 Present fidelity | **✅ APPLIED 2026-07-07** |
| `:550` | 2026-07-05 DEV-99 taxonomy | **✅ APPLIED 2026-07-07** |
| `:561` | ⚠️ 2026-06-21 batch | **DONE — "only Phase 10 remains"** |

**Nothing under the "NOT on cloud yet" header is still pending.** A reader doing an ops push from
this section would re-push five applied batches. Per L-030 the numbers are re-derived here and the
edit is described by *what it is*, not by position.

---

## 1. Criterion 2 is already satisfied in code — it is the ticket TEXT that is missing

Criterion 2: *"When any migration in this slug re-creates a **view**, its criterion shall include
re-issuing `GRANT SELECT … TO authenticated` and `REVOKE ALL … FROM anon`."*

**T06 re-created a view** (`current_pricelist_item`) and **already did this** —
`20260822100000:181-182` issues both statements. Verified live:

```
relacl: {postgres=arwdDxtm/postgres, authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres}
has_table_privilege('anon', 'public.current_pricelist_item', 'SELECT') = f
```

No `anon` entry, no `anon` SELECT. **So there is no hole to close.** What is missing is that
**T06's written criteria never said to do it** — the builder did it from the ADR's grant ritual, not
from the ticket. That is the rot this criterion names: the next view re-creation has no written
instruction to inherit, and Supabase's default ACL still hands `anon` everything on new relations.

**Work:** add the criterion to T06's ticket, marked as documenting what already shipped — **not** as
a new build item, so nobody re-does it.

---

## 2. Scope addition — the missing ledger entries ⚠️ RECORDED, not assumed

The ticket's written criteria are the two above. **They do not mention the missing entries.**
Later notes (`STATE.md`, `PLAN-T07.md` §8/N5, T09's G4 page) all say *"T08 owns this"*, so it is
carried here — but that is a **widening of a written criterion, and L-017 makes it a gate item.**

**What is missing:** the ledger's own instruction is *"push the slug as one batch, in timestamp
order"*, and it is **unexecutable from itself**:

| migration | ticket | in the ledger? |
|---|---|---|
| `20260820090000` | T01 | ✅ entry present |
| `20260822090000` | **T05** | ❌ **no entry** — named in the banner as missing |
| `20260822100000` | T06 | ✅ entry present |
| `20260823090000` | **T09** | ❌ **no entry** — added to the banner at T07, still unwritten |
| `20260823100000` | T07 | ✅ entry present |

**T09's is the one that most needs same-deploy ordering** — `store.ts` now calls an RPC that does
not exist on production.

---

## 3. Files

| file | change |
|---|---|
| `docs/deploy/cloud-migrations-pending.md` | reconcile the PENDING/APPLIED section; write T05's and T09's entries |
| `docs/muskan-build/0022-buyer-shop-view/TICKETS.md` | add the view-grant criterion to **T06**, marked as documenting shipped behaviour |

**Grepped all three fences before writing these in (L-032):** neither file appears in ADR-0005's
`Reused` list, in the ADR body's component caps, or in `STATE.md` § `Locked`. The ledger is named
in T08's own `Files`; `TICKETS.md` is the slug's own ticket file, amended in place by T01, T02, T05
and T06 already.

---

## 4. Steps

1. **Reconcile the section.** Rename `## PENDING (local only — NOT on cloud yet)` (`:498`) to state
   what it actually holds — applied history — or move its five subsections under the existing
   APPLIED headings. **Preserve every table and note**: this file is the deploy audit trail and
   several entries carry pre-flight queries that were run against production. Reorganise, never
   delete.
   ⚠️ **The live pending section is the one at `:14`** (`## ⚠️ PENDING (2026-08-20, Muskan) — slug
   0022`). After the edit exactly one section may claim to hold un-pushed work, and it must be that
   one.
2. **Write T05's and T09's entries** into the `:14` section, in timestamp order alongside T01/T06/T07,
   each with what it does and its pre-flight — matching the shape of the entries already there.
3. **Add the view-grant criterion to T06** in `TICKETS.md`, marked `documents shipped behaviour`,
   citing `20260822100000:181-182` and the live `relacl` reading.

## 5. Gate

`critic` (copy-only routing). No tests to run — but **`supabase db reset` + the full SQL runners
must still be clean at the end**, because this ticket is the last gate before `/ship` and the whole
slug ships as a unit. Report both suite numbers, never "all".
