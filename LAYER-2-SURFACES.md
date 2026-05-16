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

## Surface map (starting hypothesis)

| Surface | What I think it is | Status |
|---|---|---|
| **Connect** | Discovering, requesting, maintaining company-to-company relationships. Where deals are *born*. | To discuss |
| **Present** | The seller's shop and product catalog. Where products *live* and are shown. | To discuss |
| **Sell** | The seller's day-to-day ops on top of deals: inventory, pricing, allocations. | To discuss |
| **Buy** | The buyer's discovery + browsing experience. | To discuss |
| **Trade** | Cross-cutting analytics — partnerships, business performance, signal analysis. | To discuss |

---

## Structural decisions (locked)

- **Navigation:** the 5 surfaces live as pages in the left sidebar.
- **Surfaces:** Connect / Present / Sell / Buy / Trade. (Sella is NOT a sidebar surface — see below.)
- **Sella:** distributed across all 5 surfaces in a right-side panel (Cursor-style). She's always available but doesn't have her own sidebar item.
- **All users see all 5 surfaces**, regardless of whether their company sells, buys, or both. *(Open follow-up: what's visible **within** a surface for users who only buy or only sell — see Open Questions.)*

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
> **⚠️ OPEN [DEV-18]** — What is Presentation Mode exactly, and how does basket → Deal Room transition work? See [DEV-18](https://linear.app/hellosello/issue/DEV-18/what-exactly-is-presentation-mode-and-how-does-the-basket-deal-room).
> **⚠️ OPEN [DEV-22]** — Relationship between Deal Basket, Deal Card, Deal Room, and Deal Workspace (4 overlapping concepts). See [DEV-22](https://linear.app/hellosello/issue/DEV-22/whats-the-relationship-between-deal-basket-deal-card-deal-room-and).

**Contents:** see the Present Linear label.

**Locked:**
- Present is the seller's shop and product catalog surface.
- **Basket seller-view and buyer-view are the same object** — role-based perspectives. Buyers without their own shop create baskets directly from the seller's shop.
- **Deal Basket = Deal Card** (same thing in different visual representations: cart-style vs. Pokémon-card-style). Both can open into a Deal Room.

*(Detailed sub-area discussion: TBD.)*

---

## 3. Sell

> **⚠️ OPEN [DEV-15]** — Layout/navigation pattern for this surface. See [DEV-15](https://linear.app/hellosello/issue/DEV-15/whats-the-layoutnavigation-pattern-for-each-of-the-5-surfaces-when-a).
> **⚠️ OPEN [DEV-19]** — What features should live in Sell beyond the 3 known projects? See [DEV-19](https://linear.app/hellosello/issue/DEV-19/what-features-should-live-in-the-sell-page-beyond-the-3-known-projects).

**Contents:** see the Sell Linear label.

**Locked:**
- Sell is **strictly seller-side ops** for the sales team. No cross-side analytics — those belong in Trade.
- Batch allocation flow is **post-MVP**.

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
- Trade is the **C-suite analytics + business control center**.
- **Post-MVP** — entire page is built later.
- **Initial scope:** all deals over time with filters (1 month / 1 year / 2 years / custom). Operate the business from there.
- **Future** (post-post-MVP): map view of deals.

*(Detailed sub-area discussion: TBD.)*

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
- **Section 2 — Present** — What's the relationship between Deal Basket, Deal Card, Deal Room, and Deal Workspace? — [DEV-22](https://linear.app/hellosello/issue/DEV-22/whats-the-relationship-between-deal-basket-deal-card-deal-room-and)

---

*End of Layer 2 stub. Will be expanded section by section as the brainstorm progresses.*
