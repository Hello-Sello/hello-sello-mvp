# Discover — LinkedIn-style directory (Lane B)
**Status:** 📋 Planned (scope-lock pending) · **Size:** L (15 tickets) · **Owner:** Muskan

## Goal
Turn Discover into an open, LinkedIn-style directory where **everyone is visible by their tag except pharmacies** (hidden from the page, still searchable). One scrolling page, top-to-bottom:

**Ads banner → Connection Requests → My Network → New People → Companies.**

- **Companies** — the existing directory (rows), fixed to show the migrated tags correctly.
- **New People** — people across Hello Sello as square cards, to connect + network (net-new).
- **My Network** — your existing connections as rows.
- **Connection Requests** — incoming requests, moved here from Connect (in-page section).
- **Ads banner** — empty horizontal-scroll placeholder for future ads.

## Architecture — one page, server-fetched (Wave 1)
```
page.tsx (SERVER) fetches ALL data:
  companies · people · incoming requests · my network
        │  passes as props ▼
  DiscoverShell (client)
    ├─ AdsBanner            (static, no data)
    ├─ RequestsSection      (props; Accept/Decline via server actions)
    ├─ MyNetworkSection     (props)
    ├─ NewPeopleSection     (props; "+" connect)
    └─ CompaniesSection     (props; existing search/filter/rows)
```
**Everything loads with the page (one paint, no loading-flash).** Sections are client components only for their *buttons* (accept, connect, filter) — their data is server-fetched and handed down. This avoids the browser-only reader problem (`getInbox`/`getMyConnections` were written for the browser client — we add server-callable reads instead of self-fetching).

## Invariants — never break these (anti-deviation guardrails)
1. **Visibility gate = client-side, pharmacy-only.** The gate hides ONLY companies/people whose *only* tag is Pharmacy, from the default view; they remain name-searchable. Every other tag is visible. Never widen the gate to hide other tags. The tags are **already in the DB** (migration `20260704090000`) — this lane changes **frontend code only** for tags.
2. **Server-fetch all data in `page.tsx`.** Sections receive data as props. Do NOT self-fetch inside sections (that reintroduces the browser-only / loading-flash problem).
3. **Directory RPCs: SECURITY DEFINER + full gate + safe fields only.** Every discover RPC must include `public.is_caller_verified()`, `verification_status='verified'`, `deleted_at is null`, exclude own company, and return ONLY directory-safe fields (**no email, no phone**). When editing an existing RPC, base the replacement on the **LIVE (latest-timestamp) body** and diff every predicate/grant — see the create-or-replace lesson (a dropped guard is how the caller-verified gate was lost).
4. **Reuse existing reads/actions.** Connection accept/decline = existing `acceptItem`/`declineItem`. Company connect = existing `sendConnectRequest`. Don't reinvent them.
5. **Behavior-preserving extraction.** Pulling `CompaniesSection` out of `DiscoverDirectory` must not change the current directory behavior (beyond the T-3 tag fix).

## Scope — in / out
**In:** the ads-banner placeholder + the 4 sections + the tag fix + the people-directory RPC + the security-gate restore + a connect-to-a-person function (research-gated) + a demo seed.
**Out (deferred):** real ad content/serving; server-side pagination/search (small directory for now); making pharmacy-hidden a *server* boundary (stays client-side, documented); sector (`business_category`) filtering — the RPC doesn't expose it, add later if wanted.

## Research notes — verified against LIVE code (3 sub-agent traces + direct reads; **re-verified first-hand 2026-07-20 post-Lane-A** — see the ⟳ notes)

### Companies / visibility
- **Live RPC = [list_discoverable_companies (20260618120100)](../../supabase/migrations/20260618120100_list_discoverable_companies_city.sql).** Returns `id, name, country, city, logo_path, type_codes[], connection_state`. WHERE = `deleted_at is null AND verification_status='verified' AND id is distinct from current_company_id()`, `limit 200`. **Returns ALL verified companies incl. pharmacies** — no server-side type filter. So "everyone except pharmacy" is purely client-side. `business_category` is NOT exposed (would need a join to add).
- **⚠️ Security regression:** the live body **dropped** the SEC-01 `is_caller_verified()` caller gate — SEC-01 ([20260617090000](../../supabase/migrations/20260617090000_sec01_caller_verified_discover_gate.sql)) added it, then `20260617150000` + `20260618120100` did create-or-replace from a pre-SEC-01 body and lost it. Live since 2026-06-17. → **DISC-2** restores it.
- **The stale frontend gate (the T-3 bug):**
  - `SELLER_TYPES = ["Cultivator","Wholesaler","Importer"]` — [DiscoverDirectory.tsx:31](../../src/app/discover/DiscoverDirectory.tsx).
  - `isListed = c => c.categories.some(t => SELLER_TYPES.includes(t))` — [:35-36](../../src/app/discover/DiscoverDirectory.tsx). After the taxonomy migration, suppliers are tagged `gacp_cultivator` / `eu_gmp_cultivator` / `tga_gmp_cultivator` / `manufacturer_pharma` — none match the 3 old labels → **wrongly hidden as if pharmacy-only.**
  - Filter short-circuit `if (!isListed(c)) return query !== "";` — [:193](../../src/app/discover/DiscoverDirectory.tsx) (the pharmacy-searchable rule). "Found by search · not listed" badge at [:360,:375-379](../../src/app/discover/DiscoverDirectory.tsx).
  - `CATEGORY_LABELS` (only 4 codes) — [companies.ts:30-35](../../src/app/discover/companies.ts); new codes fall through to a title-case fallback → render as `"Gacp_cultivator"`.
- **The 8 activity codes** (migration [20260704090000](../../supabase/migrations/20260704090000_business_category_taxonomy.sql)): `pharmacy, wholesaler, importer, gacp_cultivator, eu_gmp_cultivator, tga_gmp_cultivator, manufacturer_pharma, other` (legacy `cultivator` remapped→`eu_gmp_cultivator` + deleted).
- `ConnectButton` branches on `connection_state` (`none`/`requested`/`incoming`/`connected`) — [:101-152](../../src/app/discover/DiscoverDirectory.tsx); `none` fires `sendConnectRequest(company.id, "")` ([actions.ts](../../src/app/discover/actions.ts)).

### People directory (greenfield)
- **`person` card fields:** `id`, `display_name` (canonical since [20260620120000](../../supabase/migrations/20260620120000_canonical_display_name.sql); fallback `coalesce(display_name, first_name||' '||last_name)`), `title`, `avatar_path`, `public_handle`, `company_id` — profile cols from [20260615120000:24-31](../../supabase/migrations/20260615120000_profile_qr_foundation.sql).
- **No cross-company people read exists.** `person_select` RLS ([20260609183000:55-62](../../supabase/migrations/20260609183000_rls_connect_counterparty_visibility.sql)) limits a naive query to self / own company / connected. `list_company_members` (own-company + `team.manage`-gated) and `get_public_profile` (single row by handle) are both wrong-shaped. → need a new SECURITY DEFINER RPC.
- **Avatar** → public `avatars` bucket ([20260615120000:42-59](../../supabase/migrations/20260615120000_profile_qr_foundation.sql), `public=true`): `supabase.storage.from('avatars').getPublicUrl(avatar_path)` (pattern: [profile/index.ts:108](../../src/modules/profile/index.ts)). **Company logo** → different bucket `shop-media` ([companies.ts:69](../../src/app/discover/companies.ts)).

### Connection Requests + My Network
- **`getInbox` returns EVERYTHING** — no status/type filter; RLS is sender-OR-receiver ([rls_policies:231-232](../../supabase/migrations/20260607170000_rls_policies.sql)), so it includes your own *outgoing* requests, all statuses, all types (`connect`/`connect_message`/`pricelist_request`/`deal_card`). → a NEW server read filters to **incoming + pending + connect-type**. `acceptItem`/`declineItem` UPDATEs are RLS-gated to the receiver ([:235-237](../../supabase/migrations/20260607170000_rls_policies.sql)) — outgoing rows are non-actionable anyway.
- **⟳ Lane A update (re-verified 2026-07-20):** `getInbox` now already resolves the viewer's `company_id` and stamps **`viewerIsReceiver`** on every row ([inbox.ts:137-140,193](../../src/modules/connect/supabase/inbox.ts)), and joins `deal_card` → a `dealCard` preview. So the incoming filter is simply `viewerIsReceiver && status==='pending' && type in ('connect','connect_message')` — **the company lookup already exists (reuse the pattern), no new one needed.** `acceptItem` now branches on `type==='deal_card'` ([inbox.ts:279-314](../../src/modules/connect/supabase/inbox.ts)); the **connect path is unchanged** → safe to reuse. `InboxItemView` gained `dealCard` + `viewerIsReceiver`.
- **`getMyConnections()`** ([messaging/connections.ts:74](../../src/modules/messaging/supabase/connections.ts), barrel-exported) → `MyConnectionsView { companies: ConnectedCompany[] }`. `ConnectedCompany` = `{ companyId, relationshipId, name, city, initials, contactsCount, connectedAt, openDealCount, people: ConnectedPerson[] }`; `ConnectedPerson` = `{ personId, name, initials, role }` ([messaging/types.ts:199-243](../../src/modules/messaging/types.ts)). Written for the **browser** client → needs a server-callable path for Wave-1.
- **Page shell:** [layout.tsx](../../src/app/discover/layout.tsx) = the `requireVerified()` gate (keep). [page.tsx](../../src/app/discover/page.tsx) (server) fetches `getDiscoverableCompanies()` → renders `DiscoverDirectory`. `DiscoverDirectory` is **one big client monolith** ([:154](../../src/app/discover/DiscoverDirectory.tsx), wrapper `mx-auto ... overflow-auto` [:215](../../src/app/discover/DiscoverDirectory.tsx)) → extract a `CompaniesSection`.

## Task checklist (build — after scope-lock). Ordered; each ends testable.

### DISC-1 — Prototype the LinkedIn Discover · **M**
Files: `prototypes/discover-linkedin-prototype/index.html` (+ NOTES.md).
- [ ] Standalone HTML mock: ads banner (horizontal scroll) + the 4 sections, incl. the **New People square cards** and the final **facet-pill set** for Companies. Review → lock the visual before any React. *(prototype-first rule)*
- **Accept:** opens in a browser; layout + section order + people-card + pill set agreed.

### DISC-2 — Restore the verified-caller gate on the companies RPC (security) · **S**
Files: new migration `<ts>_list_discoverable_companies_reinstate_verified_gate.sql`. Test: pgTAP.
- [ ] `create or replace` `list_discoverable_companies` **from the LIVE body** ([20260618120100](../../supabase/migrations/20260618120100_list_discoverable_companies_city.sql)), adding `and public.is_caller_verified()` to the WHERE (the only change). Diff old→new to confirm nothing else moved.
- **Accept (pgTAP):** a verified caller gets the directory; an unverified caller gets zero rows. `db reset` green.

### DISC-3 — Sync the Discover frontend to the migrated taxonomy · **S**
Files: [companies.ts](../../src/app/discover/companies.ts), [DiscoverDirectory.tsx](../../src/app/discover/DiscoverDirectory.tsx). Test: unit.
- [ ] `CATEGORY_LABELS` (companies.ts:30-35) — add the missing codes, drop dead `cultivator`:
  ```ts
  const CATEGORY_LABELS: Record<string, string> = {
    wholesaler: "Wholesaler", importer: "Importer", pharmacy: "Pharmacy",
    gacp_cultivator: "GACP Cultivator", eu_gmp_cultivator: "EU-GMP Cultivator",
    tga_gmp_cultivator: "TGA-GMP Cultivator", manufacturer_pharma: "Manufacturer Pharma",
    other: "Other",
  };
  ```
- [ ] `isListed` (DiscoverDirectory.tsx:35-36) — hide only pharmacy-only companies:
  ```ts
  const isListed = (c: DiscoverCompany) => c.categories.some((t) => t !== "Pharmacy");
  ```
- [ ] `SELLER_TYPES` (:31) — repoint to the **facet-pill** labels finalized in DISC-1 (the non-pharmacy supplier labels). It now drives only the pills + `countOfType` (:181,:244), NOT the listing gate.
- **Accept:** every non-pharmacy tag renders visible + correctly labelled; a pharmacy-only company stays hidden until name-searched; filter pills show the agreed set; unit test covers `isListed` for each of the 8 codes.

### DISC-4 — Ads banner placeholder · **S**
Files: new `src/app/discover/DiscoverAdsBanner.tsx`.
- [ ] Static horizontal-scroll strip (`flex gap overflow-x-auto`), empty placeholder slots, no data.
- **Accept:** renders a scrollable empty banner; no console errors.

### DISC-5 — Extract `CompaniesSection` (behavior-preserving) · **S**
Files: [DiscoverDirectory.tsx](../../src/app/discover/DiscoverDirectory.tsx) → new `src/app/discover/sections/CompaniesSection.tsx`.
- [ ] Move the search + filter band + row list + `ConnectButton` into `CompaniesSection` (takes `companies: DiscoverCompany[]` as a prop). No behavior change beyond DISC-3.
- **Accept:** the companies directory behaves exactly as before the extraction (+ the DISC-3 fix); tsc/eslint clean.

### DISC-6 — `DiscoverShell` + page wiring (companies-only first) · **S**
Files: new `src/app/discover/DiscoverShell.tsx`, [page.tsx](../../src/app/discover/page.tsx).
- [ ] `DiscoverShell` (client) stacks: `<AdsBanner/>` + `<CompaniesSection companies={...}/>` (other sections added later). page.tsx keeps server-fetching companies, renders `<DiscoverShell companies={...}/>`.
- **Accept:** Discover renders banner + companies section as one scrolling page; identical company behavior.

### DISC-7 — `list_discoverable_people()` RPC · **M**
Files: new migration `<ts>_list_discoverable_people.sql`. Test: pgTAP.
- [ ] SECURITY DEFINER, `set search_path=''`, safe fields only, mirrors the companies RPC + re-adds the verified gate:
  ```sql
  create or replace function public.list_discoverable_people()
  returns table (person_id uuid, display_name text, title text, avatar_path text,
    public_handle text, company_id uuid, company_name text, company_logo_path text,
    company_country text, company_city text, type_codes text[])
  language sql stable security definer set search_path to '' as $$
    select p.id, coalesce(p.display_name, concat_ws(' ', p.first_name, p.last_name))::text,
      p.title::text, p.avatar_path::text, p.public_handle::text,
      c.id, c.name::text, c.logo_path::text, c.country::text, c.city::text,
      coalesce(array_agg(distinct cta.company_type_code::text)
        filter (where cta.company_type_code is not null), '{}')
    from public.person p
    join public.company c on c.id = p.company_id
    left join public.company_type_assignment cta on cta.company_id = c.id and cta.deleted_at is null
    where p.deleted_at is null and c.deleted_at is null
      and c.verification_status = 'verified'
      and c.id is distinct from public.current_company_id()
      and p.id is distinct from auth.uid()
      and public.is_caller_verified()
    group by p.id, p.display_name, p.first_name, p.last_name, p.title,
             p.avatar_path, p.public_handle, c.id, c.name, c.logo_path, c.country, c.city
    order by coalesce(p.display_name, concat_ws(' ', p.first_name, p.last_name)), p.id
    limit 200;
  $$;
  revoke all on function public.list_discoverable_people() from public;
  grant execute on function public.list_discoverable_people() to authenticated;
  ```
- **Accept (pgTAP):** returns people at *other* verified companies with safe fields + `type_codes`; excludes own company, self, unverified companies, soft-deleted; an unverified caller gets zero rows; no email/phone in the output.

### DISC-8 — `people.ts` fetch + mapper · **S**
Files: new `src/app/discover/people.ts`.
- [ ] `DiscoverPerson` type + `getDiscoverablePeople()` (server client) calling the RPC; resolve `avatar_path` via the `avatars` bucket and `company_logo_path` via `shop-media`; map `type_codes` → labels (reuse `CATEGORY_LABELS`).
- **Accept:** returns typed `DiscoverPerson[]` with resolved avatar + company logo URLs.

### DISC-9 — `NewPeopleSection` square-card grid · **M**
Files: new `src/app/discover/sections/NewPeopleSection.tsx`; wire into `DiscoverShell` + page fetch.
- [ ] Square cards (avatar/name/title + company logo/name + a "+" connect). Apply the SAME pharmacy gate (a person whose company is pharmacy-only is hidden unless searched — reuse the `isListed`/query rule). page.tsx fetches `getDiscoverablePeople()` server-side, passes down.
- **Accept:** people render as squares; pharmacy-company people hidden until searched; layout matches the prototype. (The "+" wiring lands in DISC-10.)

### DISC-10 — Connect-to-a-person function (the "+") · **M · RESEARCH FIRST**
Files: TBD after research. 
- [ ] **Research step (do before building):** does the data model support a person-level connection, or is a company→company request the only mechanism (see `sendConnectRequest` + `pending_inbox_item`, and Marcel's DEV-142 "person connection")? Decide: new person-targeted request (possible new schema) vs. company connect noting the person.
- [ ] Build the chosen function; wire it to the "+" on the people squares (with the same optimistic/`connection_state`-style feedback the company Connect button uses).
- **Accept:** clicking "+" on a person sends the intended person-level connect; the card reflects the pending state.

### DISC-11 — `getIncomingConnectionRequests()` server read · **S**
Files: new read in `src/app/discover/` (server client). Test: unit/integration.
- [ ] Server read returning only incoming pending connect requests. **Reuse the pattern `getInbox` already uses** ([inbox.ts:130-196](../../src/modules/connect/supabase/inbox.ts)): resolve the viewer's `company_id` (the `person.company_id` lookup getInbox does), then query `pending_inbox_item` filtered to `status='pending'` AND `receiver_company_id = <viewer company>` (i.e. `viewerIsReceiver`) AND `type in ('connect','connect_message')`. Return a light row shape (sender company name/initials, note, created_at, id) — **no `deal_card` join needed** (that's the deal-ticket path, out of scope here).
- **Accept:** returns only incoming pending connect requests; excludes outgoing, non-pending, and pricing/deal-ticket types.

### DISC-12 — `RequestsSection` (in-page) · **M**
Files: new `src/app/discover/sections/RequestsSection.tsx`; server actions `acceptConnectionRequest`/`declineConnectionRequest` wrapping existing `acceptItem`/`declineItem`; wire into shell + page fetch.
- [ ] Client component receiving the server-fetched list; light rows (avatar/company + note + **Accept / Decline**). Accept/Decline call the server actions (which reuse the existing accept/decline logic — accept creates the relationship/threads + Sella intro, as today), then refresh. **⟳ `acceptItem` now branches on `deal_card` ([inbox.ts:279-314](../../src/modules/connect/supabase/inbox.ts)) — the connect path is unchanged and this section filters to connect types, so it never hits the deal branch.**
- **Accept:** incoming requests render as a top section; Accept establishes the connection; Decline rejects; the section empties as items are handled.

### DISC-13 — My Network server read · **S**
Files: server-callable network read (refactor `getMyConnections` to accept a client, or a small server mirror in `src/app/discover/`).
- [ ] Provide a server-callable path returning `MyConnectionsView` (`ConnectedCompany[]`) for Wave-1 fetch. Prefer refactoring `getMyConnections` to accept a supabase client (DRY) — ⚠️ shared `messaging` file, sync-lock first.
- **Accept:** the server can fetch your active connections; shape unchanged.

### DISC-14 — `MyNetworkSection` · **M**
Files: new `src/app/discover/sections/MyNetworkSection.tsx`; wire into shell + page fetch.
- [ ] Rows for your connected companies (name + initials + city + `contactsCount` + `openDealCount`); their `people` shown/expandable. Data from page props.
- **Accept:** your active connections render as rows in the My Network section, matching the prototype.

### DISC-15 — Mockup companies seed · **S**
Files: `supabase/seed/` (or the seed file). 
- [ ] Seed realistic demo companies (real names/logos, per [DEV-100](https://linear.app/hellosello/issue/DEV-100)), tagged across the taxonomy incl. a pharmacy or two (to exercise the search-only rule).
- **Accept:** Discover shows a realistic directory on a fresh `db reset`; pharmacy seed is hidden-but-searchable.

## Cross-lane / risks
- **Overlap with Lane A — VERIFIED 2026-07-20, Lane A is IN:** `getInbox` now stamps `viewerIsReceiver` + joins a `dealCard` preview, and `acceptItem` branches on `deal_card` — **all confirmed compatible** (connect path unchanged; the requests section filters to connect types). `connect/types.ts` `InboxItemView` now carries `dealCard` + `viewerIsReceiver`. No file collision (Lane B builds new components + a new server read).
- **DISC-13 touches shared `messaging/connections.ts`** — sync-lock in `docs/team/sync/muskan.md` first (Ayush's lane).
- **Pharmacy-hidden stays client-side** (documented tradeoff): a direct RPC caller still receives pharmacy rows. Fine (safe fields, verified peers); flag if it must become a real boundary.

## Done criteria
- Discover renders one scrolling page: ads banner → Connection Requests → My Network → New People → Companies, all loaded with the page (no flash).
- Everyone visible except pharmacies (hidden-but-searchable), tags correctly labelled + filterable; the companies RPC verified-caller gate restored.
- New People shows discoverable people as squares with a working "+"; Connection Requests accept/decline works; My Network lists your connections.
- pgTAP (people RPC, verified gate) + unit + e2e green; tsc + eslint clean; live-verified on a fresh `db reset`.
- ARCHITECTURE-NOTES entry (Wave-1 server-fetch pattern + the client-side pharmacy gate). Status → ✅.

## Follow-ups (after this lane)
- Real ad content/serving in the banner.
- Server-side search/pagination when the directory grows (Flowz shadow profiles).
- Sector (`business_category`) filter — add the join to the RPC + a facet.
- Reconcile with Marcel's DEV-141 "Networking in Connect" (we located it in Discover — his call to confirm).
