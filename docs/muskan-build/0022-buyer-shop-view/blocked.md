# BLOCKED — T07, at plan stage · 2026-08-23

**Both plan-checker rounds are spent (2/2) and the loop did NOT converge** — round 2 returned
**4 blocking, all NEW**, every one in text rev 2 wrote while fixing round 1. Seventh ticket on
this slug to do this.

Three are folded into rev 3. **One needs Muskan and blocks the build.**

---

## THE QUESTION — where does a basket refusal get shown?

The server will refuse the add. The ticket's last criterion says the refusal must reach the
user rather than becoming an unhandled rejection. **Catching it is allowed. Showing it is
fenced.**

`STATE.md:114-118` · `TICKETS.md:113-121` — **Locked at T02's G4** (Muskan: *"amend"*):

> `ShopView` shall carry **no new state, and exactly one new branch.**

**That one branch is spent** — T02's header conditional, shipped at `ShopView.tsx:677-696`.
A message needs somewhere to live and something to render it: **new state + a second branch.**
Both halves.

Routing it through the card instead is fenced too — `ADR-0005:579-581` caps card edits at the
three already made.

### Options

| | what | cost |
|---|---|---|
| **A** | **Amend the `ShopView` fence** to allow this state + branch, with the WHY recorded | The precedent: T02, T04 and T09 each amended a fence at G4 rather than exceed it silently. Cheapest, and the fence has been amended before for less. |
| **B** | **Read the Locked entry as T02-scoped** — it capped *T02's* diff, not the file forever | No amendment, but it reinterprets a rule Muskan personally ruled on. If wrong, every later ticket inherits a fence nobody is honouring. |
| **C** | **Fourth card edit** — return the result to `ProductCard`, T04's pattern (`ShopView.tsx:594-598`: *"The result is RETURNED, not swallowed"*) | Crosses the *other* fence instead. Trades a `ShopView` amendment for an ADR amendment. |
| **D** | **Ship the server rule now, surface it in a follow-up ticket** | T07's security half lands immediately; the criterion goes unmet and the refusal stays an unhandled rejection — **which is what T10 already exists for.** Adds a fifth instance of DEV-83's shape. |

**Recommendation: A.** The fence exists to stop `ShopView` accreting behaviour props and
drive-by state — not to block a refusal message the ticket explicitly requires. Amending it
with a recorded WHY is the move this slug has made three times, and it keeps the criterion met.

---

## Folded into rev 3, no ruling needed

- **B2** — `BasketDrawer.tsx:264-267` calls `updateBasketLinePackCount` with no try/catch and
  drops the Promise. With this policy live, a buyer stepping the pack count on a line whose
  product went hidden gets a **silent no-op + unhandled rejection** — proven live
  (`UPDATE → 42501`). DEV-83's shape, **fourth instance on this slug.** The sibling handler in
  the same file already try/catches into an existing error line.
- **B3** — the component test rev 2 promised **cannot be written**: vitest runs `environment:
  "node"`, there is no jsdom/testing-library in `package.json`, and components render via
  `renderToStaticMarkup` only. Replaced with the `42501 → typed error` mapping test, which this
  runner can run; the render assertion is named as an e2e-or-jsdom **decision**, not smuggled in.
- **B4** — cell 9 as worded **could not detect its own mutation**. Under `add-using` the DELETE
  succeeds silently affecting zero rows and the buyer's post-delete count reads 0 too, so every
  naive assertion stays green while the row is still there. Now asserts the buyer-visible count
  **before** and a privileged count **after**.
- Notes: three mis-cited line ranges corrected · the `anon` enumeration completed (a third path,
  `actions.ts:42`) · **`anon` can TRUNCATE this table today — the revoke closes a T11 instance
  early** · `drop-price-arm` under-listed what it breaks · cell 10 must assert on the *message*,
  since grant and RLS refusals share SQLSTATE 42501 · a cell added for owner + *no price set* ·
  cell 6 must mutate GreenLeaf to `pending` itself · ledger added to Files.
- **ADR §7 repaired**: its heading and SQL block still said `as restrictive for insert` while its
  own prose said `FOR ALL, not FOR INSERT`. **A builder copying that block ships the ornamental
  policy rev 6 spent a round removing.**
