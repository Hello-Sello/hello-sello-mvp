"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_FAVORITES, DEMO_GROUPS, POLL_LIFETIME_MS, seedPolls } from "./data";
import type { DemandChannel, DemandGroup, DemandPoll, DemandResponse, SharedPoll } from "./types";

/**
 * Browser-local stores for the Demand demo: polls, favorites and groups all
 * live in localStorage only — there is no table behind this yet. A response
 * shows up in the creator's results only when it is submitted in the same
 * browser (fine for a live demo; a real build needs `demand_*` tables).
 *
 * The poll definition also travels in the share link (`?d=…`), so the landing
 * page itself renders on any device even though its answers stay local.
 */
function localStore<T>(key: string, seed: () => T, serverValue: T) {
  const listeners = new Set<() => void>();
  let cache: T | null = null;

  function read(): T {
    if (cache !== null) return cache;
    try {
      const raw = window.localStorage.getItem(key);
      cache = raw ? (JSON.parse(raw) as T) : seed();
    } catch {
      cache = seed();
    }
    return cache;
  }

  function write(next: T) {
    cache = next;
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // private mode / storage blocked — keep the in-memory copy for this tab
    }
    listeners.forEach((l) => l());
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      cache = null;
      listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }

  function use(): T {
    return useSyncExternalStore(subscribe, read, () => serverValue);
  }

  return { read, write, use };
}

const NO_POLLS: DemandPoll[] = [];
const NO_IDS: string[] = [];

const polls = localStore<DemandPoll[]>("hs:demand-polls:v2", () => seedPolls(Date.now()), NO_POLLS);
const favorites = localStore<string[]>("hs:demand-favorites:v1", () => DEFAULT_FAVORITES, NO_IDS);
const groups = localStore<DemandGroup[]>("hs:demand-groups:v1", () => DEMO_GROUPS, DEMO_GROUPS);

export const usePolls = polls.use;
export const useFavorites = favorites.use;
export const useGroups = groups.use;

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ---- polls --------------------------------------------------------------- */

export function createPoll(input: {
  title: string;
  productIds: string[];
  recipientIds: string[];
  channel: DemandChannel;
}): DemandPoll {
  const now = Date.now();
  const poll: DemandPoll = { ...input, id: uid("poll"), createdAt: now, expiresAt: now + POLL_LIFETIME_MS, responses: [] };
  polls.write([poll, ...polls.read()]);
  return poll;
}

export function deletePoll(id: string) {
  polls.write(polls.read().filter((p) => p.id !== id));
}

export function addResponse(shared: SharedPoll, response: Omit<DemandResponse, "id" | "submittedAt">) {
  const entry: DemandResponse = { ...response, id: uid("r"), submittedAt: Date.now() };
  const all = polls.read();
  if (all.some((p) => p.id === shared.id)) {
    polls.write(all.map((p) => (p.id === shared.id ? { ...p, responses: [...p.responses, entry] } : p)));
  } else {
    // opened from a link on another browser — keep the answer with a local copy
    polls.write([
      { ...shared, recipientIds: [], channel: "link", createdAt: Date.now(), responses: [entry] },
      ...all,
    ]);
  }
}

/* ---- favorites + groups -------------------------------------------------- */

/** Star / unstar a contact id ("c-…") or group id ("g-…"). */
export function toggleFavorite(id: string) {
  const current = favorites.read();
  favorites.write(current.includes(id) ? current.filter((f) => f !== id) : [...current, id]);
}

export function createGroup(name: string, memberIds: string[]): DemandGroup {
  const group: DemandGroup = { id: uid("g"), name, memberIds };
  groups.write([...groups.read(), group]);
  return group;
}

/* ---- share link encoding ------------------------------------------------- */

export function encodeShared(poll: SharedPoll): string {
  const json = JSON.stringify([poll.title, poll.productIds.map((id) => id.replace("flower-", "")), poll.expiresAt]);
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeShared(id: string, d: string | null): SharedPoll | null {
  if (!d) return null;
  try {
    const b64 = d.replace(/-/g, "+").replace(/_/g, "/");
    const [title, nums, expiresAt] = JSON.parse(decodeURIComponent(escape(atob(b64)))) as [string, string[], number];
    return { id, title, productIds: nums.map((n) => `flower-${n}`), expiresAt };
  } catch {
    return null;
  }
}

export function shareUrl(origin: string, poll: SharedPoll): string {
  return `${origin}/poll/${poll.id}?d=${encodeShared(poll)}`;
}
