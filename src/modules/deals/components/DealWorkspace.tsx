"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getDealCard,
  getWorkspace,
  getStagesAndThings,
  getStageCompletions,
  getDealArtifacts,
} from "../supabase/reads";
import {
  toggleThingStatus,
  createThing,
  assignThing,
  setThingVisibility,
  markStageDone,
} from "../supabase/writes";
import type {
  ArtifactView,
  DealCardView,
  DealWorkspaceView,
  StageCode,
  StageCompletionView,
  StageView,
  ThingStatus,
} from "../types";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { StageBar } from "./StageBar";
import { WorkPanel } from "./WorkPanel";

/**
 * Deal Workspace (screen ④) - the deal container, the A&C-mix layout: header
 * band + the screen-only StageBar (3c) on top, the tabbed work panel left, and
 * the deal chat as the WIDE hero right. The chat arrives as a slot (`chat`) so
 * this module never imports messaging - the route page is the composition root
 * (messaging already imports deals for DealPin; a back-import would make a cycle).
 *
 * 3c state lives here: the 5 stages + their Things (loaded once), the
 * SCREEN-ONLY selected stage (the StageBar highlight, never persisted), and the
 * set of Things whose tick write is in flight. Ticks update optimistically and
 * revert on a write error.
 */
export interface DealWorkspaceProps {
  dealCardId: string;
  /** the deal chat hero (messaging's <DealChat/>), composed by the route */
  chat: React.ReactNode;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; deal: DealCardView; workspace: DealWorkspaceView };

/** The first stage that still has open Things - the believable "where we are". */
function defaultStage(stages: StageView[]): StageCode | null {
  const incomplete = stages.find((s) => s.thingsTotal === 0 || s.thingsDone < s.thingsTotal);
  return (incomplete ?? stages[0])?.code ?? null;
}

/** Immutably flip one Thing's status inside the stages array + refresh its count. */
function setThingStatus(stages: StageView[], thingId: string, status: ThingStatus): StageView[] {
  return stages.map((s) => {
    if (!s.things.some((t) => t.id === thingId)) return s;
    const things = s.things.map((t) => (t.id === thingId ? { ...t, status } : t));
    return { ...s, things, thingsDone: things.filter((t) => t.status === "done").length };
  });
}

/** Find one Thing across all stages (for capturing its pre-write state to revert to). */
function findThing(stages: StageView[], thingId: string): StageView["things"][number] | null {
  for (const s of stages) {
    const t = s.things.find((x) => x.id === thingId);
    if (t) return t;
  }
  return null;
}

/** Immutably patch one Thing's fields (assignment / visibility) inside the stages array. */
function patchThing(
  stages: StageView[],
  thingId: string,
  patch: Partial<Pick<StageView["things"][number], "assigneePersonId" | "isPrivate" | "ownerCompanyId">>,
): StageView[] {
  return stages.map((s) => {
    if (!s.things.some((t) => t.id === thingId)) return s;
    return { ...s, things: s.things.map((t) => (t.id === thingId ? { ...t, ...patch } : t)) };
  });
}

export function DealWorkspace({ dealCardId, chat }: DealWorkspaceProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [stages, setStages] = useState<StageView[]>([]);
  const [completions, setCompletions] = useState<StageCompletionView[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactView[]>([]);
  const [selectedCode, setSelectedCode] = useState<StageCode | null>(null);
  const [busyThingIds, setBusyThingIds] = useState<ReadonlySet<string>>(new Set());
  const [busyStageCodes, setBusyStageCodes] = useState<ReadonlySet<string>>(new Set());

  // the route remounts on a new id, so the effect only commits async results
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [deal, workspace] = await Promise.all([
          getDealCard(dealCardId),
          getWorkspace(dealCardId),
        ]);
        const [loadedStages, loadedCompletions, loadedArtifacts] = await Promise.all([
          getStagesAndThings(workspace.workspaceId),
          getStageCompletions(workspace.workspaceId),
          getDealArtifacts(workspace.workspaceId),
        ]);
        if (!alive) return;
        setState({ kind: "ready", deal, workspace });
        setStages(loadedStages);
        setCompletions(loadedCompletions);
        setArtifacts(loadedArtifacts);
        setSelectedCode(defaultStage(loadedStages));
      } catch (e: unknown) {
        if (alive)
          setState({
            kind: "error",
            message: e instanceof Error ? e.message : "Could not load this Deal Room.",
          });
      }
    })();
    return () => {
      alive = false;
    };
  }, [dealCardId]);

  // the confirm gate lives in the chat's card dialog (a separate card load); when
  // it flips the deal, it fires "hs:deal-updated" so the header pill re-reads here.
  useEffect(() => {
    function onDealUpdated(e: Event) {
      const id = (e as CustomEvent<{ dealCardId: string }>).detail?.dealCardId;
      if (id !== dealCardId) return;
      void getDealCard(dealCardId)
        .then((deal) => setState((s) => (s.kind === "ready" ? { ...s, deal } : s)))
        .catch(() => {});
    }
    window.addEventListener("hs:deal-updated", onDealUpdated);
    return () => window.removeEventListener("hs:deal-updated", onDealUpdated);
  }, [dealCardId]);

  // tick a Thing: optimistic flip, write through RLS, revert on failure
  async function handleToggleThing(thingId: string, next: ThingStatus) {
    setStages((prev) => setThingStatus(prev, thingId, next));
    setBusyThingIds((prev) => new Set(prev).add(thingId));
    try {
      await toggleThingStatus(thingId, next);
    } catch {
      // revert the optimistic flip
      setStages((prev) => setThingStatus(prev, thingId, next === "done" ? "open" : "done"));
    } finally {
      setBusyThingIds((prev) => {
        const n = new Set(prev);
        n.delete(thingId);
        return n;
      });
    }
  }

  const selectedStage = useMemo(
    () => stages.find((s) => s.code === selectedCode) ?? stages[0] ?? null,
    [stages, selectedCode],
  );

  // add a (task) Thing to the selected stage: write, then append the real row
  async function handleAddThing(title: string) {
    if (!state || state.kind !== "ready" || !selectedStage) return;
    const created = await createThing({
      workspaceId: state.workspace.workspaceId,
      stageCode: selectedStage.code,
      title,
      sortOrder: selectedStage.things.length + 1,
    });
    setStages((prev) =>
      prev.map((s) =>
        s.code === created.stageCode
          ? {
              ...s,
              things: [...s.things, created],
              thingsTotal: s.thingsTotal + 1,
            }
          : s,
      ),
    );
  }

  // assign a Thing (own-side person or the other company): optimistic patch + revert
  async function handleAssign(
    thingId: string,
    assigneePersonId: string | null,
    ownerCompanyId: string | null,
  ) {
    const before = findThing(stages, thingId);
    setStages((prev) => patchThing(prev, thingId, { assigneePersonId, ownerCompanyId }));
    setBusyThingIds((prev) => new Set(prev).add(thingId));
    try {
      await assignThing(thingId, assigneePersonId, ownerCompanyId);
    } catch {
      if (before)
        setStages((prev) =>
          patchThing(prev, thingId, {
            assigneePersonId: before.assigneePersonId,
            ownerCompanyId: before.ownerCompanyId,
          }),
        );
    } finally {
      setBusyThingIds((prev) => {
        const n = new Set(prev);
        n.delete(thingId);
        return n;
      });
    }
  }

  // flip a Thing's visibility (own items only): optimistic patch + revert
  async function handleSetVisibility(
    thingId: string,
    isPrivate: boolean,
    ownerCompanyId: string | null,
  ) {
    const before = findThing(stages, thingId);
    setStages((prev) => patchThing(prev, thingId, { isPrivate, ownerCompanyId }));
    setBusyThingIds((prev) => new Set(prev).add(thingId));
    try {
      await setThingVisibility(thingId, isPrivate, ownerCompanyId);
    } catch {
      if (before)
        setStages((prev) =>
          patchThing(prev, thingId, {
            isPrivate: before.isPrivate,
            ownerCompanyId: before.ownerCompanyId,
          }),
        );
    } finally {
      setBusyThingIds((prev) => {
        const n = new Set(prev);
        n.delete(thingId);
        return n;
      });
    }
  }

  // mark a stage done (manual, STORED): optimistic completion row + revert
  async function handleMarkStageDone(stageCode: StageCode) {
    if (!state || state.kind !== "ready") return;
    const already = completions.some((c) => c.stageCode === stageCode && c.markedDoneAt !== null);
    if (already || busyStageCodes.has(stageCode)) return;
    const optimistic: StageCompletionView = {
      stageCode,
      markedDoneAt: new Date().toISOString(),
      markedDoneByPersonId: null,
    };
    setCompletions((prev) => [...prev.filter((c) => c.stageCode !== stageCode), optimistic]);
    setBusyStageCodes((prev) => new Set(prev).add(stageCode));
    try {
      await markStageDone(state.workspace.workspaceId, stageCode);
    } catch {
      setCompletions((prev) => prev.filter((c) => c.stageCode !== stageCode));
    } finally {
      setBusyStageCodes((prev) => {
        const n = new Set(prev);
        n.delete(stageCode);
        return n;
      });
    }
  }

  // the OTHER side as a whole (D-11) - the one member company that is not the viewer's
  const otherCompany = useMemo(() => {
    if (state.kind !== "ready") return null;
    const viewerCompanyId = state.workspace.viewerCompanyId;
    const other = state.workspace.members.find(
      (m) => m.companyId !== viewerCompanyId,
    );
    return other ? { id: other.companyId, name: other.companyName } : null;
  }, [state]);

  if (state.kind === "loading") {
    return (
      <div className="glass flex h-full items-center justify-center rounded-3xl p-10 text-center text-sm text-ink/40">
        Loading Deal Room…
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="glass flex h-full items-center justify-center rounded-3xl p-10 text-center text-sm text-ink/40">
        {state.message}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <WorkspaceHeader deal={state.deal} workspace={state.workspace} />
      {selectedCode && (
        <StageBar stages={stages} selected={selectedCode} onSelect={setSelectedCode} />
      )}
      <div className="flex min-h-0 flex-1 gap-3">
        {/* left: the tabbed work panel (~330px, per the locked prototype) */}
        <div className="w-[330px] shrink-0">
          {selectedCode && selectedStage && (
            <WorkPanel
              members={state.workspace.members}
              stages={stages}
              selectedCode={selectedCode}
              onSelectStage={setSelectedCode}
              completions={completions}
              onMarkStageDone={handleMarkStageDone}
              busyStageCodes={busyStageCodes}
              artifacts={artifacts}
              viewerCompanyId={state.workspace.viewerCompanyId}
              otherCompany={otherCompany}
              onToggleThing={handleToggleThing}
              onAddThing={handleAddThing}
              onAssign={handleAssign}
              onSetVisibility={handleSetVisibility}
              busyThingIds={busyThingIds}
            />
          )}
        </div>
        {/* right: the deal chat, the wide hero - the workspace is a DOING surface */}
        <div className="glass min-w-0 flex-1 overflow-hidden rounded-3xl">{chat}</div>
      </div>
    </div>
  );
}
