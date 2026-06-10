# Build Plan - 1a: App Shell + Nav

**Workshop file. Gitignored. Internal build reference, not a team doc.**
**Purpose:** the concrete pattern we follow to build 1a. We write this first, then code against it.

## 2026-06-07 - Plan written · design direction added · **Step 1 (init) DONE**

### Build log
- **Design revision 2 (2026-06-07, FINAL).** Dark rail rejected -> reverted to the **light glass capsule** (cleaner, floats with pills). Sidebar-first kept. Rail now carries: Hello Sello stacked `//` logo at top + 7 pills + **user-photo slot** at bottom. Top bar = search + Aurora company logo/name (perfect, kept). `next.config.ts` moves the dev build indicator. Verified live, zero errors.
- **Design revision 1 (2026-06-07).** [superseded] Tried a full-height dark maroon rail; Ayush found it worse than the light version.
- **1a COMPLETE (2026-06-07).** All steps done. Shell verified live on :3000: glass top bar + 7-surface icon rail, raspberry/cotton-candy active state (inspected: `rgb(227,11,93)` on cotton-candy 70%), active highlight follows navigation, `soon` surfaces non-clickable, `/` -> `/connect`, zero console errors. Ready for Ayush's test cases.
  - **Gotcha hit + fixed:** Turbopack cached a `module not found` for `@/shared/ui/AppShell` (file written microseconds after `layout.tsx` imported it). HMR didn't invalidate. Fix = stop server + `rm -rf .next` + restart. For future units: create the imported file *before* the importer, or expect a restart.
- **Step 1 DONE (2026-06-07).** App scaffolded via temp-dir merge, boots clean on :3000, zero console errors. Default boilerplate page (replaced in build pass).
- **Stack that actually landed:** **Next.js 16.2.7 · React 19.2.4 · Tailwind v4 · lucide-react ^1.17.0.** TypeScript, ESLint flat config, `@/*` import alias.
- **Tailwind v4 = no `tailwind.config.ts`.** Theme tokens live in `src/app/globals.css` via `@import "tailwindcss"` + `@theme {}`. PostCSS uses `@tailwindcss/postcss`. The design pass edits CSS, not a JS config.
- **Env gotchas (for future steps):**
  - The RTK bash hook mangles `npx` (-> `npm`) and strips args from multi-arg commands. Run such commands raw via `rtk proxy <cmd>` or a script (`rtk proxy bash script.sh`).
  - Preview dev server can't see `node_modules/.bin` on PATH. `.claude/launch.json` `hello-sello-app` launches via `node node_modules/next/dist/bin/next dev` to bypass it.

---

## Process for 1a (and every unit after)

1. Write this plan (done).
2. **UI design step** - lock the design language (pink/white/glass, professional). Ayush drives this with the **frontend-design skill** + gives detail; I fold it into §1 here. **No build until this is locked.**
3. Build per §4-§5.
4. **Ayush writes the test cases + tests it.**
5. Pass -> next unit.

---

## 0. What 1a is (and is NOT)

**1a = the outer frame every page sits inside.** Two jobs only:

1. **The frame** - a persistent top bar + a thin left **icon rail** (the global surface nav). Renders on every page, survives navigation.
2. **The routing** - Next.js routes so each surface has a real URL. Non-built surfaces get a stub page (never a 404).

**1a is NOT:**
- Not the Connect sub-nav (Chat/Inbox/...) - that's panel 2, belongs to Connect (2a).
- Not the chat list / detail panels - panels 3-4, Connect (2c).
- Not the Sella rail - panel 5, Sella (4d).
- No data, no Supabase, no auth. Pure structure + navigation.

> Reference: the locked **5-panel Connect layout** (`_workshop/pov/connect.md`, 2026-05-24):
> `1 thin nav (global) | 2 Connect sub-nav | 3 list | 4 detail | 5 Sella rail`.
> **1a builds panel 1 + the top bar. Nothing else.**

---

## 1. Design language

### What we take from the prototypes - and what we DON'T

The prototypes (`_workshop/connect-prototype/`, `_workshop/home-prototype/`) are the **layout + placement reference only**: where the rail sits, what's in the top bar, the surface order. **Their visual quality is NOT the target** - flat colors, colorful emoji, plain styling read as a student project. We ship a **professional tool.**

### Palette - LOCKED (2026-06-07)

| token | hex | role |
|---|---|---|
| `--color-brand` | #E30B5D | Raspberry - primary accent, wordmark, active nav |
| `--color-brand-soft` | #FFB7D5 | Cotton candy - light fills, active-nav glass tint |
| `--color-brand-deep` | #76002D | Red pink - deep accent, hover/pressed |
| `--color-surface` | #FFFFFF | White - glass base |
| `--color-ink` | #1F2020 | Grey 1 - body text + icons |
| `--color-success` | #34B233 | Green - positive system states |
| `--color-info` | #6C7BD9 | Periwinkle - info / links |
| `--color-danger` | #DC2626 | Alert red - errors, destructive actions |

- **Background:** light gradient, white -> faint cotton-candy wash + soft pink radial glows, so the glass blur reads.
- **Glass recipe:** `.glass` = white ~62% + `backdrop-blur(20px) saturate(140%)` + hairline white border + soft raspberry-tinted shadow. `.glass-strong` = denser variant for the top bar + placeholders.
- **Layout (FINAL 2026-06-07):** sidebar-first. **Light glass capsule rail** (`.glass`, `rounded-3xl`, floats with margin = the "cylindrical shape" holding pills) on the left; glass top bar + page fill the rest. *(A dark full-height maroon rail was tried and rejected - light is cleaner.)*
- **Rail top = Hello Sello logo:** stacked `He//o se//o` - the `ll` becomes `//` (Sella brand sign). Deep-maroon letters + raspberry `//` slashes (`Wordmark.tsx`). Placeholder for the real logo image.
- **Rail bottom = user photo** slot (circle, lucide `User` placeholder until the avatar image lands).
- **Top bar:** search pill (left) + **company logo + name** on the right (Aurora Deutschland GmbH; the `AD` box is the company-logo placeholder).
- **Active nav (light rail):** cotton-candy glass pill + raspberry icon/text + raspberry edge bar. idle = `ink/55`, hover lifts toward brand; **soon:** `ink/30`, non-clickable.
- **Dev note:** Next 16's dev-tools "N" button is pinned bottom-left (not movable via config) and overlaps the user-photo slot in dev only - gone in production. `next.config.ts` moves the build indicator to bottom-right.
- **Icons:** `lucide-react`, monochrome, inherit ink/brand. No emoji.
- **Font:** Geist (Next-native), wired via `next/font`. Mono = Geist Mono.
- **No gray background. Light-only.** Dark mode deferred post-demo; tokens are CSS vars so dark = one extra `:root` block later.

---

## 2. Surfaces - LOCKED (7)

Confirmed by Ayush. Single config array (`surfaces.ts`) drives the rail. Icons = lucide names (no emoji).

| key | label | lucide icon | demo state |
|---|---|---|---|
| `home` | Home | `Home` | active (Muskan, 1d) |
| `connect` | Connect | `MessagesSquare` | **selected** (my demo) |
| `discover` | Discover | `Compass` | active (Muskan) |
| `present` | Present | `Store` | active (Muskan) |
| `buy` | Buy | `ShoppingCart` | soon |
| `sell` | Sell | `Tag` | soon |
| `trade` | Trade | `ArrowLeftRight` | soon |

(Icon picks are proposals - confirm/adjust in the design pass.)

**For the demo, only Connect has real child pages** (built by me in 2a+). Every other surface is a stub page until its owner fills it.

States: **selected** (soft pink glass), **active** (navigable, hover lift), **soon** (greyed, non-clickable).

---

## 3. Pattern / conventions (carry into every later unit)

From `src/README.md` + `docs/PRD/`:

- **Modular monolith, partitioned by domain** - not by technical layer.
- **The one rule:** a module talks to another **only through its public `index.ts`**. Never reach into another module's internals.
- **Surfaces = routes in `app/`** that compose modules. Auth + audit are cross-cutting (`shared/`), not domain modules.
- **Mock-first, schema-shaped:** module `types.ts` mirrors the DB columns from `SCHEMA.md` exactly, so mock -> real Supabase is a swap, not a rewrite. (Not needed in 1a - no data yet - but the structure we lay down must not block it.)
- **Short dashes only**, no em-dashes. DE/EN labels later ride off stable codes (not in 1a).

---

## 4. Files 1a creates

```
(root)
├── package.json                 next 16, react 19, tailwind 4, lucide-react   [done]
├── tsconfig.json                                                              [done]
├── next.config.ts                                                            [done]
├── postcss.config.mjs           @tailwindcss/postcss                          [done]
├── eslint.config.mjs                                                          [done]
├── .gitignore                   merged: ours + Next/Node ignores              [done]
└── src/
    ├── app/
    │   ├── layout.tsx           ROOT layout - font + <AppShell>{children}</AppShell>
    │   ├── globals.css          @import "tailwindcss" + @theme tokens (pink/glass) + bg base
    │   ├── page.tsx             "/" -> redirect to /connect
    │   ├── connect/page.tsx     stub ("Connect - inbox/chat lands here" - 2a fills it)
    │   ├── home/page.tsx        stub (Muskan 1d)
    │   ├── discover/page.tsx    stub
    │   ├── present/page.tsx     stub
    │   ├── buy/page.tsx         stub (soon)
    │   ├── sell/page.tsx        stub (soon)
    │   └── trade/page.tsx       stub (soon)
    └── shared/
        └── ui/
            ├── AppShell.tsx     glass top bar + icon rail + <main>{children}</main>
            ├── TopBar.tsx       wordmark · search stub · avatar (glass)
            ├── IconRail.tsx     maps SURFACES -> NavItem, highlights active route
            ├── NavItem.tsx      one rail entry (selected/active/soon states)
            ├── surfaces.ts      the SURFACES config array (§2)
            └── tokens.ts        (optional) shared glass/spacing helpers
```

`modules/*` and the other `shared/*` folders stay as-is (empty `.gitkeep` placeholders) - 1a doesn't touch them.

**Active-route highlight:** `IconRail` is a client component using `usePathname()` to mark the current surface selected. Everything else (shell, top bar, pages) stays a server component.

---

## 5. Build steps (in order) - run AFTER the design pass locks §1

### Step 1 - Init Next.js (the install gotcha is here)

Tooling already present (Node 24.2.0 / npm 11.3.0 / npx 11.3.0). **No system installs.** But `create-next-app .` will refuse - our repo root has non-empty `docs/`, `supabase/`, `_workshop/`, and a populated `src/`, which it treats as conflicts.

**Chosen method - scaffold in a temp dir, then merge in:**

```bash
# 1. scaffold a throwaway app next to the repo
cd /Users/ayushsingh/Projects/He::oSe::o
npx create-next-app@latest _hs-temp \
  --typescript --tailwind --app --src-dir \
  --eslint --no-import-alias --use-npm

# 2. move generated config + app files into our repo root,
#    NOT overwriting docs/ supabase/ _workshop/ .git/ modules/
#    (package.json, tsconfig.json, next.config.*, postcss.*,
#     tailwind.config.*, eslint config, src/app/*, public/)
#    merge .gitignore by hand (keep our entries, add .next/ node_modules/)

# 3. deps + run
cd hello-sello-design
npm install
npm install lucide-react
npm run dev
```

Delete `_hs-temp` once merged.

### Step 2 - design tokens + font
Wire the locked pink + glass tokens into `src/app/globals.css` via `@theme {}` (Tailwind v4 - no JS config). Load the chosen font via `next/font`.

### Step 3 - `surfaces.ts`
Config array from §2 (key, label, lucide icon, href, state). One file, drives the rail.

### Step 4 - `NavItem.tsx`
One rail entry. Props: surface + `isActive`. Renders the three glass states. `soon` = non-clickable `<span>`; others = `<Link>`. Icon from `lucide-react`.

### Step 5 - `IconRail.tsx` (client)
`usePathname()` -> map `SURFACES` to `NavItem`s, mark the matching one selected.

### Step 6 - `TopBar.tsx`
Glass bar: wordmark + search-placeholder (visual only) + avatar/company. Static.

### Step 7 - `AppShell.tsx`
Compose: `flex flex-col h-screen` -> `<TopBar/>` then `flex flex-1` -> `<IconRail/>` + `<main class="flex-1 overflow-auto">{children}</main>`. Apply the glass background here.

### Step 8 - `layout.tsx` + `globals.css`
Root layout wraps children in `<AppShell>`. globals.css = Tailwind directives + glass bg base.
> Forward note: when Muskan's auth (1b) lands, split into `(app)` and `(auth)` route groups so sign-in pages skip the shell. Not now.

### Step 9 - stub pages + root redirect
`/` redirects to `/connect`. Each surface page = a centered glass placeholder card ("<Surface> - coming soon"). Connect's stub says where the real inbox/chat will mount.

### Step 10 - Verify
`npm run dev` -> preview. Check: glass shell renders, rail highlights Connect, active surfaces route to stubs, `soon` ones greyed/non-clickable, no console errors, looks professional. Screenshot for the record. Hand to Ayush for test cases.

---

## 6. Done when (1a acceptance)

- [x] App boots on `npm run dev`, no console/build errors.
- [x] Glass top bar (wordmark · search stub · avatar) on every route.
- [x] Icon rail with all 7 surfaces, lucide icons, correct selected/active/soon states.
- [x] `/` redirects to `/connect`; every surface route renders a stub (no 404s).
- [x] Active-route highlight follows navigation.
- [x] Pink/white/glass design language applied - reads professional, not prototype-grade.
- [x] Folder structure matches §4; `modules/*` untouched; module-boundary rule respected.

## 7. Deliberately deferred (NOT 1a)

- Connect sub-nav, chat list/detail, Sella rail (panels 2-5).
- Auth route group + real avatar/company (waits on Muskan F3).
- Functional search. DE/EN i18n. Real surface pages (their own units).
