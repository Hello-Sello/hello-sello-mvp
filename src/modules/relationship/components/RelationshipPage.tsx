"use client";

import { useEffect, useMemo, useState } from "react";
import { getRelationshipPageData, type RelationshipPageData } from "../supabase/reads";
import { computeStats } from "../lib/stats";
import { RelationshipHeader } from "./RelationshipHeader";
import { OverviewBoxes } from "./OverviewBoxes";
import { RecordTabs } from "./RecordTabs";
import { SellaInsightDialog } from "./SellaInsightDialog";
import { AnalyticsDialog } from "./AnalyticsDialog";

/**
 * Relationship page (screen ③) - the persistent company↔company record.
 *
 * Phase 1: the shell + the "← Back to chat" door.
 * Phase 2: load the real record (RLS-scoped) and prove the reads end to end -
 *   resolved company names, connected-since, and live row counts. The styled
 *   top band, tabs, Sella/Analytics boxes and dialogs land in Phase 3+.
 *
 * Mounts inside the Connect layout (sub-nav stays to the left, same as chat).
 */
export interface RelationshipPageProps {
  relationshipId: string;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: RelationshipPageData };

export function RelationshipPage({ relationshipId }: RelationshipPageProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    // initial state is "loading"; the route remounts on a new id, so we don't
    // reset synchronously here (that would trip cascading-render lint). We only
    // commit state from the async result below.
    let alive = true;
    void getRelationshipPageData(relationshipId)
      .then((data) => {
        if (alive) setState({ kind: "ready", data });
      })
      .catch((e: unknown) => {
        if (alive)
          setState({
            kind: "error",
            message: e instanceof Error ? e.message : "Could not load this relationship.",
          });
      });
    return () => {
      alive = false;
    };
  }, [relationshipId]);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto">
      {state.kind === "loading" && (
        <div className="glass flex flex-1 items-center justify-center rounded-3xl p-10 text-center text-sm text-ink/40">
          Loading relationship…
        </div>
      )}

      {state.kind === "error" && (
        <div className="glass flex flex-1 flex-col items-center justify-center rounded-3xl p-10 text-center">
          <p className="text-sm font-semibold text-ink">Relationship not available</p>
          <p className="mt-1 max-w-sm text-[12px] text-ink/45">{state.message}</p>
        </div>
      )}

      {state.kind === "ready" && <RelationshipRecord data={state.data} />}
    </div>
  );
}

/**
 * The relationship record: top band (header + Sella/Analytics boxes) + the
 * tabbed record. The two top-band boxes open their detail dialogs (the box →
 * dialog progressive-disclosure grammar).
 */
function RelationshipRecord({ data }: { data: RelationshipPageData }) {
  const { relationship, deals } = data;
  const stats = useMemo(
    () => computeStats(deals, relationship.connectedAt),
    [deals, relationship.connectedAt],
  );
  const [sellaOpen, setSellaOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 pb-4">
      <RelationshipHeader relationship={relationship} />
      <OverviewBoxes
        relationship={relationship}
        stats={stats}
        onOpenSella={() => setSellaOpen(true)}
        onOpenAnalytics={() => setAnalyticsOpen(true)}
      />
      <RecordTabs data={data} />

      <SellaInsightDialog
        open={sellaOpen}
        onClose={() => setSellaOpen(false)}
        relationship={relationship}
        stats={stats}
      />
      <AnalyticsDialog
        open={analyticsOpen}
        onClose={() => setAnalyticsOpen(false)}
        stats={stats}
        deals={deals}
      />
    </div>
  );
}
