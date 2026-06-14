"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inbox, Menu, MessageCircle, Users, type LucideIcon } from "lucide-react";

/**
 * Connect sub-nav (panel 2): a COLLAPSIBLE rail of the tabs inside the Connect
 * surface. A hamburger at the top toggles two states:
 *   - collapsed (default): a ~60px icon rail - icons only, label on hover - so
 *     the chat gets the width back.
 *   - expanded: the full ~184px labelled column.
 * The choice persists in localStorage. Inbox + Chat (2a/2c) are live;
 * Relationships lands later and shows greyed.
 *
 * The active-state language (cotton-candy fill, raspberry, the left edge bar)
 * mirrors the global rail's NavItem, so the two nav levels read as one family.
 */
type ConnectTab = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  state: "active" | "soon";
};

const CONNECT_TABS: ConnectTab[] = [
  { key: "inbox", label: "Inbox", href: "/connect/inbox", icon: Inbox, state: "active" },
  { key: "chat", label: "Chat", href: "/connect/chat", icon: MessageCircle, state: "active" },
  { key: "relationships", label: "Relationships", href: "/connect/relationships", icon: Users, state: "soon" },
];

const STORAGE_KEY = "hs:connect-nav-collapsed";

/** A glass tooltip that fades in to the right of an icon - collapsed mode only. */
function Tooltip({ label }: { label: string }) {
  return (
    <span
      role="tooltip"
      className="glass-strong pointer-events-none absolute left-full z-30 ml-2 whitespace-nowrap rounded-xl px-2.5 py-1 text-xs font-medium text-ink opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      {label}
    </span>
  );
}

export function ConnectSubNav() {
  const pathname = usePathname();
  // Default collapsed on both server + first client render (avoids a hydration
  // mismatch); the saved preference is applied in the effect below, post-paint.
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved !== null) setCollapsed(saved === "1");
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  // shared item shape for both modes - collapsed centers a square icon button,
  // expanded is a full-width labelled row.
  const itemBase = collapsed
    ? "group relative flex h-11 w-11 items-center justify-center rounded-2xl transition-all duration-200"
    : "group relative flex h-11 w-full items-center gap-2.5 rounded-2xl px-3 text-sm font-medium transition-all duration-200";

  return (
    <nav
      aria-label="Connect"
      className={`glass flex shrink-0 flex-col gap-1.5 overflow-hidden rounded-3xl p-2 transition-[width] duration-200 ease-out ${
        collapsed ? "w-[60px] items-center" : "w-[184px]"
      }`}
    >
      {/* hamburger toggle - opens/closes the rail */}
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        aria-expanded={!collapsed}
        className={`${
          collapsed
            ? "flex h-11 w-11 items-center justify-center"
            : "flex h-11 w-full items-center gap-2.5 px-3"
        } rounded-2xl text-ink/45 transition-colors hover:bg-white/55 hover:text-brand`}
      >
        <Menu size={20} strokeWidth={1.75} className="shrink-0" />
        {!collapsed && (
          <span className="text-xs font-semibold uppercase tracking-wide">Connect</span>
        )}
      </button>

      {CONNECT_TABS.map((tab) => {
        const Icon = tab.icon;

        if (tab.state === "soon") {
          return (
            <span
              key={tab.key}
              className={`${itemBase} cursor-not-allowed select-none text-ink/30`}
              aria-disabled="true"
            >
              <Icon size={20} strokeWidth={1.75} className="shrink-0 opacity-40" />
              {collapsed ? (
                <Tooltip label={`${tab.label} - coming soon`} />
              ) : (
                <span className="truncate">{tab.label}</span>
              )}
            </span>
          );
        }

        const isActive =
          pathname === tab.href || pathname.startsWith(tab.href + "/");

        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-label={tab.label}
            aria-current={isActive ? "page" : undefined}
            className={`${itemBase} ${
              isActive
                ? "bg-brand-soft/70 text-brand shadow-[0_4px_14px_-6px_rgba(227,11,93,0.45)]"
                : "text-ink/55 hover:bg-white/55 hover:text-brand"
            }`}
          >
            {isActive && (
              <span className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-brand" />
            )}
            <Icon size={20} strokeWidth={isActive ? 2.1 : 1.75} className="shrink-0" />
            {collapsed ? (
              <Tooltip label={tab.label} />
            ) : (
              <span className="truncate">{tab.label}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
