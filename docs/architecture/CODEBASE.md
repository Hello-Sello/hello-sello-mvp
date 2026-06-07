# Hello Sello — Codebase Architecture

**Status:** Locked. This is the reference document for how the app codebase is structured,
why it is structured that way, and the engineering standards the team follows.
**Stack:** Next.js (App Router) · TypeScript · React · Supabase · Vercel · Claude on AWS Bedrock

---

## Why this structure

Hello Sello is built as a **modular monolith**. One deployable application, organized internally
by **business domain**, not by technical role.

The alternative — organizing by technical role — looks like `/controllers`, `/models`, `/views`,
`/services`. The problem: when you touch the Inbox feature, you edit four different folders at once.
A bug in connections logic could be in any of them. Finding it is archaeology.

Domain-first means: when something changes in how connections work, you open `modules/connections/`
and everything you need is there. One concept, one folder, one reason to change.

Two rules hold the whole thing together:

- **Each module speaks to others only through its `index.ts`** — the public door. No reaching into
  another module's internals. This prevents the codebase from becoming spaghetti as it grows.
- **`app/` is thin** — pages only say "I need this data" and "render these components." No business
  logic lives in a page file.

---

## Full file structure

```
src/
│
├── app/                               ZONE 1 — ROUTING
│   ├── layout.tsx                     Root HTML. Sets font, colors, global providers.
│   ├── page.tsx                       Redirects: → /onboarding if new, → /connect if returning.
│   │
│   ├── (auth)/                        No shell. Plain full-screen pages.
│   │   ├── signup/page.tsx            Sign up form.
│   │   ├── verify/page.tsx            "Check your inbox" screen.
│   │   └── signin/page.tsx            Sign in form.
│   │
│   ├── onboarding/                    No shell. Linear 9-step wizard.
│   │   ├── page.tsx                   Wizard orchestrator — manages current step, progress.
│   │   └── components/
│   │       ├── WizardShell.tsx        Step counter + progress bar + next/back navigation.
│   │       └── steps/
│   │           ├── CompanyStep.tsx    Wraps CompanySetupForm from modules/companies.
│   │           ├── GroupsStep.tsx     Wraps GroupsEditor from modules/companies.
│   │           ├── PermissionStep.tsx Wraps PermissionMatrix from modules/companies.
│   │           ├── ProfileStep.tsx    Display name, title, language, timezone.
│   │           ├── ContactsStep.tsx   Gmail/Outlook metadata import.
│   │           └── DiscoverStep.tsx   Seeded companies + first connect action.
│   │
│   ├── (shell)/                       All pages inside the 5-panel shell.
│   │   ├── layout.tsx                 Mounts TopBar + IconRail + SubNav + SellaPanel.
│   │   │                              Reads auth to inject company name, nav state.
│   │   │
│   │   ├── home/
│   │   │   ├── page.tsx               Home page. Simple surface hub.
│   │   │   └── components/
│   │   │       ├── SurfaceGrid.tsx    Grid of all surface tiles.
│   │   │       └── SurfaceTile.tsx    One tile: icon + name + description + active/coming-soon.
│   │   │
│   │   ├── connect/
│   │   │   ├── layout.tsx             Mounts Chat/Inbox sub-nav + ChatList panel.
│   │   │   ├── page.tsx               Default: empty state when no chat is selected.
│   │   │   ├── [threadId]/
│   │   │   │   └── page.tsx           A specific chat thread (P2P / C2C / Deal).
│   │   │   └── inbox/
│   │   │       ├── page.tsx           Inbox list with all lenses.
│   │   │       └── [requestId]/
│   │   │           └── page.tsx       Request detail (right panel content).
│   │   │
│   │   ├── deals/
│   │   │   └── [dealId]/
│   │   │       └── page.tsx           Deal Workspace.
│   │   │
│   │   └── relationships/
│   │       └── [relationshipId]/
│   │           └── page.tsx           Relationship page between two companies.
│   │
│   └── api/                           Server-only. Browser never runs this code.
│       ├── auth/
│       │   └── callback/route.ts      Supabase OAuth redirect handler.
│       ├── sella/
│       │   ├── detect/route.ts        Receives chat context → triggers deal detection job.
│       │   ├── draft/route.ts         Receives deal signals → triggers card drafting job.
│       │   └── summarize/route.ts     Triggers relationship/deal summary.
│       └── webhooks/
│           └── supabase/route.ts      Listens to DB events if server-side reaction needed.
│
│
├── modules/                           ZONE 2 — DOMAIN LOGIC
│   │
│   ├── companies/                     Who you are. Your team. Your rules.
│   │   ├── index.ts                   Public door. Only exports what other modules need.
│   │   ├── types.ts                   Company, Group, Permission, Member, Role, InviteStatus.
│   │   ├── queries.ts                 getCompany(), getMembers(), getGroups(), getPermissions().
│   │   ├── mutations.ts               updateCompany(), createGroup(), assignPermission().
│   │   └── components/
│   │       ├── CompanyAvatar.tsx      Company logo or initials badge. Domain-aware version.
│   │       ├── CompanySetupForm.tsx   Name + country + license upload. Used in onboarding + settings.
│   │       ├── GroupsEditor.tsx       Add/rename/delete groups. Notion-style rows.
│   │       ├── PermissionMatrix.tsx   Action × Group toggle grid. Shows who can do what.
│   │       └── MemberList.tsx         Team members, their group, their status.
│   │
│   ├── connections/                   Company ↔ company links, the inbox, and the relationship.
│   │   ├── index.ts
│   │   ├── types.ts                   Connection, Relationship, InboxRequest, RequestType,
│   │   │                              InboxLens (Unassigned/Mine/All/History).
│   │   ├── queries.ts                 getConnections(), getInboxRequests(), getRelationship(),
│   │   │                              getRelationshipNotes(), getRelationshipDeals().
│   │   ├── mutations.ts               acceptRequest(), declineRequest(), claimRequest(),
│   │   │                              saveNote(), reassignRequest().
│   │   ├── realtime.ts                Subscribe to new inbox requests landing in real time.
│   │   └── components/
│   │       ├── inbox/
│   │       │   ├── InboxList.tsx      The left master panel. Renders the active lens.
│   │       │   ├── InboxListItem.tsx  One request row: type badge, assignee avatar, preview text.
│   │       │   ├── InboxDetail.tsx    Right panel: full request card + action buttons.
│   │       │   ├── LensBar.tsx        Unassigned · Mine · All · My history tab strip.
│   │       │   ├── RequestTypeChip.tsx Colored tag: connect / +message / price-list / deal-card.
│   │       │   └── ActionBar.tsx      Accept / Decline / Claim buttons + collision cue.
│   │       └── relationship/
│   │           ├── RelationshipHeader.tsx   Two company logos joined by the bridge mark.
│   │           │                            No person names — company-to-company only.
│   │           ├── RelationshipTabs.tsx     Tab strip: Overview · Deals · Notes · Terms · Docs.
│   │           ├── OverviewTab.tsx          Activity log + a deals peek (count + last deal).
│   │           ├── DealsTab.tsx             Filterable deal list (All/Active/Old/Cancelled).
│   │           │                            Each deal row → "Open workspace" entry point.
│   │           ├── NotesTab.tsx             Two notes: team note (your side only) +
│   │           │                            personal note (you only). Side-aware.
│   │           ├── TermsPricesTab.tsx       Agreed terms (read, both sides) + standard price
│   │           │                            display (no pricelist management UI for now).
│   │           ├── DocsTab.tsx              Company-wide artifact shelf: licenses, contracts,
│   │           │                            GDP certs. Deal docs stay inside the deal.
│   │           ├── SellaInsightBox.tsx      Overview card: "what's happening / how to grow."
│   │           │                            Has a "more" button → opens dialog.
│   │           ├── SellaInsightDialog.tsx   Full relationship insight: facts + action cards.
│   │           ├── AnalyticsBox.tsx         KPI snapshot card. "More" → opens dialog.
│   │           └── AnalyticsDialog.tsx      Mini analytics page: bar charts, pie, takeaway.
│   │
│   ├── messaging/                     The chat. Threads and messages.
│   │   ├── index.ts
│   │   ├── types.ts                   ChatThread (type: c2c|p2p|deal), ChatMessage,
│   │   │                              MessageType, Actor (user|system|sella).
│   │   ├── queries.ts                 getThreads(), getMessages(), getThread().
│   │   ├── mutations.ts               sendMessage(), markRead(), voteOnDeal().
│   │   ├── realtime.ts                WebSocket subscription: new messages + deal vote updates.
│   │   │                              This is where the Supabase Realtime channel lives.
│   │   └── components/
│   │       ├── list/
│   │       │   ├── ChatList.tsx            Full left panel: new chat button + search + filter + rows.
│   │       │   ├── ChatListItem.tsx        One row: avatar, name, last message, unread dot.
│   │       │   │                           Under Companies filter: nests C2C + P2P + deal threads.
│   │       │   └── ChatListFilters.tsx     All · Unread · Companies toggle.
│   │       └── window/
│   │           ├── ChatWindow.tsx          Orchestrates header + list + composer. Manages scroll.
│   │           ├── ChatHeader.tsx          Chat name + relationship affordance link +
│   │           │                           DealCardPill (pinned when a deal is active).
│   │           ├── MessageList.tsx         Renders the message feed. Handles scroll-to-bottom.
│   │           ├── MessageBubble.tsx       A user message: bubble, sender name, timestamp.
│   │           ├── SystemMessage.tsx       actor=system. Neutral. C2C audit events:
│   │           │                           "companies are now connected", "deal started".
│   │           ├── SellaMessage.tsx        actor=sella. Sella-voiced. P2P + Deal chat:
│   │           │                           introductions, nudges, summaries.
│   │           ├── DealDetectionCard.tsx   Sella's prompt: "I noticed a deal forming.
│   │           │                           Want me to start drafting it?" With Yes / No.
│   │           ├── ConfirmationGate.tsx    Two-party waiting state: "You ✓ / them ⏳".
│   │           │                           Shown while the other party has not voted yet.
│   │           └── ChatComposer.tsx        Message input + send + attachment + deal actions.
│   │
│   ├── deals/                         Deal card, workspace, lifecycle, things.
│   │   ├── index.ts
│   │   ├── types.ts                   Deal, DealCard, DealCardLog, DealLineItem,
│   │   │                              DealThing, DealStatus, DealConfirmation, DocType.
│   │   ├── queries.ts                 getDeal(), getDealCard(), getDealThings(),
│   │   │                              getDealCardLog(), getDealMembers().
│   │   ├── mutations.ts               updateDealCard(), completeThing(), signThing(),
│   │   │                              confirmDeal(), attachDocument().
│   │   ├── realtime.ts                Deal card version updates + thing status changes.
│   │   └── components/
│   │       ├── card/                  The flip card. Appears in inbox, chat, and workspace.
│   │       │   │                      Same component everywhere — user learns it once.
│   │       │   ├── DealCard.tsx       Orchestrator: mounts FlipCard from shared/ui,
│   │       │   │                      injects front + back, handles open/close.
│   │       │   ├── DealCardFront.tsx  Facts: HS number, parties, value, status, line items.
│   │       │   │                      Seller sees margin. Buyer sees buyer metric. Role-aware.
│   │       │   ├── DealCardBack.tsx   Filter bar (Signals | Logs) that swaps the back view.
│   │       │   │                      Extensible: new back-views slot in as new tabs later.
│   │       │   ├── DealCardPill.tsx   Thin pinned row in chat: "Deal card ▸ HS-001 / €12,400".
│   │       │   │                      Click → opens full DealCard dialog.
│   │       │   └── DealCardLog.tsx    Version history rows: v1→v2, what changed, who, why.
│   │       └── workspace/
│   │           ├── WorkspaceHeader.tsx      Deal title + HS number + both parties +
│   │           │                            deal owner + net value + LifecyclePill.
│   │           ├── WorkspaceSellaBar.tsx    One-line shrunk Sella in workspace header.
│   │           ├── WorkspaceLeftPanel.tsx   Tab switcher: Things · People · Documents.
│   │           ├── ThingsTab.tsx            Renders thing groups. Domain-level progress.
│   │           ├── ThingGroup.tsx           One domain group (Finance / Logistics / Delivery)
│   │           │                            with done count + progress bar.
│   │           ├── ThingItem.tsx            One task row: name + assignee + Open/Done toggle.
│   │           │                            Approval things show e-sign gate instead of toggle.
│   │           ├── PeopleTab.tsx            Deal member list + deal owner marker.
│   │           ├── MemberRow.tsx            Person + role + "(you)" marker + owner crown.
│   │           └── DocumentsTab.tsx         Deal-specific docs: COA, badge, invoice,
│   │                                        delivery note. Done = note + invoice both attached.
│   │
│   ├── catalog/                       Product data + standard price. No management UI.
│   │   ├── index.ts
│   │   ├── types.ts                   Product, CatalogItem, UnitOfMeasure.
│   │   ├── queries.ts                 getProduct(), getCatalogItems(), getProductPrice().
│   │   └── mutations.ts               Minimal. Price update if seller changes it directly.
│   │
│   └── sella/                         AI jobs. Leaf module — nothing depends on it.
│       ├── index.ts
│       ├── types.ts                   SellaJob, SellaJobType, SellaResult, SellaContext.
│       ├── client.ts                  Bedrock/Claude wrapper. Provider-agnostic interface.
│       │                              If provider changes, only this file changes.
│       ├── jobs/
│       │   ├── detect-deal.ts         Reads chat context. Returns deal signals if found.
│       │   │                          Threshold: product + quantity OR product + price.
│       │   ├── draft-card.ts          Takes signals. Returns a filled DealCard draft.
│       │   │                          Suggests only — never sends on its own.
│       │   └── summarize.ts           Relationship summary + deal summary for insight box.
│       └── components/
│           ├── SellaPanel.tsx         The full right rail. Context, actions, history.
│           ├── SellaBar.tsx           Shrunk one-line version for the workspace header.
│           └── SellaInsightBox.tsx    Used inside the relationship page. Fetches via summarize.
│
│
└── shared/                            ZONE 3 — CROSS-CUTTING
    │
    ├── auth/                          Who is here. Which company are they in.
    │   ├── index.ts
    │   ├── types.ts                   User, Session, CompanyContext.
    │   ├── client.ts                  Sign-in, sign-out, session refresh, password reset.
    │   └── hooks/
    │       ├── useAuth.ts             Current user. Every protected component uses this.
    │       └── useCurrentCompany.ts   Active company context. Every Supabase query filters
    │                                  by company_id — this hook provides it.
    │
    ├── audit/                         Permanent record of every change.
    │   ├── index.ts
    │   ├── types.ts                   AuditEvent, AuditEventType, AuditActor.
    │   └── logger.ts                  logEvent(type, payload). Called inside mutations,
    │                                  not inside components. Components do not know audit exists.
    │
    ├── db/                            The connection to Supabase.
    │   ├── index.ts
    │   ├── client.ts                  Two clients: browser (anon key) + server (service role).
    │   │                              Each module imports from here — never creates its own client.
    │   └── types.ts                   Auto-generated from Supabase CLI. Reflects exact DB shape.
    │                                  Regenerate after every schema migration.
    │
    ├── ui/
    │   ├── index.ts
    │   ├── primitives/                Design-system atoms. No business knowledge.
    │   │   ├── Button.tsx             Variants: primary, secondary, ghost, destructive.
    │   │   ├── Input.tsx              Text input with label, error state, helper text.
    │   │   ├── Textarea.tsx           Multi-line. Auto-resize option.
    │   │   ├── Select.tsx             Dropdown. Accessible.
    │   │   ├── Checkbox.tsx           With label.
    │   │   ├── Toggle.tsx             On/off switch.
    │   │   ├── Avatar.tsx             Image or initials fallback. Sizes: sm/md/lg.
    │   │   ├── Badge.tsx              Small colored label. Neutral/success/warning/error.
    │   │   ├── Spinner.tsx            Loading indicator.
    │   │   └── Skeleton.tsx           Loading placeholder shape.
    │   ├── layout/                    Shell structure primitives.
    │   │   ├── TopBar.tsx             Full-width top bar slot. Content injected by shell layout.
    │   │   ├── IconRail.tsx           Thin icon column. Renders nav items passed to it.
    │   │   ├── SubNav.tsx             Second column: tab-style sub-navigation.
    │   │   └── Panel.tsx              Generic resizable panel slot. Used for list + main areas.
    │   └── molecules/                 Composed from primitives. Still no domain knowledge.
    │       ├── Modal.tsx              Full-screen overlay container.
    │       ├── Dialog.tsx             Blurred-backdrop centered dialog. Used for Sella insight,
    │       │                          analytics, and deal card — all follow the same pattern.
    │       ├── Tabs.tsx               Generic tab strip + tab panel.
    │       ├── FlipCard.tsx           The 3D flip mechanism: front slot + back slot + flip control.
    │       │                          DealCard uses this. FlipCard knows nothing about deals.
    │       ├── CompanyBadge.tsx       Company logo or initials + optional name label.
    │       │                          Purely visual. Used everywhere a company must appear.
    │       ├── LifecyclePill.tsx      Colored status pill: Draft / Confirmed / Done.
    │       └── EmptyState.tsx         Generic slot for "nothing here yet" screens.
    │
    ├── types/
    │   └── index.ts                   Utility types: ID, Timestamp, Pagination,
    │                                  SortDirection, ApiResponse. Shared by all modules.
    │
    └── utils/
        ├── cn.ts                      Tailwind className merge. Every component uses this.
        ├── format.ts                  formatDate(), formatCurrency(), formatNumber(),
        │                              formatRelativeTime() ("2 hours ago").
        └── id.ts                      ID generation and validation helpers.
```

Outside `src/`:

```
supabase/
├── migrations/       SQL files. One file per schema change. Never edit by hand.
├── policies/         RLS (Row Level Security). Database-level enforcement of company isolation.
└── seed/             Sample data for local development.

middleware.ts         Next.js route guard. Reads auth state, redirects if not signed in.
                      Runs before every page — this is how /connect stays protected.
next.config.ts        Next.js config: image domains, env vars, redirect rules.
tsconfig.json         TypeScript config. Path alias: "@/*" = "src/*".
.env.local            Supabase URL + anon key + Bedrock credentials. Never committed to git.
```

---

## Zone reasoning

**Zone 1 - `app/`** answers one question: what URL shows what? Nothing else. Every page file should
be small — it asks a module for data, passes it to a component, and renders. Route groups `(auth)`
and `(shell)` are invisible in the URL — they only control which layout wraps a page. Adding a new
surface later means adding one folder here. The whole route map is visible at a glance.

**Zone 2 - `modules/`** is where the product lives. Each folder equals one business concept, one
reason to change. The internal pattern is consistent across every module: `types → queries →
mutations → components → index.ts`. That consistency means you always know where to look. The
`index.ts` rule is the discipline that makes this hold up over time — it is what separates a
modular monolith from a tangled monolith.

**Zone 3 - `shared/`** holds things no single module owns but every module needs: auth, the
database client, the design system, formatting helpers. The key constraint: nothing in `shared/`
can import from `modules/`. The dependency flows in one direction — modules depend on shared,
never the reverse.

---

## The one rule

```
modules/messaging/components/ChatWindow.tsx
  can import → modules/deals/index.ts                    ✅  through the door
  cannot import → modules/deals/components/DealCard.tsx  ❌  bypasses the door
  cannot import → modules/deals/queries.ts               ❌  bypasses the door
```

This rule is what keeps the architecture honest as the codebase grows. A lint rule
(`eslint-plugin-import` or a custom rule) can enforce it automatically so it does not depend
on discipline alone.

---

## TypeScript standards

These conventions apply across every file in the codebase.

### Naming

| Thing | Convention | Example |
|---|---|---|
| Types and interfaces | PascalCase | `DealCard`, `ChatMessage` |
| React components | PascalCase | `DealCardFront`, `ChatComposer` |
| Functions and hooks | camelCase | `getDealCard()`, `useDealCard()` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_FILE_SIZE_MB`, `DEAL_STATUS` |
| Files: components | PascalCase | `DealCard.tsx` |
| Files: logic | camelCase | `queries.ts`, `detect-deal.ts` |

### Types vs interfaces

Use `interface` for objects that represent domain entities — they are extendable and clearly
communicate "this is a shape":

```ts
interface DealCard {
  id: string
  status: DealStatus
  valueNet: number
  lineItems: DealLineItem[]
}
```

Use `type` for unions, computed types, and anything that cannot be expressed as an interface:

```ts
type DealStatus = 'draft' | 'confirmed' | 'done'
type DealCardOrNull = DealCard | null
```

### No `any`

`any` turns off TypeScript. Never use it. If a type is truly unknown (external API response,
Supabase webhook payload), use `unknown` and narrow it before use:

```ts
// Wrong
function handleWebhook(payload: any) { ... }

// Right
function handleWebhook(payload: unknown) {
  if (!isValidWebhookPayload(payload)) throw new Error('Invalid payload')
  // payload is now narrowed
}
```

### Exports

Use named exports everywhere. Default exports make refactoring harder and searching the codebase
for a component name less reliable:

```ts
// Wrong
export default function DealCard() { ... }

// Right
export function DealCard() { ... }
```

The only exception: Next.js page files require a default export. Keep it as a thin wrapper:

```ts
// app/(shell)/deals/[dealId]/page.tsx
import { DealWorkspacePage } from '@/modules/deals'
export default DealWorkspacePage
```

### Explicit return types on public functions

Public functions in `queries.ts`, `mutations.ts`, and `index.ts` must have explicit return types.
This makes the module contract visible and catches mistakes at the call site:

```ts
// queries.ts
export async function getDealCard(dealId: string): Promise<DealCard | null> { ... }

// mutations.ts
export async function confirmDeal(dealId: string): Promise<{ success: boolean; error?: string }> { ... }
```

Internal helpers inside a component file can rely on inference.

### Input validation at boundaries

User input and external data (form submissions, API responses, webhook payloads) must be validated
at the boundary before entering the system. Use Zod:

```ts
import { z } from 'zod'

const SendMessageSchema = z.object({
  threadId: z.string().uuid(),
  body: z.string().min(1).max(4000),
})

export async function sendMessage(input: unknown) {
  const parsed = SendMessageSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid input' }
  // parsed.data is now safe to use
}
```

Data coming from Supabase (via the generated types in `shared/db/types.ts`) does not need Zod —
the types are already enforced by the schema.

---

## Testing approach (pragmatic TDD)

This is an MVP with a tight deadline. The goal is not 100% coverage. The goal is: **the core deal
loop must not break silently, and errors must surface clearly**.

### What to test

**1. Business logic and state machines** — these are the highest-value tests. The deal lifecycle
(`draft → confirmed → done`), the two-party confirmation gate, and the deal card version increment
are the core behaviors that, if broken, break the whole product:

```
modules/deals/
  mutations.test.ts   → confirmDeal() moves status correctly
                      → signThing() requires both parties
                      → attachDocument() triggers Done when both docs present
  
modules/connections/
  mutations.test.ts   → acceptRequest() creates relationship + C2C thread
                      → declineRequest() only logs, does not notify sender
```

**2. Module public interfaces** — test what `index.ts` exports. If the public contract holds,
internal refactors are safe:

```
modules/messaging/index.test.ts  → sendMessage() returns the saved message
                                 → getThreads() returns only threads for this company
```

**3. Utility functions** — pure functions are cheap to test and often hide edge cases:

```
shared/utils/format.test.ts  → formatCurrency(1234.5, 'CAD') = 'CA$1,234.50'
                             → formatRelativeTime(2 hours ago)
```

**4. Sella jobs** — mock the Bedrock client, test that the job returns the right shape:

```
modules/sella/jobs/detect-deal.test.ts  → returns null when no product mentioned
                                        → returns DealSignal when product + price found
```

### What NOT to test in MVP

- Every UI component (Vitest + React Testing Library is slow to set up, save for post-launch)
- Supabase queries in isolation (they are tested implicitly by the integration tests)
- The shell layout and nav (visual, low risk of silent breakage)

### One E2E test — the core deal loop

One Playwright test that walks the full flow. If this passes, the product works:

```
tests/core-deal-loop.spec.ts

1. Company A signs up and connects to Company B
2. They start a P2P chat
3. A message triggers Sella's deal detection
4. Both parties confirm
5. Deal Workspace opens
6. Things completed, delivery note + invoice attached
7. Deal moves to Done
```

This test is slow but it is the safety net for everything. Run it before every deploy.

### Test file location

Tests live next to the code they test:

```
modules/deals/mutations.ts
modules/deals/mutations.test.ts     ← same folder, same name + .test
```

E2E tests live at the project root:

```
tests/
└── core-deal-loop.spec.ts
```

### Tooling

- **Vitest** for unit + integration tests (fast, zero config with Next.js)
- **Playwright** for the one E2E test
- Run `vitest` in watch mode during development
- Run the E2E test in CI before any deploy to Vercel

---

## Error handling

Errors fall into three categories. Treat them differently.

**1. Programmer errors** — wrong input to a function, impossible state, a contract violation.
These should throw immediately. Do not swallow them:

```ts
function getOtherParty(deal: Deal, myCompanyId: string): Company {
  const other = deal.parties.find(p => p.id !== myCompanyId)
  if (!other) throw new Error(`Deal ${deal.id} has no counterparty for ${myCompanyId}`)
  return other
}
```

**2. User / domain errors** — expected failures like "this request has already been claimed" or
"deal card version conflict." Return a typed result, not an exception. The caller decides what to
show:

```ts
type MutationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: string }

export async function claimRequest(requestId: string): Promise<MutationResult<InboxRequest>> {
  const existing = await getRequest(requestId)
  if (existing.assignedTo) {
    return { success: false, error: 'Already claimed', code: 'ALREADY_CLAIMED' }
  }
  // ... proceed
}
```

**3. Infrastructure errors** — Supabase is slow, Bedrock times out, the network drops. Wrap these
in try/catch at the mutation level. Log them. Return a generic user-facing message. Never expose
internal details to the client:

```ts
export async function sendMessage(input: SendMessageInput): Promise<MutationResult<ChatMessage>> {
  try {
    const { data, error } = await db.from('chat_messages').insert(input).select().single()
    if (error) throw error
    await logEvent('message.sent', { messageId: data.id })
    return { success: true, data }
  } catch (err) {
    console.error('[messaging] sendMessage failed', err)
    return { success: false, error: 'Could not send message', code: 'SEND_FAILED' }
  }
}
```

**React Error Boundaries** — wrap the three main content areas (ChatWindow, DealWorkspace,
RelationshipPage) in Error Boundaries. If one section crashes, the shell stays alive and the
user can navigate away:

```ts
// app/(shell)/layout.tsx
<ErrorBoundary fallback={<SectionError />}>
  {children}
</ErrorBoundary>
```

**Sella errors are always silent to the user** — if deal detection or card drafting fails, the
chat continues normally. Sella is a leaf. Its errors must never surface as a broken page:

```ts
// In the detect job
try {
  const result = await detectDeal(context)
  return result
} catch (err) {
  console.error('[sella] detect-deal failed', err)
  return null  // caller treats null as "no deal detected"
}
```

---

*Last updated: 2026-06-07. Locked alongside the Connect demo architecture.*
