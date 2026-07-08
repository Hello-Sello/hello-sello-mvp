"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Check, AlertTriangle, Users, UserPlus } from "lucide-react";
import type {
  GroupCreationResult,
  MyConnectionsView,
  PendingExternalMember,
} from "@/modules/messaging";
import { searchPeople } from "../supabase/connections";

/**
 * The "+ New chat → New group" picker (D-02) and the deal-card group flow (D-05).
 *
 * It copies NewChatDropdown's leaflet/search/row skin but differs in three ways:
 *   (a) MULTI-select member set (a group, not a single pick);
 *   (b) source widened to ANY HelloSello user by name (D-04) - the connected
 *       directory is shown by default, and typing reaches beyond it via
 *       `searchPeople` (still RLS-scoped, never a tenant leak);
 *   (c) two entry MODES:
 *       - `newchat`: anyone allowed; the server defaults the name to first names.
 *       - `deal`:    the 2 deal parties are added by the server automatically;
 *                    any EXTERNAL company person added here is server-gated to
 *                    `pending_external` and needs TWO distinct active-member
 *                    approvals (D-05). This UI shows the
 *                    "EXTERNAL PARTY IS BEING ADDRESSED" warning and drives the
 *                    approval clicks - it can NEVER activate an external party
 *                    itself; the `pending_external → active` transition is
 *                    enforced server-side (07-02).
 *
 * The deal card opens this picker in `deal` mode by dispatching the window
 * event `hs:new-group` (07-07 emits it); messaging listens for it, keeping the
 * two modules acyclic (mirrors `hs:deal-updated`). The event contract is owned
 * and documented here (`NEW_GROUP_EVENT` / `NewGroupEventDetail`).
 */

/** The window event the deal card dispatches to open this picker in deal mode. */
export const NEW_GROUP_EVENT = "hs:new-group";

/** `hs:new-group` payload: the deal whose card spawned the group (D-05/D-07). */
export interface NewGroupEventDetail {
  dealCardId?: string;
}

export type GroupPickerMode = "newchat" | "deal";

/** One selectable/selected person in the group builder. */
interface MemberOption {
  personId: string;
  name: string;
  initials: string;
  companyName: string | null;
}

export interface GroupPickerProps {
  /** default source: the connected companies/people directory (D-04) */
  connections: MyConnectionsView;
  /** `deal` shows the external-gate warning + drives approvals (D-05) */
  mode: GroupPickerMode;
  /** the owning deal card (deal mode only) - filed under Deals (D-07) */
  dealCardId?: string;
  /** create the group; resolves to the new thread + any server-gated externals */
  onCreate: (input: {
    name: string;
    memberPersonIds: string[];
    dealCardId?: string;
  }) => Promise<GroupCreationResult>;
  /** approve one pending external member (the current viewer's single approval) */
  onApproveMember: (threadId: string, personId: string) => Promise<void>;
  /** finished: open the new group thread + close the picker */
  onDone: (threadId: string) => void;
  /** ✕ / escape / click-away close */
  onClose: () => void;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0] ?? "").join("");
  return (letters || name[0] || "?").toUpperCase();
}

export function GroupPicker({
  connections,
  mode,
  dealCardId,
  onCreate,
  onApproveMember,
  onDone,
  onClose,
}: GroupPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Map<string, MemberOption>>(new Map());
  // widened search results tagged with the query they belong to, so a short or
  // changed query ignores them WITHOUT a synchronous setState in the effect.
  const [searchResults, setSearchResults] = useState<{ q: string; rows: MemberOption[] }>({
    q: "",
    rows: [],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // after a create with server-gated externals (D-05): the approval step
  const [createdThreadId, setCreatedThreadId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingExternalMember[]>([]);
  const [approved, setApproved] = useState<Set<string>>(new Set());

  // esc + click-away (mirrors NewChatDropdown); ✕ is the discoverable close
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

  // The connected directory (default source), flattened to member options.
  const connectedOptions = useMemo<MemberOption[]>(
    () =>
      connections.companies.flatMap((co) =>
        co.people.map((p) => ({
          personId: p.personId,
          name: p.name,
          initials: p.initials,
          companyName: co.name,
        })),
      ),
    [connections],
  );

  // D-04: typing widens the search beyond the connected directory to any user
  // the viewer's RLS allows. The result is tagged with its query, so a stale
  // response is ignored downstream (no synchronous setState in the effect).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let alive = true;
    void searchPeople(q).then((rows) => {
      if (!alive) return;
      setSearchResults({
        q,
        rows: rows.map((r) => ({
          personId: r.personId,
          name: r.name,
          initials: r.initials,
          companyName: r.companyName,
        })),
      });
    });
    return () => {
      alive = false;
    };
  }, [query]);

  // The visible option list = connected people matching the query, then any
  // widened search hits not already shown (deduped by person id). Widened hits
  // apply only when they belong to the CURRENT query (else they are stale).
  const trimmed = query.trim();
  const needle = trimmed.toLowerCase();
  const options = useMemo<MemberOption[]>(() => {
    // widened hits apply only when they belong to the CURRENT query (else stale)
    const widened = searchResults.q === trimmed ? searchResults.rows : [];
    const seen = new Set<string>();
    const out: MemberOption[] = [];
    for (const o of connectedOptions) {
      if (needle && !o.name.toLowerCase().includes(needle)) continue;
      if (seen.has(o.personId)) continue;
      seen.add(o.personId);
      out.push(o);
    }
    for (const o of widened) {
      if (seen.has(o.personId)) continue;
      seen.add(o.personId);
      out.push(o);
    }
    return out;
  }, [connectedOptions, searchResults, trimmed, needle]);

  function toggle(o: MemberOption) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(o.personId)) next.delete(o.personId);
      else next.set(o.personId, o);
      return next;
    });
  }

  const selectedList = [...selected.values()];
  const canCreate = selectedList.length > 0 && !busy;

  async function handleCreate() {
    if (!canCreate) return;
    setBusy(true);
    setError(null);
    try {
      const result = await onCreate({
        name: name.trim(),
        memberPersonIds: selectedList.map((m) => m.personId),
        dealCardId,
      });
      if (result.pendingExternal.length > 0) {
        // D-05: hand off to the approval step - the group is NOT active yet
        setCreatedThreadId(result.threadId);
        setPending(result.pendingExternal);
      } else {
        onDone(result.threadId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the group.");
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove(personId: string) {
    if (!createdThreadId) return;
    try {
      await onApproveMember(createdThreadId, personId);
      setApproved((prev) => new Set(prev).add(personId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record the approval.");
    }
  }

  const leaflet =
    "glass-strong absolute inset-x-2 bottom-2 top-1 z-50 flex flex-col overflow-hidden rounded-2xl shadow-xl ring-1 ring-black/5";

  /* ---------- Approval step (D-05): server-gated externals ---------- */
  if (createdThreadId) {
    return (
      <div ref={ref} className={leaflet}>
        <Header title="External approval" onClose={onClose} />
        <div className="flex items-start gap-2 border-b border-amber-300/50 bg-amber-50/70 px-3 py-2.5">
          <AlertTriangle size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-amber-600" />
          <p className="text-[11px] font-medium leading-snug text-amber-800">
            EXTERNAL PARTY IS BEING ADDRESSED — two distinct active members must
            approve before an external party joins the group.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {pending.map((m) => {
            const done = approved.has(m.personId);
            return (
              <div
                key={m.personId}
                className="flex items-center gap-3 rounded-xl px-2 py-2"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-ink/70 ring-1 ring-black/5">
                  {initialsOf(m.name)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                  {m.name}
                </span>
                <button
                  type="button"
                  onClick={() => handleApprove(m.personId)}
                  disabled={done}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
                    done
                      ? "bg-success/15 text-success"
                      : "bg-brand text-white hover:bg-brand-deep"
                  }`}
                >
                  {done ? "Approved" : "Approve"}
                </button>
              </div>
            );
          })}
        </div>
        {error && <p className="px-3 pb-1 text-[11px] text-red-600">{error}</p>}
        <div className="border-t border-black/5 p-2.5">
          <button
            type="button"
            onClick={() => onDone(createdThreadId)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-ink/5 px-3 py-2 text-sm font-medium text-ink transition hover:bg-ink/10"
          >
            Open group
          </button>
        </div>
      </div>
    );
  }

  /* ---------- Selection step ---------- */
  return (
    <div ref={ref} className={leaflet}>
      <Header
        title={mode === "deal" ? "New group for this deal" : "New group"}
        onClose={onClose}
      />

      {mode === "deal" && (
        <div className="flex items-start gap-2 border-b border-amber-300/50 bg-amber-50/70 px-3 py-2.5">
          <AlertTriangle size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-amber-600" />
          <p className="text-[11px] font-medium leading-snug text-amber-800">
            EXTERNAL PARTY IS BEING ADDRESSED — the two deal parties are added
            automatically. Adding a company outside this deal needs two approvals
            before it becomes active.
          </p>
        </div>
      )}

      {/* optional group name (D-06); blank => server default (first names / deal code) */}
      <div className="border-b border-black/5 px-2.5 py-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={
            mode === "deal" ? "Group name (defaults to the deal code)" : "Group name (optional)"
          }
          className="w-full rounded-lg bg-ink/5 px-3 py-1.5 text-xs text-ink outline-none placeholder:text-ink/40"
        />
      </div>

      {/* selected member chips */}
      {selectedList.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-black/5 px-2.5 py-2">
          {selectedList.map((m) => (
            <button
              key={m.personId}
              type="button"
              onClick={() => toggle(m)}
              className="flex items-center gap-1 rounded-full bg-brand-soft/40 px-2 py-1 text-[11px] font-medium text-brand-deep"
            >
              {m.name}
              <X size={11} strokeWidth={2.25} />
            </button>
          ))}
        </div>
      )}

      {/* search input (D-04: reaches beyond the connected directory) */}
      <div className="px-2.5 pt-2.5">
        <div className="flex items-center gap-2 rounded-full bg-ink/5 px-3 py-1.5">
          <Search size={13} strokeWidth={1.75} className="text-ink/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people (any HelloSello user)"
            className="flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-ink/40"
            autoFocus
          />
        </div>
      </div>

      {/* member options */}
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {options.length === 0 ? (
          <div className="px-3 py-5 text-center text-xs text-ink/40">
            {needle ? "No people match." : "Search to add people."}
          </div>
        ) : (
          options.map((o) => {
            const isSel = selected.has(o.personId);
            return (
              <button
                key={o.personId}
                type="button"
                onClick={() => toggle(o)}
                aria-pressed={isSel}
                className="group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-brand-soft/20"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-ink/70 ring-1 ring-black/5">
                  {o.initials}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold text-ink">{o.name}</span>
                  {o.companyName && (
                    <span className="truncate text-[11px] text-ink/45">{o.companyName}</span>
                  )}
                </span>
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                    isSel ? "bg-brand text-white" : "text-ink/25 ring-1 ring-black/10"
                  }`}
                >
                  {isSel ? <Check size={12} strokeWidth={2.5} /> : <UserPlus size={12} strokeWidth={2} />}
                </span>
              </button>
            );
          })
        )}
      </div>

      {error && <p className="px-3 pb-1 text-[11px] text-red-600">{error}</p>}

      {/* confirm */}
      <div className="border-t border-black/5 p-2.5">
        <button
          type="button"
          onClick={handleCreate}
          disabled={!canCreate}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Users size={15} strokeWidth={2} />
          {busy
            ? "Creating…"
            : `Create group${selectedList.length ? ` (${selectedList.length})` : ""}`}
        </button>
      </div>
    </div>
  );
}

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-black/5 px-3 py-2">
      <span className="text-sm font-semibold text-ink">{title}</span>
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
  );
}
