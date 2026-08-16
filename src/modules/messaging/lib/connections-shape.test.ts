/**
 * RED-first unit test for the pure connections-shape helpers (phase 04B / plan
 * 01). Mirrors the pure-unit pattern in deals/lib/recipient.test.ts and
 * derive.test.ts: vitest, a pure import of helpers that do not exist yet, no
 * Supabase, no React, no DB.
 *
 * These four helpers carry the load-bearing rules of the new-chat picker that
 * MUST be provable without a database:
 *   - canonicalPair       -> the DB person_a_id < person_b_id ordering (D-05)
 *   - isNewConnection     -> the 30-day recency window (D-03)
 *   - relativeDayLabel    -> the "Today / N days ago" section labels (D-03)
 *   - countOpenDealsByRelationship -> the truthful open-deal badge count (D-06)
 */
import { describe, it, expect } from "vitest";
import {
  canonicalPair,
  isNewConnection,
  relativeDayLabel,
  countOpenDealsByRelationship,
} from "./connections-shape";

describe("canonicalPair (D-05 - person_a_id < person_b_id ordering)", () => {
  it("sorts a reversed pair into ascending order", () => {
    expect(canonicalPair("b", "a")).toEqual(["a", "b"]);
  });

  it("keeps an already-ascending pair unchanged", () => {
    expect(canonicalPair("a", "b")).toEqual(["a", "b"]);
  });

  it("orders real uuid-like ids lexicographically", () => {
    const lo = "00000000-0000-0000-0000-000000000001";
    const hi = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    expect(canonicalPair(hi, lo)).toEqual([lo, hi]);
  });
});

describe("isNewConnection (D-03 - 30-day default recency window)", () => {
  const now = new Date("2026-06-21T12:00:00Z");

  it("is true for a connection made today", () => {
    expect(isNewConnection("2026-06-21T09:00:00Z", now)).toBe(true);
  });

  it("is true at exactly 30 days inside the default window", () => {
    expect(isNewConnection("2026-05-22T12:00:00Z", now)).toBe(true);
  });

  it("is false at 31 days (just outside the default window)", () => {
    expect(isNewConnection("2026-05-21T11:00:00Z", now)).toBe(false);
  });

  it("defaults the window to 30 days when the 3rd arg is omitted", () => {
    // 40 days ago -> outside the implicit 30-day window
    expect(isNewConnection("2026-05-12T12:00:00Z", now)).toBe(false);
  });

  it("honours a custom window when supplied", () => {
    // 40 days ago, window widened to 60 -> inside
    expect(isNewConnection("2026-05-12T12:00:00Z", now, 60)).toBe(true);
  });

  it("accepts a numeric `now` (epoch ms)", () => {
    expect(isNewConnection("2026-06-21T09:00:00Z", now.getTime())).toBe(true);
  });
});

describe("relativeDayLabel (D-03 - Today / N days ago)", () => {
  const now = new Date("2026-06-21T12:00:00Z");

  it("labels a same-day (< 1 day old) connection as Today", () => {
    expect(relativeDayLabel("2026-06-21T03:00:00Z", now)).toBe("Today");
  });

  it("labels a 1-day-old connection as '1 day ago' (singular)", () => {
    expect(relativeDayLabel("2026-06-20T10:00:00Z", now)).toBe("1 day ago");
  });

  it("labels an N-day-old connection as 'N days ago' (plural)", () => {
    expect(relativeDayLabel("2026-06-16T10:00:00Z", now)).toBe("5 days ago");
  });
});

describe("countOpenDealsByRelationship (D-06 - truthful open-deal count)", () => {
  it("counts only OPEN statuses (negotiation/confirmed) per relationship", () => {
    const cards = [
      { relationship_id: "r1", status: "negotiation" },
      { relationship_id: "r1", status: "confirmed" },
      { relationship_id: "r2", status: "negotiation" },
    ];
    const counts = countOpenDealsByRelationship(cards);
    expect(counts.get("r1")).toBe(2);
    expect(counts.get("r2")).toBe(1);
  });

  it("excludes terminal/other statuses from the count", () => {
    const cards = [
      { relationship_id: "r1", status: "negotiation" },
      { relationship_id: "r1", status: "cancelled" },
      { relationship_id: "r1", status: "closed" },
      { relationship_id: "r1", status: "rejected" },
    ];
    const counts = countOpenDealsByRelationship(cards);
    expect(counts.get("r1")).toBe(1);
  });

  it("excludes 'unsent' private drafts - they never count toward the open-deal badge (D-16)", () => {
    // the badge is counterparty-meaningful; a private draft must not move it.
    const cards = [
      { relationship_id: "r1", status: "unsent" },
      { relationship_id: "r1", status: "negotiation" },
      { relationship_id: "r2", status: "unsent" },
    ];
    const counts = countOpenDealsByRelationship(cards);
    expect(counts.get("r1")).toBe(1); // only the negotiation card
    expect(counts.has("r2")).toBe(false); // an unsent-only relationship has NO badge
  });

  it("omits a relationship with zero open deals (no key)", () => {
    const cards = [{ relationship_id: "r1", status: "cancelled" }];
    const counts = countOpenDealsByRelationship(cards);
    expect(counts.has("r1")).toBe(false);
  });

  it("returns an empty map for no cards", () => {
    expect(countOpenDealsByRelationship([]).size).toBe(0);
  });
});
