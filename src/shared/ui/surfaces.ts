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
 * the icon rail. Order = rail order. `state` controls navigability:
 *   - "active": navigable (has a route, even if just a stub for now)
 *   - "soon":   greyed, non-clickable (route exists so direct URLs don't 404)
 */
export type SurfaceState = "active" | "soon";

export type Surface = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  state: SurfaceState;
};

export const SURFACES: Surface[] = [
  { key: "home", label: "Home", href: "/home", icon: Home, state: "active" },
  { key: "connect", label: "Connect", href: "/connect", icon: MessagesSquare, state: "active" },
  { key: "discover", label: "Discover", href: "/discover", icon: Compass, state: "active" },
  { key: "present", label: "Present", href: "/present", icon: Store, state: "active" },
  { key: "buy", label: "Buy", href: "/buy", icon: ShoppingCart, state: "soon" },
  { key: "sell", label: "Sell", href: "/sell", icon: Tag, state: "soon" },
  { key: "trade", label: "Trade", href: "/trade", icon: ArrowLeftRight, state: "soon" },
];
