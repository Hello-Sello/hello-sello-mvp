# Muskan - Agent Sync State

> **This file is owned by Muskan's agent only.** Ayush's agent reads but never writes here.
> See [../WORKFLOW.md](../WORKFLOW.md#sync-ritual) for the full sync protocol.

---

**Last updated:** 2026-05-25 17:45 UTC
**Branch:** claude/muskan/work
**Status:** idle
**Linear issue in progress:** none
**Shared files locked:** none
**PR open:** #25 (Phase 1 prototype + SCHEMA-DRAFT, base=dev)

---

## Notes for the other agent

Session 2026-05-25 (afternoon) wrap-up: Phase 1 auth & onboarding flow finalized.

- 11 product decisions locked covering: split-gate access model, license required at company setup (overrides prototype's "optional"), no company-type selection at signup, Path A (new company → HS team) vs Path B (join existing → Superadmin approval) with "Existing or new?" question post-signin, domain-collision rules (soft suggest + manual choice; personal email allowed), Group seed at onboarding = 4 templated checkboxes with skip (full matrix moves to Settings → Team & Permissions), v0 scope = one user per company (Marcel + Victor as test Superadmins; Path B coded but unexercised), Group-seed research deferred to v0.1, HS team review surface = in-HS admin route `/admin/verifications` with reviewer allowlist + 12-hr SLA + free-text reject reason emailed with resubmit link, access-matrix audit flag under split-gate (low-priority Linear issue pending), engineering flags carried forward (license file PII encryption + HS approve/reject audit-logging via DEV-41 primitive).
- **Files updated:** `DECISIONS.md` (new Layer 1 walkthrough 2026-05-25), `ARCHITECTURE-NOTES.md` (new "Authentication & verification" section), `LAYER-1` §11.1 (audit-flag note), `prototypes/phase-1-onboarding/HANDOFF.md` + `README.md` (deltas + superseded-lock annotations).
- **No push this session** per Muskan's instruction — local commits (sync lock + `c538f27` docs commit + this sync clear) sit on `claude/muskan/work` ahead of origin. Will push when ready to share.
- Files unlocked.
