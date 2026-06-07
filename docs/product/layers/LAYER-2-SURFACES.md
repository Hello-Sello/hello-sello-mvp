# Hello Sello — Layer 2: Product Surfaces

**Status:** ⏳ IN PROGRESS. This is a working draft — decisions are captured here live as they get locked during brainstorm sessions. Sections marked *(to be filled in)* are still being discussed.

**Builds on:** [LAYER-1-USERS-AND-CORE-OBJECTS.md](LAYER-1-USERS-AND-CORE-OBJECTS.md) — **LOCKED**.

---

## Purpose of this document

Capture **how users navigate the product** — the 5 surfaces (Connect / Present / Sell / Buy / Grow), what lives on each, the navigation model, and how each maps back to the Layer 1 deal lifecycle.

## Layer 2 covers

- The **5 surface verbs** as actual pages/areas of the product.
- The **navigation model** (tabs / sidebar / pages / something else).
- The **home / landing view** for a logged-in user.
- The **content map** of each surface — what's on it, what actions live there.
- **How each surface connects back to** the Relationship, Deal Card, and Deal Workspace from Layer 1.

## Layer 2 does NOT cover

- Sella's detailed behaviors → **Layer 4**.
- Deal execution (post-confirmation: milestones, delivery, completion, PO generation) → **Layer 3**.
- Inputs and outputs (chat ingestion, email/fax/ERP integrations) → **Layer 5**.
- Engineering architecture (tech stack, data model, storage, auth) → separate workstream.

---

## Surface map (Big 7 framework, locked 2026-05-18)

The product is organized as **6 navigable surfaces + Sella (always-available AI pillar) + Home (landing page outside the Big 7)**. Order below reflects the value-prop table from the 2026-05-18 meeting.

| # | Pillar | What it is | Status |
|---|---|---|---|
| 1 | **Connect** | Chat with every partner inside or outside Hello Sello. Where deals are *born*. | To discuss |
| 2 | **Buy** | Smart procurement: visibility of all deals, prices, margins. Buyer-side toolset (Margin & Pricing, Deal Engine, Cash-Flow, Product Data Bank, Exclusivity). **Led by Victor Diem.** | To discuss |
| 3 | **Sell** | Seller-side ops on top of deals: inventory, pricing, batch allocation with margin control. | To discuss |
| 4 | **Present** | Seller's shop + product catalog. Basket → Deal Room. Online shop + best presentation. | To discuss |
| 5 | **Grow** | Command center for all deals — cross-cutting analytics. **Post-MVP.** | To discuss |
| 6 | **Discover** | Pre-populated companies (FLOWZ-style), find suppliers globally as a social feed, legal advertising to verified audience. | To discuss |
| — | **Sella** (pillar, not a surface) | Always-available AI in right-side panel across every surface. Adapts to user, surface, and task. | See §7 |
| — | **Home** (landing page) | Public front door + login portal. FIGMA-based with pink replacing blue. | See §8 |

---

## Structural decisions (locked)

- **Navigation:** the 6 navigable surfaces (Connect / Buy / Sell / Present / Grow / Discover) live as pages in the left sidebar.
- **Big 7 (locked 2026-05-18):** Connect / Buy / Sell / Present / Grow / Discover + Sella as a pillar. Home is a separate landing page outside the Big 7.
- **Sella is a Big 7 pillar but NOT a sidebar surface.** She lives in a right-side panel across all surfaces (Cursor-style). Always available but no sidebar item. Her role adapts to the user, surface, and task. *(Lock from 2026-05-14, reaffirmed 2026-05-18.)*
- **All users see all 6 navigable surfaces**, regardless of whether their company sells, buys, or both.
- **(2026-05-20, DEV-14) Each surface has two UI states: blank and populated.** *Blank* = the user / company hasn't activated this surface (e.g., a pharmacy that has never used Sell). *Populated* = active use with content visible. No hiding, no role gating — every surface stays reachable. The platform encourages dual-role usage; the design pattern is just "show empty state vs live state."

> **DEV-14 — closed (2026-05-20).** See the blank-vs-populated rule above.
- **Deals:** workspaces live inside Connect. Accessible from chat AND from Grow.

## Still open

- **Home / landing view** — what does a freshly-logged-in user see? Tracked: [DEV-13](https://linear.app/hellosello/issue/DEV-13/what-should-the-home-landing-view-show-for-a-logged-in-user).

---

## 1. Connect

> **⚠️ OPEN [DEV-15]** — Layout/navigation pattern (now generalized to all 5 surfaces). See [DEV-15](https://linear.app/hellosello/issue/DEV-15/whats-the-layoutnavigation-pattern-for-each-of-the-5-surfaces-when-a).
> **⚠️ OPEN [DEV-16]** — Is "Thread instead of group chat" a Connect-level feature or a chat-specific behavior? See [DEV-16](https://linear.app/hellosello/issue/DEV-16/is-thread-instead-of-group-chat-a-connect-level-feature-or-a-chat).
> **DEV-17 — closed (2026-05-24).** MVP scheme: manual role label per contact (default `Unknown`; suggested enum: Supplier / Customer / Partner / Other / Unknown — final at build phase) + auto-derived activity bucket (Active / Occasional / Dormant from `email_count` + `last_seen` per DEV-3). No free-text tags or AI inference in MVP. See DECISIONS.md Layer 2 walkthrough locks 2026-05-24 for full lock; ARCHITECTURE-NOTES.md "Onboarding / data import" for schema shape.
> **DEV-38 — closed (2026-05-24).** MVP safety posture locked — company license verification at onboarding by Hello Sello team; pre-verification accounts locked out with wait dialog; one-time verification at MVP; HS platform admins are sole suspension authority. See [Layer 1 §12](LAYER-1-USERS-AND-CORE-OBJECTS.md) for full posture.

**Contents** (per the locked meta-rule: each surface's contents = its Linear-label's projects): the Connect Linear label is the source of truth. Provisional scope includes company onboarding (license verification by Hello Sello team — see [Layer 1 §12](LAYER-1-USERS-AND-CORE-OBJECTS.md)), connection requests, relationship pages, company↔company chat (C2C — created at connection) + per-deal Deal chat, chat list, contact import, offer/pricelist requests, LinkedIn-style company profile banner, deal workspaces. *(Chat model updated 2026-06-06: P2P / C2C / Deal; P↔C folded into C2C.)*

*(Detailed sub-area discussion: deferred until after the sprint pass through all 5 surfaces.)*

---

## 2. Present

> **⚠️ OPEN [DEV-15]** — Layout/navigation pattern for this surface. See [DEV-15](https://linear.app/hellosello/issue/DEV-15/whats-the-layoutnavigation-pattern-for-each-of-the-5-surfaces-when-a).
> **DEV-18 — closed (2026-05-20).** Presentation Mode concept locked — seller selects products from their shop, adds presentation media (videos / photos / Loom), and turns them into a Deal Room for the customer. UI / interaction design spun off as [DEV-54](https://linear.app/hellosello/issue/DEV-54/design-the-presentation-mode-ui-interaction-model).
> **DEV-22 — closed (2026-05-19).** The Basket / Deal Card / Deal Room / Deal Workspace model is locked — see below.

**Contents:** see the Present Linear label.

**Locked:**
- Present is the seller's shop and product catalog surface.
- **Basket seller-view and buyer-view are the same object** — role-based perspectives. Buyers without their own shop create baskets directly from the seller's shop.
- **Basket = Deal Card** — **one entity, two lifecycle visual representations.** Cart-style while the seller assembles products from their shop; transitions to Pokémon-card-style once a deal forms (signals detected, sent + accepted/countered, basket confirmed in a Deal Room, or manual trigger). Same underlying record. See [Layer 1 §4.2](LAYER-1-USERS-AND-CORE-OBJECTS.md).
- **Deal Room is a distinct concept from Deal Workspace.** Deal Room = customer-presentation surface (videos / photos / Loom). Deal Workspace = container that spawns at Deal Card birth (chat / artifacts / members / stages). See [Layer 1 §4.4](LAYER-1-USERS-AND-CORE-OBJECTS.md).
- **Deal Room properties:** 1 per Basket (1-to-1), re-presentable to multiple customers, persistent (engineering choice: object vs render — [DEV-52](https://linear.app/hellosello/issue/DEV-52)), product media (videos, photos) tied to products for reuse across rooms, off-platform sharing via temporary link (doubles as marketing).
- **(2026-05-20, DEV-12) Shop pricing per viewer — 3 modes:** (a) show all prices publicly, (b) hide all — buyer sees a **"request pricing" button** to ask, (c) show one default STANDARD pricelist publicly. For connected companies, an **individual custom pricelist** applies on top — **different per connected company**. *(Refines the 2026-05-14 lock; mirrors Layer 1 §11.2 Shop prices row.)*

*(Detailed sub-area discussion: TBD.)*

---

## 3. Sell

> **⚠️ OPEN [DEV-15]** — Layout/navigation pattern for this surface. See [DEV-15](https://linear.app/hellosello/issue/DEV-15/whats-the-layoutnavigation-pattern-for-each-of-the-5-surfaces-when-a).
> **⚠️ OPEN [DEV-19]** — What features should live in Sell beyond the 3 known projects? See [DEV-19](https://linear.app/hellosello/issue/DEV-19/what-features-should-live-in-the-sell-page-beyond-the-3-known-projects).

**Contents:** see the Sell Linear label.

**Locked:**
- Sell is **strictly seller-side ops** for the sales team. No cross-side analytics — those belong in Grow.
- Batch allocation flow is **post-MVP**.
- **(2026-05-16, DEV-1)** Outbound offer pricelist cascade — per recipient: customer-specific (Relationship page) → STANDARD (seller's uploaded default) → manual prompt. See DECISIONS.md.

*(Detailed sub-area discussion: TBD.)*

---

## 4. Buy

> **⚠️ OPEN [DEV-15]** — Layout/navigation pattern for this surface. See [DEV-15](https://linear.app/hellosello/issue/DEV-15/whats-the-layoutnavigation-pattern-for-each-of-the-5-surfaces-when-a).
> **⚠️ OPEN [DEV-20]** — What features should live in Buy (analogous to Sell)? See [DEV-20](https://linear.app/hellosello/issue/DEV-20/what-features-should-live-in-the-buy-page-analogous-to-sell).

**Contents:** see the Buy Linear label.

**Locked:**
- Buy is the **buyer-side analog of Sell** — a dedicated page for buyer-side procurement workflows.

*(Detailed sub-area discussion: TBD.)*

---

## 5. Grow

> *(Renamed from "Trade" on 2026-05-23 — see [DEV-21](https://linear.app/hellosello/issue/DEV-21/whats-the-new-name-for-the-trade-page-verb-matching-the-surface-naming). The Linear project label is still named `Trade`; rename pending team alignment.)*

> **⚠️ OPEN [DEV-15]** — Layout/navigation pattern for this surface. See [DEV-15](https://linear.app/hellosello/issue/DEV-15/whats-the-layoutnavigation-pattern-for-each-of-the-5-surfaces-when-a).

**Contents:** see the `Trade` Linear label (rename to `Grow` pending team alignment).

**Locked:**
- Grow is the **C-suite analytics + business control center** — a "command center for all your deals" (Big 7).
- **Post-MVP** — entire page is built later.
- **Initial scope:** all deals over time with filters (1 month / 1 year / 2 years / custom). Operate the business from there.
- **Future** (post-post-MVP): map view of deals.

*(Detailed sub-area discussion: TBD.)*

---

## 6. Discover

**Added to Layer 2 by the Big 7 lock (2026-05-18). Stub — sub-area discussion: TBD.**

**Contents:** see the Discover Linear label.

**Locked (from the Big 7 value-prop):**
- Discover is the **pre-registration + cross-network discovery** surface.
- Three known jobs:
  - **Pre-populated companies** — FLOWZ-scraped companies/products so new buyers don't see an empty platform (see Layer 1 §12).
  - **Find new suppliers globally** — a network "social feed" of top-level service providers for inspiration.
  - **Legal advertising for brands** — verified, professionally-allowed audience ("closed gang") — a regulatorily safe advertising surface (see existing Linear project "Create way to advertise in safe environment...").

*(Detailed sub-area discussion: TBD.)*

---

## 7. Sella (pillar — not a navigable surface)

**Sella is the 7th Big 7 pillar but NOT a sidebar item.** UI-wise she lives in the right-side panel across every navigable surface (Cursor-style). Her role adapts to which user is talking, which surface they're on, and what task they're doing — see the multi-Sella architecture in Layer 1 §10.

Sella's user-facing value prop (Big 7): "A female-inspired caring AI for both sides, mediating for collaborative mutual benefits."

**Why Sella is in the Big 7 despite not having a sidebar:** the Big 7 is a *value-pillar* framing (what each pillar gives the user), not a UI navigation list. Sella is one of the seven things the platform delivers — even though her UI footprint is the panel, not a page.

*(Sella's specific behaviors → Layer 4.)*

---

## 8. Home (landing page outside the Big 7)

**Public front door + login portal.** UI base = the FIGMA design ([link in 2026-05-18 meeting notes](../meeting-notes/2026-05-18-team-meeting.md)) with pink replacing blue.

**Locked (2026-05-18):**
- Home is outside the Big 7 — it's a marketing surface, not a signed-in product surface.
- Login portal lives top-right.
- Pink theme replaces FIGMA's blue.

*(Sub-area discussion: TBD — what content beyond login? Hero / value prop / demo / waitlist?)*

---

## Post-MVP (Layer 2 scope)

- **Batch allocation flow** (Sell) — full workflow design deferred to post-MVP.
- **Grow page entirely** — the whole C-suite analytics + business control surface is post-MVP.
- **Grow map view** — geographic deal visualization (post-post-MVP, after Grow is launched).
- **FLOWZ pre-population** — see Layer 1 Section 13. Pre-seed companies and products to avoid empty-platform feeling.

---

## Locked decisions in Layer 2

*(Will be populated via the Propose-mode flow as decisions get locked. Each entry mirrors what's added to [DECISIONS.md](DECISIONS.md) under the Layer 2 section.)*

---

## Open Questions

*(Doubts get appended here as they're tracked via the `/track-doubt` skill. Format: `Section X — question — DEV-XX link`.)*

- **Structural Q2** — What should the home / landing view show for a logged-in user? — [DEV-13](https://linear.app/hellosello/issue/DEV-13/what-should-the-home-landing-view-show-for-a-logged-in-user)
- **All 5 surfaces — layout** — What's the layout/navigation pattern for each surface when a user clicks it in the sidebar? — [DEV-15](https://linear.app/hellosello/issue/DEV-15/whats-the-layoutnavigation-pattern-for-each-of-the-5-surfaces-when-a)
- **Section 1 — Connect / Chat** — Is "Thread instead of group chat" a Connect feature or a chat-specific behavior? — [DEV-16](https://linear.app/hellosello/issue/DEV-16/is-thread-instead-of-group-chat-a-connect-level-feature-or-a-chat)
- **Section 3 — Sell** — What features should live in Sell beyond the 3 known projects? — [DEV-19](https://linear.app/hellosello/issue/DEV-19/what-features-should-live-in-the-sell-page-beyond-the-3-known-projects)
- **Section 4 — Buy** — What features should live in Buy (analogous to Sell)? — [DEV-20](https://linear.app/hellosello/issue/DEV-20/what-features-should-live-in-the-buy-page-analogous-to-sell)

---

*End of Layer 2 stub. Will be expanded section by section as the brainstorm progresses.*
