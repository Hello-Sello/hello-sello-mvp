import { Sparkles } from "lucide-react";

/**
 * Buyer-Sella — an honest "coming soon" stub (18-CONTEXT.md, locked: "same
 * move as Sell/Allocate did for seller-Sella. No functional AI."). Sell's own
 * calendar-section stub (`SalesCalendarStub.tsx`) was superseded once the real
 * `DealCalendar` shipped, so there is no in-flow stub left to copy verbatim;
 * this mirrors its shape (a plain glass section, no interactivity, no data
 * read) plus `SellaPlaceholderBar.tsx`'s Sparkles icon — the one visual mark
 * already used platform-wide for "this is Sella".
 */
export function BuySellaStub() {
  return (
    <section className="glass flex flex-col items-center gap-2 rounded-3xl p-10 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand/10 text-brand-deep">
        <Sparkles size={18} strokeWidth={2} />
      </span>
      <h2 className="text-lg font-bold text-ink">Buyer-Sella</h2>
      <p className="max-w-sm text-sm text-ink-muted">
        Coming soon — Sella will surface buying insights here once she arrives in Phase 8.
      </p>
    </section>
  );
}
