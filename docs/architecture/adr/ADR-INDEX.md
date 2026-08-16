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
