# Relationship page (screen ③) - prototype spec

> Throwaway prototype. `index.html` (port **8771**, Claude Preview config `relationship-prototype`).
> Built 2026-06-07 (Ayush + Claude) on the decided Connect shell, consistent with connect/chat/dealcard.
> **Layout verdict: C (Tabbed)** - chosen 2026-06-07. A/B dropped.

## What it is

The persistent record between two companies (Canadian Craft ↔ ABC Apotheke). Third atom in the Connect build
order: ① Deal card → ② Chat → **③ Relationship page** → ④ Deal Workspace.

**Reached from a chat, not a tab.** Two doors - the P2P chat or the C2C chat - both land on the *same*
company↔company page. There is **no person-level relationship page**. So the Connect sub-nav has **no
`Relationship` and no `Deals` tab** (Deals move to a future Grow/Trade surface). Sub-nav here is just
`Chat · Inbox`, with a "you opened this from the chat with X" hint.

## Shape (Layout C - Tabbed)

- **Top band:** header (two company logos joined by a **bridge mark** - line · dot · line, never `//` or `=`;
  **no person names**, it's a company-to-company connection) + **Sella insight** and **Analytics** as two
  overview boxes **side by side**.
- **Each box = overview + a "more" button → a DIALOG with a blurred backdrop** (open → read → close, like the
  Claude settings modal):
  - **Sella dialog** - "what's happening" + "how to grow this relationship" (action cards).
  - **Analytics dialog** - a mini analytics page: 6 KPIs + 3 bar charts (by deal / by quarter / by status) + a
    **pie chart** (share by deal) + a takeaway line.
- **Tabs:** Overview (log + deals peek) · Deals · Notes · Terms & prices · Docs. Tabs replace scrolling.

## Content (locked)

- **Deals** - the Overview peek + the **Deals tab**: filter `All / Active / Old / Cancelled` → each → **Open workspace** (screen ④).
- **Notes** - per-side **Team note** + per-user **Personal note** (different jobs: team = business; personal = soft/relationship upkeep).
- **Agreed terms** (both sides) · **Custom pricelist** (both read; seller writes, gated by sign-off) · **Artifacts** (shared company-wide docs; deal docs stay in the deal).

**Two altitudes (the organizing law):** relationship-level lives here; deal-level lives on the deal card / inside
the deal. Applied to insights (page vs card-back), documents (Artifacts vs deal COAs), analytics & log (page-level).

## Side-aware - a per-viewer projection

`Seeing as: Supplier | Buyer` flips: per-side team note hides across sides, **PRIVATE deals hide from the other
side** (supplier total €80,500 incl. the private Q4 deal; buyer €49,500 without it - both the box and the
analytics dialog reflect this), and only the **seller** edits the pricelist. The mock DB shows the truth; the UI
projects it per side.

## DEMO bar

`State (Active | New)` · `Seeing as (Supplier | Buyer)` · Show/Hide data drawer.
`New` = the "no deal yet" empty state (Start-a-deal CTA; dialogs degrade gracefully).

## Mock DB tables

`relationship · deal (status + private) · note (side + scope) · agreed_term · pricelist_item (applied|proposed) ·
artifact · rel_signal (compute=live) · audit_log`. Deal docs intentionally absent (they belong to the deal).

## Verified (Claude Preview, port 8771)

Top band, both dialogs (blurred backdrop, close X, click-outside), tabs, deals filter, log expand, both sides,
New state - render clean, **no console errors**. State in-memory; reload resets to Active · Supplier · Overview.

## Parked / open

- "Open workspace →" is a visual affordance only (screen ④ not built).
- First-contact doc collection deferred - if built, lives in the Inbox; its docs land in Artifacts.
- Agreed-terms edit workflow + multi-approver pricelist sign-off - deferred per DEV-41.
- Notes/pricelist/upload/action buttons are visual; no real editing in the prototype.
