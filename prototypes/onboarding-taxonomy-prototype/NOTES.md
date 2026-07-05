# Onboarding taxonomy prototype (DEV-99 #3) — throwaway

**Question:** How should the two-level business taxonomy look/behave in onboarding, and where does the show-password eye go?

**Answer (decided with Muskan, 2026-07-03):**
- **Two levels** — Business Category (5 + Custom) + Business Activities (8) — as **dropdown multiselects** (not always-visible chips). Checkbox panel; closed bar shows the selected list as a summary. Both **required** (≥1 each), validated **on submit**.
- **Custom category:** last option in Business Category; ticking it reveals an **inline** free-text box *inside the panel* (typing keeps the dropdown open — user does NOT close to type). Value → `custom_label` on the assignment row (required when Custom chosen). Extends beyond Marcel's fixed 5 → flag to Marcel.
- Both controls use the **exact MVP `Field`/select styling** (`AuthCard.tsx`): `rounded-xl`, `border-ink/30`, `bg-white/90`, `focus:ring-2 ring-brand-soft`.
- **Show-password eye** lives **inside** the password box (right side), on the same MVP `Field` box. Semantic `<button>`, stable `aria-label` ("Show/Hide password") + `aria-pressed`, keyboard operable.

**Run:** `python3 -m http.server 8791` inside this folder → http://127.0.0.1:8791/

**Next:** fold these decisions into the real build (`OnboardingStepper.tsx` dropdowns + a reusable `PasswordField`). Delete this prototype once built.
