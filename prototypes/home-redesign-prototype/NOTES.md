# Home redesign prototype — decision capture (DEV-68)

**Throwaway.** Answers: *what should the Home "complete your profile" big-blocks look
like?* before touching `src/app/home/page.tsx` + `OnboardingChecklist.tsx`.
Phase 6 context: `.planning/phases/06-discover-home-ux/06-CONTEXT.md` (D-05, D-06).

## Marcel's spec (Linear DEV-68)
A few **big blocks (≈5)**, **system pink** if incomplete / **green** if "accomplished
at least partially":
1. Register your company / connect profile to a company
2. Connect to partner companies
3. Upload products
4. Define pricelists
5. Find people you know (*search by name = shows to connect, but no open list of people*)

## Locked (from CONTEXT)
- **Done-state derived from real data** (D-05): company set · ≥1 connection · ≥1
  product · ≥1 pricelist_item. NOT manual flags.
- **Block 5 = action, never auto-completes** (D-06): routes to **Discover** search
  (search-only, no open people list — same Instagram model as the pharmacy rule).
- Real app theme (glass + pink gradient + brand/success tokens).

## Design choices baked in
- **Pink = to-do** (brand-soft tint + brand accents), **green = done** (success tint +
  check). Block 5 is **neutral/"Optional"** (ink), not perpetual-pink — avoids a block
  that always looks unfinished.
- Each block is **big**: icon tile, title, one-line desc, state badge, CTA, a detail
  line ("12 products added" = the "at least partially" signal).
- Progress = done / 4 completable (block 5 excluded from the count).

## Round 1 verdict (2026-06-18) — blocks were too big; set reconciled
Muskan: the big-block cards were **too big for Home**. Also reconciled with the
EXISTING "Finish setting up" checklist (Connect email · Complete profile · Add
company details) which overlaps Marcel's asks. Decisions:
- **Drop "Register your company"** — both login paths (join-existing Path B / new-co
  licence) mean you already have a company on Home.
- **Merge** "Connect to partner companies" + "Find people you know" → ONE block,
  routes to **Discover** (search-only people model), low pressure.
- **Final set = 6 blocks** (Muskan kept email): Connect email · Complete profile ·
  Add company details · Upload products · Define pricelists · Connect with companies.
  ("Connect email" is **flag-based / placeholder** — email integration isn't in
  Muskan's lane yet.)
- **Connect block → DONE when the user sends ≥1 connection request** (not on
  acceptance — low pressure).
- **Compact**, not big boxes. Research-backed (Notion/Linear-minimal, interactive,
  progress bar): userguiding/appcues/chameleon onboarding-checklist patterns.

## Round 2 variants (compact — switch ‹ › / ←/→; click a block to preview done↔todo)
| Key | Name | Structure |
|---|---|---|
| **A** | Compact list card | One glass card (like today's "Finish setting up") upgraded: 6 tight rows + progress bar + dismiss. Most faithful to "not too big." |
| **B** | Mini-card grid | 6 small tiles (2–3 per row), pink (todo) / green (done) — compact, scannable. |
| **C** | Segmented progress | Slim banner + 6-segment progress bar + tight divided rows. |

Pink = to-do, green = done. All real-theme (glass + pink gradient + brand/success).

## How to run
`open "prototypes/home-redesign-prototype/index.html"` (no server needed).

## Round 2 verdict (2026-06-18) — even smaller, one row at top
Muskan: shrink the tiles so all 6 **fit in one row at the top** of Home (Home is
otherwise empty for now; real dashboard content comes later). → round-3 variants are
one-row strips (mini tiles / slim inline bar / segmented stepper) with a dashed
"your space — coming later" placeholder below.

## ✅ Final verdict (2026-06-18)
- **Chosen: Variant B — Slim inline bar.** One thin glass bar across the top of Home,
  6 items inline on a single line (icon + short label + done/set-up state), with a
  small progress bar + dismiss. Leaves the rest of Home open for future content.
- 6 blocks, short labels: Connect email · Your profile · Company details · Upload
  products · Pricelists · Find connections.
- pink = to-do, green = done; derived state (email = flag/placeholder); Find
  connections → green after ≥1 connection request sent; routes to Discover.
- Mobile: the bar scrolls horizontally.
- Next: fold B into `home/page.tsx` + rebuild `OnboardingChecklist.tsx` (→ 6 derived
  blocks, inline-bar layout), delete this folder.
