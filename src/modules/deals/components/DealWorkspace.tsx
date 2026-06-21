"use client";

import { useEffect, useMemo, useState } from "react";
import { getDealCard, getWorkspace, getStagesAndThings } from "../supabase/reads";
import { toggleThingStatus, createThing } from "../supabase/writes";
import type { DealCardView, DealWorkspaceView, StageCode, StageView, ThingStatus } from "../types";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { WorkPanel } from "./WorkPanel";
import { CardFront } from "./CardFront";

/**
 * Deal Room (screen ④, Phase 5) - the deal container, restructured into the
 * THREE permanent columns (D-04): a slim top bar, then LEFT a thin read-only
 * card (the goods we have), MIDDLE the chat (the wide hero), RIGHT the work
 * panel (things / people / documents + the stages, moved over from the left).
 *
 * The chat arrives as a slot (`chat`) so this module never imports messaging -
 * the route page is the composition root (messaging already imports deals for
 * DealPin; a back-import would make a cycle).
 *
 * State lives here: the 5 stages + their Things (loaded once), the SCREEN-ONLY
 * selected stage (now driven by the right panel's stage dropdown in Plan 03,
 * never persisted), and the set of Things whose tick write is in flight. Ticks
 * update optimistically and revert on a write error. The top StageBar strip is
 * gone (D-14: stages move into the right panel in Plan 03) - the selection state
 * stays because the WorkPanel still needs `selectedStage`.
 */
export interface DealWorkspaceProps {
  dealCardId: string;
  /** the deal chat hero (messaging's <DealChat/>), composed by the route */
  chat: React.ReactNode;
  /** return straight to the chat (D-02/D-03); the route owns the overlay-close.
   *  Defaults to a no-op so the workspace compiles/renders standalone. */
  onClose?: () => void;
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

export function DealWorkspace({ dealCardId, chat, onClose = () => {} }: DealWorkspaceProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [stages, setStages] = useState<StageView[]>([]);
  const [selectedCode, setSelectedCode] = useState<StageCode | null>(null);
  const [busyThingIds, setBusyThingIds] = useState<ReadonlySet<string>>(new Set());

  // the route remounts on a new id, so the effect only commits async results
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [deal, workspace] = await Promise.all([
          getDealCard(dealCardId),
          getWorkspace(dealCardId),
        ]);
        const loadedStages = await getStagesAndThings(workspace.workspaceId);
        if (!alive) return;
        setState({ kind: "ready", deal, workspace });
        setStages(loadedStages);
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

  // the read-only card's THINGS section (D-12) wants the FULL list flattened
  // across the 5 stages, not just the selected stage's.
  const allThings = stages.flatMap((s) => s.things);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <WorkspaceHeader deal={state.deal} onClose={onClose} />
      {/* the 3 permanent columns (D-04). A CSS grid, NOT three fixed-width flex
          boxes, so the widths follow the ~20% / ~48% / ~32% target: a THIN card
          (~20%, min 260px), the chat WIDEST (1.5fr), the work panel a bit
          narrower than the chat (1fr). */}
      <div
        className="grid min-h-0 flex-1 gap-3"
        style={{ gridTemplateColumns: "minmax(260px, 20%) 1.5fr 1fr" }}
      >
        {/* LEFT: the thin read-only card (the goods we have). CardFront DIRECTLY -
            NO DealCard wrapper, so no 3D flip, no CardBack, no edit pencil. The
            flattened things light up its read-only THINGS section (D-12). Colors
            come from the existing Damson tokens the card already uses. */}
        <div className="min-w-0 overflow-y-auto">
          <CardFront data={state.deal} things={allThings} />
        </div>
        {/* MIDDLE: the deal chat, the wide hero (the slot prop, kept acyclic) */}
        <div className="glass min-w-0 overflow-hidden rounded-3xl">{chat}</div>
        {/* RIGHT: the work panel (things / people / documents + stages). Plan 03
            moves the stages into it; this plan just sets it in the right track. */}
        <div className="min-w-0">
          {selectedStage && (
            <WorkPanel
              members={state.workspace.members}
              selectedStage={selectedStage}
              onToggleThing={handleToggleThing}
              onAddThing={handleAddThing}
              busyThingIds={busyThingIds}
            />
          )}
        </div>
      </div>
    </div>
  );
}
