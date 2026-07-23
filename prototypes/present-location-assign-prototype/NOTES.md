# Location-assign panel — throwaway spike

**Question:** does a compact "match the following" panel (small draggable product
chips on the left, named location bins on the right, drag to assign) feel better
than the current mechanism in `src/app/present/ShopView.tsx` + `LocationGroup.tsx`
(free-text "add location" input + drag-grip on the full card)?

**Run it:** open `index.html` directly in a browser — no build step, no server.

**What it is:** a compact panel (not full-page), matching the Present redesign's
brand tokens. Left = every product as a small chip (thumbnail + name + current
location). Right = one bin per named location + an "Unassigned" bin, each a native
HTML5 drop target. Drag a chip onto a bin to reassign. "+ Add" creates a new empty
location bin. State is in-memory mock data — resets on reload.

**What it deliberately skips:** real data, persistence, the rest of edit mode,
mobile/touch drag (native HTML5 DnD is desktop-only — same caveat as the drag-grip
in the current build), reordering within a bin.

**Verdict:** _(fill in after Muskan reviews — keep vs. drop vs. steal specific
bits into the existing free-text/drag-grip mechanism)._

**If kept:** promote into a real "Manage locations" section inside ShopView's edit
mode, wired to the existing `setProductLocation` action — replacing or sitting
alongside the free-text add-location input from F-01. Delete this folder once
folded in or discarded.
