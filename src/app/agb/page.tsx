import type { Metadata } from "next";
import { LegalPageLayout } from "../_landing/LegalPageLayout";

// Placeholder copy stays unindexed until counsel/eRecht24 review (D-11).
export const metadata: Metadata = {
  title: "AGB — Hello Sello",
  robots: { index: false },
};

/**
 * Allgemeine Geschäftsbedingungen (German general terms & conditions). Framed as
 * German GTC under §§ 305–310 BGB (D-12) — NEVER the US-style "Terms of Service".
 * Structure-only scaffold (LAND-04): section headings + placeholders, no invented
 * clause text. The §§ 305–310 BGB framing line is the load-bearing string the
 * e2e guard asserts.
 */
export default function AgbPage() {
  return (
    <LegalPageLayout title="Allgemeine Geschäftsbedingungen (AGB)">
      <p>
        Allgemeine Geschäftsbedingungen gemäß §§ 305–310 BGB für die Nutzung der
        B2B-Plattform Hello Sello. Der nachfolgende Aufbau ist ein Platzhalter — der
        finale Text folgt vor Launch.
      </p>

      <Section
        heading="Geltungsbereich"
        hint="Anwendungsbereich gegenüber Unternehmern (B2B) gem. § 310 Abs. 1 BGB"
      />
      <Section
        heading="Vertragsschluss"
        hint="Zustandekommen des Nutzungsvertrags + Registrierung verifizierter Unternehmen"
      />
      <Section
        heading="Leistungen der Plattform"
        hint="Umfang der bereitgestellten Marktplatz-Funktionen (Discover / Connect / Deal)"
      />
      <Section
        heading="Pflichten der Nutzer"
        hint="Mitwirkungs- und Sorgfaltspflichten der teilnehmenden Unternehmen"
      />
      <Section
        heading="Haftung"
        hint="Haftungsregelung im Rahmen der §§ 305–310 BGB (Inhaltskontrolle)"
      />
      <Section
        heading="Laufzeit und Kündigung"
        hint="Vertragslaufzeit, Kündigungsfristen und -form"
      />
      <Section
        heading="Schlussbestimmungen"
        hint="Anwendbares Recht, Gerichtsstand, salvatorische Klausel"
      />
    </LegalPageLayout>
  );
}

/**
 * One placeholder AGB clause section: heading + a [PLACEHOLDER — …] hint of what
 * vetted clause goes here. Co-located single-caller primitive — no invented
 * clause text (LAND-04).
 */
function Section({ heading, hint }: { heading: string; hint: string }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-ink">{heading}</h2>
      <p className="mt-1">[PLACEHOLDER — {hint}]</p>
    </section>
  );
}
