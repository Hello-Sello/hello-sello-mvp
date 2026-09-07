# T08 · Remove the nav entry and both Discover CTAs — PLAN

ADR 0009, FR8, I-M14. TICKETS.md T08. Depends on T03 (live). Parallel-safe with T07 — already
verified disjoint (T07's own G4 walk confirmed this exact set of dead links, nothing overlaps).

**Revised after `plan-checker` round 1: REVISE, 0 blocking, 6 notes.** N1 (held — the locked
prototype already renders this exact treatment, and it keeps the arrow I'd dropped), N2 (held —
a wrong citation in my own reasoning, fixed), N5 (held — the verification grep was scoped too
narrowly to catch `surfaces.ts`) all folded in below. N3 (a real affordance-loss regression in a
second, previously-unnoticed mount point) and N4 (name the real behavior changes) folded in as a
new section. N6 (two more stale comments outside T08's 3 declared files) — not fixed, matches
TICKETS.md's own "Files: three" fence; recorded as follow-up debt only.

## A real judgment call TICKETS.md leaves open — flagged before writing any code

TICKETS.md/the ADR/the PRD all say "remove" the two CTAs, but neither `ConnectActions.tsx`'s
"incoming" branch nor `CompaniesSection.tsx`'s equivalent is a bare link — each is a full
UI branch (copy + icon + navigation) for `ConnectionState === "incoming"`. Checked before
deciding: no test file asserts this branch's exact copy or `href` (`CompaniesSection.test.tsx`
only exercises `connectionState: 'none'`; `ConnectActions.tsx` has no test file at all) and
`DECISIONS.md` has no ruling on what should render in its place. Two readings of "remove":

1. **Delete the whole branch.** For `ConnectActions.tsx`, this makes an "incoming" company fall
   through to `phase === "sent"` (false — `phase` only starts `"sent"` for `state === "requested"`)
   and then to the default form: a company that already sent the viewer a connect request would
   see an invitation to send a NEW one. Confusing, and not obviously what "remove the CTA" meant.
2. **Keep the informational content, drop only the link.** The PRD's own AC5 wording is precise
   about what must disappear: *"no Discover company row/page shows a 'wants to connect → open
   inbox' link"* — the link, not the fact that the company wants to connect. This plan takes this
   reading: replace the clickable `Link`/`<a>` with a plain, non-interactive "wants to connect"
   indicator, same visual weight as the sibling `connected`/`requested` states in the same file
   (both already render as non-interactive spans), just without the broken destination.

Flagged for `plan-checker`/`critic` to challenge; recorded here so it reads as a decision, not an
improvisation buried in a diff.

## File 1 — edit `src/shared/ui/surfaces.ts`

Delete the `"inbox"` child entry and its comment (`:54-55`) from the `connect` surface's
`children` array — two lines, one array element. The `Inbox` icon import (`:10`) becomes unused
once this is gone (confirmed: no other use of `Inbox` anywhere in this file) — remove it from the
`lucide-react` import list too.

## File 2 — edit `src/app/discover/[companyId]/ConnectActions.tsx`

Replace the `"incoming"` branch (`:41-49`):

```tsx
if (state === "incoming")
  return (
    <Link
      href="/connect/inbox"
      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-soft/60 px-5 py-3 text-sm font-bold text-brand-deep hover:bg-brand-soft"
    >
      {companyName} wants to connect — open inbox →
    </Link>
  );
```

with a non-interactive `div`, same classes as the `"connected"` branch two cases above it (only
the *container styling* matches `"connected"`'s classes — corrected after `plan-checker` N2: the
`"connected"` branch itself is a `Link`, still interactive; the actual same-element precedent in
this file is the `phase === "sent"` branch three cases below, which is already a plain `div`):

```tsx
if (state === "incoming")
  return (
    <div className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-soft/60 px-5 py-3 text-sm font-bold text-brand-deep">
      {companyName} wants to connect
    </div>
  );
```

`Link` (the `next/link` import) stays — still used by the `"connected"` branch immediately above
(`href="/connect/chat"`).

## File 3 — edit `src/app/discover/sections/CompaniesSection.tsx`

Replace `ConnectButton`'s `"incoming"` branch (`:98-104`):

```tsx
if (state === "incoming")
  return (
    <a href="/connect/inbox"
      className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft/60 px-4 py-2 text-sm font-semibold text-brand-deep hover:bg-brand-soft">
      Wants to connect <ArrowRight size={14} />
    </a>
  );
```

with a non-interactive pill, matching the `"connected"`/`"requested"` branches' own shape (plain
`span`, no `href`) — **corrected after `plan-checker` N1: keep the arrow, not drop it.** The
original draft removed the arrow reasoning "nowhere left for it to point"; that was an
unauthorized divergence from the locked screen — `prototypes/discover-linkedin-prototype/
index.html:426` (rules locked 2026-07-22, `NOTES.md:14`) already renders this exact state as
`<span class="pill-static pill-incoming">Wants to connect ${ic('arrowR',14,2.2)}</span>` — a
non-interactive pill that KEEPS the arrow. Per `.claude/rules/product.md`, the locked screen is
the spec; the live `<a href>` was the divergence, and restoring the pill should restore its full
shape, not a variant of it. (Corroborated independently: `NewPeopleSection.tsx:64-69` already
ships the identical pattern — the same non-interactive "Wants to connect" span with its arrow —
for the person graph; this is that markup, not a new invention.)

```tsx
if (state === "incoming")
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft/60 px-4 py-2 text-sm font-semibold text-brand-deep">
      Wants to connect <ArrowRight size={14} />
    </span>
  );
```

`ArrowRight` (the `lucide-react` import) stays regardless — still used by the `onConnect` button
case further down in the same component (`:132`), and now also used here.

## Behavior changes — named, not asserted away (`plan-checker` N4)

T08 is more than "remove two links." Three real, worth-seeing changes:

1. **The Connect sidebar accordion drops to one navigable child** (Chat) plus one permanently
   `"soon"` child (Relationship) — a one-item live accordion where there were two.
2. **Copy changes** on both CTAs: `"{companyName} wants to connect — open inbox →"` → `"
   {companyName} wants to connect"`; `"Wants to connect →"` → `"Wants to connect →"` (unchanged,
   per the arrow-restoration above — only the element type changes, `<a>` → `<span>`).
3. **A real affordance-loss regression, not previously noticed (`plan-checker` N3).**
   `ConnectActions` has a **second** mount point beyond the one this plan already traced:
   `src/app/discover/[companyId]/BuyerShopView.tsx:66,79`, the `LockedCatalogue` component's
   `connectAction` slot — whose entire documented purpose (`BuyerShopView.tsx:92-110`'s own
   docblock) is carrying a call-to-action beside a locked-catalogue message. For a company in
   `"incoming"` state, this slot renders the inert `div` this plan proposes — a panel whose sole
   job is offering an action now offers a dead one. **The reachability history matters here:**
   pre-T07 this link opened the inbox; post-T07 it 308'd to `/discover`, which happened to be
   where `RequestsSection` lives, so the path still worked by coincidence; **post-T08 (this
   ticket) there is no path forward from `/discover/[companyId]` at all** for this state. Not
   fixed here — adding a new affordance would be exactly the "better design the spec didn't ask
   for" scope growth ADR §9's own rule warns against (the ADR/PRD require no replacement
   affordance on this page), and the user can still navigate back to Discover's list, where
   `RequestsSection` remains reachable. Named explicitly so G4 rules on accepting the gap rather
   than discovering it after the fact.

## Not in scope

- Anything about how a viewer discovers/acts on an "incoming" connect request once these two
  passive indicators no longer link anywhere — Discover's own `RequestsSection` (T03/T04) is the
  one remaining actionable surface for company-type requests, and it already renders on the same
  page `CompaniesSection` lives on. No new affordance added here; not asked for.
- `ConnectionState`'s own computation (wherever `company.connectionState`/`state` is derived
  server-side) — untouched, out of TICKETS.md's file list.
- **Two stale comments outside T08's 3 declared files (`plan-checker` N6), not fixed here.**
  `src/shared/ui/IconRail.tsx:27` ("Connect is an ACCORDION parent: its children (Chat /
  Connection Request / Relationship)") and `src/app/connect/layout.tsx:8` ("Connect's tabs (Chat
  / Connection Request / Relationship) live there" — that file's own `:39` is already stale from
  T07). TICKETS.md:275 ("Files: three") wins; fixing these would expand T08 past its declared
  fence. Recorded as follow-up debt, not this ticket's to fix.

## EARS criteria — how each is verified

1. **"Sidebar renders → no entry reads 'Connection Request'."** Live check, staged at G4 (this
   ticket renders — same PIPELINE §3 routing as T07, `.tsx` files touched).
2. **"Discover company row/page renders → no link points at `/connect/inbox`."** Also covers
   I-M14's broader claim ("no route in the app links to `/connect/inbox`"). **Corrected after
   `plan-checker` N5:** `grep -rn "connect/inbox" src/app/discover/` is scoped too narrowly —
   `surfaces.ts` lives under `src/shared/ui/`, outside that path, so a residual there would pass
   the check undetected. Use `grep -rn "connect/inbox" src/` instead (confirmed by `plan-checker`
   to return zero hits after all three edits — the only survivors are `next.config.ts`'s own
   intentional redirect at repo root, outside `src/`, and e2e specs, T09's scope). Also staged
   live at G4.

## G4 routing

Renders — two `.tsx` files touched, same category as T07 (PIPELINE §3, mandatory human stop).
`surfaces.ts` is a `.ts` data file, not itself rendered, but its consumer (the sidebar rail) is.
No migration/RLS/RPC/auth/server-action surface — `security` not required, `/code-review` +
`critic` only, same as T07.
