---
phase: 13-settings-home-lifecycle-emails
plan: 05
subsystem: infra
tags: [resend, supabase-edge, deno, transactional-email, lifecycle-email, fetch]

# Dependency graph
requires:
  - phase: sella (edge functions)
    provides: sella-intro Deno.serve service-role shell + deno.json shape (mirrored exactly)
  - phase: 11-rbac-activation-company-team
    provides: '"group"(name=Superadmin) + person_group (fan-out) and company.created_by (founder) for recipient resolution'
  - phase: 01-clean-rebuild-foundation
    provides: auth.users as the recipient email SSOT (person.email_encrypted dropped 2026-05-27)
provides:
  - send-lifecycle-email edge function — the first application-level email-send path
  - 7 one-CTA transactional templates as a pure, Deno-free, node+deno-importable module
  - sendViaResend transport helper (key confined to the RESEND_API_KEY edge secret)
affects: [13-01 (imports templates.ts in its vitest RED test), 13-11 (fire-and-forget after() dispatch wiring), 13-07 (cloud ledger — RESEND_API_KEY edge secret + function deploy)]

# Tech tracking
tech-stack:
  added: [Resend REST API via built-in fetch (no new npm/Deno package)]
  patterns:
    - Pure Deno-free template module importable by BOTH node (vitest) and deno (edge)
    - Server-side recipient resolution from the auth.users SSOT (caller passes IDs, never emails)
    - Fail-soft transport (missing key / non-2xx -> { ok:false }, never throws)

key-files:
  created:
    - supabase/functions/_shared/email/templates.ts
    - supabase/functions/_shared/email/resend.ts
    - supabase/functions/send-lifecycle-email/index.ts
    - supabase/functions/send-lifecycle-email/deno.json
  modified: []

key-decisions:
  - "Recipient is always resolved server-side from auth.users by id; the caller passes only IDs (T-13-05-S/I2) — the response carries counts, never an address"
  - "templates.ts is authored Deno-free (pure string transform) so 13-01's vitest imports renderTemplate under node; resend.ts isolates all Deno.env + fetch"
  - "CTA base URL defaults to https://hello-sello.com, overridable via vars.appUrl — keeps the template module pure (no env read)"
  - "join.requested fans out to every active Superadmin of the target company; verification.approved/rejected + welcome resolve the founder via company.created_by"
  - "Zero new dependencies — Resend via built-in fetch, @supabase/supabase-js@2 imported inline (mirrors sella-intro)"

patterns-established:
  - "Pure Deno-free template module (renderTemplate(event, vars) -> { subject, html }) shared across the node test runner and the Deno edge runtime"
  - "auth.users recipient resolution inside the edge fn (getUserById / group fan-out / founder lookup)"
  - "Interpolated untrusted vars (reason/name/company) HTML-escaped at build time (no eval)"

requirements-completed: [SET-03]

# Metrics
duration: 26 min
completed: 2026-07-06
---

# Phase 13 Plan 05: Lifecycle Email Send Path Summary

**First app-level email-send path: a Deno `send-lifecycle-email` edge function that resolves recipients from `auth.users` (SSOT) and POSTs 7 one-CTA transactional templates to Resend with the key confined to edge secrets — zero new dependencies.**

## Performance

- **Duration:** ~26 min
- **Started:** 2026-07-06T10:35Z (approx, first reads)
- **Completed:** 2026-07-06T11:01Z
- **Tasks:** 2
- **Files modified:** 4 created

## Accomplishments
- Pure, Deno-free `templates.ts`: `renderTemplate(event, vars) -> { subject, html }` for all 7 lifecycle events (verification.approved/rejected, join.requested/approved/rejected, welcome, membership.removed), each with **exactly one** primary CTA anchor and HTML-escaped interpolation.
- Deno-only `resend.ts`: `sendViaResend()` POSTs `api.resend.com/emails` with the key read **only** from the `RESEND_API_KEY` edge secret; fail-soft on a missing key or non-2xx.
- `send-lifecycle-email/index.ts`: a `Deno.serve` sender mirroring `sella-intro` — service-role client, recipient resolution from `auth.users`, render, send; soft-returns `{ skipped: "no recipient" }`.
- Server-side recipient resolution: `join.requested` fans out to the target company's Superadmins; founder events resolve `company.created_by`; person events use `person_id`. No email is ever echoed to the caller.

## Task Commits

1. **Task 1: pure templates module + Resend transport helper** - `777d6df` (feat)
2. **Task 2: send-lifecycle-email edge function** - `60ae0d0` (feat)

_(STATE.md / ROADMAP.md updates are owned by the orchestrator post-wave; no plan-metadata state commit made here.)_

## Files Created/Modified
- `supabase/functions/_shared/email/templates.ts` - Pure Deno-free `renderTemplate` + `LifecycleEvent` union; shared layout with one CTA; `escapeHtml` on all interpolated vars.
- `supabase/functions/_shared/email/resend.ts` - Deno-only Resend POST transport; key from `Deno.env.get('RESEND_API_KEY')` only; fail-soft `{ ok }`.
- `supabase/functions/send-lifecycle-email/index.ts` - `Deno.serve` sender: validate event, service-role client, resolve recipient(s), render, send; counts-only response.
- `supabase/functions/send-lifecycle-email/deno.json` - Mirrors `sella-intro` (supabase-js imported inline; no new package surface).

## Threat Model Coverage
All five register entries mitigated in code:
- **T-13-05-S** (recipient spoof): recipient resolved from `auth.users` by id server-side; caller cannot pass a `to`.
- **T-13-05-I** (key exposure): `RESEND_API_KEY` read only via `Deno.env` (edge secret); no literal, no public env var. `grep NEXT_PUBLIC` = 0 in resend.ts + index.ts.
- **T-13-05-T** (HTML injection via vars): `escapeHtml()` on reason/name/company before embedding; templates build strings, no eval.
- **T-13-05-I2** (email enumeration): response returns only `{ sent, recipients: count }` / `{ skipped }` — never an address.
- **T-13-SC** (deno.json imports): reuses vendored `@supabase/supabase-js@2` + built-in fetch; no new package surface.

## Decisions Made
See `key-decisions` frontmatter. Copy is Claude's discretion per D-17; each of the 7 emails carries exactly one primary action.

## Deviations from Plan

None - plan executed exactly as written. (The `Supa` client-type fix below was in-task debugging of my own code, not unplanned scope — logged under Issues Encountered.)

## Issues Encountered

**1. Supabase client type collapsed helper rows to `never` (self-caught in Task 2 verification).**
- `type Supa = ReturnType<typeof createClient>` resolves the signature's *default* generics (`never` schema params), so helper `.from(...)` rows typed as `never` (9 `deno check` errors: TS2339 + TS2345).
- Fix: capture the client type from a `makeServiceClient` wrapper whose return type is *inferred* from a real `createClient(url, key)` call (arity/version-proof). Re-check clean.
- Committed in: `60ae0d0` (Task 2 commit).

**2. `deno check <index.ts>` fails on a pre-existing, repo-wide transitive-type issue (NOT this code).**
- The literal Task-2 AC command `deno check supabase/functions/send-lifecycle-email/index.ts` errors because the unpinned `jsr:@supabase/functions-js/edge-runtime.d.ts` (2.110.0) transitively references `npm:openai@^4.52.5`, unresolvable here without a node_modules dir. **The existing deployed `sella-intro/index.ts` fails identically** — this is an environment/tooling limitation affecting every edge function, not a defect in my code.
- Verified my code the equivalent clean way (the plan's OR alternative): a scratch copy of index.ts *minus* the `edge-runtime.d.ts` import (`Deno.serve`/`Deno.env` are native deno globals) type-checks with **zero errors** under plain `deno check`, using the real `@supabase/supabase-js@2` types + my templates.ts/resend.ts. Kept index.ts mirroring `sella-intro` (unpinned import) rather than pinning to a stale version.

**3. Cross-plan template test is absent in this worktree (expected).**
- The AC's `npm run test:unit -- lifecycle-email` finds no tests here — `src/app/settings/lifecycle-email.test.ts` is authored by sibling plan 13-01 in its own worktree. Per the plan-specific note, that GREEN cross-check runs at the orchestrator's post-merge gate. Verified the underlying contract locally with a throwaway deno harness: all 7 events render exactly one CTA, non-empty subject, HTTPS href, and escaped `reason`.

**4. Shared phase-branch working-tree mutations (orchestrator-managed).**
- This worktree branch (`worktree-phase-13-settings-emails`) is a **shared** phase branch actively rebased by the orchestrator: sibling commits `78e1853` (13-06 prototype), `5452628` + `253047a` (13-01 tests) landed *after* my Task 1 commit. During one rebase checkout my committed `_shared/email/` files were transiently removed from the working tree; restored from HEAD (they were intact in the commit). My Task 1 commit `777d6df` is confirmed an ancestor of HEAD.
- Foreign uncommitted files from sibling plans (`src/app/settings/**/actions.test.ts`, `.../lifecycle-email.test.ts`, `supabase/migrations/20260706090000_account_lifecycle.sql`) were left untouched and **excluded from every one of my commits via pathspec-scoped `git commit -- <files>`** — each commit contains only my 2 files (verified with `git show --stat`).

## User Setup Required

**External service configuration needed before cloud sends (cloud step — ledger 13-07, not executed this phase):**
- `RESEND_API_KEY` must be set as a Supabase **Edge secret** (never a public env var): `supabase secrets set RESEND_API_KEY=…` (Supabase → Edge Functions → Secrets). The sending domain (`hello-sello.com`) is already verified for the existing auth SMTP path (Assumption A1 — confirm the API `from:` works the same). Local sends can be smoke-tested via `supabase functions serve send-lifecycle-email` once the key is present.

## Known Stubs
None. The send layer is complete. The action-side fire-and-forget (`after()`) dispatch from each event is intentionally out of scope for this plan (it is plan 13-11), as stated in the plan objective — not a stub in this deliverable.

## Next Phase Readiness
- The first app-level email path exists and is verified: recipients resolved from the SSOT, 7 one-CTA templates render, transport confined to edge secrets, zero new dependencies.
- **Ready for 13-11** to wire the fail-soft `after()` dispatch from the 7 event server actions, and for **13-01**'s vitest template test to go GREEN against `templates.ts` at the post-merge gate.
- **Cloud (13-07 ledger):** set `RESEND_API_KEY` edge secret + `supabase functions deploy send-lifecycle-email`; live inbox delivery is a phase-gate human-verify.

## Self-Check: PASSED
- Files present in HEAD tree: `templates.ts`, `resend.ts`, `send-lifecycle-email/index.ts`, `send-lifecycle-email/deno.json` — all 4 confirmed via `git ls-tree -r HEAD`.
- Commits present: `777d6df` (Task 1) + `60ae0d0` (Task 2) — confirmed via `git log`; `777d6df` is an ancestor of HEAD.
- Acceptance gates (committed content): templates `Deno.env`=0, resend `NEXT_PUBLIC`=0, index `NEXT_PUBLIC`=0, resend hits `api.resend.com/emails`, index uses `getUserById` + `Deno.serve` + `SUPABASE_SERVICE_ROLE_KEY` + `sendViaResend` + `renderTemplate` + soft `no recipient`.
- All 7 events render exactly one CTA (deno harness, exit 0). Edge fn type-checks clean via the edge-runtime-import-stripped scratch (`deno check`).

---
*Phase: 13-settings-home-lifecycle-emails*
*Completed: 2026-07-06*
