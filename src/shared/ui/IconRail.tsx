"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  User,
  Building2,
  Settings,
  LogOut,
  PanelLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { SURFACES, type Surface, type SurfaceChild } from "./surfaces";
import { Wordmark } from "./Wordmark";
import { Avatar } from "./Avatar";
import { getAccountCard, type AccountCard } from "./account-card";

/**
 * The single global navigation rail (F2). A light glass capsule that holds, top
 * to bottom: the Hello Sello wordmark + a state-aware collapse toggle, the 7
 * surfaces, and the account profile card.
 *
 * Connect is an ACCORDION parent: its children (Chat / Connection Request /
 * Relationship) open INDENTED below it joined by a connector-line tree, while
 * every other surface stays visible. When the rail is collapsed to an icon strip
 * the children move into a glass FLYOUT popover to the right of the Connect icon.
 *
 * Collapse is persisted in localStorage via the SSR-safe useSyncExternalStore
 * pattern (no setState-in-effect, no hydration mismatch). Search is NOT here -
 * it lives in the top bar.
 */

const COLLAPSE_KEY = "hs:rail-collapsed";
const COLLAPSE_EVENT = "hs:rail-collapse";

// Read the collapsed flag from localStorage as external state - SSR-safe and
// without setState-in-effect. Server snapshot = false (expanded default), so the
// server HTML and the first client paint agree. Same-tab toggles fire a custom
// event so every subscriber re-reads; cross-tab changes arrive via "storage".
function subscribe(callback: () => void) {
  window.addEventListener(COLLAPSE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(COLLAPSE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function IconRail() {
  const pathname = usePathname();

  // SSR-safe collapsed read (server snapshot = false → expanded).
  const collapsed = useSyncExternalStore(
    subscribe,
    () => window.localStorage.getItem(COLLAPSE_KEY) === "1",
    () => false,
  );

  function toggleCollapsed() {
    const next = !collapsed;
    window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
    window.dispatchEvent(new Event(COLLAPSE_EVENT));
  }

  return (
    <aside
      aria-label="Primary"
      className={`glass m-3 mr-0 flex shrink-0 flex-col rounded-3xl p-3 transition-[width] duration-200 ease-out motion-reduce:transition-none ${
        collapsed ? "w-[64px]" : "w-[200px]"
      }`}
    >
      {/* top: wordmark (always visible) + the single state-aware collapse toggle.
          Collapsed, the two stack vertically so the brand mark still shows. */}
      <div
        className={`mb-3 flex ${
          collapsed
            ? "flex-col items-center gap-2"
            : "h-11 items-center justify-between gap-2"
        }`}
      >
        <span className="flex items-center" title="Hello Sello">
          <Wordmark stacked size={collapsed ? 30 : 44} />
        </span>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          aria-expanded={!collapsed}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-ink/45 ring-1 ring-black/5 transition hover:bg-white/70 hover:text-brand motion-reduce:transition-none"
        >
          <PanelLeft
            size={18}
            strokeWidth={1.75}
            className={`transition-transform duration-200 motion-reduce:transition-none ${
              collapsed ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>

      {/* surfaces */}
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-visible pr-0.5">
        {SURFACES.map((surface) => (
          <SurfaceRow
            key={surface.key}
            surface={surface}
            pathname={pathname}
            collapsed={collapsed}
          />
        ))}
      </nav>

      {/* account profile card */}
      <AccountCardSlot collapsed={collapsed} />
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Surface row: flat link, disabled "soon" span, or accordion parent.  */
/* ------------------------------------------------------------------ */

function SurfaceRow({
  surface,
  pathname,
  collapsed,
}: {
  surface: Surface;
  pathname: string;
  collapsed: boolean;
}) {
  const hasChildren = !!surface.children?.length;

  if (hasChildren) {
    return (
      <AccordionSurface
        surface={surface}
        pathname={pathname}
        collapsed={collapsed}
      />
    );
  }

  const Icon = surface.icon;

  // Disabled "soon" surface: muted, non-clickable, tooltip when collapsed.
  if (surface.state === "soon") {
    return (
      <span
        className={`group relative flex h-11 cursor-not-allowed select-none items-center rounded-2xl text-ink/30 ${
          collapsed ? "w-11 justify-center self-center" : "w-full gap-3 px-3"
        }`}
        aria-disabled="true"
        title={collapsed ? undefined : `${surface.label} - coming soon`}
      >
        <Icon size={20} strokeWidth={1.75} className="shrink-0 opacity-40" />
        {collapsed ? (
          <Tooltip label={`${surface.label} - coming soon`} />
        ) : (
          <span className="truncate text-sm font-medium">{surface.label}</span>
        )}
      </span>
    );
  }

  const isActive =
    pathname === surface.href || pathname.startsWith(surface.href + "/");

  return (
    <Link
      href={surface.href}
      aria-current={isActive ? "page" : undefined}
      aria-label={surface.label}
      className={`group relative flex h-11 items-center rounded-2xl transition-all duration-200 motion-reduce:transition-none ${
        collapsed ? "w-11 justify-center self-center" : "w-full gap-3 px-3"
      } ${
        isActive
          ? "bg-brand-soft/70 text-brand shadow-[0_4px_14px_-6px_color-mix(in_srgb,var(--color-brand)_45%,transparent)]"
          : "text-ink/55 hover:bg-white/55 hover:text-brand"
      }`}
    >
      {isActive && (
        <span className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-brand" />
      )}
      <Icon size={20} strokeWidth={isActive ? 2.1 : 1.75} className="shrink-0" />
      {collapsed ? (
        <Tooltip label={surface.label} />
      ) : (
        <span className="truncate text-sm font-medium">{surface.label}</span>
      )}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Accordion parent (Connect): inline tree expanded, flyout collapsed. */
/* ------------------------------------------------------------------ */

function AccordionSurface({
  surface,
  pathname,
  collapsed,
}: {
  surface: Surface;
  pathname: string;
  collapsed: boolean;
}) {
  const Icon = surface.icon;
  const children = surface.children ?? [];

  const onSurfaceRoute =
    pathname === surface.href || pathname.startsWith(surface.href + "/");

  // The parent is open when the user is on one of its routes OR has toggled it
  // open. A manual toggle is remembered in `override`, but it is cleared whenever
  // the user crosses the surface's route boundary - so leaving Connect and coming
  // back always re-opens from the route default instead of getting stuck on a
  // stale collapse. This is React's "adjust state during render" pattern (a
  // conditional setState in render, NOT an effect), so it never reads as a
  // setState-in-effect and re-renders immediately without a flash.
  const [override, setOverride] = useState<boolean | null>(null);
  const [prevOnRoute, setPrevOnRoute] = useState(onSurfaceRoute);
  if (prevOnRoute !== onSurfaceRoute) {
    setPrevOnRoute(onSurfaceRoute);
    setOverride(null);
  }
  const open = override ?? onSurfaceRoute;

  // Flyout (collapsed mode) open state + hover timers, mirroring the prototype.
  // The flyout only renders while `collapsed` is true (see the `collapsed &&`
  // guard below), so expanding the rail removes it from the DOM on its own - no
  // effect is needed to reset this flag, and none should be added (the
  // collapse-reset effect would be a setState-in-effect anti-pattern).
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showFlyout() {
    if (!collapsed) return;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setFlyoutOpen(true);
  }
  function scheduleHideFlyout() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setFlyoutOpen(false), 160);
  }

  // Clear any pending hide timer if this row unmounts (e.g. navigating to a bare
  // route that drops the rail) so the timeout never fires after unmount.
  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  // Highlight the parent when collapsed-and-on-route (no inline tree to show it).
  const parentActive = onSurfaceRoute;

  return (
    <div
      className="relative"
      onMouseEnter={showFlyout}
      onMouseLeave={scheduleHideFlyout}
    >
      <button
        type="button"
        onClick={() => {
          if (collapsed) {
            setFlyoutOpen((o) => !o);
          } else {
            setOverride(!open);
          }
        }}
        aria-expanded={collapsed ? flyoutOpen : open}
        aria-label={surface.label}
        className={`group relative flex h-11 items-center rounded-2xl transition-all duration-200 motion-reduce:transition-none ${
          collapsed ? "w-11 justify-center self-center" : "w-full gap-3 px-3"
        } ${
          parentActive
            ? "bg-brand-soft/70 text-brand shadow-[0_4px_14px_-6px_color-mix(in_srgb,var(--color-brand)_45%,transparent)]"
            : open
              ? "text-brand"
              : "text-ink/55 hover:bg-white/55 hover:text-brand"
        }`}
      >
        {parentActive && (
          <span className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-brand" />
        )}
        <Icon
          size={20}
          strokeWidth={parentActive ? 2.1 : 1.75}
          className="shrink-0"
        />
        {!collapsed && (
          <>
            <span className="flex-1 truncate text-left text-sm font-medium">
              {surface.label}
            </span>
            <ChevronDown
              size={16}
              strokeWidth={2}
              className={`shrink-0 text-ink/40 transition-transform duration-200 motion-reduce:transition-none ${
                open ? "rotate-180" : ""
              }`}
            />
          </>
        )}
        {collapsed && <Tooltip label={surface.label} hideWhenFlyoutOpen={flyoutOpen} />}
      </button>

      {/* inline accordion tree (expanded rail) */}
      {!collapsed && (
        <div
          className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="overflow-hidden">
            {/* P2 (D-18): the small uppercase section label above the sub-items.
                It was dropped in F2; restored here so the expanded Connect group
                reads with the old labelled presentation. Shown only when the rail
                is expanded (this whole inline tree never renders when collapsed -
                the children move to the flyout, which carries its own heading). */}
            <p className="px-3 pb-1 pt-0.5 text-[11px] font-bold uppercase tracking-widest text-ink-muted">
              {surface.label}
            </p>
            <div className="relative ml-[10px] mb-1.5 mt-0.5 pl-4">
              {/* the thin vertical connector line */}
              <span
                aria-hidden="true"
                className="absolute left-0 top-1 bottom-3 w-px rounded bg-gradient-to-b from-brand-soft to-brand-soft/30"
              />
              {children.map((child) => (
                <ChildRow
                  key={child.key}
                  child={child}
                  pathname={pathname}
                  withElbow
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* flyout popover (collapsed rail) */}
      {collapsed && flyoutOpen && (
        <div
          role="menu"
          aria-label={surface.label}
          onMouseEnter={showFlyout}
          onMouseLeave={scheduleHideFlyout}
          className="glass-strong absolute left-full top-0 z-50 ml-3 min-w-[200px] rounded-2xl p-2"
        >
          <p className="px-2.5 pb-2 pt-1 text-[11px] font-bold uppercase tracking-widest text-ink-muted">
            {surface.label}
          </p>
          {children.map((child) => (
            <ChildRow
              key={child.key}
              child={child}
              pathname={pathname}
              onNavigate={() => setFlyoutOpen(false)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* A child item: active link, or disabled "soon" row.                  */
/* ------------------------------------------------------------------ */

function ChildRow({
  child,
  pathname,
  withElbow = false,
  onNavigate,
}: {
  child: SurfaceChild;
  pathname: string;
  withElbow?: boolean;
  onNavigate?: () => void;
}) {
  const Icon = child.icon;

  // Little tick joining the child to the connector line (inline tree only).
  const elbow = withElbow ? (
    <span
      aria-hidden="true"
      className="absolute -left-4 top-1/2 h-px w-3 -translate-y-1/2 rounded bg-brand-soft"
    />
  ) : null;

  if (child.state === "soon") {
    return (
      <span
        className="relative flex h-10 cursor-not-allowed select-none items-center gap-2 rounded-xl px-2 text-ink/30"
        aria-disabled="true"
        title={`${child.label} - coming soon`}
      >
        {elbow}
        <Icon size={16} strokeWidth={1.75} className="shrink-0 opacity-40" />
        <span className="truncate text-[13px] font-medium">{child.label}</span>
      </span>
    );
  }

  const isActive =
    pathname === child.href || pathname.startsWith(child.href + "/");

  return (
    <Link
      href={child.href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={`relative flex h-10 items-center gap-2 rounded-xl px-2 transition-colors duration-150 motion-reduce:transition-none ${
        isActive
          ? "font-semibold text-brand"
          : "text-ink/55 hover:text-brand"
      }`}
    >
      {elbow}
      <Icon size={16} strokeWidth={isActive ? 2.1 : 1.75} className="shrink-0" />
      <span className="truncate text-[13px] font-medium">{child.label}</span>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Glass tooltip - collapsed mode only, fades in on hover/focus.       */
/* ------------------------------------------------------------------ */

function Tooltip({
  label,
  hideWhenFlyoutOpen = false,
}: {
  label: string;
  hideWhenFlyoutOpen?: boolean;
}) {
  return (
    <span
      role="tooltip"
      className={`glass-strong pointer-events-none absolute left-full z-40 ml-3 whitespace-nowrap rounded-xl px-2.5 py-1 text-xs font-medium text-ink opacity-0 shadow-sm transition-opacity duration-150 motion-reduce:transition-none group-hover:opacity-100 group-focus-visible:opacity-100 ${
        hideWhenFlyoutOpen ? "group-hover:opacity-0" : ""
      }`}
    >
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Account card slot: profile card (expanded) / avatar (collapsed),    */
/* both opening the existing QR + account-links popover.               */
/* ------------------------------------------------------------------ */

function AccountCardSlot({ collapsed }: { collapsed: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [card, setCard] = useState<AccountCard>(null);

  // Load the card once on mount (server action — keeps profile reads server-side).
  useEffect(() => {
    getAccountCard().then(setCard);
  }, []);

  return (
    <div className="relative mt-3 border-t border-black/5 pt-3">
      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        title="Account"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={card ? `${card.displayName} - account menu` : "Account menu"}
        className={`group flex items-center rounded-2xl transition motion-reduce:transition-none ${
          collapsed
            ? "h-11 w-11 justify-center self-center hover:opacity-90"
            : "w-full gap-3 border border-black/[0.06] bg-white/50 px-2.5 py-2 hover:border-brand-soft hover:bg-white"
        }`}
      >
        {card ? (
          <Avatar url={card.avatarUrl} name={card.displayName} size={38} />
        ) : (
          <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-white/70 text-ink/40 shadow-sm">
            <User size={18} strokeWidth={1.75} />
          </span>
        )}

        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 text-left leading-tight">
              <span className="block truncate text-sm font-bold text-ink">
                {card?.displayName ?? "…"}
              </span>
              {card?.companyName ? (
                <span className="block truncate text-xs text-ink-muted">
                  {card.companyName}
                </span>
              ) : null}
            </span>
            <ChevronRight
              size={16}
              strokeWidth={2}
              className="shrink-0 text-ink/40"
            />
          </>
        )}
      </button>

      {menuOpen && (
        <>
          {/* click-away backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div className="glass-strong absolute bottom-0 left-full z-20 ml-2 w-72 rounded-3xl p-5 text-center">
            {card && (
              <>
                <div className="flex justify-center">
                  <Avatar url={card.avatarUrl} name={card.displayName} size={64} />
                </div>
                <h3 className="mt-3 text-base font-bold text-ink">{card.displayName}</h3>
                {card.title && <p className="text-sm text-ink-muted">{card.title}</p>}
                {card.companyName && (
                  <span className="mt-2 inline-block rounded-full border border-brand/40 px-3 py-0.5 text-xs font-semibold text-brand">
                    {card.companyName}
                  </span>
                )}
                {card.qrSvg && (
                  <>
                    <div
                      className="mx-auto mt-4 w-fit rounded-xl bg-white p-2 shadow-sm ring-1 ring-black/5 [&>svg]:h-[104px] [&>svg]:w-[104px]"
                      dangerouslySetInnerHTML={{ __html: card.qrSvg }}
                    />
                    <p className="mt-1.5 text-[10px] font-medium tracking-widest text-ink-muted">SCAN TO CONNECT</p>
                  </>
                )}
              </>
            )}

            <div className="mt-4 space-y-1 border-t border-black/5 pt-3 text-left">
              <MenuLink href="/account?tab=profile" icon={User} label="My Profile" onClick={() => setMenuOpen(false)} />
              <MenuLink href="/account?tab=company" icon={Building2} label="Company Profile" onClick={() => setMenuOpen(false)} />
              <MenuLink href="/account?tab=settings" icon={Settings} label="Settings" onClick={() => setMenuOpen(false)} />
              <form action={signOut}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-brand transition hover:bg-black/[0.04] motion-reduce:transition-none"
                >
                  <LogOut size={16} strokeWidth={1.75} /> Sign out
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MenuLink({ href, icon: Icon, label, onClick }: { href: string; icon: typeof User; label: string; onClick: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-ink transition hover:bg-black/[0.04] motion-reduce:transition-none"
    >
      <Icon size={16} strokeWidth={1.75} /> {label}
    </Link>
  );
}
