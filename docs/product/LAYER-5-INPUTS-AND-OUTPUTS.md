# Layer 5 — Inputs and Outputs

**Status:** IN PROGRESS. Drafted 2026-05-22.

This layer defines what enters Hello Sello (channels: chat, email, attachments, third-party data) and what leaves it (deal confirmations, POs, off-platform PDFs). It also covers the translation layer that converts unstructured external input (an email, a PDF, a chat message in another language) into structured Deal Card fields, and the third-party integrations that bring external data into the platform.

Layer 5 is the I/O boundary. Everything beyond this line is "outside the platform" - Layers 1-4 own everything inside it.

---

## 1. Purpose & Scope

**What this layer covers:**
- Every channel through which data enters Hello Sello (chat, email, attachments, scraped seed data).
- Every artefact the platform produces and sends out (deal confirmations, purchase orders, PDFs for off-platform buyers).
- The translation/normalization layer that converts unstructured external input into structured platform objects (Deal Cards, etc.).
- Third-party integrations that supply data (FLOWZ, future ERPs).

**What this layer does NOT cover:**
- The internal lifecycle of a deal once it's been ingested - that's Layer 1 (structure) and Layer 3 (execution).
- Sella's behavior in processing inputs - that's Layer 4.
- UI surfaces that display ingested data - that's Layer 2.

**Beachhead constraint:** All decisions here are scoped to the German medical cannabis MVP. Anything marked POST-MVP is deferred until after launch.

---

## 2. Inputs

The channels through which information enters Hello Sello.

### 2.1 In-app chat
The primary input channel. Covered in detail in Layer 1 (Section 3) and Layer 4 (Sella's behavior). Both P↔P and C↔C chat. Sella reads chat in real time and surfaces deal-forming signals.

### 2.2 Email
**MVP. Human-in-loop.**

Workflow:
1. Email arrives at a connected mailbox (forwarded or directly addressed to a Sella-managed address).
2. Sella reads the email content.
3. Sella **pre-fills a Deal Card** with extracted fields (products, quantities, prices, dates, buyer/seller, terms).
4. The salesperson reviews the pre-filled card in Hello Sello - edits, accepts, or rejects.
5. Card lifecycle proceeds normally from there (Draft → Confirmed).

Sella never auto-sends or auto-finalizes. The human is always in the loop for emails.

> **⚠️ OPEN [DEV-60]** - exact pipeline design: which mailbox(es), forwarding rules, how attachments in emails are handled, multi-thread tracking.

### 2.3 Attachments (COA / COB / other documents)
**MVP. Store only. No parsing or validation.**

When a supplier uploads a Certificate of Analysis (COA), Certificate of Brand (COB), or other document, the platform stores the file and links it to the relevant product. The platform does NOT parse the file content, validate the values, or enforce compliance rules in MVP.

The link is: `Product → Attachments[]`. Files appear in the deal workspace when that product is part of a deal. Future versions may add parsing and validation; out of scope for MVP.

### 2.4 FLOWZ scrape (seed data)
**MVP, contingent on GDPR check.**

FLOWZ is a public website with cannabis market data (companies, products, pricing context). The plan: scrape FLOWZ on a schedule and pre-populate Hello Sello with:
- Supplier profiles (so suppliers signing up find their company already exists and can claim it)
- Product catalogs (so buyers don't land on a blank screen)

**Purpose:** Lower cold-start friction on both sides. Suppliers see "your data is here, claim it." Buyers see a populated marketplace from day one. It's a marketing / sales accelerator more than a product feature.

> **⚠️ OPEN [DEV-62]** - is scraping FLOWZ to pre-populate company and product data GDPR-compliant? Must resolve before building this.

### 2.5 Fax
**POST-MVP. Not in scope for first release.**

German medical cannabis still runs heavily on fax. Acknowledged as a real channel but deferred - first release focuses on the email + chat pipeline. Revisit after MVP launch.

### 2.6 ERP (Isilocity, others)
**POST-MVP. Not in scope for first release.**

ERP integrations (starting with Isilocity, which the team has confirmed) are deferred. Pre-MVP, suppliers and buyers operate Hello Sello as a standalone tool; ERP sync comes later.

---

## 3. Outputs

What the platform generates and sends out.

### 3.1 Deal confirmation
**MVP.**

When a deal reaches the **Confirmed** state (both parties have accepted the Deal Card terms - Layer 1 lifecycle State 2 → State 3), Hello Sello auto-generates a deal confirmation. Delivered to both parties via email and visible inside the platform.

Contains: deal summary (products, quantities, agreed prices, delivery terms, acceptance timestamps).

### 3.2 Purchase Order (PO)
**MVP.**

Auto-generated from a Confirmed Deal Card. The PO is a structured artifact (PDF + machine-readable) suitable for downstream procurement systems.

> **⚠️ OPEN [DEV-61]** - exact PO format spec: which fields, layout, language, machine-readable schema (XML / JSON / XRechnung for Germany?), download vs. email delivery.

### 3.3 Email to off-platform buyers
**MVP.**

When a deal is sent to a buyer who is NOT on Hello Sello, the buyer **never sees a Hello Sello UI**. The interaction is email-only:
- Hello Sello sends a regular email containing:
  - Deal summary as an inline table
  - PDF attachment (full deal artifact)
  - **Hello Sello banner ad** at the bottom (marketing prompt to join)
- The off-platform buyer **replies by email** in plain words ("yes" / "no" / counter-offer terms).
- Sella reads the reply via the email pipeline (§2.2), pre-fills a Deal Card update, the salesperson reviews and acts.

**No "click accept" mechanic, no read-only Deal Room link, no auto-acceptance in MVP.**

**Connection on signup (manual, with smart suggestions):**
If the off-platform buyer later signs up via the banner, Hello Sello does **not** auto-connect them to past contacts. Instead, on signup, the new user sees a list of companies that already have email/deal history with their address ("X companies already have you in their records - connect to start trading") and **manually picks** which to connect to. Same UX pattern as "friends already on Facebook" / LinkedIn's "connections to import."

> **⚠️ OPEN [DEV-63]** - smart-suggestions UX details: timing (onboarding step vs persistent banner), fields shown per suggestion, skip-all flow.

### 3.4 Deal Room shareable link
**POST-MVP.**

The Deal Room is a presentation surface on the **Present** page (Big 7) where a seller assembles products and pitches a deal visually. In a later release, a Deal Room will be shareable as a link to an off-platform buyer, who can view the presentation and click to accept. This is the flow the Marcel 2026-05-16 meeting referred to as "auto-acceptance on pickup." Deferred to post-MVP; the MVP off-platform flow above (§3.3) is the only way to reach off-platform buyers in first release.

---

## 4. Translation Layer

Hello Sello must convert unstructured external input into structured platform objects, and translate between languages.

### 4.1 DE ↔ EN chat translation
**MVP.**

Per the 2026-05-16 Marcel meeting: instant chat translation is a key feature for global trade. Implementation note from that meeting: use **local models** the user can download to handle basic translation without consuming tokens.

Example flow: a German pharmacy writes in German; the Canadian distributor receives the message in English. Reply written in English; the pharmacy reads it in German. Cross-language deals work seamlessly.

### 4.2 Unstructured → structured
Sella's job. When an email or chat message arrives, Sella extracts structured Deal Card fields (products, quantities, prices, dates, terms) from the free-form text. Covered in detail in Layer 4 (Sella behavior).

---

## 5. Third-Party Integrations

### 5.1 FLOWZ
**MVP, pending GDPR (cross-ref §2.4, DEV-62).**

FLOWZ scrape → seed supplier and product data on the platform. Suppliers can "claim" their pre-populated profile on signup. Scheduled scrape, not real-time.

### 5.2 Isilocity (ERP)
**POST-MVP.**

The team has identified Isilocity as the first ERP integration. Deferred to a later release.

### 5.3 Other ERPs
**POST-MVP.**

Future integrations driven by customer demand. No commitments in MVP.

---

## 6. What Layer 5 Does NOT Cover (Hard Non-Goals for MVP)

- **Fax processing** - deferred post-MVP.
- **COA / COB content parsing or validation** - store only.
- **ERP read/write sync** - deferred post-MVP.
- **Bulk import via spreadsheet / CSV uploads** - not yet scoped.
- **API-based programmatic access** from buyer's or seller's own systems - deferred post-MVP.

---

## 7. Open Questions

| Section | Question | Linear |
|---|---|---|
| §2.2 Email | Exact pipeline: mailbox setup, forwarding rules, attachment handling, multi-thread tracking | [DEV-60](https://linear.app/hellosello/issue/DEV-60) |
| §2.4 FLOWZ | Is scraping FLOWZ GDPR-compliant? | [DEV-62](https://linear.app/hellosello/issue/DEV-62) |
| §3.2 PO | Exact PO format spec (fields, layout, schema, delivery) | [DEV-61](https://linear.app/hellosello/issue/DEV-61) |
| §3.3 Smart connect | Suggestion UX on signup: timing, fields, skip-flow | [DEV-63](https://linear.app/hellosello/issue/DEV-63) |

---

*End of Layer 5.*
