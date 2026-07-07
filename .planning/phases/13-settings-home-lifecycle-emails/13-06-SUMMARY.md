---
phase: 13-settings-home-lifecycle-emails
plan: 06
subsystem: frontend
tags: [prototype, settings, design-contract, sign-off, account-popover, qr]

# Dependency graph
requires: []
provides:
  - prototypes/settings-prototype/index.html — the signed-off visual/interaction contract for src/app/settings (13-08/09/10)
affects: [13-08, 13-09, 13-10]

key-files:
  created:
    - prototypes/settings-prototype/index.html
    - prototypes/settings-prototype/NOTES.md
  modified: []

key-decisions:
  - "Prototype PAGE accepted by Muskan (sidebar + flat one-click list + thin Personal/Org hairline + Member-view toggle + Login-&-security/Delete/read-only-Notifications/reactivation panels)"
  - "ENTRY POINT = the existing IconRail account popover (NOT a new nav) — keep it; repoint its 3 links into /settings"
  - "Popover link repointing (built in 13-09): My Profile → /settings/profile, Company Profile → /settings/organization/profile, Settings → /settings (this prototype page)"
  - "QR must render EVERY time: fix getAccountCard() to call ensureHandle() so every onboarded account has a public_handle → QR always shows (was silently hidden when handle absent; not a deletion — code identical on both branches)"
  - "Build with reusable components (reuse Avatar/MenuLink/glass tokens) + match the Aurora/raspberry system theme"

requirements-completed: [SET-01]

# Metrics
completed: 2026-07-06
---

# Phase 13 Plan 06: Settings-Home Prototype Summary

**A standalone HTML/CSS/JS settings-home prototype (sidebar + Personal/Organization zones + the sensitive lifecycle/reactivation panels) — reviewed with Muskan, the page accepted, and the entry-point integration + QR fix captured as the Wave-4 build spec.**

## Sign-off (D-08 prototype-first gate)
- Task 1 built `prototypes/settings-prototype/index.html` (683 lines) + `NOTES.md`, matching the app's raspberry/glass tokens; committed `78e1853`.
- Task 2 (blocking human-verify): Muskan reviewed the prototype in-browser and **accepted the page**, with three integration refinements folded into the Wave-4 build (below). Treated as sign-off — 13-08/09/10 are unblocked.

## What was built
Standalone mock covering every one-click sub-section: vertical sidebar (flat list, D-01), thin Personal↔Organization hairline (D-02), Superadmin-gated Organization group + Member-view toggle (D-03), Login-&-security (change-password + linked-accounts sole-identity unlink guard + Delete with password re-entry + 30-day grace + sole-Superadmin lockout, D-05/09/10/11), read-only Notifications (D-19/20), Organization→Security company-deactivate (D-06/12), and the reactivation interstitial (Open-Q #3).

## Refinements captured for Wave 4 (13-09/13-10)
1. **Entry = the existing IconRail account popover** (avatar → My Profile / Company Profile / Settings / Sign out + QR) — keep it, do not replace. `/settings` is what its "Settings" link opens.
2. **Repoint the 3 popover links** to the new tree: My Profile → `/settings/profile`, Company Profile → `/settings/organization/profile`, Settings → `/settings`. (Adds `src/shared/ui/IconRail.tsx` to 13-09 scope.)
3. **QR always-show**: `getAccountCard()` must call `ensureHandle()` so every account has a `public_handle` → the "SCAN TO CONNECT" QR renders every time. (Adds `src/shared/ui/account-card.ts` to 13-09 scope.) Diagnosed: not a deletion — QR is gated on `p.publicHandle`, which is assigned lazily by app code, not auto.
4. **Reusable components + system theme** across 13-08/09/10 (reuse Avatar, MenuLink, glass tokens; Aurora/raspberry).

## Deviations from Plan
Process only: the SUMMARY was authored by the orchestrator after the checkpoint sign-off (the plan's continuation-agent step), and the checkpoint resolved via live design discussion (entry-point + QR refinements) rather than a bare "approved".

## Next Phase Readiness
- 13-08 (security actions + page), 13-09 (sidebar shell + `/account`→`/settings` re-home + popover repointing + QR fix), 13-10 (org subtree) are unblocked and carry the four refinements above.

## Self-Check: PASSED
- `prototypes/settings-prototype/index.html` + `NOTES.md` present and committed (`78e1853`).
- Sign-off recorded; Wave-4 refinements captured (also in the orchestrator scratchpad `wave4-user-decisions.md`).

---
*Phase: 13-settings-home-lifecycle-emails*
*Completed: 2026-07-06 (sign-off + refinements captured by orchestrator)*
