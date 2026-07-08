import {
  Leaf, Heart, ShieldCheck, ShoppingCart, FlaskConical, FileText, Download, Check,
} from "lucide-react";

/**
 * Product flip card (§6 "here's the inside"). A premium take on the real
 * Present product card (src/modules/catalog/components/ProductCard.tsx): a
 * medical-cannabis listing whose FRONT shows the cover, potency strip, specs,
 * and price, and whose BACK shows the documents / lab results. It auto-flips
 * front <-> back on a loop (pure CSS 3D, see `.pcard` in globals.css), so a
 * logged-out visitor sees "what's behind the gate" without interacting.
 *
 * The product, batch, numbers, and documents are ILLUSTRATIVE / FICTIONAL
 * (D-06 stand-in), consistent with the dummy hero + trusted-by strip.
 */

const POTENCY: [string, string][] = [
  ["THC", "22.4%"],
  ["CBD", "0.8%"],
  ["CBG", "0.3%"],
  ["Terp", "2.1%"],
];

const SPECS: [string, string][] = [
  ["Dominance", "Indica"],
  ["Origin", "Canada"],
  ["Irradiation", "Beta (β)"],
];

const DOCS: [string, string][] = [
  ["Certificate of Analysis", "PDF · 1.2 MB"],
  ["EU-GMP Certificate", "PDF · 480 KB"],
  ["Safety Data Sheet", "PDF · 210 KB"],
  ["Batch record", "PDF · 96 KB"],
];

const CERTS = ["EU-GMP", "GACP", "ISO 17025", "Lab-tested"];

const CARD_FACE =
  "pcard-face flex flex-col overflow-hidden rounded-[26px] bg-white shadow-[0_45px_90px_-45px_rgba(122,22,56,0.6)] ring-1 ring-black/[0.06]";

export function ProductFlipCard() {
  return (
    <div className="relative flex items-center justify-center py-8">
      {/* soft brand glow behind the card */}
      <div
        className="pointer-events-none absolute h-80 w-80 rounded-full bg-brand-soft/45 blur-[90px]"
        aria-hidden
      />

      {/* floating accent chips - desktop flair, hidden on small screens */}
      <div className="pointer-events-none absolute left-[6%] top-10 hidden -rotate-6 lg:block">
        <div className="glass flex items-center gap-2 rounded-2xl px-4 py-2.5 shadow-[0_20px_50px_-24px_rgba(122,22,56,0.5)]">
          <ShieldCheck className="text-success" size={18} />
          <span className="text-sm font-semibold text-ink">EU-GMP certified</span>
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-14 right-[6%] hidden rotate-6 lg:block">
        <div className="glass flex items-center gap-2 rounded-2xl px-4 py-2.5 shadow-[0_20px_50px_-24px_rgba(122,22,56,0.5)]">
          <FlaskConical className="text-brand" size={18} />
          <span className="text-sm font-semibold text-ink">Lab-tested every batch</span>
        </div>
      </div>

      {/* the flip card */}
      <div className="pcard relative z-10 h-[548px] w-[350px] max-w-full" aria-hidden>
        <div className="pcard-inner">
          {/* ---------- FRONT ---------- */}
          <article className={CARD_FACE}>
            <div className="relative h-[186px] shrink-0 overflow-hidden bg-gradient-to-br from-brand-deep via-brand to-brand-soft">
              <Leaf className="absolute -bottom-8 -right-6 text-white/15" size={190} strokeWidth={1} aria-hidden />
              <div className="absolute left-4 top-4 flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-deep">
                <ShieldCheck size={12} /> EU-GMP
              </div>
              <span className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-white/85 text-brand shadow-sm">
                <Heart size={15} />
              </span>
              <span className="absolute bottom-3.5 left-4 rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
                Indica · Dried flower
              </span>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-extrabold leading-tight text-brand-deep">
                    Northern Lights
                  </h3>
                  <p className="truncate text-xs text-ink-muted">Canadian Craft · Batch NL-2409</p>
                </div>
                <span className="shrink-0 text-lg leading-none">🇨🇦</span>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                {POTENCY.map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl bg-brand/[0.04] py-2 text-center ring-1 ring-brand/[0.06]"
                  >
                    <b className="block text-sm font-extrabold tabular-nums text-brand-deep">{value}</b>
                    <small className="text-[8px] font-bold uppercase tracking-wide text-ink/45">{label}</small>
                  </div>
                ))}
              </div>

              <dl className="space-y-1.5 text-xs">
                {SPECS.map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between border-b border-ink/[0.07] pb-1.5">
                    <dt className="text-ink-muted">{key}</dt>
                    <dd className="font-semibold text-ink">{value}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-auto">
                <div className="flex items-end justify-between">
                  <div>
                    <span className="block text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                      from
                    </span>
                    <span className="text-2xl font-extrabold tabular-nums text-brand-deep">
                      €7.20<span className="text-sm font-bold">/g</span>
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    {["10g", "25g", "50g"].map((size, i) => (
                      <span
                        key={size}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                          i === 1 ? "bg-brand text-white" : "bg-brand/10 text-brand-deep"
                        }`}
                      >
                        {size}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full bg-brand py-2.5 text-sm font-bold text-white">
                  <ShoppingCart size={15} /> Add to basket
                </div>
              </div>
            </div>
          </article>

          {/* ---------- BACK — documents & lab results ---------- */}
          <article className={`${CARD_FACE} pcard-back`}>
            <div className="flex items-center gap-2.5 border-b border-ink/10 bg-gradient-to-r from-brand-soft/25 to-transparent px-4 py-3.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand/10 text-brand">
                <FlaskConical size={17} />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-ink">Documents &amp; lab results</h3>
                <p className="truncate text-xs text-ink-muted">Northern Lights · Batch NL-2409</p>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
              {DOCS.map(([name, meta]) => (
                <div
                  key={name}
                  className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white px-3 py-2.5"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
                    <FileText size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{name}</span>
                    <span className="text-[11px] text-ink-muted">{meta}</span>
                  </div>
                  <Download size={15} className="shrink-0 text-ink/40" aria-hidden />
                </div>
              ))}

              <div className="mt-auto">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-ink/45">
                  Certifications
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {CERTS.map((cert) => (
                    <span
                      key={cert}
                      className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-bold text-success"
                    >
                      <Check size={11} /> {cert}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
