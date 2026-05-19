# Hello Sello — Layer 2: Product Surfaces

**Status:** ⏳ IN PROGRESS. This is a working draft — decisions are captured here live as they get locked during brainstorm sessions. Sections marked *(to be filled in)* are still being discussed.

**Builds on:** [LAYER-1-USERS-AND-CORE-OBJECTS.md](LAYER-1-USERS-AND-CORE-OBJECTS.md) — **LOCKED**.

---

## Purpose of this document

Capture **how users navigate the product** — the 5 surfaces (Connect / Present / Sell / Buy / Trade), what lives on each, the navigation model, and how each maps back to the Layer 1 deal lifecycle.

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
| 5 | **Trade** | Command center for all deals — cross-cutting analytics. **Post-MVP.** | To discuss |
| 6 | **Discover** | Pre-populated companies (FLOWZ-style), find suppliers globally as a social feed, legal advertising to verified audience. | To discuss |
| — | **Sella** (pillar, not a surface) | Always-available AI in right-side panel across every surface. Adapts to user, surface, and task. | See §7 |
| — | **Home** (landing page) | Public front door + login portal. FIGMA-based with pink replacing blue. | See §8 |

---

## Structural decisions (locked)

- **Navigation:** the 6 navigable surfaces (Connect / Buy / Sell / Present / Trade / Discover) live as pages in the left sidebar.
- **Big 7 (locked 2026-05-18):** Connect / Buy / Sell / Present / Trade / Discover + Sella as a pillar. Home is a separate landing page outside the Big 7.
- **Sella is a Big 7 pillar but NOT a sidebar surface.** She lives in a right-side panel across all surfaces (Cursor-style). Always available but no sidebar item. Her role adapts to the user, surface, and task. *(Lock from 2026-05-14, reaffirmed 2026-05-18.)*
- **All users see all 6 navigable surfaces**, regardless of whether their company sells, buys, or both. *(Open follow-up: what's visible **within** a surface for users who only buy or only sell — see Open Questions.)*

> **⚠️ OPEN [DEV-14]** — Within-surface visibility for buy-only / sell-only users vs dual-role: empty states, hidden sections, defaults? See [DEV-14](https://linear.app/hellosello/issue/DEV-14/whats-visible-inside-each-surface-for-users-whose-company-only-buys-or).
- **Deals:** workspaces live inside Connect. Accessible from chat AND from Trade.

## Still open

- **Home / landing view** — what does a freshly-logged-in user see? Tracked: [DEV-13](https://linear.app/hellosello/issue/DEV-13/what-should-the-home-landing-view-show-for-a-logged-in-user).

---

## 1. Connect

> **⚠️ OPEN [DEV-15]** — Layout/navigation pattern (now generalized to all 5 surfaces). See [DEV-15](https://linear.app/hellosello/issue/DEV-15/whats-the-layoutnavigation-pattern-for-each-of-the-5-surfaces-when-a).
> **⚠️ OPEN [DEV-16]** — Is "Thread instead of group chat" a Connect-level feature or a chat-specific behavior? See [DEV-16](https://linear.app/hellosello/issue/DEV-16/is-thread-instead-of-group-chat-a-connect-level-feature-or-a-chat).
> **⚠️ OPEN [DEV-17]** — How are imported contacts labelled and categorized? See [DEV-17](https://linear.app/hellosello/issue/DEV-17/how-are-imported-contacts-labelled-and-categorized-after-import).

**Contents** (per the locked meta-rule: each surface's contents = its Linear-label's projects): the Connect Linear label is the source of truth. Provisional scope includes connection requests, relationship pages, company↔company chat (inside deal workspaces only), chat list, contact import, offer/pricelist requests, LinkedIn-style company profile banner, deal workspaces.

*(Detailed sub-area discussion: deferred until after the sprint pass through all 5 surfaces.)*

---

## 2. Present

> **⚠️ OPEN [DEV-15]** — Layout/navigation pattern for this surface. See [DEV-15](https://linear.app/hellosello/issue/DEV-15/whats-the-layoutnavigation-pattern-for-each-of-the-5-surfaces-when-a).
> **⚠️ OPEN [DEV-18]** — Presentation Mode UI specifics (the Deal Room concept is locked — see below; the visual layout / interaction model of Presentation Mode itself is still open). See [DEV-18](https://linear.app/hellosello/issue/DEV-18/what-exactly-is-presentation-mode-and-how-does-the-basket-deal-room).
> **DEV-22 — closed (2026-05-19).** The Basket / Deal Card / Deal Room / Deal Workspace model is locked — see below.

**Contents:** see the Present Linear label.

**Locked:**
- Present is the seller's shop and product catalog surface.
- **Basket seller-view and buyer-view are the same object** — role-based perspectives. Buyers without their own shop create baskets directly from the seller's shop.
- **Basket = Deal Card** — **one entity, two lifecycle visual representations.** Cart-style while the seller assembles products from their shop; transitions to Pokémon-card-style once a deal forms (signals detected, sent + accepted/countered, basket confirmed in a Deal Room, or manual trigger). Same underlying record. See [Layer 1 §4.2](LAYER-1-USERS-AND-CORE-OBJECTS.md).
- **Deal Room is a distinct concept from Deal Workspace.** Deal Room = customer-presentation surface (videos / photos / Loom). Deal Workspace = container that spawns at Deal Card birth (chat / artifacts / members / stages). See [Layer 1 §4.4](LAYER-1-USERS-AND-CORE-OBJECTS.md).
- **Deal Room properties:** 1 per Basket (1-to-1), re-presentable to multiple customers, persistent (engineering choice: object vs render — [DEV-52](https://linear.app/hellosello/issue/DEV-52)), product media (videos, photos) tied to products for reuse across rooms, off-platform sharing via temporary link (doubles as marketing).

*(Detailed sub-area discussion: TBD.)*

---

## 3. Sell

> **⚠️ OPEN [DEV-15]** — Layout/navigation pattern for this surface. See [DEV-15](https://linear.app/hellosello/issue/DEV-15/whats-the-layoutnavigation-pattern-for-each-of-the-5-surfaces-when-a).
> **⚠️ OPEN [DEV-19]** — What features should live in Sell beyond the 3 known projects? See [DEV-19](https://linear.app/hellosello/issue/DEV-19/what-features-should-live-in-the-sell-page-beyond-the-3-known-projects).

**Contents:** see the Sell Linear label.

**Locked:**
- Sell is **strictly seller-side ops** for the sales team. No cross-side analytics — those belong in Trade.
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

## 5. Trade

> **⚠️ OPEN [DEV-15]** — Layout/navigation pattern for this surface. See [DEV-15](https://linear.app/hellosello/issue/DEV-15/whats-the-layoutnavigation-pattern-for-each-of-the-5-surfaces-when-a).
> **⚠️ OPEN [DEV-21]** — Trade page rename — what verb matches the naming convention? See [DEV-21](https://linear.app/hellosello/issue/DEV-21/whats-the-new-name-for-the-trade-page-verb-matching-the-surface-naming).

**Contents:** see the Trade Linear label.

**Locked:**
- Trade is the **C-suite analytics + business control center** — a "command center for all your deals" (Big 7).
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
- **Trade page entirely** — the whole C-suite analytics + business control surface is post-MVP.
- **Trade map view** — geographic deal visualization (post-post-MVP, after Trade is launched).
- **FLOWZ pre-population** — see Layer 1 Section 12. Pre-seed companies and products to avoid empty-platform feeling.

---

## Locked decisions in Layer 2

*(Will be populated via the Propose-mode flow as decisions get locked. Each entry mirrors what's added to [DECISIONS.md](DECISIONS.md) under the Layer 2 section.)*

---

## Open Questions

*(Doubts get appended here as they're tracked via the `/track-doubt` skill. Format: `Section X — question — DEV-XX link`.)*

- **Structural Q2** — What should the home / landing view show for a logged-in user? — [DEV-13](https://linear.app/hellosello/issue/DEV-13/what-should-the-home-landing-view-show-for-a-logged-in-user)
- **Structural / surface visibility** — What's visible inside each surface for users whose company only buys or only sells (vs. dual-role)? — [DEV-14](https://linear.app/hellosello/issue/DEV-14/whats-visible-inside-each-surface-for-users-whose-company-only-buys-or)
- **All 5 surfaces — layout** — What's the layout/navigation pattern for each surface when a user clicks it in the sidebar? — [DEV-15](https://linear.app/hellosello/issue/DEV-15/whats-the-layoutnavigation-pattern-for-each-of-the-5-surfaces-when-a)
- **Section 1 — Connect / Chat** — Is "Thread instead of group chat" a Connect feature or a chat-specific behavior? — [DEV-16](https://linear.app/hellosello/issue/DEV-16/is-thread-instead-of-group-chat-a-connect-level-feature-or-a-chat)
- **Section 1 — Connect / Contact import** — How are imported contacts labelled and categorized? — [DEV-17](https://linear.app/hellosello/issue/DEV-17/how-are-imported-contacts-labelled-and-categorized-after-import)
- **Section 2 — Present** — What is Presentation Mode, and how does basket → Deal Room transition work? — [DEV-18](https://linear.app/hellosello/issue/DEV-18/what-exactly-is-presentation-mode-and-how-does-the-basket-deal-room)
- **Section 3 — Sell** — What features should live in Sell beyond the 3 known projects? — [DEV-19](https://linear.app/hellosello/issue/DEV-19/what-features-should-live-in-the-sell-page-beyond-the-3-known-projects)
- **Section 4 — Buy** — What features should live in Buy (analogous to Sell)? — [DEV-20](https://linear.app/hellosello/issue/DEV-20/what-features-should-live-in-the-buy-page-analogous-to-sell)
- **Section 5 — Trade** — What's the new name for the Trade page (verb matching naming convention)? — [DEV-21](https://linear.app/hellosello/issue/DEV-21/whats-the-new-name-for-the-trade-page-verb-matching-the-surface-naming)

---

*End of Layer 2 stub. Will be expanded section by section as the brainstorm progresses.*
