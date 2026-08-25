# 0023 deal-draft-lands-in-chat — TICKETS

> Cut at `/design` step 4, 2026-08-25, from ADR 0006 rev 3.
> **CREATED IN LINEAR 2026-08-25** — team **`Codebase Development Tickets`** (HEL-xx),
> assignee Muskan. ⚠️ **Not** the `Development` (DEV-xx) team — Muskan's correction; the
> pipeline's build tickets live in the codebase team.
> **T01 = HEL-63 · T02 = HEL-64 · T03 = HEL-65 · T04 = HEL-66**
> Plus the two G3 "file separately" rulings: **HEL-67** (§8.6 forgeable `deal_detected`)
> and **HEL-68** (§8.10 c2c thread created by the browser).
> Every ticket passed the Ready checkpoint: INVEST · sized S/M/XS · EARS criteria.
>
> **Later spin-outs, named here for traceability (none of them built by this slug):**
> **HEL-74** (T01 G4 `security` N1 — `send_deal` never checks the relationship is live;
> exploit later disproven, ticket corrected not closed) · **HEL-76** (T03 G4 `critic` N8 —
> person-arm has no e2e proof; closed by PR #180's own test, see Gate log) · **HEL-77**
> (claim rollout lost its browser cover) · **HEL-78** (`present-basket.spec.ts` dead
> scaffolding) · **HEL-79** (`loginAs` load-correlated flake) · **HEL-80** (`rtk` collapses
> psql/eslint/git output too, not just Playwright/vitest).

## Order and parallelism

```
T01 (M, SQL) ─┐
              ├─→ T03 (S, e2e)
T02 (S, TSX) ─┘
T04 (XS, docs) — independent. ⚠️ *Cut as 4 edits; it landed as **12**, each addition traceable to a recorded ruling — see T04's criterion 4*
```

**T01 ∥ T02 are parallel-safe — computed, not assumed (L-004).**
File intersection is **empty**: T01 owns `supabase/migrations/**` + `supabase/tests/**`;
T02 owns `src/modules/basket/**`. **Shared resource that is NOT a file:** the local
Supabase DB. Both need `supabase db reset` at some point and it is one database across
worktrees — **run their DB steps sequentially even when the tickets run in parallel.**

---

## T01 (HEL-63) — `send_deal` announces a company-addressed deal in the company chat

**Size M** · depends on: none · **G3 rulings it consumes: §8.9, §8.11**

*Why this is one ticket and not two:* the moment the migration lands,
`deliver_deal_test` and `claim_deal_ticket_test` go red. Splitting the suite rewrites out
leaves a knowingly-red intermediate commit, which fails INVEST's "valuable" and makes the
ticket untestable. It sits at the **top** of M; if it grows past that at plan time, split
the *suite rewrites* out and land them in the same commit series, not the same ticket.

**Files** — `supabase/migrations/<new>_send_deal_c2c_announce.sql` ·
`supabase/tests/send_deal_c2c_announce_test.sql` (new) + its `run_*.sh` ·
`supabase/tests/deliver_deal_test.sql` · `supabase/tests/claim_deal_ticket_test.sql` ·
`src/modules/deals/actions.ts` (docstring only, `:357-368` — *corrected 2026-08-25, T04*)

**First step, before any code:** regenerate ADR §4.3's affected-suite table **by grep**,
not from the table — it was written from recall twice and was wrong twice
(`grep -rln "send_deal\|deliver_deal\|pending_inbox_item\|chat_message" supabase/tests/ e2e/`).

### Acceptance criteria (EARS)

1. When a buyer sends a deal whose `metadata.counterparty_person_id` is null, the system
   shall insert exactly one `chat_message` of `type='deal_card'` into the `c2c` thread of
   the card's `relationship_id`, with the sender's name and `metadata.deal_card_id`. **(M1)**
2. When a buyer sends a company-addressed deal, the system shall create **zero**
   `pending_inbox_item` rows. **(M2)**
3. When a buyer sends a **person**-addressed deal, the system shall insert the pill into
   the `p2p` thread only, and **nothing** into the c2c thread. **(M3, FR4/AC6)**
4. When a company-addressed deal is sent on a relationship whose c2c thread is missing,
   the system shall create that thread and post the pill; when sent twice, it shall not
   create a second thread. **(M4′ — assumes §8.9 ruling (a); under (b) this criterion
   inverts to "shall raise and roll back")**
5. When the receiving company's member reads the c2c thread, the system shall return the
   pill, and the `deal_card` and `deal_line_item` rows its `deal_card_id` resolves to.
   **(M9 — asserted as `authenticated` with the receiver's jwt, not as definer)**
6. When a **third** company's member reads the same pill and card, the system shall
   return zero rows. **(M10)**
7. When the migration has been applied, the system shall still grant `execute` on
   `send_deal` to `authenticated`. **(M11 — `create or replace`, grant re-emitted)**
8. When `deliver_deal` is invoked twice for the same card, the system shall hold at
   exactly one ticket. **(rewritten idempotency case — it must call `deliver_deal` TWICE;
   see ADR §6.1. Preserve `WR-01`'s execute-revoke case verbatim.)**
9. When `deliver_deal`'s definition is diffed after this slug, it shall be byte-identical. **(M8)**

**Out of scope:** `deliver_deal`'s body · `confirm_detected_deal…:176` · any RLS, grant
or schema change · the frontend.

---

## T02 (HEL-64) — the buyer can address a deal to a person at the seller's company

**Size S** · depends on: none · **G3 rulings it consumes: §8.1, §8.2, §8.7**

**Files** — `src/modules/basket/components/CounterpartyPersonSelect.tsx` (new) ·
`RecipientPicker.tsx` (person select moves out; company select untouched) ·
`BasketDrawer.tsx` · `BasketDrawer.test.tsx`

### Acceptance criteria (EARS)

1. When a buyer opens the basket on a group for a **connected** seller, the system shall
   render an addressee control defaulting to the whole company. **(FR1/FR2, AC1)**
2. When that seller company has **zero** connected people, the system shall still render
   the control offering the whole company. **(M7 — never a dead control. e2e, not unit:
   `BasketDrawer.test.tsx` renders via `renderToStaticMarkup` with no jsdom, so
   `useEffect` never fires.)**
3. When the control is rendered before its people have loaded, the system shall show
   "Whole company" immediately and add people when the fetch resolves.
4. When the buyer's group is for a seller they are **not** connected to, the system shall
   render the existing connect-first block and **no** addressee control. **(AC7 — the
   control belongs in the `needsConnection` ELSE branch; the existing picker slot at
   `BasketDrawer.tsx:321-325` sits ABOVE the `needsConnection` split at `:329` — ⚠️ *citations
   corrected 2026-08-25, T04; they read `:311-315`/`:319` at cut and T02's own diff moved them.
   Claim unchanged, `critic` N5*)**
5. When a person is chosen, the system shall pass that `counterpartyPersonId` into
   `createBasketDraft`. ⚠️ **Wording amended 2026-08-25 (Muskan's ruling at T02's G4).** The
   original said *"instead of the hardcoded null at `BasketDrawer.tsx:215`"*. **That literal STAYS**
   (now `:216`): it is the effective "Whole company" default and what keeps Create enabled —
   **deleting it ships a dead Create button on every buyer group**, contradicting FR2. The code is
   right; the criterion's wording was stale.
6. When a seller uses `RecipientPicker` on a company with zero people, the system shall
   render the same control rather than hiding it. **(§8.2 — behaviour change to an
   existing surface, needs the G3 yes)**

---

## T03 (HEL-65) — the walk, end to end

**Size S** · **depends on: T01, T02**

**Files** — `e2e/deal-c2c-create.spec.ts` · `e2e/deal-lands-in-c2c-chat.spec.ts` (new)

### Acceptance criteria (EARS)

1. When a buyer sends a company-addressed deal, the spec shall assert the pill appears in
   the seller's c2c conversation and the deal opens from it. **(AC2, AC4)**
2. When the recipient signs in and goes straight to chat, the spec shall assert the deal
   is reachable **without visiting `/connect/inbox`**. **(AC5/FR8)**
3. When a company-addressed deal has been sent, the spec shall assert the Deal-tickets
   lens shows no **new** entry. **(AC3 — note pre-existing production tickets survive and
   stay claimable; this is a "no new entry" assertion, not "empty")**
4. `deal-c2c-create.spec.ts:141-191`'s premise is reversed and rewritten, not deleted.
5. `e2e/inbox-accept.spec.ts` shall be **run deliberately and judged** — `:157-158` is the
   only guard in the repo on c2c-thread uniqueness, the invariant T01 now writes against.
6. ⚠️ **ADDED 2026-08-25 by ruling, not at cut** (T02's G4 ruling 2 / `critic` N1). When the
   buyer's basket renders the addressee control on a connected seller's group, the spec shall
   assert the control offers that seller's **named people**, not merely that it renders and
   defaults to "Whole company". **Rationale:** swapping the call site to
   `relationshipId={group.sellerCompanyId}` leaves `tsc` at 0 and **all seven of T02's unit cases
   green** while the people list is empty forever — only an e2e discriminates. **Proven by a
   controlled A/B at T03's G4** (units 41/41 green under the bug; this criterion red).

---

## T04 (HEL-66) — record the decision where the next person will look

**Size XS** · depends on: none · **needs G3 first: §8.4, §8.5, §8.9**

**Files** — `docs/architecture/CONTEXT.md:31` · `docs/decisions/DECISIONS.md` ·
`docs/PRD/0023-deal-draft-lands-in-chat.md` (the §8.9 / §8.7 amendments) ·
**`docs/architecture/adr/0006-deal-draft-lands-in-chat.md`** and **this file** — ⚠️ *both added
2026-08-25: T04 edits them and the cut list named neither, which is the same staleness this
ticket exists to fix, one level up* ·
`docs/architecture/adr/ADR-INDEX.md` *(index line is `/design` step 5, not this ticket)*

### Acceptance criteria (EARS)

1. When a reader looks up "Deal draft" in CONTEXT.md, the definition shall say "a chat",
   not "a P2P chat". **(§8.4)**
2. When a reader reaches `DECISIONS.md:1013`, a dated entry shall record the **partial**
   supersede — the `deal_card` arm only — and the ADR-0003:48-49 correction as worded in
   ADR 0006's frontmatter. **(§8.5)**
3. When the PRD's edge-case row and ACs are read at G4, they shall match the built
   behaviour. **(§8.7 AC wording, §8.9 edge-case row — both are spec amendments and land
   ONLY on the G3 ruling)**
4. ⚠️ **ADDED 2026-08-25 (`critic` N6). Criteria 1-3 covered 3 of this ticket's 12 edits**, so a
   G4 walk would have replayed a quarter of it. The remaining nine, each authorised by a recorded
   ruling rather than by the cut: ADR **J1** must name **sender-identity** forgery (`security` B1,
   T01 G4) · ADR **§4.1's** live citations shall resolve (`security` N3) · **`PRD:52`** shall not
   claim "verified safe" about the `deal_detected` hole ADR §7.4 refuted and HEL-67 tracks ·
   **`PRD:117-121`'s** policy citations shall resolve · the ADR shall state **which citations it
   maintains and which are frozen** · **J6/J7** shall not describe rulings as pending once built ·
   **T02 AC 5** and **T03 AC 6** shall match what was ruled and proven · and **this ticket's own
   Files list and criteria** shall name what it edits.
   **This ticket grew by ruling five times after its cut. That is the defect it exists to fix,
   one level up, and it went uncorrected here until `critic` said so.**

---

## Traceability — every PRD requirement has a home

| PRD | ticket |
|---|---|
| FR1, FR2 | T02 |
| FR3 | T01 (M1) |
| FR4 | T01 (M3) |
| FR5 | T01 (M2) |
| FR6 | T03 (AC4) |
| FR7 | T01 (M4′) — **shape depends on the §8.9 ruling** |
| FR8 | T01 (M9) + T03 |
| AC1 | T02 · **wording amended, §8.7** |
| AC2 | T01 (M1) + T03 · **wording amended, §8.7** |
| AC3 | T01 (M2) + T03 |
| AC4 | T03 |
| AC5 | T01 (M9/M10) + T03 |
| AC6 | T01 (M3) |
| AC7 | T02 |
| AC8 | T01 (M6, unchanged guard) |

**Removed from scope by a gate — struck, not dropped (L-039):**
- ~~PRD edge case "the c2c conversation cannot be found → Send must not report success"~~
  — **pending §8.9.** If (a) is ruled, this row is amended out of the PRD and T01's AC 4
  replaces it. It must not reappear on the G4 sheet from the PRD.
- ~~closing the interrupted-accept window~~ — **own slug, §8.10 → HEL-68.**
- ~~the forgeable `deal_detected` finding~~ — **own ticket, §8.6 → HEL-67.**
