import { useState } from "react";
import {
  Search,
  Plus,
  ChevronDown,
  MessageSquarePlus,
  Users,
  PanelLeft,
  Building2,
  FileText,
} from "lucide-react";
import type { ConversationListItem } from "@/modules/messaging";
import { ConversationRow } from "./ConversationRow";

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
  /** panel-3 collapse (mirrors the IconRail): true = render the narrow avatar
      strip; the parent owns the flag + the wrapper width. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** the live conversation-search value (D-09 - filters the base list rows) */
  search: string;
  onSearchChange: (q: string) => void;
  /** which picker is open (owned by ChatView, no global store): both the
      New-Chat and New-Group pickers now open as a Dialog owned by ChatView
      itself, so this component only needs the flag to disable the +New
      trigger while either is open - it never renders a picker itself. */
  pickerMode: "newchat" | "group" | null;
  onOpenPicker: (mode: "newchat" | "group") => void;
}

export function ConversationList({
  conversations,
  filter,
  onFilterChange,
  selectedThreadId,
  onSelect,
  collapsed,
  onToggleCollapsed,
  search,
  onSearchChange,
  pickerMode,
  onOpenPicker,
}: ConversationListProps) {
  // Collapsed: a narrow strip - the expand toggle on top, then one avatar per
  // conversation (selected ringed, unread dotted, name as a native tooltip).
  // Clicking an avatar selects the same as a full row (deal rows still route).
  if (collapsed) {
    return (
      <div className="flex h-full flex-col items-center gap-2 py-3">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Expand conversations"
          aria-expanded={false}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-ink/45 ring-1 ring-black/5 transition hover:bg-white/70 hover:text-brand motion-reduce:transition-none"
        >
          <PanelLeft size={18} strokeWidth={1.75} className="rotate-180" />
        </button>
        <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto pt-1">
          {conversations.map((c) => (
            <CollapsedAvatar
              key={c.threadId}
              item={c}
              isSelected={c.threadId === selectedThreadId}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* The +New trigger stays on top (with the collapse toggle beside it, like
          the IconRail); its 2-item menu (D-02) chooses which picker leaflet drops
          out and COVERS everything below (search + filter tabs + rows) so only
          ONE list shows at a time (D-04). */}
      <div className="flex items-center gap-2 p-3 pb-2">
        <div className="min-w-0 flex-1">
          <NewMenu onOpenPicker={onOpenPicker} disabled={pickerMode !== null} />
        </div>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Collapse conversations"
          aria-expanded={true}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-ink/45 ring-1 ring-black/5 transition hover:bg-white/70 hover:text-brand motion-reduce:transition-none"
        >
          <PanelLeft size={18} strokeWidth={1.75} />
        </button>
      </div>

      <div className="min-h-0 flex-1">
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
      </div>
    </div>
  );
}

/**
 * One conversation as a bare avatar (collapsed strip). Mirrors ConversationRow's
 * avatar branch - deal -> FileText, c2c -> Building2, else initials - plus a pink
 * ring when selected and a corner dot when unread. The name rides as a native
 * `title` tooltip since there is no room for text.
 */
function CollapsedAvatar({
  item,
  isSelected,
  onSelect,
}: {
  item: ConversationListItem;
  isSelected: boolean;
  onSelect: (threadId: string) => void;
}) {
  const isC2C = item.threadType === "c2c";
  const isDeal = item.threadType === "deal";

  return (
    <button
      type="button"
      onClick={() => onSelect(item.threadId)}
      aria-current={isSelected ? "true" : undefined}
      title={item.name}
      className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-ink/70 ring-1 transition ${
        isSelected ? "ring-2 ring-brand" : "ring-black/5 hover:ring-brand/30"
      }`}
    >
      {isDeal ? (
        <FileText size={16} strokeWidth={1.75} className="text-brand-deep/70" />
      ) : isC2C ? (
        <Building2 size={16} strokeWidth={1.75} className="text-ink/55" />
      ) : (
        item.initials
      )}
      {item.unreadCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-brand ring-2 ring-white" />
      )}
    </button>
  );
}

/**
 * The `+ New` trigger + its 2-item menu (D-02): "New chat" opens the existing
 * connected-contacts picker unchanged; "New group" opens the GroupPicker. A
 * local open flag + a click-catcher backdrop close it (no global state).
 */
function NewMenu({
  onOpenPicker,
  disabled,
}: {
  onOpenPicker: (mode: "newchat" | "group") => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);

  function choose(mode: "newchat" | "group") {
    setOpen(false);
    onOpenPicker(mode);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand/90 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand disabled:opacity-50"
      >
        <Plus size={15} strokeWidth={2.25} />
        New
        <ChevronDown size={13} strokeWidth={2.25} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="glass-strong absolute inset-x-0 top-full z-50 mt-1.5 rounded-2xl p-1.5">
            <button
              type="button"
              onClick={() => choose("newchat")}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-ink transition hover:bg-black/[0.04]"
            >
              <MessageSquarePlus size={15} strokeWidth={1.9} /> New chat
            </button>
            <button
              type="button"
              onClick={() => choose("group")}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-ink transition hover:bg-black/[0.04]"
            >
              <Users size={15} strokeWidth={1.9} /> New group
            </button>
          </div>
        </>
      )}
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
