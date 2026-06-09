/**
 * The Hello Sello logo (placeholder for a real logo image later). The double-l
 * in each word renders as "//" - a Sella brand sign. Tuned for the LIGHT glass
 * rail: deep-maroon letters with raspberry slashes so the mark pops on white.
 */
export function Wordmark({ stacked = false }: { stacked?: boolean }) {
  // `{"//"}` (not bare `//`) so JSX reads it as a string child, not a comment.
  const slash = <span className="text-brand">{"//"}</span>;

  if (stacked) {
    return (
      <span className="flex flex-col items-center text-[15px] font-black leading-[0.95] tracking-tight text-brand-deep">
        <span>He{slash}o</span>
        <span>se{slash}o</span>
      </span>
    );
  }

  return (
    <span className="text-lg font-black tracking-tight text-brand-deep">
      He{slash}o se{slash}o
    </span>
  );
}
