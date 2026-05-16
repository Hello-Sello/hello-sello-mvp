# Hello Sello — Product Design

Product design documentation for **Hello Sello** — the AI-native deal room for B2B.

This repo holds the layer-by-layer design artifacts produced during the product brainstorm. It is **separate from the MVP code** ([HelloSello/HelloSello_MVP](https://github.com/HelloSello/HelloSello_MVP)) because design and code have different change rhythms.

---

## Where to start

If you're a teammate joining the project, read these in order:

1. **[CLAUDE.md](CLAUDE.md)** — auto-loads when you open this folder in Claude Code. Gives a 30-second project briefing, the 5-Layer Roadmap, the current Session Checkpoint, and how the team works together. **Always start here.**
2. **[PITCH.md](PITCH.md)** — investor + customer pitches. Defines voice, framing, positioning.
3. **[DECISIONS.md](DECISIONS.md)** — every locked design decision, organized by layer, with reasoning.
4. **Layer docs** — the actual design, layer by layer:
   - [LAYER-1-USERS-AND-CORE-OBJECTS.md](LAYER-1-USERS-AND-CORE-OBJECTS.md) — **LOCKED**
   - [LAYER-2-SURFACES.md](LAYER-2-SURFACES.md) — IN PROGRESS
   - [LAYER-3-DEAL-EXECUTION.md](LAYER-3-DEAL-EXECUTION.md) — IN PROGRESS

---

## How we work

- **Brainstorm layer by layer.** Each layer builds on the previous. Don't jump ahead.
- **Doubts → `/track-doubt` skill.** When a design question surfaces during a session, the skill (in `.claude/skills/track-doubt/`) captures it as a Linear issue and inserts a marker in the relevant Layer doc.
- **Decisions → DECISIONS.md.** Locked decisions get a one-liner with reasoning.
- **Always preview before writing.** No file or Linear writes happen without explicit user confirmation.
- **Update the Session Checkpoint in CLAUDE.md** at the end of every brainstorm session — it's the "you are here" marker for the next session.

---

## Related repos

- [HelloSello/HelloSello_MVP](https://github.com/HelloSello/HelloSello_MVP) — the MVP codebase (Next.js / pnpm / Supabase)
- [HelloSello/hellosello_lovable](https://github.com/HelloSello/hellosello_lovable) — Lovable.dev workspace
- [HelloSello/selloai-hub](https://github.com/HelloSello/selloai-hub)

---

## Visibility

**Private.** Contains internal product strategy, pitch content, and design decisions.
