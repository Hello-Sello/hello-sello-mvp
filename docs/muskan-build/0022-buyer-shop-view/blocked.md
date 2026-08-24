# BLOCKED — T08, at plan stage · 2026-08-23

**Checker budget 2/2 SPENT. Did NOT converge** — round 1 = 4 blocking (rev 1's *central claim* was
false), round 2 = **5 blocking, ALL NEW**, every one inside text rev 2 wrote while fixing round 1.
**Eighth consecutive ticket on this slug to do this.**

T08 is a doc-only XS ticket. It has now found a **production security regression** in the ship batch.

---

## ▶ THE ONE THAT MATTERS — `20260607090000` must not ship as written

**`supabase/migrations/20260607090000_stack_default_privileges.sql:49-50`:**
```sql
alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated, service_role;
```

**`supabase/migrations/20260817120000_anon_execute_lockdown.sql:167-168` — LIVE ON PRODUCTION since
2026-08-17:**
```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;
```

**Locally the end state is correct** — measured today:
```
f | {postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}    ← anon absent
```
**…but only because `090000` replays FIRST.** Its filename says 2026-06-07; it was authored
**2026-08-22** (`d052371`).

**On a cloud push it runs LAST.** `20260817120000` already ran and will not re-run. So the grant
re-widens the functions default on production and **nothing revokes it again** — re-opening the
deny-by-default that session 77 installed deliberately.

**Bounded, not nil:** the `revoke_anon_execute_on_new_function` event trigger (also live) still
strips `anon` at `CREATE FUNCTION`, so new functions stay locked. Session 77 installed the default
*and* the trigger on purpose; this removes one of the two.

**rev 2 ruled this out** — it wrote *"the risk is the push protocol, not wrong grants landing"*,
adopting the migration's own header claim of *"a verified no-op"* instead of querying. **L-031's
exact trigger, in a plan that cites L-030, L-031 and L-032.**

### Options

| | what | cost |
|---|---|---|
| **A** | **Amend `20260607090000` in place** — drop `anon` from the functions grant (and audit the sequences/tables grants beside it the same way) | **The file is unpushed, so amending is free and leaves no re-declare risk** — the same move T05 made on `20260822090000`. Makes the header's "no-op" claim true. |
| **B** | Push as-is, then a follow-up migration re-issuing the revoke | Two files, a window where prod is wide, and a seventh migration in the batch |
| **C** | Drop it from the batch — never push it | Local and cloud diverge on `pg_default_acl`, and the file's stated purpose is to make them match |

**Recommendation: A.** It is unpushed, so it can still be corrected rather than compensated for.

---

## The other four blocking findings — all NEW, all in rev 2's own fixes

- **B-B · Phase 13's protection is a LINE RANGE, and it excludes `:742-744`.** rev 2 says preserve
  `:737-740`. `:742-744` is a *separate* bolded block — **⚠️ Cloud UAT required**, the erasure
  auth-scrub and session-revoke — genuinely owed, and **unique in the file** (unlike `:737-740` it
  has no duplicate at `:794-799`). An executor preserving exactly `:737-740` destroys it.
  **B1's failure mode, one bullet block over, inside B1's own fix.**
- **B-C · the survey never opened the only OTHER "Non-migration cloud steps" block.** Phase 11
  (`:587-589`) carries one in the identical bolded form — `SUPABASE_SECRET_KEY` in Vercel, and
  pasting `invite.html` into the dashboard. rev 2's thesis is that this class exists; it then found
  one instance of it. (Phase 12 at `:598` explicitly says *"No non-migration cloud steps"* — the
  file flags this class in **three** places.)
- **B-D · the corrected acceptance rule is STILL unachievable — there is a fourth section.**
  `:478` — *"## How to push the pending migrations to cloud … one batch of 15"* — with four live
  commands beneath it. **rev 2's step 5 actively worsens it:** marking `:421-456` `SUPERSEDED — DO
  NOT RUN` invalidates `:480`'s only pointer, leaving `:478-489` as the last live-looking push
  procedure in the file — stale, and silent on the `--include-all` this batch now needs.
- **B-E · step 6 edits a THIRD file that is in neither `Files` nor the deviations table.**
  Correcting ADR-0005's invariant table. The ADR is a **Muskan-ruled object** on this slug — two
  `Reused`-fence amendments, each ruled at G4. **L-032 and L-017 are both cited by this plan and
  both violated by its own step 6.** The *finding* belongs to T08; the *edit* needs `Files`, a fence
  check, and a ruling.

## What both rounds confirmed CORRECT — do not re-litigate
13 subsections · **six-file batch** · `20260607090000` unledgered and local-applied (**152 files ↔
152 `schema_migrations` rows**, both set-differences empty) · `--include-all` (confirmed against the
v2.75.0 binary's own strings) · `anon_execute_lockdown_test.sql` has **no** relation check while
`cross_tenant_lockdown_test.sql:86` and `pricelist_item_tier_test.sql:102` do · one view in the
schema · the fence grep.
