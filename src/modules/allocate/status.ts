/**
 * Allocate — pure derivation helpers (no Supabase, no React → unit-testable).
 *
 * Mirrors the house style of `src/modules/deals/lib/derive.ts`: every one of
 * these is a "derive, don't store" rule. The 7-state order-status vocabulary,
 * the HS order number, the DD-Mon-YY date format, and the Key-Account
 * classification are all computed live from the schema Plan 1 added — none of
 * them get a new column.
 *
 * `DealType`/`DealCardStatus` are re-used from `@/modules/deals` (their single
 * authoritative source, RULES.md DRY) rather than re-declared here.
 */
import type { DealType, DealCardStatus } from "@/modules/deals";

/** The 7 locked vocabulary codes, plus the `cancelled` edge case (cancelled
 *  and unsent deal_cards are outside the 7-state lock — DEV-151 — so they get
 *  a neutral 8th code rather than being forced into one of the 7 colours). */
export type OrderStatusCode =
  | "sales_offer"
  | "purchase_order"
  | "accepted"
  | "executed"
  | "update"
  | "ticket"
  | "ticket_closed"
  | "cancelled";

export interface OrderStatus {
  code: OrderStatusCode;
  label: string;
}

/** The two ticket states a deal_card can carry independently of its base
 *  lifecycle status (`deal_card.ticket_status`); `null` = no ticket open. */
export type TicketStatus = "open" | "closed" | null;

/**
 * The 7-state order-status vocabulary (DEV-151), derived from the base
 * `deal_card.status` + `deal_type`, with an OPEN/CLOSED ticket overriding
 * whatever the base status is (a ticket can be raised on a confirmed or done
 * deal without changing its underlying lifecycle status).
 *
 * `unsent`/`cancelled` sit outside the locked 7-vocab; they map to a neutral
 * 8th `cancelled` code so the UI never has to fabricate one of the 7 real
 * colours for a state that isn't part of the lock. `unsent` private drafts are
 * NOT committed demand (D-16 / Open Q5: excluded) - they never colour the
 * calendar or orders; upstream fetches already filter them out, this mapping is
 * the defensive backstop.
 */
export function statusOf(input: {
  status: DealCardStatus;
  dealType: DealType;
  ticketStatus: TicketStatus;
}): OrderStatus {
  const { status, dealType, ticketStatus } = input;

  if (ticketStatus === "open") return { code: "ticket", label: "Ticket created" };
  if (ticketStatus === "closed") return { code: "ticket_closed", label: "Ticket closed" };

  if (status === "negotiation") {
    return dealType === "offer"
      ? { code: "sales_offer", label: "Sales offer" }
      : { code: "purchase_order", label: "Purchase order" };
  }
  if (status === "confirmed") return { code: "accepted", label: "Deal accepted" };
  if (status === "done") return { code: "executed", label: "Deal executed" };

  // unsent | cancelled — the documented edge cases outside the 7-vocab (a
  // private draft never colours the calendar/orders; D-16 / Open Q5).
  return { code: "cancelled", label: "Cancelled" };
}

/** Trailing legal suffixes stripped before computing a company's initials
 *  (case-insensitive, matched word-for-word against the LAST word only). */
const LEGAL_SUFFIXES = new Set([
  "gmbh",
  "ag",
  "ltd",
  "inc",
  "kg",
  "co",
  "international",
  "int",
]);

/** Removes trailing legal-suffix words (repeatedly, e.g. "Foo Bar Co Ltd" →
 *  "Foo Bar"), always leaving at least one word so a company named e.g. just
 *  "GmbH Trading" isn't stripped to nothing. */
function stripLegalSuffix(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  while (
    words.length > 1 &&
    LEGAL_SUFFIXES.has(words[words.length - 1].toLowerCase().replace(/[.,]/g, ""))
  ) {
    words.pop();
  }
  return words.join(" ");
}

/**
 * The deterministic 3-letter company code used in an HS order number.
 * ≥3 significant words (after stripping the legal suffix) → first letter of
 * the first 3, uppercased. Fewer than 3 words → the first 3 alphabetic
 * characters of the remaining words concatenated, uppercased, right-padded
 * with 'X' when the name has fewer than 3 letters total.
 */
function initialsOf(name: string): string {
  const words = stripLegalSuffix(name).split(/\s+/).filter(Boolean);
  if (words.length >= 3) {
    return words
      .slice(0, 3)
      .map((w) => w[0] ?? "")
      .join("")
      .toUpperCase();
  }
  const alphaChars = words.join("").replace(/[^a-zA-Z]/g, "");
  return alphaChars.slice(0, 3).toUpperCase().padEnd(3, "X");
}

/** `YYMMDD` from an ISO date/timestamp string, read in UTC so the number
 *  never shifts with the caller's local timezone. */
function yymmdd(iso: string): string {
  const d = new Date(iso);
  const yy = String(d.getUTCFullYear() % 100).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

/**
 * The HS order number: `HS-<sellerInitials>-<buyerInitials>-<YYMMDD>-<seq3>`.
 * `sequence` is the caller's own per-day counter (Plan 1 added no sequence
 * column — `orders.ts` derives it live from `created_at`); this function only
 * formats the already-resolved pieces.
 */
export function orderNumberOf(
  sellerName: string,
  buyerName: string,
  createdAt: string,
  sequence: number,
): string {
  const seller = initialsOf(sellerName);
  const buyer = initialsOf(buyerName);
  const seq3 = String(sequence).padStart(3, "0");
  return `HS-${seller}-${buyer}-${yymmdd(createdAt)}-${seq3}`;
}

const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** `DD-Mon-YY` (e.g. `12-May-26`) — the platform-wide date format (SELL.md),
 *  read in UTC so it never shifts with the caller's local timezone. */
export function formatOrderDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mon = MONTH_ABBR[d.getUTCMonth()];
  const yy = String(d.getUTCFullYear() % 100).padStart(2, "0");
  return `${dd}-${mon}-${yy}`;
}

/**
 * Key-Account classification (feeds the Orders "Top accounts first" sort and
 * the Batches "Type" column, DEV-151) — derived, never a stored tier column.
 * `orderedTotalsByCompany` maps buyer company id → summed `value_net` across
 * that buyer's LIVE (`done`/`confirmed`/`amended`) deal_cards with this seller
 * (the caller assembles that map; this function only classifies one buyer
 * against it). A buyer is a Key Account when their total sits in the top half
 * of all buyers in the map, ties broken toward `true` (the buyer AT the
 * median threshold counts as top-half).
 */
export function isKeyAccount(
  buyerCompanyId: string,
  orderedTotalsByCompany: Record<string, number>,
): boolean {
  const totals = Object.values(orderedTotalsByCompany);
  if (totals.length === 0) return false;

  const total = orderedTotalsByCompany[buyerCompanyId] ?? 0;
  const sortedDesc = [...totals].sort((a, b) => b - a);
  const thresholdIndex = Math.ceil(sortedDesc.length / 2) - 1;
  const threshold = sortedDesc[thresholdIndex];
  return total >= threshold;
}
