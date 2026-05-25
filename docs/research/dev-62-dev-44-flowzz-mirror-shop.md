# DEV-62 + DEV-44: FLOWZZ Mirror-Shop — Legal Risk Analysis (Research Note)

> **DISCLAIMER:** This is internal research for build-decision purposes, **NOT legal advice**.
> Final go/no-go requires sign-off by a German IT/data-protection lawyer with cannabis-sector experience (suggested: a Kanzlei combining Apothekenrecht/Medizinrecht with IT-Datenschutz — e.g. Taylor Wessing, Heuking, Osborne Clarke, or boutiques such as Spirit Legal or HK2).
>
> **Closes:** [DEV-62](https://linear.app/hellosello/issue/DEV-62), [DEV-44](https://linear.app/hellosello/issue/DEV-44)
> **Status:** Research complete. Decision-lock (DECISIONS.md) deferred to follow-up after counsel review.
> **Date:** 2026-05-24
>
> **Methodology + verified-source caveat:**
> - FLOWZZ-specific recon (Section 1) is live-verified via WebFetch of flowzz.com, alphaflowz.com, and the FLOWZZ robots.txt.
> - The general legal analysis (Sections 2–5, 7) is grounded in established German doctrine. **Case citations should be docket-verified by counsel** before being relied upon in a formal memo — items marked `[verify]` are drawn from training knowledge of well-known rulings and have not been live-checked against juris/beck-online in this session.
> - Choco-specific litigation research (Section 6) hit a real limit: no public lawsuits surfaced via targeted English+German searches. The most informative finding was Choco's *own* legal architecture (data-processor model + outsourced DPO), discussed in Section 6.
> - General UWG §7 enforcement context (Section 4) is corroborated by current-year law-firm commentary cited in Section 10.

---

## Executive Summary

| Stage | Verdict | One-line reason |
|---|---|---|
| **(a) Scrape FLOWZZ** | **AMBER → leaning RED on database right** | §87a UrhG sui generis database right is the bite; CJEU **Innoweb v Wegener** (C-202/12) treats "mirror" architecture as the paradigm forbidden case. §202a StGB low risk (public pages, robots.txt allows crawl). |
| **(b) Store as "unverified shops"** | **AMBER** | Survivable under DSGVO Art 6(1)(f) **only if** Art 14 transparency notice + Art 17 one-click erasure are wired in *before* launch. Art 14 is a hard obligation, not a balancing test. |
| **(c) Outbound cold email** | **RED as currently designed** | UWG §7(2) Nr. 2 is a *per-se rule*, not a balancing test. No legitimate-interest escape. The "Hello-Sello-as-courier" defence is fragile under Störerhaftung — both originator AND technical sender can be jointly liable. |

**Binding constraint:** Stage (c) — UWG §7 strict prior-consent rule for B2B email in Germany.
**Secondary constraint:** Stage (a) — §87a UrhG database right (Innoweb-controlled).
**Cannabis-specific sleeper:** **HWG §10** prohibits Publikumswerbung for prescription-only medicines. Any public-facing display of medical-cannabis product catalog data (strain name, THC/CBD, packshot, price) is a separate RED, regardless of (a)/(b)/(c).

**Recommended path forward (for discussion with user, not a build/don't-build verdict):**

The legal exposure analysis below should be read as the **BATNA that makes a commercial deal with FLOWZZ cheaper than litigation**. Three parallel tracks deserve to be opened before any commit to building:

1. **Approach FLOWZZ commercially** — data-licensing partnership + supplier-consent program mediated by FLOWZZ. This is the gold standard: it eliminates §87a UrhG, eliminates UWG §4, and converts stage (c) cold outreach into consented outreach.
2. **If scraping proceeds anyway:** ruthlessly narrow scope. Strip pricing, SKU-level product catalog, named-individual contacts. Keep only company existence + address + license number (sourceable from BfArM public register, not FLOWZZ).
3. **Restructure stage (c)** so Hello Sello is genuinely a routing courier (buyer-domain sender, no editorialisation, full Art 14 notice in every email). Even then, expect Abmahnungen.

---

## 1. FLOWZZ Recon (Live-Verified)

### 1.1 What FLOWZZ actually exposes

| Surface | Data exposed publicly | Login required? |
|---|---|---|
| `flowzz.com` homepage | Product cards: strain name, manufacturer (Aurora / Demecan / Cansativa / avaay), THC/CBD %, price/g, pharmacy attribution | No |
| `flowzz.com` footer "Business" section | Links to **Hersteller & Importeure** (manufacturers/importers), **Internationale Anbauer** (international growers), **Market Report** | No |
| `flowzz.com/account` | Account area | Yes (and blocked by robots.txt) |
| `alphaflowz.com` (B2B sibling, targets pharmacies) | Products visible (strain, THC/CBD, price, availability); cart gated | Cart needs auth, browsing does not |
| `flowzz.com/sitemap.xml` | Full sitemap published | No |
| Impressum / AGB / Datenschutz | Visible | No |

**Sample product data shape (from homepage):**
- Strain: *Siggis WBLT 22:01*
- Manufacturer: *Demecan*
- THC: 22.0% / CBD: 1.0%
- Price: *ab 8,76 € / 1g*
- Strain type: Sativa-dominant / Indica / Hybrid
- User review count

### 1.2 Crawl posture

**robots.txt:**
```
User-agent: *
Disallow: /account
User-agent: *
Allow: /
Host: https://flowzz.com
Sitemap: https://flowzz.com/sitemap.xml
```

Effectively: **FLOWZZ explicitly permits crawling** of everything except `/account`. This is load-bearing for two parts of the legal analysis:
- **§202a StGB** drops to near-zero risk (no Zugangssicherung to circumvent).
- **UWG §4 Nr. 4** competitor-obstruction weakens (FLOWZZ has not posted a `Disallow` signal against scrapers, undermining any "knowing circumvention" argument).

It does **NOT** weaken §87a UrhG database-maker rights. Permission to read ≠ permission to copy-substantially-and-re-utilise.

### 1.3 What Hello Sello's "mirror shop" would actually mirror

Reconciling with the product vision: FLOWZZ exposes **manufacturer-level data** (Aurora, Demecan, Cansativa, avaay) as a denormalised field on products, plus pharmacy-level attribution on pricing. The "Hersteller & Importeure" footer section is where the manufacturer-side directory lives.

For Hello Sello's stated use case — "mirror Aurora's shop, with their products + pricing + email" — the scrape target is:
- Manufacturer name + (presumably) address from the manufacturer profile pages
- Per-manufacturer product list (strains they produce)
- Per-product THC/CBD/packaging
- Pricing context (cheapest pharmacy + price/g)
- Contact email (if exposed on manufacturer profile)

**Sister site `alphaflowz.com`** is more B2B-focused but does not visibly expose a manufacturer directory either. Both sites appear to operate the same underlying database under two brands.

**The user's product mental model is consistent with what FLOWZZ exposes.** No re-scoping needed.

---

## 2. Stage (a) — Scraping FLOWZZ

### 2.1 DSGVO / GDPR scope

**Is FLOWZZ data "personal data" under Art 4(1) DSGVO?**

- Company name + address + KG/GmbH legal form → **not** personal data (legal person, not natural).
- Generic role mailbox (`info@aurora-cannabis.de`) → **borderline**. Dominant EDPB / BfDI view: not personal data *unless provably routed to a single identifiable natural person*. Safer to treat as personal data by default. `[verify with most-recent BfDI guidance]`
- Named individual contact (e.g. `Dr. Müller, Geschäftsführer, m.mueller@aurora.de`) → **personal data** per Art 4(1) and EDPB guidance. Settled.

**Art 6 lawful basis:**
- 6(1)(a) consent — not available, no opt-in collected.
- 6(1)(b) contract — not available, no contract with supplier.
- 6(1)(c) legal obligation — none.
- **6(1)(f) legitimate interest — the operable basis.** Three-step test: (i) legitimate interest of Hello Sello (commercial — qualifies but weak), (ii) necessity (fails if FLOWZZ licensing alternative exists), (iii) balancing against data subject's reasonable expectations.

The balancing test (iii) is the killer even at the scraping step. The EDPB and German DPAs have held that data subjects do **not "reasonably expect"** their publicly-listed contact data to be aggregated into a competing commercial product.

**Verdict — DSGVO on scraping itself:** AMBER. Defensible for company-level data; risky for named-individual fields.

### 2.2 §87a UrhG (German Sui Generis Database Right) — DEEP DIVE

This is the **most concrete civil-law exposure** for stage (a) and merits the most detail.

**Statute (§87a Abs. 1 UrhG, paraphrased):** A database is a systematic/methodical collection of data, individually accessible by electronic means, *whose procurement, verification, or presentation required a qualitatively or quantitatively substantial investment*. The database maker (Datenbankhersteller) has the exclusive right under §87b UrhG to reproduce/distribute/communicate the database **in whole or in a qualitatively or quantitatively substantial part**, AND to prohibit **repeated and systematic reproduction or re-use of non-substantial parts** if this conflicts with normal exploitation or unreasonably prejudices the maker's legitimate interests.

**Does FLOWZZ qualify as a protected database?**

Very likely yes. The "wesentliche Investition" prong is read broadly:
- Procurement investment (sourcing prices from 300+ Apotheken, daily refresh, manufacturer-feed integration) → counts.
- Verification investment (license-status checks, EU-GMP, strain accuracy) → counts.
- Presentation investment (search/filter UI) → counts only insofar as it supports use of the data (CJEU **BHB v William Hill**, C-203/02, 2004 `[verify]`).
- Critical exclusion (William Hill rule): investment in *creating* the underlying data doesn't count. FLOWZZ passes — it aggregates third-party manufacturer data, doesn't create the products.

**If FLOWZZ is protected, does Hello Sello's scrape infringe?**

A "mirror shop" by definition reproduces a "qualitatively or quantitatively substantial part" of each company's record. **Yes.**

Even if individual scrapes were "non-substantial" per request, the **systematic and repeated** scraping clause (§87b Abs. 1 Satz 2) catches scheduled scrapers explicitly. Two controlling authorities:
- **CJEU C-202/12 — Innoweb v Wegener** (19 Dec 2013) — **THE controlling authority**. An operator running a "dedicated meta search engine" that re-presents a protected database in real time **re-utilises the whole or a substantial part** within Art 7(2) of Directive 96/9/EC (transposed as §87a–e UrhG). This is directly on point for "mirror shop" architecture.
- **BGH I ZR 290/02 — Hit Bilanz** (2005) `[verify docket]` — systematic small extractions of music chart data infringed §87b.

**Relevant German + EU case law:**

| Case | Holding | Relevance |
|---|---|---|
| CJEU C-203/02 — **BHB v William Hill** (2004) | Investment in *creating* underlying data does not count toward database protection | Boundary; FLOWZZ passes |
| CJEU C-202/12 — **Innoweb v Wegener** (2013) | Mirror/meta-search of protected DB = re-utilisation | **Controlling for "mirror shop"** |
| CJEU C-30/14 — **Ryanair v PR Aviation** (2015) | If DB doesn't qualify under sui generis, maker has only contract remedies | Don't rely on this — assume FLOWZZ qualifies |
| CJEU C-490/14 — **Verlag Esterbauer** (2015) `[verify]` | Affirms broad definition of "database" | Strengthens FLOWZZ's position |
| BGH I ZR 290/02 — **Hit Bilanz** `[verify]` | Systematic small extractions infringe | Catches scheduled scrapers |
| BGH I ZR 145/05 — **Online-Telefonbuch** `[verify]` | Re-utilisation of phone-directory data | Analogous to manufacturer directory |
| BGH I ZR 39/08 — **Paperboy** `[verify]` | Linking is OK; copying into own DB is not | Mirror = copying |
| BGH I ZR 11/03 — **Mitwohnzentrale.de** (2003) `[verify scope]` | Early meta-search ruling | Background |

### 2.3 §202a StGB (Ausspähen von Daten)

**Statute:** §202a StGB criminalises unauthorised access to data "*die nicht für ihn bestimmt und die gegen unberechtigten Zugang besonders gesichert sind*" — data not intended for the actor AND specially secured against unauthorised access.

**"Besonders gesichert" is the gate.** Plain public web pages with no authentication, no IP blocking, no captcha, no token are generally **not** specially secured. FLOWZZ's robots.txt `Allow: /` is affirmative permission — the public-availability element fails.

**Modern Solution (OLG Hamm 2024)** `[verify docket]`: the recent high-profile case involved client-side hardcoded credentials, not public-web scraping. NOT applicable here.

**Verdict — §202a StGB:** **GREEN** on public FLOWZZ pages with no auth/bypass. Promotes to AMBER/RED instantly if Hello Sello bypasses any anti-bot mitigation (Cloudflare challenge, rate-limit blocks, captchas added later, paid-tier login for premium data).

### 2.4 FLOWZZ ToS / Browse-wrap

In Germany, "browse-wrap" ToS (link in footer, no click-through assent) are generally **not** validly incorporated under §§305 ff. BGB. A scraper that never opens the ToS page is unlikely to be contractually bound.

But:
- **Click-wrap** (registration with checkbox) IS binding. Behind-login scraping → contract-bound.
- A clearly-posted anti-scraping clause may feed into **UWG §4 Nr. 4** competitor obstruction analysis.
- Per Ryanair v PR Aviation: if §87a UrhG protection fails, contract is the database maker's main weapon. FLOWZZ has incentive to assert binding.

**Verdict — ToS:** AMBER. Low risk for unauthenticated browse-wrap; published anti-scraping clause hardens the §4 UWG and §87a cases.

### 2.5 UWG §4 — Competitor Obstruction

§4 Nr. 4 UWG: targeted obstruction of a competitor is unlauter. Systematic copying of a competitor's DB to launch a parasitic competing service can qualify, but case law (e.g. **BGH Hartplatzhelden** `[verify]`) typically requires the copying to *substitute* for the competitor's offering in a way that diverts demand.

Hello Sello is a B2B trade marketplace; FLOWZZ is a market-data product (consumer + emerging B2B). Substitution argument is **moderate**, strengthens as Hello Sello develops the Discover surface (which competes more directly with FLOWZZ's information layer).

**Verdict — §4 UWG:** AMBER. Weaker leg than §87a; mostly redundant if §87a hits.

### 2.6 Stage (a) Verdict + Conditions

**AMBER, leaning RED on the database right.**

Conditions to drop one notch:
- License FLOWZZ data formally, **OR**
- Restrict scrape to (i) bare existence + address + license number, sourced from the **BfArM public register** rather than FLOWZZ, and (ii) one-time seed, not scheduled re-scrape
- Maintain logs proving no bypass of any access protection
- Maintain a written Legitimate-Interest Assessment (LIA) per Art 6(1)(f) DSGVO

---

## 3. Stage (b) — Storing Unverified Shops

### 3.1 DSGVO Art 6 + Art 13/14 + Art 17

**Art 6(1)(f) LIA** — same balancing test as stage (a), but **stricter at publication** because the data subject's reasonable expectation that their data appears in *Hello Sello's commercial product* is even lower than at scraping.

**Art 14 (information where data NOT obtained from data subject) — HARD obligation, not a balancing test.** Within one month of collection or at first communication with the data subject, Hello Sello must provide:
- Controller identity
- Purposes
- Legitimate-interest basis
- Categories of data
- Recipients
- Retention period
- Rights catalogue

Art 14(5) exceptions are narrow (disproportionate effort can apply per Recital 62, but DPAs read this restrictively).

**Practical implementation:** the public unverified-profile page itself should carry an Art 14 notice — e.g. *"Sie sind ein Anbieter? Diese Information wurde aus öffentlich zugänglichen Quellen erstellt. Hier widersprechen / löschen / korrigieren / beanspruchen."* Stage (c) cold-email is the "first communication" — it must contain a full Art 14 notice or an unmissable link.

**Art 17 (erasure) + Art 21 (objection):** one-click erasure/objection workflow is **non-negotiable**. For Art 21(1) general objection, Hello Sello bears the burden of showing "*zwingende schutzwürdige Gründe*" — overriding legitimate grounds — to keep processing. For B2B contact data used for unsolicited outreach, that burden is **very hard to meet**, so in practice **objection = erasure**.

### 3.2 Accuracy Duty (Art 5(1)(d))

Stale or wrong scraped data is a real Art 5 exposure. Publishing "Aurora — Distributor — License XYZ" when the license has been revoked → both an accuracy breach AND potentially defamatory under §823 / §824 BGB (Kreditgefährdung). Cannabis sector adds salience: an "unverified" tag attached to a real named producer could be read as a quality signal by the market.

### 3.3 Stage (b) Verdict + Conditions

**AMBER.** Survivable if:
- Art 14 notice on every unverified profile page (public, no login required)
- One-click "Löschen / Widersprechen" mechanism live **before** stage (b) launches
- "Unverified" tag visually clear, time-bounded (auto-expire profiles not claimed within X months), refreshed for accuracy
- LIA documents that profile publication serves a B2B-marketplace discovery function the data subject would foreseeably benefit from (the **claim button is the foreseeability hook** — load-bearing for the LIA)

---

## 4. Stage (c) — Outbound Cold Email

### 4.1 UWG §7 — DEEP DIVE

**Statute (§7 Abs. 2 Nr. 2 UWG, post-2021 reform):**
> *"Eine unzumutbare Belästigung ist stets anzunehmen […] bei Werbung unter Verwendung […] elektronischer Post, ohne dass eine vorherige ausdrückliche Einwilligung des Adressaten vorliegt."*

The wording **"stets anzunehmen"** = "is always assumed." **Per-se rule, no balancing test, no DSGVO-style legitimate-interest escape.**

**§7 Abs. 3 B2B existing-customer exception** — four cumulative conditions:
1. Trader obtained the email *in connection with the sale of goods or services*
2. Used for direct advertising of trader's *own similar* goods/services
3. Customer has not objected
4. Customer was clearly informed at collection AND with every use that they can object at no cost

**None apply** to FLOWZZ-scraped data. No prior sale. No relationship. **Exception is closed.**

**Is the structured offer "Werbung"?** Yes. German "Werbung" is broad and includes "*Kommunikationen, die auf den Absatz von Waren oder Dienstleistungen gerichtet sind*" — including unsolicited offers and invitations to do business. **BGH I ZR 218/07 — Payback** (2008) and the line of cases on `Anfrage`/`Angebots`-emails confirm a structured commercial offer is Werbung even when the payload is "the buyer's offer."

**B2B applies fully.** A common misconception is that §7 UWG is consumer-only. **It is not.** **BGH I ZR 164/09 — Double-Opt-In** (2011) confirms B2B address requires prior explicit consent for email.

**Damages and enforcement realities** (corroborated by current 2026 commentary — see Sources):
- Per-incident: Abmahnkosten **€500–€2,500** + Unterlassungserklärung mit Vertragsstrafe (typical €5,001–€10,000 per future incident)
- Standing to sue: **competitors** (Mitbewerber), **Wettbewerbszentrale**, **qualified consumer associations** under UKlaG. For B2B, competitor + Wettbewerbszentrale dominate.
- **Single email is sufficient** to ground an injunction
- A plaintiff with collected evidence across many recipients can stack Vertragsstrafen — **this is what kills scale**

**Key BGH rulings:**

| Case | Holding |
|---|---|
| **BGH I ZR 191/08 — Email-Werbung II** (2009) `[verify]` | Single unsolicited email = sufficient for injunction |
| **BGH I ZR 164/09 — Double-Opt-In** (2011) | Defines proper consent capture mechanics |
| **BGH I ZR 218/07 — Payback** (2008) | Broad reading of "Werbung" — captures structured offers |
| **BGH VI ZR 225/17** (2018) | Injury concept for unwanted email contact |

### 4.2 ePrivacy Directive Art 13

Same prior-consent rule for electronic mail. Transposed into German law via §7 UWG. EDPB ePrivacy guidance confirms the B2B exception (Art 13(2)) is narrowly the "existing customer" carve-out only. The pending European ePrivacy Regulation would tighten further, not loosen.

### 4.3 DSGVO Interplay

Even if §7 UWG were somehow satisfied, the DSGVO Art 6 lawful-basis question for *processing the contact email for the purpose of cold outreach* remains. The dominant German DPA view (BfDI, BayLDA, LfDI BW) is **Wertungsgleichlauf** between UWG and DSGVO: legitimate-interest cannot survive the cross-law balance if the legislator has codified the practice as `unzumutbare Belästigung`.

### 4.4 Sender Attribution: Hello-Sello-as-sender vs Hello-Sello-as-courier

This is the legally creative move and *the* live question.

**The "courier" argument:** the buyer (a licensed pharmacy) is the substantive sender; Hello Sello provides only the transport. Analogies: postal courier ≠ Werbender; messaging app ≠ sender.

**Why this is fragile in Germany:**

- **BGH I ZR 191/08 + subsequent "Spammer als Vermittler" cases:** *both* originator AND technical sender can be jointly liable as Störer where the technical sender knew or should have known of the unlawful purpose. The platform-as-courier defence has been pierced repeatedly.
- **Platform branding matters.** Sending from `info@hellosello.com` with a Hello Sello PDF template = Hello Sello is the technical AND visual sender. A genuine courier model would route from the buyer's own SMTP domain (or with a Reply-To resolving to the buyer) and would not editorialise the payload.
- **Buyer faces UWG §7 exposure individually** as substantive sender. Even if Hello Sello escaped, the pharmacy buyer has just been handed competition-law liability. Pharmacy professional-conduct rules (Apothekengesetz, Berufsordnung) layer on top.

### 4.5 Stage (c) Verdict + Conditions

**RED as currently designed.**

Routing from `info@hellosello.com` with Hello Sello as visible sender + no prior consent = **textbook §7(2) Nr. 2 UWG violation**. The "buyer's offer" payload does not change the sender-attribution analysis.

**Conditions to drop to AMBER (still risky):**
- Route from **buyer-controlled sender identity** (Reply-To at minimum; ideally From-domain)
- Buyer must **affirmatively initiate per recipient** (no bulk; no scheduled cadence)
- Every email contains full Art 14 notice + source-of-data disclosure + one-click profile-erasure link + sender = buyer identity
- **Frequency cap per supplier** (one email per buyer per supplier; cooling-off after no-reply)
- Maintain internal blacklist on objection / non-response
- Indemnification from buyer to Hello Sello for buyer's own UWG exposure (legally weak but commercially signals buyer is the sender)

**To drop to GREEN:** consent only. Either FLOWZZ-mediated supplier opt-in (FLOWZZ asks listed suppliers if they want to receive marketplace offers) or supplier self-onboarding consent before any outreach. The first is what makes a FLOWZZ partnership commercially valuable.

---

## 5. Cannabis-Specific Overlay (BtMG, HWG, BfArM)

**BtMG (Betäubungsmittelgesetz):** medical cannabis flos and extracts are BtM-listed in Anlage III. Trade in BtM requires a §3 BtMG Erlaubnis from BfArM. **Hello Sello as marketplace intermediary does NOT itself trade in BtM**, so does not need a §3 Erlaubnis — *however*:

- "Verkehr mit Betäubungsmitteln" includes `Verschaffen`/`Verbringen` interpretations that have been litigated. A marketplace running ordering/fulfilment for BtM may slide into `In-den-Verkehr-bringen`. **Discovery + matching only = safer; order processing, payment intermediation, escrow = pulls toward licensure exposure.**
- BfArM has been increasingly attentive to medical-cannabis intermediaries post-MedCanG (Medizinal-Cannabisgesetz, 1 April 2024).

**HWG §10 (Werbung für verschreibungspflichtige Arzneimittel)** — **THE cannabis sleeper risk.**

> Advertising prescription-only medicines toward the public (Publikumswerbung) is **prohibited**.

Medical cannabis preparations are prescription-only. Mirror profile pages showing strain names, THC%, pricing, packshots — to **non-logged-out visitors** — is a serious HWG §10 exposure, **separate from and additional to** the §87a / §7 UWG analyses.

**HWG §11** further restricts specific persuasive elements (testimonials, before/after, etc.).

**Mitigation:** gate all product-level catalog data behind a **verified-pharmacy login**. Public pages should show only company existence + segment tagging — **no strain names, no THC %, no prices, no packshots without login.**

**Apothekenrecht** (Apothekengesetz, Berufsordnung der Apothekerkammern): the buyer side is heavily regulated. Marketplace flows that end in BtM ordering must respect pharmacy professional-conduct rules. Out of scope for stages (a)/(b)/(c) directly, but load-bearing for the broader build.

**Cannabis verdict:** HWG §10 is a sleeper RED for stage (b) **if public profile pages show product-level catalog data**. Gate aggressively.

---

## 6. Choco Precedent

**Honest framing:** my targeted searches for Choco lawsuits in Germany returned **nothing concrete** — no docketed cases under UWG, DSGVO, or competitor claims surfaced via English+German search. This does NOT mean none exist. Three likely explanations:

1. **Abmahnungen typically settle privately** and don't generate searchable court documents — they're the dominant volume in this area.
2. **German-language legal databases** (juris, beck-online, openJur) require subscriptions our search doesn't reach.
3. **Search visibility is poor** for B2B platform niche litigation.

What I *did* find is far more informative than a missing case docket: **Choco's own legal architecture**, published at `legal.choco.com`.

### 6.1 Choco's Defensive Legal Architecture (live-verified)

| Choice | What it tells us |
|---|---|
| **Operates as a "data processor", not controller** for buyer-supplier flows. Customers (restaurants) are "responsible for data protection obligations." | This is the Hello-Sello-as-courier defence formalised as a corporate structure. Choco is pushing GDPR responsibility to the restaurant (the buyer). |
| **External DPO**: ISiCO Datenschutz GmbH, Berlin. | Standard for mid-size companies but shows active DPO function and indicates real complaint volume to manage. |
| **Single legal contact**: `legal@choco.com` for all data-subject rights. | Suggests they have institutional muscle for handling complaints — i.e. they receive enough to warrant it. |
| **Per-jurisdiction legal pages** (`/website`, `/apppremier`, `/degastro`). | Granular tailoring for risk surface — German legal page exists separately, implying DE-specific posture. |

**Inference:** Choco's architecture is **exactly the structural defence the subagent flagged as fragile under Störerhaftung**. The fact that they've codified it institutionally — external DPO, processor-not-controller positioning, customer-bears-DSGVO-burden — strongly suggests they have:
- Faced complaints and structured their model around them
- Made the deliberate trade-off to operate in known-grey space at scale, absorbing Abmahnung volume as a cost of doing business
- Pushed legal exposure down-funnel to the customer wherever possible

### 6.2 What's Different About Choco vs Hello Sello

| Factor | Choco | Hello Sello |
|---|---|---|
| Vertical | Foodservice (low-regulation) | Medical cannabis (high-regulation, BtMG/HWG/Apothekenrecht) |
| Suppliers | Wholesalers, food distributors | BfArM-licensed cannabis producers/importers |
| Buyers | Restaurants (commercial; tolerant of supplier outreach) | Pharmacies (professional-conduct rules; less tolerant) |
| Funding cushion | Unicorn (~$330M raised) — can absorb litigation | Pre-MVP startup — can't absorb litigation |
| Brand survival cost of a single Abmahnung | Negligible | Could kill MVP momentum |

**Choco's apparent survival is NOT evidence the model is legal — it's evidence the model is litigatable-but-not-lethal in food, with unicorn funding, willing buyers, and no regulated controlled substance. Hello Sello has NONE of those mitigators.**

### 6.3 Direct Lessons for Hello Sello

1. The "processor not controller" + outsourced-DPO structure is the playbook. If Hello Sello pursues stage (c), expect to need:
   - External DPO contract (€10–30K/year)
   - Buyer ToS that shifts DSGVO/UWG responsibility to the buyer (with all the unenforceable-against-third-party caveats that implies)
   - Per-jurisdiction legal pages
2. Buyer-initiated routing is the *practical* playbook even though it's *legally* fragile.
3. **Cannabis adds HWG / BtMG layers Choco never had.** The Choco template is necessary-but-insufficient — even fully replicating it leaves Hello Sello exposed on the cannabis-specific overlay.

### 6.4 What Counsel Should Verify

- Choco's reported Abmahnung history via Wettbewerbszentrale annual Tätigkeitsberichte (publicly published)
- Any docketed cases (juris/beck-online: search "Choco AG" or "Choco Communications GmbH")
- Whether Choco's model has been distinguished or criticised in any published commentary or legal-blog analysis

---

## 7. Other Comparable Precedents

| Platform | Pattern | German legal lesson |
|---|---|---|
| **XING / LinkedIn scraping** | Profile-scraping cases under §87a UrhG + DSGVO + ToS. hiQ Labs v LinkedIn (US) is NOT authoritative in DE. Personal-profile data brings DSGVO into sharper bind than B2B company data. |
| **kununu (employer reviews)** | Litigation mostly on §823 BGB / Persönlichkeitsrecht *content* side; the unverified-profile + claim model itself has not been struck down. Useful template. |
| **Google My Business unverified listings** | Operates at massive scale via DSA Art 6 hosting safe harbour + deep notice-and-takedown ops. **Not a viable template for a startup** without those mitigators. |
| **Yelp / Jameda** | BGH VI ZR 34/15 — Jameda I (2016) + BGH VI ZR 489/19 — Jameda III (2020): platform neutrality determines whether unverified-profile + paid-feature design respects informational self-determination. **Hello Sello must stay structurally neutral** — no de-listing the unverified, no penalising them in search ranking once claimed. |
| **Trustpilot** | UK base helps; German subsidiary exposure real. Notice-and-takedown driven. |
| **Mitwohnzentrale.de** (BGH 2003) `[verify]` | Early meta-search ruling, generally pro-meta-search where it didn't divert demand. Caveats apply post-Innoweb. |
| **Paperboy** (BGH 2003) `[verify]` | Linking ≠ copying-into-own-database. |

---

## 8. Open Legal Questions for Counsel

1. Has FLOWZZ asserted database-maker rights under §87a UrhG in any public matter? Cease-and-desist record? ToS language asserting database protection?
2. Does FLOWZZ's investment in data procurement/verification/presentation meet the "wesentliche Investition" prong (William Hill / Innoweb tests) on publicly observable evidence?
3. Is `info@firma.de` of a one-person GmbH a personal datum under EDPB and current BfDI practice?
4. Controlling German authority on per-incident Schadensersatz for §7 UWG email violations in 2024–2026, including post-BGH VI ZR 1/21 / VI ZR 5/22 series on immaterial DSGVO damages?
5. Is the buyer-as-substantive-sender / Hello-Sello-as-courier defence available against UWG §8 Abs. 2 Störerhaftung post-2021 reform?
6. Does Hello Sello qualify as a hosting provider under DSA Art 6 for unverified profile pages, or is the profile "own content" (active editorial role = no safe harbour)?
7. Does Hello Sello's marketplace fall under §3 BtMG Erlaubnis requirement at any stage of the buyer-order flow? Where exactly is BfArM's line on "Verschaffen / In-den-Verkehr-bringen"?
8. Does HWG §10 apply to a B2B marketplace's pre-login product catalog pages, or is the B2B context sufficient to escape Publikumswerbung?
9. Post-MedCanG (April 2024) and post-CanG, is there new BfArM guidance addressing online marketplaces for medical cannabis?
10. If Hello Sello scrapes from servers outside Germany (e.g. EU non-DE jurisdiction), does it change UWG §3a/§7 applicability? (Likely no — Marktortprinzip — but verify.)
11. Current Wettbewerbszentrale stated enforcement priority for B2B platform cold outreach in 2025–2026?
12. Any reported decisions on "data source disclosure in the email" as a defence — does prominent FLOWZZ-as-source disclosure cure or aggravate the §7 UWG case?
13. If FLOWZZ ToS prohibits scraping and Hello Sello scrapes anyway, residual §823 BGB Eingriff in den eingerichteten Gewerbebetrieb exposure independent of §87a?
14. Best-practice retention period for unclaimed unverified profiles to balance Art 5(1)(e) DSGVO storage limitation against marketplace-discovery legitimate interest?
15. For a structured PDF offer (concrete commercial proposal with prices/quantities), any authority distinguishing it from "Werbung" under §7 UWG? (Predicted: no — Payback line sweeps in offers.)

---

## 9. Recommended Derisking Tracks (Parallel)

### 9.1 Approach FLOWZZ for API / Data Licensing

Open with a **partnership pitch**, not a "we want your data" ask. Frame:

> *"Hello Sello drives demand-side traffic to FLOWZZ-listed suppliers; we want a referral-revenue or data-feed deal that lets FLOWZZ monetise its data and lets us seed verified profiles."*

Strongest position obtained:
- **Best:** Data-feed licence with explicit re-use rights — display in Hello Sello UI under Hello Sello branding, FLOWZZ source attribution. Eliminates §87a UrhG, eliminates UWG §4, provides downstream evidence of lawful acquisition for the DSGVO Art 6(1)(f) LIA.
- **Second-best:** Read-only API licence with rate limits + no-bulk-cache obligation. Weaker for the mirror-shop model.
- **Third-best (and the GOLD STANDARD for stage (c)):** Opt-in supplier-consent program mediated by FLOWZZ — FLOWZZ asks listed suppliers if they want to receive Hello Sello buyer-demand emails. This **converts cold outreach into consented outreach, resolving §7 UWG entirely.**

Given that FLOWZZ themselves are "developing B2B functionality," they may welcome or compete on this approach. Worth knowing their stance early.

### 9.2 Narrow MVP Scope (Per-Field Strip)

| Field | Keep / Drop | Why |
|---|---|---|
| Company name + address | **KEEP** | Public, lowest-risk; sourceable from BfArM register if needed |
| License number | **KEEP from BfArM register**, not FLOWZZ | Removes §87a vector for this field |
| Generic `info@` email | **KEEP for stage (b) display under Art 14 notice; DO NOT use for stage (c) without consent** | DSGVO survivable; UWG not |
| Named individuals | **DROP** | Sharpens DSGVO Art 6 + Art 14 burden disproportionately |
| Product catalog (strain, THC, CBD, packshot) | **DROP from public pages, gate behind verified-pharmacy login** | Removes HWG §10 vector + reduces §87a "wesentlicher Teil" |
| Pricing | **DROP from public pages** | HWG §10 + Wettbewerbsverhalten exposure |
| Stock / inventory | **DROP entirely** | High §87a value; high competitive sensitivity; low MVP value |

**Narrowing to bare company existence + license + contact gate + verified-buyer-only catalog moves stage (a) from AMBER-leaning-RED to AMBER, and stage (b) from AMBER to AMBER-leaning-GREEN.**

### 9.3 Opt-Out Mechanism Design

Credible "unverified shop opt-out" must:
- Be reachable **in one click** from the public profile page, requiring **no login**
- Provide **three actions**: **Claim** (becomes verified), **Correct** (without claiming), **Delete** (full erasure including derivatives)
- Honour Delete within **72 hours**, confirm by email to the contact on file + notification to fallback `datenschutz@` mailbox
- Maintain a **tombstone** preventing re-scrape of deleted entity for at least **24 months**
- Provide copy of Art 14 notice + full processing-record extract on request
- Be operated by a real **Datenschutzbeauftragter (DPO)** function (mandatory at Hello Sello scale anyway under §38 BDSG once thresholds are reached)

This mechanism is also the key evidence in any DSGVO complaint that Hello Sello has weighed data-subject rights at design time (**Art 25 Data Protection by Design**).

---

## 10. Sources

### Live-verified (this research session)

**FLOWZZ recon:**
- [flowzz.com homepage](https://flowzz.com) — product cards, manufacturers, pharmacy attribution
- [alphaflowz.com](https://alphaflowz.com/en/) — B2B-leaning sibling
- [flowzz.com/robots.txt](https://flowzz.com/robots.txt) — `Allow: /` everywhere except `/account`

**Choco recon:**
- [legal.choco.com/degastro](https://legal.choco.com/degastro) — Choco's German privacy/processor structure
- [Cannabis Consultants — flowzz.com Germany launch](https://cannabis-consulting.eu/en/nicht-kategorisiert-en/integraleaf-supports-flowzz-com-in-the-development-of-the-german-market/)
- [Cannabismarketcap — Flowzz profile](https://cannabismarketcap.io/directory/flowzz)
- [Brandfetch — Flowzz.com](https://brandfetch.com/flowzz.com)

**Current 2026 UWG §7 enforcement commentary (corroborates §4.1 analysis):**
- [Lexology — Direct marketing: the German approach](https://www.lexology.com/library/detail.aspx?g=33d0d224-26ef-460e-a29d-61528c1141cc)
- [Puzzle Inbox — Cold Email Germany 2026: GDPR + UWG Survival Guide](https://puzzleinbox.com/blog/cold-email-germany-gdpr-uwg-2026/)
- [Overloop — Is Cold Email Legal in Germany? GDPR & UWG §7](https://overloop.com/blog/b2b-cold-email-germany-gdpr-compliance)
- [SRD Rechtsanwälte — Email marketing without consent](https://www.srd-rechtsanwaelte.de/en/blog/email-marketing-without-consent)
- [Björn Wesarg — Illegal Email Outreach in Germany](https://www.bjoernwesarg.com/illegal-email-outreach-germany-lead-generation-warning/)
- [Globig — Email Marketing in Germany compliance](https://globig.co/email-marketing-in-germany-how-to-stay-compliant-and-effective/)
- [Transatlantic Law International — Germany Direct Marketing](https://www.transatlanticlaw.com/content/germany-data-protection-in-direct-marketing-seizing-opportunities-avoiding-risks/)

### German statutes (verify text at [gesetze-im-internet.de](https://www.gesetze-im-internet.de/))

- §87a–87e UrhG — Database-maker right
- §202a StGB — Ausspähen von Daten
- §7 UWG — Unzumutbare Belästigung
- §3, §4 Nr. 4, §8 UWG — General clause + competitor obstruction + standing
- §§305 ff. BGB — General terms and conditions
- §823, §824, §1004 BGB — Tort and injunction
- §3 BtMG — Trade-in-narcotics licensing
- §10, §11 HWG — Advertising of prescription-only medicines
- MedCanG (Medizinal-Cannabisgesetz, in force 1 April 2024)
- DSGVO Art 4(1), 5(1)(a)(d)(e), 6(1)(a)(f), 13, 14, 17, 21, 25, 82
- ePrivacy Directive 2002/58/EC Art 13
- EU Database Directive 96/9/EC Art 7

### Case law cited (all `[verify dockets with counsel]`)

| Court | Case | Year |
|---|---|---|
| CJEU | C-203/02 — British Horseracing Board v William Hill | 2004 |
| CJEU | **C-202/12 — Innoweb v Wegener** (controlling) | 2013 |
| CJEU | C-30/14 — Ryanair v PR Aviation | 2015 |
| CJEU | C-490/14 — Verlag Esterbauer | 2015 |
| BGH | I ZR 290/02 — Hit Bilanz | 2005 |
| BGH | I ZR 145/05 — Online-Telefonbuch | — |
| BGH | I ZR 39/08 — Paperboy | — |
| BGH | I ZR 11/03 — Mitwohnzentrale.de | 2003 |
| BGH | I ZR 218/07 — Payback | 2008 |
| BGH | I ZR 191/08 — Email-Werbung II | 2009 |
| BGH | I ZR 164/09 — Double-Opt-In | 2011 |
| BGH | VI ZR 225/17 | 2018 |
| BGH | VI ZR 34/15 — Jameda I | 2016 |
| BGH | VI ZR 489/19 — Jameda III | 2020 |
| BGH | "Hartplatzhelden" | — |
| OLG Hamm | Modern Solution case (NOT applicable to public scraping; boundary reference) | 2024 |
| BGH | VI ZR 1/21 / VI ZR 5/22 — immaterial DSGVO damages | — |

### Regulator guidance to verify

- BfDI annual Tätigkeitsbericht (most recent 2024/2025)
- BayLDA annual report
- EDPB Guidelines 8/2020 (targeting social media users) — analogous reasoning
- Wettbewerbszentrale annual Tätigkeitsbericht (publicly published — load-bearing for §7 UWG enforcement priorities)
- BfArM guidance on medical-cannabis intermediaries post-MedCanG

### Recon items still open (recommended for counsel's juris/beck-online research)

- FLOWZZ actual ToS text (full read) + asserted database-maker claims in ToS
- Choco docketed UWG / DSGVO matters
- Most-recent Wettbewerbszentrale priorities on B2B platform cold outreach
- Whether BfArM has issued any 2024–2026 guidance addressing online marketplaces for medical cannabis

---

**End of research note.**

---

## Next-step decisions (for follow-up conversation, not for this note to lock)

After counsel review, the following decisions need to land in `docs/decisions/DECISIONS.md`:

1. **Build / don't build the FLOWZZ scrape** — based on counsel verdict + commercial assessment
2. **FLOWZZ partnership approach** — yes/no, who owns, what to ask for
3. **MVP scope narrowing** — which fields stay, which drop
4. **Stage (c) sender architecture** — buyer-domain routing vs Hello-Sello-as-sender
5. **HWG §10 mitigation** — verified-pharmacy login gate for product catalog data (likely lands in Layer 2 / Layer 5 specs too)
6. **DPO function** — internal or external (ISiCO-style)
7. **Opt-out mechanism scope** — Claim / Correct / Delete UX + retention/tombstone policy
