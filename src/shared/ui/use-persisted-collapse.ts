"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * An SSR-safe boolean "collapsed" flag persisted in localStorage, so a rail's
 * open/closed choice survives reloads and navigation ("remember it when I come
 * back"). Extracted from the global IconRail so BOTH collapse toggles - the
 * IconRail and the Connect chat list - share one tested mechanism instead of
 * two copies of the same localStorage + useSyncExternalStore dance.
 *
 * The server snapshot is always `false` (expanded), so the server HTML and the
 * first client paint agree - no hydration mismatch. Right after hydration the
 * store re-reads localStorage and flips to the saved value if it was collapsed.
 *
 * Same-tab writes fire a custom event named for the storage key so every hook
 * instance on that key re-reads; cross-tab writes arrive via the native
 * "storage" event. `toggle` reads localStorage directly (not the closed-over
 * `collapsed`) so its identity stays stable across renders.
 *
 * @param key localStorage key, e.g. "hs:rail-collapsed". "1" = collapsed.
 * @returns `[collapsed, toggle]`
 */
export function usePersistedCollapse(key: string): [boolean, () => void] {
  const eventName = `hs:persisted-collapse:${key}`;

  const subscribe = useCallback(
    (callback: () => void) => {
      window.addEventListener(eventName, callback);
      window.addEventListener("storage", callback);
      return () => {
        window.removeEventListener(eventName, callback);
        window.removeEventListener("storage", callback);
      };
    },
    [eventName],
  );

  const collapsed = useSyncExternalStore(
    subscribe,
    () => window.localStorage.getItem(key) === "1",
    () => false,
  );

  const toggle = useCallback(() => {
    const next = window.localStorage.getItem(key) !== "1";
    window.localStorage.setItem(key, next ? "1" : "0");
    window.dispatchEvent(new Event(eventName));
  }, [key, eventName]);

  return [collapsed, toggle];
}
