# PLAN — T01 · Hero headline + subhead, and §4 recast to three capability cards

**Slug:** `0028-landing-page-refresh` · **Linear:** DEV-178 · **Size:** S
**Covers:** PRD AC 1, 2, 3, 7 · **ADR invariants:** M1, M2, M3, M9, M10
**Branch:** `claude/muskan/work`, base frozen at `origin/dev` (`8788722`) + `17aa6bf`/`78b875a`.

---

## 0. What this ticket is, in one line

Three copy edits and one array shrink. **No new mechanism, no new file, no dependency.**
Every line number below was read in the repo at plan time, not copied from the ticket.

---

## 1. Files, in runnable order

### 1.1 `src/app/_landing/Hero.tsx` — two string swaps

| Line | Now | Ships |
|---|---|---|
| `:30` | `AI FOR DEALMAKERS` | `ONE SECURE SPACE FOR EVERY B2B DEAL` |
| `:37-39` | `Discover verified partners, connect safely with no cross-company leaks, and turn the conversation into a structured, documented deal, all in one place.` | the D5 string below |

**The D5 string, character-exact** (ADR §2 D5 — supersedes PRD AC 2's verbatim quote):

> Turn daily conversations into structured deals — together. Your fully EU GDPR compliant AI
> platform for buyers and sellers to trade with encrypted chat. All data is hosted in Germany.

Two things a builder will get wrong if not told: **`platform`**, not `plattform`; and the mark
after `deals` is an **em dash (U+2014)**, not a hyphen. In JSX both must be written as literal
characters — an HTML entity (`&mdash;`) would make `textContent` disagree with the test's string.

**Untouched in this file, and the diff must show it:** the `<section>` wrapper, `AuroraBackground`,
the gradient `<span>` (`:29-31`), every `Reveal` and its `delayMs`, both `CTAButton`s, the
"Apply → get verified" line, `HeroDealFlow`.

⚠️ **`:13`'s docstring — deliberately NOT touched, but the authorities contradict each other and
both sides go to G4.** It reads *"Copy is interim placeholder framing (D-15) — restyle/refill
friendly."*

| Says the slug **amends** D-15 | Says confirmation is **owed** |
|---|---|
| `0010-landing-trust-band.md:8` — *"Amends: the Phase-9 landing spec (D-05 section spine, **D-15 'copy is interim'**)"* | `0010-landing-trust-band.md:406-408` — *"the premise looks stale… but no doc formally retires it. **Confirmation owed at G3; not assumed.**"* |
| `docs/PRD/0028-landing-page-refresh.md:4-6` — same claim, unconditional | G3 closed **four** rulings (`0010:514-519`, `STATE.md:99-109`) — **D-15 was not one of them** |

**Not touched here**, because the blast-radius table authorises no Hero docstring edit and changing
it would be a builder ruling on an open product question. **But the consequence must be stated
plainly at G4, not softened:** `Hero.tsx:13` ships saying *"copy is interim placeholder framing"*
on a file that now carries the product owner's **locked** positioning. That is the same
*"a comment is not a contract"* defect the ADR spends §1 diagnosing — and **fixes** for the exactly
analogous `B2BOnlyBand.tsx:4`, one file over, in this same slug.

### 1.2 `src/app/page.tsx` — `metadata.description` only

`:25-26` today:

> Hello Sello is the B2B marketplace for verified companies. Discover trusted partners, connect
> safely with **no cross-company leaks**, and turn conversations into **documented deals**.

Both bolded phrases are titles D6 retires, so M10 asserts their absence. Ships as:

> One secure space for every B2B deal. Verified buyers and sellers create offers and orders, send
> them to every partner, and trade in encrypted chat hosted in Germany.

**165 characters** — measured, not estimated (an earlier draft said 162). That is marginally over
the ~160 SERP-truncation norm, so Google may clip the final clause. **Accepted:** no invariant
asserts length, M10 asserts equality, and the alternative is cutting `hosted in Germany` — the
single most load-bearing phrase in Marcel's brief. Flagged at G4 so the number is not re-derived.

⚠️ **Write it as ONE string literal, single space at each join.** Unlike the Hero subhead, this is
a plain TS string, so there is **no JSX whitespace collapsing to rescue a line-join slip** — and
case 16 asserts **equality**, not `toContain`. A concatenation that loses or doubles a space fails.

**On `marketplace`:** this rewrite removes the word from `page.tsx:26`, which happens to resolve
its contradiction with `.claude/rules/project.md` ("not a marketplace"). That is a **side effect**,
not the reason the line is in scope, and no invariant asserts the word's absence.
⚠️ **The word does not leave the page.** `Footer.tsx:25` still renders *"The verified B2B
marketplace for dealmakers"* on `/`, and it is **correctly out of scope** — stated so nobody reads
§1.2 as a claim that `/` is now marketplace-free.

**Fenced and must survive as mechanisms** (ADR §3): the `export const metadata` declaration itself,
`metadata.title`, the `getCurrentUser()` / `redirect("/home")` D-01 branch, and the
server-component contract at `:19-24`. **Only the description's string literal changes.**

### 1.3 `src/app/_landing/ValueProps.tsx` — four edits, one file

**(a) `PROPS` (`:10-31`) goes 4 → 3.** Order follows the locked prototype (`index.html:362-367`):
create → send → verified.

| # | icon | title | body |
|---|---|---|---|
| 1 | `Tag` | `Create offers and orders` | `Build an offer or an order in the chat you are already having. No separate tool, no re-keying.` |
| 2 | `Send` | `Send to all your customers and suppliers` | `Push a deal or an order out to your whole book at once, or to one partner at a time.` |
| 3 | `ShieldCheck` | `Verified partners only` | *(kept verbatim from `:13-14`)* |

⚠️ **Card 2's title is PLURAL, and this overrides the locked prototype** — folded in after
`plan-checker` round 1 raised it as blocking (rung 3). An earlier draft of this plan used the
prototype's singular `Send to every customer and supplier` (`index.html:364`) **while** asserting
`/customers and suppliers/i` in case 15. The two can never both be satisfied: the ticket would have
gone red at step 4 and stayed red, forcing the builder to make a copy ruling the plan owes it.

The tiebreak is already written down — `.claude/rules/product.md`: *"The PRD is the source of
truth. When it conflicts with a prototype, the schema, or an older decision, the PRD wins."*
**Four authorities say plural, one says singular:**

| Source | Wording |
|---|---|
| PRD FR3 (`:41-42`) | "sending deals and orders **to all your customers and suppliers**" |
| Marcel's seed (`STATE.md:14-15`) | "Send deals and orders **to all your customers and suppliers**" |
| ADR M3 (`0010:423`) | "sending **to customers and suppliers**" |
| TICKETS AC 3 (`:68`) | "sending deals **to customers and suppliers**" |
| ~~prototype `index.html:364`~~ | ~~"Send to every customer and supplier"~~ — **outlier, superseded** |

The title above is Marcel's own phrasing trimmed to title length. **The regex stays strict** —
loosening it to `/customers? and suppliers?/i` would weaken an ADR invariant to accommodate the one
source the project rule says loses. Carried to G4 as a copy note, not a silent change.

⚠️ **Card 3 is KEPT, not rewritten.** ADR D6 is explicit that `Verified partners only` is the exact
existing title and that the prototype's *"Trade with verified partners"* is a paraphrase that
**exists nowhere in the repo**. Its icon (`ShieldCheck`) and its body string stay byte-identical.
M3's third clause is satisfied by the substring *verified partners*.

**Retired:** `No cross-company leaks` (`:18`), `One place, end to end` (`:23`), `Documented deals`
(`:28`). No test, screenshot or fixture references these titles — verified by grep at plan time.

**(b) Imports (`:1`).** `Lock`, `Workflow`, `BadgeCheck` become unused → remove. Add `Tag`, `Send`.
Keep `ShieldCheck`. Final: `import { ShieldCheck, Tag, Send } from "lucide-react"`.
All five names verified to resolve against the installed `lucide-react`.

⚠️ **Correction — nothing enforces this, so the builder must do it deliberately.** An earlier draft
said leaving the dead imports "would fail `eslint`". **It would not.**
`eslint-config-next/dist/typescript.js:36` sets `@typescript-eslint/no-unused-vars` to **`'warn'`**,
`package.json`'s `lint` script is a bare `eslint` with no `--max-warnings 0`, and `tsconfig.json`
does not set `noUnusedLocals` — all three verified. A left-behind import produces a warning nobody
fails on.

The **opposite** direction *is* caught: removing an import while leaving its `PROPS` entry is a
`tsc` error. So the asymmetry to hold in mind is — **delete the entry and the import together;
only one of those two mistakes has a machine behind it.**

**(c) `SectionHeading` props (`:36-40`)** — benefit framing → capability framing:

```
eyebrow="What you can do"
title="What you can do on Hello Sello"
sub="Buyers and sellers, one platform — connect and trade fast."
```

⚠️ **`sub` carries an em dash too** (`one platform — connect`). **No test asserts the `sub`**, so a
hyphen slip here is invisible to all four cases and surfaces only at G4. Same character as the D5
subhead, same trap, no machine behind it.

`SectionHeading` is **reused untouched** (ADR §3). It emits `<h2>` and never an `<h1>` — the code
proof is **`SectionHeading.tsx:29`**; `:7-8` is only the *docstring* saying so, and an earlier draft
of this plan cited the comment as if it were the guarantee. In a slug whose ADR spends §1 on *"a
comment is not a contract"*, sourcing half of M1's safety from a comment was the wrong citation.

**(d) The `<section>` (`:35`) gains `id="what-you-can-do"`**, and the grid (`:42`)
`lg:grid-cols-4` → `lg:grid-cols-3`. `sm:grid-cols-2` stays — **only the `lg` value is authorised**
by the ADR's blast-radius table.

⚠️ **Consequence, for G4 rather than for a test:** with three cards, the `sm`–`md` range renders
**2 + 1 (an orphan row)** where it renders 2 + 2 today. Faithful to the ADR and invisible to all
four cases, but it is a real visual delta and G4 should see it named rather than discover it.

The `id` is **authorised by ADR §5** ("Two `id`s are therefore authorised"), reusing the idiom
`HowItWorks.tsx:31` (`id="how"`) and `FAQ.tsx:32` (`id="faq"`) already establish. Without it M3's
count assertion has no scope and would count cards page-wide.

**(e) Docstring (`:5-9`)** — reframe "Buyer-outcome cards" to capability framing. This one **is**
authorised (ADR §4 blast radius: *"docstring's 'buyer-outcome' framing updated"*), unlike Hero's.

`ValueProp` (`:53-69`), the `Reveal` map (`:43-47`) and the glass-card classes are untouched **as
code**. ⚠️ **Not as rendered timing:** the kept `Verified partners only` card moves from index 0 to
index 2, so `:44`'s `delayMs={i * 80}` takes it from **0 ms to 160 ms**. Nothing asserts reveal
timing, and the reorder follows the locked prototype's card order — but "the `Reveal` map is
untouched" is true of the diff and false of the page, so it is stated both ways here.

### 1.4 `e2e/landing.spec.ts` — **APPEND ONLY**, written by `test-writer` before any source edit

Four new cases after case 12 (`:252`). Cases 1-12 and the `signIn` helper are byte-identical.

| Case | Invariant | Assertion |
|---|---|---|
| 13 | **M1** | `page.locator('h1')` → `count() === 1`, and its text is `ONE SECURE SPACE FOR EVERY B2B DEAL`. Explicit count, not Playwright's strict-mode side effect |
| 14 | **M2** | **Document order, not CSS adjacency.** Evaluate in-page: walk `document.querySelectorAll('h1, p')`, take the first `<p>` positioned after the `<h1>`, compare its `textContent` (whitespace-normalised) to the D5 string |
| 15 | **M3** | Inside `#what-you-can-do`: the `<h2>` reads `What you can do on Hello Sello`; card `<h3>`s `count() === 3`; the three titles match `/offers and orders/i`, `/customers and suppliers/i`, `/verified partners/i` |
| 16 | **M10** | `meta[name="description"]`'s `content` equals T01's string, and contains **neither** `no cross-company leaks` **nor** `documented deals` |

**Two traps the tests must dodge, both already diagnosed in the ADR:**
- **M2 is not `h1 + p` or `h1 ~ p`.** The `<h1>` sits in `<Reveal delayMs={60}>` (`Hero.tsx:27-33`)
  and the subhead in a **separate** `<Reveal delayMs={120}>` (`:35-41`). Both sibling selectors
  match nothing. Use `compareDocumentPosition` or an ordered `querySelectorAll` walk.
- **M2's em dash.** Normalise whitespace (JSX wraps the string across source lines, so the rendered
  text carries collapsed newlines) but do **not** normalise punctuation — the em dash is the assertion.

Case 15 must not use `getByText('What you can do')` unscoped: the eyebrow and the `<h2>` both
contain it, which is a strict-mode violation. Scope to the `<h2>` role inside `#what-you-can-do`.

---

## 2. Runnable order

1. `test-writer` appends cases 13-16 → **run them, confirm 4 RED** (13/15/16 on content, 14 on the
   old subhead). A green test here means it asserts nothing.
2. `builder`: `Hero.tsx` → `page.tsx` → `ValueProps.tsx`.
3. `tsc` + `eslint` + `next build`.

   ⚠️ **L-025's `rm -rf .next` ritual does NOT belong to this ticket, and an earlier draft imported
   it anyway.** L-025's failure mode is *a CSS class missing from `document.styleSheets`* —
   **T01 ships zero CSS.** Its edits are text and an array, which `next dev` hot-reloads reliably.
   The ritual is mandatory in **T02**, whose entire risk surface is a new class.

   **And if you do clear it, stop the dev server first.** `playwright.config.ts:41-43` runs
   `npm run dev` with `reuseExistingServer: !CI`, so a server is already live on `:3000`;
   `rm -rf .next` underneath a running Next process is a footgun, not hygiene.
4. `test-runner`: the **whole** `landing.spec.ts` — 12 pre-existing (M9/AC 7) + 4 new = 16 green.

**The local Supabase stack must be up and seeded.** `landing.spec.ts` case 2 signs in as
`alice@greenleaf.test` (`:30-31`, helper `:36-56`, case `:80-89`). This slug writes no DB, but
AC 7 reads one — a builder told "no database" would misread case 2 failing as their own regression.

---

## 3. Fence check — what this ticket must NOT touch

`DataProtection.tsx` (T02) · `globals.css` (T02) · `B2BOnlyBand.tsx` (T02's docstring line) ·
`page.tsx`'s `<SocialProof />`/`<B2BOnlyBand />` region (T02) · `SectionHeading.tsx` ·
`HowItWorks.tsx:20`'s surviving "no cross-company leaks" (ADR D6: *"a grep-based cleanup sweep will
hit both. Neither is in scope"*) · `docs/product/PITCH.md:17` (ruled stale on purpose) ·
`Reveal`, `AuroraBackground`, `HeroDealFlow`, `CTAButton`, cases 1-12.

**No `copy.ts`** (ADR D1). Strings stay inline where they render.

---

## 4. Risks

| Risk | Handling |
|---|---|
| Em dash typed as a hyphen, or entity-encoded | Case 14 compares the literal string; a hyphen fails it |
| `.next` serves the old copy → tests lie either way | `rm -rf .next` between steps 2 and 4 (L-025) |
| Removing an icon import but not its `PROPS` entry (or vice-versa) | `tsc` + `eslint` both catch it; run before `test-runner` |
| Case 2 red because the Supabase stack is down | Diagnose the stack **before** blaming the diff |
| The `id` reads as a fix-that-adds | Already authorised in ADR §5 and flagged to Muskan at G3 |

---

## 5. Open, carried to G4 — not decided by the builder

1. **`Hero.tsx:13`'s D-15 "copy is interim" docstring ships false.** Left in place; the full
   both-sides citation is in §1.1. The ADR **contradicts itself** — its header says 0028 amends
   D-15, its §4 says confirmation is owed and G3 never gave it. Muskan's call.
2. **Card 2's title is plural, overriding the locked prototype** (§1.3a). Resolved by the
   PRD-beats-prototype rule rather than by asking — flagged because it is a visible copy change
   Muskan has not seen.
3. **`metadata.description` is 165 chars**, ~5 over the SERP-truncation norm (§1.2). Accepted
   rather than cutting `hosted in Germany`.
4. **Two rendered deltas no test can see:** §4 becomes a 2 + 1 orphan row in the `sm`–`md` range
   (§1.3d), and the kept card's reveal delay shifts 0 ms → 160 ms (§1.3e).
5. **`marketplace` survives on `/`** at `Footer.tsx:25`, out of scope (§1.2).

*Items 2-5 were raised by `plan-checker` round 1 (1 blocking + 9 notes, all spot-verified against
the repo before folding in — B1, N1, N2, N4, N9 each re-checked by direct query, not accepted on
the checker's word).*
