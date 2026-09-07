import { Link2, MessageSquare, ReceiptText, User, type LucideIcon } from "lucide-react";

export type DiscoverRequestKind = "connect" | "connect_message" | "pricelist_request" | "person";

export type RequestTypeBadge = { label: string; icon: LucideIcon; accent: string };

const REQUEST_TYPE_BADGE: Record<DiscoverRequestKind, RequestTypeBadge> = {
  connect: { label: "Connection", icon: Link2, accent: "text-ink/55" },
  connect_message: { label: "Message", icon: MessageSquare, accent: "text-info" },
  pricelist_request: { label: "Pricelist request", icon: ReceiptText, accent: "text-brand-deep" },
  person: { label: "Person", icon: User, accent: "text-info" },
};

const FALLBACK_BADGE: RequestTypeBadge = { label: "Request", icon: User, accent: "text-ink/55" };

export function requestTypeBadge(kind: DiscoverRequestKind): RequestTypeBadge {
  return REQUEST_TYPE_BADGE[kind] ?? FALLBACK_BADGE;
}
