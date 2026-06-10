# Build Plan - 2e: Relationship page + "My Relationship with …" chat top bar

> Third atom in the Connect build order: ① Deal card → ② Chat → **③ Relationship page** → ④ Deal Workspace.
> 2a–2d built and shipped the chat (inbox → accept → C2C+P2P → live realtime, all on real Supabase).
> 2e adds the **persistent company↔company record** and the **door to it from the chat**.

---

## 2026-06-09 22:24 CEST - DRAFT → **LOCKED by Ayush** (D1 seed-historical-deals + D2 full-upload chosen 22:3x CEST; lock + Phase 0 go given same evening).

### Build log

- **Phase 0 DONE** (2026-06-09 ~22:45 CEST) - `src/modules/relationship/` scaffolded: `types.ts` (raw rows
  bound to `database.types.ts`, narrowed seeded unions incl. `DealStatus` full 6-code set, UI projections:
  RelationshipView/NoteView/TermView/ArtifactView/DealSummaryView/LogEntry/RelationshipStats) + `index.ts`
  barrel (types only so far). Verified all seeded codes against `20260607090001_lookups_and_seeds.sql`
  (artifact_category = contract/nda/certificate/marketing/other; deal_card_status incl. withdrawn/amended).
  `tsc --noEmit` clean. Deals-tab bucket mapping decided here: Active=draft/confirmed/amended · Old=done ·
  Cancelled=cancelled/withdrawn.
- **Phase 1 DONE** (2026-06-09 ~23:05 CEST) - the door + the route, verified live (logged in as Alice).
  Added `relationshipId` to `ConversationListItem` (+ populated from `chat_thread.relationship_id` in
  `getConversations`); added the "My Relationship with {company}" `<Link>` to the `ThreadView` header;
  created `RelationshipPage` shell (glass card + "← Back to chat") + the route
  `app/connect/relationship/[relationshipId]/page.tsx` (Next 16 async `params`). Verified in Claude Preview:
  C2C thread → page lands at `/connect/relationship/<id>`; **P2P thread of the same pair opens the SAME id**
  (one page, two doors ✓); back-link round-trips to chat; no console errors; `tsc` clean. Sub-nav stays left,
  matching the prototype shell. *(Heads-up, pre-existing + unrelated: the top-bar company name shows "Aurora
  Deutschland GmbH" not GreenLeaf for alice@greenleaf.test - topbar identity wiring, not 2e. **Muskan owns this
  fix** (confirmed by Ayush 2026-06-09); not touched here.)*
- **Phase 2 DONE** (2026-06-09 ~23:35 CEST) - the reads + pure stats, verified live both sides. Built
  `lib/stats.ts` (pure: `companyInitials`, `bucketOf`, `formatMoney`, `computeStats`, `buildLog` - no Supabase/
  React, so testable; no test runner installed yet so verified via live data, unit tests deferred) +
  `supabase/reads.ts` (`getRelationshipPageData(id)` - one parallel RLS-scoped batch: relationship + both
  company names + notes + in-force terms w/ lookup labels + artifacts + deals; viewer side from session).
  Wired a thin **Phase-2 proof view** into `RelationshipPage` (real header w/ bridge mark + connected-since +
  live row counts) - the styled top band/tabs/dialogs are Phase 3. **Verified in Claude Preview:** as Alice →
  "GreenLeaf Cultivation ⋯ StonePharm · viewing as GreenLeaf"; logged out, as Bob → same canonical header,
  "viewing as **StonePharm**" (GreenLeaf is `company_a`, so the flip proves session-based side resolution, not
  a fixed column). Counts all 0 (correct - seed is Phase 8). No console errors either side; `tsc` clean.
- **Phase 3 DONE** (2026-06-10 ~00:05 CEST) - the styled top band, verified live. `RelationshipHeader`
  (two-logo **bridge mark** line·dot·brand-dot·line, "RELATIONSHIP" label, NO person names) + `OverviewBoxes`
  (Sella-insight box + Analytics box side by side, glass/ink/brand, each with a "more →" button - **inert until
  Phase 7 dialogs**). Sella box shows a computed relationship-level read (empty-state variant on 0 deals);
  Analytics shows Total business / Deals / Avg deal / Since KPIs from `computeStats`. **Wording change (Ayush):**
  dropped "viewing as {own company}" - the status line now reads **"● Connected to {counterparty} since
  {Month YYYY}"** (names the OTHER company, the meaningful "who + since when"). Replaced the Phase-2 proof view;
  `RelationshipPage` now renders header + boxes inside `max-w-4xl`. Verified desktop layout (boxes side by side),
  no console errors, `tsc` clean. *(Heads-up: the box "more →" buttons render but don't open yet - Phase 7.)*
- **Phase 4 DONE** (2026-06-10 ~00:25 CEST) - the tabbed record, verified live. `RecordTabs` (client tab state)
  with all five bodies (kept in one cohesive file; will extract Notes/Docs when they go interactive in 5/6):
  **Overview** = activity log (from `buildLog`, expand/collapse) + deals peek (active deals + "View all deals →"
  switches tab); **Deals** = filter chips All/Active/Old/Cancelled w/ counts + row list (status badge, value,
  inert "Open workspace →" until screen ④); **Notes** = team + personal slots (read-only) + the "their notes
  are private" line; **Terms** = in-force agreed terms grid (read-only); **Docs** = artifact list + "company-wide
  vs deal docs" note. Every tab has a clean empty state (all empty until Phase 8 seed). Wired below the top band
  in `RelationshipPage`. Verified in Preview: tab switching, deals filter, Overview→Deals jump, all empty states
  render intentionally; no console errors; `tsc` clean.
- **Phase 5 DONE** (2026-06-10 ~00:55 CEST) - notes write + **privacy proven live** (the FR-C6 money shot).
  `supabase/writes.ts: saveNote()` (insert-or-update by scope; company_id/created_by from session; RLS enforces
  side+author). Extracted interactive `components/NotesTab.tsx` (inline edit: Add/Edit → textarea → Save/Cancel,
  optimistic local state, error surface) and removed the read-only inline version from RecordTabs. **Removed the
  "their notes are private to them" line** (Ayush - already implied). Also fixed two lint issues found en route:
  unused `NoteView` import + a synchronous `setState` inside `RelationshipPage`'s effect (cascading-render
  anti-pattern → now only commits from the async result). **Verified live:** as Alice wrote a team note + a
  personal note (both persisted - confirmed in DB: company=GreenLeaf, author=Alice, scopes team+personal); then
  logged in as **Bob** and opened the SAME relationship → Notes tab shows "No team note yet / No personal note
  yet" - **Bob sees neither of Alice's notes** (RLS filters by company first). `tsc` + eslint clean. *(Transient:
  a mid-edit HMR compile briefly logged a duplicate-NotesTab error; gone after recompile, source verified single
  definition.)* *(Note for Phase 8 seed: Alice's 2 live notes now exist on rel `5e64f146`; seed must be
  idempotent / target the other relationship to avoid dupes.)*
- **Phase 6 DONE** (2026-06-10 ~01:30 CEST) - artifact upload + download, fully real, verified live both sides.
  **New migration** `20260610010000_relationship_artifact_storage.sql` (written + applied to live via MCP):
  private bucket `relationship-artifacts` (20 MB, pdf/jpeg/png/heic) + storage.objects RLS scoped to
  `is_relationship_member((foldername)[1]::uuid)` - files namespaced `<relationship_id>/...` so BOTH sides
  reach the shared folder. **Muskan flag:** ADDS a bucket + its storage policies only; no public-schema RLS
  altered. App layer: `lib/file-validation.ts` (real **magic-byte** detect for PDF/PNG/JPEG/HEIC + 20 MB cap -
  ignores filename + browser MIME), `writes.ts: uploadArtifact()` (validate → upload → insert pointer row,
  `scan_status='clean'` STUB per D2, best-effort object cleanup on row-insert failure), `reads.ts:
  getArtifactDownloadUrl()` (60 s signed URL). Extracted interactive `components/DocsTab.tsx` (Upload button +
  hidden input + per-row Download), removed read-only inline version. **Verified live:** as Bob uploaded a PDF →
  row + storage object both exist (mime detected `application/pdf`, scan_status clean, path namespaced); a text
  file lying as `.pdf` was **rejected** (magic-byte); Download produced a signed URL that fetched **200 + real
  `%PDF` bytes**; logged in as **Alice** → sees Bob's file labeled **"StonePharm"** (uploader) and **downloaded
  it** (200) - proving artifacts are relationship-SHARED (opposite of the per-side-private notes). `tsc` + eslint
  clean. *(Same transient HMR duplicate-DocsTab error during the extract; cleared by bouncing the dev server -
  `rm -rf .next` - the known Turbopack stale-compile cache.)* *(Phase 8 seed note: Bob's GDP-cert artifact +
  Alice's 2 notes now live on rel `5e64f146`; seed must be idempotent / use the other relationship.)*
- **Phase 7 DONE** (2026-06-10 ~01:55 CEST) - the two dialogs, mechanics verified live. Reusable
  `components/Dialog.tsx` (blurred backdrop `bg-ink/30 backdrop-blur-sm`, white card, close via X / backdrop
  click / **Escape**). `SellaInsightDialog` (relationship-level "What's happening" + "How to grow" action cards,
  empty-vs-active variants from stats). `AnalyticsDialog` (6 KPIs + 3 bar charts [by deal / quarter / status] +
  share-by-deal **pie** [conic-gradient, brand-tinted palette] + takeaway; degrades to "No deals yet" empty
  note). Added pure `lib/stats.ts: quarterOf` + `dealBreakdowns` (byDeal/byQuarter/byStatus, money charts exclude
  cancelled). Wired both via lifted open-state in `RelationshipRecord` → `OverviewBoxes` "more →" buttons now
  live. Fixed a React-compiler lint (mutable `acc` in the pie calc → pure cumulative slice/reduce). **Verified
  live (0-deal state):** Sella dialog opens (blurred backdrop screenshot) with the connected/no-history variant;
  closes by backdrop click; Analytics opens with KPIs + empty-charts note; closes by Escape. No console errors;
  `tsc` + eslint clean. *(Charts-with-data not yet exercised - 0 deals until Phase 8; will screenshot the bars +
  pie right after the seed lands.)*
- **Phase 8 DONE — 2e COMPLETE** (2026-06-10 ~02:30 CEST) - seed + full end-to-end both sides. **New migration**
  `20260610020000_seed_relationship_demo.sql` (written + applied), tagged `metadata.seed='demo-world'` (idempotent
  delete-by-tag; **reused by 3a**), on the demo rel `5e64f146`: 4 historical `deal_card`s (confirmed/done/done/
  cancelled; seller-initiated `offer`; backdated) + 4 accepted `relationship_term`s (net30 / DAP / MOQ 5000 /
  lead 10d). Notes (2) + artifact (1) already there from 5/6 - not re-seeded. **No deal threads** (relationship
  page doesn't read them; deal workspace + threads are 3a). **Charts-with-data verified** (the Phase-7 deferral):
  Analytics dialog screenshot shows 6 KPIs (€49,500 total, avg €16,500, largest €24,200, 1 active), by-deal bars,
  share-by-deal pie (49/37/14%), by-status bars, takeaway. **Fixed a real bug found here:** by-quarter chart
  sorted by label text (Q4 2025 wrongly after Q1 2026) → now sorts by chronological key (year*4+quarter); verified
  Q4 2025 → Q1 2026 → Q2 2026. Removed now-dead `quarterOf`. **Full FR-C6 walk, both sides:** as Alice all tabs
  light up (Deals 4 + filters, Terms 4 w/ lookup labels, rich activity log); as **Bob** the SHARED data appears
  (deals 4, terms 4, artifact labeled "Yours") while Alice's notes stay hidden (his Notes tab empty) - **shared:
  deals/terms/artifacts/analytics · private: notes**. No console errors either side; `tsc` + eslint clean.

---

## ✅ 2e COMPLETE (all 8 phases). FR-C6 passes live, both sides. Committed + rebased onto dev (Muskan's Present #75, clean) + PR'd to dev.

**Files created:** `src/modules/relationship/` (types, index, supabase/reads+writes, lib/stats+file-validation,
components: RelationshipPage, RelationshipHeader, OverviewBoxes, RecordTabs, NotesTab, DocsTab, Dialog,
SellaInsightDialog, AnalyticsDialog) + route `app/connect/relationship/[relationshipId]/page.tsx`.
**Files touched:** `messaging/types.ts` + `messaging/supabase/store.ts` (+`relationshipId`), `messaging/components/
ThreadView.tsx` (the door). **Migrations (applied live):** `…010000_relationship_artifact_storage.sql` (bucket +
storage RLS), `…020000_seed_relationship_demo.sql` (demo-world seed).
**Muskan flags:** 1 storage migration ADDS a bucket + storage.objects policies (no public-schema RLS altered).
**Deferred (noted):** real virus scanner (scan stubbed clean); terms propose/accept UI (DEV-41); pricelist
(out of demo scope); deal threads on seeded deals (3a); the top-bar "Aurora Deutschland" placeholder (Muskan owns).
**Demo state:** rel `5e64f146` (Alice↔Bob) is the rich one; reset/reseed via the demo-world migration (idempotent).

---

## Process for 2e (same as every unit)

1. Write this plan. **Lock it with Ayush** before any code (the §6 decisions especially).
2. Build phase by phase, in order. Verify each phase in Claude Preview, no console errors, `tsc` clean.
3. Keep the UI swap behind the module barrel (`relationship/index.ts`), exactly like messaging/connect.
4. Wrap: update sync file, this build log, and CLAUDE.md Last-session / What's-next.

---

## 0. What 2e is (and is NOT)

**2e IS:** the relationship page (screen ③) built for real, plus the chat top-bar button that opens it.
The page is the **shared memory between two companies** - log, notes, agreed terms, artifacts, plus a
Sella-insight box and an analytics box, organised as a tabbed record (Layout C). It reads/writes the
**already-migrated** screen-③ tables on real Supabase, viewer fixed by login.

**2e is NOT:** the deal card (3a) or the deal workspace (screen ④, 3b–3d). It is **off the core deal spine** -
the deal flow does not depend on it (PRD §5). It is built for the MVP because FR-C6 is in the acceptance
script (step 3b), but it must not block the deal work.

**The design is already decided.** The full prototype is locked in `prototypes/relationship-prototype/`
(`index.html` + `NOTES.md` + `CONTEXT.md`, locked 2026-06-07, Layout C). 2e is mostly "port the locked
prototype into the real React app + real data," not "decide what it looks like."

---

## 1. What is already done (the foundation we ride on) - VERIFIED on live `byipusuthdlskdxoexkt`

This is the reason 2e is low-risk. Almost the whole backend already exists.

| Thing | State | Where |
|---|---|---|
| `relationship` table | **migrated**, 2 rows live (the 2d seed pairs) | `20260607090003_phase2_deal.sql:17` |
| `relationship_note` (team/personal, `scope`) | **migrated**, 0 rows | same file :42 |
| `relationship_term` (standing terms, propose/accept) | **migrated**, 0 rows | same file :61 |
| `relationship_artifact` (company-wide files) | **migrated**, 0 rows | same file :93 |
| RLS on all four | **already correct** (see below) | `20260607170000_rls_policies.sql:263-277` |
| Lookups `note_scope` (2) · `agreed_term_type` (5) · `artifact_category` (5) | **seeded** | `20260607090001_lookups_and_seeds.sql` |
| `is_relationship_member()` helper | exists, used by 2d | rls migration |
| Counterparty name visibility (see other company/person name) | shipped in 2d | `20260609183000_…counterparty_visibility.sql` |
| Chat shell to hang the top-bar button on | shipped in 2b/2c | `messaging/components/ThreadView.tsx` |

**The RLS already does the side-aware projection for us** - this is the key win:

- `relationship_note`: `USING (company_id = current_company_id() AND (scope='team' OR created_by = auth.uid()))`
  → my company's team notes + my own personal notes; the **other side never sees either**, and teammates
  don't see my personal note. Exactly the prototype's rule, enforced in the DB.
- `relationship_term` + `relationship_artifact`: `USING (is_relationship_member(relationship_id))` → both
  sides read (relationship-scoped = shared). Matches "agreed terms / artifacts both sides see."

Because the viewer is fixed by login (one user per company, v0), **there is no "Seeing as" toggle** - that was
a prototype demo device. The real page is whatever-you-see-is-your-side, and RLS guarantees it.

---

## 2. What 2e adds (mapped to phases)

| Gap | Plain words | Phase |
|---|---|---|
| **Door** | a "My Relationship with …" button on the chat thread header → opens the page | Phase 1 |
| **Route + shell** | `/connect/relationship/[id]`, the Connect shell with "← Back to chat" | Phase 1 |
| **Reads** | one relationship + its log/notes/terms/artifacts, RLS-scoped, stitched in JS | Phase 2 |
| **Top band** | header (two logos + bridge mark) + Sella box + Analytics box | Phase 3 |
| **Tabs** | Overview · Deals · Notes · Terms · Docs (Layout C) | Phase 4 |
| **Note writes** | add/edit team note + personal note (real, side-aware) | Phase 5 |
| **Artifact upload** | real upload (bucket + magic-byte + size) + signed-URL download; scan stubbed | Phase 6 |
| **Dialogs** | Sella insight dialog + full-analytics dialog (computed, blurred backdrop) | Phase 7 |
| **Seed demo world + verify** | historical deals (reused by 3a) + notes/terms/artifacts; end-to-end check | Phase 8 |

---

## 3. Design language - port elements, not pixels (LOCKED rule from Ayush)

The prototype is rough (Tailwind CDN, raw `pink-600`/`slate`, emoji icons). The real app has a finished design
system. **Take the elements and layout from the prototype; take the styling from the real React app.**

| Prototype (rough) | Real app (use this) | Seen in |
|---|---|---|
| `bg-white border border-slate-200 rounded-2xl` cards | `glass … rounded-3xl` | `ChatView.tsx`, `ThreadView.tsx` |
| raw `pink-600` text/buttons | `text-ink` / brand tokens (`text-ink/45`, `bg-ink/5`) | every component |
| emoji icons (🏢 📄 🔒 ✕) | **lucide-react** icons (`Building2`, `FileText`, `Lock`, `X`) | `ThreadView` uses `Building2` |
| `cdn.tailwindcss.com` | the project's Tailwind + tokens | global |

**Keep from the prototype exactly:** Layout C structure (top band → two boxes → tabbed record), the bridge mark
(line · dot · line, **never** `//` which is the Hello Sello brand mark), no person names in the header, the
box→dialog progressive-disclosure grammar (blurred backdrop, open→read→close), the 5 tab set, and the
two-altitudes rule (relationship-level here; deal-level inside the deal).

---

## 4. Module shape (mirror messaging/connect exactly)

New module `src/modules/relationship/`, same skeleton as `messaging/`:

```
src/modules/relationship/
  index.ts                      barrel - the ONLY public surface
  types.ts                      RelationshipView, NoteView, TermView, ArtifactView, LogEntry
  supabase/
    reads.ts                    getRelationship(id) + getNotes/getTerms/getArtifacts/getLog
    writes.ts                   upsertNote(scope, body)  (terms/artifacts writes: see §6)
  lib/
    stats.ts                    pure: compute analytics + bridge-mark + log from rows (testable)
  components/
    RelationshipPage.tsx        orchestrator (the one stateful piece)
    RelationshipHeader.tsx      two logos + bridge mark + connected-since pill + back link
    OverviewBoxes.tsx           SellaBox + AnalyticsBox (side by side)
    RecordTabs.tsx              tab bar + body switch
    tabs/ OverviewTab NotesTab TermsTab DocsTab DealsTab
    SellaInsightDialog.tsx      blurred-backdrop modal
    AnalyticsDialog.tsx         KPIs + bar charts + pie + takeaway

src/app/connect/relationship/[relationshipId]/page.tsx   route → <RelationshipPage id=… />
```

**Data-access pattern = the 2d pattern, copied:** flat RLS-scoped fetches via the browser client, viewer from
`auth.getUser()`, stitched in JS (see `messaging/supabase/store.ts:75`). No new RPC needed for reads.

---

## 5. Files 2e creates / touches

**Creates:** the whole `src/modules/relationship/` tree above + the `[relationshipId]` route +
one seed migration (`supabase/migrations/2026…_seed_relationship_demo.sql`).

**Touches (small, surgical):**
- `messaging/components/ThreadView.tsx` - add the "My Relationship with …" button in the header. It needs the
  `relationshipId` for the thread. `ConversationListItem` does not carry it today → add `relationshipId` to that
  type + populate it in `getConversations()` (it already fetches `relationship`). One-line-ish additions.
- `messaging/types.ts` - add `relationshipId: string` to `ConversationListItem`.

No change to connect/inbox. No change to existing RLS (already correct).

---

## 6. Decisions to confirm with Ayush BEFORE building (the real choices)

These are the only open product calls. My recommendation is first; we lock these at the same time as the plan.

**D1 - Deals tab + Analytics, when `deal_card` has 0 rows (3a not built). → LOCKED 2026-06-09 (Ayush).**
**Seed historical deals, reusable in 3a.** Seed `deal_card` rows that read as the relationship's **past history**
- mostly `done` + `cancelled`, maybe one older `active` - tagged `metadata.seed='demo-world'` so 3a reuses the
same data. This makes the Deals tab + Analytics rich AND honest, because past closed deals genuinely belong on a
relationship record. **The live demo deal is NOT pre-seeded:** the PRD spine (Sella spots a deal forming →
drafts the card live) stays a real, live moment in 3a, on top of the seeded history. Each seeded historical deal
gets a **thin** deal thread (1–2 system lines), not hand-written fake human conversations - the rich talking is
the live run. *(Rationale: seed the past, never fake the live moment the demo exists to prove.)*

**D2 - Artifacts: build real upload. → LOCKED 2026-06-09 (Ayush).**
**Build the upload core for real:** a private Supabase Storage bucket, **magic-byte** file-type validation (read
the header, don't trust the filename), a size limit (≤ 20 MB per schema), and **signed-URL download**. Same
Storage pattern as `company_license_file` / the onboarding-storage migration.
**One honest caveat:** the real **virus scanner** (`scan_status pending→clean→infected`) is an external service
not yet wired. For the demo we **stub the scan** (insert/upload sets `scan_status='clean'`, or a trivial
placeholder edge function); wiring a real scanner is the deferred fast-follow. We build upload+download correctly;
we just don't pretend malware scanning runs. *(Release-It boundary: the risk is trusting an outside file, not the
upload form.)*

**D3 - Agreed terms: propose/accept flow, or read-only in-force terms?**
The schema has a full propose→accept→supersede state machine, but the agreed-terms **edit workflow is already
deferred per DEV-41** (CONTEXT.md §6).
→ **Recommend:** Phase 2e shows **read-only in-force terms** (seeded `accepted` rows). No propose/accept UI yet.
Low risk, matches the deferral.

**D4 - Custom pricelist.**
PRD §5 lists pricelist management as **out of scope** for the demo.
→ **Recommend:** omit the pricelist card (or a one-line "Custom pricelist - coming with pricing, Phase 2"
placeholder). The "Terms & prices" tab becomes just **Terms** for now.

**D5 - Notes: which writes are live?**
→ **Recommend:** team note + personal note are **fully live** (add + edit) - this is the cheapest real write
(one table, RLS already enforces side+author), and it makes step 3b feel real. This is the one write we build.

**D6 - Route vs overlay.**
→ **Recommend:** a real **route** `/connect/relationship/[relationshipId]` with a "← Back to chat" link
(matches the prototype's back affordance and is shareable/bookmarkable). Not a modal over the chat.

Net effect (locked): **reads everywhere are real; live writes are Notes (add/edit) + Artifact upload; Deals +
Analytics read real seeded historical `deal_card` (reused by 3a); Terms are real read-only seeded rows; pricelist
omitted.** That keeps 2e small and honest while passing FR-C6, and the seeded deal history carries straight into 3a.

---

## 7. Phases & tasks (run AFTER Ayush locks)

### Phase 0 - Module scaffold + types
Create `relationship/` skeleton, `types.ts`, empty barrel. `tsc` clean. No UI yet.

### Phase 1 - The door + the route
Add `relationshipId` to `ConversationListItem` (+ populate in `getConversations`). Add the "My Relationship with
{company}" button to `ThreadView` header → routes to `/connect/relationship/[id]`. Build the route + a bare
`RelationshipPage` shell with the "← Back to chat" link. Verify: click from a chat lands on the page; back returns.

### Phase 2 - Reads (the data spine)
`reads.ts`: `getRelationship(id)` returns the relationship + other-company name/initials (counterparty visibility),
+ `getNotes/getTerms/getArtifacts`. `lib/stats.ts`: pure functions to compute the analytics numbers, the bridge
header, and the activity log from rows. Unit-test `stats.ts`.

### Phase 3 - Top band
`RelationshipHeader` (two logos + **bridge mark**, connected-since pill, no person names) + `OverviewBoxes`
(SellaBox + AnalyticsBox side by side, each with a "more →" button). Real numbers from `stats.ts`.

### Phase 4 - Tabbed record
`RecordTabs` + the five tab bodies. Overview = activity log + deals peek. Deals = real `deal_card` read of the
seeded **historical** deals with the filter (All/Active/Old/Cancelled) (D1). Notes = team + personal (read).
Terms = read-only in-force terms (D3). Docs = artifact list + download (D2). Pricelist omitted (D4).

### Phase 5 - Notes write
`writes.ts: upsertNote(relationshipId, scope, body)`. Add/edit team + personal note inline. RLS already blocks
the other side + protects personal scope - verify by logging in as the counterparty and confirming the note is
gone. This is the FR-C6 "the other side's personal notes stay hidden" proof.

### Phase 6 - Artifact upload (real core, scan stubbed) (D2)
Private Storage bucket + `writes.ts: uploadArtifact(...)`: magic-byte type check, ≤ 20 MB, insert
`relationship_artifact` with `scan_status='clean'` (stub). Download via signed URL. Verify both sides can read,
only the uploading side can delete (RLS `is_relationship_member` for read; uploader-only for write per schema).

### Phase 7 - The two dialogs
`SellaInsightDialog` ("what's happening" + "how to grow") and `AnalyticsDialog` (KPIs + bar charts + pie +
takeaway), both blurred-backdrop modals (close X + click-outside), computed from `stats.ts`. Reuse the prototype's
chart math (pure, already written in `index.html`).

### Phase 8 - Seed the demo world + end-to-end verify
Seed migration (idempotent, cleanup-by-tag like 2d), tagged `metadata.seed='demo-world'` so **3a reuses it**:
- `deal_card` - historical deals (mostly `done`/`cancelled`, ≥1 older `active`) on the demo relationship, each
  with a **thin** deal thread (1–2 system lines). NOT the live demo deal.
- `relationship_note` - team + personal, both sides.
- `relationship_term` - accepted: `payment_terms`, `incoterms`, `min_order_qty`.
- `relationship_artifact` - a couple of real files in the bucket (`scan_status='clean'`).
Walk FR-C6 step 3b live as Alice and as Bob: header, both dialogs, tabs, deals history, notes write + privacy,
artifact upload + download, no console errors, `tsc` clean.

---

## 8. Done when (2e acceptance) - FR-C6 (PRD acceptance step 3b)

- From a P2P **or** C2C chat, the "My Relationship with …" button opens the **same** company↔company page.
- The page shows the connected company, status, activity log, agreed terms, and artifacts.
- Team + personal notes can be added/edited; **the other side's personal notes stay hidden** (verified by
  logging in as the counterparty).
- Sella-insight and Analytics boxes open their dialogs (blurred backdrop, close, click-outside).
- Deals tab + Analytics read the real seeded **historical** `deal_card` rows (past deals; the live deal is not
  pre-seeded) and the same seed carries into 3a.
- Built in the real app's design language (glass / ink / lucide), no console errors, `tsc` clean, no new
  RLS needed.

---

## 9. Deliberately deferred (NOT 2e)

- The Deal card UI/flow (3a), Deal Workspace screen ④ (3b–3d), "Open workspace →" target. *(2e only seeds
  historical `deal_card` rows + reads them; it does not build the deal card or the live deal-forming flow.)*
- A **real virus scanner** for artifacts - upload is built, scan is stubbed `clean` in 2e (D2).
- Agreed-terms **propose/accept** workflow (DEV-41) + multi-approver pricelist sign-off - read-only terms (D3).
- Custom pricelist (out of demo scope, D4).
- A flat "all relationships" directory/list (future Grow/Trade surface).
- Realtime on the relationship page (notes/terms change rarely; not needed for the demo).

---

## 10. Open risks / things to confirm during build

- `ConversationListItem` does not carry `relationshipId` today - adding it touches messaging's public type
  (small, additive). Confirm no other consumer breaks (`tsc`).
- The two seeded relationships were minted by 2d's accept rollout - confirm their `company_a_id < company_b_id`
  canonical order when seeding notes/terms so `company_id` on notes points at the right side.
- `stats.ts` must stay pure (no Supabase import) so it is unit-testable and the prototype's chart math ports cleanly.
