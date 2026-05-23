# Sella

## One-sentence definition

The cross-cutting AI agent present inside every surface (not a sibling surface). Helps users in context-aware ways - suggesting replies on Connect, writing product descriptions on Present, evaluating offers on Buy, etc.

## Status

- Depth: stub
- Last updated: 2026-05-23
- Eventual depth: cross-cutting overview + per-surface touchpoints map

## How this file relates to LAYER-4

Sella's full behavior rules, multi-Sella architecture, voice, tone, capabilities, and constraints live in `../layers/LAYER-4-SELLA-BEHAVIOR.md`. **This file is NOT a duplicate.** It is the per-surface touchpoints map - where Sella appears in each surface and what she does there.

## Per-surface touchpoints

| Surface | Sella's role here | LAYER-4 reference |
|---|---|---|
| Connect | Suggest replies; extract deal signals from chat; draft confirmations; pre-fill Deal Cards from incoming emails | LAYER-4 §3 (Deal-Sella structural neutrality), §5 (Connect routing) |
| Present | Help write product descriptions; suggest pricing; generate Deal Room content | LAYER-4 §5 (Present routing) |
| Buy | Buyer-Sella - help evaluate offers; compare suppliers; draft purchase decisions | LAYER-4 (Buyer-Sella variant) |
| Sell | Seller-Sella - help draft offers; suggest pricing; summarize buyer signals | LAYER-4 (Seller-Sella variant) |
| Discover | Relevance ranking; surface "X companies already have you in their records" smart suggestions on signup | LAYER-4 §5 (Discover routing) |
| Grow | Analytics-aware summarization; anomaly detection; growth recommendations | LAYER-4 §5 (Grow routing) |

(All "to be filled" - this table is the stub. Each row will be detailed when the corresponding surface is sketched.)

## Foundation Sella uses

- **User identity** - knows who is viewing (buyer vs seller affects Buyer-Sella vs Seller-Sella vs neutral Deal-Sella).
- **Brand context** - knows which brand/company the user belongs to.
- **Cross-surface event stream** - knows what's happened across the user's surfaces (e.g., a Connect chat that ended with "let's draft a PO" can trigger Sella to pre-fill the Sell-side offer).
- **Permissions** - never accesses counterparty internal data; learns within one company only.

## Sella as a Big 7 pillar (NOT a navigation surface)

Sella is the 7th pillar in the Big 7 framework, but she is NOT a sidebar/navigation item. She lives in the right-side panel across all surfaces. The Big 7 framing is conceptual (value pillars), not navigation. See DECISIONS.md "Layer 2 - Surfaces" section for the lock.

## Open questions

- Personal Sella vs Seller-Sella vs Buyer-Sella behavioral overlap (open in DECISIONS.md, drilled in LAYER-4 §4/§5).
- How Deal-Sella infers viewer role (buyer vs seller) for post-MVP SIGNALS personalization - deferred per DEV-50 lock.

## References to LAYER docs

- `../layers/LAYER-4-SELLA-BEHAVIOR.md` - **FULL behavior reference** (IN PROGRESS)
- `../layers/LAYER-1-USERS-AND-CORE-OBJECTS.md` §10 (multi-Sella architecture)
- `../layers/LAYER-1-USERS-AND-CORE-OBJECTS.md` §10.2 (Deal-Sella structural neutrality)
- `../layers/LAYER-3-DEAL-EXECUTION.md` (where Sella participates in the deal lifecycle)
