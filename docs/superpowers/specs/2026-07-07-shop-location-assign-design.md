# Shop location grouping — Assign products dialog + in-shop reorder

**Date:** 2026-07-07
**Status:** Approved by Muskan, ready for implementation plan
**Surface:** Present / ShopView (`src/app/present/ShopView.tsx`)

## Problem

The current "Manage shop" edit mode groups products into location sections
(`product.location`, a free-text tag) via:
- an "All locations" filter dropdown (`LocationTabs`),
- a full-width `AddLocationInput` bar at the bottom of the page that stages an
  empty group,
- on-page native drag-and-drop: drag a product card's grip onto a
  `LocationGroup` section to move it there.

Pain point: if a shop has many location sections, dragging a product into a
section far down the page requires a slow manual scroll while mid-drag. There
is also no way to assign several unassigned products quickly, and no way to
manually reorder products within a single shop section.

## Scope

**In scope:** the product-grouping tags only (`product.location`), the UI
around creating/naming a group, and assigning/reordering products within
them.

**Out of scope:** the separate warehouse-address list
(`company.metadata.locations`, the "Location" info box used for order docs,
owned by Phase 16 / cross-lane with Ayush). No schema change, no migration,
no new server action — everything routes through the existing
`setProductLocation` (`src/modules/catalog/manage.ts`).

## Changes

### 1. "+ Add shop" button

- Replaces today's bottom-of-page `AddLocationInput` bar.
- Renders next to the existing "All locations" filter dropdown
  (`LocationTabs`), edit-mode only.
- Click → inline text field appears in place → Enter/confirm → added to the
  existing `pendingLocations` client state (unchanged mechanics: an empty
  staged group is ephemeral — it survives a reload only once a product is
  tagged into it).

### 2. "Assign products to shop" dialog

- New button next to "+ Add shop", edit-mode only.
- New component: `src/app/present/AssignProductsDialog.tsx`, same
  fixed-overlay modal pattern as the existing `AddProductsDrawer`.
- **Left pane:** flat list of products where `location === null` (thumbnail +
  name), each draggable.
- **Right pane:** one column per shop (real groups + staged
  `pendingLocations`), each a drop target, plus a small "+ new shop" inline
  input at the top to create one on the fly (same staging mechanics as
  "+ Add shop").
- Drop a product on a shop column → calls `setProductLocation` immediately
  (same as on-page drag today, no batching/undo) → the dialog's local view
  updates the product from the left list into that shop's column without
  requiring the dialog to close.
- Close (X or backdrop) → returns to the normal shop grid, regrouped.

### 3. In-shop product reorder

- `ProductCard` gains a grip-drag handle (reusing the existing native-DnD
  pattern already used for `LocationGroup`'s header drag) so a product can be
  dragged to a new position within its own shop section.
- Client-side only: a `productOrder` state in `ShopView`, mirroring the
  existing `groupOrder` pattern used to reorder location section headers.
  Resets to the default alphabetical-by-name order on page reload. No DB
  column, no server write.

## Explicitly decided against (for this pass)

- No merge with the warehouse-address list (`company.metadata.locations`).
- No persistence for empty (zero-product) shops beyond today's ephemeral
  behavior.
- No persisted product ordering (no migration/column).
- On-page drag-and-drop (`LocationGroup`) is kept as-is, in addition to the
  new dialog — the dialog solves the "assign new/unassigned products without
  scrolling" case; on-page drag remains for reassigning already-placed
  products and (new) in-shop reorder.
- No prototype pass — skipped given the demo deadline; building directly in
  React against the existing component patterns.

## Touched files

- `src/app/present/ShopView.tsx` — remove `AddLocationInput` render; add
  "+ Add shop" + "Assign products to shop" buttons beside `LocationTabs`;
  add `productOrder` state; render `AssignProductsDialog`.
- `src/app/present/AssignProductsDialog.tsx` — new file.
- `src/modules/catalog/components/ProductCard.tsx` — add grip-drag handle for
  in-shop reorder.
- `src/modules/catalog/components/LocationGroup.tsx` — sort children by
  `productOrder` before rendering (or `ShopView` sorts before passing
  children — decide in the plan; keep `LocationGroup` dumb if possible).

No new server actions. No migration.
