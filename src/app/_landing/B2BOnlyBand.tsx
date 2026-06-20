import { Reveal } from "./Reveal";

/**
 * B2B-only band (§8, LAND-02). The page's signature full-bleed gradient band:
 * white type on raspberry. Renders the load-bearing German substring
 * `nicht an Verbraucher` VERBATIM — the phrase that preserves the BFSG
 * B2B-exemption — with English framing per D-09. The German string is exact and
 * must not be paraphrased.
 */
export function B2BOnlyBand() {
  return (
    <section className="px-6 py-6">
      <Reveal className="mx-auto max-w-6xl">
        <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand to-brand-deep px-8 py-14 text-center shadow-[0_30px_80px_-30px_rgba(118,0,45,0.55)]">
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            B2B only · <span className="text-white/95">nicht an Verbraucher</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-white/85">
            Hello Sello is a closed platform for verified businesses. We do not
            sell to or contract with consumers.
          </p>
        </div>
      </Reveal>
    </section>
  );
}
