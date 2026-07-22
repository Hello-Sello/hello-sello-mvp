# Sella C2C Detection (Lane C) — seller detects the deal from the conversation
**Status:** 📝 **OUTLINE (pre-research)** — needs full research + very-small-task breakdown + verification before build (like Lane A/B) · **Owner:** Ayush (Sella lane, co-owned) · **Size:** L

> This captures the breakdown we discussed so it isn't lost. It is **NOT yet verified or tiny-ticketed** — do that pass before building.

## Goal
The seller's Sella reads the **C2C (company) chat** and automatically detects a deal, surfacing it as a **claimable ticket** (reusing Lane A's `deliver_deal`). Today detection runs on **p2p** chats only and explicitly excludes c2c.

## What already exists (from this session's Sella research — verify before trusting)
- The detection pipeline is **BUILT + live on p2p**: a Bedrock (EU) wrapper, the detect brain (`detect.ts`/`tools.ts`/`context.ts`), an auto-trigger (`pgmq` + `pg_cron`, migration `20260612130000_sella_detect_trigger.sql`), the "Sella spotted a deal" Accept/Reject strip, and the confirm→birth path.
- The trigger filters `t.type = 'p2p'` and **excludes `c2c`**.
- `confirm_detected_deal` **reuses `create_deal_draft`** → a c2c-detected deal can reuse **Lane A's company-ticket delivery for free**.
- Provider is hard-wired to Bedrock (`_shared/sella/bedrock.ts`) — EU Converse endpoint, `eu.`-Claude model IDs, AWS bearer token.

## Rough breakdown (from our discussion — turn into tiny tickets after research)
| # | Ticket | Note |
|---|---|---|
| **C1** | Extend the detection trigger **p2p → c2c** (widen `t.type='p2p'` + the context builder) | Priority-loop piece |
| **C2** | Surface the c2c-detected deal as a **ticket** (reuse Lane A `deliver_deal` / company delivery) | Priority-loop piece |
| **C0** | **Provider port** — an `LlmProvider` interface + Bedrock + **Ionos** adapters, so the EU provider is swappable by config | Foundational for the fuller lane |
| **C3** | **Product/batch resolution** ("pick from Present") — map AI free-text (name/PZN) → real `product_id`/`batch_id` from the seller's catalogue | The hard mapping |
| **C4** | **Eval harness** for detection quality (precision/recall on "is this a deal") | Quality gate |

## Priority split
- **C1 + C2 = the priority-loop piece** ("seller detects the deal") — build first (Ayush).
- C0 / C3 / C4 = the fuller Lane C.

## Before building — the research pass to run
Read the current `sella-detect` trigger + `context.ts` + the `deal_detected` surfacing, and confirm exactly how a c2c-born detection should surface as a ticket (reusing Lane A's `deliver_deal`). Then break into very-small tickets + verify against live code — like Lane A/B.

**Honest caveat on the Ionos switch (C0):** Ionos AI Model Hub is EU-hosted + OpenAI-compatible but serves **open models (not Claude)** — switching provider also switches the *model*, so structured-output reliability + evals (C4) need re-tuning per model. The port isolates the **vendor plumbing** (endpoint/auth/model-id/output mechanism), NOT the model quality. Verify Ionos's current structured-output API before locking the port shape.
