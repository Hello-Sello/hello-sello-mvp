# Rail prototype - 3 models to compare

> **CHOSEN (2026-06-19, tentative - pending Ayush's final review after a break): Model 2 - Accordion (`2-accordion.html`).** This is the F2 rail direction for now; to be ported into the real shell next. Ayush may revisit before final lock.

Three throwaway prototypes for the shape of the global left nav rail. Each one is
a single self-contained HTML file - inline CSS and JS, no build, no assets, no
external requests. Open `index.html` to launch any of them, or open a file
directly:

- `1-replace.html` - Model 1, Replace (drill-down)
- `2-accordion.html` - Model 2, Accordion (tree)
- `3-accordion-messages.html` - Model 3, Accordion + Messages

Brand tokens mirror `src/app/globals.css` (soft pink `--bg #fffafc`, brand
raspberry `--brand #e30b5d`).

## The shared model (same in all three)

There is one rail, never two. Pinned at the top is the wordmark with a collapse
arrow next to it; pinned at the bottom is the profile card. Between them sits the
list of "MAIN" surfaces - Connect, Discover, Present, and the disabled-for-now
Buy, Sell and Trade. Connect is the only surface that carries sub-items today, so
it is the only one that drills in, but the drill machinery is generic, so any
surface can grow sub-items and drill the same way later. The whole rail has one
clean, state-aware collapse: it shrinks to a slim icon-only strip where each icon
shows a tooltip on hover or focus, and the same collapse looks and behaves the
same in every state. The three models differ only in ONE thing - how Connect's
sub-items appear when you drill in.

## Source and history

This comes from the Connect/Chat UI overhaul build plan, slice **F2** (global
chrome / nav merge). The point of F2 is to merge the two old nav bars into one
rail, so every prototype keeps the single-rail rule.

The path to here:

- An early two-rail version was tried and Ayush rejected it on 2026-06-19. The
  decision: one rail only.
- Three prototypes - variations A, B and C - were drawn to test the single rail.
  Ayush chose C, and C was then professionally rebuilt to a research-backed
  standard (A and B were dropped).
- On 2026-06-19 Ayush gave two reference screenshots and asked to see all the
  model variations for how the sub-nav can behave. These three models are that
  request - the rebuilt single rail, shown with three different drill behaviours.

## The 3 models compared

| Aspect | Model 1 - Replace | Model 2 - Accordion | Model 3 - Accordion + Messages |
|---|---|---|---|
| Sub-nav behaviour | Connect's sub-nav slides in and REPLACES the surface list in the same space | Connect opens an in-place sub-tree under itself, surfaces stay above and below | Same in-place sub-tree as Model 2, plus a Messages people-list below the tree |
| Siblings visible while in Connect | No - the surface list is swapped out | Yes - all surfaces stay on screen | Yes - all surfaces stay, with Messages added |
| Collapsed behaviour | Replaced icon strip with a back icon to step out | Tree collapses; children move to a hover flyout off the icon | Tree + Messages collapse; children move to a hover flyout |
| Motion | Directional slide (surfaces leave left, Connect enters right) - feels like going one level deeper | Gentle accordion open/close in place - feels like expanding a folder | Same accordion open, plus the Messages list settles in below |
| Confusion risk | Higher - the surface list disappears, so "where did my other tabs go" is possible | Lower - nothing leaves the screen, the tree just grows | Lowest for orientation, but the rail gets taller and busier |
| Best for | A focused, app-in-app feel where Connect takes over the rail | Keeping all surfaces one click away at all times | Matching the reference screenshots and surfacing recent people fast |

## Why no permanent two-zone (VS Code split) model

A fourth idea exists - a permanent two-zone layout, like the VS Code activity
bar plus side panel, where a thin icon rail sits next to a separate wider panel
that always shows the current surface's sub-items. It was left out on purpose.
That layout reads as two rails side by side, and Ayush already rejected the
two-rail look on 2026-06-19. Including it would re-open a decision that is
already closed, so it is excluded.

## Honest recommendation

Model 3 is the strongest pick. It matches the two reference screenshots most
closely, it keeps every surface visible so nothing ever disappears, and the
Messages people-list gives Connect a real reason to be the default surface (you
land straight on the people you talk to). The cost is a taller, busier rail, so
it needs care when collapsed.

If we want something calmer and lighter to ship first, Model 2 is the safe
fallback - it is Model 3 without the Messages list, so it is the same proven
accordion with less to get right. Model 1 is the most distinctive but carries
the real risk that hiding the other surfaces feels like losing your place, so it
is the weakest of the three for a tool people live in all day.
