# Decisions Log — Archive: June 2026

> Moved out of `DECISIONS.md` (2026-09-08) to keep the active file short.
> See that file for the current archive index and current-month log.

---

## 2026-06-06 - Connect chat model + Deal card

Locked the Connect post-acceptance experience (Ayush + Claude session): the chat-type model, the connect→chat rollout, the Inbox variant, and the Deal card design + behaviour. Designed with the prototype skill (Inbox + Deal card prototypes, promoted to `prototypes/`).

### Connect chat model + rollout

- **Chat-type model = P2P / C2C / Deal Chat (three types).** P↔C is removed (folded into C2C). **C2C** = a company-level channel (the "Company" filter - messaging on behalf of your company, visible to the whole company). **P2P** = person-to-person. **Deal Chat** = the chat inside a deal workspace. *Why:* once a company is involved it is genuinely company-to-company; a cleaner 3-type model than the old P↔P / P↔C / C↔C split.
- **Connect→chat rollout = 4 inbound request types, all create C2C.** The 4 types: plain `connect` / `connect + message` / `price-list` request (buyer→supplier only) / `connect + deal-card`. **On accept: a C2C is created in all 4 cases** (Sella system message: "the two companies are now connected"). **A P2P also opens for the 3 substantive ones** (Sella system message: "[person] will be working with you"; the note or price-list seeds the P2P). For the deal-card type, the card lands in the P2P as a **deal draft** → on confirm ("start a deal") → the **Deal Workspace spawns** (= deal birth). *Why:* the company connection is the durable fact (always C2C); the working conversation is between people (P2P); the deal-card path gives a clean draft → confirm → workspace birth flow.
- **v1 scope = NO first-contact Sella.** The MVP pipeline is fully human - a person accepts and handles everything. "Sella replies on our behalf" is pitched as the next step, added only if time allows. *Why:* ship the human pipeline first and measure; Sella-on-our-behalf is an enhancement, not a launch dependency.
- **Connect sub-nav: drop "Companies", add "Relationship".** The Relationship tab = a list of connected companies + status; opens the same relationship page reachable from a chat's top bar. A "Deals" sub-nav tab is **undecided** - deals are currently reached via the relationship page. *Why:* "Companies" was a flat directory; "Relationship" carries the actual business state and is the real hub. **— SUPERSEDED 2026-06-07:** no Relationship/Deals sub-nav tabs; the page is reached from a P2P or C2C chat (see the 2026-06-07 entry below).

### Connect Inbox

- **Inbox = Variant A (shared inbox - master/detail + lenses) LOCKED.** Lenses: Unassigned / Mine / All / My-history; claim-or-admin-assign; collision cue = assignee avatar + "handled by X"; live viewing/typing presence deferred to v2. Variants B (one-at-a-time screening) and C (ops/bulk table) are parked for v2. *Why:* read-then-act fits a team that handles each connect-request with care, and it drops into the existing Connect 5-panel shell so later screens inherit the pattern.

### Deal card

- **Deal card = one `deal_card` entity with a `doc_type` discriminator.** The type = who authored it: a **PO card** (buyer→seller) or an **SO card** (seller→buyer) - "two card types under one entity". *Why:* a purchase order and a sales order are the same artifact authored from opposite sides; one entity + a discriminator avoids two near-duplicate tables.
- **Role-based views, no toggle.** The seller sees a **Margin** field; the buyer sees a placeholder metric (name TBD). *Why:* margin is seller-only commercial data; serving each role its own view (rather than a hideable field) keeps the buyer's app from ever receiving it.
- **Front = facts, back = SIGNALS (per-viewer).** The front holds deal facts; the back holds Choco-AI-style insights, generated per viewer. **Half-card = a pre-connection gate** shown in the inbox only; in the chat the card is **always full**. Products render as a **line-item list with a small square thumbnail** on the left (the thumbnail will later open that product's card - not built yet). Git-style version history. Flip control = top-left. *Why:* facts up front for fast reading, signals behind for the per-side intelligence; the half-card gates pre-connection while the full card is the working object once you are connected.
- **Deal card placement in chat = deal selector + pinned deal box.** A **deal selector** ("Talking about: [current deal]", defaults to the current deal) + a **pinned deal box** at the top of the chat → click → the card opens (flip / close). **Sella stays in the right panel** - no swap, no floating card. *Why:* keeps the active deal one click away without crowding Sella out of her panel.
- **Deal Workspace spawns at deal-card birth** (= the moment the deal-draft is confirmed). *Why:* the workspace is the deal's container; it should not exist before there is a confirmed deal to contain.

### Sella + scope

- **Sella = multiple AI workflows under one face.** The UI may show distinct "Sellas" wherever it fits; internally they are just workflows - so UI placement is unconstrained by an "only system voice" rule. *Why:* "Sella" is a single product persona over many workflows; the UI is free to surface her wherever she helps.
- **Deal Room = CUT** (removed from scope). "Open full page" now points to the **Deal Workspace**. *Why:* the Deal Workspace already is the full deal surface; a separate Deal Room duplicated it.

## 2026-06-06 - Phase-1 schema gaps resolved + company category

Validated the Phase-1 schema against the `phase-1-onboarding` prototype and a Phase-2/3 cross-check; resolved the last open build-questions and added one new requirement (Marcel).

### Phase-1 schema gaps (resolved)

- **B2 — HS-team allowlist = new `hs_team_member` table** (platform-level, no `company_id`; FK to `person`, role reviewer/admin; grant/revoke audited). *Why:* a privilege boolean on the user's own row risks self-escalation; a table is auditable + listable. Rejected `person.is_hs_team` and env-var.
- **B3 — domain-collision override = `company.metadata.domain_collision`** (sparse, HS-only review flag). *Why:* rare, review-only signal → JSONB metadata, not a column.
- **B4 — rejection reason = derived from `audit_log`** (latest `company.verify_rejected`); resubmit is auth-gated, reuses `company_license_file`. *Why:* single source of truth; no `rejection_reason` column, no token table.
- **Cleanups:** onboarding checklist = derive "done", store only `dismissed` (in `person.metadata`), "skipped" → future `analytics_event`; **superadmin = `person_group` only** (`is_superadmin` boolean dropped); contact tags = customer/supplier/partner/prospect/other (NULL = unclassified); **enums store the `code`, not the display label** (EN/DE translated in app). *Why:* don't store what you can derive; one source of truth; codes decouple from display text.

### Company business category (Marcel)

- **Companies pick one or more business categories at setup** — `company_type` lookup (cultivator / wholesaler / importer / pharmacy …) + `company_type_assignment` junction (multi-select). **A stable "what the business is" attribute, NOT a buy/sell role** (buyer/seller stays per-deal, driven by actions). *Why:* supply-chain category drives matching/discovery; vertically-integrated cannabis firms commonly hold several licences (→ multi-select); deliberately kept distinct from the locked "no buy/sell type on company".

### Open (next session)

- ~~**`pending_inbox_item` needs `request_type` + `assigned_to`** before it locks~~ → **RESOLVED 2026-06-06** (Ayush's 5 answers). Added `type` → new `inbox_request_type` lookup (seed: connect / connect_message / pricelist_request / deal_card); **one owner field** `assigned_to` + `assigned_by` provenance (NULL = picked up, set = assigned) — replaces `picked_up_by`; status lookup → `pending` / `accepted` / `rejected` (**`picked_up` retired** — "assigned" is derived from `assigned_to`, not a status); nullable `deal_card_id` FK set only for the `deal_card` type (CHECK-guarded); lenses (Unassigned / Mine / All / My-history) + reassign rules (claim if unassigned; owner-or-Superadmin to reassign; every (re)assign → `audit_log`) recorded in `SCHEMA-DRAFT`. *Why:* a lookup makes a new request type an INSERT not a migration; one owner field matches Zendesk / Front / Intercom; a real `deal_card_id` column (not a metadata link) keeps the reference from getting lost.

## 2026-06-06 - Path B (join-existing-company) deferral — engineering posture

Path B (a person joins an existing company → request routes to that company's Superadmin → approval grants membership) is **locked in design** (B1, 2026-05-29) but **deferred in build**: v0 ships Path A only (one user per company, seeded test IDs). Recorded so the deferral is deliberate and v0 doesn't paint us into a corner.

- **Deferring Path B is low-cost because it adds no new data shape or security state — it extends one v0 already has.** A `person` is born with `company_id = NULL` at signup; the gap between sign-in and company-setup is already a "logged-in but company-less" user. Path B just makes that gap last until a Superadmin approves instead of seconds. Same state, longer duration.
- **What's deferred is all additive:** the `join_request` table, the approval side-effect (set `company_id` + role + audit), and the Path B screens (existing-or-new / pick-company / waiting / admin-approval surface). None alter an existing table — a later `CREATE TABLE` breaks nothing. No migration penalty for waiting; v0 omits the `join_request` table.
- **Two invariants v0 MUST honor now (free — the onboarding window needs them anyway):** (1) `person.company_id` stays **nullable** and is read through **one accessor** (e.g. `currentCompany()`), never scattered — so the company-less case is a one-place fix later, not a 50-file hunt. (2) **RLS must fail safe on a null `company_id`** — a company-less user sees only their own rows, nothing tenant-scoped (equality policies like `company_id = my_company()` return nothing when null = the safe default). Get this right for onboarding and Path B's pending-joiner inherits it for free.
- **Open (unspecified, not blocking):** *where* a Superadmin reviews pending join requests is not yet designed — the data + routing default ("any Superadmin of target company", B1) are locked, but the UI surface (Settings → Team? notification? badge?) is not. The Connect inbox does NOT cover it (that's company↔company connections, a separate aggregate).
- **Tie-in:** the company-category step (above) is **Path-A-only** — a Path B joiner inherits the company's existing categories, so onboarding forks after "existing or new?" and the multi-select lives only on the new-company branch.

*Why:* the expensive design (separate `join_request` aggregate, nullable membership) is already done; the only retrofit risk is the security boundary + scattered `company_id` reads, both required by v0's own onboarding window — so honoring them now makes "add Path B later" a purely additive feature, not a schema/RLS refactor.

## 2026-06-06 (later) — Connect chat (screen ②): two-party deal gate + P2P↔Deal sync

Prototyped + locked in `prototypes/chat-prototype` (full narrative: that folder's `CONTEXT.md`). Builds on `## 2026-06-06 - Connect chat model + Deal card` above.

- **The chat screen is POST-ACCEPTANCE only.** The Pending/accept step lives in the **Inbox** (already built); this screen begins after accept. *Why:* one responsibility per screen — the Inbox owns accept/decline, the chat owns post-connection life; no duplicated accept logic.
- **Deal birth = a TWO-PARTY confirmation gate.** A deal-card → Sella posts `deal_detected` ("both of you, want me to draft it?"). **Both** parties must confirm → `workspace_created` + Deal chat spawns. **Either declines → the deal is cancelled and archived** (no workspace; they stay connected). *Why:* a deal is a mutual commitment; per-party votes (`null→yes/no`) let the audit log record who agreed and who killed it. Refines the earlier "on confirm → workspace spawns".
- **P2P↔Deal-chat sync = via the DEAL CARD, not messages.** **Deal chat = ground truth** (official, all participants); **P2P = where people actually talk** (private, mixed chatter). **Messages are never synced.** The **deal card is the single shared truth**, shown identically in both chats and **versioned** (v1→v2→…). *Why:* a clean bounded-context boundary — P2P is private, the company/Deal-chat shared, the deal card the published language between them; only a confirmed structured fact crosses.
- **On a deal-affecting change, Sella TAKES INPUT (does not author).** A *suggested* delta + **a note each user writes** (Sella = scribe). **Change from the P2P** → card v2 in both chats + a **per-user `deal_card_updated` system message into the Deal chat** (each note shown individually; everyone sees) + a `deal_card_log` entry + per-user `deal_change_input` evidence. **Change from the Deal chat** → card v2 + log + evidence, **no broadcast** (broadcast fires only when `origin != deal_chat`). *Why:* humans stay the authors of business intent; the system message is a projection of a log entry, so de-duping the broadcast costs one rule.
- **Deal-card LOG** lives on the **card back** behind a filter (`Signals | Logs`, extensible); records version / what / who / when / why; feeds the **audit log**. *Why:* the card back is a multi-view surface; the change history is also the audit trail (one source).
- **Deal card in chat = a thin pinned pill** (`Deal card ▸`, pink) on the `Talking about:` row → click opens the full **flip-card dialog** (front = facts + scrollable products reflecting the version; back = the Signals/Logs filter). *Why:* progressive disclosure — the header says "a deal lives here," detail is one click away.
- **C2C clarification (supersedes LAYER-1 §3):** C2C is a **company-level channel created at connection** (the company notice board / audit log), not deal-scoped. LAYER-1 §3 still describes the old "C↔C only inside a deal workspace" model and is **stale** — flagged for a docs pass.
- **Multi-deal in one P2P stays parked on [DEV-37](https://linear.app/hellosello/issue/DEV-37)** — explicitly out of scope for now.
## 2026-06-06 - UUID primary keys = v4 for now (revisit on PG18 / audit_log growth)

Keep the locked convention — PKs stay **v4** (`gen_random_uuid()`, native, zero-dependency). Considered UUID **v7** (time-ordered) for better index locality on append-heavy tables; researched + discussed, decided to wait.

- **Why not v7 now:** Supabase is on **PG17** with **no native `uuidv7()`** (PG18-only) and **no `pg_uuidv7` extension** available (checked the live project — only `uuid-ossp`). v7 today would need a hand-rolled PL/pgSQL function or fragile app-side generation — not worth it at current scale.
- **Why staying on v4 is safe:** v4's index fragmentation only bites **large, high-write** tables (millions of rows + sustained inserts) — i.e. only `audit_log` here; low-volume tables (company / person / group / …) never feel it. v0 is 1–2 test users.
- **Switching later is cheap — NOT a re-key:** v4 and v7 are the same `uuid` type, so adopting v7 = changing a column's **default** for new rows (one line); old rows stay v4, mixing is fine, and it "stops the bleeding" for inserts going forward. The expensive full re-key (rewrite old rows + every FK) is "almost never worth it" and we'd skip it. *(Corrects an earlier overstatement that switching later meant a painful FK re-key.)*
- **Revisit triggers:** (1) Supabase ships native `uuidv7()` (PG18) → `SET DEFAULT uuidv7()` on new / high-write tables; (2) `audit_log` crosses ~1–5M rows → flip its default to v7 then (captures ~all the benefit, since it only grows).

*Why record:* makes the v4 choice deliberate (researched, not default-by-omission) and stops it being re-litigated; documents the cheap upgrade path. No convention change (staying = status quo) → no Ayush ack needed. (Sources: andyatkinson "Avoid UUIDv4 PKs", Scaling Postgres #368, dev.to "UUIDv7 is the 2026 default" + "UUID best practices".)

## 2026-06-07 — Relationship page (screen ③): nav, content, layout

Prototyped + locked in `prototypes/relationship-prototype` (full narrative: that folder's `CONTEXT.md`). The Relationship page is the persistent record between two companies — "the heart of the platform."

- **Reached from a chat, not a tab — one page, two doors.** The page opens from a **P2P** or a **C2C** chat; both land on the **same company↔company page**. **There is no person-level relationship page** — *this answers DEV-8's never-closed sub-question: there is none.* *Why:* a relationship exists with a person or a company, so you reach it through whoever you're already talking to — the chat is the index, the page is the detail. A flat "all relationships" list/filter is **future**.
- **No `Relationship` and no `Deals` sub-nav tabs** — **supersedes the 2026-06-06 "drop Companies, add Relationship" line above.** Deals live *inside* the relationship page; a cross-company Deals surface moves to a **future Grow/Trade** surface.
- **Two altitudes (the organizing rule).** Relationship-level content lives on the page (header, Sella insight, analytics, log, notes, terms, pricelist, artifacts); deal-level content lives on the deal card / inside the deal (per-deal SIGNALS, per-deal docs). One question — *relationship or one deal?* — decides where everything goes. *Why:* keeps a rich page from becoming a junk drawer; it's also what made the tabbed layout possible (stable top band + zoomed-in tabs).
- **Layout = tabbed.** Top band = header (the two company logos joined by a bridge mark — **no person names**, it's a company connection) + **Sella insight** and **Analytics** side by side; below, tabs: Overview · Deals · Notes · Terms & prices · Docs.
- **Deals = progressive disclosure, not an inline dump.** A peek on Overview + a **Deals tab** filterable `All / Active / Old / Cancelled` → each deal → its Deal Workspace.
- **Two kinds of note, both kept (different jobs):** a per-side **team note** (business, visible to your own company — "their next batch lands in ~4 months") and a per-user **personal note** (private to you, relationship upkeep — "their kid's birthday is in 4 days"). Resolves "which box?" by purpose.
- **Artifacts = shared company-wide documents** on the page (licenses, contracts, certs). **Deal-wise docs (COAs, badges) stay inside the deal** — the two-altitudes rule applied to documents.
- **Custom pricelist:** both sides read; **seller writes, gated by approval** (Proposed → sign-off → Applied, per DEV-41). **Agreed terms** visible to both sides (edit workflow deferred).
- **Box → dialog pattern.** The Sella insight and Analytics boxes show an overview + a "more" button that opens a **dialog with a blurred backdrop** (open → read → close). Sella dialog = what's-happening + how-to-grow (action cards); Analytics dialog = KPIs + bar charts + a pie. *Why:* keep the page calm, push depth one tap away — the same progressive-disclosure grammar used by the deal-card pill and the deals list.
- **Side-aware (a per-viewer projection):** per-side team notes hide across the boundary, PRIVATE deals hide from the other side, only the seller edits the pricelist. `note.side` + `note.scope` + `deal.private` drive it.
- **Deferred:** first-contact document collection (the old "pending inbox migrates onto the page" flow — built on the retired P↔C type); if built later it lives in the **Inbox**, and its docs land in **Artifacts**. Agreed-terms edit + multi-approver pricelist sign-off (per DEV-41).

*Why record:* screen ③ is the third Connect atom locked; this fixes the sub-nav model (correcting :518) and closes DEV-8's person↔person question. (Source: `prototypes/relationship-prototype/CONTEXT.md`.)

## 2026-06-07 — Phase 2 schema: deal_line_item, deal_card columns, deal_delivery separation

*(Discussed session 5. Full table shapes in `docs/architecture/SCHEMA-DRAFT.md` → "Phase 2 tables" section.)*

- **`deal_line_item` versioning = Option A (versioned snapshots, not mutable + diff-replay).** Each version bump of `deal_card` copies all line items with the new `version` number. Unchanged lines are duplicated; changed/added lines are new rows at the new version. Query current = `WHERE version = card.version`; reconstruct v1 = `WHERE version = 1`. *Why:* regulated industry (cannabis pharma) needs read-only historical snapshots — any diff-replay bug would corrupt audit reconstruction, which is unacceptable when a dispute arises. The cost (a few extra rows at ~3–15 line items × ~5–10 versions per deal) is negligible. Industry norm: Stripe freezes invoice line items per version; every B2B order system treats historical line items as immutable snapshots.

- **`deal_card` gets structured delivery/commercial columns — not metadata.** Added as first-class columns: `offer_expires_at` (B2B quotes always expire; Sella monitors), `delivery_date_target` (buyers filter + sort by it), `payment_terms_code` (NET30/NET60/COD — cannabis pharma uses 40–90 day windows, already noted as domain fact; lookup table), `incoterms_code` (EXW/DAP/DDP — determines who pays shipping/insurance in cross-border cannabis trade; lookup table). Also: `buyer_po_number`, `seller_so_number` (generated at confirmation per Layer 3 lock). *Why first-class over metadata:* columns that are filtered, sorted, or validated by Sella/app-layer policy earn a column; display-only or shape-unknown fields stay in `metadata JSONB`. Country of origin stays in `metadata` for now (not filtered in MVP).

- **`deal_line_item` gets cannabis-specific potency columns: `thc_percent`, `cbd_percent` (nullable).** *Why first-class:* regulatory-grade fields — Sella validates potency against license thresholds; buyers filter by potency range. These are not decorative metadata; they have invariants and will be queried. Nullable because non-cannabis products (material suppliers, Phase 2+) carry neither.

- **`deal_delivery` is a separate table, NOT part of `deal_line_item`.** `deal_line_item` answers *"what was agreed"* (versioned, immutable per version). `deal_delivery` (Phase 3, DEV-36) will answer *"what was shipped"* — batch numbers, Certificate of Analysis files, actual delivered quantities, delivery note + invoice uploads (Sella OCR amends the deal). One deal can have N deliveries (DEV-53 — "Done fires on final pair"). *Why the separation:* mixing "agreed terms" with "physical execution" in one table forces nullable columns on both sides and breaks the single-responsibility of line items as a versioned commercial record.

- **`relationship` canonical ordering: `CHECK(company_a_id < company_b_id)` + `UNIQUE(company_a_id, company_b_id)`.** Enforces exactly one `relationship` row per company pair regardless of who initiated. `initiated_by_company_id` records direction. *Why:* without canonical ordering, Company A↔B and Company B↔A are indistinguishable to the DB; the check + unique constraint makes the pair an unordered set at the storage layer while preserving direction in a separate column.

## 2026-06-07 — Q3: Two-party confirmation state = dedicated `deal_confirmation` table

Per-party yes/no for deal birth and amendments lives in a dedicated `deal_confirmation` table, not JSONB on `deal_card`. `deal_card.status` gains `'withdrawn'` as a terminal state.

- **`deal_confirmation` table:** one row per `(deal_card_id, version, company_id)`. Status: `pending` / `confirmed` / `rejected`. Two rows created when a version is proposed; each party updates their own row. Both `confirmed` → version accepted (workspace spawns on v1; version bumps on amendments). Either `rejected` → back to negotiation.
- **`withdrawn` on `deal_card.status`:** the initiating company pulls the offer back before the other party has responded (`deal_confirmation.status` still `pending`). Terminal. App-layer enforces: only `initiating_company_id` may set it, only while other party is pending.
- **Why a table over JSONB:** JSONB stores only current state — you lose "when did company_b change to confirmed" without a separate audit table, defeating the point. The `deal_confirmation` table gives indexed queries ("deals awaiting my company's confirmation"), per-event timestamps, a natural `audit_log` target, and clean versioning across amendments. Regulated environments (cannabis pharma) require per-event non-repudiation — a table is the natural fit.

*Full table shape in `docs/architecture/SCHEMA-DRAFT.md` → `deal_confirmation`.*

## 2026-06-07 — chat_thread P2P uniqueness: canonical ordering enforced at DB level (Q2)

`chat_thread` P2P threads store `person_a_id` + `person_b_id`. Without a rule, the same two people could get two thread rows if inserted in different order `(Alice, Bob)` vs `(Bob, Alice)` — the UNIQUE index alone doesn't catch this.

**Decision:** enforce `CHECK (person_a_id < person_b_id)` at DB level. App must sort the two person UUIDs before inserting — smaller UUID goes in `person_a_id`. Identical pattern to `relationship.company_a_id < company_b_id` (already locked).

*Why DB level, not just app:* the DB is the last line of defense — edge functions, scripts, and future code paths bypass the app. One bad insert = a duplicate private thread with split message history.

*Why this pattern works:* UUIDs are strings; `<` comparison is deterministic. The canonical ordering is arbitrary but consistent — what matters is there is exactly one rule, enforced everywhere.

**SCHEMA-DRAFT.md updated:** `chat_thread` constraints block now includes `CHECK (type != 'p2p' OR person_a_id < person_b_id)`.

## 2026-06-07 — Deal Workspace (screen ④): contents + layout (resolves DEV-9)

Prototyped + locked in `prototypes/deal-workspace-prototype` (full narrative: that folder's `CONTEXT.md`). The Deal Workspace is the deal **container** - **Layer B (invited participants only)**, auto-scaffolded at Deal Card birth. This closes the open **[DEV-9]** ("what's inside a deal workspace + how should it look").

- **Two entry points:** the Relationship page's deals list ("Open workspace →") and a **⤢ button on the Deal Card** itself. Inside, the card lives **in the deal chat** (a pinned pill), not as a separate box.
- **Layout = an A&C mix** (after comparing 3 layouts): header + a **shrunk one-line Deal-Sella** on top; **left = a tabbed panel** `Things · People · Documents`; **right = the Deal Chat as the wide hero**. *Why:* the workspace is an *operating* surface (work THINGS while watching the chat), so the chat leads - whereas the relationship page (③) is a *reading* surface, which is why its calm tabbed layout won there. The surface's job picks the layout.
- **The Deal Card is the canonical flip card everywhere** - the pinned `Deal card ▸` pill opens the same card as ①/② (FRONT = facts + products, margin seller-only; BACK = `Signals | Logs` filter). No workspace-special card.
- **Change history lives in the card's LOGS, not as chat messages.** Removed the "card amended to v2…" status line + in-chat update messages. *Why:* one source of truth for change history (the card log) - a chat copy would be a second source that drifts; same instinct as ②'s "only the card is synced."
- **THINGS are the visible work primitive, grouped by domain** (Finance / Logistics / Delivery), with a done-count + progress; any party adds; Open→Done; **approval THINGS = e-signature** (the Draft confirmation gate, both sides). **Stages are NOT a UI element** (scaffolding only - reaffirms DEV-24/34).
- **Lifecycle Draft → Confirmed → Done.** Draft = the e-sign confirmation gate (+ per-party `deal_confirmation`); **Done = delivery note + invoice both attached** (document-driven, no explicit Done click; Deal-Sella OCR-amends the card to actuals).
- **Documents are DEAL-level** (COA, contract, delivery note, invoice). Company-wide docs stay on the Relationship page (the two-altitudes rule).
- **Deal-Sella** is per-deal, **neutral**, one read; it speaks in the deal chat. **Side-aware:** margin seller-only, "(you)" + topbar follow the side.
- **Deal Room is OUT of screen ④** - it's the customer-*presentation* surface (product media, Loom, share link), a **Present-surface** tool distinct from the *execution* container. *Resolves the doc-vs-Linear divergence:* CLAUDE.md "Deal Room = CUT" vs Linear DEV-22/52 "Deal Room live & distinct" → the truth is **out of Connect ④, lives in Present**.

*Why record:* screen ④ is the **last Connect atom** locked; this closes DEV-9 and triggers the LAYER docs reconciliation pass (§3 / §4.1 / §4.3 / §4.4 + LAYER-3). (Source: `prototypes/deal-workspace-prototype/CONTEXT.md`.)

## 2026-06-07 — Phase 2 schema: 3 screen ③ tables locked (`relationship_note` / `_term` / `_artifact`)

Ayush's screen ③ lock + PR #39 merge unblocked the three Relationship-page tables. Walked through one at a time, research-first; reshaped his `note` / `agreed_term` / `artifact` sketches against schema conventions.

- **`relationship_note` — one table + `scope` column (`team` / `personal`).** Both kinds of note (team-visible business notes + personal relationship-upkeep notes) live in one table with a discriminator. *Why not two tables:* same fields either way (body, author, timestamp, FK to relationship); two tables = duplicated audit columns, duplicated RLS rules, duplicated query paths, for zero gain. One table + `scope` is the Salesforce/HubSpot pattern. *Personal scope = strictly author-only* — even teammates and Superadmins do NOT see another person's personal notes; matches the word "personal" and prevents self-censorship. Cost: if someone leaves, their personal notes are lost to the company — accepted (loosening later is additive; tightening would break trust).

- **`relationship_term` — proposal/accept flow with controlled vocabulary.** Standing agreed terms (payment terms, incoterms, MOQ, exclusivity, delivery lead time) live in `relationship_term` with a `pending` → `accepted` / `rejected` state machine mirroring `deal_confirmation`. One side proposes a row; the other side accepts (becomes in-force) or rejects. To change later, propose a new row; on accept, the old in-force row gets `superseded_at = NOW()` and `superseded_by_id = new.id`. *Why proposal/accept over either-side-edits-freely:* regulated industry — silent term changes ("wait, who changed our payment terms?") = real money. Audit log catches abuse after the fact, but a gate prevents it. *Why not pure key/value (Ayush's `agreed_term { key, value }` sketch):* EAV anti-pattern (Postgres community flags it strongly — typos become data, ugly queries, no per-type validation). **Mitigation:** new `agreed_term_type` lookup controls the key space — 5 seeds (`payment_terms`, `incoterms`, `min_order_qty`, `delivery_lead_time_days`, `exclusivity`) + `value_format` hint (`enum`/`number`/`text`/`boolean`) to drive UI. New term type = INSERT into lookup, no migration. *Not redundant with `deal_card.payment_terms_code` / `incoterms_code`:* the relationship-level row is the **standing agreement** (currently in force, mutable); the deal_card columns are a **frozen snapshot** of what was agreed for that specific deal — must stay independent so changing the standing agreement doesn't silently rewrite past deals. Same pattern as `pricelist` → `deal_line_item.unit_price` snapshot.

- **`relationship_artifact` — file metadata table; bytes in Supabase Storage.** Clones the `company_license_file` pattern (A3 lock 2026-05-28) — `storage_path` + scan_status + magic-byte validation; bytes live in a private bucket with RLS on `storage.objects`. New `artifact_category` lookup with 5 seeds (`contract`, `nda`, `certificate`, `marketing`, `other`) for grouping. *Visibility:* both sides of the relationship can READ (relationship-scoped = shared by definition); only the `uploaded_by_company_id` side can edit / soft-delete. No `personal` scope here — these are organizational documents. *v0 file constraints:* MIME allowlist = `application/pdf` only (contracts get exported to PDF anyway; keeps upload surface tight for security); size cap = 20 MB. Expand later if Marcel asks. *Deal docs (COA, contract for this deal) do NOT live here* — they live on the deal; this is the two-altitudes rule applied to documents (per screen ③ lock 2026-06-07 above).

- **Lookup rename: `license_scan_status` → `file_scan_status`.** The pending/clean/infected/scan_error values aren't license-specific — they're generic file-scan outcomes. Renamed now while it's free (no migrations written yet) so `company_license_file`, `relationship_artifact`, and the future `pricelist` table all reference one lookup.

- **`audit_log` seeds added (6 new action types + 3 new content types).** Action types: `relationship_term.proposed` / `.accepted` / `.rejected` + `relationship_artifact.uploaded` / `.downloaded` / `.deleted`. Content types: `relationship_note`, `relationship_term`, `relationship_artifact`. *Why upfront:* audit_log seeds are the same kind of work as schema seeds — easier to ship together than backfill later.

- **Deferred this session:**
  - **`buyer_metric` column rename on `deal_line_item`** — still TBD. Column ships as `buyer_metric` placeholder in the migration; rename later is a single `ALTER COLUMN`.
  - **`pricelist` table shape** — pending Marcel on PDF vs CSV vs structured. MVP scope confirmed: **one standard company-wide pricelist** (relationship-level custom pricelist + DEV-41 Proposed→Applied sign-off deferred post-v0). Researched B2B pricing patterns (Red Gate, BetterCommerce); concluded versioning isn't needed for MVP because `deal_line_item` already snapshots prices at deal time — the deal keeps its own receipt, so the pricelist table doesn't need to.

*Why record:* closes 3 of the 5 Phase 2 open schema questions (`relationship_note`, `relationship_term`, `relationship_artifact`) and absorbs the lookup-rename housekeeping into the canonical record. With these locked, the only remaining blockers before writing Phase 1 + Phase 2 migrations together are Marcel's pricelist format decision + the `buyer_metric` name (non-blocking — placeholder ships in v0). *Full table shapes in `docs/architecture/SCHEMA-DRAFT.md` → Phase 2 tables.*

## 2026-06-07 (session 8) — Phase 2 schema: 4 screen ④ tables locked (`deal_workspace` / `deal_member` / `thing` / `deal_artifact`)

Ayush's screen ④ lock + PR #40 merge unblocked the four Deal-Workspace tables. Walked through one at a time, research-first; reshaped his `deal_workspace` / `member` / `thing` / `artifact` sketches against schema conventions.

- **`deal_workspace` — separate container table (Option B), not columns on `deal_card`.** The workspace is the **Layer B invited-only container**; the card is the **cross-company versioned agreement**. Two altitudes, two tables. *Why separate over adding columns to `deal_card`:* Salesforce/HubSpot conflate workspace-into-deal because their deal lives in ONE org's CRM — Hello-Sello's deal is **shared state across two companies** + **versioned** + **regulated-industry audit-grade**. Container concerns (owner, privacy, membership) don't belong on the agreement record — they'd pollute `deal_card_log`, force awkward versioning questions (does owner-change bump card version?), and conflate "what we agreed" with "who can see/work on it." Separate workspace stays semantically pure + future-proofs DEV-37 (multi-deal-per-workspace, parked but realistic v1) at near-zero cost (one extra row + one JOIN). 1:1 with `deal_card` in v0.

- **Visibility model flipped — `company_wide` is the new default; supersedes ARCHITECTURE-NOTES line 54 "always invited-only" two-layer-independent model.** New `workspace_visibility` lookup (`company_wide` / `private`). Default `company_wide` = deal listed on Relationship deals page (Layer A) AND workspace contents are **visible + actionable** to both companies' employees. `private` collapses both — deal hidden from Layer A listing AND workspace contents restricted to active `deal_member` rows only. *Why one flag drives both layers (not two independent layers):* simpler mental model, matches industry default (Salesforce/HubSpot opportunity is visible to whole org by default + sharing rules tighten), `deal_member` becomes lighter (organizing list in default mode; access gate only in private mode), and the user explicitly accepted that strict-hide RLS can be added later if a need emerges. **Memory note `project_deal_visibility_two_layers.md` is now stale** — flagged for review.

- **3-layer owner-handoff enforcement (defense-in-depth).** Owner can be handed off **within the same company only** (Kim → Marcel, both seller; cross-company is blocked). Enforced at 3 layers: (1) **RLS** UPDATE policy — only current owner can change the column; (2) **DB trigger** `enforce_owner_same_company` BEFORE UPDATE OF `owner_person_id` — new owner's company_id must equal old owner's company_id; (3) **app-layer** validation in the workspace update API for user-friendly error messages. *Why all three over app-layer-only:* this is **the** trust boundary in our cross-company model; regulated-industry compliance + a single code bug shouldn't break it. Industry consensus (Postgres docs + Supabase + OWASP Multi-Tenant) for security-critical cross-table invariants is **both layers, not either/or**. The same 3-layer enforcement extends to `deal_member.role='side_lead'` handoff.

- **Workspace audit goes to `audit_log` (NOT `deal_card_log`) — A2 lock.** Owner change, privacy toggle, member add/remove are **container** events, not agreement amendments. Putting them in `deal_card_log` would pollute version history, force fake `version` values on container changes, and trigger spurious "deal updated" chat broadcasts. *Why:* same "altitudes" rule we applied to the workspace-vs-card split; container concerns ride the compliance-grade `audit_log` (cross-system event journal), agreement amendments ride the deal-scoped `deal_card_log`. New `auditable_content_type` codes added: `deal_workspace`, `deal_member`, `thing`, `deal_artifact`.

- **`deal_member` — junction with three-role enum (`owner` / `side_lead` / `member`); each side controls own-side member adds.** v0 deferred: `access_level` column (read-only/observer pattern not needed yet). Workspace birth auto-inserts 2 rows: initiating dealmaker as `owner`, counterparty dealmaker as `side_lead`. *Why three roles (vs flat membership + owner_person_id only):* the cross-company shape means the OTHER side also needs a "lead" who can add their own teammates — owner alone can't add buyer-side logistics person without violating side-sovereignty. Side_lead is that role. Plain `member` has no add permission. *Why owner stays as `member` after handoff (not removed):* she's still a colleague who knows the deal — explicit removal is a separate action. Sync invariant: `deal_member.role='owner'` person_id must equal `deal_workspace.owner_person_id` (maintained app-layer + cascaded by the same trigger that enforces the 3-layer same-company rule).

- **`thing` — single table with `type` discriminator (Asana subtype pattern).** Type enum: `task` / `approval` / `document_upload`. Two nullable FKs link `approval` things → `deal_confirmation` rows and `document_upload` things → `deal_artifact` rows (real FK integrity, no polymorphic anti-pattern). Status v0 = `open` / `done` only. **Stages = scaffolding only** (NULL FK to `deal_stage` lookup; seeds TBD per DEV-24/34) — they group THINGS + set default assignees but are NOT a UI element (reaffirms DEV-24/34). Behavioral rules in app-layer: both `deal_confirmation` rows for a version → `confirmed` auto-marks linked approval THINGS done; new `deal_artifact` upload auto-marks linked document_upload THING done. *Why single table over per-type tables:* Asana's `resource_subtype` pattern — same base behavior (title, status, assignee, completion), different rendering by type. Per-type tables would duplicate audit columns, RLS rules, and assignee logic for no gain. Custom type-specific data lives in `metadata JSONB` (signature method, file hints).

- **`deal_artifact` — clones `relationship_artifact` Storage pattern; 9 category seeds; PDF-only v0; app-layer done-flip.** Categories: `delivery_note`, `invoice`, `proforma_invoice`, `contract`, `co_a` (Certificate of Analysis), `packing_list`, `certificate_of_origin`, `phytosanitary_cert`, `other`. *Why these 9 (not just the prototype's 4):* EU regulated cannabis B2B requires phytosanitary_cert (plant-import for hemp), certificate_of_origin (customs/tariff), packing_list (customs match), proforma_invoice (pre-deal financing). Lookup INSERT extends later at zero migration cost. Allow multiple per category (soft-delete + reupload pattern for corrections; UI shows latest). PDF-only + 20 MB cap (matches `relationship_artifact`).

- **`done`-flip lifecycle trigger lives in app-layer Edge Function — NOT DB trigger.** When `delivery_note` + `invoice` artifacts both present (non-deleted) on the workspace AND `deal_card.status = 'confirmed'`, the upload Edge Function flips `deal_card.status` → `done`. New `done` value added to `deal_card_status` lookup. *Why app-layer over DB trigger* (the opposite call from the owner-handoff 3-layer decision): this is **correctness logic, not a security/trust boundary**. Single write path (one Edge Function), better debuggability (visible trace logs vs hidden trigger), no per-write overhead (trigger would fire on every artifact write — contracts, CoAs — just to check if it's delivery_note/invoice), reversible if rule changes (Phase 3 multi-delivery: "all deliveries have both"). Different rule for different concerns: owner-handoff = defense-in-depth (security); done-flip = domain state computation (correctness). Industry treats these differently (Postgres docs + the Status Machina state-machine pattern). Belt-and-suspenders DB trigger can be added later if support sees drift.

- **`deal_workspace` + `thing` promoted from Phase 3 to Phase 2.** `deal_room` (customer-presentation surface) stays Phase 3 — Connect ④ is execution-container only.

- **Pricelist scope (re-clarified 2026-06-07 session 8 after Marcel's WhatsApp updates):** Marcel sent updated info confirming **(a)** structured rows in DB + CSV blueprint (input) + manual entry; PDF dropped; **(b)** relationship-level **custom pricelist** to override the company-wide default IS conceptually needed but explicitly **deferred post-v0** (Marcel: *"we are not doing this in v0"*); **(c)** he added a "Pricelist" spreadsheet to Drive with proposed columns + flagged the multi-pricelist case for UX review. v0 scope re-confirmed: **one standard company-wide pricelist** + DEV-41 Proposed→Applied workflow build deferred (the DEV-41 *decision* is locked 2026-05-20 — single-approver MVP — but the *implementation* sits behind v0). Exact column list pending — read Marcel's Drive blueprint next session.

*Why record:* closes the 4 Phase 2 open schema questions for screen ④ (`deal_workspace`, `deal_member`, `thing`, `deal_artifact`). With these locked, the only remaining open items before writing Phase 1 + Phase 2 migrations are (1) the pricelist column list (Marcel's blueprint pending) and (2) the `buyer_metric` rename (non-blocking — placeholder ships v0). Visibility model flip is the load-bearing change here: it simplifies RLS, aligns with industry default, and supersedes the old two-layer-independent ARCHITECTURE-NOTES line 54. *Full table shapes in `docs/architecture/SCHEMA-DRAFT.md` → Phase 2 tables.*

## 2026-06-07 (session 9) — Phase 2 schema review: stage-over-domain, workspace-at-Draft, DEV-37 correction, log-everything

Holistic review of all 15 Phase 2 tables before writing migrations (checks R1–R6 + O6). PRD (`docs/PRD/`) is the source of truth; reconciled the session-8 schema against it.

- **`thing` groups by `stage`, not `domain` — `domain` dropped.** The PRD organizes deal work by a 5-stage pipeline, never by domain. Session 8 had carried both a `domain` column (finance/logistics/delivery) and an empty `stage` — two grouping columns for one job. Resolution: keep `stage` (now NOT NULL, the real grouping), drop `domain` + `thing_domain` lookup. *Why:* one grouping concept, not two; the PRD's pipeline is the canonical organizer. (The review's earlier R3 instinct — "carry one grouping column, not two" — held; only the surviving column flipped once the PRD's stage definition replaced the stale DEV-31 "stages = finance/logistics/delivery".) The screen-④ prototype's domain-grouping is a superseded name-mismatch; PRD wins.

- **`deal_stage` seeds locked (Ayush's research, DEV-24/34):** `negotiation` · `compliance_quality` · `agreement` · `payment` · `fulfilment_delivery` (sort 1–5). Status flips Draft→Confirmed at stage 3 (`agreement`); stages 4–5 are post-confirmation (Phase 3).

- **Stages are now a visible UI element — supersedes DEV-24/34 "stages = invisible scaffolding".** The PRD shows the pipeline across the top of the workspace. *Why recorded:* a prior locked decision is reversed by the PRD; docs must agree.

- **Deal Workspace + deal chat are born at Draft (resolves O6).** Negotiation happens inside the deal chat before confirmation, so the container must exist at Draft. Already consistent with session 8 ("auto-created at deal_card birth"); only the stale `deal_card.thread_id` note ("set when both confirm") was corrected to "set at Draft".

- **DEV-37 correction — it's chat-organization, NOT workspace structure.** Session 8 misread DEV-37 as "multi-deal-per-workspace, relax the 1:1 later". The actual Linear issue (verified) is "create organized chat windows and logs for multiple deals" (a P2P/c2c chat concern, Chat project). Workspace↔deal is a **permanent 1:1**, not a v0 simplification. Removed the "relaxes later" language + the false rationale from the session-8 `deal_workspace` decision (the separate-table decision itself stands on its real reasons — container vs versioned-agreement separation).

- **Audit: log everything from day one.** Comprehensive audit logging is mandatory in the first build (not "added per feature as they ship"). Full action-verb vocabulary seeded up front. *Why:* regulated industry; a missed event is unrecoverable, while an over-logged one is filterable (every action carries a `category`).

- **Deal visibility moves in lockstep.** A deal's chat, to-dos, and documents all follow that deal's `workspace_visibility` flag (company_wide default / private = invited-only). Explicit RLS rule written for `thing` + the deal `chat_thread` (was unstated). Applies to the deal thread only; c2c/p2p threads keep their own scope.

- **Migration notes (R6):** soft-cycle FKs (`chat_thread.deal_card_id` ↔ `deal_card.thread_id`) created post-table via ALTER; `deal_line_item.product_id` ships as nullable UUID without FK constraint until `catalog_product`/`product` lands in Phase 3.

*Net schema change from the whole review: one column swap on `thing` (drop `domain`, require `stage`) + two stale-note fixes. No structural churn — the session-7/8 tables held up. Source of truth = PRD (`docs/PRD/`).*

## 2026-06-07 (session 10) — Phase 2 schema: Product Catalog & Pricelist tables (from Marcel's blueprint CSVs)

Designed the last open Phase-2 schema item from Marcel's two blueprint CSVs (`docs/product/blueprint/`), research-first (cannabis seed-to-sale + Certificate-of-Analysis practice). 7 tables + 4 lookups.

- **One product → many batches; label value ≠ measured value.** `product` carries the **label/advertised** cannabinoids (the "28" in "STR 28/1"); `product_batch` carries the **measured** CoA values per lot. *Why split:* cannabis is a plant — every batch varies in THC/CBD/terpenes even for the same cultivar (industry research: lab results deviate up to ~50% off label; Canada forces a single label value per batch that the plant doesn't actually honor). This is exactly why Marcel's CSV shows THC twice on the product *and* again on the batch. A flat single-level "product" would either lie about potency or lose lot traceability.

- **Terpenes = lookup + child table, not fixed columns.** `terpene` (controlled vocab, 23 seeds from the CSV reference list) + `batch_terpene` (one row per terpene per batch). *Why over the CSV's "Terpene #1/#2/#3" columns:* GC×GC profiling routinely finds far more than 3; a child table is unbounded and matches the controlled-vocab → lookup+child pattern. Fixed columns would cap the profile and force a migration the first time a 4th terpene appears.

- **`buyer_product_code` → `product_buyer_code` map table, not a column on `product`.** The buyer's own internal code is **per-buyer** (Pharmacy Berlin and Pharmacy Potsdam each have their own for the same product). *Why a relationship-scoped table over a column:* one product has many buyer codes; a single column works for a one-buyer demo then forces a painful extract-column-to-rows migration the moment a 2nd buyer appears — the exact failure the migration-avoidance checklist exists to prevent. It stores an **identifier, not a price**, so it does not breach the "no per-buyer pricing in v0" rule. Scoped to `relationship` (the natural grain).

- **Prices: one source of truth.** Sell + bundle prices live on `pricelist_item` (`price_per_gram`, `bundle_threshold_grams`, `bundle_price_per_gram`). `product` holds only the **intrinsic** money facts: `cogs` (🔒 seller-only — RLS + app-layer policy, same pattern as `deal_line_item.seller_margin`) + `rrp_per_gram` (recommended-retail reference). *Why:* avoids duplicating a sell price in two places; the price a buyer pays is a list concern, not a product property. `deal_line_item.unit_price` remains a frozen snapshot of `pricelist_item.price_per_gram` at deal time (changing the list never rewrites past deals).

- **`pricelist` + `pricelist_item` (header + rows).** v0 = **one standard company-wide list per company**. Per-customer "Customer Price / g" override (present in the Pricelist CSV) stays **deferred post-v0** per Marcel; DEV-41 Proposed→Applied workflow implementation also deferred (the decision is locked, the build isn't).

- **Naming locked: `product`** (not `catalog_product` — both appeared in earlier notes). Because `product` now lands in v0, **`deal_line_item.product_id` becomes a real FK in Phase 2**: create `product` before `deal_line_item` (was previously a deferred nullable-without-FK to a Phase-3 table).

- **4 new lookups:** `product_unit` (g/mL/pack) · `strain_dominance` · `irradiation_type` (beta/gamma/un_irradiated) · `pricelist_status` (draft/published). **Audit seeds** added: `product`, `product_batch`, `product_buyer_code`, `pricelist_item` → `auditable_content_type`; `product.created/amended` + `product_batch.created` → `audit_action_type`.

- **`metadata JSONB` on `product`** is load-bearing here — the CSV literally says "more columns should be able to be created flexibly per company." Per-company custom attributes go to JSONB, not per-company ALTERs.

*Why record:* closes the last open Phase-2 schema question. With the catalog locked, **no open schema items remain** before writing Phase 1 + Phase 2 migrations (the `buyer_metric` rename is non-blocking — placeholder ships v0). Full table shapes in `docs/architecture/SCHEMA-DRAFT.md` → "Phase 2 tables — Product Catalog & Pricelist".

Research sources: CT.gov seed-to-sale; GrowerIQ ALCOA batch lineage; Leafwell / NJ.gov "how to read a CoA"; Nature/Scientific Reports + PLOS One on batch THC variability; AWS / Citus on JSONB-vs-columns.

## 2026-06-07 (session 12) — Foundation build: schema migrations applied + RLS (F1–F4)

Wrote + applied the locked v0 schema to Supabase (71 tables), then the RLS privacy spine, the auth→person trigger, and the dev seed. Mostly executing decisions locked in sessions 1–10; the genuinely new calls made during the build:

- **13 inline "Lookup:" columns formalized as real lookup tables.** The draft left ~13 enum-ish columns as bare `VARCHAR` with a `Lookup: a/b/c` comment (`chat_thread.type`, `chat_message.sender`, `deal_card.deal_type`, `deal_line_item.unit`, `relationship.status`, `deal_card_log.origin`/`changed_by`, `contact_record.role`/`provider`, `note_scope`, `chat_message_type`, `payment_terms`, `incoterms`). Per the "enums = lookup tables" convention all became real tables + FKs. *Why:* add values without a migration (the convention's whole point) + typo-proof. **`content_author`** is a single shared lookup for both `chat_message.sender` and `deal_card_log.changed_by` (identical `person`/`system`/`sella` set — DRY).
- **Seller-only columns hidden via TABLE SPLIT (Option B), not a masking view.** RLS is row-level only — a counterparty who can legitimately see a shared row reads every column of it, leaking the 🔒 seller-only numbers. Split them out: `product.cogs` → **`product_cost`**; `deal_line_item.seller_margin`/`buyer_metric` → **`deal_line_item_private`** (one row per side, RLS by owning company). *Why table-split over a view:* pure row-RLS (consistent, testable, no view/privilege traps) and free now (empty DB, no data migration). The masking-view path also had a privilege contradiction (`REVOKE` base + `security_invoker` can't coexist). Proven by the isolation test — buyer sees 0 `product_cost` rows; neither side sees the other's metric.
- **RLS ships as a tracked migration**, not an untracked `supabase/policies/*.sql` seed script. *Lesson:* the first RLS draft was untracked and got discarded when a parallel session was stopped — security-critical SQL must be a committed migration.
- **`audit_log` hash trigger made `SECURITY DEFINER`.** Under RLS its "read previous hash" `SELECT` was filtered per-tenant → forked the global tamper-evident chain. DEFINER bypasses RLS so the chain stays global. (The separate concurrency fork — advisory lock taken after the `BIGSERIAL` is drawn — remains a build-phase hardening note.)
- **Deal chat-thread visibility follows the workspace lockstep.** `can_access_thread()` resolves deal-type threads through `deal_workspace.visibility` (private = active members only), matching `thing`/`deal_artifact` — not plain relationship scope.
- **Minor locks:** `deal_artifact_category.code` widened to `VARCHAR(30)` (`certificate_of_origin` = 21 chars > the 20-char status shape); `payment_terms` + `incoterms` seeded (draft gave only examples → common B2B set / Incoterms 2020 standard); `permission_action` table created but unseeded (vocabulary built with the permission-matrix UI); `company_insert` RLS tightened from `WITH CHECK (true)` to own-company-at-onboarding.

*Why record:* F1–F4 are applied + isolation-tested on Supabase (impersonation test proves GreenLeaf ↮ StonePharm, private-deal lockstep, and seller-only column hiding). This is the executed reality behind `SCHEMA-DRAFT.md`. Open follow-ups: move RLS helpers to a private schema (advisor noise — they're RPC-exposed); audit JCS canonicalization + concurrency hardening; **F5** shared modules (`shared/db`, `shared/auth`, audit write helper); `buyer_metric` rename; verify Supabase Auth email provider enabled.

## 2026-06-07 (session 13) — Discover: visibility model LOCKED; page structure + scope OPEN

Explored the Discover surface (stub) via a throwaway prototype with a mock DB (`prototypes/discover-prototype/`, 3 combination variants). One product rule came out clear and is locked; the page design itself is **not** locked — paused for more thinking.

- **LOCKED — Discover visibility is asymmetric ("Instagram model").** Listed-in-Discover = a company with a **public shop** (the selling side). Buyers (no shop, e.g. pharmacies acting purely as buyers) are **not listed** anywhere — reachable only by **exact-name search**, and only if they're on the platform. *Why:* sellers want to be found; buyers don't want to be cold-listed. The listing key is **"has a public shop", not a buy/sell role** — role is per-deal (consistent with the Layer-1 symmetric-company lock). Marcel's design arrived at the same rule independently ("list suppliers by category… no pharmacies shown first").
- **CONFIRMED — Discover does two jobs** (both in Marcel's designs): a **supplier directory** (sellers → their products, grouped, with a demand/supply toggle) and an **ad / social feed** (campaign calendar + ad posts = "B2B social network").
- **OPEN (explored, not locked):** (a) **page structure** — how directory + feed coexist (prototype mocks tabs / feed-first / unified-scroll; undecided); (b) is **demand-side** (companies posting what they want to buy) in MVP; (c) is the **ad/social feed** demo-scope or a fast-follow (it's the heavier half to build).

*Why record:* the visibility rule is load-bearing for whoever builds Discover (it's a directory-listing + search-access rule → affects the data model and RLS). The open items are parked in `docs/product/surfaces/DISCOVER.md`. Next Discover session resumes from the prototype.

## 2026-06-07 (Task 1A) — UI design system: palette, glassmorphism, surface nav

The app's visual language, locked while standing up the app shell (1A). Source of truth for tokens = `src/app/globals.css` `@theme`.

- **Look = pink + white, light, glassmorphic.** Translucent white surfaces (`backdrop-blur`) over a faint cotton-candy-washed background; pink as the accent. *Why:* distinctive and professional; a dark full-height rail was tried and rejected as heavier and less clean than the light glass capsule.
- **Palette (locked):** raspberry `#E30B5D` (brand/primary), cotton-candy `#FFB7D5` (light fills), red-pink `#76002D` (deep accent), white `#FFFFFF`, ink `#1F2020` (text/icons), green `#34B233` (success), periwinkle `#6C7BD9` (info), alert red `#DC2626` (danger/destructive). *Why the splits:* raspberry is the brand, so it can't double as "error" — a dedicated alert red keeps destructive actions unambiguous; the source swatch's "Electric Periwinkle Blue" was mislabeled (its hex was green), replaced with a true periwinkle for info.
- **Light-only for the demo; dark deferred post-demo.** Tokens are CSS vars in `@theme`, so dark mode is later a second `:root` block, not a rewrite. *Why:* one theme to polish before June 11; the structure keeps dark cheap.
- **Icons = `lucide-react` (monochrome), never emoji.** *Why:* emoji render differently per OS (a client's Windows machine ≠ macOS on stage); icon components render identically and inherit the brand tokens.
- **Font = Geist** (ships with Next 16), via `next/font`.
- **Wordmark = `He//o se//o`** — the `ll` in each word rendered as `//` (a Sella brand sign); deep-maroon letters + raspberry slashes. A text placeholder for a real logo image.
- **7 global surfaces (locked):** Home · Connect · Discover · Present · Buy · Sell · Trade, in a thin left rail. *Why "Trade" not "Grow":* matches the home/connect prototypes; the earlier "Grow" label is superseded.
- **Shell layout:** light glass capsule rail (Hello Sello logo top · surface pills · user-photo slot bottom) + a glass search top bar carrying the logged-in company's logo/name. Active surface = cotton-candy pill + raspberry; `soon` surfaces (Buy/Sell/Trade) are greyed and non-clickable until built.

*Why record:* shared decision — Muskan builds Present + Discover against the same palette, tokens, icon set, and shell, so the design system must be team-visible, not buried in Ayush's workshop. Full build narrative: `_workshop/build-plans/1a-app-shell.md` (Ayush-local).

## 2026-06-07 (session 14) — F5 shared modules built + merged to dev (PR #60)

Built the app-layer foundation modules on top of Ayush's Task-1A scaffold. These are the contracts every feature module imports. PR [#60](https://github.com/HelloSello/hello-sello-mvp/pull/60) → `dev`.

- **Publishable key (modern) over legacy anon key.** Env var = `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`). Supabase docs recommend it; independent rotation, same RLS enforcement. Legacy JWT anon key still works but is the deprecated path.
- **`shared/db` cannot barrel browser + server clients into one `index.ts`.** `server.ts` imports `next/headers` (server-only); exporting it from a shared barrel breaks Client Components at build time. Surface: types from `@/shared/db`, browser client from `@/shared/db/client`, server client from `@/shared/db/server`.
- **`writeAudit()` is intentionally thin — DB trigger owns the hash-chain.** The helper just INSERTs; `sequence_number`, `prev_entry_hash`, and `entry_hash` are computed by the `trg_audit_log_hash` BEFORE INSERT trigger (advisory-lock serialized). The generated TS type demands `entry_hash` (can't see the trigger); the helper casts around it.
- **`getCurrentCompanyId()` = the single Path-B accessor.** Returns `null` when the user has no company yet. RLS fails safe on null (matches nothing). One accessor, one place to change if Path B adds complexity.
- **`getUser()` over `getSession()` for server-side auth.** `getUser()` revalidates the JWT with the Supabase auth server; `getSession()` trusts the cookie as-is. On the server (where we resolve person/company), revalidation is the safer default.

*Why record:* F5 is consumed by every module Ayush builds; the barrel-split and thin-audit decisions are the kind of thing a future developer would violate without knowing why (e.g. "why not just export everything from index.ts?" or "let me compute the hash in the helper for safety"). These locks prevent that drift.

---

## 2026-06-07 (session 15) — Auth screens (1b): theme resolution + build locks

- **Auth-screen theme — LIGHT wins; the 2026-05-25 "dark auth" intent is superseded.** The onboarding prototype HANDOFF lock #2 (*"dark theme for auth screens, light in-app"*, 2026-05-25) **conflicted** with Task-1A's *"light-only for the demo; dark deferred"* (2026-06-07, this DECISIONS.md). **Muskan's call: light wins** — `/login`, `/signup`, `/onboarding` render on the light glass system like the rest of the app. *Why:* one theme to polish before June 11; the `@theme` token structure keeps dark a cheap post-demo add. Revisit dark (incl. the dark-auth idea) post-demo. *(Recorded so the conflict doesn't resurface — a dark mock for signup is **not** the current target.)*
- **Auth chrome = conditional, not a route-group split.** `AppShell` renders bare (no rail / top-bar) on `/login` + `/signup` via a `usePathname` check (it is now a client component). Chose this over the canonical `(app)`/`(auth)` route-group split because the split would move Ayush's 8 surface pages mid-Connect-build (collision risk). The route-group split is the cleaner refactor for later.
- **Post-signup landing = `/onboarding` placeholder (Path-B gate).** A fresh signup is authenticated but has `company_id = NULL`, so it lands on `/onboarding` (not the app). 1c (company setup) replaces the placeholder. Industry pattern: gated onboarding (Slack/Notion/Linear).
- **Session proxy uses `getClaims()`, not `getSession()`.** The Next-16 `proxy.ts` refresh + route gate verifies the JWT signature (safe server-side); `getSession()` trusts the cookie and must not gate routes. (Consistent with the F5 `getUser()`-over-`getSession()` lock.)
- **`signOut` uses `scope: 'local'`.** The button always clears the local session even if the remote revoke would fail (expired/invalid session); the redirect never waits on a network call that can error.
- **Dropped the `/logout` GET route.** A GET that mutates is a smell; sign-out is a `<form>` server action. Placed in the rail's user-avatar menu.

---

## 2026-06-07 (Sella design) — Deal-Sella detection: runtime placement, tool contract, proposal flow

Design session on how Deal-Sella's detection actually *runs* at build time. Layer 4 locks Sella's **behavior**; this locks the **build mechanics**. Build itself handed to Ayush / the F5 build session. All captured in `ARCHITECTURE-NOTES.md` "Sella runtime placement"; mirrored here as the load-bearing locks.

- **Placement rule — data-triggered → background, person-waiting → app.** A Sella task kicked off by a DB change (new message, card version bump, doc upload) runs in a background runtime and must never sit in the user's request path (keeps Sella a non-blocking leaf). A task a user waits on-screen for (side-panel reply, "what's on my plate") runs in the Next.js app. **Tasks live in different homes; one choice does not bind the others.** *Why:* "where Sella lives" is really "where each *task's* trigger lives" — the model (Bedrock) is one shared brain; only the trigger code's home varies.
- **Detection lives in a Supabase Edge Function.** Flow: new `chat_message` → DB webhook (async `pg_net`, non-blocking) → Edge Function → Claude Haiku with one `propose_deal_draft` tool over a rolling ~15–20-message window → writes a Draft suggestion → Supabase Realtime shows it live. Chosen over an in-Next.js background job because Vercel serverless can freeze post-response (unreliable for fire-and-forget).
- **Suggest-only is structural, not a promise.** Sella is handed only *propose* tools — there is no `confirm`/`send` tool — so it cannot commit a deal by construction. Resolves the "Sella suggests, humans decide" guarantee at the tool layer.
- **`propose_deal_draft` contract (S2):** `line_items[]` {name → `deal_line_item.name`, quantity+unit → `.volume`, unit_price, cultivar?, pzn?}, `currency` → `deal_card.currency`, one-line `summary` → `deal_card_log`. Required: name, quantity, unit_price, currency. `deal_type` not extracted (initiator-set; seller = OFFER per O4); `value_net` computed (qty × price). Maps 1:1 to schema columns — no glue layer.
- **Proposal + both-sides votes live in the `deal_detected` message `metadata`** (the column is documented "Sella context, confirmation state") — **no new table**. Not `deal_confirmation` (that's the heavier final two-party *card* confirm). Promote to a `deal_proposal` table post-MVP only if the proposal grows a real lifecycle.
- **Workspace birth = one atomic app-side transaction.** On both-accept, a single all-or-nothing transaction creates `deal_card` (Draft) + `deal_line_item` rows + `deal_workspace` + `deal` thread + `deal_member` rows + `workspace_created` system line + audit. The `deal_detected` message persists as the "proposed → both accepted" record.
- **No detection cost gate for MVP.** Per-message Haiku ≈ $0.001 + prompt caching → the cheap rule/embedding pre-filter is a post-MVP scale optimization, not needed for the demo.

**Open (build-phase) — RESOLVED 2026-06-08 (see next entry):** spawn-transaction internals (`deal_member` owner/side_lead auto-insert, the `thread_id`-nullable create-order cycle); Bedrock-from-Deno credential setup (`aws4fetch` SigV4 + Supabase Edge secrets, *not* the Vercel env keys).

*Why record:* this is the design Ayush builds Sella against; the placement rule and the structural suggest-only guarantee are the kind of thing that gets violated silently (e.g. "let me just call Bedrock in the message handler" → chat blocks on AI). Grounded in research 2026-06-07 (function-calling extraction, Haiku pricing/caching, Supabase DB webhooks) + Layer 4 §3/§5. Also closes O6 in the connect-demo PRD.

---

## 2026-06-08 (Sella design) — Workspace-spawn transaction + Bedrock creds (closes the build-phase opens above)

Follow-on session settling the two items the detection entry left open. Mirrored in `ARCHITECTURE-NOTES.md` ("Sella runtime placement") and the schema change in `SCHEMA.md` §8.

- **Create-order is acyclic — no `thread_id` backfill.** The feared "thread_id-nullable cycle" does not exist: the FK is one-directional (`chat_thread.deal_card_id → deal_card`; `deal_card` carries no thread column). Fixed order, one all-or-nothing transaction: (1) `deal_card` → (2) `deal_line_item` → (3) `deal_workspace` → (4) `deal_member` → (5) `chat_thread` (type `deal`) → (6) `chat_message` `workspace_created` → (7) audit.
- **Both founders become `owner` (one per side).** The two P2P chatters each get a `deal_member` row with `role = owner` — co-ownership, one per company side. `side_lead` stays in the enum but is NOT auto-assigned at birth (reserved for later delegation: a side's lead who isn't a full owner). `member` = colleagues added later.
- **`deal_workspace.owner_person_id` REMOVED — ownership lives in `deal_member`.** A deal can have several owners (two leads + more), so a single-owner column can't hold the truth. Ownership = `deal_member` rows with `role = owner`; one source, unbounded count. *(Amends the locked Phase-2 `deal_workspace` table — see SCHEMA.md §8.)*
- **Superadmin access = platform-wide RLS bypass, not a membership row.** The HS superadmin manages any deal via a bypass policy, never inserted as a `deal_member` on each deal (keeps every deal's people-list clean).
- **P2P→deal continuity signpost.** On birth, the `deal_detected` message in the P2P thread updates to a "Deal created → open workspace" link into the new deal thread, so the two people don't lose the deal when it moves rooms.
- **Bedrock-from-Deno creds = permanent key, least-privilege.** The detection Edge Function authenticates to Bedrock with a permanent IAM/Bedrock key in **Supabase Edge secrets** (not the Vercel env keys), scoped to **Bedrock-invoke on the `eu.` EU Claude models only**. Auto-expiring (12hr) keys + refresh machinery = post-MVP hardening. *(Build = Ayush.)*

*Why record:* the owner-column removal changes a locked schema table; the co-owner + superadmin-via-RLS choices drive both the spawn transaction and the deal RLS policy. Grounded in SCHEMA.md §7/§8 (`deal_card` / `deal_workspace` / `deal_member`) + the placement rule from the entry above.

---

## 2026-06-08 (Sella design) — Multi-Sella architecture (DEV-11): MVP scope locked, orchestration deferred

DEV-11 asks "are Personal / Seller / Buyer Sella distinct agents or one with context flavors?" + the framework choice. Split into what MVP actually needs vs what's deferred. Most of the §2 framing was already answered by locks scattered across Layer 4 + ARCHITECTURE-NOTES; this collects them into one architecture statement.

- **The "5 Sellas" = ONE agent runtime, parameterized** by (data scope · persona shift · tool set + memory namespace) — not 5 services or codebases. Forced by already-locked facts: one base voice with role-fitted shifts (DEV-46), one Bedrock provider wrapper (4a), routing at the **interface layer** (§2/§5), and the side-Sella **reads** Deal-Sella's scope rather than two agents conversing (§2). Industry-aligned (2026 consensus: single-agent + tools is the default; add tools before agents; graduate to multi-agent only at clear limits — multi-agent helps parallel tasks but degrades sequential ones).
- **MVP needs no agent architecture.** All 4 MVP Sella tasks (BUILD-PLAN Unit 4: 4a wrapper · 4b detect · 4c draft · 4d summarize) are **stateless single-shot Bedrock calls** behind the 4a provider wrapper, each with ≤1 structured-output tool. **No agentic loop, no orchestrator, no graph, no agent framework** (LangGraph / Bedrock Agents), **no RAG, no persistent memory.** Detection (built) is the reference shape.
- **Deferred to post-MVP** (decide when the task is built, not now): multi-step agentic loops, multi-Sella co-activation runtime, RAG-backed Side-Sellas + memory/retention ([DEV-59](https://linear.app/hellosello/issue/DEV-59)), autonomy-ladder trust state (§4), any agent framework adoption. The locked *direction* to graduate from = **single-agent + function-calling tools**.

*Why record:* retires the "5 agents?" framing of DEV-11 **for MVP** and prevents over-building (no one reaches for LangGraph / an orchestrator to run 4 stateless calls). DEV-11 itself stays **open** for post-MVP orchestration. Grounded in BUILD-PLAN Unit 4 (4a–4d all single-shot) + the locked detection design (2026-06-07/08 entries above) + the 2026 single-vs-multi-agent consensus.

---

## 2026-06-08 (Sella 4a) — Bedrock auth method + shared-helper placement (smoke-test verified)

Settling *how* the 4a Bedrock wrapper authenticates and *where* it lives, before building it. Both decisions were verified by a live throwaway smoke test (`bedrock-smoke` Edge Function), not just chosen on paper. Mirrored in `ARCHITECTURE-NOTES.md` ("Sella runtime placement").

- **Auth = Bedrock API key (bearer token) + plain `fetch`. SigV4 / AWS SDK NOT used.** Supersedes the earlier "permanent IAM key + `aws4fetch` SigV4" assumption. A long-term **Bedrock API key** sits in Supabase Edge secrets as `AWS_BEARER_TOKEN_BEDROCK`; the function POSTs to the EU Converse endpoint with `Authorization: Bearer <key>` — no signing, no SDK to bundle. *Verified:* live call to `eu.anthropic.claude-haiku-4-5-20251001-v1:0` in `eu-central-1` returned "pong". 12hr short-term keys + refresh = post-MVP hardening.
- **Shared Bedrock helper lives in `supabase/functions/_shared/sella/`, not `src/shared/`.** The heaviest model-calling tasks (detect / draft / summarize) run in the Edge Function (Deno); the Deno bundler can't cleanly import from the Next `src/` tree, but the Next app *can* import a pure helper from the functions dir. So the helper sits with its heaviest consumer + the stricter bundler. Refines (doesn't contradict) the "F5 / shared infra" framing — still shared, just physically beside the Edge Functions.

*Why record:* both supersede prior paper assumptions (SigV4; "F5 territory" implying `src/shared`), and the auth one was the single biggest unknown in the whole Sella unit — now closed by a real call. The next builder should not re-introduce the AWS SDK or SigV4, and should not place the helper in `src/`. Grounded in the live smoke test + Supabase monorepo bundling friction ([CLI #1303](https://github.com/supabase/cli/issues/1303)) + research on Bedrock API keys (bearer tokens).

---

## 2026-06-08 (Ayush) — C2C = a ticket channel, not a free chat (direction DECIDED; NOT building now)

A message into a company-to-company (C2C) channel should behave like a **ticket**, not a back-and-forth chat. The three chat types keep clear, separate jobs: **P2P** is where people actually talk, **Deal chat** is the deal-workspace thread, and **C2C** is for reaching a company when you don't know which person to ask, plus the durable connection/info record.

*Why:* a company can have many people, and only some P2P pairs are connected; some people are connected to no one. A company needs a "knock on the door" that does not name a person (the classic sales problem: "who is their procurement person? their finance person?"). Framing C2C as a ticket keeps it from becoming a noisy second chat that fills with irrelevant text.

**This resolves the prototype-vs-DECISIONS drift.** The prototype called C2C an "audit log / `actor=system` only"; DECISIONS:515 called it "messaging on behalf of your company". Both are true once "messaging the company" means "raise a ticket", not "free chat".

**Agreed shape (for the future build):**
- Sending stays as easy as typing a message (no form to fill). The C2C box just *looks* different — a different skin/framing, maybe one **optional** category tag — so it reads as a deliberate, different kind of message.
- A C2C message becomes a ticket that enters the **same Inbox** (the 2a machinery), shown in a **different view** from new connect requests. Anyone in the company may raise one (relaxed permissions for MVP).
- On pickup (same first-come claim rule as 2a): if the two people have no chat, a natural new **P2P** starts; if they already have a P2P, the pickup drops a **Sella** system message into that existing P2P (reuse, don't duplicate). Deal-card changes flow through the existing deal-card update mechanism.
- The conversation happens privately in the **P2P**; the **outcome** is posted publicly back to C2C ("handled by Jonas"); significant changes are surfaced in C2C. The other company sees the result in C2C, not the private P2P words.
- The sender sees a status: **open / claimed / answered**.

**NOT building now (parked).** For the June 11 demo we keep the current C2C chat as-is, and keep Sella as the mediator through the existing flow. Deal-card changes use the older method, and since no deal card is attached yet there is nothing to change now. Build the ticket system as its own slice after the core demo path (2d/2e + the deal flow).

**Open problems to solve when we build (from the 2026-06-08 brainstorm — recorded so we don't lose them):**
1. *Easy vs deliberate (the core tension).* The box must be as easy as a chat (so people adopt it) yet feel different (so they don't dump irrelevant text). Likely fix: same typing ease, different framing + one optional category tag — no form.
2. *P2P topic-mixing.* Reusing an existing P2P for a new ticket can mix unrelated topics in one thread. Likely fix: a clear Sella divider line ("New from the company channel: …"); switch to one-thread-per-ticket only if it gets messy.
3. *Publishing the outcome to C2C.* Need a rule for what counts as "significant" and who posts it. Likely fix: auto for deal-card changes (existing flow) + a manual "Share update to the company channel" button. Confirm the privacy model (company sees the result, not the private P2P).
4. *Inbox data model.* Decide whether a company ticket is the same Inbox item with a new "type" or a new concept. Defer to build time.

*Status of the 2b/2c code today:* C2C is currently a writable chat (the earlier drift-fix). That stays for the demo; it becomes the ticket box when this slice is built.

---

## 2026-06-12 (Sella 4b) — Detection → Dealcard journey (Option B, grounded) + the 4b build decisions

The full chat→card journey, settled while building 4b. **Sella only ever DRAFTS; she never finalizes** — a card born on day 1 may not finish until day 50, so Sella can never know a deal is "done." Detection posts a read-only `deal_detected` suggestion → **both owners confirm it (Stage 1, Birth)** → the two-owner `create_deal_draft` opens a **Draft** card (always Draft, regardless of `forming`/`firm`) → negotiation → **both owners confirm the 3d gate (Stage 2, Seal)** → Confirmed.

- **Two stages, two meanings: OPEN (birth) vs CLOSE (seal).** Each needs both sides. The verdict (`forming`/`firm`) **never skips a stage** — even a fully-agreed-in-chat deal is born as a Draft and sealed later. *Why:* the two confirmations answer different questions ("is this a real deal worth a card?" vs "do we agree the final terms?"), and a deal lives and changes for weeks between them. This resolves the half-open tension between POV §6 ("Option B") and the 3.5 note ("one human click") — toward **both-click birth**.
- **Confirmer-as-initiator.** Whoever clicks the final accept births the card as the initiating side; the other p2p person becomes co-owner; **both are equal owners**. *Why:* it reuses the existing `create_deal_draft` (which keys the creator off `auth.uid()`) with zero refactor; forcing seller-always-initiates would need duplicating the birth logic. Deal type derived from who holds the catalogue (offer/order) — **precise offer/order labelling stays parked**.
- **`deal_detected` metadata shape (resolves POV §8 open item):** `{ detection_id, verdict, confidence, draft{line_items,currency,summary}, evidence[], votes{<companyId>: null|accept|reject}, product_key, superseded_by, ai:true }`. Votes are by **company** (either colleague on a side can confirm for that side). `ai:true` = EU AI Act Art. 50 machine-readable tag.
- **Sella's memory is a separate table, not the chat rows.** `sella_detection` (one row per run) carries idempotency + dedup + supersession; the visible `deal_detected` message is the human view. *Why:* a `no_deal` run must be REMEMBERED for dedup but must NOT spam the chat, and **GDPR** — verbatim evidence quotes are kept only on `forming|firm` rows (enforced by a DB check), never on `no_deal`.
- **Auto-trigger = pgmq + pg_cron + pg_net, scoped to `p2p` threads.** A person message enqueues a job; a 10s cron worker dispatches it to `sella-detect`; durability via the queue + the idempotency guard (at-least-once, self-healing). The fence holds throughout: **Sella only suggests + pre-fills; a human's click is the only write path.**

*Why record:* this is the load-bearing Sella product decision (it overturns nothing but grounds Option B with the "Sella only drafts" principle) + the four engineering decisions that fell out of it. Built + verified live 2026-06-12 (post / idempotent / supersede / birth on thread `91b6f4b8`). Code: `supabase/functions/_shared/sella/{dedup,detect,tools,context,prompts,bedrock}.ts` + `sella-detect/` + migrations `…120000`/`…130000`/`…140000`. Engineering detail in ARCHITECTURE-NOTES 2026-06-12.

---

## 2026-06-12 (Sella 4d) — Version-change summaries + AI first-contact intro; "narration follows the card"

The last Sella piece. Two jobs, both single-shot Haiku, both PERSON-WAITING so they run INLINE (the placement rule), both fail-soft, both fence-safe (Sella narrates; she changes nothing).

- **Version-change summary.** On a card edit, Sella reads the line diff + the human's mandatory note and writes one neutral "why it changed" sentence into `deal_card_log` (`changed_by='sella'`, shows in the Logs tab) AND a `deal_card_updated` chat message.
- **Sella's narration follows the CARD, not a single thread.** The `deal_card_updated` summary is posted to EVERY chat the card lives in — the deal workspace chat AND the relationship's P2P chat — each linked via `metadata.deal_card_id` (a P2P chat can host several deals over its life). *Why:* the P2P chat is the people's durable home base; after a deal is born the negotiation moves into the workspace, but the people must stay aware in P2P without walking into the workspace. Supersedes the original 4d spec's "post to the deal workspace chat" (Ayush, 2026-06-12).
- **First-contact intro = AI-written.** On accept, `sella-intro` rewrites the rollout's static seeded `intro` line into a warm, context-aware opener (the two people, companies, request kind, note), AI-origin tagged. Fail-soft: the static intro stays if Sella is down.
- **Sella's voice uses short dashes only** (a prompt rule, matches the house style). **`tsconfig` excludes `supabase/functions/**`** from the Next typecheck (the Deno edge files were never meant for it; tsc is now clean).

*Why record:* completes Chapter 4 (Sella). No migrations — all engine + inline wiring on `edit_deal_draft` / `acceptItem`. Verified live incl. a browser edit→summary end-to-end. Engine detail in ARCHITECTURE-NOTES 2026-06-12.

---

## 2026-06-14 (Waypoint 4.5) — Deal birth + acceptance redesign: proposal-in-chat + the Sella strip

Resolves a tangle found while opening 5A.4: the card is born too early and acceptance lives ON the card, which (1) makes a person "accept their own deal", (2) leaves orphan workspaces when no one confirms, and (3) gives Sella nowhere to ask (she may suggest but not make a card — the AI fence). The fix realigns the code to the already-locked two-confirmation journey (2026-06-12 Sella 4b), not a new flow.

- **One birth path, two doors.** Manual-create AND Sella-detection both produce a **proposal** = a `deal_detected`-shaped chat message carrying the draft + per-company votes (NOT a card, NO new deal status). *Why:* detection already proves "a message is the pre-card object"; making manual-create produce the same message unifies birth and reuses `confirm_detected_deal` + `create_deal_draft` untouched.
- **Sending = accepting (manual).** The proposer's company vote is pre-set `accept`; only the other side is pending. Detection: both votes start null. Kills "accept your own deal".
- **Birth (card + workspace) only on both-accept, atomically. Supersedes 3.5a D5** ("workspace at Draft"): no card and no workspace exist until both accept → no orphan. The proposer is the initiating side (offer/order reads from `metadata.proposed_by_company`, not whoever accepts last).
- **The card becomes pure display; the Sella strip owns all actions.** The deal bar (`DealPin`) becomes the **Sella strip** — one shared, neutral, system-voice surface for birth-accept, the change-note ask, and the **Seal gate** (the 3d `ConfirmBar` moves OFF the card). Private "ask Sella" stays in the right panel. One selected deal at a time; cross-deal asks collect in a chat-header notification.
- **Privacy:** the proposal is a shared message, so the proposer's own-side private box is NOT carried in it (would leak to the counterparty) — added after birth via edit.

*Why record:* revises shipped Chapter-4 behaviour (where acceptance lived) and supersedes 3.5a D5, so it is load-bearing. The AI fence still holds — Sella only suggests the proposal; a human's Accept click is the only write that births a card. Build plan: `_workshop/build-plans/4.5-deal-birth-acceptance.md`. **4.5.1 (engine) built + held (not applied to any DB); next = 4.5.2 (the strip UI).** Scope: connected-P2P only — not-connected→inbox, C2C ticketing, the shop/offer path, and global notifications are parked.

---

## Layer 2 — Present surface (storefront)

### 2026-06-10 — Present storefront v0 (design + build, session 16)

- **Present = the seller's shop.** Layout follows Marcel's screenshot: a LinkedIn-style **cover banner** + logo, three glass profile cards (about / tags+HQ+warehouse / links), **dominance filter pills**, and a product card grid. **One `/present` page, two roles** (owner edit vs visitor) — reuses the locked "seller-view = buyer-view = same object" doctrine. *Why:* matches Marcel's design and the existing role-based model; one surface, not two.
- **Products enter via a seller-defined CSV template, not fuzzy parsing.** We own the columns/order → ingest is **validate-against-template**. The template carries **product + its current batch** (lab THC/CBD + terpenes). v0 = single image per product, one company-wide pricelist. *Why:* defining the contract removes the messy multi-table / duplicate-THC / header-less problems the prototype found — a far smaller, more reliable build. Off-template uploads (fuzzy parser) **parked post-v0**.
- **Price visibility = per-product `price_public`** (default OFF → buyer sees **"Request pricing"**; seller opts each product in). Request-pricing routes to **Connect's inbox** (type `pricelist_request`, 2a machinery). *Why:* DEV-12 — prices aren't public by default; per-product matches "control what to show and what not". Per-connected-company custom pricelists stay deferred.
- **Company profile fields:** fixed identity as **real columns** (`tagline`, `cover_path`, `logo_path`, `warehouse_location`); **social links in `company.metadata`** (jsonb list); tags reuse `company_type`. *Why:* match storage shape to data shape — fixed = columns, variable-length list = jsonb.
- **Import is atomic** via the `import_products(jsonb)` RPC (SECURITY INVOKER, RLS-scoped to caller's company). One CSV row fans out → `product` + `pricelist_item` + `product_batch` + `batch_terpene` + `product_cost`. *Why:* a half-imported catalog is worse than none; mirrors `onboard_company`.
- **Deferred (post-v0):** Deal Room (separate Present tool), per-customer pricelists, multi-image galleries, off-template/fuzzy CSV import, in-app template-download button.

### 2026-06-10 — Present product image gallery (build, session 18)

*Lifts the "multi-image galleries" deferral from the session-16 entry above.*

- **A product has MANY images, stored in a `product_image` table (1:many), not a column.** Replaced the single `product.image_path` with `product_image (product_id, company_id, image_path, position)`; `position 0` = cover. *Why:* researched — Medusa/Saleor/Spree/Vendure and Supabase guidance all model galleries as a separate ordered table; a JSON/array column is the documented anti-pattern (reorder/delete become whole-document rewrites, no per-image RLS). Old `image_path` backfilled → `position 0`, then dropped; `import_products` RPC updated to write a `product_image` row. *(migrations `20260610150000`, `…160000`.)*
- **Image bytes upload browser → storage directly; the server only stores paths.** *Why:* routing files through a Server Action hits Next's 1 MB limit AND Vercel's **4.5 MB platform body cap (not raisable)** — it would break in production. Client uploads via supabase-js to `shop-media` (Storage RLS scopes to the company folder); a tiny server action records the paths. Remove is symmetric (server deletes row, client deletes file). **Reusable for any future file upload.**
- **Owner-management of a storage bucket needs a company-scoped SELECT policy.** `shop-media` had INSERT/UPDATE/DELETE but no SELECT, so `remove()` (which does select-then-delete) silently orphaned files. Added `shop_media_select` scoped to own-folder only — no anon/cross-company listing reopened. *(migration `20260610170000`; root-caused via live testing.)*
- **Reorder + set-as-cover included (not deferred).** One authoritative `position` writer (`setProductImageOrder` takes the full ordered id list); "make cover" / move-left-right resolve to it client-side. Carousel = **Embla** (~7 KB, zero-dep); frame `aspect-[4/3]` to stay proportionate in the grid.
- **Shipped to production** (PR #85→dev, #86→main). Engineering detail in `ARCHITECTURE-NOTES.md` ("Present product gallery", 2026-06-10).

### 2026-06-10 — Profile & QR business card (design + build, session 19)

Full design contract in [PRD/profile-and-qr-card.md](../PRD/profile-and-qr-card.md) (decisions D1–D13). Load-bearing locks:

- **QR → public profile page** (`/c/<handle>`), not vCard-only or connection-only. The page is the deliverable (info + Save-contact, works for any scanner); the connect-action is progressive enhancement. *Why:* dissolves the "scanner may not be on HS" break — the page renders for everyone, signed in or not.
- **Card identity = person, connects to company** (matches the company↔company model, DEV-7). The personal card is the entry point; a logged-in scanner's "Connect" routes to the company.
- **Public page exposes ONLY a curated projection** via a `get_public_profile` `SECURITY DEFINER` RPC — anon never gets SELECT on `person`. Email IS public (business-card intent); per-field public toggles deferred.
- **Profile fields promoted to typed `person` columns** (`display_name/title/phone/language/links/avatar_path/public_handle`), not `preferences` JSONB — one authoritative source for onboarding + account + card + page.
- **Readable `public_handle`** (name slug + numeric suffix), permanent once shared; generated on first profile save for new users.
- **Card placement = bottom-left avatar popover** (card + QR + My Profile/Company/Settings/Sign out); account screens = sidebar-settings layout; public page = light business-hero.
- **Back button only for signed-in viewers** on the public page (an outsider scanning the QR has no app to return to).
- **Licence env-gated** (`NEXT_PUBLIC_REQUIRE_LICENSE`): required in prod, optional in local/preview.
- **Connect button = deliberate stub** — real P↔C wiring is the Connect surface (Ayush).
- **Shipped to production** (PR #88→dev, #89→main admin override). Engineering in `ARCHITECTURE-NOTES.md` ("Profile & QR business card", 2026-06-10).

---

## Layer 2 — Discover surface

### 2026-06-11 (session 20) — Discover: closed + tagged directory (NON-marketplace) — supersedes session-13 browse-depth

Marcel's directive (2026-06-10): *"Discover closed to not see shit, but a line with the company logo and a request to enter… It needs to be a NON-Marketplace."* This resolves the page structure + scope that session 13 left open, and **changes the browse-depth** of the session-13 visibility lock.

- **LOCKED — Discover is a CLOSED, TAGGED directory, not a marketplace.** Each company shows as a brand line (**logo · name · category · country**), filterable by category/country/name. The company's **shop / products / prices stay hidden** until you **"Request to enter"** and are accepted. No open catalog, no prices, no feed. *Why:* Marcel's NON-marketplace directive — stays discoverable while never exposing a catalog to strangers in a sensitive industry.
- **Supersedes the session-13 "browsable public shop" depth.** *Who is listed* is unchanged (the "has a public shop" key still decides listing; buyers are exact-search only). What changed: a listed company's shop is **no longer browsable on sight** — it's gated behind request-to-enter. The asymmetric *listing* rule survives; the open *catalog* does not.
- **Page structure DECIDED = search-first lobby** (centred search + category pills + single-column company list). Chosen from a 3-variant throwaway prototype (registry table / filter-rail grid / search-first lobby). *Why:* search-first sells "ask to come in," not "scroll a feed" — truest to NON-marketplace. The "Tagged" line (vs bare logo / vs teaser) is the minimum needed to *find* who to request without *browsing* a catalog.
- **Ad / social feed = CUT** (was the heavier half of the session-13 "two jobs" confirmation). A campaign/ad feed contradicts a closed non-marketplace; dropped from scope.
- **"Request to enter" wiring = OPEN** — entering = *unlock-shop* (Discover owns the access grant) **vs** = *a Connect request* (one door, reuses Connect's plumbing; gate state lives in Connect). Leaning the latter; **deferred until Connect's request/accept flow is ready**. Button stays stubbed until then.
- **First slice = UI only** (search-first directory, placeholder data, stubbed button). Real `list_discoverable_companies()` `SECURITY DEFINER` RPC (same anon-safe projection pattern as `get_public_profile`) + the gate are the next slices. Build plan: [`docs/muskan-build/discover-directory.md`](../muskan-build/discover-directory.md).

### 2026-06-14 — Discover & public profile: soft openness model (supersedes "closed + tagged" 2026-06-11)

The "closed by default" lock above was a demo simplification (Marcel: build closed *for the demo*). Building the real product now — for onboarding + testing — we move to a **company-curated profile, LinkedIn-style**.

- **Public profile is company-curated (soft), not closed-by-default.** Openness = two per-product dials: visible-on-profile (`product.profile_visible`, **new**) × price-visible (`product.price_public`, exists). Levels emerge: **L0** bare card → **L1** products/no price → **L4** full priced shop. *Why:* the soft model is a **superset** of "closed" — a company that wants closed just stays at L0; gives each company go-to-market flexibility; matches B2B norm (LinkedIn / Alibaba / Faire).
- **Audience-scoped for compliance.** Products/prices show to logged-in **verified members** only; the anonymous public card (`/c/<handle>`) stays **bare**. *Why:* contains German **HWG** public-advertising risk for prescription cannabis — showing to verified members ≠ showing to the open internet.
- **Discover directory stays minimal** (brand line: logo · name · category · country); the chosen openness shows on the company's **profile** after click. *Why:* listing ≠ browsing — reconciles the closed directory with the soft profile.
- **Connect CTAs map to the 4 existing inbox types**, surfaced contextually on the profile: Connect (`connect`) · Connect + note (`connect_message`) · Request pricing (`pricelist_request`) · Offer card (`deal_card`). A note is optional on every connect. *Why:* reuse locked inbox machinery; **no new request types**. 🔴 **PARTIALLY SUPERSEDED 2026-08-25 — the `deal_card` arm ONLY** (ADR 0006 §8.5, slug `0023-deal-draft-lands-in-chat`): a buyer's company-addressed deal no longer cuts an inbox ticket — `send_deal` posts a `deal_card` pill straight into the relationship's c2c chat and creates **zero** `pending_inbox_item` rows. **`connect`, `connect_message` and `pricelist_request` are UNTOUCHED and still route to `/connect/inbox`**, so this bullet stands for them and the page is not retired. Pre-existing deal tickets survive and stay claimable. Live on production 2026-08-25. Full entry at the file's tail. *(Appended in place, adding no lines: `:1013` is cited by ADR 0006 `:47` and its **§8.5** (a SECTION anchor, deliberately — that reference sat at `:563`, then `:598`, then `:604` as this very ticket edited the ADR above it; a line number into a file you are also editing is not a citation, it is a guess), plus `PRD/0023:6` and `STATE.md:54`/`:68` — and an INSERT here would shift every line below, which is how `D-12` at `:1219` was briefly falsified.)*
- **Two-track build.** **Track 1 (now)** = the real connect loop between two onboarded companies (Discover real data → profile → connect/note/request-pricing → accept → C2C/P2P chat), buildable on existing schema + one `profile_visible` column. **Track 2 (later)** = the FLOWZ growth engine — already documented (LAYER-1 §13, LAYER-5, [`research/dev-62-dev-44-flowzz-mirror-shop.md`](../research/dev-62-dev-44-flowzz-mirror-shop.md)); its **outbound offer/inquiry email is legally RED** (UWG §7(2) per-se rule), deferred behind consent/partnership. The shadow-profile + claim-on-signup part is the defensible half. *Why:* ship the testable loop first; don't build the RED outbound until consent exists. Build plan: [`docs/muskan-build/discover-connect-loop.md`](../muskan-build/discover-connect-loop.md).

---

## Cross-cutting — Storage uploads

### 2026-06-11 (session 21) — Single-slot uploads: client-direct + stable filename (Option B)

Hardening for avatar / cover / logo. The storefront gallery already did client-direct (session 18); this finishes the pattern for single-slot media and fixes orphaning. Full plan in [PRD/storage-uploads.md](../PRD/storage-uploads.md); engineering in `ARCHITECTURE-NOTES.md` (2026-06-11). Research-grounded (Supabase storage best-practice + Smart CDN docs).

- **Single-slot media (avatar, cover, logo) uploads client-direct to storage; the server stores only the path string.** Dodges the Next/Vercel Server-Action body limit (1 MB / 4.5 MB). Avatar was already client-direct; **cover/logo migrated off the server path** (`updateShopProfile` no longer touches bytes).
- **Stable filename + `upsert` = orphan-proof by construction.** Single-slot assets use a fixed path (`{id}/avatar`, `{companyId}/cover|logo`, **no extension**) so a re-upload overwrites the one file in place. Supersedes the prior UUID-per-upload naming, which made `upsert` dead (a random name never collides) and orphaned the old file on every replace. *Why no extension:* a path carrying the extension would change on a format switch (png→jpg) and re-orphan. **Collections (the product gallery) keep unique filenames + explicit delete-on-remove — a different rule, because 1:many genuinely needs unique paths.**
- **Cache = `?v=updated_at` nonce on read.** Stable filename ⇒ stable URL, so a `?v=<row.updated_at>` nonce busts the browser cache after a swap (Supabase Smart CDN already auto-invalidates the object on overwrite, ≤60s). Filename-versioning — the "stronger" cache-buster — is **rejected**: it's the opposite of stable-filename and re-creates orphans.
- **Orphan cleanup = Storage API, not SQL.** A raw `delete from storage.objects` can leave the backing file billed; the Storage API delete (RLS-scoped) removes both. Cleaned 3 legacy orphans this way.
- **Deferred (own task): parent-delete file cascade across ALL buckets** — deleting a `product`/`company`/`deal` row leaves its storage files (a DB cascade removes rows, not storage objects). Needs a trigger/app-layer cleanup + isolation test.
- **Shipped to dev (#98); dev→main HELD** (a promotion would also ship Ayush's offline 3c/3d — joint call).

## 2026-06-15 — Discover soft-openness catalogue BUILT (slices 4–6)

- **Built per the 2026-06-14 L0→L4 lock.** A seller opts each product onto their public profile via `profile_visible` (Dial A) × `price_public` (Dial B); the **L0/L1/L2 level is derived at render** (no stored level column). A verified member sees another company's catalogue before connecting through the `get_discoverable_shop` SECURITY DEFINER RPC (safe projection, gated prices, never `cogs`); the RLS **"dial floor"** — `product` / `product_image` / `pricelist_item` public-reads all gate on `profile_visible` — is the backstop for direct reads. **Request pricing** = a `pricelist_request` inbox item; viewer state separates connect-pending from pricing-pending. Engineering in ARCHITECTURE-NOTES (2026-06-15); build + follow-ups (F1–F13) in `docs/muskan-build/discover-connect-loop.md`. PR [#104](https://github.com/HelloSello/hello-sello-mvp/pull/104) → dev **merged**.

---

## 2026-06-16 - Deal CHANGE flow: an edit is a HELD two-sided proposal (pending change + full lock), not an instant version bump

Extends the 2026-06-14 Waypoint 4.5 birth/acceptance work to the deal-CHANGE flow (4.5.4 = the backbone). Full design + the built/missing/wrong map: `_workshop/build-plans/6-pending-map.md` (§1, §2, §3A). ADR: `docs/architecture/adr/0001-held-deal-change.md`.

- **An edit is HELD until both companies accept (supersedes 2026-06-11 "edit_deal_draft commits a new version immediately").** Editing no longer touches the live card; the change waits as a **pending change** and the card keeps showing the last agreed version, changing ONLY on both-accept. A decline or a proposer withdraw discards it. *Why:* the card is the one honest signal the deal moved, and a human confirms every move (guards a Sella/system mistake).
- **The pending change is the strip's data, stored on the deal - not the card, not a chat message.** A `deal_pending_change` record, one active row per deal (DB-unique), holds the new SHARED terms + base version + proposer + source + the proposer's Change reason + votes. Transient (deleted on every exit); permanent history stays in `deal_card_log` + `deal_change_input`. Both the p2p strip and the deal-chat strip read this one row, so they stay synced (card displays, strip decides - confirms D5/D6).
- **Full lock while pending (pessimistic, on purpose).** While a pending change exists the Edit pencil is disabled for everyone; the DB-unique row enforces it under races, not just the button. *Why:* a two-company negotiation edits rarely and serially, so locking removes all version-clash code (chosen over optimistic concurrency).
- **Three exits, per company:** the OTHER company Accepts (+ Change reason) -> commit; the OTHER company Declines (+ Change reason) -> discard; the PROPOSER Withdraws (no reason) -> discard. Any person in the responding company, from either chat, decides for the company; the proposer cannot self-accept; anyone in the deal workspace (either company) may propose. **This pending-change Withdraw is NOT the seal Withdraw removed by D16** - the seal gate stays Accept/Decline only.
- **Change reason is captured in the strip, never a buried form field (confirms D8).** Edit pencil -> form (shared + the editor's own private items) -> Done -> strip pop-up collects the Change reason + Send. SHARED terms -> the pending change; PRIVATE numbers (buying price / COGS) -> written to the editor's own side immediately, NEVER in the pending change (privacy - both companies read the strip in the deal chat).
- **Announcements: both chats, both outcomes (supersedes the 2026-06-15 D18 accept->deal / decline->p2p split).** Accept and Decline each post a uniform system message to BOTH the deal chat and the p2p chat; Withdraw = a quiet notice. (Exact wording = 4.5.5 / T3.)
- **Commit reuses today's version-build logic, run later.** On the second yes, the existing `edit_deal_draft` body builds version base+1 (snapshot shared lines, carry both sides' private boxes forward), status stays `draft` (the final golden seal is end-of-lifecycle, out of scope now), writes the log line + BOTH Change reasons, fires the announcement, deletes the pending row, unlocks.
- **Parked:** the final golden seal (end stage); per-product private cost -> margin + edit-form redesign (map T5b); Sella detecting changes (map T6); C2C ticketing (map T7/T8).

*Why record:* changes a locked decision (the 2026-06-11 instant edit) and is the backbone the rest of 4.5.4-4.5.6 hangs off. **Status: design locked 2026-06-16; 4.5.4 build not started.** (Sources: 2026-06-16 grill-with-docs session; `6-pending-map.md`; ADR-0001.)

## 2026-06-17 - Phase 1 (4.5.4) BUILT; the golden Seal is REMOVED from the strip (deferred to the deal's final stage)

The 4.5.4 held-change backbone above is now built, verified, and GSD-complete (e2e green, 8 passed; 5 deal-domain migrations, LOCAL only - cloud apply pending: `docs/deploy/cloud-migrations-pending.md`). Two decisions emerged while building:

- **The two-seat golden Seal control is removed from the deal strip and deferred to the deal's FINAL stage (design TBD).** *Why:* accepting a *change* was leaking into the *seal* state - `confirm_deal_change` wrote a `deal_confirmation` row with `status='confirmed'`, which the Seal gate reads as "this side has sealed", so after a change the strip showed a false "Awaiting <company>" pill and the card could turn golden. Shared table, two meanings → one feature corrupting the other. Fix is two-part: (1) `confirm_deal_change` no longer writes `deal_confirmation` at all - the canonical change-reason store is `deal_change_input` (this supersedes the D-07 "wire `deal_confirmation.note`" sub-decision, which is dropped); (2) the Seal control (`sealControl` + its popover) is removed from `DealPin`. The `ConfirmBar` component and the `confirmDeal` action are KEPT (unused by the strip) for the future final-stage seal. This also aligns with the existing "final golden seal = out of scope now, deals stay `draft`" parking.
- **`deal_pending_change` must be in the `supabase_realtime` publication.** The strip subscribes to `postgres_changes` on that table so the lock + the "Review change" pill appear/clear LIVE on both screens; the table was missing from the publication, so it only updated after a manual refresh. Added via migration `20260617130000`. RLS still scopes realtime events to relationship members.

**Reconcile in Phase 2:** because the whole Seal control is already gone from the strip, the planned "remove the seal Withdraw from the gate" (D16 / map T4) may already be moot - Phase 2 planning must check what is actually left of the seal/gate before planning that task.

*Why record:* removes a shipped UI surface (the strip Seal) and drops a sub-decision (D-07's `deal_confirmation.note`), so it is load-bearing for anyone touching the strip or the final-stage seal. **Status: built + verified 2026-06-17; cloud apply deferred.** (Sources: this build session; memories `seal-deferred-to-final-stage`, `e2e-deal-setup-needs-birth-and-open`.)

## 2026-06-17 - Deal Card & Form overhaul: card data-model rule locked; margin (T5b) pulled into v1; the card Note is HELD

A long card/form grill-with-docs session (grounded against the live code + DB) widened the tiny "Phase 3 = Card Note" into a proper **Deal Card & Form** milestone, built for real (backend + data); visual polish deferred to the UI phase. Source of truth: `_workshop/build-plans/7-dealcard-form-overhaul.md`; data-model decision: ADR-0002.

- **One rule for the card:** a field shown on the shared card (both see it) is HELD - a change needs the other side's Accept/Decline; a field private to its owner is IMMEDIATE (own-side, ungated). Derived totals (value net/gross) follow their inputs.
- **The card Note is HELD, not immediate** (reverses the plan-phase working guess "D-34"). Per-company authored, both-visible; the other side Accepts/Declines a note change but cannot rewrite it; a Decline discards it. Reuses the edit-form note box; shows on the card face from birth; **removed from the log** (the create note lands in `deal_card_log.change_summary` today). Needs NEW storage that versions with the card.
- **Margin (T5b) moves from out-of-scope into v1, PER PRODUCT, shown as a percentage, owner-only.** Seller margin = (unit_price - cost) / unit_price; buyer margin = (resale - unit_price) / resale; per line + a deal average. Store the input (cost / resale), compute the margin. Wired through the EXISTING dormant tables `deal_line_item_private` (per-line, owner-only RLS) + `product_cost` (COGS) - not new schema, and not the public `deal_line_item`. Replaces today's single, mislabeled `deal_party_field` box (it hardcodes the seller label + `party_side='seller'`, so the buyer's number renders under the wrong label).
- **The card shows** batch number + measured THC/CBD (per line), payment terms, free delivery, and the per-side margin %. A deal line **belongs to a batch** (`product_batch`); measured values are snapshotted at deal time (frozen pattern). `deal_line_item` needs a `batch_id`; demo batches must be seeded.
- **Two value bugs fixed in the same area:** the card value must SUM the line totals (OBS-1: it can read 0 because `value_net` is stored, not recomputed live); the unit/price math must normalize kg vs g (OBS-2: prices are per-gram but the unit dropdown changes g->kg without converting the price).
- **Parked:** incoterms on the card (dormant column - never written, never shown; revisit with the team); the clickable product card + full detail/terpenes (reads the deal-time snapshot, ~1 week out); a configurable "pick what shows" display panel; SIGNALS stay per-company.
- **Re-scoped into phases 3a-3e** (display correctness -> held Note -> margin -> form UX -> batches); old Phase 4/5/6 shift after, and Phase 6's UI scope is re-checked once this lands.

*Why record:* supersedes the card-Note "immediate" assumption, un-parks T5b into v1, and locks the card data-model rule the rest of the milestone hangs off. **Status: design locked 2026-06-17; build not started; LOCAL-only, cloud push deferred + coordinated with Muskan** (she holds the `product`/`pricelist_item`/`product_image` RLS surface + a `supabase/migrations/` lock until her own push). (Sources: 2026-06-17 grill-with-docs session; `7-dealcard-form-overhaul.md`; ADR-0002.)

## 2026-06-17 - The deal form becomes a reusable "Deal Basket" (Option A) + a recipient field

A post-commit continuation of the Deal Card & Form session. Decision + detail: ADR-0003; design note `7-dealcard-form-overhaul.md` section 10.

- **The deal form is promoted to a reusable "Deal Basket"** - one model + form holding a deal's editable content + a recipient, fed by every trigger (human / Sella / shop); on send it becomes a Deal Card. The existing `DealForm` is already this ("dumb + fed", reused by create/edit) - we name it, and let Sella + the shop feed the same shape.
- **Option A chosen (transient):** the Basket lives only while the form is open and materialises into a Deal Card on send; nothing persisted. Option B (a saved/shareable Basket record) is deferred.
- **Rename** `DealForm` -> Deal Basket if convenient; keeping "Deal Form" is acceptable (the concept matters more).
- **New recipient field:** company mandatory, person optional; no person -> the deal addresses the company. Defaults from the trigger (p2p chat -> that person; C2C -> that company); panel/shop -> chosen from CONNECTED companies/people only.
- **Now vs future:** the Basket name + recipient field + the p2p-chat default are buildable now (foundational to the form work). Creating from Sella's panel / the shop, and company-only sending (no person), are FUTURE - the last needs the parked C2C ticketing. New req BSKT-01.

*Why record:* a reusable input model that unifies how every trigger creates a deal, and adds explicit deal addressing. **Status: design locked 2026-06-17 (Option A); build folds into the Deal Card & Form milestone; LOCAL-only.** (Sources: 2026-06-17 post-commit session; ADR-0003; `7-dealcard-form-overhaul.md` section 10.)

## 2026-06-18 - Phase 3e (Form product UX, FORM-01/02) built: pack-based basket quantity + the recipient row shown on create AND edit

Phase 3e shipped the Deal Basket's product-adding UX (built directly for speed + a frontend-design polish pass; backend untouched - no DB/RPC/migration). Code on `claude/ayush/work`, LOCAL only.

- **FORM-01 - increment, never duplicate:** re-adding a product that is already on the deal adds to its line instead of making a second row. Matched by `productId`; a custom line (`productId: null`) never merges. Pure rule in `src/modules/deals/lib/lineEditing.ts` (`addOrIncrement`), unit-tested.
- **FORM-02 - add by name + custom:** one search box over the in-memory own catalogue (`getOwnCatalog`) auto-fills a picked product; typing a name not in the catalogue offers "Add '<name>' as a custom product" (`emptyCustomLine`, `productId: null`). Custom productId-null lines were research-confirmed safe through create + held change + card read; the `confirm_deal_change` margin carry-forward deliberately skips null-product lines (documented limitation, left untouched).
- **Quantity is by PACK, not raw grams (grounded in the product table).** Each product has `pack_size_grams`; the basket steps quantity by one pack (+/- buttons), shows "N packs", and the grid shows a "selected" badge + the pack label ("10 g pack" / "1 kg pack"). The line still STORES grams and is still priced per gram, so the card money math (CARD-01/02) is unchanged. `getOwnCatalog` now also reads `pack_size_grams`. Fallback step = 1000 g when a product has no pack size (and for custom/edit lines).
- **The locked "To" (recipient/assignee) row now shows on BOTH the create form ("From chat") and the edit form ("Assigned").** This is the universal Deal Basket assignee field, **locked in p2p** (auto from the relationship). On edit it is company-level (the person needs the p2p chat thread, which the deal workspace does not carry yet - a small future add).

**Still future (the next-stage shop/Sella work, confirmed NOT built):** the editable recipient PICKER (a dropdown of connected companies -> their people), the shop/Sella basket entry points that would produce `source` 'shop'/'sella', and company-only sending via C2C chat. The recipient data model + `source` union already exist; the picker UI, the "list connected companies/people" read, and the C2C routing do not.

*Why record:* locks how basket quantity works (packs over a per-gram price) and that the assignee is now visible-but-locked everywhere, and states precisely what of the recipient-picker is built vs deferred so the shop/Sella stage starts from truth. **Status: built + verified locally 2026-06-18 (36 unit green, tsc+eslint clean, deal-change e2e green); LOCAL-only, no cloud changes (no migrations this phase).** (Sources: this build session; `7-dealcard-form-overhaul.md` §3/§10; ADR-0003; the live `product` table.)
## 2026-06-17 — Phase 4 plan: a REVOKED company is a new verification status, not an overloaded `rejected`

- **`company.verification_status` gains a fourth value `revoked` (additive lookup row, `is_terminal=TRUE`) rather than reusing `rejected` + a flag.** A *rejected* company never got in → routes to `/onboarding` to fix + resubmit (D-07); a *revoked* company was verified then HS-suspended → routes to `/home` with a hard-block "access suspended" banner (D-10), no resubmit. *Why:* two states with two pages and two copies — one status each keeps routing a single-field read; overloading `rejected` + a "was-verified" flag couples two unrelated UX flows onto one value and is easy to get wrong. **Status: planned (Phase 4, 04-01 migration `20260617140000`); not built.** (Source: Phase 4 plan-phase session; 04-RESEARCH.md.)

## 2026-06-17 — Phase 4 BUILT + code-review complete; `createCompany` revoked guard is a direct DB check, not `requireVerified()`

- **Phase 4 (auth-gate hardening) is fully executed and code-reviewed** (follows from the `revoked` status plan above — now built and green). 04-01–04-04 all complete; code review (04-REVIEW.md) found 1 critical + 4 warnings, all 5 fixed.
- **The `createCompany` Server Action guards against revoked users with a targeted `verification_status === 'revoked'` check + early `{ error }` return, NOT `requireVerified()`.** *Why:* `requireVerified()` calls `redirect()`, which is incompatible with a Server Action that must return an `ActionResult` object. The onboarding flow uses `createCompany` to build the company record during signup; revoked users reaching it directly via POST must get an error response, not a redirect. The layout's Bouncer 1 handles redirects; the action-level guard handles direct POST. *(WR-01, Phase 4 code review — `src/app/onboarding/actions.ts`.)*

## 2026-06-18 - Phase 3f (Batches end-to-end, BTCH-01) built: a deal line points at one batch with frozen measured values; product+batch is one entity; margin carry-forward keyed on product+batch

Phase 3f wired the dormant batch layer end-to-end (deal-domain only). A deal line now references one `product_batch` (the chosen lot); the batch's MEASURED THC/CBD + batch number are snapshotted (frozen) onto the line at deal time and shown on the card. Design: `_workshop/build-plans/7-dealcard-form-overhaul.md` §5; ADR-0002 (snapshot/frozen rule).

- **D-06 - product + batch is ONE entity.** Picking a catalogue product does NOT create a line by itself; it opens a MANDATORY batch dropdown, and the line is born only once a batch is chosen - so a catalogue line can never exist without a batch (enforced at add-time; `canSubmit` is the backstop). An off-catalogue custom product (`productId: null`) is exempt - no batch.
- **D-09 - the per-line margin carry-forward keys on `product_id` + `batch_id`** (supersedes the earlier "known limitation" that joined on `product_id` alone). Because the merge key lets the same product sit on two lines (batch 4 vs batch 5), a product-only join would land a margin on the wrong line on a version bump. The `confirm_deal_change` private carry-forward now adds `and new_line.batch_id is not distinct from old_line.batch_id` (`is not distinct from` keeps legacy null-batch lines matching). The only case left ambiguous - two custom lines (null product + null batch) carrying a margin across an edit - is a deferred recorded fix (the existing `product_id is not null` guard already skips custom lines).
- **Snapshot storage:** the batch's measured THC/CBD is written into the line's EXISTING (empty) `thc_percent`/`cbd_percent` columns; only `batch_id` + `batch_number` are new columns. The freeze rides on the held draft (snapshot-through-draft), carried verbatim across version bumps - never re-read from the live batch. This also fixed a latent bug where measured values were written to dead `metadata` on birth and dropped on a version bump, across all three birth doors (`createDeal`, the proposal path `confirm_detected_deal`, and the version rebuild `confirm_deal_change`).
- **RLS:** `product_batch` stays seller-private (`batch_all`); the buyer only ever sees the frozen public snapshot on the line. 2 migrations (`20260618140000_deal_line_item_batch`, `20260618150000_confirm_detected_deal_batch`); 8 demo batches seeded.

*Why record:* locks the batch data path (one line = one chosen lot, frozen) and the two refinements Ayush drove - product+batch as one entity (D-06) and the margin join now batch-aware (D-09, which removes the prior limitation). **Status: built + verified 2026-06-18 (7/7 must-haves; unit 41/41; deal-change e2e 20/20; full 75-migration `supabase db reset` green after merging Muskan's dev work). LOCAL - cloud push deferred + coordinated with Muskan (15-migration batch).** (Sources: this build session; the `03F-*` planning artifacts; ADR-0002.)

## 2026-06-20 — Person name is a single canonical `display_name`, set by every signup path; onboarding gates on it (not first/last)

The split `first_name`/`last_name` model couldn't represent mononyms / single-name social logins — the first real Google signup ("Muskan", no surname) got `last_name = ''` and could never complete the "Your profile" onboarding step (which required `last_name`). Root cause: two competing name representations (the UI edits `display_name`; the check read first/last) that disagreed.

- **`display_name` is the canonical name.** Every signup path populates it: the `handle_new_user` trigger now sets it (provider `full_name`/`name`, else a compose from the resolved first/last), and the email signup form sends a single `full_name`. `first_name`/`last_name` stay only as DERIVED values for the QR vCard — no longer the source of truth for "the name".
- **Onboarding "Your profile" completeness is a pure, unit-tested rule** (`profile.isProfileComplete()` — single source of truth), NOT an inline first/last check. Research-backed (W3C personal-names; single-full-name-field UX): never require a surname; one field absorbs mononyms, middle names, reordered names. No academic-title / middle-name field (the single field covers them).
- **One-time backfill** filled `display_name` for existing rows from first+last (idempotent), in the SAME migration as the trigger change — data and rule migrate together, so pre-change accounts aren't broken by the new rule.

*Why record:* locks the canonical-name model and that the completeness rule lives in one tested function. **Status: built + verified 2026-06-20 (46 unit green, tsc clean; trigger + backfill verified on local `db reset` and applied to cloud `20260620120000_canonical_display_name`; auth-trigger e2e written but blocked by pre-existing local fixture-key rot).** (Sources: this session; W3C Personal Names; SaaS onboarding research.)

## 2026-06-20 — Onboarding profile completion = name + title only; profile photo is OPTIONAL (not a completion gate)

Surfaced during 6.1 UAT: the home checklist sends an unfinished "Your profile" to the onboarding stepper, which collects name + title but NO photo — yet completion required a photo, so the step could never tick it (you had to detour to `/account`).

- **Decision: drop the photo from the required completion check** → profile complete = `display_name && title`. Photo stays available (and can be nudged) but never blocks. Resolves the stepper-vs-settings disparity (the step now collects enough) AND follows industry practice.
- **Why (researched, per the "research common patterns first" rule):** SaaS onboarding best practice — only require a field if the product can't function without it; every extra required field ≈ 7% conversion drop; request photos AFTER first value (progressive profiling), not during setup. (ProductLed, Candu, DesignRevision, 2025.)

*Why record:* locks that onboarding completion is name+title and photo is optional, with the reasoning. **Status: DECIDED 2026-06-20, NOT yet built — implement next session (small change to `isProfileComplete` + its unit tests + the home comment).** (Sources: this session UAT; SaaS onboarding research.)

## 2026-06-20 — E2E fixtures derive the local Supabase key from the running stack; never hardcode

The 3 auth specs hardcoded the legacy demo service-role JWT. The local stack (Supabase CLI 2.75) now uses asymmetric **ES256 JWT signing** (CLI default) + the new **`sb_secret_`** API-key format, so the hardcoded HS256 JWT no longer authenticates → every auth E2E failed ("key rot").

- **One source of truth: `e2e/fixtures/local-supabase.ts`.** Resolves `LOCAL_SERVICE_KEY` in order: `SUPABASE_SECRET_KEY` env override → parse `supabase status -o env` (`SECRET_KEY`) → throw a clear "is the stack up?" error. The running stack OWNS its keys; tests derive from it. Deletes the 3 duplicated hardcoded copies. Fail-loud beats a cryptic 401.
- **`auth-trigger` is deferred, not fixed.** It calls `auth.admin.createUser`, which needs an **ES256 `service_role` JWT**; the new stack 403s `sb_secret_` on GoTrue admin endpoints (works for PostgREST/DB, not admin auth). The clean fix needs a direct-DB insert into `auth.users` (a `pg` dev-dependency) — deferred since signup was manually verified end-to-end (session 33).

*Why record:* locks the "never hardcode a rotating local key" rule and the single-source-of-truth fixture. **Status: built + pushed 2026-06-20 (commit `f42f04b`) — `admin-verification` green, `auth-gate` 5/6 (1 fail = known append-only `audit_log` DELETE bug, unrelated), `auth-trigger` deferred.** (Sources: this session.)

## 2026-06-20 — Parallel work uses git worktrees + `.worktreeinclude`; `.planning` coordination is git-tracked only

A single engineer now runs several sessions at once (one per phase) to work in parallel. Settled how those sessions isolate and coordinate.

- **Isolation:** each parallel session runs in its **own git worktree on its own branch** (`claude --worktree <name>`). Code edits never collide; sessions meet only through git (push → PR → merge).
- **GSD planning inside worktrees:** a personal (gitignored) **`.worktreeinclude`** auto-copies `.planning/`, `CLAUDE.md`, and a personal `SessionStart` hook into every new worktree. Because it *copies*, each worktree keeps its OWN `STATE.md`/session-log (no clobbering); `ROADMAP.md`/`REQUIREMENTS.md` are read-mostly and edited in ONE place (the main checkout) — new worktrees inherit the latest at creation time.
- **Coordination channel = git-tracked files only** (code + `docs/team/sync/*`). `.planning/` is per-worktree/gitignored and is never used to coordinate. Ownership-first (split work into disjoint files); lock genuinely-shared files via the sync ritual.
- **Industry-validated:** git worktrees are the consensus mechanism for parallel coding agents; Claude Code ships native `--worktree` + `.worktreeinclude`. Agent-teams (shared task list + mailbox) exists but is for one-session multi-teammate work, not N independent long-running phase sessions, and still requires ownership boundaries.

*Why record:* locks the team's parallel-execution model so future sessions don't re-derive it, and documents why neither GSD workspaces (start empty) nor workstreams (don't isolate code) fit "parallel phases of one roadmap." **Status: setup DONE 2026-06-20 — personal gitignored `.worktreeinclude` + `.claude/hooks/session-start-coord.sh` + settings; general protocol added to `docs/team/WORKFLOW.md` "Parallel worktree sessions".** (Sources: this session; Claude Code worktrees + agent-teams docs; 2026 parallel-agent coordination research.)

## 2026-06-19 - Recategorisation + decision sweep (UI-first reorder, notification, message-voice, pack model, Deal Room rename)

A working session that re-sorted all open/not-done work into categories and closed the small open decisions. Working scratch (categorised board): `_workshop/notes/2026-06-19-recategorise-roadmap.html`. No code this session - decisions + doc updates only.

**Build order / prioritisation**

- **The UI pass (old Phase 6) moves to the FRONT - build it next, before notification + Sella.** *Why:* the notification bell, the Deals pop-up, and Sella's "proposed change" renderer all need a settled chat header + chat-top section; building them first then reshaping the chat in the UI pass means touching `ThreadView` / `DealPin` / `MessageBubble` twice. Settle the container first; inside the UI pass settle the deal-card layout early so the deal-card *content* work is not redone on a changing shape.
- **Suggested order after UI:** Notification (as part of global notifications) → Sella change-detection → Deal Basket / Deal-form flexibility. Ops (the cloud migration push) runs alongside, not far down.

**Notification**

- **The cross-deal alert ("another of your deals changed") is a SUBSET of the global app-wide notification feature - build it once, inside global notifications, not as a standalone piece.** *Why:* a separate bell + dot + read/unread just for deals would be rebuilt when global notifications land.
- **The unread dot must PERSIST across refresh until opened.** *Why:* a live-only ping cannot answer "what happened that I have not seen yet" - that needs a stored notification + a per-person seen flag; this is the design driver that gives the global feature its own small table.
- **Direction:** a bell in the chat + a bell in the global header (same data, two places); reuse the existing RLS-scoped realtime (`use-chat-realtime.ts`) as the live "re-check" signal and derive the actionable badge from the authoritative `deal_pending_change` row (do not store a second copy of that fact). Exact shape decided when built.

**Message-voice model (NEW discussion - belongs to Sella)**

- **Open topic: define the difference between a System message and a Sella message, and which voice narrates a deal event in the deal/p2p thread.** The three voices are `person`, `system`, `sella` (`MessageBubble.tsx`); the intended rule (`types.ts`) is `system` = the C2C audit voice, `sella` = the narrator in p2p/deal threads. But there is DRIFT: "Deal draft created" posts as `system` into the deal thread (`create_deal_draft`), while accept/decline announcements post as `sella` into the deal + p2p threads. *Why record:* this drift is the root of OBS-3; the fix is one rule ("a deal-lifecycle event in the deal/p2p thread always speaks in voice X"), decided in the Sella discussion. Until then OBS-3's voice is open.

**OBS decisions (deal card / form)**

- **OBS-3 - the first proposal SHOULD post a quiet notice (option three), not a person-style chat bubble.** The VOICE (System vs Sella) is deferred to the message-voice discussion above. *Why:* a "Deal proposed" person-bubble competes with the rule that the card/strip is the one signal a deal moved; a quiet notice matches how resolutions are announced. (Today's person-style bubble comes from the pre-Phase-2 `propose_deal_rpc.sql:69`.)
- **OBS-1 - picking a product defaults its line to quantity `1`, in the product's own natural unit.** *Why:* removes the misleading `0 €` card (value = price x quantity, so quantity 0 reads 0) without forcing a mandatory-quantity rule; the user types the real quantity over the default.
- **OBS-2 - the card display follows the already-built pack model; drop the free g/kg line unit so a per-gram price can never sit against a kg quantity.** The pack-count model already exists for input (2026-06-18 / Phase 3e: the basket counts packs of `product.pack_size_grams`; the line stores grams + is priced per gram). OBS-2 extends it to the card display: every product is a fixed pack, quantity is a COUNT of packs, weight = count x `pack_size_grams`, the user picks counts and sees grams, and the free g/kg `unit` choice is removed so the `8 EUR/g`-against-`1.0 kg` mismatch cannot be expressed. *Why:* fewer independent inputs (unit fixed by the product, weight derived) makes the bad state impossible by construction. **Implementation lands in the deal-form / Deal Basket phase.**

**Deal Room rename (DEV-66) - supersedes the 2026-05-19 "Deal Room" (DEV-22) + "Deal Workspace" naming**

- **The internal deal container is renamed "Deal Workspace" -> "Deal Room"; the customer-presentation surface is renamed "Deal Room" -> "Presentation mode".** One name = one surface. *Why:* Marcel's DEV-66 wants the friendlier "Deal Room" for the working container, but "Deal Room" was already the presentation surface - the swap frees the name and removes the clash. "Presentation mode" also aligns with the existing DEV-18 "Presentation Mode" concept (turning a product selection into a customer presentation), so it unifies rather than adds a term. The DB table stays `deal_workspace` (internal); the user-facing + docs sweep happens in the UI phase. **Watch:** "Presentation mode" sits near the surface name "Present" - confirm final wording at the UI-phase kickoff. CONTEXT.md term rows updated 2026-06-19.

**Triage of the not-a-phase backlog (parked / folded)**

- **Per-side owner / side_lead DB enforcement - PARKED until multi-person-per-company is real.** *Why:* with one person/owner per company today the invariant cannot be broken; triggers/indexes now are speculative.
- **Manual-create counterparty-person threading - FOLDED into C2C ticketing (T7).** A deal addressed to a company with no contact person only makes sense once a queue-and-claim flow can catch it. C2C routing: select a person -> routes like today's p2p but lands in the connected company's inbox; not a mandatory claim - pick up or reassign. Connected vs not-connected companies (T8) is built first and gates inbox-vs-p2p.
- **Audit-chain "born_now" flag fix - FOLDED into the Sella phase (P5).** RPC-born (Sella-detected / proposed) deals miss their `deal.created` audit entry because the idempotent RPC cannot tell "born now" from "already born" (`actions.ts:381`); fix when P5 reworks the detect/propose RPCs (touch the hash-chained log once). *Why:* the missing trace is exactly on AI-detected deals, where the audit trail matters most.
- **Access-matrix encoding (16-combo, DEV-51) - PARKED as post-MVP research.** Keep RLS as the floor + the app-layer policy module (locked 2026-05-29, B7); revisit a DSL/engine only when the hand-written matrix gets hard to verify.
- **Home / landing view (DEV-13) - PARKED (not for now);** revisit in the UI/nav work, leaning chat-first (the product is conversation-centric).
- **Deal origins beyond P2P (Shop + Sella) - land as part of the Deal Basket work** (the Basket, 3b, was built reusable for Sella/shop), not a separate task.
- **File uploads in the `+` menu - PARKED as a separate backend slice** (storage bucket + RLS).
- **The top-bar "Aurora Deutschland" placeholder is Muskan's** (wire to the real logged-in company) - removed from Ayush's list.

*Why record:* closes the small open product decisions (OBS-1/2/3, DEV-66), sets the UI-first build order, frames the notification + message-voice work, and parks/folds the backlog so the roadmap reflects one agreed plan. **Status: decisions locked 2026-06-19; no code this session; OBS-2 + the rename + notification + message-voice are to-build / to-discuss in their phases.** (Sources: 2026-06-19 recategorisation session; scratch `_workshop/notes/2026-06-19-recategorise-roadmap.html`; `MessageBubble.tsx` / `types.ts` voices; `product.pack_size_grams`.)

## 2026-06-19 (later) - Build order FINALISED (supersedes the "suggested order" above)

Ayush set the build order for the remaining work: **1. UI & chat -> 2. Deal Basket / Deal form (NEW phase) -> 3. Sella -> 4. C2C chat (NEW phase) -> 5. Notification -> 6. Other items (parked).** This supersedes the "suggested order" in the entry above (which had Notification at #2 and no separate Deal Basket / C2C phases).

- **The UI pass moves to the FRONT** (old Phase 6, built first); inside it, settle the deal-card layout early so the next phase's content work is not redone.
- **Deal Basket / Deal form becomes its own NEW phase** (#2): the OBS-2 count-of-pack display, card flexibility (text + link cards, pre-sell non-catalogue), clickable detail, configurable display panel, Shop + Sella origins, persistent Basket. Needs a `/gsd:phase add`.
- **C2C chat is promoted to a NEW phase** (#4): T7 ticketing + T8 connected/not-connected, absorbing manual-create person-threading. Needs a `/gsd:phase add`.
- **Notification drops to #5** (still built as a subset of global notifications).
- **Everything else parks** until 1-5 are done.

*Why:* one agreed sequence so the next session starts on UI & chat immediately (`/gsd:plan-phase 6`), with the heavier card-content + C2C work sequenced behind the surface they sit on. **Status: order locked 2026-06-19; the UI phase (P6) is next; the two NEW phases need `/gsd:phase add` before planning.** (Source: 2026-06-19 prioritisation session; `.planning/ROADMAP.md`.)

## 2026-06-20 - Connect/Chat F2 navigation BUILT: one accordion rail, full-width glass TopBar

F2 (global chrome) of the Connect/Chat UI overhaul: the two old nav bars merge into ONE rail and the chrome settles before the card/strip/form content work lands on it. Source plan: `_workshop/build-plans/2026-06-19-chat-ui-overhaul.html` (slice F2); the three nav models were built as throwaway prototypes in `prototypes/rail-prototype/` and compared before locking the accordion.

- **D-11 - one-rail ACCORDION navigation (supersedes the two-nav-bar layout).** The two old nav bars merge into a single rail (`IconRail`). Connect is an accordion: clicking it expands its sub-items IN PLACE as an indented tree and the other surfaces STAY visible; collapsed, the rail shrinks to a 64px icon strip with hover tooltips and a flyout popover for Connect's children. *Why:* chosen over a "replace / drill-down" model (where the other surfaces disappear while you are inside Connect) after building all three models as prototypes and comparing them - the accordion never hides the other surfaces, so a user can never feel lost about where they are, and it matches the reference apps Ayush supplied. The drill machinery is written generic, so any future surface can carry sub-items without new plumbing.
- **D-12 - "Inbox" is relabelled "Connection Request"** (label only; the route stays `/connect/inbox`). *Why:* the word names what the item actually is (an incoming request to connect), with zero routing change.
- **D-13 - Connect sub-item order is Chat, Connection Request, Relationship** (Relationship still disabled / "soon"). *Why:* Chat is the daily surface so it sits first; the dormant Relationship item stays last and visibly disabled.
- **D-14 - the TopBar is a full-width glass bar, not a floating slim pill; the search field lives in the TopBar, NOT in the rail.** *Why:* a full-width bar gives the search a stable home and keeps the rail purely navigational (icons + accordion), so search and navigation do not compete for the same edge.

*Why record:* locks the global chrome shape (one accordion rail + full-width glass TopBar + search location) that the rest of the Connect/Chat overhaul - the deal card, strip, and form - will sit inside, so later content work starts from a settled container. **Status: built + verified 2026-06-20 (prod build green; unit 41/41; tsc + eslint clean; adversarial 3-lens review - 1 real bug found + fixed). LOCAL only (branch `claude/ayush/work`, not pushed).** (Sources: this session; `_workshop/build-plans/2026-06-19-chat-ui-overhaul.html` slice F2; the rail prototypes in `prototypes/rail-prototype/`.)

## 2026-06-21 - Phase 04C (Card + Form UI touch) BUILT: slim shaded card header, card-as-leaflet over the conversation rail, one-tap Deal Form pick, Damson deep-pink recolor

The light "UI touch" on the deal card + deal form, so the final Agentation polish stays light. Decided SEE-FIRST: a parallel design workflow (8 agents = maroon recolor + 3 card + 3 form variants + a design critique) produced a throwaway glass prototype (`prototypes/04c-touch-prototype/`); Ayush approved it, then the winners were ported directly to the app (no GSD ceremony - Ayush said apply it fast).

- **D-15 - the brand deep-pink recolors `#76002d` → `#7a1638` (Damson), app-wide.** *Why:* the old maroon was dark but 100%-saturated, so against the cotton-candy pinks + white glass it read "too bright"/harsh. Damson keeps the depth (AAA white-text contrast) but drops saturation to ~69% and nudges the hue toward raspberry, so it reads as the same berry family. `--glass-shadow` now DERIVES from `--color-brand-deep` via `color-mix` (single source of truth), so the recolor re-tints the whole glass language in one place. All hardcoded deep-pink hexes (`#76002d` / `#8c0036` / `#3a0016`) removed.
- **D-16 - the Deal Card opens as a LEAFLET over the conversation rail, not floating in the chat thread.** `DealPin` (chat variant) portals the card into a `hs-deal-card-slot` in `ConversationList`; the rail widened `w-64`→`w-72`. The Deal Room (workspace) variant keeps the inline card. *Why:* the card floating inside the thread was disturbing (Ayush); the rail is the same place/shape the New chat picker already uses, so it reuses a known surface and gets the card out of the message stream.
- **D-17 - the card header is a SLIM SHADED band, not the old tall solid maroon block.** A soft deep-pink glass wash holds a calm ink value hero + a deep-pink hairline underline; the offered-story line moved below it. *Why:* the old ~118px solid band dominated the card (worse in the narrow rail); a slim shaded header reads professional AND gives the Damson accent a surface so the colour is actually visible (a plain white header made the recolor invisible).
- **D-18 - the Deal Form picks product + batch in ONE tap (a batch rail), no modal popup.** Each search result shows its batches as tap-to-add chips carrying that batch's measured THC/CBD; batches are preloaded. *Why:* the old click-product → modal-batch-picker → add was a two-step interruption; one inline tap preserves the batch-level truth (BTCH-01 / D-06) while removing the popup.

*Why record:* these are the visual-language + card-placement decisions the Deal Room build (next) and the final Agentation polish will sit on top of. **Status: built + gate-green 2026-06-21 (tsc 0 + eslint 0 + 62/62 unit + next build ok); COMPILE/BUILD verified only - the card was not seen live (needs a minted deal), so a human visual UAT is owed. LOCAL only (branch `claude/ayush/work`, commits `c29ea4c` + `37ec4e8`, not pushed).** (Sources: this session; `prototypes/04c-touch-prototype/NOTES.md`.)

---

## RBAC / permissions

- **Configurable RBAC matrix approved as Phase 14 (post-v1.0), reversing the v1 two-role-only scope (2026-06-21).** Phase 11 shipped two fixed company roles (Superadmin / Member) on top of the flexible `permission_matrix_entry` tables — only two actions (`team.manage`, `company.edit_profile`) seeded + enforced. Product now wants the full configurable matrix: a Superadmin defines custom roles, grants/revokes individual actions per role through a matrix UI, and assigns people to roles. **Scoped as its own Phase 14 (NOT folded into Phase 13)** because the real cost is enumerating a gated-action catalogue across the app + wiring `has_permission()` enforcement at each call site — the UI is the small part. **Post-v1.0:** does not gate the Phase 8 capstone (the live walk runs on the two-role model); the two-role default stays until Phase 14 lands. *Why:* makes the dormant matrix a real product surface, but honestly sized — the value is in enforced-action coverage, not the screen; deferring keeps the onboarding-ready milestone shippable. (Req IDs RBAC-05–08; ROADMAP Phase 14.)

---

## 2026-06-22 — Products are location-scoped (one product = one location)

A product belongs to **exactly one shop location**; there are **no multi-location products**. A company has many locations (e.g. Berlin DE, Manchester UK); each location has its own product list. Same-named products across locations are **separate** entries because they genuinely differ — German vs UK **packaging, labelling, regulatory** (Marcel). Model: **Company → many Locations → each Location's own Products → each Product's Batches**.

*Why:* matches reality (a German product carries German packaging and differs from its UK equivalent) and keeps the model simple — no product↔location many-to-many. *Schema implication:* a `location` entity per company + `product.location_id` — a **Phase-7 build, not yet in the schema** (verified: `product` has no location column today). (Source: 2026-06-22 Present / Manage-shop design session with Muskan; Marcel's packaging rationale.)

---

## 2026-06-23 — Price-list home + custom-pricing phasing (Present / DEV-1 / DEV-41)

The **Standard** company-wide price list lives in the **shop**: born on first CSV import, managed / edited / sent from Manage shop. This is **Phase 7's** scope — one list per company.

**Per-customer custom lists are a dedicated future phase (Phase 15), not Phase 7.** Model: **born in the shop** (seller overrides prices while building an offer) → **persist on the Relationship page** (DEV-41 Proposed→Approved→Applied) → resolve **per-recipient via the DEV-1 cascade** on outgoing offers. Requires new schema (`pricelist.relationship_id`, NULL = standard / set = customer-specific) + the DEV-41 approval primitive — **neither built today** (verified: `pricelist` is company-scoped only; no approval state machine in code). In **Phase 7** the seller send step **picks the Standard list**, and any per-line edit is a **one-off snapshot onto the deal** (`deal_line_item.unit_price`), never a saved list — so the prototype's `customLists` persistence is dropped.

**Folds into Phase 7 (no migration — schema already stores it):** the dropped **batch-detail CSV columns** (`shelf_life_months`, `loss_on_drying_percent`, `water_activity`, batch `cbg/cbn_percent`, `description`, `bundle_description`) go back into the template + parser + import RPC fan-out; **CSV upsert by Supplier Product Code** + an **export-catalog** button become the no-ERP update path. The unique key `uq_product_supplier_code_active` already exists, so upsert needs no migration.

*Why:* custom pricing is cross-cutting — 4 surfaces (Present + Relationship + deal + a new approval primitive), both engineers' lanes, schema change + a state machine — so sequencing it as its own slice (Phase 15) keeps the Standard path a clean tracer bullet and removes the prototype's half-built `customLists` inconsistency. Batch detail and the update path are pure Present-lane and storage already exists, so they belong in Phase 7. **Industry-confirmed** (Shopify / WooCommerce / Magento: one combined product+price CSV; bulk update = re-import-with-overwrite keyed on SKU; per-customer/tiered prices = a separate price-list import). (Sources: 2026-06-23 design session with Muskan; Marcel's Product-list + Pricelist CSVs in `docs/CSV's/`; web research on B2B catalog/price CSV practice.)

---

## 2026-06-26 — Location/warehouse model: structured addresses are their own phase (Phase 16), not Phase 7

Marcel confirmed (DEV-80 thread) the warehouse model: **(1)** each location has its **own** warehouse address(es) buyers see (Germany view → German address); **(2)** a location can hold **more than one** address; **(3)** location naming is **free-form** (e.g. "Germany North", "Germany South"); **(4)** addresses must be entered correctly because they **populate the Sales Order / Purchase Order documents** (Ayush's deal docs, `src/modules/deals/lib/derive.ts`) — structured order data, not display text.

**Decision: the structured location→multi-address registry is its own future phase (Phase 16 — Locations & Warehouses), NOT Phase 7 and NOT Phase 15 (pricing).**
- **Phase 7 keeps location as a free-text label only** (`product.location varchar(80)`, D-07): it drives the grid tabs + the existing **single** `company.warehouse_location` line. Delivers Marcel's "different products/packaging per location" (each product sits in one location) — the part the shop needs. No registry, no multi-address, no structured fields.
- **Phase 16 owns** the location entity (name + structured address fields), multiple addresses per location, a "Manage locations" in-platform form, and wiring addresses into the Sales/Purchase Order docs.

**Input model (researched — hybrid, industry-standard):** warehouse **addresses are entered in-platform** via a structured, validated form (set up once); **products reference a location by name** via a CSV column + an in-app dropdown (name-matched like terpenes, warn on unknowns). Rationale: addresses feed order documents → they need validated structured fields a spreadsheet cell can't enforce; locations are few + stable (form), products are many + churny (CSV). (Source: Shopify "set up locations before assigning inventory" — Locations in Settings + a separate location-referencing inventory CSV; B2B platforms add address validation because the address drives shipping/order docs.)

**Cross-lane + sequencing:** Phase 16 **depends on Phase 7** (the shop must exist) and **touches Ayush's deal/order-doc lane** — design the address fields *with* him against what the Sales/Purchase Order docs need; do not design the schema before that.

*Refines the 2026-06-22 "location entity + `product.location_id` = Phase-7 build" note:* the **entity/registry moves to Phase 16**; Phase 7 ships the lighter free-text label (D-07). (Sources: 2026-06-26 session with Muskan; Marcel's DEV-80 answers; web research on B2B multi-warehouse data entry.)

---

## 2026-06-29 — Persistent shared basket + seller-owned deal pricing (Phase 7 absorbs Phase 6 Deal Basket)

**Basket is now persistent and app-wide (reverses ADR-0003 "Option A / transient" and Phase 7 D-12).** A user's basket survives across sessions (saved, not in-memory). It is the shared **Product Basket** layer of the locked 4-layer model (Product Card → Product Basket → Deal Basket → Deal Card), built **once** and reused by both the shop and the deal flow.

**Both sides build baskets (symmetric):** a **buyer** fills a basket from *other* companies' shops; a **seller** fills a basket from *their own* shop to send to buyers. Same component, two entry points.

**Cross-company basket, per-seller offer:** one basket may hold products from several companies, **grouped by seller**; turning it into a deal produces **one deal card per seller** (two shops in-basket → two offers).

**Deal pricing is seller-owned ("Model B" — answers the open Phase-6A question):** the buyer offers a card with products + quantities (+ delivery) but **no price** — "I want these, send me your price." The **seller fills unit prices**, sends back; **both confirm** to close. Each side keeps its own private number (seller cost / buyer resale → own margin %), never shared.

**Phase 6 (Deal Basket) folds into Muskan's expanded Phase 7.** Ayush handed Phase 6 over (2026-06-23, `_workshop/handoff/phase-6-context.md`) as "almost the same work as the Product Basket Muskan already owns"; no Phase 6 code existed. The Deal Card terminus (`src/modules/deals/`: DealCard, DealForm, held two-sided change, `buildCreateBasket`, recipient resolution) already exists and is reused as-is.

*Why:* the locked 4-layer model already intends one shared Product Basket; making it persistent + symmetric removes the "build throwaway, rebuild later" risk and merges Phase 7's cart with Phase 6's deal basket into one piece. Persistence (Option B) was deferred "until after Notifications" — reopened deliberately as the core buyer experience (DEV-95). *Open:* whether a seller's self-shop basket also persists across sessions. *Schema:* a persisted basket + basket-line store (new), keyed by owner + seller company — not built today. **Supersedes** ADR-0003's Option-A clause + Phase 7 D-12. (Sources: 2026-06-29 session with Muskan; `_workshop/handoff/phase-6-context.md`; Linear DEV-95/DEV-81.)

**Refinements (same session):**

- **Buyer's offer is a normal deal card; price follows the seller's *public* price** — if the seller published that product's price, the offer carries it; if not, the offer is sent **price-less** and the seller fills it. The **buyer can add a free note**.
- **Missing/unavailable batches never block a deal card** — a product can be added and a card **sent + received with no batch**; the batch is attached later. Relaxes the current batch-coupled flow. **Resolves Linear HEL-20 + HEL-17.**
- **Pre-sell = a real "Coming soon" shop product, not a throwaway line (DEV-84, in expanded Phase 7).** Seller creates a not-yet-stocked product with only the basics (name, optional price; **no batch / COA / lab values required**), status **"Coming soon"**, **visible in the public shop with a badge**. It behaves like any product (basket, deal card) and **graduates to live** when it arrives (seller fills batch/COA; existing deal references stay intact). Industry-standard: status-flag not a separate placeholder, "TBD" price allowed (Salesforce / Magento / BigCommerce / Shopify).
- **Seller's basket persists too — it is the *same* app-level basket** (one reusable component), filled from the seller's own shop instead of another's; it feeds the deal card. Persistence + symmetry apply to both roles.
- **Deal notes are per-side:** deal-level, **visible to both** parties, **editable only by their owner**, and they **save immediately** — no two-sided held-change accept (each edits only its own, so there is no conflict). A third field category beyond *shared+held* and *private+immediate*: **visible-to-both, owned-by-one, instant**.

---

