import { Search, Plus } from "lucide-react";
import type { ConversationListItem } from "../types";
import { ConversationRow } from "./ConversationRow";

/** The panel-3 filter chips. `companies` regroups the same rows by company. */
export type ChatFilter = "all" | "unread" | "companies";

const FILTERS: ReadonlyArray<{ key: ChatFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "companies", label: "Companies" },
];

/**
 * Conversation list (panel 3). One row-set projected by a filter:
 *   - all       -> flat, newest first (the store already sorts)
 *   - unread    -> rows with an unread count
 *   - companies -> the same rows grouped under a company heading (the C2C
 *                  channel steps forward here)
 * Presentational: the parent (ChatView) owns the active filter + selection.
 */
export interface ConversationListProps {
  conversations: ConversationListItem[];
  filter: ChatFilter;
  onFilterChange: (filter: ChatFilter) => void;
  selectedThreadId: string | null;
  onSelect: (threadId: string) => void;
}

export function ConversationList({
  conversations,
  filter,
  onFilterChange,
  selectedThreadId,
  onSelect,
}: ConversationListProps) {
  return (
    <div className="flex h-full flex-col">
      {/* header: new chat + search + filter chips (search/new are stubs) */}
      <div className="space-y-2 border-b border-black/5 p-3">
        <button
          type="button"
          disabled
          title="Coming soon"
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand/90 px-3 py-2 text-sm font-medium text-white opacity-60"
        >
          <Plus size={15} strokeWidth={2.25} />
          New chat
        </button>
        <div className="flex items-center gap-2 rounded-full bg-ink/5 px-3 py-1.5 text-xs text-ink/40">
          <Search size={13} strokeWidth={1.75} />
          Search conversations…
        </div>
        <div className="flex gap-1.5">
          {FILTERS.map((f) => {
            const isActive = f.key === filter;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => onFilterChange(f.key)}
                aria-current={isActive ? "true" : undefined}
                className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                  isActive
                    ? "bg-brand font-medium text-white"
                    : "bg-ink/5 text-ink/50 hover:bg-ink/10"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <ListBody
          conversations={conversations}
          filter={filter}
          selectedThreadId={selectedThreadId}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}

function ListBody({
  conversations,
  filter,
  selectedThreadId,
  onSelect,
}: Omit<ConversationListProps, "onFilterChange">) {
  const row = (item: ConversationListItem) => (
    <ConversationRow
      key={item.threadId}
      item={item}
      isSelected={item.threadId === selectedThreadId}
      onSelect={onSelect}
    />
  );

  if (filter === "unread") {
    const unread = conversations.filter((c) => c.unreadCount > 0);
    return unread.length ? (
      <div className="flex flex-col gap-1">{unread.map(row)}</div>
    ) : (
      <Empty message="Nothing unread." />
    );
  }

  if (filter === "companies") {
    const groups = groupByCompany(conversations);
    return groups.length ? (
      <div className="flex flex-col gap-2">
        {groups.map((g) => (
          <div key={g.companyId} className="flex flex-col gap-1">
            <span className="px-3 pt-1 text-[11px] font-semibold uppercase tracking-wide text-ink/40">
              {g.companyName}
            </span>
            {g.items.map(row)}
          </div>
        ))}
      </div>
    ) : (
      <Empty message="No conversations yet." />
    );
  }

  // all
  return conversations.length ? (
    <div className="flex flex-col gap-1">{conversations.map(row)}</div>
  ) : (
    <Empty message="No conversations yet. Accept a request in your Inbox to start one." />
  );
}

interface CompanyGroup {
  companyId: string;
  companyName: string;
  items: ConversationListItem[];
}

/** Group rows by company, preserving the incoming (newest-first) order. */
function groupByCompany(conversations: ConversationListItem[]): CompanyGroup[] {
  const order: string[] = [];
  const byId = new Map<string, CompanyGroup>();
  for (const c of conversations) {
    let group = byId.get(c.companyId);
    if (!group) {
      group = { companyId: c.companyId, companyName: c.companyName, items: [] };
      byId.set(c.companyId, group);
      order.push(c.companyId);
    }
    group.items.push(c);
  }
  return order.map((id) => byId.get(id)!);
}

function Empty({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-ink/40">
      {message}
    </div>
  );
}
