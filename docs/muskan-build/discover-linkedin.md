# Discover — LinkedIn-style directory + person-to-person connections (Lane B)
**Status:** 📋 Planned (scope-locked 2026-07-24) · **Size:** XL (28 tickets) · **Owner:** Muskan (we build the foundation too — not handed to Ayush)

## Goal
Turn Discover into an open, LinkedIn-style directory where **everyone is visible by their tag except pharmacies** (hidden from the page, still searchable), AND where **any user can connect to any other user person-to-person — without their companies being connected.** One scrolling page, top-to-bottom:

**Ads banner → Connection Requests → My Network → New People → Companies.**

- **Companies** — the existing directory (rows), fixed to show the migrated tags correctly.
- **New People** — people across Hello Sello as square cards, to connect + network (net-new).
- **My Network** — your connections, **both** connected companies **and** connected people.
- **Connection Requests** — incoming requests, **both** company requests **and** person requests, in one section as **two labelled groups** ("Company requests" / "People").
- **Ads banner** — empty horizontal-scroll placeholder for future ads.

## The model change — "pure social" person graph (locked 2026-07-24, w/ Ayush)
Hello Sello has always had **one** relationship graph: **company ↔ company** (commercial — deals, pricing, shops). We are adding a **second, independent graph: person ↔ person** (social — connect + DM), modelled on LinkedIn.

**What changes:** a new person-connection edge + the visibility/request/accept/network flows become person-aware.
**What stays exactly as-is (pure social):** deals, pricing, shops, and the whole commercial layer remain **company-scoped and untouched.** A person connection gets you *visibility + a DM* — nothing commercial. "Ladder a person connection up into a company relationship for trading" is an explicit **follow-up**, not this sprint.

### The pleasant surprise — the hard part is already built
The group-chat feature already solved "a chat with no company behind it." We **extend that proven pattern**, we don't invent one:
- `chat_thread.relationship_id` is **already nullable** ([20260707120000:34](../../supabase/migrations/20260707120000_chat_thread_member.sql)).
- `chat_thread_member` is a **person-level** membership table ([20260707120000:48-65](../../supabase/migrations/20260707120000_chat_thread_member.sql)); `is_group_member()` is a person-scoped RLS helper with **zero** company dependency ([:77-85](../../supabase/migrations/20260707120000_chat_thread_member.sql)).
- p2p thread RLS **already** keys on the two people, not the company — `thread_all` p2p branch + `can_access_thread` p2p branch check `auth.uid() IN (person_a_id, person_b_id)` with **no** relationship check ([20260707120100:28-43,52-68](../../supabase/migrations/20260707120100_group_thread_rls.sql)). **So two people can already read/write a DM without connected companies.**
- `create_group_thread` already inserts a company-less, `relationship_id`-NULL thread ([20260707120200:93-94](../../supabase/migrations/20260707120200_create_group_thread_rpc.sql)) — a live precedent for the NULL-relationship insert. ⚠️ That RPC makes a `type='group'` thread using the `chat_thread_member` + `is_group_member` model; PG-7 instead makes a **`type='p2p'`** thread using the `person_a/b` slots + the existing p2p person-slot RLS (Claim 2). So copy only the "insert `relationship_id = NULL`" idea, not the group membership machinery.

## Architecture — one page, server-fetched (Wave pattern preserved)
```
page.tsx (SERVER) fetches ALL data:
  companies · people · incoming requests (company + person) · my network (companies + people)
        │  passes as props ▼
  DiscoverShell (client)
    ├─ AdsBanner            (static, no data)
    ├─ RequestsSection      (props; two groups — company via acceptItem, person via accept_person_connection)
    ├─ MyNetworkSection     (props; companies + people)
    ├─ NewPeopleSection     (props; "+" person-connect)
    └─ CompaniesSection     (props; existing search/filter/rows; company "Connect" unchanged)
```
**Everything loads with the page (one paint, no loading-flash).** Sections are client components only for their *buttons*; their data is server-fetched and handed down (avoids the browser-only-reader / loading-flash problem).

## Invariants — never break these (anti-deviation guardrails)
1. **Pure social. Deals/pricing/shops stay company-scoped.** A person connection grants **visibility + DM only**. Never let a person connection read a company's shop/pricing or open a deal — that's the company graph, untouched. Any such "ladder" is a separate follow-up.
2. **Person accept never mints a company `relationship`.** `planRollout` **always** creates a `c2c` thread + "companies are now connected" line ([rollout.ts:62-84](../../src/modules/messaging/lib/rollout.ts)) — so the person path **must not** go through it. PG-7 is its own RPC: person edge + a company-less p2p thread + a person-framed intro. No c2c thread, no company line.
3. **Rebuild RLS from the LIVE body + diff every predicate.** PG-3 (`person_select`) and PG-5 (inbox RLS) `create or replace`/alter existing policies. Base on the **latest-timestamp** definition, add ONLY the new branch, diff old→new to confirm nothing else moved. This is exactly how the Discover verified-caller gate was silently lost — see [[feedback-sql-replace-diff-against-live]].
4. **Directory RPCs: SECURITY DEFINER + full gate + safe fields only.** Every discover RPC includes `public.is_caller_verified()`, `verification_status='verified'`, `deleted_at is null`, excludes own company, returns ONLY directory-safe fields (**no email, no phone**).
5. **Visibility gate = client-side, pharmacy-only.** Hides ONLY companies/people whose *only* tag is Pharmacy from the default view; they stay name-searchable. Never widen it. Tags are already in the DB (migration `20260704090000`) — this lane changes **frontend code only** for tags.
6. **New request type touches display, not the company accept switch.** Add `connect_person` to the **display** type list (`InboxRequestType`, [connect/types.ts:21-25](../../src/modules/connect/types.ts)) so it renders/filters. Do **not** add it to `AcceptRequestType` ([messaging/types.ts:271-275](../../src/modules/messaging/types.ts)) — the person accept has its own RPC and never enters the company rollout `switch`. Clean boundary.
7. **Reuse existing company machinery.** Company connect = existing `sendConnectRequest`; company accept/decline = existing `acceptItem`/`declineItem`. Don't reinvent them.
8. **Behavior-preserving extraction.** Pulling `CompaniesSection` out of `DiscoverDirectory` must not change current behavior (beyond the DISC-3 tag fix).

## Scope — in / out
**In:** ads-banner placeholder · the 4 sections · the tag fix · the people-directory RPC · the security-gate restore · **the full person-graph foundation (edge + visibility + person request/accept + person network) · person-to-person DM** · demo seed. Requests + My Network surface **both** company and person.
**Out (deferred):** real ad content/serving; server-side pagination/search (small directory for now); making pharmacy-hidden a *server* boundary (stays client-side, documented); sector (`business_category`) filtering; **laddering a person connection into a company relationship / any commercial capability** (pure social this sprint).

---

## Research notes — verified against LIVE code (3 sub-agent traces + first-hand reads, 2026-07-24)

### The person-graph gaps (what's missing vs. the group-chat precedent above)
- **No place to store "Jane and I are connected."** `relationship` is company-only: `company_a_id`/`company_b_id` NOT NULL, `CHECK (company_a_id < company_b_id)`, unique on the company pair ([20260607090003:17-37](../../supabase/migrations/20260607090003_phase2_deal.sql)). No person party column exists. → **PG-1** new `person_connection` table.
- **You can't even SEE a non-company-connected person.** `person_select` allows self / own company / HS team / `can_see_person` — LIVE body [20260609183000:33-62](../../supabase/migrations/20260609183000_rls_connect_counterparty_visibility.sql). `can_see_person` is company-link-scoped via `shares_connection_with_company`, plus one narrow person branch (the specific `sender_person_id` of an inbox request *addressed to my company*). There is **no free-standing person-to-person visibility** — a person you're personally connected to but whose company you don't trade with still reads as "Unknown". **This is the primary blocker.** → **PG-2/PG-3**.
- **The request has no person target.** `pending_inbox_item` has `sender_person_id`, `sender_company_id`, `receiver_company_id` — **no `receiver_person_id`** ([20260607090002:191-212](../../supabase/migrations/20260607090002_phase1_core.sql)). Inbox RLS routes to the *company*: `inbox_select`/`inbox_update` key on `current_company_id()`, never `auth.uid()` ([20260607170000:231-237](../../supabase/migrations/20260607170000_rls_policies.sql)). → **PG-4/PG-5**.
- **Accept forces a company relationship.** `acceptItem` ([inbox.ts:257](../../src/modules/connect/supabase/inbox.ts)) → `acceptInbox` ([store.ts:507](../../src/modules/messaging/supabase/store.ts)) mints a `relationship` row (L545-563) + `planRollout` (L565-596) which ALWAYS opens a c2c thread + company line. → **PG-7** new RPC.
- **p2p dedup index is relationship-keyed.** `uq_chat_thread_p2p` on `(relationship_id, person_a_id, person_b_id)` ([20260607090003:141-143](../../supabase/migrations/20260607090003_phase2_deal.sql)) — with `relationship_id = NULL`, Postgres treats NULLs as distinct, so duplicate company-less DM threads slip through. → **PG-6** partial unique index.
- **`getMyConnections` is company-first.** Iterates `relationship` rows; people appear only nested under a connected company ([connections.ts:74-171](../../src/modules/messaging/supabase/connections.ts), types [messaging/types.ts:184-240](../../src/modules/messaging/types.ts)). Can't express "people I'm personally connected to". → **PG-10** new read (company read `getMyConnections` stays for the companies group, DISC-13).
- **`getConversations` shows "Unknown company" for a company-less p2p.** Counterparty company derived from `relationship_id` ([store.ts:153-239](../../src/modules/messaging/supabase/store.ts)); the group branch (L181-214) already shows the members-based fallback to copy. → **PG-12**.

### Companies / visibility (carried from prior research — still valid)
- **Live RPC = [list_discoverable_companies (20260618120100)](../../supabase/migrations/20260618120100_list_discoverable_companies_city.sql).** Returns `id, name, country, city, logo_path, type_codes[], connection_state`; `deleted_at is null AND verification_status='verified' AND id is distinct from current_company_id()`, `limit 200`. Returns ALL verified companies incl. pharmacies (no server-side type filter) → "everyone except pharmacy" is purely client-side. `business_category` not exposed.
- **⚠️ Security regression:** the live body **dropped** the SEC-01 `is_caller_verified()` caller gate (added [20260617090000](../../supabase/migrations/20260617090000_sec01_caller_verified_discover_gate.sql), lost by later create-or-replace). Live since 2026-06-17. → **DISC-2** restores it.
- **The stale frontend gate (the T-3 bug):** `SELLER_TYPES = ["Cultivator","Wholesaler","Importer"]` ([DiscoverDirectory.tsx:31](../../src/app/discover/DiscoverDirectory.tsx)); `isListed` ([:35-36](../../src/app/discover/DiscoverDirectory.tsx)) → after the taxonomy migration suppliers are tagged `gacp_cultivator`/`eu_gmp_cultivator`/`tga_gmp_cultivator`/`manufacturer_pharma` — none match → wrongly hidden. `CATEGORY_LABELS` has only 4 codes ([companies.ts:30-35](../../src/app/discover/companies.ts)).
- **The 8 activity codes** ([20260704090000](../../supabase/migrations/20260704090000_business_category_taxonomy.sql)): `pharmacy, wholesaler, importer, gacp_cultivator, eu_gmp_cultivator, tga_gmp_cultivator, manufacturer_pharma, other`.

### People directory (greenfield — carried, still valid)
- **`person` card fields:** `id`, `display_name` (canonical; fallback `coalesce(display_name, first_name||' '||last_name)`), `title`, `avatar_path`, `public_handle`, `company_id` ([20260615120000:24-31](../../supabase/migrations/20260615120000_profile_qr_foundation.sql)).
- **Avatar** → public `avatars` bucket (`getPublicUrl`, pattern [profile/index.ts:108](../../src/modules/profile/index.ts)). **Company logo** → `shop-media` bucket ([companies.ts:69](../../src/app/discover/companies.ts)).

### Company requests + company network (carried — still needed for the company groups)
- **⟳ Lane A:** `getInbox` already resolves the viewer's `company_id` + stamps `viewerIsReceiver`, and joins a `dealCard` preview ([inbox.ts:130-196](../../src/modules/connect/supabase/inbox.ts)). Company incoming-request filter = `viewerIsReceiver && status==='pending' && type in ('connect','connect_message')`. `acceptItem`/`declineItem` reused unchanged (connect path untouched by the deal branch).

---

## Task checklist (build). Ordered by dependency; each ends testable.

> **Build order:** the **directory display** (DISC-1..9,15) is independent of the person graph — it can run first / in parallel. The **person graph** (PG-*) is the critical path for the Requests/Network sections. Suggested waves at the bottom.

### ─────────── Foundation · Database (PG-1 … PG-7) ───────────

### PG-1 — `person_connection` edge table · **S**
Files: new migration `<ts>_person_connection.sql`. Test: pgTAP.
- [ ] Table: `id`, `person_a_id`/`person_b_id` (both `NOT NULL → person(id)`, `CHECK (person_a_id < person_b_id)` canonical), `status` (`active` default), `initiated_by_person_id`, `created_at`, `deleted_at`. Partial unique index on `(person_a_id, person_b_id) WHERE deleted_at IS NULL`. Mirrors `relationship`'s canonical-order pattern but person-keyed.
- [ ] RLS `person_connection_select`: `auth.uid() IN (person_a_id, person_b_id)`. `revoke all` / grant to `authenticated`.
- **Accept (pgTAP):** two people get exactly one active edge; a third party sees zero rows; the unique index blocks a duplicate active pair.

### PG-2 — `is_person_connected()` helper · **S**
Files: same or new migration. Test: pgTAP.
- [ ] `create function public.is_person_connected(p_other uuid) returns boolean language sql stable security definer set search_path='' ` — true if an active `person_connection` joins `auth.uid()` and `p_other` (canonical-order aware). Grant to `authenticated`.
- **Accept (pgTAP):** returns true for a connected pair (either direction), false for strangers.

### PG-3 — `person_select` + person branch · **S · REBUILD FROM LIVE**
Files: new migration `<ts>_person_select_person_connection.sql`. Test: pgTAP.
- [ ] `create or replace policy person_select` from the **LIVE body** ([20260609183000:57-62](../../supabase/migrations/20260609183000_rls_connect_counterparty_visibility.sql)), adding **only** `or public.is_person_connected(id)`. Diff old→new: the four existing branches (self / own company / HS team / `can_see_person`) unchanged.
- **Accept (pgTAP):** a person you're person-connected to (but NOT company-connected) is now SELECT-visible; a stranger still returns zero; the four existing branches still pass.

### PG-4 — `pending_inbox_item` person target · **S**
Files: new migration `<ts>_inbox_receiver_person.sql`. Test: pgTAP.
- [ ] Add `receiver_person_id UUID NULL → person(id)` + index. Seed `inbox_request_type` value `connect_person`. CHECK (mirrors the `deal_card` pattern [20260607090002:207-208](../../supabase/migrations/20260607090002_phase1_core.sql)): `receiver_person_id IS NOT NULL` when `type='connect_person'`, else the person path is off. `sender_company_id` stays NOT NULL (the sender always has a company — fine).
- **Accept (pgTAP):** a `connect_person` row requires `receiver_person_id`; existing types unaffected; column + type + index exist.

### PG-5 — Inbox RLS person branch · **S · REBUILD FROM LIVE**
Files: same migration as PG-4 or a sibling. Test: pgTAP.
- [ ] Rebuild `inbox_select` + `inbox_update` from the **LIVE body** ([20260607170000:231-237](../../supabase/migrations/20260607170000_rls_policies.sql)), adding `OR receiver_person_id = auth.uid()` to each USING (and `inbox_update` WITH CHECK). `inbox_insert` unchanged (still sender-company-scoped). Diff old→new.
- **Accept (pgTAP):** the targeted person can SELECT + UPDATE their `connect_person` row; a non-target person cannot; the company branches still pass.

### PG-6 — p2p company-less dedup index · **XS**
Files: new migration `<ts>_p2p_companyless_dedup.sql`. Test: pgTAP.
- [ ] Partial unique index on `chat_thread(person_a_id, person_b_id) WHERE type='p2p' AND relationship_id IS NULL AND deleted_at IS NULL`. Closes the NULL-relationship duplicate-thread gap.
- **Accept (pgTAP):** a second company-less p2p thread for the same person pair is rejected; a company-anchored p2p (non-null relationship) is unaffected.

### PG-7 — `accept_person_connection()` RPC · **M**
Files: new migration `<ts>_accept_person_connection.sql`. Test: pgTAP.
- [ ] SECURITY DEFINER, `set search_path=''`. Given a pending `connect_person` inbox item addressed to `auth.uid()`: (1) create the `person_connection` edge (canonical order); (2) create a **company-less `type='p2p'`** `chat_thread` (`relationship_id = NULL`, canonical `person_a/b` slots — access flows through the existing p2p person-slot RLS, NOT `chat_thread_member`; copy only the NULL-relationship insert idea from [create_group_thread_rpc:93-94](../../supabase/migrations/20260707120200_create_group_thread_rpc.sql)); (3) seed ONE person-framed intro line (no c2c thread, no "companies connected" line — invariant #2); (4) flip the item to `accepted`. Idempotent (re-accept is a no-op). Order edge/thread BEFORE the status flip so a failure leaves it retryable (mirror `acceptInbox`). PG-6's index enforces one p2p thread per pair.
- **Accept (pgTAP):** accepting creates exactly one edge + one company-less p2p thread + one intro; NO relationship row and NO c2c thread are created; re-running is a no-op; a non-target caller is rejected.

### ─────────── Foundation · App reads/actions (PG-8 … PG-11) ───────────

### PG-8 — `sendPersonConnectRequest()` action · **S**
Files: new server action in `src/app/discover/actions.ts` (or a person-actions file). Test: unit/integration.
- [ ] `requireVerified()` guard (like `sendConnectRequest`). Insert a `connect_person` item: `sender_person_id=uid`, `sender_company_id`, `receiver_person_id=<target>`. Dedup keyed on `(sender_person_id, receiver_person_id, pending, connect_person)`. Reject self-target.
- **Accept:** creates a pending `connect_person` request to the target person; a duplicate is a silent no-op; unverified caller blocked.

### PG-9 — Person accept/decline server actions · **S**
Files: same actions file. Test: unit/integration.
- [ ] `acceptPersonRequest(itemId)` → calls PG-7 RPC. `declinePersonRequest(itemId)` → reuse the existing decline UPDATE (RLS now lets the person act, PG-5). `revalidatePath('/discover')`.
- **Accept:** accept establishes the person connection + DM thread; decline rejects; both refresh Discover.

### PG-10 — `getMyPersonConnections()` read · **S**
Files: new server read in `src/app/discover/`. Test: unit/integration.
- [ ] Server client. Return the people you have an active `person_connection` with — a flat person list (`personId, name, title, avatar, company name/logo`), resolved via the person + company + avatar/logo buckets. Independent of company connection.
- **Accept:** returns your person connections; excludes company-only relationships; safe fields only.

### PG-11 — `getIncomingPersonRequests()` read · **S**
Files: new server read in `src/app/discover/`. Test: unit/integration.
- [ ] Server client. Return pending `connect_person` items where `receiver_person_id = auth.uid()`. Light row: sender person name/avatar + sender company name + note + created_at + id.
- **Accept:** returns only incoming pending person requests aimed at you; excludes company requests, outgoing, non-pending.

### ─────────── Discover surface · directory display (DISC-1 … DISC-9, DISC-15) ───────────
*Independent of the person graph — the directory just renders. Can run first / in parallel.*

### DISC-1 — Prototype the LinkedIn Discover · **M** — ✅ DONE (Variant D, `prototypes/discover-linkedin-prototype/`, approved 2026-07-23)

### DISC-2 — Restore the verified-caller gate on the companies RPC · **S**
Files: new migration `<ts>_list_discoverable_companies_reinstate_verified_gate.sql`. Test: pgTAP.
- [ ] `create or replace list_discoverable_companies` from the LIVE body ([20260618120100](../../supabase/migrations/20260618120100_list_discoverable_companies_city.sql)) adding `and public.is_caller_verified()` (the only change). Diff to confirm.
- **Accept (pgTAP):** verified caller gets the directory; unverified gets zero rows; `db reset` green.

### DISC-3 — Sync the Discover frontend to the migrated taxonomy · **S**
Files: [companies.ts](../../src/app/discover/companies.ts), [DiscoverDirectory.tsx](../../src/app/discover/DiscoverDirectory.tsx). Test: unit.
- [ ] `CATEGORY_LABELS` — add the 8 codes, drop dead `cultivator`. `isListed` → `c.categories.some((t) => t !== "Pharmacy")`. `SELLER_TYPES` → repoint to the DISC-1 facet-pill labels (drives pills + `countOfType` only, NOT the listing gate).
- **Accept:** every non-pharmacy tag visible + labelled; pharmacy-only hidden until name-searched; pills show the agreed set; unit covers `isListed` for all 8 codes.

### DISC-4 — Ads banner placeholder · **S**
Files: new `src/app/discover/DiscoverAdsBanner.tsx`.
- [ ] Static horizontal-scroll strip, empty placeholder slots, no data.
- **Accept:** scrollable empty banner; no console errors.

### DISC-5 — Extract `CompaniesSection` (behavior-preserving) · **S**
Files: [DiscoverDirectory.tsx](../../src/app/discover/DiscoverDirectory.tsx) → new `src/app/discover/sections/CompaniesSection.tsx`.
- [ ] Move search + filter band + row list + `ConnectButton` into `CompaniesSection(companies: DiscoverCompany[])`. No behavior change beyond DISC-3.
- **Accept:** company directory behaves as before (+ DISC-3); tsc/eslint clean.

### DISC-6 — `DiscoverShell` + page wiring (companies-only first) · **S**
Files: new `src/app/discover/DiscoverShell.tsx`, [page.tsx](../../src/app/discover/page.tsx).
- [ ] `DiscoverShell` stacks `<AdsBanner/>` + `<CompaniesSection/>` (other sections added later). page.tsx keeps server-fetching companies.
- **Accept:** Discover renders banner + companies as one scrolling page; identical company behavior.

### DISC-7 — `list_discoverable_people()` RPC · **M**
Files: new migration `<ts>_list_discoverable_people.sql`. Test: pgTAP.
- [ ] SECURITY DEFINER, `set search_path=''`, safe fields only, mirrors the companies RPC + the verified gate. Returns `person_id, display_name, title, avatar_path, public_handle, company_id, company_name, company_logo_path, company_country, company_city, type_codes[]`. WHERE: `p.deleted_at is null and c.deleted_at is null and c.verification_status='verified' and c.id is distinct from current_company_id() and p.id is distinct from auth.uid() and public.is_caller_verified()`. `limit 200`.
- **Accept (pgTAP):** returns people at other verified companies with safe fields + `type_codes`; excludes own company, self, unverified, soft-deleted; unverified caller gets zero; no email/phone.

### DISC-8 — `people.ts` fetch + mapper · **S**
Files: new `src/app/discover/people.ts`.
- [ ] `DiscoverPerson` type + `getDiscoverablePeople()` (server client); resolve `avatar_path` via `avatars`, `company_logo_path` via `shop-media`; map `type_codes` → labels (reuse `CATEGORY_LABELS`).
- **Accept:** typed `DiscoverPerson[]` with resolved avatar + company logo URLs.

### DISC-9 — `NewPeopleSection` square-card grid · **M**
Files: new `src/app/discover/sections/NewPeopleSection.tsx`; wire into shell + page fetch.
- [ ] Square cards (avatar/name/title + company logo/name + a "+" connect). Apply the SAME pharmacy gate (person at a pharmacy-only company hidden unless searched). page.tsx fetches `getDiscoverablePeople()` server-side.
- **Accept:** people render as squares; pharmacy-company people hidden until searched; layout matches the prototype. (The "+" wiring lands in DISC-10.)

### DISC-15 — Mockup companies + people seed · **S**
Files: `supabase/seed/`. 
- [ ] Seed realistic demo companies (real names/logos, [DEV-100](https://linear.app/hellosello/issue/DEV-100)) across the taxonomy incl. a pharmacy or two, plus **several people per company** (to exercise the People directory + person connect). Seed one or two **existing person connections** + one **pending person request** so My Network / Requests render on a fresh reset.
- **Accept:** Discover shows a realistic directory on a fresh `db reset`; pharmacy hidden-but-searchable; at least one person connection + one pending person request visible.

### ─────────── Discover surface · Requests + Network (DISC-10 … DISC-14) ───────────
*Consume the person graph (PG-*) + the reused company reads.*

### DISC-10 — Wire the person card "+" · **S**
Files: `NewPeopleSection.tsx` + person-card button.
- [ ] "+" calls `sendPersonConnectRequest` (PG-8) with optimistic pending state (mirror the company `ConnectButton` `connection_state` feel). The company "Connect" on company rows is unchanged (existing `sendConnectRequest`).
- **Accept:** clicking "+" sends a person request; the card reflects pending; no double-send.

### DISC-11 — `getIncomingConnectionRequests()` (company) read · **S**
Files: new server read in `src/app/discover/`. Test: unit/integration.
- [ ] Reuse the `getInbox` pattern ([inbox.ts:130-196](../../src/modules/connect/supabase/inbox.ts)): incoming pending **company** connect requests — `viewerIsReceiver && status='pending' && type in ('connect','connect_message')`. Light row (sender company name/initials, note, created_at, id). No deal-card join.
- **Accept:** returns only incoming pending company connect requests; excludes outgoing, non-pending, pricing/deal types.

### DISC-12 — `RequestsSection` — two labelled groups · **M**
Files: new `src/app/discover/sections/RequestsSection.tsx`; server actions wrap existing `acceptItem`/`declineItem` (company) + PG-9 (person); wire into shell + page fetch.
- [ ] One section, **two labelled groups**: **"Company requests"** (from DISC-11; Accept/Decline via existing `acceptItem`/`declineItem` — accept creates the relationship/threads + Sella intro, as today) and **"People"** (from PG-11; Accept/Decline via PG-9). Each group empties as items are handled. Different accept behavior is visible by grouping (invariant: not a blended list).
- **Accept:** both groups render with correct per-type accept/decline; company accept establishes a company relationship; person accept establishes a person connection + DM thread; each group empties independently.

### DISC-13 — `getMyConnections()` server-callable (company) read · **S**
Files: server-callable path for the companies group. ⚠️ shared `messaging/connections.ts` — **sync-lock first**.
- [ ] Provide a server-callable `MyConnectionsView` (`ConnectedCompany[]`) for Wave-1 fetch. Prefer refactoring `getMyConnections` to accept a supabase client (DRY).
- **Accept:** the server can fetch your active **company** connections; shape unchanged.

### DISC-14 — `MyNetworkSection` — companies + people · **M**
Files: new `src/app/discover/sections/MyNetworkSection.tsx`; wire into shell + page fetch.
- [ ] Two parts: connected **companies** (from DISC-13 — name/initials/city/`contactsCount`/`openDealCount`, people expandable) and connected **people** (from PG-10 — person rows with a Message affordance, see PG-13). Data from page props.
- **Accept:** your active company connections AND person connections both render; layout matches the prototype.

### ─────────── Person-to-person DM (PG-12 … PG-13) ───────────

### PG-12 — `getConversations` company-less p2p fallback · **S**
Files: [store.ts](../../src/modules/messaging/supabase/store.ts). ⚠️ shared `messaging` — **sync-lock first**. Test: unit.
- [ ] For a p2p thread with `relationship_id IS NULL`, resolve the counterparty from the two person slots (not the relationship) — copy the group-branch pattern ([store.ts:181-214](../../src/modules/messaging/supabase/store.ts)). Show the person's name, not "Unknown company".
- **Accept:** a company-less p2p thread lists with the connected person's name; company-anchored p2p unchanged.

### PG-13 — "Message" a connected person · **S**
Files: `MyNetworkSection.tsx` / person card + open-thread wiring.
- [ ] A "Message" affordance on a connected person opens the existing p2p thread (created at accept, PG-7). No open-or-create with a relationship arg — the thread already exists; navigate to it.
- **Accept:** clicking Message on a connected person opens the DM; messages send/receive (RLS already permits the two people).

---

## Suggested build waves
1. **Directory display (parallel-safe):** DISC-2, DISC-3, DISC-4, DISC-5, DISC-6, DISC-7, DISC-8, DISC-9, DISC-15.
2. **Person-graph DB:** PG-1 → PG-2 → PG-3; PG-4 → PG-5; PG-6; then PG-7.
3. **Person-graph app:** PG-8, PG-9, PG-10, PG-11.
4. **Requests + Network surface:** DISC-10, DISC-11, DISC-12, DISC-13, DISC-14.
5. **DM:** PG-12, PG-13.

## Cross-lane / risks
- **We build the foundation (not Ayush)** — but PG-3, PG-4/5, DISC-13, and PG-12 edit files Ayush also touches (`person_select`, `pending_inbox_item` + its RLS, `messaging/connections.ts`, `messaging/store.ts`). **Sync-lock each in `docs/team/sync/muskan.md` before editing + give him a heads-up** (we're changing RLS on his tables). Rebuild-from-live + diff (invariant #3) is doubly important here.
- **Pharmacy-hidden stays client-side** (documented tradeoff): a direct RPC caller still receives pharmacy rows. Fine (safe fields, verified peers).
- **Reconcile with Marcel's [DEV-142](https://linear.app/hellosello/issue/DEV-142) ("only person connection") + DEV-141 ("Networking in Connect").** This lane implements DEV-142's person-connection intent, pure-social. Confirm the Connect-vs-Discover placement with Marcel.

## Done criteria
- Discover renders one scrolling page: ads banner → Requests (company + person, two groups) → My Network (companies + people) → New People → Companies, all loaded with the page (no flash).
- Everyone visible except pharmacies (hidden-but-searchable), tags correctly labelled + filterable; the companies RPC verified-caller gate restored.
- New People shows discoverable people as squares with a working person "+"; person requests accept/decline works and never mints a company relationship; My Network lists both connected companies and connected people; a connected person can be DM'd.
- Deals/pricing/shops untouched (pure social verified).
- pgTAP (person_connection, is_person_connected, person_select, inbox person RLS, accept_person_connection, people RPC, verified gate) + unit + e2e green; tsc + eslint clean; live-verified on a fresh `db reset`.
- ARCHITECTURE-NOTES entry (the person-graph = a second, independent social graph; the group-chat company-less pattern reused; the client-side pharmacy gate).

## Follow-ups (after this lane)
- **Ladder a person connection into a company relationship** (the one commercial bridge deliberately deferred).
- Real ad content/serving in the banner.
- Server-side search/pagination when the directory grows.
- Sector (`business_category`) filter — add the join to the RPC + a facet.
