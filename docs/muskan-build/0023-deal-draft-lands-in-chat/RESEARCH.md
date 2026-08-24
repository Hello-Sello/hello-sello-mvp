# 0023 deal-draft-lands-in-chat — RESEARCH

## What exists (spec)

Prior-art sweep, `researcher` agent, 2026-08-25. Every claim carries a `file:line`.
Anything the agent could not verify is marked **unverified** rather than inferred.

---

### 1. `send_deal` today

`supabase/migrations/20260724120300_send_deal.sql:45-153` is the **sole** live
definition (`20260817120000_anon_execute_lockdown.sql:110` only revokes EXECUTE from
`PUBLIC, anon`; it does not touch the body).

`send_deal(p_deal_card_id uuid) returns uuid` — `security definer`,
`set search_path = ''`, granted to `authenticated` (`:152`).

**Guards** — `auth.uid()` non-null (`:62-64`) · card locked `FOR UPDATE` (`:69`) and
must exist (`:70-72`) · `status = 'unsent'`, so a second send raises (`:73-75`) ·
caller's company must equal `initiating_company_id` (`:76-78`).

**The body, in order:**

| step | line | what | arm |
|---|---|---|---|
| 1 | `:81` | read `metadata.counterparty_person_id` into `v_cp` — **the sole routing key** | both |
| 2 | `:86-98` | insert counterparty as a `deal_member` co-owner, idempotent | person only |
| 3 | `:100-103` | flip `status` `unsent → negotiation` | both |
| 4 | `:107` | `perform public.deliver_deal(v_card.id)` | both |
| 5 | `:111-141` | resolve-or-create the p2p thread, insert the **pill** | person only |
| 6 | `:144-146` | `deal_card_log` row, origin `deal_chat`, "Deal sent." | both |
| — | `:107`→ret | returns the p2p thread id, or **`null`** when company-target | both |

**The company arm does nothing beyond step 4.** No c2c lookup, no pill.
STATE.md's claim is confirmed verbatim.

Step 3 happens **before** step 5, so there is no race between the status flip that
makes the card readable and the pill that announces it.

### 2. `deliver_deal` and its callers

Body: `supabase/migrations/20260720095000_deliver_deal.sql:30-59`, no later
redefinition. It probes `deal_member` for a co-owner ≠ the creator (`:41-46`);
if one exists it **returns a no-op** ("person delivery is the send layer's job",
`:46`). If none, it computes the receiver company from `relationship` and
idempotently inserts exactly one `pending_inbox_item`
(`type='deal_card', status='pending'`) (`:51-56`).

**Exactly two live SQL callers** — STATE.md's count is right:

| caller | line | condition |
|---|---|---|
| `send_deal` | `:107` | unconditional (no-op on the person path via the co-owner probe) |
| `confirm_detected_deal_births_negotiation` | `:176` | **only** inside the `else` branch when `v_cp is null` (`:158, :173-177`) |

**`create_deal_draft` is NOT a caller.** The birth-time call existed at
`20260720100100_create_deal_draft_delivers.sql:8,179` and was **deleted** by
`20260724120200_create_deal_draft_private_birth.sql`, whose header states delta (d):
*"the birth-time `perform public.deliver_deal(v_card)` call is DELETED — send_deal
owns the WHOLE delivery"* (`:23-24`). Everything else the grep surfaced
(`types/database.types.ts`, `e2e/fixtures/two-company.ts`, `deals/actions.ts:361`,
four test files) is generated types, fixtures, or comments.

**What is lost if the company arm stops calling it:** (a) the discovery ticket at
`/connect/inbox`, and (b) the only path by which a *specific person* at the
counterparty becomes a `deal_member` row (`claim_deal_ticket`,
`20260720110000_claim_deal_ticket.sql:44-53`). **Unverified:** whether anything
besides `can_access_workspace`'s company-wide branch depends on that `deal_member` row.

### 3. The c2c thread resolver

**TypeScript-only. There is no SQL equivalent `send_deal` can call today.**
`resolveC2cThread(relationshipId)` (`src/modules/messaging/supabase/store.ts:358-372`)
is a plain client-side `supabase.from("chat_thread").select(...)`. A repo-wide grep
finds no SQL resolver RPC; the 9 migrations matching `c2c` are RLS policies and
thread-creation call sites, not a resolver.

**This is safe to replicate in SQL, and it is simpler than the p2p arm.** A c2c
thread is minted on every relationship accept (`store.ts:353-356`) and is constrained
to **exactly one per relationship** by
`uq_chat_thread_c2c on chat_thread(relationship_id, type) WHERE type='c2c'`
(`20260607090003_phase2_deal.sql:139-140`). So the company arm needs **resolve-only**
(`SELECT id FROM chat_thread WHERE type='c2c' AND relationship_id = ...`), not the
person arm's resolve-**or**-create.

### 4. The pill

Written at `send_deal:136-140` — `chat_message(thread_id, sender='person',
sender_person_id=v_uid, type='deal_card', body='<Name> has sent a deal',
metadata={deal_card_id})`.

Rendered by `src/modules/messaging/components/MessageBubble.tsx`. `DEAL_SIGNAL_TYPES`
(`:20-28`) is a set of 7 types including `deal_card`; membership renders the centred
clickable pill (`:42-65`), reading `metadata.deal_card_id` to dispatch
`hs:open-deal-card` (`:43, :48-53`).

**No thread-type gate.** The branch at `:42` tests only `message.type` — nothing about
`thread_id` or the thread's `type`. **The pill mechanism needs zero frontend change to
work in a c2c thread.**

### 5. Read audience — c2c vs p2p vs inbox

| surface | policy | audience |
|---|---|---|
| `chat_thread` c2c | `thread_all` → `is_relationship_member(relationship_id)` (`20260707120100_group_thread_rls.sql:28-43`) | **company-wide** |
| `chat_thread` p2p | the two named people (same policy, p2p branch) | 2 people |
| `chat_message` | `can_access_thread(thread_id)`, same c2c branch (`20260607170000_rls_policies.sql:117-129`) | mirrors the thread |
| `pending_inbox_item` | `inbox_select` = `receiver_company_id = current_company_id() OR sender_company_id = current_company_id()` (`20260607170000_rls_policies.sql:231-232`) | **company-wide** |
| `deal_card` | `is_relationship_member(relationship_id) AND (status <> 'unsent' OR initiating_company_id = current_company_id())` (`20260724120700_draft_privacy_rls.sql:56-60`) | company-wide once sent |

`is_relationship_member` (`20260607170000_rls_policies.sql:79-86`) is
`current_company_id() IN (company_a_id, company_b_id)` — **no per-person restriction**,
matching `CONTEXT.md:41` verbatim.

> ### 🔴 Correction to STATE.md risk #1
> STATE.md:90-93 frames this as *"an inbox ticket is claimable by one person; a c2c
> thread is company-wide … same consent gate, wider audience."*
>
> **The SELECT audience is already identical today.** Both `inbox_select` and the c2c
> `thread_all` branch are plain `current_company_id()` checks. And `sign_deal`
> (`20260724120500_sign_deal.sql:73-82`) gates on **company relationship membership
> only — no `deal_member` check** — so any member of the counterparty company can
> already *sign* a sent deal without anyone ever claiming the ticket.
>
> **What actually changes is the discovery channel, not who is allowed to look.**
> "Claimable by one person" describes an assignment convention in the inbox UI, not a
> read or write restriction in the database.

### 6. Buyer basket + recipient picker

`src/modules/basket/components/BasketDrawer.tsx:201-262`, the `Group` component,
`:214-216`:

```ts
const [recipient, setRecipient] = useState<{ relationshipId: string; counterpartyPersonId: string | null } | null>(
  group.isOwnCompany ? null : (group.relationshipId ? { relationshipId: group.relationshipId, counterpartyPersonId: null } : null),
);
```

For every other-company group, `counterpartyPersonId` is hardcoded `null` at mount and
**never set by any UI** — `RecipientPicker` is mounted only when
`group.isOwnCompany` (`:311-315`). `isOwnCompany` means the group's products are the
viewer's own catalogue (`src/modules/basket/lib/group.ts:5-6,19`): a **seller**
drafting an offer picks a recipient; a **buyer** shopping someone else's shop gets the
relationship auto-filled and the person permanently `null`. STATE.md confirmed.

`RecipientPicker.tsx` is own-company-only **by its call site, not by construction** —
it takes `getMyConnections()` results and would render for a buyer group as-is. Its own
doc comment (`:9-10`) records the current assumption: *"Buyer (other-company) groups
never render this; their recipient is the seller company, implicit."*

`getMyConnections()` (`src/modules/messaging/types.ts:201-220`) returns
`ConnectedCompany[]` — `companyId`, `relationshipId`, `name`, and
**`people: ConnectedPerson[]`**. The data the picker needs already arrives.

### 7. Conflicts and prior claims

**`DECISIONS.md:961`** (2026-06-10, Present storefront v0), verbatim: *"Price
visibility = per-product `price_public`… Request-pricing routes to **Connect's inbox**
(type `pricelist_request`, 2a machinery)."* → governs `pricelist_request`, out of
scope, **stays true**. STATE.md's correction confirmed.

**`DECISIONS.md:1013`** (2026-06-14, Discover & public profile), verbatim:
*"**Connect CTAs map to the 4 existing inbox types**, surfaced contextually on the
profile: Connect (`connect`) · Connect + note (`connect_message`) · Request pricing
(`pricelist_request`) · Offer card (`deal_card`)… no new request types."* → **the only
decision locking `deal_card` → inbox**. Partial supersede, `deal_card` arm only.

**`CONTEXT.md:31`** *"**Deal draft** | A Deal Card sitting inside a P2P chat that has
not yet been confirmed."* → one-line amendment owed.
**`CONTEXT.md:41`** *"**C2C** | Company-to-Company chat… the whole company can see it."*

**`CONTEXT.md:33` — new, not previously surfaced:** *"**Half-card** | The collapsed
Deal Card shown only in the Inbox as a pre-connection gate. In a chat the card is
always full."* → a named concept whose fate this slug must decide.

**`ARCHITECTURE-NOTES.md:471-489`** (2026-08-24, the L-038 class) is directly on point
for risk #2: *"The extraction only fixes drift between the callers you moved. It
silently creates drift with every other door that answers the same question and was not
moved… the audit is a term-by-term diff against every other site."* (`:478-484`).

**`docs/product/surfaces/CONNECT.md:9`** — *"Depth: stub"*; §17-19 are literally
"(to be filled)". **A gap, not a conflict** — the canonical Connect surface doc says
nothing about deal routing.

**`docs/PRD/deal-flow.md:15-31`** (2026-06-07) describes a `deal` chat_thread type born
at draft with its own announcement line — an **older model** than the live schema
(birth is now private per `20260724120200`). `DECISIONS.md:941-951` (2026-06-14) itself
says *"Scope: connected-P2P only — not-connected→inbox, C2C ticketing… are parked."*
**Flag as stale, not a live conflict** — the `deal` thread type still exists in RLS
(`20260707120100_group_thread_rls.sql:32-36`) but no INSERT of `type='deal'` was found
in the current `create_deal_draft`. **Unverified.**

**Linear DEV-163** ("DEAL CARDS", Marcel, 2026-07-24, still `Todo`, assigned Ayush),
item 6 verbatim: *"Deal goes to Company chat but also people? ISSUE"* — **the product
owner already filed this exact ambiguity.** Not a conflict; it confirms the question is
real and pre-existing, not invented by the G5 walk.

### 8. Existing test cover — what this slug breaks

**These two assert today's routing as correct and will go red by design:**

| suite | what it asserts | line |
|---|---|---|
| `supabase/tests/deliver_deal_test.sql` | a c2c (no counterparty person) send writes **exactly one claimable `pending_inbox_item`** | `:8-10` |
| `supabase/tests/claim_deal_ticket_test.sql` | ticket **absent** pre-send, **appears** post-send, then claims | `:1-18` |

**E2E:**
- `e2e/deal-p2p-send.spec.ts:60-86` — person-arm pill + **zero** inbox rows.
  **Unaffected** (person arm untouched).
- `e2e/deal-c2c-create.spec.ts:141-191` — **the load-bearing one.** Asserts a
  company-target send's ticket lands in the other company's "Deal tickets" lens, that
  the sender's own inbox shows it in no actionable lens (`:149-161`), and that
  "Pick up deal" takes `deal_member` 1→2 (`:172-176`). **Its entire premise is what
  this slug reverses — a rewrite, not an update.**
- `e2e/deal-c2c-create.spec.ts:57-73` — *"no counterparty person exists in a company
  chat → the creator is the SOLE `deal_member` owner through birth AND send"*
  (`:68-72`). The assertion may survive ("whole company" stays a valid choice); the
  **framing** becomes false once the buyer picker ships.

**Unit:** `src/modules/basket/components/BasketDrawer.test.tsx:107-119` — a connected
foreign group renders "Create a draft deal"; its doc comment (`:33-34`) records
*"RecipientPicker is never mounted for a foreign group either way"*. It does not
hard-assert absence, so it may not fail — but **the documented invariant goes stale**.

**Not fully verified:** `finalize_deal_test.sql`, `decline_deal_test.sql`,
`update_deal_draft_test.sql`, `rls_isolation_test.sql`,
`confirm_deal_change_metadata_merge_test.sql` reference `send_deal`/`deliver_deal` but
were not read line by line — whether they assert routing or merely call through it is
open.

---

## Conflicts put to Muskan

1. **STATE.md risk #1 is overstated** — the audience is already company-wide on both
   routes. See the correction box in §5.
2. **Two SQL test suites assert the behaviour this slug reverses** — `deliver_deal_test`
   and `claim_deal_ticket_test` need an explicit rewrite decision, not incidental
   breakage found at G4.
3. **`e2e/deal-c2c-create.spec.ts:141-191` is built around the ticket/claim mechanism** —
   does `claim_deal_ticket` and the "Deal tickets" lens survive for *any* path?
4. **Linear DEV-163 item 6 asks this exact question** and is open and unstarted.
5. **`CONTEXT.md:33` "Half-card" has no defined fate** once `deal_card` leaves the inbox.
