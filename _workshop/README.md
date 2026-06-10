# _workshop - Ayush's product brain

Gitignored. Not on GitHub. Not visible to Muskan or anyone else.
This is the room where fuzzy ideas get worked into concrete shape
before anything migrates out to the shared docs (DECISIONS.md,
Linear, PITCH.md, layer docs).

## How we use this

- I dump raw context, inspiration, screenshots, half-formed thoughts.
- Claude helps me find edges, flows, conflicts, missing pieces.
- When something gels, it migrates out to the shared docs.

## Suggested structure (grows as we go)

- `inspiration/` - images, screenshots, references, links
- `notes/` - raw thinking, transcripts, session logs
- `flows/` - user/deal flow explorations
- `pov/` - my point of view on each piece of the product
- `synthesis/` - things that have gelled and are ready to move out

## Rule for migration out

Nothing leaves `_workshop/` casually. When a piece is concrete enough
to live in the shared docs:

1. Move it (or a clean rewrite of it) into the right place under `docs/`.
2. If it changes a decision, follow propose-mode in DECISIONS.md.
3. If it changes the domain language, route through `/grill-with-docs` to CONTEXT.md.
4. Leave a breadcrumb here so I know what made it out.

## Conventions inside the workshop

- Timestamp longer notes with `## YYYY-MM-DD HH:MM CEST - [topic]`.
- Drop images into `inspiration/` with descriptive filenames (no `IMG_2847.jpg`).
- Short dashes only, no em-dashes.
- Fuzzy is allowed. Wrong is allowed. Half-baked is allowed.
  This folder exists so that I can think without performing.
