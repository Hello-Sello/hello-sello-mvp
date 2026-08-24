# PLAN — T03 · `ProductCard`: the price gate and the request-pricing hook  (rev 2)

**Ticket:** [HEL-57](https://linear.app/hellosello/issue/HEL-57) · **S** · depends on: —
**Branch:** `claude/muskan/work`, base frozen (unchanged since T00; no rebase mid-build).
**Counters:** fresh — new ticket, not a G4 re-entry.
**rev 2** folds in one checker round: rev 1's `canAsk` collapsed a distinction the ADR and the
DB both keep deliberately. Line citations corrected throughout (rev 1 regressed three the ADR
had right).

---

## The live defect

`ProductCard.tsx:755` gates the buy row on **`!editing` alone**:

```tsx
{/* Buy row — read mode only. */}
{!editing && ( <qty stepper/> <Add to basket/> )}
```

There is **no price condition anywhere**. Today that is invisible because no product is ever
buyer-visible — T00 just changed that. On the buyer view a price-hidden product would render a
quantity stepper and Add-to-basket over "Price on request".

## Ground facts — read, not assumed

| fact | evidence |
|---|---|
| `priceShown = !editing && pricePublic && p.price_per_gram != null` | `:351` — already exists, already correct; it is simply **not wired to the buy row** |
| `pricePublic = fields.price_public ?? p.price_public` | `:284` — edit-mode draft overlay wins, then the row |
| owner chrome (Visible/Hidden toggle, Edit details, Delete) is inside the `editing ? … : …` branch | `:427-471` (the `editing ? … : …` ternary opens at `:426`, closes `) : (` at `:472`) — **AC 11 is already safe there**; buyer mode never reaches it |
| the "Hidden" badge is in the **read-mode** branch as `{!p.profile_visible && …}` | `:475` — with `profile_visible` **undefined** this is `!undefined` → **true**, so a buyer would see a "Hidden" badge on every card |
| `panelShowing = pricesOpen && priceShown && p.tiers.length > 0` | `:354` — the ladder already keys off `priceShown`, so it needs no change |
| the BatchPicker is gated `!editing && p.batches.length > 0` | `:786` — its comment says "Owner-only" but it is **data**-gated, not owner-gated. Safe only because T05 returns no batches to buyers. Noted, not changed (out of scope) |

## Design

### 1. `viewerIsOwner?: boolean` — and it must default **`true`**

The gate is ADR §6: `!editing && (priceShown || viewerIsOwner)`.

The criterion *"when `viewerIsOwner` is not supplied, the card shall behave exactly as it does
today"* forces the default. Today the buy row renders for every read-mode card, so:

| default | resulting gate when prop omitted | matches today? |
|---|---|---|
| **`true`** | `!editing && (… \|\| true)` ≡ `!editing` | ✅ identical |
| `false` | `!editing && priceShown` | ❌ `/present` silently loses buy rows on price-hidden products |

**⚠️ Flagging the footgun rather than hiding it:** a boolean that *defaults to the privileged
value* means any future consumer that forgets the prop silently gets owner behaviour, with every
test green. That is exactly the failure round 4 (B2) caught in ADR rev 5 — the gate was specified
and nothing supplied the prop, so it would never have fired in buyer mode. It is ADR-locked and
T02 supplies `viewerIsOwner={viewerCanManage}`, so this plan implements it as written. Recorded
so it is a known cost, not a surprise.

### 2. Request-pricing gates on `pricePublic`, NOT on the buy row's complement

**rev 1 got this wrong.** It defined `canAsk` as the strict complement of `canBuy`, which fires
on **two** different seller states, because `priceShown` (`:351`) is false in both:

| seller state | `price_public` | `price_per_gram` | what it means |
|---|---|---|---|
| price on request | `false` | anything | *"ask me"* |
| **price not set yet** | `true` | `null` | *the seller hasn't finished setting up* |

The DB keeps that distinction on purpose — `20260816190000:96-97`: `price_public` exists
*"so the UI can tell 'price on request' from 'price not set yet'"* — and ADR-0005 rules the
collapse out **twice**: at `:538-539` (rev 2 of the ADR "would have shown Request-pricing on an
unpriced **public** product — outside AC 3's scope") and again at `:566-567` (*"Request-pricing
renders on the complement **only where the seller has hidden the price** — never on merely
unpriced products"*). rev 1 quoted §6 for `canBuy` and dropped the sentence constraining `canAsk`.

**Corrected gates:**

```tsx
const canBuy = !editing && (priceShown || viewerIsOwner);
const canAsk = !editing && !viewerIsOwner && !pricePublic;
```

**Strict complementarity is therefore given up, deliberately.** Read-mode, non-owner:

| `pricePublic` | `price_per_gram` | `canBuy` | `canAsk` | footer slot |
|---|---|---|---|---|
| true | set | ✅ | ✗ | buy row |
| **true** | **null** | **✗** | **✗** | **empty — see below** |
| false | anything | ✗ | ✅ | Request-pricing |

**⚠️ The empty cell is not exotic — it is a two-click seller action, and the card actively
misleads in it.** The seller ticks "Show price" (`:616`) and saves with the price box blank;
`writeStandardPrice` returns `{ ok: true }` on a null price (`manage.ts:449`). The buyer then
sees the pill **"Price on request"** (`:658`) — *with no way to request*. Not "no price shown":
the card names the affordance and withholds it. A seller who marks a price
public and never sets one gives a buyer a visible product with no price, no buy control and no
way to ask. rev 1's collapse would have filled it with Request-pricing, which is arguably the
better *experience* — but the ADR forbids it in writing, so this plan obeys the ADR and
**escalates the cell to Muskan BEFORE build** — not at G4 — rather than quietly picking the nicer
behaviour over a signed decision. **G4 could not surface it anyway:** G4 is the visual walk, and
cell 12 is not walkable on the current seed (T00 seeded all four corners of
`visible × price_public`, never of `price_public × price_set`; `seed.sql:446-461` gives all five
products a non-null price). "Escalate at G4" would have resolved to "nobody looks".

### 3. `profile_visible` optional, and the badge guard inverted

`shop.ts:72` → `profile_visible?: boolean`. Then `:475` must become **`p.profile_visible === false`**
— not `!p.profile_visible`, which renders the badge when the field is absent. This is the whole
of the "no seller state in buyer mode" criterion.

`price_public` stays **required** and unchanged — but rev 2 makes it **load-bearing**, so the
premise must be pinned rather than assumed. `canAsk` now reads `pricePublic` directly, so the
buyer mapper MUST forward the real flag. It already can: `DiscoverProduct` carries
`price_public` — `DiscoverProduct.pricePublic` at `companies.ts:149` (`:166` is the raw `ShopRow`)
— and maps it as `pricePublic: r.price_public` (`:204`). **Hardcoding `price_public: true` on the buyer side — which rev 1 proposed — would
make the ADR's distinction permanently unrepresentable and silently kill `canAsk` for every
buyer.** Neither T02 nor T05 currently carries a criterion for this; **T02 gains one** (it owns
the `DiscoverProduct → ShopProduct` product mapper).

**Why the edit-draft overlay cannot disturb this — structurally, not by inspection:** `pricePublic`
is `fields.price_public ?? p.price_public` (`:284`), and the draft arm can differ from the row
**only in edit mode** — where `canBuy` and `canAsk` are already false because both carry
`!editing`. So the overlay is unreachable from either gate. That removes the premise rather than
verifying it. (`:284`'s other reader, `:616`, is edit-mode only.)

### 4. What T03 deliberately does NOT touch

- **Pack-size bubbles stay visible when the price is hidden.** `packSizes()` unions tier rungs
  into the bubble row regardless of `price_public`, so a price-hidden product still shows e.g.
  `2000g+`. Muskan adjudicated this at T00's G4 (2026-08-19): *"I think it can show the volume
  with price hidden."* **Suppressing it would be building against a signed decision.**
- The ladder panel overlapping Add-to-basket — accepted at the same gate, not a defect.
- Owner chrome in the `editing` branch — already unreachable in buyer mode.

## Steps

1. `src/modules/catalog/shop.ts:72` — `profile_visible` → optional.
2. `ProductCard.tsx` props — add `viewerIsOwner?: boolean` (**default `true`**, documented with
   the reason) and `onRequestPricing?: (productId: string) => void`.
3. `ProductCard.tsx:351` region — derive `canBuy` / `canAsk` beside `priceShown`, so all three
   read as one gate group rather than being scattered. Comment the empty cell so the next reader
   does not "fix" it into a complement.
4. `ProductCard.tsx:755` — swap `{!editing && (` for `{canBuy && (`; add the `canAsk` branch
   rendering the Request-pricing control, whose accessible name carries `p.name`.
5. `ProductCard.tsx:475` — `!p.profile_visible` → `p.profile_visible === false`.

*Not a step, recorded so it does not read as a missed site:* `toggleVisible` (`:252`) also reads
`!p.profile_visible`. It compiles unchanged under the optional type and is unreachable in buyer
mode — its only caller is the button at `:440-448` (`onClick` at `:444`) inside the `editing` arm.

## Behaviour changes — named

1. **A price-hidden product no longer offers a quantity stepper or Add-to-basket to a
   non-owner.** This is the fix; it is unreachable today and becomes reachable at T02.
2. **`/present` is byte-identical.** `ShopView` does not pass `viewerIsOwner` until T02, so the
   default keeps `canBuy ≡ !editing`, and `profile_visible` is always present there so the badge
   guard is unchanged in practice.
3. A new control appears in the footer slot for non-owner + price-hidden — reachable only from
   T02's buyer view.

## Verification

- **Unit** — new file **`src/modules/catalog/components/ProductCard.gate.test.tsx`**. The path
  matters: `vitest.config.ts` includes only `src/**/*.test.ts(x)`, so a file written anywhere
  else silently never runs. Pure-node `renderToStaticMarkup`, no jsdom — the
  `ProductCard.panel.test.tsx:1-25` precedent.
  Assert the **full grid**, not the complement: every combination of
  `editing × pricePublic × price_per_gram set × viewerIsOwner`, each asserting which of
  {buy row, ask control, **neither**} renders. **The empty cell gets its own named test** — it is
  the one behaviour a future reader is most likely to "fix" back into a complement.
- **Edit mode asserted explicitly** — owner + null price passes with *or* without the `!editing`
  guard, so nothing else catches its loss.
- **Regression:** `profile_visible` absent → no "Hidden" badge; prop omitted → renders as today.
- `npm run test:unit`, then after `supabase db reset`:
  `npx playwright test e2e/present-card-edit.spec.ts e2e/present-grid.spec.ts` — proves
  `/present` unchanged. **Both are T00's pins; a break is a real regression, not a stale fixture.**
- ⚠️ **This verification needs the shared local DB**, so T03 is *not* worktree-parallel in
  practice even though `TICKETS.md` classes it worktree-safe on the strength of its unit tests
  alone. Its unit tests are DB-free; its regression proof is not.

## Fences

- **Locked** — no new card component (G2 variant A); `ShopView` untouched (T02 owns its two
  lines + the G4-amended conditional); no permission site, no migration, no read door.
- **Deferred** — no AC 9; T04 owns the request-pricing *handler*, T03 only the control.
- T03 ∥ T01 and ∥ T06 (disjoint files). T03 → T02 and T03 → T04 both depend on this.
