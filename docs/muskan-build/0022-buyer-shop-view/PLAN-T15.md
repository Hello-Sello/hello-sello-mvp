# PLAN-T15 — `BasketProvider`'s bare `.catch` renders every basket failure as "signed out"

**Ticket:** TICKETS.md T15 · **S** · PRE-EXISTING · filed 2026-08-24 at `/ship`, security round 4.
**Built:** 2026-08-24, session 84. **Branch:** `claude/muskan/work`.

## Why this one first

Chosen over the eight other open security items because it is the only one that sits directly on
the **pharmacy → connect → order** path AND suppresses the feedback channel. `get_my_basket_lines`
is a brand-new RPC that has never served a production request; if it trips on cloud, today's code
shows the pharmacy an empty basket, logs nothing, and tells Muskan nothing.

Severity is not the ranking here — *cost of finding out late* is.

## The design decision

The judgment "this basket is legitimately empty" currently lives in `BasketProvider`, which has no
information to make it with: it receives an exception carrying no indication of which call failed,
and guesses *signed out*. `getMyBasket()` is the only place that knows which call failed and why.

**So the judgment moves down into the read, and the provider stops classifying entirely.**

- **Benign → return an empty basket.** An expired/invalid session (`auth.getUser()` errors) and an
  account with no `person` row yet (mid-onboarding; PostgREST `PGRST116` on `.single()`) genuinely
  have no basket. Both **throw** today — that is the defect.
- **Everything else → throw.** RPC failure, `42501`, a PostgREST schema-cache miss, the
  `relationship` read.

The provider then needs no classification at all: **any** throw is an error state. This removes a
decision rather than adding a mechanism, and it is why the `.catch` never has to widen — the thing
the ticket explicitly asked for.

Mirrors the write path's shape (`writes.ts` — one owner for "what a PostgREST error on this table
means", `throwWriteError`), without needing a typed error class: the read has only two outcomes,
so the *return* carries the benign case and the *throw* carries the rest.

## Files

| File | Change |
|---|---|
| `src/modules/basket/supabase/reads.ts` | Benign auth / no-profile → EMPTY; every other failure throws. **The fix.** |
| `src/modules/basket/BasketProvider.tsx` | `error` added to the context; `.catch` sets it and logs. No silent EMPTY. |
| `src/modules/basket/components/BasketDrawer.tsx` | Renders the failure + a Try-again, instead of "Your basket is empty." |
| `src/modules/basket/supabase/reads.test.ts` *(new)* | Benign-vs-error classification. |
| `src/modules/basket/components/BasketDrawer.test.tsx` | Error renders; empty-state copy does not. |

`BasketDrawer.tiers.test.tsx` and `BasketDrawer.test.tsx` both build a `useBasket()` return value by
hand; adding a context field breaks them at `tsc`. That is the compiler doing its job — both
helpers get the new field.

## Test surface, against the runner that exists (L-018)

`vitest.config.ts:34` is `environment: "node"`, and `package.json` carries no jsdom, happy-dom or
testing-library. **The provider's state transition is therefore not unit-testable** — there is no
DOM, no second render. Named here rather than smuggled in as a weaker assertion.

What IS written (four assertions, no more):

1. `reads.test.ts` — auth error resolves to EMPTY, does not throw. **RED today.**
2. `reads.test.ts` — `PGRST116` on the person lookup resolves to EMPTY. **RED today.**
3. `reads.test.ts` — an RPC error rejects. **Green today** — kept because it is the half of the
   contract the fix must not break while widening the other half.
4. `BasketDrawer.test.tsx` — with an error set, the drawer renders the failure and **not** the
   empty-basket copy. Paired presence+absence in one state (L-021).

Mocking style follows `writes.test.ts`: `@/shared/db/client`'s `createClient()` is **synchronous**,
so the stub returns a plain object, not a promise.

## Deliberately NOT done

- **No e2e.** Proving the whole path needs a Playwright route-mock forcing the RPC to fail, and
  there is **no `page.route` precedent anywhere in `e2e/`** — it would be a new pattern. Muskan's
  call, MVP scope: skipped, recorded, not hidden.
- **No error-reporting service.** Reporting is `console.error` with context, matching
  `BasketDrawer.tsx:50` and `actions.ts:46`. A real sink is its own decision.
- **Scope note:** a Try-again button is included though the ticket asks only for a rendered error.
  Without it the user's only recourse is a page reload. Small, deliberate, recorded here.
