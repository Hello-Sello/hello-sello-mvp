"use client";

import { useSyncExternalStore } from "react";
import { POLL_LIFETIME_MS, seedPolls } from "./data";
import type { DemandPoll, DemandResponse, SharedPoll } from "./types";

/**
 * Browser-local poll store for the Demand demo. Polls and responses live in
 * localStorage only — there is no table behind this yet. That means a response
 * shows up in the creator's results only when it is submitted in the same
 * browser (fine for a live demo; a real build needs a `demand_polls` table).
 *
 * The poll definition also travels in the share link (`?d=…`), so the landing
 * page itself renders on any device even though its answers stay local.
 */
const KEY = "hs:demand-polls:v1";
const listeners = new Set<() => void>();
let cache: DemandPoll[] | null = null;
const EMPTY: DemandPoll[] = [];

function read(): DemandPoll[] {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as DemandPoll[]) : seedPolls(Date.now());
  } catch {
    cache = seedPolls(Date.now());
  }
  return cache;
}

function write(next: DemandPoll[]) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // private mode / storage blocked — keep the in-memory copy for this tab
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    cache = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function usePolls(): DemandPoll[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createPoll(input: {
  title: string;
  productIds: string[];
  recipientIds: string[];
}): DemandPoll {
  const now = Date.now();
  const poll: DemandPoll = {
    id: uid("poll"),
    title: input.title,
    productIds: input.productIds,
    recipientIds: input.recipientIds,
    createdAt: now,
    expiresAt: now + POLL_LIFETIME_MS,
    responses: [],
  };
  write([poll, ...read()]);
  return poll;
}

export function deletePoll(id: string) {
  write(read().filter((p) => p.id !== id));
}

export function addResponse(
  shared: SharedPoll,
  response: Omit<DemandResponse, "id" | "submittedAt">,
) {
  const entry: DemandResponse = { ...response, id: uid("r"), submittedAt: Date.now() };
  const polls = read();
  const existing = polls.find((p) => p.id === shared.id);
  if (existing) {
    write(
      polls.map((p) => (p.id === shared.id ? { ...p, responses: [...p.responses, entry] } : p)),
    );
  } else {
    // opened from a link on another browser — keep the answer with a local copy
    write([
      { ...shared, recipientIds: [], createdAt: Date.now(), responses: [entry] },
      ...polls,
    ]);
  }
}

/* ---- share link encoding ------------------------------------------------ */

export function encodeShared(poll: SharedPoll): string {
  const json = JSON.stringify([poll.title, poll.productIds.map((id) => id.replace("flower-", "")), poll.expiresAt]);
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeShared(id: string, d: string | null): SharedPoll | null {
  if (!d) return null;
  try {
    const b64 = d.replace(/-/g, "+").replace(/_/g, "/");
    const [title, nums, expiresAt] = JSON.parse(decodeURIComponent(escape(atob(b64)))) as [
      string,
      string[],
      number,
    ];
    return { id, title, productIds: nums.map((n) => `flower-${n}`), expiresAt };
  } catch {
    return null;
  }
}

export function shareUrl(origin: string, poll: SharedPoll): string {
  return `${origin}/poll/${poll.id}?d=${encodeShared(poll)}`;
}
