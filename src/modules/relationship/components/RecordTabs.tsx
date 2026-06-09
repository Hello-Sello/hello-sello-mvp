"use client";

import { useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { buildLog, formatMoney } from "../lib/stats";
import { NotesTab } from "./NotesTab";
import { DocsTab } from "./DocsTab";
import type { DealSummaryView, LogEntry, TermView } from "../types";
import type { RelationshipPageData } from "../supabase/reads";

/**
 * The tabbed record below the top band (Layout C). Tabs replace scrolling:
 * Overview (log + deals peek) · Deals (filtered list) · Notes · Terms · Docs.
 * Phase 4 is read-only - note editing (Phase 5) and artifact upload/download
 * (Phase 6) wire into the Notes/Docs tabs next.
 */
type TabKey = "overview" | "deals" | "notes" | "terms" | "docs";

const TABS: Array<[TabKey, string]> = [
  ["overview", "Overview"],
  ["deals", "Deals"],
  ["notes", "Notes"],
  ["terms", "Terms"],
  ["docs", "Docs"],
];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function RecordTabs({ data }: { data: RelationshipPageData }) {
  const { relationship, notes, terms, artifacts, deals } = data;
  const [tab, setTab] = useState<TabKey>("overview");

  const log = useMemo(
    () =>
      buildLog(
        relationship.connectedAt,
        relationship.companies[0].name,
        relationship.companies[1].name,
        deals,
        artifacts,
      ),
    [relationship, deals, artifacts],
  );

  return (
    <div className="glass rounded-3xl">
      <div className="flex gap-1 overflow-x-auto border-b border-black/5 p-2">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-sm transition ${
              tab === key
                ? "bg-brand/10 font-medium text-brand"
                : "text-ink/50 hover:bg-black/5"
            }`}
          >
            {label}
            {key === "deals" ? ` (${deals.length})` : ""}
          </button>
        ))}
      </div>

      <div className="p-4">
        {tab === "overview" && (
          <OverviewTab log={log} deals={deals} onViewAllDeals={() => setTab("deals")} />
        )}
        {tab === "deals" && <DealsTab deals={deals} />}
        {tab === "notes" && <NotesTab relationshipId={relationship.id} notes={notes} />}
        {tab === "terms" && <TermsTab terms={terms} />}
        {tab === "docs" && (
          <DocsTab
            relationshipId={relationship.id}
            relationship={relationship}
            artifacts={artifacts}
          />
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared bits                                                                */
/* -------------------------------------------------------------------------- */

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-8 text-center text-sm text-ink/40">{children}</div>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-semibold uppercase tracking-wide text-ink/40">{children}</span>
  );
}

function dealBadge(bucket: DealSummaryView["bucket"]) {
  const map = {
    active: ["Active", "bg-success/10 text-success"],
    old: ["Done", "bg-ink/5 text-ink/50"],
    cancelled: ["Cancelled", "bg-ink/5 text-ink/35"],
  } as const;
  const [label, cls] = map[bucket];
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>{label}</span>
  );
}

/* -------------------------------------------------------------------------- */
/* Overview                                                                   */
/* -------------------------------------------------------------------------- */

function OverviewTab({
  log,
  deals,
  onViewAllDeals,
}: {
  log: LogEntry[];
  deals: DealSummaryView[];
  onViewAllDeals: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? log : log.slice(0, 3);
  const active = deals.filter((d) => d.bucket === "active");

  return (
    <div className="space-y-3">
      {/* activity log */}
      <div className="rounded-2xl bg-white/45 p-4">
        <div className="mb-2 flex items-center justify-between">
          <SectionLabel>Activity log</SectionLabel>
          {log.length > 3 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-[11px] font-medium text-brand"
            >
              {expanded ? "Collapse" : "Expand"} →
            </button>
          )}
        </div>
        <div className="space-y-2">
          {shown.map((e) => (
            <div key={e.id} className="flex gap-2 text-[12px]">
              <span className="mt-1.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-ink/20" />
              <div>
                <span className="text-ink/70">{e.what}</span>{" "}
                <span className="text-ink/35">· {fmtDate(e.at)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* deals peek */}
      <div className="rounded-2xl bg-white/45 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SectionLabel>Deals</SectionLabel>
            {active.length > 0 && (
              <span className="rounded-full bg-brand px-1.5 text-[10px] text-white">
                {active.length} active
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onViewAllDeals}
            className="text-[11px] font-medium text-brand"
          >
            View all deals ({deals.length}) →
          </button>
        </div>
        <div className="mt-2 space-y-1.5">
          {active.length > 0 ? (
            active.slice(0, 2).map((d) => (
              <div key={d.id} className="flex items-center gap-2 text-[12px]">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                <span className="flex-1 truncate text-ink/70">{d.title}</span>
                <span className="shrink-0 text-ink/55">
                  {d.valueNet != null ? formatMoney(d.valueNet, d.currency) : "-"}
                </span>
              </div>
            ))
          ) : (
            <p className="text-[12px] text-ink/40">No active deals yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Deals                                                                      */
/* -------------------------------------------------------------------------- */

function DealsTab({ deals }: { deals: DealSummaryView[] }) {
  const [filter, setFilter] = useState<"all" | "active" | "old" | "cancelled">("all");
  const filters: Array<["all" | "active" | "old" | "cancelled", string]> = [
    ["all", "All"],
    ["active", "Active"],
    ["old", "Old"],
    ["cancelled", "Cancelled"],
  ];
  const shown = filter === "all" ? deals : deals.filter((d) => d.bucket === filter);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {filters.map(([key, label]) => {
          const count = key === "all" ? deals.length : deals.filter((d) => d.bucket === key).length;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-full px-2.5 py-1 text-xs transition ${
                filter === key
                  ? "bg-brand font-medium text-white"
                  : "bg-black/5 text-ink/50 hover:bg-black/10"
              }`}
            >
              {label}
              {key !== "all" ? ` (${count})` : ""}
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <Empty>No {filter === "all" ? "" : `${filter} `}deals yet.</Empty>
      ) : (
        <div className="divide-y divide-black/5">
          {shown.map((d) => (
            <div key={d.id} className="flex items-center gap-3 py-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                <FileText size={16} strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-ink">{d.title}</span>
                  {dealBadge(d.bucket)}
                </div>
                <div className="text-[11px] text-ink/40">
                  {d.hsNumber ?? "—"} · {fmtDate(d.createdAt)}
                </div>
              </div>
              <span className="shrink-0 text-sm font-semibold text-ink/70">
                {d.valueNet != null ? formatMoney(d.valueNet, d.currency) : "-"}
              </span>
              {/* screen ④ not built yet (3b+) - inert affordance */}
              <span
                className="shrink-0 cursor-not-allowed text-[11px] font-medium text-ink/25"
                title="Deal workspace opens in a later phase"
              >
                Open workspace →
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Terms (read-only in-force terms)                                           */
/* -------------------------------------------------------------------------- */

function TermsTab({ terms }: { terms: TermView[] }) {
  if (terms.length === 0) return <Empty>No agreed terms yet.</Empty>;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <SectionLabel>Agreed terms</SectionLabel>
        <span className="text-[10px] text-ink/35">both sides see these</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {terms.map((t) => (
          <div key={t.id} className="rounded-lg bg-white/50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-ink/40">{t.label}</div>
            <div className="text-[12px] font-medium text-ink/70">{t.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

