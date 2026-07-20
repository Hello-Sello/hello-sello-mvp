/**
 * Connect module - inbox types.
 *
 * Ground truth = Muskan's generated schema (`src/types/database.types.ts`).
 * We bind to her `Row` types directly so these can never drift from the DB.
 * The lookup `code` columns are typed `string` in the generated types
 * (they are FKs to `inbox_status.code` / `inbox_request_type.code`); the
 * exact allowed values are the *seeded* codes, so we narrow them here.
 * Code source: supabase/migrations/20260607090001_lookups_and_seeds.sql
 */
import type { Database } from "@/types/database.types";

/** The pending_inbox_item row, verbatim from the generated schema. */
export type PendingInboxItemRow =
  Database["public"]["Tables"]["pending_inbox_item"]["Row"];

/** inbox_status.code - seeded values. `accepted` + `rejected` are terminal. */
export type InboxStatus = "pending" | "accepted" | "rejected";

/** inbox_request_type.code - seeded values. */
export type InboxRequestType =
  | "connect"
  | "connect_message"
  | "pricelist_request"
  | "deal_card";

/**
 * The inbox row with the two lookup columns narrowed from `string` to their
 * seeded unions. Identical shape to the DB row otherwise - so reading a real
 * `pending_inbox_item` is an assignable swap.
 */
export type InboxItem = Omit<PendingInboxItemRow, "status" | "type"> & {
  status: InboxStatus;
  type: InboxRequestType;
};

/**
 * A teammate that can own a ticket. Derived from `person` (+ company scope).
 * `initials` is computed for the avatar; not a DB column.
 */
export interface TeamMember {
  /** person.id */
  personId: string;
  /** person.first_name + " " + person.last_name */
  displayName: string;
  /** computed avatar initials, e.g. "AS" */
  initials: string;
  /** can (re)assign any ticket to anyone (head admin / superadmin) */
  isAdmin: boolean;
}

/** Who is looking at the inbox - drives the §2 assignment model. */
export interface ViewerContext {
  /** the current person.id (matches a TeamMember.personId) */
  personId: string;
  /** head admin can assign/reassign any ticket */
  isAdmin: boolean;
}

/**
 * Display-only preview shown when `type === 'deal_card'`.
 * Real values come from the `deal_card` table in 3a; mock supplies the shape.
 */
export interface InboxDealCardPreview {
  product: string;
  quantity: string;
  unitPrice: string;
  total: string;
  delivery: string;
}

/**
 * UI projection of an inbox item - the row plus the joined/derived display
 * fields the list + detail panels need. In real data this is one Supabase
 * select with joins to `company` / `person`; the mock returns the same shape.
 */
export interface InboxItemView extends InboxItem {
  sender: {
    /** = sender_company_id */
    companyId: string;
    /** company.name */
    companyName: string;
    /** computed avatar initials */
    initials: string;
  };
  /** the owner, or null when unassigned (assigned_to === null) */
  assignee: TeamMember | null;
  /** count of mutual connections - derived; mock constant for now */
  mutualCount: number;
  /** present only when type === 'deal_card' */
  dealCard: InboxDealCardPreview | null;
}

/** The four inbox lenses (panel-3 tabs). Default = `unassigned`. */
export type LensKey = "unassigned" | "mine" | "all" | "deal_tickets" | "history";
