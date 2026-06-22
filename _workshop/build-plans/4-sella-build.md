# 4 - Sella build (phase-by-phase)

**Status:** ✅ **Chapter 4 (Sella) COMPLETE** — 4a · 4b · 4c · 4d all DONE + verified live (Ayush, 2026-06-12). The chat→card journey runs end to end (detect → both confirm → Draft born → 3d seal), and Sella narrates changes into every chat the card lives in. **Next = 5A (UI).** **Owner:** Ayush.
**Decisions reference:** `_workshop/pov/sella.md` (the 4.0 synthesis). **Long-form research:** `docs/research/sella-research-decisions-ayush.md` + `docs/PRD/muskan-proposed-sella-architecture.md`.

> This is the **how-to-build**, in order. The **what/why** lives in `_workshop/pov/sella.md` - read that first.
> Working style (Ayush): build one phase, review it live, then the next. Do not batch.

## What is locked (build on it, do not re-litigate)

One runtime · stateless single-shot · **AI fence (L1 suggest, only propose tools)** · **Bedrock structured outputs** (not forced-tool) · **whole-thread context** (not a window) · **Path A: real chat writes first → auto-detection in the Edge Function → key in Supabase Edge secrets only** · **pgmq + pg_cron** for the trigger (not raw `pg_net`) · **two-owner birth via one RPC** · **Option B** detected-door (preview → both confirm → birth) · engine in `supabase/functions/_shared/sella/` · EU AI Act Art. 50 AI badge · cost guardrail. Full table: `_workshop/pov/sella.md` §3.

## Phase 0 - Make the chat real (the Path A prerequisite) - ✅ DONE (Connect 2d)

The chat already persists real messages and Realtime broadcasts both sides - built in 2d (commit `ac00a78`), not a Phase 4 task. Verified 2026-06-12 against code + the live DB (33 real `chat_message` rows; `chat_message` + `chat_thread` in the `supabase_realtime` publication; RLS `msg_all`).

- `postMessage` (`src/modules/messaging/supabase/store.ts`) inserts a real `chat_message` row; wired from `ChatView` + `DealChat`.
- Both sides see new messages live via `useChatRealtime` (verified in 2d).
- So 4b's automatic trigger is unblocked and the Bedrock key stays in Supabase only. *(The old "chat is mock" note was stale - a store.ts header comment lied; the function body was already real.)*

## 4a - Provider layer (mostly done)

- The wrapper `supabase/functions/_shared/sella/bedrock.ts` **already exists** (plain fetch + bearer, dual-runtime, temp 0, tool-capable).
- **Add to the wrapper:** retries (429/5xx + backoff/jitter), a timeout (∝ `max_tokens`), and the **structured-outputs request shape** (`outputConfig.textFormat` json_schema - a body addition, no SDK).
- **Smoke-test** structured outputs against `eu.anthropic.claude-sonnet-4-5` **and** `…-haiku-4-5` in `eu-central-1` (this also verifies the un-tested Sonnet id and measures cold-compile latency). Add a daily grammar **pre-warm**.
- Thin task modules beside it: `tools.ts` (the schemas), `prompts.ts` (persona + task), `context.ts` (`buildDealContext` / scoped reads).

## 4c - The draft tool (`detect-deal` output contract)

- One **structured-output schema**: `verdict` (`no_deal|forming|firm`), `confidence` (`low|med|high` enum band), `deal { line_items[{name, quantity, unit, unit_price, cultivar?, pzn?}], currency, summary }` (all nullable; maps 1:1 to `deal_line_item`/`deal_card`), `evidence` (verbatim chat quotes). `additionalProperties:false`; **zod-validate + fail-soft** always.
- The surrounding code feeds Sella the **whole thread** + the seller's product list (to resolve `product_id`). Same tool serves detection and the manual `+ Create a deal` pre-fill.

## 4b - Detection (the heart)

- **Trigger:** new `chat_message` row → **pgmq queue + pg_cron worker** → Edge Function `sella-detect` (data-triggered → background; key in Supabase Edge secrets).
- **Context:** whole thread (chunked ~25-msg blocks, one moving `cachePoint`, dedup-state after it), ~20k cap (summary+tail deferred).
- **Run:** Haiku with the 4c schema → write a **`sella`-authored `deal_detected`** message; the proposed draft + each side's accept/reject vote ride in its `metadata`. Realtime shows it inline (non-blocking, no screen freeze).
- **Dedup/supersession:** identity key `(thread_id, product)`; `no_deal` is a real row; idempotency guard on `(thread_id, last_message_id)`; feed the last-surfaced row back into the prompt.
- **Birth (Option B):** the `deal_detected` message renders a **read-only preview**. On **both** sides confirming → the human-triggered **two-owner birth RPC** creates the Draft card + line items + workspace (both sides `owner`) + deal thread + `workspace_created` line + audit, in one transaction. The confirm is the fence's human action.
- **Two-owner RPC task:** `create_deal_draft` today inserts only the creator as owner and is not told the other person. Add the **counterparty `person_id` as a parameter** and insert the second owner (owners-as-data); the create action knows it from the chat. The same RPC serves the detected-deal birth.

## 4d - Summaries

- **Version-change summary:** on a card edit, Sella (Haiku) reads the change note + diff, writes the "why," sets `deal_card_log.change_summary` with `changed_by = 'sella'`, and posts a **`sella`-authored `deal_card_updated`** message into the deal workspace chat (decision: chat line **and** log).
- **First-contact intro/summary:** the editable first message when a relationship opens.

## Guardrails (cross-cutting, build alongside)

Fail-soft everywhere (Sella down → chat + deals still work). Prompt-injection (delimited untrusted-chat block, reject non-conforming output), hallucination (verbatim-evidence requirement), `temperature: 0`, dual-identity audit (`actor: sella` + `on_behalf_of`), **EU AI Act Art. 50 AI badge** on every suggestion, **cost guardrail** (`max_tokens` + AWS daily budget alert + per-call token log). Detail: `_workshop/pov/sella.md` §5.

## Build order

**Phase 0 (chat writes) → 4a (verify wrapper + structured outputs) → 4c (the schema/tool) → 4b (detection + two-owner birth + Option B gate) → 4d (summaries).** Review each live before the next.

## Out of scope (later doors)

Right-panel co-pilot · multi-deal selector (DEV-37) · memory/RAG (DEV-59) · autonomy ladder · translation · the other Sellas as live agents · semantic product dedup · UI styling (that is 5A).
