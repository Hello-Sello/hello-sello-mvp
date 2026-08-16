# Catalogue Ingestion — Design (DESIGNED · PARKED · build post-demo)

> **Status:** Designed 2026-07-03. **NOT built.** Parked so the 8 Jul demo can ship a
> **visual Present redesign** that Marcel populates **manually**. This document is the
> record of the design so it isn't lost; build it as its own phase after the visual lands.
>
> **Companion decision:** `docs/decisions/DECISIONS.md` → 2026-07-03 entry.
> **Source:** design session with Muskan + two deep-research passes (3PL/ERP feeds; B2B
> catalogue onboarding) + Marcel's shared-Sheet idea and his updated "Product list" sheet.

---

## 1. The problem

A verified seller needs to get their catalogue into their Hello Sello shop and keep it
current — products, their images, batches (which arrive continuously), a standard price
list, and later per-customer prices. Manual entry works for the demo, but the committed
end-state is **ERP integration**. The design goal: build the foundation today so that
manual entry → CSV/Sheet → ERP API is **one pipeline widened over time, never a rebuild**.

## 2. Core data model — four objects, kept separate, linked by keys

The four things change at **different speeds** and are owned by **different realities**, so
they are separate tables/uploads, linked — never glued into one row.

| Object | Meaning | Changes | Owner |
|---|---|---|---|
| **Product** | "what we sell" — catalogue identity | rarely | seller's master catalogue |
| **Batch / Lot** | "what's physically in stock now" — lab-tested per lot | constantly | warehouse / logistics / lab |
| **Standard price** | "our list price" (one company-wide) | occasionally | commercial team |
| **Per-customer price** | "what THIS customer pays" (override) | per relationship | sales rep |

**Why separate:** gluing them means every batch update forces a full re-import, and an ERP
(which feeds batches independently — SAP B1 exposes `Items` and `BatchNumbers` as separate
endpoints) would have nowhere to plug in. Separate tables = cheap daily updates + ERP as a
plug-in. This also matches Marcel's own spreadsheet, which keeps Products / Batches /
Pricelist as three separate tabs.

### Keys — the crucial distinction

- **Match key = the seller's own `supplier_product_code`.** It is **NOT an industry
  standard** — it means something only inside one seller's catalogue (`CC_001` = Canadian
  Craft's label). It only has to be **unique within that one company**. Used to recognise
  "same product / same batch" on re-import.
- **Real link = a hidden system `UUID`** we generate per product. Invisible to the seller,
  never changes. Batches and prices point to *this*, so a seller renaming their code does
  not orphan the product's batches/history.
- **Real external standards stored alongside (optional):** `PZN` (the authoritative German
  pharma identifier, IFA-issued) and `GTIN` (global barcode). Kept for the day an ERP or
  buyer speaks them.
- **Each linked table carries its own key** (research: commercetools requires a key on every
  embedded object). Product = `supplier_code`; Batch = `supplier_code + batch_number`;
  Per-customer price = `customer + supplier_code`.

## 3. The three seller templates (mirror Marcel's 3 tabs)

Fixed canonical templates (research: mature B2B platforms — Shopify, Ankorstore, Faire —
ship a fixed template first; "accept any messy format and map it" is a later layer and was
actively refuted as a lean-startup first move).

### Template A · Products (incl. standard price) — Phase-later
`supplier_code`🔑\* · `pzn` · `gtin` · `product_name`\* · `cultivar` · `dominance`\* ·
`country_of_origin` · `region` · `cultivator` · `lineage_a` · `lineage_b` ·
`thc_percent`\* · `cbd_percent`\* · `cbg_percent` · `cbn_percent` · `pack_size_grams`\* ·
`unit`\* · `irradiation`\* · `packaging_material` · `resealable` · `rrp_per_gram` ·
`basic_price_per_gram`\* · `bundle_min_grams` · `bundle_price_per_gram` · `cogs` (seller-only,
never shown to buyers) · `image_filenames` · `price_public` · `visibility_start` ·
`visibility_end` · `status` (Active/Discontinued/Coming soon/Hidden) · `note`
*(Buyer Product Code was removed. "More columns per company" → a future `metadata` bag.)*

> **Tier ladder (ADR-0004, 2026-08-14):** the CSV's single `bundle_min_grams` / `bundle_price_per_gram` bracket now lands as **rung 1 of the tier ladder** (`pricelist_item_tier`) post-Migration E; the legacy `pricelist_item` bundle columns were dropped by Migration C (`20260816190000`, live 2026-08-16).

> **Open:** Marcel's sheet carries TWO cannabinoid levels on the product — a headline
> `THC/CBD` (the "28/1" in the name) and a fuller `THC/CBD/CBG/CBN` profile — plus the
> batch's own lab-tested values (3 layers total). Resolve headline-vs-profile before build.

### Template B · Batches — Phase-later
`supplier_code`🔑\* · `batch_number`🔑\* · `ready_for_sale_date` · `shelf_life_months` ·
`expiry_date` · `harvest_date` · `loss_on_drying_percent` · `water_activity` ·
`lab_thc_percent` · `lab_cbd_percent` · `lab_cbg_percent` · `lab_cbn_percent` ·
`terpene_1..3` (+ `_pct`) · `description` · **grade rows** (see below)

**Bud-size grades are priced categories.** `Tinies / Smalls / Mids / Larges` are not one
quantity — each is a grade with its **own quantity + own price**. Model: a `batch_grade`
sub-table under batch (`grade · quantity · price`). New from Marcel's 2026-07-03 sheet
(alongside `harvest_date`).

### Template C · Per-customer prices — Phase 15
`customer_name`🔑\* · `supplier_code`🔑\* · `customer_price_per_gram`\* · `bundle_min_grams`
· `bundle_price_per_gram`. Seller may *see* a grid (customers × products); it is *stored*
as one row per cell, so adding a product/customer is "more rows," never a schema change.

## 4. Delivery — shared Google Sheet pull (primary)

Chosen with Marcel: instead of export→edit→upload, each company keeps **one live Google
Sheet** (our pre-structured template — fixed tabs/columns) and edits it freely; Hello Sello
**pulls** from it on a schedule. It matches how Marcel already works (his logistics partner
updates a shared Sheet 2–3×/day).

- File upload stays as a **fallback** for non-Google companies.
- Both delivery pipes feed the **same validation + upsert engine**. ERP delta-API is the
  end-state on the **same tables** (Ankorstore's model: `PATCH /product-variants/{id}/stock`
  + `/prices`, no full-replace). "Widen the pipe, don't rebuild it."
- Needs: an **error-back channel** (validation happens at pull-time, not upload-time — push
  errors via a status column in the Sheet or email) and a **pull rule** (scheduled, e.g.
  nightly, or a "mark ready" trigger) so we don't catch half-finished edits.

## 5. Reconciliation over a system-of-record (the heart of it)

Hello Sello keeps its **own durable master** of every product ever seen — the system of
record. The Sheet is the live feed. Each pull runs a **difference check**:

| Case | In our system? | In the Sheet now? | Action |
|---|---|---|---|
| New | no | yes | create → available |
| Matched | yes | yes | update values → stays available |
| **Missing** | yes | **no** | mark **Unavailable** (soft, retained) |
| **Returned** | yes (was unavailable) | yes again | **auto-restore** → available |

**Availability is DERIVED** from presence-in-the-Sheet (+ has-a-valid-batch), so it needs
**zero seller discipline** — they just edit the Sheet. The explicit `status` column is an
optional override for the one case the diff can't guess ("keep the row but show it
Discontinued"). "Out of stock" is auto-derived when a live product has no in-date batch.

### Safe, reversible deletion (defense in depth)

The Sheet drives the shop but can **never destroy** anything:
1. **Soft-archive, never hard-delete** — a vanished row hides the product (data + batches +
   past deals retained; recoverable; returns when the row returns).
2. **Snapshot every sync** — roll back to any prior pull. (Google's own version history is a
   second net; we don't rely on it.)
3. **Big-change guard** — a pull that would remove >~25% of the catalogue (the "wiped the
   Sheet" accident) **pauses and alerts** before applying. Small deletions apply normally.
4. **Import ledger + undo + notify** — every sync records what changed
   ("14 products hidden — left the Sheet on 3 Jul"), visible and reversible.

*(Nets 2 + 4 are the "keep your own import history" pattern the research flagged — vendor
records expire in 48–72 h, so the platform persists its own. Same mechanism gives audit +
recovery + the ERP-sync hook.)*

**Known edge:** renaming a `supplier_code` looks like delete-plus-create to the diff (old
code → unavailable, new code → new product). Safe because reversible; add a rename/merge
tool later.

## 6. Availability lifecycle vs marketing badges

Two separate fields — don't conflate:
- **Availability status** (`Available / Out-of-stock / Discontinued / Coming soon / Hidden`)
  — *can you buy it?* Mostly derived; products **persist forever**.
- **Marketing badge** (`New / Launch / Re-launch`) — *how it's flagged visually.* Decoration.

"Coming soon" drives both a status and a badge, but is reserved for a **brand-new** product
announced before it's ever available (forward in time) — not for one that *left* the Sheet
(that's "Unavailable/Discontinued"). **Pre-selling** unavailable / coming-soon items =
**Phase 17** (Deal Basket, DEV-84).

## 7. Phasing

| When | What |
|---|---|
| **Now → 8 Jul demo (Phase 7)** | Present **visual redesign** (existing 6 criteria) + Marcel sets up shop **manually** (manual-add exists). Cards should already show **availability badges** + **grade pricing** so the model is visible. |
| **Post-demo (new "Catalogue Ingestion" phase)** | This whole document: 3 templates, shared-Sheet pull + reconciliation + safety nets, error-back channel. |
| **Phase 15** | Per-customer prices (Template C). |
| **Phase 17** | Pre-selling coming-soon / out-of-stock items. |
| **End-state** | ERP delta-API sync on the same tables. |

**The one rule to protect now:** build the visual + manual-add on **this** model (four
objects, keys, status, grades) so the ingestion phase later just adds an input pipe to a
shop that already speaks the right language — no repaint.

## 8. Open questions (resolve at build time)

1. Product headline THC/CBD vs full nominal profile vs batch lab values — three layers;
   confirm what each is for and what the card shows.
2. Pull cadence + trigger (nightly vs "mark ready") and the exact error-back channel.
3. Snapshot rule specifics + the big-change-guard threshold (~25% placeholder).
4. Custom per-company fields ("more columns") — `metadata` bag now or defer.
5. Google auth model (service-account share vs OAuth) + the non-Google fallback UX.
