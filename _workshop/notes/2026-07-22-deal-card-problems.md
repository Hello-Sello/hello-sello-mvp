# 2026-07-22 - Deal card: problem collection + decided fixes

> Source: session with Claude - review of the two prototypes (`chat-flipdoc`, `deal-card-promo`),
> a full 7-reader code survey of `src/modules/deals/`, Ayush's notebook pages, and Q&A.
> Status: **build running, wave by wave.** Wave 0 (F1) DONE 2026-07-23 - decisions recorded in shared DECISIONS.md. Wave 1 (D1 + B2) DONE 2026-07-23 - pinned shell + "Withdraw changes" label, merged to dev. Wave 2 (A1+A2+A3+C2) DONE 2026-07-24 - the status machine shipped as GSD Phase 12 (11 plans, 6 waves): 10 migrations (private `unsent` birth, `send_deal`, `sign_deal` + transition RPCs, RLS draft-privacy narrow, REVOKE raw status writes), rename sweep, sendDeal action layer, realtime arrival re-key, basket births drafts, e2e reworked. Live 2-browser check: 5/6 pass; the miss = B6 (decided (b), rides Wave 3). Wave 3 (B6+B1+B3+E1 + the Phase-12 review fixes) DONE 2026-07-24 - built test-first via a plan/verify/build/verify loop, merged to dev. Next: Wave 4 (B4+B5+C3+C4, diff coverage + real units/batches) or the parallel chat track (E-series). IN-04 label parked for Muskan; one held-terms residual deferred.
>
> **Verification pass (2026-07-22 evening):** every item was checked against the live code by 6
> parallel verifiers. Result: all items confirmed NOT done, except **C1** (functionally already
> working - see row) and **E4** (confirmed for 1:1 chats; internal GROUPS do work). **B6** has a
> one-case factual finding awaiting Ayush's decision (see row).

## The decided status model (refined today)

| State | Meaning | Today in code | Change needed |
|---|---|---|---|
| Draft | Built but NOT sent - exists only for the creator | Does not exist (create-mode card is browser-only; Send = birth) | NEW: persist unsent draft in DB, private to creator side |
| Negotiation | Sent - all bargaining happens here | Called `draft` in DB from birth to sign | Rename/split; Send = deliver + flip to Negotiation |
| Confirmed | Receiver signed | `confirmed` - works | - |
| Done | Executed (seller invoice) | `done` - works | - |
| Cancelled | Declined - a close, not a delete | `cancelled` - works | - |
| Ticket created / closed | Post-close reopen path | works (close-ticket has no UI button) | small: add button |

Change-level: proposer can always **withdraw** their held change (exists; only the label changes).

## The turn rule (corrected 2026-07-22, third pass - Negotiate refined)

- **Sign is FIXED to the deal, not the version**: the party that did NOT send the deal card is the signer, for the deal's whole life. Seller sent -> buyer signs; buyer sent -> seller signs. Changes during negotiation NEVER flip the sign right. (Replaces the built "who sent the latest version" rule -> B6.)
- **Negotiate = talk, never delete**: pressing Negotiate jumps to the chat, posts a chat pill ("[Name] wants to negotiate") and shows a strip at the TOP of the card ("In negotiation"). A held proposal STAYS on the table while people talk - it leaves the table only when the proposer withdraws it, replaces it with a new Send, or it is accepted. (Changes today's receiver-Negotiate, which discards the proposal.)
- **Replacement rule (implied)**: while a proposal is on the table, its PROPOSER can edit and re-Send - the new version replaces the old proposal. The other side does not edit meanwhile.
- **Resolving a held change stays two-sided**: if the deal SENDER must resolve a change (the signer proposed it), the sender gets **"Accept changes"** - commits the new version but does NOT sign; the signer then signs the updated card.
- Send = implicit yes at both levels (sending the deal / sending a change).
- The deal receiver (the fixed signer) ALWAYS has three options: Negotiate / Sign / Decline (incl. the very first version - B1).
- **Product reality (Ayush)**: buyers will mostly NOT edit the card - most edit features are seller-only anyway. Buyers negotiate through CHAT; the seller makes the versions, in BOTH deal directions.
- **The signer never signs their own unaccepted proposal**: while the SIGNER's own proposal is on the table, their Sign button stays VISIBLE but DISABLED, showing "Waiting for [name]'s acceptance". It activates only after the other side presses Accept changes. Consequence: a buyer-sent deal always takes ONE EXTRA STEP (seller sends changes -> buyer accepts -> seller signs), while a seller-sent deal signs directly (buyer's Sign = accept + sign in one).
- **Buyer-initiated (order) mirror**: buyer builds the order (prices may stay empty - seller-owned pricing, 2026-06-29), sends it; the SELLER is the fixed signer; the seller fills prices via Send-changes; the BUYER gets "Accept changes"; after accept, the seller's Sign activates and they sign. DECIDED 2026-07-22: a buyer create-door WILL be built (-> C5). A1 must keep the status machinery direction-neutral.

## Category A - Lifecycle and statuses (backend-heavy)

| ID | Task | Notes |
|---|---|---|
| A1 | ✅ **DONE 2026-07-24** - Draft (unsent) state saved in DB, private to creator; Send delivers + moves to Negotiation status | Shipped in Phase 12: private birth (`20260724120200`), `send_deal` (`20260724120300`), RLS narrow at the SECURITY-DEFINER helper (`20260724120700`), realtime arrival re-keyed to deal_card events. Live-verified: counterparty sees NOTHING until Send, arrival is realtime without reload |
| A2 | ✅ **DONE 2026-07-24** - Clean up dead statuses (`withdrawn`, `amended`) + dead code (two-sided confirmDeal, ConfirmBar, propose_deal RPC, DealPin State B for manual proposals, dormant edit_deal_draft) | Shipped in Phase 12: statuses gone from DB lookup + unions, ConfirmBar deleted (724 lines of confirm plumbing), propose_deal/edit_deal_draft dropped, manual State-B branches proven dead by metadata audit and removed |
| A3 | ✅ **DONE 2026-07-24** - Enforce the FIXED signer server-side: signer = the non-initiating company, one stored fact from birth | Shipped in Phase 12: `sign_deal` SECURITY DEFINER rejects the initiator + commits a held counterparty change atomically; raw status UPDATE revoked (`20260724120900`); DecisionBar reads the stored `initiating_company_id`. UI button rework = Wave 3 (B6) |

## Category B - Decision bar and negotiation flow

| ID | Task | Notes |
|---|---|---|
| B1 | Negotiate button - always present for the signer, refined semantics | DECIDED (refined 2026-07-22): jump to chat + post a "wants to negotiate" pill + card-top "In negotiation" strip. NEVER discards a held proposal - it stays on the table until withdrawn, replaced by the proposer's next Send, or accepted. Does NOT open edit mode. (Today's receiver-Negotiate discards via confirmDealChange decline - that behavior goes away) |
| B2 | ✅ **DONE 2026-07-23** - Proposer's button label -> "Withdraw changes" | Label only, handler untouched; e2e locator updated in the same commit (`1a7b542`) |
| B3 | After decline / after change resolved, both parties see the last clean state | Bug: declineDeal leaves the deal_pending_change row; CardFront renders the diff whenever pendingChange exists, ignoring status |
| B4 | Terms-only change (payment / delivery date / free delivery / note) shows NO redline - receiver signs blind | pairDealDiff compares only qty/unit/price; Extra Conditions renders current card, not held draft |
| B5 | Batch-only change shows NO diff | batch fields not compared in changed(); new rows show old batch |
| B6 | ✅ **DECIDED 2026-07-24: option (b), fixed signer** - the sender gets "Accept changes" for counters; Sign stays with the deal receiver only. Surfaced live in the Phase-12 verification (step 5): Bob proposed a counter and Alice was offered "Sign the deal" - a button the server now REJECTS (Phase 12 shipped the server half, D-10 initiator rejection in `sign_deal`). The UI flip still lives at DecisionBar.tsx:229 (`iGaveLatest = change ? change.iProposed : iInitiated`) | Build in Wave 3 - the UI half only; server half already enforced |

## Category C - Card editing (create + edit mode)

| ID | Task | Notes |
|---|---|---|
| C1 | Adding a product applies instantly - no tick step | VERIFIED DONE (2026-07-22): the picked line counts immediately - it enters the total and the send payload whether or not the tick is pressed; the tick only collapses the row display (CardFront.tsx:395-402, 908-916). Optional polish only: land the new row collapsed |
| C2 | ✅ **DONE 2026-07-24** - Open Items usable at creation time, before Send | Shipped in Phase 12 (the predicted free win): a persisted draft gets a workspace at birth, both `!createMode` gates were status-free, so Things to do + margins work on drafts with zero new plumbing. Bonus finding: new things now seed PRIVATE by default (the old shared default was the real bug). Live-verified on a draft |
| C3 | Units become real - editable and carried in the proposal | Today the stepper is a frontend mock, never enters the payload ("not able to edit units to counter") |
| C4 | Replace mocks: deal-expiry field (no backend), MOCK_BATCHES dropdown (getProductBatches() is orphaned), enable buyer "add product from seller's shop" | |
| C5 | Buyer create-door + direction fix. BUG today: Start-a-deal hardcodes creator = seller (createDealArgs.ts:14 defaults 'offer'; emptyDraftView viewerSide 'seller') - a buyer is silently cast as seller. THE RULE: the owner of the products on the card = the seller (always code-derivable; precedent: basket groupBySeller + confirm_detected_deal catalogue check). Door: empty paper opens, Send stays dead until >=1 product; an empty card discards on close, with content it becomes an A1 Draft. Picker by shop presence: only my shop has products -> my catalogue, offer, automatic; only theirs -> their catalogue, order, automatic; both -> ONE choice "Your products or [X]'s?"; neither -> Start-a-deal HIDDEN. "Has products" = SYSTEM-level fact (tiny SECURITY DEFINER yes/no fn so private catalogues stay private). When the counterparty has products but none visible to the viewer, or none at all: show a POSITIVE, encouraging message in BOTH situations (e.g. "Request [supplier] for their products") - never "nothing to buy here" / "not shown to you". Free-text product lines are SELLER-only (a buyer never writes products on the seller's behalf). One seller per card - no catalogue mixing. Buyer may fill prices they know (public ones), else empty - the seller fills them in their first version | DECIDED 2026-07-22, full spec from discussion. Coordinate with Muskan: the 'order' deal_type + the from-shop door ride her basket lane |

## Category D - Card shell and layout

| ID | Task | Notes |
|---|---|---|
| D1 | ✅ **DONE 2026-07-23** - Pin the top toolbar (X close, flip/Activity, "Talk about this deal", pencil) and the bottom decision bar; only the paper scrolls between them | Shipped (`5710a60`): NOT sticky - hosts stop scrolling, h-full chain through DealCard's wrappers, CardFront = flex column (pinned titlebar / inner scroll region / pinned footer, all 3 footer variants). CardBack min-h-640 -> h-full. globals.css untouched. AllocateDealCardHost got the minimal 1-word edit (Muskan's lane, flagged). Third mount found in DealPin: chat leaflet gets pinning free; workspace overlay degrades to old behavior (dead code) |

## Category E - Chat and signals

| ID | Task | Notes |
|---|---|---|
| E1 | Post a chat pill when a change is PROPOSED | Today pills exist for sent/signed/declined/committed/change-declined - nothing on propose |
| E2 | Clicking an old signal pill opens that card version, READ-ONLY, clearly marked as old | DECIDED: frozen historical view, not current-card-plus-logs |
| E3 | C2C chat grouped by company side - own company right, other left, sender name shown, like a group chat | VERIFIED not done: alignment is keyed on the viewer's person id (`isMine`), so colleagues' messages land LEFT mixed with the counterparty; the message model carries NO company id at all (store.ts:285, types.ts:161-168). Sender names show only on incoming messages |
| E4 | BUG confirmed for 1:1: the new-chat picker lists only counterparty people - it ignores the own-company roster (`connections.myCompany` is never read by NewChatDropdown), and a same-company pair has no relationship id for `openOrCreateP2pThread`. Internal GROUPS work fine (GroupPicker has an Internal section). Fix must also file the internal chat under the Internal filter (getConversations hardcodes isExternal=true for every p2p) | Verified 2026-07-22 |
| E5 | Group creation: the subject/name becomes MANDATORY | VERIFIED not done: optional at every layer; RPC substitutes the D-06 default (deal code / first names / 'Group'). Enforce in 3 places: GroupPicker canCreate gate, createGroupThread client write, create_group_thread RPC (raise instead of default). Also cover renameGroupThread (blank rename possible today) |

## Category F - Documentation

| ID | Task | Notes |
|---|---|---|
| F1 | ✅ **DONE 2026-07-23** - Record the lifecycle + today's decisions in shared DECISIONS.md (propose-mode, sync ritual) | Shipped as the "2026-07-23 - Deal card single-sign lifecycle LOCKED" DECISIONS.md entry (commit `a63afc5`): full lifecycle + fixed signer + Negotiate + buyer door, supersede pointers on 10+ old entries, Muskan calendar/basket heads-up with timing. Sync ritual run (Muskan idle, no locks). Note: the stale "two buttons" D-19 text lives in `.planning/` phase docs, NOT in DECISIONS.md - nothing to fix there |

## Out of scope

- **Promotions / bundle deals** - dropped for now (Ayush, today, re-confirming 2026-07-08). Dormant code stays untouched; no planning on it.
- **Price-list sharing (per relationship)** - the next task AFTER this board, built later. Until then the buyer door works with public prices + empty-price lines (facts: sharing today is the price_public flag only; "Request pricing" on Discover only mints the connection, it shares no prices - "a later Present-surface feature" per the RLS comment).

## Notebook readings (for the record)

1. After declining / in negotiation, card shows just the last clean state to both parties -> B3.
2. C2C chat: one company's messages on one side, with sender name, like a group -> E3.
3. Product add should be instant, no tick -> C1.
4. Things-to-add should exist at deal creation time -> C2.
5. No signal/notification in chat after a deal card edit -> E1.
6. Sender of changes sees only "Withdraw changes" -> B2.
7. Not able to edit units to counter -> C3.
8. After accepting, previous card states visible via previous signals -> E2.

## Build roadmap (DECIDED - drive with gsd-quick, one task at a time, in this order)

| Wave | Items | Why this position |
|---|---|---|
| 0 | ✅ **DONE 2026-07-23** - F1 - write the new rules into shared DECISIONS.md (propose-mode + sync ritual first) | Protects Muskan NOW - she is building on the old assumptions (her basket lane touches the 'order' type we redefined). Cheapest insurance on the board |
| 1 | ✅ **DONE 2026-07-23** - D1 + B2 - pinned shell + "Withdraw changes" label | Shipped as `5710a60` + `1a7b542`, merged to dev. Gate: tsc clean, 192/192 unit, e2e 15 pass + 2 PROVEN pre-existing fails (chat_message_type seed FK; note-decline missing wait - both recorded in the quick-task summary, not this wave's) |
| 2 | ✅ **DONE 2026-07-24** - A1 + A2 + A3 + C2 - the status machine: DB-persisted private Draft, `negotiation` status, new sendDeal (delivery moves from birth to send), RLS draft privacy, dead-code cleanup (confirmDeal/ConfirmBar/propose_deal RPC/edit_deal_draft, statuses withdrawn+amended), server-side fixed-signer check, OpenItems on drafts | Shipped as GSD Phase 12: 11 plans / 6 execution waves, 10 migrations applied + proven on a live reset. Gate: tsc clean, 199/199 unit (+7 new), build clean, deal e2e 26/27 fresh-seed (only the pre-existing note-decline baseline; the old c2c FK baseline HEALED via send_deal). Live 2-browser check 5/6 - the miss is B6 (UI half), decided + moved to Wave 3. 13 pre-existing non-deal e2e fails triaged in the phase's deferred-items ledger (auth-trigger family root-caused to a June `handle_new_user` migration regression) |
| 3 | ✅ **DONE 2026-07-24 (built + green; merged to dev)** - shipped CR-01 (deal_card INSERT/UPDATE/DELETE revoke) + CR-02 (update_deal_draft in-place edit) + B6 (fixed-role bar) + B1 (Negotiate pill + strip, never discards) + B3 (decline clears pending) + E1 (propose + negotiate pills) + WR-01..04 (RPC hardening) + WR-06 (basket) + IN-01/02/03. Gate: 8 SQL suites green from clean reset, 221/221 unit, deal e2e 19 pass / 5 skip, next build clean. IN-04 parked for Muskan; held-terms residual deferred. Original scope: B6 + B1 + B3 + E1 - DecisionBar around fixed roles: Sign (deal receiver only, disabled while own proposal pending) / Accept changes (deal sender) / Withdraw changes; Negotiate = chat pill + card-top "In negotiation" strip, NEVER discards; replace-proposal path for the proposer; pending-row cleanup on decline; the missing "change proposed" pill. **+ the Phase-12 review fixes (2026-07-24, full report `.planning/phases/12-deal-status-machine/12-REVIEW.md`):** **CR-01 (Critical, security - do FIRST, before any cloud push):** `deal_card` still grants INSERT + DELETE and `card_all` is FOR ALL, so a client can INSERT a born-`confirmed` deal = forged signature; fix = REVOKE INSERT/DELETE (app never inserts deal_card directly). **CR-02 (Critical):** editing an `unsent` draft routes through `proposeDealChange` which can never commit pre-Send - edit lost, card wedged; `edit_deal_draft` was dropped with no replacement; the draft needs a real edit path (fits the DecisionBar/draft rework). **WR-01..04 (RPC hardening):** `deliver_deal` callable direct with no status guard (mints a ticket for a private draft); `decline_deal` allows confirmed->cancelled + unsent->cancelled (un-hides a private draft); sign_deal vs confirm_deal_change lock-order inversion (deadlock); `finalize_deal` answers before the membership check (status oracle). WR-05/06 + 5 Infos in the report | Same files Wave 2 just touched - hot context, e2e tests updated once instead of twice. Phase-12 migrations are NOT on cloud yet, so the SQL fixes can edit the queued migration files in place (re-prove with db reset + harness) |
| 4 | B4 + B5 + C3 + C4 - full diff coverage (terms + batch fields in pairDealDiff + Extra Conditions rendering) + real units (pack_count column: migration + payload + diff + totals) + real batches (wire orphaned getProductBatches) + backend deal-expiry field | The proposal payload and compare logic must be FINAL before the buyer door produces them - otherwise the door gets built twice |
| 5 | C5 - the buyer door: has-products definer yes/no fn, 4-case picker by shop presence, direction from product ownership, positive empty-shop messages, seller-only free text | Needs the direction-neutral machinery (W2), the final bar (W3), and the final payload (W4). Muskan was warned in Wave 0 |
| P | E4 + E5 + E3 + E2 - the chat-module track: internal 1:1 threads, mandatory group subject, company-side message grouping, read-only historical card view from old pills | PARALLEL TRACK: src/modules/messaging/ shares almost no files with waves 2-5 - run it in a second session/worktree or between waves. E2 goes last in this track (it touches the card render) |

**Every wave closes with the same gate:** `tsc`, unit tests, the e2e deal flow (re-mint the deal in-app after any `supabase db reset`), and `docs/deploy/cloud-migrations-pending.md` updated for any new migration (sync ritual first - shared file). Wave 2 will need the existing deal e2e updated for the status rename - expected, not a surprise.

**The one-line logic of the order:** docs to protect the team, shell to avoid double DOM work, foundation before furniture, payload before door, and a parallel chat track because it shares no files. Every line of code gets written once.
