"use client";

import { useState } from "react";
import { DemandBuilder } from "./DemandBuilder";
import { PollsSection } from "./PollsSection";

export function DemandPage() {
  const [highlightId, setHighlightId] = useState<string | null>(null);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4">
      <div>
        <h1 className="text-2xl font-bold text-ink">Demand</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Ask your pharmacies what they need before you order — pick products, send a poll, watch the demand come in.
        </p>
      </div>

      <DemandBuilder onCreated={(p) => setHighlightId(p.id)} />

      <PollsSection highlightId={highlightId} />
    </div>
  );
}
