# Decisions Log — Archive: August 2026

> Moved out of `DECISIONS.md` (2026-09-08) to keep the active file short.
> See that file for the current archive index and current-month log.

---

## 2026-08-14 — Pipeline dry-run executed on the tier ladder — G1+G2 passed; ADR-0004 rev 8 parked at G3

Ticket switched from the originally-proposed Discover migration batch to the tier ladder — the migration batch only exercises `/ship` and the security reviewer; the tier ladder is FULL-lane and hits every gate (G1–G5), which is what a dry run of the whole pipeline needs.

- **Product locked at spec (0021-tier-ladder, G1-approved):** up to 3 volume price tiers per product (Marcel, verbatim: "Create 3 price tiers per product with dropdown"), repeatable rows UI-capped at 3 — **not** fixed columns, so a 4th tier later is a row not a migration. **REPLACES** the existing single bundle bracket (`bundle_threshold_grams`/`bundle_price_per_gram`) — one source of truth, per the existing "prices: one source of truth" lock. Base price stays exactly where it is (`pricelist_item.price_per_gram`), untouched, not folded into the ladder. The buyer-facing dropdown is an **order tool**, not a label — picking a rung pre-fills that quantity into the basket; from there basket quantity alone decides the price, live, up or down. Per-customer pricing stays a separate deferred system (per Marcel) — not related to this ladder.
- **Design locked at prototype (G2, Variant B):** the buyer/seller price reveal is an inline "See all prices" panel (not a dropdown-beside-price or price-as-trigger variant) — built directly on the real `ProductCard.tsx` design, not an invented mockup.
- **Decision B (G3, negotiation ownership):** once a basket becomes a deal draft, prices stop moving automatically. A quantity edit on the deal card never silently re-prices the line; instead it shows a hint ("qualifies for €X/g") that, when clicked, **proposes** the new rung as a held change through the existing propose/accept flow — never a direct write. *Why:* the deal card already has a locked rule (ADR-0001: a pending change locks the deal; ADR-0002: line prices are shared/held fields) — an early ADR draft would have silently broken both by writing the resolved price directly.
- **Decision A (G3, basket UX):** the basket line gains a grams/pack-size editor. *Why:* acceptance criterion 5a ("buyer edits the basket down to 700g → re-prices to the 500g rung") turned out to be unbuildable on the existing basket UI, which only steps whole pack counts. Renegotiating the criterion into pack-count arithmetic was considered and rejected — buyers think in grams and the ladder itself speaks in grams; forcing pack math would be confusing, not simpler.
- **Pipeline process locks, from 7 adversarial ADR-checker rounds (11+15+15+14+15+14+12 findings; ~70 total, never zero):** `adr-checker` graduates from Tier-2 hypothesis to Tier-1 evidence-backed — it must run as a genuinely **fresh, separate-context, read-only agent**, never the ADR's own author re-reading his own work (this was the single highest-value process change of the session: round 1 alone caught a security-gate regression, a missed CSV-import writer, and 3 divergent "which price row" pickers that no single review would have found). The checker loop is **budgeted, not exhaustive** — run 2 rounds, ship to the human gate on the first round with **zero NEW blocking findings**, never wait for zero findings total (severity fell every round; count never did). Revisions must carry a **simplification bias**: prefer the fix that removes a mechanism over one that adds one — rev 6 added a `SECURITY DEFINER` RPC to fix a save-ordering problem and that addition itself introduced a live "any user can rewrite any seller's prices" hole; rev 7 fixed it by removing the DEFINER (switching to `SECURITY INVOKER`, letting RLS enforce ownership for free) and introduced zero new findings. Checkers can also be wrong about each other — round 6 flagged "RLS policies would be silently inert" with a wrong rationale (the repo already has an `rls_auto_enable()` event trigger); round 5 corrected it. **PIPELINE.md §6b amended:** prototypes now get the same NNNN numbering as specs/builds (`prototypes/NNNN-<slug>-prototype/`).
- **Tracking split locked:** `TICKETS.md` (in the build folder) stays the spec of record — EARS criteria, file lists, dependency graph; Linear gets one issue per ticket for pick-up/close tracking. *Why:* the team already tracks work as DEV-XX in Linear; splitting into GitHub issues too would fragment tracking for no gain. **Blocked this session:** Linear MCP auth did not complete (`/mcp` retried, still unauthorized) — first task of the next session, per `docs/agents/PIPELINE.md` open decision #1.

Full trail — every prediction, every stage log, all 7 checker transcripts, the convergence table: `docs/agents/DRY-RUN-tier-ladder.md`.

---

## 2026-08-14 — Volume pricing = the tier ladder (build amendment to the dry-run design lock)

- **Volume pricing is now the tier ladder: child rows of `pricelist_item` (`pricelist_item_tier`), up to 3 rungs in the UI, unbounded in schema, REPLACING the single bundle bracket columns** (`bundle_threshold_grams` / `bundle_price_per_gram` — dropped by held Migration C only after the tiers-reading deploy is verified live; Migration E backfills well-formed brackets to rungs, rescues malformed ones to `metadata.legacy_bundle`). Base price stays on `pricelist_item`. *Why:* one mechanism for N volume prices instead of a special-cased single bracket; ref ADR-0004 (rev 8) + PRD 0021.

---

## 2026-08-16 — Pipeline dry-run COMPLETE — verdict: build the Tier-1 roster; checker rules confirmed end-to-end

The tier-ladder slug finished every stage (G1→G5 + contract migration C live on prod), closing the dry run the 2026-08-14 entry opened. Final verdicts, written into `docs/agents/PIPELINE.md` (canonical) + the filled stage table in `docs/agents/DRY-RUN-tier-ladder.md`:

- **`adr-checker` is Tier 1 — CONFIRMED at completion** (not just at G3): its three operating rules (fresh separate-context agent every round · 2-round budget, stop on zero NEW blockers · simplification bias on fixes) held through build and ship and are now locked in PIPELINE.md's `/design` section.
- **`plan-checker` stays Tier 2, on watch** — its headline predicted catch (missed call sites) was pre-empted by the ADR before any plan existed; no decisive independent catch in T01–T08. Not cut; earns Tier 1 (or the axe) on future slugs. `consistency` likewise: no evidence either way this slug.
- **Build decision: GO on the Tier-1 set as real skills/agents** (/triage + STATE.md · spec/design with adr-checker · test-writer/runner · visual-verifier + G4 · /ship). /ship must bake in two dry-run-discovered steps: the diff-against-live re-declare protocol, and the fact that **prod data-writes require a human-granted permission rule** (the classifier correctly blocks the agent). Do NOT build plan-checker/consistency as agents yet. *Why:* the dry-run's own rule — a Tier-2 agent that catches nothing gets cut before it's built; automating unproven checkers is the GSD failure mode the pipeline was designed against.

---

## 2026-08-19 (session `buyer_shop_view`) — Buyer shop view: an accepted relationship overrides product visibility (AMENDS the 2026-06-14 soft-openness lock)

Locked at **G1 of slug `0022-buyer-shop-view`** (`docs/PRD/0022-buyer-shop-view.md`), which
rebuilds the catalogue on `/discover/[companyId]` into the buyer's view of the seller's shop.
Muskan's call, spec interview 2026-08-18/19.

**What changes.** The 2026-06-14 soft-openness lock made catalogue openness deliberately
**connection-independent**: openness = `product.profile_visible` × `product.price_public`,
audience-scoped to logged-in **verified members**, with no relationship in the gate. That
holds for strangers. It no longer holds for partners:

- **An accepted company relationship overrides `product.profile_visible`.** A connected buyer
  sees the seller's whole catalogue, hidden products included. `profile_visible` therefore
  means *"visible to companies I am **not** connected to"* — not *"visible to anyone"*.
  Muskan, verbatim: *"connected companies can always see shops, that means only if someone
  is not connected they cannot see shop if seller has made it private."*
- **`price_public` is NOT overridden.** Connection reveals products, never prices. A connected
  buyer looking at a price-hidden product still gets **Request pricing**, same as a stranger.
  *Why:* price is a deliberate per-product choice, and customised pricing for a specific buyer
  is **Phase 15's** job (per-customer pricelists, September) — not something a connection flag
  should quietly do in August.
- **Caller verification is unchanged** in both arms. The wider door is *verified **and**
  connected*, which is **narrower** than the public arm beside it — so the German **HWG**
  reasoning behind the 2026-06-14 lock is not weakened, only re-scoped.

**Consequences.** This is a permission-rule change, not a UI change: the shop read path gates
on caller verification alone today, so it gains a relationship arm (migration). Slug 0022
therefore carries a migration despite triaging as frontend-only; Muskan re-confirmed the
no-feature-branch call anyway (sole owner, one migration, `/ship` rebases regardless).

**Also locked at the same gate** (detail in the PRD, §3):
- **Request pricing is per-product, not shop-level** — the ask names the product; the answer
  happens in chat. *Why:* the seller cannot price what they cannot identify.
- **A price-hidden product cannot be added to a basket at all.** Muskan: *"no buyer would add
  or send order without knowing price."* Read-only card + Request pricing instead.
- **Basket admission is enforced server-side** on the same permission rule as the read path —
  the basket table is owner-scoped only today and never checks whether the buyer was allowed
  to *see* the product.
- **Ordering without a connection is allowed**: Send delivers the order **and** a connection
  request, announced to the buyer before they commit. Both reach the seller together, but the
  order **cannot be opened or acted on until the connection request is accepted**.

**Supersedes / amends:** the 2026-06-14 soft-openness entry (visibility arm only; its price
arm and its audience-scoping stand). Note for readers: the much older *"Shop prices: visible
only to connected companies"* line in Layer 1 was already superseded on 2026-05-14 and again
on 2026-06-10 — it is **not** the basis for this amendment.

**Also superseded by 0022:** `docs/superpowers/plans/2026-07-07-product-basket.md` Tasks 9–11
(a never-built rival design for the same capability — different route, a second read door, and
a connection-*required* gate; also stale, returning two price columns migration C dropped).
It needs a dead marker so it stops reading as live intent.

## 2026-08-20 — Repair broken test harness on discovery, even mid-ticket

**Decided:** when a build turns up that a *guard* cannot execute, fix it in that session rather
than filing it — even though it expands the ticket's diff. Applied at slug 0022 T01: 22 SQL
runners repaired mid-ticket (Muskan: *"fix first"*).

**Why:** `/ship` leans on these suites to prove a slug is safe. Shipping while they're inert makes
the proof theatre. The cost is a wider diff for one ticket; the alternative is a security guard set
that everyone believes is running and isn't. **Scope discipline protects review quality — it should
not protect a broken check from being fixed.**

**Scope of the rule:** this covers checks that cannot *run* (a broken runner, a suite that exits 0
while failing, a test that passes vacuously). It does **not** license fixing every unrelated defect
a build walks past — those still get recorded and filed. The distinguishing question is whether the
thing is *claiming to verify something it isn't*.

**See:** `ARCHITECTURE-NOTES.md` 2026-08-20 (the stdin rule) · `docs/agents/LEARNINGS.md` L-013.

## 2026-08-22 — A product always has a location; unfiled never reaches a buyer

**Decided:** a seller may not save a product without a location, and a product with no location is
not served to a buyer's shop. `product.location` stays **one value per product** — a
many-locations model was considered at slug 0022's T05 G4 and dropped.

**Why:** the same move as the [2026-08-19 blank-price rule](#2026-08-19) — remove the state rather
than pick a rendering for it. "Unfiled" forced two wrong answers at once: the buyer's shop rendered
a pile it has no vocabulary for (a `Toronto Warehouse · 4` divider with five cards under it), and
the location filter had to choose between hiding a control that genuinely filters and showing one
that names nothing. Both defects are arithmetic about a state that should not exist. The
many-locations variant was dropped for cost with no matching gain: a join table plus a rewrite of
the drag-to-file dialog, the grouping, the RPC projection and the filter, to model something no
seller has asked for.

**The buyer half is DONE** (slug 0022, T05). Enforced in `get_discoverable_shop`
(`20260822090000`), one clause beside the owner arm it mirrors:

```sql
and (p.location is not null or p.company_id = public.current_company_id())
```

Server-side, not on the page, so an unfiled row never leaves the database toward a buyer.
Mutation-proved: removing the clause fails `discoverable_shop_spec_columns_test.sql` block (14).

**The owner exception buys consistency, not reachability.** PRD §7 row 158: a member of the seller's
own company "sees their own shop" on this surface. `/present` reads `getMyShop`, which queries
`product` directly with **no** location filter, so without the exception the same person would see a
smaller catalogue at `/discover/<own company id>` than on their own shop. Nothing is stranded either
way — filing happens on `/present` regardless. Nothing routes an owner to that URL either: the
Discover listing self-excludes (`list_discoverable_companies`: `c.id is distinct from
current_company_id()`), so it is a typed-URL edge case, which is what PRD §7 is a table of.

> **Correction, same day.** This entry first justified the exception as "otherwise unfiled rows are
> stranded forever, because filing happens by dragging them out of the `Unassigned` pile". That was
> wrong — `/present` never reads this RPC. The clause is unchanged; only the reasoning is. Recorded
> rather than silently edited because the wrong reason would have made the exception look
> load-bearing to anyone later deciding whether to keep it.

**The seller half is OWED and ships outside slug 0022** (0022 is the buyer's read surface): the save
path, the add-product flow, probably a `NOT NULL` constraint, and filing the 8 unfiled products that
exist on production today. Until it ships, a seller holding legacy unfiled rows plus exactly one
named location browses `/present` without a location filter — knowingly accepted at T05's G4 rather
than patched, because the state is being removed rather than counted.

**⚠️ At deploy:** Aurora Deutschland's only two buyer-visible products are unfiled, so its shop goes
empty on production until someone gives them a location. Demo data (Muskan, 2026-08-22) — a
one-minute fix in the UI, not a migration.

**Also re-labelled, not deleted:** `ShopView.tsx`'s buyer-side `Unassigned` suppression is now
defensive rather than live — `/present` reads `getMyShop`, not this RPC, so a future buyer-facing
caller of that read would arrive ungated. Same treatment ADR-0005 §6's owner criterion got.

**Surfaced by:** slug 0022 T05's G4 walk (`REVIEW.md` rows 15-16).

---

## 2026-08-22 — Close the write door before a gate ships

**Decided:** when a build turns an existing column, row or table into a permission gate, the **write
path to that gate's input** is in scope for that build. If the input is self-writable, the gate does
not ship until the write door is closed. Splitting the lockdown into its own ticket is fine — T06
blocks on T09 rather than absorbing it — but shipping the gate *beside* the hole is not.

**Why:** the gate is otherwise ornamental, and ornamental gates are worse than absent ones — they
pass review, pass tests, and get relied upon. T06 was correct, green, reviewed and defeated by a
single `INSERT` that nobody had to be granted: `connected=false, hidden=0` → one row → `connected=true,
hidden=2`, leaking two products with their `rrp`. **"Pre-existing, not caused by this ticket" is not
a reason to ship past it** — severity is set by what the gate protects, and T06 is precisely what
converted a bookkeeping-integrity bug into a catalogue-confidentiality hole. The cost objection
did not survive measurement either: `relationship` has exactly one write call site in all of `src/`
and `company.verification_status` has one, so the close is small every time it has been done
(DEV-88, ADR-0005 round 5, T09).

**Surfaced by:** slug 0022 T06's G4 (Muskan's ruling, 2026-08-22). Engineering form of the same rule:
[`ARCHITECTURE-NOTES.md` — a permission gate is only as strong as the write path to its input](../architecture/ARCHITECTURE-NOTES.md); `docs/agents/LEARNINGS.md` L-027.

## 2026-08-24 — The same-deploy rule on this repo means `dev`→`main`, not `dev`

**Decided:** when a batch of migrations and the app code that depends on them must reach production
together, "merge promptly" means **merging through to `main`**. Merging to `dev` does not deploy
production and does not close the window. The window is open from the moment `supabase db push`
finishes until the **production** Vercel deploy reports success, and nothing else counts as closing
it.

**Why:** production deploys from `main`. On 2026-08-24 the six-migration batch for slug 0022 went to
production, PR #163 merged to `dev`, and that was treated as the end of the same-deploy window. It
was not — `main` was 149 commits behind, so production kept running the **old** app against the
**new** schema. `main`'s `store.ts:573` accepted a connection with a direct
`.from("relationship").insert(...)`, and the batch had just revoked that grant. **Connection-accept
failed on production for that interval**, and silently, because the accept path swallows its own
errors (T10). The migration-first ordering was correct and must not be inverted — the reverse breaks
every basket read instead — so the fix is not to reorder but to **treat `dev` as a waypoint, never
as the destination**, and to keep the interval to minutes.

**Practical form:** before pushing migrations that tighten grants or policies, check what
`origin/main` does with the affected tables — `git show origin/main:<file>` — because that is the
code the schema will meet. If `main` writes them directly, the window is not merely a delay: it is a
live outage on that path.

**Surfaced by:** slug 0022's `/ship` (2026-08-24). `docs/agents/LEARNINGS.md` L-034 is the adjacent
migration-ordering class; this one is about the *app* half of the same rule.

---

## 2026-08-24 — Security backlog is ranked by cost-of-finding-late, not by severity

**Decided.** The eleven open security items are sequenced by one question — *is it on the
pharmacy → connect → order path, with real users on it?* — not by how severe they read.
Order: T15 (built), T10, then T13. T11, T14, T16, T17 and DEV-159 are parked with a written
reason. The CI/deterministic-fixture project (T12, DEV-161, the 5 suites with no runner) is
NOT done first.

**Why.** An earlier pass in this session recommended building CI first. That is the right
answer for a team with a shared main branch and wrong for one person with users arriving:
it spends the scarcest resource — Muskan's own hours — proving code that is not the thing
about to break. The inverted principle for a solo team: **observability beats verification.**
You cannot afford to prove everything works before shipping; you can afford to know within
minutes when it does not. T15 and T10 were actively *suppressing* the only feedback channel
that exists, which is why they outrank grant-level holes that are more severe on paper.

**What makes this reversible.** The moment a second engineer works this repo, or the day
pharmacies are transacting for real money, the ranking flips back to the verification-first
order. This is a decision about team size and stage, not about what good engineering is.

**Parked, with reasons (so they are not re-found as oversights):** T11 and T14 are not
reachable through PostgREST · T17 needs a product answer about what deactivation means
· T16 and DEV-159 bite only on demo data.

## 2026-08-25 — A slug that promised no RLS change does not get to make one, even when a review finds a real gap

**Decided:** slug 0023's `security` review raised a genuine finding — the company-addressed deal
signal moves off `pending_inbox_item` (identity-hardened one slug earlier) onto `chat_message`,
whose `msg_all` policy has **no sender predicate**, so a thread member can post a pill attributed
to someone else. **The fix was NOT taken into the slug.** Both findings were filed instead:
**HEL-67 widened** (it already covered the same policy missing a `type` predicate — two missing
guards on one statement, so one ticket) and **HEL-74** (`send_deal` never checks the relationship
is still live).

**Why.** ADR 0006 §4.2 commits slug 0023 to *no schema, no RLS, no grant change*. **That
constraint is not paperwork — it is what makes the migration safe to deploy on its own**, with a
plain `db push` and no coupled batch. Widening scope to fix an RLS policy would have:
- turned a one-function `create or replace` into a policy change on a `FOR ALL` policy, which hits
  SELECT as well as INSERT and needs a reader census first (**L-037**);
- coupled a deployable slug to a security fix with its own design questions — `sender_person_id` is
  **nullable** for system messages, so the obvious predicate breaks every `connection_established`
  writer;
- and done it under end-of-build momentum, which is the condition the checker-loop record already
  warns about.

**The general rule:** a scope fence is a deployment guarantee, not an aspiration. When a review
finds something the fence excludes, **the finding is filed and the fence holds.** Overriding it is
a decision to be taken deliberately and in daylight, not absorbed into the ticket that found it.

**The distinction that made this easy to rule.** Neither finding was a hole the slug **opened**.
`msg_all` has never had a sender predicate; the relationship path produced an inbox ticket before
rather than a chat message. **What changed is that the deal signal now rides on guards that were
never there.** A slug that inherits a weakness is in a different position from one that creates
it — the first files, the second fixes before shipping.

**Cost accepted, explicitly:** deal-arrival messages are forgeable until HEL-67 lands. Low today
(one user per company; a forged pill points at a card everyone in that thread can already read —
`security` confirmed it confers **no new read rights**, only discoverability). **Rises with team
size**, which is exactly when "who sent this" starts to matter.

**Surfaced by:** slug 0023 T01 / HEL-63, `/build` G4, 2026-08-25.

---

## 2026-08-25 — A deactivated company is closed to new connections; an UNVERIFIED one is not

**What was decided.** HEL-75's receiver predicate on `inbox_insert` covers **`deleted_at` and
`deactivated_at` only**. A company that is unverified — including one mid-`resubmit_company_verification()`
— **stays reachable** by a connection request. This is deliberately **narrower** than the liveness
term HEL-70 gave the five discovery read doors, which also require `verification_status = 'verified'`.

**Why.** A deactivated or deleted company has **left**. A pending or re-verifying company is
**arriving**. Hiding the latter from Discover is right — nobody should transact with an unverified
counterparty — but *refusing its inbound interest* punishes it at exactly the moment it is trying to
come back, and the request is inert until someone accepts it anyway (accept is separately gated).

**The asymmetry IS the decision.** This repo's recurring failure is doors disagreeing about one rule
(L-038), so a deliberate disagreement has to be recorded or the next person will "fix" it. The read
doors answer *"may this company be seen?"*; this write door answers *"may this company still be
written to?"* **They are different questions and they are allowed to have different answers.** Do not
tidy `company_can_receive_requests()` into agreement with `product_visible_to_caller()`'s term.

**Cost accepted:** a request may be sent to a company that never becomes verified, leaving an inert
pending row. Judged cheaper than a company losing inbound interest during re-verification.

**Not settled by this ruling, and it needs its own:** a request that was already **pending** when the
receiver deactivates stays acceptable. `WITH CHECK` governs the INSERT only, and accept runs through
`accept_connection_request` — SECURITY DEFINER, which bypasses RLS entirely, so RLS cannot be the
mechanism there. Verified on production 2026-08-25: that function checks item state, addressee and
type, and never the receiver company's liveness.

**Surfaced by:** HEL-75, `security_tickets` session, 2026-08-25.

---

## 2026-08-25 — HEL-67 ships as one type, and its second half is BLOCKED, not deferred

**What was decided.** `msg_all`'s `WITH CHECK` gains exactly one term — `type <> 'deal_detected'` —
and **not** the list the ticket proposed. The ticket's second half (the forgeable *sender*) is
**recorded as blocked on HEL-68**, not carried as outstanding work.

**Why one type and not a list.** The ticket sketched banning *"Sella-authored types, service-role
only"*. A census of every `chat_message` INSERT reachable as `authenticated` shows that is false for
**five of six**: an ordinary browser session writes `intro` and four deal-lifecycle pills with
`sender = 'sella'` and a NULL author (`actions.ts:682` — ⚠️ **stale as of HEL-84's §12 addendum,
2026-08-27**: this browser-session call site was deleted; the four pills now write through the
`announce_deal_event` `SECURITY DEFINER` RPC, no longer reachable from an ordinary session at
all — the census conclusion above describes the state at the time this entry was written, not
today's, `rollout.ts:174`). The type name describes a
**voice**; RLS governs a **writer**; in this product one identity routinely speaks in another's
voice. `deal_detected` is the only type no client writes.

**Why the second half is blocked rather than deferred — the distinction matters.** The obvious fix,
`sender_person_id = auth.uid()`, breaks connection-accept. Not because of the nullable system-message
case the ticket already flagged, but because the accept rollout has the browser insert a
`sender = 'person'` message attributed to the **requester, not the caller** (`rollout.ts:179`, *"the
requester wrote the note"*). Attribution-to-another-person is load-bearing behaviour here, not a
defect. Until HEL-68 moves that write into a definer, any sender predicate either breaks accept or
gates nothing.

"Deferred" would imply someone could pick it up. They cannot, and a future session that tries will
rediscover the same dead end. The counterexample line number is recorded in the ticket, the migration
header and the test so that it fails loudly rather than being re-derived.

**The cost accepted.** HEL-67 stays open and half-closed. The sender of any chat message remains
forgeable by a thread member — as it always has been; slug 0023 did not open it, it moved the deal
signal onto it. Low today at one user per company, rising with team size.

**Surfaced by:** the `security_tickets` session, 2026-08-25.

---

## 2026-08-25 — Company deactivation is closed-to-everyone

**What was decided.** A deactivated company (`company.deactivated_at` set) reads **identically to a
soft-deleted one** across every discovery door — hidden from the Discover listing, company page
closed on a direct link, shop and prices closed, and existing baskets drop its lines. New
connections blocked. The difference from deletion is only that it is **reversible**, and that the
company's **own members never lose sight of their catalogue** — they need to work on it before
reactivating.

**Why.** Three readings were on the table and all three were defensible:

- *Invisible to strangers, open to partners* — "stop marketing, keep serving existing customers."
- *Read-only freeze* — everything stays visible, nothing new can start, open deals finish.
- *Closed to everyone* — chosen.

The deciding argument was **one rule that is easy to reason about**, matching a shape the codebase
already has and already tests (`deleted_at`). The two rejected options each introduce a *third*
lifecycle state with its own visibility semantics, and this repo's recurring failure is doors
disagreeing about the same rule (L-038). Adding a state that only some doors understand is how that
happens again. The cost accepted is real and should not be discovered later: **a buyer with the
deactivated seller's products in a basket loses those lines with no warning.**

**Consequence, worth noting because it inverts the usual direction:** the fix got *cheaper while it
sat in the backlog*. When filed (T17, 2026-08-24) it meant editing four doors. Because T13 pointed
the product policies at `product_visible_to_caller()` and HEL-69 pointed the price view at
`product_price_visible_to_caller()`, six doors now inherit the term from **one edit** to that
function; only the three Discover RPCs still need it individually. Do **not** add the term to the
owner arm.

**Surfaced by:** HEL-70, ruled during the security audit session, 2026-08-25.

---

## 2026-08-25 — HEL-69's price-view migration ships with the slug 0023 push to `main`

**What was decided.** `20260825100000_pricelist_view_single_owner.sql` is **not** a separate deploy.
It rides the slug 0023 push. Its filename sorts after 0023's `20260825090000`, so one plain
`supabase db push --linked` takes both in filename order with **no `--include-all`**. Both now sit
together on `claude/muskan/work`.

**Why.** The leak it closes is real but narrow — two production rows, reachable only by an already
connected buyer — so it does not justify its own deploy window. Batching also keeps the ordering
trivially correct instead of relying on two separate pushes landing in the right sequence, which is
where L-034 bit before.

**⚠️ Same-deploy on this repo means `dev` → `main`, not `dev`** (DECISIONS 2026-08-24). The 0022
outage came from stopping at `dev`.

**Until it ships, production still leaks** `Spirit Bear T28 STR MLS` (€9.50/g) and `fdsc` (€2.00/g)
to any connected buyer. HEL-69 stays **open** until the push, deliberately — a ticket closed on a
local green while production still carries the bug makes the whole list untrustworthy.

**Surfaced by:** HEL-69, 2026-08-25.

---

## 2026-08-25 — `/c/<handle>` publishes contact details by design

**What was decided.** The public business card at `/c/<handle>` continues to show the person's email
and phone to anonymous visitors. **Accepted as intended behaviour, not a hole** — closed so the next
audit finds a ruling rather than re-raising it.

**Why.** A business card exists to make someone contactable, and in a bounded named trade network —
50 wholesalers, ~2,500 pharmacies, everyone expecting to be reachable — that is the point of the
page. The `anon` grant on `get_public_profile` is deliberate and already documented in three
migrations.

**What was weighed against it, and is not dismissed.** The address published is `auth.users.email`,
i.e. **the credential the person signs in with** — not a separate contact address. Nobody was asked,
and there is no opt-out. Measured 2026-08-25: 17 of 17 handles expose a login email, 7 expose a
phone, all enumerable by plain HTTP. Publishing a login identifier lowers the cost of credential
stuffing and phishing against our own users, and under GDPR it is personal data published without a
recorded basis.

**⏰ REVISIT TRIGGER — before real pharmacies onboard.** This was ruled while all 17 handles belong
to the team and demo accounts. It is **not** a ruling about outside users' personal data. If
reopened, start from the rejected option that fixes the credential problem without emptying the
cards: **a separate `contact_email` field**, published instead of the login address. (The other
rejected option — per-person toggles defaulting off — is safest but silently empties every existing
card until each person opts back in.)

**Surfaced by:** HEL-72, 2026-08-25.

## 2026-08-25 — a company-addressed deal is announced in the company's chat

**Partial supersede of `:1013`, the `deal_card` arm only** (ADR 0006, slug
`0023-deal-draft-lands-in-chat`). An inline marker sits beside `:1013` itself, because that is
where the reader arrives from five separate citations; this is the chronological record.

- **What changed.** `send_deal`'s company arm no longer calls `deliver_deal`. It resolves — or
  creates — the relationship's **c2c thread** and posts the same clickable `deal_card` pill its
  person arm has always posted to the p2p thread. **One mechanism now serves both arms**, and the
  fix was a **deletion**, not an addition. Company-addressed sends create **zero**
  `pending_inbox_item` rows. *Why:* the recipient previously had to know the Connection Requests
  page existed, find the ticket, then hunt for the matching conversation — the deal never signalled
  in chat at all.
- **The other three Connect CTAs are untouched.** `connect`, `connect_message` and
  `pricelist_request` still route to `/connect/inbox`, so `:1013` stands for them and the page is
  **not** being retired. *Why:* the inbox hop is today's consent step for those flows.
- **`deliver_deal` itself is untouched** and keeps its other caller
  (`confirm_detected_deal_births_negotiation.sql:176`, Sella's door). ⚠️ **The page-deletion slug
  must not delete `/connect/inbox` while that door still writes to it.**
- **ADR-0003:48-49's "FUTURE" clause is retired, not fulfilled here.** The `assigned_to` primitive
  it waited on was built in `20260607090002_phase1_core.sql:200` and company-addressed send has
  worked since 2026-07; the clause was discharged *with* the primitive. This ADR retires the
  routing it described.
- **Known and accepted:** the deal signal now rides on `msg_all`, which has **neither a `type` nor
  a sender predicate** — so a thread member can post a pill attributed to another person. The
  signal moved onto a weaker policy; **no policy was widened.** Tracked as **HEL-67**, disclosed in
  ADR 0006's invariant **J1**. *Why accepted:* the proper fix is an RLS change, which ADR 0006 §4.2
  put out of scope for this slug; filed rather than smuggled in.

## 2026-08-25 — HEL-81's scope grew mid-build to cover `deal_promotion`, not just `deal_line_item`

**What was decided.** HEL-81 was chartered to close one door: a relationship member INSERTing an
arbitrary `deal_line_item` row. The fix — `acceptPromotion` behind a SECURITY DEFINER RPC — was
correct but, on adversarial review, was found to trust `deal_promotion.offered_by_company`/
`.line_deltas` as its authorization input, while that table was still directly writable under the
same symmetric policy. A buyer could self-author a fake "seller" promotion (or rewrite the real
one) and accept it themselves — the exact class of hole HEL-81 exists to close, one table over,
created by HEL-81's own fix rather than pre-existing. Closed in the same ticket: `offerPromotion`/
`declinePromotion` also moved behind SECURITY DEFINER RPCs, `deal_promotion` also became
SELECT-only for `authenticated`.

**What was rejected, and why.** The security reviewer's own first suggestion — add
`AND offered_by_company IS DISTINCT FROM current_company_id()` to `accept_promotion`'s promotion
lookup — would have closed the self-INSERT variant in one line. Rejected because `deal_promotion`
also granted `UPDATE` under the same symmetric policy, so a buyer could still rewrite the seller's
*genuine* pending promotion's `line_deltas` before accepting it — the one-line fix does not touch
that path at all. A fix that closes one variant of a two-variant hole is not a fix.

**Why this was NOT filed as a separate follow-up ticket**, unlike HEL-81 itself (split from
DEV-159) or HEL-83 (split from HEL-81, filed the same session — see below). DEV-159→HEL-81 was a
pre-existing, independent gap that DEV-159's own fix didn't touch or worsen. This one is different
in kind: `accept_promotion`'s own design choice — trusting `deal_promotion` as authorization input
— is what made that table's pre-existing symmetric grants load-bearing for HEL-81's stated
property. Shipping HEL-81 as "closed" without it would have been true of the letter of the ticket
(direct `deal_line_item` INSERT, refused) and false of its substance (a relationship member can
still land an arbitrary line on a shared deal, in two calls instead of one).

**What WAS filed separately: HEL-83** — none of the three promotion RPCs gate on
`deal_card.status`, so a promotion can still be accepted onto an already-sealed (`done`) deal. This
one **is** the DEV-159→HEL-81 shape: pre-existing (the old client code had the same gap), not
worsened by this fix, and blocked on a product ruling (which statuses should still allow it) that
this ticket has no standing to make.

**Surfaced by:** HEL-81, 2026-08-25; independently confirmed by two review rounds (`critic` +
`security`, each run twice).

---

## 2026-08-25 — the Product Basket's addressee picker sends immediately; the drawer no longer opens the deal card first

**Supersedes the "drawer never sends" framing** carried in `basket/actions.ts`'s source comments
(the `basket/actions.ts` row of `ARCHITECTURE-NOTES.md`'s 2026-08-25 "`D-12` means four things"
entry — that addendum has the full detail; this is the decision record). Found live during
`/ship 0023`'s G5 walk (Muskan): picking a recipient in the basket, then "Create a draft deal",
navigated into the newly-opened deal card with a separate "Send deal" click still required — the
picker gave no visible confirmation the deal had gone anywhere, and the card auto-opening read as
an extra, unwanted step for what the picker already fully specified.

**Ruling:** `createBasketDraft` (the one seam onto the deals domain from both basket doors — the
buyer's connected-seller group via `CounterpartyPersonSelect`, and the seller's own-company group
via `RecipientPicker`) now calls `sendDeal` immediately after `createDeal`, in the same server
action. `BasketDrawer.tsx` no longer navigates into `dealChatUrl`; the basket just closes. The
button is relabelled "Send deal" (was "Create a draft deal") to match.

**What did NOT change:** `send_deal` is still the only place delivery happens — the flip to
`negotiation`, the counterparty co-owner insert, and the chat announcement, all in one transaction,
routed to the p2p thread for a person or the c2c thread for the whole company. Nothing about that
routing moved; HEL-63/HEL-64/HEL-65's own G4 walks of it stand. What moved is *when* `sendDeal` is
called for this one door — immediately, not from a later separate human click in the deal card. The
OTHER creation door (the chat's own "Start a deal" button, `deal-c2c-create.spec.ts` /
`deal-p2p-send.spec.ts`) is unaffected: birth and send stay two separate steps there.

**Also closed while here — HEL-76's gap.** No e2e test had ever driven the basket's own picker into
an actual send; `send_deal`'s p2p-vs-c2c routing was proven only through the other creation door.
Added: `deal-lands-in-c2c-chat.spec.ts`'s "a PERSON-addressed deal (picked in the basket)..." test,
which is what actually caught nothing was broken in `send_deal` itself — the routing was always
correct; the missing piece was the confirmation step.

---

## 2026-08-25 — HEL-82's admin surface lives at `/admin/relationships`, not `/connect/relationship`; `relationship`'s RLS is untouched

**Reversed mid-session.** The first draft reused the ordinary `/connect/relationship/[id]` page for
HS-team suspend/reactivate/end controls (per the standing instinct: don't build new UI when an
existing page can absorb the change) and broadened `rel_all`'s RLS with `OR is_hs_team()` so a
companyless HS account could load it.

**Ruling, after `critic` + `security` review:** that page is unreachable by the seeded HS account
regardless of the RLS change — the whole `/connect` tree sits behind `requireVerified()`, which
redirects a companyless account to `/onboarding` before the page ever runs. The alternative fix
(give the HS operator a real company) would have turned three other relationship readers
(`messaging/supabase/store.ts`, `messaging/supabase/connections.ts`, `basket/supabase/reads.ts`)
into cross-tenant leaks, since none of them has an explicit membership check — they lean on RLS
alone. Full trace in [[L-059]], `docs/agents/LEARNINGS.md`.

**What shipped instead:** a new `/admin/relationships` queue, same `is_hs_team()`-gated shape as
the existing company-verification queue, backed by a dedicated `list_relationships_admin()`
SECURITY DEFINER read. `rel_all` carries no RLS or grant change — `relationship` is exactly as
narrow after this ticket as before it.

**Also decided here:** HEL-82's shipped scope is "new deals" only (`send_deal` +
`confirm_detected_deal`, both gated — see [[L-058]]). Its own acceptance criteria also promises
blocking new chat messages and new pricing asks; neither gained a check. Filed as **HEL-84** (High)
rather than folded in — the ticket was already large, and this needs its own design pass on
`msg_all`/`inbox_insert`, not a rushed extension. HEL-82 stays **In Progress**, not Done, until
HEL-84 lands.

---

## 2026-08-25 — the checker loop stops on SEVERITY, not on a blocker count

**Supersedes one clause of** *"2026-08-14 — Pipeline dry-run executed on the tier ladder"*
(its **Pipeline process locks** bullet). Superseded by name, not by line number — that entry
sits above this one and its line numbers move whenever anything is inserted before it.

**What was decided.** The checker loop now stops at the first round that raises **no new
finding on rungs 1–3 of the severity ladder** — leak · silent failure · won't run. The ladder
is defined once, in `docs/agents/PIPELINE.md` §10, and mirrored verbatim into the four checker
agents. Rungs 4–5 — behavioural edge, contract/wording — are `note`: still reported, still
surfaced to Muskan at the gate, but they no longer hold the fix-loop open.

**What it replaces.** The 2026-08-14 lock said *"ship to the human gate on the first round
with **zero NEW blocking findings**."* **That state never once occurred.** The dry-run's own
series was findings 11·15·15·14·15·14·12 and blockers 5·8·4·6·6·8·4 across seven rounds, and
eight consecutive tickets on slug 0022 hit the 2-round cap. A condition that has never been
met in ~15 attempts is not a strict rule — it is a rule that silently converts a budget into
an automatic escalation, which is most of what made a feature cost ~22 rulings.

**Why severity is the right axis.** The dry-run measured it and wrote it down: find-rate is
**flat** (~14/round regardless of artifact quality — a fresh agent handed a long ADR will
always find about fourteen things), while **severity decays**: *"leaks → silent failures →
won't-run → behavioural edges → contracts/wording."* The old rule counted the axis that does
not move. This one reads the axis that does.

**The root cause was not the rule, it was a missing owner.** Four agents emitted `blocking`
— `adr-checker`, `plan-checker`, `security`, `critic` — and **only `critic` defined it**, and
only as of this same day. The stopping rule was counting a word with four private meanings.
The ladder now has one owner and four declared mirrors; the mirroring is deliberate, because
an agent file is a system prompt and a threshold the checker does not hold in context is a
threshold it will not apply.

**What did NOT change.** The 2026-08-14 lock's other three clauses stand, unamended and
re-affirmed: the checker runs as a genuinely **fresh, separate-context** agent, never the
author re-reading their own work · revisions carry a **simplification bias**, preferring the
fix that removes a mechanism over the one that adds it · checker findings are **claims to
spot-verify**, not verdicts.

**Risk accepted.** A finding mis-rated down to rung 4 or 5 stops blocking the loop. It does
not stop being reported — every note reaches the gate. The mitigation is that the ladder is
anchored to the dry-run's own measured severity classes rather than to fresh judgement, and
the agents are told explicitly: *do not promote a rung-4/5 finding to `blocking` because it
feels important; say so in the note instead.*

## 2026-08-27 — HEL-84's client-controlled-type exploit gets fixed properly, not downgraded

**What was decided.** `security`'s post-build review of HEL-84 found the four-type
`announceDealEvent` exemption in `msg_all`'s `WITH CHECK` was keyed on `chat_message.type`, a
column `authenticated` can set to anything — live-proven exploitable: a thread member on a
suspended relationship bypassed the entire write gate by mislabeling an ordinary message's
`type` as one of the four exempt values. Offered two paths: fix it properly (move the
exemption into a `SECURITY DEFINER` RPC, closing the client-facing door entirely) or downgrade
PRD AC2/AC8's enforcement claim to "UI friction, not a security boundary" and ship as-is.
**Decided: fix it properly.**

**Why.** This repo has already solved the identical shape twice — HEL-67 Gap 1 refused a
forgeable `type` outright rather than trying to distinguish real system rows from forged ones
by column value, and 0024's `send_deal` refactor moved its own chat pill into a definer RPC for
the same reason. A third instance of "a client-writable column decides whether RLS lets a write
through" is a pattern, not a one-off — downgrading the AC would have shipped a compliance
control the PRD describes as enforcement while it was actually decorative.

**What it cost.** Real new scope beyond the 6-round-checked plan: a new RPC with its own
authorization (2 more `plan-checker` rounds to converge), deleting the old client-side
`announceDealEvent`/`resolveActorName` helpers, rewiring four call sites. The fix's own
follow-up `security` re-check then found a second gap in the new RPC itself (a dropped
deal-workspace-membership check) — also fixed, independently reproduced closed. Total: the
slug's build stretched across roughly a full session past what the original converged plan
implied.

**What did NOT change.** The underlying product ruling — these four system-authored types stay
exempt from the suspension gate (ADR 0008 Invariant 16, "an event already in motion is not a
new write") — is untouched. Only the mechanism moved, from a client-facing carve-out to a
server-side one.

---

## 2026-08-31 — Connection Request page retires; all four request types settle in Discover's accept gate, no ticket/claim system for MVP

Follows from the shop→chat simplification (browse any Discover shop, add products, send to a
company/person in chat) and MVP's single-person-per-company reality.

- **Accept gate is KEPT for unconnected sends** (pricing asks, deals) — reaffirms Marcel's
  2026-06-10 closed/consent directive. Sending a product ask or a deal to a company you're not
  yet connected to still needs an explicit accept before a chat thread exists; it does not
  auto-connect on send.
- **Claim/assign/reassign/history retire.** MVP is one person per company on both sides, so the
  team-ticket-ownership model (`/connect/inbox`'s lenses, `assigned_to`, admin reassign) has no
  one to distinguish between — whoever's on the receiving side accepts directly.
- **Discover's `RequestsSection`** (built 2026-07-23 for `connect`/`connect_message`, see `:1435`)
  **becomes the one accept/decline surface for all four request types**, extended to also carry
  `pricelist_request` and `deal_card` tickets — both currently excluded on purpose
  (`companyRequests.ts`'s query filter and `RequestsSection`'s own "out of scope" note).
  `deal_card` acceptance runs a different function (`claim_deal_ticket`) than the other three
  (`acceptItem`) — `inbox.ts:287-290` — so folding it in means branching on type at accept-time,
  not just widening a filter.
- **`/connect/inbox` and its module** (InboxView, LensTabs, InboxList, InboxDetail, lenses.ts,
  claim/assign functions) retire once `RequestsSection` covers the other two types — **not
  before**: Sella's `deliver_deal` (via `confirm_detected_deal_births_negotiation`) is still the
  one live door writing `deal_card` tickets there today (per the 2026-08-25 warning at `:1935`).
- **Home's proposed deal-claim board** (2026-07-23, `:1440`) **is dropped for MVP** — moot without
  multiple people per company to claim against. Revisit if a company ever has more than one team
  member.

---

