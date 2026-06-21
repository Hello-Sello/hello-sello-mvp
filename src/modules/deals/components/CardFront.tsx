/**
 * Deal card - FRONT (V3 port, Phase 4 S2).
 *
 * The card is PURE DISPLAY (4.5.3): no Accept / Decline / Change buttons - those
 * live on the Sella strip (DealPin). This face only shows the deal facts. The two
 * corner controls (flip top-left, Edit top-right) are owned by DealCard and sit in
 * the maroon header corners; this face leaves header padding for them.
 *
 * Layout (04C V4 - slim shaded header; was the V3 maroon band), top→bottom:
 *   1. slim SHADED header: a soft deep-pink glass wash (NOT a solid band) holding the
 *      DEAL eyebrow + HS number, the value-net as a calm ink hero with a deep-pink
 *      hairline underline (the ONLY place net shows), and product count + status·version.
 *   1b. the offered-story line, moved BELOW the header so the header stays light.
 *   2. centered Seller → Buyer party row with "· you" on the viewer's side.
 *   3. dense product rows (ProductList).
 *   4. terms .sec - hairline top divider, 3-up grid (Delivery / Payment / Free).
 *   5. owner margin .sec - a SINGLE "Your avg. margin" row behind the "only you"
 *      lock (D-14: per-line margins + value-gross are GONE from the front).
 *   6. notes .sec - theirNote then myNote, EACH only when non-empty (else nothing).
 *   7. things .sec - read-only, shown ONLY when a `things[]` prop is passed (D-12).
 *
 * Everything is DERIVED or stored truth; the owner margin uses lineMargins, which
 * RLS already filters to the viewer's OWN side, so no counterpart value is read.
 */
import { Lock, ArrowRight, Check, Info } from "lucide-react";
import { docTerm, formatMoney, sumLineValue, averageMarginOf } from "../lib/derive";
import { paymentTermLabel } from "../lib/paymentTerms";
import { ProductList } from "./ProductList";
import type { DealCardView, ThingView } from "../types";

/** A margin % for the card, or "—" when not computable yet (D-04). */
function marginLabel(pct: number | null): string {
  return pct == null ? "—" : `${(pct * 100).toFixed(1)}%`;
}

function dateLabel(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

/** A human label for the card status, used in the maroon header pill. */
const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  withdrawn: "Withdrawn",
  confirmed: "Confirmed",
  amended: "Open",
  done: "Done",
  cancelled: "Cancelled",
};
function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? "Open";
}

/** Up-to-two-letter initials from a company name, for the note avatar / things chip. */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** One conditional note row. Renders nothing when the text is empty/blank. */
function Note({ company, text }: { company: string; text: string | null }) {
  if (!text || !text.trim()) return null; // empty -> render NOTHING (D-06)
  return (
    <div className="border-t border-ink/10 py-2 first:border-t-0">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-brand text-[9px] font-bold text-white">
          {initialsOf(company)}
        </span>
        <span className="text-[11px] font-semibold text-ink">{company}</span>
      </div>
      <div className="pl-6 text-[12px] text-ink/55">{text}</div>
    </div>
  );
}

/** A hairline-divided section (the V3 `.sec` primitive): one top divider, one inset. */
function Sec({ children }: { children: React.ReactNode }) {
  return <div className="mx-4 border-t border-ink/10 py-3">{children}</div>;
}

export function CardFront({
  data,
  things = [],
}: {
  data: DealCardView;
  /** read-only assigned THINGS (D-12); hidden when empty. Wired from the strip later (S1). */
  things?: ThingView[];
}) {
  const { card, sellerName, buyerName, lineItems, lineMargins, viewerSide, myNote, theirNote } = data;
  const term = docTerm(card.deal_type);

  // CARD-01 (OBS-1): the value is SUMMED live from the priced lines, never the
  // stale stored `value_net`. null = no priced line. This is the ONLY place the
  // net is shown on the front (D-14).
  const net = sumLineValue(lineItems);
  const valueNet = net == null ? "—" : formatMoney(net, card.currency);

  // CARD-03: two already-stored terms. free_delivery is a metadata boolean.
  const meta = (card.metadata ?? {}) as Record<string, unknown>;
  const freeDelivery = meta.free_delivery === true;
  const paymentLabel = paymentTermLabel(card.payment_terms_code);
  const hsNumber = card.hs_deal_number ?? `${term} · draft`;

  // NOTE-01: myNote/theirNote map to the viewer-relative seller/buyer company name.
  const myCompanyName = viewerSide === "seller" ? sellerName : buyerName;
  const theirCompanyName = viewerSide === "seller" ? buyerName : sellerName;

  // MRGN-01 (D-14): a SINGLE owner-only average; per-line margins are gone.
  const avgMargin = averageMarginOf(lineMargins.map((m) => m.marginPercent));

  const productCount = lineItems.length;
  const doneThings = things.filter((t) => t.status === "done").length;

  return (
    <div className="w-full max-w-full overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-black/5">
      {/* ---- SLIM SHADED HEADER (V4) - a soft deep-pink glass wash (NOT the old loud
           solid band) with a calm ink value hero + a deep-pink hairline underline. The
           shade gives the header presence and makes the deep-pink accent visible; the
           pl-8 on the eyebrow clears the two corner controls (flip / edit) above. ---- */}
      <div
        className="relative rounded-t-3xl px-4 pb-3 pt-3"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--color-brand-deep) 15%, #fff) 0%, color-mix(in srgb, var(--color-brand-soft) 34%, #fff) 100%)",
        }}
      >
        <div className="flex items-center gap-2 pl-8 font-mono">
          <span className="text-[9px] font-bold tracking-[0.18em] text-brand-deep">DEAL</span>
          <span className="truncate text-[10px] tracking-wide tabular-nums text-ink/55">{hsNumber}</span>
        </div>
        <div className="relative mt-1 inline-block pb-1.5">
          <span className="text-[26px] font-semibold leading-none tracking-tight tabular-nums text-ink">
            {valueNet}
          </span>
          <span className="absolute bottom-0 left-0 h-[2px] w-9 rounded bg-brand-deep" />
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[10px] text-ink/55">
            {productCount} {productCount === 1 ? "product" : "products"}
          </span>
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold text-brand-deep"
            style={{ background: "color-mix(in srgb, var(--color-brand-deep) 10%, transparent)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            {statusLabel(card.status)} · v{card.version}
          </span>
        </div>
      </div>

      {/* offered-story line - moved BELOW the slim header so the header stays light */}
      <p className="px-4 pt-2.5 text-[11px] leading-snug text-ink/55">
        On <span className="font-semibold text-ink">{dateLabel(card.created_at)}</span>,{" "}
        <span className="font-semibold text-ink">{sellerName}</span> offered{" "}
        <span className="font-semibold text-ink">{buyerName}</span>
        {viewerSide === "buyer" && <span className="font-semibold text-brand-deep"> · you</span>}
      </p>

      {/* ---- PARTY ROW (centered) ---- */}
      <div className="flex items-center justify-center gap-2.5 border-b border-ink/10 px-4 py-3">
        <div className="text-center">
          <div className="text-[9.5px] uppercase tracking-wider text-ink/45">Seller</div>
          <div className="text-[13px] font-bold text-ink">
            {sellerName}
            {viewerSide === "seller" && <span className="ml-1 text-[10px] font-bold text-brand">· you</span>}
          </div>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-brand" strokeWidth={2.2} />
        <div className="text-center">
          <div className="text-[9.5px] uppercase tracking-wider text-ink/45">Buyer</div>
          <div className="text-[13px] font-bold text-ink">
            {buyerName}
            {viewerSide === "buyer" && <span className="ml-1 text-[10px] font-bold text-brand">· you</span>}
          </div>
        </div>
      </div>

      {/* ---- PRODUCT LINES (dense V3 rows) ---- */}
      <div className="px-4 pt-2">
        <ProductList items={lineItems} />
      </div>

      {/* ---- TERMS - 3-up hairline section ---- */}
      <Sec>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-ink/45">Delivery</div>
            <div className="text-[13px] font-semibold tabular-nums text-ink">
              {dateLabel(card.delivery_date_target)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-ink/45">Payment</div>
            <div className="text-[13px] font-semibold text-ink">{paymentLabel}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-ink/45">Free delivery</div>
            <div className="text-[13px] font-semibold text-ink">{freeDelivery ? "Yes" : "No"}</div>
          </div>
        </div>
      </Sec>

      {/* ---- OWNER MARGIN - a SINGLE owner-only row behind the "only you" lock (D-14) ---- */}
      <Sec>
        <div
          className="flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-[12px]"
          style={{
            borderColor: "color-mix(in srgb, var(--color-brand-deep) 32%, transparent)",
            background: "color-mix(in srgb, var(--color-brand-deep) 5%, transparent)",
          }}
        >
          <Lock className="h-[12px] w-[12px] text-brand-deep" />
          <span className="text-ink/55">Your avg. margin</span>
          <span className="ml-auto font-bold tabular-nums text-brand-deep">{marginLabel(avgMargin)}</span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-deep/70">
            only you
          </span>
        </div>
      </Sec>

      {/* ---- NOTES (conditional: render only the non-empty ones) ---- */}
      {((theirNote && theirNote.trim()) || (myNote && myNote.trim())) && (
        <Sec>
          <Note company={theirCompanyName} text={theirNote} />
          <Note company={myCompanyName} text={myNote} />
        </Sec>
      )}

      {/* ---- THINGS (read-only) - shown ONLY when things are passed (D-12) ---- */}
      {things.length > 0 && (
        <Sec>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Things</span>
            <span className="text-[11px] font-semibold tabular-nums text-brand">
              {doneThings} / {things.length} done
            </span>
          </div>
          {things.map((t) => {
            const done = t.status === "done";
            return (
              <div key={t.id} className="flex items-center gap-2 py-1 text-[12.5px]">
                <span
                  className={`flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded border-[1.5px] ${
                    done ? "border-success bg-success" : "border-ink/15"
                  }`}
                  // read-only checkbox - styled div, never an input (V3 rule)
                  style={{ pointerEvents: "none" }}
                >
                  {done && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                </span>
                <span className={`flex-1 ${done ? "text-ink/45 line-through" : "text-ink"}`}>
                  {t.title}
                </span>
              </div>
            );
          })}
          <div className="mt-2 flex items-center gap-1 text-[10.5px] italic text-ink/45">
            <Info className="h-[11px] w-[11px] shrink-0" /> Things are managed from the Deal Room.
          </div>
        </Sec>
      )}

      <div className="h-2" />
    </div>
  );
}
