# Platform Foundations — Admin/Settings & Landing Page (Research & ROI Map)

> **What this is:** Cross-cutting research on the "must-haves" a B2B SaaS marketplace needs *outside* the core Discover→Connect→Deal surfaces — i.e. **account/org settings, admin, verification/trust surfacing, the landing/marketing page, the German/EU legal layer, and lifecycle notifications.** Synthesised from current (2024–2026) industry practice, then ranked by ROI (value ÷ effort) and folded against what Hello-Sello already has.
> **What this is NOT:** a build plan for any one item. It's the menu + priority order. Each Tier-1/2 item graduates into its own `docs/muskan-build/` plan when picked up.
> **Status:** Research done. Priority tiers are a recommendation, not yet locked into `ROADMAP.md` / `DECISIONS.md`. ✅ Accessibility scope resolved (2026-06-19): platform is strictly B2B (verified pharmacies/companies only), so *likely exempt* from BFSG — see §D.
> **Date:** 2026-06-19
> **Method / sources:** 4 parallel web-research passes (2024–2026 practice) across (1) B2B admin/settings & RBAC, (2) B2B landing/marketing pages & CRO, (3) German/EU web legal (DDG, DSGVO, UWG, BFSG, HWG), (4) B2B marketplace KYB/trust/onboarding. Sources cited per section. Cross-checked against existing Hello-Sello assets (append-only `audit_log`, verification flow, licence viewer view-only/signed-URLs).
>
> **⚠️ Legal note:** §D is general information, not legal advice. German digital/competition law is enforcement-heavy (Abmahnung culture). Have German IT/IP counsel review final templates and copy before launch — especially anything pharma-adjacent (§D6).

---

## Executive Summary

| Area | Finding |
|---|---|
| **Biggest retrofit risk** | Two things are cheap now and painful later: the **settings IA split** (my-settings vs org-settings) and **tenant-scoped RBAC**. Get the top-level shape right before features bolt on randomly. |
| **Biggest over-build trap** | Custom-role builders, policy engines, SCIM, self-built billing, and notification orchestration infra — all commonly built years before they earn their keep. Buy or defer. |
| **The admin confusion to avoid** | **Customer org-admin** and **platform back-office** are two different products for two different audiences. Build the customer's first; keep the internal one lean but locked down (top breach vector). |
| **Landing page leverage** | Outcome headline + one above-fold CTA + logo bar + a case-study-with-metrics block near the CTA. You're **gated** ("apply → verify → approved"), so the page must show a **demo/preview** — buyers can't self-validate a black box. |
| **Legal exposure** | Accessibility scope **resolved**: strictly B2B (verified businesses only) → *likely exempt* from BFSG. Cheap action remains (state "B2B only", keep the gate hard, confirm with counsel). Other deadlines still apply (Impressum §DDG citation, cookie Reject-parity, e-invoicing). |
| **Trust is a conversion lever** | The **verified badge** isn't just safety — verified members get more inquiries and close faster. You already verify; the win is *surfacing* it. |

---

## Categories

| # | Category | Covers |
|---|---|---|
| **A** | Account & Org settings | RBAC, settings IA, team mgmt, security, billing |
| **B** | Verification & Trust | Badges, KYB gate, review queue, profiles |
| **C** | Landing page | Hero, social proof, conversion, SEO |
| **D** | Legal / Compliance | Impressum, DSGVO, AGB, UWG, accessibility, HWG |
| **E** | Notifications & Lifecycle | Preference matrix + lifecycle emails |

---

## ROI-Ranked Build Roadmap

### 🔴 Tier 0 — Legal non-negotiables (not ROI — *exposure*)

Not "nice returns" — "legally exposed without them." Some deadlines already passed.

| Item | Cat | Flag |
|---|---|---|
| **Impressum** page, footer, ≤2 clicks | D | Cite **§5 DDG** not §5 TMG (law changed 14 May 2024) |
| **Datenschutzerklärung** (privacy policy) | D | Separate page, GDPR Art. 13/14 |
| **Cookie consent banner** | D | **Reject must be as prominent as Accept** — #1 Abmahnung trigger |
| **AGB** (B2B terms) | D | German GTC law applies even B2B — don't copy US ToS |
| **Accessibility** (BFSG / WCAG 2.1 AA) | D | ✅ **Resolved 2026-06-19:** strictly B2B (verified businesses only) → *likely exempt*. Action: state "B2B only / nicht an Verbraucher", keep gate hard, confirm with counsel |
| **UWG-clean landing copy** | D | No unprovable "best/#1"; dated price claims; greenwashing tightened Feb 2026 |
| **HWG check** (if pharma goods listed) | D | Rx ads only to verified professionals — highest-risk, needs specialist counsel |

### 🟢 Tier 1 — High ROI + hard to retrofit (build first)

| Item | Cat | Effort/Value | Note |
|---|---|---|---|
| **Settings IA split** — "my settings" vs "org settings" | A | Low / High | Top-level split can't be retrofitted cleanly |
| **3-role RBAC, tenant-scoped** (Owner/Admin/Member) | A | Low / High | Role is *per-company*, not global. Skip custom roles |
| **Team mgmt**: invite + list + role change + deactivate | A | Low / High | Deactivate must **kill sessions/tokens**, not just flip a flag |
| **Verified badge + status states** on profiles | B | Low / High | Already verifying — *surface it*. Badge is a conversion lever |
| **Landing hero**: outcome headline + 1 CTA + logo bar | C | Low / High | One CTA above fold. Buyer-outcome, not "what we are" |
| **How-it-works** 3-step (Discover→Connect→Deal) | C | Med / High | Critical for gated products — sells the path |
| **Review queue**: approve/reject **+ reason + resubmit loop** | B | Med / High | Flow + append-only `audit_log` exist ✅ — confirm resubmit path |
| **Lifecycle emails**: verification approved/rejected, new match/message | E | Low–Med / High | Highest-engagement emails in any marketplace |

### 🟡 Tier 2 — Solid ROI (build second)

| Item | Cat | Effort/Value |
|---|---|---|
| **MFA** (enforce for admins) + session list | A | Med / High |
| **Notification preference matrix** (category × channel) | E | Low / Med |
| **Billing tab stub** + Billing-Admin role boundary | A | Low / High — scaffold now, wire Stripe later, never self-build |
| **Case-study / metrics social proof** block near CTA | C | Med / High |
| **Company profile** trust details (registration, licence, location) | B | Low / High |
| **FAQ + Pricing / "Request access"** sections | C | Low / Med |
| **SEO basics**: title tag, H1=hero, LCP < 2.5s | C | Low / High |
| **Gated funnel polish**: progress checklist + "reviewed within X days" | B | Low / High — kills drop-off |

### ⚪ Tier 3 — Defer until something *pulls* it

| Item | Why wait |
|---|---|
| SSO → SCIM → custom roles | Only when enterprise sales demands; buy (WorkOS), don't build |
| Risk-based auth, SIEM export | Needs security-conscious customer base |
| Ratings/reviews | Gate to *verified transactions*; empty reviews hurt more than help |
| Automated KYB vendor (Persona/Sumsub) | Only at verification scale; manual review fine early |
| Self-built billing / notification infra | Classic over-build — buy it |

---

## §A — Account & Org Settings (detail)

**The customer is the org, not the user.** Settings split into two clearly separated buckets.

- **Org/workspace settings** (admin-gated): general/profile · members & roles · billing · security (SSO, MFA policy, sessions) · integrations/API · audit log · branding.
- **User settings** (self-serve): profile · password & 2FA · notification prefs · sessions · language.

**RBAC:** start **Owner / Admin / Member**, tenant-scoped (same person can hold different roles in different orgs). Add a 4th role (e.g. Billing Admin) only when a real workflow needs it. Permissions checked server-side. Skip custom-role builders / policy engines until enterprise pull.

**Team mgmt:** email invites + pending/resend/revoke · member list + role change · deactivation done *right* = mark inactive **and** terminate sessions + revoke tokens. SSO (SAML/OIDC) and SCIM are deal-gated — buy a provider, don't build, and only when sales needs them.

**Security table-stakes:** MFA available to all + enforced for admins · session list + revoke · audit log of security events (you have append-only `audit_log`). Risk-based auth / SIEM = later.

**Billing:** even pre-monetization, scaffold the **Billing tab + Billing-Admin boundary** so it's not a retrofit. Use a provider (Stripe Customer Portal). Never build billing infra.

**Customer-admin vs platform-back-office:** different products. Customer org-admin = built into the product, polished, self-serve, role-gated — build **first**. Platform back-office = separate internal tool (verification queue, suspend, impersonate-for-support, refunds, flags); can start lean (Retool/scripts) but lock it down hard (separate auth, MFA, audit every action — these panels are a top breach vector).

*Sources:* WorkOS (RBAC providers; user management for B2B), Permit.io (multi-tenant authz), Descope (RBAC/SCIM providers), Memorable.design (settings page examples 2026), SSOJet (SSO/SCIM 2026), supastarter / LoginRadius / Atlant (SaaS auth & security 2026), m3ter / Schematic / Lago / FastSpring (billing), Forest Admin / Refine / Vaadata (admin panels & their weaknesses).

## §B — Verification & Trust (detail)

KYB ("Know Your Business") is the core trust primitive for a gated platform, not a compliance afterthought.

- **Surfacing:** verified badge on profiles + listings (highest-signal marker) · explicit status states (unverified/pending/verified/rejected) shown to the member · optional "what was verified" explainer.
- **Gated funnel** (apply → verify → approved): drop-off concentrates at the **wait**. Fixes are cheap: progressive profiling (defer heavy doc collection), visual checklist + progress, **communicate the approval timeline** ("reviewed within X days"), unambiguous doc requirements, reminder emails.
- **Review queue (back-office):** reviewer queue by status · approve/reject **with structured reason** · **"return with changes" / resubmit loop** (reject-only discards recoverable applicants) · append-only audit trail · in-context document viewer (view-only + signed URLs — you have this ✅).
- **Profiles** build trust via: badge + what-was-verified · core company details · (later) ratings/reviews gated to *verified* transactions — empty/unverifiable reviews hurt more than help early.
- **Two-sided cold-start:** go **supply-first** (no supply = no value to buyers), watch liquidity balance, spotlight verified providers. Avoid parallel both-sides spend.

*Sources:* iDenfy / Sumsub / Shufti / Persona / Vespia (KYB), Zigpoll / Tipalti / GBG / CS-Cart (onboarding), Reforge / Stripe / Sharetribe (cold-start), BoldTech / Athento / altaFlow (review workflows), FixNHour / Trajectory / Dokan (trust signals), Customer.io / Vero / Mailchimp (lifecycle emails).

## §C — Landing Page (detail)

Proven section order: **Hero → logo bar → value props (3–4 outcomes) → how-it-works (3-step) → features → deeper social proof (case study + metrics + testimonials) → pricing / request-access → FAQ → final CTA band → footer (legal!).** Repeat the CTA at ~3 readiness stages.

- **Hero:** outcome headline (<8 words, buyer's problem not "what we are") · subhead that narrows the audience · **exactly one** primary CTA above the fold · product visual/demo > abstract illustration.
- **Social proof (B2B):** case studies with specific outcomes (strongest) > metrics > customer logos > named testimonials > third-party badges. Place **near the CTA/form**, not only at the bottom.
- **CRO:** single primary action; action-oriented CTA copy; minimise form fields (3 max for self-serve). B2B caveat: a clearly-secondary "Talk to sales" alongside the primary is acceptable when motions differ.
- **Gated (you):** the page must replace "try it" with a **demo/interactive walkthrough** + set expectations ("apply → reviewed in X days → onboard"). Don't gate a black box.
- **Two-sided:** if buyers + sellers share the page, give a **clear split path** high up, **separate value props per side**, and show **liquidity** (the other side exists). Sub-landing pages per side often beat cramming both into one.
- **SEO:** title tag (≤60 chars, keyword front-loaded) · H1 = hero headline · meta description 150–160 chars · **LCP < 2.5s**. Keep the conversion CTA most prominent; SEO supports, doesn't dominate.

*Sources:* Instapage, SaaS Hero (CTA / friction / social proof), Flow Agency, Genesys Growth (2026), Discovered Labs, Converzive, ConversionTeam, Ordway / Supademo (gated vs self-serve), Sharetribe / Stripe (two-sided), Landingi / The SEO Works (SEO).

## §D — Legal / Compliance (detail) — *general info, not legal advice*

| Requirement | Where it lives | Status / deadline |
|---|---|---|
| **Impressum** (§5 DDG) — registered name, legal form, postal address, email + rapid contact, Handelsregister + number, VAT/W-IdNr, Geschäftsführer, supervisory authority if regulated | Footer link "Impressum", ≤2 clicks, own page | In force (DDG replaced TMG 14 May 2024) — **update any "§5 TMG" citation** |
| **Datenschutzerklärung** (GDPR Art. 13/14) | Separate footer link, own page | In force — do **not** merge into cookie banner |
| **Cookie consent** (TDDDG §25 + GDPR) — opt-in before non-essential cookies, **equal-prominence Reject**, granular first-layer info | First-visit banner | In force; fines to €300k. (Optional 2025 PIMS/EinwV path can skip banner) |
| **AGB** (B2B GTC) — drafted to §§305–310 BGB, not US-style | Footer link + signup acceptance | In force |
| **UWG** marketing copy | The landing/marketing pages | In force; amended Feb 2026 (greenwashing/durability tightened). Risk: superlatives, dated price claims, comparative ads |
| **BFSG / WCAG 2.1 AA** accessibility | Whole site (if in scope) | ✅ **Resolved 2026-06-19:** Hello-Sello is strictly B2B (verified pharmacies/companies only, no consumer transactions) → *likely exempt*. In force since 28 Jun 2025 for non-exempt sites. Action: state "B2B only / nicht an Verbraucher" on the site, keep the verification gate hard, confirm with German counsel. Revisit if any consumer-facing transaction is ever introduced |
| **HWG** (if medicinal/pharma-adjacent listings) | Product/listing pages + audience gate | In force. Rx ads only to **Fachkreise** (verified professionals); §4 Pflichtangaben; comparative ads banned. Highest-risk — specialist counsel |

**Also flag (not website footer items):** P2B Regulation (EU 2019/1150) applies *if* business users sell to consumers — adds T&C transparency + statement-of-reasons + complaint handling (enforced by Bundesnetzagentur); **determine which side of this line the marketplace sits on**. E-invoicing mandatory in German B2B since 1 Jan 2025 (billing team).

*Sources:* DRIVE / Qualimero / qx137 (Impressum/DDG), Kukie.io / dsgvo-vergleich / Usercentrics (cookie/TDDDG), TermsFeed / Bundesnetzagentur / ICLG (P2B & GTC), SEIFRIED IP / Taylor Wessing (UWG), Bird & Bird / Sunzinet / uhura (BFSG/EAA), ICLG / CMS / PubMed (HWG/AMG).

## §E — Notifications & Lifecycle (detail)

- **Preference store:** model as **category × channel** (in-app / email toggles per event type), keyed so adding a channel/event doesn't reshape the data model. Honour transactional vs marketing split. Quiet hours / digests / batching = later, once volume grows. Buy infra (Knock/MagicBell/SuprSend) only if volume justifies.
- **Lifecycle emails (highest-engagement type):** verification approved ("you're in" + first action) · verification rejected/needs-info (specific fix + resubmit link) · new match · new message/deal · incomplete-onboarding reminder · welcome. Each = one clear action + real context.

*Sources:* SuprSend / MagicBell / Equal.design (notification architecture), Customer.io / Vero / Mailchimp (lifecycle emails).

---

## Two Hello-Sello-specific calls

1. **Accessibility scope — resolved (2026-06-19).** Strictly B2B (verified pharmacies/companies only, no consumer transactions) → *likely exempt* from BFSG. Remaining action is cheap: state "B2B only / nicht an Verbraucher" on the site, keep the verification gate hard, confirm with German counsel. Revisit only if a consumer-facing transaction is ever introduced.
2. **Customer-admin before platform-admin.** Customers can't self-serve without org-settings; build that first. Keep the internal back-office lean but hard-locked.

---

## Suggested next steps

1. Add the **"B2B only / nicht an Verbraucher"** statement to the site (cheap action from the resolved accessibility scope; keep the verification gate hard).
2. Promote Tier-1 items into `ROADMAP.md` phases / `docs/muskan-build/` plans as they're picked up.
3. Per the prototype-first rule: **prototype the landing page** (Tier-1 anatomy) before building it.
