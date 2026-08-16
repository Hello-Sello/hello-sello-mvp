# Branding + shell prototype — decision capture (DEV-70 / DEV-69)

**Throwaway.** Answers: *where is the ONE company-branding edit point, and how does
the shell show the real logos?* Before touching `src/shared/ui/{TopBar,Wordmark,
IconRail}.tsx`, `src/modules/companies/index.ts`, and the edit surfaces.
Phase 6 context: `.planning/phases/06-discover-home-ux/06-CONTEXT.md` (D-07/08/09/10).

## What it shows
- **DEV-69 — HS brand logo in the shell:** the real asset (`hello-sello-logo.png`,
  copied from `docs/Images/hellosello Vertical No background.png`) rendered at the
  top of the nav rail (replaces the text wordmark).
- **DEV-70 — one edit point → propagates:** edit the **logo / city / tagline /
  website** in the edit panel and watch the **top bar** company logo+name + the
  "Appears everywhere" previews (top bar · Discover row · public card) update live.
  - The top bar today is **hardcoded** "Aurora Deutschland GmbH" + "AD" — this is
    the concrete gap DEV-70 closes (wire to the real company).
  - **Company name + country are read-only** (locked "set at signup" — they're
    onboarding identity in the `companies` module). Propagation = logo + tagline +
    city/info, NOT the name.
  - **City** is captured here too (the new `company.city` field from D-02 lives at
    this same edit point).

## Variants (switch ‹ › / ←/→) — the open D-09 decision
| Key | Edit point | Notes |
|---|---|---|
| **A** | **Present → shop banner** | Branding edited inline in the Present banner (where the logo already lives). Marcel's wording leans here ("Present/Company-Profile page"). |
| **B** | **Account → Company** | Branding edited as an Account settings form (where the text fields already live today). |

Both write through ONE writer (`companies.updateCompanyProfile`, extended to own
`logo_path` + `city`) — only the *location* differs.

## How to run
`open "prototypes/branding-shell-prototype/index.html"` (no server needed; the logo
is a local file in this folder).

## ✅ Verdict (2026-06-18)
- **Shell visuals CONFIRMED by Muskan:** HS brand logo in the nav rail (DEV-69) +
  real company logo + name in the top bar (DEV-70) both approved.
- **Edit doors (D-09): TWO doors, ONE source of truth.** Both the Present banner AND
  the Account → Company page edit branding; both call the single
  `companies.updateCompanyProfile` writer → the single `company` row. NOT two sources
  of truth. Mitigate form-drift with a **shared branding-edit form component** mounted
  in both places (one component, two locations).
- **DB + writer = one (by design, non-negotiable)** — two stored copies = F3 drift.
- **DEV-69:** HS brand logo asset (`hello-sello-logo.png`) → `/public`; swap
  `Wordmark.tsx` text → `<img>` in the rail.
- **DEV-70:** wire the hardcoded `TopBar.tsx` company → real company logo + name;
  extend `updateCompanyProfile` to own `logo_path` + `city`; revalidate the surfaces
  that show branding on edit.
- **Name + country stay read-only** (onboarding identity); propagation = logo +
  tagline + city/info.
- Architecture note to propose at wrap: "Company branding — one row + one writer,
  multiple edit doors via a shared form component."
- Then build it and delete this folder.
