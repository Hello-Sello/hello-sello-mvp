---
name: diagnose
description: BUG-lane front half - reproduce the bug, write THE failing
  regression test, hand to /build. Never fixes. Use /diagnose <slug>.
  Inside this repo this overrides the global diagnose skill.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

# /diagnose — from bug report to failing regression test

0. The slug must be triaged `lane: BUG` (run /triage first). Open
   `docs/muskan-build/<slug>/STATE.md`.

1. **Reproduce deterministically.** A bug you cannot trigger on demand is not
   diagnosed. Build the cheapest agent-runnable pass/fail signal (unit ·
   pgTAP · e2e · curl against the dev server) and minimise it to the
   smallest failing case.

2. **Write THE regression test** — the one that fails for the reported
   reason and passes only when the bug is fixed. Permanent home per repo
   convention (`src/**/*.test.ts` · `supabase/tests/*_test.sql` ·
   `e2e/*.spec.ts`), named after the behavior, never a Linear code. Run it
   and quote the red output — a diagnosis without a failing test is a guess.

3. **Root cause, in writing:** one paragraph in STATE.md `For Muskan` —
   what breaks, where, why, with file:line evidence.

4. **STOP. Never fix.** The fix is /build's job, implementing against this
   test. Update STATE.md: `stage: diagnose ✅ → build (next)`,
   `Files so far` += the test path, the red output quoted. No gate —
   announce `/build <ticket>` as the next command.
