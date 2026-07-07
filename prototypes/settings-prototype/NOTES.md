# settings-prototype

**Throwaway prototype — Phase 13 (Settings home & account lifecycle).** This prototype IS the
visual + interaction spec for the React build (13-08 / 13-09 / 13-10). Open `index.html`
directly in a browser — no build, no server, no data. Theme tokens mirror
`prototypes/present-redesign-prototype` (which mirrors `src/app/globals.css`): raspberry
`--brand:#e30b5d`, aurora radial background, glass surfaces, the left icon rail.

> **The dark top bar is prototype chrome, not the product.** It flips demo states:
> **View as** (Superadmin ↔ Member), **Sole Superadmin** (D-11 guard on/off), and
> **Preview reactivation screen**. None of it ships.

This plan (13-06) is a **hard gate**: the settings build (13-08/09/10) does not start until
Muskan signs this layout off (D-08 — same prototype-first gate used for verified-badge,
landing, team, and Present).

---

## Layout decisions locked here

| Area | What the prototype shows | Decision |
|---|---|---|
| Shell | Far-left app icon rail (Home/Present/Connect/**Settings**) → a **256px settings sidebar** → content panel | mirrors real B2B settings (Linear/Vercel/Stripe) |
| Sidebar | **One `/settings` home, vertical left sidebar, flat one-level list** — every setting is one click, no nested accordions | **D-01** |
| Zones | **Personal** (top) and **Organization** (below) split by a **thin hairline + small "Organization" label** — subtle, not a hard wall | **D-02** |
| Org gating | The whole **Organization** group is **Superadmin-only** — the "View as → Member" toggle makes it disappear | **D-03** |
| Re-home | `/account` → **Profile** + **Login & security**; `/team` → **Organization → Team** | **D-04** |

## Panel → D-/DEV- reference map

| Sidebar item | Zone | Panel mocks | D-/DEV refs |
|---|---|---|---|
| **Profile** | Personal | Read-only detail rows (name / email / photo / role) with explicit **Change** buttons (no dead editable fields) | D-04 (absorbs `/account`) |
| **Login & security** | Personal | **(a)** signed-in **change-password** form; **(b)** **linked Google/Outlook** accounts with unlink; **(c)** Danger zone = Deactivate + Delete | D-05, D-09, D-10, D-11 |
| ↳ change password | | Current / new / confirm + "set a password as a backup if you only use OAuth" hint | **D-05** (reuses P10 `/reset-password` form) |
| ↳ linked accounts | | Unlink each identity; **when only one remains, its Unlink locks** with a guard message ("this is your only way to sign in") | **D-05** + Claude's-discretion sole-identity guard |
| ↳ Deactivate | | Reversible soft-disable — "take a break", reactivate on next sign-in; confirm modal | **D-09** (reuses P11 soft-detach) |
| ↳ Delete | | GDPR erasure request: **password re-entry** + **30-day grace** microcopy + "audit kept anonymized" | **D-09 / D-10** |
| ↳ Sole-Superadmin lockout | | When you're the only Superadmin, a warning banner shows and **Deactivate + Delete are disabled** | **D-11** (mirrors P11 last-Superadmin guard) |
| **Notifications** | Personal | **Read-only** list of the always-on transactional emails + a "marketing & in-app coming later" note. **No live toggles.** | **D-19 / D-20** (honesty over theater) |
| **Company profile** | Organization | Read-only company detail rows + Change buttons | D-04 |
| **Team** | Organization | Re-homed `/team` — member list + pending join requests | D-04, P11/P12 |
| **Security** | Organization | **Company-deactivate** (reversible) + "no self-serve hard-delete, contact HS" copy. Thin tab. | **D-06 / D-12** |
| **Reactivation interstitial** | (pre-app) | Full-screen "your account is deactivated — reactivate?" gate; conditional "scheduled for deletion in N days — reactivating cancels that" line | **Open-Q #3** (13-RESEARCH) |

## Microcopy that's load-bearing (carry verbatim into React)

- **Deactivate:** "like taking a break… nothing is deleted… next sign-in we'll ask if you want to reactivate."
- **Delete grace (D-10):** "You have **30 days to change your mind**… after 30 days your name, email and photo are permanently scrubbed — this can't be undone. Your company's audit history is kept in anonymized form, as the law requires."
- **Sole-Superadmin lockout (D-11):** "You're the **only Superadmin** of {Company}… promote another Superadmin, or deactivate the whole company first."
- **Unlink guard (D-05):** "This is your only way to sign in. Link another account before unlinking."
- **Notifications (D-19/20):** "These are transactional… **always on**, so there's nothing to switch off here. We show them for transparency." + "We won't add switches until there's something real behind them."
- **Company deactivate (D-12):** "There's **no self-serve way** to permanently delete a company… contact Hello Sello."

## How to verify (from 13-06 Task 2)

1. Open `index.html` in a browser.
2. Sidebar + the **thin** Personal↔Organization differentiation reads right (D-01/D-02).
3. **View as → Member** → the Organization group disappears (D-03). Switch back to Superadmin.
4. **Login & security**: update-password form; unlink one linked account → the last one's **Unlink locks** (guard); open **Delete** → password field + 30-day grace + (flip **Sole Superadmin → On**) the lockout banner disables Deactivate/Delete.
5. **Notifications** is read-only (no dead toggles); **Preview reactivation screen** reads clearly.

## Intentionally out of scope for this mock

- Real forms / validation / persistence — this is a visual + interaction contract only.
- The email **templates** (SET-03) and the erasure **backend** (SET-02 RPCs, pg_cron sweep) — separate plans.
- Language / theme / timezone / billing / API-keys / SSO — deferred (13-CONTEXT Deferred Ideas).
- MFA + active sessions (SET-05) — Phase 14.

## Open for Muskan's sign-off

- Sidebar item **names + order** (Profile · Login & security · Notifications | Company profile · Team · Security).
- Whether Deactivate/Delete should each get a full confirm modal (shown) vs an inline expand.
- Whether the far-left app rail belongs in the mock or is just context (it's context here).
- Any copy tweaks to the sensitive Delete / lockout / company-deactivate messaging.

> **Resume signal:** type **"approved"** to unblock 13-08/09/10, or describe layout/copy
> changes to fold into `index.html` first.
