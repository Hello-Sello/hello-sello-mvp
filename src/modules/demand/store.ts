"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_FAVORITES, DEMO_GROUPS, POLL_LIFETIME_MS } from "./data";
import type { DemandChannel, DemandGroup, DemandPoll, DemandResponse, SharedPoll } from "./types";

/**
 * Browser-local stores for the Demand demo: polls, favorites and groups all
 * live in localStorage only — there is no table behind this yet. Every open
 * tab of the same browser updates live (the `storage` event), which is what
 * makes the group grid "live" in a demo. Other devices do NOT see each other's
 * rows until polls move to a real table.
 *
 * The poll definition (incl. the invited pharmacies) travels in the link
 * (`?d=…`), so the poll page renders on any device.
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

// v3: starts empty — the old example polls (v1/v2 keys) are simply never read again
const polls = localStore<DemandPoll[]>("hs:demand-polls:v3", () => [], NO_POLLS);
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

/**
 * Save one pharmacy's row. An invited contact (or an earlier walk-in, by
 * response id) overwrites its own row instead of adding a second one.
 * Returns the saved row's id.
 */
export function saveResponse(
  shared: SharedPoll,
  row: Omit<DemandResponse, "id" | "submittedAt"> & { id?: string },
): string {
  const entry: DemandResponse = { ...row, id: row.id ?? uid("r"), submittedAt: Date.now() };
  const same = (r: DemandResponse) =>
    r.id === entry.id || (entry.contactId !== undefined && r.contactId === entry.contactId);
  const all = polls.read();
  const existing = all.find((p) => p.id === shared.id);
  if (existing) {
    const responses = existing.responses.some(same)
      ? existing.responses.map((r) => (same(r) ? entry : r))
      : [...existing.responses, entry];
    polls.write(all.map((p) => (p.id === shared.id ? { ...p, responses } : p)));
  } else {
    // opened from a link in another browser — keep the row with a local copy
    polls.write([{ ...shared, channel: "link", createdAt: Date.now(), responses: [entry] }, ...all]);
  }
  return entry.id;
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

const num = (id: string) => id.replace(/^(flower|c)-/, "");

export function encodeShared(poll: SharedPoll): string {
  const json = JSON.stringify([poll.title, poll.productIds.map(num), poll.expiresAt, poll.recipientIds.map(num)]);
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeShared(id: string, d: string | null): SharedPoll | null {
  if (!d) return null;
  try {
    const b64 = d.replace(/-/g, "+").replace(/_/g, "/");
    const [title, products, expiresAt, recipients = []] = JSON.parse(decodeURIComponent(escape(atob(b64)))) as [
      string,
      string[],
      number,
      string[]?,
    ];
    return {
      id,
      title,
      productIds: products.map((n) => `flower-${n}`),
      recipientIds: recipients.map((n) => `c-${n}`),
      expiresAt,
    };
  } catch {
    return null;
  }
}

/** The group link; with `me` it is that pharmacy's personal link (their row is pre-selected). */
export function shareUrl(origin: string, poll: SharedPoll, me?: string): string {
  return `${origin}/poll/${poll.id}?d=${encodeShared(poll)}${me ? `&me=${num(me)}` : ""}`;
}
