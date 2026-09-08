import {
  Home,
  MessagesSquare,
  Compass,
  Store,
  ShoppingCart,
  Tag,
  ArrowLeftRight,
  type LucideIcon,
} from "lucide-react";

/**
 * The 7 global surfaces (LOCKED). This array is the single source that drives
 * the navigation rail. Order = rail order. `state` controls navigability:
 *   - "active": navigable (has a route, even if just a stub for now)
 *   - "soon":   greyed, non-clickable (route exists so direct URLs don't 404)
 *
 * A surface MAY declare `children`. The rail is data-driven and generic: any
 * surface with children renders as an accordion parent (expanded rail) and a
 * flyout popover (collapsed rail) — kept for reuse, no surface uses it today.
 * Connect carried `chat`/`relationship` children until 2026-09-07: once
 * "Connection Request" retired (0027), `relationship` was the only other
 * child and it's permanently `"soon"` (disabled) — a one-item live accordion
 * added a click before reaching Connect's only real destination, so Connect
 * became a flat link like every other surface. `/connect/page.tsx` already
 * redirects bare `/connect` to `/connect/chat` — that's the one place "where
 * Connect lands" is decided, not duplicated here.
 */
export type SurfaceState = "active" | "soon";

export type SurfaceChild = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  state: SurfaceState;
};

export type Surface = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  state: SurfaceState;
  children?: SurfaceChild[];
};

export const SURFACES: Surface[] = [
  { key: "home", label: "Home", href: "/home", icon: Home, state: "active" },
  { key: "connect", label: "Connect", href: "/connect", icon: MessagesSquare, state: "active" },
  { key: "discover", label: "Discover", href: "/discover", icon: Compass, state: "active" },
  { key: "present", label: "Present", href: "/present", icon: Store, state: "active" },
  { key: "buy", label: "Buy", href: "/buy", icon: ShoppingCart, state: "active" },
  { key: "sell", label: "Allocate", href: "/sell", icon: Tag, state: "active" },
  { key: "trade", label: "Trade", href: "/trade", icon: ArrowLeftRight, state: "soon" },
];
