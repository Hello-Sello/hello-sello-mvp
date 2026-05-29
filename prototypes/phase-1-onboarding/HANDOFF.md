# Phase 1 Onboarding — Frontend Handoff

**Audience:** Frontend designer working on the real implementation of Phase 1 (signup → first connection).
**Source artifact:** This folder's prototype. Run with `python3 -m http.server 8765` and open `http://localhost:8765`.
**Status:** Throwaway prototype. When the real screens ship in production, fold the locked decisions into the production codebase and delete this folder.

---

## Purpose of the prototype

Answered two product questions:

1. **Where in the user journey does company setup, profile, and contact import happen?**
2. **What pattern do we use for onboarding** — wizard, dashboard, modal sequence, or hybrid?

**Answer locked:** modal-sequence (each step skippable) + LangSmith-style checklist on the home page for items left to do.

---

## Locked decisions (do not redesign these)

| # | Decision | Why |
|---|---|---|
| 1 | **Modal-sequence onboarding** with skip-each-step | Forces user to see each item once; skip keeps friction low; checklist on home gives them back |
| 2 | **Dark theme** for auth screens (signup, email verify, signin); **light theme** in-app | Auth is pre-platform; in-app is where users live |
| 3 | **No Sell/Buy/Both selection** at company setup | Every user can be either at any time; role is per-deal not per-company |
| 4 | **License upload is optional** at company setup | Verification can happen async or in person |
| 5 | **Home page** = teammate's design (Sella chat interface) | Out of scope for this handoff; we only need a placeholder |
| 6 | **Checklist on home** = top section, LangSmith-style | Dismissible (×); shows progress as `n/4` |
| 7 | **Verification banner** persistent on home until verified | Sets clear expectation; locks external actions |
| 8 | **Professional, neutral tone** in all user-facing copy | No internal references (team-member names, DEV-XX tags) |

---

## Flow at a glance

```
[Dark theme]
 1. Sign up
 2. Email verification (simulated for the prototype)
 3. Sign in

[Light theme]
 4. Set up company  (name + country + optional license upload)

[Clean white background — modal sequence begins]
 5. Application submitted dialog
 6. Connect Gmail / Outlook  (or skip)
 7. Complete profile          (or skip)
 8. Add company details       (or skip)
 9. Set up team               (or skip)
10. Welcome to Hello Sello    (celebratory arrival)

[Home page appears]
11. Home  — LangSmith-style checklist + verification pending banner + Sella chat (teammate's design)
```

---

## Screen catalogue

### Auth screens (dark theme)

#### 1. Sign up

| | |
|---|---|
| **Fields** | First Name · Last Name · Email Address · Password · Confirm Password |
| **Taglines** (above fields) | ✓ Register to get a QR code business card · ✓ Enter a network to buy and sell B2B |
| **Primary CTA** | Create Account (indigo) |
| **Secondary** | "Already have an account? Sign in" |
| **Writes** | `person` row with `email_verified: false` |
| **Validation** | Password ≥ 8 chars, confirm must match |

#### 2. Email verification

| | |
|---|---|
| **Content** | "We sent a verification link to {email}" |
| **Primary CTA** | "I've verified my email" (simulated in prototype) |
| **Secondary** | Resend |
| **Writes** | Updates `person.email_verified: true`, `verified_at` |

#### 3. Sign in

| | |
|---|---|
| **Title** | WELCOME BACK |
| **Fields** | Email Address · Password |
| **Primary CTA** | Sign in |
| **Secondary** | Forgot password? |
| **Writes** | Session token (no DB row created on signin itself) |

### Setup screen (light theme)

#### 4. Set up your company

| | |
|---|---|
| **Fields** | Company name · Country dropdown · License/certificate (optional file upload — dropzone UI) |
| **Helper** | "Upload your business license or trade certificate so our team can verify your company." |
| **Primary CTA** | Create company → (always enabled) |
| **Writes** | `company` row + updates `person.company_id` + `person_group` row (Superadmin) |
| **States** | Empty dropzone · File selected (emerald chip with filename + ×) |

### Modal sequence (clean white background; home is NOT visible behind)

#### 5. Application submitted dialog

| | |
|---|---|
| **Icon** | Green ✓ in circle |
| **Title** | Application submitted |
| **Body** | "We've received your company information. The Hello Sello team will verify your account within 12 hours. You'll receive an email confirmation once verification is complete." |
| **Secondary** | "In the meantime, finish setting up your account." |
| **CTA** | Continue *(no skip — pure info confirmation)* |

#### 6. Connect your email

| | |
|---|---|
| **Icon** | 📧 |
| **GDPR callout** | "GDPR-safe: Metadata only — no subject lines, no email bodies, no third-party enrichment." |
| **Options** | Connect Gmail · Connect Outlook |
| **Skip** | "Skip for now" |
| **Writes** | One `contact_record` row per imported contact |

#### 7. Complete your profile

| | |
|---|---|
| **Fields** | Display name (prefilled from signup) · Title/role · Phone · Language |
| **CTAs** | Save · Skip |
| **Writes** | `person.preferences` (JSON) — title, phone, language |

#### 8. Add company details

| | |
|---|---|
| **Fields** | Street address · Description (textarea) · Primary products · Website |
| **CTAs** | Save · Skip |
| **Writes** | `company` row's extra fields (address, description, primary_products, website) |

#### 9. Set up your team

| | |
|---|---|
| **Fields** | Checkbox list — Sales Team · Procurement Team · Compliance/QA · Approver |
| **Helper** | "Permissions auto-default to sensible values per Group. Customize from Settings later." |
| **CTAs** | Save · Skip |
| **Writes** | `group` rows for selected + `permission_matrix_entry` rows for default permissions |

#### 10. Welcome to Hello Sello — celebratory arrival

| | |
|---|---|
| **Icon** | 🎉 |
| **Title** | Welcome to Hello Sello, {first_name} |
| **Body** | "You're all set. While your company is being verified, you can explore the platform and finish any setup steps you skipped from the home checklist." |
| **CTA** | Enter Hello Sello → |

### Home page (light theme, full layout)

#### 11. Home

| | |
|---|---|
| **Top bar** | Display name · @ company name |
| **Checklist** (dismissible) | "Welcome to Hello Sello" label · 4 progress dots · `n/4` counter · 4 tiles |
| **Tiles** | Connect Gmail · Profile · Company details · Team |
| **Tile states** | Pending (pink "Set up ↗") · Done (emerald ✓) |
| **Verification banner** | "Verification pending · Your company is being reviewed..." · [Dev simulate button — remove in production] |
| **Home view area** | **Teammate's design goes here** (Sella chat interface — separate spec) |

---

## Visual states to design (per screen)

| Screen | States to mock |
|---|---|
| Sign up | Empty · filled · password-mismatch · loading · server-error |
| Email verify | Pre-click · clicked · resent · error |
| Sign in | Empty · filled · wrong-password · loading |
| Company setup | Empty dropzone · file selected · file rejected (wrong type/size) · submitting |
| Each modal | Empty · filled · loading |
| Home checklist | 0/4 · 1/4 · 2/4 · 3/4 · 4/4 · dismissed |
| Verification banner | Pending (amber) · verified (emerald) |

---

## Open UI questions (decide during real design)

| # | Question |
|---|---|
| 1 | Drag-and-drop hover state for the dropzone — visual feedback during drag |
| 2 | Re-opening a done tile — show "Edit" mode or just re-open the form? |
| 3 | After 4/4 done — does the checklist auto-disappear, or wait for dismiss? |
| 4 | Once verified — does the banner auto-hide after N seconds or stay until dismissed? |
| 5 | Inline validation / error styling (no design system locked yet) |
| 6 | Loading-spinner pattern (no design system locked yet) |
| 7 | Mobile layout — modals as fullscreen sheets? Tiles as vertical stack? |
| 8 | "Skip" confirmation dialog — yes/no? (Current: silent skip) |

---

## Tone reference (locked)

Every user-facing string should be **professional, neutral, and brand-consistent**. Specifically:

- ❌ No internal team-member names (Marcel, Victor, etc.)
- ❌ No internal Linear issue tags (DEV-3, DEV-40, etc.)
- ❌ No "MVP" / "in-progress" / dev-jargon
- ✅ Match the warm-but-professional tone the signup screen sets
- ✅ Cannabis-pharma neutral (no slang, no medical claims)

---

## Reference

| Resource | Path |
|---|---|
| Prototype source | This folder |
| Live prototype | `python3 -m http.server 8765` → `http://localhost:8765` |
| Database schema (in progress) | `docs/architecture/SCHEMA-DRAFT.md` |
| Locked decisions log | `docs/decisions/DECISIONS.md` |
| Layer docs | `docs/product/layers/LAYER-1-USERS-AND-CORE-OBJECTS.md` |

---

## When to delete this handoff

Once the real Phase 1 screens are built in production:

1. Promote any still-relevant locked decisions to `docs/product/surfaces/` or `docs/decisions/DECISIONS.md`
2. Open UI questions either get resolved (folded into a real design system doc) or moved to Linear
3. Delete `prototypes/phase-1-onboarding/` entirely
