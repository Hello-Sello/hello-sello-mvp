import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Building2, User, ChevronRight, X } from "lucide-react";
import type { ConnectedCompany, MyConnectionsView } from "@/modules/messaging";
import { isNewConnection, relativeDayLabel } from "@/modules/messaging";

/**
 * The "+ New chat" picker (B2, Option A) - a leaflet that drops from the New chat
 * button and COVERS the whole conversation-list region below it (the base
 * "Search conversations" box, the All/Unread/Companies/Deals tabs, and the rows
 * all sit behind this opaque overlay), so only ONE list shows at a time - never
 * the base filters AND the picker stacked (D-04). It shows ONLY the viewer's connected people /
 * companies (D-01) in a Person|Company toggle, with a per-mode search and a
 * "New connections by date" section (D-03). Picking a person opens/creates a
 * P2P thread; picking a company opens the C2C thread (the parent routes it).
 *
 * State is local useState ONLY (no global store - the project rule); the
 * open/closed flag is owned by the PARENT (ConversationList) so the trigger and
 * this overlay are siblings. Colours come from the REAL theme tokens
 * (bg-brand / .glass-strong / text-ink), never the prototype's literals (D-04).
 * The prototype's live-status dots are deliberately left out - there is no
 * last-seen / status backend, so the picker never fakes one (directive 3).
 */

/** What the dropdown reports up on a row click. */
export interface NewChatSelection {
  kind: "person" | "company";
  /** relationship.id - the key the thread helpers resolve/create against */
  relationshipId: string;
  /** person.id - present only for a person pick (P2P) */
  otherPersonId?: string;
}

export interface NewChatDropdownProps {
  connections: MyConnectionsView;
  onSelect: (sel: NewChatSelection) => void;
  onClose: () => void;
}

type Mode = "person" | "company";

/** A person row flattened with its owning company (so we can route + label it). */
interface FlatPerson {
  personId: string;
  name: string;
  initials: string;
  role: string | null;
  companyId: string;
  companyName: string;
  relationshipId: string;
  connectedAt: string;
}

export function NewChatDropdown({ connections, onSelect, onClose }: NewChatDropdownProps) {
  const [mode, setMode] = useState<Mode>("person");
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  // Capture "now" ONCE at open time (lazy initializer runs a single time), so the
  // 30-day "new connections" window is stable across re-renders. Calling Date.now()
  // bare in render is impure (react-hooks/purity) and the popover is short-lived,
  // so one frozen timestamp is exactly the right semantics here.
  const [now] = useState(() => Date.now());

  // esc + click-away: a stable container ref + a document mousedown listener
  // (NOT the prototype's innerHTML-rebuild hack). A controlled <input> keeps
  // focus across re-render automatically, so no manual caret restore is needed.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [onClose]);

  const needle = query.trim().toLowerCase();

  // Person mode: flatten every company's people into rows we can route + label.
  const flatPeople = useMemo<FlatPerson[]>(
    () =>
      connections.companies.flatMap((co) =>
        co.people.map((p) => ({
          personId: p.personId,
          name: p.name,
          initials: p.initials,
          role: p.role,
          companyId: co.companyId,
          companyName: co.name,
          relationshipId: co.relationshipId,
          connectedAt: co.connectedAt,
        })),
      ),
    [connections],
  );

  const matchesQuery = (name: string) =>
    needle === "" || name.toLowerCase().includes(needle);

  /* ---------- Person mode rows ---------- */
  const visiblePeople = flatPeople.filter((p) => matchesQuery(p.name));
  // "New connections" = people whose company connection is within the 30-day
  // window (one source of truth - isNewConnection owns the math), newest first.
  const newPeople = [...visiblePeople]
    .filter((p) => isNewConnection(p.connectedAt, now))
    .sort((a, b) => b.connectedAt.localeCompare(a.connectedAt));

  /* ---------- Company mode rows ---------- */
  const visibleCompanies = connections.companies.filter((co) => matchesQuery(co.name));
  const newCompanies = [...visibleCompanies]
    .filter((co) => isNewConnection(co.connectedAt, now))
    .sort((a, b) => b.connectedAt.localeCompare(a.connectedAt));

  return (
    <div
      ref={ref}
      className="glass-strong absolute inset-x-2 bottom-2 top-1 z-50 flex flex-col overflow-hidden rounded-2xl shadow-xl ring-1 ring-black/5"
    >
      {/* Header: title + an explicit ✕ close (D-03). Until now the picker closed
          only via escape / click-away, which was not discoverable enough. */}
      <div className="flex items-center justify-between border-b border-black/5 px-3 py-2">
        <span className="text-sm font-semibold text-ink">New chat</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          title="Close"
          className="flex h-7 w-7 items-center justify-center rounded-full text-ink/45 transition hover:bg-ink/5 hover:text-ink"
        >
          <X size={15} strokeWidth={2} />
        </button>
      </div>

      {/* Person | Company toggle (pink active state, matches the list chips) */}
      <div className="flex gap-1.5 border-b border-black/5 p-2.5">
        <ToggleButton
          active={mode === "person"}
          onClick={() => setMode("person")}
          icon={<User size={13} strokeWidth={1.9} />}
          label="People"
        />
        <ToggleButton
          active={mode === "company"}
          onClick={() => setMode("company")}
          icon={<Building2 size={13} strokeWidth={1.9} />}
          label="Companies"
        />
      </div>

      {/* per-mode real search input */}
      <div className="px-2.5 pt-2.5">
        <div className="flex items-center gap-2 rounded-full bg-ink/5 px-3 py-1.5">
          <Search size={13} strokeWidth={1.75} className="text-ink/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={mode === "person" ? "Search people" : "Search companies"}
            className="flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-ink/40"
            autoFocus
          />
        </div>
      </div>

      {/* body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {mode === "person" ? (
          <PersonBody
            all={visiblePeople}
            fresh={newPeople}
            now={now}
            onSelect={onSelect}
          />
        ) : (
          <CompanyBody
            all={visibleCompanies}
            fresh={newCompanies}
            now={now}
            onSelect={onSelect}
          />
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ToggleButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs transition-colors ${
        active
          ? "bg-brand font-medium text-white"
          : "bg-ink/5 text-ink/50 hover:bg-ink/10"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function SectionHeading({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <span
      className={`px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide ${
        accent ? "text-brand" : "text-ink/40"
      }`}
    >
      {label}
    </span>
  );
}

function DayPill({ connectedAt, now }: { connectedAt: string; now: number }) {
  return (
    <span className="shrink-0 rounded-full bg-brand-soft/40 px-2 py-0.5 text-[10px] font-semibold text-brand-deep">
      {relativeDayLabel(connectedAt, now)}
    </span>
  );
}

/** The open-deal badge - same pill shape as ConversationRow's unread badge (D-06). */
function DealBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white tabular-nums">
      {count} {count === 1 ? "deal" : "deals"}
    </span>
  );
}

function EmptyRow({ message }: { message: string }) {
  return (
    <div className="px-3 py-5 text-center text-xs text-ink/40">{message}</div>
  );
}

/* ---------- Person mode ---------- */

function PersonBody({
  all,
  fresh,
  now,
  onSelect,
}: {
  all: FlatPerson[];
  fresh: FlatPerson[];
  now: number;
  onSelect: (sel: NewChatSelection) => void;
}) {
  if (all.length === 0) return <EmptyRow message="No people match." />;
  return (
    <div className="flex flex-col">
      {fresh.length > 0 && (
        <>
          <SectionHeading label="New connections" accent />
          {fresh.map((p) => (
            <PersonRow key={`new-${p.personId}`} person={p} now={now} showDay onSelect={onSelect} />
          ))}
          <SectionHeading label="All people" />
        </>
      )}
      {all.map((p) => (
        <PersonRow key={p.personId} person={p} now={now} onSelect={onSelect} />
      ))}
    </div>
  );
}

function PersonRow({
  person,
  now,
  showDay,
  onSelect,
}: {
  person: FlatPerson;
  now: number;
  showDay?: boolean;
  onSelect: (sel: NewChatSelection) => void;
}) {
  return (
    <button
      type="button"
      onClick={() =>
        onSelect({
          kind: "person",
          relationshipId: person.relationshipId,
          otherPersonId: person.personId,
        })
      }
      className="group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-brand-soft/20"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-ink/70 ring-1 ring-black/5">
        {person.initials}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold text-ink">{person.name}</span>
        {/* role line ONLY when a real role exists (no role column - omit when null) */}
        <span className="truncate text-[11px] text-ink/45">
          {person.role ? `${person.role} · ${person.companyName}` : person.companyName}
        </span>
      </span>
      {showDay ? (
        <DayPill connectedAt={person.connectedAt} now={now} />
      ) : (
        <ChevronRight
          size={15}
          strokeWidth={1.75}
          className="shrink-0 text-brand opacity-0 transition-opacity group-hover:opacity-100"
        />
      )}
    </button>
  );
}

/* ---------- Company mode ---------- */

function CompanyBody({
  all,
  fresh,
  now,
  onSelect,
}: {
  all: ConnectedCompany[];
  fresh: ConnectedCompany[];
  now: number;
  onSelect: (sel: NewChatSelection) => void;
}) {
  if (all.length === 0) return <EmptyRow message="No companies match." />;
  return (
    <div className="flex flex-col">
      {fresh.length > 0 && (
        <>
          <SectionHeading label="New connections" accent />
          {fresh.map((co) => (
            <CompanyRow key={`new-${co.companyId}`} company={co} now={now} showDay onSelect={onSelect} />
          ))}
          <SectionHeading label="All companies" />
        </>
      )}
      {all.map((co) => (
        <CompanyRow key={co.companyId} company={co} now={now} onSelect={onSelect} />
      ))}
    </div>
  );
}

function CompanyRow({
  company,
  now,
  showDay,
  onSelect,
}: {
  company: ConnectedCompany;
  now: number;
  showDay?: boolean;
  onSelect: (sel: NewChatSelection) => void;
}) {
  const subtitle =
    company.city != null
      ? `${company.contactsCount} contacts · ${company.city}`
      : `${company.contactsCount} contacts`;
  return (
    <button
      type="button"
      onClick={() =>
        onSelect({ kind: "company", relationshipId: company.relationshipId })
      }
      className="group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-brand-soft/20"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-black/5">
        <Building2 size={16} strokeWidth={1.75} className="text-ink/55" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold text-ink">{company.name}</span>
        <span className="truncate text-[11px] text-ink/45">{subtitle}</span>
      </span>
      {showDay && <DayPill connectedAt={company.connectedAt} now={now} />}
      {company.openDealCount > 0 && <DealBadge count={company.openDealCount} />}
    </button>
  );
}
