# G5 — the live production walk · slug 0022 buyer-shop-view

**✅ RUN AND PASSED 2026-08-24 — Muskan, live on production. 10 of 10 criteria.** `/ship` step 6 is
hers and was not self-passed: every criterion below carries who walked it and what was seen.

**Four findings raised, none failing a criterion — F-01 to F-04, § Findings.** F-01 (Connect below
the fold) and F-03 (the seller is never told an unfiled product is invisible) are UI work needing a
prototype first. F-02 is a copy fix. F-04 is a direction change that **reverses two locked
`DECISIONS.md` entries** and needs a Linear ticket.

⚠️ **Production demo data was changed during the walk and NOT restored:** `Pedanios 31/1 PND-CA` is
`profile_visible = false` and `Pedanios 31/1 COS-CA` is `price_public = false`. Both were deliberate
fixtures for criteria 5/6 and 10. **Restore before any demo.**

**Prerequisite, already true:** six migrations live on production (verified), app deployed to
`main` (Vercel deployment `6060572217`, success). Production DB and production app are on the same
version.

---

## Before you start — three things that changed under the walk

1. **A product with NO location is now invisible to buyers.** Round 4 added the *unfiled is not a
   shelf* rule to the basket door to match the shop door. If a production product you expect to see
   does not appear, **check its location before treating it as a bug** — it may be correctly
   withheld. The seller still sees it (owner arm).
2. **A seller company that is soft-deleted or not verified now shows nothing to a buyer**, including
   in an existing basket line (line stays listed and deletable, detail goes NULL). Pick a
   **verified, live** seller for the walk.
3. **Two groups legitimately lose reads** and are not bugs: members of unverified companies, and
   companyless authenticated accounts (HS staff / reviewer logins). **Walk as a verified buyer
   belonging to a verified company**, or criteria 1–8 will all look broken.

---

## The criteria — PRD §8, verbatim. Tick or fail each.

| # | criterion | ✅ / ❌ | note |
|---|---|---|---|
| 1 | Verified buyer **not connected** opens a seller from Discover: sees banner, information, links, location tabs — **no edit control anywhere** | ✅ | 2026-08-24, Bob/StonePharm → Canadian Craft. Banner, Verified pill, info/location/links boxes all render. **No** Manage shop, Save bar, or banner/logo pencil anywhere. Location tabs n/a — catalogue locked. Carries **F-01** |
| 2 | Product **visible + public price**: price shows; opening the price reveal shows the **full volume tier ladder** | ✅ | 2026-08-24, Bob → Aurora, `Pedanios 31/1 COS-CA`. Card front: `7,50€/g` over a struck-through `8,00€`, pack pills `500g+ / 1000g / 1200g+`, `from 500g applied`. `See all prices` opens and the **full ladder renders** — confirmed by Muskan on screen (*"yes its showing"*); **no screenshot captured**, recorded as an eye-pass |
| 3 | Product **visible + price hidden**: shows "Price on request", **no quantity control, no add-to-basket**, has **its own Request-pricing action**; using it opens a conversation naming that product | ✅ | **First half PASSED**, 2026-08-24, Bob → Aurora, `Pedanios 10/10 MBE-CA`: `Price on request`, **no stepper, no Add to basket**, own `Request pricing` button. **Second half IN FLIGHT.** Bob clicked `Request pricing` on `PND-CA` (the *hidden* product — a harder case than the one staged) and got a real `✓ Pricing requested` confirmation, **not** a conversation. **That is correct** — `actions.ts:116` ships it inbox-first: *"Lands as a `pricelist_request` in their Connect inbox naming the product; accepting runs Connect's existing rollout."* Muskan read this correctly before the code was opened. Raises **F-04** (criterion wording). **ACCEPTED AS SHIPPED — Muskan's ruling, 2026-08-24.** She accepted Bob's request on Alice's account, then ruled the inbox-first flow **acceptable for now and scheduled for replacement**, not a fail: *"right now requested pricing just shows on the UI and later we can connect it to sending that request on the chat."* Criterion 3 ticks. See **F-04**, now a direction change, not a wording note |
| 4 | Seller who has **hidden every product**: buyer still sees banner/information/links; catalogue area shows locked-catalogue message + Connect action; **no products** | ✅ | Same pass as 1. Canadian Craft is the exact fixture: 4 live products, **all** `profile_visible = false`, none unfiled. Locked panel + Connect rendered, zero products. Carries **F-01** |
| 5 | **Same buyer, once connected**, reloads and sees **every product, including previously hidden ones** | ✅ | 2026-08-24. Alice hid `Pedanios 31/1 PND-CA`; connected Bob reloaded and **still sees it**, alongside all four. Muskan reached the right reading unprompted — *"it is because I am connected right?"* |
| 6 | On the connected view, a **price-hidden product still shows "Price on request"** — connection reveals the product, **never the price** | ✅ | **Card front PASSED BY EYE** — the first time a human has seen it. Same pass as 5: `PND-CA` is `profile_visible=false` **and** `price_public=false`; connection revealed the product and the card reads `Price on request` with **zero € figures**, no stepper, no Add to basket. Control on the same screen: `COS-CA` renders `7,50€/g` + tier pills + Add to basket, so the price block is proven live rather than merely absent. **Card back CLOSED in the same pass as criterion 7** — flipped `PND-CA` to *Docs & media*, still no € on the reverse. **Criterion 6 is now FULLY PASSED, front and back, by eye.** |
| 7 | Product detail face shows the **full spec set** (CBG, CBN, terpene %, cultivator, lineage, irradiation code, packaging material, resealable) and **no batch or lot list** | ✅ | 2026-08-24, Bob → Aurora, walked on `PND-CA` — deliberately the **hidden, price-hidden** product, so the spec set is proven on the card the connection override revealed, not on an easy one. Full spec set present, **no batch or lot list**. Eye-pass, no screenshot |
| 8 | Raising quantity to a tier rung changes the card price to that rung **before** adding | ✅ | 2026-08-24, Bob → Aurora, `COS-CA`. Moving off the `500g+` rung re-prices the card **before** anything enters the basket. Confirmed by Muskan on screen (*"yes happening"*); **no screenshot captured**, eye-pass |
| ~~9~~ | ~~Non-connected buyer orders without a connection~~ — **NOT IN THIS SLUG. DO NOT WALK IT.** Split to its own slug at G3 (`STATE.md` § *Deferred — must NOT be built*; `TICKETS.md` traceability row 9; ADR §9). It is the only part of the spec off Marcel's demo path. **Walking it would fail the slug on a criterion it deliberately does not own** | **n/a** | skip |
| 10 | **Negative space** — buyer neither connected nor looking at a visible product tries to add it: **server refuses**, **no line appears** in the basket | ✅ | 2026-08-24, walked as the **stale-card** case, which is the real-world shape: Alice turned OFF `COS-CA`'s public price; Bob's already-open tab clicked `Add to basket` and the **server refused with a visible message, no line written**. Admission is `product_visible_to_caller AND (owner OR price_public)` — the second conjunct is what failed. **Not a silent no-op, so T15 did not bite here** |
| 11 | **Negative space** — nowhere on this surface, connected or not, is there a save, manage-shop, or banner/logo edit control | ✅ | 2026-08-24, Bob on Aurora's shop, swept while **connected** — the harder arm, since connection is what widens every other read. Muskan: *"nothing is seen from the Bob's view, no manage, no banner, no edit afford, anything."* |

---

## Criterion 6 is the headline — give it the most attention

*Connection reveals the product, never the price.* It passed at G4 by regex over the whole card
`innerText` (zero currency figures on either face), not by eye. **On production, check both card
faces and the price reveal.** This is the invariant the whole slug is built around, and it is the
one a future change is most likely to break quietly.

## One extra check, not a PRD criterion — `/connect/inbox`

Production had a live pending `connect_person` row that was **crashing that company's inbox**, and
the fix ships with this deploy. **Open `/connect/inbox` as that company: if it renders at all, the
fix is live.** This is not an acceptance criterion and does not gate G5 — but it is the one thing
this deploy repaired that no criterion covers, so nobody else will check it.

> ⚠️ **Why AC 9 is struck out above.** It was on this sheet in the first draft, taken verbatim from
> PRD §8, because I copied the criteria without reconciling them against STATE.md's
> *Deferred — must NOT be built* list. `rollup` caught it. The PRD's §8 is the **spec's** list; the
> slug's actual scope is PRD §8 **minus** what G3 split out. They are not the same list.

## Criterion 10 is now enforced in three places

Server-side: the restrictive `basket_line_admission` policy → `product_admissible_to_basket()` →
`product_visible_to_caller()`. The hidden Add control is **never** the gate. If you can reach a
refusal in the UI, it should surface as a **refusal pill**, not a silent no-op — and if it IS a
silent no-op, that is **T15** (`BasketProvider`'s bare `.catch`), already filed.

---

### Pass 2 · 2026-08-24 — criteria 5, 6 (front) and 3 (first half)

One toggle proved three criteria, because Aurora's `Pedanios 31/1 PND-CA` sits in the only corner
that tests the invariant: `profile_visible = false` **and** `price_public = false`.

**What made this pass worth more than its G4 equivalent:** the four cards were on ONE screen, so the
control was not a separate run. `PND-CA` (hidden, price hidden) → `Price on request`. `COS-CA`
(visible, priced) → `7,50€/g`, struck-through `8,00€`, tier pills `500g+ / 1000g / 1200g+`,
`from 500g applied`, stepper, Add to basket. **The price block cannot be passing because prices are
broken** — the card beside it renders one.

Also confirmed incidentally, not ticked: **no "Hidden" badge on Bob's copy of the hidden product**,
which is the buyer mapper genuinely not carrying `profile_visible` (`ProductCard.tsx:543-546`), not
the badge being styled away. And **no owner chrome anywhere on the grid** — partial evidence for
criterion 11, which still needs its own deliberate sweep.

## Findings raised during the walk

Recorded as they are found, one entry per pass. A finding here is **not** automatically a G5 fail —
each says whether it fails its criterion or is follow-up work.

### F-04 · criterion 3's wording compresses two steps into one — *wording, not a defect*

> *"…has its own Request-pricing action; using it **opens a conversation** naming that product"*

The shipped flow is **inbox-first**: the click creates a `pricelist_request` in the SELLER's Connect
inbox naming the product, and the conversation opens when **she accepts** — Connect's existing
rollout, the same shape a connection request has. `src/app/discover/actions.ts:116` states this
verbatim, and `requestProductPricing` returns `createPairInboxItem(...)`, never a thread.

Read literally, the criterion says the buyer's click opens a conversation. It does not, and it
**should not** — that would let a buyer put a thread in a seller's messages without her consent,
which is the exact door T09 spent a session closing.

**Same class as the `pending` wording ruled at T06's G4:** the behaviour is right, the sentence
invites a future wrong "fix". Ruled there as *annotate, do not rewrite the behaviour*. **Muskan went further than that on 2026-08-24 — the MECHANISM changes, not just the sentence:**

> *"that system is broken and also we have to remove the connection request from the connect. All the
> connection requests will come on Discover and the pricing request will directly go in the chat …
> we will do this together when we will deal with the chat thing."*

So the target shape is:
* **connection requests → surface on Discover**, not in a separate Connect inbox
* **pricing requests → go straight into the chat thread**, skipping the inbox hop entirely

**Ruled acceptable as-is for this slug** — *"right now requested pricing just shows on the UI and
later we can connect it to sending that request on the chat."* Criterion 3 ticks; the rework is
sequenced with the chat work, not against this slug.

⚠️ **One constraint to carry into that design, raised here so it is not rediscovered late.**
"Pricing request goes directly into the chat" has to answer the question T09 spent a whole session
closing: **a buyer who is not connected must not be able to put a message into a seller's thread
without her consent.** Today the inbox hop IS that consent step. Removing it is fine — but the
consent has to move somewhere, not disappear. That is a design input for the chat work, not an
objection to it.

**Found by Muskan, not by the sheet** — she predicted the inbox hop unprompted, which is why it was
caught as wording rather than filed as a failure.

⚠️ **This direction REVERSES two locked decisions — it is not a re-record of an existing one.**
`DECISIONS.md` currently locks the opposite in two places:
* **line 961** — *"Request-pricing routes to **Connect's inbox** (type `pricelist_request`, 2a
  machinery)"*
* **line 1013** — *"Connect CTAs map to the 4 existing inbox types … **no new request types**"*

Muskan's recollection of having decided this before is right about the *topic* and inverted on the
*outcome*: what is on record is inbox-routing, which is what she now wants removed. **Whatever
carries the new direction must supersede both lines by number**, or the next person to read
`DECISIONS.md` will build the inbox route again and be correct to.

### F-01 · the locked catalogue pushes Connect below the fold — *does not fail criterion 1 or 4*

Walking criterion 1 (Bob → Canadian Craft, 1440-wide window), the panel renders correctly but the
**Connect button is off-screen**. The buyer reads *"Connect with them to see their full shop"* and
sees no control; it takes a scroll to reach it. Everything above it — banner, Verified pill, the
three info boxes, the `p-12` panel padding, the 🔒 tile, three lines of copy, then the optional-note
textarea — consumes the viewport first.

This is the same defect AC 4 was written to prevent. `BuyerShopView.tsx`'s `LockedCatalogue` header
already records one round of it: an earlier revision leaned on the `buyerContext` strip and the
buyer read the sentence "with the control scrolled off". Moving the action *into* the panel fixed
which component owns it, **not** whether it is on screen.

**Muskan's call (2026-08-24):** move the panel up so that, when the catalogue is private / the buyer
is not connected, the page does **not** scroll — the sentence and its action land in one view.

Fix lives in `LockedCatalogue` (`src/app/discover/[companyId]/BuyerShopView.tsx`) — the `p-12`
padding and the stacked 🔒/heading/copy/textarea block. **New UI → prototype before code.**

### F-02 · the locked-catalogue copy asserts something the shipped model does not do

*"Connect with them to see their full shop — connected companies always see the whole catalogue."*

Falsified twice on the same day:
* **Bob was already connected to Aurora** and still got this panel (all 5 products were unfiled).
* An **unfiled** product is withheld from a connected buyer too — connection overrides
  `profile_visible`, and nothing else.

The true rule is: *connection reveals **hidden** products; it does not reveal unfiled ones, and it
never reveals a price.* Copy fix, no schema change.

### F-03 · a seller is never told that an unfiled product is invisible to buyers

Three independent reasons make a product invisible to buyers; the seller is told about exactly one.

| reason | seller signal today |
|---|---|
| `profile_visible = false` | "Hidden" badge ✅ |
| `location is null` (unfiled) | **none** ❌ |
| outside the `visibility_start`/`visibility_end` window | **none** ❌ |

This is what made Aurora's shop read as broken: five products, all visible, all unfiled, and no
surface anywhere said so. Related: the "Hidden" badge renders in the seller's **shop** view, not
only in Manage (`ProductCard.tsx:546` gates on `profile_visible === false && !editing`).

**Direction agreed (2026-08-24):** ONE signal — *"Not visible to buyers"* with the reason as
subtext — shown **only in Manage mode**, replacing today's "Hidden" badge rather than sitting beside
it. Two badges for one question ("is this on my shop?") is the thing to avoid. **New UI → prototype
before code.** Sequenced after the walk.

---

## If something fails

Failures here do **not** roll back the migrations — they are additive and the escalation fix is
load-bearing. Record the failing criterion number above, and check first whether it is one of the
three "changed under the walk" items at the top before filing anything.
