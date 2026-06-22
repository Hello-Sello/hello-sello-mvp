---
status: proposed
date: 2026-06-11 (reworked 2026-06-12 after build-alignment research)
authors: Muskan — Sella architecture grill (sessions 21–22)
review: PENDING joint review with Ayush (Sella is co-owned)
relates-to: DEV-11, DEV-59, DEV-5/48/49/50, LAYER-4-SELLA-BEHAVIOR (§3, §9), DECISIONS.md "Sella runtime placement" (2026-06-07/08)
---

# Sella MVP architecture — the engine and the first slice (`detect-deal`)

> **For Ayush:** Muskan's proposed `detect-deal` design + engine refinements, **built on top of** the
> Sella foundation already locked + verified (the `supabase/functions/_shared/sella/bedrock.ts`
> helper + the 2026-06-07/08 "Sella runtime placement" locks). **Status: proposed, pending our joint
> review.** Please review all of it — every decision, spec, and guardrail is open to your input.
> The *Alignment* table below maps exactly what this **keeps, adds, and refines** vs the existing design.

## Context

Sella's **engine wrapper already exists and is verified live**: `supabase/functions/_shared/sella/bedrock.ts`
calls Claude on Bedrock-EU via plain `fetch` + a bearer token (no AWS/Anthropic SDK), **runtime-neutral**
(reads its key from Deno *or* Node), `temperature: 0`, single-shot, tool-capable — smoke-tested live
2026-06-08. The build mechanics are locked in `DECISIONS.md` / `ARCHITECTURE-NOTES.md` ("Sella runtime
placement", 2026-06-07/08): one parameterized runtime, **suggest-only structural**, **detection
data-triggered → background / person-waiting → app**, creds in Supabase Edge secrets, a `propose_deal_draft`
tool contract.

This doc proposes the **`detect-deal` job** that runs on that engine, plus research-verified
**refinements** to the locked mechanics (a richer output contract, whole-thread context, a
guardrail/failure-mode framework, EU-AI-Act disclosure, a cost guardrail). Every refinement was checked
against **June-2026 primary sources** (AWS Bedrock, Anthropic, Vercel, Supabase) and adversarially
verified; supersessions of older locks are called out explicitly. **No locked _decision_ is reversed** —
the changes are clarifications + capability updates (e.g. structured outputs went GA on Bedrock *after*
the original locks were written).

## Alignment with the existing locked Sella design

| KEEP (locked, verified still correct) | ADD (new here) | REFINE (update a locked detail — with reason) |
|---|---|---|
| Plain-`fetch` + bearer-token `bedrock.ts` helper (**no SDK**) | The `detect-deal` job: prompt + output contract + dedup | **Output:** `propose_deal_draft` tool → **structured outputs** — went **GA on Bedrock Converse Feb 2026** (real schema guarantee; forced-tool never guaranteed shape) |
| Engine code in `supabase/functions/_shared/sella/` (verified import asymmetry: Next imports it trivially; Deno can't cleanly import `src/`) | Guardrails & failure-mode framework | **Context:** ~15–20-msg window → **whole thread + dedup-row-as-state + ~20k cap** (a window silently misses spread-out deal facts on *first* detection) |
| One parameterized runtime; stateless single-shot; **suggest-only structural** | EU AI Act Art. 50 disclosure; daily cost alert | **First-slice home:** detection stays Edge-Function for *automation*, but **the first slice runs on-demand in a Next server action** — the locked rule's own "person-waiting → app" branch (chat writes are still mock; no insert event exists yet) |
| Detection data-triggered→bg / person-waiting→app; creds in Supabase Edge secrets; Bedrock-EU `eu.` profiles; dedup-row carries state | L1 autonomy framing; confidence-band rationale | **Later auto-trigger:** raw `pg_net` webhook → **pgmq queue + pg_cron worker** (pg_net is non-durable / no-retry; Supabase's own guidance is queues). The recorded "Vercel can't fire-and-forget" rationale is **stale** (waitUntil 2024) but moot — the first slice is person-waiting |

## Decision — engine architecture

**1. One engine + scoped "cards" — not five agents.** Sella is a single runtime parameterized by
(scope · persona · tools); the "five Sellas" are scoped context objects, not five services. *Matches the
locked "5 Sellas = one runtime." Answers DEV-11 for MVP: no orchestrator.*

**2. Engine-first, on-demand, automate later — per the locked placement rule.** First slice =
`detect-deal` triggered **on-demand** (a user/dev click → person-waiting → the Next app, exactly what the
locked rule assigns). The automatic data-triggered path runs in a Supabase Edge Function when real chat
writes land. The *same engine* serves both homes.

**3. Engine = a runtime-neutral TS module in `supabase/functions/_shared/sella/`, separate from its
trigger.** The `detect-deal` job logic (prompt, output schema, dedup, context assembly) lives **beside
`bedrock.ts` in `_shared`** — not `src/modules/sella` — because of a verified one-way import asymmetry
(Next imports `_shared` trivially; the later Deno Edge Function *cannot* cleanly import from `src/`). It's
a **pure function of a context object**. Reached by a **thin Next server action** on-demand now; the
*same module* is reached by a thin **Edge Function** adapter later. Provider stays the existing
**plain-`fetch` + bearer-token** `bedrock.ts` (no SDK — the Anthropic SDK's `messages.parse()` path 400s
on Bedrock); add retries/timeout/`max_tokens` to it. Key in **Vercel env** for the Next path (it already
sits in Supabase Edge secrets for the later path — same key, both homes). *(Optional: a one-line
re-export in `src/modules/sella` for `@/modules/sella` ergonomics while the physical home stays
Deno-importable.)*

**4. `detect-deal` is stateless — no AI memory at MVP.** Thread passed in as context each call; engine is
a pure function of its context object. The dedup/"already-suggested" row is **application state in
Postgres** (also fed back into the prompt as structured state — see B2), *not* AI memory. Memory/RAG plug
into the context-assembly step later with zero engine change; any future memory = deletable EU-Postgres
rows, never model weights.

**5. Autonomy = L1 "Suggest", hard-coded.** Sella proposes; a human always acts. Matches the locked
**suggest-only structural** guarantee (only propose tools exist) and keeps Sella EU-AI-Act "limited-risk."

**6. Signals = deterministic compute in Sella's voice, NOT the LLM engine.** Facts (deal age, COA-expiry
math) computed from tables; the LLM is for language + judgment only.

## Detect-deal build spec

**B1 — Output contract (Bedrock-native structured outputs on the existing Converse helper).**
Use Converse `outputConfig.textFormat` (`type: "json_schema"`) on `bedrock.ts` — a request-body addition,
**no SDK switch**. One **stable** schema (grammar is compiled + cached 24h):
- `verdict`: enum `no_deal | forming | firm` (tri-state — natively expresses "no deal here").
- `confidence`: enum `low | med | high` — an **enum band, not a float**, because Bedrock's schema subset
  bans numeric `minimum`/`maximum`, so a 0–1 float can't be range-constrained but an enum can.
- `deal`: `{ line_items: [{ name, quantity, unit, unit_price, cultivar?, pzn? }], currency, summary }` —
  all **nullable** (a forming deal lacks a price); maps **1:1 to `deal_line_item` / `deal_card`** columns
  (same mapping the locked `propose_deal_draft` wanted — no glue layer).
- `evidence`: array of **verbatim chat quotes** that triggered detection (checkable → anti-hallucination,
  and a UI affordance).
- `additionalProperties: false` everywhere; `schema` must be **JSON-stringified** on the Converse wire.

Always **zod-validate + fail-soft** anyway (constrained decoding doesn't cover refusals / `max_tokens`
truncation). **Cold-compile latency:** first-ever compile can take minutes (cached 24h) — add a daily
**pre-warm** ping or a loading-state + timeout for the person-waiting first slice. *Forced tool-use returns
later for **action** jobs (draft-card) with `strict: true` — never bare `toolChoice` for schema shape.*

**B2 — Dedup / supersession (+ dedup-row-as-state).** Identity key = `(thread_id, product)`, *excluding*
qty/price (those legitimately change). On re-detection: trivial change → suppress; material change
(qty/price jump, terms) → **update the existing card**; `forming → firm` → update + re-notify.
Idempotency-guard each run on `(thread_id, last_message_id)`. **`no_deal` is a first-class row** (store
verdict + timestamp keyed by the identity key, so dedup sees `no_deal → forming → firm` transitions).
**Feed the last-surfaced deal row back into the prompt** as a structured "previously suggested" block —
supersession needs the model to see what was last shown. **MVP:** exact/normalized product match (accept
some misses on free-text variants); semantic/fuzzy match later. **GDPR:** store verbatim evidence quotes
only on `forming | firm` rows (bare verdict+timestamp for `no_deal`).

**B3 — Context = whole thread + cachePoint + cap.** Send the **whole thread** (oldest→newest), chunked
into **~25-message content blocks** (not one block per message — preserves the ~20-block cache lookback),
with the stable system + schema first (`tools → system → messages` order) and **one moving `cachePoint`**
at the end of the message blocks. Put the mutating dedup-state block **after** the cachePoint. A window was
rejected: it silently misses deals whose facts are spread out (an unmeasurable false negative) on first
detection, when no dedup row exists yet to compensate. **~20k-token hard cap** → summary+tail branch
(running Haiku summary + recent tail) — **deferred**; don't build until a real thread approaches it.
Caching is a **long-term** cost lever (engages above Bedrock's cumulative ~4k-token minimum; cache reads
are 0.1× *and* exempt from TPM quota) — at MVP thread lengths it barely engages, so size the **budget alert
on the uncached worst case**. Verify cache engagement empirically from `cacheReadInputTokens` /
`cacheWriteInputTokens` in the Converse response (exposed via `bedrock.ts`'s `raw`); don't hard-code the
4k threshold (AWS vs Anthropic docs differ; Sonnet 4.6 is already 1k).

## Guardrails & failure modes

Defense-in-depth. **Most catastrophic modes are removed _architecturally_:** `detect-deal` calls **no
tools / writes nothing** (suggest-only structural), only **suggests** (L1, human decides), **fails soft**,
keeps **facts out of the LLM** (D6). Aligns with `LAYER-4 §9`.

| Failure mode | Guardrail |
|---|---|
| **Prompt injection** (chat hijacks Sella) | No-tools/no-writes **invariant** · untrusted chat in a delimited "data, not instructions" block · hardened system prompt · **reject any structured output that fails zod** · output screen (drop if it echoes the prompt) |
| **Hallucination** (invents a deal/number) | Must return **verbatim chat quotes** as evidence — not in the thread → **reject** · extract-don't-infer (unstated fields stay `null`) · numbers/dates **computed, not generated** (D6) · human confirms · only `forming`/`firm` surface |
| **Non-determinism** (same chat → different answers) | **`temperature: 0`** (already in `bedrock.ts`) · structured outputs (grammar-constrained) bounds variance · the **DB dedup/verdict row is the source of truth, not the model** · supersession gate |
| **AI call fails** (Bedrock down/slow/rate-limited/garbled) | **Fail-soft** (no suggestion, chat unaffected) · retry `429`/`5xx` + backoff/jitter (add to helper) · timeout ∝ `max_tokens` · non-conforming output → "no result" · circuit-breaker (later) |
| **False positive / negative** | Strict signal gate + confidence band (FP) · manual trigger + lenient monitoring (FN) |
| **Wrong extraction** (5kg→50kg) | Human confirm · editable pre-fill · evidence quote to verify · reversible |

**Cross-cutting v1 (built in now):**
- **AI disclosure (EU AI Act Art. 50, binding 2 Aug 2026):** a **persistent "AI" badge** on every Sella
  suggestion (a footer / T&Cs does **not** satisfy the law) + a first-interaction notice; tag each Sella
  message AI-origin (machine-readable, Art. 50(2)).
- **Audit:** every Sella action logged dual-identity (`actor: sella` + `on_behalf_of: person`) — locked.
- **Cost guardrail:** `max_tokens` cap + bounded input (real-time runaway prevention) **+** an AWS daily
  **Budget alert** tagged to Sella (Application Inference Profile), sized on the **uncached** worst case;
  log tokens per call.

## Scope boundary

**In the first slice:** a stateless `detect-deal` job in `supabase/functions/_shared/sella/`, reached
on-demand by a thin Next server action, structured-output verdict + evidence, posting an L1 **suggestion**
to both sides; DB dedup; the guardrails above; audit + AI-disclosure.

**Out (named later-doors):** the other Sellas as live agents · multi-Sella orchestrator (DEV-11) ·
memory/RAG (DEV-59) · the autonomy ladder · the other jobs (**draft-card**, summarize, the "Ask Sella"
panel) · translation · first-contact Sella · LLM-narrated signals · semantic/fuzzy product dedup · the
automatic Edge-Function trigger (queue/cron) until real chat writes land.

## Dependencies — need Ayush (the one real boundary)

Per the PRD (`deal-flow.md` SR-1/SR-2): **detection = suggestion-only** ("nothing is created"); on
**both-accept, Sella _drafts_ the card** — so `draft-card` is the **next Sella job**, not deal-flow's. The
open boundary is narrower: **who/how spawns the Deal Workspace** + the **accept-gate UI**.

- **Ayush's §3.5 already built the deal-card write side** — `create_deal_draft` / `edit_deal_draft` RPCs,
  "create a draft from a chat → edit → new version" in `modules/deals/`. So a chunk of "what happens after
  detection" *already exists in his code* — the boundary work is wiring `detect-deal`'s suggestion → his
  draft flow, and deciding how §3.5 folds into Sella's §4.
- Also needs **real chat writes** for the *automatic* trigger (the on-demand first slice does not).

## Open questions + build-time riders

**Open (need decisions):**
1. **The Sella ↔ deal-flow boundary** (above) — *the one thing that needs Ayush.*
2. **Free-text product dedup** — MVP = exact/normalized match (accept misses); fuzzy later. Confirm OK.
3. **False-positive tuning** — thresholds from telemetry post-launch (LAYER-4 §3 flags this).

**Build-time riders (verified by research; do at build, not decisions):**
- **Smoke-test structured outputs** against `eu.anthropic.claude-sonnet-4-5` + `…-haiku-4-5` in
  eu-central-1 before locking the contract (also measures cold-compile latency).
- **Pre-warm** the grammar daily (or loading-state + timeout) for the person-waiting first slice.
- **Later auto-trigger = pgmq + pg_cron worker**, not a raw `pg_net` webhook (durability).
- **Pin EU region** in both homes (Vercel function region; `x-region=eu-central-1` on the later Edge fn).
- **Two-store key rotation** — the bearer token lives in Vercel env *and* Supabase Edge secrets; note it.
- **Exercise the Next→`_shared` import** in the first slice (nothing imports it yet); exclude
  `supabase/functions/**` from Next `tsconfig` once a Deno entrypoint lands.
- **GDPR note** — record whole-thread + transient (5m/1h, EU-geo) prompt-cache under data-minimization.

## Research basis

- **Anthropic** — *Building Effective Agents*, *Multi-agent research system*, *Structured outputs*,
  *Effective context engineering* (simplest-first; multi-agent ~15× tokens; evidence-quote grounding).
- **Bedrock contradiction research (2026-06-12, adversarially verified)** — structured outputs **GA on
  Bedrock Converse 2026-02-04** for Claude 4.5 incl. eu-central-1 / cross-region; Bedrock prompt-caching
  (4k cumulative min, 0.1× reads, quota-exempt reads, cross-region best-effort); `pg_net` non-durable /
  no-retry → pgmq queues for guaranteed delivery; Vercel `waitUntil` (2024) + Fluid compute → the old
  "can't fire-and-forget" rationale is stale; the `_shared` vs `src/` import asymmetry (Supabase CLI
  #1303 / PR #2420); the SDK `messages.parse()` 400 on the Bedrock mantle path.
- **EU/regulated security** — RLS-not-prompt scoping, OWASP LLM01, Bedrock EU residency + ZDR, EDPB
  erasure (rows not weights), EU AI Act Art. 50 disclosure.
- **Memory** — context vs memory; stateless-first; pgvector-in-Postgres; CoALA taxonomy.
