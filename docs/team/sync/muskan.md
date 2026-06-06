# Muskan - Agent Sync State

> **This file is owned by Muskan's agent only.** Ayush's agent reads but never writes here.
> See [../WORKFLOW.md](../WORKFLOW.md#sync-ritual) for the full sync protocol.

---

**Last updated:** 2026-06-06 21:11 UTC
**Branch:** claude/muskan/work
**Status:** active — schema review applied; next is the visual refresh (for the new lookups/columns)
**Linear issue in progress:** none
**Shared files locked:** none
**PR open:** none

---

## Notes for the other agent

**2026-06-06 — schema review applied to `SCHEMA-DRAFT` (fresh-eyes pass).** Findings folded in: (1) **4 status lookups now defined** — `company_verification_status`, `license_scan_status`, `inbox_status`, `join_request_status` (shared shape + `is_terminal`); the status columns that said "FK to lookup" now name a real table. (2) **`created_by`/`updated_by` added** to `company`, `group`, `permission_matrix_entry` + **`deleted_by`** to `company`/`group`. (3) **`permission_matrix_entry` gets `company_id`** (denormalized from group) for direct RLS + `INDEX(company_id)`. (4) **Deferred/noted:** optimistic-lock `version` (add when team editing ships). **⚠️ Convention change you'll want to know:** the *Audit columns* convention (row 19 + checklist #3) is now **"business tables; pure junctions + self-owned `person` exempt"** — so your tables follow the same rule. **🟡 Still parked for your ack:** UUID **v7** vs v4 for PKs (foundational, touches your tables too) — worth deciding before the first migration.

**2026-06-06 — `pending_inbox_item` locked (your 5 answers).** Folded your answers into the canon (`SCHEMA-DRAFT.md`): new `inbox_request_type` lookup (4 seeds: connect / connect_message / pricelist_request / deal_card); `pending_inbox_item` now has `type`, nullable `deal_card_id` (CHECK: only for the `deal_card` type), **single owner** `assigned_to` + `assigned_by` provenance (replaces `picked_up_by` / `picked_up_at`). **Status lookup changed** `pending_pickup/picked_up/rejected` → `pending/accepted/rejected` — "assigned" is derived from `assigned_to`, `picked_up` retired. Lenses + reassign rules recorded as locked notes on the table; `DECISIONS.md` open item marked resolved. **Visual (`schema-phase1-visual.html`) refreshed to match** (new lookup card + green inbox card, verified in the browser preview). **No shared files left locked.**

**⚠️ Flag for you — `ARCHITECTURE-NOTES.md:23`** says `relationship` is created "at pickup / connect", but your locked model creates the C2C/P2P on **accept**, not on pickup (pickup is now ownership-only). Your file, your call — leave it, or reword to "at accept"?

**2026-06-06 (session 3) — company-category step is now in the prototype.** Added the business-category multi-select to `prototypes/phase-1-onboarding` (company-setup screen): `company_type` lookup (cultivator/wholesaler/importer/pharmacy) + `company_type_assignment` junction, written on company create, matching `SCHEMA-DRAFT`. The control is a click-to-open `<details>` dropdown (multi-select; closed bar shows picks). Generalized `loadDB` backfill so older saved state self-heals new tables. **No shared files left locked.** Commits `9c08c8c` + `ad69f8c`.

**Path B (join-existing) — build-deferral posture recorded in `DECISIONS.md` (2026-06-06).** We ship **Path A only** in v0; the `join_request` table + approval + screens are deferred (all additive later — a new table breaks nothing). **Two invariants we must honor in v0 code regardless — relevant to your `src/` + RLS work:** (1) `person.company_id` stays **nullable** and is read through ONE accessor (e.g. `currentCompany()`), not scattered; (2) **RLS must fail safe on a null `company_id`** (a company-less user sees only their own rows). Rationale: the company-less state already exists in the sign-in→company-setup window; Path B just makes it last longer.

**Open design Q (adjacent to your Connect work):** where does a Superadmin review/approve pending join requests? NOT the Connect inbox — `join_request` is a separate aggregate (person→company membership vs company↔company connection). Noted in `DECISIONS.md`, not yet in Linear.

Still on my list: write the first migrations (`supabase/migrations/`, canon = SCHEMA-DRAFT); A2 `email_encrypted` scan (PR #25); AWS Bedrock access.
