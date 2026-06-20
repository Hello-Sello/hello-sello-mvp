/**
 * B2B-only band (§8, LAND-02). Renders the load-bearing German substring
 * `nicht an Verbraucher` verbatim — the phrase that preserves the BFSG
 * B2B-exemption — with English framing per D-09. The German string is exact and
 * must not be paraphrased.
 */
export function B2BOnlyBand() {
  return (
    <section className="bg-brand-soft/10 px-6 py-14 text-center">
      <p className="mx-auto max-w-2xl text-lg font-semibold text-ink">
        Hello Sello is a B2B platform for verified companies —{" "}
        <span className="text-brand">nicht an Verbraucher</span>.
      </p>
      <p className="mx-auto mt-2 max-w-xl text-sm text-ink-muted">
        Access is limited to verified businesses. We do not sell to consumers.
      </p>
    </section>
  );
}
