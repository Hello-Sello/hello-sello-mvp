# ADR index — one line per ADR

> `adr-checker` reads this index, then opens only the ADRs whose areas overlap the one
> under review. Writing the line is the last step of `/design` — an ADR not in the
> index does not exist. (PIPELINE.md §5.)

| ADR | Decision, in one line | Touches |
|-----|----------------------|---------|
| [0001](0001-held-deal-change.md) | Deal changes are held per-line and applied on confirm, not written live | deals · negotiation |
| [0002](0002-deal-card-data-model.md) | The deal card has two visibility classes: shared/held and private/immediate | deals · RLS · per-company data |
| [0003](0003-deal-basket-reusable-form.md) | One reusable basket/deal form serves both sides | deals · basket · UI |
| [0004](0004-tier-ladder.md) | Volume tiers are child rows of the price row, replacing the single bundle bracket | pricing · catalog · RLS · RPCs · basket · deals |
| [0005](0005-buyer-shop-view.md) | The buyer's shop IS the seller's shop — one component wrapped, and one connection predicate written once and applied at all seven visibility gates | catalog · RLS · RPCs · basket · Discover · UI |
| [0006](0006-deal-draft-lands-in-chat.md) | A company-addressed deal is announced by a message in the company chat, written by the same send step that already announces a person-addressed one — the inbox ticket stops being cut | deals · basket · messaging · RPCs · UI |
| [0007](0007-c2c-thread-atomicity.md) | Accepting a connection creates its chat thread(s) and seed message(s) in the same transaction as the relationship, not as a separate browser-side step | messaging · RPCs · RLS |
| [0008](0008-relationship-write-gate.md) | A suspended/ended relationship blocks new chat messages and new pricing/connect requests through one shared function every write path calls, not per-path checks | messaging · RLS · RPCs · Connect · compliance |
| [0009](0009-retire-connect-inbox.md) | A ticket means someone is waiting for consent — so a pricing ask to an already-connected company posts straight to chat, the deal-ticket branch is deleted, and `/connect/inbox` retires with only unconnected pricing asks left in Discover's accept gate | Connect · Discover · messaging · RPCs · deals · UI |
