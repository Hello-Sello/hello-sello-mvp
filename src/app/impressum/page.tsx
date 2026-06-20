import type { Metadata } from "next";
import { LegalPageLayout } from "../_landing/LegalPageLayout";

// Placeholder copy stays unindexed until counsel/eRecht24 review (D-11).
export const metadata: Metadata = {
  title: "Impressum — Hello Sello",
  robots: { index: false },
};

/**
 * Impressum (German legal-notice page). Structure-only scaffold (LAND-04 —
 * wording NOT invented). The citation MUST read `§ 5 DDG` (the
 * Digitale-Dienste-Gesetz replaced the TMG on 14 May 2024) — any `TMG` string is
 * a stale-law bug and itself an Abmahnung risk (D-11 / e2e guard). The six D-13
 * fields are filled from company-registration data pre-launch.
 */
export default function ImpressumPage() {
  return (
    <LegalPageLayout title="Impressum">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">
        Angaben gemäß § 5 DDG
      </p>

      <dl className="space-y-4">
        <Field
          term="Firma / Rechtsform"
          value="[PLACEHOLDER — registrierter Name + Rechtsform]"
        />
        <Field
          term="Anschrift"
          value="[PLACEHOLDER — eingetragene Postanschrift]"
        />
        <Field
          term="Vertreten durch"
          value="[PLACEHOLDER — Geschäftsführer]"
        />
        <Field
          term="Handelsregister"
          value="[PLACEHOLDER — Registergericht + HRB-Nummer]"
        />
        <Field
          term="USt-IdNr."
          value="[PLACEHOLDER — USt-IdNr. gem. § 27a UStG]"
        />
        <Field
          term="Kontakt"
          value="[PLACEHOLDER — E-Mail + schnelle Kontaktmöglichkeit]"
        />
      </dl>
    </LegalPageLayout>
  );
}

/**
 * One Impressum term/value row. Co-located (single caller) — the D-13 fields are
 * a flat list, so a tiny <dt>/<dd> primitive keeps the page DRY without a shared
 * abstraction.
 */
function Field({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="font-semibold text-ink">{term}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}
