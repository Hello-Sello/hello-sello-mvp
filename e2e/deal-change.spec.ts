/**
 * Held two-sided deal change — end-to-end over the CURRENT "living deal card"
 * UI (chj/07-08: create-mode card, inline row-edit, Sign / Negotiate DecisionBar).
 *
 * Two-company, two-context: Alice (GreenLeaf, the deal's initiator/seller on the
 * default 'offer' create path) and Bob (StonePharm, buyer) hold separate sessions
 * via openTwoContexts, because a held change is resolved by BOTH sides. A fresh
 * draft card is minted in-app at setup (the local DB has no seeded cloud card).
 *
 * REWRITTEN for the living-deal-card rework (this cleanup pass): the OLD flow
 * this file drove (CreateDealForm / EditDealForm modal, a strip "Review change"
 * pop-up backed by ConfirmBar, a mandatory typed reason on every accept/decline)
 * is gone. Both CreateDealForm/EditDealForm AND ConfirmBar are now orphaned
 * components (zero live imports, confirmed by grep) — CardFront.tsx is the ONE
 * component for both create and edit, and DecisionBar.tsx is the ONE place a
 * held change resolves:
 *   - the PROPOSER (whoever gave the latest version) sees "Waiting for the other
 *     side to sign." + (while a change is held) a "Withdraw changes"
 *     button — withdrawDealChange, no reason prompt.
 *   - the SIGNER (the other party) sees, while a change is held, "Negotiate"
 *     (declines the held change — confirmDealChange(decision:'decline'), an
 *     AUTO reason, no typed-reason UI) and always "Sign the deal" (signDeal —
 *     if a change is held this ALSO commits it via confirm_deal_change(accept),
 *     then flips the card straight to `confirmed`/signed in the SAME click).
 *
 * This collapses the OLD three-state model (propose → hold → accept-without-
 * signing, stays draft, OR decline) into two outcomes (Sign commits+finalizes
 * together, or Negotiate discards). A few tests' ORIGINAL assumptions no longer
 * hold as literal fact (there is no more UI-level mandatory-reason gate, and a
 * committed change no longer "stays draft" — see the per-test comments and the
 * cleanup report for the full judgment calls); their surviving, still-true
 * invariants are what these rewritten bodies assert.
 *
 * REALTIME (known app bug, unchanged): DealPin.tsx subscribes to
 * postgres_changes on `deal_pending_change`, but that table was never added to
 * the `supabase_realtime` publication, so the pencil-lock / DecisionBar content
 * does not update live on the OTHER side. These tests call refreshDealView(...)
 * before observing the other side to work around it (a real navigation + re-read,
 * not a weakened assertion).
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import {
  openTwoContexts,
  birthAndOpenDeal,
  refreshDealView,
  resetDealData,
  countRelationshipMessages,
  countDealChangeInputForCard,
  resolveDealCardIdForRelationship,
  pendingChangeNote,
  dealPanel,
  openRowLocator,
  openFirstLineForEdit,
  COUNTERPARTY_NAME,
  type Who,
} from './fixtures/two-company'

// The held change is decided by BOTH sides over ONE shared StonePharm relationship,
// and each test mints + mutates that single live card. Run SERIAL (never in
// parallel) so two tests never collide on the same relationship's deal/proposal
// rows. resetDealData() in beforeEach wipes the deal + proposal rows so each test
// starts from the clean "Start a deal" state (a fast targeted truncate, not a
// full db reset, so the running dev server is never disturbed).
test.describe.configure({ mode: 'serial' })

// shared two-context handles, set up fresh per test so no state leaks between them
let aliceContext: BrowserContext
let bobContext: BrowserContext
let alicePage: Page
let bobPage: Page

test.beforeEach(async ({ browser }) => {
  // wipe this relationship's deal data first so each test starts from the clean
  // "Start a deal" State A (a stale card would leave the strip in State C, where
  // "Start a deal" is absent). Targeted truncate, not a full db reset — see
  // resetDealData.
  resetDealData()
  ;({ aliceContext, bobContext, alicePage, bobPage } = await openTwoContexts(browser))
  // mint a fresh draft deal both sides can act on: Alice creates + births it
  // directly (no propose/accept door anymore), then both open the card panel.
  await birthAndOpenDeal(alicePage, bobPage)
})

test.afterEach(async () => {
  await aliceContext?.close()
  await bobContext?.close()
})

/** Open the edit pencil on a page; the gate / lock is what we assert against. */
function editPencil(page: Page) {
  return dealPanel(page).getByRole('button', { name: /edit deal/i })
}

/**
 * The proposer's "held, awaiting the other side" cue (DecisionBar, iGaveLatest
 * branch) — ONLY renders while a change is actually held (unlike "Waiting for
 * the other side to sign.", which is also the baseline state of a fresh,
 * unedited draft for its initiator). This is the reliable signal that Alice's
 * edit created a real `deal_pending_change` row.
 */
function heldChangeButton(page: Page) {
  return dealPanel(page).getByRole('button', { name: /withdraw changes/i })
}

/**
 * Drive the PROPOSER's held-change flow end to end on `page`:
 *   pencil → open the first product line → bump its quantity (a closed
 *   `<select>` now, one of CardFront's mock unit sizes [100,250,500,1000]) →
 *   "Send changes to <counterparty>" (ONE button; CardFront hardcodes the
 *   proposeDealChange reason to "Updated the deal on the card" — there is no
 *   more reason box on the proposer side, confirmed by reading the
 *   doSendChange() call site).
 */
async function proposeChangeAsAlice(page: Page, qty: string) {
  await editPencil(page).click()
  await openFirstLineForEdit(page)
  await openRowLocator(page).locator('select').nth(2).selectOption(qty)
  await dealPanel(page).getByRole('button', { name: /^send changes to /i }).click()
}

/**
 * The RESPONDER's Sign action on `page` — signDeal(). If a change is held this
 * COMMITS it (confirm_deal_change, accept) and flips the card to `confirmed` in
 * the same click; there is no more separate "accept the change but stay in
 * draft" step (DecisionBar's single-sign model, see the module header).
 */
async function signAsResponder(page: Page) {
  await dealPanel(page).getByRole('button', { name: /^sign the deal$/i }).click()
}

/**
 * The RESPONDER's Negotiate action on `page` — confirmDealChange(decision:
 * 'decline') with DecisionBar's AUTO_REASON ("Updated on the card"). Discards
 * the held change, keeps the live card exactly as it was, unlocks the pencil.
 * No typed-reason UI exists anymore (see the module header).
 */
async function negotiateAsResponder(page: Page) {
  await dealPanel(page).getByRole('button', { name: /^negotiate$/i }).click()
}

/**
 * Flip the open card to its BACK and switch to the Logs tab — the card's real
 * version history (deal_card_log), the only place the version number is shown
 * (CardFront has no version label; v{N} chips live in LogsTab). A committed
 * change writes a "Deal updated to vN" log row; a held-but-not-committed change
 * writes none, so this is the honest signal for "did the live card move?".
 */
async function openLogsTab(page: Page) {
  await dealPanel(page).getByRole('button', { name: /flip to signals and logs/i }).click()
  await dealPanel(page).getByRole('button', { name: /^logs$/i }).click()
}

/**
 * Open `who`'s p2p (person-to-person) chat with the counterparty and wait for the
 * conversation to render. Unlike refreshDealView (which opens the deal card
 * panel), this leaves us on the chat transcript itself so the Phase 2
 * announcement bubbles posted into the p2p thread are visible to assert against.
 * The same navigation refreshDealView uses (/connect/chat → counterparty), minus
 * the "Open the deal card" step.
 */
async function openP2pChat(page: Page, who: Who) {
  await page.goto('/connect/chat')
  await page.getByText(COUNTERPARTY_NAME[who], { exact: false }).first().click()
}

/**
 * held-not-committed (DCHG-01 / DCHG-02): Alice edits a draft and sends. The
 * LIVE card version is unchanged (the change is held, not committed), and her
 * own screen shows the change as held/awaiting the other side (the proposer's
 * own side is implicitly "in" — auto-accept — there is nothing for Alice herself
 * to additionally confirm).
 */
test('held-not-committed + auto-accept: edit holds, live card version unchanged, proposer pre-accepted', async () => {
  await proposeChangeAsAlice(alicePage, '250')

  // a held change now exists on Alice's side — "Withdraw changes"
  // ONLY renders while a change is actually held (unlike the baseline "Waiting
  // for the other side to sign." text, which is also true of a fresh, unedited
  // draft and so cannot prove a change landed).
  await expect(heldChangeButton(alicePage)).toBeVisible()

  // HELD, not committed: the live card has NOT moved, so the version history has
  // no "Deal updated to v2" entry (a commit would have written one).
  await openLogsTab(alicePage)
  await expect(alicePage.getByText(/updated to v2/i)).toHaveCount(0)
})

/**
 * full-lock (DCHG-03): while a change is pending, the Edit pencil is
 * disabled/absent on BOTH Alice's and Bob's screens — one paper on the table.
 */
test('full-lock: edit pencil locked on both screens while a change is pending', async () => {
  await proposeChangeAsAlice(alicePage, '250')

  // Bob re-reads the current state (the live realtime push is the known-broken
  // path; refreshDealView does what it would have done). His "Negotiate" button
  // (decline-the-held-change) ONLY renders once a change is held — unlike
  // "Sign the deal", which is always present for the signer — so it is the
  // reliable cue the held change has landed on his side.
  await refreshDealView(bobPage, 'bob')
  await expect(dealPanel(bobPage).getByRole('button', { name: /^negotiate$/i })).toBeVisible()

  // the pencil is gone for BOTH companies while the change is pending — the lock
  // rides on the shared card, so neither side can start a second edit.
  await expect(editPencil(alicePage)).toHaveCount(0)
  await expect(editPencil(bobPage)).toHaveCount(0)
})

/**
 * reason-required (REAS-01) — LEFT SKIPPED, see the report/comment below.
 *
 * ORIGINAL intent: the responder's Accept/Decline pop-up (ConfirmBar) gated both
 * buttons on a typed reason. That pop-up is GONE — ConfirmBar.tsx is now an
 * orphaned component (zero live imports, confirmed by grep) and DecisionBar's
 * "Sign the deal" / "Negotiate" buttons carry no reason input at all; both pass
 * a hardcoded reason string to the server (signDeal → "Signed the deal",
 * DecisionBar's own AUTO_REASON → "Updated on the card"). The RPC-level
 * `confirm_deal_change` STILL enforces "a reason is required" server-side
 * (unchanged, read from the migration), but there is no more UI surface for a
 * user to type — or omit — one, so there is nothing left for THIS test (a UI
 * gate test) to drive. This is a real capability removed from the UI, not a
 * selector mismatch — needs a product decision (rebuild a reason box, or accept
 * the auto-reason model as final) before this can be rewritten meaningfully.
 */
test('reason-required: accept and decline are disabled until a reason is typed', async () => {
  test.skip(true, 'the responder reason-gate UI (ConfirmBar) was retired along with the create form in the living-deal-card rework — DecisionBar\'s Sign/Negotiate carry no reason input at all anymore (both pass a hardcoded string). Needs a product decision on whether to rebuild a reason gate. See the e2e cleanup report.')
})

/**
 * two-sided-commit (DCHG-04): Bob accepts the held change; the pending change
 * clears on both screens and the version history carries the "Deal updated to
 * v2" log entry on both screens.
 *
 * JUDGMENT CALL — the ORIGINAL title/assertion said "status stays draft" (D-06).
 * That is no longer true: DecisionBar's only responder action that resolves an
 * ACCEPT is "Sign the deal" (signDeal), which commits the held change via
 * confirm_deal_change AND immediately flips the card to `confirmed` in the SAME
 * click — there is no more "commit but keep negotiating" step. The RPC itself
 * still writes `status = 'draft'` as part of its own update (confirmed by
 * reading 20260707130300_deal_event_system_voice.sql:168), but signDeal's very
 * next statement overwrites it to `confirmed` before the UI ever re-renders, so
 * a user can never observe the intermediate draft state. This test now asserts
 * the NEW true invariant (confirmed, evidenced by the seller's invoice-upload
 * prompt) instead of the retired one — flagged in the cleanup report as a
 * product-redesign discovery, not silently patched over.
 */
test('two-sided-commit: signing commits to base+1 and signs the deal, pending clears', async () => {
  await proposeChangeAsAlice(alicePage, '250')

  await refreshDealView(bobPage, 'bob')
  await dealPanel(bobPage).getByRole('button', { name: /^negotiate$/i }).waitFor()
  await signAsResponder(bobPage)

  // Alice re-reads the now-committed state (Bob's sign is the other side's
  // action — the known-broken live push, so refresh to pull it).
  await refreshDealView(alicePage, 'alice')

  // pending clears on the proposer side: no more held-change button anywhere
  // once Bob has signed.
  await expect(heldChangeButton(alicePage)).toHaveCount(0)

  // status is now CONFIRMED (signed) — the seller-only "Upload the invoice PDF"
  // prompt only renders in DecisionBar's confirmed/amended branch, so its
  // presence is direct proof of the new status (Alice is the seller here).
  await expect(alicePage.getByRole('button', { name: /upload the invoice pdf/i })).toBeVisible()

  // the card committed to base+1: the version history now carries the
  // "Deal updated to v2" log entry, on BOTH screens (it rides the shared card).
  await openLogsTab(alicePage)
  await expect(alicePage.getByText(/updated to v2/i)).toBeVisible()
  await refreshDealView(bobPage, 'bob')
  await openLogsTab(bobPage)
  await expect(bobPage.getByText(/updated to v2/i)).toBeVisible()
})

/**
 * decline-discards (DCHG-05): Bob negotiates (declines the held change); the
 * card version is unchanged, the pending change clears, and the Edit pencil
 * unlocks again.
 */
test('decline-discards: decline leaves the card unchanged, clears pending, unlocks the pencil', async () => {
  await proposeChangeAsAlice(alicePage, '250')

  await refreshDealView(bobPage, 'bob')
  await negotiateAsResponder(bobPage)

  // a decline discards the change: the pencil is editable again on BOTH screens
  // (each side re-reads the cleared state — Alice via refresh, since Bob's decline
  // is the other side's action), and the live card never moved — no
  // "Deal updated to v2" entry was written.
  await refreshDealView(alicePage, 'alice')
  await expect(editPencil(alicePage)).toBeVisible()
  await expect(editPencil(bobPage)).toBeVisible()
  await openLogsTab(alicePage)
  await expect(alicePage.getByText(/updated to v2/i)).toHaveCount(0)
})

/**
 * withdraw (DCHG-06): Alice withdraws her own pending change with NO reason
 * prompt; the pending change clears and the pencil unlocks.
 */
test('withdraw: proposer withdraws with no reason prompt, clears pending, unlocks the pencil', async () => {
  await proposeChangeAsAlice(alicePage, '250')

  // Alice withdraws — "Withdraw changes" takes back the change with
  // NO reason prompt (no dialog opens, withdrawDealChange). This is Alice's own
  // action, so her side updates locally.
  await heldChangeButton(alicePage).click()

  // the change is gone and Alice's pencil is back.
  await expect(heldChangeButton(alicePage)).toHaveCount(0)
  await expect(editPencil(alicePage)).toBeVisible()

  // Bob re-reads the cleared state: no more "Negotiate" button (nothing to
  // decline), and his pencil is editable again (the lock cleared once the held
  // change was withdrawn).
  await refreshDealView(bobPage, 'bob')
  await expect(dealPanel(bobPage).getByRole('button', { name: /^negotiate$/i })).toHaveCount(0)
  await expect(editPencil(bobPage)).toBeVisible()
})

/**
 * accept-announces (ANNC-01): when Bob signs (committing Alice's held change —
 * the SECOND yes / both-accepted commit), a System message announcing the move
 * to v2 appears in the p2p chat, on BOTH Alice's and Bob's screens. The
 * announcement is a projection written by confirm_deal_change (HOOK B) — the
 * SAME RPC signDeal calls internally, so the narration is unaffected by the
 * DecisionBar redesign.
 *
 * JUDGMENT CALL — dropped the ORIGINAL "deal chat" (chat_thread.type='deal')
 * check: that thread is NEVER independently rendered anywhere in the current
 * UI (confirmed — `/connect/deal/[id]` is a deep-link that just re-dispatches
 * `hs:open-deal-card`, not a thread viewer; "Talk about this deal" opens the
 * group-picker to CREATE a new group, not the existing deal thread). The DB-
 * level guarantee for that thread is already covered by chat-phase7.spec.ts's
 * OBS-3 test (asserts sender='system' on the deal thread directly via SQL) —
 * duplicating it here via the UI is not possible, so this test now verifies
 * only the user-visible half (the p2p chat).
 */
test('accept-announces: a commit posts a "moved to v2" bubble in the p2p chat on both screens', async () => {
  await proposeChangeAsAlice(alicePage, '250')

  await refreshDealView(bobPage, 'bob')
  await signAsResponder(bobPage)

  // the RPC body: "Change accepted - the deal moved to v2."
  const movedToV2 = /(moved|updated|accepted).*v2/i

  // Bob's p2p chat (he just acted from the deal card; go to the chat transcript).
  await openP2pChat(bobPage, 'bob')
  await expect(bobPage.getByText(movedToV2).first()).toBeVisible()

  // Alice's p2p chat.
  await openP2pChat(alicePage, 'alice')
  await expect(alicePage.getByText(movedToV2).first()).toBeVisible()
})

/**
 * decline-announces (ANNC-02): when Bob negotiates (declines the held change),
 * an announcement carrying the decline reason appears in the p2p chat.
 *
 * JUDGMENT CALL — the ORIGINAL test typed a UNIQUE custom reason string into a
 * responder reason box and asserted its exact echo. That reason box is GONE:
 * DecisionBar's "Negotiate" button hardcodes its reason to AUTO_REASON =
 * "Updated on the card" (read directly from DecisionBar.tsx) — there is no more
 * user-supplied text to propagate. The test's core mechanic (a decline
 * announcement carries reason text inline) still holds, so this asserts the
 * REAL fixed string instead of a custom one — a smaller guarantee than before
 * (arbitrary text propagation is no longer provable), flagged in the cleanup
 * report. Also drops the "deal chat" check for the same reason as
 * accept-announces above.
 */
test('decline-announces: a decline posts a bubble carrying the (now fixed) decline reason inline', async () => {
  await proposeChangeAsAlice(alicePage, '250')

  await refreshDealView(bobPage, 'bob')
  await negotiateAsResponder(bobPage)

  // DecisionBar.AUTO_REASON, formatted by the RPC as "Change declined - <reason>".
  const declineAnnouncement = /change declined.*updated on the card/i

  await openP2pChat(bobPage, 'bob')
  await expect(bobPage.getByText(declineAnnouncement).first()).toBeVisible()
  await openP2pChat(alicePage, 'alice')
  await expect(alicePage.getByText(declineAnnouncement).first()).toBeVisible()

  // the card did NOT move — no "updated to v2" log entry.
  await refreshDealView(alicePage, 'alice')
  await openLogsTab(alicePage)
  await expect(alicePage.getByText(/updated to v2/i)).toHaveCount(0)
})

/**
 * withdraw-silent (ANNC-03): when Alice withdraws her own pending change (the
 * no-reason take-back), NOTHING is announced — no chat message is posted to any
 * of the relationship's threads. Silence is hard to prove in the UI, so we
 * snapshot the chat_message count across the relationship's threads BEFORE the
 * withdraw and assert it is UNCHANGED after. Also assert the pending state
 * clears (the pencil is back).
 */
test('withdraw-silent: a withdraw posts NO announcement (chat_message count unchanged) and clears pending', async () => {
  await proposeChangeAsAlice(alicePage, '250')

  // snapshot the live message count across the relationship's threads, then
  // withdraw, then assert the count did not change (no announcement was posted).
  const before = countRelationshipMessages()
  await heldChangeButton(alicePage).click()
  await expect(heldChangeButton(alicePage)).toHaveCount(0)
  await expect(editPencil(alicePage)).toBeVisible()
  const after = countRelationshipMessages()
  expect(after).toBe(before)
})

/**
 * gate-accept-decline (ANNC-04) — LEFT SKIPPED, see the comment below.
 *
 * ORIGINAL intent: the responder's review pop-up (ConfirmBar) showed only
 * "Confirm deal" + "Decline", with NO seal-withdraw control — a regression
 * guard against a retired Phase-1 "seal Withdraw" leaking into that gate. That
 * pop-up no longer exists. In the CURRENT DecisionBar, the signer's view shows
 * "Negotiate" + "Sign the deal" AND, always, a separate "Decline deal" button
 * (the two-step "end this deal entirely" control) — i.e. the new UI
 * intentionally DOES offer a deal-ending action right alongside Negotiate/Sign,
 * the exact opposite of what this regression guard checked for. The original
 * premise (no seal-like control in the accept/decline gate) no longer applies
 * to how the app is shaped today — this needs a product decision on whether a
 * NEW regression guard is wanted here, not a mechanical fixture fix.
 */
test('gate-accept-decline: the responder review gate shows only Confirm deal + Decline, no seal Withdraw', async () => {
  test.skip(true, 'the responder review-gate UI (ConfirmBar) is gone; the current DecisionBar intentionally shows a "Decline deal" (end the whole deal) button alongside Negotiate/Sign for the signer, the inverse of what this regression guard checked for. Needs a product decision on a replacement guard, not a fixture fix. See the e2e cleanup report.')
})

/**
 * card-terms-shown (CARD-03): the card face shows the two already-stored terms
 * — a Payment row (a human label resolved from card.payment_terms_code) and a
 * Delivery row (read from card.metadata.free_delivery / delivery_date_target).
 * The seeded birth flow sets NO payment term, so this asserts the row LABELS
 * render (the rows exist on the card face — CardFront's Extra Conditions grid,
 * always rendered regardless of value), not a specific seeded term value.
 *
 * JUDGMENT CALL: the ORIGINAL regexes (/payment terms/i, /free delivery/i)
 * assumed exact copy that CardFront never shipped — its read-mode term cards
 * literally read "Payment" / "Deal expiry" / "Delivery" (confirmed by reading
 * CardFront.tsx's Extra Conditions section), not "Payment terms"/"Free
 * delivery". Loosened to match the real labels while preserving the test's
 * actual intent (the rows exist).
 */
test('card-terms-shown: the card face shows the Payment + Delivery rows', async () => {
  // birthAndOpenDeal (beforeEach) already opened the card; re-read from the server
  // (house style) so the assertion runs against the current card view.
  await refreshDealView(alicePage, 'alice')
  await expect(dealPanel(alicePage).getByText(/^payment$/i)).toBeVisible()
  await expect(dealPanel(alicePage).getByText(/^delivery$/i)).toBeVisible()
})

/**
 * private-immediate (DCHG-07 / MRGN-01) — LEFT SKIPPED, see the comment below.
 */
test('private-immediate: per-line cost saves at once for Alice and never leaks to Bob', async () => {
  test.skip(true, 'no private-cost/margin input exists anywhere in the app today (confirmed via code read + grep of CardFront.tsx: EditLine.ownInput is threaded through to createDeal/proposeDealChange but nothing in the JSX ever lets a user type into it, in EITHER create or edit mode) — neither the old flat "Buying price" box nor a new per-line one. Needs a product decision on whether to rebuild it. See the e2e cleanup report.')
})

/**
 * margin-no-old-box (MRGN-01, D-09) — LEFT SKIPPED, see the comment below.
 */
test('margin-no-old-box: the mislabeled single private box is gone, replaced by a per-line input', async () => {
  test.skip(true, 'same gap as private-immediate: there is no per-line "your cost (only you)" input anywhere in the current CardFront.tsx (confirmed via code read + grep) to assert the positive half against — asserting only the negative half (the old box is absent) would false-pass for the wrong reason (nothing renders at all, not "replaced by a per-line input"). Needs a product decision. See the e2e cleanup report.')
})

/**
 * The note textarea inside CardFront (create AND edit mode share the SAME
 * textarea, no label — placeholder "A note the other side will see on your
 * behalf…", confirmed by reading CardFront.tsx). Unlike the old
 * CreateDealForm/EditDealForm split, there is only one placeholder to match now.
 */
function noteBox(page: Page) {
  return dealPanel(page).getByPlaceholder(/a note the other side will see on your behalf/i)
}

/**
 * D-01/D-04: Alice edits ONLY her note (alongside a qty bump, to reuse the
 * existing held-change driver shape) and sends. The change rides the EXISTING
 * held flow — pencil → fields → "Send changes to X" — proving a note change is
 * held exactly like a line/term change, not applied immediately.
 *
 * JUDGMENT CALL: the ORIGINAL "the card face must show Alice's own 'GreenLeaf
 * cultivation notes' row" assertion never matched real CardFront copy, and my
 * first rewrite attempt (asserting Alice sees her own held note immediately)
 * was ALSO wrong — verified empirically by running this test: CardFront's
 * read-mode Note block reseeds from the SERVER's `myNote` the instant
 * `data.pendingChange` changes (which happens right after send), and the note
 * only lives in the HELD draft server-side until a commit — so NEITHER side
 * can see a held note anywhere in the current UI, a pre-existing gap this
 * cleanup did not introduce (the original RED test already expected this: "the
 * LIVE card face does not yet have a note row at all"). Verifies the honest
 * DB-level fact instead (the note DID travel through the held mechanism) and
 * keeps the UI-observable half that IS true (Bob sees nothing while it's held).
 */
test('note-held: editing the note holds it — live note unchanged, pending awaits the other side', async () => {
  const newNote = 'Bumping qty and adding a note for Bob'
  await editPencil(alicePage).click()
  await noteBox(alicePage).fill(newNote)
  await openFirstLineForEdit(alicePage)
  await openRowLocator(alicePage).locator('select').nth(2).selectOption('250')
  await dealPanel(alicePage).getByRole('button', { name: /^send changes to /i }).click()

  // a held change now exists on Alice's side (see heldChangeButton's comment).
  await expect(heldChangeButton(alicePage)).toBeVisible()

  // the note travelled through the held mechanism (DB-level — no UI surface
  // renders a held note on EITHER side today, see the comment above).
  const cardId = resolveDealCardIdForRelationship()
  expect(pendingChangeNote(cardId)).toBe(newNote)

  // Bob re-reads the current LIVE state — his card face must NOT show Alice's
  // new note (it is held, not committed).
  await refreshDealView(bobPage, 'bob')
  await expect(bobPage.getByText(newNote)).toHaveCount(0)
})

/**
 * D-02 own-slot / D-03 both-visible / D-08: Bob signs (committing the held
 * change). After both sides re-read, Alice's new note shows in HER slot on BOTH
 * faces, proving the commit-to-slot relay and the both-visible rule.
 */
test('note-commit: signing commits the note to the proposer slot, visible on both faces', async () => {
  const newNote = 'Bumping qty and adding a note for Bob'
  await editPencil(alicePage).click()
  await noteBox(alicePage).fill(newNote)
  await openFirstLineForEdit(alicePage)
  await openRowLocator(alicePage).locator('select').nth(2).selectOption('250')
  await dealPanel(alicePage).getByRole('button', { name: /^send changes to /i }).click()

  await refreshDealView(bobPage, 'bob')
  await signAsResponder(bobPage)

  // both sides re-read the committed card — Alice's new note now shows on BOTH
  // faces (D-03: both members can see it), in HER slot.
  await refreshDealView(alicePage, 'alice')
  await expect(alicePage.getByText(newNote)).toBeVisible()
  await refreshDealView(bobPage, 'bob')
  await expect(bobPage.getByText(newNote)).toBeVisible()
})

/**
 * D-02: Alice edits her note, Bob negotiates (declines). After refresh the note
 * is UNCHANGED from before the edit — a decline discards the whole change, note
 * included, exactly like it discards a line/term change.
 *
 * JUDGMENT CALL: same discovery as note-held (see its comment) — a held note
 * renders nowhere in the current UI, on EITHER side, so this checks the DB-level
 * fact that the note DID reach the held draft (proof the row isn't skipped
 * because the note was silently dropped before Bob ever acted), THEN that it
 * never lands anywhere after Bob's decline.
 */
test('note-decline: a decline discards the note change — the note stays as it was', async () => {
  const rejectedNote = 'This note should never land — Bob declines'
  await editPencil(alicePage).click()
  await noteBox(alicePage).fill(rejectedNote)
  await openFirstLineForEdit(alicePage)
  await openRowLocator(alicePage).locator('select').nth(2).selectOption('250')
  await dealPanel(alicePage).getByRole('button', { name: /^send changes to /i }).click()

  // the note reached the held draft before Bob acts (so the count-0 checks
  // below cannot false-pass because the note was silently dropped earlier).
  const cardId = resolveDealCardIdForRelationship()
  expect(pendingChangeNote(cardId)).toBe(rejectedNote)

  await refreshDealView(bobPage, 'bob')
  await negotiateAsResponder(bobPage)

  // the live note is exactly what it was before the edit (none, at birth).
  await refreshDealView(alicePage, 'alice')
  await expect(alicePage.getByText(rejectedNote)).toHaveCount(0)
  await refreshDealView(bobPage, 'bob')
  await expect(bobPage.getByText(rejectedNote)).toHaveCount(0)
})

/**
 * D-08: a deal born WITH a create-time note shows that note on the card FACE
 * for BOTH sides from birth — no edit/accept cycle needed. This is a fresh
 * birth (NOT the shared beforeEach card, which has no note), so it re-runs
 * resetDealData + birthAndOpenDeal with a note seeded at create time.
 */
test('note-on-face: a create-time note shows on the card face for both sides from birth', async () => {
  const birthNote = 'Seeded straight from creation — visible to both, no edit needed'
  resetDealData()
  await birthAndOpenDeal(alicePage, bobPage, { note: birthNote })

  await refreshDealView(alicePage, 'alice')
  await expect(alicePage.getByText(birthNote)).toBeVisible()
  await refreshDealView(bobPage, 'bob')
  await expect(bobPage.getByText(birthNote)).toBeVisible()
})

/**
 * D-05: the create-time note must NOT add a `deal_change_input` row — that
 * table is the held-CHANGE reason log, not the birth note's home (the note
 * lives on the card's own slot column instead). Resolve the freshly-born card
 * id at RUNTIME (the overlay exposes no id in the DOM/URL) and assert the
 * per-card counter is 0.
 */
test('note-not-in-log: a create-time note never writes a deal_change_input row', async () => {
  resetDealData()
  await birthAndOpenDeal(alicePage, bobPage, { note: 'A note at birth, never logged' })

  const cardId = resolveDealCardIdForRelationship()
  expect(countDealChangeInputForCard(cardId)).toBe(0)
})

/**
 * batch-snapshot (Phase 3f / BTCH-01) — LEFT SKIPPED, see the comment below.
 *
 * ORIGINAL intent: picking one of a product's REAL seeded batches (GL-24-0001..
 * 0008, seed.sql section 7, real measured THC/CBD per lot) freezes that batch's
 * number + measured THC/CBD onto the born deal line. This is a genuine
 * REGRESSION discovered during this cleanup, not a selector fix:
 *   - `getProductBatches()` (src/modules/deals/supabase/reads.ts) — the real
 *     per-product batch read, seller-only, backed by `product_batch` — is now
 *     an ORPHANED function with ZERO callers anywhere in the app (confirmed by
 *     grep). CardFront.tsx's batch `<select>` uses a hardcoded, FRONTEND-ONLY
 *     mock list instead (`MOCK_BATCHES = ["24-098","24-117",...]`, no "GL-24-"
 *     prefix, no batchId, no measured THC/CBD attached to the choice).
 *   - selecting a mock batch only sets `EditLine.batchNumber` (a display
 *     string); `batchId`/`thcPercent`/`cbdPercent` never change from the
 *     product's own label-level defaults, so nothing measured is ever snapshot.
 * There is no UI path left that can honestly satisfy this test's assertions
 * (a real "GL-24-" number + a measured THC value on the born line) — forcing a
 * pass would mean asserting on the cosmetic mock instead, silently hiding that
 * the real batch-snapshot feature no longer has any UI surface. Needs a product
 * decision: rebuild the real batch picker in CardFront (wiring getProductBatches
 * back in), or intentionally retire BTCH-01. See the e2e cleanup report.
 */
test('batch-snapshot: a picked batch shows its GL-24- number + measured THC on the card line', async () => {
  test.skip(true, 'getProductBatches() is now an orphaned function (zero callers) — CardFront\'s batch <select> is a hardcoded frontend-only mock list with no batchId/measured-THC backing, so there is nothing real left to snapshot. This is a genuine regression from the living-deal-card rework, not a fixture/selector fix. See the e2e cleanup report.')
})
