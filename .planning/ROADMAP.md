# Roadmap: Hello-Sello — Onboarding-Ready (Muskan's lane)

**Milestone:** v1.0 — milestone
**Core Value:** A real, verified company can self-onboard, present its catalogue, and become discoverable + connectable — safely enough for competing-company data, with no cross-tenant leak.

> Source of truth for product context: `AGENTS.md` + `docs/`. Requirements: `.planning/REQUIREMENTS.md`. Execution state: `.planning/STATE.md`.
>
> ⚠️ **Reconstruction note (2026-06-18):** This file was accidentally truncated during Phase 6 planning and reconstructed from `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, and in-context reads. Phase 6–8 detail blocks are verbatim from the pre-truncation file; the Phases 1–5 detail blocks are reconstructed from REQUIREMENTS success criteria + the STATE phase-summary table. Verify against memory if any wording matters.

## Phases

- [x] **Phase 1: Clean-Rebuild Foundation** - Committed F3 migrations (get_public_profile, profile_qr_foundation) so a clean `supabase db reset` brings up onboarding + the public profile page (completed 2026-06-16)
- [x] **Phase 2: Cross-Tenant Lockdown** - Discover RPCs + catalogue read policies scoped so only a verified caller sees other companies' data; no cross-tenant leak via REST or RPC (completed 2026-06-17)
- [x] **Phase 3: Admin Verification Surface** - HS-team members can approve / reject-with-reason pending companies, audit-logged, with a route + RLS gate against non-team users (completed 2026-06-17)
- [x] **Phase 4: Auth & Verification Gate Hardening** - Server-side gate enforcement plus safe routing for half-onboarded, revoked, and expired-session states (completed 2026-06-17)
- [~] **Phase 5: Surface Polish (F-flags)** - Close the connected F5/F6/F12/F13/F2 fixes so seller and viewer states read correctly (BUILT 2026-06-17 · ⏳ UAT PENDING — F5/F12/WR-01/F6/F2 verified; F13 forced-failure path untested; see 05-HUMAN-UAT.md)
- [x] **Phase 6: Discover & Home UX** - Redesigned Discover list, propagated company logo/branding, and a Home profile-completion checklist (completed 2026-06-18)
- [ ] **Phase 7: Present Catalogue UX** - Product grid, quantity/basket, full product editing, expandable info, and banner controls
- [ ] **Phase 8: End-to-End Live Walk** - Verify a fresh unconnected company can sign up → Discover → request pricing → accept → chat, live

---

## Phase Detail

### Phase 1: Clean-Rebuild Foundation

**Goal**: A clean `supabase db reset` brings up onboarding + the `/c/[handle]` public profile page with no errors, with F3's foundation defined in committed migrations (not MCP-only).
**Mode:** standard
**Depends on**: —
**Requirements**: DATA-01, DATA-02, DATA-03
**Success Criteria** (what must be TRUE):

  1. `get_public_profile` is defined in a committed migration (DATA-01)
  2. `profile_qr_foundation` (person profile columns, `public_handle`, `avatars` bucket + policy) is a committed migration (DATA-02)
  3. A clean `supabase db reset` brings up onboarding + the public page with no errors (DATA-03)

**Plans**: 3 plans (complete)

### Phase 2: Cross-Tenant Lockdown

**Goal**: A caller only sees other companies' Discover + catalogue data when their own company is verified — no cross-tenant leak through REST or RPC.
**Mode:** standard
**Depends on**: Phase 1
**Requirements**: SEC-01, SEC-02, SEC-03
**Success Criteria** (what must be TRUE):

  1. Discover RPCs return data only to a verified caller (SEC-01)
  2. `product` + `pricelist_item` public-read policies scoped to `authenticated`; `anon` grant removed (SEC-02)
  3. An unverified/anonymous viewer cannot read another company's catalogue via REST or RPC (SEC-03)

**Plans**: 4 plans (complete)

### Phase 3: Admin Verification Surface

**Goal**: HS-team members can approve / reject-with-reason pending companies, audit-logged, gated against non-team users.
**Mode:** standard
**Depends on**: Phase 1
**Requirements**: VERIF-01, VERIF-02, VERIF-03, VERIF-04, VERIF-05
**Success Criteria** (what must be TRUE):

  1. An HS-team member sees companies pending verification at `/admin/verifications` (VERIF-01)
  2. Approve sets status `verified`; reject records a reason (VERIF-02, VERIF-03)
  3. Approve/reject actions are audit-logged (actor, company, outcome, reason, timestamp) (VERIF-04)
  4. A non-HS-team user cannot access `/admin/verifications` (route + RLS) (VERIF-05)

**Plans**: 4 plans (complete)

### Phase 4: Auth & Verification Gate Hardening

**Goal**: Server-side gate enforcement plus safe routing for half-onboarded, revoked, and expired-session states.
**Mode:** standard
**Depends on**: Phase 3
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04
**Success Criteria** (what must be TRUE):

  1. The licence/verification gate is enforced server-side, not only via the client flag (AUTH-01)
  2. A half-onboarded user is routed to a safe state, not a broken page (AUTH-02)
  3. A revoked company loses access to gated external actions (AUTH-03)
  4. An expired session is refreshed or redirected to login cleanly (AUTH-04)

**Plans**: 4 plans (complete)

### Phase 5: Surface Polish (F-flags)

**Goal**: Close the connected F5/F6/F12/F13/F2 fixes so seller and viewer states read correctly.
**Mode:** standard
**Depends on**: Phase 4
**Requirements**: POLISH-01, POLISH-02, POLISH-03, POLISH-04, POLISH-05
**Success Criteria** (what must be TRUE):

  1. A connected viewer can request pricing from a seller (F5 / POLISH-01)
  2. The Discover badge distinguishes connect vs pricing-request state precisely (F6 / POLISH-02)
  3. "Prices on request" shows only when the seller chose it (F12 / POLISH-03)
  4. A failed `profile_visible` / `price_public` toggle surfaces an error (F13 / POLISH-04)
  5. The ShopView carousel passes lint (`set-state-in-effect` fixed) (F2 / POLISH-05)

**Plans**: 3 plans (BUILT · UAT pending)

### Phase 6: Discover & Home UX

**Goal**: The Discover directory and the Home landing match Marcel's redesign, and a company's branding propagates from one edit point everywhere it appears.
**Mode:** mvp
**Depends on**: Phase 2, Phase 5
**Requirements**: UX-01, UX-07, UX-08, UX-09
**Success Criteria** (what must be TRUE):

  1. Discover renders as a full-width unstacked list (logo · name · location · tags · request button) with left company-type bubbles, center search/intro, and right country bubbles (DEV-78)
  2. Editing a company's logo/info on the Present/Company-Profile page propagates that branding everywhere it appears (DEV-70)
  3. The Hello Sello brand logo asset is uploaded and shown in the app shell (DEV-69)
  4. Home shows a ~5-block "complete your profile" checklist with pink/green completion state (DEV-68)

**Plans**: 4 plans
- [x] 06-01-PLAN.md — City data spine + one-writer branding + shared edit form + propagation + TopBar (UX-07) [wave 1]
- [x] 06-02-PLAN.md — Home profile-completion checklist derived from real data (UX-09) [wave 1]
- [x] 06-03-PLAN.md — Hello Sello brand logo swap in the app shell (UX-08) [wave 1]
- [x] 06-04-PLAN.md — Discover full-width redesign: 3-zone band, multi-select filters, pharmacy gate, Connect CTA (UX-01) [wave 2, depends on 06-01]
**UI hint**: yes

### Phase 7: Present Catalogue UX

**Goal**: A seller and a visiting buyer experience the Present catalogue as Marcel specified — a square-image product grid, quantity/basket flow, full product editing, expandable info, and banner-mounted controls.
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: UX-02, UX-03, UX-04, UX-05, UX-06
**Success Criteria** (what must be TRUE):

  1. Present products show as a 4-per-row grid with always-square images, groupable by shop (e.g. Germany / UK) (DEV-81)
  2. Each product has a quantity field with +/- steppers, and adding to basket shows a basket top-right, sorted per company across a two-company session (DEV-81)
  3. A seller can fully edit a product — rename, delete, re-sort/delete/upload images, download an image (single + download-all), upload a video (DEV-81)
  4. Present info fields expand on click to show more data (video links, pages, multiple warehouse addresses) and collapse on click-away / X (DEV-80)
  5. Present's "+Add products" / "Manage shop" controls live in the banner (top-right), reclaiming header space (DEV-79)

**Plans**: TBD
**UI hint**: yes

### Phase 8: End-to-End Live Walk

**Goal**: The whole front door is proven live with two real accounts — the milestone's core-value guarantee that a real stranger can enter the deal loop with no cross-tenant leak.
**Mode:** mvp
**Depends on**: Phase 2, Phase 3, Phase 4, Phase 5, Phase 6, Phase 7
**Requirements**: VALID-01
**Success Criteria** (what must be TRUE):

  1. A fresh, unconnected company can sign up → Discover → request pricing → (Aurora) accept → chat, verified end-to-end live (P12 / VALID-01)
