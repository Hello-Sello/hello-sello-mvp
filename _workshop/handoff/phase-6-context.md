# Phase 6 Context - Handoff to Muskan

> **What this is:** the full context for Phase 6 (the Deal Basket), handed from Ayush to Muskan.
> **Why:** Phase 6 is almost the same work as the Product Basket that Muskan already owns, so Muskan takes over all of Phase 6.
> **State at handoff:** no Phase 6 code is built yet. The 6A design talk was started but never finished, so no `06A-CONTEXT.md` exists. Nothing to un-build - this is a clean handover.
> **Per-sub-phase source:** the Sprint 2 roadmap board `_workshop/build-plans/2026-06-19-recategorise-roadmap.html` (Phase 6 card). The text source of truth is `.planning/ROADMAP.md`.
> **Date:** 2026-06-23.

---

## How to read this doc

First read the **Shared foundation** below - it holds the locked model and the decisions that every sub-phase obeys, so they are written once, not repeated six times.

Then each sub-phase (6A to 6F) has the same four parts:

- **Information** - what the sub-phase is, in plain words.
- **Decision** - what is already locked, so you do not re-open it.
- **Problem** - the real challenge, and why the sub-phase exists.
- **Questions** - the open points you (Muskan) still need to decide.

---

## Shared foundation (applies to all of 6A-6F)

### The locked 4-layer model

The model was locked on 2026-06-22. It has four layers, and our scope starts at the Product Basket.

| Layer | What it is | Who owns it |
|---|---|---|
| **Product Card** | One product's full record - specs, batches, COA, legal docs, detail. | **Muskan builds it.** We only consume + snapshot it. |
| **Product Basket** | A reusable cart - a group of Product Cards. | Built shared, so Muskan's shop reuses the same piece. |
| **Deal Basket** | Product Basket + deal-level fields (delivery, terms, recipient, text/link cards). It is the permanent rename of the old "Deal Form". | Phase 6. |
| **Deal Card** | The final two-sided agreement. Unchanged. The output name stays "Deal Card". | Already built. |

**Level rule (decides where each field lives):**

- Product-related stuff (batches, COA, product detail) lives at the **product** level.
- Deal-wide stuff (text/link cards, delivery, terms, recipient) lives at the **deal** level.

### Carried-forward locked decisions (do NOT re-open these in 6A)

| Locked rule | What it means | Source |
|---|---|---|
| **Held two-sided change** | A shared edit does not change the live card. It waits in one `deal_pending_change` row (DB-unique, one active per deal). The proposer's own company auto-accepts; the other side Accepts or Declines (each with a required Change reason), or the proposer Withdraws. The card changes only when both accept. While a change is pending, the deal is fully locked for editing. | ADR-0001, DCHG-01/02/03 |
| **Private numbers are immediate, per-side** | The seller's COGS (cost) and the buyer's resale price save right away to that side only. They NEVER enter the shared pending change, because both sides read the strip. | ADR-0001, DCHG-07 |
| **Role-based views, no toggle** | The Basket is one object with two role views. The seller sees a Margin field; the buyer sees its own metric. Seller-view and buyer-view are the same object, just different perspectives. | DECISIONS.md |
| **Recipient rule** | Company is mandatory, person is optional. In a p2p chat the recipient is auto-resolved and locked. Elsewhere (Sella panel / shop) it becomes a select-then-lock dropdown. Only connected companies/people are selectable. | ADR-0003, BSKT-01 |
| **Basket is transient now (Option A)** | The Basket materialises into a Deal Card on send; nothing is persisted. Persisting a saveable/shareable Basket (Option B) is deferred until after Notifications. | ADR-0003 |
| **Output stays "Deal Card"** | We rename the form to "Deal Basket", but the thing the user receives is still a "Deal Card". | ROADMAP / board |

### Wave order (build sequence)

```
6A  ->  6B  ->  (6C + 6D)  ->  (6E + 6F)
```

- 6A runs first, alone (design only).
- 6B runs after 6A, alone (it touches the whole deal module).
- 6C and 6D can run in parallel after 6B.
- 6E and 6F can run in parallel after 6C.

### Deferred OUT of Phase 6 (not our job now)

- Persistent Basket (Option B) - after Notifications.
- Full Sella / Shop / C2C origins - Sella is Phase 7, Shop is Muskan, C2C is post-Phase 8.
- Document upload - Phase 9 (placeholder for now).
- Deep visual polish - Phase 10.

**Dropped:** DEV-37 (that is parked chat-organisation work, not deal-form work).

---

## Phase 6A - Deal Basket model (design)

### Information

This is a **design-only** sub-phase. There is no code. The output is **an ADR + fresh requirement IDs**. It runs first and alone. Its job is to lock the edit/sharing model before any build, so 6B has a clear model to wire.

### Decision (already settled, going in)

- The four carried-forward rules above are locked (held change, private-immediate, role-based no-toggle, recipient rule).
- Card display: fields **auto show when filled**, maybe **one small toggle**, and there is **no separate panel**.
- The level rule and recipient lock rules are basically set - 6A only confirms them.

### Problem

Today ADR-0001 lets **either** side propose any shared change. That is fine for a negotiation, but it does not say who **owns** each field. Before we build the form and wire its permissions in 6B, we must pick an ownership model, or 6B has nothing concrete to wire. We must also sort every field into "shared + held" vs "private + immediate", so the form knows which edits trigger a held change.

### The core open choice - Model B vs Model C

| | **Model B - seller owns the offer** | **Model C - role-based split** |
|---|---|---|
| Who edits the shared offer | The **seller** edits the whole offer (products, prices, quantity, delivery, terms). | Ownership splits by role: **seller** owns price / product / terms; **buyer** owns quantity / delivery. |
| The buyer's role | Buyer only **Accepts / Declines** through the held flow. | Each role edits its own fields directly. |
| Feel | Simpler - one author of the offer. | Richer - both sides shape their part. |
| Baseline today | ADR-0001 lets either side propose. Model B narrows authoring to the seller. | ADR-0001 lets either side propose. Model C narrows it to a per-field role split. |

This is the **first thing Muskan must decide.**

### Field-by-field starting proposal (to confirm in 6A)

This is a starting table, not a locked one. The "Who edits" column flips depending on Model B vs Model C.

| Field | Level | Shared + held, or Private + immediate | Who edits |
|---|---|---|---|
| Products (which products) | product / deal | Shared + held | B: seller · C: seller |
| Quantity | deal | Shared + held | B: seller · C: buyer |
| Shared price | product | Shared + held | B: seller · C: seller |
| Delivery | deal | Shared + held | B: seller · C: buyer |
| Terms | deal | Shared + held | B: seller · C: seller |
| Note (held note) | deal | Shared + held | open - confirm |
| Private price (COGS / resale) | product, per side | Private + immediate | each side, its own - always |
| Recipient (To) | deal | locked in p2p | set at create |
| Text / link cards | deal | open - likely shared + held | open (see 6E) |

### Questions for Muskan

1. **Model B or Model C?** This is the heart of 6A.
2. Confirm the field-by-field table above (shared/private + who edits).
3. Card display: confirm auto-show-when-filled + no separate panel. If there is one small toggle, what does it toggle?
4. Confirm the level rule and recipient lock rules (any change?).
5. The output is an ADR (next number is **ADR-0004**) + fresh req IDs - which prefix do the new reqs use (continue `BSKT-*`, or a new one)?

---

## Phase 6B - Rename + restructure

### Information

Rename "Deal Form" to "Deal Basket" everywhere, then wire the permission model that 6A decided. It runs after 6A, alone, because it touches the whole deal module.

### Decision

- The name **"Deal Basket" is permanent.**
- The output the user sees stays **"Deal Card".**
- Implement the edit/permission model chosen in 6A.

### Problem

The rename is mechanical but wide, and the real work is the permission wiring, which depends fully on 6A. Because it edits the shared deal files, it must run alone - no parallel work on the same files at the same time.

### Code surface (the real "~23 refs, 8 files")

The rename touches **23 references across 8 files** (verified 2026-06-23):

| File | Note |
|---|---|
| `src/modules/deals/types.ts` | types |
| `src/modules/deals/components/DealForm.tsx` | the form component itself |
| `src/modules/deals/components/CreateDealForm.tsx` | feeds the form empty (create) |
| `src/modules/deals/components/EditDealForm.tsx` | feeds the form the current card (edit) |
| `src/modules/deals/components/ConfirmBar.tsx` | submit bar |
| `src/modules/deals/components/DealPin.tsx` | the strip |
| `src/modules/deals/actions.ts` | server actions (create / edit / propose) |
| `src/modules/deals/lib/basket.ts` | **already named "basket"** - the basket payload helper |

Note: `lib/basket.ts` already exists, so the "Basket" idea is partly in the code. The held vs private split is wired through `actions.ts` (propose a held change) and `supabase/reads.ts` / `supabase/writes.ts`.

### Questions for Muskan

1. Confirm the rename scope above (23 refs / 8 files).
2. Do we also rename DB/table/RPC names that say "form", or keep them for migration safety?
3. Any route or public name that must stay the same for compatibility?

---

## Phase 6C - Product Basket

### Information

Build the reusable **Product Basket** cart - a group of Product Cards - wired to the p2p path. Build it as a **shared component so Muskan's shop reuses the same piece.** It also folds in the **OBS-2 pack-count finish**: custom off-catalogue lines, and showing the pack count on the card. Runs after 6B, in parallel with 6D.

### Decision

- It is a shared component (the shop reuses it).
- OBS-2 (pack-count) is folded in here.

### Problem

Because the shop will reuse it, the component's shape (its API/props) matters a lot - design it for two callers, not one. There is also a **known quirk to fix here:** today the product list reads **empty by default** (products only show when you type or search). 6C owns restoring the default product display.

### Questions for Muskan

1. What is the component API so both the Deal Basket and the shop can reuse it cleanly?
2. Where do the Product Cards come from - Muskan's Product Card source feeds this directly?
3. Confirm 6C fixes the "empty product list by default" quirk.

---

## Phase 6D - Recipient picker

### Information

Build the full recipient picker on the Deal Basket. For p2p and C2C it is **pre-filled and locked**. For Shop and Sella it is **select, then lock.** Only connected companies/people are selectable. Runs after 6B, in parallel with 6C. Based on ADR-0003.

### Decision

- Company mandatory, person optional (ADR-0003 / BSKT-01).
- p2p auto-locked; only connected companies/people selectable.

### Problem

Today only the **p2p auto-assign** exists. The dropdown, the connected-contacts read, and C2C routing are **future** (Sella = P7, Shop = Muskan, C2C = post-P8). So 6D can build the picker UI + the connected-contacts read for the p2p path now, but the Shop/Sella/C2C origins stay placeholders.

### Questions for Muskan

1. How much of the picker do we build now vs leave as a placeholder, given the origins are deferred?
2. Reuse `getMyConnections` (built in Phase 04B) for the connected-contacts read?

---

## Phase 6E - Deal-level content

### Information

Add non-product content at the **deal** level: plain **text cards** and **link cards** (a new line kind + a migration + a render path). Also **pre-sell non-catalogue (DEV-84)**: add a product that is not in your catalogue yet. Runs after 6C, in parallel with 6F.

### Decision

- Text/link cards live at the **deal** level (level rule).
- DEV-84 (pre-sell non-catalogue) is in scope here.

### Problem

A new line kind needs a DB migration plus a render path, and it must fit the held-change model cleanly. The open question is whether a text/link card is a shared+held thing or something lighter.

### Questions for Muskan

1. Are text/link cards shared + held, or private?
2. What is the migration shape for the new line kind?
3. DEV-84: how does a non-catalogue product work without a real Product Card behind it - a light stand-in snapshot?

---

## Phase 6F - Product detail (consume Muskan's Product Card)

### Information

A product line becomes **clickable** and opens **Muskan's Product Card** (terpenes, water activity, LOD, genetics, irradiation, origin). It reads the **deal-time snapshot, never live data.** It shows batches + COA per batch (COA file upload is a placeholder; the real upload is Phase 9). Runs after 6C, in parallel with 6E.

### Decision

- Read the **deal-time snapshot**, never live product data.
- COA upload is a placeholder (real upload = Phase 9).
- Consume Muskan's Product Card.

### Problem

This depends on the Product Card's data shape and on a snapshot mechanism. The good news after this handover: Muskan now owns **both** the Product Card and this consumer, so that seam is internal to her work - no cross-engineer contract to negotiate.

### Questions for Muskan

1. The Product Card data shape + the snapshot mechanism (you own both now).
2. Which fields get snapshot at deal time vs read live?

---

## Where we both stand + coordination notes

- **No Phase 6 code is built.** The 6A talk started but no `06A-CONTEXT.md` was written. Muskan starts 6A fresh from this doc.
- **Ownership:** Phase 6 is now Muskan's (branch `claude/muskan/work`). Ayush keeps the rest of his queue.
- **Migration timestamp clash (RESOLVED 2026-06-22):** Ayush's `20260622090000_thing_artifact_visibility.sql` once shared its number with Muskan's join-request migration. Muskan already renamed hers to **`20260622091500_phase12_join_request_rpcs.sql`** (her session 39), and the interleaved `supabase db reset` is green. Nothing owed on either side.
- **Cloud migrations pending:** a batch of deal-domain migrations still await a deliberate human `supabase db push` (coordinate; `avatars_*` policy reconcile first). See `docs/deploy/cloud-migrations-pending.md`.

---

## Canonical references (full paths)

| Ref | Path | Why |
|---|---|---|
| Roadmap (truth) | `.planning/ROADMAP.md` (Phase 6 section) | The text source of truth. |
| Sprint 2 board | `_workshop/build-plans/2026-06-19-recategorise-roadmap.html` | This doc's per-sub-phase source. |
| Held change | `docs/architecture/adr/0001-held-deal-change.md` | The held two-sided change mechanic. |
| Card data model | `docs/architecture/adr/0002-deal-card-data-model.md` | The Deal Card shape. |
| Deal Basket form | `docs/architecture/adr/0003-deal-basket-reusable-form.md` | The reusable Basket + recipient + Option A/B. |
| Decisions log | `docs/decisions/DECISIONS.md` | Role-based views, basket, recipient, margin. |
| Domain glossary | `docs/architecture/CONTEXT.md` | Definitions of all the terms below. |
| Requirements | `.planning/REQUIREMENTS.md` | BSKT-01, DCHG-01..07; DEV-84, OBS-2 ids. |
| Deal module code | `src/modules/deals/` | The code 6B renames and 6A's model governs. |
| Prototypes | `prototypes/` and `_workshop/*-prototype/` | See-first UI variations (Ayush's prototype workflow). |

### Quick domain glossary

- **Deal Card** - the core two-sided deal object; the final agreement.
- **Deal Basket** - the reusable "deal-in-assembly" (one model + form holding products, quantities, prices, delivery, terms, per-side private price, Note, and a recipient). The permanent rename of "Deal Form".
- **Product Basket** - a reusable cart of Product Cards (Muskan's shop reuses it).
- **Recipient / assignee (To)** - who a Basket is addressed to; company mandatory, person optional.
- **Card margin** - per-product, per-side, private percentage; owner-only, never shown to the other side.
- **Private price (per side)** - the seller's cost (COGS) or the buyer's resale price; owner-only, immediate.
- **COGS** - cost of goods sold; the seller's private per-product cost.
- **Held change** - a shared edit that waits in `deal_pending_change` for both sides to accept.
- **PO / SO card** - the two faces of one Deal Card by author: PO = purchase order (buyer initiated), SO = sales order (seller initiated).

### A note on how Ayush works (handy for the UI slices)

For UI-heavy slices (the 6A card display, the 6F product detail), Ayush decides by **seeing**: build throwaway HTML variations in a `prototypes/<name>-prototype/` folder, pick one, then port it into the real shell. Muskan can keep her own style, but this is why the prototypes folder exists.
