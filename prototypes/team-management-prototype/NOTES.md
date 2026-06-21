# Team-management prototype — NOTES

**Phase 11** (RBAC Activation & Company Team). Throwaway HTML/CSS/JS — **not** React. Open `index.html` in a browser.

## What this is
A sign-off mock for the standalone `/team` page (D-14) where a **Superadmin** manages their company's people. It renders the data + drives the same `{ ok } | { error }` results the real page will get from the plan-05 actions (`listTeam` / `inviteMember` / `changeMemberRole` / `removeMember`). All four flows are clickable; a switcher pinned at the bottom jumps straight to each error/edge state.

## The four flows (the contract to sign off)
| # | Flow | What you see |
|---|---|---|
| **1** | **Member list** | Name + email rows with a **role badge** (Superadmin = pink, Member = grey) and a **Pending** badge (amber) for invited-not-accepted. "You" tag on your own row. |
| **2** | **Invite modal** | "Invite member" → modal with **Email** + **Role select defaulting to Member (D-08)**. The **D-09** state shows *"This email already has a Hello-Sello account"* inline. |
| **3** | **Inline role change** | Per-row **Member↔Superadmin** dropdown. Demoting the **last Superadmin** is blocked (**D-15**) → *"Promote another Superadmin before changing this one"* shown under the row; the select reverts. |
| **4** | **Remove + confirm** | "Remove" → confirmation dialog explaining soft-detach (access revoked, account + authored data kept, re-invitable). Removing the **last Superadmin** is blocked (**D-15**) → *"Promote another Superadmin before removing this one"* inside the dialog. |

## Copy is the source of truth
The error strings are copied **verbatim** from `src/app/team/actions.ts` (plan 05) so the build matches:
- Invite / existing account (D-09): **"This email already has a Hello-Sello account"**
- Invite / bad email: **"Enter a valid email address"**
- Role change / lockout (D-15): **"Promote another Superadmin before changing this one"**
- Remove / lockout (D-15): **"Promote another Superadmin before removing this one"**

## How to drive the demo
- **Invite → existing account:** type any email containing `existing` (e.g. `colleague@existing-account.de`) and Send, or use the switcher.
- **Demote / Remove last Superadmin:** use the switcher buttons — they simulate the server-side D-15 guard firing.
- Esc / backdrop-click closes dialogs.

## Decisions reflected (from 11-CONTEXT.md)
- **D-08** role select defaults to Member · **D-09** existing-account message · **D-14** standalone page (does **not** pull the Phase 13 user-vs-org Settings split forward) · **D-15** last-Superadmin lockout on both demote and remove · **D-16** prototype-first sign-off.
- Pending members have **no** role select / remove (no `person` row yet — derived from auth state).
- Remove copy reflects **D-10 soft-detach**: access revoked + session ended, account + authored data intact, re-invitable.

## What's deliberately NOT real yet
- The page is **Superadmin-gated server-side** in the real build (page redirect/not-authorized) — not modelled in a static mock.
- Real names/emails/avatars, live counts, and the partial-success revoke-retry toast are illustrative.
- Layout will become a Next.js server component (`page.tsx`) + client component (`TeamClient.tsx`) wired to the existing actions; this is a look/copy/states swap, not a rebuild.

## Open design questions for sign-off
1. **Self-remove / self-demote** — allowed in this mock (guarded only by the last-Superadmin rule). OK to let a Superadmin remove/demote themselves when another Superadmin exists, or hide those controls on your own row?
2. **Role badge vs. always-visible select** — Member rows show *both* a grey "Member" badge and the dropdown. Keep both, or drop the badge where the select already shows the role?
3. **Pending row actions** — currently read-only (no resend/revoke-invite). Add a "Resend / Cancel invite" affordance now, or defer (no plan-05 action exists for it yet)?

## Next
Sign off on **layout + copy + states**, then `/gsd:execute-phase 11` Task 2 builds it in React (`src/app/team/page.tsx` + `TeamClient.tsx`) against the plan-05 actions.
