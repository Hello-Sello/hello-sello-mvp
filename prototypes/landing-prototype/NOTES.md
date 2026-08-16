# Landing prototype — NOTES

**Phase 9** (Public Landing & Legal Pages). Throwaway HTML/CSS/JS — **not** React. Open `index.html` in a browser.

## What this is
A design-exploration prototype for the public landing page. **3 radically different directions**, toggled live from the switcher pinned at the bottom of the screen:

| Direction | Vibe | Hero |
|---|---|---|
| **Aurora** (default) | Dreamy, soft pink cloud — evolves the current screenshot | Animated mesh-gradient blobs + glass cards |
| **Editorial** | Linear/Stripe-clean, near-white, pink accent only | Split layout: bold type + product mockup |
| **Bold** | Dark deep-rose, vibrant pink→magenta, launch energy | Glowing CTA + floating orbs, parallax |

Same content + the same full section scaffold across all three — only the styling/layout changes.

## Tooling (all CDN, no build step)
- **Lenis** — premium smooth scroll
- **GSAP + ScrollTrigger** — scroll-reveal, parallax
- Pure CSS for gradients, glassmorphism, hover micro-interactions
- *Needs internet* (CDN). Content is visible even if scripts fail (reveals are no-JS-safe).

## Section scaffold (matches 09-CONTEXT.md, placeholder-everything)
nav (logo · Request access · **language-toggle slot** EN▾ · secondary Log in) → hero (+ product-visual slot) → logo bar → value props → **how-it-works 3-step (Discover→Connect→Deal)** → 6 surface cards → product preview/demo slot → social proof (stats + testimonial) → **B2B-only band** → FAQ → final CTA → footer (Impressum · Datenschutz · AGB · cookie settings) → **cookie banner (equal Accept/Reject)**.

Slots that need real assets/copy carry a pink **PLACEHOLDER** tag: logo bar, hero/demo previews, stats, testimonial.

## Decisions reflected (from CONTEXT)
- Primary CTA = **"Request access"** → will point at existing `/signup`. "Log in" is secondary.
- Landing copy **English**; **language-toggle slot** reserved for German. Legal pages stay German.
- Legal links present but copy is **scaffold only** (footer says so) — sourced from counsel/eRecht24 pre-launch.
- Signed-in users won't see this page (redirect to app) — not modelled in a static prototype.

## What's deliberately NOT real yet
Logos, product screenshots/demo video, testimonials, metrics (the €150k/100%/1-flow stats are **illustrative placeholders**), legal copy, final headline wording. All are content swaps, not rebuilds.

## Next
Iterate the look (shapes, motion, more directions welcome), pick/merge a direction, then `/gsd:plan-phase 9` to build it in React (Next.js App Router + Tailwind v4).
