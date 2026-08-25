# Engineering Architecture Notes

Running scratchpad of engineering implications surfaced as Layer-doc decisions get locked. **Not** the formal architecture doc — this is the precursor that keeps the implications visible session-to-session. Each entry: one self-contained sentence + source.

When the formal Architecture doc is written (post Layer 4 + 5), these become its input.

**See also:** [`SCHEMA-DRAFT.md`](./SCHEMA-DRAFT.md) — living draft of proposed table schemas; updated alongside each prototype phase.

---

## Core entities

- Basket and Deal Card are the **same DB record** with a lifecycle state field (cart-style → Pokémon-card-style), not two tables. *(DEV-22.)*
- Deal Room is its **own persistent record per Basket**, with product-media references reused across rooms and an optional off-platform temporary share link. *(DEV-22 + DEV-52.)*
- Deal Workspace is a **separate container record** spawned at Deal Card birth, holding chat thread / artifacts / members / stages / the card itself. *(Layer 1 §4.3.)*
- **Deal Workspace UI (screen ④, resolves DEV-9):** Layer-B invited-only container, reached from the Relationship page deals list or a **⤢ button on the Deal Card**. Layout = header + one-line Deal-Sella, a **tabbed left panel** (Things · People · Documents), and the **Deal Chat as the wide hero**. The Deal Card is the **canonical flip card** shown as a pinned `Deal card ▸` pill in the chat (same as ②) - not a workspace-special box. **Change history is read from the card's LOGS (`deal_card_log`), never echoed as chat messages** (one source of truth). **THINGS are the only visible work primitive, grouped by the 5-step deal `stage` pipeline shown across the workspace top** *(corrected session 9: the prototype's "by domain / stages non-UI" was a name-mismatch superseded by the PRD — stages ARE the visible grouping; `domain` dropped).* Done = `artifact` rows for delivery_note + invoice present (document-driven). Deal-level `artifact` rows only (company-wide docs live on the relationship page). **Deal Room is out of Connect ④** (it's a Present-surface presentation tool, distinct from the execution container). *(screen ④, 2026-06-07; see `prototypes/deal-workspace-prototype/CONTEXT.md`.)*
- **Deal Workspace tables (screen ④ schema, 2026-06-07 session 8):** `deal_workspace` is a separate container table (**permanent 1:1 with `deal_card`** — corrected session 9; DEV-37 is chat-organization, not multi-deal-per-workspace) — NOT columns on `deal_card`. Container concerns (owner, visibility, members, things, deal artifacts) isolated from the cross-company versioned agreement. The 1:1-with-card lifespan is intentional — same shape as `relationship` 1:1 with `chat_thread(c2c)`: same lifecycle ≠ same meaning. Companion tables: `deal_member` (junction with owner/side_lead/member roles — each side controls own-side member adds), `thing` (single-table Asana subtype pattern with type=task/approval/document_upload + linked FKs to `deal_confirmation` and `deal_artifact`), `deal_artifact` (9-category lookup including EU regulatory: phytosanitary_cert, certificate_of_origin, packing_list, proforma_invoice). *(2026-06-07 session 8; see `SCHEMA-DRAFT.md` Phase 2 + DECISIONS.md 2026-06-07 session 8.)*
- **Deal ownership = `deal_member.role='owner'`; two owners (one per side); per-side DB enforcement DEFERRED (known issue).** The single `deal_workspace.owner_person_id` + `uq_deal_member_one_owner` were dropped (3b) because a deal has one owner per company side. Two-owner birth is now live: `create_deal_draft` takes a nullable `p_counterparty_person_id` and inserts the co-owner, validated to be on the other side (Sella 4b, 2026-06-12; verified). **Deferred (harmless today - one person/owner per company):** the DB does not yet enforce (a) **≥1 owner per deal** (a partial-failure zero-owner is already prevented by the RPC's single transaction, but a future non-RPC path isn't), (b) **≤1 owner per side**, (c) **≤1 `side_lead` per side** (its index `uq_deal_member_one_side_lead` is wrongly one-per-*deal*). Chosen fix when built: **stamp `company_id` on `deal_member`** so a partial unique index CAN reach the side (resolves Muskan's 3b "a partial index can't reach `person.company_id`" note), then two partial unique indexes (owner-per-side, side_lead-per-side) + a **deferred constraint trigger** for the ≥1-owner floor; the RPC sets `company_id`. Also: the manual `createDeal` only knows the counterparty *company*, not a *person* - the entry points (shop visit / P2P chat = auto; own-shop `+` = dropdown; company-send = assigned on inbox pickup) supply the person, but that threading + this enforcement fold into the **5A** deal-flow / create-entry-point rebuild. *(Sella 4b discussion, 2026-06-12.)*
- **Phase 2 schema review against the PRD (2026-06-07 session 9).** Five reconciliations, PRD (`docs/PRD/`) = source of truth: (1) **`thing` groups by `stage`, not `domain`** — dropped `domain` col + `thing_domain` lookup, `stage_code` now NOT NULL; `deal_stage` seeds = `negotiation`/`compliance_quality`/`agreement`/`payment`/`fulfilment_delivery` (status flips Draft→Confirmed at stage 3). (2) **Stages are a visible UI element** (pipeline across the workspace top) — supersedes DEV-24/34 "scaffolding only". (3) **Workspace + deal chat born at Draft** (O6) — negotiation lives in the deal chat pre-confirmation; corrected the stale `deal_card.thread_id` "at confirm" note. (4) **DEV-37 = chat-organization, not workspace structure** — workspace↔deal is a permanent 1:1. (5) **Log everything from day one** — comprehensive audit logging is a first-build requirement (every business-table write → `audit_log`), full verb vocabulary seeded up front; a missed event is unrecoverable, an over-logged one is filterable by `category`. Deal visibility (chat + things + artifacts) moves in lockstep with the one `workspace_visibility` flag. *(See DECISIONS.md 2026-06-07 session 9 + SCHEMA-DRAFT.md.)*
- The Relationship is **created at first P↔C pickup**; pre-pickup activity (docs, messages) lives in a temporary per-company pending inbox that migrates onto the Relationship on creation. *(DEV-7, DEV-8.)*
- A confirmed deal carries **three IDs + a QR code**: Buyer's PO # (buyer field), Seller's SO # (seller field), and a Hello Sello Deal Number (auto-generated, pattern `HS-AAA##-BBB##-NNNNNNNN`) encoded in a QR. Order form is XML-readable for ERP / accounting / logistics. Short-code derivation rule TBD at build phase. *(DEV-26.)*
- Deal birth is **directional**: OFFER (seller-initiated, sales order) or ORDER (buyer-initiated, purchase order); both need the other party's approval to confirm. *(DEV-26.)*
- `deal_card` carries a **`doc_type` discriminator** (`purchase_order` | `sales_order`) — the two card types (PO card / SO card) from ONE entity, keyed on who authored it; `margin` is **seller-scoped via RLS** (the buyer's app never receives the value — role-based, enforced at the data layer, not a UI hide). *(2026-06-06.)*
- `deal_line_item` (products: name, cultivar, volume, unit_price, pzn) powers the Deal card's product line-item list. *(2026-06-06.)*
- `deal_card_version` = **git-style version history** of the Deal card. *(2026-06-06.)*
- `order` carries **PO# (buyer) / SO# (seller) / Hello-Sello deal number / QR**, generated at confirmation. *(2026-06-06; aligns with the three-IDs + QR lock above, DEV-26.)*
- `relationship` is created at **accept** (a person accepts an inbound connection request — **pickup is ownership-only now**, not the creation trigger); `pending_inbox_item` carries the **4 request types + assignee + status**. *(2026-06-06; reworded 2026-06-07 "pickup → accept" per Muskan's flag, under the new 3-type chat model.)*
- **Accepting an inbound request when the two companies already have an active `relationship` must reuse it, not create a second one** — `acceptInbox` dedupes by `inbox_item_id` while `uq_relationship_pair_active` enforces one active relationship per company-pair, so a request from an already-connected company (now reachable since F5 lets connected buyers send `pricelist_request`) violates the constraint; the accept rollout needs a per-pair branch (reuse-and-open vs create-and-connect). *(Phase 5 UAT, 2026-06-17; DEV-83.)*
- **Relationship page = a per-viewer projection over one `relationship`.** Reached from a P2P or C2C chat (one page, two doors; **no person-level page** — DEV-8 sub-q = none). Relationship-level content only (header, Sella insight, analytics, log, notes, terms, pricelist, artifacts); deal-level stays on the deal card / in the deal (**"two altitudes"**). Proposed tables: `note { relationship_id, side(supplier|buyer), scope(team|personal), author_id, body }` (per-side team note + per-user personal note, both kept), `agreed_term`, `pricelist_item { …, status(applied|proposed) }` (seller-write, sign-off gated), `artifact` (company-wide docs only — deal docs stay on the deal), relationship-level `signal` (live-computed). Visibility driven by `note.side` / `note.scope` / `deal.private`. **No `Relationship`/`Deals` sub-nav tabs** (supersedes DECISIONS.md:518). *(screen ③, 2026-06-07; see `prototypes/relationship-prototype/CONTEXT.md`.)*
- **Person↔person social graph = a SECOND, independent relationship graph** beside the company `relationship` graph — modelled on LinkedIn. A `person_connection` edge table (canonical `person_a < person_b`, one-active-per-pair, RLS = you're one of the two people) + `is_person_connected()` + a `person_select` branch for visibility. **Pure social:** a person connection grants **visibility + a company-less p2p DM only** — deals/pricing/shops stay company-scoped and untouched. The DM is a `chat_thread` with **`relationship_id = NULL`** (reuses the group-chat company-less pattern; p2p RLS already keys on the two person slots, so no relationship is needed), and `pending_inbox_item` gained a **person target** (`receiver_person_id` + a `connect_person` type; `receiver_company_id` made **nullable** + per-type CHECKs so a person request carries no company target and never leaks to the target's colleagues). `accept_person_connection` mints the edge + the DM thread but **never a company `relationship` and never runs `planRollout`**. Laddering a person connection up into a company relationship (for commerce) is a deliberate follow-up. *(Discover Lane B, 2026-07-24; see `docs/muskan-build/discover-linkedin.md`.)*

## Frontend / app shell

- **Stack: Next.js 16 (App Router) + React 19 + Tailwind v4 + lucide-react**, TypeScript; modular-monolith `src/` (routes in `app/`, domain in `modules/`, cross-cutting in `shared/`). *(Task 1A, 2026-06-07.)*
- **Design tokens live in `src/app/globals.css` `@theme`** as CSS variables (Tailwind v4 has no JS config): pink/white palette + glass recipe; dark mode later = one extra `:root` block, not a rewrite. *(Task 1A.)*
- **App shell is root-layout-composed** (`shared/ui/AppShell`): a light glass icon rail (`IconRail`, reads the route via `usePathname` to highlight the active surface + holds the avatar account menu) + a glass top bar; every route inherits it. Stub page per surface, `/` → `/connect`. *(Task 1A.)*
- **Auth boundary (1b, 2026-06-07 session 15).** `AppShell` is now a client component too: it reads `usePathname` and renders **bare (no rail/top-bar) on `/login` + `/signup`** (`BARE_ROUTES`). The **Next-16 `proxy.ts`** (`shared/db/proxy.ts#updateSession`) gates **every** route — `getClaims()` refresh, signed-out → `/login`, signed-in away from auth routes. **Every new route is auth-gated by default**; adding a public one means updating the proxy + `BARE_ROUTES`. Signup → `/onboarding` (company-less, Path-B). Auth screens use the **light** system (theme conflict resolved → DECISIONS.md session 15). This is the F5-deferred session-refresh proxy, now live. *(1b; see `docs/muskan-build/1b-auth-screens.md`.)*
- **UI is built mock-first, shaped to Muskan's generated types** (`src/types/database.types.ts`) so mock→real Supabase is a swap, not a rewrite; data integration still needs **F5** (`shared/db` / `shared/auth` / `audit_log` helper) + the **messaging `index.ts`** contract. *(Task 1A.)*

## Permissions / RBAC

- The platform fixes **one role only — Superadmin** (per company, at least one, transferable); every other role is a **company-defined custom Group**. *(DEV-40.)*
- Groups are **many-to-many with persons**; effective permissions = union of group permissions. *(DEV-40.)*
- The permission matrix is **Action × Group**, set per company at registration via green/red drag-drop UI. *(DEV-40.)*
- The **approval workflow primitive** (Proposed → Approver sign-off → Applied) gates sensitive actions; first user is pricelist edits; single-approver for MVP. *(DEV-41.)*
- The **change-log primitive** (content_type / content_id / user / timestamp / before-after diff) records every edit and delete on supported entities. *(DEV-41.)*
- Approval-type Things capture **person + 2FA-authenticated login + name/email/account + acceptance + timestamp** as a legally binding e-signature record (DocuSign-in-a-nutshell); no third-party integration. *(DEV-29.)*

## Audit & immutability

- **Universal `audit_log` table** captures all auditable business actions across the platform. Polymorphic content reference (`content_type` + `content_id`) — single table covers companies, persons, pricelists, deals, permissions, e-signatures, Sella actions. JSONB `before_diff` / `after_diff` for change snapshots (diffs only, not full row snapshots). Complementary to Supabase `auth.audit_log_entries` (which covers auth events — login, signup, MFA — and is auto-populated by Supabase); UNION-for-queries pattern when cross-cutting needed. *(Locked 2026-05-25, full design in SCHEMA-DRAFT §A4.)*

- **Dual-identity actor model.** `actor_person_id` + `actor_type` (user/hs_team/sella/system/webhook) + `on_behalf_of_person_id` (triggering human when actor is agent/system). Captures both who executed and who caused — industry standard for AI agent audit per AWS CloudTrail `onBehalfOf`, Microsoft Entra Agent ID, LoginRadius/Scalekit guidance. *(Locked 2026-05-25.)*

- **Tamper-evidence via SHA-256 hash chain from day 1.** Columns `sequence_number` + `prev_entry_hash` + `entry_hash` + `hmac_schema_version`. Each row hashes its canonical bytes + the previous row's hash; any modification breaks the chain. Chosen over deferral to DEV-29 because SOC 2 is on the roadmap (SOC 2 2026 TSC CC7.3 requires tamper-evident logging with real-time integrity verification) and hash backfill is awkward. *(Locked 2026-05-25.)*

- **Immutability enforcement = triggers + role revoke (defense in depth).** Postgres BEFORE UPDATE / BEFORE DELETE triggers raise exception. Dedicated `app_writer` role granted INSERT/SELECT only; UPDATE/DELETE/TRUNCATE revoked. Bypass for legitimate GDPR scrub via SECURITY DEFINER function, EXECUTE restricted to HS team role. *(Locked 2026-05-25.)*

- **Compensating event pattern for undo.** Reversal is a NEW audit_log row with `reverses_audit_id` pointing back to original. Original row never modified (consistent with immutability — event sourcing + Saga pattern). Reversibility tier column on `audit_action_type` (nullable VARCHAR(15)) — taxonomy + per-action assignments deferred until Layer 1 §10 multi-Sella architecture + Layer 4 §4 autonomy ladder + DEV-29 e-signature semantics land. *(Locked 2026-05-25.)*

- **GDPR right-to-be-forgotten via pseudonymization** (not hard delete). Principle locked: scrub via `SECURITY DEFINER` function replaces PII fields with sentinel UUID / NULL while preserving structural audit history. Meta-audit: scrub itself logged as `person.gdpr_scrubbed` action. Recompute downstream hashes after scrub. Implementation details (function shape, scrub_pii_in_jsonb helper) deferred to build phase. *(Locked 2026-05-25.)*

## Security / frontend patterns

- **iframe sandbox: never combine `allow-same-origin` + `allow-scripts` (2026-06-17).** Pairing both flags cancels the sandbox for same-origin content — embedded JS can reach `document.cookie` and `window.parent`. For a view-only file viewer (licence PDFs), use `sandbox=""` (empty) or `sandbox="allow-same-origin"` alone. Caught in Phase 3 code review (CR-01, `LicenceViewer.tsx`).
- **Supabase client errors are objects, not throws (2026-06-17).** `supabase.rpc(...)` returns `{ data, error }` — a failed RPC does not throw a JavaScript exception. Always destructure and check `{ error }` from the return value; a bare `try/catch` silently swallows RPC failures. Caught in Phase 3 code review (CR-02, `licenceActions.ts` — `log_license_viewed` audit writes were silently lost on RPC error).

## Access policy

- The 16-combo access matrix is the **master access policy** for cross-company interactions. **Enforcement model = layered (B7, locked 2026-05-29):** the matrix is encoded in a central app-layer policy module — not RLS, not hardcoded inline. *(Layer 1 §11.1 + DEV-51.)*
- **Authorization enforcement = layered / defense-in-depth (B7, 2026-05-29).** **RLS = security floor:** Postgres Row-Level Security owns tenant isolation (`company_id`) + basic row ownership, keyed on `auth.uid()`. The DB refuses cross-tenant rows regardless of how the query arrives — an app-code bug can't leak another company's data. **Central app-layer policy module = complex authorization:** the split-gate (verified/pending) + the DEV-51 16-combo cross-company matrix live in one authoritative module called by every protected action/RPC — not scattered inline checks. RLS deliberately not used for the complex matrix (context/workflow-state rules get slow + hard to test/debug in SQL). **Policy DSL/engine (OPA, Oso) deferred** until the hand-written matrix outgrows maintainable code. Consistent with the split-gate lock's "action-policy layer, not session/auth layer" — B7 adds the RLS floor beneath it. *(Locked 2026-05-29, resolves SCHEMA-DRAFT §B7.)*
- Deal visibility has **two independent layers**: Layer A (deal records on the Relationship page, default company-wide with per-side PRIVATE override) and Layer B (Deal Workspace contents, always invited-only). *(DEV-6; **superseded 2026-06-07 session 8** — see next line.)*
- **Deal visibility — one flag drives both layers (2026-06-07 session 8 lock, supersedes the previous "two independent layers" model).** `deal_workspace.visibility` enum (`company_wide` default / `private`) controls **both** the Layer A listing AND the Layer B contents access in one toggle. Default `company_wide` = deal listed on Relationship page + workspace contents visible+actionable to both companies' employees; `private` = hidden from Layer A list + workspace restricted to active `deal_member` rows only. *Why one flag over two independent layers:* simpler mental model; matches industry default (Salesforce/HubSpot opportunity visible to whole org by default, sharing rules tighten); makes `deal_member` an organizing list in default mode (access gate only in private mode); strict-hide RLS can be added later without schema cost if a third mode emerges. **Memory note `project_deal_visibility_two_layers.md` now stale.** *(2026-06-07 session 8; see DECISIONS.md 2026-06-07 session 8 + `SCHEMA-DRAFT.md` `deal_workspace`.)*
- **Cross-company owner-handoff invariant — 3-layer enforcement (RLS + DB trigger + app-layer).** `deal_workspace.owner_person_id` can be reassigned **within the same company only** (e.g. Kim → Marcel, both seller; cross-company is structurally blocked). Layer 1 = RLS UPDATE policy (only current owner mutates); Layer 2 = DB trigger `enforce_owner_same_company` BEFORE UPDATE (validates new owner's `company_id` matches old owner's); Layer 3 = app-layer pre-check (user-friendly errors). Same enforcement extends to `deal_member.role='side_lead'` handoff. *Why all three:* this is the defining cross-company trust boundary; regulated industry + cannabis B2B can't afford a single-layer bug to break it. Industry consensus (Postgres docs + Supabase + OWASP Multi-Tenant) for security-critical cross-table invariants is **both layers, not either/or**. *(2026-06-07 session 8.)*
- **App-layer vs DB-trigger choice rule (2026-06-07 session 8).** **Security-critical invariants** (trust boundaries — owner-handoff, cross-tenant isolation) → defense-in-depth, multiple layers including a DB trigger. **Correctness/state-transition logic** (deriving status from related entities — e.g. `deal_card.status` → `done` when delivery_note + invoice both attached) → app-layer in the relevant Edge Function. *Why correctness logic stays app-layer:* single write path = no bypass risk; better observability (visible trace logs vs hidden trigger); no per-write overhead (a trigger would fire on every artifact write just to check if it's the trigger categories); easier to revise when rules change (Phase 3 multi-delivery generalizes the rule). Industry support: Postgres docs, Status Machina state-machine pattern, Domo trigger guidelines all point this way. Belt-and-suspenders DB trigger can be added later if support sees drift. *(2026-06-07 session 8.)*
- Notes on the Relationship page are **per-side, not shared cross-company** — each company's notes are private to its own members. *(DEV-41.)*

## Chat / messaging

- P↔C is a **distinct chat-type entity** that archives on pickup and spawns a sibling P↔P chat; initial P↔C messages are also logged as a system entry on the new Relationship page. *(DEV-7; superseded 2026-06-06 — P↔C is folded into C2C under the new 3-type model below.)*
- `chat_thread` has a **type = p2p / c2c / deal** (the locked 3-type chat model — P↔C removed, folded into C2C). On accept of an inbound request a **C2C** thread is created in all 4 request types; a **P2P** thread also opens for the 3 substantive types (note / price-list seeds it); the deal-card type seeds a **deal draft** in the P2P that, on confirm, spawns the Deal Workspace (`deal` thread). *(2026-06-06.)*
- Personal-chat content is **never company-visible** — only Sella's system messages cross from personal chat into a workspace. *(Layer 1 §11.)*

## Sella behavior

- Deal-Sella **generates back-of-card SIGNALS**. MVP signals (deal creation date, COA expiry math) computed **live from underlying tables — no materialized storage**. Phase 2 signals (relationship-history, cross-deal, ML) added as platform data accumulates; compute/storage model decided per-signal at that point. Signals table designed **signal-type-keyed (rows, not columns)** with compute origin hidden behind read interface — any signal can be promoted live → cached without migration. *(DEV-5, DEV-48, DEV-49; LOCKED 2026-05-24.)*
- First-contact Sella runs a **platform-wide workflow framework** with per-company customizable qualifying-questions and document-request lists. *(DEV-7.)*
- Multi-Sella architecture (orchestrator vs tool-use vs graph; framework choice) is **open and architecturally foundational**. *(Layer 1 §10 + DEV-11.)*
- Sella's base voice = **Schranner-inspired mediator style** (calm, structured, balanced, solution-oriented, collaborative); each specialist inherits the base with role-fitted shifts. *(DEV-46, 2026-05-20.)*
- Deal-Sella exists in two modes — **detection** (per P↔P chat, listening) and **mediation** (per workspace, post-birth) — but same agent identity; storage layer must persist the mode transition on workspace spawn. *(Layer 4 §3, 2026-05-21.)*
- Deal-Sella's pricelist visibility is enforced at the **data layer** — she sees relationship pricelist + public shop pricelist, never the seller's master pricelist with margins. Asymmetric data access kept structural, not prompt-level. *(Layer 4 §8, 2026-05-21.)*
- Right-panel Sella routing is automatic per-context (surface × sub-context × deal-direction); routing logic lives at the **interface layer** so Deal-Sella stays out of the panel structurally. *(Layer 4 §2 + §5, 2026-05-21/22.)*
- Side-Sellas (Seller, Buyer) use **hybrid retrieval**: vector RAG for unstructured content (chat, evidence, notes), direct DB queries for structured records (pricelists, batches, deals), in-memory for live state. *(Layer 4 §7, 2026-05-22.)*
- Sella's **autonomy ladder (5 levels)** requires per-user × per-action-type trust state — climb/drop based on approve-rate over rolling N actions. Storage: feedback log + ladder state. *(Layer 4 §4, 2026-05-22.)*
- Sella's **learning loop (MVP)** = feedback log (thumbs + reject-reason + approve-rate per action type). No active retraining. *(Layer 4 §7, 2026-05-22.)*
- Translation engine (MVP) is **chat-only** with per-chat toggle; broader translation across cards/docs/UI is post-MVP. *(Layer 4 §6, 2026-05-22.)*
- GDPR right-to-be-forgotten applies to **all Sella memory layers** — per-user delete, per-relationship reset (admin-driven), full memory reset. *(Layer 4 §7, 2026-05-22.)*
- Every Sella write must be **reversible** — undo affordance + audit trail per action. Storage / state design needs to support reversibility per action type. *(Layer 4 §9, 2026-05-22.)*
- **Material-error escalation:** wrong card terms, OCR amendments, mistranslated regulated content → notify both deal participants + audit-log flag + require user review before re-apply. Implementation: error-class taxonomy + escalation routing. *(Layer 4 §9, 2026-05-22.)*

## Pricing

- Outbound offer pricelist cascade resolves **per recipient**: customer-specific → STANDARD CSV → manual prompt. *(DEV-1.)*
- Shop price visibility is **per-viewer and company-configurable** (show all / hide all / show one default; connected buyers get a custom pricelist on top). *(DEV-12 + 2026-05-14 lock.)*
- A **per-customer custom pricelist** = a `pricelist` row scoped by a **new nullable `pricelist.relationship_id`** (NULL = Standard company-wide / set = customer-specific), gated by the **DEV-41 approval primitive** (Proposed→Approved→Applied). It is **born in the shop** (seller overrides Standard prices on an offer), **persists on the Relationship page**, and is resolved **per-recipient by the DEV-1 cascade**. Deferred to **Phase 15** — neither the column nor the approval primitive exists yet; Present (Phase 7) ships **Standard-list-only** (a send-step per-line edit snapshots onto the deal, not a saved list). *(2026-06-23.)*

## State machines

- Deal lifecycle: **Chat → Draft → Confirmed → Done**, with a Cancelled side-path post-confirmation; **Done fires when delivery note + invoice are both attached** (document-driven, no explicit click). *(Layer 1 §5 + Layer 3 §1 + DEV-25.)*
- **Stages = template scaffolding only** (organize work by domain, provide default assignees for THINGS); not a UI primitive, no per-stage state column. *(DEV-24/30, supersedes prior stage-lifecycle entry.)*
- **Milestones unify into THINGS** — one entity type. Pre-confirmation gates use a `blocks_confirmation` flag (the only blocking behavior in execution). *(DEV-24/30/28.)*
- **No post-confirmation blocking** — open THINGS sit until done; urgency drivers (deadline on THING, deal priority, deal creation date, delivery date) are sort signals, not gates. *(DEV-24/30, supersedes prior "Required Milestones gate stage closure" entry.)*
- **Deal ownership does not transfer** between stage-responsible people — deal is visible + actionable for the whole company; stage-responsibility is the default-assignee mechanism only. *(DEV-24.)*
- **Post-confirmation has two flows: Amendment** (one side flags, other approves; audit-logged) and **Cancellation** (MVP = delete the deal; post-MVP = ERP cancel-if-possible via Odoo / CanCraft). Seller can always cancel unilaterally; buyer can only request a change with seller approval. *(DEV-23.)*
- Thing lifecycle: **Open → Done** (side path: Dismissed); supports redirect/reassign and threaded discussion. *(Layer 3 §7.)*
- Tickable only by assignee or creator; every tick logged for audit. *(Layer 3 §7.)*
- Documents attached to a deal (delivery notes, invoices) **can amend deal data** (volumes, prices, names) — Sella OCR / AI extracts and writes the amendment. *(DEV-25 + DEV-36.)*
- **Stage template** stored as data/config with schema `{id, industry, stages[], default_things_per_stage{}}`; MVP ships one row (`cannabis_wholesale_v1`); selection logic `getTemplate(deal) → template_id` exists for extension; company-override extension point present in data model (`company.template_overrides`) without admin UI in MVP. *(DEV-31.)*

## Notifications

- Post-confirmation deal-data changes (e.g., DEV-36 OCR auto-amendments) appear as a **passive thin status line** in both the P↔P chat where the change was processed and the C↔C workspace chat — no push notification. *Stage-closure half of original DEV-33 lock is superseded under flat-THINGS doctrine: stages have no closure UI events.* *(DEV-33, partially superseded 2026-05-22 by DEV-24/30.)*

## Payments

- No payment tracking in HS for medical cannabis MVP (40-90 day payment windows handled off-platform); deal card carries payment terms as metadata only. *(DEV-35.)*
- Phase 2: Stripe integration for non-cannabis material suppliers. *(DEV-35.)*
- Phase 3: factoring integration — suppliers route invoices to partner factoring companies, HS takes a small fee. *(DEV-35.)*

## Delivery

- MVP delivery tracking = delivery note + invoice uploaded manually; Sella OCR / AI extracts and amends the deal. *(DEV-36.)*
- Phase 2: logistics companies as workspace actors with their own notifications + tracking. *(DEV-36.)*
- Phase 3: customer ERP integration for end-to-end automatic delivery tracking. *(DEV-36.)*
- Partial / split shipments: working assumption is one deal with N deliveries (Done fires on final pair) — to confirm with Marcel (DEV-53).

## Surfaces

- Big 7 framework: **six navigable surfaces** (Connect / Buy / Sell / Present / Grow / Discover) + **Sella as a right-side panel pillar** (not a sidebar item) + **Home as the public landing page** outside the Big 7. *(2026-05-18.)*
- Every user sees all 6 surfaces; each surface renders in one of **two UI states** — **blank** (not activated) or **populated** (active use). No hiding, no role gating. *(DEV-14, 2026-05-20.)*
- Shop prices have **three configurable viewer modes** (show all / hide all with "request pricing" button / show one STANDARD); connected buyers can additionally get an **individual custom pricelist per company**. *(DEV-12, 2026-05-20.)*

## Onboarding / data import

- **Contact import — metadata-only scope.** Pipeline restricted to Gmail `gmail.metadata` (no body access) and Outlook equivalent restricted scope. Per-contact record schema: `{email, display_name, first_seen, last_seen, email_count}`. No subject lines, no body content, no third-party enrichment vendor. App verification required pre-launch (~2-4 weeks for Google review). Options B (+ subject + vendor enrichment) and C (+ email bodies) deferred post-MVP; both require explicit user consent + schema extension. *(DEV-3.)*
- **Contact categorization — schema fields on contact record.** `role` enum (default `unknown`; suggested values supplier / customer / partner / other / unknown, final at build phase); `activity_bucket` derived from `email_count` + `last_seen` (computed live or cached — design choice at build). Extension hooks present in schema for post-MVP: `tags[]` (free-text user tags), `sella_suggested_role` (nullable enum for AI suggestions). No auto-inference in MVP; Sella suggestions deferred. *(DEV-17.)*

## Authentication & verification

- **Auth model = Supabase Auth + `person` profile extension.** Identity lives in `auth.users` / `auth.identities` / `auth.sessions` / `auth.mfa_factors` (Supabase-managed). Our `person` table FKs `id` to `auth.users(id)` ON DELETE CASCADE. **Email handling (revised 2026-05-27 via A2):** `auth.users.email` is the single source of truth (at-rest encrypted by Supabase + RLS). The `person.email_encrypted` pgsodium mirror was dropped because Supabase officially deprecated pgsodium. App code accesses email via a `SECURITY DEFINER` view (`person_with_email`) that joins `person` ⨝ `auth.users` and exposes email to authorized roles only. *(Locked 2026-05-25, resolves SCHEMA-DRAFT §A1. Email-mirror portion superseded 2026-05-27 by A2.)*

- **PII encryption strategy = hybrid by data class.** **Queryable PII** (email, name, phone): at-rest only (Supabase default) + RLS + encrypted backups — GDPR Art 32 satisfied without column encryption. **High-sensitivity stored PII** (license numbers, government IDs, sensitive freeform notes): pgcrypto column encryption with master key in Supabase Vault, accessed via `SECURITY DEFINER` functions. **Secrets** (API keys, OAuth tokens, webhook signatures): Supabase Vault (its actual use case). **GDPR right-to-erasure** handled via A4 audit_log pseudonymization (per-subject crypto-shred deferred unless regulator pressure). *Why this matters engineering-wise:* pgcrypto-encrypted columns cannot be queried with WHERE/JOIN — read access goes through SECURITY DEFINER functions exposing only what the caller needs. Email, name, phone stay queryable. *(Locked 2026-05-27 in DECISIONS.md walkthrough locks 2026-05-27 — A2.)*

- **Split-gate access model.** Action class drives gate state — external actions (cross-company: Connect, Discover, Receive P↔C, outbound-as-email, deal creation) are hard-locked until `company.verification_status = verified`; internal setup (profile, company details, team config, contact import, settings) is allowed in pending state. Enforcement: action-policy layer, not session/auth layer. Storage: `company.verification_status` enum (`pending` / `verified` / `rejected`). *(Locked 2026-05-25.)*
- **Two entry paths into the platform.** Path A (new company) → company row created with `verification_status: pending`, user becomes Superadmin, HS team review queue entry created. Path B (join existing verified company) → a **dedicated `join_request` entity** (B1, 2026-05-29 — NOT reused from `pending_inbox_item`; approval *grants membership*) routed to that company's Superadmin; no new company row, no HS team review for the joining user. At signup: `person.company_id` is nullable until path resolves. *(Locked 2026-05-25; join-request entity resolved 2026-05-29 via B1.)*
- **HS team review = in-HS admin route.** `/admin/verifications` gated by a hard-coded reviewer allowlist (v0: Marcel + Muskan + Ayush as `is_hs_team: true` on person). Each approve/reject writes an audit-log entry — reuse of the DEV-41 change-log primitive: `{actor, timestamp, content_type: "company", content_id, decision, reason}`. Reject email contains free-text reason + a resubmit link routing back to company setup with prior data + fresh upload slot. *(Locked 2026-05-25.)*
- **License files = Supabase Storage, private bucket, at-rest + RLS (A3, 2026-05-28).** Files are PII-bearing (business names, addresses, license numbers, responsible-person names). Stored in a Supabase Storage private bucket: AES-256 at rest (default) + RLS on `storage.objects` + short-lived signed URLs for HS-team download. No app-layer file encryption in v0 (files must be human-reviewed; deferred unless a regulator demands provider-blind storage). Virus scan via Edge Function at the upload boundary; format allowlist {PDF, JPG, PNG, HEIC} + server-side magic-byte check; 20 MB/file, max 5. Metadata + storage pointer live in the new `company_license_file` child table (`company.license_filename` dropped — single column couldn't hold multi-file + per-file scan status). Every view/download logged to `audit_log` (`license_viewed` / `license_downloaded`). *(Locked 2026-05-25; storage strategy resolved 2026-05-28 via A3.)*
- **Group seed at onboarding ≠ full matrix.** Onboarding step pre-loads 4 default Groups as checkbox-skip; full Action × Group toggle matrix lives in `Settings → Team & Permissions`. The matrix UI is one component used in two contexts (onboarding = read-only seed with skip; settings = full edit). Default Group seed itself is placeholder for v0; cannabis-pharma team-structure research deferred to v0.1. *(Locked 2026-05-25; refines DEV-40.)*
- **Domain-collision routing.** Soft auto-suggest on email-domain match; manual existing-or-new question always shown. Personal-email domains (gmail / outlook / gmx etc.) skip the match logic and ask directly. Domain match on a still-pending company queues the join request, auto-routed on Superadmin approval. Domain match overridden by user picking "new company" → silent flag on the HS team review queue entry. *(Locked 2026-05-25.)*
- **Access matrix audit (open).** Layer 1 §11.1 16-combo matrix assumes binary on-HS / off-HS state. Split-gate introduces an intermediate state (person on HS, company pending). Some combos (especially #4, #8) may be unreachable under the new model and others need clarification. Noted for a future audit pass; not blocking implementation.

## Safety / compliance

- **MVP posture = minimum-viable safety** — KYC at onboarding (license cert upload + HS team manual review), audit log (LAYER-3 §233), HS-admin-only suspension. **No platform-side automated detection** in MVP. *(DEV-38, LOCKED 2026-05-24.)*
- **License verification** — company uploads license / pharmacy cert at account setup; HS team manually reviews; pre-verification accounts locked out with wait dialog; **one-time at MVP**. *(DEV-38.)*
- **Platform-side actor: Hello Sello platform admin** — not a company role; powers = verify onboarding, suspend verified companies, view cross-company audit log. *(DEV-38.)*
- **Phase 2 roadmap (post-MVP):** Sella flags off-platform-deal language + missing-license attempts; manual HS-admin review queue; annual license re-upload. *(DEV-38.)*
- **Phase 3 roadmap (post-MVP):** sanctions screening, license-license matching at deal birth, cross-deal pattern detection, Compliance-Sella specialist activated. *(DEV-38; pairs with LAYER-1 §10 multi-Sella.)*

## Architecture / code structure (2026-06-04)

- **Code architecture = modular monolith (lite), domain-partitioned.** One deployable (Next.js App Router on Vercel + Supabase). Layout: `src/app/` = routing only (thin pages per surface); `src/modules/<domain>/` = domain modules (companies, connections, messaging, deals, catalog, sella), each `components/ · server/(actions+queries) · lib/ · types.ts · index.ts`; `src/shared/` = cross-cutting (auth, db, ui, utils, types). **Boundary rule:** a module imports another module only via its public `index.ts`, never into another module's `server/` or `lib/`. *Why:* concretizes the foundation/surfaces/Sella build strategy; a new surface = a new `app/` route + reuse of existing modules; deal logic written once, used by Connect/Buy/Sell. *(DECISIONS.md 2026-06-04; documented in README, not applied to the repo yet.)*
- **Auth placement.** Authentication is cross-cutting plumbing in `src/shared/auth/` (session + current user + company) - NOT a domain module. Supabase Auth is the engine; `companies` (the business org) is the domain module. Login/signup pages live in `src/app/(auth)/`. *(Consistent with the Auth model lock above.)*
- **Surfaces vs modules.** Surfaces (Connect, Present, Buy, Sell, Discover, Grow) are *windows* = routes in `src/app/`; modules are *workshops* = `src/modules/`. One surface composes one or more modules; one module is reused across surfaces.
- **Sella inference infrastructure = Claude on AWS Bedrock, EU/Frankfurt.** Model-per-job: Sonnet (drafting/detection) / Haiku (summarization); Opus deferred. Wrapped behind a swappable provider interface in the `sella` module. EU residency for GDPR + EU AI Act. *(DECISIONS.md 2026-06-04; fills DEV-11 tech half. Verify Sonnet EU-region availability before wiring.)*

## Schema engineering notes (2026-06-06)

- **COA / product documents reuse the `company_license_file` pattern.** When COA (Certificate of Analysis), COB, and other per-product documents land (Phase 2/3), they follow the same A3 primitive: metadata row + Supabase Storage pointer + `mime_type`/`size`/`scan_status` + `audit_log` + RLS / signed URLs. New table (e.g. `product_document`) links to a product/deal instead of a company. **Naming hazard:** "CoA" = *Company A* (deal side, CONTEXT.md); "COA" = *Certificate of Analysis* (LAYER-5). Schema table must be `certificate_of_analysis` or `product_document`, **never** `coa`. *(2026-06-06.)*
- **Bedrock EU inference profiles — Sella provider wrapper constraint.** `eu-central-1` Claude models invoke only via **EU cross-region inference-profile IDs** (prefix `eu.`, e.g. `eu.anthropic.claude-sonnet-4-5-…`), not bare `anthropic.claude-…` IDs. Sella's provider wrapper must use the `eu.` prefix or calls fail. Fills the "Verify Sonnet EU-region availability" gap noted above. *(2026-06-06.)*

## Connect chat model + Deal card — open / parked (2026-06-06)

- **Buyer-metric field name** — the buyer's counterpart to the seller's `margin` on the Deal card — is **TBD**. *(2026-06-06.)*
- **Clickable product thumbnail → product card** — each `deal_line_item` row's thumbnail will later open that product's own card; **not built yet**. *(2026-06-06.)*
- **Multi-deal context in a P2P chat** (deal selector spanning several deals on one P2P) is **parked on Linear DEV-37**. *(2026-06-06.)*

## Connect chat (screen ②): data model + P2P↔Deal sync (2026-06-06 later)

Prototyped in `prototypes/chat-prototype` (decisions: DECISIONS.md `## 2026-06-06 (later)`; narrative: that folder's `CONTEXT.md`). Engineering shape to hand the `messaging` + `deals` modules.

- **Chat spine (matches connect/inbox prototypes):** `relationship → chat_thread → chat_message`.
  - `chat_thread { id, relationship_id, type: c2c | p2p | deal }`. C2C created at connection (company-level); P2P for substantive requests; a `deal` thread per confirmed deal (lives in the Deal Workspace). `scope` (company/person/deal) is **derivable from `type`** — no separate column.
  - `chat_message { id, thread_id, sender, type, body }`. `sender ∈ {person, system, sella}`. System/Sella lines are `chat_message` rows with a `type` discriminator (`connection_established`, `deal_started`, `intro`, `deal_detected`, `workspace_created`, `deal_cancelled`, `deal_opened`, `deal_card_updated`). **No separate `system_message` table** — one vocabulary.
- **Deal-card state is versioned, not overwritten:**
  - `deal_card { id, version, value_net, status: confirmed|amended|cancelled, … }` — mutable current state.
  - `deal_card_log { id, deal_card_id, version, change, by, … }` — **append-only** version history (the change story; lives on the card back; feeds audit).
  - `deal_change_input { id, deal_card_id, version, party, note }` — **per-user evidence**: each party's own note on a change. This is the "individual for individual user" record; LAYER-1 §5's evidence-log made concrete.
- **`audit_log { id, actor, action, target }`** — every system/Sella line mirrors here. **A `deal_card_updated` chat message is a *projection* of a log/audit entry, not an independent fact** — which is why a change made in the Deal chat updates the log without a broadcast (no second source to reconcile).
- **Sync invariant:** chat messages are **never** copied between threads. The **`deal_card` is the only shared state** across P2P and Deal chat. A P2P (private) change crosses into the company-visible side **only** as a confirmed card delta + its per-user evidence + a system message; the deal card is the *published language* of that boundary.
- **Two-party gate:** deal birth and (by the same pattern) deal changes are gated on both parties' confirmation; model the decision as per-party state so the audit log attributes who agreed / declined.

## Phase 2 schema engineering notes (2026-06-07)

- **`deal_line_item` is a versioned snapshot table, not a mutable row.** Every `deal_card` version bump copies all line items with the new `version` integer. `SELECT … WHERE deal_card_id = X AND version = N` reconstructs any historical state without diff-replay — straightforward SQL, no logic. The `GENERATED ALWAYS AS (quantity * unit_price) STORED` `line_total` column means the DB always computes totals; no app-side calculation to keep in sync. *(DECISIONS.md 2026-06-07.)*
- **`deal_line_item` has no `deleted_at`.** Rows at a locked version are immutable — adding soft-delete would imply they can be removed, which contradicts the versioned-snapshot model. "Removing" a product between versions is modelled as: the new version simply omits that item (no row copied forward). *(2026-06-07.)*
- **`deal_delivery` is a separate child of `deal_card`, not of `deal_line_item`.** A delivery maps to the whole deal (all lines), not a single line — one delivery can fulfil multiple line items partially. Batch numbers, COA files, and actual quantities sit on the delivery record, not on the line item. One deal has N deliveries (DEV-53). *(DECISIONS.md 2026-06-07; Phase 3 build, DEV-36.)*
- **`relationship` row enforces canonical company-pair ordering.** `CHECK(company_a_id < company_b_id)` + `UNIQUE(company_a_id, company_b_id)` at the DB level. Application code must always insert with the lower UUID in `company_a_id`. Direction (who initiated) is preserved in `initiated_by_company_id` — a separate column, not encoded in the pair ordering. *(2026-06-07.)*
- **Open Q — two-party confirmation state (Q3):** where the per-party yes/no lives for deal birth and deal changes is undecided. Options: (a) dedicated `deal_confirmation` table — cleaner, audit-friendly, each confirmation event is its own row; (b) `metadata` JSONB on `deal_card` — simpler, harder to query. Decide before writing Phase 2 migrations. *(2026-06-07.)* → **RESOLVED 2026-06-07 — dedicated `deal_confirmation` table + `withdrawn` on `deal_card.status`. See DECISIONS.md.**
- **Open Q — P2P thread uniqueness (Q2):** canonical ordering for `(person_a_id, person_b_id)` in `chat_thread` — enforce at DB (`UNIQUE` with `CHECK person_a_id < person_b_id`) or at app layer only? Decide before writing Phase 2 migrations. *(2026-06-07.)* → **RESOLVED 2026-06-07 — DB-level `CHECK`. See DECISIONS.md.**

## Schema patterns (2026-06-07)

- **EAV avoidance via lookup-controlled vocabulary.** When a domain calls for "anything goes" key/value pairs (e.g. relationship-level agreed terms — payment terms, MOQ, incoterms, exclusivity), do **not** store keys as free strings in a `key` column. That's the EAV anti-pattern (Postgres community flags it strongly — `payment_terms`, `payment-terms`, `PaymentTerms`, `pay_term` all become different "terms"; queries ugly; no per-type validation). **Instead:** constrain the key column with a FK to a small `*_type` lookup table that lists the allowed codes; add a `value_format` hint (`enum`/`number`/`text`/`boolean`) to drive UI input + validation. New term types = INSERT into the lookup, no migration. Stays flexible while controlling the key space. *Locked 2026-06-07 with `agreed_term_type` driving `relationship_term`;* reuse for any future "open set of named attributes" need (e.g. company-level configuration, per-relationship policy flags) before reaching for a JSONB blob or pure EAV. (Modern alternative — JSONB on the parent row — only beats this when the audit_log doesn't need to point at a single attribute's change; for anything we want to audit row-by-row, the lookup-controlled table wins.)

## Product Catalog & Pricelist schema (2026-06-07 session 10)

- **Two-level split: `product` (label) vs `product_batch` (measured).** One product → many batches. Label/advertised cannabinoids live on `product`; lab-measured CoA values (THC/CBD/CBG/CBN, water activity, loss-on-drying) live per batch. *Why:* cannabis is a plant — batch potency deviates from label (research: up to ~50%); a flat single-level product would either misstate potency or lose lot traceability. *(DECISIONS.md session 10.)*
- **Terpenes = `terpene` lookup + `batch_terpene` child, not fixed columns.** Profiles routinely exceed 3 terpenes; a child table is unbounded and matches the controlled-vocab → lookup+child pattern. Fixed "Terpene #1/#2/#3" columns would cap the profile and force a migration.
- **`product_buyer_code` is a relationship-scoped map, not a column on `product`.** One product has many buyer codes (each buyer keeps their own). A column works for a one-buyer demo then forces an extract-to-rows migration at buyer #2 — the migration-avoidance failure. Stores an **identifier, not a price** → does not breach "no per-buyer pricing in v0".
- **Prices = one source of truth on `pricelist_item`.** `product` holds only intrinsic money facts: `cogs` (🔒 seller-only, RLS + app policy, same as `deal_line_item.seller_margin`) + `rrp_per_gram` (reference). Sell + bundle prices live on `pricelist_item`. `deal_line_item.unit_price` snapshots `pricelist_item.price_per_gram` at deal time (standing-vs-frozen pattern).
- **Naming locked: `product`** (not `catalog_product`). `product` now lands in v0 → `deal_line_item.product_id` becomes a **real FK in Phase 2** (create `product` before `deal_line_item`).
- **Per-company custom attributes → `product.metadata` JSONB**, not per-company ALTERs (CSV: "more columns flexibly per company").

## RLS / privacy spine (2026-06-07 session 12 — build)

- **Chain-following via `SECURITY DEFINER` helper functions.** Tables without a direct `company_id` (chat, deals, things) reach their owning company through 1–3 hops. That hop logic is written ONCE as DEFINER helpers (`current_company_id`, `is_relationship_member`, `card_relationship_member`, `can_access_workspace`, `can_access_thread`, …) and every policy calls them. DEFINER is essential: it lets the helper bypass RLS while resolving the chain, so a policy on `chat_message` doesn't recurse through `chat_thread`'s own policy (the classic Supabase infinite-recursion trap). `current_company_id()` reading `person` is the usual offender — it MUST be DEFINER. Helpers are `STABLE` + pinned `search_path`.
- **Fail-safe NULL = deny.** `current_company_id()` is NULL for a user with no company yet (sign-in → company-setup window, Path B). NULL never matches a `company_id`, so a company-less user sees only their own `person` row. (Honors the Path-B invariant.)
- **Side-private COLUMNS → per-side sibling-table pattern.** RLS is row-level only; it cannot hide one column of a row a counterparty can legitimately see. So any "the other side must NOT see this column" need is solved by moving the column into a sibling table whose rows are owned per-side and RLS'd by `company_id`. Applied to `product.cogs` → `product_cost` and `deal_line_item.seller_margin`/`buyer_metric` → `deal_line_item_private`. **Reuse this pattern** for any future counterparty-private field — don't reach for masking views (they collide with `REVOKE` + can't do same-row/same-role conditional columns).
- **`audit_log` hash trigger must be `SECURITY DEFINER` once `audit_log` has an RLS SELECT policy** — otherwise the trigger's prev-hash read is RLS-filtered per-tenant and the global chain forks. (Concurrency fork — advisory lock after the `BIGSERIAL` is drawn — still open for build-phase hardening: lock before sequence draw, or SERIALIZABLE.)
- **`rls_auto_enable()` is a project-level event trigger that turns RLS ON for every new `public` table.** Build-time implication: a freshly-created table is **deny-all** until you add policies — never assume a new table is readable; always ship its policies in the same migration. (Pre-existing infra; advisor flags it as a public SECURITY DEFINER fn — left as-is, it's the team's guard.)
- **RLS is verified by a rolled-back impersonation test** (`supabase/tests/rls_isolation_test.sql`): `BEGIN` → ephemeral fixtures → `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claim.sub', …)` per seed user → assert both directions (counterparty blocked AND legitimate user allowed) → `ROLLBACK`. Run it after any policy change; the service role bypasses RLS so it's never used for the assertions.
- **Follow-up:** RLS helper functions are RPC-exposed (advisor warnings, low-risk — they return booleans / own-company-id). Move them to a non-API-exposed `private` schema to silence + reduce surface.

## Foundation shared modules — F5 (2026-06-07 session 14)

- **DB client barrel split.** `@/shared/db` exports only types (`Database`, `Tables<>`). The actual clients live at `@/shared/db/client` (browser, singleton via `@supabase/ssr`) and `@/shared/db/server` (server, per-request cookie-scoped). They cannot share one barrel: `server.ts` imports `next/headers`, which is a server-only module — importing it from a Client Component fails at build. **Reuse this split pattern** for any future module that has a server-only and browser-safe variant.
- **Audit write helper is deliberately shallow.** `writeAudit()` does one INSERT with the caller's session company. The DB trigger serializes (advisory lock), chains the hash, and fills the sequence. This means: (a) the app layer never touches cryptographic state; (b) Sella's audit rows go through the same path (actor_type = 'sella'); (c) if the hash algorithm changes, only the trigger changes — zero app-layer code. **Do not add hash logic to the helper.**
- **`getCurrentCompanyId()` is the SINGLE company accessor** (honoring the Path-B invariant from DECISIONS.md 2026-06-06). All code that needs the caller's company MUST call this — never read `person.company_id` directly from an ad-hoc query. The accessor returns `null` for company-less users; null propagation through RLS = deny-all (fail-safe). If Path B (join-existing) ships, only this function + the auth trigger change.

## Sella runtime placement (2026-06-07)

- **One brain, many doorbells, one butler.** "Sella" is not a single service — it's the shared Bedrock model + per-task context + per-task tools + a trigger. Each Sella *task* runs wherever its trigger lives, but they all call Bedrock through **one shared helper** (so voice / memory / audit stay consistent). That helper is F5 territory (Bedrock client + memory attach + `writeAudit`). *(Ties to F5 §above.)*
- **Placement rule: data-triggered → background, person-waiting → app.** A task kicked off by a DB change (new message, card version bump, doc upload) runs in a background runtime and must never sit in the user's request path (keeps Sella a non-blocking leaf). A task a user waits on-screen for (side-panel reply, "what's on my plate") runs in the Next.js app for an immediate answer. **Tasks live in different homes; choosing one home does not bind the others.** *(Layer 4 §5 routing.)*
- **Deal-Sella detection — DECIDED: Supabase Edge Function (data-triggered → background).** Detection reads new message rows, so it lives off the request path in an Edge Function, not in the Next.js app. Flow: new `chat_message` row → Supabase **DB webhook** (async via `pg_net`, non-blocking) → Edge Function → **Claude Haiku** with one tool `propose_deal_draft(products, qty, price, currency)` over a rolling ~15–20-message window. Tool fires → write a Draft suggestion → Supabase Realtime shows it live. **Suggest-only is structural** — Sella is handed only *propose* tools, never a `confirm`/`send` tool, so it cannot commit by construction. Per-message Haiku ≈ $0.001 + prompt caching → the cheap pre-filter "gate" is a post-MVP cost optimization, not needed for the demo. *(Research 2026-06-07: function-calling extraction, Haiku pricing/caching, Supabase webhooks; Layer 4 §3 hybrid = Tier-1 monitor / Tier-2 gate. Sella was nominally Ayush's module — one-line heads-up to him that detection placement is settled.)*
- **`propose_deal_draft` tool contract (S2, locked).** Haiku's single tool outputs `line_items[]` each `{ name → deal_line_item.name, quantity+unit → .volume, unit_price → .unit_price, cultivar? → .cultivar, pzn? → .pzn }`, plus `currency → deal_card.currency` and a one-line `summary → deal_card_log`. **Required:** name, quantity, unit_price, currency. **Optional:** cultivar, pzn (fill only if mentioned). `deal_type` is NOT extracted (set by initiator; seller = OFFER per O4); `value_net` is computed (qty × price), not extracted. Maps 1:1 to SCHEMA-DRAFT columns so extraction writes with no glue layer. *(2026-06-07; build = Ayush / F5 session.)*
- **Draft-prompt proposal + votes live in `deal_detected` message `metadata` — no new table.** Sella's "shall I draft?" suggestion is a `chat_message` of type `deal_detected` (existing type); its `metadata` JSONB holds Sella's drafted payload + each side's accept/reject vote — exactly what the column was designed for (note reads "Sella context, confirmation state"). On both-accept, the **app** (person-waiting, per the placement rule) runs **one atomic transaction** creating `deal_card` (Draft) + `deal_line_item` rows + `deal_workspace` + `deal` thread + `deal_member` rows + `workspace_created` system line + audit — all-or-nothing; the `deal_detected` message persists as the permanent "proposed → both accepted" record. **Not** `deal_confirmation` (that's the heavier final two-party *card* confirm, one row/party/version — don't overload it). Promote to a dedicated `deal_proposal` table post-MVP only if the proposal grows a real lifecycle. *(Schema lines 875/880; 2026-06-07.)*
- **Workspace-spawn transaction — the order is acyclic (2026-06-08).** The feared "thread_id-nullable cycle" does not exist: the only FK between the two is `chat_thread.deal_card_id → deal_card` (one-directional; `deal_card` has no thread column). So the atomic birth runs in a clean fixed order — (1) `deal_card` → (2) `deal_line_item` → (3) `deal_workspace` → (4) `deal_member` → (5) `chat_thread` (type `deal`, satisfies its `deal_card_id NOT NULL` CHECK) → (6) `chat_message` `workspace_created` (into the new deal thread) → (7) audit. No nullable-then-backfill step needed.
- **Deal ownership = `deal_member.role = 'owner'`, co-owned per side; `deal_workspace.owner_person_id` REMOVED (2026-06-08).** At birth the two P2P participants each become a `deal_member` with `role = owner` (one per company side). A deal can therefore have many owners, which a single `owner_person_id` column can't represent — so that column is dropped and ownership is read entirely from `deal_member`. `side_lead` stays in the role enum but is not auto-assigned at birth (reserved for delegating "lead" without full owner powers); `member` = colleagues added later. *(Amends locked Phase-2 `deal_workspace` — see SCHEMA.md §8.)*
- **Superadmin = platform-wide RLS bypass, not a `deal_member` row (2026-06-08).** The HS superadmin reads/manages any deal through a bypass policy on the deal tables, never by being inserted as a member of each deal — keeps every deal's people-list to actual participants.
- **P2P→deal continuity signpost (2026-06-08).** The deal moves to its own thread on birth, so the originating P2P thread's `deal_detected` message updates in place to a "Deal created → open workspace" link into the new deal thread (the two people don't lose the deal when the room changes). The `deal_detected` message stays as the permanent "proposed → both accepted" record (per the entry above).
- **Bedrock-from-Deno creds — permanent least-privilege key in Supabase Edge secrets (2026-06-08).** The detection Edge Function signs Bedrock requests with a **permanent** IAM/Bedrock key stored in **Supabase Edge secrets** (NOT the Vercel env keys, which are a separate runtime), scoped to **Bedrock-invoke on the `eu.` EU Claude inference profiles only** (least privilege — a leak can only invoke EU Claude). Auto-expiring 12hr keys + a refresh job are deferred post-MVP. *(Build = Ayush.)*
- **Bedrock auth = Bedrock API key (bearer token) + plain `fetch` — SigV4 / AWS SDK NOT needed. VERIFIED live 2026-06-08.** Supersedes the "permanent IAM key + `aws4fetch` SigV4" assumption in the bullet above. A long-term **Bedrock API key** (bearer token; AWS console → Bedrock → API keys) lives in Supabase Edge secrets as `AWS_BEARER_TOKEN_BEDROCK`; the Edge Function calls `POST https://bedrock-runtime.eu-central-1.amazonaws.com/model/<eu.model>/converse` with header `Authorization: Bearer <key>` via plain `fetch` — no SigV4 signing, no `@aws-sdk/*` import. Proven end-to-end with a throwaway `bedrock-smoke` function: a live Converse call to `eu.anthropic.claude-haiku-4-5-20251001-v1:0` returned "pong". **This kills the Deno SDK-compatibility risk entirely** — nothing to bundle. EU region + `eu.` inference-profile prefix both confirmed working. 12hr short-term keys + a refresh job stay post-MVP hardening.
- **Shared Bedrock helper lives in the Deno/functions world, NOT `src/shared/` (2026-06-08).** Refines the "F5 territory" framing in the first bullet of this section. The "one butler" helper → `supabase/functions/_shared/sella/`, not the Next.js `src/` tree. Reasoning (independently reasoned + researched, not just the F5 note): the heaviest model-calling tasks (detect / draft / summarize) all run in the Edge Function (Deno), and the Deno bundler can't cleanly import out of the Next monorepo `src/` ([Supabase CLI #1303](https://github.com/supabase/cli/issues/1303)); the reverse — the Next app importing a *pure* helper from the functions dir — is friction-free. So the helper sits with its heaviest consumer and the stricter bundler; the app reaches in if/when the person-waiting panel needs it. Still shared infra — it just physically belongs next to the Edge Functions.

## Connect inbox — 2a (2026-06-07 session, build)

- **A module's `types.ts` binds to the generated Row — never redeclare columns.** `src/modules/connect/types.ts` derives `PendingInboxItemRow = Database['public']['Tables']['pending_inbox_item']['Row']`, then narrows only the two lookup-FK `string` columns (`status`, `type`) to their seeded code unions (`pending|accepted|rejected`, `connect|connect_message|pricelist_request|deal_card` — codes verified against the seed migration, since the generated types only say `string`). Schema regenerates → module types follow, zero drift by construction. **Reuse for every module's `types.ts`.**
- **The mock is the single swap point.** `mock/inbox.mock.ts` is the only throwaway file in a UI-first unit: `getInbox()` + `claim/assign/accept/decline` mutators are **async** and return the same `InboxItemView` the real Supabase query will. Swap = rewrite those bodies behind the module's `index.ts`; the (pure) components never change. Making the accessor async *now* avoids a sync→async component churn at swap time. **Reuse this mock-first shape for 2c/3a and the other UI-first units.**
- **Lens meaning lives in one predicate.** `lib/lenses.ts#matchesLens` is the single source for both the tab counts and the list filter, so a count can never disagree with the list length. Exhaustive `switch` + `never` guard = adding a lens without handling it fails to compile.
- **One stateful component per surface panel-set.** `InboxView` is the only client/stateful piece; rows, list, detail, lens tabs, and the assign-menu are pure (props in, callbacks out). The §2 assignment model (claim first-come / no force take-over / owner-or-admin reassign) is one pure function `detailMode(item, viewer)` → the action surface is a direct consequence of the mode, not conditionals scattered across JSX. Implements existing locked decisions (DECISIONS.md DEV-7 + 2026-05-20 ticket model) — no new lock.

## Present storefront — v0 (2026-06-10 session 16, build)

- **Public-shop RLS is additive, not a rewrite.** The owner's company-scoped `*_all` policies stay; a separate `for select to anon, authenticated` policy is **OR'd on top** so buyers can browse another company's catalog. `product` is public for in-window rows (`visibility_start/end`); `pricelist_item` is public **only** via an `EXISTS` on `product.price_public = true` — so the catalog can be browsable while prices stay gated. Writes are untouched (SELECT-only policies, no WITH CHECK). *(migration `20260609210000`.)*
- **`shop-media` is a public bucket with no *broad* SELECT policy** *(refined 2026-06-10 — see "Present product gallery" below: a **company-scoped** SELECT was later added so owners can delete their own files; still no anon/cross-company listing)*. Public buckets serve objects by URL without one; a broad SELECT only adds bucket *listing* (flagged by the `public_bucket_allows_listing` advisor). Writes are folder-scoped to `current_company_id()` (first path segment = company id), mirroring the `company-licenses` pattern. The storefront renders from public URLs, never enumerates the bucket.
- **`import_products(jsonb)` is the atomic ingest seam.** SECURITY INVOKER (RLS enforces company-scoping; no escalation) — one transaction turns N validated rows into `product` + `pricelist_item` + `product_batch` + `batch_terpene` + `product_cost`, creating the company-wide `Standard` pricelist on first import. Terpene names resolve to `terpene_code` (skip unknowns, don't fail). The pure validator (`src/modules/catalog/parse.ts`, template in `template.ts`) lifts straight in; `import.ts` is the server-action wrapper. *(migration `20260610120000`.)*
- **Request-pricing reuses the existing inbox.** A buyer's "Request pricing" click becomes a `pending_inbox_item` of type **`pricelist_request`** (already a seeded inbox type) — no new table/enum. *(to wire next session.)*

## Present product gallery — multi-image carousel (2026-06-10 session 18, build)

- **A product's images are a 1:many `product_image` table, not a column.** Replaced the single `product.image_path` with `product_image (product_id FK, company_id, image_path, position)`; `position 0` = cover. This is the unanimous shape across Medusa/Saleor/Spree/Vendure and Supabase's own guidance (model file relationships in your own table referencing the storage path). A JSON/array column was rejected: reorder/delete become whole-document rewrites and you can't write per-image RLS. RLS mirrors `product_all` (owner, company-scoped) + an additive `for select to anon, authenticated` gated by the parent product's visibility. The old `image_path` was retired (backfilled → `position 0`) and the `import_products` RPC updated to insert a `product_image` row from the CSV "Image filename". *(migrations `20260610150000`, `20260610160000`.)*
- **Storage I/O is client-side for BOTH add and remove; the server only touches metadata.** Files upload **browser → `shop-media` directly** via the supabase-js browser client (Storage RLS scopes writes to the company folder); a tiny server action then records only the paths. This sidesteps the Next.js Server Action body limit (1 MB) AND Vercel's platform request-body cap (**4.5 MB, not raisable**) — routing image bytes through a server action would break in production. Remove is symmetric: the server action deletes the row and returns the path, the browser deletes the file. **Reuse this pattern for any future user file upload (cover/logo could migrate to it too).**
- **A storage bucket used for owner *management* needs a company-scoped SELECT policy — `remove()` does select-then-delete.** `shop-media` originally had INSERT/UPDATE/DELETE but no SELECT, so deleting a photo silently orphaned the file (the API found nothing to delete and returned `[]`). Fix = `shop_media_select` scoped to `(storage.foldername(name))[1] = current_company_id()` — a company lists only its OWN folder, so no broad/anon listing is reopened and public storefront URLs are unaffected. **Any bucket where the owner must delete/list their files needs a matching SELECT policy, not just write policies.** *(migration `20260610170000`; root-caused via live testing.)*
- **One authoritative `position` writer.** "Make cover" and move-left/right both resolve in the client to a full ordered id list passed to `setProductImageOrder`, which writes `position = index`. Delete leaves gaps (ordering is by `position`, so gaps are harmless and the next reorder rewrites them) — no read-modify-write recompaction. Carousel = Embla (~7 KB, zero-dep); image frame is `aspect-[4/3]` to stay proportionate in the card grid.

## Profile & QR business card (2026-06-10 session 19, build)

- **Anon-facing reads go through a `SECURITY DEFINER` RPC, NOT opened RLS.** The public profile page (`/c/<handle>`) needs unauthenticated reads of a handful of curated fields. Instead of granting `anon` SELECT on `person`, a `get_public_profile(handle)` function (`security definer`, `set search_path = ''`, `grant execute to anon`) returns only the business-card columns (joining `person` ⨝ `auth.users` for email ⨝ `company`). The table stays closed; the function is the single, auditable public surface. **Reuse for any anon-facing curated read.** *(migration `get_public_profile_rpc`.)*
- **Profile fields are typed `person` columns, written through one module.** `src/modules/profile` (`getMyProfile`/`updateMyProfile`/`getPublicProfile`/`buildVCard`) and `src/modules/companies` are the single read/write doors — onboarding, account page, bottom-left card, and public page all call them, so storage shape (columns + the `links` jsonb bag, today just LinkedIn) is hidden and there are no scattered Supabase queries. *(migration `profile_qr_foundation` — additive; backfilled `public_handle` + profile cols for existing rows; `public_handle` UNIQUE, generated on first save for new users.)*
- **Avatar upload is client-direct to a public `avatars` bucket** (path-isolated by `auth.uid()`); the server stores only `avatar_path`. Same pattern as the product gallery (dodges the Vercel 4.5 MB body cap). Reusable `shared/ui/AvatarUpload`.
- **QR is server-rendered SVG** (`qrcode` lib) of the absolute `/c/<handle>` URL (built from request headers). For the bottom-left card the QR is generated in a **server action** (`shared/ui/account-card.ts`) so the qrcode lib never ships to the client bundle. vCard = **3.0** (iOS-required), served by a route handler as `text/vcard`.
- **Public page is chrome-free + public via two seams:** `AppShell` `BARE_ROUTES` += `/c` (no rail/top-bar) and the proxy treats `/c/*` as a public route (exempt from the auth gate). **Gotcha:** `supabase.rpc` must be called as a method (`supabase.rpc(...)`); detaching it (`const rpc = supabase.rpc; rpc(...)`) loses `this` and throws `Cannot read properties of undefined`.
- **The public profile page is mobile-primary** (QR scans land on a phone) — the hero/card overlap is `md:`-gated so on mobile the card sits below the hero and the company banner stays visible. Design new public-facing surfaces mobile-first.

## Storage uploads — single-slot hardening (2026-06-11 session 21, build)

- **Single-slot media uses a STABLE filename + `upsert`, so a replace overwrites in place — orphan-proof by construction.** Avatar (`{id}/avatar`), cover/logo (`{companyId}/cover|logo`), **no extension**. This fulfils the gallery note above ("cover/logo could migrate to it too") and **refines the session-19 avatar note**: the avatar was client-direct but used a UUID-per-upload path (`{id}/{uuid}-{name}`), which made `upsert` dead (a random name never collides) so every replace orphaned the old file. **Collections (the product gallery) keep unique names + explicit delete-on-remove — the 1:many case genuinely needs unique paths; single-slot does not.** *Why no extension in the path:* it would change on a format switch (png→jpg) and re-orphan.
- **Cover/logo are now client-direct like the gallery** — `updateShopProfile` stores only the path string, never the bytes (dodges the 1 MB/4.5 MB body limit). `ShopView` uploads the file to the stable path first (with the same client-side size/type guards), then the server action reads `cover_path`/`logo_path` strings from the form.
- **Stable filename ⇒ stable URL ⇒ add a `?v=updated_at` cache nonce on read.** Supabase Smart CDN auto-invalidates the object on overwrite (≤60s), so the nonce only covers the browser cache + that window. Filename-versioning (the "stronger" cache-buster) is rejected here — it reintroduces orphans. Threaded `company.updated_at` / `person.updated_at` into the read paths (`getMyShop` select + `Shop` type, `getMyProfile`, `mediaUrl`).
- **Orphan cleanup is a Storage-API delete, not SQL.** Deleting a `storage.objects` row via SQL can leave the backing file billed; the Storage API delete (RLS-scoped) removes both. Cleaned 3 legacy orphans this way — authenticated the owning seed user via the Auth password-grant (`/auth/v1/token?grant_type=password`), then `DELETE /storage/v1/object/{bucket}/{path}` with the user's JWT (RLS scopes each company to its own folder). **Parent-delete cascade (row deleted → file deleted) across all buckets is deferred to its own task** — a DB cascade removes rows, not storage objects.

## Sella detection → birth — 4b (2026-06-12 session, build)

- **Detection memory is its OWN table (`sella_detection`), separate from the visible `deal_detected` chat message.** One row per detection run (no_deal included). It carries the idempotency key, the dedup identity, and the supersession state; the chat message is the derived human-facing view. *Why split:* a `no_deal` run must be remembered for dedup without spamming the chat, and **GDPR** wants verbatim evidence kept only on `forming|firm` rows — a DB check (`sella_detection_no_deal_has_no_evidence`) enforces it. (DDIA: source-of-truth state vs derived view.)
- **Idempotency keys on the last PERSON message, not the newest message.** The guard is `(thread_id, last_message_id)` where `last_message_id` is the newest `sender='person'` message. Detection ignores Sella's own `deal_detected`/`intro` and `system` lines — otherwise Sella's own post would bump the key and re-trigger her (a real bug caught live in the first 4b/4 test). Person-only also keeps the model's context clean (the negotiation, not Sella's notes).
- **Dedup decision is a PURE module (`dedup.ts`):** `decideSurface(prev, next) → none | suppress | post | supersede`. `productKey` (names only, excl qty/price) = the dedup identity; `dealSignature` (verdict + qty/price/currency) = the supersession trigger. The edge fn (outer layer) reads prior state from the DB and carries out the decision — keeps the judgment testable without a DB, same split as `detect.ts`. Supersession posts a fresh message + stamps the old one `superseded_by` (votes never carry over a material change); a trivial repeat is suppressed; `no_deal`/ungrounded → memory row only.
- **Auto-trigger chain = pgmq (durable queue) + pg_cron (10s worker) + pg_net (the cron→edge HTTP hop), scoped to `p2p` threads.** Enqueue trigger on `chat_message` insert (person + message + p2p only) → `pgmq.send` → the cron worker dedups thread ids, `net.http_post`s each to `sella-detect`, deletes the batch. **Durability:** the queue holds the job until dispatch; with the idempotency guard a re-run is free, so a lost detection self-heals on the next message (at-least-once, not exactly-once — a two-phase response-check before delete is the deferred hardening). Worker auth = the **anon** key (not service-role) read from **Vault** (`project_url` + `edge_anon_key`); the edge fn uses its own service key internally. A daily 06:00 UTC cron pre-warms the structured-output grammar via the edge fn's `warm` path (no DB writes).
- **Birth reuses `create_deal_draft` via a new RPC `confirm_detected_deal(message_id, decision)`.** It records the company's vote on the `deal_detected` metadata and, on **both-accept**, births a **Draft** with the confirmer as initiator + the other p2p person as co-owner. Atomic (a `FOR UPDATE` lock on the message) + idempotent (the born card id is stamped on the message, so a near-simultaneous second click gets the existing card). The **AI fence holds**: Sella only suggested; the human's accept is the write. *(Sella 4b, 2026-06-12; verified live, demo rolled back clean. See DECISIONS.md 2026-06-12 Sella 4b.)*

## Sella summaries + intro — 4d (2026-06-12 session, build)

- **Person-waiting Sella jobs run INLINE; data-triggered runs through the queue.** Detection (4b) is queued (pgmq+cron) because a message arrives with nobody waiting. The version-change summary and the first-contact intro are person-waiting (a human just clicked Update / Accept), so they are triggered INLINE from the server action (`editDeal` / `acceptItem`) via `supabase.functions.invoke(...)`, awaited + fail-soft. The Bedrock call still lives in the edge fn (`sella-summarize` / `sella-intro`) so the key stays in Supabase (Path A). The placement rule applied, not convenience.
- **Sella's narration follows the CARD, not one thread.** `sella-summarize` posts the `deal_card_updated` summary to EVERY chat the card lives in: the `deal` workspace thread AND the relationship's `p2p` thread, each tagged `metadata.deal_card_id`. The card pill is already live in both (it reads card state); only the human-readable narration needed propagating. A relationship's P2P thread is its durable home and can host many deals over time, so the card link keeps it readable. The same `deal_card_log` row is written once (`changed_by='sella'`).
- **The summary is a SEPARATE `sella` log row at the edited version** (not an overwrite of the human's edit row), so the Logs tab shows both the person's edit and Sella's "why" (LogsTab already renders a `sella` author with a Sparkles icon). Idempotent per (card, version): one Sella log row max, so the dual-thread post happens once.
- **First-contact intro:** `sella-intro` finds the relationship's `p2p` thread + its seeded `sella`/`intro` message and UPDATES that one line with a Haiku opener, tagging `metadata.generated=true` (idempotent — never regenerates). The static rollout intro is the fail-soft fallback.
- **Hygiene:** Sella's prompts now forbid em-dashes (house style); `tsconfig.json` excludes `supabase/functions/**` so the Deno edge files stop polluting the Next typecheck (the documented fix; tsc clean). *(Sella 4d, 2026-06-12; verified live incl. a browser edit→summary, demo rolled back clean. See DECISIONS.md 2026-06-12 Sella 4d.)*

## Discover catalogue + Request-pricing — slices 4-6 (2026-06-15, build)

- **The openness "level" is DERIVED, not stored.** L0/L1/L2 emerge from two per-product booleans — `profile_visible` (Dial A, show on the public profile) × `price_public` (Dial B, show the price) — computed at render time (no `level` column). A company can mix L1/L2 products; the profile shows L0 when zero products are `profile_visible`, else a card grid where each card shows its price or "Price on request", plus ONE shop-level Request-pricing CTA when any visible product's price is hidden.
- **The "dial floor": all THREE public-read RLS policies gate on `profile_visible`.** `product_public_select` + `product_image_public_select` + `pricelist_item_public_select` each require `profile_visible = true` (prices additionally need `price_public`). The pricelist_item one is **defense-in-depth, not a leak fix** — its EXISTS subquery already inherits `product`'s RLS (transitively closed; verified anon cannot read a hidden product's price), but stating the predicate explicitly removes the hidden dependency, so a future loosening of `product`'s policy can't silently leak prices.
- **Cross-tenant catalogue reads go through a SECURITY DEFINER projection, not RLS.** `get_discoverable_shop(company_id)` (mirrors `get_discoverable_company`) returns a verified company's `profile_visible` products to a not-yet-connected member — `search_path=''`, safe column projection (**never `cogs`/`rrp`**), prices gated by `CASE WHEN price_public`, ordered images via `LEFT JOIN LATERAL jsonb_agg(... ORDER BY position)`, one deterministic price per product from the company's own pricelist. The RLS floor is the backstop for direct PostgREST reads; the RPC is the page's window.
- **Viewer state separates a connect request from a pricing request.** `get_discoverable_company.connection_state` is scoped to `connect`/`connect_message` types; a separate `pricing_requested` flag tracks a pending `pricelist_request` — so asking for pricing no longer flips the Connect button to "Request sent". *(Discover slices 4-6, 2026-06-15; verified by impersonated SQL + an independent SWE review whose one "P0 leak" was a verified false positive. Build + follow-ups F1-F13 in `docs/muskan-build/discover-connect-loop.md`. PR #104 → dev.)*

## Held two-sided deal change — Phase 1 / 4.5.4 (2026-06-17, build)

- **The held change is a transient `deal_pending_change` row committed by SECURITY DEFINER RPCs.** `propose_deal_change` holds the new SHARED terms + seeds the proposer's vote 'accept' (never touches the live card); `confirm_deal_change` commits to base+1 (status stays `draft`) only when BOTH distinct company keys vote 'accept' — the gate reads `votes->>v_ca` AND `votes->>v_cb`, never a generic "all accept", so the proposer alone can't move the shared deal; `withdraw_deal_change` is proposer-only. Every exit `DELETE`s the row (that is the unlock). The lock is a DB UNIQUE index on `deal_card_id` (one active row per deal) — the disabled Edit pencil is only UX. RLS scopes the row to relationship members.
- **Change reasons live in `deal_change_input` (one row per responder) + `deal_card_log` — NOT `deal_confirmation`.** Writing the reason into `deal_confirmation.note` was dropped: `deal_confirmation.status='confirmed'` is the Seal gate's signal, so a change-accept writing it falsely sealed the deal (shared table, two meanings). The strip's Seal control was removed and deferred to the deal's final stage. *(DECISIONS.md 2026-06-17.)*
- **Realtime gotcha (reusable): a table a component subscribes to via `postgres_changes` must be ADDED to the `supabase_realtime` publication, not just given a client channel.** `deal_pending_change` was missing → the lock + pending pill only appeared after a manual refresh; fixed in migration `20260617130000`. RLS still gates which members receive the events. *(Phase 1 / 4.5.4; built + verified 2026-06-17, e2e green; 5 migrations LOCAL only, cloud apply pending — `docs/deploy/cloud-migrations-pending.md`.)*

## Phase 4 auth-gate hardening — `person.preferences` is flags-only (2026-06-17, code review)

- **`person.preferences` is an onboarding-completion flags blob, NOT a profile data store.** It holds `{ onboarding: { email_connected, profile, company_details } }`. Profile display fields — `display_name`, `title`, `phone`, `language`, and `links` (a `{ linkedin?: string }` JSONB bag) — are **direct typed `person` columns**, read/written by `src/modules/profile/index.ts`. Onboarding page code must read them from the `person` row directly, never from `preferences`. *(Source: CR-01 in Phase 4 code review — `onboarding/page.tsx` was silently reading `prefs.display_name` etc. from the flags blob, causing a blank prefill form on every resume. Fixed commit `4e217b9`.)*

## Local Supabase stack uses asymmetric JWT signing — legacy service key dead (2026-06-20, E2E fix)

- **The local stack (CLI 2.75+) auto-generates asymmetric ES256 JWT signing keys** (`GOTRUE_JWT_KEYS=[{kty:EC…}]`), even with `signing_keys_path` unset in `config.toml`. Consequence: the old hardcoded HS256 demo `service_role` JWT no longer authenticates anywhere ("signing method HS256 is invalid").
- **The new `sb_secret_` key works for PostgREST/DB (service_role) but NOT GoTrue admin endpoints** (`/auth/v1/admin/*` → 403 — it's not a JWT, so no `service_role` claim). So any local test/tooling needing `auth.admin.*` (createUser/deleteUser) needs a real ES256-signed service JWT or a direct-DB path; `sb_secret_` alone is insufficient.
- **Tests derive the key from the running stack** (`e2e/fixtures/local-supabase.ts`), never hardcode it — the key rotates per stack recreate. *(Source: E2E auth key-rot fix, 2026-06-20; DECISIONS.md same date.)*

## Path B join-request RPC layer — company-less-caller audit + atomic link discipline (2026-06-22, Phase 12)

- **A company-less caller's `current_company_id()` is NULL, and `audit_log.company_id` is `NOT NULL`** — so requester-side audit rows (`join.requested`, `join.withdrawn`) MUST use the **target** company id (the verified company being joined / the cancelled row's `target_company_id` via `RETURNING`), never `current_company_id()`, or the whole RPC raises a not-null violation. Approver-side rows (`join.approved`/`join.rejected`) may use `current_company_id()` (the approver is in the target company). *(Source: Phase 12 `20260622091500_phase12_join_request_rpcs.sql`; T-12-02-A in the plan threat model.)*
- **`approve_join_request` links `person.company_id` in one transaction under an `... WHERE company_id IS NULL` guard** (+ `IF NOT FOUND RAISE`) — defends the raced-self-onboard case where the requester takes Path A between requesting and approval; the membership grant is definer-side only (§9 keeps `person_group` SELECT-only). *(Source: Phase 12 12-02; mirrors `onboard_company`'s create-then-link pattern.)*
- **`list_pending_join_requests()` does NOT project `target_company_id`** — it filters `target_company_id = current_company_id()` internally, so every row it returns is already the caller's company; downstream UI/tests must assert tenant-scoping via the rows themselves, not a (non-existent) company column. *(Source: Phase 12 12-02 RPC contract; the 12-01 probe was corrected to match.)*

## ⚠️ Open security finding — `person.company_id` is self-writable via RLS (2026-06-22, DEV-88)

- **`person_update` RLS is row-scoped only (`USING/WITH CHECK (id = auth.uid())`) with NO column restriction, so an authenticated user can directly `UPDATE person SET company_id = <any company>` on their own row.** Since tenant isolation everywhere keys on `current_company_id()` (= the caller's `person.company_id`), this lets a user self-join any company and read its private data. Proven by a rolled-back probe (`UPDATE 1`; `current_company_id()` then returned the victim company). Pre-existing base schema (`20260607170000_rls_policies.sql:191`), surfaced during Phase 12 Path-B review.
- **`company_id` writes are meant to flow through ONE trusted path, but RLS doesn't enforce it.** `onboard_company` (Path A) is `SECURITY INVOKER` and *depends on* this self-update to link the founder — so the column can't simply be locked without first moving that write to a `SECURITY DEFINER` path. `approve_join_request` / `remove_member` are already definer.
- **Deferred, not fixed:** it's shared base RLS + the onboarding security model, so the fix (column-level `REVOKE UPDATE (company_id)` + `onboard_company` → `SECURITY DEFINER` + a deny-direct-update probe) needs an Ayush sync and its own focused pass. *(Tracked: [DEV-88](https://linear.app/hellosello/issue/DEV-88) — Urgent. Do NOT close until the deny-direct-update regression probe is green.)*
- **FIX BUILT + PROVEN LOCALLY (2026-07-10), pending cloud deploy + Ayush review.** `20260710120000_person_company_id_lockdown.sql`: `REVOKE UPDATE ON person FROM authenticated` + re-`GRANT UPDATE` on every column **except** `company_id` (a column-only REVOKE is overridden by Supabase's table-level grant — must revoke the whole-table UPDATE then re-grant an allowlist), plus `onboard_company` → `SECURITY DEFINER` so founder onboarding still links `company_id`. Deny-direct-update regression probe (`supabase/tests/person_company_lockdown_test.sql`) is GREEN; profile / onboarding / Path-B join / account-lifecycle suites still pass. **Cloud (production) still has the hole until this migration is pushed** — see the pending-migrations ledger. Keep DEV-88 open until it's deployed to cloud + Ayush has reviewed the base-RLS change.

## Auth

- **Supabase `onAuthStateChange` does not fire across browser tabs.** Email-confirmation completes in the tab that opens the inbox link (`/auth/confirm` runs `verifyOtp`, sets the session cookies, and redirects to onboarding *there*), so a "waiting for confirmation" screen in the **original** tab cannot self-advance. Any future waiting UI that needs same-tab auto-advance must **poll `getSession()`**; otherwise the copy should direct the user to the new tab. *(Source: 2026-07-01; `VerifyEmailCard.tsx` copy fix.)*

## Deal Basket (Phase 7 expansion, 2026-06-29)

- **The persistent cross-company basket needs a new store that does not exist yet** — a `basket` + `basket_line` record keyed by owner + seller company (supersedes ADR-0003 Option-A / Phase-7 D-12's transient basket). Design it via `/gsd:plan-phase 7`; the deal-card terminus (`src/modules/deals/`) is reused unchanged. *(Source: 2026-06-29 design session; DECISIONS 2026-06-29.)*
- **Per-side deal note = a third field category** beyond ADR-0001's *shared+held* and *private+immediate*: **visible to both, editable only by its owner, saved immediately** (no two-sided accept, since each edits only its own). Wire notes on this model, not the held-change path.

## Present catalogue import — `import_products` RPC is INSERT-only (2026-07-07)

- **CSV re-upload does NOT update an existing product — it always inserts a new row.** `import_products(jsonb)` (`supabase/migrations/20260610120000_import_products_rpc.sql`) has no match-by-`supplier_product_code` / upsert logic; re-uploading a CSV containing a product that already exists creates a duplicate, it does not edit the original. Anyone assuming "fix a product by re-uploading the CSV" will silently double their catalogue instead. The real edit paths today are the card's inline batched fields (F-02/F-05) and the manual Add-product form (creation only) — there is no bulk-edit-via-CSV path yet. *(Source: verified while answering Muskan's Present Round-2 fidelity question, 2026-07-07 — see `.planning/phases/07-present-catalogue-ux/07-FIDELITY-CONTEXT.md` "Round 2".)*

## Per-request auth memoization — concurrent Supabase client reads can race (2026-07-07)

- **Multiple Server Components in one render each creating their own Supabase client and independently calling `.auth.getUser()`/`.auth.getClaims()` is a real race, not just inefficiency.** `present/page.tsx`'s `Promise.all([getMyShop(), getCompanyProfile()])` did exactly this — each accessor's own `createClient()` + auth call — and it produced a transient logout-on-save bug (all 3 identity reads on one render returned null, even though the middleware's own check for the same request succeeded). Root cause matches a documented Supabase/Next.js issue ([supabase/supabase#18981](https://github.com/supabase/supabase/issues/18981)) and Next.js's own recommended fix.
- **Fix: `getCurrentUser()` (`src/shared/auth/index.ts`) is now wrapped in React's `cache()`** — one verified auth check per request/render pass, shared by every accessor that calls it (`getCurrentPerson()`, `getMyShop()`, and anything added later). This is the officially documented Next.js pattern (a `cache()`-wrapped `verifySession()` in a Data Access Layer) and Supabase's own `getCachedUser()` recommendation.
- **Still ad hoc:** ~40 other `supabase.auth.getUser()` calls exist across `deals`/`relationship`/`messaging`/`profile`/`allocate`/`connect` — each is inside its own separate Server Action (not concurrent with siblings in one render), so they weren't part of THIS race and were deliberately left untouched. If a future render tree ever calls two of them concurrently (e.g. a new `Promise.all`), route both through `getCurrentUser()` instead of a fresh `.auth.getUser()` call. *(Source: Present logout-on-save bug fix, 2026-07-07.)*

## Deal calendar — frozen columns + module boundary (2026-07-08)

- **`position: sticky` left-freeze is unreliable inside a per-row CSS grid.** Measured in headless Chrome: the sticky Customers column drifted to a negative offset on horizontal scroll (its `getBoundingClientRect().left` went from 128px to −324px), detaching from view — the reported "names vanish when scrolled" bug. The `DealCalendar` freezes its Customers column via a **split-pane** instead (a non-scrolling names column beside a separately horizontally-scrolling day grid); the header stays sticky-top (that axis was never broken). Don't "simplify" the split-pane back to `position: sticky`. *(Source: Sales calendar build, 2026-07-08.)*
- **`@/modules/allocate` imports `@/modules/deals`**, so `deals/components/DealCalendar.tsx` must NOT import allocate back (circular dep). The component declares its own prop types (`CalendarDeal`, `DisplayStage`, `DealCalendarKpis`) — structurally identical to allocate's — and the Sell **page** (the composition layer, which may import both) computes the KPIs via allocate's tested `calendarKpis` and passes them in as a prop.

## Buy (Phase 18) — buyer-narrowing filter duplicated 3x (2026-07-08)

- **The "is this deal_card row's derived buyer === caller" check is hand-duplicated** in `src/modules/buy/analytics.ts`, `src/modules/buy/partners.ts`, and NOT reused from the already-exported, already-generic `narrowByRole()` in `src/modules/allocate/calendarDeals.ts` — each file's own comments admit this. Not fixed this session (scoped out to keep Buy shippable in one sitting); a future change to the buyer/seller derivation rule needs all 3 updated in lockstep or it silently reopens a buyer/seller data leak. Next touch to any of these three files should extract the shared helper into `@/modules/deals` or `@/modules/allocate` and have all three import it.

## Env flip (LOCAL↔CLOUD) doesn't clear the old session cookie (2026-07-10, unverified)

- **Suspected, not confirmed:** flipping `.env.local`'s `NEXT_PUBLIC_SUPABASE_URL` from local to cloud (or back) while the browser still holds a login session cookie signed by the *other* project produced an opaque Next.js dev-overlay error ("[object Object]", an unhandled rejection that isn't a real `Error`). `src/shared/db/proxy.ts`'s `updateSession()` calls `supabase.auth.getClaims()` on every request (its matcher covers almost all routes), and a cookie signed by one project failing signature verification against the other project's keys is the leading theory — a fresh browser session (no cookie) loaded fine against the same cloud env. Never isolated further because the session ended by flipping back to local. If this recurs: **clear cookies / use an incognito window right after flipping**, and if it still breaks, that rules out the cookie theory and points elsewhere (e.g. `getClaims()`'s JWKS lookup itself). *(Source: 2026-07-08/2026-07-10 debugging session.)*

## Concurrent-session branch collision — reconcile via cherry-pick, not re-merge (2026-07-08)

- **Mid-build, `origin/claude/muskan/work` had already absorbed `muskan/sales-calendar` via a separately-merged GitHub PR (#141)** while an isolated worktree agent was independently merging the same branch based on a now-stale local tip. Since the branch's own commits were identical by SHA on both sides (verified via `git merge-base`/`git log <base>..<worktree-branch>`), the redundant merge could be dropped entirely — only the two genuinely new follow-up fix commits (not part of the PR) were cherry-picked onto the current tip, avoiding a messy duplicate-content merge. **Reusable pattern:** before merging any worktree-isolated agent's branch back into a moving mainline, diff the worktree branch against current HEAD first (`git log <base>..<worktree-branch>`) to see what's *actually* still new versus already landed via a different path (a concurrent session, a manually-merged PR, etc.) — don't assume the base you captured at dispatch time is still the tip.

## Product Basket → chat deep-linking (`dealChatUrl`), and its reuse (2026-07-08 → 2026-07-10)

- **`DealPin`'s default deal selection needed zero new logic to show a just-created draft.** `listRelationshipDeals()` orders `created_at desc`; `DealPin`'s mount effect picks `list.find(d => LIVE_STATUSES.has(d.status)) ?? list[0]` — a freshly-born draft is always newest, always a `LIVE_STATUSES` member, so it's always selected first without any bespoke "select the new one" code. The one real gap was that chat had **no URL-based deep-linking into a specific relationship's thread at all** (`ChatView.tsx`'s `selectedThreadId` was pure client state). `dealChatUrl(relationshipId, dealCardId)` (`src/modules/deals/lib/dealChatUrl.ts`) + a `ChatView.tsx` effect reading `?relationship=&deal=` close that gap, reusing the existing `hs:open-deal-card` window-event contract rather than inventing a new one. *(Source: Task 8b, 2026-07-08.)*
- **This plumbing is now shared infrastructure, not single-purpose.** Both the Product Basket's "Draft deal" (picks a customer, then navigates here) and Ayush's independently-built chat "Create Deal" (already knows its relationship) land through the same `dealChatUrl`/`hs:open-deal-card` path — his rework reused it rather than duplicating it, confirmed by reading `origin/dev` before merging. *(Source: reconciliation investigation, 2026-07-10.)*

## Deal card schema hard-blocks a "customer-less" draft — confirmed, not assumed (2026-07-08)

- **`deal_card.relationship_id` is `NOT NULL`** (`supabase/migrations/20260607090003_phase2_deal.sql:153`), and **every table in the deal object graph** (`deal_line_item`, `deal_confirmation`, `deal_workspace`, `deal_member`, `deal_artifact`, `thing`, ...) derives its RLS visibility from that same column via `is_relationship_member(relationship_id)`. `create_deal_draft` raises `'relationship not found'` if it can't resolve one — no default, not optional. There is no RPC or UI anywhere that assigns a relationship to an existing deal after birth. **A relationship-less "draft, pick the customer later inside the card" design is not a small addition — it would need a real nullable-column + RLS-cascade rework**, evaluated and explicitly rejected in favor of the simpler "create only once the customer is known" model (DECISIONS 2026-07-10) — logging the constraint itself here in case anyone revisits the idea without re-deriving it. *(Source: pre-implementation investigation, 2026-07-08.)*

## Living deal card rework orphaned two real features, not just the old create-flow UI (2026-07-10)

- **The responder-side mandatory-reason gate (`ConfirmBar.tsx`) has zero live imports left anywhere.** Ayush's `DecisionBar` redesign (commit `3c40216`) collapsed the old three-outcome held-change model (propose → hold → **accept-without-signing** (stays `draft`) **or** decline, each requiring a typed reason) into two outcomes with hardcoded reason strings: Sign now commits the held change AND confirms/signs the whole deal in one click; there is no more "commit but keep negotiating" state a user can reach. Discovered while rewriting e2e coverage for the new create-flow, not while looking for it — 2 tests (`reason-required`, `gate-accept-decline`) are left `test.skip()`'d pending a product call on whether the reason-gate comes back.
- **`getProductBatches()` (the real, seed-backed batch/THC reader built for BTCH-01) has zero callers anywhere in the app.** Traced via git: it lost its only caller when `DealForm.tsx` was deleted (`e5db6c7`, Ayush); the new create-mode card's batch `<select>` (`3c40216`, same author, 2 days later) uses a hardcoded `MOCK_BATCHES` placeholder list instead of reconnecting to it. Reads like an unfinished wiring gap from a large single-commit rework ("living deal card - create, negotiate diff, sign->invoice->ticket"), not a deliberate feature removal. `batch-snapshot` (e2e) left `test.skip()`'d, not deleted or forced to pass against the mock. *(Source: e2e deal-flow cleanup, 2026-07-10 — full trace in `.superpowers/sdd/e2e-deal-flow-cleanup-report.md`, gitignored.)*

## Deal delivery spine — birth → deliver → pickup (Lane A, 2026-07-20)

- **ONE birth path, ONE delivery call, ONE routing key.** All deal producers (c2c chat, p2p chat, basket, Sella confirm) converge on `create_deal_draft`, which now ends with `perform deliver_deal(v_card)` (`20260720100100`). `deliver_deal` routes on a single fact — *does the born card have a counterparty co-owner `deal_member` (≠ creator)?* **No** → company-target: it writes one claimable `pending_inbox_item` ticket (`type='deal_card'`) for the other company, idempotently, at birth. **Yes** → person-target: SQL no-ops and the app's SEND layer (create-card host / basket send) posts a `type='deal_card'` chat message ("[Sender] has sent a deal", `metadata.deal_card_id`, clickable → `hs:open-deal-card`). Person delivery deliberately lives in the app, not SQL — in SQL it would double-deliver the Sella-detection door (which posts its own `deal_detected` message), and in `deals/` it would create a module cycle with `messaging/`.
- **Pickup is a definer RPC, not RLS.** `claim_deal_ticket` (`20260720110000`) gates on "a live pending ticket addressed to the CALLER's session-derived company" and inserts the claimer as a `deal_member` owner — `member_all`'s `can_access_workspace` RLS can't express this bootstrap (the claimer isn't a member yet) without becoming permissive enough for any member to self-add anywhere. The accept flow branches in `acceptInbox` (type `deal_card` → claim; no relationship mint, no rollout threads, no Sella intro) — the deal's relationship has existed since birth.
- **The chat p2p door now names the counterparty person** (`ConversationListItem.otherPersonId` → `DealPin` → `hs:create-deal-card` detail → `createDeal`), so a p2p-chat birth is person-target from birth. The Sella detect trigger only enqueues `type='message'` rows, so the person-sent `deal_card` message never trips detection.
- **Playwright is pinned to `workers: 1`.** Every e2e spec shares ONE local Supabase, and the deal specs all reset + mint deals on the ONE seeded GreenLeaf↔StonePharm relationship; two workers running two of those files concurrently wipe each other's cards mid-test (proven empirically — per-file `serial` mode cannot protect across files). *(Source: Lane A build, `docs/muskan-build/deal-creation-and-delivery.md`.)*

## Deal chat signals + card redline (2026-07-22)

- **Deal lifecycle events are chat projections, two mechanisms.** The SQL RPC announcements (change commit/decline, in `confirm_deal_change`) are **transactional** with their status change; the new app-side ones (`announceDealEvent` in `deals/actions.ts`, called from `declineDeal`/`signDeal`) are **fail-soft** — the action commits first, a failed announcement only logs. Accepted trade-off of keeping those two as app actions; folding them into RPCs for atomicity is Ayush's call. All five signal types (`deal_card`/`deal_cancelled`/`deal_signed`/`deal_card_updated`/`deal_change_declined`) render through ONE centered clickable pill branch in `MessageBubble` (type-gated, not sender-gated — the Sella-detect trigger only enqueues plain `message` rows, so none of them trip detection).
- **`.dealcard` cannot host sticky/fixed children.** The shell is `overflow: hidden` (rounded clipping) inside the flip container's transform — both break `position: sticky`/`fixed`, so an always-visible in-card footer needs a shell restructure. The header-✓-sends wiring (`registerExitRequest` → `doSendChange({fromExit})`) is the guard that made this acceptable: the one always-visible control now saves instead of discarding.
- **`NegotiationDiff` is a pure model** (pairing by productId + canonical per-gram money); `CardFront` owns the redline rendering inside its product table. Anyone re-adding a boxed diff is regressing the 2026-07-22 prototype-match decision. *(Source: live feedback session 2026-07-22.)*

## `mcp__supabase__apply_migration` doesn't preserve local filenames' timestamps (2026-07-22)

- **`supabase db push` (CLI) records each migration in `schema_migrations.version` using the exact timestamp prefix from the local filename.** The Supabase MCP tool `apply_migration` does not — it stamps `version` with the moment the tool call actually runs, regardless of what the migration file on disk is named. Every time a cloud push happens via the MCP tool instead of the CLI, cloud's history silently diverges from git.
- **This has now happened twice**: the 2026-07-08 Buy-era batch (10 migrations) and DEV-88 + `drop_buy_orphaned_tables`, then again with Lane A's 6 migrations on 2026-07-22 — same cause both times.
- **The fix is metadata-only and low-risk**: a direct `UPDATE supabase_migrations.schema_migrations SET version = '<local timestamp>' WHERE version = '<cloud-stamped timestamp>'` — the same effect as `supabase migration repair --status reverted/applied`, just via raw SQL when no linked CLI session is available. Verify no version collision first; this table only tracks bookkeeping, not schema/data.
- **Prefer the CLI (`supabase db push`) over the MCP tool when the local filename's timestamp needs to survive** (e.g. right before a reconciliation-sensitive operation). When only the MCP tool is available, expect to run this reconciliation afterward — don't assume cloud's history matches git without checking. *(Source: session 66, `dev`→`main` release, 2026-07-22.)*

## Discover realtime — instant connection requests + accepts (2026-07-24, session 70)

- **`useRealtimeRefresh(tables, onChange)` (`src/shared/realtime/useRealtimeRefresh.ts`) is the reusable realtime primitive** — subscribes to Supabase Postgres Changes on N tables and calls `onChange` (typically `() => router.refresh()`) on any change; the general-purpose version of the chat-specific `use-chat-realtime.ts`. Discover watches `pending_inbox_item` + `person_connection` + `relationship`, so a send/accept reflects on both sides live. *(Source: session 70.)*
- **Realtime is secure by construction — it applies each table's RLS SELECT policy to the stream**, so a subscriber only receives rows they may see (a request reaches its target, an accept reaches the requester, nobody else). The socket must carry the user's JWT (`realtime.setAuth`) or it connects as anon and receives nothing. *(Session 70.)*
- **A client list that must reflect a realtime `router.refresh()` MUST derive from props — never snapshot them into `useState`.** `RequestsSection` copied its request props into `useState`; `router.refresh()` re-fetches server data + passes new props, but React preserves client state, so a new incoming request never surfaced. Fix: render `props.filter(!handled)` where `handled` is a local Set of accepted/declined ids (keeps optimistic removal). General trap for server-driven-list + realtime. *(Session 70 — this was the flaky-send bug.)*
- **Adding a table to the `supabase_realtime` publication on a RUNNING local stack does not take effect until Realtime reconnects** — `supabase db reset` (restarts containers) makes it pick up the new table. On cloud, Realtime picks up new publication tables automatically at migration apply time. *(Session 70 — cost ~an hour of "realtime isn't delivering" before diagnosed.)*
## Tier-ladder pricing — one read door (2026-08-16)

- **Volume tiers live in `pricelist_item_tier`; every surface prices through the `current_pricelist_item` view + the pure `resolveTierPrice` resolver.** Shop card, the "See all prices" popover, the basket, and the deal-card hint all resolve a quantity's price through the same view + resolver, so two screens can never disagree about what a quantity costs. Any new feature that needs a price must read through that same door — reading `pricelist_item`/`pricelist_item_tier` directly re-creates exactly the twin-owner drift T05 killed (the `packLabels`/`packSizes` duplicate). Writes go only through `save_price_ladder` (INVOKER RPC; the ascending-rung rule + ownership checks live at the database, not in each caller). *(Source: 0021 tier ladder T01–T07, session 73; ADR-0004.)*

## `create or replace` from a stale copy silently drops guards — repeat live incident (2026-08-16)

- Re-declaring a Postgres function with an old file as the base silently deletes every guard added to the live body since — the redeclare "succeeds", nothing fails, and the hole ships. Second observed instance of this class: **`list_discoverable_companies()` on production lost its verified-caller gate this way** (found during the 0021 build; the repair rides migration E — cloud push URGENT, ledgered 2026-08-14). Standing rule: before any `create or replace`, diff the new body against the LIVE definition (latest-timestamp migration or the deployed body), predicate by predicate, grants included. *(Source: 0021 T08; `docs/deploy/cloud-migrations-pending.md` 2026-08-14 entry.)*

## `REVOKE ALL ... FROM public` does NOT revoke `anon` — a whole class of exposed RPCs (2026-08-16)

- **On Supabase, `anon` is a real role that receives `EXECUTE` on new `public` functions via `ALTER DEFAULT PRIVILEGES`.** `REVOKE ALL ON FUNCTION ... FROM public` revokes the PUBLIC pseudo-role — it never touches a grant held by `anon` itself. So the very common pairing `REVOKE ALL FROM public` + `GRANT EXECUTE TO authenticated` leaves the function **callable unauthenticated** through `/rest/v1/rpc/<name>`. The only correct form is an explicit `REVOKE EXECUTE ON FUNCTION ... FROM anon;`. *(Found by the database linter, lint `0028_anon_security_definer_function_executable`, during the Release 2 push; fixed for the 5 person-graph RPCs in `20260816210000`.)*
- **`CREATE OR REPLACE FUNCTION` preserves privileges** — it does NOT reset `proacl`. Proven empirically before relying on it: re-applying a function definition on top of a live one left `anon` revoked and `authenticated` granted untouched. (Only `DROP` + `CREATE` resets grants — which is why any migration that drops a function to change its return type MUST re-apply its grants, as `20260724101100` does.)
- **Defence-in-depth, not a breach:** in this instance nothing leaked, because every affected body gated on `auth.uid()` (NULL for anon) and the list RPCs also gated on `is_caller_verified()` (false for anon) — probed on production as `anon`, all returned 0 rows and the one write RPC raised before writing. The danger is structural: with the grant open, the function body is the *only* thing standing between the public internet and the data, so any future sibling RPC written without an `auth.uid()` gate is immediately a live hole.
- **✅ CLOSED 2026-08-17 by the full 62-function audit (`20260817120000`).** Lint 0028 on production went **65 → 1** (only `get_public_profile`, which is deliberately anon-reachable for the public `/c/<handle>` QR page — confirmed public in `src/shared/db/proxy.ts`). The audit's three real findings are below.
- **⚠️ THE RULE ABOVE WAS ONLY HALF OF IT — `anon` reaches a function through TWO independent grants and BOTH must be revoked.** Revoking `anon` alone leaves the PUBLIC grant, exactly as revoking PUBLIC alone leaves `anon`. Postgres grants `EXECUTE TO PUBLIC` on *every* function at creation (visible as a leading `=X/postgres` in `proacl`) and `anon` is a member of PUBLIC. Proven on a fresh local reset: after revoking only `anon`, **39 functions were still anon-executable**. The correct form is `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon;` — the 5 person-graph RPCs in `20260816210000` were saved only because earlier migrations had separately revoked PUBLIC from them.
- **Deny-by-default is NOT achievable via `ALTER DEFAULT PRIVILEGES`, despite Supabase's docs recommending it.** Revoking `anon` from the default works; revoking PUBLIC does not — Postgres merges its built-in PUBLIC grant on top of any `pg_default_acl` entry. Verified rather than assumed: revoking `authenticated` the same way DID propagate to a new function, so the stored default is honoured and PUBLIC specifically is not removable. Long-standing behaviour — Postgres BUG #8685 (2013), still open as supabase/supabase#43884, whose reporter settled on the same event-trigger workaround. **Enforcement therefore lives in an event trigger** (`revoke_anon_execute_on_new_function`, `20260817120000` §4) that strips PUBLIC + anon as part of the `CREATE FUNCTION` command itself, proven by `supabase/tests/anon_execute_lockdown_test.sql`.
- **🔴 The audit's real find was NOT an anon hole — it was an `authenticated` privilege escalation.** `seed_company_superadmin(company_id, founder_id)` is `SECURITY DEFINER`, checks **nothing** about its caller, and creates a Superadmin group + grants `team.manage` / `company.edit_profile` to whatever person_id it is handed. It had been granted to `authenticated` by `20260621100000_phase11_rbac_activation.sql`. Proven locally: an ordinary member calling `seed_company_superadmin(current_company_id(), auth.uid())` goes from `has_permission('team.manage') = false` to `true` in one call, unlocking `change_member_role` / `remove_member` / `invite_member` / `deactivate_company`. Same shape as the `person.company_id` hole but through a **function grant** instead of a column grant. Its only callers (`onboard_company`, the Phase-11 backfill) run as the owner `postgres`, so the grant bought nothing. **Lesson: an anon audit must also ask whether `authenticated` should hold the grant — the more dangerous answer was one role over.**
- **Also closed:** `sella_detect_worker` (pg_cron worker; any caller could drain the pgmq queue and drive edge-function HTTP calls) lost `anon` + `authenticated`; `search_joinable_companies` was allowing anonymous enumeration of the verified-company directory.
- **Method note — the safe way to run this class of audit:** classify by catalog first (does the body reference `auth.uid()` / `current_company_id()` at all?), read in full only the handful that reference neither, and **check `pg_policies` for anon/public-facing policies before revoking**, since RLS policy expressions are evaluated with the privileges of the *calling* role — revoking a helper that a policy calls would break the policy. Here no anon-facing policy called any of them.

## Schema drift: `ensure_rls` lived on production and in no migration (2026-08-17)

- **`public.rls_auto_enable()` + its `ensure_rls` event trigger were created by hand in the Supabase dashboard and never written into a migration.** `20260607170000_rls_policies.sql` only referred to it in a comment ("the project's rls_auto_enable already enables it"). So a fresh `supabase db reset` built a database that did **not** match production, and nothing in the repo revealed the difference.
- **Why it matters, concretely.** The trigger switches RLS on for every new table in `public`. `20260607170000` enables RLS in a one-time loop over the tables existing on 2026-06-07, so it protects nothing created after that date. Without the trigger locally, a future table whose migration forgets `enable row level security` diverges: **locally** RLS is off, rows are visible, tests pass; **on production** the trigger switches RLS on, no policies exist, and every query returns **zero rows with no error**. Silent, data-shaped, and untraceable to a trigger that isn't in the repo.
- **Captured by `20260817130000_capture_ensure_rls_drift.sql`**, whose body was copied from prod's live `pg_get_functiondef()` and diffed byte-identical before applying, making it a proven no-op on cloud and a real creation locally. Guarded going forward by `supabase/tests/ensure_rls_trigger_test.sql` (creates a table, asserts RLS is on; plus a standing "no table in public without RLS" invariant).
- **The general rule this cost us:** migrations in version control are the only source of truth — nothing gets typed into the Supabase dashboard. Drift detection is `supabase db diff --linked` before a release, so divergence shows up as a diff instead of as a mystery bug months later. *(Standard practice; cf. Bytebase / Atlas drift-detection guidance.)*

## Applying migrations out of timestamp order (cloud behind local) needs a different proof than `db reset` (2026-08-16)

- **A local `supabase db reset` replays migrations in filename order; a cloud push of a back-dated batch does not.** When local-only migrations are timestamped EARLIER than migrations already live on cloud (Release 2's `2026072410*` vs the already-applied `202607241200*` + tier ladder), the local green run proves "these work in order" — it does NOT rehearse the production sequence, where they land *underneath* newer objects. The two orders differ precisely where an older migration re-declares something a newer one also touched.
- **The four checks that do close the gap** (all cheap, all read-only until the last): (1) query cloud directly for each object the batch creates — absent means nothing to overwrite; (2) diff every `create or replace`d function/policy against its LIVE definition, predicate by predicate and grants included; (3) grep the already-applied later migrations for every object name in the batch — a hit is the stale-redeclare risk, a miss proves order-independence; (4) grep those later migrations for `DROP`s and confirm the batch references none of them (this is the failure that passes locally and fails on cloud). *(Source: Release 2, session 76.)*
- **A true prod-clone rehearsal needs Supabase preview branches, which are a PAID feature** (~$0.013/hr, Pro plan; the Hello Sello org is on Free). On Free, the four checks above plus a local re-apply of the specific colliding migration are the strongest available evidence.

## A wrapped `psql` breaks every runner that passes its file by path (2026-08-20)

- **On a dev machine where `psql` is the shim at `~/.local/bin/psql`, it `exec docker exec`s psql INSIDE the `supabase_db` container.** A host-relative `-f "$TEST_FILE"` cannot resolve there — the runner dies with `No such file or directory` before a single assertion runs. **22 of 35 runners shipped this way**, including `cross_tenant_lockdown`, `person_company_lockdown` (DEV-88's guard), `anon_execute_lockdown`, `ensure_rls_trigger` and `rbac_enforcement`.
- **Not a false-green** — psql exits non-zero and `exec` propagates it. The damage is subtler: a guard that always errors gets skipped, and "I ran the suite" quietly becomes "I ran it some other way". Slug 0022 T01's new suite even *delegated* two of its security assertions to one of the broken runners.
- **The rule: a runner feeds its file on STDIN — `-f - < "$TEST_FILE"` — never `-f <path>`.** Correct for a real psql and for the shim alike. All 35 now do; all 35 pass on a clean `db reset`. *(Found + repaired slug 0022 T01, 2026-08-20.)*
- **The general lesson:** test *infrastructure* gets written once, glanced at, and trusted forever, while the tests it runs are reviewed line by line. This was the third harness defect in one slug, after an `ON_ERROR_STOP` false-green (a suite printing `… PASSED` and exiting 0 while failing) and a seed-pollution trap (e2e runs mutate the DB that SQL suites then assert against). **A broken runner is worse than no runner — it occupies the slot where a check should be.**

## A permission gate is only as strong as the write path to its input (2026-08-22)

- **Giving an existing table a new job as a permission input puts its *write* path in scope, not just its read predicate.** T06 made `relationship` the confidentiality gate for hidden catalogue rows and reasoned carefully about `status = 'active'`, `deleted_at is null`, and why a *pending* connection must not count — all correct, all irrelevant: `authenticated` holds a direct INSERT grant on `relationship`, and `rel_all`'s `WITH CHECK` only requires the caller's **own** company be one side of the pair. Nobody has to consent to being connected to. The attacker never defeats the `status` logic; they write `'active'`.
- **Three instances of one pattern, not three bugs.** DEV-88 (`person.company_id` — a member self-assigns their company, so every company-scoped RLS predicate is self-selected); ADR-0005 round 5 (basket `product_id` stayed writable after insert, so *"the admission policy was ornamental"*); slug 0022 T06 (`relationship`). Each time the gate's read side was analysed exhaustively and nobody asked **who can write the row it reads** — the question never appears because the table already exists and looks like settled infrastructure.
- **The check is two read-only queries, run before the gate ships:** `select grantee, privilege_type from information_schema.role_table_grants where table_name = '<t>'` and `select policyname, with_check from pg_policies where tablename = '<t>'`. If `authenticated` can write it and the `WITH CHECK` does not require the **counterparty's** consent, the gate is ornamental however precise its read predicate is.
- **The remedy is identical each time:** revoke the direct grant, re-`GRANT` every other column, and route the one legitimate writer through a `SECURITY DEFINER` RPC that verifies consent from evidence **it fetches itself** — never from a caller-supplied parameter. Consent evidence usually already travels with the call and simply is not enforced (T06's accept already passed `inbox_item_id`).
- **Severity is set by what the gate protects, not by when the hole was introduced.** A self-writable `relationship` was a bookkeeping-integrity bug for as long as nothing read it for permission; T06 promoted it to a catalogue-confidentiality hole without touching it. *(Slug 0022 T06 G4; `docs/agents/LEARNINGS.md` L-027; closed by T09.)*

---

## A "single owner" of a rule is a claim about agreement with the other doors (2026-08-24)

**The pattern.** When one rule is enforced at several places, the standard remedy is to extract it
into one function and have the sites call that. Slug 0022 did exactly this: `product_visible_to_caller()`
became the single owner of *"may this caller see this product"*, consulted by both the basket write
gate and the basket read projection, and its comment says so.

- **The extraction only fixes drift between the callers you moved.** It silently creates drift with
  every *other* door that answers the same question and was not moved. Round 4 of the ship gate
  found `product_visible_to_caller` and `get_discoverable_shop` disagreeing on **three** terms —
  the seller company's `deleted_at` and `verification_status`, and the unfiled `location` rule.
- **Proving the two new callers agree is the cheap half of the claim.** "Single owner" asserts that
  this function is now *the authority* for the rule, so the audit is a **term-by-term diff against
  every other site that answers the same question** — not a check that the callers share a helper.
- **The catalogue answers it in one query.** `select proname, prosrc like '%c.deleted_at%' from
  pg_proc …` over the functions that project the same entity showed the split immediately: three
  discovery functions `t`, all three new basket functions `f`. Run that before claiming single
  ownership, not after a leak.
- **When a second copy of a predicate is genuinely justified** — here the base-table policy could
  not carry it, because RLS filters rows and not columns, so the rule had to move behind a
  `security definer` boolean — **say so in the file, and name the door it must stay equal to.**
  `20260823100000`'s buyer arm now carries that comment. A copy with a named twin is maintainable;
  a copy that believes it is the only one is not.

**Consequence for the buyer/seller split, which is the shape here:** the *owner* arm deliberately
carries none of the seller-company or unfiled terms — a seller sees their own products whatever
their company's state, and keeps their unfiled `Unassigned` pile. So the rule is "the buyer arm
equals the shop door", not "the function equals the shop door". Hoisting a term above both arms
breaks the seller; two test cells exist solely to fail if someone does.

**Surfaced by:** slug 0022 `/ship` security round 4 (2026-08-24). `docs/agents/LEARNINGS.md` L-038.
Related: [L-036's class — RLS filters rows, not columns](#) — a policy is not a projection.

---

## A migration's end state on REPLAY is not its end state on PUSH (2026-08-24)

**The pattern.** Local development replays the whole migration history from empty on every
`supabase db reset`. Production applies only the *new* files, on top of whatever is already there.
Those two produce the same end state **only if every migration is order-independent** — and a
migration that re-grants, re-creates or re-declares something is not.

- **The failure is invisible locally, by construction.** A migration that wrongly re-grants a
  privilege can be corrected by a *later* migration on replay, so `db reset` is green. On a cloud
  push, that later migration is already applied, so the re-grant is the end state. Slug 0022's
  `20260607090000` re-granted `execute on functions` to `anon`; locally it replayed *before* the
  session-77 revoke and was harmless, and on a push it would have landed *after* it.
- **A back-dated filename makes this worse and is easy to create.** That file is named `2026-06-07`
  but was authored `2026-08-22`, so it sorts ~14 months before cloud's tip. A plain `db push`
  **refuses** it and applies the rest while reporting success; `--include-all` is required, and the
  flag then pushes *everything* local that cloud lacks — so the batch must be verified in both
  directions first (`local-only` **and** `remote-only`) rather than trusting a remembered count.
- **The check that catches it:** for each migration in the batch, ask *"does this statement's
  correctness depend on another migration running after it?"* If yes, it is a replay artefact. Make
  it order-independent, or verify the end state on the target after the push — reading the object
  back off production (`pg_get_functiondef`, `pg_policy`, `has_function_privilege`) rather than
  trusting that applying the file produced what the file says.
- **Filename timestamp ≠ authoring date, and only one of the two tools preserves it.**
  `supabase db push` stamps the filename timestamp into the history table; MCP `apply_migration`
  stamps *call time*, which is what produced the 21-row history drift repaired in session 64. Prefer
  `db push` for anything that will later be diffed.

**Surfaced by:** slug 0022, T08 (2026-08-23) and its `/ship` (2026-08-24).
`docs/agents/LEARNINGS.md` L-034.

## Moving a signal to a new table moves it onto that table's integrity (2026-08-25)

**The shape.** A feature changes *where* a signal is written — from one table to another, or from a
table to a queue, a log, a message. The row's **contents** are reviewed carefully. Nobody reviews
what the destination **guarantees about who may write it**, because no policy was edited and the
diff shows no RLS change.

**The instance.** Slug 0023 moved the company-addressed deal signal off `pending_inbox_item` and
onto `chat_message`:

| | policy | identity guard |
|---|---|---|
| `pending_inbox_item` — signal **removed** | `inbox_insert` (`20260823090000:306-309`) | ✅ `sender_company_id = current_company_id() AND sender_person_id = auth.uid()` |
| `chat_message` — signal **added** | `msg_all` (`20260607170000:300-302`) | ❌ `can_access_thread(thread_id)` — nothing else |

`pending_inbox_item` had been hardened **one slug earlier**, and that migration's own header states
the intent: *"a request may no longer be attributed to someone who never asked."* Slug 0023 then
routed the deal signal onto a table where that sentence is not true — **without editing a single
policy.**

**Why review misses it.** The ADR recorded, accurately, that `chat_message` RLS was *"unchanged —
no policy is widened."* Both halves are true. **And it is the wrong question.** The policy did not
widen; **the signal migrated onto a weaker policy.** A diff-shaped review asks *what did this change
loosen?* and correctly answers *nothing*. The right question is *what did the thing I moved used to
be protected by, and what protects it now?* — which no diff can ask, because the old protection is
not in the diff either.

**The tell.** A change description containing *"we now write X to Y instead of Z"*, alongside a
review line reading *"no RLS/permissions change."* Those two sentences together are the signature.

**The check, and it is cheap.** For every table a change stops writing to and starts writing to,
put the two `WITH CHECK` clauses and the two grant sets **side by side** and diff them by hand.
Ask specifically: **who could forge this row before, and who can forge it now?** Not *did a policy
change* — the whole point is that none did.

**Related and distinct.** **L-027** (*a permission gate is only as strong as the write path to its
input*) is about a gate reading a forgeable value. This is the mirror image: **a value that was not
forgeable becomes forgeable by being relocated**, and the gate never moved at all. **L-036** (*RLS
filters rows, not columns*) is a third member of the family — each is a case where a protection is
assumed to travel with the data and does not.

**Surfaced by:** slug 0023 T01 / HEL-63, `security` finding B1, 2026-08-25. Filed as **HEL-67**
(widened) and **HEL-74**. Ruling recorded in `DECISIONS.md` 2026-08-25.

---

## 2026-08-25 — A message type names a VOICE; RLS governs a WRITER. They are not the same axis, and our vocabulary hides it.

`chat_message.type` and `chat_message.sender` look like they encode the same fact — who produced this
line — and they do not. `sender` has three values (`person`, `system`, `sella`) and `type` has
fourteen, and the product **routinely has one identity speak in another's voice from an ordinary
browser session**: `announceDealEvent` writes four deal-lifecycle pills as `sella` with a NULL author
(`actions.ts:682`), the accept rollout writes `intro` as `sella` and `connection_established` as
`system` (`rollout.ts:110,174`), and it writes a `person` message whose author is the **requester,
not the caller** (`rollout.ts:179`).

The consequence for anyone writing RLS on this table: **"only Sella writes X" is a statement about
the voice, and is never evidence about the writer.** A predicate derived from type names will either
ban writes the product depends on, or permit the ones it meant to stop. The only sound derivation is
a census of the write sites reachable as the role being narrowed.

This is why HEL-67 shipped one type rather than the list its ticket proposed, and why its
sender-forgery half is blocked until HEL-68 moves the rollout's three inserts out of the browser —
at which point `sender` finally *does* line up with the writer, and a predicate becomes possible.

The same shape has a name upstream: a comment on the read path is not a contract for the write path
(L-006). This entry is its schema-level twin — **a column that describes presentation is not a
column that describes authorship**, even when its values look like they do.

**Source:** HEL-67 build, `security_tickets` session, 2026-08-25. See `L-052`, `DECISIONS.md`
2026-08-25 ("HEL-67 ships as one type").

---

## 2026-08-25 — `supabase db reset` rotates the stack secret, and our own resets manufacture "pre-existing" e2e failures

The local Supabase stack issues a **new secret key on every `supabase db reset`**. The Playwright
fixtures resolve that key **once** (`e2e/fixtures/local-supabase.ts` — deliberately not hardcoded,
"the key rotates per stack"). So a session that resets frequently produces:

```
Error: E2E: cannot resolve the local Supabase secret key.
Error: createUser failed for <email>: {}
```

…which then cascades into `page.waitForURL` timeouts across unrelated specs, because signup and
login stop working. The result *looks* exactly like a broad regression.

**This is part of what has been recorded for months as the "pre-existing e2e auth-keys failures."**
Some of that class is genuinely pre-existing; some of it is **manufactured by the measurement
itself**. A full run taken shortly after a reset, or during a session doing repeated resets, is not
evidence about the code.

**Practical rules:**
- **SQL runners are immune** — they go through `psql` with `DB_URL` from `supabase status`, never the
  JS fixtures. A green SQL suite after a reset means what it says.
- **e2e is not.** Before reading an e2e failure as a regression, check whether the stack was reset
  under it.
- This compounds with **HEL-73** (committed specs permanently mutate the shared seed). Together they
  mean a full e2e run currently carries two independent sources of noise, and neither announces
  itself.

**Found by:** HEL-69, while A/B-ing whether a view change broke e2e — the *baseline* arm failed for
this reason, which is what exposed it. Related: **L-048**.

---

## 2026-08-25 — Single-owner delegation compounds: the second rule change is where it pays

The argument for routing a rule through one function is usually made as tidiness. The measurable
payoff showed up this week, and it is worth recording as a number rather than a principle.

**T13** pointed the `product` / `product_image` / `product_media` RLS policies at
`product_visible_to_caller()`. **HEL-69** pointed `current_pricelist_item` at
`product_price_visible_to_caller()`, which wraps it. Both consult the seller's `company` row through
a single `EXISTS`.

**Consequence:** HEL-70 (add `deactivated_at` to the visibility rule) was scoped as an **S** when
filed on 2026-08-24 — four doors, each edited separately, each a chance to diverge. By 2026-08-25 it
is **one edit** to `product_visible_to_caller()` — inherited by the product, image, media,
pricelist-item, tier, basket and price-view doors — plus the three Discover RPCs, which still carry
their own company predicates and remain the outstanding consolidation target.

**The rule.** The cost of consolidating a duplicated rule is paid once; the saving is collected on
**every subsequent change to that rule**, and it grows as more doors delegate. When judging whether
a "single owner" refactor is worth it, the question is not how much duplication it removes today but
**how often that rule changes** — a visibility rule on a marketplace changes constantly.

**Corollary (L-038 restated in the positive):** a single owner is only real if the doors actually
*call* it. `current_pricelist_item` reprinted the rule for months while three other doors delegated,
and it was the reprint that drifted — not any of the callers.

---

## 2026-08-25 — Two doors can agree on a row's existence and disagree on its *state*

**Found while building T02 / HEL-64 (slug 0023), by `plan-checker`. Not reachable in the seed,
so no test and no gate walk in that slug could ever have shown it. Offered at G4 and deliberately
left unfiled.**

The buyer's basket and the connections directory both answer *"which relationships does this viewer
have?"* — and they answer differently:

| door | predicate |
|---|---|
| `basket/supabase/reads.ts:101-104` | `deleted_at is null` |
| `messaging/supabase/connections.ts:119` | `deleted_at is null` **and** `status === 'active'` |

**The consequence, and why it is nastier than a plain divergence.** On a `suspended` or `ended`
relationship the basket still produces a non-null `relationshipId`, so the group is treated as
connected, the connect-first block does not render, and the addressee control mounts. The control
then looks its people up in the *directory*, which does not know that relationship — so the list is
empty. **Permanently, and silently.**

That empty list is **byte-identical to the legitimate case** the same ticket spent a whole
acceptance criterion proving: a connected company that genuinely has no people yet. **Two different
causes, one indistinguishable screen** — and the "correct" one was explicitly designed to look like
that ("never a dead control"). So the failure is not merely invisible; it is *camouflaged by an
intended behaviour*.

**The general shape, and it is a sharpening of [[L-038]] rather than a new rule.** L-038 says a
single owner is a claim about **agreement**, not file count. This adds: agreement has to cover the
**lifecycle**, not just the identity. Two doors that both find the same row, and both filter it the
same way *at the happy path*, can still part company on the states in between — and a state that
never occurs in the seed is a state no local evidence will ever produce.

**Practical rule.** When one module hands another an id, the receiver's *visibility* predicate is
part of the contract, not an implementation detail. Either the id-producer applies the same
predicate, or the receiver must be able to say **"I don't know that one"** distinguishably from
**"I know it and it's empty."** Here it cannot, and that is the whole defect.

---

## 2026-08-25 — A citation nobody can look up cannot go stale visibly

**Found by `builder` during T02 / HEL-64 while fixing two other stale citations. The slug had
already produced seven of them; this is the reason there were seven.**

The basket module's source comments cite decision IDs — `D-04`, `D-06`, `D-08`, `D-12`, `D-14`,
`D-15` — that **have no canonical definition anywhere in the tracked tree.** The IDs are per-phase
and collide across phases. `D-12` alone currently means four different things:

| where | what `D-12` means |
|---|---|
| `DECISIONS.md:1219` | "Inbox" is relabelled "Connection Request" |
| `cloud-migrations-pending.md:1366` | one active pending join request (partial-unique index) |
| `0021-tier-ladder/PLAN-T07.md:108` | price is seller-only |
| `basket/actions.ts` | delivery is `send_deal`'s alone |

**Why this belongs in the architecture record rather than a cleanup ticket.** A line-number citation
is *checkable*: it goes stale loudly the moment someone opens the file, which is how all seven of
that slug's stale citations were caught. An unresolvable ID is **worse precisely because it never
goes stale** — no reader can falsify it, so it quietly stops being true and keeps being copied
forward into new comments as if it carried authority. The slug's own migration header had five such
citations copied forward unverified.

**The rule this yields:** an identifier used as evidence must resolve to exactly one place. If a
scheme is scoped per-phase, the scope belongs **in the identifier** (`P17-D12`, not `D-12`), or the
scheme should not be used in source comments at all. Prefer the thing a reader can open.
