"use client";

/**
 * TranslateButton (04A · D-05) - the translate affordance on the bottom tier of
 * the deal strip, sitting in the old "Workspace ↗" slot.
 *
 * It is a PLACEHOLDER: it LOOKS like a real, professional translator control
 * (a quiet, icon-led, ring-1 header affordance carrying a CJK glyph), but it is
 * NOT wired to any translation backend this phase. Real translation is deferred.
 *
 * Presentational only: no data, no reads/actions, no network, no state. The host
 * (04A-04) places it into the strip and tunes layout via `className`.
 */

type TranslateButtonProps = {
  /** Forwarded to the root button for layout tuning by the host (e.g. `ml-auto`). */
  className?: string;
};

export function TranslateButton({ className = "" }: TranslateButtonProps) {
  return (
    <button
      type="button"
      aria-label="Translate"
      title="Translate (coming soon)"
      // Placeholder: no translation logic is wired this phase (D-05).
      onClick={() => {}}
      className={`flex size-9 shrink-0 items-center justify-center rounded-full text-base font-semibold leading-none text-ink/55 ring-1 ring-black/5 transition hover:text-brand hover:ring-brand/20 ${className}`.trim()}
    >
      {/* CJK glyph (Chinese / Japanese 文 = "writing / language") - the
          professional translate mark, not the prototype's lucide icon. */}
      <span aria-hidden="true" className="font-sans">
        文
      </span>
    </button>
  );
}
