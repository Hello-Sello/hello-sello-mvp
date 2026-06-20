"use client";

/**
 * Footer re-open control for the cookie-consent banner (LAND-03). After a visitor
 * has made a choice the banner self-hides; this button lets them change it. It
 * dispatches a window `CustomEvent("hs-open-cookie-settings")` that CookieBanner
 * listens for and flips its `decided` state back to false — a minimal framework
 * hook, not a feature. Styled as a footer link (matches the sibling legal links)
 * but kept a real <button> because it triggers an action, not a navigation.
 */
export function CookieSettingsButton() {
  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(new CustomEvent("hs-open-cookie-settings"))
      }
      className="text-left transition hover:text-brand"
    >
      Cookie settings
    </button>
  );
}
