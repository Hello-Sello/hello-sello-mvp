"use client";

import { useState } from "react";
import { MessageSquareQuote, Check, Loader2 } from "lucide-react";
import { requestPricing } from "../actions";

/**
 * The shop-level "Request pricing" CTA (L1) — one request for the whole
 * catalogue, not per product. Sends a `pricelist_request` to the seller's Connect
 * inbox; accepting runs Connect's existing rollout. `requested` seeds the done
 * state so a returning viewer sees "Pricing requested" (the action is dup-guarded
 * server-side regardless). A note is optional — the form stays tiny on purpose.
 */
export function RequestPricingActions({
  companyId,
  companyName,
  requested,
}: {
  companyId: string;
  companyName: string;
  requested: boolean;
}) {
  const [phase, setPhase] = useState<"idle" | "sending" | "sent">(requested ? "sent" : "idle");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  if (phase === "sent")
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl bg-success/15 px-4 py-3 text-sm font-bold text-success">
        <Check size={16} /> Pricing requested — {companyName} will reply in your inbox
      </div>
    );

  async function submit() {
    setErr(null);
    setPhase("sending");
    const res = await requestPricing(companyId, note);
    if ("error" in res) {
      setErr(res.error);
      setPhase("idle");
      return;
    }
    setPhase("sent");
  }

  return (
    <div className="glass-strong rounded-2xl p-4">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink">
        <MessageSquareQuote size={16} className="text-brand" /> Prices on request from {companyName}
      </p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={280}
        placeholder="Anything specific you need pricing for? (optional)…"
        className="mb-2 w-full resize-none rounded-xl border border-ink/10 bg-white/70 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
      <button
        onClick={submit}
        disabled={phase === "sending"}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-deep disabled:opacity-60"
      >
        {phase === "sending" ? (
          <><Loader2 size={16} className="animate-spin" /> Sending…</>
        ) : (
          "Request pricing"
        )}
      </button>
      <p className="mt-2 text-center text-[11px] text-ink/45">Most sellers reply within ~1 business day.</p>
      {err && <p className="mt-1.5 text-center text-xs font-medium text-danger">{err}</p>}
    </div>
  );
}
