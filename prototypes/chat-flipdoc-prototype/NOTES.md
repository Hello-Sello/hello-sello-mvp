# Chat + Flip Deal Document — prototype

**Throwaway prototype. Open question — NOT locked.**
Run: open `index.html` directly in a browser, or `python3 -m http.server 8776 --directory prototypes/chat-flipdoc-prototype`.
Switch variants: floating bottom bar, `←`/`→` keys, or `?variant=A|B|C`.

## Question this answers

Chat redesign (2026-07-03 session, Ayush): **no separate Deal Room page, no Sella rail, no stages.**
One document-sized, receipt-style Deal Card. Its FLIP side IS the Deal Room (pinkish group chat + version
log). A proposed change renders as a red/green **diff on the card** (like a code review), with
**Change** (counter — undoes the diff, back to chat) / **Approve** (applies it, version bumps).
End of deal = **"Finalize by uploading invoice"** (the invoice is the seal). "Create ticket for
clarification" = post-close escape hatch, parked for later.

Which structure carries this best?

## The three variants

| | Name | Structure | What it tests |
|---|---|---|---|
| A | **Side panel + flip** | Chat keeps full width; header chip (🧾 Deal + version + status dot) toggles a Claude-style right panel; the paper flips card ↔ room | The "two toggles like Claude" idea; both chats side-by-side when room face is up (P2P white left, room pink right) |
| B | **Lightbox focus + flip** | Chat always full width; chip opens the paper as a centered lightbox over a dimmed chat; flip inside the lightbox | One-thing-at-a-time focus; never two chats at once; most "document-like" feel |
| C | **Stacked workbench — no flip** | Right column always open: card on top, deal-room chat below it, simultaneously; Versions is a tab in the room header | Kills the flip entirely — do we even need it, or is seeing card + room at once better? |

Deliberately structural differences: A = toggleable split, B = overlay, C = permanent stack without flip.

## Demo script (DEMO bar, top right)

1. **"Alice proposes a change"** → card enters diff mode: red struck line (3.80 €/g) + green new line
   (3.60 €/g), term 6 → 9 months struck/green, total updates, amber **Change** + green **Approve** appear,
   a clickable system card lands in the P2P chat ("Review diff →"), the chip dot turns amber+pulsing,
   the card shows **"Your turn — Alice is waiting on you."**
2. **Approve** → diff applies, card goes clean at **v3**, version log gains the entry, deal room gets a
   system line, P2P gets your confirmation message.
3. **Change** (counter) → the diff is UNDONE — card returns to its original shape, pending version entry
   withdrawn, and a counter-message goes back to the P2P chat (negotiation continues in words).
4. **Reset** restores v2 clean state. Both composers accept Enter (adds a message, re-renders).

## Color rule being A/B-tested

**P2P chat = white** (people talk), **Deal Room chat = pinkish** (`--brand-tint`, official record).
Visible directly in A (flipped) and C (always).

## Research findings baked in (agent, 2026-07-03)

- **Concessions are traded as packages** ("3.60 €/g IF 9-month term"), never field-by-field — so the
  diff bundles price + term into ONE proposal, and Approve/Change act on the whole package atomically.
- **"Whose turn" kills stalls**: deals go dark waiting on the counterparty; contract-redlining tools all
  show a turn indicator. Added to the card: "Your turn — Alice is waiting" (amber) / "All agreed" (green).
- **Redline/backline**: red/green diff on the DOCUMENT (not chat prose), clean "backline" after accept —
  exactly the card's diff → clean cycle. In regulated goods the version trail doubles as compliance audit.
- Germany cannabis specifics: purchase price fully negotiable (keine Preisbindung), volume tiers legal +
  common, CoA per batch mandatory (goods quarantine without it), typical trades: price ↔ volume,
  price ↔ commitment length, price ↔ payment terms (Skonto), batch/THC% haggling, shelf-life discounts.
- Typical deal = 3–5 rounds; round count (not round length) drives cycle time — the card diff attacks
  exactly the per-round overhead (version confusion, re-loading context).
- Negotiable variable groups (for future card fields): commercial (price/qty/MOQ/tiers/commitment),
  logistics (DDP vs EXW, date, frequency, temp-controlled GDP), quality (batch, THC%, GMP, CoA,
  shelf life), payment (net days, Skonto, prepay), documents (Lieferschein, CoA, PO, invoice) + damage
  credits instead of returns (cannabis is largely non-returnable).

## Chat list v2 — Outlook-style rows + filters (added 2026-07-03, same session)

Row anatomy (Ayush's spec): **line A = people names** ("Ben, Alice, Bob") · **line B = subject**
(group name like "Problem with delivery June", or the deal code "HS-AUR07…"; for a plain P2P chat the
company name is the subject) · **line C = latest message preview** ("Ben: courier arrived without…").
Unread rows go bold + pink dot + pink time, like an email inbox.

Filters: forefront chips **All · Unread · Deals**, plus a **More ▾ dropdown** = Groups / Companies /
Internal / External. When a dropdown filter is active, the chip shows its name and lights up pink.

Assumptions taken (correct me):
- **Groups** = plain multi-person groups only (deal groups live under **Deals**, which has its own chip).
- **External** = every chat involving another company (P2P, groups, deals, C2C); **Internal** = own-company colleagues only.

Group creation entry points: **+ New chat ▾** menu (New chat / New group — pick people + a subject line)
and a **👥 button on the deal card header** (creates a group from the deal; subject = deal code).
Both are visual stubs — no actual creation flow in this prototype.

## Group creation (added 2026-07-03, same session)

Two birth paths, one popup:

| | From the DEAL CARD ("Talk about this deal" button / 👥 header icon) | From + NEW CHAT ▾ → New group |
|---|---|---|
| People allowed | The two deal parties freely; an **external** person triggers the gate | Anyone |
| External gate | ⚠ "EXTERNAL PARTY IS BEING ADDRESSED" warning + **two approval clicks** required | none |
| Default title | The deal code (HS-AUR07-CAN23-A189371) | First names ("Alice, Jan") |
| Filter home | **Deals** (always — deal-born groups are kind `deal`) | Groups |
| After create | Group replaces the open chat AND **the deal panel stays open** (same deal) | Group replaces the open chat AND **the deal closes completely** |

Name field is optional (grey placeholder "Clarification for April delivery"); the title is editable
**anytime from the chat window** — click the title / ✎ in the chat header, Enter saves, Esc cancels.

**Deal-ownership rule (locked in this prototype):** a deal belongs to ONE chat. The 🧾 chip + panel
exist only inside chats carrying that dealId (Alice P2P, the deal group, deal-born groups). Switching
to any other conversation closes the deal panel completely.

## Deliberately OUT of this prototype

- **Sella rail / Sella anything** — v1 removes it; Sella detects changes invisibly (the diff just appears).
- **Stages** — removed; the "Things" checklist on the card is the lightweight replacement.
- **Suggested next steps panel** — gone with the rail.
- Deal Basket / multi-deal selector — Muskan's Phase 6 territory.

## Verdict (Ayush, 2026-07-03)

**Variant A won** — chat + toggleable side panel with the flipping paper. B (lightbox) and C
(stacked workbench) are deleted from the prototype; the variant switcher is gone too.

**Back-face change (same session):** the deal-room CHAT is REMOVED from the back of the card.
The back is now **Signals | Logs** only (matches the original chat-prototype model: back = filter):

- **Signals** = live status at a glance: version (v2 current / v3 proposed), whose turn
  ("Your turn — Alice is waiting"), what's on the table (price + commitment line as mini red/green),
  proposed by whom. When clean: version, all-agreed, commitment, total net, open Things.
- **Logs** = the append-only version history (v1, v2, pending v3…) — audit trail.

Where the deal group chat lives instead: as a **normal conversation in the left chat list**
(the Outlook-style row with subject = deal code, e.g. "Alice, Jan, You / HS-AUR07-CAN23-A189371").
One chat surface, one list — the card is a pure deal document, front = state, back = status + history.
