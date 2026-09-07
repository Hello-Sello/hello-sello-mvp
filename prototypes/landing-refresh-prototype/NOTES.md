# 0028 landing-page-refresh — prototype NOTES

Throwaway HTML/CSS/JS. **Open `index.html` directly in a browser** — no build, no CDN, works
offline. Spec: `docs/PRD/0028-landing-page-refresh.md`.

## The question this answers

Only two blocks of the landing page change in 0028. Both are unresolved design choices:

1. **§4 — how many capability cards?** Marcel's seed supplies **two** capabilities. The shipped
   `ValueProps.tsx` renders **four**. Nobody has decided what fills the gap.
2. **§7a — what does a brand-new "How your data is protected" section look like?** There is no
   security/GDPR section on the page today, so there is nothing to copy.

The hero headline and subtitle are **not** in question — they're locked verbatim by PRD AC 1 and
AC 2. They render identically in all three variants, as context.

## The three variants

Switch with the bar at the bottom, the `←`/`→` arrow keys, or `?variant=A|B|C`.

| | §7a treatment | §4 cards | Reads as |
|---|---|---|---|
| **A** | EU star ring with a lock at its centre, above a row of four glass tiles | **2** (Marcel's only, enlarged) | Certification badge. The ring is the hero; claims are supporting detail |
| **B** | Two columns — animated crest left, the four claims as a divided list right | **4** (Marcel's two + two kept from today) | Documentation. Most room for the claims to be read properly |
| **C** ✅ | Full-bleed dark band, EU circle of 12 stars around a lock, claims as pills | **3** (Marcel's two + one kept) | Statement. Loudest, least readable |

Each variant pairs a §7a treatment with a different answer to the §4 card count, so one pass
through all three settles both questions.

## Verified, not eyeballed

`.check.mjs` (throwaway, delete with this folder) drives all three in Playwright:

```
node prototypes/landing-refresh-prototype/.check.mjs
```

```
A: h1=1 · §4="What you can do on Hello Sello" (2 cards) · §7a="How your data is protected"
   · stars=12 · reduced-motion animationName=none · claims-visible=4 · jsErrors=none
B: … (4 cards) · stars=12 · reduced-motion animationName=none · claims-visible=4 · jsErrors=none
C: … (3 cards) · stars=9  · reduced-motion animationName=none · claims-visible=4 · jsErrors=none
```

Two PRD constraints are already provable here, before any React is written:

- **Exactly one `<h1>`** in every variant (`landing.spec.ts` case 1 depends on it).
- **PRD AC 6** — under `prefers-reduced-motion: reduce` the animation's computed `animationName`
  resolves to `none` and all four claims still render. The **"Reduced motion"** button in the
  switcher toggles the same thing by hand. Measured, not screenshotted — per `LEARNINGS.md` L-025,
  where a CSS fix that looked correct in review did nothing.

## ⚠️ AMENDED TWICE AT `/design` — C IS NEITHER FULL-BLEED NOR PILLS (Muskan, 2026-09-07)

**Read this before using anything below as a spec, and before `visual-verifier` compares the live
page to `variant-C.png`.** Everything in this file that says C is a *full-bleed* band —
`:26`, the verdict below, the "two full-bleed bands stack" open item — is **superseded by ADR 0010
§2, D3**. §7a ships as a **contained `rounded-3xl` dark card**, matching `B2BOnlyBand`'s
containment.

Why: this prototype drew the pink B2B band full-bleed (`index.html:133`, `.band`). **The real
component is not** — `B2BOnlyBand.tsx:12-14` is a rounded card inside `px-6 py-6`. So variant C
was judged against a page that does not exist, and the "two full-bleed bands stack" problem
dissolves rather than needing a fix.

**A SECOND amendment, same day (ADR 0010 §2, D4): the claims are no longer pills.** Each of the
four now carries one supporting sentence, rendered as a **4-up grid** — variant **A**'s claim
treatment on C's dark card. §7a ships taller than anything in this prototype. Reason: German UWG
§ 5 reaches B2B advertising claims and expects them to be substantiable, and the grounding
sentences already existed and were already verified in the PRD.

**Still valid from C:** the dark gradient palette, the EU circle of twelve gold stars around the
lock, and §4 landing on 3 cards. **`variant-C.png` is superseded on containment AND on the claim
treatment** — it remains an accurate reference for palette, ring geometry and type only.

Also corrected: the check output at `:43` records `stars=9` for C. That run predates the EU-circle
amendment — `index.html:346-351` builds `Array.from({length:12})`, so C has **twelve**.

---

## Verdict — **C, with the EU circle** (Muskan, 2026-09-07)

C's full-bleed dark band and pill claims, but the **scattered drifting starfield is replaced by
the EU flag's circle of twelve gold stars** around the lock — the same ring geometry A and B use,
recoloured for the dark band. C's original shield is dropped.

The ring is EU-flag-correct: 12 stars, equal 30° spacing, each counter-rotated so it stays
point-up as the circle turns. A slow 44s rotation; static under reduced motion.

**§4 lands on 3 cards** — Marcel's two capabilities plus "Trade with verified partners" kept from
today's `ValueProps`.

### Still open on the winning variant

- **Two full-bleed bands stack.** The dark §7a runs straight into the existing pink B2B-only band
  with no separation. The gradient softens it more than the starfield version did, but the seam is
  still there. Worth a decision at `/design`: spacing, a rounded bottom edge, or leave it.
- **C shows the four claim labels only, not their sentences.** GDPR / Data encryption / Hosted in
  Germany / EU AI models render as pills with no supporting line. PRD AC 4 only requires the four
  claims to appear, so this passes — but the grounding detail that A and B carried is gone.

### Cleanup owed

Delete variants A and B, `.check.mjs`, and the PNGs once C is folded into the real components.

## Not modelled

Signed-in redirect (D-01), the real `HeroDealFlow` animation (shown as a labelled placeholder —
unchanged by this slug), the cookie banner, and the legal pages. Surrounding sections are dimmed
and marked `§N existing` — they are context for judging the two new blocks, not part of the design.
