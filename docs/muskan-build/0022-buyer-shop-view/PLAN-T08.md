# PLAN — T08 · Ops housekeeping the ADR surfaced · rev 3

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

**The defect is real — and worse than the ticket describes.** But **rev 1's account of it was
FALSE in one place and incomplete in three.** All four corrections come from checker round 1:

### 🔴 B1 — "Nothing under that header is still pending" is WRONG. Something is.

`:721` — **Phase 13 Settings + Lifecycle Emails**, under the PENDING header, marked
*"✅ MIGRATIONS APPLIED … (edge fns + RESEND key still pending)"*. `:737-740` is **the only
step-by-step in the repo** for three genuinely un-run cloud steps:
`supabase functions deploy send-lifecycle-email` · `… erase-expired-accounts` ·
`supabase secrets set RESEND_API_KEY`. Corroborated at `:794-799` and in `CLAUDE.md` item 0.

**rev 1's step 1, followed literally, files Phase 13 under APPLIED and the deploy debt loses its
instructions** — surviving only by accident at `:794-799`. That is the single worst outcome for
this file and rev 1 walked straight at it.

**The distinction rev 1 lacked: MIGRATION debt and NON-MIGRATION deploy debt are different
classes.** A batch can be fully applied and still owe edge functions and secrets.

### 🔴 B2 — the section has **13** subsections; rev 1 enumerated **5**

`:500 · :528 · :539 · :550 · :561` (rev 1's five) **plus** `:574 · :596 · :613 · :635 · :655 ·
:676 · :700 · :721`. rev 1's step 1 said *"move its five subsections"* — an executor following that
**orphans eight** under a renamed header. The eight are verified applied (Phases 1/2/3c/3d/3f are
the 2026-06-20 25-migration push, every filename appearing at `:459-467` and `:818-824`; Phase 13's
migrations at `:781`) — so this is an **instruction defect, not a fact error**, and step 1 is the
instruction the executor runs.

### 🔴 B3 — a SECOND `##` section claims un-pushed work, and rev 1 never opened it

`:402` — `## ⚠️ PENDING (2026-07-10) — person.company_id self-write lockdown (SECURITY)`, whose
`:411` reads **"⚠️ PRODUCTION IS STILL VULNERABLE until this is pushed"**. **It was applied five
weeks ago** — same file `:247` (session 64's direct pushes, reconciled 2026-07-22), corroborated by
`CLAUDE.md` 0b. So rev 1's acceptance rule was unachievable: after its edit, **two** sections would
still claim un-pushed work, one of them shouting a live production vulnerability that is closed.

### 🔴 B4 — a SIXTH local-only migration, in **no ledger section at all**

```
$ git diff --name-status origin/dev...HEAD -- supabase/migrations/
A  supabase/migrations/20260607090000_stack_default_privileges.sql   ← unledgered
$ grep -c 20260607090000 docs/deploy/cloud-migrations-pending.md
0
```

Applied locally (local `schema_migrations` carries it; 152 files ↔ 152 rows, no gaps), **not on
cloud** — the newest recorded push (`:192`, 2026-08-17) lists only the two `20260817*` files, and
this one was authored **2026-08-22** (`d052371`) despite its `20260607` filename.

**Two consequences:**
1. **The batch is SIX files, not five.** The ledger's own *"push the slug as one batch, in timestamp
   order"* stays unexecutable after T08 as rev 1 planned it — **the exact defect T08 exists to
   close, recurring one file over.**
2. **Its version sorts ~14 months before cloud's tip**, so a plain `supabase db push` treats it as an
   out-of-order insert and **refuses without `--include-all`** — the class documented at `:421`.
   Its own header claims prod application is a verified no-op against `pg_default_acl`, so the risk
   is **the push protocol, not wrong grants landing**.

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

**The wider sweep rev 1 skipped comes back CLEAN** (checker round 1, N2): `current_pricelist_item`
is **the only view in the entire schema**, and `grep -niE "create (or replace )?(view|materialized
view|table|sequence)"` across all six migrations returns exactly one hit (`20260822100000:151`).
**No other relation, so no missed `anon` read.** rev 1's conclusion holds under the check it did
not do.

**Two things the criterion must carry, which rev 1 did not know:**
- **It is already test-enforced, in two files rev 1 never cited** — `cross_tenant_lockdown_test.sql:86`
  and `pricelist_item_tier_test.sql:102` both assert `has_table_privilege('anon',
  'public.current_pricelist_item', …)` false. Meanwhile **ADR-0005's invariant table names
  `anon_execute_lockdown_test.sql` "extended to relations" as the enforcer — and that file contains
  no relation check at all** (0 matches for `view|relacl|pg_class|relkind|has_table_privilege`).
  **Point the criterion at the tests that actually guard it**, and correct the ADR's claim.
- `authenticated=arwdDxtm` survives on the view (migration 0's default privileges at CREATE time,
  never revoked). **Inert** — `information_schema.views.is_updatable = NO` — but on an owner-rights
  view it earns one sentence rather than a silent pass.

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
| **`20260607090000`** | **none — `stack_default_privileges`** | ❌ **absent from the file entirely (B4)** — authored 2026-08-22, named 2026-06-07 |

**Six migrations, not five.** rev 1's table stopped at the slug's own tickets and missed the one
that belongs to no ticket — which is exactly how it went unledgered in the first place.

**T09's is the one that most needs same-deploy ordering** — `store.ts` now calls an RPC that does
not exist on production.

---

## 3. Files

| file | change |
|---|---|
| `docs/deploy/cloud-migrations-pending.md` | reconcile the PENDING/APPLIED section; write T05's and T09's entries |
| `docs/muskan-build/0022-buyer-shop-view/TICKETS.md` | add the view-grant criterion to **T06**, marked as documenting shipped behaviour |
| `docs/architecture/adr/0005-buyer-shop-view.md` | **added at rev 3 (B-E)** — `:875` credits the wrong test file; `:863` repeats the ticket's stale citation. **Fence-checked (L-032):** the ADR is not in its own `Reused` list, and `STATE.md` § `Locked` fences `ShopView`/`BasketDrawer`/`relationship`/`pending_inbox_item` — **not the ADR document itself**, which this slug has amended at G4 three times. **Entered as deviation 4.** |

**Grepped all three fences before writing these in (L-032):** neither file appears in ADR-0005's
`Reused` list, in the ADR body's component caps, or in `STATE.md` § `Locked`. **N3 — the grep missed a fourth mention that
*supports* the plan:** `0005:863`'s blast-radius table says *"**Entries per slice**; app code +
migrations are **same-deploy**"* — the strongest citation for B4 and for deviation 1. The ledger is
named in T08's own `Files`; `TICKETS.md` is the slug's own ticket file, amended in place by T01, T02, T05
and T06 already.

---

## 4. Steps — rev 3. rev 2's step list carried four NEW blocking defects of its own.

1. **Separate the two classes of debt.** *Migration* debt and *non-migration deploy* debt are
   different; the section conflates them. A batch can be fully applied and still owe edge functions,
   secrets and UAT.
2. **Reconcile `## PENDING (local only — NOT on cloud yet)` across all 13 subsections.** Applied ones
   move under an APPLIED heading or are restated in place. **Two carry non-migration residue and
   BOTH must be ruled explicitly** — rev 2 found one and protected it by line number:
   - 🔴 **B-B — Phase 13's residue is TWO bolded blocks, not one.** rev 2 said preserve `:737-740`.
     `:742-744` is a **separate** block — *"⚠️ Cloud UAT required"*, the erasure auth-scrub and
     session-revoke — genuinely owed and **unique in the file** (unlike `:737-740`, it has **no**
     duplicate at `:794-799`). An executor preserving exactly `:737-740` **destroys it**.
     **B1's failure mode, one bullet block over, inside B1's own fix.**
     **→ Protect Phase 13's residue by WHAT IT IS — both bolded blocks — never by a line range.**
   - 🔴 **B-C — Phase 11 (`:587-589`) carries a block in the IDENTICAL bolded form**
     (`SUPABASE_SECRET_KEY` in Vercel; paste `invite.html` into the dashboard). The file flags this
     class in **three** places — Phase 12 at `:598` explicitly says *"No non-migration cloud
     steps"* — and rev 2 found one. It **appears** discharged at `:815`, but that line does not name
     `invite.html` and sits 228 lines away. **→ Rule it explicitly: discharged, citing `:815`, or
     preserved as owed if `invite.html` cannot be confirmed. Do not let it be swept.**
3. **Fix `:402`** — the section shouting *"PRODUCTION IS STILL VULNERABLE"* about a lockdown applied
   in session 64. Mark applied, cite `:247` and the 2026-07-22 reconcile. **Then fix `:264`'s
   dangling pointer** (N-4) — it points at a *"2026-07-20 marker"* that does not exist (`:402` is
   dated 2026-07-10), and step 3 makes its claim stale.
4. **Write the three missing `:14` entries in timestamp order** — `20260607090000`, `20260822090000`
   (T05), `20260823090000` (T09) — each with its pre-flight. **`20260607090000`'s entry must carry
   the `--include-all` requirement AND a `pg_default_acl` pre-flight that names the ROLES, not just
   the privilege letters** (that omission is exactly why L-034 went undetected).
5. 🔴 **B-D — banner `:421-456` AND `:478-494`.** rev 2 banner-ed only the first. `:478` is a `##`
   heading asserting *"one batch of 15"* with four live commands beneath it, whose only qualifier
   (`:480`) points at `:421-456` — **so rev 2's step 5 actively worsened it**, invalidating the sole
   pointer and leaving `:478-489` the last live-looking push procedure in the file: stale, and silent
   on the `--include-all` this batch now needs. **→ Banner both, and give the `:14` section a
   current, batch-level push procedure.** Also fold N-3: `:249-253` and `:316-318` **contradict each
   other** about whether a plain `db push` is blocked by the `buy_schema` orphan row — two copies,
   opposite claims, about the exact command step 4 prescribes.
6. **Add the view-grant criterion to T06** in `TICKETS.md`, marked `documents shipped behaviour`,
   citing `20260822100000:181-182`, the live `relacl`, and **the two suites that actually enforce
   it** (`cross_tenant_lockdown_test.sql:86`, `pricelist_item_tier_test.sql:102`).
7. 🔴 **B-E — the ADR correction needs its own authority, or it does not happen here.**
   ADR-0005's invariant table (`:875`) credits `anon_execute_lockdown_test.sql` with a relation
   check **it does not contain** (0 matches). rev 2 put that edit in step 6 while the ADR was in
   **neither `Files` nor the deviations table nor the fence grep** — and the ADR is a **Muskan-ruled
   object** here, with two `Reused`-fence amendments ruled at G4. **L-032 and L-017 both cited by
   this plan, both violated by its own step 6.** **→ ADR-0005 is added to `Files` below, fence-checked,
   and entered as deviation 4.** Also correct `:863`, which repeats the ticket's stale `:320/:322`
   citation and goes fully false once T08 lands (N-5).

**Acceptance rule (rev 2's was still unachievable — B-D found a fourth section):** after the edit,
**exactly one section may claim un-pushed MIGRATIONS** — the `:14` slug-0022 section, holding **six**
entries — **every** piece of non-migration deploy debt is findable under a heading that says so
(Phase 13's two blocks, and Phase 11's ruled either way), and **no other section carries a runnable
push procedure without a SUPERSEDED banner.**

⚠️ **N-7 — every step above targets by position in the file step 2 reorganises.** All line numbers
here are provisional by definition; each step also names its heading text so it survives. **The
executor re-derives before editing** (L-030).

## 4b. Deviations table — L-017 requires one, and rev 1 had none (N4)

| # | deviation | requester's words | ruling |
|---|---|---|---|
| 1 | **The missing ledger entries are carried by T08 although its written criteria do not mention them.** Sourced from four places: `STATE.md:461`, `G4-T06.md:228` (*"**T08 owns this.**"*), `G4-T07.md:114`, `REVIEW.md:350` (K4 — *"no ticket in the slug owns ledgering it"*), plus the ledger's own banner `:16-29`. | *"T08 owns this"* | **owed at G4** |
| 2 | **B4's `20260607090000` belongs to no ticket at all** — it is not slug work; it is unledgered work discovered by this slug. Ledgering it is a further widening. | — | **owed at G4** |
| 3 | Fixing `:402`, `:264`, and banner-ing `:421-456` **and `:478-494`** are outside both written criteria — same file, adjacent rot. | — | **owed at G4** |
| **4** | **Editing `ADR-0005` (`:875` wrong enforcer, `:863` stale citation)** — a third file, outside both written criteria, on a Muskan-ruled object. Added to `Files` and fence-checked at rev 3 rather than done quietly, per **B-E**. | — | **owed at G4** |
| **5** | **`20260607090000` was AMENDED** (`466cfc2`) — a migration edit, from a doc-only ticket. **Muskan ruled it live** rather than at the gate, because it changes what lands on production. **L-034.** | *"Amend the file in place"* | ✅ **RULED 2026-08-23** |

> **N4, honestly:** rev 1 declared the widening and named L-017, then routed the gate to `critic`
> alone **with no gate page** — declaring it in front of nobody. This table plus a `G4-T08.md` is
> the fix. **A doc-only ticket still gets a gate when it widens its own criteria.**

## 5. Gate

`critic` (copy-only routing). No tests to run — but **`supabase db reset` + the full SQL runners
must still be clean at the end**, because this ticket is the last gate before `/ship` and the whole
slug ships as a unit. Report both suite numbers, never "all".
