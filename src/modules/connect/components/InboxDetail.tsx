import {
  Users,
  Check,
  X,
  UserPlus,
  UserCheck,
  ArrowRight,
} from "lucide-react";
import type {
  InboxItemView,
  TeamMember,
  ViewerContext,
} from "@/modules/connect/types";
import { REQUEST_TYPE_META, formatTimeAgo } from "@/modules/connect/lib/inbox-display";
import { AssignMenu } from "./AssignMenu";

/**
 * Inbox detail (panel 4): the selected item, with actions driven by status +
 * the §2 assignment model. The action surface is decided by `detailMode`:
 *
 *   accepted        -> connected banner + Start-a-deal CTA (visual only in 2a)
 *   rejected        -> declined notice
 *   unassigned      -> Claim (primary) + Accept + Decline   (anyone, first-come)
 *   mine            -> Accept + Decline + Reassign          (owner)
 *   others-admin    -> collision notice + Reassign          (head admin only)
 *   others-locked   -> collision notice, NO actions         (no force take-over)
 */
export interface InboxDetailProps {
  item: InboxItemView;
  viewer: ViewerContext;
  team: TeamMember[];
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  onClaim: (id: string) => void;
  onReassign: (id: string, toPersonId: string) => void;
  /** visual-only in 2a; the real flow is built later */
  onStartDeal: (id: string) => void;
}

type DetailMode =
  | "accepted"
  | "rejected"
  | "unassigned"
  | "mine"
  | "others-admin"
  | "others-locked";

function detailMode(item: InboxItemView, viewer: ViewerContext): DetailMode {
  if (item.status === "accepted") return "accepted";
  if (item.status === "rejected") return "rejected";
  if (item.assigned_to === null) return "unassigned";
  if (item.assigned_to === viewer.personId) return "mine";
  return viewer.isAdmin ? "others-admin" : "others-locked";
}

const BTN = "inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors";
const BTN_PRIMARY = `${BTN} bg-brand text-white hover:bg-brand-deep`;
const BTN_OUTLINE = `${BTN} text-ink/70 ring-1 ring-black/10 hover:bg-white/60`;
const BTN_DECLINE = `${BTN} text-ink/60 ring-1 ring-black/10 hover:text-danger hover:ring-danger/30`;

export function InboxDetail({
  item,
  viewer,
  team,
  onAccept,
  onDecline,
  onClaim,
  onReassign,
  onStartDeal,
}: InboxDetailProps) {
  const meta = REQUEST_TYPE_META[item.type];
  const TypeIcon = meta.icon;
  const mode = detailMode(item, viewer);
  const ownerFirstName = item.assignee?.displayName.split(" ")[0] ?? "Someone";

  return (
    <div className="flex h-full flex-col">
      {/* ---- header ---- */}
      <div className="flex items-start gap-3 border-b border-black/5 p-5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-ink/70 ring-1 ring-black/5">
          {item.sender.initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h2 className="truncate text-lg font-bold text-ink">{item.sender.companyName}</h2>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/45">
            <span className={`inline-flex items-center gap-1 font-medium ${meta.accent}`}>
              <TypeIcon size={13} strokeWidth={2} />
              {meta.label}
            </span>
            {item.mutualCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Users size={13} strokeWidth={1.75} />
                {item.mutualCount} mutual
              </span>
            )}
            <span>{formatTimeAgo(item.created_at)}</span>
          </div>
        </div>
      </div>

      {/* ---- body ---- */}
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {item.note && (
          <blockquote className="rounded-2xl bg-white/55 p-4 text-sm leading-relaxed text-ink/75 ring-1 ring-black/5">
            {item.note}
          </blockquote>
        )}

        {item.dealCard && (
          <div className="rounded-2xl bg-white/60 p-4 ring-1 ring-black/5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">
              Deal card
            </p>
            <p className="mt-1 text-base font-semibold text-ink">{item.dealCard.product}</p>
            <dl className="mt-3 space-y-1.5 text-sm">
              <Row label="Quantity" value={item.dealCard.quantity} />
              <Row label="Unit price" value={item.dealCard.unitPrice} />
              <Row label="Total" value={item.dealCard.total} strong />
              <Row label="Delivery" value={item.dealCard.delivery} />
            </dl>
          </div>
        )}

        {!item.note && !item.dealCard && (
          <p className="text-sm text-ink/55">
            {item.sender.companyName} {meta.label.toLowerCase()} - awaiting your response.
          </p>
        )}

        {/* collision notice for tickets owned by a teammate */}
        {(mode === "others-admin" || mode === "others-locked") && (
          <div className="flex items-start gap-2 rounded-2xl bg-info/10 p-3 text-sm text-info ring-1 ring-info/20">
            <UserCheck size={16} className="mt-0.5 shrink-0" strokeWidth={1.9} />
            <span>
              <strong className="font-semibold">{ownerFirstName}</strong> is handling this
              {mode === "others-locked"
                ? " - it's theirs to action."
                : " - reassign it if it needs to move."}
            </span>
          </div>
        )}
      </div>

      {/* ---- action footer (state-driven) ---- */}
      <div className="border-t border-black/5 p-4">
        {mode === "accepted" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-2xl bg-success/12 p-3 text-sm font-medium text-success ring-1 ring-success/25">
              <Check size={16} strokeWidth={2.2} />
              Connected with {item.sender.companyName}
            </div>
            <button type="button" onClick={() => onStartDeal(item.id)} className={`${BTN_OUTLINE} w-full`}>
              Start a deal
              <ArrowRight size={15} strokeWidth={2} />
            </button>
          </div>
        )}

        {mode === "rejected" && (
          <p className="rounded-2xl bg-ink/5 p-3 text-center text-sm text-ink/50">
            Declined. Moved to History.
          </p>
        )}

        {mode === "unassigned" && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => onClaim(item.id)} className={BTN_PRIMARY}>
              <UserPlus size={15} strokeWidth={2} />
              Claim
            </button>
            <button type="button" onClick={() => onAccept(item.id)} className={BTN_OUTLINE}>
              <Check size={15} strokeWidth={2} />
              Accept &amp; connect
            </button>
            <button type="button" onClick={() => onDecline(item.id)} className={BTN_DECLINE}>
              <X size={15} strokeWidth={2} />
              Decline
            </button>
          </div>
        )}

        {mode === "mine" && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => onAccept(item.id)} className={BTN_PRIMARY}>
              <Check size={15} strokeWidth={2} />
              Accept &amp; connect
            </button>
            <button type="button" onClick={() => onDecline(item.id)} className={BTN_DECLINE}>
              <X size={15} strokeWidth={2} />
              Decline
            </button>
            <div className="ml-auto">
              <AssignMenu item={item} team={team} onReassign={onReassign} />
            </div>
          </div>
        )}

        {mode === "others-admin" && (
          <div className="flex justify-end">
            <AssignMenu item={item} team={team} onReassign={onReassign} triggerLabel="Reassign" />
          </div>
        )}

        {mode === "others-locked" && (
          <p className="text-center text-xs text-ink/40">
            Only {ownerFirstName} or an admin can action this.
          </p>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink/45">{label}</dt>
      <dd className={strong ? "font-semibold text-ink" : "text-ink/80"}>{value}</dd>
    </div>
  );
}
