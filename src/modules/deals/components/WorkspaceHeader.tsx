import Link from "next/link";
import { ArrowLeft, FileText, Sparkles } from "lucide-react";
import { formatMoney } from "../lib/derive";
import type { DealCardStatus, DealCardView, DealWorkspaceView } from "../types";

/**
 * The workspace's top band (3b): deal facts + lifecycle pill, then the shrunk
 * one-line Deal-Sella. Ported from the prototype's `dealHeader` + `sellaInsight`
 * (elements, not pixels). The pill is DISPLAY-ONLY in 3b - the gate that flips
 * Draft → Confirmed is 3d; Sella's line is static until 4x writes real reads.
 */
export function WorkspaceHeader({
  deal,
  workspace,
}: {
  deal: DealCardView;
  workspace: DealWorkspaceView;
}) {
  const { card } = deal;
  const owners = workspace.members.filter((m) => m.role === "owner");
  const ownerNames = owners.map((m) => m.name.split(" ")[0]).join(" · ");

  return (
    <div className="flex flex-col gap-2">
      <div className="glass rounded-3xl p-4">
        <div className="flex items-center justify-between gap-3">
          <Link
            href={`/connect/relationship/${card.relationship_id}`}
            className="flex items-center gap-1 text-xs text-ink/40 transition hover:text-ink/70"
          >
            <ArrowLeft size={13} strokeWidth={2} />
            Relationship · {deal.sellerName} · {deal.buyerName}
          </Link>
          <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink/50">
            {workspace.visibility === "company_wide" ? "Company-wide" : "Private · invited only"}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft/40 text-brand-deep">
              <FileText size={18} strokeWidth={1.75} />
            </div>
            <div>
              <div className="text-sm font-bold tracking-wide text-ink">
                {card.hs_deal_number ?? "Deal"}
              </div>
              <div className="text-[11px] text-ink/45">
                {deal.sellerName} ◦ {deal.buyerName}
                {ownerNames ? ` · owners ${ownerNames}` : ""}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {card.value_net != null && (
              <div className="text-right">
                <div className="text-base font-bold text-ink">
                  {formatMoney(Number(card.value_net), card.currency)}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-ink/40">net</div>
              </div>
            )}
            <LifecyclePill status={card.status} />
          </div>
        </div>
      </div>

      {/* Deal-Sella, shrunk to one line (static in 3b; 4x writes the real read) */}
      <div className="flex items-start gap-2 rounded-2xl bg-brand-soft/20 px-3 py-2 ring-1 ring-brand/10">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-brand text-white">
          <Sparkles size={11} strokeWidth={2} />
        </span>
        <p className="text-xs leading-snug text-ink/75">
          <span className="font-semibold text-ink/60">Deal-Sella:</span> {sellaLine(card.status)}
        </p>
      </div>
    </div>
  );
}

/** Draft → Confirmed → Done, display-only (the flip gate is 3d). */
function LifecyclePill({ status }: { status: DealCardStatus }) {
  const steps: ReadonlyArray<{ key: string; label: string }> = [
    { key: "draft", label: "Draft" },
    { key: "confirmed", label: "Confirmed" },
    { key: "done", label: "Done" },
  ];
  // amended is still a live confirmed deal; terminal odd states get a plain chip
  const normalized = status === "amended" ? "confirmed" : status;
  const idx = steps.findIndex((s) => s.key === normalized);
  if (idx === -1) {
    return (
      <span className="rounded-full bg-ink/10 px-2.5 py-0.5 text-[10px] font-medium capitalize text-ink/60">
        {status}
      </span>
    );
  }
  return (
    <div className="flex items-center gap-1">
      {steps.map((s, i) => (
        <span key={s.key} className="flex items-center gap-1">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] ${
              i === idx
                ? "bg-brand font-medium text-white"
                : i < idx
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-ink/5 text-ink/40"
            }`}
          >
            {i < idx ? "✓ " : ""}
            {s.label}
          </span>
          {i < steps.length - 1 && <span className="text-[10px] text-ink/25">→</span>}
        </span>
      ))}
    </div>
  );
}

/** Static placeholder line per lifecycle state (real Sella reads land in 4x). */
function sellaLine(status: DealCardStatus): string {
  if (status === "draft")
    return "Draft - both sides still need to confirm before execution starts.";
  if (status === "done") return "Done - this deal is closed; the card holds the final state.";
  return "Confirmed - both sides are in. The deal chat and members are live; the Things checklist lands next.";
}
