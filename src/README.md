# App structure - modular monolith (reference skeleton)

> **This is a structure reference, not the live app.** These folders are an empty skeleton so the team can see and agree the shape. The actual implementation is built in the **[HelloSello_MVP](https://github.com/HelloSello/HelloSello_MVP)** repo, following this exact layout.
> Decision: [`docs/decisions/DECISIONS.md`](../docs/decisions/DECISIONS.md) (2026-06-04). Demo slice: [`docs/architecture/connect-demo.md`](../docs/architecture/connect-demo.md).

Modular monolith, partitioned **by domain** (not by technical layer). One deployable: Next.js (App Router, TypeScript) on Vercel + Supabase (Postgres / Auth / Realtime / Storage), multi-tenant via RLS. Sella inference on Claude via AWS Bedrock (EU / Frankfurt).

## The tree

```
src/
├── app/                routing only - thin pages: (auth)/, connect/, inbox/, deals/[id]/, catalog/ ...
├── modules/            domain modules - the heart
│   ├── companies/      company profiles, membership, roles
│   ├── connections/    company <-> company connect requests + accepted links
│   ├── messaging/      1:1 chats, deal chat, threads + messages
│   ├── deals/          Deal Card, versions, lifecycle (Draft -> Confirmed -> Done), Deal Workspace
│   ├── catalog/        shop / Present, pricelists (Phase 2)
│   └── sella/          AI jobs - detect deal, draft card, summarize (Deal-Sella + the family)
└── shared/             cross-cutting - used by everything
    ├── auth/           identity & access (sign-in, company scoping)
    ├── audit/          append-only record of every change, incl. Sella's
    ├── db/             Supabase client, query helpers
    ├── ui/             shared components, design tokens
    ├── utils/          helpers
    └── types/          shared types
supabase/
├── migrations/         schema migrations
├── policies/           RLS (Row-Level Security) policies - tenant isolation by company_id
└── seed/               seed data
```

## The one rule

A module talks to another **only through its public `index.ts`** - never reach into another module's internals. Surfaces (Connect / Present / Buy / Sell / Discover / Grow) are **routes in `app/`** that compose modules; a new surface = a new route + reuse of existing modules. Auth and audit are cross-cutting (`shared/`), not domain modules.

## June 11 demo slice

The Connect demo touches: `shared/auth` (Identity), `modules/connections`, `modules/messaging`, `modules/deals` (Deal Workspace), `modules/sella` (Deal-Sella), `shared/audit`. Deferred: `modules/catalog` (Present + pricelists, Phase 2).
Full picture and diagrams: [`docs/architecture/connect-demo.md`](../docs/architecture/connect-demo.md).
