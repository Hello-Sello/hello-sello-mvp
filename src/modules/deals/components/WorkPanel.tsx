"use client";

import { useState } from "react";
import { ListChecks, FileBox } from "lucide-react";
import type { MemberView } from "../types";
import { PeopleTab } from "./PeopleTab";

type Tab = "things" | "people" | "documents";

const TABS: ReadonlyArray<{ key: Tab; label: string }> = [
  { key: "things", label: "Things" },
  { key: "people", label: "People" },
  { key: "documents", label: "Documents" },
];

/**
 * The workspace's left work panel (3b): C-style tabs - pick one, see it.
 * People is REAL (deal_member). Things and Documents are visual stubs here:
 * the Things checklist is 3c (the `thing` backend is already migrated) and
 * the document upload comes later (`deal_artifact` is migrated too).
 */
export function WorkPanel({ members }: { members: MemberView[] }) {
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
          <StubCard
            icon={<ListChecks size={20} strokeWidth={1.5} />}
            title="Things live here"
            body="The per-stage checklist (Finance · Logistics · Delivery) lands with the stage pipeline (3c)."
            action="+ Add a thing"
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
