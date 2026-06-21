import { Search, Plus } from "lucide-react";
import type { ConversationListItem, MyConnectionsView } from "@/modules/messaging";
import { ConversationRow } from "./ConversationRow";
import { NewChatDropdown, type NewChatSelection } from "./NewChatDropdown";

/**
 * The panel-3 filter chips. `companies` regroups the same rows by company.
 * `deals` (3b) is the deal chats' ONLY home in this list - deal threads never
 * appear in the other three views (they'd read as broken "Unknown" P2Ps).
 * The full tab redesign (All Unread / P2P / C2C / Deals, tags, deal-logo rows)
 * is a separate later task.
 */
export type ChatFilter = "all" | "unread" | "companies" | "deals";

const FILTERS: ReadonlyArray<{ key: ChatFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "companies", label: "Companies" },
  { key: "deals", label: "Deals" },
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
  /** the connected companies/people directory the picker shows (D-01) */
  connections: MyConnectionsView;
  /** the live conversation-search value (D-09 - filters the base list rows) */
  search: string;
  onSearchChange: (q: string) => void;
  /** the new-chat picker open/closed flag (owned by ChatView, no global store) */
  pickerOpen: boolean;
  onTogglePicker: () => void;
  onClosePicker: () => void;
  /** routed up to ChatView to open/create the right thread on a pick (D-05) */
  onNewChatSelect: (sel: NewChatSelection) => void;
}

export function ConversationList({
  conversations,
  filter,
  onFilterChange,
  selectedThreadId,
  onSelect,
  connections,
  search,
  onSearchChange,
  pickerOpen,
  onTogglePicker,
  onClosePicker,
  onNewChatSelect,
}: ConversationListProps) {
  return (
    <div className="flex h-full flex-col">
      {/* header: live new-chat trigger + real search + filter chips. `relative`
          so the new-chat picker overlay drops UNDER the button (D-04). */}
      <div className="relative space-y-2 border-b border-black/5 p-3">
        <button
          type="button"
          onClick={onTogglePicker}
          aria-expanded={pickerOpen}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand/90 px-3 py-2 text-sm font-medium text-white"
        >
          <Plus size={15} strokeWidth={2.25} />
          New chat
        </button>
        <div className="flex items-center gap-2 rounded-full bg-ink/5 px-3 py-1.5">
          <Search size={13} strokeWidth={1.75} className="text-ink/40" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search conversations…"
            className="flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-ink/40"
          />
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

        {pickerOpen && (
          <NewChatDropdown
            connections={connections}
            onSelect={onNewChatSelect}
            onClose={onClosePicker}
          />
        )}
      </div>

      {/* body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <ListBody
          conversations={conversations}
          filter={filter}
          selectedThreadId={selectedThreadId}
          onSelect={onSelect}
          search={search}
        />
      </div>
    </div>
  );
}

type ListBodyProps = Pick<
  ConversationListProps,
  "conversations" | "filter" | "selectedThreadId" | "onSelect" | "search"
>;

function ListBody({
  conversations,
  filter,
  selectedThreadId,
  onSelect,
  search,
}: ListBodyProps) {
  const row = (item: ConversationListItem) => (
    <ConversationRow
      key={item.threadId}
      item={item}
      isSelected={item.threadId === selectedThreadId}
      onSelect={onSelect}
    />
  );

  // D-09: the top search input filters the base list by name / last-message
  // preview (case-insensitive). Applied BEFORE the tab split so it does not
  // touch groupByCompany's contract.
  const needle = search.trim().toLowerCase();
  const searched =
    needle === ""
      ? conversations
      : conversations.filter(
          (c) =>
            c.name.toLowerCase().includes(needle) ||
            (c.lastMessagePreview ?? "").toLowerCase().includes(needle),
        );

  // the deal chats live ONLY under the Deals tab; every other view excludes them
  const deals = searched.filter((c) => c.threadType === "deal");
  const chats = searched.filter((c) => c.threadType !== "deal");

  if (filter === "deals") {
    const groups = groupByCompany(deals);
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
      <Empty message="No deals yet. A deal chat appears here the moment a deal is born." />
    );
  }

  if (filter === "unread") {
    const unread = chats.filter((c) => c.unreadCount > 0);
    return unread.length ? (
      <div className="flex flex-col gap-1">{unread.map(row)}</div>
    ) : (
      <Empty message="Nothing unread." />
    );
  }

  if (filter === "companies") {
    const groups = groupByCompany(chats);
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
  return chats.length ? (
    <div className="flex flex-col gap-1">{chats.map(row)}</div>
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
