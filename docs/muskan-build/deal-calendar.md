# Deal Calendar — design contract

**Status:** design locked 2026-07-08 (grill-with-docs session, Muskan). Ready to build (TDD).
**Component:** `DealCalendar` — one shared, side-agnostic component used by **Sell** (Sales calendar) and, later, **Buy** (Purchase calendar).
**Supersedes:** the "deferred / adopt Ayush's component" note in `SELL.md` §Section 3 — this lane now owns the calendar.
**Vocabulary:** see `CONTEXT.md` → *Sales / Purchase calendar* (Deal calendar, Counterparty, Pill, Deal display stage).

---

## 1. What it is

A timeline of a company's deals over time — **one row per counterparty**, each deal drawn as a **pill** on the day it lands. Same component both surfaces, `side` prop flips the wording:

| Element | Sell (`side='seller'`) | Buy (`side='buyer'`) |
|---|---|---|
| Title | Sales calendar | Purchase calendar |
| Row / frozen column | **Customers** | **Suppliers** |
| Money KPI | Total sales | Total purchases |
| Active-count KPI | Active customers | Active suppliers |

---

## 2. Pill = one Deal Card

- **One pill = one Deal Card** (not a line item, not a per-day aggregate). Click → dispatches the existing `hs:open-deal-room` event → opens that deal's real **Deal Room**.
- **Shown from birth:** a pill appears the moment the deal is birthed (an offer/order exists). A grey Product-Basket **draft is pre-birth and not a pill**.

### Position (which day the pill sits on)
`delivery_date_target` **?? `created_at`** — plot by the delivery date ("where the deal lands", DEV-77); fall back to the created/birth date when a fresh deal has no delivery date yet, so it still appears immediately.

### Colour = deal display stage (DEV-151)
A **display vocabulary** richer than the DB `deal_card_status` enum. Derivation from real data:

| Pill colour | Display stage | From real data |
|---|---|---|
| grey | Draft (in basket) | Product Basket line — **not on the calendar** |
| **pink** | Sales offer / Purchase order | `status='draft'` + `deal_type` (offer/order) |
| **yellow** | Deal accepted | `status='confirmed'` |
| **green** | Deal executed | `status='done'` |
| **orange** | Deal update | `status='amended'` (*Marcel left this colour unset; orange is our placeholder*) |
| **blue** | Ticket created | `deal_card.ticket_status='open'` (overrides base status) |
| **dark green** | Ticket closed | `deal_card.ticket_status='closed'` |

> **Already derived by `statusOf()` in `src/modules/allocate/status.ts`** (the Orders table's shared display-stage helper — reuse it, don't re-map). `deal_card.ticket_status` (open/closed/null) was added by the Allocate migration `20260707090000_allocate_schema.sql`. `withdrawn`/`cancelled` deals fall outside the 7-vocab → neutral `cancelled` code.

---

## 3. KPI cards — "Status this month"

Four cards, current month (labels side-flipped per §1). *Not hard-locked — easy to change later.*

1. **Total sales / purchases** — Σ deal value for the month
2. **Deals** — count of deals in the month
3. **Weighted avg price** — Σ(line total) ÷ Σ(grams) = blended €/g (weights big deals more; matches DEV-154)
4. **Active customers / suppliers** — distinct counterparties with a deal this month

---

## 4. Views & interaction (locked in the prototype, empirically verified)

- **Timeline** — day-level, one continuous grid, shown a **3-month window at a time** with **‹ ›** paging through the year; defaults to the **current month**.
- **Year** — zoomed-out aggregate (per-year columns).
- **Frozen Customers column + frozen header** — implemented as a split pane (a non-scrolling names column beside a horizontally-scrolling day-grid), **not** CSS `position: sticky` on the left axis (that was measured drifting on scroll in a headless-browser check — see §6).
- **Date-range filter** — narrows the grid to a picked window (months/weeks/pills all clip to it); jumps the window to the range and pages back to current-month on clear.
- **Per-counterparty running total** — under each name, "€X this month / in range".

---

## 5. Build contract (this session)

| Piece | Decision |
|---|---|
| Component | `DealCalendar` in `src/modules/deals/components/` — presentational, side-agnostic, props `{ deals, side }` |
| Deal shape | `{ dealCardId, counterparty, date, amount, grams, displayStage }` (date = delivery ?? created; **amount = Σ line_total**, not `deal_card.value_net` — the latter is often null; grams feeds the €/g KPI) |
| Data source | `getSellerCalendarDeals()` next to `getSellerOrders()` in `src/modules/allocate`; Buy's `getBuyerCalendarDeals()` deferred to when Buy is built |
| Pill click | existing `hs:open-deal-room` window event (no new modal) |
| Scope | build component + wire into **Sell** (replace `SalesCalendarStub`). **Buy: nothing this session** — it adopts the same component later |
| Method | TDD (red-green-refactor), per session plan |

---

## 6. Known gaps / deferred

- **Demo seed (decision A):** seed deals across **all** display stages so the full colour legend shows. The two ticket colours seed **cleanly via the real `deal_card.ticket_status` column** (`open`/`closed`) — no metadata hack needed (earlier "no ticket table" note was wrong; the Allocate migration added the column + lookup).
- **"Deal update" colour** = orange placeholder (Marcel unspecified).
- **Weighted-avg-price maths** confirmed money÷grams but explicitly "easy to change later".
- **Pill length/span** is cosmetic in the prototype (faked 2-day width); real span rule TBD (single-day dot vs delivery-window bar).
- **`position: sticky` left-freeze is unreliable** in a per-row CSS grid (measured drifting to negative offset on horizontal scroll) — the frozen column MUST be the split-pane approach, not sticky. Don't "simplify" it back to sticky.

---

## References
- `CONTEXT.md` → Sales / Purchase calendar (vocabulary)
- [DEV-151](https://linear.app/hellosello/issue/DEV-151) — Stages for deals (colour source)
- [DEV-154](https://linear.app/hellosello/issue/DEV-154) — Buy calendar changes (weighted-avg price)
- [DEV-77](https://linear.app/hellosello/issue/DEV-77) — "where the deals land"
- [DEV-76](https://linear.app/hellosello/issue/DEV-76) — Sell / Allocate (host page)
- `prototypes/allocate-prototype/index.html` — the built + iterated prototype (design reference)
- `SELL.md` §Section 3 — Sales calendar (now superseded by this doc)
