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
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--dc-ink-38)]">
          Things to do
        </span>
        <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand/12 px-1.5 font-mono text-[10px] font-bold tabular-nums text-[color:var(--dc-pink-deep)]">
          {visible.length - doneCount}
        </span>
      </div>

      {visible.length === 0 && !adding && (
        <p className="py-1 text-[12px] text-[color:var(--dc-ink-38)]">No open items yet.</p>
      )}

      <ul className="flex flex-col">
        {visible.map((t) => {
          const done = t.status === "done";
          const word = ACTION_WORD[t.type];
          const rowInner = (
            <>
              <button
                type="button"
                onClick={() => void onToggle(t)}
                disabled={busyId === t.id}
                aria-label={done ? "Mark open" : "Mark done"}
                className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border-[1.5px] transition ${
                  done
                    ? "border-[color:var(--dc-pink)] bg-[color:var(--dc-pink)]"
                    : "border-[color:var(--dc-ink-38)] bg-white hover:border-[color:var(--dc-pink)]"
                }`}
              >
                {done && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
              </button>

              {/* action word as a pill chip (Upload / Approve), D-15 */}
              {word && (
                <span className="shrink-0 rounded-full border border-brand/35 bg-white px-2 py-0.5 text-[8.5px] font-extrabold uppercase tracking-[0.1em] text-[color:var(--dc-pink-deep)]">
                  {word}
                </span>
              )}

              <span
                className={`flex-1 truncate text-[12.5px] ${
                  done ? "text-[color:var(--dc-ink-38)] line-through" : "text-[color:var(--dc-ink)]"
                }`}
              >
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
                  className="shrink-0 text-[color:var(--dc-ink-38)] transition hover:text-[color:var(--dc-pink)]"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                </button>
              )}

              {/* visibility toggle (D-15): private items belong to one side only.
                  A private item also carries the "Only you" tag below, so here the
                  icon just flips the state. */}
              <button
                type="button"
                onClick={() => void onToggleVisibility(t)}
                disabled={busyId === t.id}
                title={t.isPrivate ? "Private - only your side" : "Shared with both sides"}
                aria-label="Toggle visibility"
                className="shrink-0 text-[color:var(--dc-ink-38)] transition hover:text-[color:var(--dc-pink-deep)]"
              >
                {t.isPrivate ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
              </button>

              {/* the "Only you" tag on a private row (prototype .only-you) */}
              {t.isPrivate && (
                <span className="shrink-0 text-[8.5px] font-extrabold uppercase tracking-[0.1em] text-[color:var(--dc-maroon)]">
                  Only you
                </span>
              )}
            </>
          );

          // a private item sits in the dashed "only you" box (prototype .private-box)
          return t.isPrivate ? (
            <li key={t.id} className="my-1">
              <div className="dc-private flex items-center gap-2 rounded-2xl px-2.5 py-1.5">
                {rowInner}
              </div>
            </li>
          ) : (
            <li
              key={t.id}
              className="-mx-2 flex items-center gap-2 rounded-xl px-2 py-1.5 transition hover:bg-black/[0.04]"
            >
              {rowInner}
            </li>
          );
        })}
      </ul>

      {/* inline add - only when the workspace is wired (createThing needs it) */}
      {workspaceId &&
        (adding ? (
          <div className="mt-2 flex items-center gap-2">
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
              placeholder="Add something…"
              className="flex-1 rounded-full bg-white px-3 py-1.5 text-[12.5px] text-[color:var(--dc-ink)] ring-1 ring-black/5 placeholder:text-[color:var(--dc-ink-38)] focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            <button
              type="button"
              onClick={() => void onAdd()}
              disabled={!draft.trim() || busyId === "add"}
              className="rounded-full bg-[color:var(--dc-pink)] px-4 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[color:var(--dc-pink-deep)] disabled:opacity-50"
            >
              Add
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-2 flex items-center gap-1.5 rounded-full border-[1.5px] border-dashed border-brand/45 px-3.5 py-1.5 text-[12px] font-bold text-[color:var(--dc-pink-deep)] transition hover:bg-brand/[0.08]"
          >
            <Plus className="h-3.5 w-3.5" /> Add something
          </button>
        ))}
    </div>
  );
}
