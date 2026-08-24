import {
  Link2,
  MessageSquare,
  ReceiptText,
  FileSignature,
  type LucideIcon,
} from "lucide-react";
import type { InboxRequestType } from "@/modules/connect/types";

/**
 * Pure display helpers for inbox items - shared by InboxRow and InboxDetail so
 * the type labels, icons, and time formatting stay defined once.
 */

/** Compact "time ago" from an ISO timestamp; falls back to a date past 7 days. */
export function formatTimeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

type RequestTypeMeta = {
  /** human label for the type badge */
  label: string;
  icon: LucideIcon;
  /** token-based text colour - distinguishes type, accents intent */
  accent: string;
};

/** Per-type badge label, icon, and accent colour. Deal cards get the brand
 * accent (highest-intent inbound); the rest lean neutral, distinguished by icon. */
export const REQUEST_TYPE_META: Record<InboxRequestType, RequestTypeMeta> = {
  connect: { label: "Connection", icon: Link2, accent: "text-ink/55" },
  connect_message: { label: "Message", icon: MessageSquare, accent: "text-info" },
  pricelist_request: { label: "Pricelist request", icon: ReceiptText, accent: "text-brand-deep" },
  deal_card: { label: "Deal card", icon: FileSignature, accent: "text-brand" },
};

/**
 * The request-type codes the company inbox reads - derived from the meta map so
 * there is ONE list, not two that can drift apart.
 *
 * This is what keeps an unrecognised code out of `InboxRow` / `InboxDetail`,
 * both of which look up `REQUEST_TYPE_META[item.type]` and immediately read
 * `.icon` off it. Before this filter existed, one `connect_person` row - a
 * type the DB has had since the Discover person graph shipped - made that
 * lookup `undefined` and took the whole page down with
 * "Cannot read properties of undefined". `Record<InboxRequestType, ...>` could
 * not catch it: the union itself was the stale thing, and `tsc` cannot see the
 * DB's lookup table.
 */
export const COMPANY_INBOX_TYPES = Object.keys(
  REQUEST_TYPE_META,
) as InboxRequestType[];

/** Fallback preview line when an item carries no note and no deal card. */
export const REQUEST_TYPE_BLURB: Record<InboxRequestType, string> = {
  connect: "Wants to connect.",
  connect_message: "Sent a connection message.",
  pricelist_request: "Requesting your standard pricelist.",
  deal_card: "Shared a pre-filled deal card.",
};
