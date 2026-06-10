"use client";

import { useEffect, useState } from "react";
import { getDealCard, getWorkspace } from "../supabase/reads";
import type { DealCardView, DealWorkspaceView } from "../types";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { WorkPanel } from "./WorkPanel";

/**
 * Deal Workspace (screen ④, 3b) - the deal container, the A&C-mix layout:
 * header band on top, the tabbed work panel left, and the deal chat as the
 * WIDE hero right. The chat arrives as a slot (`chat`) so this module never
 * imports messaging - the route page is the composition root (messaging
 * already imports deals for DealPin; a back-import would make a cycle).
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

export function DealWorkspace({ dealCardId, chat }: DealWorkspaceProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  // the route remounts on a new id, so the effect only commits async results
  useEffect(() => {
    let alive = true;
    void Promise.all([getDealCard(dealCardId), getWorkspace(dealCardId)])
      .then(([deal, workspace]) => {
        if (alive) setState({ kind: "ready", deal, workspace });
      })
      .catch((e: unknown) => {
        if (alive)
          setState({
            kind: "error",
            message: e instanceof Error ? e.message : "Could not load this deal workspace.",
          });
      });
    return () => {
      alive = false;
    };
  }, [dealCardId]);

  if (state.kind === "loading") {
    return (
      <div className="glass flex h-full items-center justify-center rounded-3xl p-10 text-center text-sm text-ink/40">
        Loading deal workspace…
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
      <div className="flex min-h-0 flex-1 gap-3">
        {/* left: the tabbed work panel (~330px, per the locked prototype) */}
        <div className="w-[330px] shrink-0">
          <WorkPanel members={state.workspace.members} />
        </div>
        {/* right: the deal chat, the wide hero - the workspace is a DOING surface */}
        <div className="glass min-w-0 flex-1 overflow-hidden rounded-3xl">{chat}</div>
      </div>
    </div>
  );
}
