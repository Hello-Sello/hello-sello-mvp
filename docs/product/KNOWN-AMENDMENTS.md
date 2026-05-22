# Known Amendments — Pending Integration into Layer 1

**Status:** captured **2026-05-18** during a brainstorm session that didn't end with formal doc updates. These three corrections came out of user-confirmed verbal clarifications but were never written into [LAYER-1-USERS-AND-CORE-OBJECTS.md](LAYER-1-USERS-AND-CORE-OBJECTS.md).

**Action for the next session:** verify each amendment with the user (in case prior understanding still drifted), then update Layer 1 + DECISIONS.md accordingly. **Once integrated, delete this file.**

---

## Amendment 1 — Deal Workspace spawn timing

**Current Layer 1 lock** (Section 5.2 + Section 4.3):
> Deal Workspace spawns at deal-card birth.

**Corrected understanding** (user-confirmed):
> Deal Workspace spawns when both parties **ACCEPT** the deal-card terms — the State 2 → State 3 transition (Confirmed), **NOT** at birth (State 1 → State 2).

**Implications:**
- Pre-acceptance: only the Deal Card exists (in Basket / Card / Deal Room views). No workspace, no stages, no milestones yet.
- At acceptance: workspace spawns with chat thread, members, stages, milestones, artifacts.
- Negotiation venue pre-acceptance is the Deal Room view or Sella-mediated personal chat — NOT workspace chat (which doesn't exist yet).

---

## Amendment 2 — Deal Card has THREE views, not one

**Current Layer 1 lock** (Section 4.2):
> Deal Card = visual artifact with a front (facts) and a back (Sella summary).

**Corrected understanding** (user-confirmed):
> The Deal Card is the persistent core object. It has **three views**, all of the same underlying data:
> - **Basket** — cart-style view; used while a salesperson is assembling products in their shop.
> - **Card** — Pokémon-style visual (front + flip-back); the default deal-artifact look.
> - **Deal Room** — full-screen "big screen" view; used by a salesperson to **pitch / present** the deal to a contact.

**Implications:**
- Deal Room is **NOT** a separate persistent container. It's a presentation VIEW of the same deal-card data.
- Layer 1 Section 4.2 needs to be expanded to include the three views.
- Deal Card has Git-style version history regardless of which view is being used.

---

## Amendment 3 — There are TWO C↔C chat types, not one

**Current Layer 1 lock** (Section 3):
> Company↔Company chat ONLY exists inside a deal workspace, tied to one specific deal.

**Corrected understanding** (user-confirmed):
> There are TWO types of Company↔Company chat:

| Type | Visibility | Connection required? |
|---|---|---|
| **C↔C deal-scoped** | Invited workspace participants only | Yes (workspace only exists post-acceptance) |
| **C↔C general** | Each side's designated "responsible people" (super admin / ticket-based / TBD); **one per relationship** | No (can pre-date connection) |

**Implications:**
- Layer 1 Section 3's chat-types table needs a row added (or split) for the general C↔C chat.
- The "responsible people" management mechanism is TBD — track as a new doubt before this can be fully locked.

---

## Plus — outstanding from the previous session, also not yet integrated into docs

- **8 Linear doubts with Marcel / Muskan answers in comments** waiting to be processed: DEV-1, DEV-5, DEV-6, DEV-7, DEV-8, DEV-9, DEV-10, DEV-12. Answers live only in Linear comments. Process → close the issues → update Layer docs + DECISIONS.md.
- **3 new Marcel-created doubts**: DEV-37 (chat windows for multiple deals), DEV-38 (user safety / illegal activity), DEV-39 (16-combination connection matrix). Need triage + integration.
- **Linear project rename**: `Define Deals / Deal Cards (structure & access)` → `Deals / Deal Card definition (structure & access)`. Old name still referenced in the `.claude/skills/track-doubt/SKILL.md` mapping table and in body text across the Layer docs. Search/replace needed.
- **Meeting source-of-truth** for many of these resolutions is in [meeting-notes/2026-05-16-marcel-meeting.md](../meeting-notes/2026-05-16-marcel-meeting.md). Read that first before re-deriving anything.

---

## Why this file exists

The 2026-05-18 session ran into a hallucination problem in late-context — the assistant kept proposing wrong interpretations of the Deal Card / Deal Room / Deal Workspace relationship. The user corrected each iteration verbally but the session ended before formal doc updates. This file captures what was settled, so the next session has a clean reference instead of re-deriving from scratch.

*Delete this file once Layer 1 and DECISIONS.md are updated with all three amendments.*
