import { Users } from "lucide-react";
import type { InboxItemView } from "@/modules/connect/types";
import {
  REQUEST_TYPE_META,
  REQUEST_TYPE_BLURB,
  formatTimeAgo,
} from "@/modules/connect/lib/inbox-display";

/**
 * One inbox row (panel 3). Pure + presentational - it renders an item and
 * reports clicks via `onSelect`; all state lives in the parent InboxView.
 *
 * Anatomy: sender avatar · company name · time-ago · type badge ·
 * note/deal/blurb preview · assignee chip · mutual count.
 */
export interface InboxRowProps {
  item: InboxItemView;
  isSelected: boolean;
  /** the viewing person, to render the assignee as "You" vs a teammate */
  viewerPersonId: string;
  onSelect: (id: string) => void;
}

export function InboxRow({ item, isSelected, viewerPersonId, onSelect }: InboxRowProps) {
  const meta = REQUEST_TYPE_META[item.type];
  const TypeIcon = meta.icon;

  const preview =
    item.note ??
    (item.dealCard
      ? `${item.dealCard.product} · ${item.dealCard.quantity} · ${item.dealCard.total}`
      : REQUEST_TYPE_BLURB[item.type]);

  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      aria-current={isSelected ? "true" : undefined}
      className={`relative flex w-full gap-3 rounded-2xl p-3 text-left transition-all duration-150 ${
        isSelected ? "bg-brand-soft/40 ring-1 ring-brand/20" : "hover:bg-white/55"
      }`}
    >
      {isSelected && (
        <span className="absolute left-0 top-1/2 h-8 w-[3px] -translate-y-1/2 rounded-r-full bg-brand" />
      )}

      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-ink/70 ring-1 ring-black/5">
        {item.sender.initials}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1">
        {/* company + time */}
        <span className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-ink">
              {item.sender.companyName}
            </span>
          </span>
          <span className="shrink-0 text-[11px] text-ink/40">
            {formatTimeAgo(item.created_at)}
          </span>
        </span>

        {/* type badge */}
        <span>
          <span
            className={`inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-medium ring-1 ring-black/5 ${meta.accent}`}
          >
            <TypeIcon size={12} strokeWidth={2} />
            {meta.label}
          </span>
        </span>

        {/* preview */}
        <span className="truncate text-xs text-ink/55">{preview}</span>

        {/* assignee + mutuals */}
        <span className="flex items-center justify-between gap-2 pt-0.5">
          <AssigneeChip item={item} viewerPersonId={viewerPersonId} />
          {item.mutualCount > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-ink/40">
              <Users size={12} strokeWidth={1.75} />
              {item.mutualCount} mutual
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

/** Shows who owns the ticket: Unassigned · You · "<name> is on it". */
function AssigneeChip({
  item,
  viewerPersonId,
}: {
  item: InboxItemView;
  viewerPersonId: string;
}) {
  if (!item.assignee) {
    return <span className="text-[11px] text-ink/40">Unassigned</span>;
  }

  if (item.assignee.personId === viewerPersonId) {
    return (
      <span className="inline-flex items-center rounded-full bg-brand-soft/50 px-2 py-0.5 text-[11px] font-medium text-brand-deep">
        You
      </span>
    );
  }

  const firstName = item.assignee.displayName.split(" ")[0];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-ink/50">
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-ink/10 text-[8px] font-semibold text-ink/60">
        {item.assignee.initials}
      </span>
      {firstName} is on it
    </span>
  );
}
