# 1b — Auth screens (sign in / sign up)
**Status:** 🧪 review (built + verified on `claude/muskan/work`; PR pending) · **Size:** S · **Owner:** Muskan

## Goal
Real sign-in / sign-up screens against Supabase Auth, plus the session-refresh proxy
deferred from F5. Unauthenticated users get redirected to `/login`; signed-in sessions
stay fresh. The demo still logs in with the seed accounts — these are the real door the
seed walks through.

## Scope — in / out

**In:**
1. `/login` — email + password → `signInWithPassword` (Server Action) → redirect to `/`.
2. `/signup` — first/last name + email + password → `signUp` with `options.data` so the
   `handle_new_user` trigger fills `person.first_name/last_name` (company_id stays NULL, Path-B).
3. Sign-out — server action + a `/logout` route handler (minimal; rail placement is Ayush's UI, deferred).
4. `src/proxy.ts` + `src/shared/db/proxy.ts` `updateSession()` — refresh via `getClaims()`,
   redirect unauthenticated → `/login`. Matcher skips static assets + `/login` + `/signup`.
5. Chrome-free auth layout — AppShell skips the rail/top-bar on `/login` + `/signup` (Option B below).
6. Inline error display (bad credentials, weak password, duplicate email).

**Out (other items):**
- Company onboarding / license / verification → **1c**.
- "No company yet" gating after signup → with **1c**.
- Home/landing content → **1d**.
- Wiring TopBar's real company name (Ayush's component; new users have no company) → small follow-up.
- Email confirmation / password reset / OAuth → post-MVP (seed users pre-confirmed).

## Research notes
- **Stack:** Next **16.2.7** (middleware is renamed **`proxy.ts`** in 16), React 19, `@supabase/ssr ^0.10.3`. F5 already built `shared/db/{client,server}` + `shared/auth`.
- **Proxy pattern (Supabase docs, verified):** use **`supabase.auth.getClaims()`** in the proxy (validates JWT signature, refreshes token). Docs explicitly warn *never* trust `getSession()` server-side. `setAll` now takes `(cookiesToSet, headers)` — apply cache headers to the response in the proxy.
- **Signup → person:** trigger `handle_new_user` (migration `...160000`) reads `raw_user_meta_data ->> first_name/last_name`, so the form **must** pass them in `options.data`. company_id left NULL by design.
- **Seed login:** Alice/GreenLeaf (cultivator) + Bob/StonePharm (pharmacy), password `password123`.
- **Design tokens:** `.glass` / `.glass-strong`, `--color-brand` raspberry, pink wash on `<body>` (globals.css). Reuse `Wordmark`.
- **Chrome wrinkle:** root `layout.tsx` wraps *all* routes in `AppShell` (rail + top bar). Auth pages must be chrome-free → see decision below.
- **⚠️ Config flag:** Supabase "Confirm email" — if ON, a fresh signup has no session until the email link is clicked. Seed users are pre-confirmed; new signups in the demo need this OFF (dashboard → Auth) or signup won't land logged-in.

## Decisions (LOCKED 2026-06-07)
1. **Chrome-free approach → Option B.** AppShell conditionally hides the rail/top-bar on
   `/login` + `/signup` (1 file, no page moves, no routing change — safe while Ayush builds Connect).
   Option A (route-group split) deferred as a later cleaner refactor.
2. **Signup landing → onboarding placeholder.** Industry pattern = gated onboarding (Slack/Notion/
   Linear). Signup → signed-in → `/onboarding` ("company setup — next"), which **1c** fills in.
   A new user has no company (Path-B), so dropping them into Connect shows an empty app.
3. **Email-confirm flag — Muskan to toggle.** Supabase → Auth → "Confirm email" must be OFF for the
   demo, else fresh signups have no session. (Agent can't change dashboard settings.)

## Task checklist
- [x] `shared/db/proxy.ts` `updateSession` + `src/proxy.ts` matcher
- [x] AppShell chrome-skip on `/login` + `/signup` (locked AppShell.tsx via sync, released)
- [x] `(auth)` pages: `/login` + `/signup` (glass card, Wordmark, brand button)
- [x] Server actions: signIn / signUp(+metadata) / signOut
- [x] Error states + loading (`useActionState`, inline `text-danger`, pending button)
- [x] Verify: typecheck + lint + preview (all flows below green)

> **Deviation:** dropped the `/logout` GET route handler — a GET that mutates is a smell.
> Sign-out is a server action via `<form>` (correct verb).
>
> **Post-build edits (after Muskan review):**
> - Signup carries the two value-prop lines (QR card / B2B network) under the heading — `AuthCard`
>   gained an optional `highlights` prop; login leaves it off. Stays on the **locked light brand**
>   (the dark mock Muskan shared was a copy reference only; light is locked — Ayush's call to reopen).
> - `signOut` uses `scope: 'local'` so the button always clears the local session, even if the
>   server-side revoke would fail (expired/invalid session).
> - **Sign-out placement = Ayush's** (shell UI). Action is ready; he wires it into the rail avatar.
>   Until then, sign-out only exists on `/onboarding`. Flagged in `sync/muskan.md`.

## Done criteria — all verified in preview
- [x] Signed-out user hitting any app route → `/login` (proxy gate).
- [x] Seed user (`alice@greenleaf.test`) signs in → lands in Connect; session persists on reload.
- [x] New signup → `person` row created (Nina/Tester from metadata, `company_id` NULL) → `/onboarding` signed in. Test user cleaned up.
- [x] Sign-out → back to `/login`.
- [x] Auth pages render chrome-free, on-brand. Typecheck + lint clean.
- [x] Email-confirm flag found already OFF (signup got an immediate session) — no dashboard change needed.
