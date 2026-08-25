# 0023 — the original seed, verbatim

Muskan, 2026-08-25. Origin: **F-04 of the 0022 G5 walk.**

Preserved in full because the slug was **narrowed twice** during triage. The pieces
cut from scope are real work — they are just not this slug. See `STATE.md`
§ *Deferred — must NOT be built* for where each one went.

> Every request lands in the recipient's CHAT, routed by who it was addressed to —
> a person → the p2p thread, a company → the c2c thread. The Connection Request page
> comes out of Connect entirely.
>
> LOCKED IN DISCUSSION:
> 1. Consent is unchanged. You must connect first; only then can an offer/order
>    reach someone's chat.
> 2. connect / connect_message → Discover. Already built there (RequestsSection
>    accepts/declines company requests via acceptItem today).
> 3. deal_card → chat. send_deal ALREADY does this for the person arm (resolves the
>    p2p thread, posts the "X has sent a deal" pill, returns the thread id). The
>    COMPANY arm is the wrong one — it falls through to deliver_deal and cuts item.
>    Point it at resolveC2cThread instead; the card carries its relationship_id from
>    birth.
> 4. pricelist_request → chat, same routing.
> 5. An UNCONNECTED buyer's "Request pricing" BECOMES a connection request carrying
>    the product. sendConnectRequest already takes a productId and stores it in
>    metadata. Today canAsk has no connection check (ProductCard.tsx:
>    !editing && !viewerIsOwner && !pricePublic) — that is the gap.
> 6. No claim / no assign / no lens tabs. Single user, that team layer is deleted.
> 7. /connect/inbox is deleted. /connect already redirects to /connect/chat.
>
> MUST SUPERSEDE BY NAME (both lock the opposite routing):
> - DECISIONS.md 2026-06-10 "Present storefront v0" — "Request-pricing routes to
>   Connect's inbox (type pricelist_request, 2a machinery)"
> - DECISIONS.md 2026-06-14 "Discover & public profile: soft openness model" —
>   "Connect CTAs map to the 4 existing inbox types ... no new request types"
>
> ORIGIN: F-04 of the 0022 G5 walk.

*(Points 2–3 arrived duplicated three times in the paste; recorded once. Nothing was
dropped — the repeated text was byte-identical.)*

---

## How the scope moved, in order

1. **Original seed** — route ALL FOUR request types to chat; delete the Connect
   inbox and the claim/assign/lens layer.
2. **Muskan redirects to the buyer's door** — *"the buyer should be able to go to the
   seller's shop … add the products to their basket and send the deal draft to the
   company or person selected."* Same slug, entered where a buyer actually stands.
3. **Muskan cuts it** — *"we should keep the scope of slug small, just fixing the deal
   draft send to chats."* Everything except the `deal_card` arm deferred.
4. **Muskan widens it back by one** — the person picker is NOT separable: without it
   `counterparty_person_id` is permanently null on the buyer side, so the person arm
   never fires and the routing has nothing to route.
5. **Muskan rules on the chat clutter** — the duplicate conversations are
   pre-existing and upstream; **own slug**, not folded in here.

## Corrections triage made to the seed itself

- **`DECISIONS.md:961` is NOT superseded by this slug.** It governs
  `pricelist_request`, which is out of scope. It stays true.
- **`DECISIONS.md:1013` is a PARTIAL supersede** — the `deal_card` arm only. The
  other three Connect CTAs still route to the inbox.
- **`/connect/inbox` is NOT deleted here.** It still carries `connect`,
  `connect_message` and `pricelist_request`, so it cannot go until those move.
