# Build Plan - 3a: Deal Card (screen ①)

> First atom of the Deal surface (Unit 3): **① Deal card → ② Workspace (3b) → ③ Stages+Things (3c) → ④ Confirm gate (3d)**.
> Connect (2a-2e) is done + real. 3a builds the **card itself** - the thing a conversation becomes.
> One of the three **L long-poles** (with 2c chat, done, and 4c Sella draft).

---

## 2026-06-10 11:18 CEST - DRAFT → **LOCKED by Ayush** (2026-06-10; all 5 §6 decisions agreed; Phase 0 go given).

### Build log

- **Phase 0 DONE** (2026-06-10) - `src/modules/deals/` scaffolded: `types.ts` (raw rows bound to
  `database.types.ts` for `deal_card`/`deal_line_item`/`deal_card_log`; seeded unions verified against
  `…090001_lookups_and_seeds.sql`: `DealType` offer/order · `DealCardStatus` draft/withdrawn/confirmed/amended/
  done/cancelled · `LogAuthor` person/system/sella · `ChangeOrigin` p2p/deal_chat/system; UI projections
  LineItemView/PartyFieldView/LogEntry/SignalView/DealCardView) + pure `lib/derive.ts` (docTerm/docAbbr/
  sellerCompanyId/buyerCompanyId/viewerSide/computeGross/formatMoney/lineTotalOf) + barrel `index.ts`. No test
  runner installed → verified via `tsc --noEmit` (exit 0) + eslint (clean). **Refinement found:** the PO/SO label
  derives from `deal_type` ALONE (who issued it), not the viewer - viewer side only picks the private field. No UI
  yet.
- **Phase 1 DONE** (2026-06-10 ~11:50 CEST) - the private-fields table, applied live + privacy proven in SQL.
  Sync ritual run first (fetched, rebased onto origin/dev picking up main→dev #78, cross-read Muskan = idle/no
  locks, locked live-DB in sync, pushed sync alone). **New migration** `20260610130000_deal_party_field.sql`
  (written + applied via MCP): table `deal_party_field` (one row per card·version·side·field) + RLS
  `partyfield_owner_only` (USING `owner_company_id = current_company_id()`; WITH CHECK owner + `card_relationship_
  member`) + unique key `(deal_card_id, version, owner_company_id, field_key)` + read index + idempotent seed
  (seller `margin` 4.000 € + buyer `buyer_metric` placeholder on all 4 demo-world cards, seller/buyer derived
  from `deal_type`). **ADDITIVE only** - no existing table/RLS touched. **Privacy proven via JWT impersonation in
  SQL:** Alice (seller) sees 4 rows all seller, value `4.000 €`, 0 buyer; Bob (buyer) sees 4 rows all buyer,
  `placeholder`, 0 seller; 8 rows total, each side owns 4. Regenerated `database.types.ts` (surgical insert of the
  `deal_party_field` block, alphabetical, matches generator format) + bound `DealPartyFieldRow`. `tsc` + eslint clean.
- **Phase 2 + 3 DONE** (2026-06-10 ~12:20 CEST) - the read + the card FRONT, verified live BOTH sides, no console
  errors. Aligned with dev first (merged #79, rebased, picked up Muskan's back-to-shop). **Prototype↔DB mismatch
  resolved:** `deal_line_item` has no cultivar/pzn/image columns → those are **snapshotted into `metadata`** per
  line (PRD immutability); read maps them to `LineItemView`. **`line_total` is a GENERATED column** (qty×price) -
  must not be inserted (hit + fixed). **New demo seed** `20260610140000_seed_demo_deal_lines.sql` (applied): 6
  snapshot line items (Northern Lights…Gelato, cultivar/pzn/dominance in metadata) on the confirmed demo card
  `04695a2d` + `value_net=26550`; idempotent (delete-by-tag), guarded if card absent. **Phase 2** `supabase/
  reads.ts: getDealCard(id)` - card + current-version lines + my-side party fields (RLS) + version log (+person
  names) + derived seller/buyer + viewerSide; signals `[]` (Phase 4). **Phase 3** components (real design system,
  brand/brand-soft/ink, lucide): `CardFront` (HS band → derived doc term + date → two logo boxes w/ "you" →
  value net + computed gross + my private field "only you" → Delivery → Products count), `ProductList`
  (scrollable rows, dominance-tinted Leaf thumbnail, name/price + cultivar·vol·PZN, "2000 g"→"2.0 kg"), `DealCard`
  (front-only wrapper; flip+back = Phase 4). Temp proof route `app/connect/deal-proof/page.tsx` (REMOVE in Phase
  5). **Verified live:** as **Bob (buyer)** → "Sales Order", net 26.550 €, gross 31.594,5 €, 6 products, private
  field = **"Buyer metric placeholder"** (NOT margin); as **Alice (seller)** same card but private field =
  **"Margin 4.000 € · only you"** (NOT buyer metric). Naming collision fixed (component `DealCard` vs row type -
  dropped the raw type from the barrel). `tsc` + eslint clean, no console errors either side.
- **Phase 4 DONE** (2026-06-10 ~12:45 CEST) - the card BACK (flip + two tabs), verified live. `DealCard` now a
  client component with a **CSS 3D flip** (inline `rotateY` + `backfaceVisibility`, no Tailwind 3D plugin): front
  defines the box, back fills it (`absolute inset-0` rotated 180°); flip control top-left stays upright above the
  faces. `CardBack` (client) = the **two-tab switch** (Signals · Logs), Signals default. **Signals tab** = seeded
  per-side advisory (`lib/signals.ts` - seller: margin-healthy/near-expiry/repeat-buyer · buyer: priced-below/
  low-stock/reliable-delivery; mapped to lucide; read now populates `signals` from `seededSignals(viewerSide)`;
  Sella writes real ones in 4d) + "advisory, not the truth" footer. **Logs tab** = REAL `deal_card_log` history.
  **New demo seed** `20260610160000_seed_demo_deal_log.sql` (applied): 2 log rows on the confirmed card (v1 "Sella
  drafted…" sella/deal_chat; v1 "Quantities and price agreed - 26.550 €…" person/p2p, Alice), idempotent, guarded.
  **Verified live as Alice (seller):** flip → back; Signals tab "Sella's read - seller view" shows the 3 seller
  signals; Logs tab shows both entries (v1 badges, dates, Sella + Alice Green actors). Fixed a React-compiler lint
  (component defined in render → hoisted the tab list). `tsc` + eslint clean, no console errors. *(Buyer-side
  signals use the same `viewerSide` path already proven both sides in Phase 3.)*
- **Opacity fix + Phase 8 DONE** (2026-06-10 ~13:40 CEST) - **Opacity:** card surface + all field/box/tab
  surfaces were translucent (`/40`, `/80`) so the chat bled through (Ayush flagged) → made solid (`bg-[#ffe2ee]`
  card, `bg-white` boxes) + `shadow-xl ring`. **Phase 8 (verify read side, both sides, live):** as **Alice
  (seller)** - front Margin 4.000 €, back seller signals + 2 real logs, card floats opaque in chat; as **Bob
  (buyer)** - front **Buyer metric (no Margin)**, "Sales Order" (same label), back **buyer** signals (no seller
  ones), card in chat. No console errors either side. `tsc` + eslint clean. Login note: React controlled inputs
  need a native value-setter + input event for `preview_fill` to register (plain fill left state empty).

---

## ✅ 3a (READ side) COMPLETE - 2026-06-10. Phases 0-5 + 8 done, verified live BOTH sides, no console errors. Write side (6+7) → section 3.5.

---

## ⭐ SCOPE CHANGE - 2026-06-10 (Ayush) - 3a = the card's READ side only

**Decision:** 3a covers the **reading half** of the deal card (show it, flip it, place it in chat). The
**writing half** - **Phase 6 (create a draft)** and **Phase 7 (edit → version bump)** - is **PULLED OUT of 3a**
into a **new section, "3.5 - Deal creation & editing"**, placed **between the deal machinery (3b-3d) and Sella
(4)**. It may end up **folded into section 4 (Sella)**, because a deal is born from Sella as much as by hand -
decide when we get there.

**Why:** creating a deal is its own concern with **three entry points** - the seller's shop, the chat, and a
person's own Sella. That is too big to be "Phase 6 of the card," and editing (Phase 7) is just "write the next
version," so it belongs with create. Splitting the writes across 3a would scatter the rules. We have a **seeded
card** (04695a2d) to build + test 3b-3d on, so we do NOT need creation to continue.

**THE RULE for the creation section (do not forget): ONE CORE, THREE DOORS.** Build one `createDeal(...)` core
(products, quantities, prices, the two companies → writes the draft + lines + log + chat line). The shop button,
the chat "+" button, and the Sella action all call that **same** core. Never implement creation three times.

**Fuzzy bits to resolve THEN (not now):**
- "To whom you send" only matters for **shop-initiated** creation; in the chat the counterparty is already known.
- **Buyer-initiated** (order) picks products from the **seller's** catalog (counterparty's shop), not own.
- Seller Margin / buyer metric on a manual draft = **optional** (type or skip), private via `deal_party_field`.
- Products come from the **catalog** (Muskan's `product`, option A: a small "New deal" form). Form fields:
  product · quantity · price · (shop only) to-whom.
- Create = **card only** (card + lines + log + chat line); the full workspace is **3b**.

**Settled answers (Ayush, this session):** form-first (option A) · products from catalog · both sides can create ·
margin/metric optional · card-only. Version DISPLAY (Logs tab) is already DONE in Phase 4 - only the version-WRITE moves.
- **Phase 5 DONE** (2026-06-10 ~13:10 CEST) - the card placed IN the chat, verified live. New `DealPin` (client,
  in deals) wraps the message stream: renders the **"Talking about: Current deal"** bar (single deal - selector
  inert, multi-deal = DEV-37 deferred per Ayush) + an **open/close** HS button, and floats the `DealCard` on the
  **RIGHT** of the stream when open (prototype placement); Sella stays in panel 5. Self-contained: `reads.ts:
  getCurrentDealCardId(relationshipId)` (prefer most-recent LIVE deal - draft/confirmed/amended - else most
  recent) → `getDealCard`. `messaging/ThreadView` mounts `<DealPin key={relationshipId} relationshipId=…>` around
  the stream (one-way messaging→deals dep, acyclic). **Temp proof route removed.** Fixed a cascading-render lint
  (dropped synchronous `setData(null)` - DealPin is keyed by relationshipId so it remounts fresh per relationship).
  **Verified live as Alice @1440px:** chat → "Talking about" bar → open → card floats right (Sales Order, net
  26.550 €, **Margin 4.000 €** seller-side, 6 products), Sella panel intact; no console errors; `tsc` + my files
  eslint clean. *(Pre-existing lint in `messaging/lib/use-chat-realtime.ts` (latest-ref pattern, from 2d, already
  shipped) - not touched, flagged separately.)*

---

> Sources reconciled for this plan: prototype `prototypes/dealcard-prototype/` (index.html + NOTES.md, locked
> 2026-06-06), PRD `docs/PRD/deal-flow.md` (Block 4 + 5), `docs/PRD/connect-demo.md` (acceptance script),
> and the **live** schema on `byipusuthdlskdxoexkt` (verified column-by-column 2026-06-10). Where the prototype
> and the live DB disagreed, the **live DB wins** - those corrections are recorded in §1.

---

## Process for 3a (same as every unit)

1. Write this plan. **Lock it with Ayush** before any code (the §6 decisions especially).
2. Build phase by phase, in order. Verify each phase in Claude Preview, no console errors, `tsc` + eslint clean.
3. Keep the UI behind the module barrel (`deals/index.ts`), exactly like messaging / relationship.
4. Wrap: update sync file, this build log, and CLAUDE.md Last-session / What's-next.

---

## 0. What 3a is (and is NOT)

**3a IS:** the **Deal Card** built for real - one card entity that shows as a **Purchase Order** or a **Sales
Order** depending on who is looking, lives **inside the chat** (pinned box + "Talking about" selector), has a
**front** (the deal facts: two-logo header, net/gross value, delivery, the scrollable line-item product list)
and a **back** (a two-tab panel: **Signals** + **Logs**). It starts in **Draft**, supports **versioned
snapshots** (old versions stay readable), and serves **role-scoped private fields** (seller Margin, buyer
placeholder) where each side never receives the other side's number. It reads/writes the **already-migrated**
deal tables on real Supabase, plus **one new small table** for the private fields (§6 D-MARGIN).

**3a is NOT:** the Deal Workspace screen ④ (that is 3b - members, container, the full-screen workspace route),
the stage pipeline + Things (3c), the two-sided confirm gate (3d), or Sella actually drafting the card from chat
(that is 4b/4c). 3a builds the card and a **manual** "create draft" path so the card is genuinely live without
waiting on Sella. The **Signals content** is Sella's job (4d) - in 3a the Signals tab shows **seeded** signals;
the **Logs tab is fully real** (reads `deal_card_log`).

**The look is already decided.** The prototype (`prototypes/dealcard-prototype/`, locked 2026-06-06) fixes the
card design - front layout, back, flip, line-item rows, role views, PO/SO derivation. 3a is mostly "port the
locked prototype into the real React app + real data," not "decide what it looks like."

---

## 1. Prototype ⇄ live DB reconciliation (READ THIS - it prevents build-time surprises)

The prototype was a paper sketch made **before** the DB existed. Five names/ideas differ from the live schema.
**The live DB wins.** These are settled (discussed + agreed with Ayush 2026-06-10):

| # | Prototype said | Live DB reality | What 3a does | Major? |
|---|---|---|---|---|
| 1 | `doc_type` = `purchase_order`/`sales_order` | column is **`deal_type`** (`offer`/`order`) + **`initiating_company_id`** | **Derive** PO/SO at render: seller-initiated → buyer sees SO, seller sees the deal; buyer-initiated → seller sees PO. No stored doc_type, no new column. | minor |
| 2 | `value_net` + `value_gross` on card | only **`value_net`** stored | **Compute** gross in UI (net + VAT). No new column. | minor |
| 3 | separate `deal_card_version` table | none. Versioning = `deal_card.version` (current) + `deal_line_item.version` (per-version snapshots) + **`deal_card_log`** (history) | Logs tab reads **`deal_card_log`**; a new version **copies** line-item rows, never overwrites. | minor |
| 4 | back of card = SIGNALS only | PRD FR-D5 says back = the **log** | back = **two tabs** (VS Code-style switch): **Signals** (seeded now, Sella later) + **Logs** (real now). | minor |
| 5 | `margin` is a card/line field, seller-only | **no margin column anywhere** | **New small table** `deal_party_field` - one row per private field, per side, per version, RLS-scoped to the owning company (§6 D-MARGIN). Seed margin (seller) + placeholder (buyer). | **MAJOR** |

★ Why #1, #2, #3 are "derive, don't store": a value you can calculate from existing facts must have **one source
of truth**. Storing `doc_type`/`gross`/a versions-row alongside the facts that produce them lets the two drift
and lie. Deriving keeps the card honest.

---

## 2. What is already done (the foundation 3a rides on) - VERIFIED on live `byipusuthdlskdxoexkt`

This is why 3a is mostly UI + one tiny migration. Almost the whole deal backend already exists.

| Thing | State | Notes |
|---|---|---|
| `deal_card` | **migrated** | `relationship_id`, `thread_id`, `version` (int, def 1), `status` (def `draft`), `deal_type`, `initiating_company_id`, `value_net`, `currency` (EUR), `delivery_date_target`, `buyer_po_number`/`seller_so_number`/`hs_deal_number`, `metadata` jsonb, audit cols |
| `deal_line_item` | **migrated** | `deal_card_id`, **`version`**, `product_id?`, `product_name`, `quantity`, `unit`, `unit_price`, `currency`, `line_total?`, `thc_percent?`, `cbd_percent?`, `sort_order`, `metadata` |
| `deal_card_log` | **migrated** | `deal_card_id`, `version`, `change_summary`, **`origin`**, `changed_by_person_id?`, `changed_by` - the history the Logs tab reads + the `deal_card_updated` chat projection (FR-M5) |
| `deal_confirmation` | **migrated** | two-sided gate - 3a does **not** use it (that is 3d) |
| `deal_workspace` / `deal_member` / `thing` / `deal_artifact` | **migrated** | the workspace + stages live - 3a does **not** build them (3b-3d) |
| `deal_stage` lookup | **seeded** (5 rows) | `negotiation → compliance_quality → agreement → payment → fulfilment_delivery` (3c uses these) |
| **Seeded historical deals** | **live** | 2e seeded 4 `deal_card`s on the Alice↔Bob relationship, tagged `metadata.seed='demo-world'` (`offer`, backdated, confirmed/done/done/cancelled). **3a reuses these** as past history; the live demo deal is drafted on top. |
| RLS on all deal tables | **already correct** | side-aware projection enforced in DB (same spine as Connect) |
| `current_company_id()` helper | exists | used by every RLS policy; reused by the new private-fields table |

**The one thing the DB is missing:** a home for role-scoped private fields (margin etc.). 3a adds it (§6 D-MARGIN).

---

## 3. What 3a adds (mapped to phases)

| Gap | Plain words | Phase |
|---|---|---|
| **Module + types** | `deals/` module scaffold, types bound to `database.types.ts`, PO/SO + gross derivation helpers | Phase 0 |
| **Private-fields table** | one migration: `deal_party_field` + RLS + seed (margin + buyer placeholder) | Phase 1 |
| **Reads** | one card + its line items (current version) + log + my-side private fields, RLS-scoped | Phase 2 |
| **Card front** | two-logo header, HS number, doc term (derived), net/gross, delivery, line-item list w/ thumbnails, my private field | Phase 3 |
| **Card back** | flip + the two-tab panel: Signals (seeded) + Logs (real, from `deal_card_log`) | Phase 4 |
| **In-chat placement** | pinned deal box + "Talking about: [deal]" selector in `ThreadView`; card opens inline; Sella stays in right panel | Phase 5 |
| **Draft write** | ~~manual "create draft" path~~ → **MOVED to section 3.5 (Deal creation & editing)**, see SCOPE CHANGE above | ~~Phase 6~~ → 3.5 |
| **Version bump** | ~~edit a draft → v2 (snapshot copy, log, broadcast)~~ → **MOVED to section 3.5** (editing = "write the next version") | ~~Phase 7~~ → 3.5 |
| **Verify the read side** | end-to-end walk of the built read side both sides (PO/SO label, privacy, flip, tabs, in-chat) on the seeded card | Phase 8 |

---

## 4. Design language - port elements, not pixels (LOCKED rule, same as 2e)

Prototype is rough (Tailwind CDN, raw `pink-600`/`slate`, emoji). The real app has the finished system.
**Take the elements + layout from the prototype; take the styling from the real React app.**

| Prototype (rough) | Real app (use this) | Seen in |
|---|---|---|
| `bg-[#f7bdd0]` / raw `pink-600` card | brand tokens (`glass`, `text-ink`, brand pink token) | messaging/relationship components |
| emoji icons (⇆ 🔒 🌿 ✦) | **lucide-react** (`RefreshCw`/`FlipHorizontal`, `Lock`, `Sparkles`, `FileText`) | `ThreadView` already uses lucide |
| `cdn.tailwindcss.com` | project Tailwind + tokens | global |
| the bottom **DEMO bar** (View/State/Card type/Held-by toggles) | **drop it** - it was a prototype device; the real card derives everything from login + data | - |

**Keep from the prototype exactly:** the front layout (HS-number band → doc-term line → two logo boxes → field
rows → scrollable products), the **flip** (top-left control), the back as a **switchable panel**, the line-item
**row** shape (square thumbnail + name/price + cultivar·vol·PZN), and the **role-derived** views (no toggle -
the app serves each login its own side; the other side's private field never arrives).

---

## 5. Module shape (mirror messaging / relationship exactly)

New module `src/modules/deals/` (currently an empty `.gitkeep`), same skeleton:

```
src/modules/deals/
  index.ts                      barrel - the ONLY public surface
  types.ts                      raw rows bound to database.types.ts + UI projections:
                                  DealCardView, LineItemView, LogEntry, PartyFieldView, SignalView
  lib/
    derive.ts                   PURE + testable: docTerm(viewerCompanyId, card) → 'Purchase Order'|'Sales Order',
                                  computeGross(net, vatRate), sellerCompanyId(card), formatMoney
  supabase/
    reads.ts                    getDealCard(id) → card + current-version line items + log + my-side party fields
    writes.ts                   createDraft(...), bumpVersion(...)  (snapshot copy; log + chat projection + audit)
  components/
    DealCard.tsx                the flip container (front + back), the one stateful piece
    CardFront.tsx               header + fields + ProductList
    ProductList.tsx             scrollable line-item rows (thumbnail not clickable yet)
    CardBack.tsx                two-tab panel host
    SignalsTab.tsx              seeded signals (Sella content lands in 4d)
    LogsTab.tsx                 version history from deal_card_log
    DealPin.tsx                 the in-chat pinned box + "Talking about" selector (single deal, v1)
```

Card lives **inside the chat** → no new route in 3a (the workspace route comes in 3b). `DealPin` mounts in
`messaging/components/ThreadView.tsx`; the card opens inline in the thread, Sella stays in the right panel
(`SellaPanel.tsx`), exactly like the prototype's chat view.

**Data-access pattern = the 2d/2e pattern, copied:** flat RLS-scoped fetches via the browser client, viewer
from `auth.getUser()`, stitched in JS. No new RPC needed for reads. `lib/derive.ts` stays pure (no Supabase/React)
so it is unit-testable and the prototype's PO/SO + money math ports cleanly.

---

## 6. Decisions - locked with Ayush 2026-06-10 (the §1 discussion)

**D-PO/SO - PO/SO label is derived, not stored. → LOCKED.** Render-time from `initiating_company_id` + the
viewer's company + `deal_type`. No column, no table. One source of truth.

**D-GROSS - gross is computed, not stored. → LOCKED.** `value_gross = value_net × (1 + vatRate)` in `derive.ts`.
Demo VAT rate as a single constant (DE 19%); net is the stored truth.

**D-VERSION - history is `deal_card_log`, snapshots are versioned line items. → LOCKED.** No `deal_card_version`
table. A new version **copies** line-item rows (immutable history for a regulated industry); the card row carries
the current `version`; each change writes a `deal_card_log` row. *(Caveat noted: the card's own scalar fields
(net, delivery) live on the single mutable row, so a full historical scalar reconstruction is not stored beyond
the log's `change_summary`. Acceptable for the demo; the line items - the regulated part - are fully snapshotted.
Tracked as a post-demo doubt if full scalar history is ever required.)*

**D-BACK - back of card = two tabs (Signals + Logs). → LOCKED.** Flip (top-left) reveals a switchable panel.
**Logs** is fully real now (`deal_card_log`). **Signals** shows **seeded** per-side signals now; real Sella-written
signals arrive in 4d. Signals are advisory; the front facts are the agreed truth.

**D-MARGIN - role-scoped private fields get a new small table (Option C). → LOCKED (Ayush, 2026-06-10).**
The DB has no home for the seller Margin / buyer placeholder, and **many** seller-only and buyer-only fields are
coming once Sell/Buy pages are designed. So instead of fixed columns, add **one extensible, RLS-scoped table**:

```sql
-- migration: 2026…_deal_party_field.sql  (one file: table + RLS + seed)
create table public.deal_party_field (
  id                uuid primary key default gen_random_uuid(),
  deal_card_id      uuid not null references public.deal_card(id) on delete cascade,
  version           integer not null,                 -- snapshot per card version, like line items
  owner_company_id  uuid not null references public.company(id),  -- THE privacy key
  party_side        varchar not null,                 -- 'seller' | 'buyer'  (display/placement label)
  field_key         varchar not null,                 -- 'margin', 'buyer_metric', …
  field_label       varchar not null,                 -- 'Margin'
  value_text        text,                             -- flexible: '4.000 €', '17%', placeholder
  sort_order        smallint not null default 0,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);
-- RLS: you ONLY ever see your own company's rows. The other side's number never reaches your app.
alter table public.deal_party_field enable row level security;
create policy deal_party_field_owner_only on public.deal_party_field
  for all using (owner_company_id = current_company_id())
  with check (owner_company_id = current_company_id());
```

Why this shape: **rows not columns** = adding the 2nd/3rd/10th private field later is a row insert, never a DB
change. `owner_company_id = current_company_id()` is the **same privacy spine** as `relationship_note` - simple
and bulletproof: there is no path for the buyer's app to receive the seller's row. The table is **isolated**
(only hangs off `deal_card`), so if the Sell/Buy design later teaches a better shape, we drop it with zero
blast radius. **RLS goes in with the table from minute one** - privacy is the one thing that cannot be added
later. Seed: one seller `margin` row + one buyer placeholder row on the demo card.

---

## 7. Phases & tasks (run AFTER Ayush locks)

### Phase 0 - Module scaffold + pure derivation
Create `deals/` skeleton, `types.ts` (bound to `database.types.ts`), empty barrel, and `lib/derive.ts`
(docTerm / computeGross / sellerCompanyId / formatMoney). **Unit-test `derive.ts`** if a runner exists; else
verify via live data. `tsc` clean. No UI yet.

### Phase 1 - The private-fields table (the one migration)
Write + apply `2026…_deal_party_field.sql` (table + RLS + seed). **Muskan flag:** ADDS one table + its policy
only; no existing public-schema RLS altered. Regenerate `database.types.ts`. Verify privacy directly in SQL
(as each company, you see only your own rows).

### Phase 2 - Reads (the data spine)
`reads.ts: getDealCard(id)` → the card + **current-version** line items (ordered by `sort_order`) + the
`deal_card_log` history + **my-side** `deal_party_field` rows (RLS does the side filter). Viewer from session.

### Phase 3 - Card front
`CardFront` + `ProductList`: HS-number band, **derived** doc term, two logo boxes (seller/buyer from the
relationship), net + **computed** gross, delivery, the scrollable product rows (thumbnail + name/price +
cultivar·vol·PZN), and **my** private field (seller sees Margin; buyer sees the placeholder - because RLS only
returned my row). Real app styling (glass/ink/lucide). Verify in Preview as both logins.

### Phase 4 - Card back (flip + two tabs)
`DealCard` flip container + `CardBack` host. **Logs tab** = real version history from `deal_card_log` (version,
summary, actor person/Sella, origin). **Signals tab** = seeded per-side signals (`SignalView`), with the
"advisory, not the truth" footer. Flip control top-left. Verify flip + tab switch, both sides.

### Phase 5 - In-chat placement
`DealPin` (pinned box: HS number + open/close) + the "Talking about: [current deal]" selector, mounted in
`ThreadView`. Card opens **inline** in the thread (not a route); Sella stays in `SellaPanel`. Single deal per
thread for v1 (multi-deal selector = DEV-37, deferred). Verify the card opens/closes in a real chat.

### Phase 6 - Draft write (manual create path) → **MOVED to section 3.5** (see SCOPE CHANGE)
*Not built in 3a.* The `createDraft(...)` write (insert `deal_card` draft + v1 line items + `deal_card_log` v1 +
chat line + audit) becomes the core of the **Deal creation & editing** section, called by all three doors
(shop · chat "+" · Sella). The card-only scope (no workspace) still holds.

### Phase 7 - Version bump → **MOVED to section 3.5** (see SCOPE CHANGE)
*Not built in 3a.* `bumpVersion(...)` (snapshot-copy line items at the new version, log v2, FR-M5 broadcast) is
the **edit** half of the same write core - "write the next version." Lives with create in 3.5. NOTE: the version
**DISPLAY** (Logs tab) is already DONE in Phase 4; only the version **WRITE** moves.

### Phase 8 - Verify the read side, both sides (the testing we DO close here)
On the seeded card (`04695a2d`, already enriched with 6 lines + margin/metric + 2 log rows): walk both sides as
Alice + Bob - the card shows the right **doc term**; the **seller sees Margin, the buyer sees the placeholder and
never receives the margin** (privacy money shot); the card **opens in the chat** (Talking-about bar → floats
right, opaque); **flip** → back; **Signals** per-side + **Logs** real. No console errors, `tsc` + eslint clean.
*(Create/edit/version-write are verified later, in section 3.5.)*

---

## 8. Done when (3a acceptance) - PRD FR-D1, FR-D3 (partial), FR-D4, FR-D5; SR-2 manual stand-in

- A **Draft** deal card exists inside the chat, carrying line items + a net value (+ computed gross) pulled from
  the conversation; it opens from a pinned box + selector, Sella stays in the right panel.
- The card shows as a **Purchase Order** or **Sales Order** correctly **per viewer** (derived), and the
  **seller's Margin never reaches the buyer's app** (verified by logging in as the counterparty - RLS proof).
- The card **flips**; the back has **Signals** (seeded) + **Logs** (real `deal_card_log`).
- A change **bumps a version**; the previous version's line items stay **readable**; the change is logged and
  (per FR-M5) broadcast into the deal thread only when it originated outside it.
- Built in the real app's design language (glass/ink/lucide), no DEMO bar, no console errors, `tsc` + eslint
  clean. One new table (`deal_party_field`) + its RLS; no other RLS touched.

---

## 9. Deliberately deferred (NOT 3a)

- Deal **Workspace** screen ④ (3b): members, container, the full-screen route, "Open workspace →" target.
- **Stage pipeline + Things** (3c) - the seeded `deal_stage` lookup is read in 3c, not 3a.
- Two-sided **confirm gate** + `Draft → Confirmed` flip + withdraw (3d / FR-D2, FR-D6).
- **Sella** detecting + drafting the card from live chat (4b/4c) - 3a has a **manual** draft path; the live
  Sella moment lands in Unit 4.
- **Real Signals content** - seeded in 3a; Sella-written in 4d (SR-3).
- **Clickable product thumbnail** → product card (future), and the **multi-deal** selector in one thread (DEV-37).
- PO/SO/HS deal numbers generated at confirmation (stretch, not the spine).

---

## 10. Open risks / things to confirm during build

- `deal_party_field` needs `current_company_id()` to resolve for the logged-in user on every read - confirm the
  helper is in scope for the new table's RLS (it is used by every existing policy).
- Touching `ThreadView` to mount `DealPin` is additive, but `ThreadView` is shared with 2c-2e - confirm no
  regression to chat/realtime (`tsc` + a live chat smoke test).
- The "current version" line-item read must filter by `deal_card.version` so the front never mixes versions -
  verify after the first `bumpVersion`.
- `database.types.ts` must be regenerated after Phase 1 so the new table is typed before reads/writes use it.
- Keep `lib/derive.ts` pure (no Supabase import) so PO/SO + money math is testable and ports from the prototype.
