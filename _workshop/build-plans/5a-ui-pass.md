# 5A - UI pass (card + chat + nav + Sella chat)

**Status:** ⬜ OPEN (not started). **Owner:** open / unassigned - Ayush or Muskan picks it up.
**Runs:** in PARALLEL with the Section 4 Sella build, AFTER 4.0 (Sella research).
**Absorbs:** the old 3.5d (card v2 UI) - see `3.5d-card-v2-ui.md` for the seed notes.

> **Why this is Section 5, not 3.5d or 4:** Muskan's `DECISIONS.md` already calls Sella "4a-4d", so Sella
> stays Section 4. To avoid a numbering clash, the UI pass becomes a fresh **Section 5**. It depends on
> Sella research (4.0) because Sella reshapes the chat + card, so we style once, after we know Sella's shape.

## Scope (the UI surfaces to change)

1. **Deal card** - the open mode + layout. Today the card floats on the right of the chat (`DealPin`) and is
   a tall vertical card; the Edit button sits below the fold and is hard to find. Decisions still OPEN:
   vertical vs horizontal, open as a blurred centered overlay vs side panel, where version history lives.
   *(A vertical blurred-overlay open mode was prototyped live + reverted this session - re-approach fresh.)*
2. **Chat heading** - the bar at the top of the chat (company name + "My Relationship with …" + the
   "Talking about" deal pin row). Tidy + make it read well.
3. **The message typing bar** - the input where the user types, everywhere it appears. Enable the missing
   bits: **Expand**, **message formatting** (bold/italic), and a **`+` menu** (the first item is a
   raspberry-highlighted "Create a deal"; image / photo / document uploads come later - they need storage,
   so they ship disabled / "coming soon" until a backend slice adds them).
4. **Left nav panel** - the Connect chat/relationship list panel. **Minimise it to a few icon buttons** to
   win back horizontal space (collapsible rail).
5. **Sella chat UI** - the Sella copilot panel. Style it together with the rest once 4.0 settles Sella's
   shape.

## Boundaries / notes

- Mostly presentation. The `+` "Create a deal" reuses the existing create flow (3.5a) - a second door, no new
  write path. File uploads are a SEPARATE backend slice (storage bucket + RLS), not part of 5A.
- The AI fence holds: any Sella-fed form still commits only on a human button (server action).
- Step-by-step working style (Ayush): build one surface, review live, then the next - do not batch all five.
