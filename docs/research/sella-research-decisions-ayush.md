# Sella - Research & Decisions (Ayush's read for Section 4.0)

> **What this is:** Ayush's independent research read + the build decisions we locked in session, for the **shared 4.0 Sella research step**. To be compared with Muskan's read before the 4a-4d build starts.
> **Status:** Research done. Decisions below are agreed with Ayush in-session; still to be cross-checked with Muskan and reflected into `DECISIONS.md` / `AGENTS.md` (propose-mode) once we both align.
> **Date:** 2026-06-12
> **Scope:** The MVP Sella build (4a wrapper, 4b detect, 4c draft, 4d summarise) on the locked DEV-11 shape. Not the post-MVP Sella (co-pilot, memory, autonomy ladder).
>
> **Method / sources (deliberately narrow):**
> - **Live database** `byipusuthdlskdxoexkt` (the project the app's `.env.local` actually points at) - tables, lookup values, edge functions, migrations, installed extensions all inspected live.
> - **Code read:** `supabase/functions/_shared/sella/bedrock.ts`, `src/modules/deals/actions.ts`, the `create_deal_draft` + ownership migrations.
> - **Existing design docs:** `SELLA.md`, `LAYER-4-SELLA-BEHAVIOR.md`, `DECISIONS.md`, `AGENTS.md`, `ARCHITECTURE-NOTES.md`.
> - **PRD** (`docs/PRD/`): `BUILD-PLAN.md`, `connect-demo.md`, `deal-flow.md`, `foundation.md` - read on a second pass and cross-checked (see **§11**). The prototype was not researched - nothing new there for this decision.

---

## Executive Summary

| Area | Finding / Decision |
|---|---|
| **Biggest finding** | The database is **already Sella-aware** and the **4a provider wrapper already exists in code.** The remaining build is smaller than it looked: detection, the draft tool, and summaries. |
| **The model** | Five Sellas = **one runtime** parameterised by (data scope + persona + tool). Stateless single-shot Bedrock calls. No agent loop, no RAG, no memory in MVP. (DEV-11, already locked.) |
| **Safety** | The **AI fence** holds: Sella only gets *propose* tools, never a *confirm/send* tool. Only a human button writes a deal. |
| **Detection** | Background, non-blocking. Never freezes the screen. Fires only on a strict signal (product + quantity, OR product + price). One inline prompt; two doors to one form. |
| **Decisions locked this session** | (1) system-vs-Sella message split, (2) version-level credit, (3) no fence bypass, (4) Haiku for detection, (5) Bedrock key only in Supabase, (6) two owners from birth via one RPC, (7) Sella reads via code-fed context. |
| **Deferred** | Right-panel co-pilot (Side-Sella), multi-deal selector (DEV-37), RAG/memory, autonomy ladder, translation, feedback. All on this same foundation. |

**Binding constraint:** the AI fence - Sella may *fill* the deal form but the human's button is the only write path. Everything below is designed around that.

---

## 1. The head start - what already exists

### 1.1 The database is already Sella-aware

The schema was built with Sella as a first-class actor. Confirmed live in the lookup tables (this DB uses **lookup tables**, not hard Postgres enums - so adding a new status/type later is a row insert, not a risky migration):

| Seam | Value already present | Meaning |
|---|---|---|
| `content_author` | `sella` ("The Sella AI agent") | A chat message can be authored *by Sella*. |
| `audit_actor_type` | `sella` ("The Sella AI agent") | The audit log can record *Sella did this*. |
| `chat_message_type` | `deal_detected` ("Sella detected a possible deal") | The detection message type exists. |
| `chat_message` | `type` (FK) + `metadata` (jsonb) + `sender` (FK) | The natural home for a detection proposal: a `sella`-authored `deal_detected` message with the draft in `metadata`. |
| `deal_card_log` | `changed_by` (person/sella/system) + `origin` | Per-version credit: who drove each deal version. |

The deal machinery itself is fully built: `deal_card`, `deal_line_item`, `deal_workspace`, `deal_member`, `deal_confirmation`, `deal_card_log`, `deal_change_input`, `thing`, `deal_artifact`, plus the hash-chained `audit_log` (with a `sella` actor type).

### 1.2 The code foundation

- **4a provider wrapper EXISTS:** `supabase/functions/_shared/sella/bedrock.ts` - a clean `callBedrock()` that hides the Bedrock Converse wire format, the EU endpoint, and the bearer-token auth. It already supports tools, force-one-tool, a system prompt, and returns a normalised `{ text, toolUse, stopReason }`. Its key-read works in **both** Deno (Edge) and Node (Next.js) - so it can serve both homes unchanged.
- **The human commit path exists and already obeys the fence:** `src/modules/deals/actions.ts` - `createDeal` -> `create_deal_draft` RPC, `editDeal` -> `edit_deal_draft` RPC, both audited as `actorType: "user"`. `confirmDeal` runs the both-sides gate that flips a card to `confirmed`.
- **`bedrock-smoke` edge function is deployed.** Live-verified: a call to `eu.anthropic.claude-haiku-4-5-20251001-v1:0` in `eu-central-1` returned "pong" (2026-06-08).

### 1.3 What does NOT exist yet (the gaps)

- **No detection edge function** (only `bedrock-smoke`). Detection (4b) is unbuilt.
- **`pg_net` is available but NOT installed** - the async DB-webhook trigger that wakes detection is not wired yet.
- **`pgvector` is available but NOT installed** - correct for MVP (no RAG by decision).
- **No tables** for signals, AI proposals, feedback, or memory - intentional. Detection proposal rides on `chat_message.metadata`; signals are computed live; credit rides on `deal_card_log`.
- **The Sonnet draft model id in `bedrock.ts` is NOT smoke-tested yet** (only Haiku is verified).

---

## 2. The Sella model - one runtime, many Sellas (DEV-11, locked)

### 2.1 One runtime, parameterised

The five Sellas (Deal, Seller, Buyer, Personal, Company) are **not five services**. They are **one runtime** changed only by three parameters: **data scope** (what context is loaded), **persona** (which system prompt), and **tool** (which single structured-output tool). All MVP tasks are **stateless single-shot** Bedrock calls.

### 2.2 The four layers (the backend arrangement)

1. **Provider wrapper** (= 4a, already exists): the only code that talks to Bedrock. Holds the key, picks the model, returns structured output.
2. **Context builders**: scoped DB reads, e.g. `buildDealContext(dealId)`, `buildPersonalContext(personId)`. This is the "data scope" parameter.
3. **Persona + task config**: a small system-prompt snippet + the one tool for each task (detect / summarise / digest).
4. **Callers**: the **Edge Function** (background, data-triggered) and **Next.js** (foreground, person-waiting).

"One runtime, many Sellas" = layer 1, with a Sella being layer 2 scope + layer 3 persona/tool.

### 2.3 How context stays separate (important)

In the MVP there is **no stored memory**, so nothing can leak between Sellas. Every call is stateless: a context builder runs `SELECT`s scoped to one `deal_id` or one `person_id`, the prompt is built fresh, the call returns, and it is thrown away. **Separation is structural** - enforced by the scoped reads, not by the model "remembering" its lane. When memory is added post-MVP, the same scoping becomes a memory namespace (`deal_id` vs `person_id`) and separation carries over.

### 2.4 Placement rule (locked)

**Data-triggered work runs in the Edge Function** (background) - detection, the card-change summary. **Person-waiting work runs in Next.js** (foreground) - the manual draft, the daily digest. One choice does not bind the others.

---

## 3. The AI fence (load-bearing safety rule)

### 3.1 The rule

Sella is only ever handed *propose* tools, **never** a `confirm`/`send`/write tool. So by construction she cannot commit a deal. Every create/edit is committed by a **human pressing a button** that calls a server action. The `DealForm` is "dumb + fed" for exactly this - Sella plugs in without a rewrite.

### 3.2 Three concepts kept separate

A lot of confusion disappears once these are split apart:

- **Capability** - who may press the final write button. *Fence: human only.*
- **Staging** - whether a draft card is made early, or the draft is held in the chat message until both agree. *UX choice.*
- **Credit** - whether the record remembers Sella did the drafting. *Just data.*

The detection flow keeps **capability** with the human, so it needs **no fence bypass**.

### 3.3 Why it matters

Regulated German cannabis market: GDPR Art 32 + the EU AI Act (Aug 2026). "The AI committed a deal by itself" is exactly what we must not have to defend. Our non-goals already forbid Sella creating any financial/contractual obligation without human consent.

---

## 4. Workflows - how Sella acts

### 4.1 Detection (4b) - the heart of the MVP

Two people chat. In the **background** (Edge Function, nothing on screen), Sella reads the last ~15-20 messages and keeps a quiet "is a deal forming?" model. **The screen never freezes; there is no forced popup.** When a **strict signal** hits - **product + quantity**, OR **product + price** - she drops one calm, **non-blocking** prompt *inside the chat* ("Looks like a deal is forming - turn this into a deal card?"). People can ignore it and keep talking.

Tapping it opens a **read-only preview of Sella's draft** (product, quantity, price from the conversation) - **Option B**. Each side reviews and **confirms** ("yes, draft it"). When **both sides confirm the preview**, the **Draft card + workspace are born** from it. That confirm is the human button - **the fence holds automatically**. Field edits are **not** made on the preview; they happen on the **Draft card afterwards** via the normal edit -> new-version -> re-confirm gate (the "accept vs counter" loop), which keeps two-sided consent intact. See §11.4 (3) for the two distinct confirmations.

**Two doors, one form:**
- **Manual door:** `+` in the typing bar -> "Create a deal" -> the form (empty or lightly filled). (This is a 5A UI item.)
- **Detected door:** Sella's in-chat prompt -> the *same* form, pre-filled.

Both end at the same `create_deal_draft` path. Sella needs **zero new write-path**.

> Flow vs pixels: the *flow and data* are locked here; **where the panel sits visually is a 5A (UI pass) decision**, not a Sella-build decision. Style once, after Sella's shape is known.

### 4.2 Drafting (4c) - the shared brain

One structured-output tool, `propose_deal_draft`, mapping to the real columns (per `rpcLines` in `actions.ts`): `productName`, `quantity`, `unit`, `unitPrice`, `currency`, with `cultivar`/`pzn`/`thcPercent`/`cbdPercent` into line `metadata`. The **surrounding code feeds Sella the context** (the chat window + the seller's small product list so she can resolve a real `product_id`). The same tool serves both doors (detection + manual pre-fill).

### 4.3 Summaries (4d) - cheap, Haiku

- **Version-change summary:** when a card is edited, Sella reads the change note + the diff, writes a human-friendly "why," and posts it as a **`sella`-authored `deal_card_updated`** message into the deal workspace chat; the `deal_card_log.change_summary` is her text with `changed_by = 'sella'`.
- **First-contact intro/summary:** the editable first message Sella writes when a relationship opens.

### 4.4 System vs Sella messages - the split (decided)

**Rule: plain facts the code already knows -> `system`; anything that needs reading/judging the conversation -> `sella`.**

| Author | Messages | Why |
|---|---|---|
| `system` | `connection_established`, `workspace_created` (the bare "draft created" fact), `deal_opened`, `deal_cancelled` | Fixed facts, fixed template, no reasoning. |
| `sella` | `deal_detected`, `deal_card_updated` (the *why*-summary), the first-contact intro/summary, the editable "note from Deal-Sella", evidence prompts, the 30-day "park or close?" nudge | Each needs Sella to read the chat and decide what to say. |

> Note: the seed data currently has `workspace_created` as **both** `system` and `sella` - this split is the cleanup that resolves that.
> Reconcile: the PRD (`connect-demo.md` O2) treats a version-change as a **card-log** line and says **no `deal_card_updated` broadcast is needed** (everyone is already inside the deal chat; `origin = deal_chat` is silent). Posting a `sella`-authored `deal_card_updated` **chat** line is Ayush's session addition - safe and additive, but a choice. See **§11.4 (1)**.

### 4.5 Personal / Side-Sella co-pilot - DEFERRED (post-MVP)

The private right-panel assistant that reads the conversation and privately suggests *your* next move ("Bob is asking X - a good reply is Y"). In our model this is the **right-panel, your-side Sella** (Seller-/Buyer-Sella). It fits the same skeleton (scoped context + a "suggest a reply" tool + private persona). **Deferred** because it is most valuable *with* memory/RAG, which is post-MVP. Safety: it may suggest to you, but **never sends to the other side** without your click (hard ceiling = the same fence).

---

## 5. Decisions locked this session

| # | Decision | Why |
|---|---|---|
| 1 | **System vs Sella message split** (table in 4.4); `deal_card_updated` is **Sella-authored** when it carries the why-summary. | Keeps Sella's voice for judgment, code's voice for facts. Fixes the mixed seed data. |
| 2 | **Credit is version-level**, via existing `deal_card_log.changed_by` + `origin`. **No new column.** | Avoids two sources of truth that drift. Sella's proposal already lives in the `deal_detected` message; the final lives in the card; the difference is the human's edits. |
| 3 | **No AI-fence bypass.** Sella drafts, human confirms. | The flow already keeps the write with the human; bypassing would reverse a locked safety rule for no gain. |
| 4 | **Detection model = Haiku** (switch to Sonnet later only if quality is weak). | Detection runs on many messages, so cost matters. Verify exact ids via the `claude-api` reference and smoke-test the Sonnet id before pinning. |
| 5 | **Bedrock key only in Supabase Edge secrets**; route **all** Sella calls through the Edge Function for MVP. | One key home, one cost log. Next.js reuses its existing Supabase access (no Bedrock key needed). Vercel-direct = a future "three places" problem if foreground latency ever bites. |
| 6 | **A deal is born with two owners (one per side) via one RPC**, owners passed **as data** (not a mode flag), **co-owner from creation**. | Completes the already-locked (2026-06-10) two-owner design that the `create_deal_draft` RPC had not caught up to. One RPC, fed the owners, serves both manual create and detected-deal birth. Harmless for the counterparty to co-own a draft in their own room (MVP = one person per side). |
| 7 | **Sella reads the DB via code-fed context** (output tools only; no retrieval/agentic loop). | Keeps every call stateless single-shot per DEV-11. The Edge Function reads the DB and packs context into the prompt; Sella never queries the DB herself. |
| 8 | **Detected-door flow = Option B (preview -> both confirm -> birth).** Sella shows a **read-only preview**; on **both** sides confirming, the **Draft card + workspace are born**; field edits + accept/counter happen on the **Draft card** via the existing gate. **Two confirmations:** *confirm the draft* (births it) and *confirm the deal* (Draft -> Confirmed). Detected birth is two-sided; the manual `+` door stays one-sided. | Human-in-the-loop and two-sided consent up front; reuses the built edit/confirm gate; avoids editing a not-yet-existing card (which would break two-sided consent). |

---

## 6. Already locked upstream (build on, do not re-litigate)

From Muskan's design / prior DECISIONS:
- **DEV-11:** one runtime, stateless single-shot, ≤1 tool per call, no orchestrator/graph/framework, no RAG, no memory (MVP).
- **Detection in a Supabase Edge Function** (new `chat_message` -> DB webhook -> Claude), not the Next.js path.
- **One `propose_deal_draft` tool**; suggest-only is structural (the fence).
- **Proposal + both-accept votes ride in the `deal_detected` message `metadata`** - no new table.
- **Workspace birth = one atomic transaction** on both-accept.
- **Two owners, one per side** (2026-06-10) - the constraint blocking it was already removed.
- **Bedrock EU/Frankfurt**, auth via **Bedrock API key (bearer token)** in `AWS_BEARER_TOKEN_BEDROCK`, plain `fetch` (no SigV4/SDK) - verified live 2026-06-08.
- **Model tiers:** major work (drafting) -> Sonnet; light work (summaries) -> Haiku.

---

## 7. Deferred to post-MVP (same foundation)

Right-panel co-pilot (Side-Sella, needs RAG/memory) · multi-deal selector (**DEV-37**, resolved by the explicit top-right deal tag, not by Sella guessing) · persistent memory + retention (DEV-59) · autonomy ladder (L0-L4 trust) · translation toggle · thumbs-up/down feedback learning · auto-creating a draft card on detection (we hold the draft in the chat message until both accept).

---

## 8. Data touchpoints - what Sella reads / writes

- **Reads (code-fed):** rolling chat window (`chat_message`), the deal (`deal_card` + `deal_line_item`), the seller's catalogue (`product`) for `product_id` resolution, deal context (`deal_workspace`, `deal_member`, `deal_change_input`).
- **Writes as `sella` (allowed - these are not commits):** `chat_message` rows (`deal_detected`, `deal_card_updated`, intro/summary) with payload in `metadata`; `deal_card_log.change_summary` with `changed_by = 'sella'`; `audit_log` entries with `actor_type = 'sella'` where appropriate.
- **Never writes (the fence):** `deal_card` / `deal_line_item` / confirmations. Those go only through the human-triggered server actions (`createDeal`, `editDeal`, `confirmDeal`).
- **`deal_detected` metadata shape (proposed):** `{ draft: <propose_deal_draft output>, votes: { <companyId>: 'accept'|'reject' } }`. On both-accept -> the human-triggered birth RPC.
- **The two-owner RPC change:** `create_deal_draft` today inserts only the creator as `owner`. It must also insert the **counterparty person** as a second `owner`. The RPC currently receives only `p_relationship_id`, not the other person - so we pass the counterparty's `person_id` in (the create action knows it from the chat). The same owners-as-data RPC then serves the detected-deal birth.

---

## 9. Proposed codebase / file structure + build order

```
supabase/functions/
  _shared/sella/
    bedrock.ts          # 4a provider wrapper  (EXISTS)
    tools.ts            # propose_deal_draft + summary tool schemas  (NEW)
    prompts.ts          # persona + task system prompts  (NEW)
    context.ts          # buildDealContext / buildPersonalContext  (NEW)
  sella-detect/
    index.ts            # 4b detection edge function  (NEW)
  bedrock-smoke/        # (smoke test, already deployed)

supabase/migrations/
  ..._create_deal_draft_rpc.sql      # (EXISTS) -> ADD second owner param
  ..._create_deal_from_detection.sql # birth on both-accept  (NEW, may reuse a shared owners helper)
  ..._enable_pg_net_and_webhook.sql  # async trigger on chat_message insert  (NEW)

src/modules/deals/
  actions.ts            # createDeal/editDeal/confirmDeal  (EXISTS) -> pass counterparty person id
  ...                   # DealForm already "dumb + fed"
```

**Build order (Ayush's step-by-step: build one, review live, then next):**
1. **4a** - verify the wrapper end-to-end (smoke-test the Sonnet id; thin tools/prompts/context modules).
2. **4c** - `propose_deal_draft` tool + prompt + product-catalogue feeding.
3. **4b** - detection: enable `pg_net` + webhook -> `sella-detect` -> write the `deal_detected` message -> realtime -> both-accept birth RPC.
4. **4d** - summaries (version-change `deal_card_updated`, first-contact intro).

Muskan = Sella backstop.

---

## 10. Open items - to compare with Muskan + verify before build

- **Detection model:** Haiku vs Sonnet final call (start Haiku) - and **smoke-test the Sonnet id** + confirm both ids against the `claude-api` reference before pinning.
- **The two-owner RPC update:** confirm exactly how the counterparty *currently* sees the draft (relationship-visibility RLS vs membership) before adding the second owner, so we do not change who-sees-what by accident.
- **Detection birth RPC:** reuse `create_deal_draft` (owners-as-data) vs a sibling `create_deal_from_detection` sharing a line-items/owners helper.
- **`deal_detected` metadata contract:** lock the exact JSON shape (draft + votes) with Muskan.
- **Reflect agreed decisions** into `DECISIONS.md` / `AGENTS.md` (propose-mode) after we align.

---

## 11. PRD cross-check (docs/PRD/) - what it adds, and where to reconcile

Read on a second pass: `BUILD-PLAN.md`, `connect-demo.md`, `deal-flow.md`, `foundation.md`. The PRD broadly **agrees** with this note (Sella suggests-only, born-at-Draft, audited, leaf). Below is what it **adds** and the handful of places our session decisions and the PRD canon need to be reconciled.

### 11.1 The demo's canonical path (9-step acceptance script)

From `connect-demo.md` §6 / `BUILD-PLAN.md`. Sella is steps 4-5:

1. A sends a connect request -> B's inbox.
2. B accepts -> relationship + C2C chat.
3. The two people chat (and can open the relationship page).
4. **Sella spots a deal and asks both sides** ("looks like a deal - shall I draft it?"). *Nothing is created yet.*
5. **Both say yes -> Sella drafts the card + the Deal Workspace is born** (at Draft).
6. Negotiate inside the deal chat + advance stages (the card versions).
7. Each side confirms.
8. Status flips **Draft -> Confirmed**.
9. The audit trail shows every step, including Sella's.

### 11.2 Sella's functional requirements (`deal-flow.md` Block 5)

Crisp, testable - these are the spec for 4b-4d:

- **SR-1 Detect:** post a `deal_detected` suggestion to **both** sides; nothing created.
- **SR-2 Draft:** on both-yes, draft a Deal Card in **Draft**, populated from the chat; **never** confirm/send it.
- **SR-3 Summarize:** write each version change as one human line **to the card log**.
- **SR-4 Attribution:** every Sella action is audited as actor **`sella`** **plus the triggering human** (`on_behalf_of_person_id` - foundation FR-A3). This sharpens this note's §8: Sella's audit rows use `actor_type = 'sella'` **and** record the human who triggered her.
- **SR-5 Non-blocking:** if Bedrock is slow/down, chat + deals **still work** (manual draft is the fallback). With Sella off, acceptance steps 1-3 and 6-8 still pass.

### 11.3 Sella is a leaf (resilience principle - confirmed)

The dependency arrows point **into** Sella, never out. Nothing waits on it. This is why Sella is built last, why Muskan can backstop it late without disrupting the rest, and why the **manual `+` "Create a deal" door is the fallback** when Sella is down. Good `release-it` shape: the AI adds, it is never load-bearing.

### 11.4 Reconciliations (RESOLVED 2026-06-12 with Ayush)

1. **`deal_card_updated` chat line - RESOLVED (keep it).** PRD `connect-demo.md` **O2** said no broadcast was needed (workspace born at Draft -> everyone is already in the deal chat). **Decision:** every card change posts a `sella`-authored "why it changed" summary to **both** the card **log** (SR-3 / FR-D5) **and** the **deal chat** as a `deal_card_updated` line. This **overrides O2** - the chat line is wanted so Sella's reasoning is visible in the conversation, not only in the log.

2. **"Sella reads the DB via tool calls" - RESOLVED (keep the precise wording).** `BUILD-PLAN.md` (2026-06-07, **pre-DEV-11**) phrases it loosely. Under DEV-11 + this note's **decision 7**, the **edge-function code** reads the DB and feeds context into the prompt; Sella's only tool is the **output** tool (`propose_deal_draft`). No retrieval / agentic tool calls. Same conclusion (Sella's code stays coupled to Connect/the DB), different mechanism - the precise wording stands so the older phrasing is not taken literally.

3. **Detected-door flow - RESOLVED (Option B: preview -> confirm).** Sella shows a **read-only preview** of her draft ("this is what I'd draft - confirm?"). On **both** sides confirming, the **Draft card + workspace are born** from the preview (that confirm is the fence's human action). Field editing is **not** done on the preview; it happens on the **Draft card** afterwards through the existing **edit -> new-version -> re-confirm** gate - which is the **accept (confirm) vs counter (edit)** loop. This keeps two-sided consent intact and reuses built machinery. **Two distinct confirmations exist - do not conflate them:** (1) *confirm the draft* = births the Draft card + workspace; (2) *confirm the deal* (FR-D2) = flips **Draft -> Confirmed** after negotiation. Detected-door birth is **two-sided** (both confirm the preview); the **manual** `+` door stays **one-sided** (the creator makes a draft offer). *(Open micro-detail: detected birth could be made one-confirm instead of two if less friction is wanted - default is two-sided.)*

4. **Workspace born at Draft (precise, and already true in code).** Confirmed by PRD **O6 / FR-D3**: `create_deal_draft` births the workspace in the **same transaction** as the draft card. So **both** doors - manual and detected - birth the workspace at Draft. (This also means the two-owner change from §5/#6 applies to that same birth transaction.)

### 11.5 Deal context Sella summarises against (the 5-stage pipeline)

`deal-flow.md` Block 4: **Negotiation -> Compliance & Quality -> Agreement -> Payment -> Fulfilment & Delivery.** Status flips **Draft -> Confirmed at stage 3 (Agreement)**; stages 4-5 are post-MVP (greyed). Relevant to Sella because her version summaries (SR-3) accompany the card changes as the deal walks stages 1-3.
