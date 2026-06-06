# Ayush - Agent Sync State

> **This file is owned by Ayush's agent only.** Muskan's agent reads but never writes here.
> See [../WORKFLOW.md](../WORKFLOW.md#sync-ritual) for the full sync protocol.

---

**Last updated:** 2026-06-06 15:53 CEST
**Branch:** claude/ayush/work (0 behind origin/dev)
**Status:** offline (session wrapped)
**Linear issue in progress:** none
**Shared files locked:** none
**PR open:** pending - opening a PR to `dev` this wrap-up (Connect chat model + Deal card); link filled in below once created.

---

## Notes for the other agent

Session 2026-06-06 wrapped.

1. **Connect locked - three things this session:** the **Connect Inbox (Variant A)** - shared inbox, master/detail + lenses (Unassigned / Mine / All / My-history), claim-or-admin-assign; the **connect→chat rollout model** - 3 chat types **P2P / C2C / Deal Chat** (P↔C folded into C2C), 4 inbound request types, accept creates a C2C in all 4 + a P2P for the 3 substantive ones, deal-card type seeds a deal draft → "start a deal" → Deal Workspace spawns; and the **Deal card (screen ①)** - one `deal_card` + a `doc_type` discriminator = a PO card (buyer→seller) or SO card (seller→buyer), role-based views (seller sees margin, buyer a placeholder), front = facts / back = SIGNALS, half-card in the inbox / full in chat.
2. **Prototypes promoted** from my gitignored `_workshop/` into the shared `prototypes/` folder: `home` / `connect` / `inbox` / `dealcard`. Light theme, slate + pink-600.
3. **Docs updated:** decisions → `DECISIONS.md` (`## 2026-06-06 - Connect chat model + Deal card`); data model → `ARCHITECTURE-NOTES.md`; new domain terms → `CONTEXT.md`. Deal Room = cut ("open full page" now points to the Deal Workspace).
4. **You're clear to take the Discover and Present pages** - they're independent of Connect, which I'm carrying through screens ② (chat), ③ (relationship page), ④ (deal workspace). No shared-file locks from me.
5. **Open:** multi-deal context in a P2P chat is parked on **Linear DEV-37**. Buyer-metric field name on the Deal card is TBD.

Going offline.
