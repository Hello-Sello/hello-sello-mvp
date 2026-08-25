"use client";

import { useEffect, useState } from "react";
import {
  getMyConnections,
  type ConnectedPerson,
  type MyConnectionsView,
} from "@/modules/messaging";

/**
 * Pure. Which people belong to the company on the other side of `relationshipId`.
 *
 * Keys on `relationshipId`, NEVER on `companyId`. `ConnectedCompany` carries both
 * (`messaging/types.ts:201-220`), both are `string`, and both compile — but a
 * `companyId`-keyed lookup renders identically green under a static render while
 * shipping a control whose people list never fills. Exported so that swap is
 * provable without a DOM (`CounterpartyPersonSelect.test.tsx`, C7).
 *
 * An unknown id yields `[]` rather than throwing: a directory that does not know
 * this relationship must still leave the whole-company option usable.
 */
export function peopleForRelationship(
  view: MyConnectionsView,
  relationshipId: string,
): ConnectedPerson[] {
  return (
    view.companies.find((c) => c.relationshipId === relationshipId)?.people ?? []
  );
}

/**
 * The addressee control: who, on the other side of an EXISTING relationship, a
 * deal draft is addressed to. Shared by both doors — the buyer's connected
 * seller group in `BasketDrawer`, and the seller's own-company `RecipientPicker`
 * once it has a chosen company.
 *
 * Contract, all of it load-bearing:
 *
 * - **Renders synchronously.** `people` starts `[]` and the `<select>` is
 *   returned unconditionally, so "Whole company" is addressable before any fetch
 *   resolves and a company with zero visible people still gets a live control.
 *   "Never a dead control" is a property of the render, not of the fetch.
 * - **People arrive additively**, from the same connected directory the "+ New
 *   chat" picker reads. A failed read logs and leaves the control at "Whole
 *   company" — losing the directory must not lose the ability to address the
 *   company.
 * - **Controlled** (`value={personId}`). Not stylistic: an uncontrolled select
 *   keeps the previous company's choice on screen after `relationshipId`
 *   changes while the caller has already been told `null`, so screen and payload
 *   disagree. It is also what makes "defaults to the whole company" assertable.
 * - **The caller owns its own copy of the answer.** The reset below is local and
 *   deliberately does NOT call `onPick(null)`; both current callers re-report on
 *   the change that moves `relationshipId`. A future caller that moves it
 *   without re-reporting would reintroduce the divergence this reset removes.
 * - `aria-label="Address this deal to"` is one label serving both callers, and
 *   T03's e2e selects on it — not a casual rename.
 *
 * `relationshipId` is NON-NULL by contract: the caller gates on having a
 * relationship at all.
 */
export function CounterpartyPersonSelect({
  relationshipId,
  onPick,
}: {
  relationshipId: string;
  onPick: (counterpartyPersonId: string | null) => void;
}) {
  const [people, setPeople] = useState<ConnectedPerson[]>([]);
  const [personId, setPersonId] = useState("");

  // Reset on a relationship change: neither the previous relationship's choice
  // nor its people may survive into this one. Done during render, React's
  // documented "adjust state when a prop changes" idiom, rather than in the
  // effect below — a synchronous setState in an effect body cascades a render
  // and is a lint error in this repo (react-hooks/set-state-in-effect).
  const [shownFor, setShownFor] = useState(relationshipId);
  if (shownFor !== relationshipId) {
    setShownFor(relationshipId);
    setPersonId("");
    setPeople([]);
  }

  useEffect(() => {
    let alive = true;
    getMyConnections()
      .then((view) => {
        if (alive) setPeople(peopleForRelationship(view, relationshipId));
      })
      .catch((e) => {
        console.error("basket: connected-people fetch failed", e);
        if (alive) setPeople([]);
      });
    return () => {
      alive = false;
    };
  }, [relationshipId]);

  return (
    <select
      aria-label="Address this deal to"
      className="rounded-lg bg-white/80 px-2 py-1.5 text-xs ring-1 ring-black/10"
      value={personId}
      onChange={(e) => {
        setPersonId(e.target.value);
        onPick(e.target.value || null);
      }}
    >
      <option value="">Whole company</option>
      {people.map((p) => (
        <option key={p.personId} value={p.personId}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
