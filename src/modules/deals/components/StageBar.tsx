"use client";

import { Check } from "lucide-react";
import type { StageCode, StageView } from "../types";

/**
 * The 5-stage pipeline strip across the top of the workspace (3c).
 *
 * SCREEN-ONLY (3c D2): clicking a stage just highlights it via the parent's
 * local state - nothing is saved, and a refresh resets to the default. The bar
 * is navigation + overview: it shows each stage's done/total progress and acts
 * as the selector for which stage's Things the panel shows. Stages 4-5 render
 * slightly muted ("ahead") but stay clickable so the future journey is visible.
 * It does NOT drive the deal's status - Draft -> Confirmed is the 3d gate.
 */
export interface StageBarProps {
  stages: StageView[];
  selected: StageCode;
  onSelect: (code: StageCode) => void;
}

export function StageBar({ stages, selected, onSelect }: StageBarProps) {
  return (
    <div className="glass flex shrink-0 items-stretch gap-1.5 rounded-2xl p-1.5">
      {stages.map((s, i) => {
        const isSelected = s.code === selected;
        const isComplete = s.thingsTotal > 0 && s.thingsDone === s.thingsTotal;
        const isAhead = s.sortOrder >= 4; // payment + fulfilment: the journey ahead
        return (
          <button
            key={s.code}
            type="button"
            onClick={() => onSelect(s.code)}
            aria-current={isSelected ? "step" : undefined}
            className={[
              "group flex flex-1 flex-col gap-1 rounded-xl px-2.5 py-2 text-left transition-colors",
              isSelected
                ? "bg-brand-soft/40 ring-1 ring-brand/30"
                : "hover:bg-ink/5",
              isAhead && !isSelected ? "opacity-55" : "",
            ].join(" ")}
          >
            <div className="flex items-center gap-1.5">
              <span
                className={[
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                  isComplete
                    ? "bg-brand text-white"
                    : isSelected
                      ? "bg-brand/20 text-brand-deep"
                      : "bg-ink/10 text-ink/50",
                ].join(" ")}
              >
                {isComplete ? <Check size={11} strokeWidth={3} /> : i + 1}
              </span>
              <span
                className={`truncate text-[11px] font-medium ${
                  isSelected ? "text-brand-deep" : "text-ink/60"
                }`}
              >
                {s.label}
              </span>
            </div>
            <span className="text-[10px] tabular-nums text-ink/40">
              {s.thingsTotal === 0 ? "no things" : `${s.thingsDone}/${s.thingsTotal} done`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
