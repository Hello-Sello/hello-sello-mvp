import type { Metadata } from "next";
import { LegalPageLayout } from "../_landing/LegalPageLayout";

// Placeholder copy stays unindexed until counsel/eRecht24 review (D-11).
export const metadata: Metadata = {
  title: "Datenschutzerklärung — Hello Sello",
  robots: { index: false },
};

/**
 * Datenschutzerklärung (German privacy policy). Its OWN page (D-12) — never
 * merged into the cookie banner; the banner only links here. Framed to the GDPR
 * Art. 13/14 disclosure duties, but the clause text is NOT invented (LAND-04):
 * placeholder section headings only, to be filled from counsel/eRecht24 before
 * launch.
 */
export default function DatenschutzPage() {
  return (
    <LegalPageLayout title="Datenschutzerklärung">
      <p>
        Diese Datenschutzerklärung informiert gemäß Art. 13 und Art. 14 DSGVO über
        die Verarbeitung personenbezogener Daten. Der nachfolgende Aufbau ist ein
        Platzhalter — der finale Text folgt vor Launch.
      </p>

      <Section
        heading="Verantwortlicher"
        hint="Name + Anschrift des Verantwortlichen (entspricht dem Impressum)"
      />
      <Section
        heading="Verarbeitungszwecke und Rechtsgrundlagen"
        hint="Zwecke der Verarbeitung + jeweilige Rechtsgrundlage nach Art. 6 DSGVO"
      />
      <Section
        heading="Empfänger und Auftragsverarbeiter"
        hint="Hosting, E-Mail, Auth — Liste der Auftragsverarbeiter (Art. 28 DSGVO)"
      />
      <Section
        heading="Speicherdauer"
        hint="Speicher- und Löschfristen je Verarbeitungskategorie"
      />
      <Section
        heading="Betroffenenrechte"
        hint="Auskunft, Berichtigung, Löschung, Einschränkung, Widerspruch, Datenübertragbarkeit, Beschwerderecht bei der Aufsichtsbehörde"
      />
      <Section
        heading="Cookies und Einwilligung"
        hint="Nur essenzielle Cookies in dieser Phase — Einwilligungs-Banner verlinkt hierher"
      />
    </LegalPageLayout>
  );
}

/**
 * One placeholder privacy section: a heading plus a clearly-marked
 * [PLACEHOLDER — …] hint describing what vetted copy goes here. Co-located
 * single-caller primitive — no invented clause text.
 */
function Section({ heading, hint }: { heading: string; hint: string }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-ink">{heading}</h2>
      <p className="mt-1">[PLACEHOLDER — {hint}]</p>
    </section>
  );
}
