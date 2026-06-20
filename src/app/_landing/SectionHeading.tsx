import { Reveal } from "./Reveal";

/**
 * Shared section header (eyebrow + heading + optional subhead) for the landing.
 * DRYs the repeated eyebrow/h2 markup across ValueProps, HowItWorks, FAQ and the
 * social-proof block so the type scale and spacing are defined once. Renders an
 * <h2> only — the page's single <h1> lives in the Hero (SEO + the E2E heading
 * contract), so this must never emit an h1.
 */
export function SectionHeading({
  eyebrow,
  title,
  sub,
  align = "center",
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  align?: "center" | "left";
}) {
  const centered = align === "center";
  return (
    <Reveal
      className={`max-w-2xl ${centered ? "mx-auto text-center" : "text-left"}`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
        {title}
      </h2>
      {sub && <p className="mt-3 text-base text-ink-muted">{sub}</p>}
    </Reveal>
  );
}
