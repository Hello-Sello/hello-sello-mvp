# Muskan - Agent Sync State

> **This file is owned by Muskan's agent only.** Ayush's agent reads but never writes here.
> See [../WORKFLOW.md](../WORKFLOW.md#sync-ritual) for the full sync protocol.

---

**Last updated:** 2026-06-07 16:19 CEST
**Branch:** claude/muskan/work
**Status:** active (session 10 — designing `product` + `pricelist` catalog tables from Marcel's blueprint CSVs)
**Linear issue in progress:** none
**Shared files locked:** `docs/architecture/SCHEMA-DRAFT.md` (writing catalog tables — product/batch/pricelist)
**PR open:** none — [#48](https://github.com/HelloSello/hello-sello-mvp/pull/48) (session-9 Phase 2 finalize) merged to `dev` 2026-06-07.

---

## Notes for the other agent

**2026-06-07 (session 9) — Phase 2 schema review vs the PRD; tables finalized. Two of your PRD action items answered.** Reviewed all 15 Phase 2 tables before migrations (PRD = source of truth now). Edits pushed to `SCHEMA-DRAFT.md` + `DECISIONS.md` (session-9 entry) + `ARCHITECTURE-NOTES.md` + `CONTEXT.md` + `AGENTS.md` checkpoint. **What changed:**
- **`deal_stage` seeds locked = your 5-stage template** (`negotiation`/`compliance_quality`/`agreement`/`payment`/`fulfilment_delivery`). **Dropped `domain`** — `thing` now groups by `stage` (NOT NULL), matching the PRD. Your screen-④ prototype's "by domain" Things-tab grouping is **superseded** (name-mismatch; PRD wins) — heads-up since it's your prototype.
- **Stages are now a VISIBLE UI element** (supersedes the old DEV-24/34 "scaffolding, not UI" lock).
- **O6 → workspace + deal chat born at Draft** (your PRD needed this; it's now in the schema). Fixed the stale `deal_card.thread_id` "at confirm" note.
- **⚠️ DEV-37 was misread in session 8** — it's *chat-organization* ("organized chat windows for multiple deals", Chat project), NOT multi-deal-per-workspace. **Workspace↔deal is a permanent 1:1.** Corrected the "relax later" language in all canon. Your `deal-flow.md` Block 4 already treats it as 1:1, so you're consistent — just flagging the canon fix.
- **Audit = log everything from day one**; visibility (chat+things+docs) lockstep with the one flag.
- **Phase 2 final** except 2 known-deferred: `buyer_metric` rename + `pricelist`/`product` column list (your blueprint CSVs are in `docs/product/blueprint/` — that's my next session). Then we write Phase 1 + Phase 2 migrations.

---

**2026-06-07 (session 8) — 4 screen ④ tables locked in `SCHEMA-DRAFT.md`.** Your PR #40 (screen ④ Deal Workspace prototype) merge unblocked the workspace tables. Walked through them research-first, one at a time. **What landed:**

- **`deal_workspace`** — separate container table (NOT columns on `deal_card`). Container concerns isolated from cross-company versioned agreement. 1:1 with deal_card in v0; DEV-37 multi-deal-per-workspace stays deferred. **Visibility model FLIPPED** — supersedes ARCHITECTURE-NOTES line 54 "two independent layers, Layer B always invited-only" model. New model: **one flag (`company_wide` default / `private`) drives both Layer A listing AND Layer B contents access**. Industry default (Salesforce/HubSpot opportunity-visible-to-org), simpler RLS, and Muskan explicitly accepted strict-hide RLS can be added later if needed. **Memory note `project_deal_visibility_two_layers.md` flagged stale.** Line 54 marked superseded + new line added below it.
- **3-layer same-company owner-handoff enforcement** — RLS + DB trigger `enforce_owner_same_company` + app-layer pre-check. Cross-company handoff structurally blocked. Same enforcement extends to `deal_member.role='side_lead'` handoff. *Why all three:* this is THE cross-company trust boundary; single-layer bug = breach. Industry consensus (Postgres + Supabase + OWASP Multi-Tenant) for security-critical cross-table invariants is defense-in-depth.
- **`deal_member`** — junction with `role` enum (`owner` / `side_lead` / `member`). Side_lead concept added so each side controls own-side member adds (cross-company adds blocked). Workspace birth auto-inserts 2 rows: initiating dealmaker as `owner`, counterparty as `side_lead`. v0 deferred: `access_level` column.
- **`thing`** — single table with `type` discriminator (Asana subtype pattern): `task` / `approval` / `document_upload`. Two nullable FKs link approval→`deal_confirmation` + document_upload→`deal_artifact`. Status: `open`/`done` v0. Stages = NULL FK to `deal_stage` lookup (seeds TBD per DEV-24/34).
- **`deal_artifact`** — clones `relationship_artifact` Storage pattern; scoped to `deal_workspace`. **9 category seeds** including EU regulatory (`phytosanitary_cert`, `certificate_of_origin`, `packing_list`, `proforma_invoice` + the 4 originals + `other`). PDF-only v0, 20 MB.
- **`done`-flip lives in app-layer Edge Function (NOT DB trigger)** — opposite call from owner-handoff. *Why:* this is correctness logic (not a trust boundary), single write path, better debuggability, no per-write overhead. Industry split: security-critical = both layers; correctness/state-transition = app-layer. Belt-and-suspenders DB trigger can be added later if support sees drift.
- **`done` added to `deal_card_status` lookup.**
- **`audit_log`:** +4 `auditable_content_type` codes (`deal_workspace`, `deal_member`, `thing`, `deal_artifact`).
- **7 new lookups:** `workspace_visibility`, `deal_member_role`, `thing_domain`, `thing_type`, `thing_status`, `deal_stage` (seeds TBD), `deal_artifact_category`.
- **Promoted from Phase 3 → Phase 2:** `deal_workspace` + `thing`. **`deal_room` stays Phase 3** (Present-surface, not execution container).

**ARCHITECTURE-NOTES.md:** 3 new entries: (a) `deal_workspace` schema entry under Core entities; (b) visibility flip — line 54 marked superseded + new line below; (c) new app-layer-vs-DB-trigger principle entry under Access policy.

**DECISIONS.md:** session 8 entry appended at end — full rationale for all of the above + the visibility flip's load-bearing significance.

**Pricelist scope re-clarified (Marcel sent updated WhatsApp + Drive blueprint today):** structured rows + CSV blueprint input + manual entry; PDF dropped. Per-customer override = conceptually needed but **explicitly NOT v0** per Marcel. Exact columns pending — Drive "Pricelist" spreadsheet (`1-260WKvTX67fq4If6jekN9_4rA1eWvGLJG3zuJviuPA`) ready to read next session.

**Heads up for next session:** Muskan creating `docs/product/blueprints/` folder for Marcel's CSV/spreadsheet exports (version-controlled record).

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
