/**
 * Relationship module - screen ③ types (2e).
 *
 * Ground truth = Muskan's generated schema (`src/types/database.types.ts`).
 * Same discipline as messaging/types.ts: bind to her `Row` types directly so
 * nothing drifts from the DB, then narrow the lookup `code` columns (typed
 * `string` in the generated types) to their *seeded* unions.
 * Code source: supabase/migrations/20260607090001_lookups_and_seeds.sql
 *              supabase/migrations/20260607090003_phase2_deal.sql
 *
 * The page is a per-viewer projection: RLS already hides the other side's
 * notes (and teammates' personal notes), so the UI shapes below never need a
 * "which side am I" filter - whatever the reads return is already *our* view.
 */
import type { Database } from "@/types/database.types";

type Tables = Database["public"]["Tables"];

/* -------------------------------------------------------------------------- */
/* Raw rows - verbatim from the generated schema                              */
/* -------------------------------------------------------------------------- */

/** The relationship row, verbatim. */
export type RelationshipRow = Tables["relationship"]["Row"];
/** The relationship_note row, verbatim. */
export type RelationshipNoteRow = Tables["relationship_note"]["Row"];
/** The relationship_term row, verbatim. */
export type RelationshipTermRow = Tables["relationship_term"]["Row"];
/** The relationship_artifact row, verbatim. */
export type RelationshipArtifactRow = Tables["relationship_artifact"]["Row"];
/** The deal_card row, verbatim (2e reads the seeded history; 3a builds the flow). */
export type DealCardRow = Tables["deal_card"]["Row"];

/* -------------------------------------------------------------------------- */
/* Seeded code unions - narrow the lookup `string` columns                    */
/* -------------------------------------------------------------------------- */

/** note_scope.code - seeded values. */
export type NoteScope = "team" | "personal";

/** relationship_term_status.code - seeded values. 2e only *reads* `accepted`. */
export type TermStatus = "pending" | "accepted" | "rejected";

/**
 * agreed_term_type.code - seeded controlled vocabulary. New term types are an
 * INSERT into the lookup, so keep this in sync with the seeds when they grow.
 */
export type TermTypeCode =
  | "payment_terms"
  | "incoterms"
  | "min_order_qty"
  | "delivery_lead_time_days"
  | "exclusivity";

/** artifact_category.code - seeded values (relationship-level files). */
export type ArtifactCategory =
  | "contract"
  | "nda"
  | "certificate"
  | "marketing"
  | "other";

/** file_scan_status.code - seeded values. 2e writes the `clean` stub (D2). */
export type ScanStatus = "pending" | "clean" | "infected" | "scan_error";

/**
 * deal_card_status.code - full union (Phase-12 vocabulary, D-01).
 * `unsent` = the private draft (label "Draft"; RLS hides it from the
 * counterparty) · `negotiation` = sent/bargaining. The Deals tab buckets:
 * Active = unsent/negotiation/confirmed · Old = done · Cancelled = cancelled.
 */
export type DealStatus =
  | "unsent"
  | "negotiation"
  | "confirmed"
  | "done"
  | "cancelled"
  | "ticket_created"
  | "ticket_closed";

/* -------------------------------------------------------------------------- */
/* Narrowed rows - identical shape to the DB row, lookup columns tightened    */
/* -------------------------------------------------------------------------- */

/** relationship_note with `scope` narrowed. */
export type RelationshipNote = Omit<RelationshipNoteRow, "scope"> & {
  scope: NoteScope;
};

/** relationship_term with `status` + `term_type_code` narrowed. */
export type RelationshipTerm = Omit<
  RelationshipTermRow,
  "status" | "term_type_code"
> & { status: TermStatus; term_type_code: TermTypeCode };

/** relationship_artifact with `scan_status` + `category` narrowed. */
export type RelationshipArtifact = Omit<
  RelationshipArtifactRow,
  "scan_status" | "category"
> & { scan_status: ScanStatus; category: ArtifactCategory | null };

/** deal_card with `status` narrowed. */
export type DealCard = Omit<DealCardRow, "status"> & { status: DealStatus };

/* -------------------------------------------------------------------------- */
/* UI projections - the joined/derived shapes the page renders                */
/* -------------------------------------------------------------------------- */

/** One company side of the header (logo initials + name; never person names). */
export interface RelationshipCompany {
  /** company.id */
  id: string;
  name: string;
  /** computed avatar initials, same derivation as messaging's */
  initials: string;
}

/**
 * The page's spine: the relationship + both companies resolved, with the
 * viewer's side identified. `me`/`them` is what the header, back-link, and
 * notes captions render - the bridge mark joins `companies` in canonical
 * (a, b) order so both sides see the same header.
 */
export interface RelationshipView {
  /** relationship.id */
  id: string;
  /** the two companies in canonical company_a/company_b order (header order) */
  companies: [RelationshipCompany, RelationshipCompany];
  /** the viewer's company */
  me: RelationshipCompany;
  /** the counterparty */
  them: RelationshipCompany;
  /** relationship.status (seeded: active/suspended/ended) */
  status: string;
  /** relationship.created_at - drives "Connected · since …" */
  connectedAt: string;
}

/** One note as the Notes tab renders it. RLS guarantees these are *ours*. */
export interface NoteView {
  id: string;
  scope: NoteScope;
  body: string;
  /** last edit timestamp (updated_at) - shown as "edited …" */
  updatedAt: string;
}

/** One in-force agreed term (status=accepted, not superseded). */
export interface TermView {
  id: string;
  termType: TermTypeCode;
  /** human label for the term type (from agreed_term_type.description) */
  label: string;
  value: string;
}

/** One row in the Docs tab. */
export interface ArtifactView {
  id: string;
  title: string;
  category: ArtifactCategory | null;
  /** display only - the storage object is addressed by storagePath */
  originalFilename: string;
  /** Supabase Storage key - download goes through a signed URL */
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number;
  scanStatus: ScanStatus;
  /** which side uploaded - "Yours" / the other company's name in the UI */
  uploadedByCompanyId: string;
  uploadedAt: string;
}

/**
 * One deal in the Deals tab / Overview peek. 2e renders the seeded history;
 * "Open workspace →" stays a disabled affordance until screen ④ (3b+).
 */
export interface DealSummaryView {
  id: string;
  /** deal_card.hs_deal_number, e.g. HS-CAN23-A189; null until assigned */
  hsNumber: string | null;
  /** display title (from metadata.title in the seed; falls back to hsNumber) */
  title: string;
  status: DealStatus;
  /** the prototype's filter bucket derived from status */
  bucket: "active" | "old" | "cancelled";
  /** deal_card.value_net + currency */
  valueNet: number | null;
  currency: string;
  createdAt: string;
  /**
   * true when this deal has a live workspace (screen ④) to open. A workspace is
   * born WITH a deal (3.5); seeded historical deals predate that and have none,
   * so the "Open workspace" door only lights up for deals that actually have one.
   */
  hasWorkspace: boolean;
}

/** One line of the Overview activity log (derived, newest first). */
export interface LogEntry {
  /** stable key for React lists */
  id: string;
  /** plain-words event text, e.g. "Canadian Craft and ABC Apotheke connected" */
  what: string;
  /** ISO timestamp the event happened */
  at: string;
}

/** The Analytics box / dialog numbers (computed in lib/stats.ts, pure). */
export interface RelationshipStats {
  /** sum of non-cancelled deal value_net */
  totalValue: number;
  currency: string;
  /** count of non-cancelled deals */
  dealCount: number;
  activeCount: number;
  doneCount: number;
  cancelledCount: number;
  /** average per non-cancelled deal; 0 when no deals */
  avgValue: number;
  /** largest single deal; 0 when no deals */
  largestValue: number;
  /** relationship.created_at - the "Since" KPI */
  since: string;
}
