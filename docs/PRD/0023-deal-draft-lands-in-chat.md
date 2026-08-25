# 0023 — A deal draft lands in the recipient's chat

**Status:** APPROVED at G1 — 2026-08-25
**Slug:** `0023-deal-draft-lands-in-chat` · lane FULL · G2 skipped (Muskan, 2026-08-25)
**Origin:** F-04 of the 0022 G5 walk, reproduced live 2026-08-24
**Supersedes:** `DECISIONS.md:1013` — **the `deal_card` arm only.** The other three
Connect CTAs (`connect`, `connect_message`, `pricelist_request`) still route to the
inbox. `DECISIONS.md:961` is **NOT** superseded; it governs `pricelist_request`.

---

## Problem

A buyer browses a connected seller's shop, adds products, creates a deal draft and
sends it. **Nothing appears in the conversation.** The deal is cut as a ticket on the
Connection Requests page instead, so the seller has to know to look there, then hunt
for the matching conversation. There is no signal at the place the two companies
actually talk.

The same product already behaves correctly one door over: when a deal is addressed to
a named *person*, a clickable "has sent a deal" line appears in that person's chat.
Only the *company* path is silent.

Two things cause it, and neither works without the other:

1. The send step announces a deal to a person but not to a company.
2. The buyer's basket has no way to address a deal to a person in the first place —
   every deal a buyer sends is company-addressed by construction, so the working path
   is unreachable from the buyer's side.

**Evidence:** screenshot `18.58.23` (company thread body unchanged after Send) against
`19.04.34` (person thread carrying the pill) — the same product, two doors, two answers.

---

## In / Out for v1

### In

- A buyer addressing a deal draft to **the whole company** or to **one named person**
  at the seller's company, chosen in the basket before sending.
- A company-addressed deal placing its clickable signal in the **company-to-company
  conversation** with that seller.
- A company-addressed deal **no longer** creating a Connection Requests entry.

### Out — named, so they are not discovered later

| out of scope | why | where it goes |
|---|---|---|
| **Request-pricing → chat** | needs a message type that does not exist, and an unanswered question: a deal pill opens a deal card, a pricing pill opens *what?* | own slug (Muskan, 2026-08-25) |
| **Deleting the Connection Requests page** | still carries the other three request types; deleting now strands Request-pricing with no surface | own slug, after Request-pricing moves |
| **The second send door** — `confirm_detected_deal_births_negotiation.sql:176` | Sella-born deals keep the old inbox route. ~~Verified safe: `deal_detected` messages can only be written by Sella/service-role (`20260614121000_propose_deal_rpc.sql:12`)~~ 🔴 **CORRECTED 2026-08-25 (T04): that was NOT verified and is NOT safe.** ADR 0006 §7.4 established that `20260614121000:12` is **a code comment, not a gate** — `msg_all` (`20260607170000:300-302`) is `FOR ALL TO authenticated` with **no `type` predicate**, so an authenticated member of a p2p thread **can insert a `deal_detected` row today** and drive `confirm_detected_deal`. Filed as **HEL-67**. What remains true is only the second half: Sella is not built, so the door has **no traffic** — a choice, not a proof | **written obligation on the page-deletion slug** — that slug must not delete the page while this door still writes to it |
| **Removing `claim_deal_ticket`** | becomes unreachable for deals but still serves the other types | page-deletion slug |
| **Half-card** (`CONTEXT.md:33`) | it is the *pre-connection* inbox view; this slug is entirely post-connection | untouched |
| **Chat-list consolidation** (one relationship showing two conversations) | pre-existing and upstream of this fix | own slug |
| **Deal-card defects** (no signal of what changed; seller cannot find edit; cannot add items) | unrelated to routing | own slug |
| **`canAsk` connection check** (`ProductCard.tsx:426`) | separate defect | own slug |

---

## Functional requirements

**FR1** — A buyer viewing a connected seller's shop can add products to a basket and
address the resulting deal draft either to **the whole seller company** or to **one
named person** at that company.

**FR2** — The addressee defaults to **the whole company**. Choosing a person is a
deliberate act, never the default.

**FR3** — Sending a **company-addressed** deal places one clickable signal in the
company-to-company conversation between the two companies.

**FR4** — Sending a **person-addressed** deal places its clickable signal in that
person's private conversation **only** — not in the company conversation.
*(This is today's behaviour and does not change.)*

**FR5** — A company-addressed deal **does not** create a Connection Requests entry.

**FR6** — Clicking the signal opens the deal card it refers to.

**FR7** — There is no path where Send reports success and no signal appears in any
conversation. Sending must fail visibly rather than succeed silently.

**FR8** — The recipient can find and open a sent deal **without visiting the
Connection Requests page at all**.

---

## Inputs / outputs

| | |
|---|---|
| **Inputs** | the basket's products for one seller; the chosen addressee (whole company, or one named person); the existing connection between the two companies |
| **Outputs** | exactly one clickable signal in exactly one conversation; the deal becomes visible and signable to the recipient |
| **No longer produced** | a Connection Requests entry, for company-addressed deals |

---

## Constraints

- **Consent is unchanged.** The two companies must already be connected before any
  deal can reach a conversation. This slug does not open a new door to strangers.
- **Enforced server-side, not in the client.** Where a deal lands is decided by the
  server at send time; a modified client must not be able to place a signal in a
  conversation it could not otherwise reach.
- **Only the sending company may send**, and a deal can be sent **once**. Both hold today
  and must survive.
- **The addressee is fixed at send time** by the sender.
- **MVP assumption, stated so it is not re-litigated:** each company has one user today.
  "The whole company can see it" and "that one person can see it" are the same thing.
  See the audience note below.

### Audience — a correction to the work order

STATE.md framed this as widening the audience: an inbox ticket is claimable by one
person, a company conversation is company-wide. **That is not what the system does.**
Both surfaces are already company-wide — `inbox_select` and the company-thread policy
are both plain `current_company_id()` checks
(`20260607170000_rls_policies.sql:243-244` for `inbox_select`, and `:293-298` for `thread_all`,
whose c2c arm resolves through `can_access_thread` `:136`. *Citations corrected 2026-08-25, T04 —
the claim was true; `:79-86` and `:231-232` pointed at `owns_group` and `person_group_all`.*), and `sign_deal`
(`20260724120500_sign_deal.sql:73-82`) already lets any member of the company sign a
deal without anyone claiming anything. "Claimable" describes an inbox convention, not
a permission. **What this slug changes is the discovery channel, not who may look.**

---

## Edge cases

| case | required behaviour |
|---|---|
| The seller company has no connected people to pick | The addressee control still renders, offering the whole company. It is never a dead control. |
| The company-to-company conversation cannot be found | **The send creates it; the deal still lands.** *(Amended 2026-08-25 by ADR 0006 §8.9 ruling (a) — resolve-or-CREATE. The previous wording, "Send must not report success", described a behaviour that was never built: an interrupted accept can leave a connected pair with no c2c thread and no repair path, so refusing forever was the worse failure. T01's AC 4 governs.)* |
| The buyer sends the same deal twice | Refused, as today. |
| The buyer is not connected to the seller | No send path is offered, as today. |
| The buyer's basket holds products from several sellers | Each seller's group is addressed independently. |
| The sender views their own conversation after sending | The sender sees the signal too — it is a message in a shared thread, not a notification. |
| A Sella-detected deal is sent | Keeps the old inbox route. Out of scope, recorded above. |

---

## Acceptance criteria

Walked verbatim at G4 on a running page. Actors are the seeded Alice (Aurora) and
Marcel (Canadian Craft).

**AC1 — the buyer can address the deal.**
Alice opens Canadian Craft's shop, adds 2 products, opens the basket. The Canadian
Craft group shows an addressee control. It reads **"Whole company"** as the selected
value, and opening it lists Canadian Craft's connected people as alternatives.
*(Wording amended 2026-08-25 by ADR 0006 §8.7: the option is exactly **"Whole company"** —
the earlier draft's "(optional person)" suffix was dropped. The control is
`aria-label="Address this deal to"`. It renders even when the company has **zero** connected
people — never a dead control. **Option ORDER beyond the first is not stable between loads**;
"Whole company" is always first.)*

**AC2 — a company-addressed deal appears in the company conversation.**
With "Whole company" still selected, Alice clicks Send. Alice opens her conversation
with Canadian Craft. The thread body ends with a new clickable line reading
**"&lt;Alice's full name&gt; has sent a deal"**, dated today.
*(The exact string is built at
`20260825090000_send_deal_c2c_announce.sql:222-230` — **citation corrected 2026-08-25, T04;
`send_deal:131-140` was the SUPERSEDED migration.** The shipped expression is
`nullif(btrim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '')`, falling back to
`Someone`. ⚠️ **This is not the same as the `||` concatenation this PRD previously described:**
for a person with a NULL last name the old formula yields `Someone`, the shipped code yields
**the first name**. Assert the constructed value, not a label read off a screenshot.)*

**AC3 — and nowhere else.**
After AC2, Canadian Craft's Connection Requests page shows **no** new deal entry.

**AC4 — the signal opens the deal.**
Clicking the line from AC2 opens the deal card panel, showing the 2 products Alice added.

**AC5 — the recipient finds it without the inbox.**
Marcel signs in, goes straight to his chat, and sees the same clickable line in the
Aurora conversation **without visiting Connection Requests**. Clicking it opens the
same deal card.

**AC6 — a person-addressed deal stays private.**
Alice repeats the send with a **named person** selected. The line appears in Alice's
private conversation with that person. Alice's company conversation with Canadian
Craft is **unchanged** — no second line.

**AC7 — consent still gates it.**
On the shop of a seller Alice is **not** connected to, the basket still refuses to send
and shows the existing connect-first block. No conversation receives anything.

**AC8 — send is still once-only.**
A deal already sent cannot be sent again.

---

## Vocabulary — proposed, not written

`CONTEXT.md:31` currently reads *"**Deal draft** | A Deal Card sitting inside a P2P
chat that has not yet been confirmed."* After this slug a draft can sit in a
company-to-company chat too. **Proposed amendment** — replace "a P2P chat" with
"a chat". One line, awaiting Muskan's yes; not written.

---

## Decisions taken during this spec

| | ruling | by |
|---|---|---|
| G2 `/prototype` | **skipped** — the picker is an existing component in one more place | Muskan, 2026-08-25 |
| Connection Requests entry | **stops** for company-addressed deals; chat is the only surface | Muskan |
| Request-pricing → chat | **parked**, own slug | Muskan |
| Connection Requests page deletion | **not here**; own slug, after Request-pricing moves | Muskan |
| Second send door (Sella) | **left on the old route**; no traffic until Sella ships | Muskan, on verified evidence |
| Person-addressed deal | **P2P only** — person arm unchanged | Muskan |
| Pill wording | **sender's person name**, reusing the existing expression for both arms | Muskan ("whatever is easy") |
| Half-card | untouched — pre-connection only | spec, unopposed |
| `claim_deal_ticket` | stays; unreachable for deals | spec, unopposed |
