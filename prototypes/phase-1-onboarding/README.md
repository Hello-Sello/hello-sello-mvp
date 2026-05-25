# Phase 1 — Account birth → first connection

**Throwaway prototype.** Locked onboarding shape: hard wizard (Slack-style). Built to visualize the flow and make data movement obvious before we code it for real.

## The flow (9 screens, linear)

1. **Sign up** — dark theme, matches the FIGMA/in-app design (First/Last name, email, password, confirm)
2. **Email verification** — "Check your inbox" with a simulated "I clicked the link" button
3. **Sign in** — after verification, user signs in with the credentials they just set
4. **Company setup** — name + country + optional license/certificate upload for verification
5. **Groups** — Notion-style custom roles (defaults preloaded)
6. **Permission matrix** — Action × Group toggle grid
7. **Profile** — display name, title, language, timezone
8. **Contacts** — Gmail/Outlook metadata import (DEV-3 compliant) + role tagging
9. **Discover** — pre-seeded companies; click Connect → P↔C pending inbox item lands on receiver

## What to watch

The right-hand **Data state panel** shows mock-DB rows after each step. New rows briefly highlight yellow. Tables in play:

| Table | When it gets rows |
|---|---|
| `person` | At sign-up (with `email_verified: false`); updates at verify |
| `company` | At company setup; gets `verification_status: 'pending'` if a license is uploaded |
| `person_group` | At company setup (Superadmin link) |
| `group` | At Groups step |
| `permission_matrix_entry` | At Permission matrix step |
| `contact_record` | At Contacts import (metadata-only per DEV-3) |
| `pending_inbox_item` | When user clicks Connect on Discover |

Also tracked in `_meta`: `current_person_id`, `current_company_id`, `signed_in`, `nextId`.

## How to run

```bash
cd "prototypes/phase-1-onboarding"
python3 -m http.server 8765
# open http://localhost:8765
```

Or use Claude Preview via the `.claude/launch.json` `phase-1-prototype` config.

ES modules require serving over HTTP — opening `file://` won't work.

## What's locked vs open (for discussion)

| Decision | Status |
|---|---|
| Hard-wizard pattern (vs just-in-time or hybrid) | **LOCKED** 2026-05-24 — variant comparison done in earlier iteration |
| No Sell/Buy/Both selection at company setup | **LOCKED** 2026-05-24 — every user can be either at any time |
| License upload at company setup | **LOCKED** 2026-05-24; **revised 2026-05-25 — now REQUIRED**, not skippable. See `HANDOFF.md` "Updates 2026-05-25" |
| Gate model | **LOCKED 2026-05-25** — split-gate (internal setup allowed during pending; external actions hard-locked). See `HANDOFF.md` "Updates 2026-05-25" |
| Path B (join existing company) | **LOCKED 2026-05-25** — new screen after sign-in, request routes to company Superadmin |
| Group / Permission matrix placement | **LOCKED 2026-05-25** — 4 templated Groups (skippable) in onboarding; full Action × Group toggle matrix in Settings → Team & Permissions |
| 6 in-app wizard steps (company → discover) | Open for iteration |
| Contact import flow as a wizard step | Open — could move to Settings post-MVP |

## Out of scope (next phases)

- **Phase 2** — Receiver picks up P↔C ticket → first-contact Sella → Relationship-page creation → P↔P chat opens
- **Phase 3** — First deal birth (Basket → Card → Workspace, 3 paths)
- **Phase 4** — Negotiation → Confirmation
- **Phase 5** — Execution → Done

## Throwaway-grade behaviors

- "Gmail import" is faked — the `SAMPLE_CONTACTS` array is what loads. No real OAuth.
- Email verification is simulated — clicking the button just advances the flow.
- License "upload" stores filename only — no actual upload pipeline.
- Going Back in the wizard doesn't undo DB writes (idempotent guards prevent dupes on resubmit).
- localStorage persists across refreshes — your progress survives. Click "Reset DB" to start over.

## Files

| File | Purpose |
|---|---|
| `index.html` | Shell + Tailwind CDN + data panel |
| `app.js` | State, render loop, action handlers, event delegation |
| `screens.js` | Per-screen HTML render functions (dark for auth, light for in-app) |
| `db.js` | Mock DB + linear flow definition + localStorage |
| `seed.js` | Pre-seeded companies (FLOWZ-style), default Groups, sample contacts |
| `styles.css` | Minor custom CSS beyond Tailwind |

## Cleanup

When Phase 1 is built for real, capture any open decisions and delete this folder:

```bash
rm -rf "prototypes/phase-1-onboarding"
```
