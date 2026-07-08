"use client";

import { useEffect, useState } from "react";

/**
 * Library-free, hydration-safe cookie-consent banner (LAND-03).
 *
 * Persistence — `localStorage`, NOT a cookie (RESEARCH A2): the consent record is
 * a functional preference, not a tracking signal, so storing it client-side
 * avoids a per-request cookie and the "consent-for-the-consent-cookie" loop.
 * Key `hs-cookie-consent` = "accepted" | "rejected".
 *
 * Hydration safety (Pitfall 2): the server has no `localStorage`, so `decided`
 * starts `null` ("storage not yet checked") and we render NOTHING until a
 * post-mount `useEffect` resolves it. Otherwise the server HTML (banner present)
 * and the client HTML (banner hidden because a choice is stored) mismatch.
 *
 * Equal prominence (D-12 / TDDDG §25 — the #1 German Abmahnung trigger): Accept
 * and Reject are BOTH real <button> elements that share ONE identical className
 * (BUTTON_CLASS). Neither is a filled brand primary or a faint link. The
 * e2e `-g "cookie buttons equal"` case sorts each button's size/text class tokens
 * and asserts they are identical, so they must come from the same source string.
 *
 * Scope: governs only essential cookies this phase. The `choose()` gate is the
 * drop-in framework for analytics later — wire optional categories into the same
 * persistence/consent path (a content swap, not a rebuild). No analytics now.
 */

const CONSENT_KEY = "hs-cookie-consent";
const REOPEN_EVENT = "hs-open-cookie-settings";

// Equal prominence: ONE shared className for both buttons (D-12). If a future
// pass restyles them, change this single constant so they stay identical.
const BUTTON_CLASS =
  "flex-1 rounded-xl border border-ink/30 bg-surface/60 px-4 py-2 text-sm " +
  "font-semibold text-ink backdrop-blur transition hover:border-brand hover:text-brand";

export function CookieBanner() {
  // null = haven't read storage yet → render nothing on first paint.
  const [decided, setDecided] = useState<boolean | null>(null);

  useEffect(() => {
    // Storage can throw (Safari Private Mode, storage-blocked/embedded contexts).
    // A throw here would blank the public front door, so fail safe: if we can't
    // read a prior choice, show the banner (default to "not decided").
    let priorChoice = false;
    try {
      priorChoice = localStorage.getItem(CONSENT_KEY) !== null;
    } catch {
      priorChoice = false;
    }
    setDecided(priorChoice);
  }, []);

  // Footer "Cookie settings" dispatches this to re-open after a choice.
  useEffect(() => {
    const reopen = () => setDecided(false);
    window.addEventListener(REOPEN_EVENT, reopen);
    return () => window.removeEventListener(REOPEN_EVENT, reopen);
  }, []);

  function choose(value: "accepted" | "rejected") {
    // Extension point: when analytics lands, branch optional categories off the
    // stored value here before persisting. Essential-only for now.
    // Guard storage: if it throws we still dismiss for this session — the choice
    // just won't persist across reloads, which is an acceptable fail-safe.
    try {
      localStorage.setItem(CONSENT_KEY, value);
    } catch {
      // storage unavailable — nothing to persist; dismiss for this session.
    }
    setDecided(true);
  }

  if (decided === null || decided === true) return null;

  return (
    // role="region" (not "dialog"): the banner does NOT trap focus or block the
    // page (you can keep reading/scrolling), so a modal-dialog contract would be
    // a false a11y promise. A labelled region is the honest semantic.
    <div
      role="region"
      aria-label="Cookie consent"
      className="fixed inset-x-4 bottom-4 z-[60] mx-auto max-w-xl glass-strong rounded-2xl border border-ink/10 p-5 shadow-[0_30px_80px_-20px_rgba(118,0,45,0.4)]"
    >
      <p className="text-sm text-ink">
        <b className="font-semibold">We use cookies.</b> Essential cookies keep
        you signed in. We&apos;ll only set optional cookies (e.g. analytics) with
        your consent. Rejecting is as easy as accepting. See our{" "}
        <a href="/datenschutz" className="font-semibold text-brand hover:underline">
          Datenschutz
        </a>
        .
      </p>
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={() => choose("rejected")}
          className={BUTTON_CLASS}
        >
          Reject
        </button>
        <button
          type="button"
          onClick={() => choose("accepted")}
          className={BUTTON_CLASS}
        >
          Accept
        </button>
      </div>
    </div>
  );
}
