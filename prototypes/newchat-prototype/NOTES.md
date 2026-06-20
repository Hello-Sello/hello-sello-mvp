# B2 · New chat picker — prototype notes

## Verdict — LOCKED (2026-06-20): Option A, the anchored dropdown
Ayush picked **Option A**. The losing variants (B directory modal, C command
palette) were removed; `index.html` is now a single clean reference for the build.

## The question it answered
When you tap **+ New chat** on the Connect conversation list, what should the
picker look like, and how do you choose **person (P2P) vs. whole company (C2C,
"tightly to company")**?

The button exists today as a disabled stub:
`src/modules/messaging/components/ConversationList.tsx` → the `New chat` button.

## What Option A is
A dropdown sheet that drops **inside** the conversation-list column, under the
button (WhatsApp-style). It carries:

- A **Person | Company toggle** — person mode lists people grouped by company;
  company mode lists the companies (start a C2C chat).
- **Search** that filters the active mode.
- A **New connections** section (added on Ayush's request) that pops your freshest
  connections by date (`Today`, `2 days ago`) at the top — works in both modes.
- **"N deal updates" / "N deals"** badges on companies, so unread deal activity is
  visible right in the picker.
- Presence dots, initials avatars, and a selection toast showing whether it opens
  a P2P or a company (C2C) chat.

## How to look
Open `index.html`. The dropdown opens on load; tap **+ New chat** to toggle it,
`esc` or click-away to close. Backend is mocked (the connected network is fake).

## Next (build)
Run Option A through full GSD (phase → discuss → plan → execute → verify), then
build the backend: query my company's **connections → their people**, plus the
"new connections" (recent relationships by date) and unread-deal counts. Port the
sheet into the real `ConversationList` header and wire selection to start/open the
P2P or C2C thread.
