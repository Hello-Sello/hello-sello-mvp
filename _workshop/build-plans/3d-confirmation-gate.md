# 3d - Two-sided confirmation gate (Draft -> Confirmed, the golden card)

**Status:** BUILT + VERIFIED both sides (2026-06-11). **Owner:** Ayush. **Builds on:** 3a (card read), 3b
(workspace), 3c (things). **Seeded card:** `04695a2d`. **Demo:** 2026-06-12.

> **Verified live (Bob then Alice):** Bob confirms -> his seat greens + "waiting"; Alice sees Bob's confirm
> (cross-side read) + confirms -> card turns GOLDEN, `deal_card.status` flips `draft`->`confirmed`, the header
> lifecycle pill flips to Confirmed LIVE, audit trail = `party_confirmed` x2 + `deal.confirmed`, log line written.
> No console errors. `tsc` + eslint clean. Card reset to Draft for the demo.
>
> **Two fixes during build:** (1) audit `actorType` must be `user` (not `person`) - the `audit_actor_type` lookup
> has no `person` code; (2) the header pill loads the card separately from the in-chat confirm dialog, so a
> `window` event `hs:deal-updated` (fired by DealPin, heard by DealWorkspace) re-reads it - keeps the pill in sync
> without a reload.
> **Learning:** `audit_log` is append-only (a trigger blocks DELETE) - test audit rows can't be cleaned, which is
> correct for a tamper-evident trail.

> 3d turns the grey Draft card into the golden Confirmed card, but only when BOTH companies confirm (FR-D2). It
> does NOT edit the card contents (that's 3.5). The confirm panel is built as a REUSABLE component so 3.5's
> per-change confirm reuses it. Final confirm is driven by the confirm action, NOT by the (screen-only) stage.

---

## 1. Decisions locked (2026-06-11, with Ayush)

- **D1 - Confirm panel at the TOP** of the card front, as an action banner (Ayush's call: a decision should hit
  the eye first). Two seats (Seller / Buyer) + the viewer's Confirm / Decline button.
- **D2 - Reusable `ConfirmBar` component.** Same face reused by 3.5's per-change confirm; only the data source
  differs (3d = `deal_confirmation`; 3.5 = the change/version accept). "Same face, different engine."
- **D3 - Whole card turns golden on Confirmed.** Band + border + pill + a verified tick shift to gold (amber).
  The WorkspaceHeader lifecycle pill flips Draft -> Confirmed too.
- **D4 - The flip runs in a SERVER ACTION**, not on the client. Reasoning: writing the confirmation row, checking
  both sides, flipping `deal_card.status`, logging, and auditing should be one atomic-ish step - no client race,
  and `writeAudit` is server-only anyway. The viewer's company is derived from the SESSION (never from input) -
  that's the guardrail so a person can only confirm THEIR OWN side (RLS `conf_all` is relationship-wide, so the
  app must scope the company itself).
- **D5 - Minimal audit wired here** (the pass deferred from 3c): the confirm/decline/withdraw events write
  `audit_log` rows via the F5 helper. Needs new action codes (Phase 0). No audit DISPLAY yet (that's step-9 stretch).
- **OUT (-> 3.5 "card v2"):** card rearrangement, full-screen "blank + only card" open mode, the card EDIT write
  side, and the per-change confirm flow. 3d does the minimum card-UI touch to fit the top banner, nothing more.

## 2. Schema - exists; one small migration

- `deal_confirmation` (migrated): one row per party per version - `(deal_card_id, version, company_id)` UNIQUE,
  `status` pending/confirmed/rejected, `responding_person_id`, `responded_at`, `note`. RLS `conf_all` = relationship
  member (read + write both sides) -> app derives company from session (D4 guardrail).
- `deal_card.status` flips `draft` -> `confirmed` when both rows are `confirmed`; a decline sends it back to
  negotiation (stays `draft`, the declining row = `rejected`); FR-D6 withdraw -> `withdrawn` (pre-confirm only).
- **No confirmation seed needed:** the two parties come from the `relationship`; a missing row reads as `pending`.
  The confirm action upserts the viewer's row.
- **Migration (Phase 0):** add `audit_action_type` codes - `deal.party_confirmed`, `deal.confirmed`,
  `deal.declined`, `deal.withdrawn`. Content type `deal_card` already exists.

## 3. Phases (build + verify each in Preview, tsc + eslint clean)

- **Phase 0 - migration.** Seed the 4 audit action codes. *Verify:* codes present, FK insert works.
- **Phase 1 - reads + types.** `ConfirmationView` (perCompany: side, companyName, status, byName, respondedAt) +
  `getConfirmations(dealCardId, version)` -> the two parties joined to their rows (default pending). Narrow the
  status union. *Verify:* both sides read the pair; default pending shows.
- **Phase 2 - server action.** `confirmDeal({ dealCardId, version, decision })` where decision =
  `confirm | decline | withdraw`. Derives company from session; upserts the viewer's `deal_confirmation` row; if
  both `confirmed` -> set `deal_card.status='confirmed'` + write a `deal_card_log` line ("Deal confirmed by both
  sides"); decline -> mark row `rejected` (card stays draft); withdraw -> `deal_card.status='withdrawn'` (only if
  the other side hasn't confirmed). Writes `audit_log` for each. *Verify:* DB rows correct each path.
- **Phase 3 - `ConfirmBar` (reusable).** The top action banner on `CardFront`: two seats + Confirm/Decline; once
  YOU confirm, your seat greens + a Withdraw appears while the other is pending. Wired to the server action;
  re-reads after. *Verify:* Alice confirm -> waiting; states render both sides.
- **Phase 4 - golden card + live pill.** When `card.status==='confirmed'`, `CardFront` goes gold (band/border/pill/
  tick) and the `WorkspaceHeader` lifecycle pill shows Confirmed. *Verify:* both screens flip to gold when the
  second side confirms; decline/withdraw paths show correctly.
- **Phase 5 - verify both sides + wrap-to-plan.** Full walk: Alice confirms, Bob confirms -> golden + status flips
  in DB; decline path; withdraw path. `tsc` + eslint clean; no console errors.

## 4. Reusability note (for 3.5)

`ConfirmBar` takes `{ seats: [{side, name, status, byName}], viewerSide, onConfirm, onDecline, onWithdraw }` -
no `deal_confirmation` knowledge inside it. 3.5 feeds it from the per-change accept source. Keep it dumb + fed.

## 5. Process

1. Lock §1-§2 with Ayush. 2. Build phase by phase, verify each. 3. Behind the `deals/index.ts` barrel.
4. Wrap into plan + sync + CLAUDE.md at session end (not mid-build).
