import {
  Home,
  MessagesSquare,
  Compass,
  Store,
  ShoppingCart,
  Tag,
  ArrowLeftRight,
  MessageCircle,
  Inbox,
  Users,
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
 * flyout popover (collapsed rail). Today only Connect carries children.
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
  {
    key: "connect",
    label: "Connect",
    href: "/connect",
    icon: MessagesSquare,
    state: "active",
    children: [
      { key: "chat", label: "Chat", href: "/connect/chat", icon: MessageCircle, state: "active" },
      // "Connection Request" is the renamed old "Inbox" - route stays /connect/inbox.
      { key: "inbox", label: "Connection Request", href: "/connect/inbox", icon: Inbox, state: "active" },
      // Relationship stays "soon" (disabled). Route is the real singular folder.
      { key: "relationship", label: "Relationship", href: "/connect/relationship", icon: Users, state: "soon" },
    ],
  },
  { key: "discover", label: "Discover", href: "/discover", icon: Compass, state: "active" },
  { key: "present", label: "Present", href: "/present", icon: Store, state: "active" },
  { key: "buy", label: "Buy", href: "/buy", icon: ShoppingCart, state: "soon" },
  { key: "sell", label: "Sell", href: "/sell", icon: Tag, state: "soon" },
  { key: "trade", label: "Trade", href: "/trade", icon: ArrowLeftRight, state: "soon" },
];
