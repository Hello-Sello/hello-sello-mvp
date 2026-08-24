# 0023 deal-draft-lands-in-chat — work order
lane:   FULL
stage:  triage ✅  →  spec (next)
branch: claude/muskan/work — no feature branch (Muskan's call, 2026-08-18)

## Seed
Muskan, 2026-08-25. Origin: F-04 of the 0022 G5 walk. Narrowed twice in triage,
then widened once — the full original seed is in `SEED-ORIGINAL.md`.

**The capability, in one sentence:** a buyer addresses a deal draft from any shop
— to the company, or to a person inside it — and it lands in that addressee's chat.

## Muskan's live walk, 2026-08-24 (the reproduction)
Alice (Aurora) → Canadian Craft's shop → 2 products → "Create a draft deal" → Send.

| observed | screenshot |
|---|---|
| No recipient/person picker anywhere in the basket | 18.55.42 |
| Draft born, lands sender in the c2c chat, card panel opens | 18.57.38 |
| After Send: card says "Waiting for the other side to sign" — **c2c thread body unchanged**, still just "now connected" + "hey" | 18.58.23 |
| Contrast: the p2p thread with Bob Stone DOES carry a pill — "Click to open the deal card · 23 Jun" | 19.04.34 |
| Recipient finds the deal in **Connection Requests**, not chat; then must hunt the conversation; no signal on arrival | walk notes |

Those last three are ONE defect: `send_deal`'s person arm posts a pill, its company
arm posts nothing and cuts an inbox ticket instead.

## Scope — two halves of one mechanism
| | |
|---|---|
| backend | `send_deal` company arm → `resolveC2cThread` + the same pill insert, instead of `perform public.deliver_deal(...)` (`20260724120300_send_deal.sql:107`) |
| frontend | buyer group renders the person select; `BasketDrawer.tsx:213` stops hardcoding `counterpartyPersonId: null` |

**Why both, not just the backend** (Muskan's ruling, overriding an earlier defer):
without the picker, `counterparty_person_id` is permanently null on the buyer side,
so the person arm never fires and the routing has nothing to route. Half a mechanism.

"If they don't know anyone, just the company" is already the shape — the person
select's default is "Whole company (optional person)" → null → the c2c arm.

## What is already true (verified in triage, not assumed)
| | |
|---|---|
| person arm works | `send_deal:111-140` resolve-or-create p2p + pill |
| c2c resolver exists | `messaging/supabase/store.ts:358` `resolveC2cThread(relationshipId)` |
| card carries its relationship | `deal_card.relationship_id`, set at birth |
| pill renders in ANY thread | `MessageBubble.tsx:21` — `deal_card` type, no thread-type gate |
| c2c deal surface exists | `DealPin.tsx:788-789` |
| picker component exists | `RecipientPicker.tsx` — own-company groups only today |
| the people data exists | `getMyConnections()` already returns each company WITH its people |

## Triage — the two YES answers
| # | | | evidence |
|---|---|---|---|
| 0 | broken / never worked as specified? | NO | current routing is what `DECISIONS.md:1013` locks — a reversal |
| 1 | new screen or surface? | NO | c2c deal surface + picker component both exist |
| 2 | migration / RLS / RPC / auth? | **YES** | `send_deal` is SECURITY DEFINER; needs a migration |
| 3 | concept not in CONTEXT.md? | NO | C2C `:41`, P2P `:40`, Deal draft `:31` all present |
| 4 | changes what the product does? | **YES** | changes WHO SEES a sent deal — see risk 1 |
| 5 | file locked elsewhere? | NO | `origin/claude/ayush/work`: "none - all released", offline |
| 6 | more than one ticket? | likely 2 | backend + frontend |

Diff touches something rendered → **G4 is a human stop**, not auto (PIPELINE §3).

## Supersede — CORRECTED from the seed
The seed named two entries. Only one is in scope:
- **`:961`** ("Request-pricing routes to Connect's inbox") — `pricelist_request`,
  **out of scope, do NOT supersede.** Still true.
- **`:1013`** ("Connect CTAs map to the 4 existing inbox types") — **PARTIAL
  supersede, the `deal_card` arm ONLY.** The other three CTAs still route to inbox.

## Deferred — must NOT be built
- **chat-list consolidation** — Muskan's ruling 2026-08-25: the duplicate
  conversations (Marcel/Canadian Craft as both p2p and c2c) are PRE-EXISTING and
  upstream of this fix. **Own slug.** File from this walk.
- **deal-card defects** — no signal of what changed; seller can't easily find edit;
  can't add items. Muskan: "a whole different slug." **Own slug.** File from this walk.
- `canAsk` connection check + Request-pricing → Connect (`ProductCard.tsx:426`)
- `pricelist_request` → chat (needs a new `chat_message_type`; only 5 seeded)
- deleting `/connect/inbox` + the claim/assign/lens layer (~1,000 lines)
- basket carried into a connection request — ruled out: the existing "connect first"
  block (`BasketDrawer.tsx:320-331`) already IS the rule

## Attempts          three separate budgets — see §10
(none yet)

## Gate log
- triage — FULL, 2026-08-25 (narrowed from F-04, then widened to include the picker)

## For Muskan — two risks + one call owed
1. **This changes who can see a sent deal.** An inbox ticket is claimable by one
   person; a c2c thread is company-wide by definition (`CONTEXT.md:41` — "the whole
   company can see it"). Same consent gate, wider audience. `/spec` states it as
   intended, not discovers it at G5.
2. **`deliver_deal` has a SECOND live caller** —
   `confirm_detected_deal_births_negotiation.sql:176`, the Sella-detection birth
   door. Fixing `send_deal` alone leaves that door still cutting inbox tickets, so
   "deals land in chat" would be true of one door and false of the other. Your L-038
   class. Either widen at `/spec` or say out loud that Sella-born deals keep the old
   route.
3. **Call owed at G1: does this need `/prototype`?** The picker is an EXISTING
   component rendered in one more place, not new UI — so I'd skip G2. Your standing
   rule is prototype-before-build for new UI, so it's your call, not mine.

Also: `CONTEXT.md:31` defines Deal draft as "a Deal Card sitting inside a **P2P**
chat". After this it can sit in a c2c chat too — one-line amendment, proposed not
written.
