"use client";

import { useEffect, useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import type { InboxItemView, LensKey } from "@/modules/connect/types";
import { filterByLens, lensCounts } from "@/modules/connect/lib/lenses";
import {
  getInbox,
  claimItem,
  assignItem,
  acceptItem,
  declineItem,
  getAssignableMembers,
  VIEWER,
} from "@/modules/connect/mock/inbox.mock";
import { LensTabs } from "./LensTabs";
import { InboxList } from "./InboxList";
import { InboxDetail } from "./InboxDetail";

/**
 * Inbox orchestrator (panels 3 + 4). The ONLY stateful piece of the inbox: it
 * loads the queue, holds the active lens + selected item, computes lens counts,
 * and wires the claim/assign/accept/decline mutators. Everything it renders is
 * presentational.
 *
 * Data source = the mock module (getInbox/mutators/VIEWER). At swap time only
 * those imports change to real Supabase calls; the state + layout stay put.
 */
const EMPTY_HINT: Record<LensKey, string> = {
  unassigned: "No new requests waiting to be claimed.",
  mine: "Nothing assigned to you right now.",
  all: "No open requests.",
  history: "No accepted or declined requests yet.",
};

export function InboxView() {
  const team = getAssignableMembers();
  const viewer = VIEWER;

  const [items, setItems] = useState<InboxItemView[]>([]);
  const [activeLens, setActiveLens] = useState<LensKey>("unassigned");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // initial load - auto-select the first item of the default lens
  useEffect(() => {
    let alive = true;
    void getInbox().then((list) => {
      if (!alive) return;
      setItems(list);
      setSelectedId(filterByLens(list, "unassigned", viewer.personId)[0]?.id ?? null);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [viewer.personId]);

  const counts = useMemo(
    () => lensCounts(items, viewer.personId),
    [items, viewer.personId],
  );
  const visible = useMemo(
    () => filterByLens(items, activeLens, viewer.personId),
    [items, activeLens, viewer.personId],
  );
  const selected = items.find((it) => it.id === selectedId) ?? null;

  function handleLensChange(lens: LensKey) {
    setActiveLens(lens);
    // re-anchor selection to the first item visible under the new lens
    setSelectedId(filterByLens(items, lens, viewer.personId)[0]?.id ?? null);
  }

  // mutators: run the (mock) write, then refresh the list. Selection is kept so
  // the detail panel shows the resulting state (e.g. the accepted banner).
  async function refreshWith(p: Promise<InboxItemView[]>) {
    setItems(await p);
  }

  return (
    <div className="flex h-full gap-3">
      {/* panel 3 - lens tabs + list */}
      <div className="glass flex w-80 shrink-0 flex-col overflow-hidden rounded-3xl">
        <div className="px-2 pt-2">
          <LensTabs active={activeLens} counts={counts} onChange={handleLensChange} />
        </div>
        {loading ? (
          <p className="flex-1 p-6 text-center text-sm text-ink/40">Loading inbox…</p>
        ) : (
          <InboxList
            items={visible}
            selectedId={selectedId}
            viewerPersonId={viewer.personId}
            onSelect={setSelectedId}
            emptyHint={EMPTY_HINT[activeLens]}
          />
        )}
      </div>

      {/* panel 4 - detail */}
      <div className="glass flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl">
        {selected ? (
          <InboxDetail
            item={selected}
            viewer={viewer}
            team={team}
            onClaim={(id) => void refreshWith(claimItem(id, viewer.personId))}
            onReassign={(id, to) => void refreshWith(assignItem(id, to, viewer.personId))}
            onAccept={(id) => void refreshWith(acceptItem(id))}
            onDecline={(id) => void refreshWith(declineItem(id))}
            onStartDeal={() => {
              /* visual-only in 2a - the deal flow is built later */
            }}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-10 text-center text-ink/40">
            <Inbox size={28} strokeWidth={1.5} />
            <p className="mt-3 text-sm">Select a request to see the details</p>
          </div>
        )}
      </div>
    </div>
  );
}
