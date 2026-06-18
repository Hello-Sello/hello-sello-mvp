import Image from "next/image";

/**
 * The Hello Sello brand mark. Renders the real PNG logo asset.
 *
 * `stacked` — the rail slot (<Wordmark stacked /> in IconRail) shows the logo
 * at a compact square size to fit the narrow 76 px panel. The inline variant
 * is slightly wider for use in headers / marketing contexts.
 */
export function Wordmark({ stacked = false }: { stacked?: boolean }) {
  if (stacked) {
    return (
      <Image
        src="/hello-sello-logo.png"
        alt="Hello Sello"
        width={44}
        height={44}
        className="object-contain"
        priority
      />
    );
  }

  return (
    <Image
      src="/hello-sello-logo.png"
      alt="Hello Sello"
      width={120}
      height={40}
      className="object-contain"
      priority
    />
  );
}
