# Deal Workspace (screen ④) - prototype spec

> Throwaway prototype. `index.html` (port **8772**, Claude Preview config `deal-workspace-prototype`).
> Built 2026-06-07 (Ayush + Claude) on the decided Connect shell, consistent with connect/chat/relationship/dealcard.
> **Resolves the open [DEV-9]** ("what's inside a deal workspace + how should it look"). **Layout = the A&C mix** (chosen 2026-06-07; the A/B/C variants were the exploration).

## What it is

The **deal container** - **Layer B: invited participants only** (independent of the relationship page's company-wide
Layer A). Auto-scaffolded when a Deal Card is born. Fourth and last Connect atom:
① Deal card → ② Chat → ③ Relationship page → **④ Deal Workspace**.

**Two entry points:** (1) from the Relationship page's deals list ("Open workspace →"); (2) from a **⤢ button on
the Deal Card** itself. Inside the workspace the card lives **in the deal chat** (a pinned pill).

## Layout - the A&C mix

- **Top band:** deal header (title · HS · parties · owner · net · lifecycle pill) + **Deal-Sella** insight + **status line** (side by side).
- **Left (~400px): a tabbed work panel** - `Things · People · Documents`. Pick a tab → see that content. (C-style tabbing.)
- **Right (wide hero): the Deal Chat** - the most space. Carries a pinned **`Deal card ▸` pill** ("Talking about: HS-…") that opens the full card dialog - exactly like the P2P chat in screen ②. Deal-Sella posts here.
- The Deal Card is **no longer a separate box** - it lives in the chat (pill → dialog).

## Content (locked)

- **Deal info + lifecycle** - `Draft → Confirmed → Done` pill. **Done = delivery note + invoice both attached** (document-driven, *no explicit Done click*).
- **Deal Card** - pinned pill in the chat → full-card dialog (blurred backdrop, 6 products). Margin **seller-only** (buyer sees a placeholder). At Done it reads "amended to actuals" (OCR).
- **Things tab** - the **one visible work primitive**, grouped by domain (Finance / Logistics / Delivery) with a done-count + progress; "+ Add a thing". Approval THINGS = **e-signature** (the Draft confirmation gate). **Stages are NOT a UI element** (DEV-24/34) - scaffolding only.
- **People tab** - the 2 dealmakers + the **deal owner**; "+ Add"; "(you)" follows the Seeing-as side.
- **Documents tab** - DEAL-level artifacts (COA, contract; + delivery note + invoice at Done). *Company-wide docs stay on the relationship page* (two altitudes).
- **Deal chat** - per-deal, ground truth, invited-only.
- **Deal-Sella** - per-deal, **neutral**, one read; speaks in the chat.
- **Passive status line** - date+timestamp change record, no push.

## Lifecycle (DEMO bar `Lifecycle`)

- **Draft** - the **confirmation gate** in the Things tab (approval THING = 2FA e-sign, both sides, `blocks confirmation`); execution THINGS queued; `deal_confirmation` per-party rows.
- **Confirmed** - executing (3/8 done); delivery docs still needed.
- **Done** - delivery note + invoice attached; card amended to actuals; 8/8 things.

## Side-aware (Seeing as: Supplier | Buyer)

Margin is seller-only on the card; "(you)" + topbar follow the side; Deal-Sella is the side's agent.

## Mock DB tables

`deal_workspace · deal_card · member · thing (domain + status + type) · artifact · deal_confirmation (per-party
e-sign) · chat_thread (type=deal) · stage (config/scaffolding, NOT UI) · audit_log`.

## Verified (Claude Preview, port 8772)

The mix layout, all 3 lifecycle states, both sides, the tabs, the pinned-card dialog (6 products) - render clean,
**no console errors**. State in-memory; reload resets to Confirmed · Supplier · Things tab.

## Parked / open

- Final confirm of the mix (then the big LAYER docs pass: ③ + ④ + the §3/§4.1 drift).
- **Deal Room** deliberately **out of scope** (Present-surface presentation tool, not the workspace).
- THINGS inbox across deals ([DEV-27]); multi-deal in P2P ([DEV-37]); partial/multi-delivery close ([DEV-53]); confirmation output doc ([DEV-61]) - parked.
- Buttons (add thing/people, upload, approve, send) are visual; no real actions.
- Doc-vs-Linear divergence for the LAYER pass: CLAUDE.md "Deal Room = CUT" vs Linear DEV-22/52 "Deal Room live & distinct" (resolved here: out of *Connect ④*, lives in Present).
