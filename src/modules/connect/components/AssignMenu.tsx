"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { InboxItemView, TeamMember } from "@/modules/connect/types";

/**
 * Reassign dropdown. Lets the current owner hand a ticket off, or a head admin
 * (re)assign it to anyone - the §2 model. There is NO "take over": this menu
 * only appears for the owner or an admin (gated by the caller), and it assigns
 * TO a chosen teammate; it never force-grabs from the current owner.
 */
export interface AssignMenuProps {
  item: InboxItemView;
  team: TeamMember[];
  onReassign: (itemId: string, toPersonId: string) => void;
  triggerLabel?: string;
}

export function AssignMenu({
  item,
  team,
  onReassign,
  triggerLabel = "Reassign",
}: AssignMenuProps) {
  const [open, setOpen] = useState(false);

  // can't reassign to the current owner
  const candidates = team.filter((m) => m.personId !== item.assigned_to);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-sm font-medium text-ink/70 ring-1 ring-black/10 transition-colors hover:bg-white/60"
      >
        {triggerLabel}
        <ChevronDown size={14} strokeWidth={2} />
      </button>

      {open && (
        <>
          {/* click-away backdrop */}
          <div
            className="fixed inset-0 z-10"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="glass-strong absolute bottom-full right-0 z-20 mb-1 w-56 rounded-2xl p-1.5"
          >
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink/40">
              Assign to
            </p>
            {candidates.map((m) => (
              <button
                key={m.personId}
                type="button"
                role="menuitem"
                onClick={() => {
                  onReassign(item.id, m.personId);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm text-ink/75 transition-colors hover:bg-brand-soft/40"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink/10 text-[9px] font-semibold text-ink/60">
                  {m.initials}
                </span>
                <span className="min-w-0 flex-1 truncate">{m.displayName}</span>
                {m.isAdmin && (
                  <span className="text-[10px] font-medium text-ink/35">admin</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
