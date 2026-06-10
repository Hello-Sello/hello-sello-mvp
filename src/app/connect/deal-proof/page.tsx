"use client";

/**
 * TEMPORARY Phase-3 proof route for the deal card front.
 * Loads the seeded confirmed demo-world card and renders DealCard so the front
 * can be verified live (both sides). REMOVED in Phase 5 when the card mounts in
 * the chat for real.
 */
import { useEffect, useState } from "react";
import { getDealCard, DealCard, type DealCardView } from "@/modules/deals";

const DEMO_CARD_ID = "04695a2d-668d-40b4-bfa8-55b0fe306018";

export default function DealProofPage() {
  const [data, setData] = useState<DealCardView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDealCard(DEMO_CARD_ID)
      .then(setData)
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  return (
    <div className="p-8">
      <h1 className="mb-4 text-sm font-semibold text-ink/60">Deal card · Phase 3 proof (temp)</h1>
      {error && <div className="text-sm text-red-600">Error: {error}</div>}
      {!data && !error && <div className="text-sm text-ink/40">Loading…</div>}
      {data && (
        <>
          <div className="mb-3 text-xs text-ink/45">
            Viewer side: <b className="text-ink/70">{data.viewerSide ?? "unknown"}</b> · private fields visible:{" "}
            <b className="text-ink/70">{data.partyFields.length}</b>
          </div>
          <DealCard data={data} />
        </>
      )}
    </div>
  );
}
