# Ayush - Agent Sync State

> **This file is owned by Ayush's agent only.** Muskan's agent reads but never writes here.
> See [../WORKFLOW.md](../WORKFLOW.md#sync-ritual) for the full sync protocol.

---

**Last updated:** 2026-05-23 18:16 CEST
**Branch:** claude/ayush/work
**Status:** active
**Linear issue in progress:** none (meta-process work, no DEV issue)
**Shared files locked:** all docs/product/ contents (LAYER files moving to layers/, new surfaces/ + README being created), docs/product/KNOWN-AMENDMENTS.md (path fix), README.md (repo-root path fix)
**PR open:** none

---

## Notes for the other agent

Locking docs/product/ for the big reorg: (a) `git mv` all 5 LAYER files into `layers/` subfolder (history preserved), (b) create new `docs/product/README.md` explaining layers/ vs surfaces/, (c) create `surfaces/` with 7 stub files (CONNECT, PRESENT, BUY, SELL, DISCOVER, GROW, SELLA) using the agreed template. Also fixing path references in KNOWN-AMENDMENTS.md and repo-root README.md that pointed at old `docs/product/LAYER-*.md`. Estimated ~15 min. Will land as 3 logical commits, then unlock.
