---
paths:
  - "docs/product/**"
  - "docs/PRD/**"
  - "src/app/**"
  - "src/modules/**"
---

# Product model — two views of the same thing

Loads when you touch product docs or an app surface. Don't conflate the views.

**5 horizontal layers** — cross-cutting, `docs/product/layers/LAYER-*.md`:
Users & Core Objects (1) · Product Surfaces (2) · Deal Execution (3) ·
Sella Behavior (4) · Inputs & Outputs (5).

**7 vertical surfaces** — per-surface deep dives,
`docs/product/surfaces/<NAME>.md`:
Connect (100% depth, built first) · Present · Buy · Sell · Discover · Grow ·
**Sella is cross-cutting** — present in every surface, not a sibling surface.

Build strategy is locked in `docs/decisions/DECISIONS.md`, "Build strategy".

## Rules that bite here

- **The PRD is the source of truth.** When it conflicts with a prototype, the
  schema, or an older decision, the PRD wins.
- **Prototype any new UI before building it** — `prototypes/<name>-prototype/`,
  standalone HTML, openable in a browser. The locked screens are the spec.
- **Deal vocabulary is not interchangeable:** Basket = Deal Card (one object, two
  lifecycle visuals) · Deal Room = customer presentation · Deal Workspace = the
  deal container.
- **Explicit edit/save affordances** — read-only plus a Change button, then
  Save/Cancel. No always-editable fields with dead disabled buttons, and no
  silent auto-save.
