"use client";

import { useState } from "react";
import { Check, PenLine, Paperclip, Plus, Lock, ChevronDown, Users } from "lucide-react";
import type { MemberView, StageView, ThingStatus, ThingType, ThingView } from "../types";

/**
 * The Things tab - the REAL per-stage checklist for the SELECTED stage (the one
 * picked in the StageDropdown above).
 *
 * Phase 5 makes each row collaborative (D-08..D-13):
 *  - an ASSIGNEE picker: own-side members by name PLUS one "the other company"
 *    option (company-level, D-11 - never a specific person on the other side);
 *  - a PRIVATE/SHARED flip, shown ONLY on the viewer's OWN-side things (D-10/D-12):
 *    own-side defaults PRIVATE, flippable to shared; other-side items are shared
 *    and not flippable here;
 *  - a LOCK chip on private items (D-13). The read (Plan 01 RLS) already hides
 *    OTHER companies' private things, so any private thing the viewer sees is
 *    their own.
 *
 * Assigning to the other company AUTO-SHARES the thing (D-10) - work for the
 * other side must be visible to them. Ticking a row stays a real DB write the
 * parent performs via `onToggle`; we render optimistic state from `stage` and
 * disable a row while any of its writes are in flight (`busyIds`).
 */
export interface ThingsTabProps {
  stage: StageView;
  /** room members - the own-side assignable set + the people behind assignee names */
  members: MemberView[];
  /** the viewer's own company id (own-side vs other-side decisions, D-10); null when none */
  viewerCompanyId: string | null;
  /** the other side as a WHOLE (D-11, company-level), or null when not resolvable */
  otherCompany: { id: string; name: string } | null;
  onToggle: (thingId: string, next: ThingStatus) => void;
  /** assign to an OWN-SIDE person (companyId = viewer); keeps the current visibility */
  onAssign: (thingId: string, assigneePersonId: string | null, ownerCompanyId: string | null) => void;
  /** assign to the OTHER company AND auto-share (D-10/D-11) as ONE atomic write (ME-01) */
  onAssignToOther: (thingId: string, otherCompanyId: string) => void;
  /** flip a thing's visibility; only ever called for the viewer's own items (D-12) */
  onSetVisibility: (thingId: string, isPrivate: boolean, ownerCompanyId: string | null) => void;
  /** create a new (task) Thing in this stage; resolves when saved */
  onAdd: (title: string) => Promise<void>;
  busyIds: ReadonlySet<string>;
}

/** Small descriptor for the non-task Thing kinds (task needs no chip). */
const TYPE_CHIP: Partial<Record<ThingType, { icon: React.ReactNode; label: string }>> = {
  approval: { icon: <PenLine size={11} strokeWidth={1.75} />, label: "e-sign · both sides" },
  document_upload: { icon: <Paperclip size={11} strokeWidth={1.75} />, label: "upload" },
};

export function ThingsTab({
  stage,
  members,
  viewerCompanyId,
  otherCompany,
  onToggle,
  onAssign,
  onAssignToOther,
  onSetVisibility,
  onAdd,
  busyIds,
}: ThingsTabProps) {
  const pct = stage.thingsTotal === 0 ? 0 : Math.round((stage.thingsDone / stage.thingsTotal) * 100);
  // the own-side assignable set (D-09): members whose company is the viewer's
  const ownSideMembers = members.filter((m) => m.companyId === viewerCompanyId);

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
            <ThingRow
              key={t.id}
              thing={t}
              ownSideMembers={ownSideMembers}
              viewerCompanyId={viewerCompanyId}
              otherCompany={otherCompany}
              onToggle={onToggle}
              onAssign={onAssign}
              onAssignToOther={onAssignToOther}
              onSetVisibility={onSetVisibility}
              busy={busyIds.has(t.id)}
            />
          ))}
        </ul>
      )}

      <AddThing stageLabel={stage.label} onAdd={onAdd} />
    </div>
  );
}

/**
 * The "+ Add a thing" affordance (D-08 - open to everyone in the room). Click
 * reveals an inline title input; Enter or "Add" creates a `task` Thing in this
 * stage (via the parent's `onAdd`); Escape or blur-with-empty cancels.
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
  ownSideMembers,
  viewerCompanyId,
  otherCompany,
  onToggle,
  onAssign,
  onAssignToOther,
  onSetVisibility,
  busy,
}: {
  thing: ThingView;
  ownSideMembers: MemberView[];
  viewerCompanyId: string | null;
  otherCompany: { id: string; name: string } | null;
  onToggle: (thingId: string, next: ThingStatus) => void;
  onAssign: (thingId: string, assigneePersonId: string | null, ownerCompanyId: string | null) => void;
  onAssignToOther: (thingId: string, otherCompanyId: string) => void;
  onSetVisibility: (thingId: string, isPrivate: boolean, ownerCompanyId: string | null) => void;
  busy: boolean;
}) {
  const done = thing.status === "done";
  const chip = TYPE_CHIP[thing.type];
  // the row is the viewer's OWN when its owner is the viewer's company, or it is
  // an own-side thing with no owner resolved yet (the own-side default).
  const isOwnSide =
    thing.ownerCompanyId === viewerCompanyId ||
    (thing.ownerCompanyId === null && viewerCompanyId !== null);
  // the flip is shown ONLY on the viewer's own items (D-12).
  const canFlip = isOwnSide;

  const assigneeName =
    thing.assigneePersonId === null
      ? thing.ownerCompanyId !== null && thing.ownerCompanyId !== viewerCompanyId && otherCompany
        ? otherCompany.name
        : null
      : (ownSideMembers.find((m) => m.personId === thing.assigneePersonId)?.name ?? null);

  return (
    <li>
      <div
        className={`glass flex w-full items-center gap-2.5 rounded-xl px-3 py-2 ${
          busy ? "opacity-50" : ""
        }`}
      >
        {/* the checkbox - its own button so the row controls have separate click targets */}
        <button
          type="button"
          disabled={busy}
          aria-label={done ? "Mark open" : "Mark done"}
          onClick={() => onToggle(thing.id, done ? "open" : "done")}
          className={[
            "flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
            done ? "border-brand bg-brand text-white" : "border-ink/25 bg-transparent hover:border-brand",
          ].join(" ")}
        >
          {done && <Check size={11} strokeWidth={3} />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={`min-w-0 truncate text-sm ${done ? "text-ink/40 line-through" : "text-ink/80"}`}
            >
              {thing.title}
            </span>
            {/* the LOCK chip on private items (D-13) - the CardFront dashed deep-pink treatment */}
            {thing.isPrivate && (
              <span
                className="flex shrink-0 items-center gap-1 rounded-md border border-dashed px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-brand-deep"
                style={{
                  borderColor: "color-mix(in srgb, var(--color-brand-deep) 32%, transparent)",
                  background: "color-mix(in srgb, var(--color-brand-deep) 5%, transparent)",
                }}
              >
                <Lock className="h-[11px] w-[11px] text-brand-deep" />
                private
              </span>
            )}
          </div>
          {(chip || assigneeName) && (
            <div className="mt-1 flex items-center gap-2">
              {chip && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-medium text-ink/50">
                  {chip.icon}
                  {chip.label}
                </span>
              )}
              {assigneeName && (
                <span className="truncate text-[10.5px] text-ink/45">{assigneeName}</span>
              )}
            </div>
          )}
        </div>

        {/* the PRIVATE/SHARED flip - own items only (D-10/D-12) */}
        {canFlip && (
          <button
            type="button"
            disabled={busy}
            title={thing.isPrivate ? "Private - make shared" : "Shared - make private"}
            aria-label={thing.isPrivate ? "Make shared" : "Make private"}
            onClick={() => onSetVisibility(thing.id, !thing.isPrivate, viewerCompanyId)}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
              thing.isPrivate
                ? "text-brand-deep hover:bg-brand-soft/30"
                : "text-ink/35 hover:bg-ink/5 hover:text-ink/55"
            }`}
          >
            {thing.isPrivate ? (
              <Lock size={13} strokeWidth={2} />
            ) : (
              <Users size={13} strokeWidth={2} />
            )}
          </button>
        )}

        {/* the ASSIGNEE picker (D-09/D-11) */}
        <AssigneePicker
          thing={thing}
          ownSideMembers={ownSideMembers}
          viewerCompanyId={viewerCompanyId}
          otherCompany={otherCompany}
          onAssign={onAssign}
          onAssignToOther={onAssignToOther}
          busy={busy}
        />
      </div>
    </li>
  );
}

/**
 * The per-thing assignee picker (D-09). It offers each own-side member by name
 * PLUS one "the other company" option (D-11, company-level). Selecting an
 * own-side member keeps the thing on the viewer's side (private by default,
 * D-10); selecting "the other company" assigns it company-level AND auto-shares
 * it (D-10 - the other side must be able to act on it).
 *
 * "Assign to the other company + auto-share" is ONE atomic operation via
 * `onAssignToOther` (ME-01): a single DB write sets owner=other AND is_private
 * =false together, so there is no partial-failure window between the assign and
 * the share. Own-side assign goes through `onAssign` and leaves visibility alone.
 */
function AssigneePicker({
  thing,
  ownSideMembers,
  viewerCompanyId,
  otherCompany,
  onAssign,
  onAssignToOther,
  busy,
}: {
  thing: ThingView;
  ownSideMembers: MemberView[];
  viewerCompanyId: string | null;
  otherCompany: { id: string; name: string } | null;
  onAssign: (thingId: string, assigneePersonId: string | null, ownerCompanyId: string | null) => void;
  onAssignToOther: (thingId: string, otherCompanyId: string) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);

  const assignedToOther =
    thing.ownerCompanyId !== null && thing.ownerCompanyId !== viewerCompanyId;
  const currentName = assignedToOther
    ? (otherCompany?.name ?? "Other company")
    : (ownSideMembers.find((m) => m.personId === thing.assigneePersonId)?.name ?? null);

  function assignToMember(personId: string) {
    onAssign(thing.id, personId, viewerCompanyId);
    setOpen(false);
  }

  function assignToOtherCompany() {
    if (!otherCompany) return;
    // ONE atomic write: company-level (no specific person, D-11) AND auto-share
    // (D-10) in a single update + a single optimistic patch/revert (ME-01).
    onAssignToOther(thing.id, otherCompany.id);
    setOpen(false);
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Assign"
        className="flex items-center gap-1 rounded-full px-1.5 py-1 text-ink/45 ring-1 ring-black/[0.06] transition hover:bg-white/70 hover:text-ink/70"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink/8 text-[10px] font-semibold text-ink/55">
          {currentName ? initials(currentName) : <Plus size={11} strokeWidth={2.2} />}
        </span>
        <ChevronDown size={12} strokeWidth={2} className="text-ink/35" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            className="glass-strong absolute right-0 top-full z-20 mt-1.5 w-52 overflow-hidden rounded-2xl p-1.5"
          >
            <p className="px-2 pb-1 pt-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-ink/40">
              Assign to
            </p>
            {ownSideMembers.length === 0 && !otherCompany && (
              <p className="px-2 py-2 text-[11px] text-ink/45">No one to assign yet.</p>
            )}
            {ownSideMembers.map((m) => (
              <button
                key={m.personId}
                type="button"
                role="option"
                aria-selected={thing.assigneePersonId === m.personId && !assignedToOther}
                onClick={() => assignToMember(m.personId)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-ink/5"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink/10 text-[10px] font-semibold text-ink/55">
                  {initials(m.name)}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-ink">{m.name}</span>
                {thing.assigneePersonId === m.personId && !assignedToOther && (
                  <Check size={13} strokeWidth={2.5} className="shrink-0 text-brand" />
                )}
              </button>
            ))}
            {otherCompany && (
              <>
                <div className="my-1 border-t border-ink/[0.07]" />
                <button
                  type="button"
                  role="option"
                  aria-selected={assignedToOther}
                  onClick={assignToOtherCompany}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-brand-soft/30"
                  title="Assigning to the other company auto-shares this item"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-info/15 text-info">
                    <Users size={12} strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-ink">
                      {otherCompany.name}
                    </span>
                    <span className="block text-[9.5px] text-ink/45">the other company · auto-shared</span>
                  </span>
                  {assignedToOther && (
                    <Check size={13} strokeWidth={2.5} className="shrink-0 text-brand" />
                  )}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
