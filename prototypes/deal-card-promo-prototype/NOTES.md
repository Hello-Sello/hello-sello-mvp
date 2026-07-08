# Deal card + Promotion — prototype

**Throwaway prototype. Pasted by Ayush during the Phase 7 (Chat) discuss-phase session, 2026-07-07.**
Companion to `prototypes/chat-flipdoc-prototype/` — this one zooms into the card face itself and
the promotion/bundle-deal mechanic (DEV-155 "Bundle deal reworking", DEV-156 "Deal card").
Run: open `index.html` directly in a browser.

> **⚠ CORRECTED same session, right after this file was written.** The JS in `index.html` gates
> Sign on the promotion decision and has a separate non-committal "Preview" step. **Both are
> wrong — see "Corrected mechanic" below, which is the real intent.** The HTML is kept as-is for
> the overall visual language (paper look, colors, section layout) only — do NOT build the
> promotion interaction exactly as the JS implements it.

## Corrected mechanic (supersedes the JS below)

- **Sign is never disabled by the promotion.** Signing the deal and deciding on the promotion are
  fully independent — whether the buyer has resolved the promotion has no bearing on whether they
  can sign.
- **No separate Preview step.** One button, initially labeled **"Promotion."** Clicking it applies
  the promotion's changes right there on the card (no non-committal look first).
- **After that first click, the same button's label changes to Accept / Decline** so the buyer
  can finalize keeping or discarding it.
- **No AI-narrated sentence** ("If you take 2 more units of X, I give you Y") — just the pure
  structural change shown on the card. No generated text at all.
- **Non-product rewards (e.g. "free delivery") do NOT appear as a product-table line** — they
  show in the **Extra Conditions** section instead (e.g. under Delivery), since they aren't a
  product. Only product-quantity-type rewards (extra units of a real product) show as product
  line changes.
- **No large "Promotion value" bubble.** Just a small one-line text, e.g. "You saved 240 € on
  this deal" — no big box.

## What this answers

How a seller-offered promotion/bundle deal ("if you take 2 more units of X, I give you free
delivery") sits on the card alongside a normal negotiation diff, and how the buyer resolves it
before they can sign.

## The promotion state machine (from the working JS, not just the notes)

`promo: 'pending' | 'accepted' | 'declined'`, starts `'pending'`.

- **Preview** (only available while pending) is non-committal — toggles a dashed-border yellow
  preview of what the card would look like if the promotion applied, without deciding anything.
- **Sign is disabled while `promo === 'pending'`** — tooltip "First accept or decline the
  promotion." A promotion, once present, is a mandatory gate before the deal can be signed.
- **Accept** locks in the promotion's changes (e.g. an existing line's units go up, a free "gift"
  line like Free delivery gets added at 0 € with the original value struck through), updates the
  total, and shows a "Promotion value X €" bubble. Related terms (e.g. Logistics) get an inline
  note too.
- **Decline** shows "Declined — the base deal will be signed" and unblocks Sign for the
  unmodified base terms only.
- The promotion segment (Accept/Decline) stays visible and shows its resolved state even after
  the decision is made — it isn't hidden once resolved.

## Relationship to the negotiation diff

Two separate, simultaneously-visible diff systems on the same card, distinguished only by color:
- **Negotiation diff** (red struck / green new) — the regular proposed-change flow already built
  in the app (`proposeDealChange` / `confirmDealChange`).
- **Promotion diff** (yellow, dashed border while previewing) — the seller's optional bundle
  offer, resolved independently via its own Accept/Decline, gating Sign.

## Linear references

- DEV-155 "Bundle deal reworking" — the promotion must be inserted as an actual product-table
  line (not a free-text condition card): "if you take X [qty] of [product], then I give you Y
  [€/%/units] or a full item like 'free delivery'."
- DEV-156 "Deal card" — paper-white torn-edge card skin (already matches the main chat-flipdoc
  prototype), a yellow "Promotion" section, the 2-click Accept/Decline-promotion → Sign flow, and
  reusing the total-delta area to show a promotion-value bubble.

## Deliberately not resolved here

- Exact wording/placement of the promotion sentence when there are multiple promotions at once.
- What happens if a promotion is accepted and the base deal is later negotiated further (does
  the promotion re-apply, get re-asked, or lock in independently?) — flagged for planning time.
