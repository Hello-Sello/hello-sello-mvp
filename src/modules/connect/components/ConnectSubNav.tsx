"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inbox, MessageCircle, Users, type LucideIcon } from "lucide-react";

/**
 * Connect sub-nav (panel 2): the tabs inside the Connect surface. Inbox is live
 * (2a); Chat (2c) and Relationships land later and show greyed - so the IA is
 * visible and direct URLs don't 404. Client component: reads the route to mark
 * the active tab. Styling mirrors the global rail's NavItem so the two nav
 * levels read as one family.
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

const TAB_BASE =
  "flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all duration-200";

export function ConnectSubNav() {
  const pathname = usePathname();

  return (
    <nav className="glass flex w-44 shrink-0 flex-col gap-1 rounded-3xl p-3">
      <p className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-ink/40">
        Connect
      </p>

      {CONNECT_TABS.map((tab) => {
        const Icon = tab.icon;

        if (tab.state === "soon") {
          return (
            <span
              key={tab.key}
              className={`${TAB_BASE} cursor-not-allowed select-none text-ink/30`}
              title={`${tab.label} - coming soon`}
              aria-disabled="true"
            >
              <Icon size={18} strokeWidth={1.75} className="opacity-40" />
              {tab.label}
            </span>
          );
        }

        const isActive =
          pathname === tab.href || pathname.startsWith(tab.href + "/");

        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={`${TAB_BASE} ${
              isActive
                ? "bg-brand-soft/70 text-brand shadow-[0_4px_14px_-6px_rgba(227,11,93,0.45)]"
                : "text-ink/60 hover:bg-white/55 hover:text-brand"
            }`}
          >
            <Icon size={18} strokeWidth={isActive ? 2.1 : 1.75} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
