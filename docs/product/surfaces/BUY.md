# Buy

## One-sentence definition

Buyer-side operations surface where a pharmacy/procurement team tracks purchase history across suppliers and reads its own buy-side economics (weighted avg price, resale margin) — Big-7 value prop mirror of Sell: *"Buy — see what you're paying, and what you're making on it."*

## Status

- Depth: **prototype finalized** (design contract = `prototypes/buy-prototype/`, built + finalized through 6 rounds of feedback, 2026-07-05, committed `dee2739`)
- Last updated: 2026-07-08
- Build status: **BUILDING NOW.**

## Who uses this surface and why

Primarily the **buyer-side procurement/pharmacy team** (e.g. Aurora Deutschland GmbH). The job: track what you've bought from every supplier, at what price, and what margin you're making reselling it — independent of whether that supplier is formally connected on Hello Sello.

---

## Page architecture — one scrollable page, 3 blocks

**Locked:** a single scrolling page (not tabs) — a sticky section nav smooth-scrolls between blocks. Two other structural variants (three-tabs; a linked master/detail workbench) were prototyped and killed in favour of this one-scroll shape.

1. **KPI strip** — four headline numbers
2. **Deals timeline** — adopted from the shared Sales Calendar component (see below)
3. **Analytics + Sheet** — one merged card: graph + drill-down table

### KPI strip

Four cards: **Purchases this month** (total € + deal count) · **Open deals** (count, of this month's total) · **Avg price €/g** (+ delta vs previous week) · **DB1 total** (across all listed products).

---

## Block 1 — Deals timeline (adopted, not built here)

**This section is not designed or built in this phase.** It **is** the Sales Calendar component being built in a parallel session for Sell/Allocate (replacing `src/app/sell/SalesCalendarStub.tsx`) — **one shared component, both surfaces**. Buy's board is suppliers-as-rows / weeks-days-months-as-columns / deal pills, same shape as Sell's calendar section.

- **Locked:** it renders **real Deal Card data**, not a separate CSV-imported record — so pill status uses the same **locked 7-state vocab** as Sell's Orders & Offers (Sales offer / Purchase order / Deal accepted / Deal executed / Deal update / Ticket created / Ticket closed), not the prototype's placeholder `open/confirmed/delivered`.
- Clicking a partner expands its products → pack sizes; clicking a pill opens the real deal receipt/card (same drill-down as Sell).
- **Wiring plan:** the other session's worktree merges in; this build wires the real component directly here — no interim stub needed.

## Block 2 — Analytics + Sheet

One glass card: a vertical filter rail (Time / Supplier / Type / Product / Pack size + quick-range chips) on the left; a graph (€ over time, re-scopes to whatever row/column is selected) + a 3-level drill-down table (Supplier → Category → Product) on the right, below the graph.

**Data source — layered (locked):**
1. **Live aggregation** from real `deal_line_item` rows (price × qty), grouped by partner/product — the default once enough deal history exists.
2. **CSV import** as a backfill/supplement layer, for purchase history that predates Hello Sello or arrives off-platform (mirrors Sell's own multi-channel order intake — Hello Sello / e-mail / fax). **This is a separate, simpler import from the parked `catalogue-ingestion-DESIGN.md` pipeline — deferred, not designed this phase.**

**Money model** (kept in one place, per product/partner/period):
- `wap` = weighted average purchase price €/g (from layer 1+2 above)
- `net` / `gross` = the buyer's own resale price to the end customer/patient, entered by hand per (partner, product) — **v0: fully independent** of the per-deal private buyer-resale price already on `deal_line_item`; no auto-fill link yet (`CONTEXT.md` — Buyer resale price)
- `DB1 total = (net − wap) × qty`, `DB1/unit = net − wap`, `margin % = DB1 / revenue` (`CONTEXT.md` — DB1)

**Table behavior:** 3-level tree (Supplier → Category → Product), collapsed rows show honest rollups only (revenue, wap, DB1, margin-from-totals, qty, share); per-unit/editable cells stay blank above product level. Clicking a numeric column header re-scopes the graph to that column; clicking a table row selects/re-scopes it. Net/gross are pencil-edit cells (dashed pink "insert" affordance when empty).

## "Partner" — who shows up as a row

A **Partner** is any supplier the buyer has purchase history with — real deals and/or CSV-imported — **connection to the platform is optional** (`CONTEXT.md` — Partner (Buy)). A connected partner's row additionally links to its real Relationship page; an unconnected one (history-only) doesn't.

---

## What this surface shares with others

- **Foundation** (every surface uses): User, Brand, Notifications, Auth, Permissions, Event stream
- **Cross-cutting Sella:** Buyer-Sella — **"coming soon" stub for this build** (same move as Sell/Allocate did for seller-Sella); help evaluate offers / compare suppliers / draft purchase decisions is future scope, not this phase.
- **Surface-to-surface contracts:**
  - **Deals timeline / Sales calendar** — one shared component with **Sell** (`SELL.md` §3), built in a parallel session, wired in on merge.
  - Reads real deal data from the same `deal_card`/`deal_line_item` objects Connect/Sell write.
  - Reads supplier/company info from Discover for connected partners.

## Open questions

- CSV import design for the Analytics/Sheet backfill layer — deferred, not scoped this phase.
- Whether the buyer resale price (net/gross) should eventually auto-fill/snapshot into new deal lines' private buyer-resale field — parked for a later version (`CONTEXT.md` — Buyer resale price).

## References to LAYER docs

- `../layers/LAYER-1-USERS-AND-CORE-OBJECTS.md` §1 (Users - buyer roles)
- `../layers/LAYER-2-SURFACES.md` §5 (Buy in Big 7)
- `../layers/LAYER-4-SELLA-BEHAVIOR.md` (Buyer-Sella variant — deferred this phase)
- `../../architecture/CONTEXT.md` — Buy page terms (Partner, Deals timeline/Sales calendar, wap, DB1, Buyer resale price)
- `prototypes/buy-prototype/` (`index.html` + `NOTES.md`) — the live design contract, 6 rounds of finalized feedback
- `../surfaces/SELL.md` — the mirror surface; shares the Deals timeline/Sales calendar component
