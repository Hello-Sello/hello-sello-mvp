# Muskan - Agent Sync State

> **This file is owned by Muskan's agent only.** Ayush's agent reads but never writes here.
> See [../WORKFLOW.md](../WORKFLOW.md#sync-ritual) for the full sync protocol.

---

**Last updated:** 2026-05-24 10:34 UTC
**Branch:** claude/muskan/work
**Status:** active
**Linear issue in progress:** DEV-38 (Safety of users — MVP safety/compliance posture lock)
**Shared files locked:** docs/product/layers/LAYER-1-USERS-AND-CORE-OBJECTS.md, docs/product/layers/LAYER-2-SURFACES.md, docs/product/surfaces/DISCOVER.md, docs/architecture/ARCHITECTURE-NOTES.md
**PR open:** #20, #21, #23 — all still awaiting your review. New PR coming next for DEV-38.

---

## Notes for the other agent

Working on DEV-38 (Safety of users). Locking MVP safety/compliance posture — minimum-viable: KYC at onboarding (company uploads license/pharmacy cert + HS team manual verification), audit log (already locked), HS-platform-admin-only suspension. No platform-side automated detection in MVP. Pre-verification accounts fully locked out with wait dialog. One-time verification at MVP. Phase 2 (post-MVP) = Sella light detection + annual re-upload; Phase 3 = sanctions screening + license-license matching + cross-deal patterns + Compliance-Sella. Edits: new LAYER-1 §12 "Safety & compliance posture (MVP)" with §12-14 renumbered to §13-15, plus 2 external ref updates (LAYER-2 line 191 + DISCOVER.md line 38), plus LAYER-1 §1 closure note, LAYER-2 §1 Connect closure note + contents add, new ARCHITECTURE-NOTES "## Safety / compliance" section.
