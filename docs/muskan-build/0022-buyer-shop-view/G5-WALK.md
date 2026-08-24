# G5 — the live production walk · slug 0022 buyer-shop-view

**Staged 2026-08-24. NOT RUN, NOT PASSED.** `/ship` step 6 is Muskan's; it is never self-passed.

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
| 1 | Verified buyer **not connected** opens a seller from Discover: sees banner, information, links, location tabs — **no edit control anywhere** | | |
| 2 | Product **visible + public price**: price shows; opening the price reveal shows the **full volume tier ladder** | | |
| 3 | Product **visible + price hidden**: shows "Price on request", **no quantity control, no add-to-basket**, has **its own Request-pricing action**; using it opens a conversation naming that product | | |
| 4 | Seller who has **hidden every product**: buyer still sees banner/information/links; catalogue area shows locked-catalogue message + Connect action; **no products** | | |
| 5 | **Same buyer, once connected**, reloads and sees **every product, including previously hidden ones** | | |
| 6 | On the connected view, a **price-hidden product still shows "Price on request"** — connection reveals the product, **never the price** | | |
| 7 | Product detail face shows the **full spec set** (CBG, CBN, terpene %, cultivator, lineage, irradiation code, packaging material, resealable) and **no batch or lot list** | | |
| 8 | Raising quantity to a tier rung changes the card price to that rung **before** adding | | |
| ~~9~~ | ~~Non-connected buyer orders without a connection~~ — **NOT IN THIS SLUG. DO NOT WALK IT.** Split to its own slug at G3 (`STATE.md` § *Deferred — must NOT be built*; `TICKETS.md` traceability row 9; ADR §9). It is the only part of the spec off Marcel's demo path. **Walking it would fail the slug on a criterion it deliberately does not own** | **n/a** | skip |
| 10 | **Negative space** — buyer neither connected nor looking at a visible product tries to add it: **server refuses**, **no line appears** in the basket | | |
| 11 | **Negative space** — nowhere on this surface, connected or not, is there a save, manage-shop, or banner/logo edit control | | |

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

## If something fails

Failures here do **not** roll back the migrations — they are additive and the escalation fix is
load-bearing. Record the failing criterion number above, and check first whether it is one of the
three "changed under the walk" items at the top before filing anything.
