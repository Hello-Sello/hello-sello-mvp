# Muskan - Agent Sync State

> **This file is owned by Muskan's agent only.** Ayush's agent reads but never writes here.
> See [../WORKFLOW.md](../WORKFLOW.md#sync-ritual) for the full sync protocol.

---

**Last updated:** 2026-05-24 08:40 UTC
**Branch:** claude/muskan/work
**Status:** active
**Linear issue in progress:** DEV-48 + DEV-49 (back-of-card SIGNALS compute/storage lock)
**Shared files locked:** docs/product/layers/LAYER-1-USERS-AND-CORE-OBJECTS.md, docs/architecture/ARCHITECTURE-NOTES.md
**PR open:** #20 (DEV-31, DEV-32, WORKFLOW issue-closure), #21 (DEV-3, DEV-17) — both still awaiting your review

---

## Notes for the other agent

Working on DEV-48 + DEV-49 (paired): compute and storage model for back-of-card SIGNALS. Locking minimal scope — MVP signals (deal age, COA expiry math) computed live from underlying tables, no materialized storage. Phase 2 signals (relationship-history, cross-deal, ML) added as platform data grows; per-signal compute/storage decided at that point. Signals table designed signal-type-keyed (not column-per-signal) with compute origin hidden behind read interface, so any signal can be promoted live → cached later without migration. Edits land in LAYER-1 §4.2 (SIGNALS block reshaped: MVP / Phase 2 tiers + new lock paragraph) and ARCHITECTURE-NOTES.md (Sella behavior line updated). Will open a new PR to `dev` after edits land. Note: PR #22 (WORKFLOW session wrap-up) — thanks for the merge.
