"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X, Check, Users, UserPlus } from "lucide-react";
import type { GroupCreationResult, MyConnectionsView } from "@/modules/messaging";
import { searchPeople, getDealParties } from "../supabase/connections";

/**
 * The content of the "+ New chat → New group" picker (D-02) and the deal-card
 * group flow. Rendered INSIDE the shared `Dialog` (owned by ChatView) - this
 * component is plain panel content now, not its own positioned overlay; it
 * never decides its own backdrop, centering, or Escape/click-away close.
 *
 * Differs from a plain multi-select in two ways:
 *   (a) MULTI-select member set (a group, not a single pick);
 *   (b) source widened to ANY HelloSello user by name (D-04) - the viewer's
 *       own company + the connected directory are shown by default, and
 *       typing reaches beyond both via `searchPeople` (still RLS-scoped,
 *       never a tenant leak);
 *   (c) two entry MODES, each grouping candidates into labeled sections so the
 *       creator sees at a glance who they're adding - purely informational,
 *       no gate on any of them (any HelloSello user can be added freely,
 *       D-04, reversing the earlier D-05 external-approval mechanism):
 *       - `newchat`: "Internal" (my own company) / "External" (everyone else).
 *       - `deal`:    my company / the deal's counterparty / external (neither
 *         deal party) - the counterparty comes from `getDealParties`.
 *
 * The deal card opens this picker in `deal` mode by dispatching the window
 * event `hs:new-group` (07-07 emits it); messaging listens for it, keeping the
 * two modules acyclic (mirrors `hs:deal-updated`). The event contract is owned
 * and documented here (`NEW_GROUP_EVENT` / `NewGroupEventDetail`).
 */

/** The window event the deal card dispatches to open this picker in deal mode. */
export const NEW_GROUP_EVENT = "hs:new-group";

/** `hs:new-group` payload: the deal whose card spawned the group (D-07). */
export interface NewGroupEventDetail {
  dealCardId?: string;
}

export type GroupPickerMode = "newchat" | "deal";

/** Which section a candidate falls into, relative to the viewer (and, in deal mode, the deal). */
type Bucket = "mine" | "other" | "external";

/** One selectable/selected person in the group builder. */
interface MemberOption {
  personId: string;
  name: string;
  initials: string;
  companyId: string | null;
  companyName: string | null;
}

export interface GroupPickerProps {
  /** default source: the viewer's own company + the connected directory (D-04) */
  connections: MyConnectionsView;
  /** `deal` shows the 3-way grouping (my company / counterparty / external) */
  mode: GroupPickerMode;
  /** the owning deal card (deal mode only) - filed under Deals (D-07) */
  dealCardId?: string;
  /** create the group; resolves to the new thread (every member is active immediately) */
  onCreate: (input: {
    name: string;
    memberPersonIds: string[];
    dealCardId?: string;
  }) => Promise<GroupCreationResult>;
  /** finished: open the new group thread + close the picker */
  onDone: (threadId: string) => void;
  /** the picker asks to be dismissed (Cancel button); Dialog owns the actual close */
  onClose: () => void;
}

export function GroupPicker({ connections, mode, dealCardId, onCreate, onDone, onClose }: GroupPickerProps) {
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

  // deal mode only: who the deal's two companies are, so candidates can be
  // bucketed "your company / counterparty / external" (informational only).
  const [dealParties, setDealParties] = useState<{
    companyAId: string;
    companyAName: string;
    companyBId: string;
    companyBName: string;
    hsDealNumber: string | null;
  } | null>(null);
  useEffect(() => {
    if (mode !== "deal" || !dealCardId) return;
    let alive = true;
    void getDealParties(dealCardId).then((parties) => {
      if (alive) setDealParties(parties);
    });
    return () => {
      alive = false;
    };
  }, [mode, dealCardId]);

  const viewerCompanyId = connections.viewerCompanyId;
  const counterparty = useMemo(() => {
    if (mode !== "deal" || !dealParties || !viewerCompanyId) return null;
    return dealParties.companyAId === viewerCompanyId
      ? { companyId: dealParties.companyBId, name: dealParties.companyBName }
      : { companyId: dealParties.companyAId, name: dealParties.companyAName };
  }, [mode, dealParties, viewerCompanyId]);

  // the viewer's own teammates (excluding the viewer, who renders as a locked row)
  const myCompanyOptions = useMemo<MemberOption[]>(() => {
    const my = connections.myCompany;
    if (!my) return [];
    return my.people
      .filter((p) => p.personId !== connections.viewerPersonId)
      .map((p) => ({
        personId: p.personId,
        name: p.name,
        initials: p.initials,
        companyId: my.id,
        companyName: my.name,
      }));
  }, [connections.myCompany, connections.viewerPersonId]);

  // the connected directory (other companies), flattened to member options.
  const connectedOptions = useMemo<MemberOption[]>(
    () =>
      connections.companies.flatMap((co) =>
        co.people.map((p) => ({
          personId: p.personId,
          name: p.name,
          initials: p.initials,
          companyId: co.companyId,
          companyName: co.name,
        })),
      ),
    [connections.companies],
  );

  // D-04: typing widens the search beyond the default directory to any user
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
          companyId: r.companyId,
          companyName: r.companyName,
        })),
      });
    });
    return () => {
      alive = false;
    };
  }, [query]);

  // The visible option list = my own company + connected people matching the
  // query, then any widened search hits not already shown (deduped by person
  // id). Widened hits apply only when they belong to the CURRENT query.
  const trimmed = query.trim();
  const needle = trimmed.toLowerCase();
  const options = useMemo<MemberOption[]>(() => {
    const widened = searchResults.q === trimmed ? searchResults.rows : [];
    const seen = new Set<string>([connections.viewerPersonId]); // never re-list "you"
    const out: MemberOption[] = [];
    for (const o of [...myCompanyOptions, ...connectedOptions]) {
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
  }, [myCompanyOptions, connectedOptions, searchResults, trimmed, needle, connections.viewerPersonId]);

  function bucketOf(o: MemberOption): Bucket {
    if (o.companyId && o.companyId === viewerCompanyId) return "mine";
    if (mode === "deal" && counterparty && o.companyId === counterparty.companyId) return "other";
    return "external";
  }

  // group the visible options into labeled sections - Internal/External for a
  // plain new-chat group (D-04), your-company/counterparty/external for a
  // deal-born one - purely informational, no gate. Empty sections are dropped.
  const sections = useMemo(() => {
    const byBucket: Record<Bucket, MemberOption[]> = { mine: [], other: [], external: [] };
    for (const o of options) byBucket[bucketOf(o)].push(o);
    const myCompanyName = connections.myCompany?.name ?? "my company";
    const list: { key: Bucket; label: string; options: MemberOption[] }[] = [
      {
        key: "mine",
        label:
          mode === "deal"
            ? `${myCompanyName} — your side`
            : `Internal — ${myCompanyName}, my company`,
        options: byBucket.mine,
      },
    ];
    if (mode === "deal" && counterparty) {
      list.push({
        key: "other",
        label: `${counterparty.name} — counterparty`,
        options: byBucket.other,
      });
    }
    list.push({
      key: "external",
      label: mode === "deal" ? "External — not part of this deal" : "External — all other companies",
      options: byBucket.external,
    });
    return list.filter((s) => s.options.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bucketOf closes over viewerCompanyId/counterparty/mode, already deps below
  }, [options, mode, counterparty, connections.myCompany, viewerCompanyId]);

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
      onDone(result.threadId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the group.");
    } finally {
      setBusy(false);
    }
  }

  const me = connections.myCompany?.people.find((p) => p.personId === connections.viewerPersonId);

  return (
    <div className="flex max-h-[75vh] flex-col">
      <Header
        title={mode === "deal" ? "Talk about this deal" : "New group"}
        subtitle={
          mode === "deal"
            ? `Pick people to include — this group is tied to DEAL${
                dealParties?.hsDealNumber ? ` — ${dealParties.hsDealNumber}` : ""
              } and lives under the Deals filter.`
            : "Pick people to include."
        }
      />

      {/* optional group name (D-06); blank => server default (first names / deal code) */}
      <div className="pb-2">
        <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-ink/40">
          Give this group a name (optional)
        </div>
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
        <div className="flex flex-wrap gap-1.5 pb-2">
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

      {/* search input (D-04: reaches beyond the default directory) */}
      <div className="pb-2.5">
        <div className="flex items-center gap-2 rounded-full bg-ink/5 px-3 py-1.5">
          <Search size={13} strokeWidth={1.75} className="text-ink/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people or companies…"
            className="flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-ink/40"
            autoFocus
          />
        </div>
      </div>

      {/* member options, grouped into sections */}
      <div className="min-h-0 max-h-[340px] flex-1 overflow-y-auto rounded-xl bg-ink/[0.02] p-1.5">
        {me && (
          <div className="flex items-center gap-3 rounded-xl px-2 py-2 opacity-60">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-ink/70 ring-1 ring-black/5">
              {me.initials}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-semibold text-ink">{me.name} (you)</span>
            </span>
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-white">
              <Check size={12} strokeWidth={2.5} />
            </span>
          </div>
        )}

        {sections.length === 0 ? (
          <div className="px-3 py-5 text-center text-xs text-ink/40">
            {needle ? `No people match "${trimmed}".` : "Search to add people."}
          </div>
        ) : (
          sections.map((section) => (
            <div key={section.key}>
              <div className="mb-1 mt-3 px-2 text-[10.5px] font-bold uppercase tracking-wide text-ink/40 first:mt-1">
                {section.label}
              </div>
              {section.options.map((o) => {
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
              })}
            </div>
          ))
        )}
      </div>

      {error && <p className="pt-1 text-[11px] text-red-600">{error}</p>}

      {/* footer */}
      <div className="mt-3 flex items-center justify-end gap-2 border-t border-black/5 pt-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-3 py-2 text-sm font-medium text-ink/50 transition hover:bg-ink/5"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={!canCreate}
          className="flex items-center justify-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Users size={15} strokeWidth={2} />
          {busy ? "Creating…" : `Create group${selectedList.length ? ` (${selectedList.length})` : ""}`}
        </button>
      </div>
    </div>
  );
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="pb-3">
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-ink/50">{subtitle}</p>
    </div>
  );
}
