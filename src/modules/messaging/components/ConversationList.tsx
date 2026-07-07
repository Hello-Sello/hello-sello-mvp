import { useState } from "react";
import { Search, Plus, ChevronDown } from "lucide-react";
import type { ConversationListItem, MyConnectionsView } from "@/modules/messaging";
import { ConversationRow } from "./ConversationRow";
import { NewChatDropdown, type NewChatSelection } from "./NewChatDropdown";

/**
 * The panel-3 filters (D-01). Exactly THREE chips stay always-visible -
 * `All / Unread / Deals` - and the rest live under a `Group ▾` dropdown:
 * `Groups / Companies / Internal / External`. This reaffirms the 04B call that
 * rejected a 5th always-visible tab as clumsier.
 *   - deals    -> the deal chats' ONLY home (deal threads + deal-BORN groups, D-07);
 *                 these never appear in the other views (they'd read as broken P2Ps).
 *   - groups   -> plain multi-person groups only (type='group' with no deal card).
 *   - companies-> the same p2p/c2c rows regrouped under a company heading.
 *   - internal -> own-company-only chats (isExternal === false).
 *   - external -> chats that involve another company (isExternal !== false).
 */
export type ChatFilter =
  | "all"
  | "unread"
  | "deals"
  | "groups"
  | "companies"
  | "internal"
  | "external";

/** Always-visible primary chips (D-01: exactly All / Unread / Deals). */
const PRIMARY_FILTERS: ReadonlyArray<{ key: ChatFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "deals", label: "Deals" },
];

/** The `Group ▾` dropdown members (everything else, per D-01). */
const DROPDOWN_FILTERS: ReadonlyArray<{ key: ChatFilter; label: string }> = [
  { key: "groups", label: "Groups" },
  { key: "companies", label: "Companies" },
  { key: "internal", label: "Internal" },
  { key: "external", label: "External" },
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
      {/* The New chat trigger stays on top. The picker leaflet drops out of it and
          COVERS everything below (search + filter tabs + rows) so only ONE list
          shows at a time - never the base filters AND the picker stacked (D-04). */}
      <div className="p-3 pb-2">
        <button
          type="button"
          onClick={onTogglePicker}
          aria-expanded={pickerOpen}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand/90 px-3 py-2 text-sm font-medium text-white"
        >
          <Plus size={15} strokeWidth={2.25} />
          New chat
        </button>
      </div>

      {/* Everything below the button. `relative` so the new-chat picker can cover
          this WHOLE region (search + filter tabs + conversation rows) as one clean
          leaflet; picking someone (or esc / click-away) closes it and the normal
          list returns. */}
      <div className="relative min-h-0 flex-1">
        <div className="flex h-full flex-col">
          <div className="space-y-2 border-b border-black/5 px-3 pb-3">
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
              {PRIMARY_FILTERS.map((f) => {
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
              <GroupFilterDropdown filter={filter} onFilterChange={onFilterChange} />
            </div>
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

        {pickerOpen && (
          <NewChatDropdown
            connections={connections}
            onSelect={onNewChatSelect}
            onClose={onClosePicker}
          />
        )}
      </div>
    </div>
  );
}

/**
 * The `Group ▾` dropdown chip (D-01). When one of its filters is active the
 * chip shows that filter's name and lights up pink; otherwise it reads
 * "Group ▾". A local open flag + a click-catcher backdrop close it (no global
 * state - the project rule). Selecting an item sets the filter and closes.
 */
function GroupFilterDropdown({
  filter,
  onFilterChange,
}: {
  filter: ChatFilter;
  onFilterChange: (filter: ChatFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = DROPDOWN_FILTERS.find((f) => f.key === filter);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-current={active ? "true" : undefined}
        className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors ${
          active
            ? "bg-brand font-medium text-white"
            : "bg-ink/5 text-ink/50 hover:bg-ink/10"
        }`}
      >
        {active ? active.label : "Group"}
        <ChevronDown size={12} strokeWidth={2.25} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="glass-strong absolute right-0 top-full z-40 mt-1.5 w-40 rounded-2xl p-1.5">
            {DROPDOWN_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => {
                  onFilterChange(f.key);
                  setOpen(false);
                }}
                aria-current={f.key === filter ? "true" : undefined}
                className={`flex w-full items-center rounded-lg px-2.5 py-2 text-left text-sm transition ${
                  f.key === filter
                    ? "bg-brand-soft/40 font-medium text-brand-deep"
                    : "text-ink hover:bg-black/[0.04]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

type ListBodyProps = Pick<
  ConversationListProps,
  "conversations" | "filter" | "selectedThreadId" | "onSelect" | "search"
>;

/** A deal-filed row: a real deal thread OR a deal-card-born group (D-07). */
function isDealFiled(c: ConversationListItem): boolean {
  return c.threadType === "deal" || (c.threadType === "group" && !!c.dealCardId);
}
/** A plain multi-person group: type='group' with no owning deal card. */
function isPlainGroup(c: ConversationListItem): boolean {
  return c.threadType === "group" && !c.dealCardId;
}

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

  // Deal-filed rows (deal threads + deal-born groups, D-07) live ONLY under the
  // Deals tab; every other view excludes them. `chats` = everything else,
  // including plain groups (they belong in All / Internal / External).
  const deals = searched.filter(isDealFiled);
  const chats = searched.filter((c) => !isDealFiled(c));

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

  if (filter === "groups") {
    const plainGroups = chats.filter(isPlainGroup);
    return plainGroups.length ? (
      <div className="flex flex-col gap-1">{plainGroups.map(row)}</div>
    ) : (
      <Empty message="No groups yet. Start one from “+ New chat → New group”." />
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

  if (filter === "internal") {
    const internal = chats.filter((c) => c.isExternal === false);
    return internal.length ? (
      <div className="flex flex-col gap-1">{internal.map(row)}</div>
    ) : (
      <Empty message="No internal chats. These are own-company-only conversations." />
    );
  }

  if (filter === "external") {
    const external = chats.filter((c) => c.isExternal !== false);
    return external.length ? (
      <div className="flex flex-col gap-1">{external.map(row)}</div>
    ) : (
      <Empty message="No external conversations yet." />
    );
  }

  if (filter === "companies") {
    // Company channels group p2p/c2c rows by company; plain groups (no single
    // company) are excluded here - they live under the Groups filter.
    const groups = groupByCompany(chats.filter((c) => c.threadType !== "group"));
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
