import { Building2, FileText } from "lucide-react";
import type { ConversationListItem } from "../types";
import { formatTimeAgo } from "../lib/chat-display";

/**
 * One conversation row (panel 3). Pure + presentational - renders a list item
 * and reports clicks via `onSelect`; all state lives in the parent ChatView.
 *
 * A c2c row reads as the company (Building2 avatar, "Company chat (C2C)"); a
 * p2p row reads as the person (initials avatar, the company as subtitle); a
 * deal row (3b, Deals tab only) reads as the deal (FileText avatar, the deal
 * NUMBER as the name) - clicking it navigates to the workspace, not in place.
 */
export interface ConversationRowProps {
  item: ConversationListItem;
  isSelected: boolean;
  onSelect: (threadId: string) => void;
}

export function ConversationRow({ item, isSelected, onSelect }: ConversationRowProps) {
  const isC2C = item.threadType === "c2c";
  const isDeal = item.threadType === "deal";

  return (
    <button
      type="button"
      onClick={() => onSelect(item.threadId)}
      aria-current={isSelected ? "true" : undefined}
      className={`relative flex w-full gap-3 rounded-2xl p-3 text-left transition-all duration-150 ${
        isSelected ? "bg-brand-soft/40 ring-1 ring-brand/20" : "hover:bg-white/55"
      }`}
    >
      {isSelected && (
        <span className="absolute left-0 top-1/2 h-8 w-[3px] -translate-y-1/2 rounded-r-full bg-brand" />
      )}

      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-ink/70 ring-1 ring-black/5">
        {isDeal ? (
          <FileText size={16} strokeWidth={1.75} className="text-brand-deep/70" />
        ) : isC2C ? (
          <Building2 size={16} strokeWidth={1.75} className="text-ink/55" />
        ) : (
          item.initials
        )}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* name + time */}
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold text-ink">{item.name}</span>
          {item.lastMessageAt && (
            <span className="shrink-0 text-[11px] text-ink/40">
              {formatTimeAgo(item.lastMessageAt)}
            </span>
          )}
        </span>

        {/* subtitle (C2C label / company for a p2p) */}
        <span className="truncate text-[11px] text-ink/45">{item.subtitle}</span>

        {/* last-message preview + unread */}
        <span className="flex items-center justify-between gap-2 pt-0.5">
          <span className="truncate text-xs text-ink/55">
            {item.lastMessagePreview ?? "No messages yet"}
          </span>
          {item.unreadCount > 0 && (
            <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white tabular-nums">
              {item.unreadCount}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
