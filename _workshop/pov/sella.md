# Sella - Shared POV (the 4.0 synthesis: Ayush + Muskan)

> **What this is:** the merged outcome of the **4.0 shared Sella research**. It combines Ayush's research +
> decisions (`docs/research/sella-research-decisions-ayush.md`) and Muskan's architecture proposal
> (`docs/PRD/muskan-proposed-sella-architecture.md`) into **one shared reference** for what Sella is and
> what we locked. **Status:** aligned 2026-06-12 (Muskan's proposal reviewed against Ayush's read; conflicts
> resolved below). **How to build it:** `_workshop/build-plans/4-sella-build.md` (phase-by-phase).
>
> The two source docs stay as the long-form record (each person's read). This file is the **short, single
> source of truth** for the decisions.

---

## 1. What Sella is (the shared model - both agree)

- **One runtime, many Sellas.** The five Sellas (Deal, Seller, Buyer, Personal, Company) are **one runtime** parameterised by (data scope · persona · tools). Not five services.
- **Stateless single-shot.** Every MVP Sella call is one Bedrock call with ≤1 structured output. **No agent loop, no orchestrator, no framework, no RAG, no memory** (DEV-11).
- **Suggest-only is structural (the AI fence).** Sella is handed only *propose* tools, never a confirm/send/write tool. Autonomy is hard-coded **L1 (Suggest)**. A human button is the only write path. This also keeps Sella EU-AI-Act "limited-risk."
- **Placement rule.** Data-triggered work → background **Edge Function**; person-waiting work → **Next app**.
- **Signals = deterministic compute, not the LLM.** Facts (deal age, COA-expiry math) come from tables; the LLM is for language + judgment only.
- **Four layers (the backend shape):** (1) provider wrapper `bedrock.ts` · (2) scoped context builders · (3) persona + task config (system prompt + one tool) · (4) callers (Edge background / Next foreground). Context stays separate because each call freshly loads its own scope and is then thrown away - no shared memory to leak.

## 2. The head start (already built / verified - do not rebuild)

- **4a provider wrapper exists:** `supabase/functions/_shared/sella/bedrock.ts` - plain `fetch` + bearer token (no SDK), runtime-neutral (Deno *or* Node), `temperature: 0`, single-shot, tool-capable. Haiku verified live 2026-06-08; **Sonnet id not smoke-tested yet**.
- **The DB is already Sella-aware:** `content_author.sella`, `audit_actor_type.sella`, `chat_message_type.deal_detected` all seeded; lookup-table pattern (new statuses = INSERTs, not migrations).
- **The human commit path exists and obeys the fence:** `create_deal_draft` / `edit_deal_draft` RPCs + `src/modules/deals/actions.ts` (`createDeal`/`editDeal`/`confirmDeal`), audited `actor: user`. `deal_card_log` carries `changed_by` (person/sella/system) + `origin`.

## 3. The decisions (merged - conflicts resolved)

| Decision | Source | Note |
|---|---|---|
| **System vs `sella` message split**; `deal_card_updated` = `sella` (posts the "why it changed" summary to the deal chat **and** the log) | Ayush | facts → `system`, judgment → `sella` |
| **Version-level credit** via `deal_card_log.changed_by` + `origin`, **plus** audit dual-identity (`actor: sella` + `on_behalf_of: person`) | Ayush + Muskan | two complementary records, no new column |
| **AI fence / L1 Suggest** - no bypass | both | human confirm is the only write |
| **Detection model = Haiku** (→ Sonnet only if quality weak; smoke-test both ids first) | Ayush | detection runs often, cost matters |
| **Output = Bedrock structured outputs** (`outputConfig` json_schema), NOT a forced tool | **Muskan (adopted)** | forced-tool never guarantees shape; GA on Bedrock Feb 2026 |
| **Context = whole thread + ~20k cap + cachePoint**, NOT a 15-20 msg window | **Muskan (adopted)** | a window silently misses spread-out deal facts |
| **Dedup / supersession** (key = `thread+product`; `no_deal` is a real row; feed last-shown back into the prompt) | **Muskan (adopted)** | stops re-suggesting; handles qty/price changes |
| **Auto-trigger = pgmq + pg_cron**, NOT raw `pg_net` | **Muskan (adopted)** | `pg_net` is non-durable / no-retry |
| **Path A: fix the chat first.** Real `chat_message` writes → automatic detection in the **Edge Function** → **Bedrock key in Supabase Edge secrets ONLY** | Ayush (resolves the key conflict) | keeps decision 5; no Vercel key. See §4. |
| **Two-owner birth via one RPC** (owners-as-data, co-owner from creation) | Ayush | completes the locked 2026-06-10 two-owner design |
| **Option B detected-door** (preview → both confirm → birth); edit = counter via the existing gate; two distinct confirmations | Ayush | answers Muskan's open boundary, see §6 |
| **Engine in `supabase/functions/_shared/sella/`** (Deno can't cleanly import `src/`) | both | optional re-export in `src/modules/sella` for ergonomics |
| **EU AI Act Art. 50 disclosure** - a persistent "AI" badge on every suggestion (a footer does NOT satisfy the law, binding Aug 2026) + machine-readable AI-origin tag | **Muskan (adopted)** | built in v1 |
| **Cost guardrail** - `max_tokens` cap + bounded input + AWS daily Budget alert + per-call token log | **Muskan (adopted)** | sized on the uncached worst case |

### The one resolved conflict worth spelling out: the Bedrock key

Muskan's first slice ran detection **on-demand in a Next server action** (→ key in Vercel) **only because the chat is mock today** (no insert event to trigger an Edge Function). We chose **Path A instead: make the chat persist real messages first.** Once chat writes are real, detection runs **automatically in the Edge Function** (the data-triggered branch of the placement rule), so the Bedrock call lives in Supabase and the **key stays in Supabase Edge secrets only** - Ayush's decision 5 stands, no two-store split.

## 4. The detection engine spec (Muskan's `detect-deal`, adopted)

- **Output (structured outputs on the existing Converse helper):** one stable JSON schema - `verdict` enum (`no_deal | forming | firm`), `confidence` enum band (`low|med|high` - Bedrock bans numeric min/max), `deal { line_items[{name, quantity, unit, unit_price, cultivar?, pzn?}], currency, summary }` all nullable (maps 1:1 to `deal_line_item`/`deal_card`), and **`evidence`: verbatim chat quotes** (anti-hallucination - reject if a quote is not in the thread). `additionalProperties: false`; always zod-validate + fail-soft.
- **Context:** whole thread oldest→newest, chunked ~25-msg blocks, `tools → system → messages` order, one moving `cachePoint`, the mutating dedup-state block **after** the cachePoint; ~20k-token cap → summary+tail branch (deferred).
- **Dedup/supersession:** identity key `(thread_id, product)` excluding qty/price; trivial change → suppress; material change → update the card; `forming → firm` → update + re-notify; idempotency guard on `(thread_id, last_message_id)`; GDPR - store verbatim quotes only on `forming|firm` rows.

## 5. Guardrails & failure modes (adopted from Muskan)

Most catastrophic modes are removed **architecturally** (no tools/no writes, L1 suggest, fail-soft, facts out of the LLM). On top: prompt-injection (untrusted chat in a delimited block, reject non-conforming output), hallucination (verbatim-evidence requirement, extract-don't-infer), non-determinism (`temperature: 0` + structured outputs + DB dedup as source of truth), AI-call-fails (fail-soft, retry 429/5xx + backoff, timeout, circuit-breaker later), wrong-extraction (human confirm + editable + reversible). Plus the Art. 50 AI badge, dual-identity audit, and cost guardrail from §3.

## 6. The boundary (resolved - this is where our two docs meet)

Muskan's one open blocker was *"who/how spawns the Deal Workspace + the accept-gate."* **Ayush's work answers it:**
- **Spawn:** the **two-owner `create_deal_draft`** (the workspace is born in that one transaction, both sides as owners) - the same RPC serves the detected-deal birth (owners passed as data).
- **Accept-gate:** **Option B** - Sella posts a read-only **preview**; on **both** sides confirming, the Draft card + workspace are born; editing afterwards is a **counter** through the existing `editDeal` → re-confirm gate. Two distinct confirmations: *confirm the draft* (births it) vs *confirm the deal* (Draft → Confirmed).

So `detect-deal` (Muskan) hands its suggestion to Ayush's §3.5 draft flow; that wiring is the boundary, and it is now specified.

## 7. Deferred (post-MVP, same foundation)

Right-panel co-pilot (Side-Sella, needs RAG/memory) · multi-deal selector (DEV-37, resolved by the explicit top-right deal tag) · persistent memory (DEV-59) · autonomy ladder · translation · feedback/thumbs · semantic/fuzzy product dedup · the other Sella jobs (the automatic Edge trigger lands once chat writes are real - which Path A does up front).

## 8. Open items / build-time riders

- Smoke-test **structured outputs** against `eu.anthropic.claude-sonnet-4-5` + `…-haiku-4-5` in `eu-central-1` (and the Sonnet id) before locking the contract; measure cold-compile latency, add a daily pre-warm.
- Confirm exact `deal_detected` metadata shape (draft + votes) when wiring detection → birth.
- Free-text product dedup = exact/normalised match for MVP (fuzzy later).
- Pin EU region in both homes; GDPR note on whole-thread + transient prompt-cache.
