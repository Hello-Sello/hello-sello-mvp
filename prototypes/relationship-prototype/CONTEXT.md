# Relationship page (screen ③) - full context & decision narrative

> **Why this file exists:** `NOTES.md` is the spec (what the prototype does). This file is the **decision log** -
> every choice we made designing screen ③ *and the reasoning behind it*, so the story survives the session.
> LOCKED 2026-06-07 (Ayush + Claude). Prototype: `index.html` (port 8771).

The Relationship page is the persistent record between two companies - what Marcel called "the heart of the
platform." Third atom in the Connect build order: ① Deal card → ② Chat → **③ Relationship page** → ④ Deal Workspace.

---

## 1. Navigation - reached from a chat, not a tab (supersedes DECISIONS.md:518)

- **No `Relationship` tab and no `Deals` tab** in the Connect sub-nav. The sub-nav is just `Chat · Inbox`.
- The page is reached **contextually from a conversation**: from a **P2P chat** or a **C2C chat** (both via a
  "Relationship" affordance). **Why:** a relationship exists *with a person or a company*, so you reach it through
  the person or the company you're already talking to - the chat is the index, the page is the detail (WhatsApp /
  Front pattern). A flat "all relationships" directory/filter is **future**, not now.
- **One page, two doors.** P2P and C2C both open the **same company↔company page**. **There is NO person-level
  relationship page.** *This answers DEV-8's never-closed sub-question (P↔P relationship page?) = NO.* The old
  Linear ambiguity was confusion at the time; this is the truth now.
- **Deals as a sub-nav tab is gone for good** - deals live *inside* the relationship page, and a cross-company
  "Deals" surface moves to a **future Grow/Trade** surface.

## 2. The organizing law - "two altitudes"

Every piece of content answers one question: *is this about the **relationship** or about **one deal**?*
- **Relationship-level (this page):** header, Sella insight, analytics, log, notes, terms, pricelist, artifacts.
- **Deal-level (the deal card / inside the deal):** per-deal signals (card back), per-deal documents (COAs, badges).

This single rule decides where everything goes and is what keeps a rich page from becoming a junk drawer. It also
made **Layout C (tabbed)** possible: the top band is the stable "relationship" view; the tabs are zoomed-in detail.

## 3. Content set (locked)

Top band: **Relationship header** · **Sella insight** · **Analytics** (Sella + Analytics sit *side by side*).
Tabs: **Overview** (log + deals peek) · **Deals** · **Notes** · **Terms & prices** · **Docs**.
- **Header** = the two company logos joined by a **bridge mark** (line · dot · line; never `//` or `=` - `//` is
  the Hello Sello brand mark). **No person names** - it's a company-to-company connection.
- **Deals** = NOT dumped inline. A peek on Overview + the **Deals tab**: filter `All / Active / Old / Cancelled`
  → click a deal → **Open workspace** (screen ④). Progressive disclosure, same instinct as the chat's card pill.
- **Notes = two different jobs, not duplicates:** a per-side **Team note** (business, shared with your company -
  "their next batch lands in ~4 months") and a per-user **Personal note** (private to you, relationship upkeep -
  "their kid's birthday is in 4 days"). Resolves the "which box?" worry by purpose.
- **Agreed terms** (both sides) · **Custom pricelist** (both read; seller writes, gated by Proposed→sign-off→Applied).
- **Artifacts** = a shared folder of **company-wide** documents (licenses, contracts, GDP certs). **Deal-wise docs
  (COAs, badges) stay inside the deal** - the two-altitudes rule applied to documents.

## 4. The box → dialog pattern (Ayush, 2026-06-07)

Sella insight and Analytics are **overview boxes** with a "more" button that opens a **dialog with a blurred
backdrop** (open → read → close, like the Claude settings modal). **Why:** keep the page calm; push depth one tap
away. This is now the app's third use of the same progressive-disclosure grammar (deal-card pill → flip dialog;
deals button → list; box → detail dialog) - the repetition is what makes it feel like one system.
- **Sella dialog** = "what's happening" (relationship facts) + "how to grow this relationship" (action cards:
  send the Q4 framework, nudge a restock, upsell). Relationship-level - distinct from per-deal card-back signals.
- **Analytics dialog** = a mini analytics page: KPIs + bar charts (by deal / quarter / status) + a pie (share by
  deal) + a takeaway. MVP shows cheap live stats; richer trends/margins/forecasts later.

## 5. Side-awareness - the page is a per-viewer projection

The same relationship renders differently by **side** and by **user**: the per-side team note hides across the
boundary, **PRIVATE deals hide from the other side** (supplier sees €80,500 incl. the private Q4 draft; buyer sees
€49,500 without it - reflected in both the analytics box and the dialog), and only the **seller** edits the
pricelist. The `Seeing as: Supplier | Buyer` demo toggle flips all of it. The mock DB shows the underlying truth
(`note.side`, `note.scope`, `deal.private`); the UI is the projection.

## 6. Deferred / parked (decided, not now)

- **First-contact document collection** (the old "pending inbox migrates onto the page" flow): not a highlight,
  deferred. If built later it lives in the **Inbox** (possibly a toggle), and whatever docs it gathers land in
  **Artifacts**. The old P↔C-based migration framing is dropped (P↔C was folded into C2C on 2026-06-06).
- **Agreed-terms edit workflow** + **multi-approver pricelist sign-off** - deferred per DEV-41.
- **"Open workspace →"** opens screen ④ (not built yet). **Richer analytics** (real trends/forecasts) - later.
- A flat **all-relationships list / filters** - future.

## 7. Doc drift to reconcile (docs pass)

- **DECISIONS.md:518** ("Connect sub-nav: drop Companies, add Relationship; Deals tab undecided") is **superseded**
  by §1 above (no Relationship/Deals tabs; reached from chat).
- **DEV-8** open sub-question (person↔person relationship page) is now **answered: there is none** (§1).

---

*Built across one session (2026-06-07) with Ayush, on the decided Connect shell (consistent with
connect/chat/dealcard). Verified in Claude Preview (all states, both sides, both dialogs, no console errors).
Throwaway - the decisions above are the keep; the HTML is disposable.*
