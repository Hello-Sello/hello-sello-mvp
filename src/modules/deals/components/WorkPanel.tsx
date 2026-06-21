"use client";

import { useState } from "react";
import type {
  ArtifactView,
  MemberView,
  StageCode,
  StageCompletionView,
  StageView,
  ThingStatus,
} from "../types";
import { DocumentsTab } from "./DocumentsTab";
import { PeopleTab } from "./PeopleTab";
import { StageDropdown } from "./StageDropdown";
import { ThingsTab } from "./ThingsTab";

type Tab = "things" | "people" | "documents";

const TABS: ReadonlyArray<{ key: Tab; label: string }> = [
  { key: "things", label: "Add something" },
  { key: "people", label: "People" },
  { key: "documents", label: "Documents" },
];

/**
 * The Deal Room's RIGHT work panel (Phase 5, moved from the left). It now owns
 * the V7 StageDropdown at the top (the stage selector + the manual glowing
 * "mark stage done" pill) so the active stage drives which stage the Things tab
 * shows. Below it: the C-style tabs - Add something (Things) | People | Documents.
 *
 * Things is collaborative (per-thing assign + private/shared + lock icons,
 * D-08..D-13). Documents is the REAL `deal_artifact` list (lock icons on private
 * docs, D-13). People is unchanged.
 *
 * Cross-plan seam: DealWorkspace (Plan 02 / Plan 04's load extension) supplies
 * all the new props - see the SUMMARY for the exact contract.
 */
export interface WorkPanelProps {
  members: MemberView[];
  /** all 5 stages (the StageDropdown overview + the Things tab) */
  stages: StageView[];
  /** the stage currently selected; the Things tab renders this stage */
  selectedCode: StageCode;
  onSelectStage: (code: StageCode) => void;
  /** stored stage-done rows (D-14) - the dropdown reads these for the done state */
  completions: StageCompletionView[];
  onMarkStageDone: (code: StageCode) => void;
  /** stage codes whose markStageDone write is in flight */
  busyStageCodes: ReadonlySet<string>;
  /** the deal's documents (the Documents tab list) */
  artifacts: ArtifactView[];
  /** the viewer's own company id (own-side vs other-side, D-10); null when none */
  viewerCompanyId: string | null;
  /** the other side as a WHOLE (D-11, company-level), or null */
  otherCompany: { id: string; name: string } | null;
  onToggleThing: (thingId: string, next: ThingStatus) => void;
  onAddThing: (title: string) => Promise<void>;
  onAssign: (thingId: string, assigneePersonId: string | null, ownerCompanyId: string | null) => void;
  onSetVisibility: (thingId: string, isPrivate: boolean, ownerCompanyId: string | null) => void;
  busyThingIds: ReadonlySet<string>;
}

export function WorkPanel({
  members,
  stages,
  selectedCode,
  onSelectStage,
  completions,
  onMarkStageDone,
  busyStageCodes,
  artifacts,
  viewerCompanyId,
  otherCompany,
  onToggleThing,
  onAddThing,
  onAssign,
  onSetVisibility,
  busyThingIds,
}: WorkPanelProps) {
  const [tab, setTab] = useState<Tab>("things");

  const selectedStage = stages.find((s) => s.code === selectedCode) ?? stages[0];

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {/* the V7 stage selector + the manual glowing mark-stage-done pill (D-14) */}
      <StageDropdown
        stages={stages}
        selectedCode={selectedCode}
        onSelect={onSelectStage}
        completions={completions}
        onMarkStageDone={onMarkStageDone}
        busyStageCodes={busyStageCodes}
      />

      <div className="glass flex shrink-0 gap-1 rounded-2xl p-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? "true" : undefined}
            className={`flex-1 rounded-lg px-2 py-1.5 text-sm transition-colors ${
              tab === t.key
                ? "bg-brand-soft/40 font-medium text-brand-deep"
                : "text-ink/50 hover:bg-ink/5"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "people" ? (
          <PeopleTab members={members} />
        ) : tab === "things" ? (
          selectedStage ? (
            <ThingsTab
              stage={selectedStage}
              members={members}
              viewerCompanyId={viewerCompanyId}
              otherCompany={otherCompany}
              onToggle={onToggleThing}
              onAssign={onAssign}
              onSetVisibility={onSetVisibility}
              onAdd={onAddThing}
              busyIds={busyThingIds}
            />
          ) : (
            <div className="glass rounded-2xl p-6 text-center text-xs text-ink/45">
              No stages on this deal yet.
            </div>
          )
        ) : (
          <DocumentsTab artifacts={artifacts} />
        )}
      </div>
    </div>
  );
}
