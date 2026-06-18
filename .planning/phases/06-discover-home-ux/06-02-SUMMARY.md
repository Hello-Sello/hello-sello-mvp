---
phase: 06-discover-home-ux
plan: 02
subsystem: home
tags: [checklist, onboarding, derived-data, rls, inline-bar]
requirements: [UX-09]

dependency_graph:
  requires: []
  provides:
    - derived-6-block-onboarding-checklist
    - slim-inline-checklist-bar
  affects:
    - src/app/home/page.tsx
    - src/app/home/OnboardingChecklist.tsx

tech_stack:
  added: []
  patterns:
    - Promise.all for parallel server-side count reads (count:exact,head:true)
    - useSyncExternalStore for SSR-safe localStorage dismiss
    - LucideIcon typed ICONS map (6 keys)
    - overflow-x horizontal scroll for mobile row

key_files:
  created: []
  modified:
    - src/app/home/page.tsx
    - src/app/home/OnboardingChecklist.tsx

decisions:
  - "Block 2 profile done when first_name + last_name + title + avatar_path are all set (D-05 row 2)"
  - "Block 3 company_details done when logo_path + description + website are all set (D-05 row 3)"
  - "Block 1 email stays person.preferences flag/placeholder (out of lane per D-05)"
  - "Tasks 1 and 2 committed atomically — intermediate state (6 items in page.tsx against old 3-key union in OnboardingChecklist.tsx) would not compile"

metrics:
  duration: "~25 minutes"
  completed: "2026-06-18T00:23:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 2
---

# Phase 6 Plan 02: Home Checklist Derived Data + Slim Inline Bar Summary

**One-liner:** 6-block onboarding checklist with done-state derived from real RLS-scoped counts (product / pricelist_item / connect requests), rendered as a slim pink/green inline top bar with progress bar and localStorage dismiss.

## What Was Built

Replaced the Home page's manual `person.preferences` flag-based checklist (3 blocks) with a 6-block self-correcting version driven by real database counts and person/company field checks (D-05 / D-06 / D-06b).

**`src/app/home/page.tsx`** — Home server component now runs 4 parallel queries via `Promise.all`:
- Company fields extended to include `logo_path, description, website` (for block 3 done-state)
- `product` count with `{ count: 'exact', head: true }` — block 4
- `pricelist_item` count with `{ count: 'exact', head: true }` — block 5
- `pending_inbox_item` count scoped to `.eq('sender_company_id', companyId).in('type', ['connect', 'connect_message'])` — block 6 (pricelist_request excluded by type filter per D-06b)

6-item `ChecklistItem[]` array built with documented done-state derivation per block:
- Block 1 (`connect_email`): `person.preferences.onboarding.email_connected` flag (out of lane)
- Block 2 (`profile`): `person.first_name && person.last_name && person.title && person.avatar_path`
- Block 3 (`company_details`): `company.logo_path && company.description && company.website`
- Block 4 (`products`): `productCount >= 1`
- Block 5 (`pricelists`): `pricelistCount >= 1`
- Block 6 (`connections`): `connectCount >= 1`

**`src/app/home/OnboardingChecklist.tsx`** — Relaid out from vertical `<ul>` (3 items) to slim single-row inline bar (6 items):
- `ChecklistItem` key union extended to all 6 keys
- `ICONS` map typed `Record<ChecklistItem['key'], LucideIcon>` with 6 real lucide icons (Mail / UserRound / Building2 / Package / ListOrdered / Users)
- `useSyncExternalStore` dismiss pattern kept verbatim (SSR-safe; server snapshot = false)
- `dismissed || doneCount === items.length → return null` guard preserved
- Layout: header row (title + fraction + inline progress bar + dismiss X), then horizontal `<ul>` with `overflow-x-auto` for mobile
- Progress bar: `width: progressPct%` with `bg-success` fill over `bg-brand-soft/30` track
- Done tiles: `bg-success/15 text-success` with Check icon
- To-do tiles: `bg-brand-soft/40 text-brand` with item icon + link to `/onboarding?resume=<key>`

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Derive 6 done-states from real data in Home server component | 69ef80b | src/app/home/page.tsx, src/app/home/OnboardingChecklist.tsx |
| 2 | Relayout into slim inline pink/green top bar | 69ef80b | src/app/home/OnboardingChecklist.tsx |

Note: Tasks 1 and 2 were committed atomically because the intermediate state (6 items in page.tsx paired with the old 3-key union in OnboardingChecklist.tsx) would not compile — TypeScript would reject the unknown key literals.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

**Block 1 — `connect_email`:** Done-state is `person.preferences.onboarding.email_connected` flag (always false until email integration lands). This is the intentional D-05 "out of lane" stance documented in the plan — the block renders as a pink to-do tile permanently until Muskan's lane gains email integration. Not a data gap; a known deferred feature.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. All count reads go through existing RLS-scoped Supabase client on the server component (T-06-05: auto-scoped to caller's company, no raw rows returned via `head: true`). localStorage dismiss is client-only cosmetic (T-06-06: accepted).

## Self-Check: PASSED

| Item | Result |
|------|--------|
| src/app/home/page.tsx exists | FOUND |
| src/app/home/OnboardingChecklist.tsx exists | FOUND |
| .planning/phases/06-discover-home-ux/06-02-SUMMARY.md exists | FOUND |
| Commit 69ef80b exists | FOUND |
