"use client";

/**
 * Open items (07-07, D-15) - the card's FLAT, shared to-do list. Stages are fully
 * retired (D-15): there is NO stage grouping, just one un-grouped list of Things
 * with action words (Upload / Approve). It replaces the old read-only "Things"
 * block AND the separate WorkPanel - the list is now inline-editable on the card:
 * toggle done, inline-add, flip visibility, and assign, all via the existing
 * Things writes (createThing / toggleThingStatus / setThingVisibility / assignThing).
 *
 * Privacy (D-15): a PRIVATE item is visible only to its creator's own side. The
 * read (RLS) already hides the other side's private rows; the client filter here is
 * belt-and-suspenders when the viewer's company is known.
 */
import { useRef, useState } from "react";
import { Check, Lock, Plus, Unlock, UserPlus } from "lucide-react";
import {
  assignThing,
  createThing,
  setThingVisibility,
  toggleThingStatus,
} from "../supabase/writes";
import type { ThingType, ThingView } from "../types";

/** The action word each Thing kind leads with (D-15). */
const ACTION_WORD: Record<ThingType, string | null> = {
  document_upload: "Upload",
  approval: "Approve",
  task: null,
};

export function OpenItems({
  things,
  workspaceId,
  viewerCompanyId,
  viewerPersonId,
}: {
  things: ThingView[];
  /** the deal_workspace_id - required to inline-add (createThing). Absent = read-only add. */
  workspaceId?: string | null;
  /** the viewer's company - filters private items + owns a new private item. */
  viewerCompanyId?: string | null;
  /** the viewer's person - enables "assign to me". */
  viewerPersonId?: string | null;
}) {
  const [items, setItems] = useState<ThingView[]>(things);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Re-seed when the card re-reads (a fresh `things` array arrives) - React's
  // documented "adjust state when a prop changes" render pattern, not an effect,
  // so local optimistic edits are replaced only when the source list actually changes.
  const [prevThings, setPrevThings] = useState(things);
  if (prevThings !== things) {
    setPrevThings(things);
    setItems(things);
  }

  // D-15 privacy: a private item shows only to its owner's side (RLS + this guard).
  const visible = items.filter(
    (t) => !t.isPrivate || (viewerCompanyId != null && t.ownerCompanyId === viewerCompanyId),
  );
  const doneCount = visible.filter((t) => t.status === "done").length;

  async function onToggle(t: ThingView) {
    if (busyId) return;
    const next = t.status === "done" ? "open" : "done";
    setBusyId(t.id);
    // optimistic
    setItems((cur) => cur.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
    try {
      await toggleThingStatus(t.id, next);
    } catch {
      // revert on failure
      setItems((cur) => cur.map((x) => (x.id === t.id ? { ...x, status: t.status } : x)));
    } finally {
      setBusyId(null);
    }
  }

  async function onToggleVisibility(t: ThingView) {
    if (busyId) return;
    const nextPrivate = !t.isPrivate;
    const nextOwner = nextPrivate ? viewerCompanyId ?? t.ownerCompanyId ?? null : null;
    setBusyId(t.id);
    setItems((cur) =>
      cur.map((x) =>
        x.id === t.id ? { ...x, isPrivate: nextPrivate, ownerCompanyId: nextOwner } : x,
      ),
    );
    try {
      await setThingVisibility(t.id, nextPrivate, nextOwner);
    } catch {
      setItems((cur) =>
        cur.map((x) =>
          x.id === t.id
            ? { ...x, isPrivate: t.isPrivate, ownerCompanyId: t.ownerCompanyId }
            : x,
        ),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function onAssignToMe(t: ThingView) {
    if (busyId || !viewerPersonId) return;
    setBusyId(t.id);
    setItems((cur) =>
      cur.map((x) => (x.id === t.id ? { ...x, assigneePersonId: viewerPersonId } : x)),
    );
    try {
      await assignThing(t.id, viewerPersonId, t.ownerCompanyId ?? viewerCompanyId ?? null);
    } catch {
      setItems((cur) =>
        cur.map((x) => (x.id === t.id ? { ...x, assigneePersonId: t.assigneePersonId } : x)),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function onAdd() {
    const title = draft.trim();
    if (!title || !workspaceId || busyId === "add") return;
    setBusyId("add");
    try {
      const created = await createThing({
        workspaceId,
        title,
        sortOrder: items.length,
        ownerCompanyId: viewerCompanyId ?? null,
      });
      setItems((cur) => [...cur, created]);
      setDraft("");
      setAdding(false);
    } catch {
      // keep the draft so the user can retry
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wide text-ink/45">
          Open items
        </span>
        <span className="text-[11px] font-semibold tabular-nums text-brand">
          {doneCount} / {visible.length} done
        </span>
      </div>

      {visible.length === 0 && !adding && (
        <p className="py-1 text-[12px] text-ink/40">No open items yet.</p>
      )}

      <ul className="flex flex-col">
        {visible.map((t) => {
          const done = t.status === "done";
          const word = ACTION_WORD[t.type];
          return (
            <li key={t.id} className="flex items-center gap-2 py-1 text-[12.5px]">
              <button
                type="button"
                onClick={() => void onToggle(t)}
                disabled={busyId === t.id}
                aria-label={done ? "Mark open" : "Mark done"}
                className={`flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded border-[1.5px] transition ${
                  done ? "border-success bg-success" : "border-ink/20 hover:border-brand"
                }`}
              >
                {done && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
              </button>
              <span className={`flex-1 truncate ${done ? "text-ink/45 line-through" : "text-ink"}`}>
                {word && <span className="font-semibold text-brand-deep">{word} </span>}
                {t.title}
              </span>

              {/* assign to me (D-15) - only when the viewer's person is known */}
              {viewerPersonId && !t.assigneePersonId && (
                <button
                  type="button"
                  onClick={() => void onAssignToMe(t)}
                  disabled={busyId === t.id}
                  title="Assign to me"
                  aria-label="Assign to me"
                  className="shrink-0 text-ink/35 transition hover:text-brand"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                </button>
              )}

              {/* visibility toggle (D-15): private items belong to one side only */}
              <button
                type="button"
                onClick={() => void onToggleVisibility(t)}
                disabled={busyId === t.id}
                title={t.isPrivate ? "Private - only your side" : "Shared with both sides"}
                aria-label="Toggle visibility"
                className="shrink-0 text-ink/35 transition hover:text-brand-deep"
              >
                {t.isPrivate ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
              </button>
            </li>
          );
        })}
      </ul>

      {/* inline add - only when the workspace is wired (createThing needs it) */}
      {workspaceId &&
        (adding ? (
          <div className="mt-1.5 flex items-center gap-2">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onAdd();
                if (e.key === "Escape") {
                  setAdding(false);
                  setDraft("");
                }
              }}
              autoFocus
              placeholder="Add an open item…"
              className="flex-1 rounded-lg bg-white px-2.5 py-1.5 text-[12.5px] text-ink ring-1 ring-black/5 placeholder:text-ink/35 focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            <button
              type="button"
              onClick={() => void onAdd()}
              disabled={!draft.trim() || busyId === "add"}
              className="rounded-lg bg-brand px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-brand-deep disabled:opacity-50"
            >
              Add
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-1.5 flex items-center gap-1 text-[12px] font-semibold text-brand-deep transition hover:text-brand"
          >
            <Plus className="h-3.5 w-3.5" /> Add item
          </button>
        ))}
    </div>
  );
}
