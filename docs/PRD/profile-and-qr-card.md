# Profile & QR Business Card — PRD + Build Plan

**Status:** Design LOCKED + prototyped (2026-06-10). Ready to build.
**Owner:** Muskan. **Surface family:** Entry experience (1b/1c/1d) → identity.
**Parent strategy:** [BUILD-PLAN.md](BUILD-PLAN.md) (Muskan: Foundation → Onboarding/Home → surfaces).
**Created:** 2026-06-10. **Prototype:** `src/app/prototype/qr-card` (throwaway).

> The "Scan to Connect" digital business card, the public profile page behind it, and the
> in-app account screens to view/edit what onboarding collects. A person's QR opens a public
> page promoting them + their company; anyone can save the contact. "Connecting" on Hello
> Sello is a later, Ayush-owned step (see Out of scope).

---

## 1. Core idea

A person's QR (bottom-left card, email signature, printed card) encodes a **stable URL** →
opens a **public profile page** that promotes the person + company and works for **everyone**
(account or not). Industry-standard digital-card pattern (Popl/HiHello/V1CE): QR → dynamic
landing page, never raw data, so the page evolves without re-printing. Whether the scanner is
on Hello Sello changes **one button only** (Save-contact always works; Connect adapts).

In-app, the same identity lives in a **bottom-left avatar popover** (card + QR + menu) that
opens the **account area** (My Profile / Company Profile / Settings) — the place to finally
*see and edit* what onboarding captured (today it's write-only).

---

## 2. Locked decisions

| # | Decision | Why |
|---|---|---|
| D1 | QR → **public profile page** (not vCard-only / not connection-only) | Works for all scanners; promotes business; never a dead path |
| D2 | Card identity = **person, connects to company** | Matches HS company↔company connection model (DEV-7) |
| D3 | **Connect action deferred to Ayush** (Connect surface) | We ship a stub button; no Connect code touched |
| D4 | License upload = **env-gated required** | Required in prod (2026-05-25 lock); optional in local/preview for frictionless testing |
| D5 | QR URL = **readable handle** `/c/<handle>` | Professional + shareable; uniqueness via slug+suffix |
| D6 | Profile fields = **promoted to real columns** | One typed source for onboarding + card + page (one-writer rule) |
| D7 | **Dynamic QR** (encodes stable URL) | Page evolves freely; analytics-ready; never re-print |
| D8 | Onboarding steps stay **skippable + on Home checklist** | Keep the 1c entry UX; new fields just join it |
| D9 | Card placement = **bottom-left avatar popover** (card + QR + menu) | Matches Lovable mock + "Claude-style bottom-left"; one click to QR |
| D10 | Account screens = **sidebar-settings layout** (My Profile / Company / Settings), view+edit | Standard, scales; popover menu opens into it |
| D11 | Public page layout = **business-hero, light** (prototype "B") | Best promotes the business; light is the locked app theme |
| D12 | Every navigated-into page has a **Back button**; all entered info **persists** (DB) | Users must be able to leave and return without losing work |
| D13 | Naming: **"public profile"** (page), **"account card"** (bottom-left popover) | "card" was overloaded across 3 things |

---

## 3. What it looks like (locked, prototyped)

- **Public profile** `/c/<handle>` (chrome-free, no app shell): company cover → person →
  About company + products/location → contacts → QR + **Save contact** + **Connect**.
  *Outsider:* "Join Hello Sello to connect". *Insider:* "Connect" (+ back-to-app).
- **Account card** (bottom-left avatar popover): avatar, name, title, company, QR
  "SCAN TO CONNECT", + My Profile / Company Profile / Settings / Sign Out.
- **Account area** (sidebar tabs, Back button):
  - *My Profile* — avatar, name, title, phone, language, LinkedIn, (email read-only) + "Your public profile" (QR, Copy link, View).
  - *Company Profile* — name, country, address, website, products, categories, description + verification badge.
  - *Settings* — account (email/password/2FA-soon), notifications, preferences (language/theme), team & permissions (→ matrix), sign out.

Prototype (throwaway): `src/app/prototype/qr-card` — screens `?s=1` outsider · `?s=2` insider ·
`?s=3` bottom-left card · `?s=4` account area. Delete `src/app/prototype/` + the `/prototype`
line in `proxy.ts` once built.

---

## 4. Research → engineering choices (with sources)

| Topic | Finding | Choice |
|---|---|---|
| Public page vs auth proxy | Proxy ([proxy.ts](../../src/shared/db/proxy.ts)) redirects all non-auth routes to `/login` | Add `/c/*` to a **public-route exemption** (exempt from both gates) |
| Anon data exposure | A public page must not open the whole `person` row to `anon` | Expose **only** a curated public projection via a `SECURITY DEFINER` RPC `get_public_profile(handle)` — anon calls the function, never selects the table ([Supabase RLS/SECURITY DEFINER](https://supabase.com/docs/guides/database/postgres/row-level-security)) |
| QR generation | `qrcode` npm renders **server-side SVG** → inline, no client JS, SEO-ok | `qrcode` → SVG of the absolute `/c/<handle>` URL ([ref](https://medium.com/@farmaan30327/generate-a-qr-code-from-a-next-js-backend-1c87295d9e45)) |
| vCard | **3.0** is near-universal; iOS requires it; 4.0 inconsistent | vCard **3.0**, UTF-8, via a route handler returning `text/vcard` ([ref](https://univik.com/blog/vcard-21-vs-30-vs-40-differences/)) |
| Avatar storage | Public buckets are standard for avatars; **path-isolate by person_id** or cross-overwrite | New **public `avatars` bucket**, RLS keyed on `auth.uid()` path; read-time image transforms ([Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)) |
| Avatar upload size | Server Actions cap ~1 MB; Vercel platform cap 4.5 MB (not raisable) — bit us in session 18 | **Client-direct upload** to Storage (reuse the gallery pattern); server stores only the path |
| Handle uniqueness | Permanent public URL must not collide | `public_handle` = `slug(name)` + numeric suffix on collision; **DB `UNIQUE`** + insert-retry |
| Data model | JSONB `preferences` is untyped → drift across 3 readers | Promote to **typed columns** + one server-action writer (info hiding / one authoritative representation) |
| Enforcement | Layered: RLS floor + app policy (B7 lock 2026-05-29) | RLS: own-row update for person; company-member update for company. Public read via the RPC only |

---

## 5. Phases

### P0 — Onboarding loop + profile inputs  ·  Size S
**Goal:** capture the data the card/page need; keep onboarding skippable + on the Home
checklist; make license required only in prod.

**Best practice:** env-flag the strict path (12-factor config) — one source, not two hard-coded
flags. Avatar upload goes **client-direct to Storage** (dodges the Server-Action/Vercel body
limit that bit the product gallery); validate type+size client-side, rely on bucket policy server-side.

- [ ] **License env-gate** — replace the two `LICENCE_REQUIRED` consts with one read of
  `NEXT_PUBLIC_REQUIRE_LICENSE` (prod `true`, local/preview unset). Client validates, server enforces.
- [ ] **Profile step gains avatar + LinkedIn** (skippable) — avatar via client-direct upload to the new `avatars` bucket; LinkedIn into `links`.
- [ ] **Home checklist** keeps skipped items visible (avatar/linkedin join `profile`); unchanged dismiss/done behaviour.
- [ ] Confirm 1c onboarding is merged to dev/main (currently `claude/muskan/work`).

| Tag | Requirement | How we know it's met |
|---|---|---|
| FR-P0.1 | License required in prod, optional in local/preview, single source | Local signup skips license; prod build requires it |
| FR-P0.2 | Avatar + LinkedIn captured in the (skippable) profile step | Both saved; visible later in My Profile |
| FR-P0.3 | Skipped steps still show on the Home checklist | Skipping a field leaves a pending tile; completing marks done |

### P1 — Profile data model + account area  ·  Size M
**Goal:** typed columns + one writer; the account pages to **view/edit** entered info, with
**Back button** and **persistence**.

**Best practice:** additive migration + backfill (safe schema evolution, DDIA); one server-action
writer per aggregate (deep module — callers don't see storage shape); RLS own-row / company-member;
dirty-guard so Back doesn't silently drop edits.

- [ ] **Migration (additive):** `person` += `title, phone, language, avatar_path, links jsonb default '{}', public_handle text unique`; backfill from `preferences`; index `public_handle`.
- [ ] **Handle generator:** `slug(display_name)` + numeric suffix on unique-violation retry.
- [ ] **Server actions (single writers):** `updateMyProfile`, `updateCompanyProfile`; RLS — person updates own row, company update gated to company members.
- [ ] **`/account` route** (sidebar tabs My Profile / Company Profile / Settings) — view+edit, **Back button**, Save with **dirty guard**; reachable from the bottom-left popover.
- [ ] **Settings shell:** email (read), change-password (Supabase), sign out; notifications/2FA/team **stubbed** (out of scope to build).
- [ ] Regenerate `database.types.ts`.

| Tag | Requirement | How we know it's met |
|---|---|---|
| FR-P1.1 | Profile fields live in typed `person` columns | Migration applied; types regenerated |
| FR-P1.2 | One writer per aggregate, shared by onboarding + account + card | No duplicate write paths |
| FR-P1.3 | My Profile + Company Profile **show and edit** entered info | After onboarding, user sees + edits their data; Save persists; reload keeps it |
| FR-P1.4 | Back button on account pages; edits survive navigating away mid-edit (dirty-guard prompt) | Leaving with unsaved edits warns; saved edits persist across sessions |
| FR-P1.5 | Unique `public_handle` per person | Two same-name users get distinct handles |

### P2 — QR card + public profile page + vCard  ·  Size M/L
**Goal:** the visible feature — bottom-left card, public page, QR, vCard; Connect stubbed.

**Best practice:** public page exposes **only** the curated projection via `get_public_profile`
RPC (anon never touches the table); dynamic QR encodes the stable URL; vCard 3.0.

- [ ] **Proxy:** add `/c/` to a public-route exemption (signed-out can view; signed-in not bounced).
- [ ] **`get_public_profile(handle)`** `SECURITY DEFINER` RPC → only public fields (name, title, company public bits, avatar URL, chosen contacts, handle). No raw `person`/auth-email leak.
- [ ] **`/c/[handle]` page** — server component, **chrome-free** (no AppShell), business-hero layout; outsider vs insider button.
- [ ] **QR** — server-render SVG (`qrcode`) of the absolute `/c/<handle>` URL.
- [ ] **vCard** — route handler `/c/[handle]/vcard` → vCard 3.0 `text/vcard` download.
- [ ] **Bottom-left account card** — popover in Ayush's `IconRail`/`AppShell` (⚠️ coordinate; sync ritual) → card + QR + menu → opens `/account`.
- [ ] **Connect button stub** — viewer-aware copy ("Join to connect" / "Connect — soon"). No Connect code.

| Tag | Requirement | How we know it's met |
|---|---|---|
| FR-P2.1 | Bottom-left popover: card + QR + My Profile / Company / Settings / Sign Out | Opens from the rail avatar; one click to the QR |
| FR-P2.2 | `/c/<handle>` renders for signed-out users | Incognito scan shows the page, no `/login` redirect |
| FR-P2.3 | Page promotes person + company; exposes **only** public fields | Strangers see name/title/company/about/contacts; no private leakage (RPC-scoped) |
| FR-P2.4 | Dynamic QR = SVG of the stable URL | Scanning any device opens the page |
| FR-P2.5 | "Save contact" → vCard 3.0, works with no account | iOS + Android save the contact |
| FR-P2.6 | "Connect" stubbed, viewer-aware; no Connect code touched | Signed-out → "Join"; signed-in → "Connect (soon)" |

---

## 6. Schema changes (P1, additive only)

- `person` += `title text`, `phone text`, `language text`, `avatar_path text`, `links jsonb default '{}'`, `public_handle text unique`; index on `public_handle`; backfill from `preferences`.
- New **public** Storage bucket `avatars`, RLS path-isolated by `person_id` (`auth.uid()`).
- `get_public_profile(handle)` `SECURITY DEFINER` function (anon-callable; returns curated projection).
- `person.preferences.onboarding` flags stay (drive the Home checklist).
- Applied via Supabase MCP → regenerate `database.types.ts`.

## 7. Sequencing & dependencies

P0 → P1 → P2 (each ships independently). P2's public page + QR depend on P1's `public_handle`
+ columns. P2's bottom-left popover depends on Ayush's `IconRail` (coordinate). No dependency
on Connect — the button is a stub.

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Public page leaks private/auth email | Curated `SECURITY DEFINER` RPC; expose only intended fields; show **business** email field, not auth email |
| Avatar upload hits body limit | Client-direct upload to Storage (reuse gallery pattern) |
| Handle collisions / renames break printed QR | `UNIQUE` + suffix; handle is **immutable** once set (rename keeps old handle; open Q) |
| Touching Ayush's `IconRail` | Sync ritual + claim file before editing; popover is additive |
| Building a dead Connect button | Explicit stub; Connect wiring is Ayush's, tracked separately |

## 9. Out of scope

- **Real "Connect" action** (P↔C request into the company inbox) — Ayush / Connect (DEV-7).
- Apple/Google Wallet passes, scan analytics, per-event QR redirects.
- Company-side QR / company public page (this is the person card → company).
- Path B (join existing company) — deferred.
- Full Team & Permissions matrix (DEV-40), 2FA — Settings rows are stubs/links.

## 10. Open questions (resolve at build)

- Handle stability on rename — keep old handle as a permanent alias?
- Which contact fields are public by default vs user-toggled (email/phone/LinkedIn)?
- Avatar in vCard: base64 inline vs URL (test iOS rendering).
- `links` shape — personal LinkedIn here vs reuse Present's `company.metadata.links` for company links.

---

## 11. Code touchpoints — what we touch & how

The repo is a **modular monolith**: domain logic in `src/modules/<domain>/`, cross-cutting in
`src/shared/`, thin route files in `src/app/`. We keep that shape — **business logic in modules,
reusable UI in `src/shared/ui`, routes stay thin.** No Supabase calls scattered in components.

### New code (modules — deep, reusable, hide storage)

| File | Holds | Why here |
|---|---|---|
| `src/modules/profile/index.ts` (+`types.ts`) | `getMyProfile`, `updateMyProfile` (single writer), `getPublicProfile` (calls the RPC), `ensureHandle` (slug+suffix), `buildVCard`, `Profile` type | Hides the `person` storage shape, the public-projection RPC, handle logic, and vCard format behind one small API — reused by onboarding, account, card, public page. (APoSD deep module / information hiding.) |
| `src/modules/companies/index.ts` (exists, empty) | `getCompanyProfile`, `updateCompanyProfile` (single writer) | Company aggregate — one authoritative writer, used by onboarding + Company Profile page. |

### New code (reusable UI in `src/shared/ui` — DRY, no copy-paste)

| File | Component | Reused by |
|---|---|---|
| `Avatar.tsx` | photo + initials fallback | onboarding · account · card · public page |
| `QrCode.tsx` | server component → SVG via `qrcode` | bottom-left card · public page |
| `Field.tsx` | labeled input/select primitive | onboarding (replaces inline markup) · account |
| `BackButton.tsx` | consistent back nav | every navigated-into page (D12) |
| `AccountCard.tsx` | the identity card (avatar+QR+menu) | bottom-left popover (and shares contact bits with public page) |
| `ContactList.tsx` | email/phone/linkedin/web rows | card · public page |

### New routes (thin — compose module + shared UI only)

| Route | Purpose |
|---|---|
| `src/app/c/[handle]/page.tsx` | public profile (server component, **chrome-free**) |
| `src/app/c/[handle]/vcard/route.ts` | vCard 3.0 download (route handler) |
| `src/app/account/…` | account area (My Profile / Company / Settings tabs, Back, dirty-guard) |

### Edited (localized, behaviour-preserving where possible)

| File | Change | Care taken |
|---|---|---|
| `src/shared/db/proxy.ts` | swap the throwaway `/prototype` line for a real `/c/*` public exemption | one-line, isolated |
| `src/app/onboarding/OnboardingStepper.tsx` | add avatar + LinkedIn; **extract** the repeated field/avatar markup into the new shared `Field`/`Avatar` first | `rules-refactoring` (prepare → then change); keep behaviour |
| `src/app/onboarding/actions.ts` | route writes through `modules/profile` + `modules/companies` (action becomes thin); env-gate license | move logic down into the module, not duplicated |
| `src/app/home/OnboardingChecklist.tsx` | include new skippable items | unchanged dismiss/done logic |
| `src/shared/ui/AppShell.tsx` + `IconRail.tsx` (**Ayush's**) | chrome-skip on `/c/*`; mount the bottom-left `AccountCard` popover | ⚠️ sync ritual + claim before editing; additive |

**Migration** (additive) applied via Supabase MCP; `database.types.ts` regenerated. No existing
table reshaped, no column dropped → safe schema evolution.

## 12. Engineering principles & skills applied

These come from my global rule-set (`~/.claude/RULES.md`, always on) plus on-demand specialist
skills pulled per task. They are applied deliberately, not assumed:

| Principle / skill | How it shows up here |
|---|---|
| **Deep modules / information hiding** (APoSD) | `modules/profile` + `modules/companies` expose small APIs; storage shape, RPC, handle gen, vCard hidden inside |
| **One authoritative representation** (Pragmatic) | one writer per aggregate; one handle generator; profile fields live in typed columns (not duplicated JSONB) |
| **Clean Code** | small components; shared `Avatar`/`Field`/`QrCode` instead of the copy-paste in the prototype; route files stay thin |
| **`rules-clean-architecture`** | dependency direction route → module → db; UI doesn't know Supabase; business rules survive a delivery change |
| **`rules-ddia`** | additive migration + backfill, `UNIQUE` handle, **curated read projection** via `SECURITY DEFINER` RPC (derived data, least exposure) |
| **`rules-release-it`** | the public `/c` route is hostile-traffic-facing → validate the handle, RPC least-privilege, **no PII leak** (business email only), client-direct upload bounded by bucket policy |
| **`rules-refactoring`** | edits to onboarding files: extract shared primitives first (behaviour-preserving), then add the new fields |

**On reuse:** the prototype intentionally duplicates markup (throwaway). When we build for real,
that duplication is **collapsed into the shared components above** — the prototype is the design
reference, not the code we ship.
