---
name: prototype
description: Mock a triaged slug's UI as 2-3 throwaway HTML variants before
  any build. Stops at G2. Use /prototype <slug> (frontend FULL lane only).
  Inside this repo this overrides the global prototype skill.
allowed-tools: Read, Grep, Glob, Write, Edit
---

# /prototype — from approved spec to a chosen visual contract

0. Open `docs/muskan-build/<slug>/STATE.md`: stage must be `spec ✅`. Read the
   PRD's **In / Out for v1** list — the fence. Inside it you may explore; you
   may not wander (a prototype with no scope cut is a scope generator).

1. **Build 2–3 genuinely different variants** in
   `prototypes/<slug>-prototype/` (the slug already carries its NNNN number)
   as ONE standalone `index.html` — openable directly in a browser, no server,
   variants switchable on the page. Real design tokens
   (`src/app/globals.css`) and the real component's structure — never an
   invented card.

2. **Fit check, every variant:** render it inside a stub of its REAL
   container at the container's real constraints — fixed heights, narrow
   widths, sibling content present. A variant that only works on an open
   page is not a variant; the 0021 popover redesign came from skipping
   exactly this (PIPELINE §14 #8).

3. **Stop at G2.** Muskan picks in the browser. The chosen variant IS the G4
   visual contract — record the pick + any change requests in `NOTES.md`
   beside the prototype. On her pick, update STATE.md:
   `stage: prototype ✅ → design (next)`, `Files so far` += the prototype
   path, `Gate log` += G2 with date.
