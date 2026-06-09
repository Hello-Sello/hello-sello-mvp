/**
 * Relationship page - pure derivations (no Supabase, no React).
 *
 * Everything here is a pure function of already-loaded rows, so it is trivially
 * testable and the prototype's chart/stat math ports straight in. The reads
 * layer fetches; this layer computes; the components render.
 */
import type {
  ArtifactView,
  DealStatus,
  DealSummaryView,
  LogEntry,
  RelationshipStats,
} from "../types";

/** Avatar initials from a company name: first letters of up to 2 words. */
export function companyInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts
    .slice(0, 2)
    .map((p) => p[0] ?? "")
    .join("");
  return (letters || name[0] || "?").toUpperCase();
}

/**
 * The prototype's three filter buckets, derived from deal_card status:
 *   Active = draft / confirmed / amended (live, in-flight, or reopened)
 *   Old    = done (fully delivered)
 *   Cancelled = cancelled / withdrawn (never completed)
 */
export function bucketOf(status: DealStatus): "active" | "old" | "cancelled" {
  if (status === "done") return "old";
  if (status === "cancelled" || status === "withdrawn") return "cancelled";
  return "active"; // draft / confirmed / amended
}

/** Money formatting matching the prototype (€1,234, no decimals). */
export function formatMoney(value: number, currency = "EUR"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Relationship-level analytics. "Business" excludes cancelled deals (a cancelled
 * deal was never real money), matching the prototype's `relStats`.
 */
export function computeStats(
  deals: DealSummaryView[],
  since: string,
): RelationshipStats {
  const currency = deals[0]?.currency ?? "EUR";
  const counted = deals.filter((d) => d.bucket !== "cancelled");
  const values = counted.map((d) => d.valueNet ?? 0);
  const total = values.reduce((s, v) => s + v, 0);

  return {
    totalValue: total,
    currency,
    dealCount: counted.length,
    activeCount: deals.filter((d) => d.bucket === "active").length,
    doneCount: deals.filter((d) => d.bucket === "old").length,
    cancelledCount: deals.filter((d) => d.bucket === "cancelled").length,
    avgValue: counted.length ? Math.round(total / counted.length) : 0,
    largestValue: values.length ? Math.max(...values) : 0,
    since,
  };
}

/**
 * The Overview activity log, newest first. Derived from the rows we already
 * load - no separate event table needed for the demo. Honest by construction:
 * every line corresponds to a real row's timestamp.
 */
export function buildLog(
  connectedAt: string,
  companyAName: string,
  companyBName: string,
  deals: DealSummaryView[],
  artifacts: ArtifactView[],
): LogEntry[] {
  const entries: LogEntry[] = [];

  entries.push({
    id: "rel-connected",
    what: `${companyAName} and ${companyBName} connected`,
    at: connectedAt,
  });

  for (const d of deals) {
    const verb =
      d.bucket === "old"
        ? "completed"
        : d.bucket === "cancelled"
          ? "cancelled"
          : "started";
    entries.push({
      id: `deal-${d.id}`,
      what: `Deal ${d.hsNumber ?? d.title} ${verb}`,
      at: d.createdAt,
    });
  }

  for (const a of artifacts) {
    entries.push({
      id: `artifact-${a.id}`,
      what: `Document uploaded · ${a.title}`,
      at: a.uploadedAt,
    });
  }

  // newest first
  return entries.sort((a, b) => b.at.localeCompare(a.at));
}

export interface ChartRow {
  label: string;
  value: number;
}

export interface DealBreakdowns {
  byDeal: ChartRow[];
  byQuarter: ChartRow[];
  byStatus: ChartRow[];
}

/**
 * The analytics-dialog chart inputs, derived from the deals. Money charts (by
 * deal / by quarter) exclude cancelled deals (no real money); the status chart
 * counts every bucket. Pure - the dialog just renders these.
 */
export function dealBreakdowns(deals: DealSummaryView[]): DealBreakdowns {
  const counted = deals.filter((d) => d.bucket !== "cancelled");

  const byDeal: ChartRow[] = counted.map((d) => ({ label: d.title, value: d.valueNet ?? 0 }));

  // group by quarter, keep a chronological sort key (year*4 + quarter) so that
  // e.g. Q4 2025 correctly precedes Q1 2026 (a plain label sort would not).
  const quarterTotals = new Map<string, { value: number; key: number }>();
  for (const d of counted) {
    const dt = new Date(d.createdAt);
    const q = Math.floor(dt.getUTCMonth() / 3) + 1;
    const label = `Q${q} ${dt.getUTCFullYear()}`;
    const key = dt.getUTCFullYear() * 4 + q;
    const prev = quarterTotals.get(label) ?? { value: 0, key };
    quarterTotals.set(label, { value: prev.value + (d.valueNet ?? 0), key });
  }
  const byQuarter: ChartRow[] = [...quarterTotals.entries()]
    .map(([label, v]) => ({ label, value: v.value, key: v.key }))
    .sort((a, b) => a.key - b.key)
    .map(({ label, value }) => ({ label, value }));

  const byStatus: ChartRow[] = [
    { label: "Active", value: deals.filter((d) => d.bucket === "active").length },
    { label: "Done", value: deals.filter((d) => d.bucket === "old").length },
    { label: "Cancelled", value: deals.filter((d) => d.bucket === "cancelled").length },
  ];

  return { byDeal, byQuarter, byStatus };
}
