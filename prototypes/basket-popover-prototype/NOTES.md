# Prototype — basket dropdown (grouped) + draft-deal handoff

**Question (round 1):** we just shipped `BasketDrawer.tsx` as a full-height
right-side slide-in panel (Phase 17 Task 8). After trying it live, Muskan
wanted a lighter interaction: the basket icon opens something smaller and
anchored, showing only the products + a send affordance, then hands off to
a Deal Card preview on the right.

**Question (round 2, this version):** does the compact dropdown — now
grouped by seller company, with a "Draft deal" button per group instead of
"Send deal" — hold up? And what happens when the customer isn't known yet?

## Round 1 verdict: compact dropdown won

Three shapes were shown (compact dropdown / centered spotlight modal /
anchored flyout tray). **Muskan picked the compact dropdown**, anchored
directly under the TopBar basket icon (`top: 100% + 10px` off the icon
itself, not offset further down the page). The other two variants are
deleted from this file, per this repo's own convention once a prototype
variant wins (see `prototypes/buy-prototype/NOTES.md`: "Variant B won — the
switcher is gone").

## Round 2 changes (this version)

1. **Grouped by seller company.** The dropdown now renders one group per
   seller (own shop AND any connected company the buyer added products
   from), each with its own header (`shop-pill` + "Your shop" badge when
   applicable) and its own "Draft deal" button — mirrors the real
   `groupBySeller`/`BasketGroup` data shape already built in
   `src/modules/basket/lib/group.ts` (Task 3). Seeded with 2 groups
   (GreenLeaf Cultivation "Your shop" + StonePharm GmbH) to prove multiple
   groups render correctly side by side.
2. **"Draft deal" replaces "Send deal."** Confirmed by Muskan: clicking it
   does NOT send anything to a customer — it creates/opens a **draft** Deal
   Card, and the customer gets chosen **inside** that card, not in this
   dropdown. The dropdown itself never asks "who is this for."

## Open question — resolved, but blocked on a merge (do NOT build yet)

Investigated before touching any real code: **in-card customer selection
does not exist today**, on either side:
- **Schema:** `deal_card.relationship_id` is `NOT NULL`
  (`supabase/migrations/20260607090003_phase2_deal.sql:153`), and EVERY
  RLS policy on the whole deal object graph (`deal_line_item`,
  `deal_confirmation`, `deal_workspace`, `deal_member`, `deal_artifact`,
  `thing`, ...) derives visibility from that same column via
  `is_relationship_member(relationship_id)`. A null-relationship draft
  would be unreadable under current RLS, not just unsupported.
- **RPC:** `create_deal_draft` still raises `'relationship not found'` if
  `p_relationship_id` doesn't resolve — no default, not optional.
- **UI:** `DealPin.tsx`/`DealCard.tsx` always take `relationshipId` as a
  required prop and only ever *display* the counterparty — no picker, no
  "no customer yet" state anywhere.
- Checked Ayush's two most recent prototypes (`buy-prototype`,
  `deal-card-promo-prototype`, both pasted 2026-07-07) — neither one
  includes in-card customer selection. It isn't in flight on his side yet.

**Muskan's call:** this is real, and needs Ayush's actual Deal Card merged
into this branch before it can be built for real — she will merge his
branch in in a later session so the actual component can be seen and a
draft state can be designed against the real code, not a guess. **This
prototype's "Draft deal" hand-off (the right-side panel with a dashed
"+ Select a customer" slot) is a MOCK of the intended shape only** — it is
not a spec to build against; the real work starts once his merge lands.

## Still open / deliberately not solved here

- Note field: dropped from this dropdown entirely, no replacement location
  decided (may move into the real Deal Card once merged, may just be gone).
- The buyer's "other company" group in the real drawer today auto-resolves
  its recipient (one-click, no picker) since the relationship already
  exists — once customer selection moves inside the Deal Card, does that
  path change too, or keep short-circuiting straight to a real relationship
  since it's already known? Not decided.

## Verdict

**Interaction shape: LOCKED.** Compact dropdown, anchored to the TopBar
basket icon, grouped by seller, "Draft deal" per group.
**Send/createDeal wiring: PARKED**, pending Ayush's Deal Card merge into
this branch (a future session) — do not build the real send action until
then. Fold the locked interaction shape into a real `BasketDrawer.tsx`
rewrite now; leave the actual button's `onClick` as an explicit TODO/stub
until the merge, rather than wiring it to today's `sendBasketGroup`/
`RecipientPicker` (which this design has already discarded).
