"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { StageCode, StageCompletionView, StageView } from "../types";

/**
 * The right-panel stage selector (Phase 5, V7-resolved - replaces the old top
 * `StageBar`). The V7 decision: NO always-visible rail of stage segments (it
 * does not scale to 10+ stages). The stage filter is JUST a dropdown; the
 * overview lives INSIDE the dropdown menu - opening it shows EVERY stage's
 * done/total + a green check when that stage is marked done + an "end" tag on
 * the last stage. See `prototypes/05-deal-room-right-column/v7-v4-final.html`
 * for the LAYOUT (colours come from the app's Damson tokens, not the prototype).
 *
 * Beside the active stage sits a MANUAL "Mark stage done" pill (D-14):
 *  - it GLOWS (the nudge - reuses the SellaMark animate-ping/animate-pulse cue)
 *    once all of the active stage's CURRENT things are ticked but the stage is
 *    not yet marked done;
 *  - the human still clicks - a stage is NEVER auto-flipped (new things can be
 *    added later);
 *  - stage-done is STORED (read from `completions`, written via `onMarkStageDone`),
 *    never derived from the things alone.
 */
export interface StageDropdownProps {
  stages: StageView[];
  selectedCode: StageCode;
  onSelect: (code: StageCode) => void;
  /** stored stage-done rows; a stage with a row here IS marked done (D-14) */
  completions: StageCompletionView[];
  onMarkStageDone: (code: StageCode) => void;
  /** stage codes whose markStageDone write is in flight (disable the pill) */
  busyStageCodes: ReadonlySet<string>;
}

/** A stage is DONE only when it has a stored completion row (D-14, never derived). */
function isStageMarkedDone(code: StageCode, completions: StageCompletionView[]): boolean {
  return completions.some((c) => c.stageCode === code && c.markedDoneAt !== null);
}

/** All of a stage's current things are ticked - drives the glow nudge + the menu "ready" dot. */
function allThingsDone(stage: StageView): boolean {
  return stage.thingsTotal > 0 && stage.thingsDone === stage.thingsTotal;
}

export function StageDropdown({
  stages,
  selectedCode,
  onSelect,
  completions,
  onMarkStageDone,
  busyStageCodes,
}: StageDropdownProps) {
  const [open, setOpen] = useState(false);

  const active = stages.find((s) => s.code === selectedCode) ?? stages[0];
  // the END stage = the one with the highest sortOrder (schema-driven, not a hardcoded code)
  const lastSortOrder = stages.reduce((max, s) => Math.max(max, s.sortOrder), 0);
  const overallDone = stages.filter((s) => isStageMarkedDone(s.code, completions)).length;

  if (!active) return null;

  const activeDone = isStageMarkedDone(active.code, completions);
  // nudge = every current thing is ticked, but the stage is NOT yet marked done.
  const nudge = !activeDone && allThingsDone(active);
  const activeBusy = busyStageCodes.has(active.code);
  // an EMPTY stage (no things) cannot be marked done - there is nothing to
  // complete. The capsule disables (muted) and explains why on hover.
  const isEmpty = active.thingsTotal === 0;
  const markDisabled = activeBusy || activeDone || isEmpty;

  return (
    <div className="flex items-stretch gap-2">
      {/* --- the stage dropdown (the filter + the in-menu overview) --- */}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex h-10 min-w-[11.5rem] items-center gap-2 rounded-xl bg-white/70 px-3 ring-1 ring-black/[0.06] transition hover:bg-white/90"
        >
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold ${
              activeDone ? "bg-success text-white" : "bg-brand/12 text-brand-deep"
            }`}
          >
            {activeDone ? <Check size={11} strokeWidth={3} /> : active.sortOrder}
          </span>
          <span className="flex-1 text-left leading-tight">
            <span className="block text-[12.5px] font-semibold text-ink">{active.label}</span>
            <span className="block text-[10px] text-ink/45">
              {activeDone ? "Stage complete" : `${active.thingsDone} / ${active.thingsTotal} done`}
            </span>
          </span>
          <ChevronDown
            size={14}
            strokeWidth={2.2}
            className={`text-ink/40 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>

        {open && (
          <>
            {/* outside-click catcher (the DealPin dropdown pattern) */}
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div
              role="listbox"
              className="glass-strong absolute left-0 top-full z-20 mt-1.5 max-h-[21rem] w-[16.5rem] overflow-y-auto rounded-2xl p-1.5"
            >
              {/* the menu reads as an OVERVIEW, not just a picker */}
              <div className="mb-1 flex items-center justify-between border-b border-ink/[0.07] px-2 pb-1.5 pt-1">
                <span className="text-[9.5px] font-extrabold uppercase tracking-wider text-ink/45">
                  Stages
                </span>
                <span className="text-[9.5px] font-bold tabular-nums text-brand-deep">
                  {overallDone} / {stages.length} done
                </span>
              </div>

              {stages.map((s) => {
                const sActive = s.code === selectedCode;
                const sDone = isStageMarkedDone(s.code, completions);
                const sReady = !sDone && allThingsDone(s);
                const isEnd = s.sortOrder === lastSortOrder;
                return (
                  <button
                    key={s.code}
                    type="button"
                    role="option"
                    aria-selected={sActive}
                    onClick={() => {
                      onSelect(s.code);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition ${
                      sActive ? "bg-brand-soft/40" : "hover:bg-ink/5"
                    }`}
                  >
                    <span
                      className={`flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-md text-[10.5px] font-bold ${
                        sDone
                          ? "bg-success text-white"
                          : sActive
                            ? "bg-brand/14 text-brand-deep"
                            : "bg-ink/8 text-ink/50"
                      }`}
                    >
                      {sDone ? <Check size={10} strokeWidth={3} /> : s.sortOrder}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">
                      {s.label}
                    </span>
                    {isEnd && (
                      <span className="shrink-0 rounded-full bg-info/15 px-1.5 py-px text-[8.5px] font-extrabold uppercase tracking-wider text-info">
                        end
                      </span>
                    )}
                    {/* "ready" hint dot - all ticked, not yet marked (echoes the pill glow) */}
                    {sReady && (
                      <span className="relative flex h-2 w-2 shrink-0" title="All items done - ready to mark">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-70" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
                      </span>
                    )}
                    <span
                      className={`min-w-[1.6rem] shrink-0 text-right text-[10px] tabular-nums ${
                        sDone ? "font-bold text-success" : "text-ink/45"
                      }`}
                    >
                      {s.thingsDone}/{s.thingsTotal}
                    </span>
                    {sDone && (
                      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-success text-white">
                        <Check size={9} strokeWidth={3.5} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* --- the MANUAL "Mark stage done" CAPSULE (D-14) ---
          A fully-rounded pill: two parallel straight long sides + sharp
          half-circle end caps ("like a C"). Premium Damson maroon with a soft
          deep gradient + the frosted glass shadow for depth; the GLOW nudge is a
          soft brand-deep halo (not a flat box). Disabled (empty/busy/done) reads
          intentionally muted but stays capsule-shaped. */}
      <div className="relative flex-1">
        {/* premium glow halo - a soft brand-deep ring breathing behind the
            capsule when every thing is ticked but the stage is not yet marked.
            Sits BEHIND the button (-z) so it reads as a halo, not a badge. */}
        {nudge && !markDisabled && (
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-1 -z-10 animate-pulse rounded-full bg-brand-deep/30 blur-md"
          />
        )}
        <button
          type="button"
          disabled={markDisabled}
          onClick={() => onMarkStageDone(active.code)}
          title={
            isEmpty
              ? "Add a thing first"
              : activeDone
                ? "Stage complete"
                : nudge
                  ? "All items ticked - mark this stage done"
                  : "Mark this stage done"
          }
          className={[
            "relative flex h-10 w-full items-center justify-center gap-2 overflow-hidden rounded-full px-4 text-[12.5px] font-bold tracking-wide transition",
            activeDone
              ? // completed: calm success capsule
                "bg-success/12 text-success ring-1 ring-success/40"
              : isEmpty
                ? // empty stage: muted, still capsule-shaped, not clickable
                  "cursor-not-allowed bg-ink/[0.06] text-ink/35 ring-1 ring-black/[0.05]"
                : // live: premium maroon capsule. The deep gradient derives from
                  // the Damson token (color-mix toward black) so depth stays in
                  // ONE source of truth - no hardcoded hex (mirrors --glass-shadow).
                  "bg-gradient-to-b from-brand-deep to-[color-mix(in_srgb,var(--color-brand-deep)_72%,black)] text-white shadow-[var(--glass-shadow)] ring-1 ring-brand-deep/40 hover:brightness-110",
            nudge && !markDisabled ? "ring-2 ring-brand-soft/70" : "",
            activeBusy ? "opacity-60" : "",
          ].join(" ")}
        >
          <span
            className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ${
              activeDone
                ? "bg-success text-white"
                : isEmpty
                  ? "bg-ink/10 text-ink/40"
                  : "bg-white/20 text-white"
            }`}
          >
            <Check size={11} strokeWidth={3.4} />
          </span>
          <span className="truncate">
            {activeDone
              ? "Stage done"
              : isEmpty
                ? "Add a thing first"
                : nudge
                  ? "All set - mark done"
                  : "Mark stage done"}
          </span>
        </button>
      </div>
    </div>
  );
}
