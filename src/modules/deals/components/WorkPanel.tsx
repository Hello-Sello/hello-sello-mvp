"use client";

import { useState } from "react";
import { FileBox } from "lucide-react";
import type { MemberView, StageView, ThingStatus } from "../types";
import { PeopleTab } from "./PeopleTab";
import { ThingsTab } from "./ThingsTab";

type Tab = "things" | "people" | "documents";

const TABS: ReadonlyArray<{ key: Tab; label: string }> = [
  { key: "things", label: "Add something" },
  { key: "people", label: "People" },
  { key: "documents", label: "Documents" },
];

/**
 * The workspace's left work panel (3b): C-style tabs - pick one, see it.
 * People is REAL (deal_member). Things is REAL as of 3c - it shows the SELECTED
 * stage's checklist (the stage is picked in the StageBar above) and a tick is a
 * live DB write. Documents stays a stub (`deal_artifact` is migrated; upload is
 * a later task).
 */
export interface WorkPanelProps {
  members: MemberView[];
  /** the stage picked in the StageBar - the Things tab renders this stage */
  selectedStage: StageView;
  onToggleThing: (thingId: string, next: ThingStatus) => void;
  onAddThing: (title: string) => Promise<void>;
  busyThingIds: ReadonlySet<string>;
}

export function WorkPanel({
  members,
  selectedStage,
  onToggleThing,
  onAddThing,
  busyThingIds,
}: WorkPanelProps) {
  const [tab, setTab] = useState<Tab>("things");

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
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
          <ThingsTab
            stage={selectedStage}
            onToggle={onToggleThing}
            onAdd={onAddThing}
            busyIds={busyThingIds}
          />
        ) : (
          <StubCard
            icon={<FileBox size={20} strokeWidth={1.5} />}
            title="Deal documents live here"
            body="Deal-level files (COA, contract, delivery note, invoice). Company-wide docs stay on the relationship page."
            action="Upload"
          />
        )}
      </div>
    </div>
  );
}

/** A quiet placeholder card for the tabs that later phases fill. */
function StubCard({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action: string;
}) {
  return (
    <div className="glass flex flex-col items-center gap-2 rounded-2xl p-6 text-center">
      <span className="text-ink/30">{icon}</span>
      <p className="text-sm font-medium text-ink/70">{title}</p>
      <p className="text-xs leading-snug text-ink/45">{body}</p>
      <button
        type="button"
        disabled
        title="Coming soon"
        className="mt-1 rounded-full bg-ink/5 px-3 py-1 text-[11px] font-medium text-ink/40"
      >
        {action}
      </button>
    </div>
  );
}
