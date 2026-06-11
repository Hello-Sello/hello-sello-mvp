"use client";

import { useState } from "react";
import { Check, PenLine, Paperclip, Plus } from "lucide-react";
import type { StageView, ThingStatus, ThingType, ThingView } from "../types";

/**
 * The Things tab (3c) - the REAL per-stage checklist for the SELECTED stage.
 *
 * Things are grouped BY STAGE (3c D1); this panel shows one stage at a time (the
 * one picked in the StageBar). Ticking a row is a real DB write (D3) the parent
 * performs via `onToggle`; we render optimistic state from the `stage` prop and
 * disable a row while its write is in flight (`busyIds`). `approval` Things are
 * the 3d e-sign gate - shown, labelled, but not yet wired. `+ Add a thing` is
 * disabled (user-created Things are post-demo).
 */
export interface ThingsTabProps {
  stage: StageView;
  onToggle: (thingId: string, next: ThingStatus) => void;
  /** create a new (task) Thing in this stage; resolves when saved */
  onAdd: (title: string) => Promise<void>;
  busyIds: ReadonlySet<string>;
}

/** Small descriptor for the non-task Thing kinds (task needs no chip). */
const TYPE_CHIP: Partial<Record<ThingType, { icon: React.ReactNode; label: string }>> = {
  approval: { icon: <PenLine size={11} strokeWidth={1.75} />, label: "e-sign · both sides" },
  document_upload: { icon: <Paperclip size={11} strokeWidth={1.75} />, label: "upload" },
};

export function ThingsTab({ stage, onToggle, onAdd, busyIds }: ThingsTabProps) {
  const pct = stage.thingsTotal === 0 ? 0 : Math.round((stage.thingsDone / stage.thingsTotal) * 100);

  return (
    <div className="flex flex-col gap-2">
      {/* stage header + progress */}
      <div className="glass rounded-2xl p-3">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold text-brand-deep">{stage.label}</p>
          <span className="text-[11px] tabular-nums text-ink/45">
            {stage.thingsDone}/{stage.thingsTotal} done
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/8">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* the checklist */}
      {stage.things.length === 0 ? (
        <div className="glass rounded-2xl p-6 text-center text-xs text-ink/45">
          No things in this stage yet.
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {stage.things.map((t) => (
            <ThingRow key={t.id} thing={t} onToggle={onToggle} busy={busyIds.has(t.id)} />
          ))}
        </ul>
      )}

      <AddThing stageLabel={stage.label} onAdd={onAdd} />
    </div>
  );
}

/**
 * The "+ Add a thing" affordance. Click reveals an inline title input; Enter or
 * "Add" creates a `task` Thing in this stage (via the parent's `onAdd`); Escape
 * or blur-with-empty cancels. Disabled while the create write is in flight.
 */
function AddThing({
  stageLabel,
  onAdd,
}: {
  stageLabel: string;
  onAdd: (title: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    const t = title.trim();
    if (!t || saving) return;
    setSaving(true);
    try {
      await onAdd(t);
      setTitle("");
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 flex items-center gap-1 self-start rounded-full bg-ink/5 px-3 py-1 text-[11px] font-medium text-ink/55 transition-colors hover:bg-ink/10 hover:text-ink/70"
      >
        <Plus size={12} strokeWidth={2} />
        Add a thing
      </button>
    );
  }

  return (
    <div className="glass mt-1 flex items-center gap-2 rounded-xl px-3 py-2">
      <input
        autoFocus
        value={title}
        disabled={saving}
        placeholder={`New thing in ${stageLabel}…`}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
          if (e.key === "Escape") {
            setTitle("");
            setOpen(false);
          }
        }}
        className="min-w-0 flex-1 bg-transparent text-sm text-ink/80 placeholder:text-ink/35 focus:outline-none"
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={!title.trim() || saving}
        className="shrink-0 rounded-full bg-brand px-3 py-1 text-[11px] font-medium text-white transition-opacity disabled:opacity-40"
      >
        {saving ? "Adding…" : "Add"}
      </button>
    </div>
  );
}

function ThingRow({
  thing,
  onToggle,
  busy,
}: {
  thing: ThingView;
  onToggle: (thingId: string, next: ThingStatus) => void;
  busy: boolean;
}) {
  const done = thing.status === "done";
  const chip = TYPE_CHIP[thing.type];

  return (
    <li>
      <button
        type="button"
        disabled={busy}
        onClick={() => onToggle(thing.id, done ? "open" : "done")}
        className={`glass flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors hover:bg-ink/5 ${
          busy ? "opacity-50" : ""
        }`}
      >
        {/* the checkbox */}
        <span
          className={[
            "flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
            done ? "border-brand bg-brand text-white" : "border-ink/25 bg-transparent",
          ].join(" ")}
        >
          {done && <Check size={11} strokeWidth={3} />}
        </span>

        <span
          className={`min-w-0 flex-1 truncate text-sm ${
            done ? "text-ink/40 line-through" : "text-ink/80"
          }`}
        >
          {thing.title}
        </span>

        {chip && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-medium text-ink/50">
            {chip.icon}
            {chip.label}
          </span>
        )}
      </button>
    </li>
  );
}
