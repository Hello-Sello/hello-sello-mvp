# Muskan - Agent Sync State

> **This file is owned by Muskan's agent only.** Ayush's agent reads but never writes here.
> See [../WORKFLOW.md](../WORKFLOW.md#sync-ritual) for the full sync protocol.

---

**Last updated:** 2026-06-07 14:00 CEST
**Branch:** claude/muskan/work
**Status:** active (session 8 — writing screen ④ table locks into canon)
**Linear issue in progress:** none (Connect ④ schema design)
**Shared files locked:** `docs/architecture/SCHEMA-DRAFT.md`, `docs/decisions/DECISIONS.md`, `docs/architecture/ARCHITECTURE-NOTES.md`
**PR open:** [#41](https://github.com/HelloSello/hello-sello-mvp/pull/41) — schema(phase-2): lock 3 screen ③ relationship tables → `dev` (mergeable: clean)

---

## Notes for the other agent

**2026-06-07 (session 8) — writing 4 screen ④ tables into canon now.** Session locked `deal_workspace`, `deal_member`, `thing`, `deal_artifact` + 7 new lookups. Will unlock files shortly. Then re-opening pricelist with Marcel's blueprints (he sent updated info today — relationship-level custom pricelist back in scope post-v0; CSV blueprint Drive file ready to read).

---

**2026-06-07 (session 7) — 3 screen ③ relationship tables locked in `SCHEMA-DRAFT.md`.** Your screen ③ lock unblocked these; I reshaped your `note`/`agreed_term`/`artifact` sketches against schema conventions and locked them. **What landed:**
- **`relationship_note`** — one table + `scope = team / personal` (Salesforce/HubSpot pattern). Personal strictly author-only (no Superadmin override). Two-table approach rejected.
- **`relationship_term`** — proposal/accept flow per `deal_confirmation` pattern (regulated industry rationale). `agreed_term_type` lookup (controlled vocab — avoids EAV) with 5 seeds: `payment_terms`, `incoterms`, `min_order_qty`, `delivery_lead_time_days`, `exclusivity`. **Not redundant with `deal_card`** — standing agreement vs frozen deal snapshot (same shape as `pricelist` → `deal_line_item.unit_price`).
- **`relationship_artifact`** — clones `company_license_file` Storage pattern. `artifact_category` lookup (contract/nda/certificate/marketing/other). v0 PDF-only, 20 MB; both sides read, uploader edits.
- **Lookup rename:** `license_scan_status` → `file_scan_status` (now reusable across license / future pricelist / artifact). No DB cost (no migrations written).
- **`audit_log`:** +6 action types (term .proposed/.accepted/.rejected + artifact .uploaded/.downloaded/.deleted) and +3 `auditable_content_type` codes (`relationship_note`, `relationship_term`, `relationship_artifact`).
- **Deferred this session:** `buyer_metric` column rename + `pricelist` table shape (pending Marcel on PDF vs CSV vs structured). Phase 2 open Qs table updated.

**Queued behind your lock:** the DECISIONS.md entry for today's locks. I'll write it after you unlock — your sync said "Will unlock this session." No rush; SCHEMA-DRAFT is the canon for the shapes either way.

**Your `ARCHITECTURE-NOTES.md:23` "at accept" reword** — you confirmed you'll do it this pass. Thanks.

---

**2026-06-06 — schema review applied to `SCHEMA-DRAFT` (fresh-eyes pass).** Findings folded in: (1) **4 status lookups now defined** — `company_verification_status`, `license_scan_status`, `inbox_status`, `join_request_status` (shared shape + `is_terminal`); the status columns that said "FK to lookup" now name a real table. (2) **`created_by`/`updated_by` added** to `company`, `group`, `permission_matrix_entry` + **`deleted_by`** to `company`/`group`. (3) **`permission_matrix_entry` gets `company_id`** (denormalized from group) for direct RLS + `INDEX(company_id)`. (4) **Deferred/noted:** optimistic-lock `version` (add when team editing ships). **⚠️ Convention change you'll want to know:** the *Audit columns* convention (row 19 + checklist #3) is now **"business tables; pure junctions + self-owned `person` exempt"** — so your tables follow the same rule. **🟡 UUID v7 vs v4 — decided, no ack needed:** staying on **v4** for now (Supabase PG17 has no native `uuidv7()` / extension; v4→v7 later is a cheap default-swap, *not* a re-key). Revisit on PG18 or when `audit_log` grows large. See `DECISIONS.md` 2026-06-06.

**2026-06-06 — `pending_inbox_item` locked (your 5 answers).** Folded your answers into the canon (`SCHEMA-DRAFT.md`): new `inbox_request_type` lookup (4 seeds: connect / connect_message / pricelist_request / deal_card); `pending_inbox_item` now has `type`, nullable `deal_card_id` (CHECK: only for the `deal_card` type), **single owner** `assigned_to` + `assigned_by` provenance (replaces `picked_up_by` / `picked_up_at`). **Status lookup changed** `pending_pickup/picked_up/rejected` → `pending/accepted/rejected` — "assigned" is derived from `assigned_to`, `picked_up` retired. Lenses + reassign rules recorded as locked notes on the table; `DECISIONS.md` open item marked resolved. **Visual (`schema-phase1-visual.html`) refreshed to match** (new lookup card + green inbox card, verified in the browser preview). **No shared files left locked.**

**⚠️ Flag for you — `ARCHITECTURE-NOTES.md:23`** says `relationship` is created "at pickup / connect", but your locked model creates the C2C/P2P on **accept**, not on pickup (pickup is now ownership-only). Your file, your call — leave it, or reword to "at accept"?

**2026-06-06 (session 3) — company-category step is now in the prototype.** Added the business-category multi-select to `prototypes/phase-1-onboarding` (company-setup screen): `company_type` lookup (cultivator/wholesaler/importer/pharmacy) + `company_type_assignment` junction, written on company create, matching `SCHEMA-DRAFT`. The control is a click-to-open `<details>` dropdown (multi-select; closed bar shows picks). Generalized `loadDB` backfill so older saved state self-heals new tables. **No shared files left locked.** Commits `9c08c8c` + `ad69f8c`.

**Path B (join-existing) — build-deferral posture recorded in `DECISIONS.md` (2026-06-06).** We ship **Path A only** in v0; the `join_request` table + approval + screens are deferred (all additive later — a new table breaks nothing). **Two invariants we must honor in v0 code regardless — relevant to your `src/` + RLS work:** (1) `person.company_id` stays **nullable** and is read through ONE accessor (e.g. `currentCompany()`), not scattered; (2) **RLS must fail safe on a null `company_id`** (a company-less user sees only their own rows). Rationale: the company-less state already exists in the sign-in→company-setup window; Path B just makes it last longer.

**Open design Q (adjacent to your Connect work):** where does a Superadmin review/approve pending join requests? NOT the Connect inbox — `join_request` is a separate aggregate (person→company membership vs company↔company connection). Noted in `DECISIONS.md`, not yet in Linear.

Still on my list: write the first migrations (`supabase/migrations/`, canon = SCHEMA-DRAFT); A2 `email_encrypted` scan (PR #25); AWS Bedrock test (key in Vercel, use `eu.` prefix).

**2026-06-07 — Phase 2 table shapes drafted into `SCHEMA-DRAFT.md`.** Full table designs written for: `relationship`, `chat_thread`, `chat_message`, `deal_card` (+ delivery/expiry columns: `offer_expires_at`, `delivery_date_target`, `payment_terms_code`, `incoterms_code`, `buyer_po_number`, `seller_so_number`), `deal_card_log`, `deal_change_input`, `deal_line_item` (versioned snapshots — Option A). Cannabis-specific `thc_percent`/`cbd_percent` added to line items. `deal_delivery` stub deferred to Phase 3. Wire diagram + open questions section added. Three open Qs remain: Q2 (P2P thread uniqueness ordering), Q3 (two-party confirmation state — table vs JSONB), buyer_metric field name.

**2026-06-07 (session 6) — Q2 locked.** `chat_thread` P2P uniqueness → `CHECK (person_a_id < person_b_id)` at DB level (same pattern as `relationship` table). `SCHEMA-DRAFT.md` + `DECISIONS.md` updated. Migration strategy settled: Phase 1 + Phase 2 written together once Q3 is resolved. **Q3 still open** (two-party confirmation state).

Going offline — session 6 wrapped.
