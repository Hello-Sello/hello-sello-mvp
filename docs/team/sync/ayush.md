# Ayush - Agent Sync State

> **This file is owned by Ayush's agent only.** Muskan's agent reads but never writes here.
> See [../WORKFLOW.md](../WORKFLOW.md#sync-ritual) for the full sync protocol.

---

**Last updated:** 2026-06-06 22:00 CEST
**Branch:** claude/ayush/work
**Status:** offline (session wrapped)
**Linear issue in progress:** none (DEV-37 multi-deal stays parked, explicitly later)
**Shared files locked:** none
**PR open:** [#35](https://github.com/HelloSello/hello-sello-mvp/pull/35) - Connect ② (chat) → `dev` (#32 repo-name cleanup tracked separately)

---

## Notes for the other agent

**2026-06-06 (screen ② - the chat) - LOCKED.** Built the full Connect chat in `prototypes/chat-prototype/` (port 8770), **post-acceptance only** (the Inbox owns accept/decline). Caught up on your **session 3** (company-category step + Path B deferral) - I **integrated `origin/dev`** into my branch before editing shared docs, so my edits sit on top of your Path B work (no clobber).

**What's locked (relevant to your `messaging` + `deals` schema work):**
- **Chat spine:** `relationship → chat_thread (type: c2c|p2p|deal) → chat_message (sender, type, body)`. C2C created at connection (company-level - **supersedes LAYER-1 §3's "C↔C only inside a workspace"**, which is now stale). System/Sella lines are `chat_message` rows (`sender ∈ {person,system,sella}` + a `type` discriminator) - **no separate `system_message` table**.
- **Deal card is versioned:** `deal_card` (mutable: version, value_net, status) + **`deal_card_log`** (append-only history) + **`deal_change_input`** (per-user evidence - each party's note on a change) + **`audit_log`** (every system/Sella line mirrors here; chat system messages are *projections* of it).
- **Sync rule:** messages are **never** synced across threads; the **deal card is the only shared state**. P2P change → card v2 + a per-user `deal_card_updated` system msg in the Deal chat + log + evidence; Deal-chat change → same minus the broadcast (origin already saw it).
- **Two-party gate:** deal birth (and changes) require BOTH parties to confirm; model the decision per-party so the audit log attributes who agreed/declined.

Decisions → `DECISIONS.md` (`## 2026-06-06 (later)`); data model → `ARCHITECTURE-NOTES.md`; terms → `CONTEXT.md`; full narrative → `prototypes/chat-prototype/CONTEXT.md`.

**No shared files left locked.** You're clear on Discover/Present and the `messaging`/`deals` schema - the shapes above are my proposal; reshape as the real schema needs.

**Heads-up:** installed `gh` (Homebrew) this session - but `gh auth login` needs `read:org` and the keychain git token only has `repo`, so `gh` is unauthenticated. The **GitHub REST API works** via that keychain token (repo scope) - that's how I opened PR #35. So GitHub PR/comment/issue actions are doable here via the API; full `gh` CLI needs a `read:org` login later. Local folder is still `hello-sello-design`; remote `…/hello-sello-design.git` redirects to `hello-sello-mvp` (documented - not re-flagging).

Going offline.
